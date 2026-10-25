"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { setupAssignAreas } from "@/app/actions/setup";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { Button } from "@/components/ui/button";
import { errorText } from "@/components/ui/error-text";
import { FormAlert } from "@/components/ui/form-alert";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import type { RoleFunction } from "@/db/schema/enums";
import type { ResponsibilityArea } from "@/lib/compliance/catalog/domain-functions";

export type AreaRow = {
	area: ResponsibilityArea;
	label: string;
	total: number;
	// Controls, die noch bei dir (einrichtende Person) oder niemandem liegen
	open: number;
	// Vorbelegung: Funktion, die den Bereich schon trägt, sonst Vorschlag
	initial: RoleFunction | null;
};

const KEEP = "keep";

// „Wer ist für welchen Bereich verantwortlich?“: je Bereich eine besetzte
// Funktion; „Übernehmen“ setzt sie an den Controls, die noch bei dir liegen.
export function AreasBlock({
	areas,
	held,
}: {
	areas: AreaRow[];
	held: { function: RoleFunction; title: string }[];
}) {
	const t = useTranslations("Setup");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [choice, setChoice] = useState<Record<string, string>>(() =>
		Object.fromEntries(areas.map((a) => [a.area, a.initial ?? KEEP])),
	);
	const picked = areas
		.map((a) => ({ area: a.area, function: choice[a.area] }))
		.filter((a): a is { area: ResponsibilityArea; function: RoleFunction } =>
			Boolean(a.function && a.function !== KEEP),
		);
	const apply = () =>
		start(async () => {
			setError(null);
			const res = await withStepUp(() => setupAssignAreas({ areas: picked }));
			if (!res.ok) return setError(errorText(tc, res));
			toast.success(t("areasApplied", { n: res.data.count }));
			router.refresh();
		});
	return (
		<section className="flex flex-col gap-2" aria-labelledby="areas-title">
			<h2 id="areas-title" className="font-semibold text-headline">
				{t("areasTitle")}
			</h2>
			<p className="max-w-2xl text-muted-foreground text-subhead">
				{t("areasLead")}
			</p>
			{held.length === 0 ? (
				<p className="rounded-2xl bg-card p-4 text-muted-foreground text-subhead">
					{t("areasEmpty")}
				</p>
			) : (
				<>
					<ul className="list-inset rounded-2xl bg-card text-subhead">
						{areas.map((a) => (
							<li
								key={a.area}
								className="grid grid-cols-1 items-center gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]"
							>
								<div className="min-w-0">
									<p className="font-medium">{a.label}</p>
									<p className="text-muted-foreground text-footnote">
										{t("areasCount", { total: a.total, open: a.open })}
									</p>
								</div>
								<Select
									value={choice[a.area] ?? KEEP}
									onValueChange={(v) =>
										setChoice((c) => ({ ...c, [a.area]: v }))
									}
								>
									<SelectTrigger
										className="w-full"
										aria-label={t("areasSelect", { area: a.label })}
									>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={KEEP}>{t("areasKeep")}</SelectItem>
										{held.map((f) => (
											<SelectItem key={f.function} value={f.function}>
												{f.title}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</li>
						))}
					</ul>
					<FormAlert message={error} />
					<div className="flex flex-wrap items-center justify-between gap-3">
						<p className="max-w-xl text-muted-foreground text-footnote">
							{t("areasNote")}
						</p>
						<Button
							variant="secondary"
							disabled={pending || picked.length === 0}
							onClick={apply}
						>
							{pending ? tc("saving") : t("areasApply")}
						</Button>
					</div>
				</>
			)}
		</section>
	);
}
