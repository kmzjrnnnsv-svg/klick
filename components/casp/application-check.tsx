"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { setApplicationItem } from "@/app/actions/application";
import { Checkbox } from "@/components/ui/checkbox";

// Manuell abhakbarer Bestandteil der Antragsmappe (z. B. Satzung beigefügt).
export function ApplicationCheck({
	code,
	done,
	label,
	disabled,
}: {
	code: string;
	done: boolean;
	label: string;
	disabled?: boolean;
}) {
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<label className="flex items-center gap-2 text-sm">
			<Checkbox
				checked={done}
				disabled={disabled || pending}
				onCheckedChange={(v) =>
					start(async () => {
						const res = await setApplicationItem({ code, done: Boolean(v) });
						if (!res.ok) return void toast.error(tc("error"));
						router.refresh();
					})
				}
			/>
			{label}
		</label>
	);
}
