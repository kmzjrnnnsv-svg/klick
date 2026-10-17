import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { member } from "@/db/auth-schema";
import { orgSettings } from "@/db/schema";
import { type OrgContext, toOrgCtx } from "@/lib/auth/guards";
import { normalizeRole } from "@/lib/auth/session-rules";
import { mutateOrg, readOrg } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";
import { withDlpDefaults } from "./policy";

// Abfluss-Überwachung (DLP): Downloads und Exporte je Person in einem
// gleitenden Fenster. Über der Schwelle → 429, einmal je Fenster ein
// Audit-Eintrag dlp.bulk_download (denied) und ein Sicherheitshinweis an die
// Owner der Org. Prozessspeicher wie lib/rate-limit.ts (ein Server).

export type EgressDecision = {
	allowed: boolean;
	alert: boolean;
	count: number;
};

export class EgressMonitor {
	private readonly hits = new Map<string, number[]>();
	private readonly alerted = new Map<string, number>();

	record(
		key: string,
		limit: number,
		windowMs: number,
		now: number = Date.now(),
	): EgressDecision {
		if (limit <= 0) return { allowed: true, alert: false, count: 0 };
		const from = now - windowMs;
		const list = (this.hits.get(key) ?? []).filter((t) => t > from);
		if (list.length >= limit) {
			this.hits.set(key, list);
			const last = this.alerted.get(key);
			const alert = last === undefined || last <= from;
			if (alert) this.alerted.set(key, now);
			return { allowed: false, alert, count: list.length };
		}
		list.push(now);
		this.hits.set(key, list);
		if (this.hits.size > 10_000) this.sweep(now, windowMs);
		return { allowed: true, alert: false, count: list.length };
	}

	sweep(now: number, windowMs: number): void {
		const from = now - windowMs;
		for (const [key, list] of this.hits) {
			const live = list.filter((t) => t > from);
			if (live.length === 0) this.hits.delete(key);
			else this.hits.set(key, live);
		}
		for (const [key, at] of this.alerted)
			if (at <= from) this.alerted.delete(key);
	}
}

let monitor: EgressMonitor | null = null;
function getMonitor(): EgressMonitor {
	if (!monitor) monitor = new EgressMonitor();
	return monitor;
}

export async function egressGuard(
	ctx: OrgContext,
	kind: string,
): Promise<NextResponse | null> {
	const policy = withDlpDefaults(
		await readOrg(toOrgCtx(ctx), async (tx) => {
			const [s] = await tx
				.select({ dlpPolicy: orgSettings.dlpPolicy })
				.from(orgSettings)
				.where(eq(orgSettings.organizationId, ctx.orgId))
				.limit(1);
			return s?.dlpPolicy ?? null;
		}),
	);
	const windowMs = policy.egressWindowMinutes * 60_000;
	const d = getMonitor().record(
		`${ctx.orgId}:${ctx.userId}`,
		policy.egressLimit,
		windowMs,
	);
	if (d.allowed) return null;
	if (d.alert) {
		await mutateOrg(toOrgCtx(ctx), async (tx) => {
			const owners = (
				await tx
					.select({ userId: member.userId, role: member.role })
					.from(member)
					.where(eq(member.organizationId, ctx.orgId))
			)
				.filter((m) => normalizeRole(m.role) === "owner")
				.map((m) => m.userId);
			await notify(tx, {
				orgId: ctx.orgId,
				recipients: owners,
				actorUserId: ctx.userId,
				kind: "security_alert",
				title: "Auffällig viele Downloads",
				body: `${ctx.name || ctx.email}: mehr als ${policy.egressLimit} Downloads/Exporte in ${policy.egressWindowMinutes} Minuten. Weitere Abrufe sind vorübergehend gedrosselt.`,
				link: "/aktivitaet",
				payload: { dedupeKey: `egress:${ctx.userId}` },
			});
			return {
				result: null,
				audit: {
					action: "dlp.bulk_download",
					target: `user:${ctx.userId}`,
					outcome: "denied" as const,
					after: {
						kind,
						limit: policy.egressLimit,
						windowMinutes: policy.egressWindowMinutes,
						count: d.count,
					},
				},
			};
		});
	}
	return new NextResponse(
		"Zu viele Downloads in kurzer Zeit. Die Organisation wurde informiert; versuche es in ein paar Minuten erneut.",
		{
			status: 429,
			headers: {
				"Retry-After": String(Math.ceil(windowMs / 1000)),
				"Cache-Control": "no-store",
			},
		},
	);
}
