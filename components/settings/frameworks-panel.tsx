"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { addFrameworks, updateProfileFlags } from "@/app/actions/frameworks";
import { useWorkflowsEnabledText } from "@/components/approvals/workflows-enabled";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { SynergyPreviewPanel } from "@/components/auth/synergy-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { errorText } from "@/components/ui/error-text";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import type { CaspService, LicenceStage } from "@/db/schema/enums";
import type { FrameworkRemovalImpact } from "@/lib/compliance/framework-removal";
import { cn } from "@/lib/utils";
import { RemoveFrameworkDialog } from "./remove-framework-dialog";

export type FrameworkListItem = {
	slug: string;
	name: string;
	description: string | null;
	hasIndex: boolean;
	coveragePct: number | null;
	ownerName?: string | null;
	// aktiv: Vorschau für „Entfernen…“; verfügbar: früher aktiv (retired)
	removal?: FrameworkRemovalImpact;
	retired?: boolean;
};

const NIS2 = [
	"unchecked",
	"not_affected",
	"affected_pending",
	"affected_registered",
] as const;

// Tab „Rahmenwerke & Stufe": aktive Rahmenwerke, Hinzufügen mit
// Synergie-Report, Profil-Schalter (TLPT-Benennung, NIS2-Status).
export function FrameworksPanel({
	active,
	available,
	profile,
	canEdit,
}: {
	active: FrameworkListItem[];
	available: FrameworkListItem[];
	profile: {
		sector: string;
		licenceStage: LicenceStage;
		caspServices: CaspService[];
		tlptDesignated: boolean;
		nis2Status: (typeof NIS2)[number];
	};
	canEdit: boolean;
}) {
	const t = useTranslations("Settings");
	const tf = useTranslations("Frameworks");
	const enabledText = useWorkflowsEnabledText();
	const tc = useTranslations("Common");
	const router = useRouter();
	const [picked, setPicked] = useState<string[]>([]);
	const [pending, start] = useTransition();
	const currentSlugs = active.map((a) => a.slug);

	function handleError(error: string) {
		toast.error(
			error === "step_up_required" ? t("stepUp") : errorText(tc, error),
		);
	}

	return (
		<div className="flex flex-col gap-6">
			<Card>
				<CardHeader>
					<CardTitle className="text-headline">
						{t("frameworksActive")}
					</CardTitle>
					<CardDescription>{t("frameworksLead")}</CardDescription>
				</CardHeader>
				<CardContent>
					<ul className="flex flex-col divide-y divide-border/60 text-subhead">
						{active.map((f) => (
							<li
								key={f.slug}
								className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2"
							>
								<span className="min-w-0">
									<span className="font-medium">{f.name}</span>
									{f.ownerName && (
										<span className="text-muted-foreground">
											{" "}
											· {f.ownerName}
										</span>
									)}
								</span>
								<span className="ml-auto flex shrink-0 items-center gap-2">
									{f.hasIndex ? (
										<Badge
											variant={f.coveragePct === 100 ? "success" : "outline"}
										>
											{f.coveragePct === null
												? "—"
												: `${Math.round(f.coveragePct)}\u00a0%`}
										</Badge>
									) : (
										<Badge variant="muted">P4/P5</Badge>
									)}
									{canEdit && f.removal && (
										<RemoveFrameworkDialog name={f.name} impact={f.removal} />
									)}
								</span>
							</li>
						))}
					</ul>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-headline">
						{t("frameworksAvailable")}
					</CardTitle>
					<CardDescription>{tf("addLead")}</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{available.length === 0 ? (
						<p className="text-muted-foreground text-subhead">{t("noMore")}</p>
					) : (
						<>
							<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
								{available.map((f) => {
									const checked = picked.includes(f.slug);
									return (
										<label
											key={f.slug}
											className={cn(
												"flex cursor-pointer gap-3 rounded-2xl bg-card p-3 text-subhead transition-colors hover:bg-muted/50",
												checked && "border-primary/60 bg-primary/5",
												!canEdit && "cursor-default opacity-70",
											)}
										>
											<Checkbox
												checked={checked}
												disabled={!canEdit}
												onCheckedChange={(v) =>
													setPicked(
														v
															? [...picked, f.slug]
															: picked.filter((s) => s !== f.slug),
													)
												}
												className="mt-0.5"
											/>
											<span>
												<span className="font-medium">{f.name}</span>
												{f.retired && (
													<Badge
														variant="muted"
														className="ml-2"
														title={t("frameworkRetiredHint")}
													>
														{t("frameworkRetired")}
													</Badge>
												)}
												{f.description && (
													<span className="mt-0.5 block line-clamp-2 text-muted-foreground text-footnote">
														{f.description}
													</span>
												)}
											</span>
										</label>
									);
								})}
							</div>
							{picked.length > 0 && (
								<SynergyPreviewPanel
									frameworks={[...currentSlugs, ...picked]}
									sector={profile.sector}
									licenceStage={profile.licenceStage}
									caspServices={profile.caspServices}
									current={currentSlugs}
									names={Object.fromEntries(
										[...active, ...available].map((f) => [f.slug, f.name]),
									)}
								/>
							)}
							{canEdit && (
								<div className="flex justify-end">
									<Button
										disabled={pending || picked.length === 0}
										onClick={() =>
											start(async () => {
												const res = await withStepUp(() =>
													addFrameworks({ frameworks: picked }),
												);
												if (!res.ok) {
													handleError(res.error);
													return;
												}
												const enabled = enabledText(res.data.workflowsEnabled);
												toast.success(tf("added"), {
													description: enabled,
													duration: enabled ? 8000 : undefined,
												});
												setPicked([]);
												router.refresh();
											})
										}
									>
										{t("addFrameworks")}
									</Button>
								</div>
							)}
						</>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-headline">{t("stage")}</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-5 text-subhead">
					<dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
						<div>
							<dt className="font-medium text-footnote text-muted-foreground">
								{t("stage")}
							</dt>
							<dd>{profile.licenceStage}</dd>
						</div>
						<div>
							<dt className="font-medium text-footnote text-muted-foreground">
								{t("sector")}
							</dt>
							<dd>{profile.sector}</dd>
						</div>
						<div>
							<dt className="font-medium text-footnote text-muted-foreground">
								{t("caspServices")}
							</dt>
							<dd>
								{profile.caspServices.length > 0
									? profile.caspServices.join(", ")
									: "—"}
							</dd>
						</div>
					</dl>
					<div className="flex items-start justify-between gap-4 rounded-2xl bg-card p-3">
						<div>
							<Label htmlFor="tlpt">{t("tlpt")}</Label>
							<p className="text-muted-foreground text-footnote">
								{t("tlptHint")}
							</p>
						</div>
						<Switch
							id="tlpt"
							checked={profile.tlptDesignated}
							disabled={!canEdit || pending}
							onCheckedChange={(v) =>
								start(async () => {
									const res = await withStepUp(() =>
										updateProfileFlags({ tlptDesignated: v }),
									);
									if (!res.ok) handleError(res.error);
									else {
										toast.success(t("saved"));
										router.refresh();
									}
								})
							}
						/>
					</div>
					{currentSlugs.includes("nis2") && (
						<div className="flex flex-col gap-1.5">
							<Label>{t("nis2Status")}</Label>
							<Select
								value={profile.nis2Status}
								disabled={!canEdit || pending}
								onValueChange={(v) =>
									start(async () => {
										const res = await withStepUp(() =>
											updateProfileFlags({
												nis2Status: v as (typeof NIS2)[number],
											}),
										);
										if (!res.ok) handleError(res.error);
										else {
											toast.success(t("saved"));
											router.refresh();
										}
									})
								}
							>
								<SelectTrigger className="w-full sm:w-80">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{NIS2.map((s) => (
										<SelectItem key={s} value={s}>
											{t(`nis2_${s}`)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
