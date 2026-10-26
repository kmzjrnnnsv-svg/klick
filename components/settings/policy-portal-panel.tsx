"use client";

import { ArrowUpRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	addPortalDomain,
	endPortalReaderAccess,
	removePortalDomain,
	savePolicyPortal,
	verifyPortalDomain,
} from "@/app/actions/policy-portal";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-alert";
import { errorText } from "@/components/ui/error-text";
import { FormAlert } from "@/components/ui/form-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListGroup, ListRow, ListSection } from "@/components/ui/list";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import type { PortalDomain } from "@/db/schema/policy-portal";

// Einstellungen > Richtlinien-Portal (M2): Adresse, Firmen-Domains,
// Sitzungsdauer, Leser:innen. Alles mit Step-up (Inhaber:innen).

export type PortalReaderView = {
	id: string;
	email: string;
	confirmedAt: string | null;
	lastSeenAt: string | null;
	acknowledgements: number;
	activeSessions: number;
};

const PORTAL_ERRORS = new Set([
	"portal_slug",
	"portal_slug_taken",
	"portal_no_domain",
	"portal_domain_invalid",
	"portal_domains_full",
	"portal_dns_missing",
	"portal_dns_mismatch",
	"portal_last_domain",
]);

export function PolicyPortalPanel({
	origin,
	portal,
	readers,
	ssoDomains,
}: {
	origin: string;
	portal: {
		enabled: boolean;
		slug: string;
		sessionDays: number;
		domains: PortalDomain[];
	} | null;
	readers: PortalReaderView[];
	ssoDomains: string[];
}) {
	const t = useTranslations("PolicyPortal");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [enabled, setEnabled] = useState(portal?.enabled ?? false);
	const [slug, setSlug] = useState(portal?.slug ?? "");
	const [days, setDays] = useState(String(portal?.sessionDays ?? 30));
	const [domain, setDomain] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [domainError, setDomainError] = useState<string | null>(null);
	const [ending, setEnding] = useState<PortalReaderView | null>(null);
	const fmt = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "medium",
		timeZone: "Europe/Berlin",
	});
	const message = (code: string) =>
		PORTAL_ERRORS.has(code)
			? t(`err_${code}` as "err_portal_slug")
			: errorText(tc, code);
	const domains = portal?.domains ?? [];
	const offered = ssoDomains.filter(
		(d) => !domains.some((x) => x.domain === d),
	);
	const endConfirm = useConfirm({
		title: t("endTitle", { email: ending?.email ?? "" }),
		description: t("endLead"),
		confirmLabel: t("end"),
	});

	const add = (value: string) =>
		start(async () => {
			const res = await withStepUp(() => addPortalDomain({ domain: value }));
			if (!res.ok) return void setDomainError(message(res.error));
			setDomainError(null);
			setDomain("");
			router.refresh();
		});

	return (
		<ListGroup>
			<ListSection title={t("sectionPortal")} footer={t("sectionPortalFooter")}>
				<div className="flex flex-col gap-4 p-4">
					<div className="flex items-center gap-3">
						<Switch
							id="portal-enabled"
							checked={enabled}
							onCheckedChange={setEnabled}
						/>
						<Label htmlFor="portal-enabled">{t("enabled")}</Label>
					</div>
					<div className="flex flex-col gap-1">
						<Label htmlFor="portal-slug">{t("address")}</Label>
						<div className="flex min-w-0 items-center gap-1">
							<span
								className="shrink-0 text-muted-foreground text-subhead"
								translate="no"
							>
								{origin}/portal/
							</span>
							<Input
								id="portal-slug"
								value={slug}
								onChange={(e) => setSlug(e.target.value)}
								autoComplete="off"
								spellCheck={false}
								className="min-w-0 font-mono"
							/>
						</div>
					</div>
					<div className="flex max-w-xs flex-col gap-1">
						<Label htmlFor="portal-days">{t("sessionDays")}</Label>
						<Input
							id="portal-days"
							type="number"
							inputMode="numeric"
							min={1}
							max={90}
							value={days}
							onChange={(e) => setDays(e.target.value)}
						/>
						<p className="text-muted-foreground text-footnote">
							{t("sessionDaysHint")}
						</p>
					</div>
					<FormAlert message={error} />
					<div className="flex flex-wrap items-center gap-3">
						<Button
							disabled={pending}
							onClick={() =>
								start(async () => {
									const res = await withStepUp(() =>
										savePolicyPortal({
											enabled,
											slug,
											sessionDays: Number(days),
										}),
									);
									if (!res.ok) return void setError(message(res.error));
									setError(null);
									toast.success(t("saved"));
									router.refresh();
								})
							}
						>
							{tc("save")}
						</Button>
						{portal?.enabled && (
							<a
								href={`/portal/${portal.slug}`}
								target="_blank"
								rel="noopener noreferrer"
								className="hit-area inline-flex items-center gap-1 text-primary text-subhead hover:underline"
							>
								{t("open")}
								<ArrowUpRight aria-hidden="true" className="size-4" />
							</a>
						)}
					</div>
				</div>
			</ListSection>

			<ListSection
				title={t("sectionDomains")}
				footer={t("sectionDomainsFooter")}
			>
				{domains.map((d) => (
					<div key={d.domain} className="flex flex-col gap-2 p-4">
						<div className="flex flex-wrap items-center gap-2">
							<span className="font-medium" translate="no">
								{d.domain}
							</span>
							<Badge variant={d.verifiedAt ? "success" : "warning"}>
								{d.verifiedAt
									? d.via === "sso"
										? t("verifiedSso")
										: t("verifiedDns")
									: t("unverified")}
							</Badge>
						</div>
						{!d.verifiedAt && (
							<div className="flex flex-col gap-1 rounded-xl bg-muted/50 p-3 text-footnote">
								<p>{t("dnsHint")}</p>
								<p className="break-all font-mono" translate="no">
									{`_klick-portal.${d.domain}`}
								</p>
								<p className="break-all font-mono" translate="no">
									{`klick-portal=${d.token}`}
								</p>
							</div>
						)}
						<div className="flex flex-wrap gap-2">
							{!d.verifiedAt && (
								<Button
									size="sm"
									variant="secondary"
									disabled={pending}
									onClick={() =>
										start(async () => {
											const res = await withStepUp(() =>
												verifyPortalDomain({ domain: d.domain }),
											);
											if (!res.ok) return void toast.error(message(res.error));
											toast.success(t("verifiedToast"));
											router.refresh();
										})
									}
								>
									{t("verify")}
								</Button>
							)}
							<Button
								size="sm"
								variant="ghost"
								className="text-destructive hover:bg-destructive/10"
								disabled={pending}
								onClick={() =>
									start(async () => {
										const res = await withStepUp(() =>
											removePortalDomain({ domain: d.domain }),
										);
										if (!res.ok) return void toast.error(message(res.error));
										router.refresh();
									})
								}
							>
								{t("removeDomain")}
							</Button>
						</div>
					</div>
				))}
				{offered.length > 0 && (
					<div className="flex flex-wrap items-center gap-2 p-4">
						<span className="text-muted-foreground text-subhead">
							{t("ssoOffer")}
						</span>
						{offered.map((d) => (
							<Button
								key={d}
								size="sm"
								variant="secondary"
								disabled={pending}
								onClick={() => add(d)}
							>
								{t("addSso", { domain: d })}
							</Button>
						))}
					</div>
				)}
				<form
					className="flex flex-col gap-2 p-4"
					onSubmit={(e) => {
						e.preventDefault();
						add(domain);
					}}
				>
					<Label htmlFor="portal-domain">{t("addDomain")}</Label>
					<div className="flex flex-col gap-2 sm:flex-row">
						<Input
							id="portal-domain"
							value={domain}
							onChange={(e) => setDomain(e.target.value)}
							placeholder={t("domainPlaceholder")}
							autoComplete="off"
							spellCheck={false}
							className="min-w-0"
						/>
						<Button
							type="submit"
							variant="secondary"
							disabled={pending || !domain}
						>
							{t("add")}
						</Button>
					</div>
					<FormAlert message={domainError} />
				</form>
			</ListSection>

			<ListSection
				title={t("sectionReaders")}
				footer={t("sectionReadersFooter")}
			>
				{readers.length === 0 ? (
					<p className="p-4 text-muted-foreground text-subhead">
						{t("noReaders")}
					</p>
				) : (
					readers.map((r) => (
						<ListRow
							key={r.id}
							title={<span translate="no">{r.email}</span>}
							subtitle={t("readerMeta", {
								since: r.confirmedAt
									? fmt.format(new Date(r.confirmedAt))
									: "–",
								last: r.lastSeenAt ? fmt.format(new Date(r.lastSeenAt)) : "–",
								acks: r.acknowledgements,
							})}
							accessory={
								r.activeSessions > 0 ? (
									<Button
										size="sm"
										variant="ghost"
										className="text-destructive hover:bg-destructive/10"
										disabled={pending}
										onClick={() => {
											setEnding(r);
											endConfirm.ask(() =>
												start(async () => {
													const res = await withStepUp(() =>
														endPortalReaderAccess({ readerId: r.id }),
													);
													if (!res.ok)
														return void toast.error(message(res.error));
													toast.success(t("ended"));
													router.refresh();
												}),
											);
										}}
									>
										{t("end")}
									</Button>
								) : undefined
							}
						/>
					))
				)}
			</ListSection>
			{endConfirm.node}
		</ListGroup>
	);
}
