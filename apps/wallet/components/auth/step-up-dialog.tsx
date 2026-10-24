"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { PasskeyConfirmButton } from "./passkey-confirm";

// Step-up im Dialog (wie Klick): Actions mit requireStepUp laufen über
// withStepUp(() => action(…)); bei step_up_required öffnet sich der im
// Rahmen gemountete Dialog, nach der Bestätigung wird wiederholt.

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

export function StepUpDialog() {
	const t = useTranslations("StepUp");
	const tc = useTranslations("Common");
	const [open, setOpen] = useState(false);
	const resolver = useRef<((ok: boolean) => void) | null>(null);

	useEffect(() => {
		opener = () =>
			new Promise<boolean>((resolve) => {
				resolver.current?.(false);
				resolver.current = resolve;
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

	return (
		<Dialog open={open} onOpenChange={(o) => !o && finish(false)}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>{t("title")}</DialogTitle>
					<DialogDescription>{t("lead")}</DialogDescription>
				</DialogHeader>
				<PasskeyConfirmButton
					purpose="stepup"
					onConfirmed={() => finish(true)}
				/>
				<DialogFooter>
					<Button type="button" variant="outline" onClick={() => finish(false)}>
						{tc("cancel")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
