import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { globalDb } from "@/db";
import { organization, user } from "@/db/auth-schema";
import { notifications } from "@/db/schema";
import type { NotificationKind } from "@/db/schema/enums";
import { forEachOrg, type OrgTx } from "@/lib/db/with-org";
import { env } from "@/lib/env";
import { logger } from "@/lib/log";
import { sendTransactionalMail } from "@/lib/mail/send";
import { transactionalEmail } from "@/lib/mail/templates";
import { IMMEDIATE_MAIL_KINDS } from "@/lib/notifications/notify";

// Mailversand für Benachrichtigungen (Plan „Benachrichtigungen"):
//   • sofort (alle 5 min): nur IMMEDIATE_MAIL_KINDS, je Benachrichtigung eine Mail
//   • Tages-Digest 07:00: alles Übrige, gebündelt je Person
// Mails werden je Org in eigenem RLS-Kontext gerendert, nie org-übergreifend
// aggregiert; emailedAt wird erst nach erfolgreichem Versand gesetzt (Retry
// beim nächsten Lauf). Plattform-Benachrichtigungen (organization_id null,
// z. B. security_alert an Admins) laufen in einem separaten Plattform-Pass.
// Keine Payload-Details in Logs (Redaction greift ohnehin), keine Mandanten-
// daten im Betreff über den Titel hinaus.

const IMMEDIATE_MAX_AGE_DAYS = 3;
const DIGEST_MAX_ITEMS = 40;

export const KIND_LABELS: Record<NotificationKind, string> = {
	review_due: "Fällige Reviews",
	incident_deadline: "Vorfall-Fristen",
	approval_requested: "Freigaben angefragt",
	approval_decided: "Freigaben entschieden",
	approval_overdue: "Freigaben überfällig",
	acknowledgement_due: "Kenntnisnahmen",
	milestone_due: "Meilensteine",
	evidence_expiring: "Nachweise laufen ab",
	task_assigned: "Aufgaben",
	mentioned: "Erwähnungen",
	entity_changed: "Änderungen",
	risk_above_appetite: "Risiken über Appetit",
	audit_request: "Nachweisanfragen",
	security_alert: "Sicherheitshinweise",
	digest: "Digest",
	system: "System",
};

export type DigestItem = {
	kind: NotificationKind;
	title: string;
	body: string | null;
	link: string | null;
	createdAt: Date;
};

function esc(s: string): string {
	return s
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

function absolute(base: string, link: string | null): string | null {
	if (!link) return null;
	if (/^https?:\/\//.test(link)) return link;
	return `${base.replace(/\/$/, "")}${link.startsWith("/") ? "" : "/"}${link}`;
}

// Pure: baut Betreff + Text + HTML eines Tages-Digests aus Benachrichtigungen.
export function buildDigest(
	items: readonly DigestItem[],
	opts: { baseUrl: string; recipientName: string; date: Date },
): { subject: string; text: string; html: string } | null {
	if (items.length === 0) return null;
	const groups = new Map<NotificationKind, DigestItem[]>();
	for (const it of items.slice(0, DIGEST_MAX_ITEMS)) {
		const list = groups.get(it.kind) ?? [];
		list.push(it);
		groups.set(it.kind, list);
	}
	const dateLabel = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "long",
		timeZone: "Europe/Berlin",
	}).format(opts.date);
	const subject = `Dein Klick-Digest · ${items.length} ${items.length === 1 ? "Punkt" : "Punkte"} · ${dateLabel}`;

	const textParts: string[] = [];
	const htmlParts: string[] = [];
	for (const [kind, list] of groups) {
		textParts.push(`${KIND_LABELS[kind]} (${list.length})`);
		htmlParts.push(
			`<p style="margin:16px 0 4px 0;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#8a7f72">${esc(KIND_LABELS[kind])} · ${list.length}</p><ul style="margin:0;padding-left:18px">`,
		);
		for (const it of list) {
			const url = absolute(opts.baseUrl, it.link);
			textParts.push(
				`  – ${it.title}${it.body ? ` — ${it.body}` : ""}${url ? ` (${url})` : ""}`,
			);
			htmlParts.push(
				`<li style="margin:4px 0">${url ? `<a href="${esc(url)}" style="color:#2c3f68">${esc(it.title)}</a>` : esc(it.title)}${it.body ? `<span style="opacity:0.75"> — ${esc(it.body)}</span>` : ""}</li>`,
			);
		}
		htmlParts.push("</ul>");
		textParts.push("");
	}
	if (items.length > DIGEST_MAX_ITEMS) {
		const more = items.length - DIGEST_MAX_ITEMS;
		textParts.push(`… und ${more} weitere auf „Heute“.`);
		htmlParts.push(
			`<p style="margin:12px 0 0 0;opacity:0.75">… und ${more} weitere auf „Heute“.</p>`,
		);
	}
	const mail = transactionalEmail({
		subject,
		preheader: `${items.length} offene Punkte in deiner Organisation`,
		eyebrow: "Tages-Digest",
		title: `Guten Morgen, ${opts.recipientName}`,
		body: htmlParts.join(""),
		cta: {
			label: "Heute öffnen",
			url: `${opts.baseUrl.replace(/\/$/, "")}/heute`,
		},
		footnote:
			"Du bekommst diesen Digest, weil du Mitglied einer Organisation auf Klick bist. Einstellungen → Benachrichtigungen.",
	});
	return { subject, text: textParts.join("\n"), html: mail.html };
}

// Pure: Sofort-Mail für eine einzelne Benachrichtigung.
export function buildImmediateMail(
	item: DigestItem,
	opts: { baseUrl: string },
): { subject: string; text: string; html: string } {
	const url =
		absolute(opts.baseUrl, item.link) ??
		`${opts.baseUrl.replace(/\/$/, "")}/heute`;
	const mail = transactionalEmail({
		subject: item.title,
		eyebrow: KIND_LABELS[item.kind],
		title: item.title,
		body: esc(item.body ?? "Öffne Klick, um die Details zu sehen."),
		cta: { label: "In Klick öffnen", url },
		footnote:
			"Sofort-Benachrichtigung von Klick. Alles andere kommt im Tages-Digest.",
	});
	return { subject: item.title, text: mail.text, html: mail.html };
}

type Pending = {
	id: string;
	userId: string;
	kind: NotificationKind;
	title: string;
	body: string | null;
	link: string | null;
	createdAt: Date;
	email: string;
	name: string;
};

async function pendingRows(
	tx: OrgTx,
	where: ReturnType<typeof and>,
): Promise<Pending[]> {
	return tx
		.select({
			id: notifications.id,
			userId: notifications.userId,
			kind: notifications.kind,
			title: notifications.title,
			body: notifications.body,
			link: notifications.link,
			createdAt: notifications.createdAt,
			email: user.email,
			name: user.name,
		})
		.from(notifications)
		.innerJoin(user, eq(user.id, notifications.userId))
		.where(where)
		.orderBy(notifications.createdAt);
}

async function markEmailed(tx: OrgTx, ids: string[], now: Date) {
	if (ids.length === 0) return;
	await tx
		.update(notifications)
		.set({ emailedAt: now })
		.where(inArray(notifications.id, ids));
}

// Sofort-Mails je Org (und Plattform-Pass).
export async function runImmediateMails(now = new Date()): Promise<number> {
	const base = env().BETTER_AUTH_URL;
	const since = new Date(now.getTime() - IMMEDIATE_MAX_AGE_DAYS * 86_400_000);
	let sent = 0;
	const kinds = [...IMMEDIATE_MAIL_KINDS];
	const handle = async (tx: OrgTx, orgFilter: ReturnType<typeof eq>) => {
		const rows = await pendingRows(
			tx,
			and(
				orgFilter,
				isNull(notifications.emailedAt),
				inArray(notifications.kind, kinds),
				gte(notifications.createdAt, since),
			),
		);
		const done: string[] = [];
		for (const r of rows) {
			const mail = buildImmediateMail(r, { baseUrl: base });
			const out = await sendTransactionalMail({ to: r.email, ...mail });
			if (out.ok) done.push(r.id);
		}
		await markEmailed(tx, done, now);
		sent += done.length;
	};
	const orgs = await globalDb
		.select({ id: organization.id })
		.from(organization);
	await forEachOrg(
		orgs.map((o) => o.id),
		(tx, orgId) => handle(tx, eq(notifications.organizationId, orgId)),
	);
	await globalDb.transaction(async (tx) => {
		await tx.execute(sql`select set_config('app.scope', 'platform', true)`);
		await handle(
			tx,
			isNull(notifications.organizationId) as ReturnType<typeof eq>,
		);
	});
	if (sent > 0) logger.info({ sent }, "immediate notification mails sent");
	return sent;
}

// Tages-Digest je Org und Person: alles, was noch nicht gemailt wurde.
export async function runDigest(now = new Date()): Promise<number> {
	const base = env().BETTER_AUTH_URL;
	let mails = 0;
	const handle = async (tx: OrgTx, orgFilter: ReturnType<typeof eq>) => {
		const rows = await pendingRows(
			tx,
			and(orgFilter, isNull(notifications.emailedAt)),
		);
		const byUser = new Map<string, Pending[]>();
		for (const r of rows) {
			const list = byUser.get(r.userId) ?? [];
			list.push(r);
			byUser.set(r.userId, list);
		}
		for (const list of byUser.values()) {
			const first = list[0];
			if (!first) continue;
			const digest = buildDigest(list, {
				baseUrl: base,
				recipientName: first.name,
				date: now,
			});
			if (!digest) continue;
			const out = await sendTransactionalMail({ to: first.email, ...digest });
			if (out.ok) {
				await markEmailed(
					tx,
					list.map((r) => r.id),
					now,
				);
				mails += 1;
			}
		}
	};
	const orgs = await globalDb
		.select({ id: organization.id })
		.from(organization);
	await forEachOrg(
		orgs.map((o) => o.id),
		(tx, orgId) => handle(tx, eq(notifications.organizationId, orgId)),
	);
	await globalDb.transaction(async (tx) => {
		await tx.execute(sql`select set_config('app.scope', 'platform', true)`);
		await handle(
			tx,
			isNull(notifications.organizationId) as ReturnType<typeof eq>,
		);
	});
	logger.info({ mails }, "digest done");
	return mails;
}
