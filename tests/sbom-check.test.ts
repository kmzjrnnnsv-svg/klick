import { describe, expect, it } from "vitest";
import { checkSbom, parseSbom } from "@/lib/security/sbom-check";

const now = new Date("2026-10-17T12:00:00Z");

const comp = (name: string, extra: Record<string, unknown> = {}) => ({
	type: "library",
	name,
	version: "1.0.0",
	purl: `pkg:npm/${name}@1.0.0`,
	licenses: [{ license: { id: "MIT" } }],
	hashes: [{ alg: "SHA-512", content: "ab".repeat(64) }],
	supplier: { name: "ACME" },
	...extra,
});

const cyclone = (components: unknown[], extra: Record<string, unknown> = {}) =>
	JSON.stringify({
		bomFormat: "CycloneDX",
		specVersion: "1.6",
		metadata: {
			timestamp: "2026-10-01T10:00:00Z",
			tools: { components: [{ name: "syft" }] },
			component: { name: "app", version: "2.1.0" },
		},
		components,
		dependencies: [{ ref: "app", dependsOn: ["a"] }],
		...extra,
	});

describe("parseSbom + checkSbom", () => {
	it("CycloneDX: vollständig → ok, verschachtelte Komponenten zählen", () => {
		const r = parseSbom(
			cyclone([comp("a", { components: [comp("a-sub")] }), comp("b")]),
		);
		if (!r.ok) throw new Error(r.error);
		const s = checkSbom(r.sbom, now);
		expect(s).toMatchObject({
			format: "cyclonedx",
			specVersion: "1.6",
			components: 3,
			primaryComponent: "app 2.1.0",
			ok: true,
			dependencies: true,
		});
		expect(s.fields).toEqual({
			version: 100,
			identifier: 100,
			license: 100,
			hash: 100,
			supplier: 100,
		});
		expect(s.issues).toEqual([]);
	});

	it("fehlende Kennungen und Zeitstempel blockieren, Lizenz nur Hinweis", () => {
		const r = parseSbom(
			JSON.stringify({
				bomFormat: "CycloneDX",
				specVersion: "1.4",
				metadata: {},
				components: [
					comp("a", { purl: undefined, licenses: [] }),
					comp("b", { licenses: [] }),
				],
			}),
		);
		if (!r.ok) throw new Error(r.error);
		const s = checkSbom(r.sbom, now);
		expect(s.ok).toBe(false);
		expect(s.fields.identifier).toBe(50);
		expect(s.issues.join(" | ")).toMatch(/Erstellungszeitpunkt/);
		expect(s.issues.join(" | ")).toMatch(/Kennung/);
		expect(s.issues.join(" | ")).toMatch(/Abhängigkeitsbeziehungen/);
		expect(s.issues.join(" | ")).toMatch(/Lizenz nur bei 0 %/);
		expect(s.issues.join(" | ")).toMatch(/CycloneDX 1\.5/);
	});

	it("SPDX 2.3 mit purl, Prüfsummen und DESCRIBES", () => {
		const r = parseSbom(
			JSON.stringify({
				spdxVersion: "SPDX-2.3",
				creationInfo: {
					created: "2026-10-01T10:00:00Z",
					creators: ["Tool: syft"],
				},
				documentDescribes: ["SPDXRef-app"],
				packages: [
					{
						SPDXID: "SPDXRef-app",
						name: "app",
						versionInfo: "2.1.0",
						externalRefs: [
							{
								referenceCategory: "PACKAGE-MANAGER",
								referenceType: "purl",
								referenceLocator: "pkg:npm/app@2.1.0",
							},
						],
						licenseConcluded: "MIT",
						checksums: [
							{ algorithm: "SHA256", checksumValue: "cd".repeat(32) },
						],
						supplier: "Organization: ACME",
					},
					{
						SPDXID: "SPDXRef-a",
						name: "a",
						versionInfo: "1.0.0",
						externalRefs: [
							{ referenceType: "purl", referenceLocator: "pkg:npm/a@1.0.0" },
						],
						licenseConcluded: "NOASSERTION",
						licenseDeclared: "Apache-2.0",
						supplier: "NOASSERTION",
					},
				],
				relationships: [
					{
						spdxElementId: "SPDXRef-app",
						relationshipType: "DEPENDS_ON",
						relatedSpdxElement: "SPDXRef-a",
					},
				],
			}),
		);
		if (!r.ok) throw new Error(r.error);
		const s = checkSbom(r.sbom, now);
		expect(s).toMatchObject({
			format: "spdx",
			specVersion: "2.3",
			components: 2,
			primaryComponent: "app 2.1.0",
			ok: true,
		});
		expect(s.fields).toMatchObject({ license: 100, hash: 50, supplier: 50 });
	});

	it("Fehler: kein JSON, unbekanntes Format, SPDX 3", () => {
		expect(parseSbom("{nope")).toEqual({ ok: false, error: "invalid_json" });
		expect(parseSbom(JSON.stringify({ hello: 1 }))).toEqual({
			ok: false,
			error: "unknown_format",
		});
		expect(
			parseSbom(JSON.stringify({ "@context": "https://spdx.org/rdf/3.0.0" })),
		).toEqual({ ok: false, error: "unsupported_version" });
		expect(parseSbom(JSON.stringify({ spdxVersion: "SPDX-3.0" }))).toEqual({
			ok: false,
			error: "unsupported_version",
		});
	});

	it("leere SBOM ist nicht ok", () => {
		const r = parseSbom(cyclone([]));
		if (!r.ok) throw new Error(r.error);
		expect(checkSbom(r.sbom, now).ok).toBe(false);
	});
});
