import type {
	KeyHolderRole,
	WalletKind,
	WalletPurpose,
	WalletTechnology,
} from "@/db/schema";

// Wallet-Register — reine Regeln (CCSS 1.02, 1.03, 1.06; MiCAR Art. 75).

export type WalletIssue =
	| "quorum_exceeds_signers"
	| "single_signer_client"
	| "single_key_client"
	| "same_site"
	| "holder_not_vetted"
	| "holder_expired"
	| "backup_test_overdue"
	| "backup_test_missing";

type WalletFacts = {
	kind: WalletKind;
	technology: WalletTechnology;
	purpose: WalletPurpose;
	quorumRequired: number;
	quorumTotal: number;
	status: "active" | "retired";
	nextBackupTestDue: string | null;
	lastBackupTestAt: string | null;
};

type HolderFacts = {
	role: KeyHolderRole;
	status: "active" | "revoked";
	siteId: string | null;
	vettedAt: string | null;
	until: string | null;
};

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function walletIssues(
	wallet: WalletFacts,
	holders: readonly HolderFacts[],
	now = new Date(),
): WalletIssue[] {
	if (wallet.status === "retired") return [];
	const today = isoDay(now);
	const issues: WalletIssue[] = [];
	const active = holders.filter((h) => h.status === "active");
	const signers = active.filter((h) => h.role === "signer");
	// Unterverwahrer: Schlüssel liegen beim Dienstleister — Quorum und
	// Inhaber:innen prüft dessen Bewertung, nicht dieses Register.
	const own = wallet.technology !== "sub_custodian";
	if (own && signers.length < wallet.quorumRequired)
		issues.push("quorum_exceeds_signers");
	if (own && wallet.purpose === "client" && wallet.quorumRequired < 2)
		issues.push("single_signer_client");
	if (wallet.purpose === "client" && wallet.technology === "single_key")
		issues.push("single_key_client");
	const sites = new Set(signers.map((h) => h.siteId).filter(Boolean));
	if (
		own &&
		signers.length >= 2 &&
		sites.size === 1 &&
		signers.every((h) => h.siteId)
	)
		issues.push("same_site");
	if (active.some((h) => !h.vettedAt)) issues.push("holder_not_vetted");
	if (active.some((h) => h.until && h.until < today))
		issues.push("holder_expired");
	if (own) {
		if (!wallet.lastBackupTestAt) issues.push("backup_test_missing");
		else if (wallet.nextBackupTestDue && wallet.nextBackupTestDue < today)
			issues.push("backup_test_overdue");
	}
	return issues;
}

// Kalte Wallets halten das meiste Kundenvermögen und werden selten
// angefasst — ihr Wiederherstellungsweg wird öfter geprüft.
export function backupTestIntervalMonths(kind: WalletKind): number {
	return kind === "hot" ? 12 : 6;
}

export function nextBackupTestDue(kind: WalletKind, testedAt: string): string {
	const d = new Date(`${testedAt}T12:00:00Z`);
	d.setUTCMonth(d.getUTCMonth() + backupTestIntervalMonths(kind));
	return isoDay(d);
}

// Nächster Wallet-Code W-01, W-02, …
export function nextWalletCode(existing: readonly string[]): string {
	const max = existing
		.map((c) => /^W-(\d+)$/.exec(c)?.[1])
		.filter((n): n is string => Boolean(n))
		.map(Number)
		.reduce((m, n) => Math.max(m, n), 0);
	return `W-${String(max + 1).padStart(2, "0")}`;
}

// Controls, die das Register belegt (Anzeige auf der Detailseite).
export const CUSTODY_CONTROLS = [
	"CC-CUS-01",
	"CC-CUS-03",
	"CC-KEY-01",
	"CC-KEY-02",
	"CC-KEY-03",
	"CC-KEY-04",
	"CC-KEY-05",
	"CC-CUS-04",
] as const;
