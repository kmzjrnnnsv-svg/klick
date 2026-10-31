"use client";

import { Download } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CopyValue } from "@/components/ui/copy-value";
import { FormAlert } from "@/components/ui/form-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { spMetadataXml } from "@/lib/auth/sso-saml-vendors";

// Einrichtungslink für die IT (AP10d): Werte zum Kopieren, Metadaten von
// Klick als Datei, Schritte beim Anbieter; die IT schickt Metadaten und
// Attributnamen zurück. Anlegen tut die Inhaberin in Klick.

type View = {
	orgName: string;
	vendorLabel: string;
	domain: string;
	providerId: string;
	status: string;
	expiresAt: string;
	submittedAt: string | null;
	steps: string[];
	entityId: string;
	acsUrl: string;
	metadata: "url" | "file" | "both";
	attributes: { email: string; name: string; groups: string | null };
};

type Phase =
	| { kind: "loading" }
	| { kind: "error"; error: string }
	| { kind: "ready"; view: View }
	| { kind: "sent"; view: View };

export function SsoSetupPortal() {
	const t = useTranslations("SsoSetupPortal");
	const format = useFormatter();
	const [phase, setPhase] = useState<Phase>({ kind: "loading" });
	const [contactName, setContactName] = useState("");
	const [metadataUrl, setMetadataUrl] = useState("");
	const [metadataXml, setMetadataXml] = useState("");
	const [attrs, setAttrs] = useState({ email: "", name: "", groups: "" });
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		const run = async () => {
			const raw = window.location.hash.slice(1);
			if (raw.startsWith("klk_sso_")) {
				window.history.replaceState(
					null,
					"",
					window.location.pathname + window.location.search,
				);
				const res = await fetch("/api/sso-einrichtung/sitzung", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ token: raw }),
				});
				if (!res.ok) {
					const b = (await res.json().catch(() => ({}))) as { error?: string };
					return setPhase({ kind: "error", error: b.error ?? "invalid" });
				}
			}
			const res = await fetch("/api/sso-einrichtung", { cache: "no-store" });
			const b = (await res.json().catch(() => ({}))) as View & {
				error?: string;
			};
			if (!res.ok)
				return setPhase({ kind: "error", error: b.error ?? "invalid" });
			setAttrs({
				email: b.attributes.email,
				name: b.attributes.name,
				groups: b.attributes.groups ?? "",
			});
			setPhase(
				b.status === "submitted"
					? { kind: "sent", view: b }
					: { kind: "ready", view: b },
			);
		};
		void run().catch(() => setPhase({ kind: "error", error: "network" }));
	}, []);

	if (phase.kind === "loading")
		return <p className="text-muted-foreground">{t("loading")}</p>;
	if (phase.kind === "error")
		return (
			<section className="flex flex-col gap-2 rounded-2xl bg-card p-4">
				<h1 className="font-bold text-title-2">{t("errorTitle")}</h1>
				<p className="text-muted-foreground">
					{t(
						(["expired", "revoked", "network_denied", "none"].includes(
							phase.error,
						)
							? `error_${phase.error}`
							: "error_invalid") as "error_invalid",
					)}
				</p>
			</section>
		);

	const v = phase.view;
	const download = () => {
		const url = URL.createObjectURL(
			new Blob([spMetadataXml({ entityId: v.entityId, acsUrl: v.acsUrl })], {
				type: "application/samlmetadata+xml",
			}),
		);
		const a = document.createElement("a");
		a.href = url;
		a.download = `klick-${v.providerId}-metadaten.xml`;
		a.click();
		URL.revokeObjectURL(url);
	};

	return (
		<div className="flex flex-col gap-6">
			<header className="flex flex-col gap-1">
				<h1 className="font-bold text-large-title">
					{t("title", { org: v.orgName })}
				</h1>
				<p className="text-muted-foreground">
					{t("lead", { vendor: v.vendorLabel, domain: v.domain })}
				</p>
				<p className="text-footnote text-muted-foreground">
					{t("validUntil", {
						date: format.dateTime(new Date(v.expiresAt), {
							dateStyle: "medium",
						}),
					})}
				</p>
			</header>

			<section className="flex flex-col gap-3 rounded-2xl bg-card p-4">
				<h2 className="font-semibold text-headline">{t("valuesTitle")}</h2>
				<CopyValue label={t("entityId")} value={v.entityId} />
				<CopyValue label={t("acs")} value={v.acsUrl} />
				<div>
					<Button
						type="button"
						variant="secondary"
						size="sm"
						onClick={download}
					>
						<Download aria-hidden="true" />
						{t("download")}
					</Button>
				</div>
			</section>

			<section className="flex flex-col gap-2 rounded-2xl bg-card p-4">
				<h2 className="font-semibold text-headline">
					{t("stepsTitle", { vendor: v.vendorLabel })}
				</h2>
				<ol className="flex list-decimal flex-col gap-1 pl-5">
					{v.steps.map((s) => (
						<li key={s}>{s}</li>
					))}
				</ol>
			</section>

			{phase.kind === "sent" ? (
				<section
					role="status"
					className="flex flex-col gap-1 rounded-2xl bg-card p-4"
				>
					<h2 className="font-semibold text-headline">{t("sentTitle")}</h2>
					<p className="text-muted-foreground">
						{t("sentLead", { org: v.orgName })}
					</p>
				</section>
			) : (
				<form
					className="flex flex-col gap-4 rounded-2xl bg-card p-4"
					onSubmit={async (e) => {
						e.preventDefault();
						setBusy(true);
						setError(null);
						try {
							const res = await fetch("/api/sso-einrichtung", {
								method: "POST",
								headers: { "content-type": "application/json" },
								body: JSON.stringify({
									contactName,
									metadataUrl: metadataUrl.trim() || undefined,
									metadataXml: metadataXml.trim() || undefined,
									attributes: attrs,
								}),
							});
							const b = (await res.json().catch(() => ({}))) as {
								error?: string;
							};
							if (!res.ok)
								return setError(
									b.error?.startsWith("sso_metadata")
										? t("errorMetadata")
										: t("errorSend"),
								);
							setPhase({ kind: "sent", view: v });
						} catch {
							setError(t("errorSend"));
						} finally {
							setBusy(false);
						}
					}}
				>
					<h2 className="font-semibold text-headline">{t("formTitle")}</h2>
					<div className="flex flex-col gap-1">
						<Label htmlFor="it-name">{t("contactName")}</Label>
						<Input
							id="it-name"
							value={contactName}
							onChange={(e) => setContactName(e.target.value)}
							autoComplete="name"
							placeholder="z. B. Alex Muster, IT"
							required
						/>
					</div>
					{v.metadata !== "file" && (
						<div className="flex flex-col gap-1">
							<Label htmlFor="it-url">{t("metadataUrl")}</Label>
							<Input
								id="it-url"
								type="url"
								value={metadataUrl}
								onChange={(e) => setMetadataUrl(e.target.value)}
								autoComplete="off"
								spellCheck={false}
								placeholder="z. B. https://…/metadata"
							/>
						</div>
					)}
					<div className="flex flex-col gap-2">
						<Label htmlFor="it-file">{t("metadataFile")}</Label>
						<input
							id="it-file"
							type="file"
							accept=".xml,application/xml,text/xml,application/samlmetadata+xml"
							className="text-subhead file:mr-3 file:min-h-(--control-h) file:rounded-full file:border-0 file:bg-muted file:px-4 file:text-subhead"
							onChange={async (e) => {
								const f = e.target.files?.[0];
								if (f && f.size <= 200_000) setMetadataXml(await f.text());
							}}
						/>
						<Label htmlFor="it-xml" className="sr-only">
							{t("metadataXml")}
						</Label>
						<Textarea
							id="it-xml"
							rows={4}
							value={metadataXml}
							onChange={(e) => setMetadataXml(e.target.value)}
							placeholder={t("metadataXmlPlaceholder")}
							className="font-mono"
							spellCheck={false}
						/>
					</div>
					<fieldset className="grid grid-cols-1 gap-4 border-0 p-0">
						<legend className="mb-2 font-medium text-subhead">
							{t("attributes")}
						</legend>
						{(["email", "name", "groups"] as const).map((k) => (
							<div key={k} className="flex flex-col gap-1">
								<Label htmlFor={`it-attr-${k}`}>{t(`attr_${k}`)}</Label>
								<Input
									id={`it-attr-${k}`}
									value={attrs[k]}
									onChange={(e) => setAttrs({ ...attrs, [k]: e.target.value })}
									autoComplete="off"
									spellCheck={false}
									className="font-mono"
								/>
							</div>
						))}
					</fieldset>
					<FormAlert message={error} />
					<div>
						<Button
							type="submit"
							disabled={
								busy || !contactName.trim() || (!metadataUrl && !metadataXml)
							}
						>
							{t("send")}
						</Button>
					</div>
				</form>
			)}
		</div>
	);
}
