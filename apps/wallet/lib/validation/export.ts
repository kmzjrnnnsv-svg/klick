import { z } from "zod";
import { TOKEN_PREFIX } from "@/lib/wallet-link/contract";

// Compliance-Export nach Klick (Einstellungen → Compliance-Export)

// Klick stellt Tokens als klk_wallet_<32 Byte base64url> aus
export const LINK_TOKEN_RE = new RegExp(
	`^${TOKEN_PREFIX}[A-Za-z0-9_-]{32,128}$`,
);

export const linkToken = z
	.string()
	.trim()
	.regex(LINK_TOKEN_RE, "Token aus Klick (beginnt mit klk_wallet_)");

export const createLinkSchema = z.object({
	origin: z.string().trim().min(1).max(200),
	token: linkToken,
	// null = alle Konten, auch künftige
	accountIds: z.array(z.uuid()).min(1).max(200).nullable(),
	// Nachlieferung der Bewegungen und Auszahlungen ab diesem Tag (Berlin);
	// null = alles
	backfillFrom: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.nullable(),
});
export type CreateLinkInput = z.infer<typeof createLinkSchema>;

export const renewTokenSchema = z.object({
	linkId: z.uuid(),
	token: linkToken,
});
