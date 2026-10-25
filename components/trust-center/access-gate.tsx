"use client";

import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { trustDocumentHref } from "@/lib/trust/labels";

const TOKEN_RE = /^klk_trust_[A-Za-z0-9_-]{20,}$/;

type Doc = {
	versionId: string;
	docNumber: string;
	title: string;
	version: string;
};

type State =
	| { phase: "loading" }
	| { phase: "active"; name: string; company: string; expiresAt: string }
	| { phase: "none"; reason: string };

const fmt = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "long",
	timeZone: "Europe/Berlin",
});

// Tauscht den Token aus dem Fragment (#klk_trust_…) gegen das Cookie des
// Trust Centers, entfernt ihn sofort aus Adresse und Verlauf und fragt dann
// den Stand ab. Die Download-Links gehen nur mit gültigem Cookie.
export function TrustAccessGate({ slug, docs }: { slug: string; docs: Doc[] }) {
	const t = useTranslations("TrustCenter");
	const [state, setState] = useState<State>({ phase: "loading" });

	const check = useCallback(async () => {
		const res = await fetch(
			`/api/vertrauen/sitzung?slug=${encodeURIComponent(slug)}`,
			{ credentials: "same-origin", cache: "no-store" },
		).catch(() => null);
		const body = (await res?.json().catch(() => null)) as {
			active?: boolean;
			reason?: string;
			name?: string;
			company?: string;
			expiresAt?: string;
		} | null;
		if (body?.active)
			setState({
				phase: "active",
				name: body.name ?? "",
				company: body.company ?? "",
				expiresAt: body.expiresAt ?? "",
			});
		else setState({ phase: "none", reason: body?.reason ?? "none" });
	}, [slug]);

	const exchange = useCallback(async () => {
		const raw = window.location.hash.slice(1);
		if (!TOKEN_RE.test(raw)) return check();
		window.history.replaceState(
			null,
			"",
			`${window.location.pathname}${window.location.search}`,
		);
		setState({ phase: "loading" });
		const res = await fetch("/api/vertrauen/sitzung", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ slug, token: raw }),
			credentials: "same-origin",
		}).catch(() => null);
		if (res?.status === 204) return check();
		const body = (await res?.json().catch(() => null)) as {
			error?: string;
		} | null;
		setState({ phase: "none", reason: body?.error ?? "invalid" });
	}, [slug, check]);

	useEffect(() => {
		void exchange();
		const onHash = () => void exchange();
		window.addEventListener("hashchange", onHash);
		return () => window.removeEventListener("hashchange", onHash);
	}, [exchange]);

	if (state.phase === "loading")
		return (
			<p aria-live="polite" className="text-muted-foreground text-subhead">
				{t("gateLoading")}
			</p>
		);
	if (state.phase === "none") {
		const reason = ["expired", "revoked", "rate_limited", "none"].includes(
			state.reason,
		)
			? (state.reason as "expired" | "revoked" | "rate_limited" | "none")
			: "invalid";
		return (
			<div role="alert" className="flex flex-col gap-2 rounded-2xl bg-card p-4">
				<h2 className="font-medium">{t(`gate_${reason}`)}</h2>
				<p className="text-muted-foreground text-subhead">{t("gateLead")}</p>
				<p>
					<a
						className="text-subhead underline underline-offset-4"
						href={`/vertrauen/${slug}#zugang`}
					>
						{t("gateBack")}
					</a>
				</p>
			</div>
		);
	}
	return (
		<div className="flex flex-col gap-4">
			<p className="text-muted-foreground text-subhead">
				{t("gateActive", {
					name: state.name,
					company: state.company,
					date: state.expiresAt ? fmt.format(new Date(state.expiresAt)) : "—",
				})}
			</p>
			{docs.length === 0 ? (
				<p className="text-muted-foreground text-subhead">{t("gateNoDocs")}</p>
			) : (
				<ul className="flex flex-col list-inset overflow-hidden rounded-2xl bg-card">
					{docs.map((d) => (
						<li
							key={d.versionId}
							className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
						>
							<div className="min-w-0">
								<p className="font-medium">{d.title}</p>
								<p className="text-muted-foreground text-footnote">
									<span className="whitespace-nowrap font-mono" translate="no">
										{d.docNumber}
									</span>{" "}
									· {t("version", { version: d.version })}
								</p>
							</div>
							<a
								href={trustDocumentHref(slug, d.versionId)}
								className="inline-flex items-center gap-1.5 text-subhead underline underline-offset-4"
							>
								<Download className="size-4" aria-hidden="true" />
								{t("download")}
							</a>
						</li>
					))}
				</ul>
			)}
			<div>
				<Button
					variant="outline"
					size="sm"
					onClick={async () => {
						await fetch(
							`/api/vertrauen/sitzung?slug=${encodeURIComponent(slug)}`,
							{ method: "DELETE", credentials: "same-origin" },
						).catch(() => null);
						setState({ phase: "none", reason: "none" });
					}}
				>
					{t("gateLogout")}
				</Button>
			</div>
		</div>
	);
}
