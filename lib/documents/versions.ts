// Fassungen eines Dokuments — rein. Gültig ist die zuletzt veröffentlichte
// Fassung, solange sie nicht zurückgezogen ist; sie gilt bis zur
// Veröffentlichung der Nachfolgerin oder bis zum Rückzug. Abgeleitet, nie
// gespeichert.

export type VersionLike = {
	id: string;
	version: string;
	approvedAt: Date | null;
	publishedAt: Date | null;
	retiredAt: Date | null;
};

export type VersionState =
	| "draft"
	| "in_review"
	| "approved"
	| "current"
	| "superseded"
	| "retired";

export type ValidRange = { from: Date; until: Date | null };

const published = <V extends VersionLike>(versions: readonly V[]) =>
	versions
		.filter((v): v is V & { publishedAt: Date } => v.publishedAt !== null)
		.sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());

// Zeitraum, in dem jede veröffentlichte Fassung galt
export function validRanges<V extends VersionLike>(
	versions: readonly V[],
): Map<string, ValidRange> {
	const out = new Map<string, ValidRange>();
	const list = published(versions);
	list.forEach((v, i) => {
		const next = list[i + 1]?.publishedAt ?? null;
		const ends = [next, v.retiredAt].filter((d): d is Date => d !== null);
		const until =
			ends.length > 0
				? new Date(Math.min(...ends.map((d) => d.getTime())))
				: null;
		out.set(v.id, { from: v.publishedAt, until });
	});
	return out;
}

// Die Fassung, die zu einem Zeitpunkt gilt (Standard: jetzt)
export function currentPublished<V extends VersionLike>(
	versions: readonly V[],
	asOf: Date = new Date(),
): V | null {
	const ranges = validRanges(versions);
	const t = asOf.getTime();
	for (const v of versions) {
		const r = ranges.get(v.id);
		if (!r) continue;
		if (r.from.getTime() <= t && (r.until === null || r.until.getTime() > t))
			return v;
	}
	return null;
}

// Fassungen, die in einem Zeitraum (ganz oder teilweise) galten
export function validInPeriod<V extends VersionLike>(
	versions: readonly V[],
	from: Date,
	to: Date,
): V[] {
	const ranges = validRanges(versions);
	return versions.filter((v) => {
		const r = ranges.get(v.id);
		if (!r) return false;
		return (
			r.from.getTime() <= to.getTime() &&
			(r.until === null || r.until.getTime() > from.getTime())
		);
	});
}

// Stand einer Fassung für die Anzeige
export function versionState<V extends VersionLike>(
	v: V,
	doc: { version: string; status: string },
	versions: readonly V[],
	asOf: Date = new Date(),
): VersionState {
	if (v.publishedAt) {
		const cur = currentPublished(versions, asOf);
		if (cur?.id === v.id) return "current";
		const r = validRanges(versions).get(v.id);
		const until = r?.until ?? null;
		if (v.retiredAt && until && v.retiredAt.getTime() === until.getTime())
			return "retired";
		return "superseded";
	}
	if (v.approvedAt) return "approved";
	if (v.version === doc.version && doc.status === "in_review")
		return "in_review";
	return "draft";
}

// Status „in Kraft“: Läuft eine neue Fassung (Entwurf, Prüfung, freigegeben,
// noch nicht veröffentlicht), gilt das Dokument mit seiner bisherigen
// Fassung weiter — für Pflichtdokumente, Nachweise und Pakete zählt das.
export function inForceStatus<S extends string>(
	status: S,
	hasCurrent: boolean,
): S | "published" {
	if (
		hasCurrent &&
		(status === "draft" || status === "in_review" || status === "approved")
	)
		return "published";
	return status;
}
