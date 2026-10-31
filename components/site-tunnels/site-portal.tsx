"use client";

import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CopyValue } from "@/components/ui/copy-value";
import { FormAlert } from "@/components/ui/form-alert";
import type { TunnelValues } from "@/lib/site-tunnels/config";
import { valueRows } from "@/lib/site-tunnels/config";

// Link für die IT (Standort-Tunnel, ADR-033): Werte zum Kopieren, Schritte
// für die Firewall, Stand des Tunnels. Den Schlüssel zeigt die Seite erst
// auf Knopfdruck; WireGuard als Datei zum Herunterladen.

type View = {
	orgName: string;
	expiresAt: string;
	tunnel: {
		name: string;
		tech: "ipsec" | "wireguard";
		state: "pending" | "connected" | "down" | "error" | "unknown";
		lastHandshakeAt: string | null;
	};
	vendorLabel: string;
	note: string | null;
	values: TunnelValues;
	steps: string[];
};

type Secret =
	| { tech: "ipsec"; psk: string }
	| { tech: "wireguard"; config: string; publicKey: string };

type Phase =
	| { kind: "loading" }
	| { kind: "error"; error: string }
	| { kind: "ready"; view: View };

const KNOWN_ERRORS = ["expired", "revoked", "network_denied", "none"];

export function SitePortal() {
	const t = useTranslations("SitePortal");
	const [phase, setPhase] = useState<Phase>({ kind: "loading" });
	const [secret, setSecret] = useState<Secret | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		const run = async () => {
			const raw = window.location.hash.slice(1);
			if (raw.startsWith("klk_site_")) {
				window.history.replaceState(
					null,
					"",
					window.location.pathname + window.location.search,
				);
				const res = await fetch("/api/standort/sitzung", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ token: raw }),
				});
				if (!res.ok) {
					const b = (await res.json().catch(() => ({}))) as { error?: string };
					return setPhase({ kind: "error", error: b.error ?? "invalid" });
				}
			}
			const res = await fetch("/api/standort", { cache: "no-store" });
			const b = (await res.json().catch(() => ({}))) as View & {
				error?: string;
			};
			if (!res.ok)
				return setPhase({ kind: "error", error: b.error ?? "invalid" });
			setPhase({ kind: "ready", view: b });
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
						(KNOWN_ERRORS.includes(phase.error)
							? `error_${phase.error}`
							: "error_invalid") as "error_invalid",
					)}
				</p>
			</section>
		);

	const v = phase.view;
	const reveal = async () => {
		setBusy(true);
		setError(null);
		try {
			const res = await fetch("/api/standort/geheimnis", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{}",
			});
			const b = (await res.json().catch(() => ({}))) as Secret & {
				error?: string;
			};
			if (!res.ok) return setError(t("secretFailed"));
			setSecret(b);
		} catch {
			setError(t("secretFailed"));
		} finally {
			setBusy(false);
		}
	};
	const download = (config: string) => {
		const url = URL.createObjectURL(new Blob([config], { type: "text/plain" }));
		const a = document.createElement("a");
		a.href = url;
		a.download = "klick-standort.conf";
		a.click();
		URL.revokeObjectURL(url);
	};

	return (
		<div className="flex flex-col gap-6">
			<header className="flex flex-col gap-1">
				<h1 className="font-bold text-large-title">
					{t("title", { name: v.tunnel.name })}
				</h1>
				<p className="text-muted-foreground">
					{t("lead", {
						org: v.orgName,
						vendor: v.vendorLabel,
						tech: t(`tech_${v.tunnel.tech}`),
					})}
				</p>
				<p role="status" className="font-medium">
					{t(`state_${v.tunnel.state}`)}
				</p>
			</header>

			<section className="flex flex-col gap-3 rounded-2xl bg-card p-4">
				<h2 className="font-semibold text-title-3">{t("valuesTitle")}</h2>
				{valueRows(v.values).map((r) => (
					<CopyValue key={r.label} label={r.label} value={r.value} />
				))}
			</section>

			<section className="flex flex-col gap-3 rounded-2xl bg-card p-4">
				<h2 className="font-semibold text-title-3">{t("secretTitle")}</h2>
				<p className="text-subhead text-muted-foreground">
					{t(`secretLead_${v.tunnel.tech}`)}
				</p>
				{!secret ? (
					<div>
						<Button type="button" disabled={busy} onClick={reveal}>
							{busy ? t("secretLoading") : t(`secretShow_${v.tunnel.tech}`)}
						</Button>
					</div>
				) : secret.tech === "ipsec" ? (
					<CopyValue label={t("psk")} value={secret.psk} />
				) : (
					<div className="flex flex-col gap-3">
						<div>
							<Button type="button" onClick={() => download(secret.config)}>
								<Download aria-hidden="true" />
								{t("downloadConfig")}
							</Button>
						</div>
						<CopyValue label={t("ownPublicKey")} value={secret.publicKey} />
					</div>
				)}
				<FormAlert message={error} />
			</section>

			<section className="flex flex-col gap-3 rounded-2xl bg-card p-4">
				<h2 className="font-semibold text-title-3">
					{t("stepsTitle", { vendor: v.vendorLabel })}
				</h2>
				{v.note && (
					<p className="text-subhead text-muted-foreground">{v.note}</p>
				)}
				<ol className="flex list-decimal flex-col gap-2 pl-5">
					{v.steps.map((s) => (
						<li key={s}>{s}</li>
					))}
				</ol>
			</section>

			<p className="text-footnote text-muted-foreground">
				{t("validUntil", {
					date: new Intl.DateTimeFormat("de-DE", {
						dateStyle: "medium",
						timeZone: "Europe/Berlin",
					}).format(new Date(v.expiresAt)),
				})}
			</p>
		</div>
	);
}
