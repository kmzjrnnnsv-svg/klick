import type {
	ConnectorRequest,
	ConnectorResult,
	VerifyConnector,
} from "@/lib/verify/types";

/**
 * IDnow stub. Real flow:
 *   1) start(): POST /api/v1/{companyid}/identifications → returns transactionId
 *   2) Candidate completes ID check on IDnow's hosted UI
 *   3) Webhook → /api/v1/verify/webhook/idnow → updates `verifications.status`
 *
 * Wiring requires IDNOW_COMPANY_ID + IDNOW_API_KEY (sandbox or prod). Until
 * those env vars are set, this returns `pending` with a TODO message — the
 * Mock connector covers the demo path.
 */
export class IDnowConnector implements VerifyConnector {
	readonly slug = "idnow";
	readonly supports = ["identity"] as const;

	async verify(_input: ConnectorRequest): Promise<ConnectorResult> {
		const hasKey = !!process.env.IDNOW_API_KEY;
		if (!hasKey) {
			return {
				status: "pending",
				message:
					"IDnow-Sandbox noch nicht konfiguriert (IDNOW_COMPANY_ID + IDNOW_API_KEY fehlen). " +
					"Demo läuft über den Mock-Connector.",
			};
		}
		return {
			status: "pending",
			message:
				"IDnow-Transaktion müsste hier gestartet werden — TODO bei Sandbox-Aktivierung.",
		};
	}
}
