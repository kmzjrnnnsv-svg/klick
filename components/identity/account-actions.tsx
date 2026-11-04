"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	addIdentityExceptionAction,
	markIdentityAccountLeft,
	revokeIdentityExceptionAction,
	setIdentityMatch,
} from "@/app/actions/identity";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-alert";
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
import { EXCEPTION_KINDS, type ExceptionKind } from "@/lib/identity/types";

// Fehler aus exceptionError/manage.ts mit eigenem Satz
const OWN_ERRORS = [
	"identity_own_account",
	"identity_kind_invalid",
	"identity_reason_short",
	"identity_expiry_past",
	"identity_expiry_too_long",
	"identity_not_member",
] as const;

function useFail() {
	const t = useTranslations("IdentityAccounts");
	const tc = useTranslations("Common");
	return (res: { error?: string; ref?: string }) =>
		res.error && (OWN_ERRORS as readonly string[]).includes(res.error)
			? t(`err_${res.error.replace(/^identity_/, "")}` as "err_own_account")
			: errorText(tc, res);
}

// Person in Klick: automatisch, niemand oder eine bestimmte Person
export function MatchForm({
	accountId,
	value,
	options,
}: {
	accountId: string;
	// "auto", "none" oder Konto-ID
	value: string;
	options: { userId: string; label: string }[];
}) {
	const t = useTranslations("IdentityAccounts");
	const fail = useFail();
	const router = useRouter();
	const [pending, start] = useTransition();
	const [error, setError] = useState<string | null>(null);
	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor="identity-match">{t("matchLabel")}</Label>
			<Select
				value={value}
				disabled={pending}
				onValueChange={(match) =>
					start(async () => {
						setError(null);
						const res = await setIdentityMatch({ accountId, match });
						if (!res.ok) return setError(fail(res));
						toast.success(t("matchSaved"));
						router.refresh();
					})
				}
			>
				<SelectTrigger id="identity-match" className="w-full sm:max-w-96">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="auto">{t("matchAuto")}</SelectItem>
					<SelectItem value="none">{t("matchNone")}</SelectItem>
					{options.map((o) => (
						<SelectItem key={o.userId} value={o.userId}>
							{o.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<FormAlert message={error} />
		</div>
	);
}

// In Klick als ausgeschieden markieren bzw. zurücknehmen
export function LeftToggle({
	accountId,
	left,
}: {
	accountId: string;
	left: boolean;
}) {
	const t = useTranslations("IdentityAccounts");
	const fail = useFail();
	const router = useRouter();
	const [pending, start] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const confirm = useConfirm({
		title: t("markLeftTitle"),
		description: t("markLeftLead"),
		confirmLabel: t("markLeft"),
	});
	const run = (next: boolean) =>
		start(async () => {
			setError(null);
			const res = await markIdentityAccountLeft({ accountId, left: next });
			if (!res.ok) return setError(fail(res));
			toast.success(next ? t("markedLeft") : t("unmarkedLeft"));
			router.refresh();
		});
	return (
		<div className="flex flex-col gap-2">
			<div>
				{left ? (
					<Button
						type="button"
						variant="secondary"
						disabled={pending}
						onClick={() => run(false)}
					>
						{t("unmarkLeft")}
					</Button>
				) : (
					<Button
						type="button"
						variant="secondary"
						disabled={pending}
						onClick={() => confirm.ask(() => run(true))}
					>
						{t("markLeft")}
					</Button>
				)}
			</div>
			<FormAlert message={error} />
			{confirm.node}
		</div>
	);
}

// Ausnahme anlegen: Art, Begründung, Ablauf (Admins höchstens 6 Monate)
export function ExceptionForm({
	accountId,
	maxDate,
	minDate,
	ownAccount,
}: {
	accountId: string;
	maxDate: string;
	minDate: string;
	ownAccount: boolean;
}) {
	const t = useTranslations("IdentityAccounts");
	const fail = useFail();
	const router = useRouter();
	const [pending, start] = useTransition();
	const [kind, setKind] = useState<ExceptionKind>("service");
	const [reason, setReason] = useState("");
	const [expiresAt, setExpiresAt] = useState(maxDate);
	const [error, setError] = useState<string | null>(null);
	if (ownAccount)
		return (
			<p className="text-footnote text-muted-foreground">{t("ownAccount")}</p>
		);
	return (
		<form
			className="flex flex-col gap-3"
			onSubmit={(e) => {
				e.preventDefault();
				start(async () => {
					setError(null);
					const res = await withStepUp(() =>
						addIdentityExceptionAction({ accountId, kind, reason, expiresAt }),
					);
					if (!res.ok) {
						if (res.error !== "step_up_required") setError(fail(res));
						return;
					}
					toast.success(t("exceptionSaved"));
					setReason("");
					router.refresh();
				});
			}}
		>
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="exc-kind">{t("exceptionKind")}</Label>
					<Select
						value={kind}
						onValueChange={(v) => setKind(v as ExceptionKind)}
						disabled={pending}
					>
						<SelectTrigger id="exc-kind">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{EXCEPTION_KINDS.map((k) => (
								<SelectItem key={k} value={k}>
									{t(`kind_${k}`)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="exc-until">{t("exceptionUntilLabel")}</Label>
					<Input
						id="exc-until"
						name="expiresAt"
						type="date"
						min={minDate}
						max={maxDate}
						required
						value={expiresAt}
						onChange={(e) => setExpiresAt(e.target.value)}
						disabled={pending}
						autoComplete="off"
					/>
				</div>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="exc-reason">{t("exceptionReason")}</Label>
				<Textarea
					id="exc-reason"
					name="reason"
					required
					minLength={10}
					maxLength={1000}
					rows={3}
					value={reason}
					onChange={(e) => setReason(e.target.value)}
					placeholder={t("exceptionReasonPlaceholder")}
					disabled={pending}
				/>
			</div>
			<FormAlert message={error} />
			<div>
				<Button type="submit" disabled={pending || reason.trim().length < 10}>
					{pending ? t("exceptionSaving") : t("exceptionSave")}
				</Button>
			</div>
		</form>
	);
}

export function RevokeExceptionButton({
	exceptionId,
}: {
	exceptionId: string;
}) {
	const t = useTranslations("IdentityAccounts");
	const fail = useFail();
	const router = useRouter();
	const [pending, start] = useTransition();
	const confirm = useConfirm({
		title: t("revokeTitle"),
		description: t("revokeLead"),
		confirmLabel: t("revoke"),
	});
	return (
		<>
			<Button
				type="button"
				size="sm"
				variant="ghost"
				disabled={pending}
				onClick={() =>
					confirm.ask(() =>
						start(async () => {
							const res = await revokeIdentityExceptionAction({ exceptionId });
							if (!res.ok) return void toast.error(fail(res));
							toast.success(t("revoked"));
							router.refresh();
						}),
					)
				}
			>
				{t("revoke")}
			</Button>
			{confirm.node}
		</>
	);
}
