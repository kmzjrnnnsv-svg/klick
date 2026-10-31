"use client";

import { Info, ShieldAlert, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { acknowledgeAnnouncementAction } from "@/app/actions/announcements";
import { Button } from "@/components/ui/button";
import { errorText } from "@/components/ui/error-text";
import { toast } from "@/components/ui/toast";

export type BannerItem = {
	id: string;
	kind: "info" | "maintenance" | "incident";
	title: string;
	body: string;
	/** fertiger Text für das Zeitfenster der Wartung */
	window: string | null;
};

const KEY = "klick-announcements-hidden";

function hiddenIds(): string[] {
	try {
		const raw = localStorage.getItem(KEY);
		const list = raw ? (JSON.parse(raw) as unknown) : [];
		return Array.isArray(list) ? list.filter((x) => typeof x === "string") : [];
	} catch {
		return [];
	}
}

function hide(id: string) {
	try {
		const list = [...new Set([...hiddenIds(), id])].slice(-50);
		localStorage.setItem(KEY, JSON.stringify(list));
	} catch {
		// privates Fenster: Hinweis kommt beim nächsten Laden wieder
	}
}

// Nur der Vorfall ist getönt; Wartung und Info sind ruhige Karten mit
// farbigem Symbol (Bedeutung trägt der Text, nie nur die Farbe)
const TONE = {
	incident: "bg-destructive/10",
	maintenance: "bg-card",
	info: "bg-card",
} as const;
const ICON_TONE = {
	incident: "text-destructive",
	maintenance: "text-warning",
	info: "text-primary",
} as const;

// Mitteilung von Klick oben in der App. Info und Wartung blendet jede Person
// für sich aus (nur dieser Browser); ein Sicherheitsvorfall bleibt, bis
// Inhaber:in oder Geschäftsleitung ihn zur Kenntnis genommen hat.
export function AnnouncementBanner({
	item,
	canAcknowledge,
}: {
	item: BannerItem;
	canAcknowledge: boolean;
}) {
	const t = useTranslations("Announcements");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [visible, setVisible] = useState(true);
	useEffect(() => {
		if (item.kind !== "incident" && hiddenIds().includes(item.id))
			setVisible(false);
	}, [item.id, item.kind]);
	if (!visible) return null;
	const Icon =
		item.kind === "incident"
			? ShieldAlert
			: item.kind === "maintenance"
				? Wrench
				: Info;
	return (
		<section
			aria-labelledby={`ann-${item.id}`}
			role={item.kind === "incident" ? "alert" : "status"}
			className={`flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-start ${TONE[item.kind]}`}
		>
			<Icon
				aria-hidden="true"
				className={`size-5 shrink-0 ${ICON_TONE[item.kind]}`}
			/>
			<div className="flex min-w-0 grow flex-col gap-1">
				<p className="text-footnote text-muted-foreground">
					{t(`kind_${item.kind}`)}
					{item.window ? ` · ${item.window}` : ""}
				</p>
				<h2 id={`ann-${item.id}`} className="font-semibold text-headline">
					{item.title}
				</h2>
				<p className="whitespace-pre-line break-words text-subhead">
					{item.body}
				</p>
				{item.kind === "incident" && !canAcknowledge && (
					<p className="text-footnote text-muted-foreground">
						{t("informedHint")}
					</p>
				)}
			</div>
			{item.kind === "incident" ? (
				canAcknowledge && (
					<Button
						className="shrink-0 self-start"
						disabled={pending}
						onClick={() =>
							start(async () => {
								const res = await acknowledgeAnnouncementAction(item.id);
								if (!res.ok) return void toast.error(errorText(tc, res));
								toast.success(t("acknowledged"));
								router.refresh();
							})
						}
					>
						{pending ? t("acknowledging") : t("acknowledge")}
					</Button>
				)
			) : (
				<Button
					variant="ghost"
					className="shrink-0 self-start"
					onClick={() => {
						hide(item.id);
						setVisible(false);
					}}
				>
					{t("hide")}
				</Button>
			)}
		</section>
	);
}
