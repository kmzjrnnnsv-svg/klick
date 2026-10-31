import { describe, expect, it } from "vitest";
import {
	ANNOUNCEMENT_TEMPLATES,
	type AnnouncementLike,
	announcementState,
	appliesTo,
	bannersFor,
	MAINTENANCE_LEAD_MS,
	shownNow,
	windowError,
} from "@/lib/announcements/rules";
import de from "@/messages/de.json";

const now = new Date("2026-10-31T12:00:00Z");
const h = (n: number) => new Date(now.getTime() + n * 3600_000);
const a = (
	over: Partial<AnnouncementLike> & { id?: string } = {},
): AnnouncementLike & { id: string } => ({
	id: "a1",
	kind: "info",
	startsAt: h(-1),
	endsAt: null,
	withdrawnAt: null,
	orgIds: null,
	...over,
});

describe("Mitteilungen: Stand und Ziel", () => {
	it("geplant, sichtbar, beendet, zurückgezogen", () => {
		expect(announcementState(a({ startsAt: h(2) }), now)).toBe("scheduled");
		expect(announcementState(a(), now)).toBe("active");
		expect(announcementState(a({ endsAt: h(-0.5) }), now)).toBe("ended");
		expect(announcementState(a({ withdrawnAt: h(-0.2) }), now)).toBe(
			"withdrawn",
		);
	});

	it("gilt für alle oder nur die gewählten Orgs", () => {
		expect(appliesTo(a(), "o1")).toBe(true);
		expect(appliesTo(a({ orgIds: ["o1"] }), "o1")).toBe(true);
		expect(appliesTo(a({ orgIds: ["o1"] }), "o2")).toBe(false);
	});

	it("Wartung erscheint bis zu 3 Tage vorher, anderes erst ab Beginn", () => {
		const soon = h(48);
		expect(shownNow(a({ kind: "maintenance", startsAt: soon }), now)).toBe(
			true,
		);
		expect(
			shownNow(
				a({
					kind: "maintenance",
					startsAt: new Date(now.getTime() + MAINTENANCE_LEAD_MS + 3600_000),
				}),
				now,
			),
		).toBe(false);
		expect(shownNow(a({ kind: "info", startsAt: soon }), now)).toBe(false);
	});

	it("Zeitfenster: Ende nach Beginn, höchstens 90 Tage", () => {
		expect(windowError(now, null)).toBeNull();
		expect(windowError(now, h(-1))).toBe("ends_before_start");
		expect(windowError(now, h(24 * 91))).toBe("too_long");
		expect(windowError(now, h(24))).toBeNull();
	});
});

describe("Mitteilungen: Banner", () => {
	it("Vorfall zuerst, dann Wartung, dann Info; quittierter Vorfall verschwindet", () => {
		const list = [
			a({ id: "info", kind: "info" }),
			a({ id: "inc", kind: "incident" }),
			a({ id: "mnt", kind: "maintenance", startsAt: h(5) }),
			a({ id: "other", kind: "info", orgIds: ["o2"] }),
			a({ id: "gone", kind: "info", withdrawnAt: h(-0.1) }),
		];
		expect(bannersFor(list, "o1", now, new Set()).map((b) => b.id)).toEqual([
			"inc",
			"mnt",
			"info",
		]);
		expect(
			bannersFor(list, "o1", now, new Set(["inc"])).map((b) => b.id),
		).toEqual(["mnt", "info"]);
	});
});

describe("Mitteilungen: Vorlagen und Texte", () => {
	it("Vorlagen in Du-Form, ohne Geviertstrich und ohne „wir“", () => {
		for (const tpl of Object.values(ANNOUNCEMENT_TEMPLATES)) {
			const text = `${tpl.title} ${tpl.body}`;
			expect(text).not.toMatch(/—/);
			expect(text).not.toMatch(/\b(wir|uns|unser)\b/i);
			expect(text).not.toMatch(/\bSie\b/);
		}
		const keys = Object.keys(de.AdminAnnouncements);
		for (const k of Object.keys(ANNOUNCEMENT_TEMPLATES))
			expect(keys).toContain(`template_${k}`);
	});
});
