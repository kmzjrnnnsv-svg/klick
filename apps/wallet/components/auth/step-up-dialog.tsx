"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	HostPanel,
	topModalHost,
	useModalHosts,
} from "@/components/ui/modal-host";
import { PasskeyConfirmButton } from "./passkey-confirm";

// Step-up im Dialog (wie Klick): Actions mit requireStepUp laufen über
// withStepUp(() => action(…)); bei step_up_required öffnet sich der im
// Rahmen gemountete Dialog, nach der Bestätigung wird wiederholt. Ist schon
// ein Dialog offen, erscheint die Bestätigung darin (components/ui/modal-host).

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
	const titleId = useId();
	const [open, setOpen] = useState(false);
	// offener Dialog beim Anfordern: dort erscheint die Bestätigung
	const [host, setHost] = useState<HTMLElement | null>(null);
	const hosts = useModalHosts();
	const resolver = useRef<((ok: boolean) => void) | null>(null);

	useEffect(() => {
		opener = () =>
			new Promise<boolean>((resolve) => {
				resolver.current?.(false);
				resolver.current = resolve;
				setHost(topModalHost());
				setOpen(true);
			});
		return () => {
			opener = null;
		};
	}, []);

	const finish = useCallback((ok: boolean) => {
		resolver.current?.(ok);
		resolver.current = null;
		setOpen(false);
		setHost(null);
	}, []);
	const cancel = useCallback(() => finish(false), [finish]);

	// Dialog geschlossen, während die Bestätigung offen war: abgebrochen
	useEffect(() => {
		if (open && host && !hosts.includes(host)) finish(false);
	}, [open, host, hosts, finish]);

	const actions = (
		<>
			<PasskeyConfirmButton purpose="stepup" onConfirmed={() => finish(true)} />
			<DialogFooter>
				<Button type="button" variant="outline" onClick={cancel}>
					{tc("cancel")}
				</Button>
			</DialogFooter>
		</>
	);

	if (open && host)
		return (
			<HostPanel host={host} onCancel={cancel} labelledBy={titleId}>
				<div className="flex flex-col gap-1.5">
					<h2 id={titleId} className="font-semibold text-headline">
						{t("title")}
					</h2>
					<p className="text-muted-foreground text-subhead">{t("lead")}</p>
				</div>
				{actions}
			</HostPanel>
		);
	return (
		<Dialog open={open} onOpenChange={(o) => !o && cancel()}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>{t("title")}</DialogTitle>
					<DialogDescription>{t("lead")}</DialogDescription>
				</DialogHeader>
				{actions}
			</DialogContent>
		</Dialog>
	);
}
