import type {
	FieldCoerced,
	FieldDef,
	FieldItemType,
	FieldValue,
} from "./types";

const NUMBER_RE = /^-?\d+(\.\d+)?$/;

export function coerceField(raw: string, def?: FieldDef): FieldValue {
	if (raw.includes('"')) {
		return {
			raw,
			coercionError: 'value contains forbidden character: "',
		};
	}
	if (raw.includes("\n")) {
		return {
			raw,
			coercionError: "value contains forbidden character: newline",
		};
	}

	if (!def) {
		return { raw, coerced: raw };
	}

	switch (def.type) {
		case "string":
			return { raw, coerced: raw };

		case "number":
			return coerceNumber(raw, def);

		case "boolean":
			return coerceBoolean(raw);

		case "enum":
			return coerceEnum(raw, def);

		case "list":
			return coerceList(raw, def.itemType ?? "string");
	}
}

function coerceNumber(raw: string, def: FieldDef): FieldValue {
	if (!NUMBER_RE.test(raw)) {
		return { raw, coercionError: `not a number: "${raw}"` };
	}
	const n = Number(raw);
	const result: FieldValue = { raw, coerced: n };
	if (def.range) {
		const [lo, hi] = def.range;
		if (n < lo || n > hi) {
			result.rangeWarning = `value ${n} outside range [${lo}, ${hi}]`;
		}
	}
	return result;
}

function coerceBoolean(raw: string): FieldValue {
	if (raw === "true") return { raw, coerced: true };
	if (raw === "false") return { raw, coerced: false };
	return { raw, coercionError: `not a boolean: "${raw}"` };
}

function coerceEnum(raw: string, def: FieldDef): FieldValue {
	const opts = def.options ?? [];
	if (opts.length === 0) {
		return {
			raw,
			coercionError: "enum field has no options defined",
		};
	}
	if (opts.includes(raw)) {
		return { raw, coerced: raw };
	}
	return {
		raw,
		coerced: raw,
		rangeWarning: `value "${raw}" not in options [${opts.join(", ")}]`,
	};
}

function coerceList(raw: string, itemType: FieldItemType): FieldValue {
	if (raw === "") {
		return { raw, coerced: [] };
	}
	const items = raw.split(",").map((s) => s.trim());
	const coerced: Array<number | string | boolean> = [];
	const errors: string[] = [];
	for (const item of items) {
		switch (itemType) {
			case "string":
				coerced.push(item);
				break;
			case "number":
				if (NUMBER_RE.test(item)) coerced.push(Number(item));
				else errors.push(`"${item}" is not a number`);
				break;
			case "boolean":
				if (item === "true") coerced.push(true);
				else if (item === "false") coerced.push(false);
				else errors.push(`"${item}" is not a boolean`);
				break;
		}
	}
	if (errors.length > 0) {
		return { raw, coercionError: errors.join("; ") };
	}
	return { raw, coerced: coerced as FieldCoerced };
}
