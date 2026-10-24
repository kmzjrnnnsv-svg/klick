"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	completeSetupStep,
	setupAssignFunction,
	setupRemoveAssignment,
} from "@/app/actions/setup";
import { InviteLinkPanel } from "@/components/team/invite-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { RoleFunction } from "@/db/schema/enums";
import { useStepRunner } from "./step-footer";

type Fn = {
	function: RoleFunction;
	title: string;
	hint: string | null;
	legalBasis: string | null;
	required: boolean;
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
// vergeben; Einladungen mit Link, Funktionstrennung live.
export function RolesStep({
	functions,
	assignments,
	members,
	currentUserId,
	sod,
	nextHref,
}: {
	functions: Fn[];
	assignments: Assignment[];
	members: Member[];
	currentUserId: string;
	sod: { code: string; text: string; severity: string; who: string }[];
	nextHref: string;
}) {
	const t = useTranslations("Setup");
	const tt = useTranslations("Team");
	const { pending, run } = useStepRunner(nextHref);
	return (
		<div className="flex flex-col gap-8">
			<ul className="flex flex-col gap-3">
				{functions.map((f) => (
					<FunctionRow
						key={f.function}
						fn={f}
						assignment={assignments.find((a) => a.function === f.function)}
						members={members}
						currentUserId={currentUserId}
					/>
				))}
			</ul>

			<section className="flex flex-col gap-2 rounded-2xl bg-card p-4 text-subhead">
				<h2 className="font-medium">{t("sodTitle")}</h2>
				{sod.length === 0 ? (
					<p className="text-muted-foreground">{t("sodOk")}</p>
				) : (
					<ul className="flex flex-col gap-1">
						{sod.map((v) => (
							<li key={`${v.code}-${v.who}`} className="flex gap-2">
								<Badge
									variant={v.severity === "block" ? "destructive" : "warning"}
								>
									{v.code}
								</Badge>
								<span>
									{v.who}: {v.text}
								</span>
							</li>
						))}
					</ul>
				)}
			</section>

			<section className="flex flex-col gap-2 rounded-2xl bg-card p-4 text-subhead">
				<h2 className="font-medium">{t("rightsTitle")}</h2>
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

function FunctionRow({
	fn,
	assignment,
	members,
	currentUserId,
}: {
	fn: Fn;
	assignment: Assignment | undefined;
	members: Member[];
	currentUserId: string;
}) {
	const t = useTranslations("Setup");
	const tt = useTranslations("Team");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	// zugeklappt, bis jemand „Besetzen“ oder „Ändern“ wählt — sonst wird die
	// Liste mit vielen Pflichtfunktionen unübersichtlich
	const [editing, setEditing] = useState(false);
	// allein im Team: einladen oder selbst übernehmen; sonst Mitglied wählen
	const others = members.filter((m) => m.userId !== currentUserId);
	const [mode, setMode] = useState<Mode>(
		others.length > 0 ? "member" : "invite",
	);
	const [userId, setUserId] = useState(others[0]?.userId ?? "");
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<(typeof KLICK_ROLES)[number]>("editor");
	const [sendMail, setSendMail] = useState(true);
	const [deputy, setDeputy] = useState("none");
	const [invite, setInvite] = useState<{
		url: string;
		mailed: boolean | null;
	} | null>(null);
	const id = `fn-${fn.function}`;

	const holder = assignment
		? (assignment.userName ?? assignment.externalName ?? "—")
		: null;

	function save() {
		const deputyUserId = deputy === "none" ? null : deputy;
		const input =
			mode === "me"
				? { mode, function: fn.function, deputyUserId }
				: mode === "member"
					? { mode, function: fn.function, userId, deputyUserId }
					: mode === "invite"
						? {
								mode,
								function: fn.function,
								name,
								email,
								role,
								sendMail,
								deputyUserId,
							}
						: { mode, function: fn.function, name, deputyUserId };
		start(async () => {
			const res = await setupAssignFunction(input);
			if (!res.ok) return void toast.error(tc("error"));
			toast.success(res.data.inviteUrl ? t("invited") : t("assigned"));
			if (res.data.inviteUrl)
				setInvite({ url: res.data.inviteUrl, mailed: res.data.mailed });
			setEditing(false);
			router.refresh();
		});
	}

	const valid =
		mode === "me" ||
		(mode === "member" && userId) ||
		(mode === "invite" && name.trim() && /.+@.+\..+/.test(email)) ||
		(mode === "external" && name.trim());

	return (
		<li className="flex flex-col gap-3 rounded-2xl bg-card p-4 text-subhead">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="min-w-0">
					<p className="font-medium">
						{fn.title}{" "}
						{fn.required && <Badge variant="outline">{t("required")}</Badge>}
					</p>
					{fn.hint && (
						<p className="text-muted-foreground text-footnote">{fn.hint}</p>
					)}
					{fn.legalBasis && (
						<p className="text-footnote text-muted-foreground">
							{fn.legalBasis}
						</p>
					)}
				</div>
				{!assignment && !editing && (
					<Button size="sm" variant="outline" onClick={() => setEditing(true)}>
						{t("assignNow")}
					</Button>
				)}
				{assignment && !editing && (
					<div className="flex flex-wrap items-center gap-2">
						<span>
							<span className="text-muted-foreground">{t("assignedTo")}: </span>
							<span className="font-medium">{holder}</span>
							{assignment.pendingEmail && (
								<Badge variant="warning" className="ml-1">
									{t("pending")}
								</Badge>
							)}
							{!assignment.userId && !assignment.pendingEmail && (
								<Badge variant="muted" className="ml-1">
									{t("external")}
								</Badge>
							)}
							{assignment.deputyName && (
								<span className="text-muted-foreground text-footnote">
									{" "}
									· {t("deputy")}: {assignment.deputyName}
								</span>
							)}
						</span>
						<Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
							{t("change")}
						</Button>
						<Button
							size="sm"
							variant="ghost"
							disabled={pending}
							onClick={() =>
								start(async () => {
									const res = await setupRemoveAssignment({
										id: assignment.id,
									});
									if (!res.ok) return void toast.error(tc("error"));
									toast.success(t("removed"));
									setEditing(false);
									router.refresh();
								})
							}
						>
							{t("remove")}
						</Button>
					</div>
				)}
			</div>

			{invite && (
				<InviteLinkPanel
					url={invite.url}
					mailed={invite.mailed}
					hint={t("inviteHint")}
					onDone={() => setInvite(null)}
				/>
			)}

			{editing && (
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor={`${id}-mode`}>{t("mode")}</Label>
						<Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
							<SelectTrigger id={`${id}-mode`} className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{(["me", "member", "invite", "external"] as const).map((m) => (
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
									{members.map((m) => (
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
						<Label htmlFor={`${id}-deputy`}>{t("deputy")}</Label>
						<Select value={deputy} onValueChange={setDeputy}>
							<SelectTrigger id={`${id}-deputy`} className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">{t("noDeputy")}</SelectItem>
								{members.map((m) => (
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
					<div className="flex items-end gap-2 sm:col-span-2">
						<Button size="sm" disabled={pending || !valid} onClick={save}>
							{t("assign")}
						</Button>
						<Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
							{tc("cancel")}
						</Button>
					</div>
				</div>
			)}
		</li>
	);
}
