import { and, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthoringEditor } from "@/components/evidence-authoring/editor";
import { PageHeader } from "@/components/page-header";
import { evidence } from "@/db/schema";
import { ROLE_FUNCTIONS } from "@/db/schema/enums";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { CONTROLS } from "@/lib/compliance/catalog";
import { listMembersForPicker } from "@/lib/compliance/queries";
import { readOrg } from "@/lib/db/with-org";
import { loadDraft } from "@/lib/evidence-authoring/service";
import { presetOf } from "@/lib/evidence-authoring/templates";
import { berlinToday } from "@/lib/evidence-studio/queries";

// Entwurf eines verfassten Nachweises bearbeiten und abschließen
export default async function AuthoringEditorPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
	const ctx = await requireOrgPage({ evidence: ["create"] });
	const t = await getTranslations("Authoring");
	const tf = await getTranslations("Functions");
	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const draft = await loadDraft(tx, ctx.orgId, id);
		if (!draft) return null;
		const [prev] = draft.row.supersedesId
			? await tx
					.select({ id: evidence.id, title: evidence.title })
					.from(evidence)
					.where(
						and(
							eq(evidence.organizationId, ctx.orgId),
							eq(evidence.id, draft.row.supersedesId),
						),
					)
					.limit(1)
			: [];
		return {
			draft,
			prev: prev ?? null,
			members: await listMembersForPicker(tx, ctx.orgId),
		};
	});
	if (!data) notFound();
	const { draft, prev, members } = data;
	const { row, template, content } = draft;
	const functionLabels = Object.fromEntries(
		ROLE_FUNCTIONS.map((f) => [f, tf(f)]),
	) as Record<string, string>;

	return (
		<>
			<Link
				href="/nachweise/verfassen"
				className="mb-4 inline-flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
			>
				<ArrowLeft className="size-4" aria-hidden />
				{t("backToGallery")}
			</Link>
			<PageHeader
				eyebrow={`${template.code} · ${presetOf(template, row.preset)?.title ?? template.title}`}
				title={row.title}
				lead={template.purpose}
			/>
			{prev && (
				<p className="mb-6 rounded-md border px-3 py-2 text-sm">
					{t("versionOf")}{" "}
					<Link
						href={`/nachweise/${prev.id}`}
						className="text-primary hover:underline"
					>
						{prev.title}
					</Link>
				</p>
			)}
			<AuthoringEditor
				draftId={row.id}
				templateKey={template.key}
				initial={{
					title: row.title,
					preset: row.preset,
					classification:
						row.classification === "confidential" ? "confidential" : "internal",
					controlCodes: row.controlCodes,
					signers: row.signers.length > 0 ? row.signers : ["-"],
					content,
				}}
				controls={CONTROLS.map((c) => ({ code: c.code, title: c.title })).sort(
					(a, b) => a.code.localeCompare(b.code),
				)}
				members={members}
				functionLabels={functionLabels}
				canTest={allows(ctx, { control: ["update"] })}
				canTasks={allows(ctx, { task: ["create"] })}
				today={berlinToday()}
			/>
		</>
	);
}
