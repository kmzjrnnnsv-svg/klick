"use client";

import { Check, Circle } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { certReminder, daysLeft } from "@/lib/auth/sso-saml-vendors";

// Stand einer SSO-Verbindung (AP10): eingerichtet · Domain bestätigt · Probe
// (nur SAML) · erzwungen, dazu Zertifikat und Ablauf. Jeder Schritt mit Text,
// nie nur Farbe.

export function ProviderStatus({
	protocol,
	domainVerified,
	probeOk,
	enforced,
	certNotAfter,
	metadataUrl,
}: {
	protocol: "saml" | "oidc";
	domainVerified: boolean;
	probeOk: boolean;
	enforced: boolean;
	certNotAfter: string | null;
	metadataUrl: string | null;
}) {
	const t = useTranslations("SsoSetup");
	const format = useFormatter();
	const now = new Date();
	const steps: { key: string; done: boolean; optional?: boolean }[] = [
		{ key: "setup", done: true },
		{ key: "domain", done: domainVerified },
		...(protocol === "saml" ? [{ key: "probe", done: probeOk }] : []),
		{ key: "enforce", done: enforced, optional: true },
	];
	const reminder = certReminder(certNotAfter, now);
	return (
		<div className="flex flex-col gap-2">
			<ol
				aria-label={t("statusLabel")}
				className="flex flex-wrap gap-x-4 gap-y-1 text-footnote"
			>
				{steps.map((s) => (
					<li key={s.key} className="flex items-center gap-1.5">
						{s.done ? (
							<Check className="size-3.5 text-success" aria-hidden="true" />
						) : (
							<Circle
								className="size-3.5 text-muted-foreground"
								aria-hidden="true"
							/>
						)}
						<span>{t(`step_${s.key}` as "step_setup")}</span>
						<span className="text-muted-foreground">
							(
							{s.done
								? t("stepDone")
								: s.optional
									? t("stepOptional")
									: t("stepOpen")}
							)
						</span>
					</li>
				))}
			</ol>
			{certNotAfter && (
				<p
					className={`text-footnote ${reminder ? "font-medium text-warning" : "text-muted-foreground"}`}
				>
					{reminder === "expired"
						? t("certExpired")
						: reminder
							? t("certSoon", { days: daysLeft(certNotAfter, now) })
							: t("certValid", {
									date: format.dateTime(new Date(certNotAfter), {
										dateStyle: "medium",
									}),
								})}
					{metadataUrl && (
						<span className="font-normal text-muted-foreground">
							{" "}
							· {t("metadataWatched")}
						</span>
					)}
				</p>
			)}
		</div>
	);
}
