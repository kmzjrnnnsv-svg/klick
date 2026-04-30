import type { VerificationKind } from "@/db/schema";

export type { VerificationKind } from "@/db/schema";

export type ConnectorContext = {
	tenantId: string;
	candidateUserId: string;
};

export type ConnectorRequest = {
	kind: VerificationKind;
	context: ConnectorContext;
	/** Optional vault item being verified (for cert/badge). */
	vaultItemId?: string;
	/** Optional public URL (e.g. badge JSON-LD URL pasted by candidate). */
	url?: string;
};

export type ConnectorResult = {
	status: "pending" | "passed" | "failed";
	message?: string;
	evidence?: Record<string, unknown>;
};

export interface VerifyConnector {
	readonly slug: string;
	readonly supports: ReadonlyArray<VerificationKind>;
	verify(input: ConnectorRequest): Promise<ConnectorResult>;
}
