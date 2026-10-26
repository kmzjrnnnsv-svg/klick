import { describe, expect, it } from "vitest";
import { versionContentHash } from "@/lib/documents/content-hash";
import {
	currentPublished,
	inForceStatus,
	validInPeriod,
	validRanges,
	versionState,
} from "@/lib/documents/versions";

const d = (s: string) => new Date(`${s}T10:00:00Z`);
type V = {
	id: string;
	version: string;
	approvedAt: Date | null;
	publishedAt: Date | null;
	retiredAt: Date | null;
};
const v = (
	id: string,
	version: string,
	published: string | null,
	retired: string | null = null,
	approved: string | null = published,
): V => ({
	id,
	version,
	approvedAt: approved ? d(approved) : null,
	publishedAt: published ? d(published) : null,
	retiredAt: retired ? d(retired) : null,
});

describe("Dokument-Fassungen", () => {
	const versions = [
		v("a", "1.0", "2026-01-10"),
		v("b", "1.1", "2026-04-01"),
		v("c", "2.0", null, null, "2026-09-01"),
		v("d", "2.1", null, null, null),
	];

	it("gültig von … bis: Ende = Veröffentlichung der Nachfolgerin", () => {
		const r = validRanges(versions);
		expect(r.get("a")).toEqual({
			from: d("2026-01-10"),
			until: d("2026-04-01"),
		});
		expect(r.get("b")).toEqual({ from: d("2026-04-01"), until: null });
		expect(r.has("c")).toBe(false);
	});

	it("gültige Fassung zu einem Zeitpunkt", () => {
		expect(currentPublished(versions, d("2026-02-01"))?.id).toBe("a");
		expect(currentPublished(versions, d("2026-10-01"))?.id).toBe("b");
		expect(currentPublished(versions, d("2025-12-01"))).toBeNull();
	});

	it("freigegeben, aber nicht veröffentlicht, gilt noch nicht", () => {
		expect(currentPublished(versions, d("2026-10-01"))?.version).toBe("1.1");
	});

	it("Rückzug beendet die Gültigkeit ohne Nachfolgerin", () => {
		const retired = [v("a", "1.0", "2026-01-10", "2026-06-01")];
		expect(currentPublished(retired, d("2026-05-01"))?.id).toBe("a");
		expect(currentPublished(retired, d("2026-07-01"))).toBeNull();
		expect(validRanges(retired).get("a")?.until).toEqual(d("2026-06-01"));
	});

	it("Fassungen, die in einem Zeitraum galten, auch wenn vorher veröffentlicht", () => {
		const inQ2 = validInPeriod(versions, d("2026-03-01"), d("2026-06-30"));
		expect(inQ2.map((x) => x.id).sort()).toEqual(["a", "b"]);
		const inQ3 = validInPeriod(versions, d("2026-07-01"), d("2026-09-30"));
		expect(inQ3.map((x) => x.id)).toEqual(["b"]);
	});

	it("Stand je Fassung für die Anzeige", () => {
		const now = d("2026-10-01");
		const doc = { version: "2.1", status: "in_review" };
		expect(versionState(versions[0] as V, doc, versions, now)).toBe(
			"superseded",
		);
		expect(versionState(versions[1] as V, doc, versions, now)).toBe("current");
		expect(versionState(versions[2] as V, doc, versions, now)).toBe("approved");
		expect(versionState(versions[3] as V, doc, versions, now)).toBe(
			"in_review",
		);
		expect(
			versionState(
				versions[3] as V,
				{ ...doc, status: "draft" },
				versions,
				now,
			),
		).toBe("draft");
		const retired = [v("a", "1.0", "2026-01-10", "2026-06-01")];
		expect(
			versionState(
				retired[0] as V,
				{ version: "1.0", status: "retired" },
				retired,
				now,
			),
		).toBe("retired");
	});

	it("in Kraft: neue Fassung in Arbeit lässt die gültige stehen", () => {
		expect(inForceStatus("draft", true)).toBe("published");
		expect(inForceStatus("in_review", true)).toBe("published");
		expect(inForceStatus("draft", false)).toBe("draft");
		expect(inForceStatus("retired", true)).toBe("retired");
	});

	it("Prüfsumme hängt an Text und Datei", () => {
		const a = versionContentHash("Text", null);
		expect(a).toMatch(/^[0-9a-f]{64}$/);
		expect(versionContentHash("Text", null)).toBe(a);
		expect(versionContentHash("Text ", null)).not.toBe(a);
		expect(versionContentHash("Text", "ab".repeat(32))).not.toBe(a);
		// kein Text und leerer Text sind derselbe Inhalt
		expect(versionContentHash(null, null)).toBe(versionContentHash("", null));
	});
});
