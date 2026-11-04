import { POST } from "@wallet/app/api/access-request/route";
import { db } from "@wallet/db";
import { user } from "@wallet/db/auth-schema";
import { accessRequests } from "@wallet/db/schema";
import { baseURL } from "@wallet/lib/auth/config";
import { pruneAccessRequests } from "@wallet/lib/db/access-requests";
import { runAccessRequestMails } from "@wallet/lib/jobs/mails";
import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

// „Zugang anfragen“ gegen wallet_test: Route (Herkunft, Bot-Abwehr,
// Prüfung), Meldung an den Betrieb und Löschfrist.

const d = process.env.WALLET_DATABASE_URL_TEST ? describe : describe.skip;
const DAY = 86_400_000;

d("Zugang anfragen (Postgres)", () => {
	const stamp = Date.now();
	const email = `anfrage-${stamp}@example.org`;
	const users: string[] = [];

	afterAll(async () => {
		await db.delete(accessRequests).where(eq(accessRequests.email, email));
		if (users.length) await db.delete(user).where(inArray(user.id, users));
	});

	// je Aufruf eine eigene Adresse, damit nur der Grenz-Test die Grenze trifft
	let n = 0;
	const post = (
		body: unknown,
		headers: Record<string, string> = {},
		ip = `10.77.${stamp % 250}.${++n}`,
	) =>
		POST(
			new Request(`${baseURL}/api/access-request`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: new URL(baseURL).origin,
					"x-real-ip": ip,
					...headers,
				},
				body: JSON.stringify(body),
			}),
		);

	const valid = () => ({
		name: "Alex Muster",
		company: "Muster GmbH",
		email,
		purpose: "bot",
		message: "Wir halten Gold-Token.",
		business: true,
		website: "",
		renderedAt: Date.now() - 10_000,
	});

	const rows = () =>
		db.select().from(accessRequests).where(eq(accessRequests.email, email));

	it("nimmt nur JSON von der eigenen Herkunft an", async () => {
		const res = await post(valid(), { origin: "https://evil.example" });
		expect(res.status).toBe(403);
		expect(await rows()).toHaveLength(0);
	});

	it("verwirft Bots still mit derselben Antwort", async () => {
		const res = await post({ ...valid(), website: "http://spam.example" });
		expect(res.status).toBe(204);
		const fast = await post({ ...valid(), renderedAt: Date.now() });
		expect(fast.status).toBe(204);
		expect(await rows()).toHaveLength(0);
	});

	it("lehnt zu große Anfragen ab, ohne zu parsen", async () => {
		const res = await post({ ...valid(), message: "x".repeat(20_000) });
		expect(res.status).toBe(413);
		expect(await rows()).toHaveLength(0);
	});

	it("meldet Feldfehler", async () => {
		const res = await post({ ...valid(), business: false });
		expect(res.status).toBe(400);
		const body = (await res.json()) as {
			fieldErrors: Record<string, string[]>;
		};
		expect(Object.keys(body.fieldErrors)).toContain("business");
	});

	it("speichert die Anfrage, IP nur als Hashwert", async () => {
		const res = await post(valid());
		expect(res.status).toBe(204);
		const [row] = await rows();
		expect(row?.purpose).toBe("bot");
		expect(row?.status).toBe("new");
		expect(row?.notifiedAt).toBeNull();
		expect(row?.ipHash).toMatch(/^[0-9a-f]{32}$/);
		expect(row?.ipHash).not.toContain("10.77");
	});

	it("meldet sie dem Betrieb und dann nicht noch einmal", async () => {
		const [admin] = await db
			.insert(user)
			.values({
				name: "Betrieb",
				email: `betrieb-${stamp}@example.org`,
				role: "admin",
			})
			.returning({ id: user.id });
		if (admin) users.push(admin.id);
		expect(await runAccessRequestMails()).toBeGreaterThanOrEqual(1);
		const [row] = await rows();
		expect(row?.notifiedAt).toBeInstanceOf(Date);
		// schon gemeldet: kein zweites Mal
		await runAccessRequestMails();
		const [again] = await rows();
		expect(again?.notifiedAt?.getTime()).toBe(row?.notifiedAt?.getTime());
	});

	it("begrenzt je Anschluss auf 5 in 10 Minuten", async () => {
		const ip = `10.78.${stamp % 250}.9`;
		const codes: number[] = [];
		for (let i = 0; i < 6; i++)
			codes.push((await post({ ...valid(), website: "x" }, {}, ip)).status);
		expect(codes.slice(0, 5)).toEqual([204, 204, 204, 204, 204]);
		expect(codes[5]).toBe(429);
	});

	it("löscht 12 Monate nach der letzten Änderung", async () => {
		const [row] = await rows();
		if (!row) throw new Error("Anfrage fehlt");
		expect(await pruneAccessRequests(new Date(Date.now() + 300 * DAY))).toBe(0);
		await pruneAccessRequests(new Date(Date.now() + 366 * DAY));
		expect(await rows()).toHaveLength(0);
	});
});
