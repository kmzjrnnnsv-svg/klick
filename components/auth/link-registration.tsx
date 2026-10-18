"use client";

import { KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";

// Passkey über einen Einmal-Link anlegen (ADR-019): Einladung (neues Konto),
// Zugang zurücksetzen (bestehendes Konto) oder Aktivieren (vom Plattform-
// Admin angelegtes Konto — nur mit Passkey, kein Mail-Notweg). Der Token steht im
// URL-Fragment und geht nur per POST an /api/registrierung, das ein
// httpOnly-Cookie für die Passkey-Endpunkte setzt.

type InviteInfo = {
	kind: "invite";
	invitationId: string;
	email: string;
	organization: string;
	role: string;
	inviter: string;
	accountExists: boolean;
};
type RecoverInfo = { kind: "recover"; email: string; name: string };
type ActivateInfo = {
	kind: "activate";
	email: string;
	name: string;
	invitationId: string | null;
	organization: string | null;
	role: string | null;
};
type Info = InviteInfo | RecoverInfo | ActivateInfo;
type State =
	| { s: "loading" }
	| { s: "incomplete" }
	| { s: "invalid" }
	| { s: "blocked" }
	| { s: "ready"; token: string; info: Info };

async function exchange(
	token: string,
	name?: string,
): Promise<Info | "blocked" | null> {
	const res = await fetch("/api/registrierung", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ token, name }),
	});
	if (res.status === 403) {
		const body = (await res.json().catch(() => null)) as {
			error?: string;
		} | null;
		return body?.error === "blocked" ? "blocked" : null;
	}
	if (!res.ok) return null;
	return (await res.json()) as Info;
}

export function LinkRegistration({
	expected,
	sessionEmail,
}: {
	expected: Info["kind"];
	sessionEmail: string | null;
}) {
	const t = useTranslations("Invitation");
	const tr = useTranslations("Recover");
	const tv = useTranslations("Activate");
	const ta = useTranslations("Auth");
	const router = useRouter();
	const [state, setState] = useState<State>({ s: "loading" });
	const [name, setName] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const token = window.location.hash.slice(1).trim();
		if (!token) {
			setState({ s: "incomplete" });
			return;
		}
		exchange(token)
			.then((info) =>
				setState(
					info === "blocked"
						? { s: "blocked" }
						: info && info.kind === expected
							? { s: "ready", token, info }
							: { s: "invalid" },
				),
			)
			.catch(() => setState({ s: "invalid" }));
	}, [expected]);

	const invalidText =
		expected === "invite"
			? t("linkInvalid")
			: expected === "recover"
				? tr("invalid")
				: tv("invalid");

	if (state.s === "loading")
		return (
			<p className="text-muted-foreground text-sm" aria-live="polite">
				{expected === "invite" ? t("linkChecking") : tv("checking")}
			</p>
		);
	if (state.s !== "ready")
		return (
			<p
				className={
					state.s === "blocked" ? "text-destructive" : "text-muted-foreground"
				}
				role={state.s === "blocked" ? "alert" : undefined}
			>
				{state.s === "incomplete"
					? t("linkIncomplete")
					: state.s === "blocked"
						? ta("accountBlocked")
						: invalidText}
			</p>
		);

	const { info, token } = state;

	async function signOut() {
		await authClient.signOut().catch(() => {});
		router.refresh();
	}

	async function create() {
		setBusy(true);
		setError(null);
		try {
			if (info.kind === "invite") {
				const again = await exchange(token, name);
				if (!again || again === "blocked") {
					setState({ s: again === "blocked" ? "blocked" : "invalid" });
					return;
				}
			}
			const res = await authClient.passkey.addPasskey({
				context: "link",
				createSession: true,
			});
			if (res?.error) {
				const code = "code" in res.error ? String(res.error.code ?? "") : "";
				setError(
					code === "ERROR_CEREMONY_ABORTED" || code === "AUTH_CANCELLED"
						? ta("passkeyCancelled")
						: code === "USER_VERIFICATION_REQUIRED"
							? t("errorUv")
							: code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED"
								? t("errorRegistered")
								: code === "BANNED_USER"
									? ta("accountBlocked")
									: code === "REGISTRATION_LINK_INVALID" ||
											code === "ACCOUNT_EXISTS"
										? invalidText
										: t("errorGeneric"),
				);
				return;
			}
			await fetch("/api/registrierung", { method: "DELETE" }).catch(() => {});
			// Einladung (bzw. Org aus der Anlage) gleich annehmen; ohne Org
			// leitet /heute auf /onboarding weiter.
			const invitationId = info.kind === "recover" ? null : info.invitationId;
			if (invitationId) {
				const acc = await authClient.organization.acceptInvitation({
					invitationId,
				});
				if (acc.error) {
					router.replace(`/einladung/${invitationId}`);
					return;
				}
			}
			router.replace("/heute");
			router.refresh();
		} finally {
			setBusy(false);
		}
	}

	if (info.kind === "invite" && sessionEmail) {
		const same = sessionEmail.toLowerCase() === info.email.toLowerCase();
		return (
			<div className="flex flex-col gap-4">
				<p className="text-muted-foreground">
					{same
						? t("signedInSame", { email: sessionEmail })
						: t("signedInOther", {
								current: sessionEmail,
								email: info.email,
							})}
				</p>
				{same ? (
					<Link
						href={`/einladung/${info.invitationId}`}
						className={buttonVariants({ variant: "brown" })}
					>
						{t("toAccept")}
					</Link>
				) : (
					<Button variant="outline" onClick={signOut}>
						{t("signOut")}
					</Button>
				)}
			</div>
		);
	}

	if (info.kind === "invite" && info.accountExists)
		return (
			<div className="flex flex-col gap-4">
				<p className="text-muted-foreground">
					{t("accountExists", { email: info.email })}
				</p>
				<Link
					href={`/login?weiter=/einladung/${info.invitationId}`}
					className={buttonVariants({ variant: "brown" })}
				>
					{t("signInToAccept")}
				</Link>
			</div>
		);

	return (
		<form
			className="flex flex-col gap-5"
			onSubmit={(e) => {
				e.preventDefault();
				void create();
			}}
		>
			<p className="text-muted-foreground">
				{info.kind === "invite"
					? t("lead", {
							inviter: info.inviter,
							organization: info.organization,
							role: info.role,
						})
					: info.kind === "activate"
						? tv("lead", { name: info.name || info.email })
						: tr("lead", { email: info.email })}
			</p>
			{info.kind === "activate" && (
				<p className="text-sm">
					{info.organization
						? tv("forEmailOrg", {
								email: info.email,
								organization: info.organization,
								role: info.role ?? "",
							})
						: tv("forEmail", { email: info.email })}
				</p>
			)}
			{info.kind === "invite" && (
				<>
					<p className="text-sm">{t("forEmail", { email: info.email })}</p>
					<div className="grid gap-2">
						<Label htmlFor="reg-name">{t("yourName")}</Label>
						<Input
							id="reg-name"
							name="name"
							autoComplete="name"
							required
							maxLength={80}
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
						<p className="text-muted-foreground text-xs">{t("yourNameHint")}</p>
					</div>
				</>
			)}
			<Button
				type="submit"
				variant="brown"
				disabled={busy || (info.kind === "invite" && !name.trim())}
			>
				<KeyRound className="size-4" aria-hidden />
				{busy
					? t("creating")
					: info.kind === "invite"
						? t("createPasskey")
						: info.kind === "activate"
							? tv("create")
							: tr("create")}
			</Button>
			{error && (
				<p role="alert" className="text-destructive text-sm">
					{error}
				</p>
			)}
			<p className="text-muted-foreground text-xs">{t("passkeyHint")}</p>
			{info.kind === "activate" && (
				<p className="text-muted-foreground text-xs">{tv("noDevice")}</p>
			)}
			{info.kind === "invite" && (
				<p className="text-muted-foreground text-xs">
					{t("noPasskeyDevice")}{" "}
					<Link
						href={`/login/notweg?weiter=/einladung/${info.invitationId}`}
						className="text-primary hover:underline"
					>
						{t("noPasskeyLink")}
					</Link>
				</p>
			)}
		</form>
	);
}
