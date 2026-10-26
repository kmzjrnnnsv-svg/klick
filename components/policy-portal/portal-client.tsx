"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Richtlinien-Portal ohne Konto: Adresse → Code → Cookie (die Routen unter
// /portal/<slug> setzen es). Nur fetch auf die eigene Herkunft, JSON.

const post = (url: string, body: unknown) =>
	fetch(url, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});

export function PortalSignIn({ slug, org }: { slug: string; org: string }) {
	const t = useTranslations("PolicyPortal");
	const router = useRouter();
	const [step, setStep] = useState<"email" | "code">("email");
	const [email, setEmail] = useState("");
	const [code, setCode] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, start] = useTransition();
	const base = `/portal/${slug}`;

	if (step === "email")
		return (
			<form
				className="flex max-w-md flex-col gap-3"
				onSubmit={(e) => {
					e.preventDefault();
					start(async () => {
						const res = await post(`${base}/code`, { email });
						if (res.status === 429) return void setError(t("rateLimited"));
						if (!res.ok) return void setError(t("codeInvalid"));
						setError(null);
						setStep("code");
					});
				}}
			>
				<div className="flex flex-col gap-1">
					<Label htmlFor="portal-email">{t("email")}</Label>
					<Input
						id="portal-email"
						type="email"
						name="email"
						autoComplete="email"
						spellCheck={false}
						required
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						placeholder={t("emailPlaceholder")}
					/>
				</div>
				<FormAlert message={error} />
				<Button type="submit" disabled={pending || !email}>
					{pending ? t("sending") : t("sendCode")}
				</Button>
			</form>
		);

	return (
		<form
			className="flex max-w-md flex-col gap-3"
			onSubmit={(e) => {
				e.preventDefault();
				start(async () => {
					const res = await post(`${base}/anmelden`, { email, code });
					if (res.ok) return router.refresh();
					const body = (await res.json().catch(() => ({}))) as {
						error?: string;
					};
					setError(
						res.status === 429
							? t("rateLimited")
							: body.error === "expired"
								? t("codeExpired")
								: body.error === "locked"
									? t("codeLocked")
									: t("codeInvalid"),
					);
				});
			}}
		>
			<p role="status" className="text-muted-foreground text-subhead">
				{t("codeSent", { org })}
			</p>
			<div className="flex flex-col gap-1">
				<Label htmlFor="portal-code">{t("code")}</Label>
				<Input
					id="portal-code"
					name="code"
					inputMode="numeric"
					autoComplete="one-time-code"
					pattern="[0-9 ]{6,7}"
					maxLength={7}
					required
					value={code}
					onChange={(e) => setCode(e.target.value)}
					placeholder={t("codePlaceholder")}
					className="font-mono"
				/>
			</div>
			<FormAlert message={error} />
			<div className="flex flex-wrap gap-2">
				<Button type="submit" disabled={pending || code.trim().length < 6}>
					{pending ? t("signingIn") : t("signIn")}
				</Button>
				<Button
					type="button"
					variant="ghost"
					onClick={() => {
						setStep("email");
						setCode("");
						setError(null);
					}}
				>
					{t("otherEmail")}
				</Button>
			</div>
		</form>
	);
}

export function PortalAckButton({
	slug,
	versionId,
}: {
	slug: string;
	versionId: string;
}) {
	const t = useTranslations("Documents");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [error, setError] = useState<string | null>(null);
	return (
		<div className="flex flex-col items-end gap-2">
			<Button
				size="sm"
				variant="outline"
				disabled={pending}
				onClick={() =>
					start(async () => {
						const res = await post(`/portal/${slug}/kenntnisnahme`, {
							versionId,
						});
						if (!res.ok) return void setError(tc("error"));
						setError(null);
						router.refresh();
					})
				}
			>
				<Check />
				{t("acknowledge")}
			</Button>
			<FormAlert message={error} />
		</div>
	);
}

export function PortalSignOut({
	slug,
	email,
}: {
	slug: string;
	email: string;
}) {
	const t = useTranslations("PolicyPortal");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<div className="flex flex-wrap items-center gap-2 text-muted-foreground text-footnote">
			<span translate="no">{t("signedInAs", { email })}</span>
			<Button
				size="sm"
				variant="ghost"
				disabled={pending}
				onClick={() =>
					start(async () => {
						await post(`/portal/${slug}/abmelden`, {});
						router.refresh();
					})
				}
			>
				{t("signOut")}
			</Button>
		</div>
	);
}
