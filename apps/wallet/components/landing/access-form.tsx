"use client";

import {
	ACCESS_REQUEST_PURPOSES,
	type AccessRequestPurpose,
} from "@wallet/db/schema/enums";
import {
	ACCESS_REQUEST_LIMITS as L,
	PURPOSE_LABEL,
} from "@wallet/lib/access-requests/rules";
import { ACCESS } from "@wallet/lib/landing";
import Link from "next/link";
import { useState } from "react";
import { FormAlert } from "@/components/ui/form-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Errors = Partial<Record<string, string>>;

// „Zugang anfragen“ (Startseite #zugang) → POST /api/access-request.
// Honeypot „website“ und der Zeitpunkt des Renderns gehen mit; der Server
// verwirft Bots still. Fehler stehen am Feld und über dem Knopf (HIG).
export function AccessForm() {
	const [renderedAt] = useState(() => Date.now());
	const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
	const [errors, setErrors] = useState<Errors>({});
	const [failure, setFailure] = useState<string | null>(null);

	if (state === "sent")
		return (
			<p
				role="status"
				className="rounded-2xl bg-background p-5 text-pretty text-title-3 leading-relaxed sm:p-7"
			>
				{ACCESS.done}
			</p>
		);

	const a11y = (name: string) =>
		errors[name]
			? { "aria-invalid": true, "aria-describedby": `acc-${name}-error` }
			: {};
	const error = (name: string) =>
		errors[name] ? (
			<p id={`acc-${name}-error`} className="text-destructive text-subhead">
				{errors[name]}
			</p>
		) : null;
	const field = "flex flex-col gap-1.5";

	return (
		<form
			noValidate
			className="grid grid-cols-1 gap-5 rounded-2xl bg-background p-5 sm:grid-cols-2 sm:p-7"
			onSubmit={async (e) => {
				e.preventDefault();
				const formEl = e.currentTarget;
				const fd = new FormData(formEl);
				const body = {
					name: String(fd.get("name") ?? ""),
					company: String(fd.get("company") ?? ""),
					email: String(fd.get("email") ?? ""),
					purpose: String(fd.get("purpose") ?? ""),
					message: String(fd.get("message") ?? ""),
					business: fd.get("business") === "on",
					website: String(fd.get("website") ?? ""),
					renderedAt,
				};
				setState("sending");
				setFailure(null);
				setErrors({});
				try {
					const res = await fetch("/api/access-request", {
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
						const el = first ? formEl.elements.namedItem(first) : null;
						if (el instanceof RadioNodeList)
							(el[0] as HTMLElement | undefined)?.focus();
						else (el as HTMLElement | null)?.focus();
						return;
					}
					setFailure(res.status === 429 ? ACCESS.tooMany : ACCESS.error);
				} catch {
					setState("idle");
					setFailure(ACCESS.error);
				}
			}}
		>
			<div className={field}>
				<Label htmlFor="acc-name">{ACCESS.fields.name}</Label>
				<Input
					id="acc-name"
					name="name"
					autoComplete="name"
					maxLength={L.name}
					required
					{...a11y("name")}
				/>
				{error("name")}
			</div>
			<div className={field}>
				<Label htmlFor="acc-company">{ACCESS.fields.company}</Label>
				<Input
					id="acc-company"
					name="company"
					autoComplete="organization"
					maxLength={L.company}
					required
					{...a11y("company")}
				/>
				{error("company")}
			</div>
			<div className={`${field} sm:col-span-2`}>
				<Label htmlFor="acc-email">{ACCESS.fields.email}</Label>
				<Input
					id="acc-email"
					name="email"
					type="email"
					inputMode="email"
					autoComplete="email"
					spellCheck={false}
					maxLength={L.email}
					required
					{...a11y("email")}
				/>
				{error("email")}
			</div>
			<fieldset
				className="flex flex-col gap-1.5 sm:col-span-2"
				{...(errors.purpose ? { "aria-describedby": "acc-purpose-error" } : {})}
			>
				<legend className="mb-1.5 font-medium text-subhead">
					{ACCESS.fields.purpose}
				</legend>
				{ACCESS_REQUEST_PURPOSES.map((p: AccessRequestPurpose, i) => (
					<label
						key={p}
						className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 hover:bg-muted has-checked:bg-muted"
					>
						<input
							type="radio"
							name="purpose"
							value={p}
							defaultChecked={i === 0}
							className="size-5 shrink-0 accent-primary"
						/>
						<span className="text-pretty">{PURPOSE_LABEL[p]}</span>
					</label>
				))}
				{error("purpose")}
			</fieldset>
			<div className={`${field} sm:col-span-2`}>
				<Label htmlFor="acc-message">{ACCESS.fields.message}</Label>
				<Textarea
					id="acc-message"
					name="message"
					rows={4}
					maxLength={L.message}
					aria-describedby="acc-message-hint"
					{...a11y("message")}
				/>
				<p id="acc-message-hint" className="text-muted-foreground text-subhead">
					{ACCESS.fields.messageHint}
				</p>
				{error("message")}
			</div>
			<div className="flex flex-col gap-1.5 sm:col-span-2">
				<label className="flex min-h-11 cursor-pointer items-center gap-3">
					<input
						type="checkbox"
						name="business"
						className="size-5 shrink-0 accent-primary"
						{...a11y("business")}
					/>
					<span>{ACCESS.fields.business}</span>
				</label>
				{error("business")}
				<p className="text-pretty text-muted-foreground text-subhead">
					{ACCESS.privacy}{" "}
					<Link
						href="/privacy"
						className="text-primary underline-offset-4 hover:underline"
					>
						{ACCESS.privacyLink}
					</Link>
				</p>
			</div>
			{/* Honeypot: für Menschen unsichtbar, Bots füllen ihn aus */}
			<div
				className="absolute -left-[9999px] h-px w-px overflow-hidden"
				aria-hidden="true"
			>
				<label htmlFor="acc-website">Website</label>
				<input
					id="acc-website"
					name="website"
					tabIndex={-1}
					autoComplete="off"
				/>
			</div>
			<div className="flex flex-col gap-3 sm:col-span-2">
				<FormAlert message={failure} />
				<button
					type="submit"
					disabled={state === "sending"}
					className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-full bg-primary-fill px-6 font-semibold text-white transition-[filter] hover:brightness-110 active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
				>
					{state === "sending" ? ACCESS.sending : ACCESS.submit}
				</button>
			</div>
		</form>
	);
}
