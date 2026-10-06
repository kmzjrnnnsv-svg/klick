"use client";

import { KeyRound, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { revokeOtherSessions, revokeSession } from "@/app/actions/security";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
};

export function SecurityPanel({
	mfaEnabled,
	sessions,
	passkeys,
}: {
	mfaEnabled: boolean;
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

	async function addPasskey() {
		const res = await authClient.passkey.addPasskey({
			name: passkeyName || undefined,
		});
		if (res?.error) {
			toast.error(tc("error"));
			return;
		}
		setPasskeyName("");
		router.refresh();
	}

	async function deletePasskey(id: string) {
		const res = await authClient.passkey.deletePasskey({ id });
		if (res?.error) toast.error(tc("error"));
		router.refresh();
	}

	return (
		<div className="flex flex-col gap-4">
			<Card>
				<CardHeader>
					<CardTitle className="text-base">
						{mfaEnabled ? t("mfaStatusOn") : t("mfaStatusOff")}
					</CardTitle>
					<CardDescription>{t("securityLead")}</CardDescription>
				</CardHeader>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">{t("passkeys")}</CardTitle>
					<CardDescription>{t("passkeysLead")}</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{passkeys.length === 0 ? (
						<p className="text-muted-foreground text-sm">{t("noPasskeys")}</p>
					) : (
						<ul className="divide-y divide-border/60">
							{passkeys.map((p) => (
								<li key={p.id} className="flex items-center gap-3 py-2 text-sm">
									<KeyRound
										className="size-4 text-muted-foreground"
										strokeWidth={1.5}
									/>
									<span className="font-medium">{p.name ?? "Passkey"}</span>
									<span className="text-muted-foreground text-xs">
										{p.deviceType}
										{p.createdAt ? ` · ${fmt.format(p.createdAt)}` : ""}
									</span>
									<Button
										variant="ghost"
										size="icon-sm"
										className="ml-auto"
										aria-label={t("removePasskey")}
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
					<CardTitle className="text-base">{t("sessions")}</CardTitle>
					<CardDescription>{t("sessionsLead")}</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<ul className="divide-y divide-border/60">
						{sessions.map((s) => (
							<li
								key={s.id}
								className="flex flex-wrap items-center gap-3 py-2 text-sm"
							>
								<span className="font-mono text-xs">{s.ipAddress ?? "–"}</span>
								<span className="line-clamp-1 max-w-sm text-muted-foreground text-xs">
									{s.userAgent ?? ""}
								</span>
								<span className="text-muted-foreground text-xs">
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
												if (!res.ok) toast.error(res.error);
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
									if (!res.ok) toast.error(res.error);
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
