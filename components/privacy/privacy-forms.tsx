"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	applyProcessingActivitySeed,
	extendDataSubjectRequest,
	transitionDataSubjectRequest,
	upsertDataSubjectRequest,
	upsertInsurancePolicy,
	upsertProcessingActivity,
} from "@/app/actions/privacy";
import type { MemberOption } from "@/components/entity/owner-assignee";
import {
	EditTrigger,
	Field,
	FormDialog,
	NewTrigger,
	UserSelect,
} from "@/components/organisation/governance-forms";
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
import { DSR_TYPES, INSURANCE_TYPES } from "@/lib/validation/privacy";

function nowLocal(): string {
	const d = new Date();
	d.setSeconds(0, 0);
	return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
		.toISOString()
		.slice(0, 16);
}
const split = (s: string) =>
	s
		.split(",")
		.map((x) => x.trim())
		.filter(Boolean);

// ── Verarbeitungstätigkeit ─────────────────────────────────────────────────

export type ActivityDraft = {
	id?: string;
	name: string;
	purpose?: string | null;
	dataCategories: string; // kommagetrennt
	dataSubjects: string;
	recipients: string;
	thirdCountryTransfer?: string | null;
	retention?: string | null;
	legalBasis?: string | null;
	dsfaRequired: boolean;
	dsfaEvidenceId?: string | null;
	ownerUserId?: string | null;
};

export function ProcessingActivityForm({
	initial,
	members,
	evidence,
}: {
	initial?: ActivityDraft;
	members: MemberOption[];
	evidence: { id: string; title: string }[];
}) {
	const t = useTranslations("Privacy");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [d, setD] = useState<ActivityDraft>(
		initial ?? {
			name: "",
			dataCategories: "",
			dataSubjects: "",
			recipients: "",
			dsfaRequired: false,
		},
	);
	return (
		<FormDialog
			title={initial ? t("editActivity") : t("newActivity")}
			lead={t("activityFormLead")}
			trigger={
				initial ? <EditTrigger /> : <NewTrigger label={t("newActivity")} />
			}
			open={open}
			setOpen={setOpen}
			pending={pending}
			disabled={!d.name.trim()}
			wide
			onSubmit={() =>
				start(async () => {
					const res = await upsertProcessingActivity({
						id: d.id,
						name: d.name,
						purpose: d.purpose || undefined,
						dataCategories: split(d.dataCategories),
						dataSubjects: split(d.dataSubjects),
						recipients: split(d.recipients),
						thirdCountryTransfer: d.thirdCountryTransfer || null,
						retention: d.retention || null,
						legalBasis: d.legalBasis || null,
						dsfaRequired: d.dsfaRequired,
						dsfaEvidenceId: d.dsfaEvidenceId ?? null,
						ownerUserId: d.ownerUserId ?? null,
					});
					if (!res.ok) return void toast.error(tc("error"));
					toast.success(t("saved"));
					setOpen(false);
					router.refresh();
				})
			}
		>
			<Field
				id="pa-name"
				label={t("name")}
				value={d.name}
				onChange={(v) => setD({ ...d, name: v })}
				required
			/>
			<Field
				id="pa-purpose"
				label={t("purpose")}
				value={d.purpose ?? ""}
				onChange={(v) => setD({ ...d, purpose: v })}
				rows={2}
			/>
			<div className="grid gap-4 sm:grid-cols-2">
				<Field
					id="pa-legal"
					label={t("legalBasis")}
					value={d.legalBasis ?? ""}
					onChange={(v) => setD({ ...d, legalBasis: v })}
				/>
				<Field
					id="pa-ret"
					label={t("retention")}
					value={d.retention ?? ""}
					onChange={(v) => setD({ ...d, retention: v })}
				/>
				<Field
					id="pa-cat"
					label={t("dataCategories")}
					value={d.dataCategories}
					onChange={(v) => setD({ ...d, dataCategories: v })}
				/>
				<Field
					id="pa-subj"
					label={t("dataSubjects")}
					value={d.dataSubjects}
					onChange={(v) => setD({ ...d, dataSubjects: v })}
				/>
				<Field
					id="pa-rec"
					label={t("recipients")}
					value={d.recipients}
					onChange={(v) => setD({ ...d, recipients: v })}
				/>
				<Field
					id="pa-third"
					label={t("thirdCountry")}
					value={d.thirdCountryTransfer ?? ""}
					onChange={(v) => setD({ ...d, thirdCountryTransfer: v })}
				/>
				<UserSelect
					label={t("owner")}
					value={d.ownerUserId}
					onChange={(v) => setD({ ...d, ownerUserId: v })}
					members={members}
				/>
				<div className="flex flex-col gap-1.5">
					<Label>{t("dsfaEvidence")}</Label>
					<Select
						value={d.dsfaEvidenceId ?? "none"}
						onValueChange={(v) =>
							setD({ ...d, dsfaEvidenceId: v === "none" ? null : v })
						}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">—</SelectItem>
							{evidence.map((e) => (
								<SelectItem key={e.id} value={e.id}>
									{e.title}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
			<label className="flex items-center gap-2 text-sm">
				<Checkbox
					checked={d.dsfaRequired}
					onCheckedChange={(v) => setD({ ...d, dsfaRequired: Boolean(v) })}
				/>
				{t("dsfaRequired")}
			</label>
		</FormDialog>
	);
}

export function ApplyActivitySeedButton() {
	const t = useTranslations("Privacy");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Button
			variant="outline"
			size="sm"
			disabled={pending}
			onClick={() =>
				start(async () => {
					const res = await applyProcessingActivitySeed();
					if (!res.ok) return void toast.error(tc("error"));
					toast.success(t("seedApplied", { n: res.data.created }));
					router.refresh();
				})
			}
		>
			<Sparkles />
			{t("applySeed")}
		</Button>
	);
}

// ── Betroffenenanfrage ─────────────────────────────────────────────────────

export type DsrDraft = {
	id?: string;
	receivedAt: string;
	type: (typeof DSR_TYPES)[number];
	subjectRef?: string | null;
	ownerUserId?: string | null;
};

export function DsrForm({
	initial,
	members,
}: {
	initial?: DsrDraft;
	members: MemberOption[];
}) {
	const t = useTranslations("Privacy");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [d, setD] = useState<DsrDraft>(
		initial ?? { receivedAt: nowLocal(), type: "auskunft" },
	);
	return (
		<FormDialog
			title={initial ? t("editDsr") : t("newDsr")}
			lead={t("dsrFormLead")}
			trigger={initial ? <EditTrigger /> : <NewTrigger label={t("newDsr")} />}
			open={open}
			setOpen={setOpen}
			pending={pending}
			onSubmit={() =>
				start(async () => {
					const res = await upsertDataSubjectRequest({
						id: d.id,
						receivedAt: new Date(d.receivedAt),
						type: d.type,
						subjectRef:
							d.subjectRef === undefined ? undefined : d.subjectRef || null,
						ownerUserId: d.ownerUserId ?? null,
					});
					if (!res.ok) return void toast.error(tc("error"));
					toast.success(t("saved"));
					setOpen(false);
					router.refresh();
				})
			}
		>
			<div className="grid gap-4 sm:grid-cols-2">
				{!initial && (
					<Field
						id="dsr-received"
						label={t("receivedAt")}
						type="datetime-local"
						value={d.receivedAt}
						onChange={(v) => setD({ ...d, receivedAt: v })}
						required
					/>
				)}
				<div className="flex flex-col gap-1.5">
					<Label>{t("type")}</Label>
					<Select
						value={d.type}
						onValueChange={(v) => setD({ ...d, type: v as DsrDraft["type"] })}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{DSR_TYPES.map((x) => (
								<SelectItem key={x} value={x}>
									{t(`type_${x}`)}
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
				<Field
					id="dsr-ref"
					label={t("subjectRef")}
					value={d.subjectRef ?? ""}
					onChange={(v) => setD({ ...d, subjectRef: v })}
				/>
			</div>
			<p className="text-muted-foreground text-xs">{t("noPiiHint")}</p>
		</FormDialog>
	);
}

export function DsrButtons({
	id,
	status,
	extended,
}: {
	id: string;
	status: "open" | "in_progress" | "done" | "rejected";
	extended: boolean;
}) {
	const t = useTranslations("Privacy");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [reason, setReason] = useState("");
	const go = (to: "open" | "in_progress" | "done" | "rejected") =>
		start(async () => {
			const res = await transitionDataSubjectRequest({ id, to });
			if (!res.ok) return void toast.error(tc("error"));
			router.refresh();
		});
	if (status === "done" || status === "rejected")
		return (
			<Button
				size="sm"
				variant="outline"
				disabled={pending}
				onClick={() => go("open")}
			>
				{t("reopen")}
			</Button>
		);
	return (
		<span className="inline-flex flex-wrap items-center gap-1">
			{status === "open" && (
				<Button
					size="sm"
					variant="outline"
					disabled={pending}
					onClick={() => go("in_progress")}
				>
					{t("start")}
				</Button>
			)}
			<Button size="sm" disabled={pending} onClick={() => go("done")}>
				{t("complete")}
			</Button>
			<Button
				size="sm"
				variant="ghost"
				disabled={pending}
				onClick={() => go("rejected")}
			>
				{t("reject")}
			</Button>
			{!extended && (
				<>
					<Input
						className="h-8 w-44"
						placeholder={t("extendReason")}
						value={reason}
						onChange={(e) => setReason(e.target.value)}
					/>
					<Button
						size="sm"
						variant="ghost"
						disabled={pending || reason.trim().length < 3}
						onClick={() =>
							start(async () => {
								const res = await extendDataSubjectRequest({ id, reason });
								if (!res.ok) return void toast.error(tc("error"));
								toast.success(t("extended"));
								router.refresh();
							})
						}
					>
						{t("extend")}
					</Button>
				</>
			)}
		</span>
	);
}

// ── Versicherung ───────────────────────────────────────────────────────────

export type InsuranceDraft = {
	id?: string;
	type: (typeof INSURANCE_TYPES)[number];
	insurer: string;
	policyRef?: string | null;
	coverageLimit?: string;
	subLimits?: string;
	exclusions?: string | null;
	validFrom?: string | null;
	validUntil?: string | null;
	premium?: string;
	ownerUserId?: string | null;
};

export function InsuranceForm({
	initial,
	members,
}: {
	initial?: InsuranceDraft;
	members: MemberOption[];
}) {
	const t = useTranslations("Insurance");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [d, setD] = useState<InsuranceDraft>(
		initial ?? { type: "cyber", insurer: "" },
	);
	return (
		<FormDialog
			title={initial ? t("edit") : t("new")}
			lead={t("formLead")}
			trigger={initial ? <EditTrigger /> : <NewTrigger label={t("new")} />}
			open={open}
			setOpen={setOpen}
			pending={pending}
			disabled={!d.insurer.trim()}
			wide
			onSubmit={() =>
				start(async () => {
					const res = await upsertInsurancePolicy({
						id: d.id,
						type: d.type,
						insurer: d.insurer,
						policyRef: d.policyRef || null,
						coverageLimit: d.coverageLimit ? Number(d.coverageLimit) : null,
						subLimits: d.subLimits || undefined,
						exclusions: d.exclusions || undefined,
						validFrom: d.validFrom || null,
						validUntil: d.validUntil || null,
						premium: d.premium ? Number(d.premium) : null,
						ownerUserId: d.ownerUserId ?? null,
					});
					if (!res.ok) return void toast.error(tc("error"));
					toast.success(t("saved"));
					setOpen(false);
					router.refresh();
				})
			}
		>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<Label>{t("type")}</Label>
					<Select
						value={d.type}
						onValueChange={(v) =>
							setD({ ...d, type: v as InsuranceDraft["type"] })
						}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{INSURANCE_TYPES.map((x) => (
								<SelectItem key={x} value={x}>
									{t(`type_${x}`)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<Field
					id="ins-insurer"
					label={t("insurer")}
					value={d.insurer}
					onChange={(v) => setD({ ...d, insurer: v })}
					required
				/>
				<Field
					id="ins-ref"
					label={t("policyRef")}
					value={d.policyRef ?? ""}
					onChange={(v) => setD({ ...d, policyRef: v })}
				/>
				<Field
					id="ins-limit"
					label={t("coverageLimit")}
					type="number"
					value={d.coverageLimit ?? ""}
					onChange={(v) => setD({ ...d, coverageLimit: v })}
				/>
				<Field
					id="ins-from"
					label={t("validFrom")}
					type="date"
					value={d.validFrom ?? ""}
					onChange={(v) => setD({ ...d, validFrom: v })}
				/>
				<Field
					id="ins-until"
					label={t("validUntil")}
					type="date"
					value={d.validUntil ?? ""}
					onChange={(v) => setD({ ...d, validUntil: v })}
				/>
				<Field
					id="ins-premium"
					label={t("premium")}
					type="number"
					value={d.premium ?? ""}
					onChange={(v) => setD({ ...d, premium: v })}
				/>
				<UserSelect
					label={t("owner")}
					value={d.ownerUserId}
					onChange={(v) => setD({ ...d, ownerUserId: v })}
					members={members}
				/>
			</div>
			<Field
				id="ins-sub"
				label={t("subLimits")}
				value={d.subLimits ?? ""}
				onChange={(v) => setD({ ...d, subLimits: v })}
			/>
			<Field
				id="ins-excl"
				label={t("exclusions")}
				value={d.exclusions ?? ""}
				onChange={(v) => setD({ ...d, exclusions: v })}
				rows={2}
			/>
		</FormDialog>
	);
}
