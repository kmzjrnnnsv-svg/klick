import { type DlpDetector, EMAIL, PATTERNS, PHONE } from "@/lib/dlp/detectors";

// Schwärzen vor dem Senden an eine KI (Teil B, ADR-032) — rein. Dieselben
// Muster wie die DLP-Erkennung (lib/dlp/detectors.ts, mit Prüfziffern), aber
// der Fund wird durch einen Platzhalter ersetzt. Zurück kommt nur die Zahl
// je Detektor, nie der Inhalt (landet im Verlauf).

const LABEL: Record<DlpDetector, string> = {
	private_key: "Schlüssel",
	aws_access_key: "Zugangsschlüssel",
	stripe_secret: "Zugangsschlüssel",
	github_token: "Zugangsschlüssel",
	openai_key: "Zugangsschlüssel",
	anthropic_key: "Zugangsschlüssel",
	slack_token: "Zugangsschlüssel",
	sendgrid_key: "Zugangsschlüssel",
	supabase_service_role: "Zugangsschlüssel",
	google_api_key: "Zugangsschlüssel",
	card_number: "Kartennummer",
	iban: "IBAN",
	de_tax_id: "Steuer-ID",
	email: "E-Mail",
	phone: "Telefon",
};

const placeholder = (d: DlpDetector) => `[${LABEL[d]} entfernt]`;

// ganzer PEM-Block, nicht nur die Kopfzeile
const PEM_BLOCK =
	/-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY(?: BLOCK)?-----|$)/g;

export type Redaction = {
	text: string;
	counts: Partial<Record<DlpDetector, number>>;
	total: number;
};

export function redactText(text: string): Redaction {
	const counts: Partial<Record<DlpDetector, number>> = {};
	const bump = (d: DlpDetector) => {
		counts[d] = (counts[d] ?? 0) + 1;
	};
	let out = text.replace(PEM_BLOCK, () => {
		bump("private_key");
		return placeholder("private_key");
	});
	for (const p of PATTERNS) {
		if (p.detector === "private_key") continue;
		out = out.replace(p.pattern, (m) => {
			if (p.valid && !p.valid(m)) return m;
			bump(p.detector);
			return placeholder(p.detector);
		});
	}
	out = out.replace(EMAIL, () => {
		bump("email");
		return placeholder("email");
	});
	out = out.replace(PHONE, (m) => {
		// wie die Erkennung: erst ab 8 Ziffern eine Telefonnummer
		if (m.replace(/\D/g, "").length < 8) return m;
		bump("phone");
		return placeholder("phone");
	});
	const total = Object.values(counts).reduce((s, n) => s + (n ?? 0), 0);
	return { text: out, counts, total };
}
