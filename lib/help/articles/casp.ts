import type { HelpArticle } from "../types";

// Finanz- und Kryptothemen: Geldwäsche, CASP (Eigenmittel, Kryptowerte,
// Verwahrung, both.money, Beschwerden, Antrag).

export const CASP: HelpArticle[] = [
	{
		slug: "geldwaesche",
		area: "casp",
		title: "Geldwäscheprävention",
		summary:
			"Risikoanalyse, Kundensorgfalt, Monitoring-Regeln, Verdachtsmeldungen mit Fristen, Länder und Korridore, Travel Rule, Schulung und Berichte.",
		sections: [
			{
				id: "risikoanalyse",
				heading: "Unternehmensweite Risikoanalyse",
				steps: [
					"Öffne Geldwäsche > Risikoanalyse. Klick gliedert sie nach Dimensionen: Kund:innen, Produkte, Länder, Vertriebswege, Transaktionen.",
					"Kreuz je Dimension die zutreffenden Risikofaktoren aus dem Katalog an. Klick schlägt daraus einen Wert vor; die Bewertung bleibt deine Entscheidung.",
					"Beschreib die Maßnahmen und leg die Analyse zur Freigabe vor: erst die oder der Geldwäschebeauftragte, dann die Geschäftsleitung.",
					"Aktualisier die Analyse mindestens jährlich und bei wesentlichen Änderungen.",
				],
			},
			{
				id: "sorgfalt",
				heading: "Kundensorgfalt",
				list: [
					"Allgemeine, vereinfachte oder verstärkte Sorgfaltspflichten je Kundengruppe.",
					"Identifizierung, wirtschaftlich Berechtigte (verschlüsselt), politisch exponierte Personen, Abgleich mit dem Transparenzregister.",
					"Monitoring-Regelwerk: Regeln mit Schwellen, Szenarien und Prüfintervall.",
				],
			},
			{
				id: "verdacht",
				heading: "Verdachtsfälle",
				steps: [
					"Leg den Verdachtsfall an (aus dem Monitoring, einem Sanktionstreffer oder von Hand).",
					"Klick zeigt die Frist: Nach Abgabe der Meldung an die FIU darf die Transaktion drei Werktage lang nicht ausgeführt werden, sofern die FIU nicht zustimmt.",
					"Dokumentier Entscheidung und Meldung. Die Information des Kunden ist verboten; Klick hält die Fälle nur für Berechtigte sichtbar.",
				],
			},
			{
				id: "laender",
				heading: "Länder, Korridore, Travel Rule",
				list: [
					"Länderliste mit Risiko (EU-Hochrisikoländer, FATF-Listen, Sanktionen), Import per CSV.",
					"Korridore: Zahlungswege in bestimmte Länder mit eigener Vorlage für Maßnahmen.",
					"Travel Rule: Begleitdaten bei Geld- und Kryptotransfers, Umgang mit fehlenden Angaben und selbst gehosteten Adressen.",
				],
			},
		],
		roles: [
			"Geldwäschebeauftragte:r wird von der Geschäftsleitung bestellt und der BaFin vorab angezeigt.",
			"Externe sehen Geldwäsche-Fälle nur mit eigenem Zugang.",
		],
		automation: [
			"Erinnerung an die jährliche Risikoanalyse, offene Verdachtsfälle und die Schulungen.",
			"Sanktionstreffer aus both.money werden zum Verdachtsfall mit Aufgabe.",
		],
		norms: [
			{ key: "gwg:§5", why: "Unternehmensweite Risikoanalyse." },
			{ key: "gwg:§6", why: "Interne Sicherungsmaßnahmen." },
			{ key: "gwg:§7", why: "Geldwäschebeauftragte:r." },
			{ key: "gwg:§10", why: "Allgemeine Sorgfaltspflichten." },
			{ key: "gwg:§15", why: "Verstärkte Sorgfaltspflichten." },
			{ key: "gwg:§43", why: "Verdachtsmeldung an die FIU." },
			{ key: "gwg:§46", why: "Durchführungsverbot nach der Meldung." },
			{
				key: "amlr:Art.10",
				why: "Risikobewertung nach der EU-Verordnung ab Juli 2027.",
			},
			{ key: "tfr:Art.14(1-4)", why: "Begleitdaten bei Kryptowertetransfers." },
			{
				key: "sanctions:Screening",
				why: "Täglicher Abgleich mit Sanktionslisten.",
			},
		],
		related: ["casp", "schulungen", "bestellung"],
	},
	{
		slug: "casp",
		area: "casp",
		title: "Kryptowerte-Dienstleister und Zahlungsinstitute",
		summary:
			"Eigenmittel, Kryptowerte-Regeln, Verwahrung mit Abstimmung, Anbindung von both.money, Beschwerden und der Antrag auf Erlaubnis.",
		sections: [
			{
				id: "eigenmittel",
				heading: "Eigenmittel",
				body: [
					"Der Eigenmittel-Rechner nimmt die Vorgaben von MiCAR (Mindestkapital oder ein Viertel der fixen Gemeinkosten) und ZAG (Methoden A, B oder C) und zeigt, welcher Wert gilt. Die Berechnung geht zur Freigabe an die Geschäftsleitung. Dazu kommt die Risikotragfähigkeit. Die Ergebnisse sind Rechenhilfen; stimm Anrechnung und Methode mit Prüfer:in und Aufsicht ab.",
				],
			},
			{
				id: "kryptowerte",
				heading: "Kryptowerte",
				body: [
					"Unter Kryptowerte hältst du fest, welche Kryptowerte du anbietest und wie du sie geprüft hast, zum Beispiel ob ein Whitepaper vorliegt und ob der Wert zum Handel zugelassen werden darf.",
				],
			},
			{
				id: "verwahrung",
				heading: "Verwahrung",
				steps: [
					"Erfass Wallets (kalt oder heiß) mit Quorum und Netz. Schlüsselmaterial gehört nie in Klick.",
					"Erfass Schlüsselinhaber:innen; der Aufbewahrungsort eines Schlüsselanteils wird verschlüsselt gespeichert. Neue Schlüsselinhaber:innen bestellt die Geschäftsleitung, Entziehen wirkt sofort.",
					"Dokumentier Zeremonien und Backup- bzw. Wiederherstellungstests. Kalte Wallets brauchen alle 6, heiße alle 12 Monate einen Test.",
					"Stimm das Kundenvermögen täglich ab: Bestand in den Wallets gegen Kundenbuch. Eine Unterdeckung erzeugt sofort eine Abweichung mit Meldung, eine Überdeckung eine Aufgabe. Eine zweite Person prüft; Differenzen brauchen eine Erklärung. Geprüfte Stichtage sind fest.",
				],
			},
			{
				id: "both",
				heading: "both.money anbinden",
				body: [
					"Nutzt du die Wallet both.money, verbindest du sie unter Einstellungen > Integrationen. both.money schickt dann Bewegungen, Bestände, Prüfungen und Auffälligkeiten. Unter Krypto siehst du Bewegungen, Konten, Auszahlungen und Hinweise; die Verwahrung belegt ihre Bestände aus dem täglichen Abschluss. Eine unbekannte Ausgabe wird zum Vorfall, ein Sanktionstreffer zum Verdachtsfall, der Rest zur Aufgabe.",
				],
			},
			{
				id: "beschwerden",
				heading: "Beschwerden und Hinweise",
				body: [
					"Beschwerden von Kund:innen erfasst du mit Eingang, Frist und Antwort. Hinweise von Hinweisgebenden werden verschlüsselt gespeichert; Externe sehen nur Zahlen.",
				],
			},
			{
				id: "antrag",
				heading: "Antrag auf Erlaubnis",
				body: [
					"Der Bereich Antrag zeigt die Bestandteile des Erlaubnisantrags nach MiCAR (17) und ZAG (10) und wie vollständig sie sind, abgeleitet aus deinen Registern und Nachweisen. Der Export bündelt alles für die Einreichung.",
				],
			},
		],
		automation: [
			"Stichtag der Abstimmung ist der vorherige Werktag; der Tick erinnert an offene Abstimmungen und fällige Backup-Tests.",
			"Ohne Lebenszeichen von both.money seit 2 Stunden entsteht eine Sicherheitsmeldung.",
		],
		norms: [
			{
				key: "micar:Art.67",
				why: "Aufsichtsrechtliche Sicherheitsvorkehrungen (Eigenmittel).",
			},
			{ key: "zag:§15", why: "Laufende Eigenmittel nach ZAG." },
			{
				key: "micar:Art.70",
				why: "Schutz von Kundenkryptowerten und Kundengeldern.",
			},
			{ key: "micar:Art.75", why: "Verwahrung und Verwaltung für Kund:innen." },
			{ key: "micar:Art.71", why: "Beschwerdeverfahren." },
			{ key: "zag:§17", why: "Sicherung der Kundengelder." },
			{ key: "ccss:1.03", why: "Aufbewahrung von Schlüsseln." },
			{
				key: "ccss:1.06",
				why: "Vergabe und Entzug von Schlüsselinhaberschaften.",
			},
			{ key: "micar:Art.62-63", why: "Zulassungsantrag." },
		],
		related: ["geldwaesche", "kalender", "vorfaelle"],
	},
];
