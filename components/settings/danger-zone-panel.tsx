"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { deleteOrganizationAction } from "@/app/actions/settings";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { ExportLink } from "@/components/entity/export-link";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { errorText } from "@/components/ui/error-text";
import { FormAlert } from "@/components/ui/form-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

// Gefahrenzone: vollständiger Export (DSGVO Art. 20 / DORA Art. 30(2)(d)) und
// Organisation löschen (Crypto-Shredding). Nur Owner, Step-up-pflichtig.
export function DangerZonePanel({
	orgSlug,
	canDelete,
}: {
	orgSlug: string;
	canDelete: boolean;
}) {
	const t = useTranslations("Settings");
	const tc = useTranslations("Common");
	const [pending, start] = useTransition();
	const [confirm, setConfirm] = useState("");
	const [exported, setExported] = useState(false);
	const [open, setOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);

	return (
		<Card className="border-destructive/40">
			<CardHeader>
				<CardTitle className="text-headline">{t("dangerTitle")}</CardTitle>
				<CardDescription>{t("dangerLead")}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4 text-subhead">
				<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<p className="font-medium">{t("exportOrg")}</p>
						<p className="text-muted-foreground text-footnote">
							{t("exportOrgHint")}
						</p>
					</div>
					<ExportLink
						href="/api/export/organisation.zip"
						className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
					>
						{t("exportOrg")}
					</ExportLink>
				</div>
				{canDelete && (
					<div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-start sm:justify-between">
						<div>
							<p className="font-medium">{t("deleteOrg")}</p>
							<p className="text-muted-foreground text-footnote">
								{t("deleteOrgLead")}
							</p>
						</div>
						<Dialog open={open} onOpenChange={setOpen}>
							<DialogTrigger asChild>
								<Button variant="destructive" size="sm">
									{t("deleteOrg")}
								</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>{t("deleteOrg")}</DialogTitle>
									<DialogDescription>{t("deleteOrgLead")}</DialogDescription>
								</DialogHeader>
								<div className="flex flex-col gap-4 text-subhead">
									<p className="rounded-xl bg-warning/12 p-3 text-footnote">
										{t("deleteOrgRetention")}
									</p>
									<label className="flex items-start gap-2">
										<Checkbox
											checked={exported}
											onCheckedChange={(v) => setExported(v === true)}
											aria-label={t("deleteOrgConfirmExport")}
										/>
										<span>{t("deleteOrgConfirmExport")}</span>
									</label>
									<div className="flex flex-col gap-1">
										<Label htmlFor="delete-slug">
											{t("deleteOrgSlug", { slug: orgSlug })}
										</Label>
										<Input
											id="delete-slug"
											value={confirm}
											onChange={(e) => setConfirm(e.target.value)}
											autoComplete="off"
											className="font-mono"
										/>
									</div>
								</div>
								<FormAlert message={error} />
								<DialogFooter>
									<Button
										variant="outline"
										size="sm"
										onClick={() => setOpen(false)}
										disabled={pending}
									>
										{tc("cancel")}
									</Button>
									<Button
										variant="destructive"
										size="sm"
										disabled={
											pending || !exported || confirm.trim() !== orgSlug
										}
										onClick={() =>
											start(async () => {
												setError(null);
												const res = await withStepUp(() =>
													deleteOrganizationAction({
														confirmSlug: confirm.trim(),
														exportConfirmed: exported,
													}),
												);
												if (!res.ok) {
													setError(
														res.error === "step_up_required"
															? t("stepUp")
															: res.error === "slugMismatch"
																? t("deleteOrgSlugMismatch")
																: errorText(tc, res),
													);
													return;
												}
												toast.success(t("deleteOrgDone"));
												await authClient.signOut();
												window.location.assign("/login?grund=org-geloescht");
											})
										}
									>
										{t("deleteOrgButton")}
									</Button>
								</DialogFooter>
							</DialogContent>
						</Dialog>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
