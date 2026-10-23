import { describe, expect, it } from "vitest";
import { buildSheet, type SheetEvidence } from "@/lib/evidence-studio/sheet";
import { similarity, stableId } from "@/lib/evidence-studio/text";

const today = "2026-10-23";
const ev = (over: Partial<SheetEvidence>): SheetEvidence => ({
	id: "e1",
	title: "Nachweis",
	sha256: null,
	kindCode: null,
	createdAt: "2026-09-01",
	validUntil: "2027-09-01",
	controls: [],
	...over,
});

describe("Nachweisbogen je Control", () => {
	it("führt Fragen aus Control und Rahmenwerken zusammen und löst Hinweise auf Nachweisarten auf", () => {
		const s = buildSheet({
			controlCode: "CC-GOV-01",
			frameworks: ["iso27001", "dora"],
			today,
		});
		expect(s).not.toBeNull();
		if (!s) return;
		expect(s.requirements.map((r) => r.key)).toContain("iso27001:5.2");
		expect(
			s.requirements.every((r) => ["iso27001", "dora"].includes(r.framework)),
		).toBe(true);
		const merged = s.questions.find((q) => q.sources.length > 1);
		expect(merged?.sources.map((x) => x.key)).toEqual([
			"control",
			"iso27001:5.2",
		]);
		const leitlinie = s.items.find(
			(i) =>
				i.resolution.type === "kind" &&
				i.resolution.kind.code === "NW-LEITLINIE",
		);
		expect(leitlinie?.mandatory).toBe(true);
		expect(leitlinie?.done).toBe(false);
		expect(s.recommendations[0]?.action?.href).toBeTruthy();
		expect(
			s.recommendations.some((r) =>
				r.text.includes("Informationssicherheitsleitlinie, unterschrieben"),
			),
		).toBe(true);
	});

	it("Antworten hängen an stabilen IDs und zählen für alle Rahmenwerke", () => {
		const first = buildSheet({
			controlCode: "CC-GOV-01",
			frameworks: ["iso27001"],
			today,
		});
		const q = first?.questions[0];
		expect(q?.id).toBe(stableId("q", q?.text ?? ""));
		const again = buildSheet({
			controlCode: "CC-GOV-01",
			frameworks: ["iso27001", "dora", "nis2"],
			answers: {
				[q?.id ?? ""]: { answer: "yes", note: "GL-Beschluss 2026-03" },
			},
			today,
		});
		expect(again?.questions.find((x) => x.id === q?.id)?.answer?.answer).toBe(
			"yes",
		);
		expect(again?.progress.questions.answered).toBe(1);
	});

	it("nicht anwendbare Anforderungen fallen aus Fragen und Positionen", () => {
		const all = buildSheet({
			controlCode: "CC-GOV-04",
			frameworks: ["iso27001"],
			today,
		});
		const without = buildSheet({
			controlCode: "CC-GOV-04",
			frameworks: ["iso27001"],
			notApplicable: new Set(["iso27001:4.1"]),
			today,
		});
		expect(
			without?.requirements.find((r) => r.key === "iso27001:4.1")?.applicable,
		).toBe(false);
		expect(
			without?.questions.some((q) =>
				q.sources.some((x) => x.key === "iso27001:4.1"),
			),
		).toBe(false);
		expect(
			all?.questions.some((q) =>
				q.sources.some((x) => x.key === "iso27001:4.1"),
			),
		).toBe(true);
	});

	it("Fristen je Rahmenwerk, eigene Frist darf nicht laxer sein", () => {
		const s = buildSheet({
			controlCode: "CC-INC-03",
			frameworks: ["dora", "nis2", "dsgvo"],
			ownParams: [{ framework: "dora", topic: "deadline:initial", value: 6 }],
			today,
		});
		const initial = s?.params.find((p) => p.topic === "deadline:initial");
		expect(initial?.differs).toBe(true);
		expect(initial?.perFramework.map((f) => f.framework)).toEqual([
			"dora",
			"nis2",
		]);
		expect(
			s?.params.find((p) => p.topic === "deadline:early_warning")
				?.perFramework[0]?.framework,
		).toBe("nis2");
		expect(s?.findings).toContainEqual(
			expect.objectContaining({ kind: "violation", framework: "dora", own: 6 }),
		);
		expect(
			s?.recommendations.some(
				(r) =>
					r.level === "info" && r.text.includes("je Rahmenwerk eigene Frist"),
			),
		).toBe(true);
	});

	it("Konflikt Aufbewahrung gegen Löschung; Ersatzfragen bleiben je Anforderung getrennt", () => {
		const s = buildSheet({
			controlCode: "CC-AST-10",
			frameworks: ["dsgvo", "zag-marisk"],
			today,
		});
		expect(s?.findings.some((f) => f.kind === "conflict")).toBe(true);
		const fallback =
			s?.questions.filter((q) => q.text.startsWith("Wie erfüllt ihr")) ?? [];
		expect(fallback.length).toBeGreaterThan(1);
		expect(fallback.every((q) => q.sources.length === 1)).toBe(true);
	});

	it("erzeugter Nachweis erfüllt die Position, auch wenn er an einem anderen Control hängt", () => {
		const s = buildSheet({
			controlCode: "CC-GOV-01",
			frameworks: ["iso27001"],
			evidence: [
				ev({ id: "nw1", kindCode: "NW-LEITLINIE", controls: ["CC-GOV-03"] }),
			],
			today,
		});
		const item = s?.items.find(
			(i) =>
				i.resolution.type === "kind" &&
				i.resolution.kind.code === "NW-LEITLINIE",
		);
		expect(item?.done).toBe(true);
		expect(item?.coveredElsewhere.map((c) => c.evidence.id)).toEqual(["nw1"]);
		const expired = buildSheet({
			controlCode: "CC-GOV-01",
			frameworks: ["iso27001"],
			evidence: [
				ev({
					kindCode: "NW-LEITLINIE",
					validUntil: "2026-01-01",
					controls: ["CC-GOV-01"],
				}),
			],
			today,
		});
		expect(
			expired?.items.find(
				(i) =>
					i.resolution.type === "kind" &&
					i.resolution.kind.code === "NW-LEITLINIE",
			)?.done,
		).toBe(false);
	});

	it("erkennt doppelte Uploads, zu lange Prüfzyklen und Gültigkeiten", () => {
		const s = buildSheet({
			controlCode: "CC-GOV-01",
			frameworks: ["nis2"],
			evidence: [
				ev({
					id: "a",
					sha256: "abc",
					controls: ["CC-GOV-01"],
					validUntil: "2028-09-01",
				}),
				ev({ id: "b", sha256: "abc", controls: ["CC-GOV-01"] }),
			],
			documents: [
				{
					id: "d1",
					title: "Leitlinie",
					templateCode: "RL-ISMS-LEITLINIE",
					status: "published",
					reviewCycleMonths: 24,
					controls: ["CC-GOV-01"],
				},
			],
			today,
		});
		const kinds = s?.findings.map((f) => f.kind) ?? [];
		expect(kinds).toContain("duplicate_upload");
		expect(kinds).toContain("document_cycle");
		expect(kinds).toContain("evidence_validity");
	});

	it("Ähnlichkeit erkennt gleiche Fragen in anderem Wortlaut", () => {
		expect(
			similarity(
				"Wer hat die Leitlinie wann freigegeben und wie wurde sie kommuniziert?",
				"Wer hat die Leitlinie freigegeben, und wie wurde sie an Mitarbeitende kommuniziert?",
			),
		).toBeGreaterThan(0.35);
		expect(
			similarity(
				"Gibt es ein Asset-Inventar?",
				"Wie oft werden Backups getestet?",
			),
		).toBeLessThan(0.2);
	});
});
