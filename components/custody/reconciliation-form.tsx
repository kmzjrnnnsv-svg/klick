"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	reviewReconciliation,
	saveReconciliation,
} from "@/app/actions/custody";
import {
	EditTrigger,
	Field,
	FormDialog,
} from "@/components/organisation/governance-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ReconciliationLine } from "@/db/schema/custody";
import { isDecimal } from "@/lib/custody/decimal";
import { reconcile } from "@/lib/custody/reconcile";

type Line = Omit<ReconciliationLine, "walletId">;

const blank = (symbol = ""): Line => ({
	symbol,
	onChain: "",
	ledger: "",
	tolerance: "0",
});

// Tägliche Abstimmung erfassen: je Kryptowert Bestand on-chain und laut
// Kundenbuch; die Differenz rechnet die Seite sofort (gleiche Logik wie der
// Server). Vorbelegt mit den Kryptowerten des letzten Stichtags bzw. der
// Kundenwallets.
export function ReconciliationForm({
	defaultDay,
	symbols,
	canEdit,
}: {
	defaultDay: string;
	symbols: string[];
	canEdit: boolean;
}) {
	const t = useTranslations("Custody");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [day, setDay] = useState(defaultDay);
	const [lines, setLines] = useState<Line[]>(
		symbols.length > 0 ? symbols.map((s) => blank(s)) : [blank()],
	);
	const [explanation, setExplanation] = useState("");
	const complete = lines.every(
		(l) =>
			l.symbol.trim() &&
			isDecimal(l.onChain) &&
			isDecimal(l.ledger) &&
			isDecimal(l.tolerance || "0"),
	);
	const preview = complete
		? reconcile(lines.map((l) => ({ ...l, walletId: null })))
		: null;
	const update = (i: number, patch: Partial<Line>) =>
		setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

	return (
		<form
			className="flex flex-col gap-4 rounded-md border p-4"
			onSubmit={(e) => {
				e.preventDefault();
				start(async () => {
					const res = await saveReconciliation({
						day,
						lines: lines.map((l) => ({ ...l, walletId: null })),
						explanation,
					});
					if (!res.ok) {
						const first = Object.values(res.fieldErrors ?? {})[0]?.[0];
						toast.error(
							res.error === "already_reviewed"
								? t("errorReviewed")
								: res.error === "future_day"
									? t("errorFutureDay")
									: (first ?? tc("error")),
						);
						return;
					}
					if (res.data.shortfall) toast.error(t("savedShortfall"));
					else if (res.data.status === "difference")
						toast.warning(t("savedDifference"));
					else toast.success(t("savedMatched"));
					router.refresh();
				});
			}}
		>
			<fieldset disabled={!canEdit || pending} className="contents">
				<div className="flex flex-col gap-1.5 sm:w-48">
					<Label htmlFor="rc-day">{t("day")}</Label>
					<Input
						id="rc-day"
						type="date"
						value={day}
						onChange={(e) => setDay(e.target.value)}
						required
					/>
				</div>
				<div className="flex flex-col gap-2">
					<div className="hidden grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)_7rem_7rem_2.25rem] gap-2 text-muted-foreground text-xs sm:grid">
						<span>{t("symbol")}</span>
						<span>{t("onChain")}</span>
						<span>{t("ledger")}</span>
						<span>{t("tolerance")}</span>
						<span className="text-right">{t("difference")}</span>
						<span />
					</div>
					{lines.map((l, i) => {
						const r = preview?.symbols.find(
							(s) => s.symbol === l.symbol.trim().toUpperCase(),
						);
						return (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: Zeilen ohne eigene ID, Reihenfolge stabil
								key={i}
								className="grid grid-cols-2 gap-2 rounded-md border p-2 sm:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)_7rem_7rem_2.25rem] sm:items-center sm:border-0 sm:p-0"
							>
								<Input
									aria-label={t("symbol")}
									value={l.symbol}
									onChange={(e) =>
										update(i, { symbol: e.target.value.toUpperCase() })
									}
									placeholder="BTC"
									autoComplete="off"
									spellCheck={false}
									translate="no"
								/>
								<Input
									aria-label={t("onChain")}
									inputMode="decimal"
									value={l.onChain}
									onChange={(e) => update(i, { onChain: e.target.value })}
									placeholder="0,0"
									autoComplete="off"
									className="tabular-nums"
								/>
								<Input
									aria-label={t("ledger")}
									inputMode="decimal"
									value={l.ledger}
									onChange={(e) => update(i, { ledger: e.target.value })}
									placeholder="0,0"
									autoComplete="off"
									className="tabular-nums"
								/>
								<Input
									aria-label={t("tolerance")}
									inputMode="decimal"
									value={l.tolerance}
									onChange={(e) => update(i, { tolerance: e.target.value })}
									autoComplete="off"
									className="tabular-nums"
								/>
								<span
									className={`text-right text-sm tabular-nums ${
										r?.state === "shortfall"
											? "font-medium text-destructive"
											: r?.state === "surplus"
												? "text-brown"
												: "text-muted-foreground"
									}`}
								>
									{r ? r.difference : "—"}
								</span>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									aria-label={t("removeLine")}
									disabled={lines.length === 1}
									onClick={() => setLines(lines.filter((_, j) => j !== i))}
								>
									<X className="size-4" aria-hidden="true" />
								</Button>
							</div>
						);
					})}
					<div>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => setLines([...lines, blank()])}
						>
							<Plus aria-hidden="true" />
							{t("addLine")}
						</Button>
					</div>
				</div>
				<p aria-live="polite" className="text-sm">
					{preview
						? preview.shortfall
							? t("previewShortfall")
							: preview.status === "difference"
								? t("previewDifference")
								: t("previewMatched")
						: t("previewIncomplete")}
				</p>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="rc-explanation">{t("explanation")}</Label>
					<Textarea
						id="rc-explanation"
						rows={2}
						value={explanation}
						onChange={(e) => setExplanation(e.target.value)}
						placeholder={t("explanationPlaceholder")}
					/>
				</div>
				{canEdit && (
					<div>
						<Button type="submit" disabled={pending || !complete}>
							{pending ? t("saving") : t("saveReconciliation")}
						</Button>
					</div>
				)}
			</fieldset>
		</form>
	);
}

export function ReviewReconciliationButton({
	id,
	day,
	needsExplanation,
	explanation: initial,
}: {
	id: string;
	day: string;
	needsExplanation: boolean;
	explanation: string | null;
}) {
	const t = useTranslations("Custody");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [explanation, setExplanation] = useState(initial ?? "");
	return (
		<FormDialog
			title={t("reviewTitle", { day })}
			lead={needsExplanation ? t("reviewLeadDifference") : t("reviewLead")}
			trigger={<EditTrigger label={t("review")} />}
			open={open}
			setOpen={setOpen}
			pending={pending}
			disabled={needsExplanation && explanation.trim().length < 5}
			onSubmit={() =>
				start(async () => {
					const res = await reviewReconciliation({ id, explanation });
					if (!res.ok) {
						toast.error(
							res.error === "four_eyes"
								? t("errorFourEyes")
								: res.error === "explanation_required"
									? t("errorExplanation")
									: tc("error"),
						);
						return;
					}
					toast.success(t("reviewed"));
					setOpen(false);
					router.refresh();
				})
			}
		>
			<Field
				id={`rv-expl-${id}`}
				label={t("explanation")}
				rows={3}
				value={explanation}
				onChange={setExplanation}
			/>
		</FormDialog>
	);
}
