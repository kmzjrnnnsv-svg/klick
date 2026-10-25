"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { updateDlpPolicy } from "@/app/actions/settings";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { errorText } from "@/components/ui/error-text";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import type { DlpPolicy, DlpRuleAction } from "@/db/schema/platform";

const RULES: DlpRuleAction[] = ["block", "warn", "raise", "allow"];
const CATEGORIES = ["secret", "payment", "bank", "tax", "pii"] as const;

// Einstellungen → Sicherheit: DLP-Regeln für Uploads und die Schwelle der
// Abfluss-Überwachung. Secrets bleiben mindestens „Warnung“.
export function DlpPanel({
	policy,
	canEdit,
}: {
	policy: DlpPolicy;
	canEdit: boolean;
}) {
	const t = useTranslations("Settings");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [p, setP] = useState<DlpPolicy>(policy);
	const [pending, start] = useTransition();

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-headline">{t("dlpTitle")}</CardTitle>
				<CardDescription>{t("dlpLead")}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-5 text-subhead">
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					{CATEGORIES.map((cat) => (
						<div key={cat} className="flex flex-col gap-1.5">
							<Label>{t(`dlpCat_${cat}`)}</Label>
							<Select
								value={p[cat]}
								disabled={!canEdit || pending}
								onValueChange={(v) =>
									setP({ ...p, [cat]: v as DlpRuleAction } as DlpPolicy)
								}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{RULES.filter(
										(r) => cat !== "secret" || r === "block" || r === "warn",
									).map((r) => (
										<SelectItem key={r} value={r}>
											{t(`dlpRule_${r}`)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					))}
				</div>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="dlp-pii">{t("dlpPiiThreshold")}</Label>
						<Input
							id="dlp-pii"
							name="piiThreshold"
							type="number"
							inputMode="numeric"
							min={5}
							value={p.piiThreshold}
							disabled={!canEdit || pending}
							onChange={(e) =>
								setP({ ...p, piiThreshold: Number(e.target.value) })
							}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="dlp-egress">{t("dlpEgressLimit")}</Label>
						<Input
							id="dlp-egress"
							name="egressLimit"
							type="number"
							inputMode="numeric"
							min={5}
							value={p.egressLimit}
							disabled={!canEdit || pending}
							onChange={(e) =>
								setP({ ...p, egressLimit: Number(e.target.value) })
							}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="dlp-window">{t("dlpEgressWindow")}</Label>
						<Input
							id="dlp-window"
							name="egressWindowMinutes"
							type="number"
							inputMode="numeric"
							min={1}
							value={p.egressWindowMinutes}
							disabled={!canEdit || pending}
							onChange={(e) =>
								setP({ ...p, egressWindowMinutes: Number(e.target.value) })
							}
						/>
					</div>
				</div>
				<p className="text-muted-foreground text-footnote">{t("dlpHint")}</p>
				{canEdit && (
					<div className="flex justify-end">
						<Button
							disabled={pending}
							onClick={() =>
								start(async () => {
									const res = await withStepUp(() => updateDlpPolicy(p));
									if (!res.ok) {
										toast.error(
											res.error === "step_up_required"
												? t("stepUp")
												: errorText(tc, res),
										);
										return;
									}
									toast.success(t("saved"));
									router.refresh();
								})
							}
						>
							{pending ? tc("saving") : tc("save")}
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
