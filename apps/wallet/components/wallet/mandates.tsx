"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import {
	prepareMandateAction,
	revokeMandateAction,
	submitMandateAction,
	syncMandateSignerAction,
} from "@wallet/app/actions/mandates";
import type { PreparedMandate } from "@wallet/lib/validation/mandates";
import { ArrowUpRight, KeyRound, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
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
import type { AssetCode } from "@/lib/wallet/core/assets";
import type { WalletNetwork } from "@/lib/wallet/core/networks";

// Vollmacht ausstellen (Härtung W): Rahmen wählen, Zusammenfassung lesen,
// dann mit dem Sicherheitsschlüssel unterschreiben. Unterschrieben wird der
// kanonische Text, den der Server gebaut hat (lib/wallet/core/mandate.ts).
// Mit eigenem Signer folgt die Freigabe dort auf der Bestätigungsseite.

type Destination = {
	id: string;
	label: string;
	address: string;
	network: WalletNetwork;
};

const KNOWN_ERRORS = [
	"mandate_self",
	"mandate_amounts",
	"mandate_grantee",
	"mandate_expired",
	"mandate_signature",
	"security_key_required",
	"destination_inactive",
	"asset_not_allowed",
	"cancelled",
] as const;

export function IssueMandateDialog({
	operators,
	destinations,
	networks,
}: {
	operators: { id: string; name: string }[];
	destinations: Destination[];
	// je Netz mit aktiven Zielen: Bezeichnung und erlaubte Assets
	networks: { key: WalletNetwork; label: string; assets: AssetCode[] }[];
}) {
	const t = useTranslations("Mandates");
	const tc = useTranslations("Common");
	const router = useRouter();
	const ids = {
		perPayout: useId(),
		total: useId(),
		days: useId(),
	};
	const [open, setOpen] = useState(false);
	const [grantee, setGrantee] = useState(operators[0]?.id ?? "");
	const [network, setNetwork] = useState<WalletNetwork | "">(
		networks[0]?.key ?? "",
	);
	const net = networks.find((n) => n.key === network);
	const [asset, setAsset] = useState<AssetCode | "">(net?.assets[0] ?? "");
	const [perPayout, setPerPayout] = useState("");
	const [total, setTotal] = useState("");
	const [days, setDays] = useState("30");
	const [dest, setDest] = useState<string[]>([]);
	const [prepared, setPrepared] = useState<PreparedMandate | null>(null);
	// nach dem Ausstellen: Link zur Freigabe im Signer
	const [signerLink, setSignerLink] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const message = (code: string | undefined) =>
		code && (KNOWN_ERRORS as readonly string[]).includes(code)
			? t(`error_${code as (typeof KNOWN_ERRORS)[number]}`)
			: code?.startsWith("amount_")
				? t("error_amount")
				: code?.includes(" ")
					? code
					: tc("error");

	function reset() {
		setPrepared(null);
		setSignerLink(null);
		setError(null);
		setBusy(false);
	}

	async function prepare(e: React.FormEvent) {
		e.preventDefault();
		setBusy(true);
		setError(null);
		try {
			const res = await prepareMandateAction({
				granteeUserId: grantee,
				network,
				asset,
				perPayout,
				total,
				destinationIds: dest,
				days,
			});
			if (!res.ok) return setError(message(res.error));
			setPrepared(res.data);
		} finally {
			setBusy(false);
		}
	}

	async function sign() {
		if (!prepared) return;
		setBusy(true);
		setError(null);
		try {
			let response: Awaited<ReturnType<typeof startAuthentication>>;
			try {
				response = await startAuthentication({
					optionsJSON: prepared.options,
				});
			} catch {
				return setError(t("error_cancelled"));
			}
			const res = await submitMandateAction(response);
			if (!res.ok) {
				setPrepared(null);
				return setError(message(res.error));
			}
			setDest([]);
			router.refresh();
			if (res.data.signer === "registered" && res.data.confirmUrl) {
				setPrepared(null);
				setSignerLink(res.data.confirmUrl);
				return;
			}
			if (res.data.signer === "failed") toast.error(t("issuedSignerFailed"));
			else toast.success(t("issued"));
			setOpen(false);
			reset();
		} finally {
			setBusy(false);
		}
	}

	const fmt = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "long",
		timeZone: "Europe/Berlin",
	});

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				if (!o) reset();
			}}
		>
			<DialogTrigger asChild>
				<Button disabled={operators.length === 0 || networks.length === 0}>
					<Plus aria-hidden /> {t("issue")}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{signerLink
							? t("signerTitle")
							: prepared
								? t("confirmTitle")
								: t("issue")}
					</DialogTitle>
					<DialogDescription>
						{signerLink
							? t("signerLead")
							: prepared
								? t("confirmLead")
								: t("issueLead")}
					</DialogDescription>
				</DialogHeader>
				{signerLink ? (
					<DialogFooter>
						<Button
							type="button"
							variant="secondary"
							onClick={() => {
								setOpen(false);
								reset();
							}}
						>
							{t("signerDone")}
						</Button>
						<Button asChild>
							<a href={signerLink} target="_blank" rel="noopener noreferrer">
								{t("signerOpen")} <ArrowUpRight aria-hidden />
							</a>
						</Button>
					</DialogFooter>
				) : prepared ? (
					<div className="flex flex-col gap-4">
						<dl className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-2xl bg-muted p-4 text-subhead sm:grid-cols-[auto_1fr]">
							<dt className="text-muted-foreground">{t("grantee")}</dt>
							<dd>{prepared.summary.grantee}</dd>
							<dt className="text-muted-foreground">{t("perPayout")}</dt>
							<dd className="tabular-nums">{prepared.summary.perPayout}</dd>
							<dt className="text-muted-foreground">{t("total")}</dt>
							<dd className="tabular-nums">{prepared.summary.total}</dd>
							<dt className="text-muted-foreground">{t("destinations")}</dt>
							<dd>{prepared.summary.destinations.join(", ")}</dd>
							<dt className="text-muted-foreground">{t("validUntil")}</dt>
							<dd>{fmt.format(new Date(prepared.summary.validUntil))}</dd>
						</dl>
						<FormAlert message={error} />
						<DialogFooter>
							<Button variant="secondary" onClick={reset} disabled={busy}>
								{t("back")}
							</Button>
							<Button onClick={sign} disabled={busy}>
								<KeyRound aria-hidden />
								{busy ? t("signing") : t("sign")}
							</Button>
						</DialogFooter>
					</div>
				) : (
					<form className="flex flex-col gap-4" onSubmit={prepare}>
						<div className="grid gap-1.5">
							<Label>{t("grantee")}</Label>
							<Select value={grantee} onValueChange={setGrantee}>
								<SelectTrigger aria-label={t("grantee")} className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{operators.map((o) => (
										<SelectItem key={o.id} value={o.id}>
											{o.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="grid gap-1.5">
							<Label>{t("network")}</Label>
							<Select
								value={network}
								onValueChange={(v) => {
									const n = v as WalletNetwork;
									setNetwork(n);
									setAsset(networks.find((x) => x.key === n)?.assets[0] ?? "");
									setDest([]);
								}}
							>
								<SelectTrigger aria-label={t("network")} className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{networks.map((n) => (
										<SelectItem key={n.key} value={n.key}>
											{n.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div className="grid min-w-0 gap-1.5">
								<Label>{t("asset")}</Label>
								<Select
									value={asset}
									onValueChange={(v) => setAsset(v as AssetCode)}
								>
									<SelectTrigger aria-label={t("asset")} className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{(net?.assets ?? []).map((a) => (
											<SelectItem key={a} value={a}>
												{a}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="grid gap-1.5">
								<Label htmlFor={ids.days}>{t("days")}</Label>
								<Input
									id={ids.days}
									name="days"
									type="number"
									inputMode="numeric"
									min={1}
									max={90}
									value={days}
									onChange={(e) => setDays(e.target.value)}
									required
								/>
							</div>
						</div>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div className="grid gap-1.5">
								<Label htmlFor={ids.perPayout}>{t("perPayout")}</Label>
								<Input
									id={ids.perPayout}
									name="perPayout"
									inputMode="decimal"
									autoComplete="off"
									value={perPayout}
									onChange={(e) => setPerPayout(e.target.value)}
									placeholder={t("amountPlaceholder")}
									required
								/>
							</div>
							<div className="grid gap-1.5">
								<Label htmlFor={ids.total}>{t("total")}</Label>
								<Input
									id={ids.total}
									name="total"
									inputMode="decimal"
									autoComplete="off"
									value={total}
									onChange={(e) => setTotal(e.target.value)}
									placeholder={t("totalPlaceholder")}
									required
								/>
							</div>
						</div>
						<fieldset className="grid gap-1.5">
							<legend className="mb-1.5 font-medium text-subhead">
								{t("destinations")}
							</legend>
							{destinations
								.filter((d) => d.network === network)
								.map((d) => (
									<label
										key={d.id}
										className="flex min-h-11 cursor-pointer items-center gap-3"
									>
										<Checkbox
											checked={dest.includes(d.id)}
											onCheckedChange={(v) =>
												setDest(
													v ? [...dest, d.id] : dest.filter((x) => x !== d.id),
												)
											}
										/>
										<span className="min-w-0">
											<span className="block">{d.label}</span>
											<span
												className="block truncate font-mono text-footnote text-muted-foreground"
												translate="no"
											>
												{d.address}
											</span>
										</span>
									</label>
								))}
						</fieldset>
						<FormAlert message={error} />
						<DialogFooter>
							<Button
								type="submit"
								disabled={busy || dest.length === 0 || !grantee || !asset}
							>
								{busy ? t("checking") : t("next")}
							</Button>
						</DialogFooter>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}

export function RevokeMandateButton({ id }: { id: string }) {
	const t = useTranslations("Mandates");
	const tc = useTranslations("Common");
	const router = useRouter();
	const reasonId = useId();
	const [open, setOpen] = useState(false);
	const [reason, setReason] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function revoke(e: React.FormEvent) {
		e.preventDefault();
		setBusy(true);
		setError(null);
		try {
			const res = await revokeMandateAction({ id, reason });
			if (!res.ok)
				return setError(res.error.includes(" ") ? res.error : tc("error"));
			if (res.data.signer === "failed") toast.notice(t("revokedSignerFailed"));
			else toast.success(t("revoked"));
			setOpen(false);
			router.refresh();
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="ghost" size="sm">
					{t("revoke")}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("revokeTitle")}</DialogTitle>
					<DialogDescription>{t("revokeLead")}</DialogDescription>
				</DialogHeader>
				<form className="flex flex-col gap-4" onSubmit={revoke}>
					<div className="grid gap-1.5">
						<Label htmlFor={reasonId}>{t("reason")}</Label>
						<Textarea
							id={reasonId}
							name="reason"
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							minLength={3}
							maxLength={300}
							required
						/>
					</div>
					<FormAlert message={error} />
					<DialogFooter>
						<Button
							type="submit"
							variant="destructive"
							disabled={busy || reason.trim().length < 3}
						>
							{t("revoke")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// Stand im Signer je Vollmacht (nur mit eigenem Signer): freigegeben,
// offen (Link zur Bestätigungsseite) oder abweichend (abgleichen)
export function MandateSignerState({
	id,
	state,
	confirmUrl,
}: {
	id: string;
	state: "active" | "pending" | "missing" | "stale";
	confirmUrl: string | null;
}) {
	const t = useTranslations("Mandates");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [busy, setBusy] = useState(false);

	async function sync() {
		setBusy(true);
		try {
			const res = await syncMandateSignerAction(id);
			if (!res.ok) return toast.error(tc("error"));
			toast.success(t("signerSynced"));
			router.refresh();
		} finally {
			setBusy(false);
		}
	}

	if (state === "active")
		return <Badge variant="success">{t("signerActive")}</Badge>;
	if (state === "pending" && confirmUrl)
		return (
			<Button asChild variant="secondary" size="sm">
				<a href={confirmUrl} target="_blank" rel="noopener noreferrer">
					{t("signerPending")} <ArrowUpRight aria-hidden />
				</a>
			</Button>
		);
	return (
		<span className="flex items-center gap-2">
			{state === "stale" && (
				<Badge variant="warning">{t("signerStillActive")}</Badge>
			)}
			<Button variant="ghost" size="sm" onClick={sync} disabled={busy}>
				{t("signerMissing")}
			</Button>
		</span>
	);
}
