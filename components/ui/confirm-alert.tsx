"use client";

import { useTranslations } from "next-intl";
import { useCallback, useId, useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { HostPanel, topModalHost } from "@/components/ui/modal-host";

// Rückfrage vor unumkehrbaren Schritten (Apple HIG: Alert, „Abbrechen“ +
// klares Verb, destruktiv in Rot) — statt window.confirm. In einem offenen
// Sheet erscheint sie im Sheet (modal-host), nie als zweites Modal darüber.
// `ask(fn)` öffnet die Rückfrage, `fn` läuft nach der Bestätigung.
export function useConfirm({
	title,
	description,
	confirmLabel,
	destructive = true,
}: {
	title: string;
	description?: string;
	confirmLabel: string;
	destructive?: boolean;
}) {
	const tc = useTranslations("Common");
	const titleId = useId();
	const [pending, setPending] = useState<{
		run: () => void;
		host: HTMLElement | null;
	} | null>(null);
	const ask = useCallback((run: () => void) => {
		setPending({ run, host: topModalHost() });
	}, []);
	const cancel = useCallback(() => setPending(null), []);
	const confirm = () => {
		const run = pending?.run;
		setPending(null);
		run?.();
	};
	const confirmClass = destructive
		? buttonVariants({ variant: "destructive" })
		: undefined;

	let node: React.ReactNode = null;
	if (pending?.host)
		node = (
			<HostPanel host={pending.host} onCancel={cancel} labelledBy={titleId}>
				<h2 id={titleId} className="font-semibold text-headline">
					{title}
				</h2>
				{description && (
					<p className="text-muted-foreground text-subhead">{description}</p>
				)}
				<div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<Button variant="secondary" onClick={cancel}>
						{tc("cancel")}
					</Button>
					<Button
						variant={destructive ? "destructive" : "default"}
						onClick={confirm}
					>
						{confirmLabel}
					</Button>
				</div>
			</HostPanel>
		);
	else if (pending)
		node = (
			<AlertDialog open onOpenChange={(o) => !o && cancel()}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{title}</AlertDialogTitle>
						{description && (
							<AlertDialogDescription>{description}</AlertDialogDescription>
						)}
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
						<AlertDialogAction className={confirmClass} onClick={confirm}>
							{confirmLabel}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		);
	return { ask, node };
}
