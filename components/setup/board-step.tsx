"use client";

import { useTranslations } from "next-intl";
import { completeSetupStep } from "@/app/actions/setup";
import {
	type BoardArea,
	type BoardPerson,
	type BoardRole,
	RoleBoard,
} from "@/components/organisation/role-board";
import { Button } from "@/components/ui/button";
import { useStepRunner } from "./step-footer";

// Schritt „Rollen“ im individuellen Modus (ADR-024): dieselbe Rollen-Tafel
// wie unter /organisation, danach weiter zum nächsten Schritt
export function BoardStep({
	roles,
	people,
	areas,
	canEdit,
	nextHref,
}: {
	roles: BoardRole[];
	people: BoardPerson[];
	areas: BoardArea[];
	canEdit: boolean;
	nextHref: string;
}) {
	const t = useTranslations("Setup");
	const { pending, run } = useStepRunner(nextHref);
	return (
		<div className="flex flex-col gap-6">
			<p className="max-w-2xl text-muted-foreground text-subhead">
				{t("boardLead")}
			</p>
			<RoleBoard
				roles={roles}
				people={people}
				areas={areas}
				canEdit={canEdit}
			/>
			<div className="flex justify-end">
				<Button
					disabled={pending}
					onClick={() => run(() => completeSetupStep({ step: "rollen" }))}
				>
					{t("next")}
				</Button>
			</div>
		</div>
	);
}
