import { z } from "zod";
import {
	CEREMONY_KINDS,
	KEY_HOLDER_ROLES,
	WALLET_KINDS,
	WALLET_PURPOSES,
	WALLET_TECHNOLOGIES,
} from "@/db/schema/custody";
import { isDecimal } from "@/lib/custody/decimal";
import { responsibleId } from "./responsible";

const optional = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.nullish()
		.transform((v) => (v ? v : null));

const optionalUuid = z
	.union([z.uuid(), z.literal("")])
	.nullish()
	.transform((v) => (v ? v : null));

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum fehlt");
const optionalDate = z
	.union([isoDate, z.literal("")])
	.nullish()
	.transform((v) => (v ? v : null));

// Komma- oder Zeilenliste → eindeutige, getrimmte Werte
const list = (max: number) =>
	z
		.union([z.string(), z.array(z.string())])
		.transform((v) =>
			(Array.isArray(v) ? v : v.split(/[,\n]/))
				.map((x) => x.trim())
				.filter(Boolean),
		)
		.pipe(z.array(z.string().max(40)).max(max))
		.transform((a) => [...new Set(a)]);

// Schlüsselmaterial gehört nie ins Register: 64 Hex-Zeichen (privater
// Schlüssel), WIF/xprv oder 12/24 Wörter (Seed-Phrase) lehnen wir ab.
export function looksLikeKeyMaterial(v: string): boolean {
	const s = v.trim();
	if (/\b(?:0x)?[0-9a-fA-F]{64}\b/.test(s)) return true;
	if (/\b(?:xprv|tprv|yprv|zprv)[1-9A-HJ-NP-Za-km-z]{50,}/.test(s)) return true;
	if (/\b[5KL][1-9A-HJ-NP-Za-km-z]{50,51}\b/.test(s)) return true;
	const words = s.split(/\s+/).filter((w) => /^[a-z]{3,8}$/.test(w));
	return words.length >= 12 && words.length === s.split(/\s+/).length;
}

const noKeyMaterial = (max: number) =>
	optional(max).refine(
		(v) => !v || !looksLikeKeyMaterial(v),
		"Bitte kein Schlüsselmaterial eintragen — nur öffentliche Adressen oder Bezeichnungen.",
	);

export const walletSchema = z
	.object({
		id: z.uuid().optional(),
		name: z.string().trim().min(2, "Bitte einen Namen angeben").max(120),
		kind: z.enum(WALLET_KINDS),
		technology: z.enum(WALLET_TECHNOLOGIES),
		purpose: z.enum(WALLET_PURPOSES),
		networks: list(20),
		assetSymbols: list(40),
		quorumRequired: z.coerce.number().int().min(1).max(20),
		quorumTotal: z.coerce.number().int().min(1).max(20),
		addressLabel: noKeyMaterial(200),
		providerId: optionalUuid,
		hsmAssetId: optionalUuid,
		// Funktion oder Person (lib/validation/responsible.ts)
		ownerUserId: z
			.union([responsibleId, z.literal("")])
			.nullish()
			.transform((v) => (v ? v : null)),
		status: z.enum(["active", "retired"]).default("active"),
		notes: noKeyMaterial(2_000),
	})
	.refine((w) => w.quorumRequired <= w.quorumTotal, {
		path: ["quorumRequired"],
		message: "Das Quorum kann nicht größer sein als die Zahl der Schlüssel.",
	});
export type WalletInput = z.infer<typeof walletSchema>;

export const keyHolderSchema = z
	.object({
		walletId: z.uuid(),
		userId: optionalUuid,
		externalName: optional(120),
		role: z.enum(KEY_HOLDER_ROLES),
		siteId: optionalUuid,
		location: noKeyMaterial(300),
		since: optionalDate,
		until: optionalDate,
		vettedAt: optionalDate,
	})
	.refine((h) => h.userId || h.externalName, {
		path: ["userId"],
		message: "Bitte eine Person wählen oder einen Namen eintragen.",
	});

export const revokeKeyHolderSchema = z.object({
	id: z.uuid(),
	reason: z.string().trim().min(5, "Bitte einen Grund angeben").max(500),
});

export const ceremonySchema = z.object({
	walletId: z.uuid(),
	kind: z.enum(CEREMONY_KINDS),
	heldAt: isoDate,
	participantUserIds: z.array(z.uuid()).max(20).default([]),
	witnesses: optional(300),
	result: z.enum(["pass", "fail"]),
	notes: noKeyMaterial(2_000),
});

const amount = z
	.string()
	.trim()
	.refine(isDecimal, "Betrag mit Punkt oder Komma, ohne Tausendertrennzeichen");

export const reconciliationSchema = z.object({
	day: isoDate,
	lines: z
		.array(
			z.object({
				symbol: z
					.string()
					.trim()
					.toUpperCase()
					.regex(/^[A-Z0-9.]{1,15}$/, "Kürzel wie BTC, ETH, USDC"),
				walletId: optionalUuid,
				onChain: amount,
				ledger: amount,
				tolerance: z
					.string()
					.trim()
					.default("0")
					.transform((v) => v || "0")
					.refine(
						(v) => isDecimal(v) && !v.startsWith("-"),
						"Toleranz als positiver Betrag",
					),
			}),
		)
		.min(1, "Mindestens eine Position")
		.max(100),
	explanation: optional(2_000),
});

export const reviewReconciliationSchema = z.object({
	id: z.uuid(),
	explanation: optional(2_000),
});
