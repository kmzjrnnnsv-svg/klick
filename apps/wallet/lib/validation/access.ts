import { WALLET_ASSET_CODES } from "@wallet/lib/orgs/access-policy";
import { z } from "zod";
import { parseCidr } from "@/lib/net/ip";
import { MAX_NETWORK_ENTRIES } from "@/lib/net/network-policy";

// Einstellungen > Zugang (Härtung W): IP-Liste, nur Sicherheitsschlüssel,
// erlaubte Assets, Vollmacht für die Bedienung

export const accessPolicySchema = z.object({
	network: z
		.array(
			z.object({
				cidr: z
					.string()
					.trim()
					.max(64)
					.refine((v) => parseCidr(v) !== null, "cidr"),
				note: z.string().trim().max(120).default(""),
			}),
		)
		.max(MAX_NETWORK_ENTRIES),
	securityKeysOnly: z.boolean(),
	// null = alle Assets; sonst mindestens eins
	allowedAssets: z.array(z.enum(WALLET_ASSET_CODES)).min(1).max(4).nullable(),
	mandatesRequired: z.boolean(),
});
export type AccessPolicyInput = z.infer<typeof accessPolicySchema>;
