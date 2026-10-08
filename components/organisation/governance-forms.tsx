"use client";

import { Plus, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
	type ComponentProps,
	type ReactNode,
	useState,
	useTransition,
} from "react";
import { toast } from "sonner";
import {
	applyGovernanceSeed,
	upsertCommunication,
	upsertConflict,
	upsertContextIssue,
	upsertInterestedParty,
	upsertRegulatorInteraction,
} from "@/app/actions/organisation";
import { withStepUp } from "@/components/auth/step-up-dialog";
import type { MemberOption } from "@/components/entity/owner-assignee";
import { Button } from "@/components/ui/button";
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
import { ROLE_FUNCTIONS, type RoleFunction } from "@/db/schema/enums";
import type { ActionResult } from "@/lib/validation/common";
import { AUTHORITIES, PARTY_TYPES } from "@/lib/validation/governance";

// Gemeinsame Bausteine der Organisation-Formulare: Dialog-Hülle, Personen-
// und Funktionsauswahl, Löschen mit Bestätigung.

export function FormDialog({
	title,
	lead,
	trigger,
	open,
	setOpen,
	onSubmit,
	pending,
	disabled,
	children,
	wide,
}: {
	title: string;
	lead?: string;
	trigger: ReactNode;
	open: boolean;
	setOpen: (o: boolean) => void;
	onSubmit: () => void;
	pending: boolean;
	disabled?: boolean;
	children: ReactNode;
	wide?: boolean;
}) {
	const tc = useTranslations("Common");
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent className={wide ? "sm:max-w-2xl" : undefined}>
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						onSubmit();
					}}
				>
					<DialogHeader>
						<DialogTitle>{title}</DialogTitle>
						{lead && <DialogDescription>{lead}</DialogDescription>}
					</DialogHeader>
					{children}
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpen(false)}
						>
							{tc("cancel")}
						</Button>
						<Button type="submit" disabled={pending || disabled}>
							{tc("save")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// Trigger für `DialogTrigger asChild`: Radix injiziert onClick, ref, aria-*
// und data-state — ohne Weitergabe an den Button öffnet der Dialog nie.
type TriggerProps = Omit<ComponentProps<typeof Button>, "children">;

export function EditTrigger({
	label,
	...props
}: TriggerProps & { label?: string }) {
	const tc = useTranslations("Common");
	return (
		<Button
			size="sm"
			variant="ghost"
			className="normal-case tracking-normal"
			{...props}
		>
			{label ?? tc("edit")}
		</Button>
	);
}

export function NewTrigger({
	label,
	...props
}: TriggerProps & { label: string }) {
	return (
		<Button size="sm" variant="brown" {...props}>
			<Plus />
			{label}
		</Button>
	);
}

export function UserSelect({
	label,
	value,
	onChange,
	members,
}: {
	label: string;
	value: string | null | undefined;
	onChange: (v: string | null) => void;
	members: MemberOption[];
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<Label>{label}</Label>
			<Select
				value={value ?? "none"}
				onValueChange={(v) => onChange(v === "none" ? null : v)}
			>
				<SelectTrigger className="w-full">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="none">—</SelectItem>
					{members.map((m) => (
						<SelectItem key={m.userId} value={m.userId}>
							{m.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

export function FunctionSelect({
	label,
	value,
	onChange,
	labels,
	allowNone,
}: {
	label: string;
	value: RoleFunction | null | undefined;
	onChange: (v: RoleFunction | null) => void;
	labels: Record<string, string>;
	allowNone?: boolean;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<Label>{label}</Label>
			<Select
				value={value ?? "none"}
				onValueChange={(v) =>
					onChange(v === "none" ? null : (v as RoleFunction))
				}
			>
				<SelectTrigger className="w-full">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{allowNone && <SelectItem value="none">—</SelectItem>}
					{ROLE_FUNCTIONS.map((f) => (
						<SelectItem key={f} value={f}>
							{labels[f] ?? f}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

export function Field({
	id,
	label,
	value,
	onChange,
	type = "text",
	rows,
	required,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (v: string) => void;
	type?: string;
	rows?: number;
	required?: boolean;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor={id}>{label}</Label>
			{rows ? (
				<Textarea
					id={id}
					rows={rows}
					value={value}
					onChange={(e) => onChange(e.target.value)}
				/>
			) : (
				<Input
					id={id}
					type={type}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					required={required}
				/>
			)}
		</div>
	);
}

// Löschen mit Bestätigung; die Server-Action kommt als Prop.
export function DeleteRowButton({
	id,
	action,
	label,
}: {
	id: string;
	action: (input: { id: string }) => Promise<ActionResult>;
	label: string;
}) {
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Button
			size="icon"
			variant="ghost"
			aria-label={label}
			title={label}
			disabled={pending}
			onClick={() => {
				if (!window.confirm(label)) return;
				start(async () => {
					const res = await action({ id });
					if (!res.ok) return void toast.error(tc("error"));
					router.refresh();
				});
			}}
		>
			<Trash2 />
		</Button>
	);
}

function useSave<T extends { ok: boolean }>(
	okMessage: string,
	setOpen: (o: boolean) => void,
) {
	const tc = useTranslations("Common");
	const t = useTranslations("Organisation");
	const router = useRouter();
	const [pending, start] = useTransition();
	const run = (fn: () => Promise<T & { error?: string }>) =>
		start(async () => {
			const res = await withStepUp(fn);
			if (!res.ok) {
				toast.error(
					res.error === "step_up_required" ? t("stepUp") : tc("error"),
				);
				return;
			}
			toast.success(okMessage);
			setOpen(false);
			router.refresh();
		});
	return { pending, run };
}

// ── Kontext ────────────────────────────────────────────────────────────────
export type ContextIssueDraft = {
	id?: string;
	scope: "internal" | "external";
	title: string;
	description?: string | null;
	impact?: string | null;
	ownerUserId?: string | null;
	reviewAt?: string | null;
};

export function ContextIssueForm({
	initial,
	members,
}: {
	initial?: ContextIssueDraft;
	members: MemberOption[];
}) {
	const t = useTranslations("Organisation");
	const [open, setOpen] = useState(false);
	const [d, setD] = useState<ContextIssueDraft>(
		initial ?? { scope: "internal", title: "" },
	);
	const { pending, run } = useSave(t("saved"), setOpen);
	return (
		<FormDialog
			title={initial ? t("editIssue") : t("newIssue")}
			lead={t("issuesLead")}
			trigger={initial ? <EditTrigger /> : <NewTrigger label={t("newIssue")} />}
			open={open}
			setOpen={setOpen}
			pending={pending}
			disabled={!d.title.trim()}
			onSubmit={() =>
				run(() =>
					upsertContextIssue({
						...d,
						description: d.description ?? undefined,
						impact: d.impact ?? undefined,
						reviewAt: d.reviewAt || null,
					}),
				)
			}
		>
			<div className="flex flex-col gap-1.5">
				<Label>{t("issueScope")}</Label>
				<Select
					value={d.scope}
					onValueChange={(v) =>
						setD({ ...d, scope: v as "internal" | "external" })
					}
				>
					<SelectTrigger className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="internal">{t("scope_internal")}</SelectItem>
						<SelectItem value="external">{t("scope_external")}</SelectItem>
					</SelectContent>
				</Select>
			</div>
			<Field
				id="ci-title"
				label={t("titleField")}
				value={d.title}
				onChange={(v) => setD({ ...d, title: v })}
				required
			/>
			<Field
				id="ci-desc"
				label={t("description")}
				value={d.description ?? ""}
				onChange={(v) => setD({ ...d, description: v })}
				rows={2}
			/>
			<Field
				id="ci-impact"
				label={t("impact")}
				value={d.impact ?? ""}
				onChange={(v) => setD({ ...d, impact: v })}
				rows={2}
			/>
			<UserSelect
				label={t("owner")}
				value={d.ownerUserId}
				onChange={(v) => setD({ ...d, ownerUserId: v })}
				members={members}
			/>
			<Field
				id="ci-review"
				label={t("reviewAt")}
				type="date"
				value={d.reviewAt ?? ""}
				onChange={(v) => setD({ ...d, reviewAt: v })}
			/>
		</FormDialog>
	);
}

// ── Interessierte Parteien ─────────────────────────────────────────────────
export type PartyDraft = {
	id?: string;
	name: string;
	type: (typeof PARTY_TYPES)[number];
	expectations?: string | null;
	requirements?: string | null;
	howAddressed?: string | null;
	contact?: string | null;
	ownerUserId?: string | null;
	reviewAt?: string | null;
};

export function PartyForm({
	initial,
	members,
}: {
	initial?: PartyDraft;
	members: MemberOption[];
}) {
	const t = useTranslations("Organisation");
	const [open, setOpen] = useState(false);
	const [d, setD] = useState<PartyDraft>(
		initial ?? { name: "", type: "regulator" },
	);
	const { pending, run } = useSave(t("saved"), setOpen);
	return (
		<FormDialog
			title={initial ? t("editParty") : t("newParty")}
			lead={t("partiesLead")}
			trigger={initial ? <EditTrigger /> : <NewTrigger label={t("newParty")} />}
			open={open}
			setOpen={setOpen}
			pending={pending}
			disabled={!d.name.trim()}
			wide
			onSubmit={() =>
				run(() =>
					upsertInterestedParty({
						...d,
						expectations: d.expectations ?? undefined,
						requirements: d.requirements ?? undefined,
						howAddressed: d.howAddressed ?? undefined,
						contact: d.contact ?? undefined,
						reviewAt: d.reviewAt || null,
					}),
				)
			}
		>
			<div className="grid gap-4 sm:grid-cols-2">
				<Field
					id="pt-name"
					label={t("name")}
					value={d.name}
					onChange={(v) => setD({ ...d, name: v })}
					required
				/>
				<div className="flex flex-col gap-1.5">
					<Label>{t("partyType")}</Label>
					<Select
						value={d.type}
						onValueChange={(v) => setD({ ...d, type: v as PartyDraft["type"] })}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{PARTY_TYPES.map((x) => (
								<SelectItem key={x} value={x}>
									{t(`party_${x}`)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
			<Field
				id="pt-exp"
				label={t("expectations")}
				value={d.expectations ?? ""}
				onChange={(v) => setD({ ...d, expectations: v })}
				rows={2}
			/>
			<Field
				id="pt-req"
				label={t("requirements")}
				value={d.requirements ?? ""}
				onChange={(v) => setD({ ...d, requirements: v })}
				rows={2}
			/>
			<Field
				id="pt-how"
				label={t("howAddressed")}
				value={d.howAddressed ?? ""}
				onChange={(v) => setD({ ...d, howAddressed: v })}
				rows={2}
			/>
			<div className="grid gap-4 sm:grid-cols-2">
				<Field
					id="pt-contact"
					label={t("contact")}
					value={d.contact ?? ""}
					onChange={(v) => setD({ ...d, contact: v })}
				/>
				<UserSelect
					label={t("owner")}
					value={d.ownerUserId}
					onChange={(v) => setD({ ...d, ownerUserId: v })}
					members={members}
				/>
			</div>
		</FormDialog>
	);
}

export function ApplyGovernanceSeedButton() {
	const t = useTranslations("Organisation");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Button
			size="sm"
			variant="outline"
			disabled={pending}
			onClick={() =>
				start(async () => {
					const res = await applyGovernanceSeed();
					if (!res.ok) return void toast.error(tc("error"));
					toast.success(
						t("seedApplied", {
							p: res.data.parties,
							c: res.data.communications,
						}),
					);
					router.refresh();
				})
			}
		>
			<Sparkles />
			{t("applySeed")}
		</Button>
	);
}

// ── Kommunikation ──────────────────────────────────────────────────────────
export type CommunicationDraft = {
	id?: string;
	topic: string;
	interestedPartyId?: string | null;
	audience?: string | null;
	purpose?: string | null;
	channel?: string | null;
	frequency?: string | null;
	trigger: "regular" | "incident" | "crisis" | "change";
	ownerFunction?: RoleFunction | null;
	ownerUserId?: string | null;
	legalBasis?: string | null;
	contact?: string | null;
};

export function CommunicationForm({
	initial,
	members,
	parties,
	functionLabels,
}: {
	initial?: CommunicationDraft;
	members: MemberOption[];
	parties: { id: string; name: string }[];
	functionLabels: Record<string, string>;
}) {
	const t = useTranslations("Organisation");
	const [open, setOpen] = useState(false);
	const [d, setD] = useState<CommunicationDraft>(
		initial ?? { topic: "", trigger: "regular" },
	);
	const { pending, run } = useSave(t("saved"), setOpen);
	return (
		<FormDialog
			title={initial ? t("editCommunication") : t("newCommunication")}
			lead={t("communicationLead")}
			trigger={
				initial ? <EditTrigger /> : <NewTrigger label={t("newCommunication")} />
			}
			open={open}
			setOpen={setOpen}
			pending={pending}
			disabled={!d.topic.trim()}
			wide
			onSubmit={() =>
				run(() =>
					upsertCommunication({
						...d,
						audience: d.audience ?? undefined,
						purpose: d.purpose ?? undefined,
						channel: d.channel ?? undefined,
						frequency: d.frequency ?? undefined,
						legalBasis: d.legalBasis ?? undefined,
						contact: d.contact ?? undefined,
					}),
				)
			}
		>
			<Field
				id="cm-topic"
				label={t("topic")}
				value={d.topic}
				onChange={(v) => setD({ ...d, topic: v })}
				required
			/>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<Label>{t("trigger")}</Label>
					<Select
						value={d.trigger}
						onValueChange={(v) =>
							setD({ ...d, trigger: v as CommunicationDraft["trigger"] })
						}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{(["regular", "incident", "crisis", "change"] as const).map(
								(x) => (
									<SelectItem key={x} value={x}>
										{t(`trigger_${x}`)}
									</SelectItem>
								),
							)}
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label>{t("party")}</Label>
					<Select
						value={d.interestedPartyId ?? "none"}
						onValueChange={(v) =>
							setD({ ...d, interestedPartyId: v === "none" ? null : v })
						}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">—</SelectItem>
							{parties.map((p) => (
								<SelectItem key={p.id} value={p.id}>
									{p.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<Field
					id="cm-aud"
					label={t("audience")}
					value={d.audience ?? ""}
					onChange={(v) => setD({ ...d, audience: v })}
				/>
				<Field
					id="cm-chan"
					label={t("channel")}
					value={d.channel ?? ""}
					onChange={(v) => setD({ ...d, channel: v })}
				/>
				<Field
					id="cm-freq"
					label={t("frequency")}
					value={d.frequency ?? ""}
					onChange={(v) => setD({ ...d, frequency: v })}
				/>
				<Field
					id="cm-legal"
					label={t("legalBasis")}
					value={d.legalBasis ?? ""}
					onChange={(v) => setD({ ...d, legalBasis: v })}
				/>
				<FunctionSelect
					label={t("ownerFunction")}
					value={d.ownerFunction}
					onChange={(v) => setD({ ...d, ownerFunction: v })}
					labels={functionLabels}
					allowNone
				/>
				<UserSelect
					label={t("owner")}
					value={d.ownerUserId}
					onChange={(v) => setD({ ...d, ownerUserId: v })}
					members={members}
				/>
			</div>
			<Field
				id="cm-purpose"
				label={t("purpose")}
				value={d.purpose ?? ""}
				onChange={(v) => setD({ ...d, purpose: v })}
				rows={2}
			/>
			<Field
				id="cm-contact"
				label={t("contactCrisis")}
				value={d.contact ?? ""}
				onChange={(v) => setD({ ...d, contact: v })}
			/>
		</FormDialog>
	);
}

// ── Aufsicht ───────────────────────────────────────────────────────────────
export type RegulatorDraft = {
	id?: string;
	authority: (typeof AUTHORITIES)[number];
	date: string;
	subject: string;
	direction: "inbound" | "outbound";
	deadline?: string | null;
	responseAt?: string | null;
	ownerUserId?: string | null;
	notes?: string | null;
	status: "open" | "answered" | "closed";
};

export function RegulatorInteractionForm({
	initial,
	members,
}: {
	initial?: RegulatorDraft;
	members: MemberOption[];
}) {
	const t = useTranslations("Organisation");
	const [open, setOpen] = useState(false);
	const [d, setD] = useState<RegulatorDraft>(
		initial ?? {
			authority: "bafin",
			date: new Date().toISOString().slice(0, 10),
			subject: "",
			direction: "inbound",
			status: "open",
		},
	);
	const { pending, run } = useSave(t("saved"), setOpen);
	return (
		<FormDialog
			title={initial ? t("editInteraction") : t("newInteraction")}
			lead={t("regulatorLead")}
			trigger={
				initial ? <EditTrigger /> : <NewTrigger label={t("newInteraction")} />
			}
			open={open}
			setOpen={setOpen}
			pending={pending}
			disabled={!d.subject.trim() || !d.date}
			wide
			onSubmit={() =>
				run(() =>
					upsertRegulatorInteraction({
						...d,
						deadline: d.deadline || null,
						responseAt: d.responseAt || null,
						notes: d.notes ?? undefined,
					}),
				)
			}
		>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<Label>{t("authority")}</Label>
					<Select
						value={d.authority}
						onValueChange={(v) =>
							setD({ ...d, authority: v as RegulatorDraft["authority"] })
						}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{AUTHORITIES.map((a) => (
								<SelectItem key={a} value={a}>
									{t(`authority_${a}`)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label>{t("direction")}</Label>
					<Select
						value={d.direction}
						onValueChange={(v) =>
							setD({ ...d, direction: v as "inbound" | "outbound" })
						}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="inbound">{t("direction_inbound")}</SelectItem>
							<SelectItem value="outbound">
								{t("direction_outbound")}
							</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<Field
					id="ri-date"
					label={t("date")}
					type="date"
					value={d.date}
					onChange={(v) => setD({ ...d, date: v })}
					required
				/>
				<Field
					id="ri-deadline"
					label={t("deadline")}
					type="date"
					value={d.deadline ?? ""}
					onChange={(v) => setD({ ...d, deadline: v })}
				/>
				<Field
					id="ri-resp"
					label={t("responseAt")}
					type="date"
					value={d.responseAt ?? ""}
					onChange={(v) => setD({ ...d, responseAt: v })}
				/>
				<div className="flex flex-col gap-1.5">
					<Label>{t("status")}</Label>
					<Select
						value={d.status}
						onValueChange={(v) =>
							setD({ ...d, status: v as RegulatorDraft["status"] })
						}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{(["open", "answered", "closed"] as const).map((s) => (
								<SelectItem key={s} value={s}>
									{t(`ristatus_${s}`)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<UserSelect
					label={t("owner")}
					value={d.ownerUserId}
					onChange={(v) => setD({ ...d, ownerUserId: v })}
					members={members}
				/>
			</div>
			<Field
				id="ri-subject"
				label={t("subject")}
				value={d.subject}
				onChange={(v) => setD({ ...d, subject: v })}
				required
			/>
			<Field
				id="ri-notes"
				label={t("notes")}
				value={d.notes ?? ""}
				onChange={(v) => setD({ ...d, notes: v })}
				rows={3}
			/>
		</FormDialog>
	);
}

// ── Interessenkonflikte ────────────────────────────────────────────────────
export type ConflictDraft = {
	id?: string;
	title: string;
	type?: string | null;
	partiesInvolved?: string | null;
	description?: string | null;
	mitigation?: string | null;
	disclosedAt?: string | null;
	ownerUserId?: string | null;
	reviewAt?: string | null;
	status: "open" | "mitigated" | "closed";
};

export function ConflictForm({
	initial,
	members,
}: {
	initial?: ConflictDraft;
	members: MemberOption[];
}) {
	const t = useTranslations("Organisation");
	const [open, setOpen] = useState(false);
	const [d, setD] = useState<ConflictDraft>(
		initial ?? { title: "", status: "open" },
	);
	const { pending, run } = useSave(t("saved"), setOpen);
	return (
		<FormDialog
			title={initial ? t("editConflict") : t("newConflict")}
			lead={t("conflictsLead")}
			trigger={
				initial ? <EditTrigger /> : <NewTrigger label={t("newConflict")} />
			}
			open={open}
			setOpen={setOpen}
			pending={pending}
			disabled={!d.title.trim()}
			wide
			onSubmit={() =>
				run(() =>
					upsertConflict({
						...d,
						type: d.type ?? undefined,
						partiesInvolved: d.partiesInvolved ?? undefined,
						description: d.description ?? undefined,
						mitigation: d.mitigation ?? undefined,
						disclosedAt: d.disclosedAt || null,
						reviewAt: d.reviewAt || null,
					}),
				)
			}
		>
			<Field
				id="co-title"
				label={t("titleField")}
				value={d.title}
				onChange={(v) => setD({ ...d, title: v })}
				required
			/>
			<div className="grid gap-4 sm:grid-cols-2">
				<Field
					id="co-type"
					label={t("conflictType")}
					value={d.type ?? ""}
					onChange={(v) => setD({ ...d, type: v })}
				/>
				<Field
					id="co-parties"
					label={t("partiesInvolved")}
					value={d.partiesInvolved ?? ""}
					onChange={(v) => setD({ ...d, partiesInvolved: v })}
				/>
				<Field
					id="co-disc"
					label={t("disclosedAt")}
					type="date"
					value={d.disclosedAt ?? ""}
					onChange={(v) => setD({ ...d, disclosedAt: v })}
				/>
				<Field
					id="co-review"
					label={t("reviewAt")}
					type="date"
					value={d.reviewAt ?? ""}
					onChange={(v) => setD({ ...d, reviewAt: v })}
				/>
				<div className="flex flex-col gap-1.5">
					<Label>{t("status")}</Label>
					<Select
						value={d.status}
						onValueChange={(v) =>
							setD({ ...d, status: v as ConflictDraft["status"] })
						}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{(["open", "mitigated", "closed"] as const).map((s) => (
								<SelectItem key={s} value={s}>
									{t(`coistatus_${s}`)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<UserSelect
					label={t("owner")}
					value={d.ownerUserId}
					onChange={(v) => setD({ ...d, ownerUserId: v })}
					members={members}
				/>
			</div>
			<Field
				id="co-desc"
				label={t("description")}
				value={d.description ?? ""}
				onChange={(v) => setD({ ...d, description: v })}
				rows={2}
			/>
			<Field
				id="co-mit"
				label={t("mitigation")}
				value={d.mitigation ?? ""}
				onChange={(v) => setD({ ...d, mitigation: v })}
				rows={2}
			/>
		</FormDialog>
	);
}
