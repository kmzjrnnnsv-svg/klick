import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isEffective } from "@/lib/compliance/appointments";
import { ROOT, walkFiles } from "./helpers/walk";

// Bestellung durch die Geschäftsleitung: eine Besetzung wirkt erst ab
// „bestellt“. Jede Abfrage auf role_assignments filtert mit
// effectiveAssignment() — außer den Stellen hier, die bewusst alle Zeilen
// lesen (Listen mit Vorschlägen, Ändern einer bestimmten Zeile).

const ALL_ROWS: Record<string, string> = {
	"app/(setup)/einrichtung/[schritt]/page.tsx":
		"Einrichtung zeigt Vorschläge und Bestellte",
	"app/actions/setup.ts":
		"Zeile zum Ändern finden (gleiche Person nie doppelt)",
	"app/actions/organisation.ts": "Zeile vor dem Ändern lesen (Audit before)",
	"lib/compliance/queries-p3.ts":
		"/organisation listet alle Zeilen; Abdeckung filtert selbst",
	"lib/compliance/appointment-service.ts":
		"Bestellung selbst: liest Vorschläge, um sie zu bestellen",
	"lib/entities/links.ts": "Titel im Posteingang, auch für Vorschläge",
	"lib/compliance/decision-service.ts":
		"Beschluss nennt die Funktion der Bestellung (auch vor der Wirkung)",
	"app/actions/roles.ts":
		"Rolle löschen nur ohne Besetzung und ohne offenen Vorschlag",
	"lib/org/own-role-service.ts":
		"Besetzung eigener Rollen abgleichen: Vorschläge zählen mit",
	"lib/org/roles.ts": "Rollen-Editor zeigt Bestellte und Vorgeschlagene",
	"app/actions/role-board.ts":
		"Tafel: doppelte Vorschläge erkennen; Berichtsweg gilt auch für Vorschläge",
};

function unfiltered(src: string): number {
	let n = 0;
	for (const m of src.matchAll(/\.from\(roleAssignments\)/g)) {
		const start = (m.index ?? 0) + m[0].length;
		const end = src.indexOf(";", start);
		if (!src.slice(start, end).includes("effectiveAssignment()")) n += 1;
	}
	return n;
}

describe("Besetzungen wirken erst mit Bestellung", () => {
	it("Status: nur bestellt und Abberufung beantragt sind wirksam", () => {
		expect(isEffective("appointed")).toBe(true);
		expect(isEffective("revocation_requested")).toBe(true);
		expect(isEffective("proposed")).toBe(false);
		expect(isEffective("rejected")).toBe(false);
		expect(isEffective("revoked")).toBe(false);
	});

	it("jede Abfrage auf role_assignments filtert auf wirksame Besetzungen", () => {
		const files = walkFiles(["app", "lib", "components"], /\.tsx?$/);
		const offenders = files.filter(
			(f) =>
				!ALL_ROWS[f] && unfiltered(readFileSync(join(ROOT, f), "utf8")) > 0,
		);
		expect(offenders).toEqual([]);
	});

	it("die Ausnahmen gibt es noch (sonst Eintrag entfernen)", () => {
		for (const f of Object.keys(ALL_ROWS))
			expect(unfiltered(readFileSync(join(ROOT, f), "utf8"))).toBeGreaterThan(
				0,
			);
	});
});
