"use client";

import { ArrowUpRight, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	removeTeamsAction,
	sendTeamsTest,
	setTeamsEnabledAction,
	startTeamsConsent,
} from "@/app/actions/teams";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-alert";
import { errorText } from "@/components/ui/error-text";
import { FormAlert } from "@/components/ui/form-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";

export type TeamsView = {
	tenantId: string;
	status: "pending_consent" | "active" | "error";
	enabled: boolean;
	consentedAt: Date | null;
	lastError: string | null;
} | null;

const TEAMS_ERRORS = [
	"user_not_found",
	"app_not_in_catalog",
	"consent_missing",
	"install_failed",
	"send_failed",
	"token_failed",
	"throttled",
	"not_configured",
	"not_consented",
] as const;

const fmt = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeStyle: "short",
	timeZone: "Europe/Berlin",
});

// Einstellungen > Integrationen > Microsoft Teams (T5): Tenant eintragen,
// Freigabe-Link für die IT, App-Paket, Zustellung ein/aus, Testhinweis.
export function TeamsPanel({
	configured,
	isOwner,
	integration,
	suggestedTenant,
}: {
	configured: boolean;
	isOwner: boolean;
	integration: TeamsView;
	suggestedTenant: string | null;
}) {
	const t = useTranslations("Teams");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [tenant, setTenant] = useState(
		integration?.tenantId ?? suggestedTenant ?? "",
	);
	const [consentUrl, setConsentUrl] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const confirmRemove = useConfirm({
		title: t("removeTitle"),
		description: t("removeLead"),
		confirmLabel: t("remove"),
	});

	const fail = (res: { error?: string }) => {
		const code = (res.error ?? "").replace(/^teams_/, "");
		setError(
			(TEAMS_ERRORS as readonly string[]).includes(code)
				? t(`error_${code as (typeof TEAMS_ERRORS)[number]}`)
				: errorText(tc, res),
		);
	};

	const status = integration?.status ?? null;
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-headline">{t("title")}</CardTitle>
				<CardDescription>{t("lead")}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-5 text-subhead">
				{!configured ? (
					<p className="text-muted-foreground">{t("notConfigured")}</p>
				) : (
					<>
						<div className="flex flex-wrap items-center gap-2">
							<span className="text-muted-foreground">{t("status")}</span>
							<Badge
								variant={
									status === "active"
										? integration?.enabled
											? "success"
											: "outline"
										: status === "error"
											? "destructive"
											: "muted"
								}
							>
								{status === null
									? t("statusNone")
									: status === "active"
										? integration?.enabled
											? t("statusOn")
											: t("statusOff")
										: status === "error"
											? t("statusError")
											: t("statusPending")}
							</Badge>
							{integration?.consentedAt && (
								<span className="text-footnote text-muted-foreground">
									{t("consentedAt", {
										at: fmt.format(integration.consentedAt),
									})}
								</span>
							)}
						</div>
						{integration?.lastError && (
							<p className="text-footnote text-muted-foreground">
								{t("lastError", { error: integration.lastError })}
							</p>
						)}

						<ol className="flex list-decimal flex-col gap-4 pl-5">
							<li className="flex flex-col gap-1.5">
								<span className="font-medium">{t("step1")}</span>
								<span className="text-footnote text-muted-foreground">
									{t("step1Hint")}
								</span>
								<a
									href="/api/teams/app.zip"
									download
									className="inline-flex items-center gap-1 text-primary hover:underline"
								>
									{t("downloadPackage")}
								</a>
							</li>
							<li className="flex flex-col gap-1.5">
								<span className="font-medium">{t("step2")}</span>
								<Label
									htmlFor="teams-tenant"
									className="text-footnote text-muted-foreground"
								>
									{t("tenant")}
								</Label>
								<div className="flex flex-col gap-2 sm:flex-row">
									<Input
										id="teams-tenant"
										value={tenant}
										onChange={(e) => setTenant(e.target.value.trim())}
										placeholder={t("tenantPlaceholder")}
										spellCheck={false}
										autoComplete="off"
										disabled={!isOwner || pending}
										className="sm:w-96"
									/>
									{isOwner && (
										<Button
											type="button"
											disabled={pending || tenant.length < 30}
											onClick={() =>
												start(async () => {
													setError(null);
													const res = await withStepUp(() =>
														startTeamsConsent({ tenantId: tenant }),
													);
													if (!res.ok) return fail(res);
													setConsentUrl(res.data.url);
													router.refresh();
												})
											}
										>
											{t("consent")}
										</Button>
									)}
								</div>
								<span className="text-footnote text-muted-foreground">
									{t("step2Hint")}
								</span>
								{consentUrl && (
									<div className="flex flex-col gap-2 rounded-xl bg-muted/50 p-3">
										<span className="text-footnote">
											{t("consentLinkLead")}
										</span>
										<div className="flex flex-wrap gap-2">
											<a
												href={consentUrl}
												target="_blank"
												rel="noopener noreferrer"
												className="inline-flex items-center gap-1 text-primary hover:underline"
											>
												{t("consentOpen")}
												<ArrowUpRight className="size-4" aria-hidden="true" />
											</a>
											<Button
												type="button"
												size="sm"
												variant="secondary"
												onClick={() => {
													void navigator.clipboard
														.writeText(consentUrl)
														.then(() => toast.success(t("copied")));
												}}
											>
												<Copy aria-hidden="true" />
												{t("copyLink")}
											</Button>
										</div>
									</div>
								)}
							</li>
							<li className="flex flex-col gap-1.5">
								<span className="font-medium">{t("step3")}</span>
								<label className="flex items-center gap-3">
									<Switch
										checked={integration?.enabled ?? false}
										disabled={!isOwner || pending || status !== "active"}
										onCheckedChange={(v) =>
											start(async () => {
												setError(null);
												const res = await withStepUp(() =>
													setTeamsEnabledAction({ enabled: v }),
												);
												if (!res.ok) return fail(res);
												toast.success(v ? t("enabledOn") : t("enabledOff"));
												router.refresh();
											})
										}
									/>
									{t("enable")}
								</label>
								<span className="text-footnote text-muted-foreground">
									{t("step3Hint")}
								</span>
							</li>
						</ol>

						{isOwner && integration && (
							<div className="flex flex-wrap gap-2">
								<Button
									type="button"
									variant="secondary"
									disabled={pending || status !== "active"}
									onClick={() =>
										start(async () => {
											setError(null);
											const res = await withStepUp(() => sendTeamsTest());
											if (!res.ok) return fail(res);
											toast.success(t("testSent"));
										})
									}
								>
									{t("test")}
								</Button>
								<Button
									type="button"
									variant="ghost"
									disabled={pending}
									onClick={() =>
										confirmRemove.ask(() =>
											start(async () => {
												const res = await withStepUp(() => removeTeamsAction());
												if (!res.ok) return fail(res);
												setConsentUrl(null);
												toast.success(t("removed"));
												router.refresh();
											}),
										)
									}
								>
									{t("remove")}
								</Button>
							</div>
						)}
						<p className="text-footnote text-muted-foreground">
							{t("privacy")}
						</p>
					</>
				)}
				<FormAlert message={error} />
				{confirmRemove.node}
			</CardContent>
		</Card>
	);
}
