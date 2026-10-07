import { AMLR_REQUIREMENTS, AMLR_SECTIONS } from "./amlr";
import { BASELINE } from "./baseline";
import { CONTROL_REQUIREMENTS } from "./control-requirements";
import { CONTROL_BY_CODE, CONTROLS } from "./controls";
import { DORA_REQUIREMENTS, DORA_SECTIONS } from "./dora";
import { FRAMEWORKS } from "./frameworks";
import { GWG_REQUIREMENTS, GWG_SECTIONS } from "./gwg";
import { ISO27001_REQUIREMENTS, ISO27001_SECTIONS } from "./iso27001";
import { MICAR_REQUIREMENTS, MICAR_SECTIONS } from "./micar";
import {
	AWV_REQUIREMENTS,
	AWV_SECTIONS,
	DAC8_REQUIREMENTS,
	DAC8_SECTIONS,
	KASSEN_REQUIREMENTS,
	KASSEN_SECTIONS,
} from "./misc-finance";
import { NIS2_REQUIREMENTS, NIS2_SECTIONS } from "./nis2";
import { SANCTIONS_REQUIREMENTS, SANCTIONS_SECTIONS } from "./sanctions";
import { TFR_REQUIREMENTS, TFR_SECTIONS } from "./tfr";
import type {
	CatalogControl,
	CatalogControlMapping,
	CatalogFramework,
	CatalogRequirement,
	CatalogSection,
} from "./types";
import { ZAG_REQUIREMENTS, ZAG_SECTIONS } from "./zag";
import { ZAG_MARISK_REQUIREMENTS, ZAG_MARISK_SECTIONS } from "./zag-marisk";

// Zusammengesetzter Katalog. Rahmenwerke ohne Index (P5: DSGVO, KWG) tragen
// leere Listen — sie sind wählbar, zeigen aber noch keine Anforderungen.

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
