"use client";

import { createHotWalletAccount } from "@wallet/app/actions/wallet-send";
import { withStepUp } from "@wallet/components/auth/step-up-dialog";
import { KeyRound, ShieldCheck } from "lucide-react";
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
import type { WalletNetwork } from "@/lib/wallet/core/networks";

// Hot-Konto anlegen: den Schlüssel erzeugt der Signer aus seiner Seed;
// Klick bekommt nur die xpub. Inhaber:in + Step-up.
export function NewHotAccountDialog({
	networks,
}: {
	networks: { key: WalletNetwork; label: string }[];
}) {
	const t = useTranslations("Wallet");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [name, setName] = useState("");
	const [network, setNetwork] = useState<WalletNetwork | "">(
		networks[0]?.key ?? "",
	);
	const [created, setCreated] = useState<string | null>(null);

	function submit() {
		start(async () => {
			const res = await withStepUp(() =>
				createHotWalletAccount({ name, network }),
			);
			if (!res.ok) {
				const key = `error_${res.error ?? ""}`;
				toast.error(t.has(key as never) ? t(key as never) : errorText(tc, res));
				return;
			}
			setCreated(res.data.address);
			router.refresh();
		});
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				if (!o) {
					setCreated(null);
					setName("");
				}
			}}
		>
			<DialogTrigger asChild>
				<Button type="button" variant="outline">
					<KeyRound aria-hidden />
					{t("hotNew")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				{created ? (
					<div className="flex flex-col gap-4">
						<DialogHeader>
							<DialogTitle>{t("hotCreatedTitle")}</DialogTitle>
							<DialogDescription>{t("hotCreatedLead")}</DialogDescription>
						</DialogHeader>
						<p
							className="break-all rounded-xl bg-muted p-3 font-mono text-subhead"
							translate="no"
						>
							{created}
						</p>
						<DialogFooter>
							<Button type="button" onClick={() => setOpen(false)}>
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
							<DialogTitle>{t("hotTitle")}</DialogTitle>
							<DialogDescription>{t("hotLead")}</DialogDescription>
						</DialogHeader>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="hot-name">{t("fieldName")}</Label>
							<Input
								id="hot-name"
								name="name"
								autoComplete="off"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder={t("hotNamePlaceholder")}
								required
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="hot-network">{t("fieldNetwork")}</Label>
							<Select
								value={network}
								onValueChange={(v) => setNetwork(v as WalletNetwork)}
							>
								<SelectTrigger id="hot-network" className="w-full">
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
						<ul className="list-disc pl-5 text-muted-foreground text-subhead">
							<li>{t("hotHint1")}</li>
							<li>{t("hotHint2")}</li>
						</ul>
						<DialogFooter>
							<Button type="submit" disabled={pending || !network}>
								{pending ? t("hotCreating") : t("hotCreate")}
							</Button>
						</DialogFooter>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}
