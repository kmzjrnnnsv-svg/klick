"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { saveNotificationPreferences } from "@/app/actions/notification-preferences";
import { Button } from "@/components/ui/button";
import { errorText } from "@/components/ui/error-text";
import { FormAlert } from "@/components/ui/form-alert";
import { nativeSelectClass } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import type { NotificationKind } from "@/db/schema/enums";
import type { NotificationChannel } from "@/db/schema/teams";

// Einstellungen > Benachrichtigungen (T5): je Art Mail, Teams oder beides;
// Teams nur, wenn die Organisation es eingeschaltet hat. Tages-Mail an/aus.
export function NotificationPrefsPanel({
	kinds,
	initial,
	teamsActive,
}: {
	kinds: { kind: NotificationKind; label: string; immediate: boolean }[];
	initial: {
		channels: Partial<Record<NotificationKind, NotificationChannel>>;
		digestEnabled: boolean;
	};
	teamsActive: boolean;
}) {
	const t = useTranslations("NotificationPrefs");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [channels, setChannels] = useState(initial.channels);
	const [digest, setDigest] = useState(initial.digestEnabled);
	const [error, setError] = useState<string | null>(null);
	const options: NotificationChannel[] = teamsActive
		? ["mail", "teams", "both"]
		: ["mail"];

	return (
		<form
			className="flex flex-col gap-6 text-subhead"
			onSubmit={(e) => {
				e.preventDefault();
				start(async () => {
					setError(null);
					const res = await saveNotificationPreferences({
						channels,
						digestEnabled: digest,
					});
					if (!res.ok) return setError(errorText(tc, res));
					toast.success(t("saved"));
					router.refresh();
				});
			}}
		>
			<p className="text-muted-foreground">
				{teamsActive ? t("leadTeams") : t("leadMail")}
			</p>
			<label className="flex items-center justify-between gap-3 rounded-2xl bg-card p-3">
				<span>
					<span className="block font-medium">{t("digest")}</span>
					<span className="block text-footnote text-muted-foreground">
						{t("digestHint")}
					</span>
				</span>
				<Switch checked={digest} onCheckedChange={setDigest} />
			</label>
			{teamsActive && (
				<ul className="list-inset flex flex-col overflow-hidden rounded-2xl bg-card">
					{kinds.map((k) => (
						<li
							key={k.kind}
							className="flex flex-col gap-1.5 p-3 sm:flex-row sm:items-center sm:justify-between"
						>
							<Label htmlFor={`np-${k.kind}`}>
								{k.label}
								<span className="block text-footnote text-muted-foreground">
									{k.immediate ? t("immediate") : t("inDigest")}
								</span>
							</Label>
							<select
								id={`np-${k.kind}`}
								className={`${nativeSelectClass} sm:w-56`}
								value={channels[k.kind] ?? "mail"}
								onChange={(e) =>
									setChannels((c) => ({
										...c,
										[k.kind]: e.target.value as NotificationChannel,
									}))
								}
							>
								{options.map((o) => (
									<option key={o} value={o}>
										{t(`channel_${o}`)}
									</option>
								))}
							</select>
						</li>
					))}
				</ul>
			)}
			{teamsActive && (
				<p className="text-footnote text-muted-foreground">{t("fallback")}</p>
			)}
			<FormAlert message={error} />
			<div className="flex justify-end">
				<Button type="submit" disabled={pending}>
					{t("save")}
				</Button>
			</div>
		</form>
	);
}
