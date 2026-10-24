// Datenschutzerklärung von both.money (Art. 13 DSGVO). Abschnitt 1
// (Verantwortliche:r) setzt die Seite aus LEGAL_* zusammen. Entwurf —
// fachliche Prüfung: docs/legal/both-money-datenschutz.md.

export const PRIVACY_AS_OF = "24.10.2026";

export type PrivacySection = {
	title: string;
	paragraphs?: string[];
	items?: string[];
};

export const PRIVACY_SECTIONS: PrivacySection[] = [
	{
		title: "Wenn deine Organisation both.money nutzt",
		paragraphs: [
			"Für die Wallet-Daten deiner Organisation (Konten, Adressen, Zahlungen, Adressbuch, Auszahlungen, Mitglieder) ist deine Organisation verantwortlich. Wir verarbeiten diese Daten nur in ihrem Auftrag nach Art. 28 DSGVO. Fragen dazu richtest du am besten an deine Organisation.",
		],
	},
	{
		title: "Das Wichtigste vorab",
		items: [
			"Kein Tracking: keine Analyse-Werkzeuge, keine Werbe-Cookies, keine Social-Media-Plugins, keine eingebundenen Inhalte von Dritten.",
			"Schriften liegen auf unserem Server; beim Aufruf gehen keine Daten an Schriftanbieter.",
			"Keine automatisierten Entscheidungen nach Art. 22 DSGVO und keine Profilbildung.",
			"Blockchain-Daten fragen wir über eigene Knoten ab, nicht über Dienstleister.",
			"Server in Deutschland (Hetzner). E-Mails versenden wir über Brevo (EU, Frankreich).",
		],
	},
	{
		title: "Hosting und Sicherungen",
		paragraphs: [
			"both.money läuft auf Servern der Hetzner Online GmbH, Industriestr. 25, 91710 Gunzenhausen, in einem Rechenzentrum in Deutschland. Verschlüsselte Sicherungskopien liegen bei Hetzner in einem zweiten Rechenzentrum in der EU. Hetzner verarbeitet die Daten als Auftragsverarbeiter (Art. 28 DSGVO).",
		],
		items: [
			"Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertrag) und lit. f (berechtigtes Interesse an einem sicheren, verfügbaren Betrieb).",
			"Speicherdauer der Sicherungen: höchstens 30 Tage.",
		],
	},
	{
		title: "Server-Protokolle und Schutz vor Angriffen",
		paragraphs: [
			"Beim Aufruf jeder Seite speichert unser Webserver IP-Adresse, Datum und Uhrzeit, aufgerufene Adresse, Statuscode, Datenmenge, Referrer und Browser-Kennung. Eine Schutzsoftware auf unserem Server wertet die Protokolle aus und sperrt angreifende Adressen; dabei gehen keine Daten an Dritte.",
		],
		items: [
			"Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (Sicherheit unserer Systeme, Art. 32 DSGVO).",
			"Speicherdauer: 14 Tage.",
		],
	},
	{
		title: "Cookies und Speicher im Browser",
		paragraphs: [
			"Wir setzen nur, was für den Dienst technisch unbedingt erforderlich ist (§ 25 Abs. 2 Nr. 2 TDDDG). Eine Einwilligung ist dafür nicht nötig, deshalb gibt es kein Cookie-Banner.",
		],
		items: [
			"Cookies, die mit „both.“ beginnen: Anmeldung und Sitzung – höchstens 12 Stunden, bei Inaktivität 30 Minuten.",
			"„both_link“: Aktivierungs-, Einladungs- oder Zurücksetz-Link gegen das Anlegen eines Passkeys tauschen – höchstens 30 Minuten.",
			"„both_pending_invite“ (Sitzungsspeicher des Browsers): Einladung nach der Anmeldung annehmen – bis zur Annahme oder bis du den Tab schließt.",
		],
	},
	{
		title: "Konto und Anmeldung",
		paragraphs: [
			"Für ein Konto verarbeiten wir Name, E-Mail-Adresse, Rolle und Organisation, deine Passkeys (nur der öffentliche Schlüssel und eine Kennung; biometrische Daten verlassen dein Gerät nie) und Sitzungen mit IP-Adresse und Browser-Kennung. Konten entstehen nur per Einladung oder durch den Betrieb.",
		],
		items: [
			"Zweck: Anmeldung, Schutz deines Kontos, Nachvollziehbarkeit von Änderungen.",
			"Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Nutzungsvertrag deiner Organisation), lit. f (Kontosicherheit) und lit. c (Aufzeichnungspflichten deiner Organisation).",
			"Speicherdauer: Konto bis zur Löschung; abgelaufene Sitzungen und Links 1 Tag, gelesene Benachrichtigungen 90 Tage, alle Benachrichtigungen höchstens 12 Monate. Das Änderungsprotokoll (mit IP-Adresse und Browser-Kennung) ist manipulationssicher verkettet und bleibt so lange erhalten, wie die Aufbewahrungspflichten deiner Organisation es verlangen, längstens bis zur Löschung der Organisation.",
		],
	},
	{
		title: "Wallet-Daten",
		paragraphs: [
			"both.money beobachtet die Konten deiner Organisation auf Blockchains über unsere eigenen Knoten: öffentliche Schlüssel (xpub), Adressen, Zahlungen mit Gegenadressen, Beträgen und Zeitpunkten sowie Kontostände. Private Schlüssel sieht both.money nie; Auszahlungen signiert ein getrennter Dienst ohne Netzzugang erst nach Bestätigung mit Sicherheitsschlüsseln.",
			"Eingehende Zahlungen gleichen wir vor der Gutschrift mit Listen gesperrter Adressen ab (z. B. OFAC). Adressen und Zahlungen auf öffentlichen Blockchains sind für alle einsehbar und lassen sich dort nicht löschen.",
		],
		items: [
			"Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertrag deiner Organisation) und lit. c (Pflichten deiner Organisation, etwa aus Geldwäscherecht und Sanktionsvorschriften).",
			"Speicherdauer: solange die Organisation das Konto führt und ihre Aufbewahrungspflichten es verlangen.",
		],
	},
	{
		title: "Export an Klick",
		paragraphs: [
			"Verbindet deine Organisation both.money mit einer Organisation in der Compliance-Software Klick, übermitteln wir dorthin Ein- und Ausgänge (Adressen, Beträge, Zeitpunkte), Kontostände zum Tagesabschluss, Prüfungen und Auffälligkeiten. Klick betreiben wir selbst auf denselben Servern in Deutschland. Empfänger ist die von deiner Organisation gewählte Klick-Organisation.",
		],
		items: [
			"Rechtsgrundlage: Art. 6 Abs. 1 lit. c und f DSGVO (Nachweis- und Meldepflichten deiner Organisation), im Auftrag deiner Organisation.",
			"Die Verbindung kann deine Organisation jederzeit beenden; bereits übermittelte Daten bleiben in Klick nach dessen Löschfristen.",
		],
	},
	{
		title: "E-Mails",
		paragraphs: [
			"Wir versenden nur Mails, die zum Dienst gehören (Einladungen, Sicherheitshinweise), keine Werbung. Versand über Brevo (Sendinblue SAS, Paris, Frankreich) als Auftragsverarbeiter. Unser Postfach liegt bei Namecheap, Inc. (USA, Dienst „Private Email“); wenn du uns schreibst, können Daten in die USA übermittelt werden. Grundlage sind die EU-Standardvertragsklauseln (Art. 46 Abs. 2 lit. c DSGVO).",
		],
		items: [
			"Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO, bei Anfragen ohne Vertragsbezug lit. f.",
		],
	},
	{
		title: "Empfänger",
		paragraphs: [
			"Empfänger sind nur die genannten Auftragsverarbeiter (Hetzner, Brevo, Namecheap), bei Wallet-Daten die berechtigten Mitglieder deiner Organisation und – bei einer Verbindung – die gewählte Klick-Organisation. In Länder außerhalb der EU übermitteln wir nur bei Mails an unser Postfach.",
		],
	},
	{
		title: "Deine Rechte",
		paragraphs: [
			"Du hast das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung (Art. 18) und Datenübertragbarkeit (Art. 20 DSGVO). Verarbeiten wir Daten auf Grundlage von Art. 6 Abs. 1 lit. f, kannst du aus Gründen, die sich aus deiner besonderen Situation ergeben, jederzeit widersprechen (Art. 21 DSGVO).",
			"Du kannst dich bei einer Datenschutz-Aufsichtsbehörde beschweren, etwa bei der für uns zuständigen: Der Hessische Beauftragte für Datenschutz und Informationsfreiheit, Gustav-Stresemann-Ring 1, 65189 Wiesbaden.",
		],
	},
	{
		title: "Pflicht zur Bereitstellung, Minderjährige, Änderungen",
		paragraphs: [
			"Für ein Konto brauchen wir Name und E-Mail-Adresse; ohne sie können wir den Dienst nicht erbringen. both.money richtet sich ausschließlich an Unternehmen; Personen unter 18 Jahren dürfen kein Konto haben. Wir passen diese Erklärung an, wenn sich die Verarbeitung ändert; es gilt die hier veröffentlichte Fassung.",
		],
	},
];
