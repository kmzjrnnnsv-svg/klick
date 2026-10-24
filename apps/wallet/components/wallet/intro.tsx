"use client";

import {
	advanceWalletIntro,
	deferWalletIntro,
	saveWatchlist,
} from "@wallet/app/actions/wallet";
import { ChangeBadge } from "@wallet/components/wallet/change-badge";
import { Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Pair } from "@/lib/wallet/core/feeds";
import type { IntroStep } from "@/lib/wallet/intro";

type Result = { ok: boolean; error?: string };

// Gemeinsamer Ablauf: Aktion(en) → nächste Seite. Ist der Bereich
// inzwischen gesperrt, lädt die Seite neu — der Guard führt zum Entsperren.
function useIntroRunner() {
	const t = useTranslations("WalletIntro");
	const router = useRouter();
	const [pending, start] = useTransition();
	const run = (
		steps: (() => Promise<Result>)[],
		href: string,
		message?: string,
	) =>
		start(async () => {
			for (const fn of steps) {
				const res = await fn();
				if (res.ok) continue;
				if (res.error === "wallet_locked") router.refresh();
				else toast.error(t("error"));
				return;
			}
			if (message) toast(message);
			router.push(href);
		});
	return { pending, run };
}

// Fußleiste: zurück, „Später“ und der Hauptknopf (außer bei Schritten mit
// eigenem Formular)
export function IntroFooter({
	step,
	prevHref,
	nextHref,
	primary,
}: {
	step: IntroStep;
	prevHref: string | null;
	nextHref: string;
	primary: "next" | "finish" | null;
}) {
	const t = useTranslations("WalletIntro");
	const { pending, run } = useIntroRunner();
	return (
		<div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-t pt-5">
			{prevHref ? (
				<Link
					href={prevHref}
					className="hit-area text-muted-foreground text-subhead underline-offset-4 hover:text-foreground hover:underline"
				>
					← {t("back")}
				</Link>
			) : null}
			<button
				type="button"
				disabled={pending}
				className="hit-area text-muted-foreground text-subhead underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
				onClick={() => run([() => deferWalletIntro()], "/", t("laterDone"))}
			>
				{t("later")}
			</button>
			{primary && (
				<Button
					type="button"
					className="ml-auto"
					disabled={pending}
					onClick={() => run([() => advanceWalletIntro({ step })], nextHref)}
				>
					{primary === "finish" ? t("finish") : t("next")}
				</Button>
			)}
		</div>
	);
}

export type IntroQuote = {
	pair: Pair;
	name: string;
	price: string | null; // formatiert
	changeBp: number | null;
};

// Schritt „Kurse“: Kacheln zum An- und Abwählen, speichern → weiter
export function IntroWatchlist({
	quotes,
	selected,
	nextHref,
	prevHref,
}: {
	quotes: IntroQuote[];
	selected: Pair[];
	nextHref: string;
	prevHref: string;
}) {
	const t = useTranslations("WalletIntro");
	const [picked, setPicked] = useState<Pair[]>(selected);
	const { pending, run } = useIntroRunner();
	const toggle = (p: Pair) =>
		setPicked((cur) =>
			cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p],
		);
	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				if (picked.length === 0) return void toast.error(t("quotesMin"));
				run(
					[
						() => saveWatchlist({ pairs: picked }),
						() => advanceWalletIntro({ step: "kurse" }),
					],
					nextHref,
				);
			}}
		>
			<fieldset>
				<legend className="mb-3 font-medium text-subhead">
					{t("quotesPick")}
				</legend>
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
					{quotes.map((q) => {
						const on = picked.includes(q.pair);
						return (
							<label
								key={q.pair}
								className={cn(
									"flex cursor-pointer items-center gap-3 rounded-2xl p-3 transition-[background-color,box-shadow] focus-within:ring-2 focus-within:ring-ring",
									on
										? "bg-primary/10 ring-2 ring-primary/60 dark:bg-primary/20"
										: "bg-card hover:bg-muted",
								)}
							>
								<input
									type="checkbox"
									name="pairs"
									value={q.pair}
									checked={on}
									onChange={() => toggle(q.pair)}
									className="sr-only"
								/>
								<span
									aria-hidden
									className={cn(
										"flex size-[1.375rem] shrink-0 items-center justify-center rounded-full border-2",
										on
											? "border-primary-fill bg-primary-fill text-white"
											: "border-input",
									)}
								>
									{on && <Check className="size-3.5" strokeWidth={3} />}
								</span>
								<span className="min-w-0 grow">
									<span
										className="block font-medium text-subhead"
										translate="no"
									>
										{q.pair}
									</span>
									<span className="block truncate text-muted-foreground text-footnote">
										{q.name}
									</span>
								</span>
								<span className="flex shrink-0 flex-col items-end">
									<span className="text-subhead tabular-nums" translate="no">
										{q.price ?? "—"}
									</span>
									<ChangeBadge bp={q.changeBp} />
								</span>
							</label>
						);
					})}
				</div>
			</fieldset>
			<div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-t pt-5">
				<Link
					href={prevHref}
					className="hit-area text-muted-foreground text-subhead underline-offset-4 hover:text-foreground hover:underline"
				>
					← {t("back")}
				</Link>
				<button
					type="button"
					disabled={pending}
					className="hit-area text-muted-foreground text-subhead underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
					onClick={() => run([() => deferWalletIntro()], "/", t("laterDone"))}
				>
					{t("later")}
				</button>
				<Button type="submit" className="ml-auto" disabled={pending}>
					{t("saveNext")}
				</Button>
			</div>
		</form>
	);
}
