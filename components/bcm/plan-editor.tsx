"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { releaseBcmPlan, saveBcmPlan } from "@/app/actions/bcm";
import type { MemberOption } from "@/components/entity/owner-assignee";
import { ResponsibleSelect } from "@/components/entity/responsible-select";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { errorText } from "@/components/ui/error-text";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type { BcmPlanContent } from "@/db/schema/bcm";
import { ALERT_CHANNELS, type AlertChannel } from "@/db/schema/enums";
import { type PlanIssue, planIssues, releasable } from "@/lib/bcm/plan";

// Notfallplan je Prozess bearbeiten: Abschnitte in der Reihenfolge, in der
// man sie im Ernstfall braucht. Speichern macht einen freigegebenen Plan
// wieder zum Entwurf; Freigeben erst ohne Lücken.
export function PlanEditor({
	processId,
	code,
	initial,
	status,
	members,
	assets,
	rtoHours,
	canExport,
}: {
	processId: string;
	code: string;
	initial: BcmPlanContent;
	status: "draft" | "released" | null;
	members: MemberOption[];
	assets: { id: string; name: string }[];
	rtoHours: number | null;
	canExport: boolean;
}) {
	const t = useTranslations("Bcm");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [c, setC] = useState<BcmPlanContent>(initial);
	const [dirty, setDirty] = useState(status === null);
	const issues: PlanIssue[] = planIssues(c, { rtoHours }, null, "");
	const set = (patch: Partial<BcmPlanContent>) => {
		setC({ ...c, ...patch });
		setDirty(true);
	};
	function rows<K extends "immediate" | "alert" | "recovery" | "contacts">(
		key: K,
	) {
		const list = c[key] as BcmPlanContent[K];
		return {
			update: (i: number, patch: Partial<BcmPlanContent[K][number]>) =>
				set({
					[key]: list.map((x, j) => (j === i ? { ...x, ...patch } : x)),
				} as Partial<BcmPlanContent>),
			remove: (i: number) =>
				set({
					[key]: list.filter((_, j) => j !== i),
				} as Partial<BcmPlanContent>),
			add: (row: BcmPlanContent[K][number]) =>
				set({ [key]: [...list, row] } as Partial<BcmPlanContent>),
		};
	}
	const immediate = rows("immediate");
	const alert = rows("alert");
	const recovery = rows("recovery");
	const contacts = rows("contacts");

	const save = () =>
		start(async () => {
			const res = await saveBcmPlan({ processId, content: c });
			if (!res.ok) return void toast.error(errorText(tc, res));
			toast.success(t("planSaved"));
			setDirty(false);
			router.refresh();
		});
	const release = () =>
		start(async () => {
			const res = await releaseBcmPlan({ processId });
			if (!res.ok)
				return void toast.error(
					res.error === "plan_incomplete"
						? t("planIncomplete")
						: errorText(tc, res),
				);
			toast.success(t("planReleased", { version: res.data.version }));
			router.refresh();
		});
	const removeLabel = tc("remove");

	return (
		<div className="flex flex-col gap-8">
			{issues.length > 0 && (
				<ul className="flex flex-wrap gap-2" aria-live="polite">
					{issues.map((i) => (
						<li key={i}>
							<Badge
								variant={i === "recovery_over_rto" ? "destructive" : "warning"}
							>
								{t(`planIssue_${i}`)}
							</Badge>
						</li>
					))}
				</ul>
			)}

			<section className="flex flex-col gap-3">
				<h2 className="font-semibold text-headline">{t("planTrigger")}</h2>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="pl-trigger">{t("planTriggerLabel")}</Label>
					<Textarea
						id="pl-trigger"
						rows={2}
						value={c.trigger}
						onChange={(e) => set({ trigger: e.target.value })}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="pl-by">{t("planActivatedBy")}</Label>
					<Input
						id="pl-by"
						value={c.activatedBy}
						onChange={(e) => set({ activatedBy: e.target.value })}
						autoComplete="off"
					/>
				</div>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="font-semibold text-headline">{t("planImmediate")}</h2>
				<ol className="flex flex-col gap-2">
					{c.immediate.map((x, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: Zeilen ohne eigene Kennung, Reihenfolge ist der Schlüssel
						<li key={i} className="flex items-center gap-2">
							<span className="w-6 shrink-0 text-right text-footnote text-muted-foreground tabular-nums">
								{i + 1}.
							</span>
							<Input
								aria-label={t("planImmediateStep", { n: i + 1 })}
								value={x.text}
								onChange={(e) => immediate.update(i, { text: e.target.value })}
							/>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								aria-label={removeLabel}
								onClick={() => immediate.remove(i)}
							>
								<Trash2 />
							</Button>
						</li>
					))}
				</ol>
				<div>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => immediate.add({ text: "" })}
					>
						<Plus />
						{t("planAddStep")}
					</Button>
				</div>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="font-semibold text-headline">{t("planAlert")}</h2>
				<p className="text-footnote text-muted-foreground">
					{t("planAlertLead")}
				</p>
				<ol className="flex flex-col gap-3">
					{c.alert.map((x, i) => (
						<li
							// biome-ignore lint/suspicious/noArrayIndexKey: Zeilen ohne eigene Kennung
							key={i}
							className="grid grid-cols-1 gap-2 rounded-xl bg-card p-3 sm:grid-cols-[1fr_10rem_8rem_auto] sm:items-end"
						>
							<div className="flex flex-col gap-1.5">
								<Label>{t("planWho")}</Label>
								<ResponsibleSelect
									value={x.who}
									onChange={(v) => alert.update(i, { who: v ?? "" })}
									members={members}
									aria-label={t("planWho")}
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label>{t("planChannel")}</Label>
								<Select
									value={x.channel}
									onValueChange={(v) =>
										alert.update(i, { channel: v as AlertChannel })
									}
								>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{ALERT_CHANNELS.map((ch) => (
											<SelectItem key={ch} value={ch}>
												{t(`channel_${ch}`)}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor={`pl-al-${i}`}>{t("planWithin")}</Label>
								<Input
									id={`pl-al-${i}`}
									type="number"
									inputMode="numeric"
									min={0}
									value={x.withinMinutes ?? ""}
									onChange={(e) =>
										alert.update(i, {
											withinMinutes:
												e.target.value === "" ? null : Number(e.target.value),
										})
									}
								/>
							</div>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								aria-label={removeLabel}
								onClick={() => alert.remove(i)}
							>
								<Trash2 />
							</Button>
						</li>
					))}
				</ol>
				<div>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() =>
							alert.add({ who: "", channel: "phone", withinMinutes: 30 })
						}
					>
						<Plus />
						{t("planAddAlert")}
					</Button>
				</div>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="font-semibold text-headline">{t("planEmergency")}</h2>
				<Textarea
					aria-label={t("planEmergency")}
					rows={3}
					value={c.emergencyMode}
					onChange={(e) => set({ emergencyMode: e.target.value })}
					placeholder={t("planEmergencyPlaceholder")}
				/>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="font-semibold text-headline">{t("planRecovery")}</h2>
				<p className="text-footnote text-muted-foreground">
					{rtoHours === null
						? t("planRecoveryLeadNoRto")
						: t("planRecoveryLead", { rto: rtoHours })}
				</p>
				<ol className="flex flex-col gap-3">
					{c.recovery.map((x, i) => (
						<li
							// biome-ignore lint/suspicious/noArrayIndexKey: Zeilen ohne eigene Kennung
							key={i}
							className="grid grid-cols-1 gap-2 rounded-xl bg-card p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_7rem_1fr_auto] lg:items-end"
						>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor={`pl-rc-${i}`}>
									{t("planRecoveryStep", { n: i + 1 })}
								</Label>
								<Input
									id={`pl-rc-${i}`}
									value={x.text}
									onChange={(e) => recovery.update(i, { text: e.target.value })}
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label>{t("planWho")}</Label>
								<ResponsibleSelect
									value={x.who || null}
									onChange={(v) => recovery.update(i, { who: v ?? "" })}
									members={members}
									aria-label={t("planWho")}
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor={`pl-rh-${i}`}>{t("planTargetHours")}</Label>
								<Input
									id={`pl-rh-${i}`}
									type="number"
									inputMode="numeric"
									min={0}
									value={x.targetHours ?? ""}
									aria-invalid={
										rtoHours !== null &&
										x.targetHours !== null &&
										x.targetHours > rtoHours
									}
									onChange={(e) =>
										recovery.update(i, {
											targetHours:
												e.target.value === "" ? null : Number(e.target.value),
										})
									}
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label>{t("planAsset")}</Label>
								<Select
									value={x.assetId ?? "none"}
									onValueChange={(v) =>
										recovery.update(i, { assetId: v === "none" ? null : v })
									}
								>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="none">{t("planAssetNone")}</SelectItem>
										{assets.map((a) => (
											<SelectItem key={a.id} value={a.id}>
												{a.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								aria-label={removeLabel}
								onClick={() => recovery.remove(i)}
							>
								<Trash2 />
							</Button>
						</li>
					))}
				</ol>
				<div>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() =>
							recovery.add({
								text: "",
								who: "",
								targetHours: null,
								assetId: null,
							})
						}
					>
						<Plus />
						{t("planAddStep")}
					</Button>
				</div>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="font-semibold text-headline">{t("planReturn")}</h2>
				<Textarea
					aria-label={t("planReturn")}
					rows={2}
					value={c.returnToNormal}
					onChange={(e) => set({ returnToNormal: e.target.value })}
				/>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="font-semibold text-headline">{t("planContacts")}</h2>
				<p className="text-footnote text-muted-foreground">
					{t("planContactsLead")}
				</p>
				<ul className="flex flex-col gap-3">
					{c.contacts.map((x, i) => (
						<li
							// biome-ignore lint/suspicious/noArrayIndexKey: Zeilen ohne eigene Kennung
							key={i}
							className="grid grid-cols-1 gap-2 rounded-xl bg-card p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end"
						>
							{(["name", "role", "phone", "mail"] as const).map((f) => (
								<div key={f} className="flex flex-col gap-1.5">
									<Label htmlFor={`pl-ct-${i}-${f}`}>{t(`contact_${f}`)}</Label>
									<Input
										id={`pl-ct-${i}-${f}`}
										value={x[f]}
										type={
											f === "mail" ? "email" : f === "phone" ? "tel" : "text"
										}
										autoComplete="off"
										spellCheck={f === "mail" ? false : undefined}
										onChange={(e) =>
											contacts.update(i, { [f]: e.target.value })
										}
									/>
								</div>
							))}
							<Button
								type="button"
								variant="ghost"
								size="icon"
								aria-label={removeLabel}
								onClick={() => contacts.remove(i)}
							>
								<Trash2 />
							</Button>
						</li>
					))}
				</ul>
				<div>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() =>
							contacts.add({ name: "", role: "", phone: "", mail: "" })
						}
					>
						<Plus />
						{t("planAddContact")}
					</Button>
				</div>
			</section>

			<div className="flex flex-wrap items-center gap-2">
				<Button type="button" onClick={save} disabled={pending || !dirty}>
					{t("planSave")}
				</Button>
				<Button
					type="button"
					variant="outline"
					onClick={release}
					disabled={
						pending || dirty || status !== "draft" || !releasable(issues)
					}
				>
					{t("planRelease")}
				</Button>
				{canExport && status !== null && (
					<a
						href={`/api/export/notfallplan.pdf?prozess=${encodeURIComponent(code)}`}
						className={buttonVariants({ variant: "ghost", size: "sm" })}
					>
						{t("planPdf")}
					</a>
				)}
				{dirty && status !== null && (
					<span className="text-footnote text-muted-foreground">
						{t("planUnsaved")}
					</span>
				)}
			</div>
		</div>
	);
}
