"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	cancelSecurityChangeAction,
	decideSecurityChangeAction,
} from "@/app/actions/security-changes";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-alert";
import { errorText } from "@/components/ui/error-text";
import { ListGroup, ListRow, ListSection } from "@/components/ui/list";
import { toast } from "@/components/ui/toast";
import type { SecurityChangeKind } from "@/db/schema/enums";
import type { ChangeState } from "@/lib/security-changes/rules";

// Einstellungen > Sicherheitsänderungen (Vier-Augen, Härtung A4): offene
// Anträge zustimmen, ablehnen oder abbrechen, Erlaubnisse mit Frist, Verlauf.
// Zustimmen dürfen andere Inhaber:innen und die Geschäftsleitung (Step-up),
// abbrechen auch die anfragende Person.

export type ChangeView = {
	id: string;
	kind: SecurityChangeKind;
	summary: string;
	state: ChangeState;
	requestedByName: string | null;
	requestedByMe: boolean;
	requestedAt: string;
	applyAfter: string | null;
	permitUntil: string | null;
	decidedByName: string | null;
	decidedAt: string | null;
	decisionNote: string | null;
	appliedAt: string | null;
	mayDecide: boolean;
	mayCancel: boolean;
};

const STATE_VARIANT: Record<
	ChangeState,
	"success" | "warning" | "destructive" | "muted"
> = {
	pending: "warning",
	waiting: "warning",
	due: "warning",
	permitted: "success",
	applied: "muted",
	rejected: "muted",
	cancelled: "muted",
	expired: "muted",
};

const OPEN: readonly ChangeState[] = ["pending", "waiting", "due", "permitted"];

const OWN_ERRORS = new Set([
	"four_eyes_not_open",
	"four_eyes_self",
	"four_eyes_stale",
	"forbidden",
]);

export function SecurityChangesPanel({ changes }: { changes: ChangeView[] }) {
	const t = useTranslations("SecurityChanges");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [cancelling, setCancelling] = useState<ChangeView | null>(null);
	const fmt = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: "Europe/Berlin",
	});
	const when = (iso: string | null) => (iso ? fmt.format(new Date(iso)) : "");
	const message = (code: string) =>
		OWN_ERRORS.has(code)
			? t(`err_${code}` as "err_forbidden")
			: errorText(tc, code);

	const open = changes.filter((c) => OPEN.includes(c.state));
	const past = changes.filter((c) => !OPEN.includes(c.state));

	const cancelConfirm = useConfirm({
		title: t("cancelTitle"),
		description: cancelling?.summary ?? "",
		confirmLabel: t("cancel"),
	});

	const decide = (c: ChangeView, approve: boolean) =>
		start(async () => {
			const res = await withStepUp(() =>
				decideSecurityChangeAction({ id: c.id, approve, note: null }),
			);
			if (!res.ok) {
				if (res.error !== "step_up_required") toast.error(message(res.error));
				router.refresh();
				return;
			}
			toast.success(t(approve ? "approvedToast" : "rejectedToast"));
			router.refresh();
		});

	const cancel = (c: ChangeView) => {
		setCancelling(c);
		cancelConfirm.ask(() =>
			start(async () => {
				const res = await cancelSecurityChangeAction(c.id);
				if (!res.ok) return void toast.error(message(res.error));
				toast.success(t("cancelledToast"));
				router.refresh();
			}),
		);
	};

	const meta = (c: ChangeView) => {
		const parts = [
			t("requestedBy", {
				name: c.requestedByMe ? t("you") : (c.requestedByName ?? t("unknown")),
				when: when(c.requestedAt),
			}),
		];
		if (c.state === "waiting" && c.applyAfter)
			parts.push(
				t(
					c.kind === "sso_policy" || c.kind === "dlp_policy"
						? "waitingApply"
						: "waitingPermit",
					{ when: when(c.applyAfter) },
				),
			);
		if (c.state === "due") parts.push(t("due"));
		if (c.state === "permitted" && c.permitUntil)
			parts.push(t("permittedUntil", { when: when(c.permitUntil) }));
		if (c.decidedByName && c.decidedAt)
			parts.push(
				t("decidedBy", { name: c.decidedByName, when: when(c.decidedAt) }),
			);
		if (c.state === "applied" && c.appliedAt)
			parts.push(t("appliedAt", { when: when(c.appliedAt) }));
		return parts.join(" · ");
	};

	return (
		<ListGroup>
			<ListSection title={t("openTitle")} footer={t("lead")}>
				{open.length === 0 && <ListRow subtitle={t("openEmpty")} />}
				{open.map((c) => (
					<ListRow key={c.id}>
						<div className="flex min-w-0 flex-col gap-2 py-1">
							<div className="flex flex-wrap items-center gap-2">
								<span className="font-medium text-body sm:text-subhead">
									{c.summary}
								</span>
								<Badge variant={STATE_VARIANT[c.state]}>
									{t(`state_${c.state}`)}
								</Badge>
							</div>
							<p className="text-footnote text-muted-foreground">{meta(c)}</p>
							{c.state === "permitted" && c.requestedByMe && (
								<p className="text-footnote">{t(`where_${c.kind}`)}</p>
							)}
							<div className="flex flex-wrap gap-2">
								{c.mayDecide && c.state === "pending" && (
									<>
										<Button
											size="sm"
											disabled={pending}
											onClick={() => decide(c, true)}
										>
											{t("approve")}
										</Button>
										<Button
											size="sm"
											variant="secondary"
											disabled={pending}
											onClick={() => decide(c, false)}
										>
											{t("reject")}
										</Button>
									</>
								)}
								{c.mayCancel && (
									<Button
										size="sm"
										variant="secondary"
										className="text-destructive"
										disabled={pending}
										onClick={() => cancel(c)}
									>
										{t("cancel")}
									</Button>
								)}
							</div>
						</div>
					</ListRow>
				))}
			</ListSection>

			{past.length > 0 && (
				<ListSection title={t("historyTitle")}>
					{past.slice(0, 30).map((c) => (
						<ListRow key={c.id}>
							<div className="flex min-w-0 flex-col gap-1 py-1">
								<div className="flex flex-wrap items-center gap-2">
									<span className="text-body sm:text-subhead">{c.summary}</span>
									<Badge variant={STATE_VARIANT[c.state]}>
										{t(`state_${c.state}`)}
									</Badge>
								</div>
								<p className="text-footnote text-muted-foreground">{meta(c)}</p>
								{c.decisionNote && (
									<p className="break-words text-footnote">{c.decisionNote}</p>
								)}
							</div>
						</ListRow>
					))}
				</ListSection>
			)}
			{cancelConfirm.node}
		</ListGroup>
	);
}
