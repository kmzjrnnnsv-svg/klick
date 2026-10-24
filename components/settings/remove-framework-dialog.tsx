"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { removeFramework } from "@/app/actions/frameworks";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FrameworkRemovalImpact } from "@/lib/compliance/framework-removal";

// Bestätigungsdialog „Rahmenwerk entfernen“: zeigt vorher, was wegfällt, und
// verlangt den Kurznamen (Slug) — destruktiv für die Sicht, nicht für Daten.
export function RemoveFrameworkDialog({
	name,
	impact,
}: {
	name: string;
	impact: FrameworkRemovalImpact;
}) {
	const t = useTranslations("Settings");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [confirm, setConfirm] = useState("");
	const [pending, start] = useTransition();
	const slug = impact.slug;

	const lists: { label: string; items: { code: string; title: string }[] }[] = [
		{ label: t("removeImpactObligations"), items: impact.obligations },
		{ label: t("removeImpactFunctions"), items: impact.functions },
		{ label: t("removeImpactResolutions"), items: impact.resolutions },
		{ label: t("removeImpactProcesses"), items: impact.processes },
	].filter((l) => l.items.length > 0);

	return (
		<Dialog
			open={open}
			onOpenChange={(v) => {
				setOpen(v);
				if (!v) setConfirm("");
			}}
		>
			<DialogTrigger asChild>
				<Button variant="ghost" size="sm">
					{t("removeFramework")}
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-[85vh] overflow-y-auto overscroll-contain sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{t("removeFrameworkTitle", { name })}</DialogTitle>
					<DialogDescription>{t("removeFrameworkLead")}</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-4 text-subhead">
					<ul className="list-disc space-y-1 pl-5">
						<li>
							{t("removeImpactRequirements", { count: impact.requirements })}
						</li>
						<li>
							{t("removeImpactControls", {
								count: impact.controlsOnlyHere.length,
							})}
							{impact.implementedOnlyHere > 0 && (
								<span className="text-muted-foreground">
									{" "}
									(
									{t("removeImpactImplemented", {
										count: impact.implementedOnlyHere,
									})}
									)
								</span>
							)}
						</li>
						{impact.controlsShared > 0 && (
							<li>
								{t("removeImpactShared", { count: impact.controlsShared })}
							</li>
						)}
					</ul>
					{lists.map((l) => (
						<div key={l.label}>
							<p className="font-medium">{l.label}</p>
							<ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
								{l.items.map((i) => (
									<li key={i.code} className="break-words">
										{i.title}
									</li>
								))}
							</ul>
						</div>
					))}
					{impact.lastFramework && (
						<p className="rounded-xl bg-destructive/10 p-3 text-foreground">
							{t("removeBlockedLast")}
						</p>
					)}
					{impact.blockingAudits.length > 0 && (
						<div className="rounded-xl bg-destructive/10 p-3">
							<p className="text-destructive">{t("removeBlockedAudit")}</p>
							<ul className="mt-1 list-disc pl-5">
								{impact.blockingAudits.map((a) => (
									<li key={a.id}>
										<Link href={`/audits/${a.id}`} className="underline">
											{a.title}
										</Link>
									</li>
								))}
							</ul>
						</div>
					)}
					{impact.canRemove && (
						<div className="flex flex-col gap-1.5">
							<Label htmlFor={`remove-${slug}`}>
								{t("removeConfirmLabel", { slug })}
							</Label>
							<Input
								id={`remove-${slug}`}
								name="confirm"
								value={confirm}
								onChange={(e) => setConfirm(e.target.value)}
								autoComplete="off"
								spellCheck={false}
								placeholder={`${slug}…`}
								translate="no"
							/>
						</div>
					)}
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)}>
						{tc("cancel")}
					</Button>
					<Button
						variant="destructive"
						disabled={!impact.canRemove || confirm.trim() !== slug || pending}
						onClick={() =>
							start(async () => {
								const res = await withStepUp(() =>
									removeFramework({ slug, confirm }),
								);
								if (!res.ok) {
									toast.error(
										res.error === "confirmMismatch"
											? t("removeConfirmMismatch")
											: res.error === "lastFramework"
												? t("removeBlockedLast")
												: res.error === "auditRunning"
													? t("removeBlockedAudit")
													: tc("error"),
									);
									return;
								}
								toast.success(t("removeDone"));
								setOpen(false);
								router.refresh();
							})
						}
					>
						{pending
							? `${t("removeConfirmButton")}…`
							: t("removeConfirmButton")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
