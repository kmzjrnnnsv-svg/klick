"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateAuditRegime } from "@/app/actions/settings";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { OrgAuditSetting } from "@/lib/compliance/audit-follow-up";
import type {
	AuditCycleKind,
	FollowUpClass,
	FollowUpRule,
} from "@/lib/compliance/catalog/audit-regimes";

export type RegimeView = {
	framework: string;
	name: string;
	label: string;
	source: string;
	cycles: {
		kind: AuditCycleKind;
		label: string;
		everyMonths: number;
		defaultMonths: number;
	}[];
	classes: Record<
		FollowUpClass,
		{ label: string; rule: FollowUpRule; defaultRule: FollowUpRule }
	>;
	anchors: Partial<Record<AuditCycleKind, string>>;
	custom: boolean;
	upcoming: { kind: AuditCycleKind; label: string; date: string }[];
	missing: AuditCycleKind[];
};

const CLASSES: readonly FollowUpClass[] = ["major", "minor", "observation"];
// Überwachung und Rezertifizierung rechnen ab dem Zertifikat
const FROM_CERTIFICATE: ReadonlySet<AuditCycleKind> = new Set([
	"certification",
	"surveillance",
	"recertification",
]);

const fmt = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeZone: "Europe/Berlin",
});
const day = (iso: string) => fmt.format(new Date(`${iso}T12:00:00Z`));

// Einstellungen → Audits & Fristen: je Rahmenwerk Rhythmus, Anker (Zertifikat
// bzw. letztes Audit) und Fristen für Haupt-/Nebenabweichungen und Hinweise
export function AuditRegimesPanel({
	regimes,
	canEdit,
}: {
	regimes: RegimeView[];
	canEdit: boolean;
}) {
	const t = useTranslations("AuditRegimes");
	return (
		<div className="flex flex-col gap-4 text-sm">
			<p className="max-w-3xl text-muted-foreground">{t("lead")}</p>
			{regimes.length === 0 ? (
				<p className="text-muted-foreground">{t("empty")}</p>
			) : (
				<ul className="flex flex-col divide-y divide-border/60 rounded-md border">
					{regimes.map((r) => (
						<li key={r.framework}>
							<RegimeEditor regime={r} canEdit={canEdit} />
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

function RegimeEditor({
	regime: r,
	canEdit,
}: {
	regime: RegimeView;
	canEdit: boolean;
}) {
	const t = useTranslations("AuditRegimes");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [months, setMonths] = useState(() =>
		Object.fromEntries(r.cycles.map((c) => [c.kind, String(c.everyMonths)])),
	);
	const [rules, setRules] = useState(
		() =>
			Object.fromEntries(
				CLASSES.map((k) => [
					k,
					{
						plan: r.classes[k].rule.planDays?.toString() ?? "",
						close: r.classes[k].rule.closeDays?.toString() ?? "",
						untilNext: Boolean(r.classes[k].rule.untilNextAudit),
					},
				]),
			) as Record<
				FollowUpClass,
				{ plan: string; close: string; untilNext: boolean }
			>,
	);
	const [anchors, setAnchors] = useState(r.anchors);
	const anchorKinds: AuditCycleKind[] = [
		...(r.cycles.some((c) => FROM_CERTIFICATE.has(c.kind))
			? (["certification"] as const)
			: []),
		...r.cycles.map((c) => c.kind).filter((k) => !FROM_CERTIFICATE.has(k)),
	];
	const anchorLabel = (k: AuditCycleKind) =>
		k === "certification"
			? t("anchorCertificate")
			: t("anchorLast", {
					label: r.cycles.find((c) => c.kind === k)?.label ?? k,
				});
	const next = r.upcoming[0];
	const id = (x: string) => `ar-${r.framework}-${x}`;
	const toDays = (v: string) => (v.trim() === "" ? null : Number(v));

	const build = (reset: boolean): OrgAuditSetting | null => {
		const cleanAnchors = Object.fromEntries(
			Object.entries(anchors).filter(([, v]) => Boolean(v)),
		);
		const hasAnchors = Object.keys(cleanAnchors).length > 0;
		if (reset) return hasAnchors ? { anchors: cleanAnchors } : null;
		const cycles = r.cycles
			.filter((c) => Number(months[c.kind]) !== c.defaultMonths)
			.map((c) => ({ kind: c.kind, everyMonths: Number(months[c.kind]) }));
		const classes: Partial<Record<FollowUpClass, FollowUpRule>> = {};
		for (const k of CLASSES) {
			const rule: FollowUpRule = {
				planDays: toDays(rules[k].plan),
				closeDays: toDays(rules[k].close),
				...(rules[k].untilNext ? { untilNextAudit: true } : {}),
			};
			const def = r.classes[k].defaultRule;
			if (
				rule.planDays !== def.planDays ||
				rule.closeDays !== def.closeDays ||
				Boolean(rule.untilNextAudit) !== Boolean(def.untilNextAudit)
			)
				classes[k] = rule;
		}
		const setting: OrgAuditSetting = {
			...(cycles.length > 0 ? { cycles } : {}),
			...(Object.keys(classes).length > 0 ? { classes } : {}),
			...(hasAnchors ? { anchors: cleanAnchors } : {}),
		};
		return Object.keys(setting).length > 0 ? setting : null;
	};

	const save = (reset: boolean) =>
		start(async () => {
			const res = await withStepUp(() =>
				updateAuditRegime({ framework: r.framework, setting: build(reset) }),
			);
			if (!res.ok)
				return void toast.error(
					res.error === "step_up_required"
						? t("stepUp")
						: res.fieldErrors
							? t("invalid")
							: tc("error"),
				);
			toast.success(reset ? t("resetDone") : t("saved"));
			router.refresh();
		});

	return (
		<details className="group">
			<summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
				<span className="flex min-w-0 flex-wrap items-baseline gap-2">
					<span className="font-medium">{r.name}</span>
					<span className="text-muted-foreground text-xs">{r.label}</span>
					{r.custom && (
						<Badge variant="outline" className="normal-case tracking-normal">
							{t("custom")}
						</Badge>
					)}
				</span>
				<span className="text-muted-foreground text-xs tabular-nums">
					{next
						? t("nextAudit", { label: next.label, date: day(next.date) })
						: t("noDate")}
				</span>
			</summary>
			<form
				className="flex flex-col gap-6 px-4 pt-1 pb-5"
				onSubmit={(e) => {
					e.preventDefault();
					save(false);
				}}
			>
				<p className="text-muted-foreground text-xs">
					{t("source")}: {r.source}
				</p>

				<fieldset className="flex flex-col gap-3">
					<legend className="mb-2 font-medium">{t("cyclesTitle")}</legend>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{r.cycles.map((c) => (
							<div key={c.kind} className="flex flex-col gap-1">
								<Label htmlFor={id(`m-${c.kind}`)}>{c.label}</Label>
								<div className="flex items-center gap-2">
									<Input
										id={id(`m-${c.kind}`)}
										name={`months-${c.kind}`}
										type="number"
										inputMode="numeric"
										min={0}
										max={120}
										className="w-24"
										value={months[c.kind]}
										disabled={!canEdit || pending}
										onChange={(e) =>
											setMonths((m) => ({ ...m, [c.kind]: e.target.value }))
										}
									/>
									<span className="text-muted-foreground text-xs">
										{Number(months[c.kind]) === 0
											? t("once")
											: t("everyMonths")}
									</span>
								</div>
							</div>
						))}
					</div>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{anchorKinds.map((k) => (
							<div key={k} className="flex flex-col gap-1">
								<Label htmlFor={id(`a-${k}`)}>{anchorLabel(k)}</Label>
								<Input
									id={id(`a-${k}`)}
									name={`anchor-${k}`}
									type="date"
									autoComplete="off"
									className="w-44"
									value={anchors[k] ?? ""}
									disabled={!canEdit || pending}
									onChange={(e) =>
										setAnchors((a) => ({ ...a, [k]: e.target.value }))
									}
								/>
							</div>
						))}
					</div>
					{r.missing.length > 0 && (
						<p className="text-muted-foreground text-xs">
							{t("missingAnchors", {
								list: r.missing
									.map((k) => r.cycles.find((c) => c.kind === k)?.label ?? k)
									.join(", "),
							})}
						</p>
					)}
				</fieldset>

				<fieldset className="flex flex-col gap-2">
					<legend className="mb-2 font-medium">{t("classesTitle")}</legend>
					<p className="text-muted-foreground text-xs">{t("classesLead")}</p>
					<div className="overflow-x-auto">
						<table className="w-full min-w-[34rem] text-left">
							<thead className="text-muted-foreground text-xs">
								<tr>
									<th className="py-1 pr-3 font-normal">{t("class")}</th>
									<th className="py-1 pr-3 font-normal">{t("planDays")}</th>
									<th className="py-1 pr-3 font-normal">{t("closeDays")}</th>
									<th className="py-1 font-normal">{t("untilNextAudit")}</th>
								</tr>
							</thead>
							<tbody>
								{CLASSES.map((k) => (
									<tr key={k} className="border-border/60 border-t">
										<td className="py-2 pr-3">{r.classes[k].label}</td>
										{(["plan", "close"] as const).map((f) => (
											<td key={f} className="py-2 pr-3">
												<Input
													aria-label={`${r.classes[k].label}: ${t(f === "plan" ? "planDays" : "closeDays")}`}
													name={`${k}-${f}`}
													type="number"
													inputMode="numeric"
													min={1}
													max={1095}
													placeholder={t("noDeadline")}
													className="w-24"
													value={rules[k][f]}
													disabled={!canEdit || pending}
													onChange={(e) =>
														setRules((x) => ({
															...x,
															[k]: { ...x[k], [f]: e.target.value },
														}))
													}
												/>
											</td>
										))}
										<td className="py-2">
											<Checkbox
												aria-label={`${r.classes[k].label}: ${t("untilNextAudit")}`}
												checked={rules[k].untilNext}
												disabled={!canEdit || pending}
												onCheckedChange={(v) =>
													setRules((x) => ({
														...x,
														[k]: { ...x[k], untilNext: v === true },
													}))
												}
											/>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</fieldset>

				{r.upcoming.length > 0 && (
					<div className="flex flex-col gap-1">
						<h4 className="font-medium">{t("upcomingTitle")}</h4>
						<ul className="flex flex-col gap-0.5 text-xs tabular-nums">
							{r.upcoming.slice(0, 6).map((u) => (
								<li key={`${u.kind}-${u.date}`}>
									{day(u.date)} · {u.label}
								</li>
							))}
						</ul>
					</div>
				)}

				{canEdit && (
					<div className="flex flex-wrap gap-2">
						<Button type="submit" size="sm" disabled={pending}>
							{pending ? `${t("save")}…` : t("save")}
						</Button>
						{r.custom && (
							<Button
								type="button"
								size="sm"
								variant="outline"
								disabled={pending}
								onClick={() => save(true)}
							>
								{t("reset")}
							</Button>
						)}
					</div>
				)}
			</form>
		</details>
	);
}
