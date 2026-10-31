"use client";

import { Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	previewSamlMetadata,
	registerSamlProvider,
	type SamlPreview,
} from "@/app/actions/sso";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { Button } from "@/components/ui/button";
import { CopyValue } from "@/components/ui/copy-value";
import { FormAlert } from "@/components/ui/form-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { samlAcsUrl, samlSpEntityId } from "@/lib/auth/sso-saml";
import {
	daysLeft,
	SAML_PRESETS,
	SAML_VENDORS,
	type SamlVendor,
	spMetadataXml,
	suggestProviderId,
} from "@/lib/auth/sso-saml-vendors";

// SAML in fünf Minuten (AP10): Anbieter wählen, Werte zum Kopieren bzw. als
// Datei, Metadaten als Adresse (Klick holt sie), Datei oder von Hand, Vorschau
// mit Zertifikat und Ablauf, Attribute vorbelegt. Anlegen mit Step-up.

type Source = "url" | "xml" | "manual";

const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/;
const ID_RE = /^[a-z0-9][a-z0-9-]{2,39}$/;

function defaultSource(v: SamlVendor): Source {
	return SAML_PRESETS[v].metadata === "file" ? "xml" : "url";
}

export function SamlForm({
	callbackBase,
	message,
}: {
	callbackBase: string;
	message: (code: string) => string;
}) {
	const t = useTranslations("SsoSetup");
	const format = useFormatter();
	const router = useRouter();
	const [vendor, setVendor] = useState<SamlVendor>("entra");
	const [source, setSource] = useState<Source>(defaultSource("entra"));
	const [domain, setDomain] = useState("");
	const [providerId, setProviderId] = useState("");
	const [idTouched, setIdTouched] = useState(false);
	const [metadataUrl, setMetadataUrl] = useState("");
	const [metadataXml, setMetadataXml] = useState("");
	const [entityId, setEntityId] = useState("");
	const [ssoUrl, setSsoUrl] = useState("");
	const [certificate, setCertificate] = useState("");
	const [attrs, setAttrs] = useState(SAML_PRESETS.entra.attributes);
	const [preview, setPreview] = useState<SamlPreview | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [pending, start] = useTransition();
	const preset = SAML_PRESETS[vendor];
	const domainOk = DOMAIN_RE.test(domain.trim().toLowerCase());
	const id = idTouched ? providerId : domainOk ? suggestProviderId(domain) : "";
	const idOk = ID_RE.test(id);
	const steps = t.raw(`samlSteps_${vendor}`) as string[];
	const sources: Source[] =
		preset.metadata === "file" ? ["xml", "manual"] : ["url", "xml", "manual"];

	const chooseVendor = (v: SamlVendor) => {
		setVendor(v);
		setSource(defaultSource(v));
		setAttrs(SAML_PRESETS[v].attributes);
		setPreview(null);
		setError(null);
	};

	const downloadSpMetadata = () => {
		const xml = spMetadataXml({
			entityId: samlSpEntityId(callbackBase, id),
			acsUrl: samlAcsUrl(callbackBase, id),
		});
		const url = URL.createObjectURL(
			new Blob([xml], { type: "application/samlmetadata+xml" }),
		);
		const a = document.createElement("a");
		a.href = url;
		a.download = `klick-${id}-metadaten.xml`;
		a.click();
		URL.revokeObjectURL(url);
	};

	const metadataInput = () =>
		source === "url"
			? { metadataUrl: metadataUrl.trim() }
			: source === "xml"
				? { metadataXml }
				: { certificate };

	const check = () =>
		start(async () => {
			const res = await previewSamlMetadata({
				vendor,
				domain: domain.trim().toLowerCase(),
				...metadataInput(),
			});
			if (!res.ok) {
				setPreview(null);
				return void setError(message(res.error));
			}
			setError(null);
			setPreview(res.data);
			if (res.data.entityId && source !== "manual") setEntityId("");
		});

	const submit = () =>
		start(async () => {
			const res = await withStepUp(() =>
				registerSamlProvider({
					vendor,
					providerId: id,
					domain: domain.trim().toLowerCase(),
					...metadataInput(),
					...(source === "manual" ? { entityId, ssoUrl } : {}),
					emailAttribute: attrs.email,
					nameAttribute: attrs.name,
					groupsAttribute: attrs.groups ?? undefined,
				}),
			);
			if (!res.ok) return void setError(message(res.error));
			setError(null);
			setPreview(null);
			setDomain("");
			setProviderId("");
			setIdTouched(false);
			setMetadataUrl("");
			setMetadataXml("");
			setCertificate("");
			toast.success(t("registered"));
			router.refresh();
		});

	const now = new Date();

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-1">
				<Label htmlFor="saml-vendor">{t("vendor")}</Label>
				<select
					id="saml-vendor"
					value={vendor}
					onChange={(e) => chooseVendor(e.target.value as SamlVendor)}
					className="min-h-(--control-h) rounded-[10px] bg-muted px-3 text-subhead pointer-coarse:text-body"
				>
					{SAML_VENDORS.map((v) => (
						<option key={v} value={v}>
							{t(`vendor_${v}`)}
						</option>
					))}
				</select>
			</div>

			<ol className="flex list-decimal flex-col gap-1 pl-5 text-subhead">
				{steps.map((s) => (
					<li key={s}>{s}</li>
				))}
			</ol>

			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div className="flex flex-col gap-1">
					<Label htmlFor="saml-domain">{t("domain")}</Label>
					<Input
						id="saml-domain"
						value={domain}
						onChange={(e) => setDomain(e.target.value)}
						placeholder="z. B. firma.de"
						autoComplete="off"
						spellCheck={false}
						inputMode="url"
					/>
				</div>
				<div className="flex flex-col gap-1">
					<Label htmlFor="saml-id">{t("providerId")}</Label>
					<Input
						id="saml-id"
						value={id}
						onChange={(e) => {
							setIdTouched(true);
							setProviderId(e.target.value.toLowerCase());
						}}
						placeholder="z. B. saml-firma-de"
						autoComplete="off"
						spellCheck={false}
						className="font-mono"
					/>
					<span className="text-footnote text-muted-foreground">
						{t("providerIdHint")}
					</span>
				</div>
			</div>

			<section
				aria-label={t("valuesTitle")}
				className="flex flex-col gap-3 rounded-xl bg-muted/40 p-3"
			>
				<h4 className="font-medium text-subhead">{t("valuesTitle")}</h4>
				{domainOk && idOk ? (
					<>
						<CopyValue
							label={t("valueEntityId")}
							value={samlSpEntityId(callbackBase, id)}
						/>
						<CopyValue
							label={t("valueAcs")}
							value={samlAcsUrl(callbackBase, id)}
						/>
						<div>
							<Button
								type="button"
								variant="secondary"
								size="sm"
								onClick={downloadSpMetadata}
							>
								<Download aria-hidden="true" />
								{t("downloadMetadata")}
							</Button>
						</div>
					</>
				) : (
					<p className="text-footnote text-muted-foreground">
						{t("needDomain")}
					</p>
				)}
			</section>

			<fieldset className="flex flex-col gap-3 border-0 p-0">
				<legend className="mb-1 font-medium text-subhead">{t("source")}</legend>
				<div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
					{sources.map((s) => (
						<button
							key={s}
							type="button"
							aria-pressed={source === s}
							onClick={() => {
								setSource(s);
								setPreview(null);
								setError(null);
							}}
							className={`min-h-(--control-h) rounded-lg px-2 text-subhead transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
								source === s
									? "bg-background font-medium shadow-sm"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							{t(`source_${s}`)}
						</button>
					))}
				</div>

				{source === "url" && (
					<div className="flex flex-col gap-1">
						<Label htmlFor="saml-metadata-url">{t("metadataUrl")}</Label>
						<Input
							id="saml-metadata-url"
							type="url"
							value={metadataUrl}
							onChange={(e) => setMetadataUrl(e.target.value)}
							placeholder={
								preset.metadataUrlExample
									? `z. B. ${preset.metadataUrlExample}`
									: "z. B. https://…/metadata"
							}
							autoComplete="off"
							spellCheck={false}
						/>
						<span className="text-footnote text-muted-foreground">
							{t("metadataUrlHint", {
								own: preset.ownDomain ? "true" : "false",
							})}
						</span>
					</div>
				)}

				{source === "xml" && (
					<div className="flex flex-col gap-2">
						<Label htmlFor="saml-metadata-file">{t("metadataFile")}</Label>
						<input
							id="saml-metadata-file"
							type="file"
							accept=".xml,application/xml,text/xml,application/samlmetadata+xml"
							className="text-subhead file:mr-3 file:min-h-(--control-h) file:rounded-full file:border-0 file:bg-muted file:px-4 file:text-subhead"
							onChange={async (e) => {
								const f = e.target.files?.[0];
								if (!f) return;
								if (f.size > 200_000)
									return void setError(message("sso_metadata_too_large"));
								setMetadataXml(await f.text());
								setPreview(null);
							}}
						/>
						<Label htmlFor="saml-metadata-xml" className="sr-only">
							{t("metadataXml")}
						</Label>
						<Textarea
							id="saml-metadata-xml"
							rows={4}
							value={metadataXml}
							onChange={(e) => setMetadataXml(e.target.value)}
							placeholder={t("metadataPlaceholder")}
							className="font-mono"
							spellCheck={false}
						/>
					</div>
				)}

				{source === "manual" && (
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-1">
							<Label htmlFor="saml-entity">{t("entityId")}</Label>
							<Input
								id="saml-entity"
								value={entityId}
								onChange={(e) => setEntityId(e.target.value)}
								autoComplete="off"
								spellCheck={false}
							/>
						</div>
						<div className="flex flex-col gap-1">
							<Label htmlFor="saml-sso-url">{t("ssoUrl")}</Label>
							<Input
								id="saml-sso-url"
								type="url"
								value={ssoUrl}
								onChange={(e) => setSsoUrl(e.target.value)}
								autoComplete="off"
								spellCheck={false}
							/>
						</div>
						<div className="flex flex-col gap-1 sm:col-span-2">
							<Label htmlFor="saml-cert">{t("certificate")}</Label>
							<Textarea
								id="saml-cert"
								rows={3}
								value={certificate}
								onChange={(e) => setCertificate(e.target.value)}
								placeholder="-----BEGIN CERTIFICATE-----"
								className="font-mono"
								spellCheck={false}
							/>
						</div>
					</div>
				)}
				<div>
					<Button
						type="button"
						variant="secondary"
						disabled={pending || !domainOk}
						onClick={check}
					>
						{t("check")}
					</Button>
				</div>
			</fieldset>

			{preview && (
				<section
					role="status"
					aria-label={t("previewTitle")}
					className="flex flex-col gap-2 rounded-xl bg-muted/40 p-3 text-subhead"
				>
					<h4 className="font-medium">{t("previewTitle")}</h4>
					{preview.entityId && (
						<p className="break-all">
							<span className="text-muted-foreground">
								{t("previewEntity")}:{" "}
							</span>
							<span translate="no">{preview.entityId}</span>
						</p>
					)}
					{preview.ssoUrl && (
						<p className="break-all">
							<span className="text-muted-foreground">{t("previewSso")}: </span>
							<span translate="no">{preview.ssoUrl}</span>
						</p>
					)}
					{preview.certificates.map((c) => {
						const expired = new Date(c.notAfter) <= now;
						const date = format.dateTime(new Date(c.notAfter), {
							dateStyle: "medium",
						});
						return (
							<div key={c.fingerprint} className="flex flex-col gap-0.5">
								<p>
									{expired
										? t("previewCertExpired", { date })
										: t("previewCert", {
												date,
												days: daysLeft(c.notAfter, now),
											})}
								</p>
								<p
									className="break-all font-mono text-footnote text-muted-foreground"
									translate="no"
								>
									{c.fingerprint.slice(0, 29)}…
								</p>
							</div>
						);
					})}
					{preview.warnings.map((w) => (
						<p key={w} className="font-medium text-warning">
							{t(`warn_${w}` as "warn_weak_key")}
						</p>
					))}
				</section>
			)}

			<details className="rounded-xl bg-muted/40 p-3">
				<summary className="min-h-(--control-h-sm) cursor-pointer font-medium text-subhead">
					{t("attributesTitle")}
				</summary>
				<p className="mt-2 text-footnote text-muted-foreground">
					{preset.groups ? t("attributesHint") : t("attributesHintNoGroups")}
				</p>
				<div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
					{(["email", "name", "groups"] as const).map((k) => (
						<div key={k} className="flex flex-col gap-1">
							<Label htmlFor={`saml-attr-${k}`}>{t(`attr_${k}`)}</Label>
							<Input
								id={`saml-attr-${k}`}
								value={attrs[k] ?? ""}
								onChange={(e) => setAttrs({ ...attrs, [k]: e.target.value })}
								autoComplete="off"
								spellCheck={false}
								className="font-mono"
							/>
						</div>
					))}
				</div>
			</details>

			<div className="flex flex-col gap-2">
				<FormAlert message={error} />
				<div>
					<Button
						type="button"
						disabled={pending || !domainOk || !idOk}
						onClick={submit}
					>
						{t("addSaml")}
					</Button>
				</div>
			</div>
		</div>
	);
}
