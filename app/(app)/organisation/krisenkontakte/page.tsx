import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PrintButton } from "@/components/organisation/print-button";
import { PageHeader } from "@/components/page-header";
import { ROLE_FUNCTIONS } from "@/db/schema/enums";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { getOrgSummary } from "@/lib/auth/org";
import {
	listCommunications,
	listRoleAssignments,
} from "@/lib/compliance/queries-p3";
import { readOrg } from "@/lib/db/with-org";

// Krisenkontakte als Druckansicht (offline verfügbar halten — DORA Art. 11(7),
// Art. 14; ZAG-MaRisk AT 7.3). Enthält Krisen-/Vorfall-Kommunikationswege und
// die Besetzung der Pflichtfunktionen. Keine Geheimnisse, keine Passwörter.
export default async function CrisisContactsPage() {
	const ctx = await requireOrg({ organisation: ["read"] });
	const t = await getTranslations("Organisation");
	const tf = await getTranslations("Functions");
	const org = await getOrgSummary(ctx.orgId);
	const { comms, roles } = await readOrg(toOrgCtx(ctx), async (tx) => ({
		comms: (await listCommunications(tx, ctx.orgId)).filter(
			(c) => c.trigger === "crisis" || c.trigger === "incident",
		),
		roles: await listRoleAssignments(tx, ctx.orgId),
	}));
	const functionLabels = Object.fromEntries(
		ROLE_FUNCTIONS.map((f) => [f, tf(f)]),
	) as Record<string, string>;
	const stamp = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "long",
		timeStyle: "short",
		timeZone: "Europe/Berlin",
	}).format(new Date());

	return (
		<div className="print:text-black">
			<div className="print:hidden">
				<PageHeader
					eyebrow={org?.name}
					title={t("crisisSheet")}
					lead={t("crisisSheetLead")}
					actions={
						<div className="flex gap-2">
							<Link
								href="/organisation?tab=kommunikation"
								className="inline-flex h-8 items-center rounded-md border px-3 text-xs hover:bg-muted"
							>
								← {t("tabCommunication")}
							</Link>
							<PrintButton label={t("print")} />
						</div>
					}
				/>
			</div>
			<article className="mx-auto max-w-3xl text-sm print:max-w-none">
				<header className="mb-6 hidden border-b pb-3 print:block">
					<h1 className="font-serif-display text-2xl">
						{org?.name} — {t("crisisSheet")}
					</h1>
					<p className="text-xs">
						{t("printedAt")} {stamp}
					</p>
				</header>
				<section className="mb-8">
					<h2 className="lv-eyebrow mb-2 text-[0.6rem] text-muted-foreground print:text-black">
						{t("crisisTeamSheet")}
					</h2>
					<table className="w-full border-collapse text-left">
						<thead>
							<tr className="border-b">
								<th className="py-1 pr-3">{t("function")}</th>
								<th className="py-1 pr-3">{t("holder")}</th>
								<th className="py-1">{t("deputy")}</th>
							</tr>
						</thead>
						<tbody>
							{roles.map((r) => (
								<tr key={r.id} className="border-border/60 border-b">
									<td className="py-1 pr-3">{functionLabels[r.function]}</td>
									<td className="py-1 pr-3">{r.holderName ?? "—"}</td>
									<td className="py-1">{r.deputyName ?? "—"}</td>
								</tr>
							))}
							{roles.length === 0 && (
								<tr>
									<td colSpan={3} className="py-2 text-muted-foreground">
										{t("unfilled")}
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</section>
				<section>
					<h2 className="lv-eyebrow mb-2 text-[0.6rem] text-muted-foreground print:text-black">
						{t("crisisChannels")}
					</h2>
					{comms.length === 0 ? (
						<p className="text-muted-foreground">{t("communicationEmpty")}</p>
					) : (
						<ul className="flex flex-col gap-3">
							{comms.map((c) => (
								<li
									key={c.id}
									className="break-inside-avoid rounded-md border p-3 print:rounded-none"
								>
									<p className="font-medium">
										{c.topic}{" "}
										<span className="text-muted-foreground text-xs print:text-black">
											({t(`trigger_${c.trigger}`)})
										</span>
									</p>
									<dl className="mt-1 grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-[8rem_1fr]">
										<dt className="text-muted-foreground print:text-black">
											{t("audience")}
										</dt>
										<dd>{c.partyName ?? c.audience ?? "—"}</dd>
										<dt className="text-muted-foreground print:text-black">
											{t("channel")}
										</dt>
										<dd>{c.channel ?? "—"}</dd>
										{c.contact && (
											<>
												<dt className="text-muted-foreground print:text-black">
													{t("contactCrisis")}
												</dt>
												<dd className="font-medium">{c.contact}</dd>
											</>
										)}
										<dt className="text-muted-foreground print:text-black">
											{t("ownerFunction")}
										</dt>
										<dd>
											{c.ownerFunction
												? functionLabels[c.ownerFunction]
												: (c.ownerName ?? "—")}
										</dd>
										{c.legalBasis && (
											<>
												<dt className="text-muted-foreground print:text-black">
													{t("legalBasis")}
												</dt>
												<dd>{c.legalBasis}</dd>
											</>
										)}
									</dl>
								</li>
							))}
						</ul>
					)}
				</section>
				<p className="mt-8 text-muted-foreground text-xs print:text-black">
					{t("crisisFootnote")}
				</p>
			</article>
		</div>
	);
}
