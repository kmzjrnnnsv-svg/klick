import { redirect } from "next/navigation";
import { requireOrgPage } from "@/lib/auth/gates";

// Ziel der Erinnerung „Schulung fällig“ (Tick): Mitarbeitende haben keine
// Schulungsseite und sehen ihre Schulungen auf /richtlinien, alle anderen
// unter Schulungen > Meine.
export default async function MyTrainingsRedirect() {
	const ctx = await requireOrgPage(undefined, { employees: true });
	redirect(
		ctx.orgRole === "employee"
			? "/richtlinien#schulungen"
			: "/schulungen?tab=meine",
	);
}
