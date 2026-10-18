"use client";

import { Plus, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	addEngagementFinding,
	createEngagement,
	retestFinding,
	updateEngagement,
	uploadEngagementFile,
} from "@/app/actions/engagements";
import {
	DlpWarning,
	useUploadFeedback,
} from "@/components/entity/upload-feedback";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
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
import {
	ENGAGEMENT_KINDS,
	type EngagementKind,
	FINDING_CATEGORIES,
	FINDING_SEVERITIES,
	type FindingCategory,
	type FindingSeverity,
} from "@/db/schema/enums";
import type { SecurityEngagement } from "@/db/schema/security";
import { parseCvss, severityFromScore } from "@/lib/security/cvss";

type ProductOption = { id: string; code: string; name: string };

// Neuer Sicherheitsauftrag: Art, Titel, optional Produkt — danach Umfang,
// Regeln und Beauftragung auf der Detailseite.
export function NewEngagementDialog({
	products,
}: {
	products: ProductOption[];
}) {
	const t = useTranslations("Engagements");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [kind, setKind] = useState<EngagementKind>("pentest");
	const [title, setTitle] = useState("");
	const [productId, setProductId] = useState("");
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm">
					<Plus aria-hidden="true" />
					{t("new")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						start(async () => {
							const res = await createEngagement({
								kind,
								title,
								productId: productId || null,
							});
							if (!res.ok) return void toast.error(tc("error"));
							setOpen(false);
							router.push(`/sicherheit/auftraege/${res.data.id}`);
						});
					}}
				>
					<DialogHeader>
						<DialogTitle>{t("newTitle")}</DialogTitle>
						<DialogDescription>{t("newLead")}</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="eg-kind">{t("kind")}</Label>
						<Select
							value={kind}
							onValueChange={(v) => setKind(v as EngagementKind)}
						>
							<SelectTrigger id="eg-kind" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{ENGAGEMENT_KINDS.map((k) => (
									<SelectItem key={k} value={k}>
										{t(`kind_${k}`)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<p className="text-muted-foreground text-xs">
							{t(`kindHint_${kind}`)}
						</p>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="eg-title">{t("titleLabel")}</Label>
						<Input
							id="eg-title"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder={t("titlePlaceholder")}
							required
							minLength={3}
							maxLength={200}
							autoComplete="off"
						/>
					</div>
					{products.length > 0 && (
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="eg-product">{t("product")}</Label>
							<Select
								value={productId || "none"}
								onValueChange={(v) => setProductId(v === "none" ? "" : v)}
							>
								<SelectTrigger id="eg-product" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">{t("noProduct")}</SelectItem>
									{products.map((p) => (
										<SelectItem key={p.id} value={p.id}>
											{p.code} {p.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setOpen(false)}
						>
							{tc("cancel")}
						</Button>
						<Button type="submit" disabled={pending || title.trim().length < 3}>
							{pending ? `${t("create")}…` : t("create")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

type ScopeValues = Pick<
	SecurityEngagement,
	| "scope"
	| "targets"
	| "outOfScope"
	| "rulesOfEngagement"
	| "methodology"
	| "testerExternal"
	| "testerName"
	| "testerOrg"
	| "testerEmail"
	| "startAt"
	| "endAt"
>;

// Umfang, Ziele, Regeln, Methodik, Tester, Zeitraum. Umfang/Ziele/Regeln
// sind ab Testbeginn gesperrt (scopeLocked).
export function EngagementScopeForm({
	engagementId,
	initial,
	scopeLocked,
	disabled,
}: {
	engagementId: string;
	initial: ScopeValues;
	scopeLocked: boolean;
	disabled: boolean;
}) {
	const t = useTranslations("Engagements");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [v, setV] = useState({
		scope: initial.scope ?? "",
		targets: initial.targets.join("\n"),
		outOfScope: initial.outOfScope ?? "",
		rulesOfEngagement: initial.rulesOfEngagement ?? "",
		methodology: initial.methodology ?? "",
		testerExternal: initial.testerExternal,
		testerName: initial.testerName ?? "",
		testerOrg: initial.testerOrg ?? "",
		testerEmail: initial.testerEmail ?? "",
		startAt: initial.startAt ?? "",
		endAt: initial.endAt ?? "",
	});
	const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) =>
		setV((x) => ({ ...x, [k]: val }));
	const lockScope = disabled || scopeLocked;
	return (
		<form
			className="flex flex-col gap-4 text-sm"
			onSubmit={(e) => {
				e.preventDefault();
				start(async () => {
					const targets = v.targets
						.split("\n")
						.map((x) => x.trim())
						.filter(Boolean);
					const res = await updateEngagement({
						engagementId,
						...(scopeLocked
							? {}
							: {
									scope: v.scope,
									targets,
									outOfScope: v.outOfScope,
									rulesOfEngagement: v.rulesOfEngagement,
								}),
						methodology: v.methodology,
						testerExternal: v.testerExternal,
						testerName: v.testerName,
						testerOrg: v.testerOrg,
						testerEmail: v.testerEmail,
						startAt: v.startAt || null,
						endAt: v.endAt || null,
					});
					if (!res.ok)
						return void toast.error(
							res.error === "scope_locked"
								? t("scopeLocked")
								: res.fieldErrors?.endAt
									? t("periodInvalid")
									: res.fieldErrors?.testerEmail
										? t("emailInvalid")
										: tc("error"),
						);
					toast.success(t("saved"));
					router.refresh();
				});
			}}
		>
			{scopeLocked && (
				<p className="rounded-md border border-dashed p-3 text-muted-foreground">
					{t("scopeLockedHint")}
				</p>
			)}
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="eg-scope">{t("scope")}</Label>
				<Textarea
					id="eg-scope"
					rows={3}
					value={v.scope}
					disabled={lockScope}
					placeholder={t("scopePlaceholder")}
					onChange={(e) => set("scope", e.target.value)}
				/>
			</div>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="eg-targets">{t("targets")}</Label>
					<Textarea
						id="eg-targets"
						rows={4}
						value={v.targets}
						disabled={lockScope}
						spellCheck={false}
						placeholder="https://staging.example.com…"
						className="font-mono text-xs"
						onChange={(e) => set("targets", e.target.value)}
					/>
					<p className="text-muted-foreground text-xs">{t("targetsHint")}</p>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="eg-oos">{t("outOfScope")}</Label>
					<Textarea
						id="eg-oos"
						rows={4}
						value={v.outOfScope}
						disabled={lockScope}
						placeholder={t("outOfScopePlaceholder")}
						onChange={(e) => set("outOfScope", e.target.value)}
					/>
				</div>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="eg-roe">{t("roe")}</Label>
				<Textarea
					id="eg-roe"
					rows={6}
					value={v.rulesOfEngagement}
					disabled={lockScope}
					onChange={(e) => set("rulesOfEngagement", e.target.value)}
				/>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="eg-method">{t("methodology")}</Label>
				<Textarea
					id="eg-method"
					rows={3}
					value={v.methodology}
					disabled={disabled}
					onChange={(e) => set("methodology", e.target.value)}
				/>
			</div>
			<fieldset
				className="grid grid-cols-1 gap-3 md:grid-cols-3"
				disabled={disabled}
			>
				<legend className="mb-2 font-medium">{t("tester")}</legend>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="eg-tname">{t("testerName")}</Label>
					<Input
						id="eg-tname"
						value={v.testerName}
						autoComplete="off"
						onChange={(e) => set("testerName", e.target.value)}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="eg-torg">{t("testerOrg")}</Label>
					<Input
						id="eg-torg"
						value={v.testerOrg}
						autoComplete="off"
						onChange={(e) => set("testerOrg", e.target.value)}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="eg-tmail">{t("testerEmail")}</Label>
					<Input
						id="eg-tmail"
						type="email"
						inputMode="email"
						spellCheck={false}
						autoComplete="off"
						value={v.testerEmail}
						onChange={(e) => set("testerEmail", e.target.value)}
					/>
				</div>
				<label className="flex items-center gap-2 md:col-span-3">
					<Checkbox
						checked={v.testerExternal}
						onCheckedChange={(x) => set("testerExternal", Boolean(x))}
					/>
					<span>{t("testerExternal")}</span>
				</label>
			</fieldset>
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="eg-start">{t("startAt")}</Label>
					<Input
						id="eg-start"
						type="date"
						value={v.startAt}
						disabled={disabled}
						onChange={(e) => set("startAt", e.target.value)}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="eg-end">{t("endAt")}</Label>
					<Input
						id="eg-end"
						type="date"
						value={v.endAt}
						disabled={disabled}
						onChange={(e) => set("endAt", e.target.value)}
					/>
				</div>
			</div>
			{!disabled && (
				<div className="flex justify-end">
					<Button type="submit" disabled={pending}>
						{pending ? `${tc("save")}…` : tc("save")}
					</Button>
				</div>
			)}
		</form>
	);
}

// Beauftragung oder Bericht hochladen (Pipeline: Typ, clamd, DLP).
export function EngagementFileUpload({
	engagementId,
	fileRole,
	label,
}: {
	engagementId: string;
	fileRole: "authorization" | "report";
	label: string;
}) {
	const t = useTranslations("Engagements");
	const td = useTranslations("Dlp");
	const tc = useTranslations("Common");
	const router = useRouter();
	const feedback = useUploadFeedback();
	const input = useRef<HTMLInputElement>(null);
	const [pending, start] = useTransition();
	const [dlp, setDlp] = useState<{ file: File; reasons: string[] } | null>(
		null,
	);
	const [ack, setAck] = useState(false);
	function upload(file: File, acknowledged = false) {
		const big = feedback.tooLarge(file);
		if (big) return void toast.error(big);
		start(async () => {
			const fd = new FormData();
			fd.set("engagementId", engagementId);
			fd.set("role", fileRole);
			fd.set("file", file);
			if (acknowledged) fd.set("dlpAcknowledged", "1");
			const res = await uploadEngagementFile(fd);
			if (!res.ok) {
				const warn = feedback.dlpWarning(res);
				if (warn) {
					setDlp({ file, reasons: warn });
					setAck(false);
					return;
				}
				return void toast.error(feedback.errorText(res));
			}
			setDlp(null);
			toast.success(t("uploaded", { name: file.name }));
			router.refresh();
		});
	}
	return (
		<div className="flex flex-col items-start gap-2">
			<Button
				type="button"
				size="sm"
				variant="outline"
				disabled={pending}
				onClick={() => input.current?.click()}
			>
				<Upload aria-hidden="true" />
				{pending ? `${label}…` : label}
			</Button>
			<input
				ref={input}
				type="file"
				className="sr-only"
				aria-label={label}
				accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.txt,.md"
				onChange={(e) => {
					const f = e.target.files?.[0];
					e.target.value = "";
					if (f) upload(f);
				}}
			/>
			{dlp && (
				<div className="flex w-full flex-col gap-2">
					<DlpWarning
						id={`dlp-${fileRole}`}
						reasons={dlp.reasons}
						acknowledged={ack}
						onAcknowledge={setAck}
					/>
					<div className="flex gap-2">
						<Button
							type="button"
							size="sm"
							disabled={!ack || pending}
							onClick={() => upload(dlp.file, true)}
						>
							{td("uploadAnyway")}
						</Button>
						<Button
							type="button"
							size="sm"
							variant="ghost"
							onClick={() => setDlp(null)}
						>
							{tc("cancel")}
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}

const CVSS_ERRORS = new Set([
	"cvss_format",
	"cvss_metric",
	"cvss_missing",
	"cvss_score_required",
	"severity_required",
	"engagement_state",
]);

// Befund aus dem Auftrag erfassen: Schwere direkt oder aus CVSS (3.1
// berechnet, 4.0 mit Wert aus dem Bericht).
export function AddFindingDialog({
	engagementId,
	defaultTarget,
}: {
	engagementId: string;
	defaultTarget: string;
}) {
	const t = useTranslations("Engagements");
	const ts = useTranslations("Security");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const empty = {
		title: "",
		category: "web" as FindingCategory,
		severity: "" as FindingSeverity | "",
		cvssVector: "",
		cvssScore: "",
		cwe: "",
		target: defaultTarget,
		location: "",
		description: "",
		steps: "",
		remediation: "",
	};
	const [v, setV] = useState(empty);
	const [error, setError] = useState<string | null>(null);
	const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) =>
		setV((x) => ({ ...x, [k]: val }));
	const parsed = v.cvssVector.trim() ? parseCvss(v.cvssVector) : null;
	const preview =
		parsed?.ok && parsed.version === "3.1"
			? parsed.score
			: parsed?.ok && v.cvssScore
				? Number(v.cvssScore.replace(",", "."))
				: null;
	const derived =
		preview !== null && Number.isFinite(preview)
			? severityFromScore(preview)
			: null;
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm">
					<Plus aria-hidden="true" />
					{t("addFinding")}
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-[90vh] overflow-y-auto overscroll-contain sm:max-w-2xl">
				<form
					className="flex flex-col gap-4 text-sm"
					onSubmit={(e) => {
						e.preventDefault();
						setError(null);
						start(async () => {
							const res = await addEngagementFinding({
								engagementId,
								title: v.title,
								category: v.category,
								severity: v.severity || undefined,
								cvssVector: v.cvssVector.trim() || undefined,
								cvssScore:
									parsed?.ok && parsed.version === "4.0" && v.cvssScore
										? Number(v.cvssScore.replace(",", "."))
										: undefined,
								cwe: v.cwe.trim() || undefined,
								target: v.target || undefined,
								location: v.location || undefined,
								description: v.description,
								steps: v.steps || undefined,
								remediation: v.remediation || undefined,
							});
							if (!res.ok) {
								const text = CVSS_ERRORS.has(res.error)
									? t(`err_${res.error}` as "err_cvss_format")
									: res.fieldErrors?.cwe
										? t("err_cwe")
										: tc("error");
								setError(text);
								return void toast.error(text);
							}
							toast.success(t("findingAdded"));
							setV(empty);
							setOpen(false);
							router.refresh();
						});
					}}
				>
					<DialogHeader>
						<DialogTitle>{t("addFindingTitle")}</DialogTitle>
						<DialogDescription>{t("addFindingLead")}</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="ef-title">{t("findingTitle")}</Label>
						<Input
							id="ef-title"
							value={v.title}
							required
							minLength={3}
							maxLength={300}
							autoComplete="off"
							placeholder={t("findingTitlePlaceholder")}
							onChange={(e) => set("title", e.target.value)}
						/>
					</div>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="ef-cat">{t("category")}</Label>
							<Select
								value={v.category}
								onValueChange={(x) => set("category", x as FindingCategory)}
							>
								<SelectTrigger id="ef-cat" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{FINDING_CATEGORIES.map((c) => (
										<SelectItem key={c} value={c}>
											{ts(`cat_${c}`)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="ef-sev">{t("severity")}</Label>
							<Select
								value={derived ?? (v.severity || "none")}
								disabled={derived !== null}
								onValueChange={(x) =>
									set("severity", x === "none" ? "" : (x as FindingSeverity))
								}
							>
								<SelectTrigger id="ef-sev" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">{t("severityFromCvss")}</SelectItem>
									{FINDING_SEVERITIES.map((s) => (
										<SelectItem key={s} value={s}>
											{ts(`sev_${s}`)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_8rem]">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="ef-cvss">{t("cvssVector")}</Label>
							<Input
								id="ef-cvss"
								value={v.cvssVector}
								spellCheck={false}
								autoComplete="off"
								className="font-mono text-xs"
								placeholder="CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H…"
								aria-describedby="ef-cvss-hint"
								onChange={(e) => set("cvssVector", e.target.value)}
							/>
							<p
								id="ef-cvss-hint"
								aria-live="polite"
								className="text-muted-foreground text-xs"
							>
								{parsed === null
									? t("cvssHint")
									: !parsed.ok
										? t(`err_${parsed.error}`)
										: parsed.version === "3.1"
											? t("cvssScore31", {
													score: parsed.score.toFixed(1),
													severity: ts(
														`sev_${severityFromScore(parsed.score)}`,
													),
												})
											: t("cvss40Hint")}
							</p>
						</div>
						{parsed?.ok && parsed.version === "4.0" && (
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="ef-score">{t("cvssScore")}</Label>
								<Input
									id="ef-score"
									inputMode="decimal"
									value={v.cvssScore}
									placeholder="9,3…"
									onChange={(e) => set("cvssScore", e.target.value)}
								/>
							</div>
						)}
					</div>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="ef-cwe">CWE</Label>
							<Input
								id="ef-cwe"
								value={v.cwe}
								spellCheck={false}
								autoComplete="off"
								placeholder="CWE-639…"
								onChange={(e) => set("cwe", e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="ef-target">{t("target")}</Label>
							<Input
								id="ef-target"
								value={v.target}
								spellCheck={false}
								autoComplete="off"
								onChange={(e) => set("target", e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="ef-loc">{t("location")}</Label>
							<Input
								id="ef-loc"
								value={v.location}
								spellCheck={false}
								autoComplete="off"
								placeholder="/api/orders/{id}…"
								onChange={(e) => set("location", e.target.value)}
							/>
						</div>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="ef-desc">{t("description")}</Label>
						<Textarea
							id="ef-desc"
							rows={3}
							value={v.description}
							required
							minLength={10}
							onChange={(e) => set("description", e.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="ef-steps">{t("steps")}</Label>
						<Textarea
							id="ef-steps"
							rows={3}
							value={v.steps}
							placeholder={t("stepsPlaceholder")}
							onChange={(e) => set("steps", e.target.value)}
						/>
						<p className="text-muted-foreground text-xs">{t("stepsHint")}</p>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="ef-fix">{t("remediation")}</Label>
						<Textarea
							id="ef-fix"
							rows={2}
							value={v.remediation}
							onChange={(e) => set("remediation", e.target.value)}
						/>
					</div>
					<p aria-live="polite" className="text-destructive text-xs">
						{error}
					</p>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setOpen(false)}
						>
							{tc("cancel")}
						</Button>
						<Button
							type="submit"
							disabled={
								pending ||
								v.title.trim().length < 3 ||
								v.description.trim().length < 10 ||
								(!v.severity && !derived)
							}
						>
							{pending ? `${t("addFinding")}…` : t("addFinding")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// Nachtest je Befund: bestanden oder nicht (mit Notiz, was offen ist).
export function RetestControls({ findingId }: { findingId: string }) {
	const t = useTranslations("Engagements");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [failing, setFailing] = useState(false);
	const [note, setNote] = useState("");
	function send(result: "passed" | "failed") {
		start(async () => {
			const res = await retestFinding({
				findingId,
				result,
				note: note || undefined,
			});
			if (!res.ok) return void toast.error(tc("error"));
			toast.success(
				result === "passed" ? t("retestPassed") : t("retestFailed"),
			);
			setFailing(false);
			setNote("");
			router.refresh();
		});
	}
	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap gap-2">
				<Button
					type="button"
					size="sm"
					variant="outline"
					disabled={pending}
					onClick={() => send("passed")}
				>
					{t("retestPass")}
				</Button>
				<Button
					type="button"
					size="sm"
					variant="ghost"
					disabled={pending}
					aria-expanded={failing}
					onClick={() => setFailing((x) => !x)}
				>
					{t("retestFail")}
				</Button>
			</div>
			{failing && (
				<div className="flex flex-col gap-2">
					<Label htmlFor={`rt-${findingId}`} className="text-xs">
						{t("retestNote")}
					</Label>
					<Textarea
						id={`rt-${findingId}`}
						rows={2}
						value={note}
						onChange={(e) => setNote(e.target.value)}
					/>
					<div>
						<Button
							type="button"
							size="sm"
							disabled={pending || note.trim().length < 3}
							onClick={() => send("failed")}
						>
							{t("retestFailSave")}
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}

// Management-Summary und Nachtest-Frist (Bericht).
export function EngagementSummaryForm({
	engagementId,
	summary,
	retestDueAt,
	disabled,
}: {
	engagementId: string;
	summary: string | null;
	retestDueAt: string | null;
	disabled: boolean;
}) {
	const t = useTranslations("Engagements");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [text, setText] = useState(summary ?? "");
	const [due, setDue] = useState(retestDueAt ?? "");
	return (
		<form
			className="flex flex-col gap-3 text-sm"
			onSubmit={(e) => {
				e.preventDefault();
				start(async () => {
					const res = await updateEngagement({
						engagementId,
						summary: text,
						retestDueAt: due || null,
					});
					if (!res.ok) return void toast.error(tc("error"));
					toast.success(t("saved"));
					router.refresh();
				});
			}}
		>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="eg-summary">{t("summary")}</Label>
				<Textarea
					id="eg-summary"
					rows={8}
					value={text}
					disabled={disabled}
					placeholder={t("summaryPlaceholder")}
					onChange={(e) => setText(e.target.value)}
				/>
			</div>
			<div className="flex max-w-xs flex-col gap-1.5">
				<Label htmlFor="eg-retest">{t("retestDueAt")}</Label>
				<Input
					id="eg-retest"
					type="date"
					value={due}
					disabled={disabled}
					onChange={(e) => setDue(e.target.value)}
				/>
			</div>
			{!disabled && (
				<div className="flex justify-end">
					<Button type="submit" disabled={pending}>
						{pending ? `${tc("save")}…` : tc("save")}
					</Button>
				</div>
			)}
		</form>
	);
}
