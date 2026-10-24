"use client";

import { ClipboardCheck, Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	completeSupplierAssessment,
	createPortalLink,
	reopenSupplierAssessment,
	revokePortalLinks,
	startSupplierAssessment,
	updateContractClauses,
} from "@/app/actions/supplier-assessments";
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
import { Input, nativeSelectCompactClass } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type TemplateOption = {
	code: "nis2-sw" | "cra-sw" | "dora-ikt";
	title: string;
	description: string;
	questions: number;
};

// Fragebogen am Dienstleister starten: Vorlage, Ansprechpartner, Frist.
export function StartSupplierAssessmentDialog({
	providerId,
	templates,
	defaultTemplate,
	contact,
}: {
	providerId: string;
	templates: TemplateOption[];
	defaultTemplate: TemplateOption["code"];
	contact: { name: string | null; email: string | null };
}) {
	const t = useTranslations("Suppliers");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [template, setTemplate] = useState(defaultTemplate);
	const [name, setName] = useState(contact.name ?? "");
	const [email, setEmail] = useState(contact.email ?? "");
	const inFourWeeks = new Date(Date.now() + 28 * 86_400_000)
		.toISOString()
		.slice(0, 10);
	const [dueAt, setDueAt] = useState(inFourWeeks);
	const chosen = templates.find((x) => x.code === template);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm">
					<ClipboardCheck aria-hidden="true" />
					{t("start")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						start(async () => {
							const res = await startSupplierAssessment({
								providerId,
								templateCode: template,
								contactName: name || undefined,
								contactEmail: email || undefined,
								dueAt: dueAt || null,
							});
							if (!res.ok)
								return void toast.error(
									res.fieldErrors?.contactEmail
										? t("emailInvalid")
										: tc("error"),
								);
							toast.success(
								res.data.existing ? t("startedExisting") : t("started"),
							);
							setOpen(false);
							router.refresh();
						});
					}}
				>
					<DialogHeader>
						<DialogTitle>{t("startTitle")}</DialogTitle>
						<DialogDescription>{t("startLead")}</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="sa-template">{t("template")}</Label>
						<Select
							value={template}
							onValueChange={(v) => setTemplate(v as TemplateOption["code"])}
						>
							<SelectTrigger id="sa-template" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{templates.map((x) => (
									<SelectItem key={x.code} value={x.code}>
										{x.title}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{chosen && (
							<p className="text-muted-foreground text-footnote">
								{chosen.description}{" "}
								{t("questionCount", { n: chosen.questions })}
							</p>
						)}
					</div>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="sa-name">{t("contactName")}</Label>
							<Input
								id="sa-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								autoComplete="off"
								maxLength={200}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="sa-email">{t("contactEmail")}</Label>
							<Input
								id="sa-email"
								type="email"
								inputMode="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								autoComplete="off"
								spellCheck={false}
							/>
						</div>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="sa-due">{t("dueAt")}</Label>
						<Input
							id="sa-due"
							type="date"
							value={dueAt}
							onChange={(e) => setDueAt(e.target.value)}
						/>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setOpen(false)}
						>
							{tc("cancel")}
						</Button>
						<Button type="submit" disabled={pending}>
							{pending ? `${t("start")}…` : t("start")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// Portal-Link erzeugen (ersetzt ältere) und optional per Mail schicken.
// Der Link wird nur hier einmal angezeigt.
export function PortalLinkDialog({
	assessmentId,
	contactEmail,
	hasActiveLink,
}: {
	assessmentId: string;
	contactEmail: string | null;
	hasActiveLink: boolean;
}) {
	const t = useTranslations("Suppliers");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [days, setDays] = useState("30");
	const [sendMail, setSendMail] = useState(Boolean(contactEmail));
	const [url, setUrl] = useState<string | null>(null);
	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				if (!o) setUrl(null);
			}}
		>
			<DialogTrigger asChild>
				<Button size="sm" variant={hasActiveLink ? "outline" : "default"}>
					<Link2 aria-hidden="true" />
					{hasActiveLink ? t("newLink") : t("createLink")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{t("linkTitle")}</DialogTitle>
					<DialogDescription>{t("linkLead")}</DialogDescription>
				</DialogHeader>
				{url ? (
					<div className="flex flex-col gap-3">
						<Input
							readOnly
							value={url}
							aria-label={t("linkTitle")}
							className="font-mono text-footnote"
							onFocus={(e) => e.currentTarget.select()}
						/>
						<p className="text-muted-foreground text-footnote">
							{t("linkOnce")}
						</p>
						<DialogFooter>
							<Button
								variant="outline"
								onClick={() =>
									navigator.clipboard
										.writeText(url)
										.then(() => toast.success(t("copied")))
										.catch(() => toast.error(tc("error")))
								}
							>
								{t("copy")}
							</Button>
							<Button onClick={() => setOpen(false)}>{t("done")}</Button>
						</DialogFooter>
					</div>
				) : (
					<form
						className="flex flex-col gap-4"
						onSubmit={(e) => {
							e.preventDefault();
							start(async () => {
								const res = await createPortalLink({
									assessmentId,
									expiresInDays: Number(days),
									sendMail: sendMail && Boolean(contactEmail),
								});
								if (!res.ok) return void toast.error(tc("error"));
								setUrl(res.data.url);
								if (sendMail && contactEmail)
									toast[res.data.mailed ? "success" : "warning"](
										res.data.mailed
											? t("mailed", { email: contactEmail })
											: t("mailFailed"),
									);
								router.refresh();
							});
						}}
					>
						{hasActiveLink && (
							<p role="alert" className="text-subhead">
								{t("replaceWarning")}
							</p>
						)}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="pl-days">{t("validity")}</Label>
							<Select value={days} onValueChange={setDays}>
								<SelectTrigger id="pl-days" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{["14", "30", "60"].map((d) => (
										<SelectItem key={d} value={d}>
											{t("days", { n: Number(d) })}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						{contactEmail ? (
							<label className="flex items-start gap-2 text-subhead">
								<Checkbox
									checked={sendMail}
									onCheckedChange={(v) => setSendMail(Boolean(v))}
									className="mt-0.5"
								/>
								<span>{t("sendMail", { email: contactEmail })}</span>
							</label>
						) : (
							<p className="text-muted-foreground text-footnote">
								{t("noEmail")}
							</p>
						)}
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => setOpen(false)}
							>
								{tc("cancel")}
							</Button>
							<Button type="submit" disabled={pending}>
								{pending ? `${t("createLink")}…` : t("createLink")}
							</Button>
						</DialogFooter>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}

export function RevokeLinkButton({ assessmentId }: { assessmentId: string }) {
	const t = useTranslations("Suppliers");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm" variant="ghost">
					{t("revoke")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{t("revokeTitle")}</DialogTitle>
					<DialogDescription>{t("revokeLead")}</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)}>
						{tc("cancel")}
					</Button>
					<Button
						variant="destructive"
						disabled={pending}
						onClick={() =>
							start(async () => {
								const res = await revokePortalLinks({ assessmentId });
								if (!res.ok) return void toast.error(tc("error"));
								toast.success(t("revoked"));
								setOpen(false);
								router.refresh();
							})
						}
					>
						{pending ? `${t("revoke")}…` : t("revoke")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

const DECISIONS = ["accept", "accept_with_conditions", "reject"] as const;

// Abschluss mit Entscheidung; Score/Rating aus der Bewertung als Vorschau.
export function CompleteSupplierDialog({
	assessmentId,
	providerId,
	score,
	rating,
	knockouts,
	unanswered,
}: {
	assessmentId: string;
	providerId: string;
	score: number | null;
	rating: string | null;
	knockouts: string[];
	unanswered: number;
}) {
	const t = useTranslations("Suppliers");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [decision, setDecision] =
		useState<(typeof DECISIONS)[number]>("accept");
	const [note, setNote] = useState("");
	const needsNote = decision !== "accept";
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button>{t("complete")}</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						start(async () => {
							const res = await completeSupplierAssessment({
								assessmentId,
								decision,
								decisionNote: note || undefined,
							});
							if (!res.ok)
								return void toast.error(
									res.fieldErrors?.decisionNote
										? t("noteRequired")
										: tc("error"),
								);
							toast.success(
								res.data.taskId ? t("completedWithTask") : t("completed"),
							);
							setOpen(false);
							router.push(`/dienstleister/${providerId}?tab=bewertungen`);
						});
					}}
				>
					<DialogHeader>
						<DialogTitle>{t("completeTitle")}</DialogTitle>
						<DialogDescription>{t("completeLead")}</DialogDescription>
					</DialogHeader>
					<p className="text-subhead">
						{t("completeScore", {
							score: score ?? "—",
							rating: rating ?? "—",
						})}
						{knockouts.length > 0 &&
							` ${t("completeKnockouts", { list: knockouts.join(", ") })}`}
						{unanswered > 0 && ` ${t("completeOpen", { n: unanswered })}`}
					</p>
					<fieldset className="flex flex-col gap-2">
						<legend className="mb-1 font-medium text-subhead">
							{t("decision")}
						</legend>
						{DECISIONS.map((d) => (
							<label
								key={d}
								className={cn(
									"flex cursor-pointer items-start gap-2 rounded-xl bg-card px-3 py-2 text-subhead has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50",
									decision === d && "border-primary bg-primary/5",
								)}
							>
								<input
									type="radio"
									name="decision"
									value={d}
									className="mt-1"
									checked={decision === d}
									onChange={() => setDecision(d)}
								/>
								<span>
									<span className="font-medium">{t(`decision_${d}`)}</span>
									<span className="block text-muted-foreground text-footnote">
										{t(`decisionHint_${d}`)}
									</span>
								</span>
							</label>
						))}
					</fieldset>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="sa-note">
							{needsNote ? t("decisionNoteRequired") : t("decisionNote")}
						</Label>
						<Textarea
							id="sa-note"
							rows={3}
							value={note}
							onChange={(e) => setNote(e.target.value)}
							required={needsNote}
							minLength={needsNote ? 10 : undefined}
						/>
					</div>
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
							disabled={pending || (needsNote && note.trim().length < 10)}
						>
							{pending ? `${t("complete")}…` : t("complete")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// Zur Nachbesserung zurückgeben — die Notiz sieht der Lieferant im Portal.
export function ReopenSupplierDialog({
	assessmentId,
}: {
	assessmentId: string;
}) {
	const t = useTranslations("Suppliers");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [note, setNote] = useState("");
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline">{t("reopen")}</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						start(async () => {
							const res = await reopenSupplierAssessment({
								assessmentId,
								note,
							});
							if (!res.ok) return void toast.error(tc("error"));
							toast.success(t("reopened"));
							setOpen(false);
							router.refresh();
						});
					}}
				>
					<DialogHeader>
						<DialogTitle>{t("reopenTitle")}</DialogTitle>
						<DialogDescription>{t("reopenLead")}</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="sa-reopen">{t("reopenNote")}</Label>
						<Textarea
							id="sa-reopen"
							rows={3}
							value={note}
							onChange={(e) => setNote(e.target.value)}
							required
							minLength={3}
						/>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setOpen(false)}
						>
							{tc("cancel")}
						</Button>
						<Button type="submit" disabled={pending || note.trim().length < 3}>
							{pending ? `${t("reopen")}…` : t("reopen")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

type ClauseValue = true | false | "teilweise" | "nicht anwendbar";
const CLAUSE_OPTIONS = ["open", "yes", "partial", "no", "na"] as const;
type ClauseOption = (typeof CLAUSE_OPTIONS)[number];

function toOption(v: boolean | string | undefined): ClauseOption {
	if (v === true) return "yes";
	if (v === false) return "no";
	if (v === "teilweise") return "partial";
	if (v === "nicht anwendbar") return "na";
	return "open";
}

function fromOption(o: ClauseOption): ClauseValue | null {
	return o === "yes"
		? true
		: o === "no"
			? false
			: o === "partial"
				? "teilweise"
				: o === "na"
					? "nicht anwendbar"
					: null;
}

// Klausel-Checkliste DORA Art. 30: je Klausel erfüllt/teilweise/fehlt/n. a.;
// Abs. 3 nur bei kritischen oder wichtigen Funktionen verpflichtend.
export function ContractClausesForm({
	providerId,
	clauses,
	values,
	canEdit,
}: {
	providerId: string;
	clauses: {
		code: string;
		title: string;
		text: string;
		criticalOnly: boolean;
		required: boolean;
	}[];
	values: Record<string, boolean | string>;
	canEdit: boolean;
}) {
	const t = useTranslations("Suppliers");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [state, setState] = useState<Record<string, ClauseOption>>(() =>
		Object.fromEntries(clauses.map((c) => [c.code, toOption(values[c.code])])),
	);
	const dirty = clauses.some((c) => state[c.code] !== toOption(values[c.code]));
	return (
		<form
			className="flex flex-col gap-3"
			onSubmit={(e) => {
				e.preventDefault();
				start(async () => {
					const res = await updateContractClauses({
						providerId,
						clauses: Object.fromEntries(
							clauses.map((c) => [c.code, fromOption(state[c.code] ?? "open")]),
						),
					});
					if (!res.ok) return void toast.error(tc("error"));
					toast.success(t("clausesSaved"));
					router.refresh();
				});
			}}
		>
			<ul className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-2xl bg-card">
				{clauses.map((c) => (
					<li
						key={c.code}
						className={cn(
							"flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-start sm:justify-between",
							!c.required && "opacity-70",
						)}
					>
						<span className="min-w-0 text-subhead">
							<span className="font-mono text-footnote" translate="no">
								Art. {c.code}
							</span>{" "}
							<span className="font-medium">{c.title}</span>
							{c.criticalOnly && (
								<span className="text-muted-foreground text-footnote">
									{" "}
									· {t("criticalOnly")}
								</span>
							)}
							<span className="block text-muted-foreground text-footnote">
								{c.text}
							</span>
						</span>
						<select
							aria-label={`Art. ${c.code} ${c.title}`}
							className={cn(
								nativeSelectCompactClass,
								"w-full shrink-0 sm:w-40",
							)}
							value={state[c.code] ?? "open"}
							disabled={!canEdit || pending}
							onChange={(e) =>
								setState((s) => ({
									...s,
									[c.code]: e.target.value as ClauseOption,
								}))
							}
						>
							{CLAUSE_OPTIONS.map((o) => (
								<option key={o} value={o}>
									{t(`clause_${o}`)}
								</option>
							))}
						</select>
					</li>
				))}
			</ul>
			{canEdit && (
				<div className="flex justify-end">
					<Button type="submit" disabled={pending || !dirty}>
						{pending ? `${tc("save")}…` : tc("save")}
					</Button>
				</div>
			)}
		</form>
	);
}
