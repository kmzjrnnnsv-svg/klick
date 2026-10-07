// AAD bindet den Chiffretext eines Nachweises an seine ID — eine Datei kann
// nicht unter fremder ID ausgeliefert werden. Von Upload (Action) und
// Download (/api/nachweise/[id]) gemeinsam genutzt.
export function evidenceAad(id: string): string {
	return `klick:evidence:${id}`;
}
