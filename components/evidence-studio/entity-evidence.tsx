import { getTranslations } from "next-intl/server";
import type { OrgContext } from "@/lib/auth/guards";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { fmtDate } from "@/lib/compliance/page-data";
import { readOrg } from "@/lib/db/with-org";
import { canGenerate } from "@/lib/evidence-studio/generate/registry";
import { generatedFor } from "@/lib/evidence-studio/generate/service";
import { GenerateButton } from "./generate-button";

// Nachweis je Datensatz (Auditbericht je Audit, Protokoll je
// Managementbewertung): letzter erzeugter Stand + „In Klick erzeugen“
export async function EntityEvidence({
	ctx,
	code,
	entityId,
}: {
	ctx: OrgContext;
	code: string;
	entityId: string;
}) {
	if (!canGenerate(code)) return null;
	const t = await getTranslations("EvidenceStudio");
	const latest = await readOrg(toOrgCtx(ctx), (tx) =>
		generatedFor(tx, ctx.orgId, code, entityId),
	);
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
			{allows(ctx, { evidence: ["create"] }) && (
				<GenerateButton
					kindCode={code}
					entityId={entityId}
					label={latest ? t("regenerate") : t("generatePdf")}
				/>
			)}
			<span className="text-muted-foreground text-xs">
				{latest ? (
					<a
						href={`/api/nachweise/${latest.id}`}
						className="text-primary hover:underline"
					>
						{t("kindProduced", { date: fmtDate.format(latest.createdAt) })}
					</a>
				) : (
					t("kindNotProduced")
				)}
			</span>
		</div>
	);
}
