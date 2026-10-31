"use client";

import { KeyRound, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { revokeOtherSessions, revokeSession } from "@/app/actions/security";
import {
	isStepUpError,
	withAuthStepUp,
} from "@/components/auth/step-up-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { errorText } from "@/components/ui/error-text";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { authClient } from "@/lib/auth/client";

export type SessionRow = {
	id: string;
	token: string;
	createdAt: Date;
	ipAddress: string | null;
	userAgent: string | null;
	current: boolean;
};
export type PasskeyRow = {
	id: string;
	name: string | null;
	createdAt: Date | null;
	deviceType: string;
	backedUp: boolean;
};

export function SecurityPanel({
	mfaEnabled,
	hasTotp,
	sessions,
	passkeys,
}: {
	mfaEnabled: boolean;
	hasTotp: boolean;
	sessions: SessionRow[];
	passkeys: PasskeyRow[];
}) {
	const t = useTranslations("Settings");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [passkeyName, setPasskeyName] = useState("");
	const fmt = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: "Europe/Berlin",
	});

	// letzter Faktor: nicht löschbar (Server sperrt ebenfalls, endpoint-policy)
	const lastFactor = passkeys.length <= 1 && !hasTotp;

	async function addPasskey() {
		const res = await withAuthStepUp(() =>
			authClient.passkey.addPasskey({ name: passkeyName || undefined }),
		);
		if (res?.error) {
			toast.error(isStepUpError(res.error) ? t("stepUp") : errorText(tc, res));
			return;
		}
		setPasskeyName("");
		router.refresh();
	}

	async function deletePasskey(id: string) {
		const res = await withAuthStepUp(() =>
			authClient.passkey.deletePasskey({ id }),
		);
		if (res?.error)
			toast.error(
				isStepUpError(res.error)
					? t("stepUp")
					: res.error.message === "last_factor"
						? t("lastFactor")
						: errorText(tc, res),
			);
		router.refresh();
	}

	return (
		<div className="flex flex-col gap-4">
			<Card>
				<CardHeader>
					<CardTitle className="text-headline">
						{mfaEnabled ? t("mfaStatusOn") : t("mfaStatusOff")}
					</CardTitle>
					<CardDescription>{t("securityLead")}</CardDescription>
				</CardHeader>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-headline">{t("passkeys")}</CardTitle>
					<CardDescription>{t("passkeysLead")}</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{passkeys.length === 1 && !hasTotp && (
						<p className="rounded-xl bg-muted px-3 py-2 text-subhead">
							{t("secondPasskeyHint")}
						</p>
					)}
					{passkeys.length === 0 ? (
						<p className="text-muted-foreground text-subhead">
							{t("noPasskeys")}
						</p>
					) : (
						<ul className="divide-y divide-border/60">
							{passkeys.map((p) => (
								<li
									key={p.id}
									className="flex items-center gap-3 py-2 text-subhead"
								>
									<KeyRound
										className="size-4 text-muted-foreground"
										strokeWidth={1.5}
									/>
									<span className="font-medium">{p.name ?? "Passkey"}</span>
									<span className="text-muted-foreground text-footnote">
										{p.deviceType === "singleDevice" && !p.backedUp
											? t("passkeyBound")
											: t("passkeySynced")}
										{p.createdAt ? ` · ${fmt.format(p.createdAt)}` : ""}
									</span>
									<Button
										variant="ghost"
										size="icon-sm"
										className="ml-auto"
										aria-label={t("removePasskey")}
										title={lastFactor ? t("lastFactor") : undefined}
										disabled={lastFactor}
										onClick={() => deletePasskey(p.id)}
									>
										<Trash2 />
									</Button>
								</li>
							))}
						</ul>
					)}
					<div className="flex flex-col gap-2 sm:flex-row">
						<Input
							placeholder={t("passkeyName")}
							value={passkeyName}
							onChange={(e) => setPasskeyName(e.target.value)}
							className="sm:max-w-xs"
						/>
						<Button variant="outline" onClick={addPasskey}>
							{t("addPasskey")}
						</Button>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-headline">{t("sessions")}</CardTitle>
					<CardDescription>{t("sessionsLead")}</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<ul className="divide-y divide-border/60">
						{sessions.map((s) => (
							<li
								key={s.id}
								className="flex flex-wrap items-center gap-3 py-2 text-subhead"
							>
								<span className="font-mono text-footnote">
									{s.ipAddress ?? "–"}
								</span>
								<span className="line-clamp-1 max-w-sm text-muted-foreground text-footnote">
									{s.userAgent ?? ""}
								</span>
								<span className="text-muted-foreground text-footnote">
									{fmt.format(s.createdAt)}
								</span>
								{s.current ? (
									<Badge variant="success" className="ml-auto">
										{t("thisSession")}
									</Badge>
								) : (
									<Button
										variant="ghost"
										size="sm"
										className="ml-auto"
										disabled={pending}
										onClick={() =>
											start(async () => {
												const res = await revokeSession(s.token);
												if (!res.ok) toast.error(errorText(tc, res));
											})
										}
									>
										{t("revoke")}
									</Button>
								)}
							</li>
						))}
					</ul>
					{sessions.length > 1 && (
						<Button
							variant="outline"
							size="sm"
							disabled={pending}
							onClick={() =>
								start(async () => {
									const res = await revokeOtherSessions();
									if (!res.ok) toast.error(errorText(tc, res));
								})
							}
						>
							{t("revokeOthers")}
						</Button>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
