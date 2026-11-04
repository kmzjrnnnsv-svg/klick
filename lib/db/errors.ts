// Postgres-Fehler 23505 (Unique) — drizzle reicht ihn als cause weiter.
export function isUniqueViolation(e: unknown): boolean {
	const code = (x: unknown) =>
		typeof x === "object" && x !== null && "code" in x
			? (x as { code: unknown }).code
			: undefined;
	return (
		code(e) === "23505" ||
		code((e as { cause?: unknown } | null)?.cause) === "23505"
	);
}
