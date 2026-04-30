import { CURRENT_SCHEMA_VERSION, type Definition } from "./types";

export interface Migration {
	from: number;
	to: number;
	description: string;
	apply(def: Definition): Definition;
}

export const MIGRATIONS: Migration[] = [];

export interface MigrationResult {
	definition: Definition;
	applied: Migration[];
}

export function migrateDefinition(def: Definition): MigrationResult {
	let current = def;
	const applied: Migration[] = [];
	while (current.schemaVersion < CURRENT_SCHEMA_VERSION) {
		const next = MIGRATIONS.find((m) => m.from === current.schemaVersion);
		if (!next) {
			throw new Error(
				`no migration registered from schemaVersion ${current.schemaVersion} to ${CURRENT_SCHEMA_VERSION} (definition: ${def.id})`,
			);
		}
		current = next.apply(current);
		current = { ...current, schemaVersion: next.to };
		applied.push(next);
	}
	return { definition: current, applied };
}
