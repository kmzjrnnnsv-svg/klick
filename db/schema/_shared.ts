import { type AnyPgColumn, uuid } from "drizzle-orm/pg-core";
import { organization, user } from "../auth-schema";

// Gemeinsame Spaltenbausteine. Die reinen (pk, ts, json …) liegen in
// db/columns.ts und gelten auch für both.money; hier nur die Fremdschlüssel
// auf Klicks Better-Auth-Tabellen. IDs sind uuid — Better Auth erzeugt seine
// Tabellen mit `generateId: "uuid"`, Fremdschlüssel müssen den Typ teilen.

export {
	bytea,
	createdAt,
	json,
	pk,
	stringList,
	timestamps,
	ts,
	updatedAt,
} from "../columns";

export const orgId = () =>
	uuid()
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" });

export const userRef = () =>
	uuid().references(() => user.id, { onDelete: "set null" });

export const ref = (col: () => AnyPgColumn, onDelete: "cascade" | "set null") =>
	uuid().references(col, { onDelete });
