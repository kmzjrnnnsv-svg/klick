import type { Kms, WrappedDek } from "./kms";

// KEK-Rotation (ISO A.8.24, MiCAR Art. 70): Die Org-DEKs bleiben unverändert,
// nur ihre Umhüllung wird mit dem aktuellen KEK neu geschrieben. Nachweise und
// Feldverschlüsselung hängen am DEK — kein Re-Encrypt der Nutzdaten nötig.
// Der alte KEK muss während der Rotation lesbar bleiben
// (VAULT_KEK_BASE64_V<alt>), danach kann er aus den Credentials verschwinden.

export async function rewrapDek(
	current: WrappedDek,
	kms: Kms,
): Promise<{ changed: boolean; next: WrappedDek }> {
	if (current.keyVersion === kms.currentKeyVersion)
		return { changed: false, next: current };
	const dek = await kms.unwrap(current);
	const next = await kms.wrap(dek);
	return { changed: true, next };
}

export type RotationPlan = {
	currentVersion: number;
	toRotate: string[];
	upToDate: string[];
	byVersion: Record<number, number>;
};

export function rotationPlan(
	rows: readonly { orgId: string; keyVersion: number }[],
	currentVersion: number,
): RotationPlan {
	const byVersion: Record<number, number> = {};
	const toRotate: string[] = [];
	const upToDate: string[] = [];
	for (const r of rows) {
		byVersion[r.keyVersion] = (byVersion[r.keyVersion] ?? 0) + 1;
		(r.keyVersion === currentVersion ? upToDate : toRotate).push(r.orgId);
	}
	return { currentVersion, toRotate, upToDate, byVersion };
}
