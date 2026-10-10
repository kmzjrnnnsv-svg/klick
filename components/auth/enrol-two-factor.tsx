"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";

type Phase = "loading" | "scan" | "backup" | "error";

export function EnrolTwoFactor() {
	const t = useTranslations("Auth");
	const router = useRouter();
	const [phase, setPhase] = useState<Phase>("loading");
	const [totpUri, setTotpUri] = useState<string>("");
	const [qr, setQr] = useState<string>("");
	const [backupCodes, setBackupCodes] = useState<string[]>([]);
	const [code, setCode] = useState("");
	const [busy, setBusy] = useState(false);
	// enable() erzeugt bei jedem Aufruf einen neuen Schlüssel. Effekte laufen
	// im Strict Mode doppelt; zwei parallele Aufrufe überholen sich am Server,
	// und der angezeigte Schlüssel passt dann nicht zum gespeicherten (Code
	// wird abgelehnt). Deshalb genau ein Aufruf je Mount.
	const enabling = useRef<ReturnType<
		typeof authClient.twoFactor.enable
	> | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			// Passwortlose Konten: enable() ohne Passwort (allowPasswordless).
			enabling.current ??= authClient.twoFactor.enable({ method: "totp" });
			const res = await enabling.current;
			if (cancelled) return;
			if (res.error || !res.data || res.data.method !== "totp") {
				setPhase("error");
				return;
			}
			setTotpUri(res.data.totpURI);
			setBackupCodes(res.data.backupCodes);
			setQr(
				await QRCode.toDataURL(res.data.totpURI, { margin: 1, width: 220 }),
			);
			setPhase("scan");
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const secret = (() => {
		try {
			return new URL(totpUri).searchParams.get("secret") ?? "";
		} catch {
			return "";
		}
	})();

	async function verify(e: React.FormEvent) {
		e.preventDefault();
		setBusy(true);
		const res = await authClient.twoFactor.verifyTotp({
			code: code.trim(),
			trustDevice: false,
		});
		setBusy(false);
		if (res.error) {
			toast.error(t("invalidCode"));
			setCode("");
			return;
		}
		setPhase("backup");
	}

	if (phase === "loading")
		return <p className="text-muted-foreground text-sm">…</p>;
	if (phase === "error")
		return <p className="text-destructive text-sm">{t("genericError")}</p>;

	if (phase === "backup") {
		return (
			<div className="flex flex-col gap-5">
				<div>
					<h2 className="font-serif-display text-xl">
						{t("enrolBackupTitle")}
					</h2>
					<p className="mt-1 text-muted-foreground text-sm">
						{t("enrolBackupLead")}
					</p>
				</div>
				<ul className="grid grid-cols-2 gap-2 rounded-md border bg-card p-4 font-mono text-sm">
					{backupCodes.map((c) => (
						<li key={c}>{c}</li>
					))}
				</ul>
				<Button
					variant="brown"
					onClick={() => {
						router.replace("/heute");
						router.refresh();
					}}
				>
					{t("enrolDone")}
				</Button>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			{qr && (
				// biome-ignore lint/performance/noImgElement: data-URI aus qrcode, kein Remote-Bild
				<img
					src={qr}
					alt="QR-Code für Authenticator-App"
					width={220}
					height={220}
					className="rounded-md border bg-white p-2"
				/>
			)}
			{secret && (
				<div className="text-xs">
					<p className="text-muted-foreground">{t("enrolSecret")}</p>
					<code className="mt-1 block break-all rounded-sm bg-muted px-2 py-1 font-mono">
						{secret}
					</code>
				</div>
			)}
			<form onSubmit={verify} className="flex flex-col gap-3">
				<div className="grid gap-2">
					<Label htmlFor="code">{t("code")}</Label>
					<Input
						id="code"
						inputMode="numeric"
						autoComplete="one-time-code"
						required
						value={code}
						onChange={(e) => setCode(e.target.value)}
						className="font-mono text-lg tracking-[0.3em]"
					/>
				</div>
				<Button
					type="submit"
					variant="brown"
					disabled={busy || code.trim().length !== 6}
				>
					{t("verify")}
				</Button>
			</form>
		</div>
	);
}
