import {
	applyResults,
	backoffMs,
	berlinDayStart,
	classifyStatus,
	mergeRejected,
	scopeEvent,
} from "@wallet/lib/export/send-rules";
import { LINK_TOKEN_RE } from "@wallet/lib/validation/export";
import { describe, expect, it } from "vitest";

const A = "0b9d8c7a-6e5f-4a3b-8c2d-1e0f9a8b7c6d";
const B = "1b9d8c7a-6e5f-4a3b-8c2d-1e0f9a8b7c6d";
const sent = [
	{ id: "00000000-0000-4000-8000-000000000001", seq: 1, type: "heartbeat" },
	{ id: "00000000-0000-4000-8000-000000000002", seq: 2, type: "heartbeat" },
];
const res = (results: { id: string; result: string; code?: string }[]) =>
	({
		contract: "klick-wallet-link",
		v: 1,
		batchId: "b",
		results,
	}) as Parameters<typeof applyResults>[1];

describe("Senden an Klick: Regeln", () => {
	it("Abstand wächst bis 60 Minuten", () => {
		expect([1, 2, 3, 7, 20].map((a) => backoffMs(a) / 60_000)).toEqual([
			1, 2, 4, 60, 60,
		]);
	});

	it("401/403/410 pausieren, 5xx wiederholt", () => {
		expect(classifyStatus(200)).toEqual({ kind: "ok" });
		expect(classifyStatus(401)).toEqual({
			kind: "pause",
			reason: "unauthorized",
		});
		expect(classifyStatus(403).kind).toBe("pause");
		expect(classifyStatus(503)).toEqual({ kind: "retry", error: "HTTP 503" });
		expect(classifyStatus(429).kind).toBe("retry");
	});

	it("jedes Ereignis braucht genau ein Ergebnis", () => {
		const id1 = sent[0]?.id ?? "";
		const id2 = sent[1]?.id ?? "";
		expect(
			applyResults(
				sent,
				res([
					{ id: id1, result: "accepted" },
					{ id: id2, result: "rejected", code: "invalid" },
				]),
				"b",
			),
		).toEqual({
			ok: true,
			rejected: [{ ...sent[1], code: "invalid" }],
		});
		expect(
			applyResults(sent, res([{ id: id1, result: "accepted" }]), "b"),
		).toEqual({ ok: false, error: "results_missing" });
		expect(
			applyResults(sent, res([{ id: id1, result: "accepted" }]), "x").ok,
		).toBe(false);
	});

	it("Konten-Auswahl: fremde Konten bleiben draußen, Tagesabschluss gekürzt", () => {
		expect(
			scopeEvent("transfer.upserted", { transfer: { accountId: B } }, [A]),
		).toBeNull();
		expect(
			scopeEvent("transfer.upserted", { transfer: { accountId: A } }, [A]),
		).not.toBeNull();
		expect(scopeEvent("heartbeat", { at: "x" }, [A])).toEqual({ at: "x" });
		expect(
			scopeEvent(
				"day.closed",
				{ date: "d", accounts: [{ accountId: A }, { accountId: B }] },
				[A],
			),
		).toEqual({ date: "d", accounts: [{ accountId: A }] });
		expect(
			scopeEvent("alert.raised", { subject: { kind: "account", id: B } }, [A]),
		).toBeNull();
		expect(
			scopeEvent("transfer.upserted", { transfer: { accountId: B } }, null),
		).not.toBeNull();
	});

	it("Berliner Tagesbeginn auch an den Umstellungstagen", () => {
		expect(berlinDayStart("2026-10-24").toISOString()).toBe(
			"2026-10-23T22:00:00.000Z",
		);
		expect(berlinDayStart("2026-01-15").toISOString()).toBe(
			"2026-01-14T23:00:00.000Z",
		);
		// Sommerzeit beginnt am 29.03.2026 um 02:00 — Mitternacht noch MEZ
		expect(berlinDayStart("2026-03-29").toISOString()).toBe(
			"2026-03-28T23:00:00.000Z",
		);
		// Winterzeit beginnt am 25.10.2026 um 03:00 — Mitternacht noch MESZ
		expect(berlinDayStart("2026-10-25").toISOString()).toBe(
			"2026-10-24T22:00:00.000Z",
		);
	});

	it("Ablehnungen: neueste zuerst, gedeckelt", () => {
		const prev = [{ seq: 1 }, { seq: 2 }];
		expect(mergeRejected(prev, [{ seq: 5 }], 2)).toEqual([
			{ seq: 5 },
			{ seq: 2 },
		]);
		expect(mergeRejected(null, [{ seq: 3 }])).toEqual([{ seq: 3 }]);
	});

	it("Token-Form wie in Klick ausgestellt", () => {
		expect(LINK_TOKEN_RE.test(`klk_wallet_${"a".repeat(43)}`)).toBe(true);
		expect(LINK_TOKEN_RE.test(`klk_portal_${"a".repeat(43)}`)).toBe(false);
		expect(LINK_TOKEN_RE.test("klk_wallet_kurz")).toBe(false);
		expect(LINK_TOKEN_RE.test(`klk_wallet_${"a".repeat(43)} x`)).toBe(false);
	});
});
