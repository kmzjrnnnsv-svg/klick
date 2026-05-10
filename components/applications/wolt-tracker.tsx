import {
	Archive,
	Check,
	ClipboardCheck,
	Eye,
	FileText,
	Handshake,
	MessageCircle,
	Star,
	XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

// Wolt/Lieferando-Style-Tracker: horizontale Schritt-Leiste mit Icons,
// jedes Step kann "done", "active", "upcoming" oder "skipped" sein.
// Aktiver Step pulsiert, vergangene haben Häkchen.
//
// Reihenfolge folgt dem natürlichen Funnel.

type Step = {
	key: string;
	icon: LucideIcon;
};

const STEPS: Step[] = [
	{ key: "submitted", icon: FileText },
	{ key: "seen", icon: Eye },
	{ key: "in_review", icon: ClipboardCheck },
	{ key: "shortlisted", icon: Star },
	{ key: "interview", icon: MessageCircle },
	{ key: "offer", icon: Handshake },
];

const TERMINAL_NEGATIVE = ["declined", "withdrawn", "archived"];
const STEP_INDEX: Record<string, number> = STEPS.reduce(
	(acc, s, i) => {
		acc[s.key] = i;
		return acc;
	},
	{} as Record<string, number>,
);

function statusToStepIndex(status: string): number {
	if (status in STEP_INDEX) return STEP_INDEX[status];
	// "accepted" → ganz rechts (alle done)
	if (status === "accepted") return STEPS.length;
	return -1;
}

export function WoltTracker({
	status,
	enteredAt,
}: {
	status: string;
	enteredAt: Date | null;
}) {
	const t = useTranslations("Applications.tracker");
	const isNegative = TERMINAL_NEGATIVE.includes(status);
	const idx = statusToStepIndex(status);
	const daysInStatus = enteredAt
		? Math.floor((Date.now() - enteredAt.getTime()) / 86400_000)
		: 0;

	if (isNegative) {
		const Icon = status === "withdrawn" ? Archive : XCircle;
		return (
			<div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4 sm:p-6">
				<div className="flex items-center gap-3">
					<span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/15 text-rose-700 dark:text-rose-300">
						<Icon className="h-5 w-5" strokeWidth={1.5} />
					</span>
					<div>
						<p className="font-medium text-sm">
							{t(`negative.${status}.title`)}
						</p>
						<p className="text-muted-foreground text-xs">
							{t(`negative.${status}.body`)}
						</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="rounded-lg border border-border bg-background p-4 sm:p-6">
			<div className="flex items-center justify-between gap-3">
				<div>
					<p className="lv-eyebrow text-[0.55rem] text-primary">
						{t("eyebrow")}
					</p>
					<p className="mt-1 font-medium text-sm">
						{t(`status.${status}.label`)}
					</p>
					<p className="mt-0.5 text-muted-foreground text-xs">
						{t(`status.${status}.hint`)}
					</p>
				</div>
				{enteredAt && (
					<p className="font-mono text-[10px] text-muted-foreground">
						{daysInStatus === 0
							? t("today")
							: t("daysInStep", { days: daysInStatus })}
					</p>
				)}
			</div>

			{/* Stepper */}
			<ol className="mt-5 flex items-center">
				{STEPS.map((s, i) => {
					const Icon = s.icon;
					const done = i < idx;
					const active = i === idx;
					return (
						<li key={s.key} className="flex flex-1 items-center last:flex-none">
							<div className="flex flex-col items-center gap-1.5">
								<span
									className={`relative inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
										done
											? "border-emerald-500 bg-emerald-500 text-emerald-50"
											: active
												? "border-primary bg-primary text-primary-foreground"
												: "border-border bg-muted text-muted-foreground"
									}`}
								>
									{done ? (
										<Check className="h-4 w-4" strokeWidth={2} />
									) : (
										<Icon className="h-4 w-4" strokeWidth={1.5} />
									)}
									{active && (
										<span className="-inset-1 absolute animate-ping rounded-full border-2 border-primary opacity-40" />
									)}
								</span>
								<span
									className={`text-center font-mono text-[9px] leading-tight ${
										active
											? "text-foreground"
											: done
												? "text-emerald-700 dark:text-emerald-300"
												: "text-muted-foreground"
									}`}
								>
									{t(`step.${s.key}`)}
								</span>
							</div>
							{i < STEPS.length - 1 && (
								<div
									className={`mx-1 h-px flex-1 ${
										done ? "bg-emerald-500/60" : "bg-border"
									}`}
								/>
							)}
						</li>
					);
				})}
			</ol>
		</div>
	);
}

// Kompakte Variante für die Listen-Card.
export function WoltTrackerMini({ status }: { status: string }) {
	const t = useTranslations("Applications.tracker");
	const isNegative = TERMINAL_NEGATIVE.includes(status);
	const idx = statusToStepIndex(status);

	if (isNegative) {
		return (
			<div className="flex items-center gap-2 text-muted-foreground text-xs">
				<XCircle className="h-3.5 w-3.5" strokeWidth={1.5} />
				<span>{t(`negative.${status}.short`)}</span>
			</div>
		);
	}

	return (
		<div className="flex items-center gap-1">
			{STEPS.map((s, i) => {
				const done = i < idx;
				const active = i === idx;
				return (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: fixed stepper
						key={s.key}
						className={`block h-1.5 flex-1 rounded-full ${
							done
								? "bg-emerald-500"
								: active
									? "bg-primary"
									: "bg-muted"
						}`}
					/>
				);
			})}
		</div>
	);
}
