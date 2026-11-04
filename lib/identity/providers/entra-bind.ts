import type { MsGet } from "@/lib/microsoft/types";

// Bindung Tenant ↔ Org (Teil D, wie bei Teams): „admin_consent=True“ steht
// nur in der Adresse und lässt sich fälschen. Gilt nur, wenn eine
// Inhaber:in der Org eine Adresse aus einer bestätigten Domain des Tenants
// hat und dort ein eigenes Konto ist (kein Gast). Eine Domain lässt sich in
// Entra nur in einem Tenant bestätigen; ein Konto anlegen kann nur, wer den
// Tenant verwaltet.

const parse = <T>(body: string): T | null => {
	try {
		return JSON.parse(body) as T;
	} catch {
		return null;
	}
};

export async function entraVerifiedDomains(
	get: MsGet,
	tenantId: string,
): Promise<string[] | null> {
	const r = await get(tenantId, "/organization?$select=verifiedDomains");
	if (!r.ok || r.value.status !== 200) return null;
	type Org = {
		value?: { verifiedDomains?: { name?: string; isVerified?: boolean }[] }[];
	};
	const v = parse<Org>(r.value.body)?.value;
	if (!Array.isArray(v)) return null;
	const out = new Set<string>();
	for (const o of v)
		for (const d of o.verifiedDomains ?? [])
			if (d.isVerified && typeof d.name === "string")
				out.add(d.name.toLowerCase());
	return [...out];
}

export async function entraBound(
	get: MsGet,
	tenantId: string,
	ownerEmails: readonly string[],
): Promise<boolean> {
	const domains = await entraVerifiedDomains(get, tenantId);
	if (!domains || domains.length === 0) return false;
	for (const raw of ownerEmails.slice(0, 20)) {
		const email = raw.toLowerCase();
		const domain = email.slice(email.lastIndexOf("@") + 1);
		if (!domains.includes(domain)) continue;
		const r = await get(
			tenantId,
			`/users/${encodeURIComponent(email)}?$select=id,userType,userPrincipalName`,
		);
		if (!r.ok || r.value.status !== 200) continue;
		const u = parse<{
			id?: string;
			userType?: string | null;
			userPrincipalName?: string | null;
		}>(r.value.body);
		if (!u?.id) continue;
		const guest =
			u.userType === "Guest" || /#ext#/i.test(u.userPrincipalName ?? "");
		if (!guest) return true;
	}
	return false;
}
