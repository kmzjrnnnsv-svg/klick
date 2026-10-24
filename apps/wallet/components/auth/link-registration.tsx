"use client";

import { acceptInvitation } from "@wallet/app/actions/auth";
import { authClient } from "@wallet/lib/auth/client";
import { KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Passkey über einen Link anlegen (Aktivieren, Zurücksetzen, Einladung).
// Der Token steht nur im Fragment; /api/link tauscht ihn gegen ein Cookie
// für die Passkey-Endpunkte. Einladungen nimmt danach acceptInvitation an.

type InviteInfo = {
	kind: "invite";
	invitationId: string;
	organizationId: string;
	organization: string;
	email: string;
	role: string;
	accountExists: boolean;
};
type AccountInfo = {
	kind: "activate" | "recover";
	email: string;
	name: string;
};
type Info = InviteInfo | AccountInfo;
type State =
	| { s: "loading" }
	| { s: "incomplete" }
	| { s: "invalid" }
	| { s: "ready"; token: string; info: Info };

const PENDING_INVITE = "both_pending_invite";

function forgetPendingInvite() {
	try {
		sessionStorage.removeItem(PENDING_INVITE);
	} catch {}
}

async function exchange(token: string, name?: string): Promise<Info | null> {
	const res = await fetch("/api/link", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ token, name }),
	});
	return res.ok ? ((await res.json()) as Info) : null;
}

export function LinkRegistration({
	page,
	sessionEmail,
}: {
	page: "activate" | "invite";
	sessionEmail: string | null;
}) {
	const t = useTranslations("Link");
	const ta = useTranslations("Auth");
	const router = useRouter();
	const [state, setState] = useState<State>({ s: "loading" });
	const [name, setName] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let current = true;
		function check() {
			// Nach der Anmeldung (bestehendes Konto) kommt der Token aus dem
			// sessionStorage zurück — nie über die Query (Zugriffs-Logs).
			let token = window.location.hash.slice(1).trim();
			if (!token && page === "invite") {
				try {
					token = sessionStorage.getItem(PENDING_INVITE) ?? "";
				} catch {}
			}
			if (!token) return setState({ s: "incomplete" });
			setState({ s: "loading" });
			exchange(token)
				.then((info) => {
					if (!current) return;
					const fits =
						info &&
						(page === "invite"
							? info.kind === "invite"
							: info.kind !== "invite");
					setState(
						fits && info ? { s: "ready", token, info } : { s: "invalid" },
					);
				})
				.catch(() => current && setState({ s: "invalid" }));
		}
		check();
		window.addEventListener("hashchange", check);
		return () => {
			current = false;
			window.removeEventListener("hashchange", check);
		};
	}, [page]);

	if (state.s === "loading")
		return (
			<p className="text-muted-foreground text-sm" aria-live="polite">
				{t("checking")}
			</p>
		);
	if (state.s !== "ready")
		return (
			<p className="text-muted-foreground">
				{state.s === "incomplete" ? t("incomplete") : t("invalid")}
			</p>
		);

	const { info, token } = state;

	async function accept(inv: InviteInfo): Promise<boolean> {
		const res = await acceptInvitation({
			organizationId: inv.organizationId,
			invitationId: inv.invitationId,
		});
		if (!res.ok) {
			setError(
				res.error === "wrong_account" ? t("wrongAccount") : t("invalid"),
			);
			return false;
		}
		forgetPendingInvite();
		return true;
	}

	async function create() {
		setBusy(true);
		setError(null);
		try {
			if (name.trim()) {
				const again = await exchange(token, name.trim());
				if (!again) return setState({ s: "invalid" });
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
									? t("invalid")
									: t("errorGeneric"),
				);
				return;
			}
			await fetch("/api/link", { method: "DELETE" }).catch(() => {});
			if (info.kind === "invite" && !(await accept(info))) return;
			router.replace("/");
			router.refresh();
		} finally {
			setBusy(false);
		}
	}

	async function acceptSignedIn(inv: InviteInfo) {
		setBusy(true);
		setError(null);
		try {
			if (await accept(inv)) {
				router.replace("/");
				router.refresh();
			}
		} finally {
			setBusy(false);
		}
	}

	if (info.kind === "invite" && sessionEmail) {
		const same = sessionEmail.toLowerCase() === info.email.toLowerCase();
		return (
			<div className="flex flex-col gap-4">
				<p>
					{t("inviteLead", {
						role: info.role,
						organization: info.organization,
						email: info.email,
					})}
				</p>
				{same ? (
					<Button
						size="lg"
						onClick={() => acceptSignedIn(info)}
						disabled={busy}
					>
						{busy ? t("acceptBusy") : t("accept")}
					</Button>
				) : (
					<p className="text-muted-foreground">
						{t("signedInOther", { current: sessionEmail, email: info.email })}
					</p>
				)}
				<p
					role="alert"
					aria-live="polite"
					className="min-h-4 text-destructive text-sm"
				>
					{error}
				</p>
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
					href="/login?next=%2Finvite"
					onClick={() => {
						try {
							sessionStorage.setItem(PENDING_INVITE, token);
						} catch {}
					}}
					className={buttonVariants({ size: "lg" })}
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
			<p>
				{info.kind === "invite"
					? t("inviteLead", {
							role: info.role,
							organization: info.organization,
							email: info.email,
						})
					: info.kind === "activate"
						? t("activateLead", {
								name: info.name || info.email,
								email: info.email,
							})
						: t("recoverLead", { email: info.email })}
			</p>
			{info.kind === "invite" && (
				<div className="grid gap-2">
					<Label htmlFor="name">{t("name")}</Label>
					<Input
						id="name"
						name="name"
						autoComplete="name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						maxLength={80}
					/>
				</div>
			)}
			<Button type="submit" size="lg" disabled={busy}>
				<KeyRound aria-hidden /> {busy ? t("createBusy") : t("create")}
			</Button>
			<p
				role="alert"
				aria-live="polite"
				className="min-h-4 text-destructive text-sm"
			>
				{error}
			</p>
		</form>
	);
}
