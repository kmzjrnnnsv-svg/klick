import { safeInternalPath } from "@/lib/safe-path";

// Link aus einer Benachrichtigung als absolute Adresse der eigenen Instanz
// (Teams, Push): nur Pfade dieser Instanz, sonst „Heute“. Rein.
export function notificationUrl(baseUrl: string, link: string | null): string {
	const root = baseUrl.replace(/\/$/, "");
	if (link && /^https?:\/\//i.test(link))
		return link.startsWith(`${root}/`) ? link : `${root}/heute`;
	const path = link ? safeInternalPath(link, "") : "";
	return `${root}${path || "/heute"}`;
}
