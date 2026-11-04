"use client";

import { ArrowUpRight, Copy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	disconnectIdentitySource,
	saveIdentityPolicy,
	startEntraConsent,
	syncIdentityNow,
} from "@/app/actions/identity";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/components/ui/confirm-alert";
import { errorText, isFourEyesNotice } from "@/components/ui/error-text";
import { FormAlert } from "@/components/ui/form-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { missingCapabilities } from "@/lib/identity/accounts";
import {
	IDENTITY_POLICY_BOUNDS,
	type IdentityPolicy,
	type IdentityPolicyKey,
} from "@/lib/identity/policy";

export type IdentitySourcePanelView = {
	id: string;
	tenantKey: string;
	status: "pending_consent" | "active" | "error";
	connectedAt: string | null;
	domains: string[];
	capabilities: {
		signIn: boolean;
		mfa: boolean;
		roles: boolean;
		leaveDate: boolean;
	} | null;
	lastSyncAt: string | null;
	lastSyncOk: boolean | null;
	accountCount: number | null;
	lastError: string | null;
	consentOpen: boolean;
};

// Fehler der Quelle, für die es einen eigenen Satz gibt
const SOURCE_ERRORS = [
	"consent_missing",
	"throttled",
	"forbidden",
	"too_many",
	"token_failed",
	"tenant_unbound",
	"tenant_taken",
	"denied",
	"timeout",
	"network",
	"dns",
] as const;
type SourceError = (typeof SOURCE_ERRORS)[number];

const fmt = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeStyle: "short",
	timeZone: "Europe/Berlin",
});

// Einstellungen > Integrationen > Konten und Anmeldungen (Teil D): Entra ID
// nur lesend verbinden, Stand, Abruf, Trennen (Vier-Augen) und die Schwellen
// der automatischen Prüfungen.
export function IdentityPanel({
	configured,
	isOwner,
	canSync,
	source,
	suggestedTenant,
	policy,
}: {
	configured: boolean;
	isOwner: boolean;
	canSync: boolean;
	source: IdentitySourcePanelView | null;
	suggestedTenant: string | null;
	policy: IdentityPolicy;
}) {
	const t = useTranslations("Identity");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [tenant, setTenant] = useState(
		source?.status === "pending_consent"
			? source.tenantKey
			: (suggestedTenant ?? ""),
	);
	const [ack, setAck] = useState(false);
	const [consentUrl, setConsentUrl] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const confirmRemove = useConfirm({
		title: t("removeTitle"),
		description: t("removeLead"),
		confirmLabel: t("remove"),
	});

	const fail = (res: { error?: string; ref?: string }) => {
		if (isFourEyesNotice(res)) {
			toast.notice(errorText(tc, res));
			router.refresh();
			return;
		}
		if (res.error === "step_up_required") return;
		if (res.error === "identity_not_configured")
			return setError(t("notConfigured"));
		setError(errorText(tc, res));
	};

	const status = source?.status ?? null;
	const connected = status === "active" || status === "error";
	const missing = missingCapabilities(source?.capabilities ?? null);
	const lastError =
		source?.lastError &&
		(SOURCE_ERRORS as readonly string[]).includes(source.lastError)
			? t(`error_${source.lastError as SourceError}`)
			: source?.lastError
				? t("errorOther")
				: null;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-headline">{t("panelTitle")}</CardTitle>
				<CardDescription>{t("panelLead")}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-5 text-subhead">
				{!configured ? (
					<p className="text-muted-foreground">{t("notConfigured")}</p>
				) : (
					<>
						<div className="flex flex-col gap-1.5">
							<div className="flex flex-wrap items-center gap-2">
								<span className="font-medium">Microsoft Entra ID</span>
								<Badge
									variant={
										status === "active"
											? "success"
											: status === "error"
												? "destructive"
												: "muted"
									}
								>
									{status === null
										? t("statusNone")
										: status === "active"
											? t("statusActive")
											: status === "error"
												? t("statusError")
												: t("statusPending")}
								</Badge>
							</div>
							{connected && source && (
								<dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-footnote text-muted-foreground sm:grid-cols-[auto_1fr]">
									<dt>{t("tenant")}</dt>
									<dd className="break-all font-mono" translate="no">
										{source.tenantKey}
									</dd>
									{source.domains.length > 0 && (
										<>
											<dt>{t("domains")}</dt>
											<dd className="break-words" translate="no">
												{source.domains.slice(0, 5).join(", ")}
												{source.domains.length > 5 &&
													` ${t("more", { n: source.domains.length - 5 })}`}
											</dd>
										</>
									)}
									<dt>{t("lastSync")}</dt>
									<dd>
										{source.lastSyncAt
											? t("lastSyncAt", {
													at: fmt.format(new Date(source.lastSyncAt)),
													n: source.accountCount ?? 0,
												})
											: t("lastSyncNever")}
									</dd>
								</dl>
							)}
							{lastError && (
								<p className="text-footnote text-destructive">{lastError}</p>
							)}
							{missing.length > 0 && (
								<ul className="flex flex-col gap-1 text-footnote text-muted-foreground">
									{missing.map((m) => (
										<li key={m}>{t(`missing_${m}`)}</li>
									))}
								</ul>
							)}
						</div>

						{connected && (
							<div className="flex flex-wrap gap-2">
								<Button asChild variant="secondary">
									<Link href="/team/konten">{t("viewAccounts")}</Link>
								</Button>
								{canSync && source && (
									<Button
										type="button"
										variant="secondary"
										disabled={pending}
										onClick={() =>
											start(async () => {
												setError(null);
												const res = await syncIdentityNow({
													sourceId: source.id,
												});
												if (!res.ok) return fail(res);
												toast.success(t("syncQueued"));
												router.refresh();
											})
										}
									>
										{t("syncNow")}
									</Button>
								)}
							</div>
						)}

						{isOwner && (
							<div className="flex flex-col gap-3 rounded-2xl bg-muted/40 p-4">
								<span className="font-medium">
									{connected ? t("reconnectTitle") : t("connectTitle")}
								</span>
								<ol className="flex list-decimal flex-col gap-1 pl-5 text-footnote text-muted-foreground">
									<li>{t("connectStep1")}</li>
									<li>{t("connectStep2")}</li>
									<li>{t("connectStep3")}</li>
								</ol>
								<Label htmlFor="identity-tenant">{t("tenantField")}</Label>
								<Input
									id="identity-tenant"
									name="tenant"
									value={tenant}
									onChange={(e) => setTenant(e.target.value.trim())}
									placeholder={t("tenantPlaceholder")}
									spellCheck={false}
									autoComplete="off"
									disabled={pending}
									className="sm:w-96"
								/>
								<label
									htmlFor="identity-ack"
									className="flex items-start gap-3 text-footnote"
								>
									<Checkbox
										id="identity-ack"
										checked={ack}
										onCheckedChange={(v) => setAck(v === true)}
										className="mt-0.5"
									/>
									<span>{t("privacyAck")}</span>
								</label>
								<div>
									<Button
										type="button"
										disabled={pending || tenant.length < 4 || !ack}
										onClick={() =>
											start(async () => {
												setError(null);
												const res = await withStepUp(() =>
													startEntraConsent({ tenant, acknowledged: ack }),
												);
												if (!res.ok) return fail(res);
												setConsentUrl(res.data.url);
												router.refresh();
											})
										}
									>
										{t("createLink")}
									</Button>
								</div>
								{consentUrl && (
									<div className="flex flex-col gap-2 rounded-xl bg-card p-3">
										<span className="text-footnote">{t("linkLead")}</span>
										<div className="flex flex-wrap gap-2">
											<a
												href={consentUrl}
												target="_blank"
												rel="noopener noreferrer"
												className="inline-flex items-center gap-1 text-primary hover:underline"
											>
												{t("linkOpen")}
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
								{!consentUrl && source?.consentOpen && (
									<p className="text-footnote text-muted-foreground">
										{t("linkStillOpen")}
									</p>
								)}
							</div>
						)}

						{isOwner && source && (
							<div>
								<Button
									type="button"
									variant="ghost"
									disabled={pending}
									onClick={() =>
										confirmRemove.ask(() =>
											start(async () => {
												setError(null);
												const res = await withStepUp(() =>
													disconnectIdentitySource({ sourceId: source.id }),
												);
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
			{configured && (
				<CardContent className="border-t pt-5">
					<PolicyForm policy={policy} isOwner={isOwner} />
				</CardContent>
			)}
		</Card>
	);
}

const POLICY_FIELDS: {
	key: IdentityPolicyKey;
	unit: "percent" | "count" | "days";
}[] = [
	{ key: "mfaFailBelow", unit: "percent" },
	{ key: "maxTopAdmins", unit: "count" },
	{ key: "leaverGraceDays", unit: "days" },
	{ key: "inactiveDays", unit: "days" },
	{ key: "neverSignedInDays", unit: "days" },
	{ key: "recertPassDays", unit: "days" },
	{ key: "recertFailDays", unit: "days" },
];

// Schwellen der Prüfungen: strenger sofort, lockerer über Vier-Augen
function PolicyForm({
	policy,
	isOwner,
}: {
	policy: IdentityPolicy;
	isOwner: boolean;
}) {
	const t = useTranslations("Identity");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [values, setValues] = useState<Record<IdentityPolicyKey, string>>(
		() =>
			Object.fromEntries(
				POLICY_FIELDS.map((f) => [f.key, String(policy[f.key])]),
			) as Record<IdentityPolicyKey, string>,
	);
	const [error, setError] = useState<string | null>(null);
	return (
		<form
			className="flex flex-col gap-4"
			onSubmit={(e) => {
				e.preventDefault();
				start(async () => {
					setError(null);
					const res = await withStepUp(() => saveIdentityPolicy(values));
					if (res.ok) {
						toast.success(t("policySaved"));
						router.refresh();
						return;
					}
					if (isFourEyesNotice(res)) {
						toast.notice(errorText(tc, res));
						router.refresh();
						return;
					}
					if (res.error !== "step_up_required") setError(errorText(tc, res));
				});
			}}
		>
			<div className="flex flex-col gap-1">
				<h3 className="font-medium">{t("policyTitle")}</h3>
				<p className="text-footnote text-muted-foreground">
					{isOwner ? t("policyLead") : t("policyOwnerOnly")}
				</p>
			</div>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				{POLICY_FIELDS.map((f) => {
					const [min, max] = IDENTITY_POLICY_BOUNDS[f.key];
					return (
						<div key={f.key} className="flex flex-col gap-1.5">
							<Label htmlFor={`identity-${f.key}`}>
								{t(`policy_${f.key}`)}
							</Label>
							<div className="flex items-center gap-2">
								<Input
									id={`identity-${f.key}`}
									name={f.key}
									type="number"
									inputMode="numeric"
									min={min}
									max={max}
									step={1}
									required
									value={values[f.key]}
									onChange={(e) =>
										setValues((v) => ({ ...v, [f.key]: e.target.value }))
									}
									disabled={!isOwner || pending}
									className="w-28 tabular-nums"
									autoComplete="off"
								/>
								<span className="text-footnote text-muted-foreground">
									{t(`unit_${f.unit}`)}
								</span>
							</div>
						</div>
					);
				})}
			</div>
			<FormAlert message={error} />
			{isOwner && (
				<div>
					<Button type="submit" disabled={pending}>
						{pending ? t("policySaving") : t("policySave")}
					</Button>
				</div>
			)}
		</form>
	);
}
