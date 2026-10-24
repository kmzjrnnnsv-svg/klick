import { describe, expect, it } from "vitest";
import {
	alertOverdue,
	expectedClosedDay,
	linkHealth,
} from "@/lib/wallet-link-ingest/health";

const base = {
	walletOrgId: "w",
	createdAt: new Date("2026-10-01T00:00:00Z"),
	lastHeartbeatAt: new Date("2026-10-24T09:00:00Z"),
	lastDayClosed: "2026-10-23",
	sanctionsList: { importedAt: "2026-10-23T06:00:00Z" },
	tokenExpiresAt: new Date("2027-10-01T00:00:00Z"),
};

describe("Zustand der Verbindung zu both.money", () => {
	it("alles frisch: keine Warnung", () => {
		expect(linkHealth(base, new Date("2026-10-24T10:00:00Z"))).toEqual({
			bound: true,
			heartbeatStale: false,
			dayCloseMissing: null,
			sanctionsStale: false,
			tokenExpiresSoon: false,
		});
	});

	it("Lebenszeichen älter als 2 h, Abschluss fehlt ab 09:00 Berlin", () => {
		const h = linkHealth(
			{ ...base, lastDayClosed: "2026-10-22" },
			new Date("2026-10-24T11:30:00Z"),
		);
		expect(h.heartbeatStale).toBe(true);
		expect(h.dayCloseMissing).toBe("2026-10-23");
		// vor 09:00 Berlin (06:30 UTC = 08:30 MESZ) noch keine Warnung
		expect(
			linkHealth(
				{ ...base, lastDayClosed: "2026-10-22" },
				new Date("2026-10-24T06:30:00Z"),
			).dayCloseMissing,
		).toBeNull();
	});

	it("Sanktionsliste älter als 7 Tage oder fehlend, Token läuft in 30 Tagen ab", () => {
		const now = new Date("2026-11-05T10:00:00Z");
		expect(linkHealth(base, now).sanctionsStale).toBe(true);
		expect(
			linkHealth({ ...base, sanctionsList: null }, now).sanctionsStale,
		).toBe(true);
		expect(
			linkHealth(
				{ ...base, tokenExpiresAt: new Date("2026-11-20T00:00:00Z") },
				now,
			).tokenExpiresSoon,
		).toBe(true);
	});

	it("frisch verbunden oder nicht gebunden: keine Fristen", () => {
		const now = new Date("2026-10-24T12:00:00Z");
		const fresh = linkHealth(
			{
				...base,
				createdAt: new Date("2026-10-24T11:00:00Z"),
				lastHeartbeatAt: null,
				lastDayClosed: null,
				sanctionsList: null,
			},
			now,
		);
		expect(fresh.heartbeatStale).toBe(false);
		expect(fresh.dayCloseMissing).toBeNull();
		expect(fresh.sanctionsStale).toBe(false);
		const unbound = linkHealth(
			{ ...base, walletOrgId: null, lastHeartbeatAt: null },
			now,
		);
		expect(unbound.heartbeatStale).toBe(false);
	});

	it("Vortag und offene Hinweise", () => {
		expect(expectedClosedDay(new Date("2026-10-24T22:30:00Z"))).toBe(
			"2026-10-24",
		);
		expect(expectedClosedDay(new Date("2026-10-24T10:00:00Z"))).toBe(
			"2026-10-23",
		);
		const raisedAt = new Date("2026-10-23T08:00:00Z");
		expect(
			alertOverdue(
				{ raisedAt, resolvedAt: null },
				new Date("2026-10-24T09:00:00Z"),
			),
		).toBe(true);
		expect(
			alertOverdue(
				{ raisedAt, resolvedAt: new Date() },
				new Date("2026-10-24T09:00:00Z"),
			),
		).toBe(false);
	});
});
