import { describe, expect, it } from "vitest";
import { banAccountSchema, createAccountSchema } from "@/lib/validation/admin";

const ORG = "2f1e3c4a-5b6d-4e7f-8a9b-0c1d2e3f4a5b";

describe("createAccountSchema", () => {
	it("Org und Rolle nur zusammen", () => {
		const base = { email: "Neu@Example.com", name: " Neu " };
		const ok = createAccountSchema.parse(base);
		expect(ok).toMatchObject({
			email: "neu@example.com",
			name: "Neu",
			sendMail: true,
		});
		expect(
			createAccountSchema.safeParse({ ...base, organizationId: ORG }).success,
		).toBe(false);
		expect(
			createAccountSchema.safeParse({ ...base, role: "editor" }).success,
		).toBe(false);
		expect(
			createAccountSchema.safeParse({
				...base,
				organizationId: ORG,
				role: "editor",
			}).success,
		).toBe(true);
	});

	it("Name und Adresse sind Pflicht", () => {
		expect(
			createAccountSchema.safeParse({ email: "x@example.com", name: " " })
				.success,
		).toBe(false);
		expect(
			createAccountSchema.safeParse({ email: "kein-mail", name: "A" }).success,
		).toBe(false);
	});
});

describe("banAccountSchema", () => {
	it("Grund ist Pflicht, Ende optional", () => {
		const userId = ORG;
		expect(banAccountSchema.safeParse({ userId, reason: "  " }).success).toBe(
			false,
		);
		expect(
			banAccountSchema.parse({ userId, reason: "Vertrag beendet" }).until,
		).toBeUndefined();
		expect(
			banAccountSchema.parse({
				userId,
				reason: "Vertrag beendet",
				until: "2026-11-01T00:00:00.000Z",
			}).until,
		).toEqual(new Date("2026-11-01T00:00:00.000Z"));
	});
});
