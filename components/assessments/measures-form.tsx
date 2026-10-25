"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { createMeasures } from "@/app/actions/assessments";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { errorText } from "@/components/ui/error-text";
import { Input, nativeSelectCompactClass } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import type { Measure } from "@/lib/assessments/measures";

const KIND_TONE = {
	implement: "warning",
	clarify: "outline",
	evidence: "muted",
} as const;

// Maßnahmenplan: priorisierte Liste, Auswahl, Verantwortliche und Frist →
// Aufgaben am jeweiligen Control.
export function MeasuresForm({
	assessmentId,
	measures,
	members,
	defaultAssignee,
	frameworkNames,
}: {
	assessmentId: string;
	measures: Measure[];
	members: { userId: string; name: string }[];
	defaultAssignee: string;
	frameworkNames: Record<string, string>;
}) {
	const t = useTranslations("Assessment");
	const tc = useTranslations("Common");
	const router = useRouter();
	const key = (m: Measure) => `${m.kind}:${m.controlCode}`;
	const [picked, setPicked] = useState<Set<string>>(
		new Set(measures.slice(0, 10).map(key)),
	);
	const [assignee, setAssignee] = useState(defaultAssignee);
	const [dueAt, setDueAt] = useState("");
	const [pending, start] = useTransition();

	if (measures.length === 0)
		return <p className="text-subhead">{t("measuresEmpty")}</p>;

	return (
		<form
			className="flex flex-col gap-4"
			onSubmit={(e) => {
				e.preventDefault();
				const items = measures
					.filter((m) => picked.has(key(m)))
					.map((m) => ({ controlCode: m.controlCode, kind: m.kind }));
				start(async () => {
					const res = await createMeasures({
						assessmentId,
						items,
						assigneeUserId: assignee || null,
						dueAt: dueAt || null,
					});
					if (!res.ok) return void toast.error(errorText(tc, res));
					toast.success(t("measuresCreated", { count: res.data.created }));
					setPicked(new Set());
					router.refresh();
				});
			}}
		>
			<label
				htmlFor="m-all"
				className="flex cursor-pointer items-center gap-2 text-subhead"
			>
				<Checkbox
					id="m-all"
					checked={picked.size === measures.length}
					onCheckedChange={(v) =>
						setPicked(v ? new Set(measures.map(key)) : new Set())
					}
				/>
				{t("selectAll")}
			</label>
			<ol className="flex flex-col list-inset overflow-hidden rounded-2xl bg-card text-subhead">
				{measures.map((m, i) => {
					const k = key(m);
					return (
						<li key={k}>
							<label
								htmlFor={`m-${i}`}
								className="flex cursor-pointer gap-3 px-3 py-2 hover:bg-muted/40"
							>
								<Checkbox
									id={`m-${i}`}
									className="mt-0.5"
									checked={picked.has(k)}
									onCheckedChange={(v) => {
										const next = new Set(picked);
										if (v) next.add(k);
										else next.delete(k);
										setPicked(next);
									}}
								/>
								<span className="flex min-w-0 flex-1 flex-col gap-1">
									<span className="flex flex-wrap items-center gap-2">
										<span className="text-muted-foreground tabular-nums">
											{i + 1}.
										</span>
										<Badge variant={KIND_TONE[m.kind]}>
											{t(`kind_${m.kind}`)}
										</Badge>
										<span className="font-mono text-footnote" translate="no">
											{m.controlCode}
										</span>
										<span className="min-w-0 font-medium">{m.title}</span>
									</span>
									<span className="flex flex-wrap gap-x-3 text-muted-foreground text-footnote">
										<span>{t("effort", { effort: m.effort })}</span>
										{m.requirements > 0 && (
											<span>
												{t("covers", {
													count: m.requirements,
													frameworks: m.frameworks
														.map((f) => frameworkNames[f] ?? f)
														.join(", "),
												})}
											</span>
										)}
										{m.coverageAfter !== undefined && (
											<span>
												{t("coverageThen", {
													pct: `${Math.round(m.coverageAfter)} %`,
												})}
											</span>
										)}
									</span>
									{m.recommendation && (
										<span className="text-muted-foreground text-footnote">
											{m.recommendation}
										</span>
									)}
								</span>
							</label>
						</li>
					);
				})}
			</ol>
			<div className="flex flex-col gap-3 sm:flex-row sm:items-end">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="m-assignee">{t("assignTo")}</Label>
					<select
						id="m-assignee"
						className={nativeSelectCompactClass}
						value={assignee}
						onChange={(e) => setAssignee(e.target.value)}
					>
						{members.map((m) => (
							<option key={m.userId} value={m.userId}>
								{m.name}
							</option>
						))}
					</select>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="m-due">{t("dueAt")}</Label>
					<Input
						id="m-due"
						name="dueAt"
						type="date"
						value={dueAt}
						onChange={(e) => setDueAt(e.target.value)}
					/>
				</div>
				<Button type="submit" disabled={pending || picked.size === 0}>
					{t("createMeasures", { count: picked.size })}
				</Button>
			</div>
		</form>
	);
}
