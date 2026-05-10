"use client";

import { Eye, EyeOff, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ProfileSectionKey } from "@/db/schema";

type Visibility = "private" | "matches_only" | "public";

const ICONS: Record<Visibility, typeof Eye> = {
	private: EyeOff,
	matches_only: Users,
	public: Eye,
};

export function SectionVisibilityChip({
	section,
	value,
	onChange,
}: {
	section: ProfileSectionKey;
	value: Visibility;
	onChange: (next: Visibility) => void;
}) {
	const t = useTranslations("Profile.visibilityChip");
	const Icon = ICONS[value];
	function cycle() {
		const order: Visibility[] = ["private", "matches_only", "public"];
		const i = order.indexOf(value);
		onChange(order[(i + 1) % order.length]);
	}
	return (
		<button
			type="button"
			onClick={cycle}
			title={`${t(`labels.${section}`)} · ${t(value)} (${t("clickHint")})`}
			className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-muted-foreground text-xs hover:bg-muted"
		>
			<Icon className="h-3 w-3" strokeWidth={1.5} />
			{t(value)}
		</button>
	);
}
