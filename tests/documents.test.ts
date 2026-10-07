import { describe, expect, it } from "vitest";
import {
	bumpVersion,
	guessDocType,
	nextDocNumber,
	titleFromFileName,
} from "@/lib/documents/numbering";

describe("documents", () => {
	it("Nummernkreis je Typ, Zähler wandert, Kollisionen werden übersprungen", () => {
		const a = nextDocNumber(null, "policy");
		expect(a.docNumber).toBe("RL-001");
		const b = nextDocNumber(a.numbering, "policy");
		expect(b.docNumber).toBe("RL-002");
		const c = nextDocNumber(b.numbering, "procedure");
		expect(c.docNumber).toBe("VA-001");
		const d = nextDocNumber({ policy: { prefix: "RL", next: 3 } }, "policy", [
			"RL-003",
			"RL-004",
		]);
		expect(d.docNumber).toBe("RL-005");
		expect(d.numbering.policy?.next).toBe(6);
	});
	it("eigene Präfixe bleiben", () => {
		expect(
			nextDocNumber({ policy: { prefix: "POL", next: 12 } }, "policy")
				.docNumber,
		).toBe("POL-012");
	});
	it("Versionen", () => {
		expect(bumpVersion("0.1", "minor")).toBe("0.2");
		expect(bumpVersion("0.3", "major")).toBe("1.0");
		expect(bumpVersion("1.0", "minor")).toBe("1.1");
		expect(bumpVersion("x", "major")).toBe("1.0");
	});
	it("Typ-Vorschlag und Titel aus Dateinamen", () => {
		expect(guessDocType("RL-Zugangsrichtlinie_v3.docx")).toBe("policy");
		expect(guessDocType("Verfahrensanweisung Backup.pdf")).toBe("procedure");
		expect(guessDocType("Kryptokonzept.md")).toBe("concept");
		expect(guessDocType("AVV Hetzner.pdf")).toBe("contract");
		expect(guessDocType("sonstiges.pdf")).toBe("record");
		expect(titleFromFileName("RL-Zugangsrichtlinie_v3.docx")).toBe(
			"RL Zugangsrichtlinie v3",
		);
	});
});
