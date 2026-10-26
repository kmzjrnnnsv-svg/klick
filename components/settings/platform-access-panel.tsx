"use client";

import { CircleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	decidePlatformAccessAction,
	revokePlatformAccessAction,
} from "@/app/actions/platform-access";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-alert";
import { errorText } from "@/components/ui/error-text";
import { ListGroup, ListRow, ListSection } from "@/components/ui/list";
import { toast } from "@/components/ui/toast";
import type {
	PlatformAccessScope,
	PlatformEmergencyCategory,
} from "@/db/schema/enums";
import type { GrantState } from "@/lib/platform-access/rules";

// Einstellungen > Zugriffe durch Klick (Lockbox, Härtung A3): Anträge des
// Plattform-Betriebs freigeben oder ablehnen, laufende Zugriffe beenden,
// Verlauf mit Notfall-Berichten. Entscheiden: Inhaber:innen und
// Geschäftsleitung (Step-up); beenden auch die betroffene Person.

export type GrantView = {
	id: string;
	scope: PlatformAccessScope;
	state: GrantState;
	reason: string;
	durationMinutes: number;
	targetName: string | null;
	targetIsMe: boolean;
	requestedByName: string | null;
	requestedAt: string;
	applyAfter: string | null;
	expiresAt: string | null;
	emergencyCategory: PlatformEmergencyCategory | null;
	decidedByName: string | null;
	decidedAt: string | null;
	usedAt: string | null;
	report: string | null;
	reportOverdue: boolean;
};

const STATE_VARIANT: Record<
	GrantState,
	"default" | "success" | "warning" | "destructive" | "muted"
> = {
	requested: "warning",
	waiting: "warning",
	active: "success",
	expired: "muted",
	denied: "muted",
	cancelled: "muted",
	revoked: "muted",
};

const LOCKBOX_ERRORS = new Set([
	"lockbox_not_open",
	"lockbox_forbidden",
	"lockbox_self",
]);

export function PlatformAccessPanel({
	grants,
	mayDecide,
}: {
	grants: GrantView[];
	mayDecide: boolean;
}) {
	const t = useTranslations("PlatformAccess");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [ending, setEnding] = useState<GrantView | null>(null);
	const fmt = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: "Europe/Berlin",
	});
	const when = (iso: string | null) => (iso ? fmt.format(new Date(iso)) : "");
	const message = (code: string) =>
		LOCKBOX_ERRORS.has(code)
			? t(`err_${code}` as "err_lockbox_self")
			: errorText(tc, code);

	const open = grants.filter(
		(g) => g.state === "requested" || g.state === "waiting",
	);
	const active = grants.filter((g) => g.state === "active");
	const past = grants.filter((g) => !open.includes(g) && !active.includes(g));
	const emergencies = active.filter((g) => g.emergencyCategory);
	const overdue = grants.filter((g) => g.reportOverdue);

	const endConfirm = useConfirm({
		title: t(ending?.state === "active" ? "endTitle" : "cancelTitle"),
		description: t("endLead"),
		confirmLabel: t(ending?.state === "active" ? "end" : "cancel"),
	});

	const decide = (g: GrantView, approve: boolean) =>
		start(async () => {
			const res = await withStepUp(() =>
				decidePlatformAccessAction({ id: g.id, approve, note: null }),
			);
			if (!res.ok) return void toast.error(message(res.error));
			toast.success(t(approve ? "approvedToast" : "deniedToast"));
			router.refresh();
		});

	const end = (g: GrantView) => {
		setEnding(g);
		endConfirm.ask(() =>
			start(async () => {
				const res = await revokePlatformAccessAction(g.id);
				if (!res.ok) return void toast.error(message(res.error));
				toast.success(t("endedToast"));
				router.refresh();
			}),
		);
	};

	const title = (g: GrantView) =>
		g.targetName
			? t("rowTitle", { scope: t(`scope_${g.scope}`), name: g.targetName })
			: t(`scope_${g.scope}`);

	const meta = (g: GrantView) => {
		const parts = [
			t("requestedBy", {
				name: g.requestedByName ?? t("support"),
				when: when(g.requestedAt),
			}),
		];
		if (g.emergencyCategory) parts.push(t(`emergency_${g.emergencyCategory}`));
		if (g.state === "waiting" && g.applyAfter)
			parts.push(t("waitingUntil", { when: when(g.applyAfter) }));
		if (g.state === "requested")
			parts.push(t("duration", { minutes: g.durationMinutes }));
		if (g.state === "active" && g.expiresAt)
			parts.push(t("activeUntil", { when: when(g.expiresAt) }));
		if (g.decidedByName && g.decidedAt)
			parts.push(
				t("decidedBy", { name: g.decidedByName, when: when(g.decidedAt) }),
			);
		if (g.usedAt) parts.push(t("usedAt", { when: when(g.usedAt) }));
		return parts.join(" · ");
	};

	return (
		<ListGroup>
			{(emergencies.length > 0 || overdue.length > 0) && (
				<Alert variant="destructive">
					<CircleAlert aria-hidden="true" />
					<AlertTitle>
						{emergencies.length > 0 ? t("emergencyTitle") : t("overdueTitle")}
					</AlertTitle>
					<AlertDescription>
						{emergencies.length > 0
							? t("emergencyLead", {
									when: when(emergencies[0]?.expiresAt ?? null),
								})
							: t("overdueLead")}
					</AlertDescription>
				</Alert>
			)}

			<ListSection title={t("openTitle")} footer={t("lead")}>
				{open.length === 0 && <ListRow subtitle={t("openEmpty")} />}
				{open.map((g) => (
					<ListRow key={g.id}>
						<div className="flex min-w-0 flex-col gap-2 py-1">
							<div className="flex flex-wrap items-center gap-2">
								<span className="font-medium text-body sm:text-subhead">
									{title(g)}
								</span>
								<Badge variant={STATE_VARIANT[g.state]}>
									{t(`state_${g.state}`)}
								</Badge>
							</div>
							<p className="break-words text-subhead">{g.reason}</p>
							<p className="text-footnote text-muted-foreground">{meta(g)}</p>
							<div className="flex flex-wrap gap-2">
								{mayDecide && g.state === "requested" && (
									<>
										<Button
											size="sm"
											disabled={pending}
											onClick={() => decide(g, true)}
										>
											{t("approve")}
										</Button>
										<Button
											size="sm"
											variant="secondary"
											disabled={pending}
											onClick={() => decide(g, false)}
										>
											{t("deny")}
										</Button>
									</>
								)}
								{(mayDecide || g.targetIsMe) && g.state === "waiting" && (
									<Button
										size="sm"
										variant="secondary"
										disabled={pending}
										onClick={() => end(g)}
									>
										{t("cancel")}
									</Button>
								)}
							</div>
						</div>
					</ListRow>
				))}
			</ListSection>

			<ListSection title={t("activeTitle")}>
				{active.length === 0 && <ListRow subtitle={t("activeEmpty")} />}
				{active.map((g) => (
					<ListRow key={g.id}>
						<div className="flex min-w-0 flex-col gap-2 py-1">
							<div className="flex flex-wrap items-center gap-2">
								<span className="font-medium text-body sm:text-subhead">
									{title(g)}
								</span>
								<Badge
									variant={g.emergencyCategory ? "destructive" : "success"}
								>
									{g.emergencyCategory ? t("emergency") : t("state_active")}
								</Badge>
							</div>
							<p className="break-words text-subhead">{g.reason}</p>
							<p className="text-footnote text-muted-foreground">{meta(g)}</p>
							{(mayDecide || g.targetIsMe) && (
								<div>
									<Button
										size="sm"
										variant="secondary"
										className="text-destructive"
										disabled={pending}
										onClick={() => end(g)}
									>
										{t("end")}
									</Button>
								</div>
							)}
						</div>
					</ListRow>
				))}
			</ListSection>

			{past.length > 0 && (
				<ListSection title={t("historyTitle")} footer={t("historyFooter")}>
					{past.slice(0, 30).map((g) => (
						<ListRow key={g.id}>
							<div className="flex min-w-0 flex-col gap-1 py-1">
								<div className="flex flex-wrap items-center gap-2">
									<span className="text-body sm:text-subhead">{title(g)}</span>
									<Badge variant={STATE_VARIANT[g.state]}>
										{t(`state_${g.state}`)}
									</Badge>
									{g.reportOverdue && (
										<Badge variant="destructive">{t("reportOverdue")}</Badge>
									)}
								</div>
								<p className="break-words text-footnote text-muted-foreground">
									{g.reason}
								</p>
								<p className="text-footnote text-muted-foreground">{meta(g)}</p>
								{g.report && (
									<p className="whitespace-pre-line break-words rounded-xl bg-muted/50 p-3 text-footnote">
										<span className="font-medium">{t("report")}: </span>
										{g.report}
									</p>
								)}
							</div>
						</ListRow>
					))}
				</ListSection>
			)}
			{endConfirm.node}
		</ListGroup>
	);
}
