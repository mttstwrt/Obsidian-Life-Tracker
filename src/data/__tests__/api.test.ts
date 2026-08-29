import { describe, expect, test } from "bun:test";
import { createApi } from "../../api";
import type LifeTrackerPlugin from "../../main";
import { DataLayer } from "../dataLayer";
import { buildDefinitionFile } from "../definitionFile";
import type { Definition, Event, ScoreDefinition } from "../types";
import { InMemoryVaultAdapter } from "../vaultAdapter";

const SLEEP: ScoreDefinition = {
	id: "sleep",
	displayName: "Sleep quality",
	kind: "score",
	status: "active",
	tags: ["health"],
	created: "2026-01-01",
	schemaVersion: 1,
	scale: [1, 10],
	target: 7,
	higherIsBetter: true,
};

const RUN: Definition = {
	id: "running",
	displayName: "Running",
	kind: "habit",
	status: "active",
	tags: [],
	created: "2026-01-01",
	schemaVersion: 1,
	valueType: "count",
	targetCadence: "4/week",
};

/**
 * A real DataLayer over an in-memory vault, with only the plugin shell stubbed
 * — the API's behaviour depends on real parsing and real appends.
 */
function makeApi(defs: Definition[] = [SLEEP, RUN], events: Event[] = []) {
	const files: Record<string, string> = {};
	for (const d of defs) {
		files[`LifeTracker/definitions/${d.id}.md`] = buildDefinitionFile(
			d,
			"",
			d.id === SLEEP.id ? events : [],
		);
	}
	let t = 1000;
	const vault = new InMemoryVaultAdapter(files, () => t++);
	const data = new DataLayer(vault, "LifeTracker");
	const logged: Array<{ id: string; event: Event }> = [];

	const plugin = {
		data,
		settings: { habitWindowMode: "calendar" },
		refreshDashboards() {},
		async logEventViaApi(definitionId: string, event: Event) {
			const out = await data.appendEvent(definitionId, event);
			logged.push({ id: definitionId, event: out });
			return out;
		},
	} as unknown as LifeTrackerPlugin;

	return { api: createApi(plugin), logged, data };
}

async function call(
	api: ReturnType<typeof createApi>,
	name: string,
	args: Record<string, unknown> = {},
) {
	return JSON.parse(await api.invoke(name, args));
}

describe("api — score writes", () => {
	// The corruption path this guard exists for: `log_event` treats an absent
	// value as 1, which on a 1-10 score is the worst possible rating rather
	// than "unspecified".
	test("a score log with no value is refused, not defaulted to 1", async () => {
		const { api, logged } = makeApi();
		const res = await call(api, "log_event", { definition: "sleep" });
		expect(res.error).toBeDefined();
		expect(res.error).toContain("required");
		expect(logged).toHaveLength(0);
	});

	test("a non-numeric rating is refused", async () => {
		const { api, logged } = makeApi();
		const res = await call(api, "log_event", {
			definition: "sleep",
			value: "great",
		});
		expect(res.error).toBeDefined();
		expect(logged).toHaveLength(0);
	});

	test.each([[0], [11], [-2]])(
		"a rating of %s outside the scale is refused",
		async (value) => {
			const { api, logged } = makeApi();
			const res = await call(api, "log_event", {
				definition: "sleep",
				value,
			});
			expect(res.error).toBeDefined();
			expect(res.error).toContain("scale");
			expect(logged).toHaveLength(0);
		},
	);

	test("an in-range rating is written through", async () => {
		const { api, logged } = makeApi();
		const res = await call(api, "log_event", {
			definition: "sleep",
			value: 8,
			timestamp: "2026-05-02T07:30",
		});
		expect(res.error).toBeUndefined();
		expect(res.logged.value).toBe(8);
		expect(logged).toHaveLength(1);
	});

	test("both endpoints of the scale are accepted", async () => {
		for (const value of [1, 10]) {
			const { api } = makeApi();
			const res = await call(api, "log_event", { definition: "sleep", value });
			expect(res.error).toBeUndefined();
			expect(res.logged.value).toBe(value);
		}
	});

	// The default-to-1 behaviour is still right for everything else.
	test("a non-score still defaults an absent value to 1", async () => {
		const { api } = makeApi();
		const res = await call(api, "log_event", { definition: "running" });
		expect(res.error).toBeUndefined();
		expect(res.logged.value).toBe(1);
	});

	test("an unknown definition is named in the error", async () => {
		const { api } = makeApi();
		const res = await call(api, "log_event", { definition: "nope" });
		expect(res.error).toContain("nope");
	});

	test("edit_event range-checks a patched rating", async () => {
		const { api } = makeApi();
		const written = await call(api, "log_event", {
			definition: "sleep",
			value: 8,
		});
		const bad = await call(api, "edit_event", {
			definition: "sleep",
			event_id: written.logged.id,
			value: 99,
		});
		expect(bad.error).toBeDefined();
		expect(bad.error).toContain("scale");

		const good = await call(api, "edit_event", {
			definition: "sleep",
			event_id: written.logged.id,
			value: 4,
		});
		expect(good.error).toBeUndefined();
		expect(good.updated.value).toBe(4);
	});

	test("editing only a note leaves the rating alone", async () => {
		const { api } = makeApi();
		const written = await call(api, "log_event", {
			definition: "sleep",
			value: 8,
		});
		const res = await call(api, "edit_event", {
			definition: "sleep",
			event_id: written.logged.id,
			note: "hot room",
		});
		expect(res.error).toBeUndefined();
		expect(res.updated.value).toBe(8);
		expect(res.updated.note).toBe("hot room");
	});
});

describe("api — score reads", () => {
	test("list_definitions exposes the scale and its direction", async () => {
		const stress: ScoreDefinition = {
			...SLEEP,
			id: "stress",
			displayName: "Stress",
			scale: [1, 5],
			higherIsBetter: false,
			dayAggregate: "max",
			target: undefined,
		};
		const { api } = makeApi([SLEEP, stress]);
		const res = await call(api, "list_definitions");
		const byId = new Map(res.definitions.map((d: { id: string }) => [d.id, d]));

		expect(byId.get("sleep")).toMatchObject({
			kind: "score",
			scale: [1, 10],
			higher_is_better: true,
			day_aggregate: "mean",
			target: 7,
		});
		// The inverted flag has to survive the round trip, or a consumer will
		// rank a calm day as the bad one.
		expect(byId.get("stress")).toMatchObject({
			scale: [1, 5],
			higher_is_better: false,
			day_aggregate: "max",
		});
		expect(byId.get("stress")).not.toHaveProperty("target");
	});

	test("get_summaries reports scores with nulls, not omissions", async () => {
		const { api } = makeApi();
		await call(api, "log_event", { definition: "sleep", value: 6 });
		const res = await call(api, "get_summaries");

		expect(res.scores).toHaveLength(1);
		const s = res.scores[0];
		expect(s).toMatchObject({
			id: "sleep",
			scale: [1, 10],
			higher_is_better: true,
			latest: 6,
			days_since_rated: 0,
			rated_days_last_7: 1,
			status: "ok",
			target: 7,
		});
		// A thin history must read as "not enough data", never as a flat trend.
		expect(s.trend_7d_vs_30d).toBeNull();
	});

	test("an unrated score still appears, reporting nulls", async () => {
		const { api } = makeApi();
		const res = await call(api, "get_summaries");
		const s = res.scores[0];
		expect(s.latest).toBeNull();
		expect(s.today).toBeNull();
		expect(s.mean_7d).toBeNull();
		expect(s.days_since_rated).toBeNull();
		expect(s.status).toBe("never");
	});
});

describe("api — create_definition for scores", () => {
	test("defaults to a 1-10 scale", async () => {
		const { api, data } = makeApi([RUN]);
		const res = await call(api, "create_definition", {
			id: "energy",
			name: "Energy",
			kind: "score",
		});
		expect(res.error).toBeUndefined();
		const def = await data.getDefinition("energy");
		if (def?.kind !== "score") throw new Error("expected a score");
		expect(def.scale).toEqual([1, 10]);
	});

	test("accepts an adjusted scale and the inverted flag", async () => {
		const { api, data } = makeApi([RUN]);
		await call(api, "create_definition", {
			id: "pain",
			name: "Pain",
			kind: "score",
			scale_min: 0,
			scale_max: 4,
			higher_is_better: false,
		});
		const def = await data.getDefinition("pain");
		if (def?.kind !== "score") throw new Error("expected a score");
		expect(def.scale).toEqual([0, 4]);
		expect(def.higherIsBetter).toBe(false);
	});

	test("refuses an inverted scale", async () => {
		const { api } = makeApi([RUN]);
		const res = await call(api, "create_definition", {
			id: "bad",
			name: "Bad",
			kind: "score",
			scale_min: 10,
			scale_max: 1,
		});
		expect(res.error).toContain("scale_min");
	});

	test("refuses a target outside the scale", async () => {
		const { api } = makeApi([RUN]);
		const res = await call(api, "create_definition", {
			id: "bad2",
			name: "Bad2",
			kind: "score",
			target: 50,
		});
		expect(res.error).toContain("target");
	});
});
