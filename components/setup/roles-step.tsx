"use client";

import { ChevronRight, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	completeSetupStep,
	setupAssignFunction,
	setupRemoveAssignment,
} from "@/app/actions/setup";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { InviteLinkPanel } from "@/components/team/invite-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { toast } from "@/components/ui/toast";
import type { RoleFunction } from "@/db/schema/enums";
import type { PersonView } from "@/lib/compliance/function-holders";
import { useStepRunner } from "./step-footer";

type Fn = {
	function: RoleFunction;
	title: string;
	hint: string | null;
	legalBasis: string | null;
	required: boolean;
	deputyRequired: boolean;
	more: boolean;
};
type Assignment = {
	id: string;
	function: RoleFunction;
	userId: string | null;
	externalName: string | null;
	pendingEmail: string | null;
	deputyUserId: string | null;
	userName: string | null;
	deputyName: string | null;
};
type Member = { userId: string; name: string; email: string };
type Mode = "me" | "member" | "invite" | "external";
const KLICK_ROLES = ["editor", "viewer", "auditor", "consultant"] as const;
const RIGHTS = ["Owner", "Editor", "Viewer", "Auditor", "Consultant"] as const;

// Schritt 1 (D1): Funktionen im Unternehmen besetzen und Rechte in Klick
// vergeben. Je Funktion mehrere Personen (z. B. zwei Geschäftsführer:innen),
// je Person mehrere Funktionen; „Wer trägt was“ zeigt die Funktionstrennung.
export function RolesStep({
	functions,
	assignments,
	people,
	members,
	currentUserId,
	nextHref,
}: {
	functions: Fn[];
	assignments: Assignment[];
	people: PersonView[];
	members: Member[];
	currentUserId: string;
	nextHref: string;
}) {
	const t = useTranslations("Setup");
	const tt = useTranslations("Team");
	const { pending, run } = useStepRunner(nextHref);
	const card = (f: Fn) => (
		<FunctionCard
			key={f.function}
			fn={f}
			rows={assignments.filter((a) => a.function === f.function)}
			members={members}
			currentUserId={currentUserId}
		/>
	);
	const more = functions.filter((f) => f.more);
	return (
		<div className="flex flex-col gap-8">
			<ul className="flex flex-col gap-3">
				{functions.filter((f) => !f.more).map(card)}
			</ul>

			{more.length > 0 && (
				<details className="group flex flex-col gap-3">
					<summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md font-semibold text-headline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
						<ChevronRight
							aria-hidden="true"
							className="size-5 text-muted-foreground transition-transform group-open:rotate-90"
						/>
						{t("moreFunctions")}
						<span className="font-normal text-muted-foreground tabular-nums">
							{more.length}
						</span>
					</summary>
					<p className="mb-3 text-muted-foreground text-subhead">
						{t("moreFunctionsLead")}
					</p>
					<ul className="flex flex-col gap-3">{more.map(card)}</ul>
				</details>
			)}

			<WhoHoldsWhat people={people} />

			<section className="flex flex-col gap-2 rounded-2xl bg-card p-4 text-subhead">
				<h2 className="font-semibold text-headline">{t("rightsTitle")}</h2>
				<p className="text-muted-foreground">{t("rightsLead")}</p>
				<dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[max-content_minmax(0,1fr)]">
					{RIGHTS.map((r) => (
						<div key={r} className="contents">
							<dt className="font-medium">{tt(`role${r}`)}</dt>
							<dd className="text-muted-foreground">{tt(`role${r}Hint`)}</dd>
						</div>
					))}
				</dl>
			</section>

			<div className="flex justify-end">
				<Button
					disabled={pending}
					onClick={() => run(() => completeSetupStep({ step: "rollen" }))}
				>
					{t("next")}
				</Button>
			</div>
		</div>
	);
}

// je Person ihre Funktionen, darunter die Hinweise zur Funktionstrennung
function WhoHoldsWhat({ people }: { people: PersonView[] }) {
	const t = useTranslations("Setup");
	const conflicts = people.some((p) => p.sod.length > 0);
	return (
		<section className="flex flex-col gap-2">
			<h2 className="font-semibold text-headline">{t("whoTitle")}</h2>
			<p className="max-w-2xl text-muted-foreground text-subhead">
				{t("whoLead")}
			</p>
			{people.length === 0 ? (
				<p className="rounded-2xl bg-card p-4 text-muted-foreground text-subhead">
					{t("whoEmpty")}
				</p>
			) : (
				<ul className="list-inset rounded-2xl bg-card text-subhead">
					{people.map((p) => (
						<li key={p.key} className="flex flex-col gap-1 px-4 py-3">
							<p className="flex flex-wrap items-center gap-2">
								<span className="font-medium">{p.name}</span>
								{p.kind === "invite" && (
									<Badge variant="warning">{t("pending")}</Badge>
								)}
								{p.kind === "external" && (
									<Badge variant="muted">{t("external")}</Badge>
								)}
							</p>
							<p className="text-muted-foreground">
								{p.functions
									.map((f) =>
										f.as === "deputy"
											? `${f.title} (${t("asDeputy")})`
											: f.title,
									)
									.join(", ")}
							</p>
							{p.sod.map((v) => (
								<p key={v.code} className="flex flex-wrap items-baseline gap-2">
									<Badge
										variant={v.severity === "block" ? "destructive" : "warning"}
									>
										{v.severity === "block" ? t("sodBlock") : t("sodWarn")}
									</Badge>
									<span>{v.text}</span>
								</p>
							))}
						</li>
					))}
				</ul>
			)}
			{people.length > 0 && !conflicts && (
				<p className="text-muted-foreground text-footnote">{t("sodOk")}</p>
			)}
		</section>
	);
}

function FunctionCard({
	fn,
	rows,
	members,
	currentUserId,
}: {
	fn: Fn;
	rows: Assignment[];
	members: Member[];
	currentUserId: string;
}) {
	const t = useTranslations("Setup");
	const [adding, setAdding] = useState(false);
	const deputyMissing =
		fn.deputyRequired && rows.length > 0 && !rows.some((r) => r.deputyUserId);
	return (
		<li className="flex flex-col gap-3 rounded-2xl bg-card p-4 text-subhead">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="min-w-0">
					<p className="flex flex-wrap items-center gap-2 font-medium">
						{fn.title}
						{fn.required && <Badge variant="outline">{t("required")}</Badge>}
						{deputyMissing && (
							<Badge variant="warning">{t("deputyMissing")}</Badge>
						)}
					</p>
					{fn.hint && (
						<p className="text-muted-foreground text-footnote">{fn.hint}</p>
					)}
					{fn.legalBasis && (
						<p className="text-footnote text-muted-foreground">
							{fn.legalBasis}
							{fn.deputyRequired && ` · ${t("deputyRequired")}`}
						</p>
					)}
				</div>
				{!adding && (
					<Button
						size="sm"
						variant={rows.length === 0 ? "outline" : "ghost"}
						onClick={() => setAdding(true)}
					>
						{rows.length === 0 ? (
							t("assignNow")
						) : (
							<>
								<Plus aria-hidden="true" />
								{t("addPerson")}
							</>
						)}
					</Button>
				)}
			</div>
			{rows.length > 0 && (
				<ul className="list-inset -mx-4">
					{rows.map((r) => (
						<HolderLine
							key={r.id}
							fn={fn}
							row={r}
							rows={rows}
							members={members}
							currentUserId={currentUserId}
						/>
					))}
				</ul>
			)}
			{adding && (
				<AssignmentEditor
					fn={fn}
					taken={rows}
					members={members}
					currentUserId={currentUserId}
					onDone={() => setAdding(false)}
				/>
			)}
		</li>
	);
}

function HolderLine({
	fn,
	row,
	rows,
	members,
	currentUserId,
}: {
	fn: Fn;
	row: Assignment;
	rows: Assignment[];
	members: Member[];
	currentUserId: string;
}) {
	const t = useTranslations("Setup");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [editing, setEditing] = useState(false);
	const name = row.userName ?? row.externalName ?? row.pendingEmail ?? "—";
	if (editing)
		return (
			<li className="px-4 py-3">
				<AssignmentEditor
					fn={fn}
					row={row}
					taken={rows.filter((r) => r.id !== row.id)}
					members={members}
					currentUserId={currentUserId}
					onDone={() => setEditing(false)}
				/>
			</li>
		);
	return (
		<li className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
			<span className="min-w-0">
				<span className="font-medium">{name}</span>
				{row.pendingEmail && (
					<Badge variant="warning" className="ml-2">
						{t("pending")}
					</Badge>
				)}
				{!row.userId && !row.pendingEmail && (
					<Badge variant="muted" className="ml-2">
						{t("external")}
					</Badge>
				)}
				{row.deputyName && row.deputyUserId !== row.userId && (
					<span className="text-muted-foreground text-footnote">
						{" "}
						· {t("asDeputy")}: {row.deputyName}
					</span>
				)}
			</span>
			<span className="flex gap-1">
				<Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
					{t("change")}
				</Button>
				<Button
					size="sm"
					variant="ghost"
					disabled={pending}
					onClick={() =>
						start(async () => {
							const res = await withStepUp(() =>
								setupRemoveAssignment({ id: row.id }),
							);
							if (!res.ok) return void toast.error(errorText(tc, res));
							toast.success(t("removed"));
							router.refresh();
						})
					}
				>
					{t("remove")}
				</Button>
			</span>
		</li>
	);
}

function initialMode(
	row: Assignment | undefined,
	currentUserId: string,
	hasOthers: boolean,
): Mode {
	if (!row) return hasOthers ? "member" : "invite";
	if (row.userId === currentUserId) return "me";
	if (row.userId) return "member";
	if (row.pendingEmail) return "invite";
	return "external";
}

// Besetzen oder ändern: eine Person je Zeile; dieselbe Person nicht zweimal
// in derselben Funktion, die Vertretung nie die Person selbst
function AssignmentEditor({
	fn,
	row,
	taken,
	members,
	currentUserId,
	onDone,
}: {
	fn: Fn;
	row?: Assignment;
	taken: Assignment[];
	members: Member[];
	currentUserId: string;
	onDone: () => void;
}) {
	const t = useTranslations("Setup");
	const tt = useTranslations("Team");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const busy = new Set(taken.flatMap((r) => (r.userId ? [r.userId] : [])));
	const others = members.filter(
		(m) => m.userId !== currentUserId && !busy.has(m.userId),
	);
	const [mode, setMode] = useState<Mode>(
		initialMode(row, currentUserId, others.length > 0),
	);
	const [userId, setUserId] = useState(
		row?.userId && row.userId !== currentUserId
			? row.userId
			: (others[0]?.userId ?? ""),
	);
	const [name, setName] = useState(row?.externalName ?? "");
	const [email, setEmail] = useState(row?.pendingEmail ?? "");
	const [role, setRole] = useState<(typeof KLICK_ROLES)[number]>("editor");
	const [sendMail, setSendMail] = useState(true);
	const [deputy, setDeputy] = useState(row?.deputyUserId ?? "none");
	const [error, setError] = useState<string | null>(null);
	const [invite, setInvite] = useState<{
		url: string;
		mailed: boolean | null;
	} | null>(null);
	const id = `fn-${fn.function}-${row?.id ?? "neu"}`;
	const holder =
		mode === "me" ? currentUserId : mode === "member" ? userId : null;
	const modes = (["me", "member", "invite", "external"] as const).filter(
		(m) => m !== "me" || !busy.has(currentUserId),
	);

	function save() {
		const deputyUserId = deputy === "none" ? null : deputy;
		const base = { id: row?.id, function: fn.function, deputyUserId };
		const input =
			mode === "me"
				? { ...base, mode }
				: mode === "member"
					? { ...base, mode, userId }
					: mode === "invite"
						? { ...base, mode, name, email, role, sendMail }
						: { ...base, mode, name };
		setError(null);
		start(async () => {
			const res = await withStepUp(() => setupAssignFunction(input));
			if (!res.ok) {
				const field = "fieldErrors" in res ? res.fieldErrors : undefined;
				return void setError(field?.deputyUserId?.[0] ?? errorText(tc, res));
			}
			toast.success(res.data.inviteUrl ? t("invited") : t("assigned"));
			if (res.data.inviteUrl)
				setInvite({ url: res.data.inviteUrl, mailed: res.data.mailed });
			else onDone();
			router.refresh();
		});
	}

	const valid =
		(mode === "me" ||
			(mode === "member" && userId) ||
			(mode === "invite" && name.trim() && /.+@.+\..+/.test(email)) ||
			(mode === "external" && name.trim())) &&
		(deputy === "none" || deputy !== holder);

	if (invite)
		return (
			<InviteLinkPanel
				url={invite.url}
				mailed={invite.mailed}
				hint={t("inviteHint")}
				onDone={() => {
					setInvite(null);
					onDone();
				}}
			/>
		);

	return (
		<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
			<div className="flex flex-col gap-1.5">
				<Label htmlFor={`${id}-mode`}>{t("mode")}</Label>
				<Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
					<SelectTrigger id={`${id}-mode`} className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{modes.map((m) => (
							<SelectItem key={m} value={m}>
								{t(`mode_${m}`)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			{mode === "member" && (
				<div className="flex flex-col gap-1.5">
					<Label htmlFor={`${id}-user`}>{t("person")}</Label>
					<Select value={userId} onValueChange={setUserId}>
						<SelectTrigger id={`${id}-user`} className="w-full">
							<SelectValue placeholder="—" />
						</SelectTrigger>
						<SelectContent>
							{members
								.filter((m) => !busy.has(m.userId) || m.userId === row?.userId)
								.map((m) => (
									<SelectItem key={m.userId} value={m.userId}>
										{m.name}
									</SelectItem>
								))}
						</SelectContent>
					</Select>
				</div>
			)}
			{(mode === "invite" || mode === "external") && (
				<div className="flex flex-col gap-1.5">
					<Label htmlFor={`${id}-name`}>{t("name")}</Label>
					<Input
						id={`${id}-name`}
						value={name}
						autoComplete="off"
						onChange={(e) => setName(e.target.value)}
					/>
				</div>
			)}
			{mode === "invite" && (
				<>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor={`${id}-email`}>{t("email")}</Label>
						<Input
							id={`${id}-email`}
							type="email"
							inputMode="email"
							autoComplete="off"
							spellCheck={false}
							value={email}
							onChange={(e) => setEmail(e.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor={`${id}-role`}>{t("klickRole")}</Label>
						<Select
							value={role}
							onValueChange={(v) => setRole(v as typeof role)}
						>
							<SelectTrigger id={`${id}-role`} className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{KLICK_ROLES.map((r) => (
									<SelectItem key={r} value={r}>
										{tt(
											`role${r[0]?.toUpperCase()}${r.slice(1)}` as "roleEditor",
										)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</>
			)}
			<div className="flex flex-col gap-1.5">
				<Label htmlFor={`${id}-deputy`}>
					{fn.deputyRequired ? t("asDeputy") : t("deputy")}
				</Label>
				<Select value={deputy} onValueChange={setDeputy}>
					<SelectTrigger id={`${id}-deputy`} className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="none">{t("noDeputy")}</SelectItem>
						{members
							.filter((m) => m.userId !== holder)
							.map((m) => (
								<SelectItem key={m.userId} value={m.userId}>
									{m.name}
								</SelectItem>
							))}
					</SelectContent>
				</Select>
			</div>
			{mode === "invite" && (
				<label className="flex items-center gap-2 text-subhead sm:self-end sm:pb-2">
					<Checkbox
						checked={sendMail}
						onCheckedChange={(v) => setSendMail(Boolean(v))}
					/>
					{t("sendMail")}
				</label>
			)}
			<FormAlert message={error} className="sm:col-span-2" />
			<div className="flex items-end gap-2 sm:col-span-2">
				<Button size="sm" disabled={pending || !valid} onClick={save}>
					{t("assign")}
				</Button>
				<Button size="sm" variant="ghost" onClick={onDone}>
					{tc("cancel")}
				</Button>
			</div>
		</div>
	);
}
