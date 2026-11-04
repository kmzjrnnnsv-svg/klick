import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Section } from "@/components/entity/entity-layout";
import { CheckBadge } from "@/components/identity/check-badge";
import type { OrgContext } from "@/lib/auth/guards";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { readOrg } from "@/lib/db/with-org";
import { accountsHref } from "@/lib/identity/accounts";
import {
	identityCheckViews,
	identitySourceViews,
} from "@/lib/identity/queries";
import { IDENTITY_CHECKS, type IdentityCheckKey } from "@/lib/identity/types";

// Begründungen mit eigenem Satz (lib/identity/rules.ts)
const REASONS = [
	"no_source",
	"stale",
	"mfa_unknown",
	"admin_without_mfa",
	"no_accounts",
	"mfa_rate",
	"mfa_all",
	"exceptions",
	"roles_unknown",
	"no_admins",
	"guest_admin",
	"top_admins",
	"admin_inactive",
	"admins_ok",
	"leaver_active",
	"inactive",
	"never_signed_in",
	"leavers_ok",
	"sign_in_unknown",
	"no_review",
	"review_age",
] as const;
type Reason = (typeof REASONS)[number];

const fmt = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeStyle: "short",
	timeZone: "Europe/Berlin",
});

function checkKeyOf(code: string): IdentityCheckKey | null {
	const hit = (
		Object.entries(IDENTITY_CHECKS) as [IdentityCheckKey, string][]
	).find(([, c]) => c === code);
	return hit?.[0] ?? null;
}

// „Automatische Prüfung“ am Control (Teil D): nur an CC-IAM-02…05. Ergebnis,
// Begründung, Betroffene und Abhilfe; ohne Quelle der Weg zum Verbinden.
export async function AutomaticCheckSection({
	ctx,
	code,
}: {
	ctx: OrgContext;
	code: string;
}) {
	const key = checkKeyOf(code);
	if (!key) return null;
	const t = await getTranslations("IdentityAccounts");
	const { result, connected } = await readOrg(toOrgCtx(ctx), async (tx) => {
		const [checks, sources] = await Promise.all([
			identityCheckViews(tx, ctx.orgId),
			identitySourceViews(tx, ctx.orgId),
		]);
		return {
			result: checks.find((c) => c.key === key) ?? null,
			connected: sources.some((s) => s.status !== "pending_consent"),
		};
	});
	const canSee = allows(ctx, { identity: ["read"] });
	const reasonText = (r: {
		code: string;
		count?: number;
		value?: number;
		limit?: number;
	}) =>
		(REASONS as readonly string[]).includes(r.code)
			? t(`reason_${r.code as Reason}` as "reason_mfa_rate", {
					count: r.count ?? 0,
					value: r.value ?? 0,
					limit: r.limit ?? 0,
				})
			: t("reason_other", { code: r.code });

	return (
		<div id="automatisch" className="scroll-mt-24">
			<Section
				title={t("autoTitle")}
				actions={result ? <CheckBadge result={result.result} /> : undefined}
			>
				{!connected || !result ? (
					<div className="flex flex-col items-start gap-2 rounded-2xl bg-card p-4 text-subhead">
						<p className="text-muted-foreground">{t("autoNoSource")}</p>
						{ctx.orgRole === "owner" && (
							<Link
								href="/einstellungen?tab=integrationen"
								className="hit-area text-primary underline-offset-4 hover:underline"
							>
								{t("autoConnect")}
							</Link>
						)}
					</div>
				) : (
					<div className="flex flex-col gap-3 rounded-2xl bg-card p-4 text-subhead">
						<p className="text-footnote text-muted-foreground">
							{t("autoLead")}{" "}
							{t("autoChecked", { at: fmt.format(result.checkedAt) })}
						</p>
						<ul className="flex list-disc flex-col gap-1 pl-5">
							{result.reasons.map((r) => (
								<li key={`${r.code}-${r.count ?? r.value ?? ""}`}>
									{reasonText(r)}
								</li>
							))}
						</ul>
						{(result.result === "fail" || result.result === "partial") && (
							<p>{t(`fix_${key}`)}</p>
						)}
						{canSee && (
							<div className="flex flex-wrap gap-x-4 gap-y-1">
								{result.affectedCount > 0 && (
									<Link
										href={accountsHref({ check: key })}
										className="hit-area text-primary underline-offset-4 hover:underline"
									>
										{t("autoAffectedLink", { n: result.affectedCount })}
									</Link>
								)}
								<Link
									href="/team/konten"
									className="hit-area text-primary underline-offset-4 hover:underline"
								>
									{t("autoAccounts")}
								</Link>
								{key === "recert" && (
									<Link
										href="/team/zugriffspruefung"
										className="hit-area text-primary underline-offset-4 hover:underline"
									>
										{t("autoReview")}
									</Link>
								)}
							</div>
						)}
					</div>
				)}
			</Section>
		</div>
	);
}
