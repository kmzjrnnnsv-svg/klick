// @Mentions in Kommentaren: `@anna`, `@anna.meier`, `@anna@firma.de`.
// Auflösung gegen die Mitgliederliste: E-Mail, E-Mail-Local-Part oder Name
// ohne Leerzeichen (klein geschrieben). Reine Funktionen, getestet.

export type MentionableMember = {
	userId: string;
	name: string;
	email: string;
};

const MENTION_RE = /(^|[\s(])@([\p{L}\p{N}._+-]+(?:@[\p{L}\p{N}.-]+)?)/gu;

export function extractMentionHandles(text: string): string[] {
	const handles = new Set<string>();
	for (const match of text.matchAll(MENTION_RE)) {
		const handle = match[2]?.replace(/[.,;:!?)]+$/u, "");
		if (handle) handles.add(handle.toLowerCase());
	}
	return [...handles];
}

function slugName(name: string): string {
	return name.toLowerCase().replace(/\s+/g, ".");
}

export function resolveMentions(
	text: string,
	members: readonly MentionableMember[],
): MentionableMember[] {
	const handles = extractMentionHandles(text);
	if (handles.length === 0) return [];
	const out = new Map<string, MentionableMember>();
	for (const h of handles) {
		for (const m of members) {
			const email = m.email.toLowerCase();
			const local = email.slice(0, email.indexOf("@"));
			if (
				h === email ||
				h === local ||
				h === slugName(m.name) ||
				h === m.name.toLowerCase()
			) {
				out.set(m.userId, m);
			}
		}
	}
	return [...out.values()];
}
