import { describe, expect, it } from "vitest";
import type { TrustCenterSettings } from "@/db/schema";
import { newToken, tokenKindOf } from "@/lib/security/tokens";
import { ndaVersion } from "@/lib/trust/nda-version";
import {
	documentAccessAllowed,
	requestState,
	slugValid,
	suggestSlug,
} from "@/lib/trust/rules";
import {
	buildTrustSnapshot,
	type SnapshotInput,
	snapshotDocument,
} from "@/lib/trust/snapshot";

describe("Trust Center — Regeln", () => {
	it("prüft Slugs und reservierte Namen", () => {
		expect(slugValid("acme-pay")).toBe(true);
		expect(slugValid("ab")).toBe(false);
		expect(slugValid("-acme")).toBe(false);
		expect(slugValid("acme--pay")).toBe(false);
		expect(slugValid("Acme")).toBe(false);
		expect(slugValid("paket")).toBe(false);
		expect(slugValid("a".repeat(41))).toBe(false);
	});

	it("schlägt einen gültigen Slug vor", () => {
		expect(suggestSlug("Müller & Söhne GmbH")).toBe("mueller-soehne-gmbh");
		expect(slugValid(suggestSlug("A"))).toBe(true);
		expect(slugValid(suggestSlug("Paket"))).toBe(true);
	});

	it("gibt streng geheime Dokumente nie und vertrauliche nur mit NDA frei", () => {
		expect(documentAccessAllowed("secret", "nda")).toBe(false);
		expect(documentAccessAllowed("confidential", "public")).toBe(false);
		expect(documentAccessAllowed("confidential", "nda")).toBe(true);
		expect(documentAccessAllowed("internal", "public")).toBe(true);
		expect(documentAccessAllowed("public", "nda")).toBe(true);
	});

	it("merkt sich die NDA-Fassung unabhängig von Leerraum am Rand", () => {
		expect(ndaVersion(" Text ")).toBe(ndaVersion("Text"));
		expect(ndaVersion("Text")).not.toBe(ndaVersion("Text 2"));
		expect(ndaVersion("Text")).toHaveLength(16);
	});

	it("leitet den Zustand einer Anfrage ab", () => {
		const now = new Date("2026-10-22T10:00:00Z");
		const later = new Date("2026-10-30T00:00:00Z");
		const earlier = new Date("2026-10-01T00:00:00Z");
		expect(requestState({ status: "pending", expiresAt: null }, now)).toBe(
			"pending",
		);
		expect(requestState({ status: "approved", expiresAt: later }, now)).toBe(
			"active",
		);
		expect(requestState({ status: "approved", expiresAt: earlier }, now)).toBe(
			"expired",
		);
		expect(requestState({ status: "revoked", expiresAt: later }, now)).toBe(
			"revoked",
		);
	});

	it("kennt die Token-Art klk_trust_", () => {
		const t = newToken("trust_center");
		expect(t.token.startsWith("klk_trust_")).toBe(true);
		expect(tokenKindOf(t.token)).toBe("trust_center");
	});
});

const settings: TrustCenterSettings = {
	title: "Sicherheit bei Acme",
	intro: "Wie wir Daten schützen.",
	contactEmail: "security@example.com",
	ndaText: "Vertraulich behandeln.",
	indexable: false,
	showCoverage: true,
	showControls: true,
	showSubprocessors: true,
	frameworks: [
		{
			slug: "iso27001",
			status: "certified",
			validUntil: "2027-06-30",
			note: null,
		},
		{ slug: "soc2", status: "planned", validUntil: null, note: null },
	],
	documents: [
		{ documentId: "d1", access: "public" },
		{ documentId: "d2", access: "public" },
		{ documentId: "d3", access: "nda" },
		{ documentId: "d4", access: "nda" },
		{ documentId: "d5", access: "nda" },
	],
};

const published = (versionId: string, file = false) => ({
	versionId,
	version: "1.0",
	publishedAt: new Date("2026-09-01T00:00:00Z"),
	hasBody: !file,
	hasFile: file,
});

const input: SnapshotInput = {
	orgName: "Acme Pay GmbH",
	settings,
	activeFrameworks: ["iso27001", "dora"],
	frameworkNames: { iso27001: "ISO/IEC 27001:2022", soc2: "SOC 2" },
	coverage: { iso27001: 71.6 },
	controls: [
		{ domain: "access", status: "implemented" },
		{ domain: "access", status: "in_progress" },
		{ domain: "crypto", status: "implemented" },
		{ domain: "crypto", status: "not_applicable" },
	],
	providers: [
		{
			name: "Zeta Cloud",
			serviceType: "cloud_iaas",
			country: "DE",
			dataLocations: [],
		},
		{
			name: "Alpha Mail",
			serviceType: "cloud_saas",
			country: "IE",
			dataLocations: ["IE", "IE", "NL"],
		},
	],
	documents: [
		{
			documentId: "d1",
			docNumber: "POL-01",
			title: "Richtlinie",
			classification: "internal",
			status: "published",
			latest: published("v1"),
		},
		{
			documentId: "d2",
			docNumber: "POL-02",
			title: "Vertraulich",
			classification: "confidential",
			status: "published",
			latest: published("v2"),
		},
		{
			documentId: "d3",
			docNumber: "REP-01",
			title: "Pentest",
			classification: "confidential",
			status: "published",
			latest: published("v3", true),
		},
		{
			documentId: "d4",
			docNumber: "DRAFT-01",
			title: "Entwurf",
			classification: "internal",
			status: "draft",
			latest: null,
		},
		{
			documentId: "d5",
			docNumber: "SEC-01",
			title: "Geheim",
			classification: "secret",
			status: "published",
			latest: published("v5"),
		},
	],
	now: new Date("2026-10-22T10:00:00Z"),
};

describe("Trust Center — Snapshot", () => {
	it("übernimmt nur aktive Rahmenwerke, gerundete Abdeckung", () => {
		const { snapshot, warnings } = buildTrustSnapshot(input);
		expect(snapshot.frameworks).toEqual([
			{
				slug: "iso27001",
				name: "ISO/IEC 27001:2022",
				status: "certified",
				validUntil: "2027-06-30",
				note: null,
				coverage: 72,
			},
		]);
		expect(warnings).toContainEqual({
			kind: "framework_inactive",
			ref: "soc2",
		});
	});

	it("zählt Controls je Domäne ohne nicht anwendbare", () => {
		const { snapshot } = buildTrustSnapshot(input);
		expect(snapshot.domains).toEqual([
			{ domain: "access", total: 2, implemented: 1 },
			{ domain: "crypto", total: 1, implemented: 1 },
		]);
	});

	it("listet Unterauftragnehmer sortiert mit Datenstandorten", () => {
		const { snapshot } = buildTrustSnapshot(input);
		expect(snapshot.subprocessors).toEqual([
			{ name: "Alpha Mail", category: "cloud_saas", locations: ["IE", "NL"] },
			{ name: "Zeta Cloud", category: "cloud_iaas", locations: ["DE"] },
		]);
	});

	it("lässt unzulässige und unveröffentlichte Dokumente mit Warnung weg", () => {
		const { snapshot, warnings } = buildTrustSnapshot(input);
		expect(
			snapshot.documents.map((d) => [d.docNumber, d.access, d.kind]),
		).toEqual([
			["POL-01", "public", "markdown"],
			["REP-01", "nda", "file"],
		]);
		expect(warnings).toEqual(
			expect.arrayContaining([
				{ kind: "document_access", ref: "POL-02" },
				{ kind: "document_unpublished", ref: "DRAFT-01" },
				{ kind: "document_access", ref: "SEC-01" },
			]),
		);
		expect(snapshotDocument(snapshot, "v3")?.access).toBe("nda");
		expect(snapshotDocument(snapshot, "v2")).toBeNull();
		expect(snapshotDocument(null, "v1")).toBeNull();
	});

	it("blendet Abschnitte aus, wenn die Schalter aus sind", () => {
		const { snapshot } = buildTrustSnapshot({
			...input,
			settings: {
				...settings,
				showCoverage: false,
				showControls: false,
				showSubprocessors: false,
			},
		});
		expect(snapshot.frameworks[0]?.coverage).toBeNull();
		expect(snapshot.domains).toBeNull();
		expect(snapshot.subprocessors).toBeNull();
		expect(snapshot.ndaVersion).toBe(ndaVersion(settings.ndaText));
	});
});
