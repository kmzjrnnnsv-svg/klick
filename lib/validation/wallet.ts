import { z } from "zod";
import {
	WALLET_ACCOUNT_PURPOSES,
	type WalletAccountPurpose,
} from "@/db/schema/wallet";
import { PAIRS } from "@/lib/wallet/core/feeds";
import { WALLET_NETWORKS } from "@/lib/wallet/core/networks";
import { INTRO_STEPS } from "@/lib/wallet/intro";

// Wallet-Bereich: Konto aus einem öffentlichen Kontoschlüssel anlegen,
// Empfangsadressen ausgeben. Private Schlüssel lehnt schon das Format ab
// (nur xpub/ypub/zpub/tpub/upub/vpub), parseAccountKey prüft danach Netz,
// Ebene und Art.

const optionalUuid = z
	.union([z.uuid(), z.literal("")])
	.nullish()
	.transform((v) => (v ? v : null));

const optionalDate = z
	.union([
		z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum fehlt"),
		z.literal(""),
	])
	.nullish()
	.transform((v) => (v ? v : null));

export const walletAccountSchema = z.object({
	name: z.string().trim().min(2, "Name fehlt").max(80),
	network: z.enum(WALLET_NETWORKS),
	accountKey: z
		.string()
		.trim()
		.max(140)
		.regex(
			/^[xyztuv]pub[1-9A-HJ-NP-Za-km-z]{100,}$/,
			"Bitte den öffentlichen Kontoschlüssel (xpub, zpub, tpub oder vpub) einfügen.",
		),
	purpose: z
		.enum(WALLET_ACCOUNT_PURPOSES)
		.default("own" satisfies WalletAccountPurpose),
	// Verlauf ab (für bestehende Wallets mit früheren Zahlungen)
	historyFrom: optionalDate,
	custodyWalletId: optionalUuid,
});

export const walletAccountUpdateSchema = z.object({
	id: z.uuid(),
	name: z.string().trim().min(2, "Name fehlt").max(80),
	custodyWalletId: optionalUuid,
});

export const receiveAddressSchema = z.object({
	accountId: z.uuid(),
	label: z
		.string()
		.trim()
		.max(80)
		.nullish()
		.transform((v) => (v ? v : null)),
});

export const accountIdSchema = z.object({ id: z.uuid() });

export const watchlistSchema = z.object({
	pairs: z
		.array(z.enum(PAIRS))
		.min(1, "Mindestens ein Kurs")
		.max(PAIRS.length)
		.transform((a) => [...new Set(a)]),
});

export const introStepSchema = z.object({ step: z.enum(INTRO_STEPS) });
