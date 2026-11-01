import { COMPLIANCE_PROCESS } from "@/lib/compliance/catalog/compliance-process";
import type { HelpArticle } from "../types";

// Umsetzen: Überblick, Gap-Analyse, Controls und Synergien, Rahmenwerke,
// Nachweise, Sicherheit.

export const IMPLEMENT: HelpArticle[] = [
	{
		slug: "ueberblick",
		area: "implement",
		title: "Überblick und Prüfungsreife",
		summary:
			"Abdeckung je Rahmenwerk, die nächsten Schritte, Trend und die Prüfungsreife zu einem Stichtag.",
		sections: [
			{
				id: "abdeckung",
				heading: "Abdeckung je Rahmenwerk",
				body: [
					"Der Überblick zeigt je gewähltem Rahmenwerk, wie viele anwendbare Anforderungen über ihre Controls erfüllt sind. Ein Control zählt voll, wenn es umgesetzt ist, halb, wenn es teilweise umgesetzt ist. Die Zahl wird bei jedem Aufruf neu gerechnet, nie gespeichert.",
					"Daneben steht „Als Nächstes“: höchstens fünf Schritte, geordnet nach Wirkung. Dazu zählen die offene Einrichtung, die Gap-Analyse, überfällige Pflichten und Abweichungen, unbesetzte Pflichtfunktionen, fehlende Pflichtbeschlüsse, unzulässige Funktionskombinationen, der Blocker mit den meisten Punkten bei der Prüfungsreife und die ersten Grundlagen (Team, Risikoappetit, Dokumente, Dienstleister). Dieselbe Liste steht oben auf Heute; was erledigt ist, verschwindet von selbst.",
				],
			},
			{
				id: "reife",
				heading: "Prüfungsreife",
				body: [
					"Die Prüfungsreife beantwortet die Frage: Wenn morgen das Audit wäre, wie gut stünde ich da? Klick rechnet sie je Rahmenwerk zu einem Stichtag aus Abdeckung, gültigen Nachweisen, frischen Wirksamkeitstests, Pflichtdokumenten und offenen Abweichungen, Findings und Sicherheitsbefunden (mit gedeckelten Abzügen). In einem Audit kommen offene Nachweisanfragen dazu.",
					"Die Blocker-Liste sortiert, was am meisten Punkte bringt. Jeder Blocker führt direkt zur passenden Stelle.",
				],
				steps: [
					"Wähl oben das Rahmenwerk und den Stichtag (zum Beispiel den Termin des Zertifizierungsaudits).",
					"Arbeite die Blocker von oben nach unten ab.",
					"Exportier den Bericht als Markdown, wenn du ihn der Geschäftsleitung oder der Prüferin vorlegen willst.",
				],
			},
			{
				id: "trend",
				heading: "Trend",
				body: [
					"Jede Nacht hält Klick einen Schnappschuss der Abdeckung fest. Daraus entsteht die Trendlinie, die zeigt, wie sich dein Stand über Wochen entwickelt.",
				],
			},
		],
		faq: [
			{
				q: "Warum sinkt meine Prüfungsreife, obwohl ich nichts geändert habe?",
				a: "Nachweise laufen ab, Tests werden alt und Pflichtdokumente brauchen ein Review. Die Prüfungsreife rechnet zum gewählten Stichtag; was dann nicht mehr gültig ist, zählt nicht.",
			},
		],
		norms: [
			{
				key: "iso27001:9.1",
				why: "Abdeckung und Trend überwachen und bewerten die Leistung des Managementsystems.",
			},
			{
				key: "nis2:Art.21(2)(f)",
				why: "Die Prüfungsreife bewertet die Wirksamkeit der Maßnahmen.",
			},
			{
				key: "soc2:CC4.1",
				why: "Laufende Bewertung, ob die Kontrollen vorhanden sind und wirken.",
			},
		],
		related: ["controls", "nachweise", "audits"],
	},
	{
		slug: "gap-analyse",
		area: "implement",
		title: "Geführte Gap-Analyse",
		summary:
			"Eine Frage je Control, Belege hochladen, bewerten, Ergebnis übernehmen und Maßnahmen planen.",
		sections: [
			{
				id: "ablauf",
				heading: "So läuft die Gap-Analyse",
				steps: [
					"Starte unter Gap-Analyse eine neue Analyse. Klick stellt aus deinen Rahmenwerken eine Frage je Control zusammen, gegliedert nach Bereichen.",
					"Beantworte jede Frage mit Ja, Teilweise, Nein oder Nicht anwendbar und schreib kurz dazu, wie es bei dir gelöst ist.",
					"Lade Belege direkt an der Frage hoch. Sie werden als Nachweis am Control gespeichert und zählen später für alle Rahmenwerke.",
					"Lass die Antworten bewerten. Die Bewertung zählt vor der Selbsteinschätzung; ein „Ja“ ohne Beleg gilt als nicht belegt und zählt halb.",
					"Tipp auf „Ergebnis übernehmen“. Klick zeigt dir vorher, welche Controls ihren Status ändern; erst dann wird übernommen.",
					"Lass Maßnahmen vorschlagen. Klick ordnet die Lücken nach Hebel (wie viele Anforderungen ein Control trägt) und legt Aufgaben an.",
					"Exportier den Bericht für die Geschäftsleitung.",
				],
			},
			{
				id: "einrichtung",
				heading: "Vorbelegung aus der Einrichtung",
				body: [
					"Was du in der Einrichtung angegeben hast, steht schon als „teilweise“ mit dem Hinweis „Aus der Einrichtung“ in der Analyse. Prüf diese Antworten und ergänze sie.",
				],
			},
			{
				id: "fragebogen",
				heading: "Derselbe Motor für Lieferanten und Produkte",
				body: [
					"Die Gap-Analyse nutzt denselben Fragebogen-Motor wie die Lieferantenbewertung und die CRA-Checkliste je Produkt. Diese setzen aber nie den Status eines Controls; ihre Ergebnisse landen am Dienstleister bzw. am Produkt.",
				],
			},
		],
		roles: [
			"Anlegen und beantworten: Bearbeiter:innen und Inhaber:innen.",
			"Ergebnis übernehmen: wer Controls ändern darf.",
		],
		norms: [
			{
				key: "iso27001:6.1.1",
				why: "Die Analyse zeigt, wo Maßnahmen fehlen, und plant ihre Umsetzung.",
			},
			{
				key: "iso27001:9.1",
				why: "Sie misst den Stand des Managementsystems.",
			},
			{
				key: "dora:Art.6(5)",
				why: "Grundlage für die jährliche Überprüfung des IKT-Risikomanagementrahmens.",
			},
		],
		related: ["controls", "nachweise", "einrichtung"],
	},
	{
		slug: "controls",
		area: "implement",
		title: "Controls und Synergien",
		summary:
			"Wie du Controls umsetzt, belegst und testest und wie die Synergien zeigen, welches Control die meisten Anforderungen trägt.",
		sections: [
			{
				id: "control",
				heading: "Was ein Control ist",
				body: [
					"Ein Control ist eine harmonisierte Maßnahme, zum Beispiel „CC-IAM-01 Zugriffsrechte nach Need-to-know“. Es trägt Anforderungen aus allen Rahmenwerken, die dasselbe verlangen. Auf der Control-Seite siehst du diese Anforderungen, den Status, Verantwortliche, Nachweise, Tests und den Nachweisbogen.",
				],
			},
			{
				id: "status",
				heading: "Status setzen",
				list: [
					"Nicht begonnen, in Arbeit, teilweise umgesetzt, umgesetzt oder nicht anwendbar.",
					"„Nicht anwendbar“ braucht eine Begründung und geht nur, wenn jedes Rahmenwerk des Controls einen Ausschluss kennt (zum Beispiel ISO 27001 Anhang A). Klick schließt die Anforderungen dann mit derselben Begründung aus; sie erscheint in der SoA.",
					"Mehrere Controls lassen sich in der Liste markieren und gemeinsam ändern.",
				],
			},
			{
				id: "nachweisbogen",
				heading: "Der Nachweisbogen",
				body: [
					"Der Nachweisbogen sammelt je Control die Prüffragen und Nachweis-Positionen aus allen getragenen Anforderungen. Ähnliche Positionen werden zusammengeführt, die Quellen bleiben sichtbar. Du beantwortest jede Frage einmal, und die Antwort gilt für jedes Rahmenwerk.",
					"Fristen werden nie vermischt: Verlangt DORA eine jährliche Prüfung und ISO 27001 eine „regelmäßige“, zeigt Klick beide und meldet einen Verstoß nur gegen die Vorgabe des jeweiligen Rahmenwerks.",
				],
			},
			{
				id: "tests",
				heading: "Wirksamkeitstests",
				steps: [
					"Öffne das Control und trag unter Tests ein, wie du die Wirksamkeit geprüft hast (zum Beispiel Stichprobe der Zugriffsrechte).",
					"Wähl das Ergebnis: bestanden, teilweise oder nicht bestanden.",
					"Ein nicht bestandener Test legt automatisch eine Abweichung mit Aufgabe an.",
				],
			},
			{
				id: "synergien",
				heading: "Synergien",
				body: [
					"Die Synergien zeigen, welche Controls die meisten Anforderungen tragen (Hebel) und was ein weiteres Rahmenwerk dich kosten würde: Wie viele Controls hast du schon, wie viele kämen neu dazu? Der Vergleich stellt zwei Rahmenwerke gegenüber und markiert, was gleichwertig, teilweise oder nur in einem verlangt ist.",
				],
			},
		],
		roles: [
			"Status, Nachweise und Tests: Bearbeiter:innen und Inhaber:innen.",
			"Verantwortlich: eine Funktion oder eine Person; die Funktion löst Klick auf die bestellte Person auf.",
		],
		automation: [
			"Bei der Einrichtung trägt Klick an neuen Controls die Funktion ein, die du für den Bereich gewählt hast.",
			"Der Tick erinnert an fällige Reviews und ablaufende Nachweise.",
		],
		norms: [
			{
				key: "iso27001:6.1.3",
				why: "Die Controls sind die Maßnahmen der Risikobehandlung; die SoA leitet sich daraus ab.",
			},
			{
				key: "iso27001:8.1",
				why: "Umsetzung und Steuerung der geplanten Maßnahmen.",
			},
			{
				key: "soc2:CC5.1",
				why: "Kontrollen auswählen und entwickeln, die Risiken auf ein akzeptables Maß senken.",
			},
			{
				key: "dora:Art.6(1-4)",
				why: "Die Controls bilden die Strategien, Richtlinien und Werkzeuge des IKT-Risikomanagementrahmens.",
			},
		],
		related: ["nachweise", "rahmenwerke", "gap-analyse"],
	},
	{
		slug: "zusammenhaenge",
		area: "implement",
		title: "Wie hängt alles zusammen?",
		summary:
			"Rahmenwerke, gemeinsame Maßnahmen, strengere Vorgaben und Widersprüche, einfach erklärt mit einem Beispiel.",
		sections: [
			{
				id: "grundbild",
				heading: "Das Grundbild",
				body: [
					"Mama, Schule und Polizei haben jeweils Regeln fürs Radfahren. Jede Regelsammlung ist ein Rahmenwerk. Alle drei sagen „Helm auf“: Du setzt ihn einmal auf, und alle drei sind zufrieden. Das ist eine gemeinsame Maßnahme. Nur die Polizei will Licht am Rad; das gilt nur bei einem Rahmenwerk.",
					"Mama sagt „um 18 Uhr zu Hause“, Oma sagt „um 17 Uhr“. Wer um 17 Uhr da ist, macht beide froh: Die strengere Vorgabe erfüllt beide. Manchmal passen Regeln nicht zusammen, etwa „alles aufheben“ und „alles wegwerfen“. Dann muss jemand entscheiden. Ein Foto vom Helm ist der Nachweis, und wenn jemand nachschaut, ist das die Prüfung.",
				],
			},
			{
				id: "praxis",
				heading: "So läuft es in der Praxis",
				body: [
					"Ein Beispiel läuft durch alle Schritte: einen schweren Vorfall melden.",
				],
				steps: COMPLIANCE_PROCESS.map(
					(s) => `${s.title}: ${s.what} ${s.example}`,
				),
			},
			{
				id: "erklaert",
				heading: "Einfach erklärt in Klick",
				list: [
					"Jedes Rahmenwerk hat oben auf seiner Seite einen Steckbrief: wozu es da ist, für wen es gilt, wer es verlangt, was ohne passiert und wie man es zeigt. Jedes Kapitel hat einen einfachen Satz.",
					"Jede Maßnahme (Control) hat oben „Einfach erklärt“: was das ist, wozu, und ein Bild aus dem Alltag.",
					"Darunter steht „Wer verlangt das – und was genau?“: alle Rahmenwerke mit ihren Anforderungen, ob die Maßnahme sie ganz oder nur teilweise erfüllt, und was bei „teilweise“ dazukommt.",
					"Auf der Seite einer Anforderung steht je Maßnahme, welche Rahmenwerke sie mit erfüllt.",
				],
			},
			{
				id: "beispiel",
				heading: "Beispiel: einen Vorfall melden",
				body: [
					"Die Maßnahme „Meldeprozess an Behörden mit Fristen“ verlangen unter anderem DORA, NIS2 und die DSGVO. Im Kern wollen alle dasselbe: Schwere Vorfälle gehen rechtzeitig an die Behörde. Die Fristen sind aber verschieden. DORA verlangt die Erstmeldung binnen 4 Stunden, NIS2 und DSGVO lassen mehr Zeit.",
					"Klick zeigt das unter „Gleiche Maßnahme, andere Strenge“ und markiert DORA als am strengsten. Schaffst du die strengste Frist, passt es für alle. Gemeldet wird trotzdem an jede Stelle einzeln, jeweils mit ihrem Formular.",
				],
			},
			{
				id: "widerspruch",
				heading: "Wenn sich Regeln widersprechen",
				body: [
					"Manche Rahmenwerke verlangen, Unterlagen lange aufzuheben, die DSGVO verlangt, Daten über Menschen zu löschen, wenn sie nicht mehr gebraucht werden. Klick zeigt das als Widerspruch an der Maßnahme. Üblich ist: sperren statt löschen, solange die Aufbewahrungsfrist läuft, danach löschen. Halte die Entscheidung im Löschkonzept fest.",
				],
			},
			{
				id: "uebersicht",
				heading: "Die Übersicht",
				body: [
					"Unter Zusammenhänge zeigt eine Übersicht in der Mitte deine Firma, darum neun Themen in Alltagssprache und außen deine Rahmenwerke. Linien zeigen, welches Rahmenwerk Maßnahmen in welchem Thema verlangt; je breiter, desto mehr. Antippen öffnet die Erklärung. Am Handy und als Tabelle stehen dieselben Zahlen als Liste.",
					"Darunter stehen die Maßnahmen je Thema und wie deine Rahmenwerke zueinander stehen: was aufeinander aufbaut, was vorgeht, was ablöst und welche Paare am meisten gemeinsam haben.",
				],
				tip: "Nicht anwendbare Anforderungen zählen hier nicht mit. Gilt NIS2 für dich nicht, weil DORA vorgeht, fehlt NIS2 in der Übersicht.",
			},
		],
		faq: [
			{
				q: "Muss ich eine geteilte Maßnahme mehrfach umsetzen?",
				a: "Nein. Du setzt sie einmal um, und sie zählt für jedes Rahmenwerk, das sie verlangt. Prüf nur, ob ein Rahmenwerk mehr will (teilweise) oder strenger ist.",
			},
			{
				q: "Woher kommen die einfachen Erklärungen?",
				a: "Aus dem Katalog von Klick. Sie helfen beim Verstehen; fachlich gilt der Text der Anforderung.",
			},
		],
		norms: [
			{
				key: "iso27001:4.2",
				why: "Die Anforderungen der interessierten Parteien kennen, auch die von Gesetzen und Kundschaft.",
			},
			{
				key: "dora:Art.19",
				why: "Beispiel für eine Maßnahme mit verschiedenen Fristen je Rahmenwerk.",
			},
			{
				key: "dsgvo:Art.33",
				why: "Meldung einer Datenpanne binnen 72 Stunden, neben den Meldungen nach DORA und NIS2.",
			},
		],
		related: ["controls", "rahmenwerke"],
	},
	{
		slug: "rahmenwerke",
		area: "implement",
		title: "Rahmenwerke, Anforderungen und SoA",
		summary:
			"Rahmenwerke wählen, Anwendbarkeit verstehen, Lücken sehen und die Erklärung zur Anwendbarkeit (SoA) pflegen.",
		sections: [
			{
				id: "auswahl",
				heading: "Rahmenwerke wählen",
				body: [
					"Klick kennt über 40 Rahmenwerke: ISO 27001, DORA, NIS2, MiCAR mit KMAG, ZAG und ZAG-MaRisk, GwG und AMLR, Travel Rule (TFR), Sanktionen, DSGVO, DAC8, AWV, Kassenrecht, KWG mit Banken-MaRisk, CRA, SOC 2, CCSS, PCI DSS, die BSI-Standards 200-1 bis 200-4, ISO 42001 für KI, TISAX für die Autoindustrie, das EU-US Data Privacy Framework, Cyber Essentials (UK), Essential Eight (Australien), aus den USA das NIST Cybersecurity Framework 2.0, NIST SP 800-53 und 800-171, CMMC, HIPAA, die Cybersicherheitsregeln der New Yorker Finanzaufsicht (23 NYCRR 500), CCPA und die Datenschutzgesetze der Bundesstaaten, dazu die Programme von Kund:innen und Plattformen AWS FTR, Microsoft SSPA und MVSP sowie die Korridore. Unter Einstellungen > Rahmenwerke & Stufe wählst du aus. Ein entferntes Rahmenwerk lässt sich jederzeit wieder aktivieren; dein Stand an den Controls bleibt.",
					"Manche Rahmenwerke haben Varianten, die du dort ebenfalls wählst: PCI DSS nach deinem Fragebogen (SAQ A, A-EP, B, B-IP, C, C-VT, P2PE, SPoC, D oder Dienstleister), IT-Grundschutz nach Absicherungsvariante (Basis, Standard, Kern), TISAX nach Prüfziel (mit Prototypenschutz oder Datenschutz), Cyber Essentials als Basis oder Plus, Essential Eight nach Reifegrad 1 bis 3, NIST SP 800-53 nach Baseline (Low, Moderate, High), CMMC nach Stufe 1 bis 3, 23 NYCRR 500 nach Einstufung (Standard, Class A, begrenzte Ausnahme), Microsoft SSPA nach Datenart. Es gelten dann nur die Anforderungen dieser Variante; die übrigen stehen mit dem Hinweis „Gilt nicht für die gewählte Variante“ in der Liste. Die Einrichtung schlägt die Variante aus deiner Antwort zu Kartendaten vor.",
				],
			},
			{
				id: "anwendbarkeit",
				heading: "Anwendbarkeit",
				list: [
					"Ob eine Anforderung gilt, folgt aus deinem Profil: Lizenzstufe (Vorbereitung bis Bank), Kryptowerte-Dienste, Produkte und Stichtag.",
					"Anforderungen mit künftigem Stichtag (zum Beispiel AMLR ab 10.07.2027) erscheinen schon im Arbeitsvorrat, damit du rechtzeitig planst.",
					"Ausschließen kannst du eine Anforderung nur, wo das Rahmenwerk es vorsieht: bei ISO 27001 die Maßnahmen aus Anhang A (in der SoA, Abschnitt 6.1.3 d), bei SOC 2 die wählbaren Kategorien Verfügbarkeit, Vertraulichkeit, Verarbeitungsintegrität und Datenschutz, bei PCI DSS jede Anforderung („Not Applicable“ mit Begründung, die Prüfer:innen nachvollziehen), bei ISO 42001 wie bei ISO 27001 nur Anhang A, bei NIST SP 800-53 über das Tailoring der Baseline, bei NIST SP 800-171 und CMMC als „nicht anwendbar“ mit Begründung im Systemsicherheitsplan, beim NIST CSF für Ergebnisse außerhalb deines Ziel-Profils, bei AWS FTR und Microsoft SSPA für Prüfpunkte, die auf deine Lösung nicht zutreffen. Der Ausschluss braucht eine Begründung und überschreibt die Ableitung.",
					"DORA, NIS2, GwG, ZAG, MiCAR, DSGVO, die BSI-Standards, HIPAA, CCPA, die US-Datenschutzgesetze, 23 NYCRR 500 und die übrigen Gesetze kennen keinen Ausschluss. Dort setzt du verhältnismäßig um, also passend zu Größe und Risiko, und beschreibst das in der Notiz.",
					"In der Gap-Analyse schließt „Nicht relevant“ nur die Anforderungen aus, die einen Ausschluss kennen. Trägt die Maßnahme eine Anforderung nur teilweise, bleibt die Anforderung anwendbar und zählt über die anderen Maßnahmen. Der Rest bleibt offen und zählt in der Bewertung mit. Bliebe etwas offen und kennt kein Rahmenwerk einen Ausschluss, ist die Antwort gesperrt.",
					"„Nicht relevant“ braucht eine Begründung mit mindestens zehn Zeichen. Eine zweite Person bestätigt sie, standardmäßig die Geschäftsleitung im Posteingang unter Heute > Freigaben (Ablauf „„Nicht relevant“ bestätigen“ unter Einstellungen > Freigaben). Erst dann entfällt die Maßnahme und steht der Ausschluss in der SoA. Ändert sich die Begründung, braucht sie eine neue Bestätigung. Dasselbe gilt für den Status „Nicht anwendbar“ an einer Maßnahme.",
					"Ausschlüsse von früher in Rahmenwerken ohne Ausschluss markiert Klick an der Anforderung und als Blocker in der Prüfungsreife, bis du sie zurücknimmst.",
				],
			},
			{
				id: "seiten",
				heading: "Die Rahmenwerk-Seite",
				list: [
					"Anforderungen: alle Pflichten mit Status, Empfehlungen, Prüffragen und Querverweisen.",
					"Lücken: was noch fehlt, sortiert nach Hebel.",
					"SoA: bei ISO 27001 die Erklärung zur Anwendbarkeit mit Begründung je Anhang-A-Control und dem Pflichtdokument-Check; als Markdown exportierbar.",
				],
			},
			{
				id: "eigene",
				heading: "Eigene Rahmenwerke",
				body: [
					"Anforderungen von Kund:innen, Vorgaben aus dem Konzern oder ein Katalog, den du selbst lizenziert hast (zum Beispiel HITRUST), legst du als eigenes Rahmenwerk an. Du ordnest jede Anforderung einer oder mehreren Klick-Maßnahmen zu. Eingeschaltet zählt das Rahmenwerk wie jedes andere: in Abdeckung, Prüfungsreife, Gap-Analyse, Nachweisbogen und Zusammenhängen.",
				],
				steps: [
					"Öffne Einstellungen > Rahmenwerke & Stufe und wähle „Eigenes Rahmenwerk anlegen“.",
					"Wähle, womit du beginnst: leer, als Kopie eines Klick-Rahmenwerks oder mit einer CSV-Datei.",
					"Leg Abschnitte und Anforderungen an. Tippe eine Anforderung an, um sie zu bearbeiten.",
					"Ordne jede Anforderung Maßnahmen zu. „Vorschläge holen“ sucht passende Maßnahmen zum Text; ganz oder teilweise, mit Notiz.",
					"Mit dem Filter „Nur nicht zugeordnete“ siehst du, was noch offen ist.",
					"Eine Inhaber:in schaltet das Rahmenwerk ein und bestätigt per Passkey. Fehlende Maßnahmen kommen dabei in deinen Arbeitsvorrat.",
				],
				list: [
					"Anlegen und pflegen dürfen Inhaber:innen, Bearbeiter:innen und Berater:innen; einschalten, zurückziehen und löschen nur Inhaber:innen.",
					"CSV-Spalten: abschnitt, abschnitt_titel, code, titel, text, bereich, controls (mit Komma getrennt, „:teilweise“ je Code möglich) und abdeckung. Gleiche Nummer aktualisiert, nichts wird gelöscht. Vor dem Übernehmen zeigt Klick, was neu ist, was sich ändert und welche Zeilen Fehler haben.",
					"Eine Kopie folgt späteren Änderungen am Klick-Rahmenwerk nicht; sie ist deine eigene Fassung.",
					"Ausschließen geht nur, wenn du ihn unter Angaben erlaubt hast, und immer mit Begründung.",
					"Ein eingeschaltetes Rahmenwerk ziehst du zurück, statt es zu löschen: Es zählt dann nicht mehr, bleibt aber erhalten.",
					"Eigene Rahmenwerke erscheinen nicht im öffentlichen Trust Center. Pflichtdokumente, Audit-Fristen und Pflicht-Freigaben gibt es nur für Klick-Rahmenwerke.",
				],
				tip: "Klick liefert keine lizenzierten Inhalte. Einen Katalog mit eigener Lizenz bringst du selbst per CSV ein.",
			},
			{
				id: "baseline",
				heading: "Baseline der Plattform",
				body: [
					"Unter Baseline siehst du, wie Klick selbst die Anforderungen erfüllt (Mandant 0): Verschlüsselung, Zugriffsschutz, Protokollierung, Backups. Das hilft dir bei der Bewertung von Klick als Dienstleister.",
				],
			},
		],
		automation: [
			"Neu gewählte Rahmenwerke schalten ihre Pflicht-Freigaben ein und ergänzen den Arbeitsvorrat.",
			"Rechtsänderungen aus dem Rechtskalender erinnern 180, 90, 30 und 7 Tage vorher.",
		],
		norms: [
			{
				key: "iso27001:6.1.3",
				why: "Die SoA ist Pflichtbestandteil der Risikobehandlung.",
			},
			{
				key: "iso27001:A.5.31",
				why: "Rechtliche, regulatorische und vertragliche Anforderungen werden ermittelt und gepflegt.",
			},
			{
				key: "dora:Art.16",
				why: "Klick prüft, ob für dich der vereinfachte Rahmen gilt.",
			},
		],
		related: ["controls", "ueberblick", "einstellungen"],
	},
	{
		slug: "nachweise",
		area: "implement",
		title: "Nachweise: hochladen, erzeugen, verfassen, unterschreiben",
		summary:
			"Wie Belege in Klick entstehen, wie lange sie gelten, wie sie geschützt sind und wie du sie per Passkey unterschreibst.",
		sections: [
			{
				id: "arten",
				heading: "Drei Wege zum Nachweis",
				list: [
					"Hochladen: Datei, Screenshot oder Link. Jede Datei läuft durch die Upload-Prüfung (Typ, Virenscan, Datenschutz-Erkennung) und wird verschlüsselt gespeichert.",
					"Erzeugen: In der Nachweis-Werkstatt baut Klick Nachweise aus deinen Registern, zum Beispiel SoA, Risikobericht, Organigramm oder Bestellungsschreiben. Es entsteht ein PDF mit den Daten als JSON und Markdown im Anhang.",
					"Verfassen: Wenn es keine Datei gibt, füllst du einen Rohling aus (zum Beispiel Protokoll einer Notfallübung, Access-Review, Schulungsnachweis). Beim Abschließen entsteht ein unveränderliches PDF.",
				],
			},
			{
				id: "hochladen",
				heading: "Einen Nachweis hochladen",
				steps: [
					"Öffne das Control oder Nachweise und tipp auf „Nachweis hinzufügen“.",
					"Wähl die Datei, gib Titel, Einstufung (öffentlich, intern, vertraulich, streng geheim) und, wenn sinnvoll, ein Gültig-bis an.",
					"Erkennt Klick Zahlungs-, Bank- oder Steuerdaten oder viele Personendaten, hebt es die Einstufung an und fragt nach. Geheimnisse wie Passwörter oder Schlüssel werden abgelehnt. Das gilt für PDF, Word, Excel, PowerPoint und Textdateien; Bilder und eingescannte PDFs enthalten keinen lesbaren Text.",
					"Verknüpf den Nachweis mit weiteren Controls, wenn er mehr belegt.",
				],
				tip: "Für eine neue Fassung nutz auf der Nachweis-Seite „Neue Fassung hochladen“. Sie übernimmt Controls und Einstufung, die alte zählt dann nicht mehr. Unter „Änderungen gegenüber der ersetzten Fassung“ siehst du, was sich im Inhalt geändert hat.",
			},
			{
				id: "werkstatt",
				heading: "Die Nachweis-Werkstatt",
				body: [
					"Die Werkstatt zeigt je Nachweisart, ob sie aktuell ist. Ein erzeugter Nachweis gilt als veraltet, wenn sich die Daten seitdem geändert haben (andere Prüfsumme) oder er abgelaufen ist. Gleiche Daten erzeugen keinen doppelten Nachweis.",
				],
			},
			{
				id: "unterschrift",
				heading: "Unterschreiben per Passkey",
				body: [
					"Nachweise wie Bestellungsschreiben, Organigramm oder Berichte an die Geschäftsleitung werden per Passkey unterschrieben. Klick bildet dafür einen Text aus Organisation, Nachweis, Prüfsumme, Person, Funktion und Zweck und lässt ihn von deinem Passkey bestätigen. Mehrere Nachweise lassen sich in einem Schritt unterschreiben.",
					"Jede:r kann die Unterschriften ohne Klick prüfen: unter „Unterschriften“ am Nachweis und über die Datei signaturen.json. Es ist eine fortgeschrittene elektronische Signatur, keine qualifizierte.",
				],
			},
			{
				id: "schutz",
				heading: "Schutz und Einstufung",
				list: [
					"Dateien werden mit einem Schlüssel deiner Organisation verschlüsselt.",
					"Vertrauliche Nachweise öffnen sich erst nach Bestätigung, streng geheime sehen Externe nur mit eigenem Zugang.",
					"Downloads und Exporte werden protokolliert und gedrosselt; ungewöhnlich viele lösen eine Meldung an die Inhaber:innen aus.",
					"Gelöschte Dateien verschwinden erst nach der Aufbewahrungsfrist der Backups endgültig.",
				],
			},
		],
		roles: [
			"Hochladen, erzeugen, verfassen: Bearbeiter:innen und Inhaber:innen.",
			"Unterschreiben als Funktion: nur, wer die Funktion bestellt innehat.",
			"Löschen: mit Bestätigung; unterschriebene Nachweise bleiben.",
		],
		automation: [
			"Der Tick erinnert an Nachweise, die bald ablaufen (nur aktuelle Fassungen).",
			"Abgelaufene Nachweise bleiben sichtbar und markiert, zählen aber nicht als gültig.",
		],
		faq: [
			{
				q: "Warum zählt mein Nachweis nicht in der Prüfungsreife?",
				a: "Er ist abgelaufen, durch eine neuere Fassung ersetzt oder mit keinem Control verknüpft.",
			},
			{
				q: "Kann ich einen verfassten Nachweis nachträglich ändern?",
				a: "Nein. Leg über „Neue Fassung“ einen Entwurf mit dem bisherigen Inhalt an, änder ihn und schließ ihn ab.",
			},
		],
		norms: [
			{
				key: "iso27001:7.5",
				why: "Nachweise sind gelenkte dokumentierte Information.",
			},
			{
				key: "iso27001:A.5.33",
				why: "Aufzeichnungen sind vor Verlust, Fälschung und unbefugtem Zugriff geschützt.",
			},
			{
				key: "iso27001:A.8.12",
				why: "Die Upload-Prüfung verhindert, dass Geheimnisse und sensible Daten unkontrolliert abfließen.",
			},
			{
				key: "zag-marisk:AT6",
				why: "Nachvollziehbare Dokumentation der Prüfungen und Entscheidungen.",
			},
		],
		related: ["controls", "fassungen", "audits"],
	},
	{
		slug: "sicherheit",
		area: "implement",
		title: "Sicherheit: Scans, Schnellcheck und Sicherheitsaufträge",
		summary:
			"Scan-Ergebnisse importieren, den passiven Schnellcheck nutzen, Befunde nach Frist beheben und Pentests geordnet beauftragen.",
		sections: [
			{
				id: "grundsatz",
				heading: "Grundsatz",
				body: [
					"Klick führt keine aktiven Angriffe aus. Scanner laufen bei dir (in der CI oder lokal), Klick nimmt die Ergebnisse an und steuert die Behebung. Der Schnellcheck ruft nur ab, was auch ein Browser lädt.",
				],
			},
			{
				id: "import",
				heading: "Scans importieren",
				steps: [
					"Lade unter Sicherheit eine Ergebnisdatei hoch (SARIF, Trivy, ZAP, OSV, Nuclei, gitleaks) oder richte unter Einstellungen > Integrationen einen CI-Zugang mit Token ein.",
					"Klick gleicht Befunde über ihren Fingerabdruck ab: Neues wird angelegt, bei einem Vollscan wird Fehlendes als behoben markiert, ein wieder auftauchender Befund öffnet sich erneut.",
					"Kritische Befunde bündelt Klick zu einer Abweichung, hohe werden Aufgaben, gefundene Geheimnisse eine Sicherheitsmeldung.",
					"Ein Vollscan zählt als Schwachstellen-Test am passenden Control (höchstens „teilweise“).",
				],
			},
			{
				id: "befunde",
				heading: "Befunde bearbeiten",
				list: [
					"Jeder Befund hat eine Frist nach Schwere; die Ampel zeigt, was überfällig ist.",
					"Akzeptieren geht nur mit Begründung und Ablaufdatum; danach öffnet Klick den Befund wieder.",
					"Geheimnisse werden beim Einlesen geschwärzt und nie im Klartext gespeichert.",
				],
			},
			{
				id: "schnellcheck",
				heading: "Schnellcheck",
				body: [
					"Der Schnellcheck prüft eine Adresse passiv: Sicherheits-Header, Cookies, TLS, DNS, security.txt, Geheimnisse im ausgelieferten JavaScript und offene Source-Maps. Er schützt dabei Klick selbst vor Missbrauch (keine internen Adressen).",
				],
			},
			{
				id: "auftraege",
				heading: "Sicherheitsaufträge",
				steps: [
					"Leg einen Auftrag an (Pentest, Security-Check, Schnellcheck, CRA-Readiness) mit Umfang, Zielen, Regeln und Zeitraum.",
					"Lade die schriftliche Beauftragung hoch; ohne sie lässt sich der Auftrag nicht beauftragen. Ab Testbeginn sind Umfang und Ziele fest.",
					"Erfass die Befunde von Hand (CVSS 3.1 rechnet Klick, CVSS 4.0 übernimmst du aus dem Bericht) oder importier sie.",
					"Bei „geliefert“ (nur mit Management-Summary) trägt Klick den Wirksamkeitstest ein und setzt die Nachtest-Frist. Ein nicht bestandener Test erzeugt eine Abweichung.",
					"Abschließen lässt sich der Auftrag erst, wenn alle Befunde behoben und nachgetestet sind. Den Bericht gibt es als ZIP.",
				],
			},
		],
		roles: [
			"Befunde akzeptieren: Recht „Sicherheit akzeptieren“, nicht für Berater:innen.",
			"Integrationen anlegen: Inhaber:innen, mit Bestätigung.",
		],
		automation: [
			"Der Tick erinnert an überschrittene Fristen, ablaufende Akzeptanzen, Testenden ohne Bericht und fällige Nachtests.",
		],
		norms: [
			{
				key: "iso27001:A.8.8",
				why: "Technische Schwachstellen werden erkannt, bewertet und behoben.",
			},
			{
				key: "dora:Art.24",
				why: "Programm zum Testen der digitalen operationalen Resilienz.",
			},
			{
				key: "dora:Art.25",
				why: "Schwachstellenscans und Penetrationstests als Testarten.",
			},
			{
				key: "nis2:Art.21(2)(e)",
				why: "Sicherheit bei Erwerb, Entwicklung und Wartung, inklusive Umgang mit Schwachstellen.",
			},
			{
				key: "cra:AnhI-II-3",
				why: "Regelmäßige Sicherheitstests der Produkte.",
			},
		],
		related: ["produkte", "audits", "vorfaelle"],
	},
];
