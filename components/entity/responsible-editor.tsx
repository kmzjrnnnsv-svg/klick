"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { setResponsible } from "@/app/actions/responsible";
import { errorText } from "@/components/ui/error-text";
import { toast } from "@/components/ui/toast";
import type { FunctionKey } from "@/db/schema/enums";
import { responsibleValue } from "@/lib/validation/responsible";
import { OwnerChip } from "./owner-chip";
import { ResponsibleSelect } from "./responsible-select";

// Verantwortlich auf Detailseiten (Dokument, Nachweis): Auswahl, die sofort
// speichert; ohne Recht nur die Anzeige „Funktion · Person“.
export function ResponsibleEditor({
	entity,
	id,
	ownerUserId,
	ownerFunction,
	ownerName,
	members,
	canEdit,
}: {
	entity: "document" | "evidence";
	id: string;
	ownerUserId: string | null;
	ownerFunction: FunctionKey | null;
	ownerName: string | null;
	members: { userId: string; name: string }[];
	canEdit: boolean;
}) {
	const t = useTranslations("Entity");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	if (!canEdit)
		return <OwnerChip ownerFunction={ownerFunction} name={ownerName} />;
	return (
		<ResponsibleSelect
			size="sm"
			className="w-full max-w-72"
			value={responsibleValue({ ownerFunction, ownerUserId })}
			onChange={(ref) =>
				start(async () => {
					const res = await setResponsible({ entity, id, ref });
					if (!res.ok) toast.error(errorText(tc, res));
					else router.refresh();
				})
			}
			members={members}
			disabled={pending}
			aria-label={t("owner")}
		/>
	);
}
