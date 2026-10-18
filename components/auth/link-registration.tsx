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

// Passkey über einen Einmal-Link anlegen (ADR-019): Einladung (neues Konto)
// oder Zugang zurücksetzen (bestehendes Konto). Der Token steht im
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
type State =
	| { s: "loading" }
	| { s: "incomplete" }
	| { s: "invalid" }
	| { s: "ready"; token: string; info: InviteInfo | RecoverInfo };

async function exchange(token: string, name?: string) {
	const res = await fetch("/api/registrierung", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ token, name }),
	});
	if (!res.ok) return null;
	return (await res.json()) as InviteInfo | RecoverInfo;
}

export function LinkRegistration({
	expected,
	sessionEmail,
}: {
	expected: "invite" | "recover";
	sessionEmail: string | null;
}) {
	const t = useTranslations("Invitation");
	const tr = useTranslations("Recover");
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
					info && info.kind === expected
						? { s: "ready", token, info }
						: { s: "invalid" },
				),
			)
			.catch(() => setState({ s: "invalid" }));
	}, [expected]);

	if (state.s === "loading")
		return <p className="text-muted-foreground text-sm">{t("linkChecking")}</p>;
	if (state.s !== "ready")
		return (
			<p className="text-muted-foreground">
				{state.s === "incomplete"
					? t("linkIncomplete")
					: expected === "invite"
						? t("linkInvalid")
						: tr("invalid")}
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
			if (info.kind === "invite" && !(await exchange(token, name))) {
				setState({ s: "invalid" });
				return;
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
								: code === "REGISTRATION_LINK_INVALID" ||
										code === "ACCOUNT_EXISTS"
									? expected === "invite"
										? t("linkInvalid")
										: tr("invalid")
									: t("errorGeneric"),
				);
				return;
			}
			await fetch("/api/registrierung", { method: "DELETE" }).catch(() => {});
			if (info.kind === "invite") {
				const acc = await authClient.organization.acceptInvitation({
					invitationId: info.invitationId,
				});
				if (acc.error) {
					router.replace(`/einladung/${info.invitationId}`);
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
					: tr("lead", { email: info.email })}
			</p>
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
						: tr("create")}
			</Button>
			{error && (
				<p role="alert" className="text-destructive text-sm">
					{error}
				</p>
			)}
			<p className="text-muted-foreground text-xs">{t("passkeyHint")}</p>
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
