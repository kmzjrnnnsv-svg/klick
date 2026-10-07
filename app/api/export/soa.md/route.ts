import { NextResponse } from "next/server";
import { toOrgCtx } from "@/lib/auth/guards";
import {
	CONTROL_BY_CODE,
	EDGES_BY_REQUIREMENT,
	FRAMEWORK_BY_SLUG,
} from "@/lib/compliance/catalog";
import {
	listEvidenceWithControls,
	orgCoverage,
} from "@/lib/compliance/queries";
import { readOrg } from "@/lib/db/with-org";
import {
	auditExport,
	exportGuard,
	markdownResponse,
	md,
	stamp,
} from "@/lib/export/respond";

export const dynamic = "force-dynamic";

const STATUS_DE: Record<string, string> = {
	covered: "erfüllt",
	partial: "teilweise",
	open: "offen",
	not_applicable: "nicht anwendbar",
};

// Statement of Applicability (ISO 27001 6.1.3 d) als Markdown — abgeleitet
// aus Anwendbarkeit, Control-Status und Nachweisen; nie separat gepflegt.
export async function GET() {
	const ctx = await exportGuard();
	if (ctx instanceof NextResponse) return ctx;
	const iso = FRAMEWORK_BY_SLUG.get("iso27001");
	if (!iso) return new NextResponse(null, { status: 404 });
	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const cov = await orgCoverage(tx, ctx.orgId);
		if (!cov?.frameworks.includes("iso27001")) return null;
		const ev = await listEvidenceWithControls(tx, ctx.orgId);
		const evidenceByControl = new Map<string, number>();
		for (const e of ev)
			for (const code of e.controlCodes)
				evidenceByControl.set(code, (evidenceByControl.get(code) ?? 0) + 1);
		return { cov, evidenceByControl };
	});
	if (!data) return new NextResponse("ISO 27001 nicht aktiv", { status: 400 });
	const { cov, evidenceByControl } = data;
	const annexA = iso.requirements.filter((r) => r.code.startsWith("A."));
	const lines: string[] = [
		"# Erklärung zur Anwendbarkeit (Statement of Applicability)",
		"",
		`Stand ${stamp()} · ISO/IEC 27001:2022 Klausel 6.1.3 d) · abgeleitet aus Anwendbarkeit, Control-Status und Nachweisen (Klick).`,
		"",
		"| Maßnahme | Titel | Anwendbar | Begründung | Umsetzende Controls (Status) | Nachweise | Status |",
		"|---|---|---|---|---|---|---|",
	];
	let applicable = 0;
	for (const r of annexA) {
		const key = `iso27001:${r.code}`;
		const status = cov.result.byRequirement.get(key) ?? "open";
		const detail = cov.applicabilityDetail.get(key);
		const isApplicable = status !== "not_applicable";
		if (isApplicable) applicable += 1;
		const edges = EDGES_BY_REQUIREMENT.get(key) ?? [];
		const controls = edges
			.map(
				(e) =>
					`${e.control} ${CONTROL_BY_CODE.get(e.control)?.title ?? ""} (${cov.implStatus.get(e.control) ?? "not_started"}${e.coverage === "partial" ? ", teilweise" : ""})`,
			)
			.join("; ");
		const evidence = edges.reduce(
			(s, e) => s + (evidenceByControl.get(e.control) ?? 0),
			0,
		);
		lines.push(
			`| ${md(r.code)} | ${md(r.title)} | ${isApplicable ? "ja" : "nein"} | ${md(detail?.note ?? (isApplicable ? "" : (detail?.source ?? "")))} | ${md(controls)} | ${evidence} | ${STATUS_DE[status] ?? status} |`,
		);
	}
	lines.push(
		"",
		`${annexA.length} Annex-A-Maßnahmen · ${applicable} anwendbar · ${annexA.length - applicable} ausgeschlossen (mit Begründung in requirement_applicability).`,
		"",
		"_Dieser Export ist Orientierung für Zertifizierung und Prüfung — kein Rechtsrat._",
	);
	await auditExport(ctx, "soa_md", annexA.length);
	return markdownResponse(
		`soa-iso27001-${stamp()}.md`,
		`${lines.join("\n")}\n`,
	);
}
