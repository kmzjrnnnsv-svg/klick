"use client";

import { ArrowUpRight, Copy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	connectGoogleWorkspace,
	connectOkta,
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
import { CopyValue } from "@/components/ui/copy-value";
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
	tokenHint: string | null;
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
	"tenant_mismatch",
	"denied",
	"timeout",
	"network",
	"dns",
] as const;
type SourceError = (typeof SOURCE_ERRORS)[number];

// Fehler beim Verbinden (Codes aus connectGoogleWorkspace und connectOkta)
const CONNECT_ERRORS = [
	"google_delegation_missing",
	"google_admin_invalid",
	"google_throttled",
	"google_token_failed",
	"google_bad_response",
	"google_unreachable",
	"google_other_customer",
	"tenant_unbound",
	"tenant_taken",
	"okta_token_invalid",
	"okta_forbidden",
	"okta_throttled",
	"okta_bad_response",
	"okta_unreachable",
	"okta_unbound",
	"okta_taken",
	"okta_other_org",
] as const;
type ConnectError = (typeof CONNECT_ERRORS)[number];

type Provider = "entra" | "google" | "okta";
const PROVIDER_NAME: Record<Provider, string> = {
	entra: "Microsoft Entra ID",
	google: "Google Workspace",
	okta: "Okta",
};

// Google-Delegierung in der Admin-Konsole (Sicherheit > API-Steuerung)
const GOOGLE_DELEGATION_URL =
	"https://admin.google.com/ac/owl/domainwidedelegation";

const fmt = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeStyle: "short",
	timeZone: "Europe/Berlin",
});

type Fail = (res: { error?: string; ref?: string }) => void;

// Einstellungen > Integrationen > Konten und Anmeldungen (Teil D): Entra ID
// und Google Workspace nur lesend verbinden, Stand, Abruf, Trennen
// (Vier-Augen) und die Schwellen der automatischen Prüfungen.
export function IdentityPanel({
	isOwner,
	canSync,
	entra,
	google,
	okta,
	policy,
}: {
	isOwner: boolean;
	canSync: boolean;
	entra: {
		configured: boolean;
		source: IdentitySourcePanelView | null;
		suggestedTenant: string | null;
	};
	google: {
		// Client-ID des Dienstkontos; null = auf diesem Server nicht eingerichtet
		clientId: string | null;
		scopes: readonly string[];
		source: IdentitySourcePanelView | null;
	};
	okta: {
		source: IdentitySourcePanelView | null;
		suggestedDomain: string | null;
	};
	policy: IdentityPolicy;
}) {
	const t = useTranslations("Identity");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);

	const fail: Fail = (res) => {
		if (isFourEyesNotice(res)) {
			toast.notice(errorText(tc, res));
			router.refresh();
			return;
		}
		if (res.error === "step_up_required") return;
		if (res.error === "identity_not_configured")
			return setError(t("notConfigured"));
		if ((CONNECT_ERRORS as readonly string[]).includes(res.error ?? ""))
			return setError(t(`connectError_${res.error as ConnectError}`));
		setError(errorText(tc, res));
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-headline">{t("panelTitle")}</CardTitle>
				<CardDescription>{t("panelLead")}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-6 text-subhead">
				{entra.configured && (
					<EntraSection
						isOwner={isOwner}
						canSync={canSync}
						source={entra.source}
						suggestedTenant={entra.suggestedTenant}
						onError={setError}
						fail={fail}
					/>
				)}
				{google.clientId !== null && (
					<GoogleSection
						isOwner={isOwner}
						canSync={canSync}
						clientId={google.clientId}
						scopes={google.scopes}
						source={google.source}
						onError={setError}
						fail={fail}
					/>
				)}
				<OktaSection
					isOwner={isOwner}
					canSync={canSync}
					source={okta.source}
					suggestedDomain={okta.suggestedDomain}
					onError={setError}
					fail={fail}
				/>
				{(!entra.configured || google.clientId === null) && (
					<p className="text-footnote text-muted-foreground">
						{!entra.configured && google.clientId === null
							? t("notConfiguredBoth")
							: t("notConfiguredOne", {
									name: entra.configured
										? "Google Workspace"
										: "Microsoft Entra ID",
								})}
					</p>
				)}
				<p className="text-footnote text-muted-foreground">{t("privacy")}</p>
				<FormAlert message={error} />
			</CardContent>
			<CardContent className="border-t pt-5">
				<PolicyForm policy={policy} isOwner={isOwner} />
			</CardContent>
		</Card>
	);
}

// Stand einer Verbindung: Status, Kennung, Domains, letzter Abruf, Fehler,
// fehlende Fähigkeiten; darunter Konten ansehen, Abruf und Trennen
function SourceStatus({
	provider,
	isOwner,
	canSync,
	source,
	onError,
	fail,
}: {
	provider: Provider;
	isOwner: boolean;
	canSync: boolean;
	source: IdentitySourcePanelView | null;
	onError: (m: string | null) => void;
	fail: Fail;
}) {
	const t = useTranslations("Identity");
	const router = useRouter();
	const [pending, start] = useTransition();
	const confirmRemove = useConfirm({
		title: t("removeTitle"),
		description: t("removeLead"),
		confirmLabel: t("remove"),
	});
	const status = source?.status ?? null;
	const connected = status === "active" || status === "error";
	const missing = missingCapabilities(source?.capabilities ?? null);
	const lastError =
		source?.lastError &&
		(SOURCE_ERRORS as readonly string[]).includes(source.lastError)
			? t(
					provider !== "entra" &&
						(source.lastError === "consent_missing" ||
							source.lastError === "forbidden")
						? `error_${provider}_${source.lastError}`
						: `error_${source.lastError as SourceError}`,
				)
			: source?.lastError
				? t("errorOther")
				: null;
	return (
		<>
			<div className="flex flex-col gap-1.5">
				<div className="flex flex-wrap items-center gap-2">
					<span className="font-medium" translate="no">
						{PROVIDER_NAME[provider]}
					</span>
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
						<dt>
							{provider === "entra"
								? t("tenant")
								: provider === "google"
									? t("customerId")
									: t("oktaDomain")}
						</dt>
						<dd className="break-all font-mono" translate="no">
							{source.tenantKey}
						</dd>
						{source.tokenHint && (
							<>
								<dt>{t("oktaToken")}</dt>
								<dd className="font-mono" translate="no">
									…{source.tokenHint}
								</dd>
							</>
						)}
						{source.domains.length > 0 && (
							<>
								<dt>
									{provider === "okta" ? t("matchDomains") : t("domains")}
								</dt>
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
							<li key={m}>
								{provider === "entra"
									? t(`missing_${m}`)
									: t(`missing_${provider}_${m}`)}
							</li>
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
									onError(null);
									const res = await syncIdentityNow({ sourceId: source.id });
									if (!res.ok) return fail(res);
									toast.success(t("syncQueued"));
									router.refresh();
								})
							}
						>
							{t("syncNow")}
						</Button>
					)}
					{isOwner && source && (
						<Button
							type="button"
							variant="ghost"
							disabled={pending}
							onClick={() =>
								confirmRemove.ask(() =>
									start(async () => {
										onError(null);
										const res = await withStepUp(() =>
											disconnectIdentitySource({ sourceId: source.id }),
										);
										if (!res.ok) return fail(res);
										toast.success(t("removed"));
										router.refresh();
									}),
								)
							}
						>
							{t("remove")}
						</Button>
					)}
				</div>
			)}
			{confirmRemove.node}
		</>
	);
}

// Hinweis zu Datenschutz und Betriebsrat, Pflicht vor dem Verbinden
function PrivacyAck({
	id,
	checked,
	onChange,
}: {
	id: string;
	checked: boolean;
	onChange: (v: boolean) => void;
}) {
	const t = useTranslations("Identity");
	return (
		<label htmlFor={id} className="flex items-start gap-3 text-footnote">
			<Checkbox
				id={id}
				checked={checked}
				onCheckedChange={(v) => onChange(v === true)}
				className="mt-0.5"
			/>
			<span>{t("privacyAck")}</span>
		</label>
	);
}

function EntraSection({
	isOwner,
	canSync,
	source,
	suggestedTenant,
	onError,
	fail,
}: {
	isOwner: boolean;
	canSync: boolean;
	source: IdentitySourcePanelView | null;
	suggestedTenant: string | null;
	onError: (m: string | null) => void;
	fail: Fail;
}) {
	const t = useTranslations("Identity");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [tenant, setTenant] = useState(
		source?.status === "pending_consent"
			? source.tenantKey
			: (suggestedTenant ?? ""),
	);
	const [ack, setAck] = useState(false);
	const [consentUrl, setConsentUrl] = useState<string | null>(null);
	const connected = source?.status === "active" || source?.status === "error";
	return (
		<section className="flex flex-col gap-3" aria-label="Microsoft Entra ID">
			<SourceStatus
				provider="entra"
				isOwner={isOwner}
				canSync={canSync}
				source={source}
				onError={onError}
				fail={fail}
			/>
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
						className="sm:max-w-96"
					/>
					<PrivacyAck id="identity-ack" checked={ack} onChange={setAck} />
					<div>
						<Button
							type="button"
							disabled={pending || tenant.length < 4 || !ack}
							onClick={() =>
								start(async () => {
									onError(null);
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
		</section>
	);
}

// Google Workspace (I3): domänenweite Delegierung für das Dienstkonto von
// Klick, danach Admin-Adresse eintragen; Klick prüft sofort
function GoogleSection({
	isOwner,
	canSync,
	clientId,
	scopes,
	source,
	onError,
	fail,
}: {
	isOwner: boolean;
	canSync: boolean;
	clientId: string;
	scopes: readonly string[];
	source: IdentitySourcePanelView | null;
	onError: (m: string | null) => void;
	fail: Fail;
}) {
	const t = useTranslations("Identity");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [adminEmail, setAdminEmail] = useState("");
	const [ack, setAck] = useState(false);
	const connected = source?.status === "active" || source?.status === "error";
	return (
		<section
			className="flex flex-col gap-3 border-t pt-5 first:border-t-0 first:pt-0"
			aria-label="Google Workspace"
		>
			<SourceStatus
				provider="google"
				isOwner={isOwner}
				canSync={canSync}
				source={source}
				onError={onError}
				fail={fail}
			/>
			{isOwner && (
				<form
					className="flex flex-col gap-3 rounded-2xl bg-muted/40 p-4"
					onSubmit={(e) => {
						e.preventDefault();
						start(async () => {
							onError(null);
							const res = await withStepUp(() =>
								connectGoogleWorkspace({ adminEmail, acknowledged: ack }),
							);
							if (!res.ok) return fail(res);
							toast.success(t("googleConnected"));
							router.refresh();
						});
					}}
				>
					<span className="font-medium">
						{connected ? t("googleReconnectTitle") : t("googleConnectTitle")}
					</span>
					<ol className="flex list-decimal flex-col gap-3 pl-5 text-footnote text-muted-foreground">
						<li>
							<div className="flex flex-col items-start gap-1">
								<span>{t("googleStep1")}</span>
								<a
									href={GOOGLE_DELEGATION_URL}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-1 text-primary hover:underline"
								>
									{t("googleOpenConsole")}
									<ArrowUpRight className="size-4" aria-hidden="true" />
								</a>
							</div>
						</li>
						<li>
							<div className="flex flex-col gap-2">
								<span>{t("googleStep2")}</span>
								<CopyValue label={t("googleClientId")} value={clientId} />
								<CopyValue label={t("googleScopes")} value={scopes.join(",")} />
							</div>
						</li>
						<li>{t("googleStep3")}</li>
					</ol>
					<Label htmlFor="identity-google-admin">{t("googleAdminField")}</Label>
					<Input
						id="identity-google-admin"
						name="adminEmail"
						type="email"
						value={adminEmail}
						onChange={(e) => setAdminEmail(e.target.value.trim())}
						placeholder={t("googleAdminPlaceholder")}
						spellCheck={false}
						autoComplete="off"
						disabled={pending}
						className="sm:max-w-96"
					/>
					<PrivacyAck
						id="identity-google-ack"
						checked={ack}
						onChange={setAck}
					/>
					<div>
						<Button
							type="submit"
							disabled={pending || !adminEmail.includes("@") || !ack}
						>
							{pending ? t("googleChecking") : t("googleConnect")}
						</Button>
					</div>
				</form>
			)}
		</section>
	);
}

// Okta (I4): API-Token einer Person mit Leserechten; Klick prüft sofort
function OktaSection({
	isOwner,
	canSync,
	source,
	suggestedDomain,
	onError,
	fail,
}: {
	isOwner: boolean;
	canSync: boolean;
	source: IdentitySourcePanelView | null;
	suggestedDomain: string | null;
	onError: (m: string | null) => void;
	fail: Fail;
}) {
	const t = useTranslations("Identity");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [domain, setDomain] = useState(
		source?.tenantKey ?? suggestedDomain ?? "",
	);
	const [token, setToken] = useState("");
	const [ack, setAck] = useState(false);
	const connected = source?.status === "active" || source?.status === "error";
	return (
		<section
			className="flex flex-col gap-3 border-t pt-5 first:border-t-0 first:pt-0"
			aria-label="Okta"
		>
			<SourceStatus
				provider="okta"
				isOwner={isOwner}
				canSync={canSync}
				source={source}
				onError={onError}
				fail={fail}
			/>
			{isOwner && (
				<form
					className="flex flex-col gap-3 rounded-2xl bg-muted/40 p-4"
					onSubmit={(e) => {
						e.preventDefault();
						start(async () => {
							onError(null);
							const res = await withStepUp(() =>
								connectOkta({ domain, token, acknowledged: ack }),
							);
							if (!res.ok) {
								const fields = res.fieldErrors ?? {};
								if (fields.domain)
									return onError(t("connectError_okta_domain_invalid"));
								if (fields.token)
									return onError(t("connectError_okta_token_format"));
								return fail(res);
							}
							setToken("");
							toast.success(t("oktaConnected"));
							router.refresh();
						});
					}}
				>
					<span className="font-medium">
						{connected ? t("oktaReconnectTitle") : t("oktaConnectTitle")}
					</span>
					<ol className="flex list-decimal flex-col gap-1 pl-5 text-footnote text-muted-foreground">
						<li>{t("oktaStep1")}</li>
						<li>{t("oktaStep2")}</li>
						<li>{t("oktaStep3")}</li>
					</ol>
					<Label htmlFor="identity-okta-domain">{t("oktaDomainField")}</Label>
					<Input
						id="identity-okta-domain"
						name="oktaDomain"
						value={domain}
						onChange={(e) => setDomain(e.target.value.trim())}
						placeholder={t("oktaDomainPlaceholder")}
						spellCheck={false}
						autoComplete="off"
						inputMode="url"
						disabled={pending}
						className="sm:max-w-96"
					/>
					<Label htmlFor="identity-okta-token">{t("oktaTokenField")}</Label>
					<Input
						id="identity-okta-token"
						name="oktaToken"
						type="password"
						value={token}
						onChange={(e) => setToken(e.target.value.trim())}
						placeholder={
							source?.tokenHint
								? t("oktaTokenKeep", { hint: source.tokenHint })
								: t("oktaTokenPlaceholder")
						}
						spellCheck={false}
						autoComplete="off"
						disabled={pending}
						className="sm:max-w-96"
					/>
					<PrivacyAck id="identity-okta-ack" checked={ack} onChange={setAck} />
					<div>
						<Button
							type="submit"
							disabled={
								pending || domain.length < 4 || token.length < 20 || !ack
							}
						>
							{pending ? t("googleChecking") : t("googleConnect")}
						</Button>
					</div>
				</form>
			)}
		</section>
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
