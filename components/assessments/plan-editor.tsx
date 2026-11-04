"use client";

import { useTranslations } from "next-intl";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
	useTransition,
} from "react";
import { savePlanSettings } from "@/app/actions/assessments";
import { errorText } from "@/components/ui/error-text";
import { Input, nativeSelectCompactClass } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";

// Umsetzungsplan bearbeiten (Teil C): Beginn, wie viele Maßnahmen
// gleichzeitig und eigene Dauer je Maßnahme. Gespeichert wird 2 s nach der
// letzten Eingabe (wie im Richtlinien-Baukasten); danach rechnet die Seite
// den Plan neu.

type Settings = {
	start: string;
	capacity: number;
	overrides: Record<string, number>;
};

const Ctx = createContext<{
	overrides: Record<string, number>;
	setDuration: (code: string, days: number | null) => void;
	editable: boolean;
} | null>(null);

const SAVE_DELAY_MS = 2_000;
export const WEEK_OPTIONS = [1, 2, 3, 4, 6, 8, 12, 16] as const;

export function PlanEditor({
	assessmentId,
	initial,
	editable,
	children,
}: {
	assessmentId: string;
	initial: Settings;
	editable: boolean;
	children: React.ReactNode;
}) {
	const t = useTranslations("Assessment");
	const tc = useTranslations("Common");
	const [settings, setSettings] = useState<Settings>(initial);
	const [dirty, setDirty] = useState(false);
	const [saved, setSaved] = useState(false);
	const [pending, start] = useTransition();
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const save = useCallback(
		(next: Settings) => {
			start(async () => {
				const res = await savePlanSettings({ assessmentId, ...next });
				setDirty(false);
				if (!res.ok) return void toast.error(errorText(tc, res));
				setSaved(true);
			});
		},
		[assessmentId, tc],
	);

	const update = useCallback(
		(patch: Partial<Settings>) => {
			setSettings((prev) => {
				const next = { ...prev, ...patch };
				if (timer.current) clearTimeout(timer.current);
				timer.current = setTimeout(() => save(next), SAVE_DELAY_MS);
				return next;
			});
			setDirty(true);
			setSaved(false);
		},
		[save],
	);

	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current);
		},
		[],
	);

	const setDuration = useCallback(
		(code: string, days: number | null) => {
			const overrides = { ...settings.overrides };
			if (days === null) delete overrides[code];
			else overrides[code] = days;
			update({ overrides });
		},
		[settings.overrides, update],
	);

	return (
		<Ctx.Provider
			value={{ overrides: settings.overrides, setDuration, editable }}
		>
			{editable && (
				<div className="flex flex-wrap items-end gap-x-6 gap-y-3">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="plan-start">{t("planStart")}</Label>
						<Input
							id="plan-start"
							type="date"
							className="w-auto"
							value={settings.start}
							onChange={(e) =>
								e.target.value && update({ start: e.target.value })
							}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="plan-capacity">{t("planCapacity")}</Label>
						<select
							id="plan-capacity"
							className={nativeSelectCompactClass}
							value={settings.capacity}
							onChange={(e) => update({ capacity: Number(e.target.value) })}
						>
							{[1, 2, 3, 4, 5].map((n) => (
								<option key={n} value={n}>
									{t("planCapacityOption", { count: n })}
								</option>
							))}
						</select>
					</div>
					<p
						className="min-h-6 text-muted-foreground text-subhead"
						aria-live="polite"
					>
						{pending || dirty ? t("planSaving") : saved ? t("planSaved") : ""}
					</p>
				</div>
			)}
			{children}
		</Ctx.Provider>
	);
}

// Dauer einer Maßnahme: Schätzung oder eigene Wochen (Menü je Zeile)
export function DurationSelect({
	code,
	estimated,
}: {
	code: string;
	estimated: number;
}) {
	const t = useTranslations("Assessment");
	const ctx = useContext(Ctx);
	if (!ctx?.editable) return null;
	const own = ctx.overrides[code];
	return (
		<select
			aria-label={t("planDuration", { code })}
			className={`${nativeSelectCompactClass} w-[7.5rem] shrink-0`}
			value={own === undefined ? "" : String(own)}
			onChange={(e) =>
				ctx.setDuration(code, e.target.value ? Number(e.target.value) : null)
			}
		>
			<option value="">{t("planDurationEstimate", { days: estimated })}</option>
			{WEEK_OPTIONS.map((w) => (
				<option key={w} value={w * 5}>
					{t("planDurationWeeks", { count: w })}
				</option>
			))}
			{own !== undefined && !WEEK_OPTIONS.some((w) => w * 5 === own) && (
				<option value={own}>{t("planDurationDays", { days: own })}</option>
			)}
		</select>
	);
}
