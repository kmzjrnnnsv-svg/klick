import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
	PortalLogout,
	PortalQuestion,
	PortalSession,
	PortalSubmit,
} from "@/components/supplier/portal";
import {
	AuthError,
	type PortalContext,
	requirePortal,
} from "@/lib/auth/guards";
import { getOrgSummary } from "@/lib/auth/org";
import { fmtDate } from "@/lib/compliance/page-data";
import { getPortalAssessment } from "@/lib/compliance/queries-suppliers";
import { readOrg } from "@/lib/db/with-org";

export const metadata: Metadata = {
	title: "Lieferantenportal",
	robots: { index: false, follow: false },
	referrer: "no-referrer",
};

// Lieferantenportal (ADR-017): Fragebogen ohne Konto. Zugang über das
// Portal-Cookie; ohne Cookie tauscht PortalSession den Token aus dem
// URL-Fragment. Der Lieferant sieht nur seine Fragen, Antworten und Dateien.
export default async function SupplierPortalPage() {
	const t = await getTranslations("Portal");
	let p: PortalContext | null = null;
	let expired = false;
	try {
		p = await requirePortal();
	} catch (e) {
		if (!(e instanceof AuthError)) throw e;
		expired = e.code === "access_expired";
	}
	if (!p)
		return (
			<div className="flex flex-col gap-4">
				<h1 className="font-bold text-title-1">{t("title")}</h1>
				<PortalSession state={expired ? "expired" : "none"} />
			</div>
		);
	const portal = p;
	const [data, org] = await Promise.all([
		readOrg(portal.ctx, (tx) =>
			getPortalAssessment(tx, portal.ctx.orgId, portal.assessmentId),
		),
		getOrgSummary(portal.ctx.orgId),
	]);
	if (!data)
		return (
			<div className="flex flex-col gap-4">
				<h1 className="font-bold text-title-1">{t("title")}</h1>
				<PortalSession state="none" />
			</div>
		);
	const a = data.assessment;
	const organization = org?.name ?? "—";
	const readOnly = a.status !== "in_progress" && a.status !== "draft";
	const byCode = new Map(data.answers.map((x) => [x.questionCode, x]));
	const fileName = new Map(
		data.files.map((f) => [f.id, f.fileName ?? f.id] as const),
	);
	const answered = a.questions.filter(
		(q) => (byCode.get(q.code)?.answer ?? null) !== null,
	).length;
	const sections: { code: string; title: string; codes: string[] }[] = [];
	for (const q of a.questions) {
		let s = sections.find((x) => x.code === q.sectionCode);
		if (!s) {
			s = { code: q.sectionCode, title: q.sectionTitle, codes: [] };
			sections.push(s);
		}
		s.codes.push(q.code);
	}
	const qByCode = new Map(a.questions.map((q) => [q.code, q]));

	return (
		<div className="flex flex-col gap-6">
			<PortalSession state="session" />
			<header className="flex flex-col gap-2">
				<div className="flex items-start justify-between gap-2">
					<p className="font-medium text-footnote text-muted-foreground">
						{t("eyebrow", { organization })}
					</p>
					<PortalLogout />
				</div>
				<h1 className="text-balance font-bold text-title-1">{a.title}</h1>
				<p className="text-muted-foreground text-subhead">
					<span translate="no">{a.code}</span>
					{a.dueAt &&
						` · ${t("due", { date: fmtDate.format(new Date(a.dueAt)) })}`}
					{` · ${t("progress", { answered, total: a.questions.length })}`}
				</p>
			</header>

			{readOnly ? (
				<p role="status" className="rounded-xl bg-success/10 p-3 text-subhead">
					{a.submittedAt
						? t("submittedInfo", {
								date: fmtDate.format(a.submittedAt),
								organization,
							})
						: t("closedInfo")}
				</p>
			) : (
				<div className="flex flex-col gap-2 text-subhead">
					<p>{t("intro", { organization })}</p>
					<p className="text-muted-foreground">
						{t("privacy", { organization })}
					</p>
					{a.reopenNote && (
						<p role="alert" className="rounded-xl bg-warning/12 p-3">
							{t("reopened", { organization, note: a.reopenNote })}
						</p>
					)}
				</div>
			)}

			{sections.map((s) => (
				<section key={s.code} aria-labelledby={`sec-${s.code}`}>
					<h2 id={`sec-${s.code}`} className="mb-3 font-semibold text-title-3">
						{s.title}
					</h2>
					<div className="flex flex-col gap-3">
						{s.codes.map((code) => {
							const q = qByCode.get(code);
							if (!q) return null;
							const ans = byCode.get(code);
							return (
								<PortalQuestion
									key={code}
									question={q}
									readOnly={readOnly}
									initial={{
										answer: ans?.answer ?? null,
										comment: ans?.comment ?? null,
										naReason: ans?.naReason ?? null,
										clarify: ans?.clarify ?? false,
										files: (ans?.evidenceIds ?? [])
											.filter((id) => fileName.has(id))
											.map((id) => ({ id, name: fileName.get(id) ?? id })),
									}}
								/>
							);
						})}
					</div>
				</section>
			))}

			{!readOnly && (
				<footer className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
					<p className="text-muted-foreground text-subhead">
						{t("progress", { answered, total: a.questions.length })}
					</p>
					<PortalSubmit
						unanswered={a.questions.length - answered}
						organization={organization}
					/>
				</footer>
			)}
		</div>
	);
}
