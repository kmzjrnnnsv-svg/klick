import { Check, Minus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import {
	CAPABILITIES,
	capabilitiesFor,
	ROLE_ORDER,
} from "@/lib/auth/role-guide";

// Wer darf was — Tabelle aus lib/auth/role-guide.ts (Server-Komponente).
export async function RightsMatrix() {
	const t = await getTranslations("Team");
	const label = (r: string) =>
		t(`role${r[0]?.toUpperCase()}${r.slice(1)}` as "roleOwner");
	const byRole = new Map(
		ROLE_ORDER.map((r) => [
			r,
			new Map(capabilitiesFor(r).map((c) => [c.key, c.allowed])),
		]),
	);
	return (
		<div className="overflow-x-auto">
			<table className="w-full text-xs">
				<thead>
					<tr className="text-left text-muted-foreground">
						<th className="py-1 pr-2 font-normal" />
						{ROLE_ORDER.map((r) => (
							<th key={r} className="px-1 py-1 text-center font-normal">
								{label(r)}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{CAPABILITIES.map((c) => (
						<tr key={c.key} className="border-border/60 border-t">
							<td className="py-1 pr-2">{t(`cap_${c.key}`)}</td>
							{ROLE_ORDER.map((r) => (
								<td key={r} className="px-1 py-1 text-center">
									{byRole.get(r)?.get(c.key) ? (
										<Check
											className="mx-auto size-3.5 text-success"
											aria-label="ja"
										/>
									) : (
										<Minus
											className="mx-auto size-3.5 text-muted-foreground"
											aria-label="nein"
										/>
									)}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
