import { type AnyPgColumn, jsonb, timestamp, uuid } from "drizzle-orm/pg-core";
import { organization, user } from "../auth-schema";

// Gemeinsame Spaltenbausteine. Spaltennamen entstehen über
// drizzle `casing: "snake_case"` aus den Keys. IDs sind uuid — Better Auth
// erzeugt seine Tabellen mit `generateId: "uuid"`, Fremdschlüssel müssen den
// Typ teilen.

export const pk = () => uuid().primaryKey().defaultRandom();

export const orgId = () =>
	uuid()
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" });

export const userRef = () =>
	uuid().references(() => user.id, { onDelete: "set null" });

export const ref = (col: () => AnyPgColumn, onDelete: "cascade" | "set null") =>
	uuid().references(col, { onDelete });

export const ts = () => timestamp({ withTimezone: true, mode: "date" });

export const createdAt = () => ts().notNull().defaultNow();

export const updatedAt = () =>
	ts()
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date());

export const timestamps = () => ({
	createdAt: createdAt(),
	updatedAt: updatedAt(),
});

export const stringList = () => jsonb().$type<string[]>().notNull().default([]);
export const json = <T>() => jsonb().$type<T>();
