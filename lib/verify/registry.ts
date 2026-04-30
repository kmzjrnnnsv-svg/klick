import { CredlyConnector } from "@/lib/verify/connectors/credly";
import { IDnowConnector } from "@/lib/verify/connectors/idnow";
import { MockVerifyConnector } from "@/lib/verify/connectors/mock";
import type { VerificationKind, VerifyConnector } from "@/lib/verify/types";

const connectors: VerifyConnector[] = [
	new MockVerifyConnector(),
	new CredlyConnector(),
	new IDnowConnector(),
];

export function getConnector(slug: string): VerifyConnector | null {
	return connectors.find((c) => c.slug === slug) ?? null;
}

/**
 * Pick the active connector for a given kind. In dev / when external
 * providers aren't configured, this falls back to the Mock connector so the
 * UX path always works end-to-end.
 *
 * Override per-tenant by inserting into `connector_definitions` (P7).
 */
export function pickConnectorForKind(kind: VerificationKind): VerifyConnector {
	if (kind === "identity") {
		const idnow = getConnector("idnow");
		if (idnow && process.env.IDNOW_API_KEY) return idnow;
		return getConnector("mock") as VerifyConnector;
	}
	if (kind === "badge") {
		// Credly requires a URL on the request; if none, fall back to mock.
		return getConnector("credly") as VerifyConnector;
	}
	return getConnector("mock") as VerifyConnector;
}

export function listConnectors(): { slug: string; supports: string[] }[] {
	return connectors.map((c) => ({
		slug: c.slug,
		supports: [...c.supports],
	}));
}
