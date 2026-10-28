// Übersicht des Plattform-Admins (rein, getestet in tests/admin-overview.test.ts):
// aus den Rohdaten der Plattform die Liste „Braucht dich“ und die Kacheln mit
// Ampel. Lädt nichts selbst — Lader in lib/db/admin.ts, Anzeige app/(admin)/admin.
import {
	type GrantLike,
	grantState,
	reportOverdue,
} from "@/lib/platform-access/rules";

export type Level = "ok" | "warn" | "bad" | "unknown";

export type OverviewInput = {
	now: Date;
	counts: { organizations: number; users: number };
	newInquiries: number;
	grants: GrantLike[];
	/** null = Job-Tabellen nicht lesbar */
	jobs: { failed24h: number } | null;
	anchor: { createdAt: Date; status: string } | null;
	/** hingenommene Risiken (PROD_ACCEPT_RISKS), z. B. ["no_av"] */
	acceptedRisks: string[];
	/** Orgs mit fälliger Jahresgebühr (bestandenes Audit, noch nicht berechnet) */
	feesDue: number;
	/** gesperrte Orgs */
	suspended: number;
};

export type TodoKey =
	| "inquiries"
	| "reports"
	| "requests"
	| "jobs"
	| "anchor"
	| "risks"
	| "fees";

export type Todo = {
	key: TodoKey;
	level: "warn" | "bad";
	n: number;
	href: string;
};

export type Tile =
	| { key: "orgs"; level: Level; n: number; suspended: number; href: string }
	| { key: "users"; level: "ok"; n: number; href: string }
	| {
			key: "jobs";
			level: Level;
			failed: number | null;
			href: string;
	  }
	| {
			key: "anchor";
			level: Level;
			state: "none" | "confirmed" | "pending" | "stale";
			at: Date | null;
			href: string;
	  }
	| { key: "risks"; level: Level; risks: string[]; href: string }
	| { key: "access"; level: Level; active: number; href: string };

export type Overview = { todos: Todo[]; tiles: Tile[] };

/** Ohne Anker länger als das gilt der Verlauf als nicht verankert. */
export const ANCHOR_STALE_MS = 36 * 60 * 60 * 1000;

const LEVEL_ORDER: Record<Todo["level"], number> = { bad: 0, warn: 1 };

export function buildOverview(input: OverviewInput): Overview {
	const { now } = input;
	const todos: Todo[] = [];

	if (input.newInquiries > 0)
		todos.push({
			key: "inquiries",
			level: "warn",
			n: input.newInquiries,
			href: "/admin/anfragen",
		});

	const overdue = input.grants.filter((g) => reportOverdue(g, now)).length;
	if (overdue > 0)
		todos.push({
			key: "reports",
			level: "bad",
			n: overdue,
			href: "/admin/zugriffe",
		});
	const requested = input.grants.filter(
		(g) => grantState(g, now) === "requested",
	).length;
	if (requested > 0)
		todos.push({
			key: "requests",
			level: "warn",
			n: requested,
			href: "/admin/zugriffe",
		});
	const active = input.grants.filter(
		(g) => grantState(g, now) === "active",
	).length;

	const failed = input.jobs?.failed24h ?? null;
	if (failed && failed > 0)
		todos.push({ key: "jobs", level: "bad", n: failed, href: "/admin" });

	let anchorState: "none" | "confirmed" | "pending" | "stale" = "none";
	let anchorLevel: Level = "warn";
	if (input.anchor) {
		const age = now.getTime() - input.anchor.createdAt.getTime();
		if (age > ANCHOR_STALE_MS) {
			anchorState = "stale";
			anchorLevel = "bad";
			todos.push({ key: "anchor", level: "bad", n: 1, href: "/admin" });
		} else if (input.anchor.status === "confirmed") {
			anchorState = "confirmed";
			anchorLevel = "ok";
		} else {
			anchorState = "pending";
			anchorLevel = "ok";
		}
	}

	if (input.acceptedRisks.length > 0)
		todos.push({
			key: "risks",
			level: "warn",
			n: input.acceptedRisks.length,
			href: "/admin",
		});

	if (input.feesDue > 0)
		todos.push({
			key: "fees",
			level: "warn",
			n: input.feesDue,
			href: "/admin/orgs?status=fee_due",
		});

	todos.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);

	const tiles: Tile[] = [
		{
			key: "orgs",
			level: input.suspended > 0 ? "warn" : "ok",
			n: input.counts.organizations,
			suspended: input.suspended,
			href:
				input.suspended > 0 ? "/admin/orgs?status=suspended" : "/admin/orgs",
		},
		{ key: "users", level: "ok", n: input.counts.users, href: "/admin/users" },
		{
			key: "jobs",
			level: failed === null ? "unknown" : failed > 0 ? "bad" : "ok",
			failed,
			href: "/admin",
		},
		{
			key: "anchor",
			level: anchorLevel,
			state: anchorState,
			at: input.anchor?.createdAt ?? null,
			href: "/admin",
		},
		{
			key: "risks",
			level: input.acceptedRisks.length > 0 ? "warn" : "ok",
			risks: input.acceptedRisks,
			href: "/admin",
		},
		{
			key: "access",
			level: overdue > 0 ? "bad" : active > 0 ? "warn" : "ok",
			active,
			href: "/admin/zugriffe",
		},
	];
	return { todos, tiles };
}
