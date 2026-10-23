import { z } from "zod";
import {
	PAYOUT_SPEEDS,
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

// Hot-Konto: Schlüssel erzeugt der Signer, Klick bekommt nur die xpub
export const hotAccountSchema = z.object({
	name: z.string().trim().min(2, "Name fehlt").max(80),
	network: z.enum(WALLET_NETWORKS),
});

// Zieladresse vorschlagen (Freigabe per Sicherheitsschlüssel, 24 h Wartezeit)
export const proposeDestinationSchema = z.object({
	network: z.enum(WALLET_NETWORKS),
	address: z.string().trim().min(10, "Adresse fehlt").max(120),
	label: z.string().trim().min(2, "Bezeichnung fehlt").max(80),
});

// Veto: jederzeit, nur mit Grund (bremst nur)
export const vetoDestinationSchema = z.object({
	id: z.uuid(),
	reason: z.string().trim().min(3, "Grund fehlt").max(300),
});

// Auszahlung anlegen: Betrag als Dezimaltext (Punkt oder Komma), Ziel nur
// aus dem Adressbuch (aktiv), Gebühren-Tempo
export const payoutSchema = z.object({
	accountId: z.uuid(),
	asset: z.enum(["BTC", "ETH", "USDC", "EURC"]),
	amount: z
		.string()
		.trim()
		.regex(/^\d{1,30}([.,]\d{1,36})?$/, "amount_format"),
	addressBookId: z.uuid(),
	speed: z.enum(PAYOUT_SPEEDS).default("normal"),
});

export const payoutIdSchema = z.object({ id: z.uuid() });

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
