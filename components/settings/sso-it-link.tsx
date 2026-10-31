"use client";

import { Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	applySsoSetupRequest,
	createSsoSetupLink,
	withdrawSsoSetupRequest,
} from "@/app/actions/sso";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { ExportLink } from "@/components/entity/export-link";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { CopyValue } from "@/components/ui/copy-value";
import { FormAlert } from "@/components/ui/form-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import {
	SAML_VENDORS,
	type SamlVendor,
	suggestProviderId,
} from "@/lib/auth/sso-saml-vendors";

// Die IT einbinden (AP10d): Blatt als PDF und Einrichtungslink (7 Tage) für
// eine IT-Person ohne Klick-Konto; ihr Vorschlag erscheint hier und wird mit
// Step-up angelegt.

export type SetupRequestRow = {
	id: string;
	vendor: string;
	domain: string;
	status: string;
	contactName: string | null;
	submittedAt: string | null;
	expiresAt: string;
};

const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/;

export function SsoItLink({
	requests,
	message,
}: {
	requests: SetupRequestRow[];
	message: (code: string) => string;
}) {
	const t = useTranslations("SsoSetup");
	const format = useFormatter();
	const router = useRouter();
	const [vendor, setVendor] = useState<SamlVendor>("entra");
	const [domain, setDomain] = useState("");
	const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(
		null,
	);
	const [error, setError] = useState<string | null>(null);
	const [pending, start] = useTransition();
	const d = domain.trim().toLowerCase();
	const domainOk = DOMAIN_RE.test(d);
	const date = (s: string) =>
		format.dateTime(new Date(s), { dateStyle: "medium" });

	return (
		<section className="flex flex-col gap-4 rounded-2xl bg-card p-4">
			<div>
				<h3 className="font-medium text-headline">{t("itTitle")}</h3>
				<p className="text-muted-foreground">{t("itLead")}</p>
			</div>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div className="flex flex-col gap-1">
					<Label htmlFor="it-vendor">{t("vendor")}</Label>
					<select
						id="it-vendor"
						value={vendor}
						onChange={(e) => setVendor(e.target.value as SamlVendor)}
						className="min-h-(--control-h) rounded-[10px] bg-muted px-3 text-subhead pointer-coarse:text-body"
					>
						{SAML_VENDORS.map((v) => (
							<option key={v} value={v}>
								{t(`vendor_${v}`)}
							</option>
						))}
					</select>
				</div>
				<div className="flex flex-col gap-1">
					<Label htmlFor="it-domain">{t("domain")}</Label>
					<Input
						id="it-domain"
						value={domain}
						onChange={(e) => setDomain(e.target.value)}
						placeholder="z. B. firma.de"
						autoComplete="off"
						spellCheck={false}
						inputMode="url"
					/>
				</div>
			</div>
			<div className="flex flex-wrap gap-2">
				<Button
					type="button"
					disabled={pending || !domainOk}
					onClick={() =>
						start(async () => {
							const res = await withStepUp(() =>
								createSsoSetupLink({ vendor, domain: d }),
							);
							if (!res.ok) return void setError(message(res.error));
							setError(null);
							setLink(res.data);
							router.refresh();
						})
					}
				>
					{t("itCreate")}
				</Button>
				{domainOk && (
					<ExportLink
						href={`/api/export/sso-blatt.pdf?anbieter=${vendor}&domain=${encodeURIComponent(d)}&kennung=${suggestProviderId(d)}`}
						className={buttonVariants({ variant: "secondary" })}
					>
						<Download aria-hidden="true" className="size-4" />
						{t("itSheet")}
					</ExportLink>
				)}
			</div>
			<FormAlert message={error} />
			{link && (
				<div
					role="status"
					className="flex flex-col gap-2 rounded-xl bg-muted/50 p-3"
				>
					<CopyValue label={t("itLink")} value={link.url} />
					<p className="text-footnote text-muted-foreground">
						{t("itLinkHint", { date: date(link.expiresAt) })}
					</p>
				</div>
			)}
			{requests.length > 0 && (
				<ul className="flex flex-col divide-y divide-border/70 rounded-xl bg-muted/40">
					{requests.map((r) => (
						<li key={r.id} className="flex flex-col gap-2 p-3">
							<div className="flex flex-wrap items-center gap-2">
								<span className="font-medium" translate="no">
									{r.domain}
								</span>
								<Badge variant="muted">
									{t(`vendor_${r.vendor}` as "vendor_other")}
								</Badge>
								<Badge variant={r.status === "submitted" ? "success" : "muted"}>
									{r.status === "submitted"
										? t("itSubmitted", {
												name: r.contactName ?? "",
												date: r.submittedAt ? date(r.submittedAt) : "",
											})
										: t("itWaiting", { date: date(r.expiresAt) })}
								</Badge>
							</div>
							<div className="flex flex-wrap gap-2">
								{r.status === "submitted" && (
									<Button
										size="sm"
										disabled={pending}
										onClick={() =>
											start(async () => {
												const res = await withStepUp(() =>
													applySsoSetupRequest(r.id),
												);
												if (!res.ok)
													return void toast.error(message(res.error));
												toast.success(t("itApplied"));
												router.refresh();
											})
										}
									>
										{t("itApply")}
									</Button>
								)}
								<Button
									size="sm"
									variant="ghost"
									disabled={pending}
									onClick={() =>
										start(async () => {
											const res = await withdrawSsoSetupRequest(r.id);
											if (!res.ok) return void toast.error(message(res.error));
											router.refresh();
										})
									}
								>
									{t("itWithdraw")}
								</Button>
							</div>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
