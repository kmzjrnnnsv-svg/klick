"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { verifyStepUp } from "@/app/actions/security";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasskeyConfirmButton } from "./passkey-confirm";

// Step-up im Dialog statt Fehler-Toast: Eine Action meldet
// `step_up_required`, withStepUp() öffnet den (einmal im AppShell
// gemounteten) Dialog, bestätigt per Passkey (zuerst) oder TOTP und
// wiederholt die Action.
// Abbrechen liefert das ursprüngliche Ergebnis zurück — der Aufrufer
// zeigt dann wie bisher seinen Hinweis.

type Opener = () => Promise<boolean>;
let opener: Opener | null = null;

export function requestStepUp(): Promise<boolean> {
	return opener ? opener() : Promise.resolve(false);
}

export async function withStepUp<T extends { ok: boolean; error?: string }>(
	fn: () => Promise<T>,
): Promise<T> {
	const res = await fn();
	if (res.ok || res.error !== "step_up_required") return res;
	return (await requestStepUp()) ? fn() : res;
}

// Dasselbe für Better-Auth-Client-Aufrufe (Passkeys/2FA verwalten): der
// Server-Hook (lib/auth/endpoint-guard.ts) antwortet mit Code
// STEP_UP_REQUIRED bzw. Meldung step_up_required.
export function isStepUpError(e: unknown): boolean {
	if (!e || typeof e !== "object") return false;
	const x = e as { code?: unknown; message?: unknown };
	return x.code === "STEP_UP_REQUIRED" || x.message === "step_up_required";
}

export async function withAuthStepUp<
	T extends { error?: unknown } | null | undefined,
>(fn: () => Promise<T>): Promise<T> {
	const res = await fn();
	if (!isStepUpError(res?.error)) return res;
	return (await requestStepUp()) ? fn() : res;
}

export function StepUpDialog({
	passkey,
	totp,
}: {
	passkey: boolean;
	totp: boolean;
}) {
	const t = useTranslations("Auth");
	const tc = useTranslations("Common");
	const [open, setOpen] = useState(false);
	const [code, setCode] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const resolver = useRef<((ok: boolean) => void) | null>(null);

	useEffect(() => {
		opener = () =>
			new Promise<boolean>((resolve) => {
				resolver.current?.(false);
				resolver.current = resolve;
				setCode("");
				setError(null);
				setOpen(true);
			});
		return () => {
			opener = null;
		};
	}, []);

	function finish(ok: boolean) {
		resolver.current?.(ok);
		resolver.current = null;
		setOpen(false);
	}

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		setBusy(true);
		const res = await verifyStepUp(code.trim());
		setBusy(false);
		if (res.ok) return finish(true);
		setCode("");
		setError(res.error === "locked" ? t("locked") : t("invalidCode"));
	}

	return (
		<Dialog open={open} onOpenChange={(o) => !o && finish(false)}>
			<DialogContent className="sm:max-w-sm">
				<form onSubmit={submit} className="flex flex-col gap-4">
					<DialogHeader>
						<DialogTitle>{t("twoFactorTitle")}</DialogTitle>
						<DialogDescription>{t("twoFactorStepUp")}</DialogDescription>
					</DialogHeader>
					{passkey && (
						<PasskeyConfirmButton
							purpose="stepup"
							autoFocus
							onConfirmed={() => finish(true)}
						/>
					)}
					{passkey && totp && (
						<p className="text-muted-foreground text-xs">{t("orCode")}</p>
					)}
					{(totp || !passkey) && (
						<div className="grid gap-2">
							<Label htmlFor="step-up-code">{t("code")}</Label>
							<Input
								id="step-up-code"
								inputMode="numeric"
								autoComplete="one-time-code"
								autoFocus={!passkey}
								required
								value={code}
								onChange={(e) => setCode(e.target.value)}
								className="font-mono text-lg tracking-[0.3em]"
							/>
							{error && <p className="text-destructive text-xs">{error}</p>}
						</div>
					)}
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => finish(false)}
						>
							{tc("cancel")}
						</Button>
						{(totp || !passkey) && (
							<Button
								type="submit"
								variant={passkey ? "outline" : "brown"}
								disabled={busy || code.trim().length < 6}
							>
								{t("verify")}
							</Button>
						)}
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
