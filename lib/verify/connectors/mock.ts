import type {
	ConnectorRequest,
	ConnectorResult,
	VerifyConnector,
} from "@/lib/verify/types";

/**
 * Deterministic mock that approves all checks unless the candidate's user-id
 * starts with "fail-" (used in dev to drive failure paths). Synchronous; real
 * connectors return pending and complete via webhook.
 */
export class MockVerifyConnector implements VerifyConnector {
	readonly slug = "mock";
	readonly supports = ["identity", "cert", "badge", "employment"] as const;

	async verify(input: ConnectorRequest): Promise<ConnectorResult> {
		// Tiny artificial delay so the UX shows "pending → passed".
		await new Promise((r) => setTimeout(r, 250));

		if (input.context.candidateUserId.startsWith("fail-")) {
			return {
				status: "failed",
				message: `Mock-Verifikation für ${input.kind} bewusst fehlgeschlagen.`,
				evidence: { kind: input.kind, reason: "test-fixture" },
			};
		}

		const messages: Record<typeof input.kind, string> = {
			identity: "Identitätsdokument abgeglichen (Mock).",
			cert: "Zertifikat-Echtheit geprüft (Mock).",
			badge: "Open Badge in Issuer-Registry gefunden (Mock).",
			employment: "Arbeitsverhältnis bestätigt (Mock).",
		};

		return {
			status: "passed",
			message: messages[input.kind],
			evidence: {
				kind: input.kind,
				connector: this.slug,
				vaultItemId: input.vaultItemId,
				verifiedAt: new Date().toISOString(),
			},
		};
	}
}
