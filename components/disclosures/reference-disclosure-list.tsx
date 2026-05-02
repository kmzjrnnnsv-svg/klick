"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	grantReferenceDisclosure,
	revokeReferenceDisclosure,
} from "@/app/actions/references";
import type { ReferenceCheck } from "@/db/schema";

export function ReferenceDisclosureList({
	interestId,
	references,
	initiallyGranted,
}: {
	interestId: string;
	references: ReferenceCheck[];
	initiallyGranted: string[];
}) {
	const t = useTranslations("ReferenceDisclosure");
	const [granted, setGranted] = useState<Set<string>>(
		new Set(initiallyGranted),
	);
	const [isPending, startTransition] = useTransition();

	function toggle(refId: string) {
		const next = new Set(granted);
		const wasGranted = next.has(refId);
		if (wasGranted) next.delete(refId);
		else next.add(refId);
		setGranted(next);
		startTransition(async () => {
			try {
				if (wasGranted) {
					await revokeReferenceDisclosure({
						interestId,
						referenceCheckId: refId,
					});
				} else {
					await grantReferenceDisclosure({
						interestId,
						referenceCheckId: refId,
					});
				}
			} catch {
				// Revert on failure
				setGranted(new Set(initiallyGranted));
			}
		});
	}

	const submitted = references.filter((r) => r.status === "submitted");
	if (submitted.length === 0) {
		return <p className="text-muted-foreground text-xs">{t("noReferences")}</p>;
	}

	return (
		<ul className="space-y-2">
			{submitted.map((r) => {
				const isOn = granted.has(r.id);
				return (
					<li
						key={r.id}
						className={`flex items-start gap-3 rounded-sm border p-3 ${
							isOn
								? "border-emerald-500/40 bg-emerald-500/5"
								: "border-border bg-background"
						}`}
					>
						<input
							type="checkbox"
							checked={isOn}
							onChange={() => toggle(r.id)}
							disabled={isPending}
							aria-label={t("toggle", { name: r.refereeName })}
							className="mt-1"
						/>
						<div className="min-w-0">
							<p className="font-medium text-sm">{r.refereeName}</p>
							<p className="font-mono text-[10px] text-muted-foreground">
								{r.refereeRelation ?? t("noRelation")}
							</p>
							{r.answers && r.answers.length > 0 && (
								<details className="mt-1 text-xs">
									<summary className="cursor-pointer text-muted-foreground">
										{t("preview")}
									</summary>
									<dl className="mt-2 space-y-1.5">
										{r.answers.slice(0, 1).map((a) => (
											<div
												key={a.question.slice(0, 32)}
												className="rounded-sm bg-muted/40 p-2"
											>
												<dt className="font-medium">{a.question}</dt>
												<dd className="mt-0.5 line-clamp-2 text-muted-foreground">
													{a.answer}
												</dd>
											</div>
										))}
									</dl>
								</details>
							)}
						</div>
					</li>
				);
			})}
		</ul>
	);
}
