"use client";

import { useTranslations } from "next-intl";
import { ExportLink } from "@/components/entity/export-link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ListGroup, ListRow, ListSection } from "@/components/ui/list";
import { MiddleEllipsis } from "@/components/ui/middle-ellipsis";
import { cn } from "@/lib/utils";

// Einstellungen > Verlauf (Härtung V): die Prüfsummen-Kette der Org und ihre
// Anker in Bitcoin (OpenTimestamps). Prüfen ohne Klick über den Download mit
// pruefen.mjs. Sehen dürfen alle Mitglieder und Prüfer:innen.

export type LedgerAnchorView = {
	id: string;
	createdAt: string;
	status: "pending" | "confirmed" | "failed";
	reason: string;
	count: number;
	head: string;
	root: string;
	bitcoinHeight: number | null;
	bitcoinMerkleRoot: string | null;
};

const VARIANT = {
	pending: "warning",
	confirmed: "success",
	failed: "destructive",
} as const;

export function LedgerPanel({
	entries,
	lastEntryAt,
	anchors,
	canExport,
}: {
	entries: number;
	lastEntryAt: string | null;
	anchors: LedgerAnchorView[];
	canExport: boolean;
}) {
	const t = useTranslations("Ledger");
	const fmt = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: "Europe/Berlin",
	});
	const num = new Intl.NumberFormat("de-DE");
	const when = (iso: string | null) => (iso ? fmt.format(new Date(iso)) : "–");
	const [last, ...earlier] = anchors;
	const statusText = (a: LedgerAnchorView) =>
		a.status === "confirmed" && a.bitcoinHeight !== null
			? t("confirmedIn", { height: num.format(a.bitcoinHeight) })
			: t(`status_${a.status}`);

	return (
		<ListGroup>
			<ListSection title={t("chainTitle")} footer={t("lead")}>
				<ListRow title={t("entries")} value={num.format(entries)} />
				<ListRow title={t("lastEntry")} value={when(lastEntryAt)} />
			</ListSection>

			<ListSection title={t("lastAnchorTitle")} footer={t("anchorFooter")}>
				{!last && <ListRow subtitle={t("noAnchor")} />}
				{last && (
					<>
						<ListRow title={t("anchoredAt")} value={when(last.createdAt)} />
						<ListRow
							title={t("state")}
							accessory={
								<Badge variant={VARIANT[last.status]}>{statusText(last)}</Badge>
							}
						/>
						<ListRow
							title={t("head")}
							subtitle={t("headHint", { count: num.format(last.count) })}
							value={<MiddleEllipsis value={last.head} tail={8} />}
						/>
						<ListRow
							title={t("root")}
							value={<MiddleEllipsis value={last.root} tail={8} />}
						/>
						{last.bitcoinMerkleRoot && (
							<ListRow
								title={t("blockRoot")}
								value={
									<MiddleEllipsis value={last.bitcoinMerkleRoot} tail={8} />
								}
							/>
						)}
					</>
				)}
			</ListSection>

			{earlier.length > 0 && (
				<ListSection title={t("earlierTitle")}>
					{earlier.slice(0, 10).map((a) => (
						<ListRow
							key={a.id}
							title={when(a.createdAt)}
							subtitle={t(`reason_${a.reason}` as "reason_daily")}
							accessory={
								<Badge variant={VARIANT[a.status]}>{statusText(a)}</Badge>
							}
						/>
					))}
				</ListSection>
			)}

			<ListSection title={t("verifyTitle")} footer={t("verifyFooter")}>
				<ListRow>
					<div className="flex flex-col gap-3 py-1 sm:flex-row sm:items-center sm:justify-between">
						<p className="text-footnote text-muted-foreground">
							{t("verifyLead")}
						</p>
						{canExport && (
							<ExportLink
								href="/api/export/verlauf.zip"
								className={cn(
									buttonVariants({ variant: "secondary", size: "sm" }),
									"shrink-0",
								)}
							>
								{t("download")}
							</ExportLink>
						)}
					</div>
				</ListRow>
			</ListSection>
		</ListGroup>
	);
}
