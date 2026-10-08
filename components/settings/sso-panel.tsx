"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	deleteSsoProvider,
	registerSsoProvider,
	requestSsoDomainVerification,
	verifySsoDomain,
} from "@/app/actions/sso";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type SsoProviderRow = {
	id: string;
	providerId: string;
	issuer: string;
	domain: string;
	domainVerified: boolean;
	clientId: string | null;
	discoveryEndpoint: string | null;
};

const EMPTY = {
	providerId: "",
	domain: "",
	issuer: "",
	clientId: "",
	clientSecret: "",
	discoveryEndpoint: "",
	scopes: "openid email profile",
};

export function SsoPanel({
	providers,
	callbackBase,
	canEdit,
}: {
	providers: SsoProviderRow[];
	callbackBase: string;
	canEdit: boolean;
}) {
	const t = useTranslations("Settings");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [form, setForm] = useState(EMPTY);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [tokens, setTokens] = useState<Record<string, string>>({});

	const fail = (error: string): void => {
		toast.error(error === "step_up_required" ? t("stepUp") : tc("error"));
	};

	const field = (
		key: keyof typeof EMPTY,
		label: string,
		props: React.ComponentProps<typeof Input> = {},
	) => (
		<div className="flex flex-col gap-1">
			<Label htmlFor={`sso-${key}`}>{label}</Label>
			<Input
				id={`sso-${key}`}
				value={form[key]}
				onChange={(e) => setForm({ ...form, [key]: e.target.value })}
				aria-invalid={errors[key] ? true : undefined}
				{...props}
			/>
			{errors[key] && <p className="text-destructive text-xs">{errors[key]}</p>}
		</div>
	);

	return (
		<div className="flex flex-col gap-6 text-sm">
			<p className="text-muted-foreground">{t("ssoLead")}</p>
			{providers.length === 0 ? (
				<p className="text-muted-foreground">{t("ssoNone")}</p>
			) : (
				<ul className="flex flex-col gap-3">
					{providers.map((p) => (
						<li
							key={p.id}
							className="flex flex-col gap-2 rounded-md border p-3"
						>
							<div className="flex flex-wrap items-center gap-2">
								<span className="font-mono text-xs">{p.providerId}</span>
								<span className="font-medium">{p.domain}</span>
								<Badge variant={p.domainVerified ? "success" : "warning"}>
									{p.domainVerified ? t("ssoVerified") : t("ssoUnverified")}
								</Badge>
								<span className="ml-auto text-muted-foreground text-xs">
									{p.issuer}
								</span>
							</div>
							<p className="text-muted-foreground text-xs">
								{t("ssoCallbackHint")}{" "}
								<code className="rounded-sm bg-muted px-1">
									{callbackBase}/api/auth/sso/callback/{p.providerId}
								</code>
							</p>
							{tokens[p.providerId] && (
								<p className="rounded-md bg-muted/40 p-2 text-xs">
									{t("ssoDnsHint", { domain: p.domain })}{" "}
									<code className="break-all">{tokens[p.providerId]}</code>
								</p>
							)}
							{canEdit && (
								<div className="flex flex-wrap gap-2">
									{!p.domainVerified && (
										<>
											<Button
												size="sm"
												variant="outline"
												disabled={pending}
												onClick={() =>
													start(async () => {
														const res = await withStepUp(() =>
															requestSsoDomainVerification(p.providerId),
														);
														if (!res.ok) return fail(res.error);
														setTokens({
															...tokens,
															[p.providerId]: res.data.token,
														});
													})
												}
											>
												{t("ssoRequestVerification")}
											</Button>
											<Button
												size="sm"
												variant="outline"
												disabled={pending}
												onClick={() =>
													start(async () => {
														const res = await withStepUp(() =>
															verifySsoDomain(p.providerId),
														);
														if (!res.ok) return fail(res.error);
														toast.success(t("ssoVerifiedToast"));
														router.refresh();
													})
												}
											>
												{t("ssoVerify")}
											</Button>
										</>
									)}
									<Button
										size="sm"
										variant="ghost"
										className="text-destructive"
										disabled={pending}
										onClick={() =>
											start(async () => {
												const res = await withStepUp(() =>
													deleteSsoProvider(p.providerId),
												);
												if (!res.ok) return fail(res.error);
												toast.success(t("ssoDeleted"));
												router.refresh();
											})
										}
									>
										{t("ssoDelete")}
									</Button>
								</div>
							)}
						</li>
					))}
				</ul>
			)}

			{canEdit && (
				<Card>
					<CardHeader>
						<CardTitle className="text-base">{t("ssoAdd")}</CardTitle>
						<CardDescription>{t("ssoAddLead")}</CardDescription>
					</CardHeader>
					<CardContent>
						<form
							className="grid gap-4 sm:grid-cols-2"
							onSubmit={(e) => {
								e.preventDefault();
								start(async () => {
									const res = await withStepUp(() => registerSsoProvider(form));
									if (!res.ok) {
										setErrors(
											Object.fromEntries(
												Object.entries(res.fieldErrors ?? {}).map(([k, v]) => [
													k,
													Array.isArray(v) ? v.join(", ") : String(v),
												]),
											),
										);
										return fail(res.error);
									}
									setErrors({});
									setForm(EMPTY);
									toast.success(t("ssoRegistered"));
									router.refresh();
								});
							}}
						>
							{field("providerId", t("ssoProviderId"), {
								placeholder: "firma-entra",
								className: "font-mono",
							})}
							{field("domain", t("ssoDomain"), { placeholder: "firma.de" })}
							{field("issuer", t("ssoIssuer"), {
								placeholder: "https://login.microsoftonline.com/<tenant>/v2.0",
							})}
							{field("discoveryEndpoint", t("ssoDiscovery"), {
								placeholder:
									"optional — sonst <issuer>/.well-known/openid-configuration",
							})}
							{field("clientId", t("ssoClientId"))}
							{field("clientSecret", t("ssoClientSecret"), {
								type: "password",
								autoComplete: "off",
							})}
							{field("scopes", t("ssoScopes"))}
							<div className="flex items-end justify-end">
								<Button type="submit" size="sm" disabled={pending}>
									{t("ssoAdd")}
								</Button>
							</div>
						</form>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
