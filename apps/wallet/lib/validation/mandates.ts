import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/server";
import { WALLET_ASSET_CODES } from "@wallet/lib/orgs/access-policy";
import { z } from "zod";
import type { AssetCode } from "@/lib/wallet/core/assets";
import {
	MANDATE_MAX_DAYS,
	MANDATE_MAX_DESTINATIONS,
} from "@/lib/wallet/core/mandate";
import {
	WALLET_NETWORKS,
	type WalletNetwork,
} from "@/lib/wallet/core/networks";

// Vollmacht ausstellen (Härtung W): Beträge als Dezimaltext in der Einheit
// des Assets, Ziele als Einträge des Adressbuchs, Dauer in Tagen

const amount = z
	.string()
	.trim()
	.regex(/^\d{1,30}([.,]\d{1,18})?$/, "amount");

export const mandateSchema = z.object({
	granteeUserId: z.uuid(),
	network: z.enum(WALLET_NETWORKS),
	asset: z.enum(WALLET_ASSET_CODES),
	perPayout: amount,
	total: amount,
	destinationIds: z
		.array(z.uuid())
		.min(1, "destinations")
		.max(MANDATE_MAX_DESTINATIONS, "destinations"),
	days: z.coerce.number().int().min(1).max(MANDATE_MAX_DAYS),
});
export type MandateInput = z.infer<typeof mandateSchema>;

export const revokeMandateSchema = z.object({
	id: z.uuid(),
	reason: z.string().trim().min(3).max(300),
});

// Antwort von „Vorbereiten“: Optionen für den Sicherheitsschlüssel und die
// Zusammenfassung, die vor dem Unterschreiben angezeigt wird
export type PreparedMandate = {
	options: PublicKeyCredentialRequestOptionsJSON;
	summary: {
		grantee: string;
		asset: AssetCode;
		network: WalletNetwork;
		perPayout: string;
		total: string;
		destinations: string[];
		validUntil: string;
	};
};
