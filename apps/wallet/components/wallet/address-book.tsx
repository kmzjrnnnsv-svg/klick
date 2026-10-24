"use client";

import {
	proposeDestination,
	vetoDestination,
} from "@wallet/app/actions/wallet-send";
import { useWalletError } from "@wallet/components/wallet/use-wallet-error";
import { Ban, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
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
import type { WalletNetwork } from "@/lib/wallet/core/networks";

// Zieladresse vorschlagen → Absicht im Signer, Freigabe per Sicherheitsschlüssel
export function ProposeDestinationDialog({
	networks,
}: {
	networks: { key: WalletNetwork; label: string }[];
}) {
	const t = useTranslations("Wallet");
	const router = useRouter();
	const onError = useWalletError();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [network, setNetwork] = useState<WalletNetwork | "">(
		networks[0]?.key ?? "",
	);
	const [address, setAddress] = useState("");
	const [label, setLabel] = useState("");

	function submit() {
		start(async () => {
			const res = await proposeDestination({ network, address, label });
			if (!res.ok) return onError(res);
			toast.success(t("abProposed"));
			setOpen(false);
			setAddress("");
			setLabel("");
			router.refresh();
		});
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button type="button">
					<Plus aria-hidden />
					{t("abPropose")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						submit();
					}}
				>
					<DialogHeader>
						<DialogTitle>{t("abProposeTitle")}</DialogTitle>
						<DialogDescription>{t("abProposeLead")}</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="ab-network">{t("fieldNetwork")}</Label>
						<Select
							value={network}
							onValueChange={(v) => setNetwork(v as WalletNetwork)}
						>
							<SelectTrigger id="ab-network" className="w-full">
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
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="ab-address">{t("abFieldAddress")}</Label>
						<Input
							id="ab-address"
							name="address"
							autoComplete="off"
							spellCheck={false}
							className="font-mono"
							value={address}
							onChange={(e) => setAddress(e.target.value)}
							placeholder={t("abAddressPlaceholder")}
							required
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="ab-label">{t("abFieldLabel")}</Label>
						<Input
							id="ab-label"
							name="label"
							autoComplete="off"
							value={label}
							onChange={(e) => setLabel(e.target.value)}
							placeholder={t("abLabelPlaceholder")}
							required
						/>
					</div>
					<p className="text-muted-foreground text-sm">{t("abProposeHint")}</p>
					<DialogFooter>
						<Button type="submit" disabled={pending || !network}>
							{pending ? t("abProposing") : t("abProposeSubmit")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// Veto: bremst nur — jede:r im Wallet-Bereich, mit Grund, endgültig
export function VetoDestinationButton({
	id,
	label,
}: {
	id: string;
	label: string;
}) {
	const t = useTranslations("Wallet");
	const router = useRouter();
	const onError = useWalletError();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [reason, setReason] = useState("");
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					type="button"
					variant="outline"
					size="sm"
					aria-label={t("abVetoFor", { label })}
				>
					<Ban aria-hidden />
					{t("abVeto")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						start(async () => {
							const res = await vetoDestination({ id, reason });
							if (!res.ok) return onError(res);
							toast.success(t("abVetoDone"));
							setOpen(false);
							router.refresh();
						});
					}}
				>
					<DialogHeader>
						<DialogTitle>{t("abVetoTitle", { label })}</DialogTitle>
						<DialogDescription>{t("abVetoLead")}</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor={`veto-${id}`}>{t("abVetoReason")}</Label>
						<Textarea
							id={`veto-${id}`}
							name="reason"
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							required
							minLength={3}
						/>
					</div>
					<DialogFooter>
						<Button type="submit" variant="destructive" disabled={pending}>
							{pending ? t("abVetoing") : t("abVetoSubmit")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
