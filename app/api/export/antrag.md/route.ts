import { NextResponse } from "next/server";
import { toOrgCtx } from "@/lib/auth/guards";
import {
	type ApplicationCheck,
	evaluateApplication,
} from "@/lib/compliance/application";
import { loadApplicationFacts } from "@/lib/compliance/application-facts";
import { MICAR_APPLICATION } from "@/lib/compliance/catalog/micar-application";
import { ZAG_APPLICATION } from "@/lib/compliance/catalog/zag-application";
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
	done: "vollständig",
	partial: "teilweise",
	open: "offen",
	not_applicable: "nicht anwendbar",
};

function checkText(c: ApplicationCheck): string {
	switch (c.kind) {
		case "documents":
			return `Dokumente: ${c.templateCodes.join(", ")}`;
		case "controls":
			return `Controls: ${c.codes.join(", ")}`;
		case "functions":
			return `Funktionen: ${c.functions.join(", ")}`;
		case "providers":
			return c.filter === "outsourcing"
				? "Auslagerungen erfasst"
				: "Dienstleister erfasst";
		case "processes":
			return `Prozesse (≥ ${c.min ?? 1})`;
		case "scope":
			return `Geltungsbereich ${c.framework}`;
		case "manual":
			return `Unterlage: ${c.hint}`;
		default:
			return c.kind;
	}
}

// Antragsmappe als Aktengliederung (Markdown) — ?mappe=micar|zag.
export async function GET(req: Request) {
	const ctx = await exportGuard();
	if (ctx instanceof NextResponse) return ctx;
	const mappe =
		new URL(req.url).searchParams.get("mappe") === "zag" ? "zag" : "micar";
	const items = mappe === "zag" ? ZAG_APPLICATION : MICAR_APPLICATION;
	const { facts, services } = await readOrg(toOrgCtx(ctx), (tx) =>
		loadApplicationFacts(tx, ctx.orgId),
	);
	const result = evaluateApplication(items, facts, services);
	const lines: string[] = [
		`# ${mappe === "zag" ? "ZAG-Erlaubnisantrag (§ 10 ZAG)" : "MiCAR-Zulassungsantrag (Art. 62 MiCAR)"} — Aktengliederung`,
		"",
		`Stand ${stamp()} · Vollständigkeit ${result.completenessPct === null ? "—" : `${Math.round(result.completenessPct)} %`} · ${result.done} vollständig, ${result.partial} teilweise, ${result.applicable - result.done - result.partial} offen von ${result.applicable} anwendbaren Bestandteilen.`,
		"",
	];
	result.items.forEach((r, i) => {
		lines.push(`## ${i + 1}. ${md(r.item.title)} — ${STATUS_DE[r.status]}`);
		lines.push("");
		lines.push(`*${md(r.item.legalBasis)}* · Modul: \`${r.item.route}\``);
		lines.push("");
		lines.push(md(r.item.description));
		lines.push("");
		if (r.status === "not_applicable") {
			lines.push(`_Nur bei Diensten: ${(r.item.services ?? []).join(", ")}_`);
		} else {
			for (const c of r.checks) {
				const mark =
					c.status === "done" ? "[x]" : c.status === "partial" ? "[~]" : "[ ]";
				lines.push(`- ${mark} ${md(checkText(c.check))}`);
			}
		}
		lines.push("");
	});
	lines.push(
		"_Orientierung nach Gesetzestext und RTS/ITS — kein Rechtsrat; das Dossier prüft eine Kanzlei._",
	);
	await auditExport(ctx, "application_md", result.items.length, { mappe });
	return markdownResponse(
		`antrag-${mappe}-${stamp()}.md`,
		`${lines.join("\n")}\n`,
	);
}
