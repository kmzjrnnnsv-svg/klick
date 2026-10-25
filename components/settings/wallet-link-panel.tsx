"use client";

import { Copy, Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	connectWallet,
	disconnectWallet,
	renewWalletToken,
} from "@/app/actions/wallet-link";
import { withStepUp } from "@/components/auth/step-up-dialog";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";

export type WalletLinkView = {
	id: string;
	name: string;
	status: "active" | "revoked";
	walletOrgName: string | null;
	lastEventAt: Date | null;
	lastHeartbeatAt: Date | null;
	tokenPrefix: string | null;
	tokenExpiresAt: Date | null;
};

const fmt = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeStyle: "short",
	timeZone: "Europe/Berlin",
});
const fmtDay = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeZone: "Europe/Berlin",
});

// Einstellungen → Integrationen → both.money (Plan both.money, K4): Token
// für den Compliance-Export ausstellen (einmal sichtbar), erneuern, trennen.
export function WalletLinkPanel({
	links,
	origin,
	canCreate,
	canRevoke,
}: {
	links: WalletLinkView[];
	origin: string;
	canCreate: boolean;
	canRevoke: boolean;
}) {
	const t = useTranslations("WalletLink");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [askName, setAskName] = useState(false);
	const [name, setName] = useState("both.money");
	const [shown, setShown] = useState<{
		token: string;
		expiresAt: string;
	} | null>(null);
	const active = links.filter((l) => l.status === "active");

	const fail = (res: { ok: boolean; error?: string; ref?: string }) => {
		if (res.ok || res.error === "step_up_required") return;
		toast.error(tc("error"));
	};

	return (
		<Card>
			<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
				<CardTitle className="text-base">{t("title")}</CardTitle>
				{canCreate && (
					<Button size="sm" onClick={() => setAskName(true)}>
						<Link2 aria-hidden /> {t("connect")}
					</Button>
				)}
			</CardHeader>
			<CardContent className="flex flex-col gap-4 text-subhead">
				<p className="max-w-2xl text-muted-foreground">{t("lead")}</p>
				{active.length === 0 ? (
					<p className="text-muted-foreground">{t("empty")}</p>
				) : (
					<ul className="flex flex-col list-inset overflow-hidden rounded-2xl bg-card">
						{active.map((l) => (
							<li
								key={l.id}
								className="flex flex-wrap items-center justify-between gap-3 px-3 py-3"
							>
								<span className="min-w-0">
									<span className="font-medium">{l.name}</span>{" "}
									{l.tokenPrefix && (
										<span
											className="font-mono text-muted-foreground text-footnote"
											translate="no"
										>
											{l.tokenPrefix}…
										</span>
									)}
									<span className="block text-muted-foreground text-footnote">
										{l.walletOrgName
											? t("boundTo", { org: l.walletOrgName })
											: t("waiting")}
										{" · "}
										{l.lastEventAt
											? t("lastEvent", { time: fmt.format(l.lastEventAt) })
											: t("noEvents")}
										{l.tokenExpiresAt
											? ` · ${t("expires", { date: fmtDay.format(l.tokenExpiresAt) })}`
											: ""}
									</span>
								</span>
								<span className="flex flex-wrap items-center gap-2">
									<Badge variant={l.walletOrgName ? "success" : "warning"}>
										{l.walletOrgName ? t("state_bound") : t("state_waiting")}
									</Badge>
									{canCreate && (
										<Button
											size="sm"
											variant="outline"
											disabled={pending}
											onClick={() =>
												start(async () => {
													const res = await withStepUp(() =>
														renewWalletToken({ linkId: l.id }),
													);
													if (!res.ok) return fail(res);
													setShown(res.data);
													router.refresh();
												})
											}
										>
											{t("renew")}
										</Button>
									)}
									{canRevoke && (
										<AlertDialog>
											<AlertDialogTrigger asChild>
												<Button size="sm" variant="ghost" disabled={pending}>
													{t("disconnect")}
												</Button>
											</AlertDialogTrigger>
											<AlertDialogContent>
												<AlertDialogHeader>
													<AlertDialogTitle>
														{t("disconnectTitle")}
													</AlertDialogTitle>
													<AlertDialogDescription>
														{t("disconnectLead")}
													</AlertDialogDescription>
												</AlertDialogHeader>
												<AlertDialogFooter>
													<AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
													<AlertDialogAction
														onClick={() =>
															start(async () => {
																const res = await withStepUp(() =>
																	disconnectWallet({ linkId: l.id }),
																);
																if (!res.ok) return fail(res);
																toast.success(t("disconnected"));
																router.refresh();
															})
														}
													>
														{t("disconnect")}
													</AlertDialogAction>
												</AlertDialogFooter>
											</AlertDialogContent>
										</AlertDialog>
									)}
								</span>
							</li>
						))}
					</ul>
				)}
			</CardContent>

			<Dialog open={askName} onOpenChange={setAskName}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>{t("connectTitle")}</DialogTitle>
						<DialogDescription>{t("connectLead")}</DialogDescription>
					</DialogHeader>
					<form
						className="flex flex-col gap-4"
						onSubmit={(e) => {
							e.preventDefault();
							start(async () => {
								const res = await withStepUp(() => connectWallet({ name }));
								if (!res.ok) return fail(res);
								setAskName(false);
								setShown(res.data);
								router.refresh();
							});
						}}
					>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="wl-name">{t("name")}</Label>
							<Input
								id="wl-name"
								name="wallet-link-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								required
								maxLength={80}
								autoComplete="off"
							/>
						</div>
						<DialogFooter>
							<Button
								type="button"
								variant="ghost"
								onClick={() => setAskName(false)}
							>
								{tc("cancel")}
							</Button>
							<Button type="submit" disabled={pending}>
								{pending ? t("creating") : t("create")}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<Dialog open={shown !== null} onOpenChange={(o) => !o && setShown(null)}>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>{t("tokenTitle")}</DialogTitle>
						<DialogDescription>{t("tokenLead")}</DialogDescription>
					</DialogHeader>
					{shown && (
						<div className="flex flex-col gap-4 text-subhead">
							<div className="flex gap-2">
								<Input
									readOnly
									aria-label={t("tokenLabel")}
									value={shown.token}
									className="font-mono text-footnote"
									spellCheck={false}
									translate="no"
								/>
								<Button
									type="button"
									variant="outline"
									aria-label={t("copy")}
									onClick={async () => {
										await navigator.clipboard.writeText(shown.token);
										toast.success(t("copied"));
									}}
								>
									<Copy aria-hidden />
								</Button>
							</div>
							<ol className="flex list-decimal flex-col gap-1 ps-5 text-muted-foreground">
								<li>{t("step1")}</li>
								<li>
									{t("step2")}{" "}
									<code
										className="font-mono text-foreground text-footnote"
										translate="no"
									>
										{origin}
									</code>
								</li>
								<li>{t("step3")}</li>
							</ol>
							<p className="text-muted-foreground text-footnote">
								{t("tokenExpires", {
									date: fmtDay.format(new Date(shown.expiresAt)),
								})}
							</p>
						</div>
					)}
					<DialogFooter>
						<Button onClick={() => setShown(null)}>{t("done")}</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</Card>
	);
}
