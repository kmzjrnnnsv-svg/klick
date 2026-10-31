// Probe-Anmeldung (AP10b), rein: Fehler aus dem Rückruf in eine Ursache in
// Klartext übersetzen. Das Plugin leitet bei Fehlern mit `error` und
// `error_description` an die Probe-Seite (errorCallbackURL) weiter.

export const PROBE_ERRORS = [
	"audience",
	"recipient",
	"signature",
	"expired",
	"clock",
	"replay",
	"state",
	"algorithm",
	"domain",
	"invalid",
	"other",
] as const;
export type ProbeError = (typeof PROBE_ERRORS)[number];

export function probeErrorKey(
	error: string | null | undefined,
	description: string | null | undefined,
): ProbeError | null {
	if (!error || error === "SSO_PROBE_DONE") return null;
	const d = (description ?? "").toLowerCase();
	switch (error) {
		case "algorithm":
		case "SAML_ALGORITHM_NOT_ALLOWED":
			return "algorithm";
		case "replay_detected":
			return "replay";
		case "invalid_state":
			return "state";
		case "SSO_DOMAIN_MISMATCH":
			return "domain";
		case "invalid_saml_response":
			if (d.includes("audience")) return "audience";
			if (d.includes("recipient") || d.includes("destination"))
				return "recipient";
			if (d.includes("signature")) return "signature";
			if (d.includes("expired")) return "expired";
			if (d.includes("not yet valid") || d.includes("timestamp"))
				return "clock";
			return "invalid";
		default:
			return "other";
	}
}
