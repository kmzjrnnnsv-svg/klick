import { customType, jsonb, timestamp, uuid } from "drizzle-orm/pg-core";

// Reine Spaltenbausteine ohne Bezug zu einer Datenbank — gemeinsam für Klick
// (db/schema) und both.money (apps/wallet/db/schema). Spaltennamen entstehen
// über drizzle `casing: "snake_case"` aus den Keys; IDs sind uuid.

export const pk = () => uuid().primaryKey().defaultRandom();

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

// Binärdaten (bytea) als Uint8Array — postgres-js liefert Buffer
export const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
	dataType: () => "bytea",
	toDriver: (v) => Buffer.from(v),
	fromDriver: (v) => new Uint8Array(v),
});
