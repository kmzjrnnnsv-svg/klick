"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { INQUIRY_SERVICES } from "@/lib/inquiries/rules";
import { cn } from "@/lib/utils";
import st from "./inquiry-form.module.css";

type Errors = Partial<Record<string, string>>;

// Öffentliche Anfrage (/leistungen#anfrage) → POST /api/anfrage. Honeypot
// „website“ und der Zeitpunkt des Renderns gehen mit; der Server verwirft
// Bots still.
export function InquiryForm({
	defaultService = "general",
	buttonClassName,
}: {
	defaultService?: string;
	buttonClassName?: string;
}) {
	const t = useTranslations("Services");
	const [renderedAt] = useState(() => Date.now());
	const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
	const [errors, setErrors] = useState<Errors>({});
	const [failure, setFailure] = useState<string | null>(null);
	const [sentTo, setSentTo] = useState("");
	const service = INQUIRY_SERVICES.some((s) => s.key === defaultService)
		? defaultService
		: "general";

	if (state === "sent")
		return (
			<div className={st.done} role="status">
				<p className={st.doneTitle}>{t("formSentTitle")}</p>
				<p>{t("formSentLead", { email: sentTo })}</p>
			</div>
		);

	const field = (
		name: string,
		label: string,
		input: React.ReactNode,
		full = false,
	) => (
		<div className={cn(st.field, full && st.full)}>
			<label className={st.label} htmlFor={`inq-${name}`}>
				{label}
			</label>
			{input}
			{errors[name] && (
				<p className={st.error} id={`inq-${name}-error`}>
					{errors[name]}
				</p>
			)}
		</div>
	);
	const a11y = (name: string) =>
		errors[name]
			? { "aria-invalid": true, "aria-describedby": `inq-${name}-error` }
			: {};

	return (
		<form
			className={st.form}
			noValidate
			onSubmit={async (e) => {
				e.preventDefault();
				// nach dem await ist e.currentTarget schon null
				const formEl = e.currentTarget;
				const fd = new FormData(formEl);
				const body = {
					service: String(fd.get("service") ?? "general"),
					name: String(fd.get("name") ?? ""),
					company: String(fd.get("company") ?? ""),
					email: String(fd.get("email") ?? ""),
					message: String(fd.get("message") ?? ""),
					business: fd.get("business") === "on",
					website: String(fd.get("website") ?? ""),
					renderedAt,
				};
				setState("sending");
				setFailure(null);
				setErrors({});
				try {
					const res = await fetch("/api/anfrage", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(body),
					});
					if (res.status === 204) {
						setSentTo(body.email.trim());
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
						res.status === 429 ? t("formRateLimited") : t("formFailed"),
					);
				} catch {
					setState("idle");
					setFailure(t("formFailed"));
				}
			}}
		>
			{field(
				"name",
				t("formName"),
				<input
					id="inq-name"
					name="name"
					className={st.control}
					autoComplete="name"
					required
					{...a11y("name")}
				/>,
			)}
			{field(
				"company",
				t("formCompany"),
				<input
					id="inq-company"
					name="company"
					className={st.control}
					autoComplete="organization"
					{...a11y("company")}
				/>,
			)}
			{field(
				"email",
				t("formEmail"),
				<input
					id="inq-email"
					name="email"
					type="email"
					inputMode="email"
					className={st.control}
					autoComplete="email"
					spellCheck={false}
					required
					{...a11y("email")}
				/>,
			)}
			{field(
				"service",
				t("formService"),
				<div className={st.select}>
					<select
						id="inq-service"
						name="service"
						className={st.control}
						defaultValue={service}
						{...a11y("service")}
					>
						{INQUIRY_SERVICES.map((s) => (
							<option key={s.key} value={s.key}>
								{s.label}
							</option>
						))}
					</select>
				</div>,
			)}
			{field(
				"message",
				t("formMessage"),
				<textarea
					id="inq-message"
					name="message"
					className={st.control}
					placeholder={t("formMessagePlaceholder")}
					required
					{...a11y("message")}
				/>,
				true,
			)}
			<div className={st.trap} aria-hidden="true">
				<label htmlFor="inq-website">Website</label>
				<input
					id="inq-website"
					name="website"
					tabIndex={-1}
					autoComplete="off"
				/>
			</div>
			<div className={cn(st.field, st.full)}>
				<label className={st.check} htmlFor="inq-business">
					<input
						id="inq-business"
						name="business"
						type="checkbox"
						required
						{...a11y("business")}
					/>
					<span>
						{t.rich("formBusiness", {
							link: (chunks) => (
								<Link href="/datenschutz-erklaerung">{chunks}</Link>
							),
						})}
					</span>
				</label>
				{errors.business && (
					<p className={st.error} id="inq-business-error">
						{errors.business}
					</p>
				)}
			</div>
			<div className={cn(st.actions, st.full)}>
				<button
					type="submit"
					className={buttonClassName}
					disabled={state === "sending"}
				>
					{state === "sending" ? t("formSending") : t("formSubmit")}
				</button>
				<p className={st.hint} aria-live="polite">
					{failure ?? t("formHint")}
				</p>
			</div>
		</form>
	);
}
