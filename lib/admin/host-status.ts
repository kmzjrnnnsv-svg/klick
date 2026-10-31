// Server-Status für Admin > Betrieb (Admin-Portal, Teil 5), rein und getestet
// in tests/admin-host-status.test.ts. Die App hat kein root: das Skript
// scripts/host-health.sh (klick-health.timer, stündlich als root) schreibt
// /var/lib/klick-health/status.json (Gruppe klick, 0640), die App liest nur.
// Fremde Eingabe: Schema mit Grenzen, alles Unbekannte fällt heraus.
import { z } from "zod";
import type { Level } from "@/lib/admin/overview";

const ts = z
	.string()
	.max(40)
	.transform((s) => new Date(s))
	.refine((d) => !Number.isNaN(d.getTime()));
const optTs = z
	.union([z.literal(""), z.null(), ts])
	.optional()
	.transform((v) => (v instanceof Date ? v : null));
const text = z.string().max(300);

const unitResult = z.object({
	name: z.string().max(80),
	result: z.string().max(40).optional().default(""),
	at: optTs,
});

export const hostStatusSchema = z.object({
	version: z.literal(1),
	checkedAt: ts,
	problems: z.array(text).max(100).default([]),
	disks: z
		.array(
			z.object({
				mount: z.string().max(200),
				usedPct: z.number().int().min(0).max(100),
			}),
		)
		.max(50)
		.default([]),
	memory: z
		.object({
			totalMb: z.number().int().min(0),
			availableMb: z.number().int().min(0),
		})
		.nullable()
		.default(null),
	updates: z
		.object({
			total: z.number().int().min(0),
			security: z.number().int().min(0),
		})
		.nullable()
		.default(null),
	rebootRequired: z.boolean().default(false),
	certs: z
		.array(z.object({ name: z.string().max(200), notAfter: ts }))
		.max(50)
		.default([]),
	services: z
		.array(
			z.object({
				name: z.string().max(80),
				active: z.string().max(40),
				enabled: z.string().max(40),
			}),
		)
		.max(50)
		.default([]),
	units: z.array(unitResult).max(20).default([]),
	crowdsecBans: z.number().int().min(0).nullable().default(null),
});

export type HostStatus = z.infer<typeof hostStatusSchema>;

/** Höchstens so groß darf die Datei sein (Schutz vor Unsinn auf der Platte). */
export const HOST_STATUS_MAX_BYTES = 256 * 1024;

export function parseHostStatus(raw: string): HostStatus | null {
	if (raw.length > HOST_STATUS_MAX_BYTES) return null;
	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch {
		return null;
	}
	const parsed = hostStatusSchema.safeParse(json);
	return parsed.success ? parsed.data : null;
}

/** Dienste, die auf dem App-Server laufen sollen, falls installiert. */
export const WATCHED_SERVICES = [
	"klick",
	"both",
	"klick-signer",
	"nginx",
	"postgresql",
	"wg-quick@wg-admin",
	"crowdsec",
	"clamav-daemon",
] as const;

/** Prüf- und Sicherungsläufe (oneshot), deren letztes Ergebnis zählt. */
export const WATCHED_UNITS = {
	"klick-backup-db": 26,
	"klick-backup-objects": 26,
	"klick-backup-verify": 8 * 24,
	"klick-aide": 26,
} as const satisfies Record<string, number>;

export type HostCheckKey =
	| "fresh"
	| "disk"
	| "memory"
	| "updates"
	| "reboot"
	| "certs"
	| "services"
	| "backup"
	| "aide"
	| "crowdsec";

export type HostCheck = {
	key: HostCheckKey;
	level: Level;
	/** Werte für den Text (Zahl, Datum, Namen) */
	values: Record<string, string | number | Date>;
};

const H = 60 * 60 * 1000;
const D = 24 * H;
const ENABLED = new Set([
	"enabled",
	"enabled-runtime",
	"static",
	"indirect",
	"alias",
]);

export const worst = (levels: Level[]): Level =>
	levels.includes("bad")
		? "bad"
		: levels.includes("warn")
			? "warn"
			: levels.includes("unknown") && !levels.includes("ok")
				? "unknown"
				: "ok";

export function hostChecks(s: HostStatus, now: Date): HostCheck[] {
	const out: HostCheck[] = [];
	const age = now.getTime() - s.checkedAt.getTime();
	out.push({
		key: "fresh",
		level: age > 6 * H ? "bad" : age > 2 * H ? "warn" : "ok",
		values: { at: s.checkedAt },
	});

	const fullest = [...s.disks].sort((a, b) => b.usedPct - a.usedPct)[0];
	out.push({
		key: "disk",
		level: !fullest
			? "unknown"
			: fullest.usedPct >= 90
				? "bad"
				: fullest.usedPct >= 80
					? "warn"
					: "ok",
		values: fullest ? { mount: fullest.mount, pct: fullest.usedPct } : {},
	});

	if (s.memory && s.memory.totalMb > 0) {
		const free = s.memory.availableMb / s.memory.totalMb;
		out.push({
			key: "memory",
			level: free < 0.05 ? "bad" : free < 0.12 ? "warn" : "ok",
			values: {
				available: s.memory.availableMb,
				total: s.memory.totalMb,
			},
		});
	} else out.push({ key: "memory", level: "unknown", values: {} });

	out.push({
		key: "updates",
		level: !s.updates ? "unknown" : s.updates.security > 0 ? "warn" : "ok",
		values: s.updates
			? { total: s.updates.total, security: s.updates.security }
			: {},
	});

	out.push({
		key: "reboot",
		level: s.rebootRequired ? "warn" : "ok",
		values: {},
	});

	const soonest = [...s.certs].sort(
		(a, b) => a.notAfter.getTime() - b.notAfter.getTime(),
	)[0];
	if (soonest) {
		const days = Math.floor((soonest.notAfter.getTime() - now.getTime()) / D);
		out.push({
			key: "certs",
			level: days < 14 ? "bad" : days < 30 ? "warn" : "ok",
			values: { name: soonest.name, days, date: soonest.notAfter },
		});
	} else out.push({ key: "certs", level: "unknown", values: {} });

	const installed = s.services.filter((x) => ENABLED.has(x.enabled));
	const down = installed.filter((x) => x.active !== "active");
	out.push({
		key: "services",
		level: installed.length === 0 ? "unknown" : down.length > 0 ? "bad" : "ok",
		values: {
			running: installed.length - down.length,
			total: installed.length,
			down: down.map((x) => x.name).join(", "),
		},
	});

	const unitLevel = (name: keyof typeof WATCHED_UNITS): Level => {
		const u = s.units.find((x) => x.name === name);
		if (!u?.at) return "unknown";
		if (u.result && u.result !== "success") return "bad";
		return now.getTime() - u.at.getTime() > WATCHED_UNITS[name] * H
			? "bad"
			: "ok";
	};
	const backupDb = s.units.find((u) => u.name === "klick-backup-db");
	out.push({
		key: "backup",
		level: worst([
			unitLevel("klick-backup-db"),
			unitLevel("klick-backup-objects"),
			unitLevel("klick-backup-verify"),
		]),
		values: backupDb?.at ? { at: backupDb.at } : {},
	});
	const aide = s.units.find((u) => u.name === "klick-aide");
	out.push({
		key: "aide",
		level: unitLevel("klick-aide"),
		values: aide?.at ? { at: aide.at } : {},
	});
	out.push({
		key: "crowdsec",
		level:
			s.crowdsecBans === null
				? "unknown"
				: s.crowdsecBans > 200
					? "warn"
					: "ok",
		values: s.crowdsecBans === null ? {} : { bans: s.crowdsecBans },
	});
	return out;
}

/** Gesamtstand für die Übersicht: gemeldete Probleme zählen wie „rot“. */
export function hostLevel(s: HostStatus | null, now: Date): Level {
	if (!s) return "unknown";
	const levels = hostChecks(s, now).map((c) => c.level);
	if (s.problems.length > 0) levels.push("bad");
	return worst(levels);
}
