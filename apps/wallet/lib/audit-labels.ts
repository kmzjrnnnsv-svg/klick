// Lesbare Bezeichnungen der Audit-Aktionen (pure); Unbekanntes bleibt Code.
const LABELS: Record<string, string> = {
	"org.created": "Organisation angelegt",
	"member.invited": "Person eingeladen",
	"member.joined": "Beigetreten",
	"member.role_changed": "Rolle geändert",
	"member.removed": "Mitglied entfernt",
	"member.invitation_revoked": "Einladung zurückgezogen",
};

export function auditLabel(action: string): string {
	return LABELS[action] ?? action;
}
