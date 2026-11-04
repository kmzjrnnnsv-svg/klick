"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	advanceProvider,
	completeProviderExit,
	requestProvider,
	setProviderExitItem,
	startProviderExit,
	updateProviderDetails,
} from "@/app/actions/supplier-lifecycle";
import { useGateFeedback } from "@/components/approvals/use-gate-feedback";
import type { MemberOption } from "@/components/entity/owner-assignee";
import { ResponsibleSelect } from "@/components/entity/responsible-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/components/ui/confirm-alert";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { errorText } from "@/components/ui/error-text";
import { FormAlert } from "@/components/ui/form-alert";
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
import { useParamOpen } from "@/components/ui/use-param-open";
import type { ProviderExitItem } from "@/db/schema/enums";

// Lebenszyklus eines Dienstleisters (L1): Bedarf melden, Bedarf annehmen
// oder ablehnen, in Betrieb nehmen, Angaben zu Auslagerung und Ausstieg.

function useFail() {
	const t = useTranslations("SupplierLifecycle");
	const tc = useTranslations("Common");
	const gate = useGateFeedback();
	return (res: { error?: string; ref?: string }) =>
		res.error === "wrong_stage"
			? t("errWrongStage")
			: res.error === "exit_incomplete"
				? t("errExitIncomplete")
				: res.error === "statusLocked"
					? t("errLocked")
					: (gate.errorText(res.error ?? "") ?? errorText(tc, res));
}

// Bedarf melden: was gebraucht wird und wofür; die Prüfung übernimmt danach
// die Auslagerungs- bzw. Lieferantensteuerung
export function ProviderRequestForm({ members }: { members: MemberOption[] }) {
	const t = useTranslations("SupplierLifecycle");
	const tc = useTranslations("Common");
	const fail = useFail();
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [d, setD] = useState({
		name: "",
		serviceDescription: "",
		reason: "",
		processesPersonalData: false,
		isIct: true,
		ownerUserId: null as string | null,
	});
	const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) =>
		setD({ ...d, [k]: v });
	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				if (!o) setError(null);
			}}
		>
			<DialogTrigger asChild>
				<Button size="sm" variant="secondary">
					{t("request")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl">
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						start(async () => {
							setError(null);
							const res = await requestProvider({
								...d,
								reason: d.reason || undefined,
								ownerUserId: d.ownerUserId,
							});
							if (!res.ok) return setError(fail(res));
							toast.success(t("requested"), {
								action: {
									label: t("open"),
									onClick: () => router.push(`/dienstleister/${res.data.id}`),
								},
							});
							setOpen(false);
							router.refresh();
						});
					}}
				>
					<DialogHeader>
						<DialogTitle>{t("requestTitle")}</DialogTitle>
						<DialogDescription>{t("requestLead")}</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="rq-name">{t("requestName")}</Label>
						<Input
							id="rq-name"
							value={d.name}
							onChange={(e) => set("name", e.target.value)}
							placeholder={t("requestNameHint")}
							required
							maxLength={200}
							autoComplete="off"
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="rq-what">{t("requestWhat")}</Label>
						<Textarea
							id="rq-what"
							rows={3}
							value={d.serviceDescription}
							onChange={(e) => set("serviceDescription", e.target.value)}
							placeholder={t("requestWhatHint")}
							required
							minLength={10}
							maxLength={4000}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="rq-why">{t("requestWhy")}</Label>
						<Textarea
							id="rq-why"
							rows={2}
							value={d.reason}
							onChange={(e) => set("reason", e.target.value)}
							placeholder={t("requestWhyHint")}
							maxLength={4000}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label>{t("requestOwner")}</Label>
						<ResponsibleSelect
							value={d.ownerUserId}
							onChange={(v) => set("ownerUserId", v)}
							members={members}
							aria-label={t("requestOwner")}
						/>
						<p className="text-muted-foreground text-footnote">
							{t("requestOwnerHint")}
						</p>
					</div>
					<div className="flex flex-col gap-3 text-subhead">
						<label className="flex items-center gap-2">
							<Checkbox
								checked={d.isIct}
								onCheckedChange={(v) => set("isIct", Boolean(v))}
							/>
							{t("requestIct")}
						</label>
						<label className="flex items-center gap-2">
							<Checkbox
								checked={d.processesPersonalData}
								onCheckedChange={(v) =>
									set("processesPersonalData", Boolean(v))
								}
							/>
							{t("requestPersonalData")}
						</label>
					</div>
					<FormAlert message={error} />
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpen(false)}
						>
							{tc("cancel")}
						</Button>
						<Button
							type="submit"
							disabled={
								pending ||
								!d.name.trim() ||
								d.serviceDescription.trim().length < 10
							}
						>
							{pending ? t("sending") : t("requestSubmit")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// Nächster Schritt in der Stufenleiste: Bedarf annehmen oder ablehnen bzw.
// in Betrieb nehmen
export function ProviderStepActions({
	providerId,
	step,
	ready,
}: {
	providerId: string;
	// request = Bedarf entscheiden, activate = in Betrieb nehmen
	step: "request" | "activate";
	// Pflichtpunkte bis Betrieb erledigt (sonst Hinweis im Knopf)
	ready: boolean;
}) {
	const t = useTranslations("SupplierLifecycle");
	const tc = useTranslations("Common");
	const gate = useGateFeedback();
	const fail = useFail();
	const router = useRouter();
	const [pending, start] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [declineOpen, setDeclineOpen] = useState(false);
	const [note, setNote] = useState("");
	const run = (s: "accept" | "decline" | "activate", n?: string) =>
		start(async () => {
			setError(null);
			const res = await advanceProvider({ providerId, step: s, note: n });
			if (!res.ok) return setError(fail(res));
			if (res.data.approvalPending) toast.info(gate.pendingText());
			else
				toast.success(
					s === "accept"
						? t("accepted")
						: s === "decline"
							? t("declined")
							: t("activated"),
				);
			setDeclineOpen(false);
			router.refresh();
		});
	if (step === "activate")
		return (
			<div className="flex flex-col gap-2">
				<div className="flex flex-wrap items-center gap-2">
					<Button
						type="button"
						size="sm"
						disabled={pending}
						variant={ready ? "default" : "secondary"}
						onClick={() => run("activate")}
					>
						{t("activate")}
					</Button>
					{!ready && (
						<span className="text-muted-foreground text-footnote">
							{t("activateOpen")}
						</span>
					)}
				</div>
				<FormAlert message={error} />
			</div>
		);
	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap gap-2">
				<Button
					type="button"
					size="sm"
					disabled={pending}
					onClick={() => run("accept")}
				>
					{t("accept")}
				</Button>
				<Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
					<DialogTrigger asChild>
						<Button type="button" size="sm" variant="secondary">
							{t("decline")}
						</Button>
					</DialogTrigger>
					<DialogContent className="sm:max-w-lg">
						<form
							className="flex flex-col gap-4"
							onSubmit={(e) => {
								e.preventDefault();
								run("decline", note);
							}}
						>
							<DialogHeader>
								<DialogTitle>{t("declineTitle")}</DialogTitle>
								<DialogDescription>{t("declineLead")}</DialogDescription>
							</DialogHeader>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="rq-decline">{t("declineNote")}</Label>
								<Textarea
									id="rq-decline"
									rows={3}
									value={note}
									onChange={(e) => setNote(e.target.value)}
									placeholder={t("declineNoteHint")}
									minLength={10}
									maxLength={2000}
									required
								/>
							</div>
							<FormAlert message={error} />
							<DialogFooter>
								<Button
									type="button"
									variant="ghost"
									onClick={() => setDeclineOpen(false)}
								>
									{tc("cancel")}
								</Button>
								<Button
									type="submit"
									variant="destructive"
									disabled={pending || note.trim().length < 10}
								>
									{t("decline")}
								</Button>
							</DialogFooter>
						</form>
					</DialogContent>
				</Dialog>
			</div>
			{!declineOpen && <FormAlert message={error} />}
		</div>
	);
}

type Sub = { name: string; country?: string; service?: string };

export type ProviderDetailsDraft = {
	lei: string | null;
	substitutability: "easy" | "difficult" | "not_substitutable" | null;
	dpaSignedAt: string | null;
	subcontractors: Sub[] | null;
	exitStrategy: string | null;
	exitPlanTestedAt: string | null;
};

const SUBST = ["easy", "difficult", "not_substitutable"] as const;

// Angaben zu Auslagerung und Ausstieg: Ersetzbarkeit, LEI, AVV,
// Unterauftragnehmer, Ausstiegsstrategie und deren Test
export function ProviderDetailsForm({
	providerId,
	initial,
	openParam,
}: {
	providerId: string;
	initial: ProviderDetailsDraft;
	// öffnet sich bei `?<openParam>=1` (Links aus dem Lebenszyklus)
	openParam?: string;
}) {
	const t = useTranslations("SupplierLifecycle");
	const tc = useTranslations("Common");
	const fail = useFail();
	const router = useRouter();
	const [open, setOpen] = useParamOpen(openParam);
	const [pending, start] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [d, setD] = useState<ProviderDetailsDraft>(initial);
	// „keine Unterauftragnehmer“ ist eine Angabe, „nicht erfasst“ keine
	const [noSubs, setNoSubs] = useState(
		initial.subcontractors !== null && initial.subcontractors.length === 0,
	);
	const set = <K extends keyof ProviderDetailsDraft>(
		k: K,
		v: ProviderDetailsDraft[K],
	) => setD({ ...d, [k]: v });
	const subs = d.subcontractors ?? [];
	const setSub = (i: number, patch: Partial<Sub>) =>
		set(
			"subcontractors",
			subs.map((s, j) => (j === i ? { ...s, ...patch } : s)),
		);
	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				if (o) {
					setD(initial);
					setError(null);
				}
			}}
		>
			<DialogTrigger asChild>
				<Button size="sm" variant="ghost">
					{tc("edit")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						const cleaned = noSubs
							? []
							: subs
									.map((s) => ({
										name: s.name.trim(),
										country:
											s.country?.trim().toUpperCase().slice(0, 2) || undefined,
										service: s.service?.trim() || undefined,
									}))
									.filter((s) => s.name);
						start(async () => {
							setError(null);
							const res = await updateProviderDetails({
								providerId,
								lei: d.lei ?? "",
								substitutability: d.substitutability,
								dpaSignedAt: d.dpaSignedAt || null,
								// angekreuzt = keine; ohne Zeilen = nicht erfasst
								subcontractors: noSubs
									? []
									: cleaned.length > 0
										? cleaned
										: null,
								exitStrategy: d.exitStrategy ?? null,
								exitPlanTestedAt: d.exitPlanTestedAt || null,
							});
							if (!res.ok) return setError(fail(res));
							toast.success(t("detailsSaved"));
							setOpen(false);
							router.refresh();
						});
					}}
				>
					<DialogHeader>
						<DialogTitle>{t("detailsTitle")}</DialogTitle>
						<DialogDescription>{t("detailsLead")}</DialogDescription>
					</DialogHeader>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="pd-subst">{t("substitutability")}</Label>
							<Select
								value={d.substitutability ?? "none"}
								onValueChange={(v) =>
									set(
										"substitutability",
										v === "none" ? null : (v as (typeof SUBST)[number]),
									)
								}
							>
								<SelectTrigger id="pd-subst" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">{tc("notSet")}</SelectItem>
									{SUBST.map((s) => (
										<SelectItem key={s} value={s}>
											{t(`subst_${s}`)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="pd-lei">{t("lei")}</Label>
							<Input
								id="pd-lei"
								value={d.lei ?? ""}
								onChange={(e) => set("lei", e.target.value)}
								placeholder="529900T8BM49AURSDO55"
								maxLength={20}
								autoComplete="off"
								spellCheck={false}
								className="font-mono"
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="pd-dpa">{t("dpaSignedAt")}</Label>
							<Input
								id="pd-dpa"
								type="date"
								value={d.dpaSignedAt ?? ""}
								onChange={(e) => set("dpaSignedAt", e.target.value || null)}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="pd-exit-test">{t("exitPlanTestedAt")}</Label>
							<Input
								id="pd-exit-test"
								type="date"
								value={d.exitPlanTestedAt ?? ""}
								onChange={(e) =>
									set("exitPlanTestedAt", e.target.value || null)
								}
							/>
						</div>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="pd-exit">{t("exitStrategy")}</Label>
						<Textarea
							id="pd-exit"
							rows={3}
							value={d.exitStrategy ?? ""}
							onChange={(e) => set("exitStrategy", e.target.value)}
							placeholder={t("exitStrategyHint")}
							maxLength={4000}
						/>
					</div>
					<fieldset className="flex flex-col gap-2">
						<legend className="mb-1 font-medium text-subhead">
							{t("subcontractors")}
						</legend>
						<label className="flex items-center gap-2 text-subhead">
							<Checkbox
								checked={noSubs}
								onCheckedChange={(v) => setNoSubs(Boolean(v))}
							/>
							{t("noSubcontractors")}
						</label>
						{!noSubs && (
							<>
								{subs.map((s, i) => (
									<div
										// biome-ignore lint/suspicious/noArrayIndexKey: Zeilen ohne eigene Kennung
										key={i}
										className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_5rem_1fr_auto]"
									>
										<Input
											aria-label={t("subName")}
											placeholder={t("subName")}
											value={s.name}
											onChange={(e) => setSub(i, { name: e.target.value })}
											maxLength={200}
										/>
										<Input
											aria-label={t("subCountry")}
											placeholder="DE"
											value={s.country ?? ""}
											onChange={(e) => setSub(i, { country: e.target.value })}
											maxLength={2}
										/>
										<Input
											aria-label={t("subService")}
											placeholder={t("subService")}
											value={s.service ?? ""}
											onChange={(e) => setSub(i, { service: e.target.value })}
											maxLength={200}
										/>
										<Button
											type="button"
											size="icon"
											variant="ghost"
											aria-label={tc("remove")}
											onClick={() =>
												set(
													"subcontractors",
													subs.filter((_, j) => j !== i),
												)
											}
										>
											<Trash2 aria-hidden="true" />
										</Button>
									</div>
								))}
								<div>
									<Button
										type="button"
										size="sm"
										variant="ghost"
										onClick={() =>
											set("subcontractors", [...subs, { name: "" }])
										}
									>
										<Plus aria-hidden="true" />
										{t("addSubcontractor")}
									</Button>
								</div>
							</>
						)}
					</fieldset>
					<FormAlert message={error} />
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpen(false)}
						>
							{tc("cancel")}
						</Button>
						<Button type="submit" disabled={pending}>
							{tc("save")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// Ausstieg beginnen (L3): Begründung und geplantes Ende; je nach Ablauf erst
// nach Freigabe „Im Ausstieg“
export function StartExitDialog({ providerId }: { providerId: string }) {
	const t = useTranslations("SupplierLifecycle");
	const tc = useTranslations("Common");
	const gate = useGateFeedback();
	const fail = useFail();
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [reason, setReason] = useState("");
	const [plannedEnd, setPlannedEnd] = useState("");
	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				if (!o) setError(null);
			}}
		>
			<DialogTrigger asChild>
				<Button type="button" size="sm" variant="ghost">
					{t("exitStart")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						start(async () => {
							setError(null);
							const res = await startProviderExit({
								providerId,
								reason,
								plannedEnd: plannedEnd || null,
							});
							if (!res.ok) return setError(fail(res));
							if (res.data.approvalPending) toast.info(gate.pendingText());
							else toast.success(t("exitStarted"));
							setOpen(false);
							router.refresh();
						});
					}}
				>
					<DialogHeader>
						<DialogTitle>{t("exitTitle")}</DialogTitle>
						<DialogDescription>{t("exitLead")}</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="ex-reason">{t("exitReason")}</Label>
						<Textarea
							id="ex-reason"
							rows={3}
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							placeholder={t("exitReasonHint")}
							minLength={10}
							maxLength={2000}
							required
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="ex-end">{t("exitPlannedEnd")}</Label>
						<Input
							id="ex-end"
							type="date"
							value={plannedEnd}
							onChange={(e) => setPlannedEnd(e.target.value)}
							className="sm:max-w-56"
						/>
					</div>
					<FormAlert message={error} />
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpen(false)}
						>
							{tc("cancel")}
						</Button>
						<Button
							type="submit"
							variant="destructive"
							disabled={pending || reason.trim().length < 10}
						>
							{t("exitStart")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// Checkliste des Ausstiegs: abhaken mit Datum, abschließen erst vollständig
export function ExitChecklist({
	providerId,
	items,
	canEdit,
	complete,
}: {
	providerId: string;
	items: { key: ProviderExitItem; required: boolean; doneAt: string | null }[];
	canEdit: boolean;
	complete: boolean;
}) {
	const t = useTranslations("SupplierLifecycle");
	const fail = useFail();
	const router = useRouter();
	const [pending, start] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const confirm = useConfirm({
		title: t("exitCompleteTitle"),
		description: t("exitCompleteLead"),
		confirmLabel: t("exitComplete"),
	});
	const fmt = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "medium",
		timeZone: "Europe/Berlin",
	});
	return (
		<div className="flex flex-col gap-3">
			<ul className="flex flex-col gap-2">
				{items.map((i) => (
					<li key={i.key}>
						<label className="flex items-start gap-2">
							<Checkbox
								checked={i.doneAt !== null}
								disabled={!canEdit || pending}
								onCheckedChange={(v) =>
									start(async () => {
										setError(null);
										const res = await setProviderExitItem({
											providerId,
											item: i.key,
											done: Boolean(v),
										});
										if (!res.ok) return setError(fail(res));
										router.refresh();
									})
								}
								className="mt-0.5"
							/>
							<span className="flex flex-col">
								<span>
									{t(`exitItem_${i.key}`)}
									{!i.required && (
										<span className="ml-2 text-muted-foreground text-footnote">
											{t("recommended")}
										</span>
									)}
								</span>
								{i.doneAt && (
									<span className="text-muted-foreground text-footnote">
										{t("exitDoneAt", {
											date: fmt.format(new Date(`${i.doneAt}T12:00:00Z`)),
										})}
									</span>
								)}
							</span>
						</label>
					</li>
				))}
			</ul>
			{canEdit && (
				<div className="flex flex-wrap items-center gap-2">
					<Button
						type="button"
						size="sm"
						disabled={pending || !complete}
						onClick={() =>
							confirm.ask(() =>
								start(async () => {
									setError(null);
									const res = await completeProviderExit({ providerId });
									if (!res.ok) return setError(fail(res));
									toast.success(t("exitCompleted"));
									router.refresh();
								}),
							)
						}
					>
						{t("exitComplete")}
					</Button>
					{!complete && (
						<span className="text-muted-foreground text-footnote">
							{t("exitCompleteOpen")}
						</span>
					)}
				</div>
			)}
			<FormAlert message={error} />
			{confirm.node}
		</div>
	);
}
