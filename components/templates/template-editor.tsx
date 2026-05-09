"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	deleteTemplate,
	type SaveTemplateInput,
	saveTemplate,
} from "@/app/actions/templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STAGE_KINDS, type StageKind } from "@/db/schema";

type Stage = {
	kind: StageKind;
	name: string;
	description: string;
	expectedDays: number | null;
	responsibleRole: "recruiter" | "hiring_manager" | "team" | "system";
	required: boolean;
	materials: string;
};

type StageRow = Stage & { _key: string };

function withKey(s: Stage): StageRow {
	return { ...s, _key: crypto.randomUUID() };
}

const EMPTY_STAGE: Stage = {
	kind: "recruiter_review",
	name: "",
	description: "",
	expectedDays: 5,
	responsibleRole: "recruiter",
	required: true,
	materials: "",
};

export function TemplateEditor({
	id,
	initialName = "",
	initialDescription = "",
	initialIsDefault = false,
	initialStages = [],
}: {
	id?: string;
	initialName?: string;
	initialDescription?: string;
	initialIsDefault?: boolean;
	initialStages?: Stage[];
}) {
	const t = useTranslations("Templates");
	const router = useRouter();
	const [name, setName] = useState(initialName);
	const [description, setDescription] = useState(initialDescription);
	const [isDefault, setIsDefault] = useState(initialIsDefault);
	const [stages, setStages] = useState<StageRow[]>(
		initialStages.length > 0
			? initialStages.map(withKey)
			: [withKey({ ...EMPTY_STAGE })],
	);
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	function update(idx: number, patch: Partial<Stage>) {
		setStages((s) => s.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
	}
	function addStage() {
		setStages((s) => [
			...s,
			withKey({ ...EMPTY_STAGE, name: t("newStageDefault") }),
		]);
	}
	function removeStage(idx: number) {
		setStages((s) => s.filter((_, i) => i !== idx));
	}
	function move(idx: number, dir: -1 | 1) {
		const j = idx + dir;
		if (j < 0 || j >= stages.length) return;
		const copy = stages.slice();
		[copy[idx], copy[j]] = [copy[j], copy[idx]];
		setStages(copy);
	}

	function submit() {
		setError(null);
		if (!name.trim()) {
			setError(t("nameRequired"));
			return;
		}
		const cleanStages: SaveTemplateInput["stages"] = stages
			.filter((s) => s.name.trim())
			.map((s) => ({
				kind: s.kind,
				name: s.name.trim(),
				description: s.description.trim() || null,
				expectedDays: s.expectedDays,
				responsibleRole: s.responsibleRole,
				required: s.required,
				materials: s.materials.trim() || null,
			}));
		if (cleanStages.length === 0) {
			setError(t("stagesRequired"));
			return;
		}

		startTransition(async () => {
			const res = await saveTemplate({
				id,
				name: name.trim(),
				description: description.trim(),
				isDefault,
				stages: cleanStages,
			});
			if (!res.ok) {
				setError(res.error);
				return;
			}
			router.push("/templates");
			router.refresh();
		});
	}

	function onDelete() {
		if (!id) return;
		if (!confirm(t("deleteConfirm"))) return;
		startTransition(async () => {
			const res = await deleteTemplate(id);
			if (res.ok) {
				router.push("/templates");
				router.refresh();
			} else {
				setError(res.error ?? "fehlgeschlagen");
			}
		});
	}

	return (
		<div className="space-y-6">
			<div className="space-y-3 rounded-sm border border-border bg-background p-4">
				<label className="block space-y-1.5">
					<span className="lv-eyebrow text-[0.55rem] text-muted-foreground">
						{t("nameLabel")}
					</span>
					<Input value={name} onChange={(e) => setName(e.target.value)} />
				</label>
				<label className="block space-y-1.5">
					<span className="lv-eyebrow text-[0.55rem] text-muted-foreground">
						{t("descriptionLabel")}
					</span>
					<Input
						value={description}
						onChange={(e) => setDescription(e.target.value)}
					/>
				</label>
				<label className="flex cursor-pointer items-center gap-2 text-xs">
					<input
						type="checkbox"
						checked={isDefault}
						onChange={(e) => setIsDefault(e.target.checked)}
					/>
					<span>{t("defaultLabel")}</span>
				</label>
			</div>

			<div>
				<div className="mb-2 flex items-baseline justify-between gap-2">
					<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">
						{t("stagesEyebrow")}
					</p>
					<span className="font-mono text-[10px] text-muted-foreground">
						{t("stagesHint")}
					</span>
				</div>
				<ol className="space-y-3">
					{stages.map((s, i) => (
						<li
							key={s._key}
							className="rounded-sm border border-border bg-background p-3 sm:p-4"
						>
							<div className="flex items-start gap-2">
								<div className="flex w-6 shrink-0 flex-col items-center gap-1">
									<button
										type="button"
										onClick={() => move(i, -1)}
										disabled={i === 0}
										className="text-muted-foreground hover:text-foreground disabled:opacity-30"
										aria-label={t("moveUp")}
									>
										<ArrowUp className="h-3 w-3" strokeWidth={1.5} />
									</button>
									<span className="font-mono text-[10px] text-muted-foreground">
										{i + 1}
									</span>
									<button
										type="button"
										onClick={() => move(i, 1)}
										disabled={i === stages.length - 1}
										className="text-muted-foreground hover:text-foreground disabled:opacity-30"
										aria-label={t("moveDown")}
									>
										<ArrowDown className="h-3 w-3" strokeWidth={1.5} />
									</button>
								</div>
								<div className="flex-1 space-y-2">
									<div className="grid gap-2 sm:grid-cols-2">
										<label className="block space-y-1">
											<span className="lv-eyebrow text-[0.5rem] text-muted-foreground">
												{t("stageKindLabel")}
											</span>
											<select
												value={s.kind}
												onChange={(e) =>
													update(i, { kind: e.target.value as StageKind })
												}
												className="w-full rounded-sm border border-border bg-background px-2 py-1 text-xs focus-visible:border-foreground focus-visible:outline-none"
											>
												{STAGE_KINDS.map((k) => (
													<option key={k} value={k}>
														{t(`stageKind.${k}`)}
													</option>
												))}
											</select>
										</label>
										<label className="block space-y-1">
											<span className="lv-eyebrow text-[0.5rem] text-muted-foreground">
												{t("stageNameLabel")}
											</span>
											<Input
												value={s.name}
												onChange={(e) => update(i, { name: e.target.value })}
											/>
										</label>
									</div>
									<label className="block space-y-1">
										<span className="lv-eyebrow text-[0.5rem] text-muted-foreground">
											{t("stageDescriptionLabel")}
										</span>
										<Input
											value={s.description}
											onChange={(e) =>
												update(i, { description: e.target.value })
											}
										/>
									</label>
									<div className="grid gap-2 sm:grid-cols-3">
										<label className="block space-y-1">
											<span className="lv-eyebrow text-[0.5rem] text-muted-foreground">
												{t("stageDaysLabel")}
											</span>
											<Input
												type="number"
												min={0}
												max={120}
												value={s.expectedDays ?? ""}
												onChange={(e) =>
													update(i, {
														expectedDays: e.target.value
															? Number(e.target.value)
															: null,
													})
												}
											/>
										</label>
										<label className="block space-y-1">
											<span className="lv-eyebrow text-[0.5rem] text-muted-foreground">
												{t("stageResponsibleLabel")}
											</span>
											<select
												value={s.responsibleRole}
												onChange={(e) =>
													update(i, {
														responsibleRole: e.target
															.value as Stage["responsibleRole"],
													})
												}
												className="w-full rounded-sm border border-border bg-background px-2 py-1 text-xs focus-visible:border-foreground focus-visible:outline-none"
											>
												<option value="recruiter">{t("role.recruiter")}</option>
												<option value="hiring_manager">
													{t("role.hiring_manager")}
												</option>
												<option value="team">{t("role.team")}</option>
												<option value="system">{t("role.system")}</option>
											</select>
										</label>
										<label className="flex cursor-pointer items-end gap-2 pb-1 text-xs">
											<input
												type="checkbox"
												checked={s.required}
												onChange={(e) =>
													update(i, { required: e.target.checked })
												}
											/>
											<span>{t("stageRequiredLabel")}</span>
										</label>
									</div>
								</div>
								<button
									type="button"
									onClick={() => removeStage(i)}
									className="text-muted-foreground hover:text-rose-700"
									aria-label={t("removeStage")}
									disabled={stages.length <= 1}
								>
									<Trash2 className="h-4 w-4" strokeWidth={1.5} />
								</button>
							</div>
						</li>
					))}
				</ol>
				<button
					type="button"
					onClick={addStage}
					className="mt-3 inline-flex items-center gap-1 rounded-sm border border-border border-dashed px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
				>
					<Plus className="h-3 w-3" strokeWidth={1.5} />
					{t("addStage")}
				</button>
			</div>

			{error && (
				<p className="rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-700 text-xs dark:text-rose-300">
					{error}
				</p>
			)}

			<div className="flex flex-wrap gap-2">
				<Button onClick={submit} disabled={isPending}>
					{isPending ? t("saving") : t("save")}
				</Button>
				{id && (
					<Button onClick={onDelete} variant="ghost" disabled={isPending}>
						{t("delete")}
					</Button>
				)}
			</div>
		</div>
	);
}
