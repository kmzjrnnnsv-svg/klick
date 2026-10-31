"use client";

import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	adoptSamlCert,
	deleteSsoProvider,
	refreshSamlMetadata,
	registerOidcPreset,
	requestSsoDomainVerification,
	saveSsoPolicy,
	startSsoProbe,
	testSsoDiscovery,
	verifySsoDomain,
} from "@/app/actions/sso";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-alert";
import { CopyValue } from "@/components/ui/copy-value";
import { errorText, isFourEyesNotice } from "@/components/ui/error-text";
import { FormAlert } from "@/components/ui/form-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListGroup, ListSection } from "@/components/ui/list";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import {
	providerPreset,
	SSO_ROLES,
	type SsoKind,
	type SsoPolicy,
	type SsoRole,
} from "@/lib/auth/sso-policy";
import { samlAcsUrl, samlSpEntityId } from "@/lib/auth/sso-saml";
import { isSamlVendor } from "@/lib/auth/sso-saml-vendors";
import { type SetupRequestRow, SsoItLink } from "./sso-it-link";
import { ProviderStatus } from "./sso-provider-status";
import { SamlForm } from "./sso-saml-form";

// Einstellungen > SSO (S1–S3): Anbieter je Kunde mit geführter Einrichtung
// (Entra ID, Google Workspace, Okta, OIDC, SAML), Domain-Nachweis, Regeln
// (Gruppen → Rolle, Firmen-MFA, SSO erzwingen). Nur Inhaber:innen, Step-up.

export type SsoProviderRow = {
	id: string;
	providerId: string;
	issuer: string;
	domain: string;
	protocol: "oidc" | "saml";
	domainVerified: boolean;
	clientId: string | null;
	discoveryEndpoint: string | null;
	// Stand aus sso_provider_states (AP10)
	vendor: string | null;
	certNotAfter: string | null;
	metadataUrl: string | null;
	probeOkAt: string | null;
	nextCert: boolean;
	nextCertNotAfter: string | null;
	lastFetchError: string | null;
};

type Kind = SsoKind | "saml";
const KINDS: Kind[] = ["entra", "google", "okta", "oidc", "saml"];

const SSO_ERRORS = new Set([
	"sso_preset_invalid",
	"sso_saml_entity",
	"sso_enforce_unverified",
	"sso_discovery_failed",
	"sso_metadata_url",
	"sso_metadata_fetch",
	"sso_metadata_too_large",
	"sso_metadata_doctype",
	"sso_metadata_invalid",
	"sso_metadata_many_entities",
	"sso_metadata_no_idp",
	"sso_metadata_no_cert",
	"sso_metadata_cert_invalid",
	"sso_cert_invalid",
	"sso_probe_unverified",
	"sso_probe_failed",
	"sso_no_next_cert",
	"sso_cert_entity_changed",
]);

export function SsoPanel({
	providers,
	callbackBase,
	canEdit,
	policy,
	setupRequests = [],
}: {
	providers: SsoProviderRow[];
	callbackBase: string;
	canEdit: boolean;
	policy: SsoPolicy;
	setupRequests?: SetupRequestRow[];
}) {
	const t = useTranslations("SsoSetup");
	const tc = useTranslations("Common");
	const format = useFormatter();
	const router = useRouter();
	const [pending, start] = useTransition();
	const [tokens, setTokens] = useState<Record<string, string>>({});
	const message = (code: string) =>
		code === "step_up_required"
			? tc("errorStepUp")
			: SSO_ERRORS.has(code)
				? t(`err_${code}` as "err_sso_preset_invalid")
				: errorText(tc, code);
	const fail = (code: string) =>
		void (isFourEyesNotice(code)
			? toast.notice(message(code))
			: toast.error(message(code)));
	const del = useConfirm({
		title: t("deleteTitle"),
		description: t("deleteLead"),
		confirmLabel: t("delete"),
	});

	return (
		<div className="flex flex-col gap-6 text-subhead">
			<p className="text-muted-foreground">{t("lead")}</p>
			<ListGroup>
				<ListSection title={t("providers")}>
					{providers.length === 0 ? (
						<p className="p-4 text-muted-foreground">{t("none")}</p>
					) : (
						providers.map((p) => (
							<div key={p.id} className="flex flex-col gap-2 p-4">
								<div className="flex flex-wrap items-center gap-2">
									<span className="font-medium" translate="no">
										{p.domain}
									</span>
									<Badge variant="muted">
										{p.protocol === "saml" ? "SAML 2.0" : "OpenID Connect"}
									</Badge>
									{p.vendor && isSamlVendor(p.vendor) && (
										<Badge variant="muted">{t(`vendor_${p.vendor}`)}</Badge>
									)}
								</div>
								<p
									className="break-all text-muted-foreground text-footnote"
									translate="no"
								>
									{p.providerId} · {p.issuer}
								</p>
								<ProviderStatus
									protocol={p.protocol}
									domainVerified={p.domainVerified}
									probeOk={Boolean(p.probeOkAt)}
									enforced={policy.enforce && p.domainVerified}
									certNotAfter={p.certNotAfter}
									metadataUrl={p.metadataUrl}
								/>
								{p.nextCert && (
									<div className="flex flex-col gap-2 rounded-xl bg-muted/50 p-3">
										<p className="font-medium text-subhead">
											{t("nextCertTitle", {
												date: p.nextCertNotAfter
													? format.dateTime(new Date(p.nextCertNotAfter), {
															dateStyle: "medium",
														})
													: "–",
											})}
										</p>
										<p className="text-footnote text-muted-foreground">
											{t("nextCertLead")}
										</p>
										{canEdit && (
											<div>
												<Button
													size="sm"
													disabled={pending}
													onClick={() =>
														start(async () => {
															const res = await withStepUp(() =>
																adoptSamlCert(p.providerId),
															);
															if (!res.ok) return fail(res.error);
															toast.success(t("nextCertAdopted"));
															router.refresh();
														})
													}
												>
													{t("nextCertAdopt")}
												</Button>
											</div>
										)}
									</div>
								)}
								{p.lastFetchError && (
									<p className="text-footnote text-warning">
										{t("lastFetchFailed", {
											reason: message(p.lastFetchError),
										})}
									</p>
								)}
								{canEdit &&
									p.protocol === "saml" &&
									p.domainVerified &&
									!p.probeOkAt && (
										<p className="text-footnote text-muted-foreground">
											{t("probeHint")}
										</p>
									)}
								<CallbackInfo
									base={callbackBase}
									providerId={p.providerId}
									protocol={p.protocol}
								/>
								{tokens[p.providerId] && (
									<div className="flex flex-col gap-2 rounded-xl bg-muted/50 p-3">
										<p className="text-footnote">{t("dnsHint")}</p>
										<CopyValue
											label={t("dnsName")}
											value={`_klick-sso.${p.domain}`}
										/>
										<CopyValue
											label={t("dnsValue")}
											value={tokens[p.providerId] ?? ""}
										/>
									</div>
								)}
								{canEdit && (
									<div className="flex flex-wrap gap-2">
										{!p.domainVerified && (
											<>
												<Button
													size="sm"
													variant="secondary"
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
													{t("requestToken")}
												</Button>
												<Button
													size="sm"
													variant="secondary"
													disabled={pending}
													onClick={() =>
														start(async () => {
															const res = await withStepUp(() =>
																verifySsoDomain(p.providerId),
															);
															if (!res.ok) return fail(res.error);
															toast.success(t("verifiedToast"));
															router.refresh();
														})
													}
												>
													{t("verify")}
												</Button>
											</>
										)}
										{p.metadataUrl && (
											<Button
												size="sm"
												variant="secondary"
												disabled={pending}
												onClick={() =>
													start(async () => {
														const res = await refreshSamlMetadata(p.providerId);
														if (!res.ok) return fail(res.error);
														toast.success(
															res.data.result === "new_cert"
																? t("refreshNewCert")
																: t("refreshSame"),
														);
														router.refresh();
													})
												}
											>
												{t("refresh")}
											</Button>
										)}
										{p.protocol === "saml" && p.domainVerified && (
											<Button
												size="sm"
												variant={p.probeOkAt ? "secondary" : "default"}
												disabled={pending}
												onClick={() =>
													start(async () => {
														const res = await startSsoProbe(p.providerId);
														if (!res.ok) return fail(res.error);
														window.location.assign(res.data.url);
													})
												}
											>
												{t("probe")}
											</Button>
										)}
										<Button
											size="sm"
											variant="ghost"
											className="text-destructive hover:bg-destructive/10"
											disabled={pending}
											onClick={() =>
												del.ask(() =>
													start(async () => {
														const res = await withStepUp(() =>
															deleteSsoProvider(p.providerId),
														);
														if (!res.ok) return fail(res.error);
														toast.success(t("deleted"));
														router.refresh();
													}),
												)
											}
										>
											{t("delete")}
										</Button>
									</div>
								)}
							</div>
						))
					)}
				</ListSection>
			</ListGroup>
			{del.node}
			{canEdit && <AddProvider callbackBase={callbackBase} message={message} />}
			{canEdit && <SsoItLink requests={setupRequests} message={message} />}
			{canEdit && (
				<PolicyForm
					policy={policy}
					hasVerified={providers.some((p) => p.domainVerified)}
					message={message}
				/>
			)}
		</div>
	);
}

function CallbackInfo({
	base,
	providerId,
	protocol,
}: {
	base: string;
	providerId: string;
	protocol: "oidc" | "saml";
}) {
	const t = useTranslations("SsoSetup");
	const id = providerId || "<kennung>";
	return protocol === "saml" ? (
		<div className="flex flex-col gap-2">
			<CopyValue label={t("valueAcs")} value={samlAcsUrl(base, id)} />
			<CopyValue label={t("samlEntity")} value={samlSpEntityId(base, id)} />
		</div>
	) : (
		<CopyValue
			label={t("redirectUri")}
			value={`${base}/api/auth/sso/callback/${id}`}
		/>
	);
}

const EMPTY = {
	providerId: "",
	domain: "",
	tenant: "",
	oktaDomain: "",
	issuer: "",
	clientId: "",
	clientSecret: "",
};

function AddProvider({
	callbackBase,
	message,
}: {
	callbackBase: string;
	message: (code: string) => string;
}) {
	const t = useTranslations("SsoSetup");
	const router = useRouter();
	const [kind, setKind] = useState<Kind>("entra");
	const [form, setForm] = useState(EMPTY);
	const [error, setError] = useState<string | null>(null);
	const [tested, setTested] = useState<string | null>(null);
	const [pending, start] = useTransition();
	const set = (k: keyof typeof EMPTY) => (v: string) =>
		setForm((f) => ({ ...f, [k]: v }));
	const preset =
		kind === "saml"
			? null
			: providerPreset(kind, {
					tenant: form.tenant,
					oktaDomain: form.oktaDomain,
					issuer: form.issuer,
				});
	const steps = kind === "saml" ? [] : (t.raw(`steps_${kind}`) as string[]);

	const field = (
		k: keyof typeof EMPTY,
		label: string,
		props: React.ComponentProps<typeof Input> = {},
	) => (
		<div className="flex flex-col gap-1">
			<Label htmlFor={`sso-${k}`}>{label}</Label>
			<Input
				id={`sso-${k}`}
				value={form[k]}
				onChange={(e) => set(k)(e.target.value)}
				autoComplete="off"
				spellCheck={false}
				{...props}
			/>
		</div>
	);

	return (
		<section className="flex flex-col gap-4 rounded-2xl bg-card p-4">
			<div>
				<h3 className="font-medium text-headline">{t("addTitle")}</h3>
				<p className="text-muted-foreground">{t("addLead")}</p>
			</div>
			<fieldset
				aria-label={t("kind")}
				className="grid grid-cols-2 gap-1 rounded-xl border-0 bg-muted p-1 sm:grid-cols-5"
			>
				{KINDS.map((k) => (
					<button
						key={k}
						type="button"
						aria-pressed={kind === k}
						onClick={() => {
							setKind(k);
							setError(null);
							setTested(null);
						}}
						className={`min-h-(--control-h) rounded-lg px-2 text-subhead transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
							kind === k
								? "bg-background font-medium shadow-sm"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						{t(`kind_${k}`)}
					</button>
				))}
			</fieldset>
			{kind === "saml" ? (
				<SamlForm callbackBase={callbackBase} message={message} />
			) : (
				<>
					<ol className="flex list-decimal flex-col gap-1 pl-5 text-subhead">
						{steps.map((s) => (
							<li key={s}>{s}</li>
						))}
					</ol>
					<CallbackInfo
						base={callbackBase}
						providerId={form.providerId}
						protocol="oidc"
					/>
					<form
						className="grid grid-cols-1 gap-4 sm:grid-cols-2"
						onSubmit={(e) => {
							e.preventDefault();
							start(async () => {
								const res = await withStepUp(() =>
									registerOidcPreset({
										kind,
										providerId: form.providerId,
										domain: form.domain,
										tenant: form.tenant,
										oktaDomain: form.oktaDomain,
										issuer: form.issuer,
										clientId: form.clientId,
										clientSecret: form.clientSecret,
									}),
								);
								if (!res.ok) return void setError(message(res.error));
								setError(null);
								setForm(EMPTY);
								toast.success(t("registered"));
								router.refresh();
							});
						}}
					>
						{field("providerId", t("providerId"), {
							placeholder: t("providerIdPlaceholder"),
							className: "font-mono",
						})}
						{field("domain", t("domain"), { placeholder: "z. B. firma.de" })}
						{kind === "entra" &&
							field("tenant", t("tenant"), {
								placeholder: "z. B. 0b6f6a1e-…-944455556666",
								className: "font-mono",
							})}
						{kind === "okta" &&
							field("oktaDomain", t("oktaDomain"), {
								placeholder: "z. B. firma.okta.com",
							})}
						{kind === "oidc" &&
							field("issuer", t("issuer"), {
								placeholder: "z. B. https://login.firma.de",
								type: "url",
							})}
						{field("clientId", t("clientId"))}
						{field("clientSecret", t("clientSecret"), { type: "password" })}
						<div className="flex flex-col gap-2 sm:col-span-2">
							<FormAlert message={error} />
							{tested && (
								<p role="status" className="text-footnote text-success">
									{tested}
								</p>
							)}
							<div className="flex flex-wrap gap-2">
								<Button type="submit" disabled={pending}>
									{t("add")}
								</Button>
								{preset && (
									<Button
										type="button"
										variant="secondary"
										disabled={pending}
										onClick={() =>
											start(async () => {
												const res = await testSsoDiscovery({
													discoveryEndpoint: preset.discoveryEndpoint,
												});
												if (!res.ok) {
													setTested(null);
													return void setError(message(res.error));
												}
												setError(null);
												setTested(t("testOk", { issuer: res.data.issuer }));
											})
										}
									>
										{t("test")}
									</Button>
								)}
							</div>
						</div>
					</form>
				</>
			)}
		</section>
	);
}

function PolicyForm({
	policy,
	hasVerified,
	message,
}: {
	policy: SsoPolicy;
	hasVerified: boolean;
	message: (code: string) => string;
}) {
	const t = useTranslations("SsoSetup");
	const router = useRouter();
	const [p, setP] = useState(policy);
	const [error, setError] = useState<string | null>(null);
	const [pending, start] = useTransition();
	const enforceConfirm = useConfirm({
		title: t("enforceTitle"),
		description: t("enforceLead"),
		confirmLabel: t("enforceConfirm"),
		destructive: false,
	});
	const roleSelect = (
		id: string,
		value: SsoRole,
		onChange: (r: SsoRole) => void,
	) => (
		<select
			id={id}
			value={value}
			onChange={(e) => onChange(e.target.value as SsoRole)}
			className="min-h-(--control-h) rounded-[10px] bg-muted px-3 text-subhead pointer-coarse:text-body"
		>
			{SSO_ROLES.map((r) => (
				<option key={r} value={r}>
					{t(`role_${r}`)}
				</option>
			))}
		</select>
	);

	return (
		<section className="flex flex-col gap-4 rounded-2xl bg-card p-4">
			<div>
				<h3 className="font-medium text-headline">{t("rulesTitle")}</h3>
				<p className="text-muted-foreground">{t("rulesLead")}</p>
			</div>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div className="flex flex-col gap-1">
					<Label htmlFor="sso-default-role">{t("defaultRole")}</Label>
					{roleSelect("sso-default-role", p.defaultRole, (r) =>
						setP({ ...p, defaultRole: r }),
					)}
				</div>
				<div className="flex flex-col gap-1">
					<Label htmlFor="sso-group-claim">{t("groupClaim")}</Label>
					<Input
						id="sso-group-claim"
						value={p.groupClaim}
						onChange={(e) => setP({ ...p, groupClaim: e.target.value })}
						spellCheck={false}
						className="font-mono"
					/>
				</div>
			</div>
			<div className="flex flex-col gap-2">
				<span className="font-medium">{t("groupRoles")}</span>
				{p.groupRoles.map((g, i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: Zeilen ohne eigene ID
						key={i}
						className="flex flex-col gap-2 sm:flex-row sm:items-center"
					>
						<Input
							aria-label={t("group")}
							value={g.group}
							onChange={(e) =>
								setP({
									...p,
									groupRoles: p.groupRoles.map((x, j) =>
										j === i ? { ...x, group: e.target.value } : x,
									),
								})
							}
							placeholder={t("groupPlaceholder")}
							spellCheck={false}
							className="min-w-0 sm:flex-1"
						/>
						{roleSelect(`sso-group-role-${i}`, g.role, (r) =>
							setP({
								...p,
								groupRoles: p.groupRoles.map((x, j) =>
									j === i ? { ...x, role: r } : x,
								),
							}),
						)}
						<Button
							type="button"
							variant="ghost"
							className="text-destructive hover:bg-destructive/10"
							onClick={() =>
								setP({
									...p,
									groupRoles: p.groupRoles.filter((_, j) => j !== i),
								})
							}
						>
							{t("removeGroup")}
						</Button>
					</div>
				))}
				<div>
					<Button
						type="button"
						variant="secondary"
						size="sm"
						onClick={() =>
							setP({
								...p,
								groupRoles: [...p.groupRoles, { group: "", role: "viewer" }],
							})
						}
					>
						{t("addGroup")}
					</Button>
				</div>
				<p className="text-muted-foreground text-footnote">
					{t("groupRolesHint")}
				</p>
			</div>
			<div className="flex items-start gap-3">
				<Switch
					id="sso-trust-mfa"
					checked={p.trustIdpMfa}
					onCheckedChange={(v) => setP({ ...p, trustIdpMfa: v })}
				/>
				<div className="flex flex-col">
					<Label htmlFor="sso-trust-mfa">{t("trustMfa")}</Label>
					<span className="text-muted-foreground text-footnote">
						{t("trustMfaHint")}
					</span>
				</div>
			</div>
			<div className="flex items-start gap-3">
				<Switch
					id="sso-enforce"
					checked={p.enforce}
					disabled={!hasVerified && !p.enforce}
					onCheckedChange={(v) =>
						v
							? enforceConfirm.ask(() => setP({ ...p, enforce: true }))
							: setP({ ...p, enforce: false })
					}
				/>
				<div className="flex flex-col">
					<Label htmlFor="sso-enforce">{t("enforce")}</Label>
					<span className="text-muted-foreground text-footnote">
						{hasVerified ? t("enforceHint") : t("enforceNeedsDomain")}
					</span>
				</div>
			</div>
			{enforceConfirm.node}
			<FormAlert message={error} />
			<div>
				<Button
					disabled={pending}
					onClick={() =>
						start(async () => {
							const res = await withStepUp(() =>
								saveSsoPolicy({
									...p,
									groupRoles: p.groupRoles.filter((g) => g.group.trim()),
								}),
							);
							// Vier-Augen: Erzwingen, Firmen-MFA, Rollen beantragt
							if (!res.ok && isFourEyesNotice(res)) {
								setError(null);
								return void toast.notice(message(res.error));
							}
							if (!res.ok) return void setError(message(res.error));
							setError(null);
							toast.success(t("rulesSaved"));
							router.refresh();
						})
					}
				>
					{t("saveRules")}
				</Button>
			</div>
		</section>
	);
}
