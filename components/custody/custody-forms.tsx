"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	addKeyHolder,
	recordCeremony,
	revokeKeyHolder,
	saveWallet,
} from "@/app/actions/custody";
import { useGateFeedback } from "@/components/approvals/use-gate-feedback";
import {
	EditTrigger,
	Field,
	FormDialog,
	NewTrigger,
	ResponsibleField,
	UserSelect,
} from "@/components/organisation/governance-forms";
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
import { toast } from "@/components/ui/toast";
import type { Wallet } from "@/db/schema/custody";
import {
	CEREMONY_KINDS,
	KEY_HOLDER_ROLES,
	WALLET_KINDS,
	WALLET_PURPOSES,
	WALLET_TECHNOLOGIES,
} from "@/db/schema/enums";

type Member = { userId: string; name: string; email: string };
type Option = { id: string; name: string };
type Result = {
	ok: boolean;
	error?: string;
	fieldErrors?: Record<string, string[]>;
};

// Fehlertext aus dem Action-Ergebnis: erste Feldmeldung (deutsch aus zod)
// oder der allgemeine Hinweis — steht im Dialog über dem Speichern-Knopf.
function useFailure() {
	const tc = useTranslations("Common");
	const gate = useGateFeedback();
	const [error, setError] = useState<string | null>(null);
	const fail = (res: Result) => {
		const first = Object.values(res.fieldErrors ?? {})[0]?.[0];
		const code = typeof res.error === "string" ? res.error : "";
		setError(first ?? gate.errorText(code) ?? errorText(tc, res));
	};
	return { error, fail, reset: () => setError(null) };
}

function EnumSelect<T extends string>({
	id,
	label,
	value,
	options,
	onChange,
	text,
}: {
	id: string;
	label: string;
	value: T;
	options: readonly T[];
	onChange: (v: T) => void;
	text: (v: T) => string;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor={id}>{label}</Label>
			<Select value={value} onValueChange={(v) => onChange(v as T)}>
				<SelectTrigger id={id} className="w-full">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{options.map((o) => (
						<SelectItem key={o} value={o}>
							{text(o)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

function OptionSelect({
	id,
	label,
	value,
	options,
	onChange,
}: {
	id: string;
	label: string;
	value: string | null;
	options: Option[];
	onChange: (v: string | null) => void;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor={id}>{label}</Label>
			<Select
				value={value ?? "none"}
				onValueChange={(v) => onChange(v === "none" ? null : v)}
			>
				<SelectTrigger id={id} className="w-full">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="none">—</SelectItem>
					{options.map((o) => (
						<SelectItem key={o.id} value={o.id}>
							{o.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

type WalletDraft = Pick<
	Wallet,
	| "name"
	| "kind"
	| "technology"
	| "purpose"
	| "quorumRequired"
	| "quorumTotal"
	| "addressLabel"
	| "providerId"
	| "hsmAssetId"
	| "ownerUserId"
	| "status"
	| "notes"
> & { id?: string; networks: string; assetSymbols: string };

export function WalletForm({
	initial,
	members,
	providers,
	hsmAssets,
}: {
	initial?: WalletDraft;
	members: Member[];
	providers: Option[];
	hsmAssets: Option[];
}) {
	const t = useTranslations("Custody");
	const router = useRouter();
	const { error, fail, reset } = useFailure();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [d, setD] = useState<WalletDraft>(
		initial ?? {
			name: "",
			kind: "cold",
			technology: "multisig",
			purpose: "client",
			quorumRequired: 2,
			quorumTotal: 3,
			addressLabel: null,
			providerId: null,
			hsmAssetId: null,
			ownerUserId: null,
			status: "active",
			notes: null,
			networks: "",
			assetSymbols: "",
		},
	);
	return (
		<FormDialog
			title={initial ? t("editWallet") : t("newWallet")}
			lead={t("walletLead")}
			trigger={
				initial ? <EditTrigger /> : <NewTrigger label={t("newWallet")} />
			}
			open={open}
			setOpen={setOpen}
			pending={pending}
			error={error}
			wide
			onSubmit={() =>
				start(async () => {
					reset();
					const res = await saveWallet(d);
					if (!res.ok) return fail(res);
					toast.success(t("walletSaved"));
					setOpen(false);
					router.refresh();
				})
			}
		>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
				<div className="sm:col-span-3">
					<Field
						id="w-name"
						label={t("name")}
						value={d.name}
						onChange={(v) => setD({ ...d, name: v })}
						required
					/>
				</div>
				<EnumSelect
					id="w-kind"
					label={t("kind")}
					value={d.kind}
					options={WALLET_KINDS}
					onChange={(v) => setD({ ...d, kind: v })}
					text={(v) => t(`kind_${v}`)}
				/>
				<EnumSelect
					id="w-tech"
					label={t("technology")}
					value={d.technology}
					options={WALLET_TECHNOLOGIES}
					onChange={(v) => setD({ ...d, technology: v })}
					text={(v) => t(`tech_${v}`)}
				/>
				<EnumSelect
					id="w-purpose"
					label={t("purpose")}
					value={d.purpose}
					options={WALLET_PURPOSES}
					onChange={(v) => setD({ ...d, purpose: v })}
					text={(v) => t(`purpose_${v}`)}
				/>
				<Field
					id="w-qr"
					label={t("quorumRequired")}
					type="number"
					value={String(d.quorumRequired)}
					onChange={(v) => setD({ ...d, quorumRequired: Number(v) || 1 })}
				/>
				<Field
					id="w-qt"
					label={t("quorumTotal")}
					type="number"
					value={String(d.quorumTotal)}
					onChange={(v) => setD({ ...d, quorumTotal: Number(v) || 1 })}
				/>
				<ResponsibleField
					label={t("owner")}
					value={d.ownerUserId}
					onChange={(v) => setD({ ...d, ownerUserId: v })}
					members={members}
				/>
				<div className="sm:col-span-3">
					<Field
						id="w-assets"
						label={t("assetSymbols")}
						value={d.assetSymbols}
						onChange={(v) => setD({ ...d, assetSymbols: v.toUpperCase() })}
						placeholder="BTC, ETH, USDC …"
					/>
				</div>
				<div className="sm:col-span-3">
					<Field
						id="w-networks"
						label={t("networks")}
						value={d.networks}
						onChange={(v) => setD({ ...d, networks: v })}
						placeholder="Bitcoin, Ethereum …"
					/>
				</div>
				<div className="sm:col-span-3">
					<Field
						id="w-address"
						label={t("addressLabel")}
						value={d.addressLabel ?? ""}
						onChange={(v) => setD({ ...d, addressLabel: v || null })}
						placeholder={t("addressPlaceholder")}
					/>
					<p className="mt-1 text-muted-foreground text-footnote">
						{t("noKeyMaterial")}
					</p>
				</div>
				<OptionSelect
					id="w-provider"
					label={t("provider")}
					value={d.providerId}
					options={providers}
					onChange={(v) => setD({ ...d, providerId: v })}
				/>
				<OptionSelect
					id="w-hsm"
					label={t("hsmAsset")}
					value={d.hsmAssetId}
					options={hsmAssets}
					onChange={(v) => setD({ ...d, hsmAssetId: v })}
				/>
				{initial && (
					<EnumSelect
						id="w-status"
						label={t("status")}
						value={d.status}
						options={["active", "retired"] as const}
						onChange={(v) => setD({ ...d, status: v })}
						text={(v) => t(`status_${v}`)}
					/>
				)}
				<div className="sm:col-span-3">
					<Field
						id="w-notes"
						label={t("notes")}
						rows={3}
						value={d.notes ?? ""}
						onChange={(v) => setD({ ...d, notes: v || null })}
					/>
				</div>
			</div>
		</FormDialog>
	);
}

export function KeyHolderForm({
	walletId,
	members,
	sites,
}: {
	walletId: string;
	members: Member[];
	sites: Option[];
}) {
	const t = useTranslations("Custody");
	const router = useRouter();
	const { error, fail, reset } = useFailure();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const empty = {
		userId: null as string | null,
		externalName: "",
		role: "signer" as (typeof KEY_HOLDER_ROLES)[number],
		siteId: null as string | null,
		location: "",
		since: "",
		until: "",
		vettedAt: "",
	};
	const [d, setD] = useState(empty);
	return (
		<FormDialog
			title={t("addHolder")}
			lead={t("holderLead")}
			trigger={<NewTrigger label={t("addHolder")} />}
			open={open}
			setOpen={setOpen}
			pending={pending}
			error={error}
			wide
			onSubmit={() =>
				start(async () => {
					reset();
					const res = await addKeyHolder({ walletId, ...d });
					if (!res.ok) return fail(res);
					toast.success(t("holderAdded"));
					setD(empty);
					setOpen(false);
					router.refresh();
				})
			}
		>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<UserSelect
					label={t("holderPerson")}
					value={d.userId}
					onChange={(v) => setD({ ...d, userId: v })}
					members={members}
				/>
				<Field
					id="kh-external"
					label={t("holderExternal")}
					value={d.externalName}
					onChange={(v) => setD({ ...d, externalName: v })}
				/>
				<EnumSelect
					id="kh-role"
					label={t("holderRole")}
					value={d.role}
					options={KEY_HOLDER_ROLES}
					onChange={(v) => setD({ ...d, role: v })}
					text={(v) => t(`role_${v}`)}
				/>
				<OptionSelect
					id="kh-site"
					label={t("site")}
					value={d.siteId}
					options={sites}
					onChange={(v) => setD({ ...d, siteId: v })}
				/>
				<div className="sm:col-span-2">
					<Field
						id="kh-location"
						label={t("location")}
						value={d.location}
						onChange={(v) => setD({ ...d, location: v })}
						placeholder={t("locationPlaceholder")}
					/>
					<p className="mt-1 text-muted-foreground text-footnote">
						{t("locationHint")}
					</p>
				</div>
				<Field
					id="kh-vetted"
					label={t("vettedAt")}
					type="date"
					value={d.vettedAt}
					onChange={(v) => setD({ ...d, vettedAt: v })}
				/>
				<Field
					id="kh-since"
					label={t("since")}
					type="date"
					value={d.since}
					onChange={(v) => setD({ ...d, since: v })}
				/>
				<Field
					id="kh-until"
					label={t("until")}
					type="date"
					value={d.until}
					onChange={(v) => setD({ ...d, until: v })}
				/>
			</div>
		</FormDialog>
	);
}

export function RevokeHolderButton({ id, name }: { id: string; name: string }) {
	const t = useTranslations("Custody");
	const router = useRouter();
	const { error, fail, reset } = useFailure();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [reason, setReason] = useState("");
	return (
		<FormDialog
			title={t("revokeTitle", { name })}
			lead={t("revokeLead")}
			trigger={<EditTrigger label={t("revoke")} />}
			open={open}
			setOpen={setOpen}
			pending={pending}
			disabled={reason.trim().length < 5}
			error={error}
			onSubmit={() =>
				start(async () => {
					reset();
					const res = await revokeKeyHolder({ id, reason });
					if (!res.ok) return fail(res);
					toast.success(t("revoked"));
					setOpen(false);
					router.refresh();
				})
			}
		>
			<Field
				id={`rv-${id}`}
				label={t("revokeReason")}
				rows={3}
				value={reason}
				onChange={setReason}
			/>
		</FormDialog>
	);
}

export function CeremonyForm({
	walletId,
	members,
}: {
	walletId: string;
	members: Member[];
}) {
	const t = useTranslations("Custody");
	const router = useRouter();
	const { error, fail, reset } = useFailure();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const today = new Date().toISOString().slice(0, 10);
	const empty = {
		kind: "backup_test" as (typeof CEREMONY_KINDS)[number],
		heldAt: today,
		participantUserIds: [] as string[],
		witnesses: "",
		result: "pass" as "pass" | "fail",
		notes: "",
	};
	const [d, setD] = useState(empty);
	const toggle = (id: string, on: boolean) =>
		setD({
			...d,
			participantUserIds: on
				? [...d.participantUserIds, id]
				: d.participantUserIds.filter((x) => x !== id),
		});
	return (
		<FormDialog
			title={t("newCeremony")}
			lead={t("ceremonyLead")}
			trigger={<NewTrigger label={t("newCeremony")} />}
			open={open}
			setOpen={setOpen}
			pending={pending}
			error={error}
			wide
			onSubmit={() =>
				start(async () => {
					reset();
					const res = await recordCeremony({ walletId, ...d });
					if (!res.ok) return fail(res);
					toast.success(t("ceremonySaved"));
					setD(empty);
					setOpen(false);
					router.refresh();
				})
			}
		>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
				<EnumSelect
					id="kc-kind"
					label={t("ceremonyKind")}
					value={d.kind}
					options={CEREMONY_KINDS}
					onChange={(v) => setD({ ...d, kind: v })}
					text={(v) => t(`ceremony_${v}`)}
				/>
				<Field
					id="kc-date"
					label={t("heldAt")}
					type="date"
					value={d.heldAt}
					onChange={(v) => setD({ ...d, heldAt: v })}
					required
				/>
				<EnumSelect
					id="kc-result"
					label={t("result")}
					value={d.result}
					options={["pass", "fail"] as const}
					onChange={(v) => setD({ ...d, result: v })}
					text={(v) => t(`result_${v}`)}
				/>
				<fieldset className="flex flex-col gap-2 sm:col-span-3">
					<legend className="mb-1 font-medium text-subhead">
						{t("participants")}
					</legend>
					<div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
						{members.map((m) => (
							<label
								key={m.userId}
								className="flex items-center gap-2 text-subhead"
							>
								<Checkbox
									checked={d.participantUserIds.includes(m.userId)}
									onCheckedChange={(v) => toggle(m.userId, v === true)}
								/>
								{m.name}
							</label>
						))}
					</div>
				</fieldset>
				<div className="sm:col-span-3">
					<Field
						id="kc-witnesses"
						label={t("witnesses")}
						value={d.witnesses}
						onChange={(v) => setD({ ...d, witnesses: v })}
					/>
				</div>
				<div className="sm:col-span-3">
					<Field
						id="kc-notes"
						label={t("notes")}
						rows={3}
						value={d.notes}
						onChange={(v) => setD({ ...d, notes: v })}
					/>
				</div>
				{(d.kind === "backup_test" || d.kind === "recovery_test") && (
					<p className="text-muted-foreground text-footnote sm:col-span-3">
						{t("testHint")}
					</p>
				)}
			</div>
		</FormDialog>
	);
}
