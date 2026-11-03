import { BACKUP } from "./templates/backup";
import { DIENSTLEISTER } from "./templates/dienstleister";
import { ENDGERAETE } from "./templates/endgeraete";
import { ISMS_LEITLINIE } from "./templates/isms-leitlinie";
import { LOESCHUNG } from "./templates/loeschung";
import { LOGGING } from "./templates/logging";
import { PATCH } from "./templates/patch";
import { PERSONAL } from "./templates/personal";
import { VORFALL } from "./templates/vorfall";
import { ZUGANG } from "./templates/zugang";
import type { PolicyBuilder } from "./types";

// Vorlagen mit Baukasten (Teil 5): Fragen je Abschnitt statt leerem Gerüst.
// Die übrigen Vorlagen bleiben Gerüst (mit KI-Entwurf, falls freigeschaltet).
// Neue Vorlage ⇒ Datei unter templates/, Eintrag hier, Test policy-builder.

export const POLICY_BUILDERS: readonly PolicyBuilder[] = [
	ISMS_LEITLINIE,
	ZUGANG,
	ENDGERAETE,
	PATCH,
	BACKUP,
	VORFALL,
	DIENSTLEISTER,
	PERSONAL,
	LOESCHUNG,
	LOGGING,
];

const BY_CODE = new Map(POLICY_BUILDERS.map((b) => [b.code, b]));

export function builderFor(
	templateCode: string | null | undefined,
): PolicyBuilder | null {
	return templateCode ? (BY_CODE.get(templateCode) ?? null) : null;
}
