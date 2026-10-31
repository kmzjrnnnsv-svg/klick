import { AMLR_REQUIREMENTS, AMLR_SECTIONS } from "./amlr";
import { FTR_REQUIREMENTS, FTR_SECTIONS } from "./aws-ftr";
import { BASELINE } from "./baseline";
import {
	BSI_200_1_REQUIREMENTS,
	BSI_200_1_SECTIONS,
	BSI_200_2_REQUIREMENTS,
	BSI_200_2_SECTIONS,
	BSI_200_3_REQUIREMENTS,
	BSI_200_3_SECTIONS,
	BSI_200_4_REQUIREMENTS,
	BSI_200_4_SECTIONS,
} from "./bsi";
import { CCPA_REQUIREMENTS, CCPA_SECTIONS } from "./ccpa";
import { CCSS_REQUIREMENTS, CCSS_SECTIONS } from "./ccss";
import { CMMC_REQUIREMENTS, CMMC_SECTIONS } from "./cmmc";
import { CONTROL_REQUIREMENTS } from "./control-requirements";
import { CONTROL_BY_CODE, CONTROLS } from "./controls";
import { CORRIDOR_INDICES } from "./corridors";
import { CRA_REQUIREMENTS, CRA_SECTIONS } from "./cra";
import { CE_REQUIREMENTS, CE_SECTIONS } from "./cyber-essentials";
import { DORA_REQUIREMENTS, DORA_SECTIONS } from "./dora";
import { DSGVO_REQUIREMENTS, DSGVO_SECTIONS } from "./dsgvo";
import { E8_REQUIREMENTS, E8_SECTIONS } from "./essential-eight";
import { DPF_REQUIREMENTS, DPF_SECTIONS } from "./eu-us-dpf";
import { FRAMEWORKS } from "./frameworks";
import { GWG_REQUIREMENTS, GWG_SECTIONS } from "./gwg";
import { HIPAA_REQUIREMENTS, HIPAA_SECTIONS } from "./hipaa";
import { ISO27001_REQUIREMENTS, ISO27001_SECTIONS } from "./iso27001";
import { ISO42001_REQUIREMENTS, ISO42001_SECTIONS } from "./iso42001";
import { KWG_REQUIREMENTS, KWG_SECTIONS } from "./kwg";
import { MICAR_REQUIREMENTS, MICAR_SECTIONS } from "./micar";
import {
	AWV_REQUIREMENTS,
	AWV_SECTIONS,
	DAC8_REQUIREMENTS,
	DAC8_SECTIONS,
	KASSEN_REQUIREMENTS,
	KASSEN_SECTIONS,
} from "./misc-finance";
import { SSPA_REQUIREMENTS, SSPA_SECTIONS } from "./ms-sspa";
import { MVSP_REQUIREMENTS, MVSP_SECTIONS } from "./mvsp";
import { NIS2_REQUIREMENTS, NIS2_SECTIONS } from "./nis2";
import { NIST53_REQUIREMENTS, NIST53_SECTIONS } from "./nist-800-53";
import { NIST171_REQUIREMENTS, NIST171_SECTIONS } from "./nist-800-171";
import { CSF_REQUIREMENTS, CSF_SECTIONS } from "./nist-csf";
import { NYCRR_REQUIREMENTS, NYCRR_SECTIONS } from "./nycrr500";
import { PCI_SECTIONS } from "./pci-dss";
import { PCI_DSS_REQUIREMENTS } from "./pci-saq";
import { SANCTIONS_REQUIREMENTS, SANCTIONS_SECTIONS } from "./sanctions";
import { SOC2_REQUIREMENTS, SOC2_SECTIONS } from "./soc2";
import { TFR_REQUIREMENTS, TFR_SECTIONS } from "./tfr";
import { TISAX_REQUIREMENTS, TISAX_SECTIONS } from "./tisax";
import type {
	CatalogControl,
	CatalogControlMapping,
	CatalogFramework,
	CatalogRequirement,
	CatalogSection,
} from "./types";
import { USDP_REQUIREMENTS, USDP_SECTIONS } from "./us-privacy";
import { ZAG_REQUIREMENTS, ZAG_SECTIONS } from "./zag";
import { ZAG_MARISK_REQUIREMENTS, ZAG_MARISK_SECTIONS } from "./zag-marisk";

// Zusammengesetzter Katalog: jedes Rahmenwerk in frameworks.ts hat seinen
// Anforderungs-Index (P1 ISO/DORA/NIS2, P4 Finanz, P5 DSGVO/KWG/Korridore,
// P6 CRA, SOC 2, CCSS).

const INDICES: Record<
	string,
	{ sections: CatalogSection[]; requirements: CatalogRequirement[] }
> = {
	iso27001: {
		sections: ISO27001_SECTIONS,
		requirements: ISO27001_REQUIREMENTS,
	},
	dora: { sections: DORA_SECTIONS, requirements: DORA_REQUIREMENTS },
	nis2: { sections: NIS2_SECTIONS, requirements: NIS2_REQUIREMENTS },
	micar: { sections: MICAR_SECTIONS, requirements: MICAR_REQUIREMENTS },
	zag: { sections: ZAG_SECTIONS, requirements: ZAG_REQUIREMENTS },
	"zag-marisk": {
		sections: ZAG_MARISK_SECTIONS,
		requirements: ZAG_MARISK_REQUIREMENTS,
	},
	gwg: { sections: GWG_SECTIONS, requirements: GWG_REQUIREMENTS },
	amlr: { sections: AMLR_SECTIONS, requirements: AMLR_REQUIREMENTS },
	tfr: { sections: TFR_SECTIONS, requirements: TFR_REQUIREMENTS },
	sanctions: {
		sections: SANCTIONS_SECTIONS,
		requirements: SANCTIONS_REQUIREMENTS,
	},
	dac8: { sections: DAC8_SECTIONS, requirements: DAC8_REQUIREMENTS },
	awv: { sections: AWV_SECTIONS, requirements: AWV_REQUIREMENTS },
	kassen: { sections: KASSEN_SECTIONS, requirements: KASSEN_REQUIREMENTS },
	dsgvo: { sections: DSGVO_SECTIONS, requirements: DSGVO_REQUIREMENTS },
	kwg: { sections: KWG_SECTIONS, requirements: KWG_REQUIREMENTS },
	cra: { sections: CRA_SECTIONS, requirements: CRA_REQUIREMENTS },
	soc2: { sections: SOC2_SECTIONS, requirements: SOC2_REQUIREMENTS },
	ccss: { sections: CCSS_SECTIONS, requirements: CCSS_REQUIREMENTS },
	"bsi-200-1": {
		sections: BSI_200_1_SECTIONS,
		requirements: BSI_200_1_REQUIREMENTS,
	},
	"bsi-200-2": {
		sections: BSI_200_2_SECTIONS,
		requirements: BSI_200_2_REQUIREMENTS,
	},
	"bsi-200-3": {
		sections: BSI_200_3_SECTIONS,
		requirements: BSI_200_3_REQUIREMENTS,
	},
	"bsi-200-4": {
		sections: BSI_200_4_SECTIONS,
		requirements: BSI_200_4_REQUIREMENTS,
	},
	"pci-dss": { sections: PCI_SECTIONS, requirements: PCI_DSS_REQUIREMENTS },
	iso42001: {
		sections: ISO42001_SECTIONS,
		requirements: ISO42001_REQUIREMENTS,
	},
	tisax: { sections: TISAX_SECTIONS, requirements: TISAX_REQUIREMENTS },
	"eu-us-dpf": { sections: DPF_SECTIONS, requirements: DPF_REQUIREMENTS },
	"cyber-essentials": { sections: CE_SECTIONS, requirements: CE_REQUIREMENTS },
	"essential-eight": { sections: E8_SECTIONS, requirements: E8_REQUIREMENTS },
	"nist-csf": { sections: CSF_SECTIONS, requirements: CSF_REQUIREMENTS },
	"nist-800-53": {
		sections: NIST53_SECTIONS,
		requirements: NIST53_REQUIREMENTS,
	},
	"nist-800-171": {
		sections: NIST171_SECTIONS,
		requirements: NIST171_REQUIREMENTS,
	},
	cmmc: { sections: CMMC_SECTIONS, requirements: CMMC_REQUIREMENTS },
	hipaa: { sections: HIPAA_SECTIONS, requirements: HIPAA_REQUIREMENTS },
	"nycrr-500": { sections: NYCRR_SECTIONS, requirements: NYCRR_REQUIREMENTS },
	ccpa: { sections: CCPA_SECTIONS, requirements: CCPA_REQUIREMENTS },
	"us-privacy": { sections: USDP_SECTIONS, requirements: USDP_REQUIREMENTS },
	"aws-ftr": { sections: FTR_SECTIONS, requirements: FTR_REQUIREMENTS },
	"ms-sspa": { sections: SSPA_SECTIONS, requirements: SSPA_REQUIREMENTS },
	mvsp: { sections: MVSP_SECTIONS, requirements: MVSP_REQUIREMENTS },
	...CORRIDOR_INDICES,
};

export const CATALOG_FRAMEWORKS: CatalogFramework[] = FRAMEWORKS.map(
	(meta) => ({
		...meta,
		sections: INDICES[meta.slug]?.sections ?? [],
		requirements: INDICES[meta.slug]?.requirements ?? [],
	}),
);

export const FRAMEWORK_BY_SLUG: ReadonlyMap<string, CatalogFramework> = new Map(
	CATALOG_FRAMEWORKS.map((f) => [f.slug, f]),
);

export type RequirementKey = `${string}:${string}`;

export function requirementKey(
	framework: string,
	code: string,
): RequirementKey {
	return `${framework}:${code}`;
}

export function splitRequirementKey(key: string): {
	framework: string;
	code: string;
} {
	const idx = key.indexOf(":");
	return { framework: key.slice(0, idx), code: key.slice(idx + 1) };
}

// Alle Anforderungen mit Rahmenwerk-Slug, als flache Liste und als Map.
export const ALL_REQUIREMENTS: (CatalogRequirement & { framework: string })[] =
	CATALOG_FRAMEWORKS.flatMap((f) =>
		f.requirements.map((r) => ({ ...r, framework: f.slug })),
	);

export const REQUIREMENT_BY_KEY: ReadonlyMap<
	string,
	CatalogRequirement & { framework: string }
> = new Map(
	ALL_REQUIREMENTS.map((r) => [requirementKey(r.framework, r.code), r]),
);

// Kanten, gruppiert für schnelle Ableitungen.
export const EDGES: CatalogControlMapping[] = CONTROL_REQUIREMENTS;

export const EDGES_BY_REQUIREMENT: ReadonlyMap<
	string,
	CatalogControlMapping[]
> = groupBy(EDGES, (e) => e.requirement);

export const EDGES_BY_CONTROL: ReadonlyMap<string, CatalogControlMapping[]> =
	groupBy(EDGES, (e) => e.control);

export function frameworksWithIndex(): CatalogFramework[] {
	return CATALOG_FRAMEWORKS.filter((f) => f.requirements.length > 0);
}

export function controlsForFrameworks(
	slugs: readonly string[],
): CatalogControl[] {
	const set = new Set(slugs);
	const codes = new Set<string>();
	for (const e of EDGES) {
		const { framework } = splitRequirementKey(e.requirement);
		if (set.has(framework)) codes.add(e.control);
	}
	return CONTROLS.filter((c) => codes.has(c.code));
}

function groupBy<T>(
	items: readonly T[],
	key: (item: T) => string,
): ReadonlyMap<string, T[]> {
	const map = new Map<string, T[]>();
	for (const item of items) {
		const k = key(item);
		const list = map.get(k);
		if (list) list.push(item);
		else map.set(k, [item]);
	}
	return map;
}

export type {
	CatalogControl,
	CatalogControlMapping,
	CatalogFramework,
	CatalogRequirement,
	CatalogSection,
};
export { BASELINE, CONTROL_BY_CODE, CONTROLS, FRAMEWORKS };
