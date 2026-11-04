import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
	type ExerciseDraft,
	ExerciseEditor,
} from "@/components/bcm/exercise-editor";
import { withMessages } from "@/components/i18n/with-messages";
import { PageHeader } from "@/components/page-header";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { exerciseById } from "@/lib/bcm/exercise-queries";
import { readOrg } from "@/lib/db/with-org";

// Notfallübung (N4): Drehbuch, Teilnehmende, Messung, Ergebnis. Abschließen
// schreibt den Test ins Testprogramm (Prozess/Standort zählt als geübt).
// Zeitpunkt für <input type="datetime-local"> in Berliner Zeit
const BERLIN = new Intl.DateTimeFormat("sv-SE", {
	timeZone: "Europe/Berlin",
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
});
const local = (d: Date | null) =>
	d ? BERLIN.format(d).replace(" ", "T") : null;

async function ExercisePage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
	const ctx = await requireOrgPage({ control: ["read"] });
	const t = await getTranslations("Bcm");
	const row = await readOrg(toOrgCtx(ctx), (tx) =>
		exerciseById(tx, ctx.orgId, id),
	);
	if (!row) notFound();
	const ex = row.exercise;
	const done = ex.status === "done" || !allows(ctx, { control: ["update"] });
	const draft: ExerciseDraft = {
		id: ex.id,
		title: ex.title,
		kind: ex.kind,
		plannedAt: ex.plannedAt,
		scenario: ex.scenario,
		script: ex.script,
		participants: ex.participants,
		startedAt: local(ex.startedAt),
		endedAt: local(ex.endedAt),
		recoveryMinutes: ex.recoveryMinutes,
		dataLossMinutes: ex.dataLossMinutes,
		lessons: ex.lessons,
		measures: ex.measures,
	};
	const back = row.processCode
		? {
				href: `/prozesse/${encodeURIComponent(row.processCode)}`,
				label: `${row.processCode} ${row.processName}`,
			}
		: { href: "/testprogramm", label: t("exBackProgramme") };
	return (
		<>
			<PageHeader
				back={back}
				title={ex.title}
				lead={
					ex.planVersion
						? t("exLeadPlan", { version: ex.planVersion })
						: t("exLead")
				}
			/>
			<ExerciseEditor
				initial={draft}
				done={done}
				result={ex.result}
				target={{ rtoHours: row.rtoHours, rpoHours: row.rpoHours }}
			/>
		</>
	);
}

export default withMessages(ExercisePage, ["Bcm", "Common"]);
