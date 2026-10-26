"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	reportEmergencyAction,
	requestPlatformAccessAction,
} from "@/app/actions/platform-access";
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
import { errorText } from "@/components/ui/error-text";
import { FormAlert } from "@/components/ui/form-alert";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
	PLATFORM_ACCESS_SCOPES,
	PLATFORM_EMERGENCY_CATEGORIES,
	type PlatformAccessScope,
	type PlatformEmergencyCategory,
} from "@/db/schema/enums";

// Admin > Zugriffe (Lockbox, Härtung A3): Zugriff bei einer Org beantragen,
// im Notfall sofort (mit Begründung, Bericht binnen 24 h) oder mit 24 h
// Wartezeit, wenn niemand freigeben kann. Antrag immer mit Step-up.

const DURATIONS = [30, 60, 120, 240, 480, 1440] as const;
type Mode = "normal" | "emergency" | "waiting";

export function RequestAccessDialog({
	orgs,
}: {
	orgs: { id: string; name: string; members: { id: string; name: string }[] }[];
}) {
	const t = useTranslations("AdminLockbox");
	const tp = useTranslations("PlatformAccess");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [orgId, setOrgId] = useState("");
	const [scope, setScope] = useState<PlatformAccessScope>("view");
	const [target, setTarget] = useState("");
	const [duration, setDuration] = useState("60");
	const [mode, setMode] = useState<Mode>("normal");
	const [category, setCategory] =
		useState<PlatformEmergencyCategory>("security_incident");
	const [reason, setReason] = useState("");
	const [error, setError] = useState<string | null>(null);
	const members = orgs.find((o) => o.id === orgId)?.members ?? [];
	const needsTarget = scope !== "view";
	const message = (code: string) => {
		if (!code.startsWith("lockbox_")) return errorText(tc, code);
		const key = `err_${code}` as "err_lockbox_reason";
		return t.has(key) ? t(key) : t("err_generic");
	};

	const submit = () =>
		start(async () => {
			const res = await withStepUp(() =>
				requestPlatformAccessAction({
					orgId,
					scope,
					targetUserId: needsTarget ? target || null : null,
					reason,
					durationMinutes: Number(duration),
					emergency: mode === "emergency" ? category : null,
					waiting: mode === "waiting",
				}),
			);
			if (!res.ok) return void setError(message(res.error));
			setError(null);
			setOpen(false);
			setReason("");
			toast.success(t(`sent_${mode}`));
			router.refresh();
		});

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button>{t("request")}</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("requestTitle")}</DialogTitle>
					<DialogDescription>{t("requestLead")}</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="lb-org">{t("org")}</Label>
						<Select
							value={orgId}
							onValueChange={(v) => {
								setOrgId(v);
								setTarget("");
							}}
						>
							<SelectTrigger id="lb-org" className="w-full">
								<SelectValue placeholder={t("orgPlaceholder")} />
							</SelectTrigger>
							<SelectContent>
								{orgs.map((o) => (
									<SelectItem key={o.id} value={o.id}>
										{o.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="lb-scope">{t("scope")}</Label>
						<Select
							value={scope}
							onValueChange={(v) => {
								setScope(v as PlatformAccessScope);
								// Wartezeit nur fürs Zurücksetzen, Notfall nie dafür
								if (v !== "reset_access" && mode === "waiting")
									setMode("normal");
								if (v === "reset_access" && mode === "emergency")
									setMode("normal");
							}}
						>
							<SelectTrigger id="lb-scope" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{PLATFORM_ACCESS_SCOPES.map((s) => (
									<SelectItem key={s} value={s}>
										{tp(`scope_${s}`)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					{needsTarget && (
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="lb-target">{t("target")}</Label>
							<Select
								value={target}
								onValueChange={setTarget}
								disabled={!orgId}
							>
								<SelectTrigger id="lb-target" className="w-full">
									<SelectValue placeholder={t("targetPlaceholder")} />
								</SelectTrigger>
								<SelectContent>
									{members.map((m) => (
										<SelectItem key={m.id} value={m.id}>
											{m.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="lb-mode">{t("mode")}</Label>
						<Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
							<SelectTrigger id="lb-mode" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="normal">{t("mode_normal")}</SelectItem>
								{scope !== "reset_access" && (
									<SelectItem value="emergency">
										{t("mode_emergency")}
									</SelectItem>
								)}
								{scope === "reset_access" && (
									<SelectItem value="waiting">{t("mode_waiting")}</SelectItem>
								)}
							</SelectContent>
						</Select>
						<p className="text-footnote text-muted-foreground">
							{t(`modeHint_${mode}`)}
						</p>
					</div>
					{mode === "emergency" && (
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="lb-cat">{t("category")}</Label>
							<Select
								value={category}
								onValueChange={(v) =>
									setCategory(v as PlatformEmergencyCategory)
								}
							>
								<SelectTrigger id="lb-cat" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{PLATFORM_EMERGENCY_CATEGORIES.map((c) => (
										<SelectItem key={c} value={c}>
											{tp(`emergency_${c}`)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="lb-duration">{t("duration")}</Label>
						<Select value={duration} onValueChange={setDuration}>
							<SelectTrigger id="lb-duration" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{DURATIONS.filter((d) => mode !== "emergency" || d <= 240).map(
									(d) => (
										<SelectItem key={d} value={String(d)}>
											{t("minutes", { minutes: d })}
										</SelectItem>
									),
								)}
							</SelectContent>
						</Select>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="lb-reason">{t("reason")}</Label>
						<Textarea
							id="lb-reason"
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							placeholder={t("reasonPlaceholder")}
							rows={3}
						/>
					</div>
					<FormAlert message={error} />
				</div>
				<DialogFooter>
					<Button variant="secondary" onClick={() => setOpen(false)}>
						{tc("cancel")}
					</Button>
					<Button
						variant={mode === "emergency" ? "destructive" : "default"}
						disabled={pending || !orgId || (needsTarget && !target)}
						onClick={submit}
					>
						{t(`submit_${mode}`)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function EmergencyReportForm({ id }: { id: string }) {
	const t = useTranslations("AdminLockbox");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [report, setReport] = useState("");
	const [error, setError] = useState<string | null>(null);
	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={`report-${id}`}>{t("report")}</Label>
			<Textarea
				id={`report-${id}`}
				value={report}
				onChange={(e) => setReport(e.target.value)}
				placeholder={t("reportPlaceholder")}
				rows={3}
			/>
			<FormAlert message={error} />
			<div>
				<Button
					size="sm"
					disabled={pending || report.trim().length < 20}
					onClick={() =>
						start(async () => {
							const res = await reportEmergencyAction({ id, report });
							if (!res.ok) return void setError(errorText(tc, res.error));
							setError(null);
							toast.success(t("reportSent"));
							router.refresh();
						})
					}
				>
					{t("reportSend")}
				</Button>
			</div>
		</div>
	);
}
