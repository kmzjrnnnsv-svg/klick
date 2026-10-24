import { z } from "zod";
import { WALLET_NETWORKS } from "@/lib/wallet/core/networks";
import {
	ADDRESS_BOOK_STATUS,
	PAYOUT_SPEEDS,
	PAYOUT_STATUS,
	SCREENING_RESULTS,
	TRANSFER_STATUS,
	WALLET_ACCOUNT_KINDS,
	WALLET_ACCOUNT_PURPOSES,
} from "@/lib/wallet/model";

// Ereignisse des Exportvertrags both.money → Klick (Plan both.money, W4),
// Version 1. Gemeinsam für beide Seiten, pure. Beträge in Basiseinheiten als
// Dezimaltext, Zeiten als ISO-8601 (UTC). Zustands-Ereignisse („…upserted“)
// tragen `rev` — die neuere Fassung einer Entität gewinnt. Erweitern nur
// additiv (neue Typen, neue optionale Felder); alles andere = Version 2.

export const iso = z.iso.datetime({ offset: true });
export const baseUnits = z.string().regex(/^\d{1,78}$/, "Basiseinheiten");
const id = z.uuid();
const text = (max = 200) => z.string().max(max);
const nullable = <T extends z.ZodType>(t: T) => t.nullable();
const network = z.enum(WALLET_NETWORKS);
const asset = z.enum(["BTC", "ETH", "USDC", "EURC"]);
const rev = z.number().int().min(1);

export const CUSTODY_MODES = ["none", "own", "licensed"] as const;

export const orgUpdated = z.object({
	org: z.object({ id, name: text(), slug: text(60) }),
	custodyMode: z.enum(CUSTODY_MODES),
	isOperator: z.boolean(),
	caspLicenceRef: nullable(text()),
	rev,
});

// Ohne Kontoschlüssel (xpub): Klick braucht ihn nicht und soll ihn nie halten
export const accountUpserted = z.object({
	account: z.object({
		id,
		name: text(),
		network,
		kind: z.enum(WALLET_ACCOUNT_KINDS),
		purpose: z.enum(WALLET_ACCOUNT_PURPOSES),
		keyFingerprint: z.string().regex(/^[0-9a-f]{8}$/),
		firstAddress: nullable(text(120)),
		status: z.enum(["active", "retired"]),
		createdAt: iso,
	}),
	rev,
});

export const transferUpserted = z.object({
	transfer: z.object({
		id,
		accountId: id,
		network,
		direction: z.enum(["in", "out"]),
		asset,
		amount: baseUnits,
		txid: text(130),
		outputRef: text(80),
		address: text(120),
		counterparty: nullable(text(120)),
		blockHeight: nullable(z.number().int().min(0)),
		blockHash: nullable(text(130)),
		blockTime: nullable(iso),
		confirmations: z.number().int().min(0),
		status: z.enum(TRANSFER_STATUS),
		screening: z.enum(SCREENING_RESULTS),
		frozen: z.boolean(),
		payoutId: nullable(id),
		firstSeenAt: iso,
		confirmedAt: nullable(iso),
	}),
	rev,
});

export const payoutUpserted = z.object({
	payout: z.object({
		id,
		accountId: id,
		network,
		asset,
		amount: baseUnits,
		destination: text(120),
		destinationLabel: text(),
		speed: z.enum(PAYOUT_SPEEDS),
		status: z.enum(PAYOUT_STATUS),
		intentId: text(80),
		feeCap: baseUnits,
		fee: nullable(baseUnits),
		txid: nullable(text(130)),
		txids: z.array(text(130)).max(50),
		createdAt: iso,
		approvedAt: nullable(iso),
		signedAt: nullable(iso),
		broadcastAt: nullable(iso),
		confirmedAt: nullable(iso),
	}),
	rev,
});

export const destinationUpserted = z.object({
	destination: z.object({
		id,
		network,
		address: text(120),
		label: text(),
		status: z.enum(ADDRESS_BOOK_STATUS),
		screening: z.enum(SCREENING_RESULTS),
		approvedAt: nullable(iso),
		activeFrom: nullable(iso),
		vetoedAt: nullable(iso),
		vetoReason: nullable(text(300)),
		createdAt: iso,
	}),
	rev,
});

const balance = z.object({ confirmed: baseUnits, pending: baseUnits });

// Tagesabschluss (00:10 Uhr Berlin): Knotenstand je Konto mit Blockhöhe und
// Hash — Grundlage der Abstimmung in Klick
export const dayClosed = z.object({
	date: z.iso.date(),
	timeZone: z.literal("Europe/Berlin"),
	closedAt: iso,
	accounts: z
		.array(
			z.object({
				accountId: id,
				network,
				balances: z.partialRecord(asset, balance),
				height: nullable(z.number().int().min(0)),
				hash: nullable(text(130)),
				at: nullable(iso),
				frozen: z.partialRecord(asset, baseUnits),
			}),
		)
		.max(500),
	screening: z.object({
		clear: z.number().int().min(0),
		hit: z.number().int().min(0),
		unchecked: z.number().int().min(0),
	}),
});

// Signer-Zeremonie: Richtlinie, aktive Sicherheitsschlüssel, Netze — nie
// Schlüsselmaterial
export const ceremonyRecorded = z.object({
	recordedAt: iso,
	reason: z.enum(["initialised", "policy_changed", "keys_changed"]),
	policy: z.object({
		version: z.number().int().min(0),
		mode: text(40),
		hash: nullable(text(130)),
	}),
	keys: z.object({
		active: z.number().int().min(0),
		persons: z.number().int().min(0),
	}),
	networks: z.array(network).max(10),
	fingerprints: z.partialRecord(network, z.string().regex(/^[0-9a-f]{8}$/)),
});

export const screeningListUpdated = z.object({
	source: z.enum(["ofac"]),
	listVersion: text(),
	total: z.number().int().min(0),
	importedAt: iso,
});

// Auffälligkeiten. Zuordnung in Klick (Plan both.money): Vorfall,
// Verdachtsmeldung oder Aufgabe — je Code, nicht je Text.
export const ALERT_CODES = [
	"unknown_spend",
	"journal_regressed",
	"sanctions_hit",
	"manual_stop",
	"signer_frozen",
	"signer_unreachable",
	"node_mismatch",
] as const;
export type AlertCode = (typeof ALERT_CODES)[number];

export const alertRaised = z.object({
	alertId: text(120),
	code: z.enum(ALERT_CODES),
	severity: z.enum(["critical", "high", "medium"]),
	title: text(),
	detail: text(1000),
	subject: nullable(
		z.object({
			kind: z.enum(["account", "transfer", "payout", "destination", "signer"]),
			id: text(120),
		}),
	),
	raisedAt: iso,
});

export const alertResolved = z.object({
	alertId: text(120),
	code: z.enum(ALERT_CODES),
	resolvedAt: iso,
	note: nullable(text(300)),
});

export const heartbeat = z.object({
	at: iso,
	signer: z.enum([
		"off",
		"ready",
		"frozen",
		"unreachable",
		"uninitialized",
		"other_org",
	]),
	nodes: z
		.array(
			z.object({
				network,
				height: nullable(z.number().int().min(0)),
				syncedAt: nullable(iso),
			}),
		)
		.max(10),
	pending: z.number().int().min(0),
});

export const EVENT_DATA = {
	"org.updated": orgUpdated,
	"account.upserted": accountUpserted,
	"transfer.upserted": transferUpserted,
	"payout.upserted": payoutUpserted,
	"destination.upserted": destinationUpserted,
	"day.closed": dayClosed,
	"ceremony.recorded": ceremonyRecorded,
	"screening.list_updated": screeningListUpdated,
	"alert.raised": alertRaised,
	"alert.resolved": alertResolved,
	heartbeat,
} as const;

export type EventType = keyof typeof EVENT_DATA;
export const EVENT_TYPES = Object.keys(EVENT_DATA) as EventType[];
export type EventData<T extends EventType> = z.infer<(typeof EVENT_DATA)[T]>;

export const isEventType = (v: string): v is EventType => v in EVENT_DATA;

// Severity und Titel je Code (both.money erzeugt, Klick ordnet zu)
export const ALERT_SEVERITY: Record<AlertCode, "critical" | "high" | "medium"> =
	{
		unknown_spend: "critical",
		journal_regressed: "critical",
		sanctions_hit: "critical",
		manual_stop: "high",
		signer_frozen: "high",
		signer_unreachable: "high",
		node_mismatch: "high",
	};
