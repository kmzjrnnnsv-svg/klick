// Anbieterkennzeichnung aus einer Quelle (Env LEGAL_*): Impressum-Block
// (§ 5 DDG), Pflichtangaben in Mails (§ 35a GmbHG, § 37a HGB) und die
// Warnung beim Start. Pure — die Env reicht `legalEntity()` in
// lib/legal/entity-env.ts herein, damit Tests und Mail-Vorlagen ohne Env
// auskommen.

export type LegalEntity = {
	name: string | null;
	form: string | null;
	// Zeilen, aus LEGAL_ADDRESS mit „;“ getrennt
	address: string[];
	representatives: string | null;
	register: string | null;
	vatId: string | null;
	phone: string | null;
	contactMail: string;
	// Pflichtangaben, die fehlen (Schlüssel der Env)
	missing: string[];
};

export type LegalSource = {
	LEGAL_NAME?: string;
	LEGAL_FORM?: string;
	LEGAL_ADDRESS?: string;
	LEGAL_REPRESENTATIVES?: string;
	LEGAL_REGISTER?: string;
	LEGAL_VAT_ID?: string;
	LEGAL_PHONE?: string;
	LEGAL_CONTACT_MAIL: string;
};

// Ohne diese Angaben ist das Impressum unvollständig. Register und USt-ID
// nur, wenn vorhanden (Einzelunternehmen ohne Eintrag) — prüfen je Rechtsform.
export const REQUIRED_LEGAL_KEYS = [
	"LEGAL_NAME",
	"LEGAL_ADDRESS",
	"LEGAL_REPRESENTATIVES",
] as const;

const clean = (v: string | undefined): string | null => {
	const t = v?.trim();
	return t ? t : null;
};

export function legalEntityFrom(src: LegalSource): LegalEntity {
	const address = (src.LEGAL_ADDRESS ?? "")
		.split(";")
		.map((l) => l.trim())
		.filter(Boolean);
	return {
		name: clean(src.LEGAL_NAME),
		form: clean(src.LEGAL_FORM),
		address,
		representatives: clean(src.LEGAL_REPRESENTATIVES),
		register: clean(src.LEGAL_REGISTER),
		vatId: clean(src.LEGAL_VAT_ID),
		phone: clean(src.LEGAL_PHONE),
		contactMail: src.LEGAL_CONTACT_MAIL,
		missing: REQUIRED_LEGAL_KEYS.filter((k) => !clean(src[k])),
	};
}

// Firma mit Rechtsform, ohne die Form doppelt zu nennen („Raza GmbH“)
export function legalDisplayName(e: LegalEntity): string | null {
	if (!e.name) return null;
	if (!e.form || e.name.toLowerCase().includes(e.form.toLowerCase()))
		return e.name;
	return `${e.name} ${e.form}`;
}

// Pflichtangaben für Mail-Fußzeilen: eine Zeile je Angabe, leer ohne Firma
export function legalMailLines(e: LegalEntity): string[] {
	const name = legalDisplayName(e);
	if (!name) return [];
	return [
		[name, ...e.address].join(", "),
		e.representatives ? `Vertreten durch ${e.representatives}` : null,
		e.register,
		e.vatId ? `USt-IdNr. ${e.vatId}` : null,
	].filter((l): l is string => Boolean(l));
}
