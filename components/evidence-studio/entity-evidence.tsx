import { getTranslations } from "next-intl/server";
import { SignButton } from "@/components/signatures/sign-button";
import type { OrgContext } from "@/lib/auth/guards";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { EVIDENCE_KIND_BY_CODE } from "@/lib/compliance/catalog/evidence-kinds";
import { fmtDate } from "@/lib/compliance/page-data";
import { readOrg } from "@/lib/db/with-org";
import { functionLabel } from "@/lib/evidence-studio/generate/doc";
import { canGenerate } from "@/lib/evidence-studio/generate/registry";
import {
	evidenceSignState,
	generatedFor,
} from "@/lib/evidence-studio/generate/service";
import { GenerateButton } from "./generate-button";

// Nachweis je Datensatz (Auditbericht je Audit, Protokoll je
// Managementbewertung, Bestellungsschreiben je Funktion) oder einer
// Org-Art an ihrem Register (Organigramm): letzter erzeugter Stand,
// „In Klick erzeugen“, Unterschriften und „Unterschreiben“ für die
// Funktion, die noch fehlt und die ich innehabe.
export async function EntityEvidence({
	ctx,
	code,
	entityId,
	generateLabel,
}: {
	ctx: OrgContext;
	code: string;
	entityId?: string;
	generateLabel?: string;
}) {
	if (!canGenerate(code)) return null;
	const t = await getTranslations("EvidenceStudio");
	const ts = await getTranslations("Signatures");
	const tf = await getTranslations("Functions");
	const fnLabel = (f: string) =>
		tf.has(f as "other") ? tf(f as "other") : functionLabel(f);
	const kind = EVIDENCE_KIND_BY_CODE.get(code);
	const { latest, sign } = await readOrg(toOrgCtx(ctx), async (tx) => {
		const latest = await generatedFor(tx, ctx.orgId, code, entityId);
		return {
			latest,
			sign: latest
				? await evidenceSignState(tx, ctx.orgId, code, latest.id, ctx.userId)
				: null,
		};
	});
	return (
		<div className="flex flex-col gap-1.5 text-subhead">
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
				{allows(ctx, { evidence: ["create"] }) && (
					<GenerateButton
						kindCode={code}
						entityId={entityId}
						label={
							latest ? t("regenerate") : (generateLabel ?? t("generatePdf"))
						}
					/>
				)}
				{latest && sign?.signAs && (
					<SignButton
						evidenceIds={[latest.id]}
						fn={sign.signAs}
						purpose={kind?.signPurpose ?? "approve"}
						label={
							kind?.signPurpose === "acknowledge"
								? ts("acknowledge")
								: ts("sign")
						}
						fullLabel={
							kind?.signPurpose === "acknowledge"
								? ts("acknowledgeAs", { fn: fnLabel(sign.signAs) })
								: ts("signAs", { fn: fnLabel(sign.signAs) })
						}
					/>
				)}
				<span className="text-muted-foreground text-footnote">
					{latest ? (
						<>
							<a
								href={`/api/nachweise/${latest.id}`}
								className="text-primary hover:underline"
							>
								{t("kindProduced", { date: fmtDate.format(latest.createdAt) })}
							</a>
							{" · "}
							<a
								href={`/nachweise/${latest.id}/unterschriften`}
								className="text-primary hover:underline"
							>
								{t("signatures")}
							</a>
						</>
					) : (
						t("kindNotProduced")
					)}
				</span>
			</div>
			{sign && (sign.signatures.length > 0 || sign.open.length > 0) && (
				<p className="text-muted-foreground text-footnote">
					{sign.signatures.length > 0 && `${ts("signedPrefix")} `}
					{sign.signatures.map((s, i) => (
						<span key={`${s.name}-${s.signedAt}`}>
							{i > 0 && " · "}
							{ts("signedLine", {
								name: s.name,
								fn: s.function ? fnLabel(s.function) : "—",
								date: fmtDate.format(new Date(s.signedAt)),
							})}
						</span>
					))}
					{sign.open.length > 0 && (
						<span className="text-warning">
							{sign.signatures.length > 0 && " · "}
							{ts("openFor", {
								fns: sign.open.map(fnLabel).join(", "),
							})}
						</span>
					)}
				</p>
			)}
		</div>
	);
}
