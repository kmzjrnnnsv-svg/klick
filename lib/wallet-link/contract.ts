import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalJson } from "@/lib/audit-hash";
import {
	EVENT_DATA,
	type EventData,
	type EventType,
	isEventType,
	iso,
} from "./events";

// Exportvertrag both.money → Klick, Version 1 (Plan both.money, W4): Umschlag
// je Stapel, Ereignisse in fortlaufender seq je Org, Antwort je Ereignis.
// Klick quittiert unbekannte Typen als „ignored“, gleiche ID mit gleicher
// Prüfsumme als „duplicate“, gleiche ID mit anderer Prüfsumme als „rejected“.

export const CONTRACT = "klick-wallet-link";
export const CONTRACT_VERSION = 1;
export const MAX_BATCH = 200;
export const MAX_BODY_BYTES = 1_000_000;
// Token-Präfix (Klick stellt es aus, gitleaks-Regel klick-token)
export const TOKEN_PREFIX = "klk_wallet_";

const head = {
	contract: z.literal(CONTRACT),
	v: z.literal(CONTRACT_VERSION),
};

// Ereignis im Umschlag: Daten erst je Typ geprüft (parseEventData), damit
// unbekannte Typen eines neueren Senders den Stapel nicht kippen
export const rawEvent = z.object({
	id: z.uuid(),
	seq: z.number().int().min(1),
	type: z
		.string()
		.regex(/^[a-z_]+(\.[a-z_]+)?$/)
		.max(60),
	occurredAt: iso,
	data: z.unknown(),
});
export type RawEvent = z.infer<typeof rawEvent>;

export type WalletEvent = {
	[T in EventType]: {
		id: string;
		seq: number;
		type: T;
		occurredAt: string;
		data: EventData<T>;
	};
}[EventType];

export const batch = z
	.object({
		...head,
		walletOrgId: z.uuid(),
		linkId: z.uuid(),
		batchId: z.uuid(),
		sentAt: iso,
		events: z.array(rawEvent).min(1).max(MAX_BATCH),
	})
	.superRefine((b, ctx) => {
		for (let i = 1; i < b.events.length; i += 1)
			if ((b.events[i]?.seq ?? 0) <= (b.events[i - 1]?.seq ?? 0))
				ctx.addIssue({
					code: "custom",
					path: ["events", i, "seq"],
					message: "seq muss steigen",
				});
		const ids = new Set(b.events.map((e) => e.id));
		if (ids.size !== b.events.length)
			ctx.addIssue({
				code: "custom",
				path: ["events"],
				message: "doppelte id",
			});
	});
export type Batch = z.infer<typeof batch>;

export type ParsedEvent =
	| { ok: true; event: WalletEvent }
	| { ok: false; reason: "unknown_type" }
	| { ok: false; reason: "invalid"; issues: string[] };

export function parseEventData(e: RawEvent): ParsedEvent {
	if (!isEventType(e.type)) return { ok: false, reason: "unknown_type" };
	const parsed = EVENT_DATA[e.type].safeParse(e.data);
	if (!parsed.success)
		return {
			ok: false,
			reason: "invalid",
			issues: parsed.error.issues
				.slice(0, 5)
				.map((i) => `${i.path.join(".")}: ${i.message}`.slice(0, 200)),
		};
	return { ok: true, event: { ...e, data: parsed.data } as WalletEvent };
}

export const RESULTS = [
	"accepted",
	"duplicate",
	"rejected",
	"ignored",
] as const;
export type EventResult = (typeof RESULTS)[number];

export const batchResponse = z.object({
	...head,
	batchId: z.uuid(),
	results: z
		.array(
			z.object({
				id: z.uuid(),
				result: z.enum(RESULTS),
				code: z.string().max(80).optional(),
			}),
		)
		.max(MAX_BATCH),
});
export type BatchResponse = z.infer<typeof batchResponse>;

// Verbindung prüfen (Einstellungen → Compliance-Export): Klick nennt die
// Ziel-Org und den letzten angenommenen Stand, damit nichts doppelt läuft
export const helloRequest = z.object({
	...head,
	walletOrgId: z.uuid(),
	walletOrgName: z.string().max(200),
	linkId: z.uuid(),
	sentAt: iso,
});
export type HelloRequest = z.infer<typeof helloRequest>;

export const helloResponse = z.object({
	...head,
	klickOrg: z.object({ name: z.string().max(200) }),
	linkRef: z.string().max(80),
	lastSeq: z.number().int().min(0).nullable(),
	expiresAt: iso.nullable(),
});
export type HelloResponse = z.infer<typeof helloResponse>;

// Prüfsumme eines Ereignisses: SHA-256 über das kanonische JSON (Schlüssel
// sortiert). Gleiche ID mit anderer Prüfsumme = abgelehnt.
export function eventHash(
	e: Pick<RawEvent, "id" | "seq" | "type" | "occurredAt" | "data">,
): string {
	return createHash("sha256")
		.update(
			canonicalJson({
				id: e.id,
				seq: e.seq,
				type: e.type,
				occurredAt: e.occurredAt,
				data: e.data,
			}),
		)
		.digest("hex");
}
