"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	deleteSsoProvider,
	registerOidcPreset,
	registerSamlProvider,
	requestSsoDomainVerification,
	saveSsoPolicy,
	testSsoDiscovery,
	verifySsoDomain,
} from "@/app/actions/sso";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-alert";
import { errorText } from "@/components/ui/error-text";
import { FormAlert } from "@/components/ui/form-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListGroup, ListSection } from "@/components/ui/list";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
	providerPreset,
	SSO_ROLES,
	type SsoKind,
	type SsoPolicy,
	type SsoRole,
} from "@/lib/auth/sso-policy";

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
};

type Kind = SsoKind | "saml";
const KINDS: Kind[] = ["entra", "google", "okta", "oidc", "saml"];

const SSO_ERRORS = new Set([
	"sso_preset_invalid",
	"sso_saml_entity",
	"sso_enforce_unverified",
	"sso_discovery_failed",
]);

export function SsoPanel({
	providers,
	callbackBase,
	canEdit,
	policy,
}: {
	providers: SsoProviderRow[];
	callbackBase: string;
	canEdit: boolean;
	policy: SsoPolicy;
}) {
	const t = useTranslations("SsoSetup");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [tokens, setTokens] = useState<Record<string, string>>({});
	const message = (code: string) =>
		code === "step_up_required"
			? tc("errorStepUp")
			: SSO_ERRORS.has(code)
				? t(`err_${code}` as "err_sso_preset_invalid")
				: errorText(tc, code);
	const fail = (code: string) => void toast.error(message(code));
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
									<Badge variant={p.domainVerified ? "success" : "warning"}>
										{p.domainVerified ? t("verified") : t("unverified")}
									</Badge>
								</div>
								<p
									className="break-all text-muted-foreground text-footnote"
									translate="no"
								>
									{p.providerId} · {p.issuer}
								</p>
								<CallbackInfo
									base={callbackBase}
									providerId={p.providerId}
									protocol={p.protocol}
								/>
								{tokens[p.providerId] && (
									<div className="flex flex-col gap-1 rounded-xl bg-muted/50 p-3 text-footnote">
										<p>{t("dnsHint")}</p>
										<p className="break-all font-mono" translate="no">
											_klick-sso.{p.domain}
										</p>
										<p className="break-all font-mono" translate="no">
											{tokens[p.providerId]}
										</p>
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
		<div className="flex flex-col gap-0.5 text-footnote">
			<span className="text-muted-foreground">{t("samlAcs")}</span>
			<code className="break-all" translate="no">
				{base}/api/auth/sso/saml2/sp/acs/{id}
			</code>
			<span className="text-muted-foreground">{t("samlEntity")}</span>
			<code className="break-all" translate="no">
				{base}/api/auth/sso/saml2/sp/metadata?providerId={id}
			</code>
		</div>
	) : (
		<div className="flex flex-col gap-0.5 text-footnote">
			<span className="text-muted-foreground">{t("redirectUri")}</span>
			<code className="break-all" translate="no">
				{base}/api/auth/sso/callback/{id}
			</code>
		</div>
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
	metadataXml: "",
	entityId: "",
	ssoUrl: "",
	certificate: "",
	groupsAttribute: "",
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
	const steps = t.raw(`steps_${kind}`) as string[];

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
			<ol className="flex list-decimal flex-col gap-1 pl-5 text-subhead">
				{steps.map((s) => (
					<li key={s}>{s}</li>
				))}
			</ol>
			<CallbackInfo
				base={callbackBase}
				providerId={form.providerId}
				protocol={kind === "saml" ? "saml" : "oidc"}
			/>
			<form
				className="grid grid-cols-1 gap-4 sm:grid-cols-2"
				onSubmit={(e) => {
					e.preventDefault();
					start(async () => {
						const res = await withStepUp(() =>
							kind === "saml"
								? registerSamlProvider({
										providerId: form.providerId,
										domain: form.domain,
										metadataXml: form.metadataXml || undefined,
										entityId: form.entityId || undefined,
										ssoUrl: form.ssoUrl,
										certificate: form.certificate || undefined,
										groupsAttribute: form.groupsAttribute || undefined,
									})
								: registerOidcPreset({
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
				{kind !== "saml" && (
					<>
						{field("clientId", t("clientId"))}
						{field("clientSecret", t("clientSecret"), { type: "password" })}
					</>
				)}
				{kind === "saml" && (
					<>
						<div className="flex flex-col gap-1 sm:col-span-2">
							<Label htmlFor="sso-metadataXml">{t("metadataXml")}</Label>
							<Textarea
								id="sso-metadataXml"
								rows={4}
								value={form.metadataXml}
								onChange={(e) => set("metadataXml")(e.target.value)}
								placeholder={t("metadataPlaceholder")}
								className="font-mono"
								spellCheck={false}
							/>
							<p className="text-muted-foreground text-footnote">
								{t("metadataHint")}
							</p>
						</div>
						{field("entityId", t("entityId"))}
						{field("ssoUrl", t("ssoUrl"), { type: "url" })}
						<div className="flex flex-col gap-1 sm:col-span-2">
							<Label htmlFor="sso-certificate">{t("certificate")}</Label>
							<Textarea
								id="sso-certificate"
								rows={3}
								value={form.certificate}
								onChange={(e) => set("certificate")(e.target.value)}
								placeholder="-----BEGIN CERTIFICATE-----"
								className="font-mono"
								spellCheck={false}
							/>
						</div>
						{field("groupsAttribute", t("groupsAttribute"), {
							placeholder: t("groupsAttributePlaceholder"),
						})}
					</>
				)}
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
