import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import type { CheckOutcome } from "@/lib/identity/types";

const VARIANT = {
	pass: "success",
	partial: "warning",
	fail: "destructive",
	not_assessable: "muted",
} as const;

// Ergebnis einer automatischen Prüfung (Teil D), nie Farbe allein: der Text
// steht im Badge
export async function CheckBadge({ result }: { result: CheckOutcome }) {
	const t = await getTranslations("IdentityAccounts");
	return <Badge variant={VARIANT[result]}>{t(`result_${result}`)}</Badge>;
}
