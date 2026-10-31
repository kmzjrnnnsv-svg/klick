"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	publishAnnouncementAction,
	withdrawAnnouncementAction,
} from "@/app/actions/announcements-admin";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/components/ui/confirm-alert";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

type Kind = "info" | "maintenance" | "incident";
export type Template = { key: string; kind: Kind; title: string; body: string };

/** Lokale Zeit fürs Feld datetime-local (ohne Sekunden). */
function localInput(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Admin > Mitteilungen: neue Mitteilung mit Vorlage, Zeitraum und Ziel.
// Ein Sicherheitsvorfall verlangt eine Rückfrage, weil sofort Mails rausgehen.
export function AnnouncementDialog({
	orgs,
	templates,
}: {
	orgs: readonly { id: string; name: string }[];
	templates: readonly Template[];
}) {
	const t = useTranslations("AdminAnnouncements");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const empty = () => ({
		kind: "info" as Kind,
		title: "",
		body: "",
		startsAt: localInput(new Date()),
		endsAt: "",
		all: true,
		orgIds: [] as string[],
	});
	const [f, setF] = useState(empty);
	const set = (patch: Partial<ReturnType<typeof empty>>) =>
		setF((x) => ({ ...x, ...patch }));
	const confirmIncident = useConfirm({
		title: t("confirmIncidentTitle"),
		description: t("confirmIncidentDescription"),
		confirmLabel: t("publish"),
	});

	const submit = () =>
		start(async () => {
			setError(null);
			const res = await withStepUp(() =>
				publishAnnouncementAction({
					kind: f.kind,
					title: f.title,
					body: f.body,
					startsAt: new Date(f.startsAt).toISOString(),
					endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : null,
					orgIds: f.all ? null : f.orgIds,
				}),
			);
			if (!res.ok) {
				const code = res.error;
				setError(
					code === "ends_before_start" ||
						code === "too_long" ||
						code === "no_orgs"
						? t(`err_${code}`)
						: errorText(tc, res),
				);
				return;
			}
			toast.success(
				f.kind === "incident"
					? t("publishedIncident", {
							orgs: res.data.orgs,
							notified: res.data.notified,
						})
					: t("published", { orgs: res.data.orgs }),
			);
			setOpen(false);
			setF(empty());
			router.refresh();
		});

	const valid =
		f.title.trim().length >= 3 &&
		f.body.trim().length >= 10 &&
		f.startsAt &&
		(f.all || f.orgIds.length > 0);

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				setError(null);
			}}
		>
			<DialogTrigger asChild>
				<Button>{t("new")}</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>{t("newTitle")}</DialogTitle>
					<DialogDescription>{t("newLead")}</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						if (f.kind === "incident") confirmIncident.ask(submit);
						else submit();
					}}
				>
					<fieldset className="flex flex-col gap-2">
						<legend className="mb-1 font-medium text-subhead">
							{t("templates")}
						</legend>
						<div className="flex flex-wrap gap-2">
							{templates.map((tpl) => (
								<Button
									key={tpl.key}
									type="button"
									size="sm"
									variant="secondary"
									onClick={() =>
										set({ kind: tpl.kind, title: tpl.title, body: tpl.body })
									}
								>
									{t(`template_${tpl.key}` as "template_update")}
								</Button>
							))}
						</div>
					</fieldset>
					<fieldset className="flex flex-col gap-2">
						<legend className="mb-1 font-medium text-subhead">
							{t("kind")}
						</legend>
						<div className="flex flex-wrap gap-2" role="radiogroup">
							{(["info", "maintenance", "incident"] as const).map((k) => (
								<Button
									key={k}
									type="button"
									size="sm"
									role="radio"
									aria-checked={f.kind === k}
									variant={f.kind === k ? "default" : "secondary"}
									onClick={() => set({ kind: k })}
								>
									{t(`kind_${k}`)}
								</Button>
							))}
						</div>
					</fieldset>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="ann-title">{t("title")}</Label>
						<Input
							id="ann-title"
							required
							maxLength={140}
							autoComplete="off"
							value={f.title}
							placeholder={t("titlePlaceholder")}
							onChange={(e) => set({ title: e.target.value })}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="ann-body">{t("body")}</Label>
						<Textarea
							id="ann-body"
							required
							rows={5}
							maxLength={4000}
							value={f.body}
							placeholder={t("bodyPlaceholder")}
							onChange={(e) => set({ body: e.target.value })}
						/>
					</div>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="ann-start">{t("startsAt")}</Label>
							<Input
								id="ann-start"
								type="datetime-local"
								required
								value={f.startsAt}
								onChange={(e) => set({ startsAt: e.target.value })}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="ann-end">{t("endsAt")}</Label>
							<Input
								id="ann-end"
								type="datetime-local"
								value={f.endsAt}
								onChange={(e) => set({ endsAt: e.target.value })}
							/>
						</div>
					</div>
					<p className="-mt-2 text-footnote text-muted-foreground">
						{t("endsHint")}
					</p>
					<fieldset className="flex flex-col gap-2">
						<legend className="mb-1 font-medium text-subhead">
							{t("target")}
						</legend>
						<div className="flex flex-wrap gap-2" role="radiogroup">
							<Button
								type="button"
								size="sm"
								role="radio"
								aria-checked={f.all}
								variant={f.all ? "default" : "secondary"}
								onClick={() => set({ all: true })}
							>
								{t("targetAll")}
							</Button>
							<Button
								type="button"
								size="sm"
								role="radio"
								aria-checked={!f.all}
								variant={!f.all ? "default" : "secondary"}
								onClick={() => set({ all: false })}
							>
								{t("targetSome")}
							</Button>
						</div>
						{!f.all && (
							<>
								<ul className="max-h-48 overflow-y-auto overscroll-contain rounded-xl bg-muted/50 p-2">
									{orgs.map((o) => (
										<li key={o.id}>
											<label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-muted">
												<Checkbox
													checked={f.orgIds.includes(o.id)}
													onCheckedChange={(c) =>
														set({
															orgIds: c
																? [...f.orgIds, o.id]
																: f.orgIds.filter((x) => x !== o.id),
														})
													}
												/>
												<span className="min-w-0 truncate">{o.name}</span>
											</label>
										</li>
									))}
								</ul>
								<p className="text-footnote text-muted-foreground tabular-nums">
									{t("orgsSelected", { n: f.orgIds.length })}
								</p>
							</>
						)}
					</fieldset>
					<FormAlert message={error} />
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpen(false)}
						>
							{tc("cancel")}
						</Button>
						<Button type="submit" disabled={pending || !valid}>
							{pending ? t("publishing") : t("publish")}
						</Button>
					</DialogFooter>
				</form>
				{confirmIncident.node}
			</DialogContent>
		</Dialog>
	);
}

export function WithdrawAnnouncementButton({ id }: { id: string }) {
	const t = useTranslations("AdminAnnouncements");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const confirm = useConfirm({
		title: t("withdrawTitle"),
		description: t("withdrawDescription"),
		confirmLabel: t("withdraw"),
	});
	return (
		<>
			<Button
				size="sm"
				variant="ghost"
				className="text-destructive"
				disabled={pending}
				onClick={() =>
					confirm.ask(() =>
						start(async () => {
							const res = await withdrawAnnouncementAction(id);
							if (!res.ok) return void toast.error(errorText(tc, res));
							toast.success(t("withdrawn"));
							router.refresh();
						}),
					)
				}
			>
				{t("withdraw")}
			</Button>
			{confirm.node}
		</>
	);
}
