import { z } from "zod";
import { parseCidr } from "@/lib/net/ip";
import {
	MAX_NETWORK_ENTRIES,
	NETWORK_EXCEPTIONS,
} from "@/lib/net/network-policy";

// Einstellungen > Netzwerk (Härtung A5): IP-Liste der Organisation.

const entry = z.object({
	cidr: z
		.string()
		.trim()
		.min(1)
		.max(64)
		.refine((v) => parseCidr(v) !== null, "cidr"),
	note: z.string().trim().max(120).default(""),
});

export const networkPolicySchema = z.object({
	members: z.array(entry).max(MAX_NETWORK_ENTRIES),
	externals: z.array(entry).max(MAX_NETWORK_ENTRIES).nullable(),
	exceptions: z.object(
		Object.fromEntries(NETWORK_EXCEPTIONS.map((k) => [k, z.boolean()])) as {
			[K in (typeof NETWORK_EXCEPTIONS)[number]]: z.ZodBoolean;
		},
	),
});
