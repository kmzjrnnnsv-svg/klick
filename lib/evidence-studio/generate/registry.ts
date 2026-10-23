import { abweichungen } from "../kinds/abweichungen";
import { auditbericht } from "../kinds/auditbericht";
import { auditprogramm } from "../kinds/auditprogramm";
import { behandlungsplan } from "../kinds/behandlungsplan";
import { beschluesse } from "../kinds/beschluesse";
import { bestellung } from "../kinds/bestellung";
import { dokumentenlenkung } from "../kinds/dokumentenlenkung";
import { findings } from "../kinds/findings";
import { kenntnisnahme } from "../kinds/kenntnisnahme";
import { kommunikation } from "../kinds/kommunikation";
import { kompetenz } from "../kinds/kompetenz";
import { kontext } from "../kinds/kontext";
import { leitlinie } from "../kinds/leitlinie";
import { managementbewertung } from "../kinds/managementbewertung";
import { messung } from "../kinds/messung";
import { organigramm } from "../kinds/organigramm";
import { parteien } from "../kinds/parteien";
import { prozesslandkarte } from "../kinds/prozesslandkarte";
import { raci } from "../kinds/raci";
import { richtlinien } from "../kinds/richtlinien";
import { risikobeurteilung } from "../kinds/risikobeurteilung";
import { risikomethodik } from "../kinds/risikomethodik";
import { rollen } from "../kinds/rollen";
import { scope } from "../kinds/scope";
import { soa } from "../kinds/soa";
import { testprogramm } from "../kinds/testprogramm";
import { wirksamkeit } from "../kinds/wirksamkeit";
import { ziele } from "../kinds/ziele";
import type { Generator } from "./types";

// Nachweisarten, die Klick selbst erzeugen kann (lib/evidence-studio/kinds)
const ALL: readonly Generator[] = [
	kontext,
	parteien,
	scope,
	prozesslandkarte,
	raci,
	rollen,
	organigramm,
	bestellung,
	beschluesse,
	kommunikation,
	leitlinie,
	risikomethodik,
	risikobeurteilung,
	behandlungsplan,
	soa,
	ziele,
	messung,
	kompetenz,
	dokumentenlenkung,
	richtlinien,
	kenntnisnahme,
	auditprogramm,
	auditbericht,
	findings,
	managementbewertung,
	testprogramm,
	abweichungen,
	wirksamkeit,
];

export const GENERATORS: ReadonlyMap<string, Generator> = new Map(
	ALL.map((g) => [g.code, g]),
);

export const canGenerate = (code: string): boolean => GENERATORS.has(code);
