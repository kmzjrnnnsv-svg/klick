"use client";

import {
	createWalletAccount,
	retireWalletAccount,
	updateWalletAccount,
} from "@wallet/app/actions/wallet";
import {
	EditTrigger,
	Field,
	FormDialog,
	NewTrigger,
} from "@wallet/components/form-dialog";
import {
	WALLET_ACCOUNT_PURPOSES,
	type WalletAccountPurpose,
} from "@wallet/db/schema";
import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
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
import { errorText } from "@/components/ui/error-text";
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
import type { WalletNetwork } from "@/lib/wallet/core/networks";

type Result = {
	ok: boolean;
	error?: string;
	fieldErrors?: Record<string, string[]>;
};

// Fehler der Wallet-Actions → Text (error_<code>), sonst zod-Meldung bzw.
// allgemeiner Hinweis
function useWalletError() {
	const t = useTranslations("Wallet");
	const tc = useTranslations("Common");
	return (res: Result): void => {
		const key = `error_${res.error ?? ""}`;
		const first = Object.values(res.fieldErrors ?? {})[0]?.[0];
		if (t.has(key as never)) toast.error(t(key as never));
		else if (first && t.has(`error_${first}` as never))
			toast.error(t(`error_${first}` as never));
		else toast.error(first ?? errorText(tc, res));
	};
}

function SimpleSelect<T extends string>({
	id,
	label,
	value,
	options,
	onChange,
}: {
	id: string;
	label: string;
	value: T | "none";
	options: { value: T | "none"; label: string }[];
	onChange: (v: T | "none") => void;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor={id}>{label}</Label>
			<Select value={value} onValueChange={(v) => onChange(v as T | "none")}>
				<SelectTrigger id={id} className="w-full">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{options.map((o) => (
						<SelectItem key={o.value} value={o.value}>
							{o.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

// Konto anlegen: öffentlicher Kontoschlüssel → erste Empfangsadresse, die
// auf dem Gerät zu prüfen ist (sonst gehört der Schlüssel nicht zum Gerät)
export function NewAccountDialog({
	networks,
	defaultOpen = false,
}: {
	networks: { key: WalletNetwork; label: string }[];
	defaultOpen?: boolean;
}) {
	const t = useTranslations("Wallet");
	const tc = useTranslations("Common");
	const router = useRouter();
	const onError = useWalletError();
	const [open, setOpen] = useState(defaultOpen);
	const [pending, start] = useTransition();
	const [created, setCreated] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [network, setNetwork] = useState<WalletNetwork | "none">(
		networks[0]?.key ?? "none",
	);
	const [accountKey, setAccountKey] = useState("");
	const [purpose, setPurpose] = useState<WalletAccountPurpose | "none">("own");
	const [historyFrom, setHistoryFrom] = useState("");

	function reset() {
		setCreated(null);
		setName("");
		setAccountKey("");
		setHistoryFrom("");
	}

	function submit() {
		start(async () => {
			const res = await createWalletAccount({
				name,
				network,
				accountKey,
				purpose,
				historyFrom,
			});
			if (!res.ok) return onError(res);
			setCreated(res.data.address);
			router.refresh();
		});
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				if (!o) reset();
			}}
		>
			<DialogTrigger asChild>
				<NewTrigger label={t("newAccount")} />
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl">
				{created ? (
					<div className="flex flex-col gap-4">
						<DialogHeader>
							<DialogTitle>{t("createdTitle")}</DialogTitle>
							<DialogDescription>{t("createdCheck")}</DialogDescription>
						</DialogHeader>
						<p
							className="break-all rounded-xl bg-muted p-3 font-mono text-subhead"
							translate="no"
						>
							{created}
						</p>
						<DialogFooter>
							<Button
								type="button"
								onClick={() => {
									setOpen(false);
									reset();
								}}
							>
								<ShieldCheck aria-hidden />
								{t("createdDone")}
							</Button>
						</DialogFooter>
					</div>
				) : (
					<form
						className="flex flex-col gap-4"
						onSubmit={(e) => {
							e.preventDefault();
							submit();
						}}
					>
						<DialogHeader>
							<DialogTitle>{t("newAccountTitle")}</DialogTitle>
							<DialogDescription>{t("newAccountLead")}</DialogDescription>
						</DialogHeader>
						{networks.length === 0 ? (
							<p className="text-muted-foreground text-subhead">
								{t("noNetworks")}
							</p>
						) : (
							<>
								<Field
									id="wa-name"
									label={t("fieldName")}
									value={name}
									onChange={setName}
									required
									maxLength={80}
									placeholder={t("fieldNamePlaceholder")}
								/>
								<SimpleSelect
									id="wa-network"
									label={t("fieldNetwork")}
									value={network}
									options={networks.map((n) => ({
										value: n.key,
										label: n.label,
									}))}
									onChange={setNetwork}
								/>
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="wa-key">{t("fieldKey")}</Label>
									<Textarea
										id="wa-key"
										name="account-key"
										rows={3}
										required
										value={accountKey}
										onChange={(e) => setAccountKey(e.target.value)}
										placeholder={t("fieldKeyPlaceholder")}
										spellCheck={false}
										autoComplete="off"
										className="break-all font-mono text-footnote"
									/>
								</div>
								<SimpleSelect
									id="wa-purpose"
									label={t("fieldPurpose")}
									value={purpose}
									options={WALLET_ACCOUNT_PURPOSES.map((p) => ({
										value: p,
										label: t(`purpose_${p}`),
									}))}
									onChange={setPurpose}
								/>
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="wa-history">{t("fieldHistory")}</Label>
									<input
										id="wa-history"
										type="date"
										value={historyFrom}
										onChange={(e) => setHistoryFrom(e.target.value)}
										className="h-(--control-h) rounded-md bg-muted px-3 text-callout focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
									/>
									<p className="text-muted-foreground text-footnote">
										{t("fieldHistoryHint")}
									</p>
								</div>
							</>
						)}
						<DialogFooter>
							<Button
								type="button"
								variant="ghost"
								onClick={() => setOpen(false)}
							>
								{tc("cancel")}
							</Button>
							<Button type="submit" disabled={pending || networks.length === 0}>
								{t("newAccount")}
							</Button>
						</DialogFooter>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}

export function EditAccountDialog({
	account,
}: {
	account: { id: string; name: string };
}) {
	const t = useTranslations("Wallet");
	const router = useRouter();
	const onError = useWalletError();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [name, setName] = useState(account.name);
	return (
		<FormDialog
			title={t("editTitle")}
			trigger={<EditTrigger label={t("edit")} />}
			open={open}
			setOpen={setOpen}
			pending={pending}
			onSubmit={() =>
				start(async () => {
					const res = await updateWalletAccount({
						id: account.id,
						name,
					});
					if (!res.ok) return onError(res);
					setOpen(false);
					router.refresh();
				})
			}
		>
			<Field
				id="wa-edit-name"
				label={t("fieldName")}
				value={name}
				onChange={setName}
				required
				maxLength={80}
			/>
		</FormDialog>
	);
}

export function RetireAccountButton({
	id,
	name,
}: {
	id: string;
	name: string;
}) {
	const t = useTranslations("Wallet");
	const router = useRouter();
	const onError = useWalletError();
	const [pending, start] = useTransition();
	return (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			className=""
			disabled={pending}
			onClick={() => {
				if (!window.confirm(t("retireConfirm", { name }))) return;
				start(async () => {
					const res = await retireWalletAccount({ id });
					if (!res.ok) return onError(res);
					router.push("/accounts");
					router.refresh();
				});
			}}
		>
			{t("retire")}
		</Button>
	);
}
