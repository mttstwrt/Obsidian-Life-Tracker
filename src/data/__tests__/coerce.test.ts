import { describe, expect, test } from "bun:test";
import { coerceField } from "../coerce";
import type { FieldDef } from "../types";

describe("coerceField — happy paths", () => {
	test("number coerces to a JS number", () => {
		const def: FieldDef = { key: "x", type: "number" };
		expect(coerceField("42", def)).toEqual({ raw: "42", coerced: 42 });
		expect(coerceField("-3.5", def)).toEqual({ raw: "-3.5", coerced: -3.5 });
	});

	test("string is identity", () => {
		const def: FieldDef = { key: "x", type: "string" };
		expect(coerceField("hello", def)).toEqual({
			raw: "hello",
			coerced: "hello",
		});
	});

	test("boolean coerces true/false", () => {
		const def: FieldDef = { key: "x", type: "boolean" };
		expect(coerceField("true", def)).toEqual({ raw: "true", coerced: true });
		expect(coerceField("false", def)).toEqual({
			raw: "false",
			coerced: false,
		});
	});

	test("enum coerces matching option", () => {
		const def: FieldDef = {
			key: "x",
			type: "enum",
			options: ["low", "med", "high"],
		};
		expect(coerceField("med", def)).toEqual({ raw: "med", coerced: "med" });
	});

	test("list coerces with itemType=number", () => {
		const def: FieldDef = { key: "x", type: "list", itemType: "number" };
		const result = coerceField("1, 2, 3", def);
		expect(result.raw).toBe("1, 2, 3");
		expect(result.coerced).toEqual([1, 2, 3]);
	});

	test("list coerces with itemType=string and trims whitespace", () => {
		const def: FieldDef = { key: "x", type: "list", itemType: "string" };
		const result = coerceField("a , b ,c", def);
		expect(result.coerced).toEqual(["a", "b", "c"]);
	});

	test("list with empty string yields empty array", () => {
		const def: FieldDef = { key: "x", type: "list", itemType: "string" };
		expect(coerceField("", def)).toEqual({ raw: "", coerced: [] });
	});

	test("no field def — coerced equals raw (treated as string)", () => {
		const result = coerceField("anything");
		expect(result).toEqual({ raw: "anything", coerced: "anything" });
	});
});

describe("coerceField — failures (no throws)", () => {
	test("number with non-numeric string", () => {
		const def: FieldDef = { key: "x", type: "number" };
		const r = coerceField("abc", def);
		expect(r.raw).toBe("abc");
		expect(r.coerced).toBeUndefined();
		expect(r.coercionError).toBeDefined();
	});

	test("number with locale-formatted decimal fails", () => {
		const def: FieldDef = { key: "x", type: "number" };
		expect(coerceField("3,14", def).coercionError).toBeDefined();
	});

	test("number with scientific notation fails", () => {
		const def: FieldDef = { key: "x", type: "number" };
		expect(coerceField("1e3", def).coercionError).toBeDefined();
	});

	test("boolean with capitalized value fails", () => {
		const def: FieldDef = { key: "x", type: "boolean" };
		expect(coerceField("True", def).coercionError).toBeDefined();
		expect(coerceField("0", def).coercionError).toBeDefined();
	});

	test("list with itemType=number fails on bad item", () => {
		const def: FieldDef = { key: "x", type: "list", itemType: "number" };
		const r = coerceField("1,foo,3", def);
		expect(r.coerced).toBeUndefined();
		expect(r.coercionError).toBeDefined();
	});

	test("string still coerces — identity even with weird chars", () => {
		const def: FieldDef = { key: "x", type: "string" };
		expect(coerceField("a|b", def).coerced).toBe("a|b");
	});

	test("forbidden characters surface as coercion errors", () => {
		const def: FieldDef = { key: "x", type: "string" };
		expect(coerceField('he said "hi"', def).coercionError).toBeDefined();
		expect(coerceField("line\nbreak", def).coercionError).toBeDefined();
	});
});

describe("coerceField — range and option warnings", () => {
	test("number outside range coerces with rangeWarning", () => {
		const def: FieldDef = { key: "x", type: "number", range: [1, 5] };
		const r = coerceField("7", def);
		expect(r.coerced).toBe(7);
		expect(r.rangeWarning).toBeDefined();
		expect(r.coercionError).toBeUndefined();
	});

	test("number inside range has no warning", () => {
		const def: FieldDef = { key: "x", type: "number", range: [1, 5] };
		const r = coerceField("3", def);
		expect(r.rangeWarning).toBeUndefined();
	});

	test("enum non-match coerces with rangeWarning", () => {
		const def: FieldDef = {
			key: "x",
			type: "enum",
			options: ["a", "b"],
		};
		const r = coerceField("c", def);
		expect(r.coerced).toBe("c");
		expect(r.rangeWarning).toBeDefined();
		expect(r.coercionError).toBeUndefined();
	});
});
