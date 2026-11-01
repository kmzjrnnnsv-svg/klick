import type {
	DOCUMENT_STATUS,
	TrustCenterSettings,
	TrustSnapshot,
	TrustSnapshotDocument,
} from "@/db/schema";
import type { Classification, Domain, ImplStatus } from "@/db/schema/enums";

type DocumentStatus = (typeof DOCUMENT_STATUS)[number];

import { ndaVersion } from "./nda-version";
import { documentAccessAllowed } from "./rules";

// Snapshot beim Veröffentlichen — rein. Öffentlich ist nur, was hier
// herauskommt; unzulässige oder nicht veröffentlichte Einträge fallen mit
// Warnung heraus, statt die Veröffentlichung zu blockieren.

export type SnapshotDocumentInput = {
	documentId: string;
	docNumber: string;
	title: string;
	classification: Classification;
	status: DocumentStatus;
	latest: {
		versionId: string;
		version: string;
		publishedAt: Date | null;
		hasBody: boolean;
		hasFile: boolean;
	} | null;
};

export type SnapshotInput = {
	orgName: string;
	settings: TrustCenterSettings;
	activeFrameworks: readonly string[];
	frameworkNames: Readonly<Record<string, string>>;
	coverage: Readonly<Record<string, number | null>>;
	controls: readonly { domain: Domain; status: ImplStatus }[];
	providers: readonly {
		name: string;
		serviceType: string | null;
		country: string | null;
		dataLocations: readonly string[];
	}[];
	documents: readonly SnapshotDocumentInput[];
	now: Date;
};

export type SnapshotWarning =
	| { kind: "framework_inactive"; ref: string }
	| { kind: "document_missing"; ref: string }
	| { kind: "document_unpublished"; ref: string }
	| { kind: "document_access"; ref: string };

export function buildTrustSnapshot(input: SnapshotInput): {
	snapshot: TrustSnapshot;
	warnings: SnapshotWarning[];
} {
	const s = input.settings;
	const warnings: SnapshotWarning[] = [];
	const active = new Set(input.activeFrameworks);

	const frameworks: TrustSnapshot["frameworks"] = [];
	for (const f of s.frameworks) {
		if (!active.has(f.slug)) {
			warnings.push({ kind: "framework_inactive", ref: f.slug });
			continue;
		}
		const cov = input.coverage[f.slug];
		frameworks.push({
			slug: f.slug,
			name: input.frameworkNames[f.slug] ?? f.slug,
			status: f.status,
			validUntil: f.validUntil,
			note: f.note,
			coverage:
				s.showCoverage && cov !== null && cov !== undefined
					? Math.round(cov)
					: null,
		});
	}

	let domains: TrustSnapshot["domains"] = null;
	if (s.showControls) {
		const byDomain = new Map<string, { total: number; implemented: number }>();
		for (const c of input.controls) {
			if (c.status === "not_applicable") continue;
			const d = byDomain.get(c.domain) ?? { total: 0, implemented: 0 };
			d.total++;
			if (c.status === "implemented") d.implemented++;
			byDomain.set(c.domain, d);
		}
		domains = [...byDomain.entries()]
			.map(([domain, v]) => ({ domain, ...v }))
			.sort((a, b) => b.total - a.total || a.domain.localeCompare(b.domain));
	}

	const subprocessors: TrustSnapshot["subprocessors"] = s.showSubprocessors
		? input.providers
				.map((p) => ({
					name: p.name,
					category: p.serviceType,
					locations: [
						...new Set(
							p.dataLocations.length > 0
								? p.dataLocations
								: p.country
									? [p.country]
									: [],
						),
					],
				}))
				.sort((a, b) => a.name.localeCompare(b.name, "de"))
		: null;

	const docById = new Map(input.documents.map((d) => [d.documentId, d]));
	const documents: TrustSnapshotDocument[] = [];
	for (const entry of s.documents) {
		const d = docById.get(entry.documentId);
		if (!d) {
			warnings.push({ kind: "document_missing", ref: entry.documentId });
			continue;
		}
		// Die zuletzt veröffentlichte Version zählt — auch wenn schon eine
		// neue Fassung in Arbeit ist; zurückgezogene Dokumente nie.
		if (
			d.status === "retired" ||
			d.status === "superseded" ||
			!d.latest?.publishedAt ||
			!(d.latest.hasBody || d.latest.hasFile)
		) {
			warnings.push({ kind: "document_unpublished", ref: d.docNumber });
			continue;
		}
		if (!documentAccessAllowed(d.classification, entry.access)) {
			warnings.push({ kind: "document_access", ref: d.docNumber });
			continue;
		}
		documents.push({
			versionId: d.latest.versionId,
			documentId: d.documentId,
			docNumber: d.docNumber,
			title: d.title,
			version: d.latest.version,
			classification: d.classification,
			access: entry.access,
			kind: d.latest.hasFile ? "file" : "markdown",
			publishedAt: d.latest.publishedAt.toISOString(),
		});
	}

	return {
		snapshot: {
			orgName: input.orgName,
			title: s.title,
			intro: s.intro,
			contactEmail: s.contactEmail,
			ndaText: s.ndaText,
			ndaVersion: ndaVersion(s.ndaText),
			indexable: s.indexable,
			frameworks,
			domains,
			subprocessors,
			documents,
			generatedAt: input.now.toISOString(),
		},
		warnings,
	};
}

// Darf diese Version über das Trust Center geladen werden — und mit welchem
// Zugriff? null = steht nicht im veröffentlichten Stand.
export function snapshotDocument(
	snapshot: TrustSnapshot | null,
	versionId: string,
): TrustSnapshotDocument | null {
	return snapshot?.documents.find((d) => d.versionId === versionId) ?? null;
}
