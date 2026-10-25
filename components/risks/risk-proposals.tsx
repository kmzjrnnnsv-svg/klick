"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { dismissRiskProposal, restoreRiskProposal } from "@/app/actions/risks";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { errorText } from "@/components/ui/error-text";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type { RiskProposal } from "@/lib/compliance/risk-proposals";
import { newRiskHref } from "@/lib/compliance/risk-sources";

// Reiter „Vorschläge“ auf /risiken (B3): erfassen (Assistent vorbelegt) oder
// begründet ablehnen. Klick legt nichts selbst an.
export function RiskProposals({
	proposals,
	moreGaps,
	dismissed,
	canCreate,
	canDecide,
}: {
	proposals: readonly RiskProposal[];
	moreGaps: number;
	dismissed: readonly { key: string; reason: string; at: string }[];
	canCreate: boolean;
	canDecide: boolean;
}) {
	const t = useTranslations("RiskSources");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [target, setTarget] = useState<RiskProposal | null>(null);
	const [reason, setReason] = useState("");

	function dismiss() {
		if (!target) return;
		start(async () => {
			const res = await dismissRiskProposal({ key: target.key, reason });
			if (!res.ok) return void toast.error(errorText(tc, res));
			toast.success(t("dismissed"));
			setTarget(null);
			setReason("");
			router.refresh();
		});
	}

	return (
		<div className="flex flex-col gap-6">
			<p className="max-w-3xl text-muted-foreground text-subhead">
				{t("proposalsLead")}
			</p>
			{proposals.length === 0 ? (
				<p className="text-subhead">{t("proposalsNone")}</p>
			) : (
				<ul className="flex flex-col list-inset overflow-hidden rounded-2xl bg-card">
					{proposals.map((p) => (
						<li
							key={p.key}
							className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center"
						>
							<div className="min-w-0 grow">
								<p className="flex flex-wrap items-center gap-2">
									<Badge variant="muted">{t(`kind_${p.kind}`)}</Badge>
									<span className="font-medium">{p.title}</span>
								</p>
								<p className="text-muted-foreground text-footnote">
									{p.reason}
								</p>
							</div>
							<div className="flex shrink-0 flex-wrap gap-2">
								{canCreate && (
									<Link
										href={newRiskHref(p.kind, p.id)}
										className={buttonVariants({
											variant: "outline",
											size: "sm",
										})}
									>
										{t("create")}
									</Link>
								)}
								{canDecide && (
									<Button
										variant="ghost"
										size="sm"
										onClick={() => setTarget(p)}
										disabled={pending}
									>
										{t("dismiss")}
									</Button>
								)}
							</div>
						</li>
					))}
				</ul>
			)}
			{moreGaps > 0 && (
				<p className="text-muted-foreground text-subhead">
					{t("moreGaps", { n: moreGaps })}{" "}
					<Link href="/rahmenwerke" className="text-primary hover:underline">
						{t("toGaps")}
					</Link>
				</p>
			)}
			{dismissed.length > 0 && (
				<details className="text-subhead">
					<summary className="cursor-pointer text-muted-foreground">
						{t("dismissedList", { n: dismissed.length })}
					</summary>
					<ul className="mt-2 flex flex-col gap-1">
						{dismissed.map((d) => (
							<li key={d.key} className="flex flex-wrap items-center gap-2">
								<span className="font-mono text-muted-foreground text-footnote">
									{d.key.split(":")[0]}
								</span>
								<span>{d.reason}</span>
								{canDecide && (
									<Button
										variant="ghost"
										size="sm"
										disabled={pending}
										onClick={() =>
											start(async () => {
												await restoreRiskProposal(d.key);
												router.refresh();
											})
										}
									>
										{t("restore")}
									</Button>
								)}
							</li>
						))}
					</ul>
				</details>
			)}
			<Dialog
				open={target !== null}
				onOpenChange={(o) => !o && setTarget(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("dismissTitle")}</DialogTitle>
						<DialogDescription>{target?.title}</DialogDescription>
					</DialogHeader>
					<div className="grid gap-2">
						<Label htmlFor="dismiss-reason">{t("dismissReason")}</Label>
						<Textarea
							id="dismiss-reason"
							rows={3}
							value={reason}
							onChange={(e) => setReason(e.target.value)}
						/>
					</div>
					<DialogFooter>
						<Button variant="ghost" onClick={() => setTarget(null)}>
							{tc("cancel")}
						</Button>
						<Button
							onClick={dismiss}
							disabled={pending || reason.trim().length < 3}
						>
							{t("dismiss")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
