import { CheckCircle2, XCircle } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { SIGN_ORIGIN, SIGN_RP_ID } from "@/lib/auth/passkey-sign";
import { fmtDate } from "@/lib/compliance/page-data";
import { readOrg } from "@/lib/db/with-org";
import { functionLabel } from "@/lib/evidence-studio/generate/doc";
import { evidenceWithSignatures } from "@/lib/signatures/queries";
import { checkSignature } from "@/lib/signatures/report";

const fmtTime = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeStyle: "short",
	timeZone: "Europe/Berlin",
});

// Unterschriften eines Nachweises prüfen: jede Assertion wird hier mit dem
// gespeicherten öffentlichen Schlüssel neu gerechnet — ohne Vertrauen in
// Klick nachvollziehbar über signaturen.json.
export default async function SignaturesPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
	const ctx = await requireOrgPage({ evidence: ["read"] });
	const t = await getTranslations("SignatureCheck");
	const data = await readOrg(toOrgCtx(ctx), (tx) =>
		evidenceWithSignatures(tx, ctx.orgId, id),
	);
	if (!data) notFound();
	const env = { origin: SIGN_ORIGIN, rpId: SIGN_RP_ID };
	const checks = data.rows.map((r) => ({
		row: r,
		check: checkSignature(r, env),
	}));
	const Ok = ({ ok, label }: { ok: boolean; label: string }) => (
		<span className="inline-flex items-center gap-1 text-footnote">
			{ok ? (
				<CheckCircle2 className="size-3.5 text-success" aria-hidden="true" />
			) : (
				<XCircle className="size-3.5 text-destructive" aria-hidden="true" />
			)}
			{label}
		</span>
	);
	return (
		<>
			<PageHeader
				back={{
					href: `/nachweise/${data.evidence.id}`,
					label: data.evidence.title,
				}}
				eyebrow={data.evidence.kindCode ?? t("eyebrow")}
				title={data.evidence.title}
				lead={t("lead")}
				actions={
					<div className="flex flex-wrap gap-2 text-subhead">
						<a
							href={`/api/nachweise/${id}`}
							className="text-primary hover:underline"
						>
							{t("download")}
						</a>
						<a
							href={`/api/nachweise/${id}/unterschriften`}
							className="text-primary hover:underline"
						>
							{t("json")}
						</a>
					</div>
				}
			/>
			<dl className="mb-6 grid grid-cols-1 gap-2 text-subhead sm:grid-cols-[12rem_minmax(0,1fr)]">
				<dt className="text-muted-foreground">{t("file")}</dt>
				<dd className="break-all">{data.evidence.fileName ?? "—"}</dd>
				<dt className="text-muted-foreground">{t("sha256")}</dt>
				<dd className="break-all font-mono text-footnote">
					{data.evidence.sha256}
				</dd>
				<dt className="text-muted-foreground">{t("created")}</dt>
				<dd>{fmtDate.format(data.evidence.createdAt)}</dd>
			</dl>
			{checks.length === 0 ? (
				<p className="text-muted-foreground text-subhead">{t("none")}</p>
			) : (
				<ul className="flex flex-col gap-3">
					{checks.map(({ row, check }) => (
						<li
							key={row.id}
							className="flex flex-col gap-2 rounded-2xl bg-card p-4 text-subhead"
						>
							<div className="flex flex-wrap items-center gap-2">
								<span className="font-medium">{row.signerName}</span>
								{row.function && (
									<span className="text-muted-foreground">
										{functionLabel(row.function)}
									</span>
								)}
								<span className="text-muted-foreground tabular-nums">
									{fmtTime.format(row.signedAt)}
								</span>
								<Badge
									variant={check.valid ? "success" : "destructive"}
									className=""
								>
									{check.valid ? t("valid") : t("invalid")}
								</Badge>
								{row.batchId && (
									<Badge variant="outline" className="">
										{t("batch")}
									</Badge>
								)}
							</div>
							<div className="flex flex-wrap gap-x-4 gap-y-1">
								<Ok ok={check.text} label={t("checkText")} />
								<Ok
									ok={check.assertion.ok}
									label={
										check.assertion.ok
											? t("checkAssertion")
											: t("checkAssertionFailed", {
													reason: check.assertion.reason,
												})
									}
								/>
								<Ok ok={row.userVerified} label={t("checkUv")} />
								{check.merkle !== null && (
									<Ok ok={check.merkle} label={t("checkMerkle")} />
								)}
								<span className="text-muted-foreground text-footnote">
									{row.backupEligible ? t("synced") : t("deviceBound")}
								</span>
							</div>
							<details className="text-footnote">
								<summary className="cursor-pointer py-1.5 text-muted-foreground pointer-coarse:py-3">
									{t("details")}
								</summary>
								<p className="mt-2 break-all font-mono">{row.signText}</p>
								<p className="mt-1 break-all font-mono text-muted-foreground">
									{t("credential")}: {row.credentialId}
								</p>
							</details>
						</li>
					))}
				</ul>
			)}
			<p className="mt-6 max-w-3xl text-muted-foreground text-footnote">
				{t("legal")}
			</p>
		</>
	);
}
