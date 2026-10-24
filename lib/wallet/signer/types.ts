// Antworten des Signers (app.sock) als Typen — rein, ohne Socket-Zugriff,
// damit Planung und Anzeige sie ohne Server-Code nutzen können.

export type SignerMeta = { seq: number; head: string };

export type SignerHello = {
	v: number;
	initialized: boolean;
	orgId: string | null;
	rpId: string | null;
	origin: string | null;
	dev: boolean;
	networks: string[];
	frozen: { reason: string; at: number; by: "app" | "admin" } | null;
	policyHash: string | null;
	bundleHash: string | null;
	seq: number;
	head: string;
};

export type SignerIntentView = {
	intentId: string;
	kind: "payout" | "whitelist";
	text: string;
	createdAt: number;
	expiresAt: number;
	approvals: { person: string; at: number }[];
	approvedAt: number | null;
	signableAt: number | null;
	signUntil: number | null;
	activeFrom: number | null;
	cancelled: boolean;
	vetoed: boolean;
	signed: { mode: string; txid: string; fee: string; at: number } | null;
};

export type SignResult = {
	intentId: string;
	mode: "first" | "bump" | "cancel";
	raw: string;
	txid: string;
	fee: string;
	outpoints?: string[];
	changeIndex?: number | null;
	nonce?: string;
};
