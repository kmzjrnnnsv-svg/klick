import type {
	ConnectorRequest,
	ConnectorResult,
	VerifyConnector,
} from "@/lib/verify/types";

/**
 * Credly connector. Two paths:
 * 1) Partner OAuth (TODO: requires Credly partner status — placeholder).
 * 2) Public JSON-LD URL fallback. Every Credly badge has a public URL like
 *    https://api.credly.com/v1/obi/v2/badges/{uuid}.json — we fetch and
 *    validate basic OBI structure.
 *
 * Currently only the JSON-LD path is wired; if no URL is provided we return
 * `pending` with a message asking for the badge URL.
 */
export class CredlyConnector implements VerifyConnector {
	readonly slug = "credly";
	readonly supports = ["badge"] as const;

	async verify(input: ConnectorRequest): Promise<ConnectorResult> {
		if (input.kind !== "badge") {
			return { status: "failed", message: "Credly unterstützt nur 'badge'" };
		}
		if (!input.url) {
			return {
				status: "pending",
				message:
					"Bitte öffentliche Credly-Badge-URL hinterlegen (JSON-LD). Partner-OAuth folgt mit Credly-Partner-Status.",
			};
		}

		try {
			const res = await fetch(input.url, {
				headers: { Accept: "application/json" },
			});
			if (!res.ok) {
				return {
					status: "failed",
					message: `Credly-Badge nicht erreichbar (${res.status})`,
				};
			}
			const json = (await res.json()) as Record<string, unknown>;
			// OBI 2.0: top-level should have 'type' or 'badge_template' for Credly
			if (!json.type && !json.badge_template && !json.id) {
				return {
					status: "failed",
					message: "Antwort enthält keine erkennbare Badge-Struktur",
				};
			}
			return {
				status: "passed",
				message: "Credly-Badge öffentlich geprüft (JSON-LD).",
				evidence: { url: input.url, payload: json },
			};
		} catch (e) {
			return {
				status: "failed",
				message: `Credly-Badge-Abruf fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`,
			};
		}
	}
}
