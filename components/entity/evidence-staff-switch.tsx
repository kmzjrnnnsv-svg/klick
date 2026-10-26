"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { setEvidenceStaffVisible } from "@/app/actions/evidence";
import { errorText } from "@/components/ui/error-text";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";

// Nachweis für Mitarbeitende freigeben (/richtlinien). Nur öffentlich/intern
// und nur die aktuelle Fassung; die nächste Fassung übernimmt den Schalter.
export function EvidenceStaffSwitch({
	evidenceId,
	visible,
	canEdit,
}: {
	evidenceId: string;
	visible: boolean;
	canEdit: boolean;
}) {
	const t = useTranslations("Evidence");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [on, setOn] = useState(visible);
	const [pending, start] = useTransition();
	return (
		<div className="flex items-center gap-3">
			<Switch
				id="staff-visible"
				checked={on}
				disabled={!canEdit || pending}
				onCheckedChange={(next) =>
					start(async () => {
						setOn(next);
						const res = await setEvidenceStaffVisible({
							evidenceId,
							visible: next,
						});
						if (!res.ok) {
							setOn(!next);
							toast.error(
								res.error === "staff_confidential"
									? t("staffConfidential")
									: errorText(tc, res),
							);
							return;
						}
						router.refresh();
					})
				}
			/>
			<label htmlFor="staff-visible" className="text-subhead">
				{on ? t("staffOn") : t("staffOff")}
			</label>
		</div>
	);
}
