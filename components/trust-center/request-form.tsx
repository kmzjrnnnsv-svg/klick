"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Errors = Partial<Record<string, string>>;

// Anfrage nach vertraulichen Unterlagen → POST /api/vertrauen/anfrage.
// Zugestimmt wird genau der angezeigten NDA-Fassung (ndaVersion); Honeypot
// „website“ und der Render-Zeitpunkt gehen mit.
export function TrustRequestForm({
	slug,
	ndaText,
	ndaVersion,
	orgName,
}: {
	slug: string;
	ndaText: string;
	ndaVersion: string;
	orgName: string;
}) {
	const t = useTranslations("TrustCenter");
	const [renderedAt] = useState(() => Date.now());
	const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
	const [errors, setErrors] = useState<Errors>({});
	const [failure, setFailure] = useState<string | null>(null);

	if (state === "sent")
		return (
			<div className="rounded-xl bg-muted p-4" role="status">
				<p className="font-medium">{t("requestSentTitle")}</p>
				<p className="mt-1 text-muted-foreground text-subhead">
					{t("requestSentLead")}
				</p>
			</div>
		);

	const a11y = (name: string) =>
		errors[name]
			? { "aria-invalid": true, "aria-describedby": `tr-${name}-error` }
			: {};
	const error = (name: string) =>
		errors[name] ? (
			<p className="text-destructive text-subhead" id={`tr-${name}-error`}>
				{errors[name]}
			</p>
		) : null;

	return (
		<form
			noValidate
			className="grid grid-cols-1 gap-4 sm:grid-cols-2"
			onSubmit={async (e) => {
				e.preventDefault();
				const formEl = e.currentTarget;
				const fd = new FormData(formEl);
				const body = {
					slug,
					name: String(fd.get("name") ?? ""),
					email: String(fd.get("email") ?? ""),
					company: String(fd.get("company") ?? ""),
					reason: String(fd.get("reason") ?? ""),
					ndaVersion,
					ndaAccepted: fd.get("ndaAccepted") === "on",
					website: String(fd.get("website") ?? ""),
					renderedAt,
				};
				setState("sending");
				setFailure(null);
				setErrors({});
				try {
					const res = await fetch("/api/vertrauen/anfrage", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(body),
					});
					if (res.status === 204) {
						setState("sent");
						return;
					}
					setState("idle");
					if (res.status === 400) {
						const data = (await res.json().catch(() => null)) as {
							fieldErrors?: Record<string, string[]>;
						} | null;
						const next: Errors = {};
						for (const [k, v] of Object.entries(data?.fieldErrors ?? {}))
							next[k] = v[0];
						setErrors(next);
						const first = Object.keys(next)[0];
						if (first)
							(formEl.elements.namedItem(first) as HTMLElement | null)?.focus();
						return;
					}
					setFailure(
						res.status === 429
							? t("requestRateLimited")
							: res.status === 409
								? t("requestNdaChanged")
								: t("requestFailed"),
					);
				} catch {
					setState("idle");
					setFailure(t("requestFailed"));
				}
			}}
		>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="tr-name">{t("fieldName")}</Label>
				<Input
					id="tr-name"
					name="name"
					autoComplete="name"
					required
					{...a11y("name")}
				/>
				{error("name")}
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="tr-company">{t("fieldCompany")}</Label>
				<Input
					id="tr-company"
					name="company"
					autoComplete="organization"
					required
					{...a11y("company")}
				/>
				{error("company")}
			</div>
			<div className="flex flex-col gap-1.5 sm:col-span-2">
				<Label htmlFor="tr-email">{t("fieldEmail")}</Label>
				<Input
					id="tr-email"
					name="email"
					type="email"
					inputMode="email"
					autoComplete="email"
					spellCheck={false}
					required
					{...a11y("email")}
				/>
				{error("email")}
			</div>
			<div className="flex flex-col gap-1.5 sm:col-span-2">
				<Label htmlFor="tr-reason">{t("fieldReason")}</Label>
				<Textarea
					id="tr-reason"
					name="reason"
					rows={3}
					placeholder={t("fieldReasonPlaceholder")}
					{...a11y("reason")}
				/>
				{error("reason")}
			</div>
			<div className="hidden" aria-hidden="true">
				<label htmlFor="tr-website">Website</label>
				<input
					id="tr-website"
					name="website"
					tabIndex={-1}
					autoComplete="off"
				/>
			</div>
			<div className="flex flex-col gap-2 sm:col-span-2">
				<p className="font-medium text-subhead">{t("ndaTitle")}</p>
				<div className="max-h-48 overflow-y-auto whitespace-pre-line rounded-xl bg-muted p-3 text-subhead leading-relaxed">
					{ndaText}
				</div>
				<label className="flex items-start gap-2 text-subhead" htmlFor="tr-nda">
					<input
						id="tr-nda"
						name="ndaAccepted"
						type="checkbox"
						className="mt-0.5 size-4 accent-primary"
						required
						{...a11y("ndaAccepted")}
					/>
					<span>{t("ndaAccept")}</span>
				</label>
				{error("ndaAccepted")}
			</div>
			<div className="flex flex-wrap items-center gap-3 sm:col-span-2">
				<Button type="submit" disabled={state === "sending"}>
					{state === "sending" ? t("requestSending") : t("requestSubmit")}
				</Button>
				<p className="text-muted-foreground text-subhead" aria-live="polite">
					{failure ?? t("requestHint")}
				</p>
			</div>
			<p className="text-muted-foreground text-footnote sm:col-span-2">
				{t.rich("requestPrivacy", {
					org: orgName,
					link: (chunks) => (
						<a
							href="/datenschutz-erklaerung"
							className="underline underline-offset-4"
						>
							{chunks}
						</a>
					),
				})}
			</p>
		</form>
	);
}
