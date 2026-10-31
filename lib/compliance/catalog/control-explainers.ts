// Jede Maßnahme (Control) so erklärt, dass auch ein Kind sie versteht
// (Teil Z3): was das ist, wozu man es macht, ein Beispiel aus dem Alltag.
// Kurze Sätze, keine Fachwörter (Test control-explainers). Fachlich gilt der
// Text am Control; das hier ist die Übersetzung in Alltagssprache.

export type ControlExplainer = {
	// Was ist das? Ein bis zwei kurze Sätze
	what: string;
	// Wozu? Welcher Schaden damit nicht passiert
	why: string;
	// Ein Bild aus dem Alltag, beginnt mit „Wie …“
	example: string;
};

export const CONTROL_EXPLAINERS: Record<string, ControlExplainer> = {
	"CC-GOV-01": {
		what: "Die Firma schreibt auf, wie sie ihre Daten und Computer schützt. Alle können die Regeln nachlesen.",
		why: "Wer die Regeln kennt, kann sich daran halten.",
		example: "Wie die Hausordnung, die in der Schule im Flur hängt.",
	},
	"CC-GOV-02": {
		what: "Für jede wichtige Aufgabe ist klar, wer sie macht. Das steht schriftlich fest.",
		why: "Sonst denkt jede Person, dass sich jemand anderes kümmert.",
		example:
			"Wie der Klassendienst: Eine Person wischt die Tafel, eine gießt die Blumen.",
	},
	"CC-GOV-03": {
		what: "Die Chefinnen und Chefs kümmern sich selbst um die Sicherheit. Sie entscheiden und geben Geld dafür.",
		why: "Ohne die Leitung passiert nichts, weil sonst niemand das Sagen hat.",
		example:
			"Wie die Schulleitung, die entscheidet: Der Schulhof wird sicherer gemacht.",
	},
	"CC-GOV-04": {
		what: "Die Firma klärt, wer etwas von ihr erwartet und für welche Teile die Regeln gelten.",
		why: "So weiß jeder, wo die Regeln gelten und wo nicht.",
		example:
			"Wie beim Fußball: Erst werden die Grenzen des Spielfelds festgelegt, dann wird gespielt.",
	},
	"CC-GOV-05": {
		what: "Die Firma setzt sich Ziele und misst, ob sie sie erreicht. Die Leitung schaut regelmäßig auf die Zahlen.",
		why: "Nur wer misst, merkt, ob es besser wird.",
		example: "Wie ein Zeugnis, das zeigt, worin du besser geworden bist.",
	},
	"CC-GOV-06": {
		what: "Eigene Leute prüfen regelmäßig, ob die Regeln wirklich eingehalten werden.",
		why: "Fehler fallen auf, bevor jemand von außen sie findet.",
		example: "Wie eine Probe-Klassenarbeit vor der echten Arbeit.",
	},
	"CC-GOV-07": {
		what: "Wenn etwas nicht klappt, wird der Grund gesucht und behoben. Danach wird geprüft, ob es geholfen hat.",
		why: "Derselbe Fehler soll nicht zweimal passieren.",
		example:
			"Wie nach einem Sturz mit dem Rad: Bremse reparieren und dann ausprobieren.",
	},
	"CC-GOV-08": {
		what: "Wichtige Texte haben eine Nummer, eine Fassung und eine Freigabe. Alle nutzen die gültige Fassung.",
		why: "Sonst arbeitet jemand mit alten, falschen Regeln.",
		example:
			"Wie der Stundenplan: Der vom letzten Jahr gilt nicht mehr, nur der neue.",
	},
	"CC-GOV-09": {
		what: "Es steht fest, wer wem was sagt. Und wer im Notfall die Behörden anruft.",
		why: "Im Ernstfall verliert niemand Zeit mit Suchen.",
		example: "Wie die Telefonliste der Klasse für Notfälle.",
	},
	"CC-GOV-10": {
		what: "Die Firma führt eine Liste aller Gesetze, die für sie gelten. Neue Gesetze bemerkt sie rechtzeitig.",
		why: "Man kann nur Regeln einhalten, die man kennt.",
		example: "Wie ein Kalender mit allen Prüfungsterminen des Schuljahrs.",
	},
	"CC-GOV-11": {
		what: "Wichtige Dinge macht nicht eine Person allein. Eine Person macht es, eine andere prüft.",
		why: "So fallen Fehler und Betrug leichter auf.",
		example:
			"Wie beim Kuchenverkauf: Einer kassiert, eine andere zählt am Ende das Geld.",
	},
	"CC-GOV-12": {
		what: "Bei neuen Projekten wird von Anfang an an Sicherheit gedacht.",
		why: "Später nachbessern ist schwerer und teurer.",
		example: "Wie beim Hausbau: Die Feuertreppe kommt gleich mit in den Plan.",
	},
	"CC-GOV-13": {
		what: "Jemand, der nicht selbst mitarbeitet, schaut ab und zu genau hin.",
		why: "Wer selbst beteiligt ist, übersieht eigene Fehler leicht.",
		example: "Wie ein Freund, der deinen Aufsatz Korrektur liest.",
	},
	"CC-GOV-14": {
		what: "Für Sicherheit gibt es genug Zeit, Leute und Geld.",
		why: "Ohne diese Mittel bleiben gute Pläne nur auf dem Papier.",
		example: "Wie Taschengeld, das extra für den Fahrradhelm gedacht ist.",
	},
	"CC-GOV-15": {
		what: "Die Firma plant, wie ihre Technik auch bei Störungen weiterläuft.",
		why: "Kunden sollen sich auf die Firma verlassen können, auch wenn etwas schiefgeht.",
		example: "Wie ein Plan, was ihr macht, wenn der Schulbus ausfällt.",
	},
	"CC-GOV-16": {
		what: "Auch die Chefinnen und Chefs lernen regelmäßig, welche Gefahren es für Computer und Daten gibt.",
		why: "Wer entscheidet, muss die Gefahren verstehen.",
		example:
			"Wie die Lehrerinnen und Lehrer, die selbst einen Erste-Hilfe-Kurs machen.",
	},
	"CC-GOV-17": {
		what: "Die Firma tauscht sich mit anderen über neue Gefahren aus.",
		why: "Wer von anderen hört, kann sich früher schützen.",
		example: "Wie Nachbarn, die sich warnen, wenn Diebe unterwegs sind.",
	},
	"CC-GOV-18": {
		what: "Die Firma prüft, ob das Gesetz für Cybersicherheit für sie gilt. Wenn ja, meldet sie sich beim zuständigen Amt an.",
		why: "Nur wer angemeldet ist, erfüllt die Pflicht und bekommt Warnungen.",
		example: "Wie die Anmeldung im Sportverein, bevor du mitspielen darfst.",
	},
	"CC-GOV-19": {
		what: "Eine eigene Stelle passt auf die Gefahren der Technik auf. Sie gehört nicht zur Technik-Abteilung selbst.",
		why: "Wer die Technik baut, soll nicht allein über ihre Gefahren urteilen.",
		example:
			"Wie der Schiedsrichter, der in keiner der beiden Mannschaften spielt.",
	},
	"CC-GOV-20": {
		what: "Die Firma prüft, ob ihre Regeln zu den genauen Vorgaben der Aufsicht passen.",
		why: "Die Aufsicht erklärt Gesetze oft genauer, das gehört in die eigenen Regeln.",
		example:
			"Wie die Lehrerin, die erklärt, wie die Hausaufgabe genau aussehen soll.",
	},
	"CC-GOV-22": {
		what: "Wer die Firma leitet oder ihr gehört, muss zuverlässig sein und sich auskennen. Das prüft die Aufsicht.",
		why: "Fremdes Geld soll nur in ehrliche und fähige Hände.",
		example:
			"Wie der Busfahrer, der einen Führerschein und ein sauberes Führungszeugnis braucht.",
	},
	"CC-GOV-23": {
		what: "Die Leitung schreibt auf, was die Firma vorhat und wie viel Risiko sie eingehen will.",
		why: "Alle wissen, wohin es geht und wo die Grenze ist.",
		example:
			"Wie der Plan für die Klassenfahrt mit Ziel und Taschengeld-Grenze.",
	},
	"CC-GOV-24": {
		what: "Bevor die Firma etwas Neues anbietet, prüfen mehrere Leute die Gefahren.",
		why: "So entsteht kein Angebot, das die Firma nicht im Griff hat.",
		example:
			"Wie ein neues Klettergerüst, das erst geprüft wird, bevor Kinder darauf dürfen.",
	},
	"CC-RSK-01": {
		what: "Die Firma legt fest, wie sie Gefahren bewertet und welche sie hinnimmt.",
		why: "So bewerten alle gleich und nicht nach Bauchgefühl.",
		example:
			"Wie eine Notentabelle: Ab wie vielen Fehlern gibt es welche Note?",
	},
	"CC-RSK-02": {
		what: "Die Firma schreibt alle Gefahren auf und schätzt: Wie wahrscheinlich? Wie schlimm?",
		why: "Wer die größten Gefahren kennt, kümmert sich zuerst um sie.",
		example:
			"Wie vor dem Ausflug: Wo könnte jemand hinfallen, wo ist es gefährlich?",
	},
	"CC-RSK-03": {
		what: "Für jede Gefahr steht fest, was dagegen getan wird. Eine Liste zeigt, welche Schutzregeln gelten.",
		why: "Aus dem Erkennen wird ein Tun.",
		example: "Wie bei Glatteis: Sand streuen und gute Schuhe anziehen.",
	},
	"CC-RSK-04": {
		what: "Einmal im Jahr wird geprüft, ob die Art, Gefahren zu bewerten, noch passt.",
		why: "Die Welt ändert sich, die Methode muss mitgehen.",
		example:
			"Wie die Fahrradprüfung, die an neue Verkehrsregeln angepasst wird.",
	},
	"CC-RSK-05": {
		what: "Die Firma sammelt Wissen über neue Angriffe und Tricks von Betrügern.",
		why: "Wer die Tricks kennt, fällt nicht darauf herein.",
		example: "Wie die Warnung im Radio vor falschen Polizisten am Telefon.",
	},
	"CC-RSK-06": {
		what: "Die Firma rechnet aus, wie viel Verlust sie aushalten kann, ohne pleitezugehen.",
		why: "So geht sie nicht mehr Risiko ein, als sie tragen kann.",
		example:
			"Wie beim Taschengeld: Nicht mehr ausgeben, als im Sparschwein ist.",
	},
	"CC-RSK-07": {
		what: "Jeder Schaden im Betrieb wird aufgeschrieben, mit Ursache und Kosten.",
		why: "Aus vielen kleinen Schäden lernt man, wo es oft schiefgeht.",
		example:
			"Wie ein Heft, in das du jedes kaputte Spielzeug und den Grund schreibst.",
	},
	"CC-AST-01": {
		what: "Die Firma hat eine Liste aller Geräte, Programme und Daten. Zu jedem Eintrag steht, wer sich kümmert.",
		why: "Was niemand kennt, kann niemand schützen.",
		example:
			"Wie die Liste im Klassenzimmer: Wem gehört welches Fach im Schrank?",
	},
	"CC-AST-02": {
		what: "Jede Information bekommt ein Schild: öffentlich, intern, vertraulich oder streng geheim.",
		why: "So weiß jeder, wie vorsichtig er damit umgehen muss.",
		example: "Wie ein Tagebuch mit Schloss, das nicht jeder lesen darf.",
	},
	"CC-AST-03": {
		what: "Es gibt Regeln, wie man Geräte der Firma benutzt. Wer geht, gibt alles zurück.",
		why: "Geräte und Daten bleiben nicht bei Leuten, die nicht mehr da sind.",
		example:
			"Wie die Schulbücher, die am Ende des Jahres zurückgegeben werden.",
	},
	"CC-AST-04": {
		what: "Eine Karte zeigt, welche Arbeit von welchem Programm und welchem Helfer abhängt.",
		why: "Fällt etwas aus, sieht man sofort, was noch betroffen ist.",
		example:
			"Wie beim Domino: Man sieht vorher, welcher Stein welchen umwirft.",
	},
	"CC-AST-05": {
		what: "Die Firma weiß, welche Programme sie gekauft hat und was sie damit darf.",
		why: "So nutzt niemand etwas, das er nicht nutzen darf.",
		example:
			"Wie die Erlaubnis, ein Lied beim Schulkonzert öffentlich zu spielen.",
	},
	"CC-AST-06": {
		what: "Einmal im Jahr wird geprüft, ob alte Technik noch sicher ist.",
		why: "Alte Geräte bekommen oft keine Reparaturen mehr und werden unsicher.",
		example:
			"Wie ein altes Fahrrad, dessen Bremsen vor jeder Saison geprüft werden.",
	},
	"CC-AST-07": {
		what: "Es gibt Regeln, wie Daten sicher weitergegeben werden: per Mail, als Datei oder auf Papier.",
		why: "Unterwegs sollen Daten nicht verloren gehen oder mitgelesen werden.",
		example: "Wie ein Brief im verschlossenen Umschlag statt einer Postkarte.",
	},
	"CC-AST-08": {
		what: "Zum Ausprobieren werden keine echten Daten von Menschen benutzt. Echte Daten werden vorher unkenntlich gemacht.",
		why: "Bei Tests passieren Fehler, dabei sollen keine echten Daten nach außen geraten.",
		example: "Wie Übungspuppen beim Erste-Hilfe-Kurs statt echter Verletzter.",
	},
	"CC-AST-09": {
		what: "Technik passt auf, dass wichtige Daten die Firma nicht unbemerkt verlassen.",
		why: "Geheimnisse sollen weder aus Versehen noch absichtlich nach draußen gelangen.",
		example:
			"Wie die Schranke am Ladenausgang, die piept, wenn etwas nicht bezahlt ist.",
	},
	"CC-AST-10": {
		what: "Es steht fest, wie lange Daten aufbewahrt und wann sie gelöscht werden.",
		why: "Nicht zu früh wegwerfen, aber auch nicht ewig herumliegen lassen.",
		example: "Wie alte Hefte: ein paar Jahre im Keller, dann ins Altpapier.",
	},
	"CC-IAM-01": {
		what: "Es ist geregelt, wer welche Türen und Programme öffnen darf.",
		why: "Jede Person kommt nur dorthin, wo sie arbeiten muss.",
		example:
			"Wie Schlüssel: Der Hausmeister hat mehr Schlüssel als ein Schüler.",
	},
	"CC-IAM-02": {
		what: "Wer neu kommt, bekommt Zugänge, und wer die Aufgabe wechselt, neue. Wer geht, verliert alle.",
		why: "Niemand behält Zugänge, die er nicht mehr braucht.",
		example: "Wie der Schülerausweis, der beim Schulwechsel abgegeben wird.",
	},
	"CC-IAM-03": {
		what: "Zum Anmelden reicht ein Passwort allein nicht. Es braucht etwas Zweites, zum Beispiel den Fingerabdruck am Handy.",
		why: "Ein gestohlenes Passwort öffnet dann allein keine Tür.",
		example: "Wie ein Fahrradschloss mit Schlüssel und Zahlenkombination.",
	},
	"CC-IAM-04": {
		what: "Zugänge, mit denen man alles darf, werden besonders gut geschützt und beobachtet.",
		why: "Ein Generalschlüssel in falschen Händen richtet den größten Schaden an.",
		example: "Wie der Schlüssel zum Lehrerzimmer, der nicht herumliegt.",
	},
	"CC-IAM-05": {
		what: "Regelmäßig wird geprüft, ob alle ihre Zugänge noch brauchen.",
		why: "Mit der Zeit sammeln sich zu viele Rechte an.",
		example:
			"Wie das Aufräumen am Schlüsselbrett: Welche Schlüssel braucht wer noch?",
	},
	"CC-IAM-06": {
		what: "Nur wer am Programm arbeitet, darf seinen Bauplan sehen und ändern.",
		why: "So baut niemand heimlich Fehler oder Hintertüren ein.",
		example:
			"Wie das geheime Rezept einer Bäckerei, das nicht jeder ändern darf.",
	},
	"CC-IAM-07": {
		what: "Auch von zu Hause wird jede Anmeldung genau geprüft. Niemand wird einfach so hereingelassen.",
		why: "Angreifer können überall sein, auch scheinbar drinnen.",
		example:
			"Wie die Klingel mit Kamera: Erst schauen, wer da ist, dann aufmachen.",
	},
	"CC-IAM-08": {
		what: "Nach einer Weile ohne Benutzung wird man abgemeldet. Für Wichtiges bestätigt man sich noch einmal.",
		why: "Ein unbeaufsichtigter, offener Bildschirm ist wie eine offene Tür.",
		example: "Wie das Handy, das sich nach kurzer Zeit von selbst sperrt.",
	},
	"CC-CRY-01": {
		what: "Gespeicherte Daten werden verschlüsselt. Ohne Schlüssel sind sie nur Zeichensalat.",
		why: "Wer eine Festplatte stiehlt, kann damit nichts anfangen.",
		example:
			"Wie eine Geheimschrift, die nur Freunde mit dem Codebuch lesen können.",
	},
	"CC-CRY-02": {
		what: "Besonders heikle Angaben werden extra verschlüsselt, für jede Kundenfirma mit einem eigenen Schlüssel.",
		why: "Selbst wenn ein Teil offenliegt, bleiben die heiklen Angaben geschützt.",
		example: "Wie ein kleiner Tresor im Haus für den Schmuck.",
	},
	"CC-CRY-03": {
		what: "Die geheimen Schlüssel werden sicher aufbewahrt und regelmäßig gewechselt.",
		why: "Ein verlorener Schlüssel soll nicht für immer alles öffnen.",
		example:
			"Wie ein neues Türschloss, nachdem jemand den Hausschlüssel verloren hat.",
	},
	"CC-CRY-04": {
		what: "Die Firma schreibt auf, wo und wie sie verschlüsselt.",
		why: "So wird überall gleich gut verschlüsselt und nicht zufällig.",
		example: "Wie eine Anleitung, welche Tür welches Schloss bekommt.",
	},
	"CC-CRY-05": {
		what: "Daten werden auf dem Weg durchs Internet verschlüsselt.",
		why: "Niemand kann unterwegs mitlesen oder etwas verändern.",
		example: "Wie ein Geldtransporter statt Geld in einer offenen Tasche.",
	},
	"CC-PHY-01": {
		what: "Räume mit wichtiger Technik sind abgeschlossen. Nur wer darf, kommt hinein.",
		why: "Diebe und Neugierige sollen nicht an die Geräte kommen.",
		example: "Wie das Lehrerzimmer, in das nicht jeder einfach hineingeht.",
	},
	"CC-PHY-02": {
		what: "Strom, Kühlung und Kabel sind gegen Ausfall, Wasser und Feuer geschützt.",
		why: "Ohne Strom oder nach einem Wasserschaden läuft keine Technik.",
		example: "Wie die Taschenlampe mit Ersatzbatterien für einen Stromausfall.",
	},
	"CC-PHY-03": {
		what: "Wer den Platz verlässt, sperrt den Bildschirm und räumt Papiere weg.",
		why: "Andere sollen nicht einfach mitlesen können.",
		example: "Wie das Heft, das du zuklappst, bevor du in die Pause gehst.",
	},
	"CC-PHY-04": {
		what: "Laptops, Handys und USB-Sticks sind verschlüsselt und gesichert.",
		why: "Ein verlorenes Gerät verrät dann keine Geheimnisse.",
		example: "Wie ein Tagebuch mit Schloss, falls du es im Bus vergisst.",
	},
	"CC-PHY-05": {
		what: "Geräte werden gewartet. Alte Geräte werden so entsorgt, dass keine Daten übrig bleiben.",
		why: "Auf alten Festplatten stecken oft noch Geheimnisse.",
		example: "Wie Briefe, die du zerreißt, bevor sie ins Altpapier kommen.",
	},
	"CC-OPS-01": {
		what: "Computer werden so eingestellt, dass nur das Nötige läuft. Alles andere wird abgeschaltet.",
		why: "Jede unnötige Funktion ist eine mögliche Lücke.",
		example: "Wie ein Haus, bei dem alle Fenster zu sind, die niemand braucht.",
	},
	"CC-OPS-02": {
		what: "Ein Schutzprogramm sucht nach Viren und hält sie auf.",
		why: "Viren können Daten stehlen oder alles lahmlegen.",
		example: "Wie Händewaschen, damit keine Krankheit weitergegeben wird.",
	},
	"CC-OPS-03": {
		what: "Bekannte Fehler in Programmen werden schnell repariert, mit Updates.",
		why: "Angreifer nutzen bekannte Fehler am liebsten.",
		example: "Wie ein Loch im Zaun, das sofort geflickt wird.",
	},
	"CC-OPS-04": {
		what: "Für jedes Gerät gibt es eine sichere Grundeinstellung. Abweichungen fallen auf.",
		why: "So ist überall derselbe Schutz eingestellt.",
		example:
			"Wie eine Checkliste, wie jedes Fahrrad vor dem Ausflug eingestellt sein muss.",
	},
	"CC-OPS-05": {
		what: "Die Firma beobachtet, ob die Technik genug Platz und Kraft hat und läuft.",
		why: "Ein volles oder überlastetes System fällt aus.",
		example: "Wie der Blick auf die Tankanzeige vor einer langen Fahrt.",
	},
	"CC-OPS-06": {
		what: "Nur erlaubte Programme dürfen auf die Geräte.",
		why: "So kommen keine schädlichen Programme darauf.",
		example: "Wie eine Gästeliste: Wer nicht draufsteht, kommt nicht hinein.",
	},
	"CC-OPS-07": {
		what: "Werkzeuge, mit denen man alles verändern kann, dürfen nur wenige benutzen.",
		why: "Solche Werkzeuge können großen Schaden anrichten.",
		example:
			"Wie die Säge im Werkraum, die nur mit einer Lehrkraft benutzt wird.",
	},
	"CC-OPS-08": {
		what: "Wichtige Arbeitsschritte stehen als Anleitung aufgeschrieben.",
		why: "Auch eine Vertretung kann dann alles richtig machen.",
		example: "Wie ein Kochrezept, damit der Kuchen jedes Mal gelingt.",
	},
	"CC-OPS-09": {
		what: "Alle Computer zeigen genau dieselbe Uhrzeit.",
		why: "Nur so lässt sich später sagen, was wann passiert ist.",
		example: "Wie beim Wettlauf: Alle Stoppuhren müssen gleich gehen.",
	},
	"CC-OPS-10": {
		what: "Programme laufen in einem abgeschlossenen Bereich. Dort können sie wenig kaputt machen.",
		why: "Ein Fehler oder Angriff bleibt in seinem Kasten eingesperrt.",
		example:
			"Wie der Sandkasten: Der Sand bleibt drin und verteilt sich nicht auf dem ganzen Spielplatz.",
	},
	"CC-LOG-01": {
		what: "Wichtige Ereignisse werden in ein Protokoll geschrieben, das niemand heimlich ändern kann.",
		why: "Später lässt sich ehrlich nachprüfen, wer was getan hat.",
		example: "Wie ein Tagebuch mit Tinte, in dem man nichts radieren kann.",
	},
	"CC-LOG-02": {
		what: "Programme beobachten, ob etwas Ungewöhnliches passiert, und schlagen Alarm.",
		why: "Ein Angriff wird so früh bemerkt.",
		example: "Wie ein Rauchmelder, der piept, bevor das Feuer groß wird.",
	},
	"CC-LOG-03": {
		what: "Es steht fest, was aufgezeichnet wird und wie lange die Aufzeichnungen bleiben.",
		why: "Wichtige Spuren sind da, wenn man sie braucht.",
		example: "Wie das Klassenbuch, das einige Jahre aufbewahrt wird.",
	},
	"CC-NET-01": {
		what: "Das Netz der Firma ist in Bereiche geteilt. Nicht jeder Bereich kommt in jeden anderen.",
		why: "Ein Angreifer kommt so nicht überall hin.",
		example:
			"Wie ein Schiff mit dichten Kammern: Ein Leck flutet nicht das ganze Schiff.",
	},
	"CC-NET-02": {
		what: "Ein Filter am Eingang lässt nur erlaubten Verkehr ins Netz der Firma.",
		why: "Unerwünschte Besucher bleiben draußen.",
		example: "Wie ein Türsteher, der nur Eingeladene hereinlässt.",
	},
	"CC-NET-03": {
		what: "Dienste im Netz sind sicher eingestellt. Gefährliche Webseiten werden gesperrt.",
		why: "Ein Klick auf eine böse Seite soll nichts anrichten.",
		example: "Wie die Kindersicherung am Familiencomputer.",
	},
	"CC-DEV-01": {
		what: "Beim Bauen von Software gehört Sicherheit zu jedem Schritt.",
		why: "Fehler werden früh gefunden, wenn sie noch leicht zu beheben sind.",
		example: "Wie beim Lego-Bauen: Nach jedem Schritt schaust du, ob es passt.",
	},
	"CC-DEV-02": {
		what: "Vor dem Bauen wird überlegt: Wie könnte jemand das angreifen?",
		why: "Wer die Angriffe kennt, baut den Schutz gleich mit ein.",
		example:
			"Wie bei der Sandburg: Woher kommt die Welle? Dort kommt eine Mauer hin.",
	},
	"CC-DEV-03": {
		what: "Wer programmiert, hält sich an sichere Regeln. Ein Prüfprogramm sucht nach Fehlern.",
		why: "Viele Lücken entstehen durch kleine Programmierfehler.",
		example: "Wie die Rechtschreibprüfung beim Schreiben am Computer.",
	},
	"CC-DEV-04": {
		what: "Neue Software wird getestet, bevor sie benutzt wird, auch gegen Angriffe.",
		why: "Lücken sollen gefunden werden, bevor Angreifer sie finden.",
		example: "Wie der Crashtest, bevor ein neues Auto verkauft wird.",
	},
	"CC-DEV-05": {
		what: "Fremde Bausteine in der Software werden geprüft, bevor man sie benutzt.",
		why: "Ein fauler Baustein macht das ganze Programm unsicher.",
		example: "Wie beim Backen: Abgelaufene Eier kommen nicht in den Teig.",
	},
	"CC-DEV-06": {
		what: "Jede Änderung an wichtiger Technik wird geplant, geprüft und freigegeben.",
		why: "Spontane Änderungen machen oft etwas kaputt.",
		example: "Wie ein neuer Stundenplan, den erst die Schulleitung absegnet.",
	},
	"CC-DEV-07": {
		what: "Ausprobieren, Testen und der echte Betrieb finden an getrennten Orten statt.",
		why: "Ein Fehler beim Testen soll den echten Betrieb nicht stören.",
		example: "Wie die Generalprobe, bevor das Theaterstück vor Publikum läuft.",
	},
	"CC-DEV-08": {
		what: "Lässt die Firma Software von einer anderen Firma bauen, gelten dieselben Sicherheitsregeln.",
		why: "Fremde Arbeit soll genauso sicher sein wie die eigene.",
		example: "Wie ein Handwerker, der sich an die Hausregeln halten muss.",
	},
	"CC-TST-01": {
		what: "Die Firma testet regelmäßig, ob ihre Technik Störungen und Angriffe aushält.",
		why: "Erst ein Test zeigt, ob der Schutz wirklich wirkt.",
		example: "Wie die Feuerübung in der Schule.",
	},
	"CC-TST-02": {
		what: "Erfahrene Fachleute greifen die Firma an wie echte Angreifer, mit Erlaubnis.",
		why: "So zeigt sich, wo echte Angreifer hineinkämen.",
		example:
			"Wie ein Freund, der testen darf, ob er in dein Baumhaus einbrechen kann.",
	},
	"CC-TPR-01": {
		what: "Die Firma führt eine Liste aller Helfer von außen und was sie für sie tun.",
		why: "So weiß sie jederzeit, wer an ihren Daten und Diensten arbeitet.",
		example: "Wie die Liste aller Eltern, die beim Schulfest helfen.",
	},
	"CC-TPR-02": {
		what: "Die Firma legt fest, wie sie Helfer von außen auswählt und überwacht.",
		why: "So hängt sie nicht blind von anderen ab.",
		example: "Wie Regeln dafür, welchen Babysitter ihr nehmt.",
	},
	"CC-TPR-03": {
		what: "Bevor ein Helfer beauftragt wird, prüft die Firma, ob er zuverlässig und sicher ist.",
		why: "Ein unsicherer Helfer bringt die eigene Firma in Gefahr.",
		example: "Wie Bewertungen lesen, bevor man etwas im Internet kauft.",
	},
	"CC-TPR-04": {
		what: "Im Vertrag mit dem Helfer stehen wichtige Sicherheitsregeln und Rechte.",
		why: "Was im Vertrag steht, kann man auch einfordern.",
		example:
			"Wie eine Abmachung mit dem Nachbarn, die ihr aufschreibt und unterschreibt.",
	},
	"CC-TPR-05": {
		what: "Auch nach dem Vertragsschluss schaut die Firma regelmäßig, ob der Helfer gute Arbeit macht.",
		why: "Ein guter Helfer kann mit der Zeit schlechter werden.",
		example: "Wie bei der Nachhilfe: Werden die Noten wirklich besser?",
	},
	"CC-TPR-06": {
		what: "Es gibt einen Plan, wie die Firma von einem Helfer zu einem anderen wechselt.",
		why: "Fällt ein Helfer aus, bleibt die Firma nicht hängen.",
		example: "Wie ein Ersatzspieler auf der Bank.",
	},
	"CC-TPR-07": {
		what: "Die Firma hängt nicht zu sehr von einem einzigen Helfer ab. Sie weiß auch, wen ihre Helfer selbst beauftragen.",
		why: "Hängt alles an einem Helfer, steht bei seinem Ausfall alles still.",
		example: "Wie die Regel: Leg nicht alle Eier in einen Korb.",
	},
	"CC-TPR-08": {
		what: "Für Dienste aus dem Internet, zum Beispiel Online-Speicher, gibt es feste Regeln.",
		why: "Daten bei fremden Rechenzentren sollen genauso sicher sein.",
		example: "Wie Regeln, welche Sachen du bei Freunden lassen darfst.",
	},
	"CC-TPR-09": {
		what: "Wichtige Helfer meldet die Firma der Aufsicht. Sie prüft auch, ob ein Helfer unter besonderer Aufsicht steht.",
		why: "Die Aufsicht will wissen, von wem Finanzfirmen abhängen.",
		example:
			"Wie die Schule, die wissen will, welches Busunternehmen die Kinder fährt.",
	},
	"CC-TPR-10": {
		what: "Gibt die Firma wichtige Aufgaben an andere ab, prüft und meldet sie das. Eine Person ist dafür zuständig.",
		why: "Die Verantwortung bleibt bei der Firma, auch wenn andere die Arbeit machen.",
		example:
			"Wie Eltern, die den Babysitter aussuchen und trotzdem verantwortlich bleiben.",
	},
	"CC-INC-01": {
		what: "Für Sicherheitsvorfälle gibt es einen festen Ablauf. Jeder Vorfall wird aufgeschrieben.",
		why: "Im Notfall weiß jeder, was zu tun ist.",
		example: "Wie der Ablauf, wenn sich jemand auf dem Schulhof verletzt.",
	},
	"CC-INC-02": {
		what: "Jeder Vorfall wird eingeschätzt: klein, mittel oder schwer.",
		why: "Schwere Vorfälle brauchen schnelle Hilfe und müssen gemeldet werden.",
		example:
			"Wie beim Arzt: Ein Kratzer ist kein Notfall, ein Beinbruch schon.",
	},
	"CC-INC-03": {
		what: "Schwere Vorfälle werden den Behörden rechtzeitig gemeldet. Jede Regel hat ihre eigene Frist.",
		why: "Die Behörden können dann andere warnen und helfen.",
		example: "Wie die Krankmeldung, die bis acht Uhr in der Schule sein muss.",
	},
	"CC-INC-04": {
		what: "Für typische Vorfälle gibt es fertige Anleitungen, auch dafür, was man wem sagt.",
		why: "In der Aufregung vergisst man sonst wichtige Schritte.",
		example: "Wie der Notfallzettel am Kühlschrank mit den wichtigen Nummern.",
	},
	"CC-INC-05": {
		what: "Nach jedem Vorfall wird besprochen, was man besser machen kann.",
		why: "So passiert derselbe Fehler nicht noch einmal.",
		example: "Wie die Besprechung nach einem verlorenen Fußballspiel.",
	},
	"CC-INC-06": {
		what: "Nach einem Angriff werden Spuren gesichert, ohne sie zu verwischen.",
		why: "So lässt sich herausfinden, was passiert ist, auch vor Gericht.",
		example:
			"Wie die Polizei, die den Tatort absperrt, bevor jemand etwas anfasst.",
	},
	"CC-INC-07": {
		what: "Alle in der Firma können Auffälligkeiten einfach und ohne Angst melden.",
		why: "Wer etwas bemerkt, soll es sofort sagen können.",
		example: "Wie ein Kummerkasten, in den jeder einen Zettel werfen kann.",
	},
	"CC-BCM-01": {
		what: "Die Firma plant, wie wichtige Arbeit auch im Notfall weiterläuft.",
		why: "Kunden sollen nicht im Stich gelassen werden.",
		example: "Wie der Plan, was passiert, wenn die Schule ausfällt.",
	},
	"CC-BCM-02": {
		what: "Die Firma prüft, welche Arbeit am wichtigsten ist und wie lange sie ausfallen darf.",
		why: "Im Notfall wird zuerst das Wichtigste gerettet.",
		example:
			"Wie beim Stromausfall: Zuerst kümmert ihr euch um den Kühlschrank, dann um den Fernseher.",
	},
	"CC-BCM-03": {
		what: "Von allen wichtigen Daten gibt es Kopien. Es wird geübt, sie zurückzuholen.",
		why: "Gehen Daten verloren, sind sie nicht für immer weg.",
		example: "Wie eine Kopie deiner Fotos auf einem zweiten Gerät.",
	},
	"CC-BCM-04": {
		what: "Wichtige Technik ist doppelt vorhanden. Fällt ein Teil aus, übernimmt das andere.",
		why: "Ein einzelner Ausfall legt nicht alles lahm.",
		example: "Wie der Ersatzreifen im Auto.",
	},
	"CC-BCM-05": {
		what: "Die Notfallpläne werden regelmäßig geübt.",
		why: "Erst die Übung zeigt, ob der Plan funktioniert.",
		example: "Wie der Probealarm in der Schule.",
	},
	"CC-BCM-06": {
		what: "Für große Krisen gibt es ein Team, das schnell entscheidet.",
		why: "In der Krise braucht es klare Führung.",
		example:
			"Wie die Schulleitung, die bei einem Unwetter entscheidet, ob alle nach Hause dürfen.",
	},
	"CC-CMP-01": {
		what: "Die Firma hat feste Abläufe, um die Daten von Menschen zu schützen.",
		why: "Menschen sollen selbst bestimmen, was mit ihren Daten passiert.",
		example:
			"Wie das Versprechen, Geheimnisse von Freunden nicht weiterzuerzählen.",
	},
	"CC-CMP-02": {
		what: "Prüfer von außen bestätigen schriftlich, dass die Firma die Regeln einhält.",
		why: "Kunden müssen dann nicht alles selbst prüfen.",
		example: "Wie das Seepferdchen-Abzeichen, das zeigt: Du kannst schwimmen.",
	},
	"CC-HR-01": {
		what: "Neue Mitarbeitende werden vor dem Start überprüft, zum Beispiel ihre Zeugnisse.",
		why: "Wichtige Aufgaben sollen nur vertrauenswürdige Menschen bekommen.",
		example: "Wie der Fußballtrainer, der ein Führungszeugnis vorzeigen muss.",
	},
	"CC-HR-02": {
		what: "Im Arbeitsvertrag steht, dass man Geheimnisse bewahrt, auch nach dem Ende der Arbeit.",
		why: "Wissen über die Firma soll nicht mitgenommen werden.",
		example:
			"Wie das Versprechen, das Überraschungsgeschenk nicht zu verraten.",
	},
	"CC-HR-03": {
		what: "Alle lernen regelmäßig, wie sie sicher arbeiten und Betrug erkennen.",
		why: "Die meisten Angriffe beginnen mit einem Trick an einem Menschen.",
		example:
			"Wie der Verkehrsunterricht, damit du sicher über die Straße kommst.",
	},
	"CC-HR-04": {
		what: "Wer absichtlich gegen die Regeln verstößt, muss mit Folgen rechnen. Die Folgen stehen vorher fest.",
		why: "Regeln wirken nur, wenn ein Verstoß nicht egal ist.",
		example: "Wie die Gelbe Karte beim Fußball.",
	},
	"CC-AML-01": {
		what: "Die Firma prüft, wie Kriminelle sie benutzen könnten, um schmutziges Geld sauber aussehen zu lassen.",
		why: "Wer die Schlupflöcher kennt, kann sie schließen.",
		example:
			"Wie ein Ladenbesitzer, der überlegt, wo bei ihm Falschgeld landen könnte.",
	},
	"CC-AML-02": {
		what: "Ein Handbuch beschreibt, wie die Firma verhindert, dass schmutziges Geld durch sie fließt.",
		why: "Alle handeln gleich und nach den Regeln.",
		example: "Wie die Spielregeln, die in der Spieleschachtel liegen.",
	},
	"CC-AML-03": {
		what: "Eine Person ist für alles rund um schmutziges Geld zuständig. Eine zweite vertritt sie.",
		why: "Bei einem Verdacht gibt es immer jemanden, der entscheidet.",
		example: "Wie die Vertrauenslehrerin, an die man sich wenden kann.",
	},
	"CC-AML-04": {
		what: "Die Firma prüft, wer ihre Kundinnen und Kunden sind und woher deren Geld kommt.",
		why: "Kriminelle sollen sich nicht hinter falschen Namen verstecken.",
		example: "Wie der Ausweis, den man in der Bibliothek zeigen muss.",
	},
	"CC-AML-05": {
		what: "Die Firma prüft sicher, wer jemand ist, zum Beispiel per Video oder mit dem Online-Ausweis.",
		why: "So weiß sie wirklich, mit wem sie es zu tun hat.",
		example: "Wie beim Abholen eines Pakets mit dem Ausweis.",
	},
	"CC-AML-06": {
		what: "Programme schauen auf alle Zahlungen und melden Ungewöhnliches.",
		why: "Verdächtige Geldströme fallen auf.",
		example:
			"Wie Eltern, die merken, wenn das Taschengeld plötzlich sehr schnell weg ist.",
	},
	"CC-AML-07": {
		what: "Bei einem Verdacht informiert die Firma das zuständige Amt. Die Zahlung wartet, und die Kundschaft erfährt nichts davon.",
		why: "So können die Behörden ermitteln, ohne dass Täter gewarnt werden.",
		example:
			"Wie ein Ladenbesitzer, der leise die Polizei ruft, wenn ihm etwas komisch vorkommt.",
	},
	"CC-AML-08": {
		what: "Unterlagen zu Kundschaft und Zahlungen werden fünf Jahre aufbewahrt.",
		why: "Die Behörden können später nachvollziehen, was passiert ist.",
		example: "Wie Kassenzettel, die man für die Garantie aufhebt.",
	},
	"CC-AML-09": {
		what: "Die Firma schaut in einem amtlichen Verzeichnis nach, wem eine Kundenfirma wirklich gehört. Stimmt etwas nicht, meldet sie es.",
		why: "Hinter Firmen sollen sich keine unbekannten Täter verstecken.",
		example:
			"Wie nachschauen, wem ein Fahrrad wirklich gehört, bevor man es kauft.",
	},
	"CC-AML-10": {
		what: "Lässt die Firma ihre Kundschaft von anderen prüfen, bleibt sie trotzdem verantwortlich.",
		why: "Fehler der Helfer fallen auf die Firma zurück.",
		example:
			"Wie wenn ein Freund für dich einkauft: Du prüfst trotzdem den Kassenzettel.",
	},
	"CC-SAN-01": {
		what: "Alle Kundinnen, Kunden und Zahlungen werden mit Listen verbotener Personen verglichen.",
		why: "Mit manchen Personen und Ländern sind Geschäfte verboten.",
		example: "Wie der Türsteher mit einer Liste, wer Hausverbot hat.",
	},
	"CC-SAN-02": {
		what: "Für riskante Länder gelten strengere Prüfungen oder ein Verbot.",
		why: "Aus manchen Ländern kommt besonders oft schmutziges Geld.",
		example:
			"Wie Wege beim Wandern, die man bei Sturm nur mit Begleitung geht.",
	},
	"CC-TR-01": {
		what: "Bei jeder Überweisung von digitalem Geld reisen Name und Adresse von Absender und Empfänger mit.",
		why: "So bleibt nachvollziehbar, wer wem Geld schickt.",
		example: "Wie ein Paket, auf dem immer Absender und Empfänger stehen.",
	},
	"CC-TR-02": {
		what: "Geht digitales Geld an eine eigene Geldbörse der Kundschaft, prüft die Firma besonders genau.",
		why: "Dort gibt es keine zweite Firma, die mitprüft.",
		example: "Wie ein Brief ohne Absender, den man genauer anschaut.",
	},
	"CC-TR-03": {
		what: "Auch bei normalen Überweisungen reisen die Angaben zu Absender und Empfänger mit.",
		why: "Geldströme bleiben nachvollziehbar.",
		example: "Wie der Überweisungsschein mit Namen und Verwendungszweck.",
	},
	"CC-CUS-01": {
		what: "Geld und digitales Geld der Kundschaft liegen getrennt vom Geld der Firma.",
		why: "Geht die Firma pleite, bekommt die Kundschaft ihr Geld zurück.",
		example:
			"Wie die Klassenkasse, deren Geld nicht ins eigene Portemonnaie kommt.",
	},
	"CC-CUS-02": {
		what: "Die Firma schreibt auf, was sie für wen aufbewahrt, und zeigt es der Kundschaft regelmäßig.",
		why: "Jeder kann sehen, was ihm gehört.",
		example: "Wie die Garderobenmarke, die zeigt, welche Jacke dir gehört.",
	},
	"CC-CUS-03": {
		what: "Jeden Tag wird gezählt: Ist das ganze Geld der Kundschaft noch da?",
		why: "Fehlt etwas, fällt es sofort auf.",
		example: "Wie das Nachzählen der Klassenkasse nach jedem Ausflug.",
	},
	"CC-CUS-04": {
		what: "Ein unabhängiger Prüfer bestätigt, dass die Firma alle Werte der Kundschaft wirklich besitzt.",
		why: "Die Kundschaft muss der Firma nicht einfach nur glauben.",
		example:
			"Wie ein Schiedsrichter, der nachzählt, ob alle Spielsteine im Kasten sind.",
	},
	"CC-KEY-01": {
		what: "Die geheimen Schlüssel zum digitalen Geld werden in einem festen Ablauf erzeugt und verwahrt.",
		why: "Wer den Schlüssel hat, hat das Geld.",
		example:
			"Wie ein Tresorschlüssel, der unter Aufsicht mehrerer Personen gemacht wird.",
	},
	"CC-KEY-02": {
		what: "Um Geld zu bewegen, müssen mehrere Personen zustimmen. Ein Schlüssel allein reicht nicht.",
		why: "Ein einzelner Dieb oder Fehler kann kein Geld wegschicken.",
		example:
			"Wie ein Tresor, der nur mit zwei Schlüsseln gleichzeitig aufgeht.",
	},
	"CC-KEY-03": {
		what: "Von den Schlüsseln gibt es sichere Kopien. Es wird geübt, sie wiederherzustellen.",
		why: "Ein verlorener Schlüssel hieße sonst: Geld für immer weg.",
		example: "Wie der Ersatzschlüssel, der bei der Oma liegt.",
	},
	"CC-KEY-04": {
		what: "Es gibt einen Plan, was passiert, wenn ein Schlüssel in falsche Hände gerät.",
		why: "Dann muss das Geld schnell in Sicherheit gebracht werden.",
		example:
			"Wie das sofortige Sperren der Bankkarte, wenn sie gestohlen wurde.",
	},
	"CC-KEY-05": {
		what: "Es ist geregelt, wer einen Schlüssel bekommt und wann er ihn wieder abgibt.",
		why: "Nur geprüfte Personen, die es gerade brauchen, halten Schlüssel.",
		example: "Wie der Hausschlüssel, den der Babysitter am Ende wieder abgibt.",
	},
	"CC-CAP-01": {
		what: "Die Firma muss immer genug eigenes Geld als Polster haben.",
		why: "So kann sie Verluste tragen, ohne der Kundschaft zu schaden.",
		example: "Wie ein Notgroschen im Sparschwein.",
	},
	"CC-REG-01": {
		what: "Wichtige Änderungen meldet die Firma der Aufsicht, zum Beispiel eine neue Chefin.",
		why: "Die Aufsicht soll immer wissen, was in der Firma los ist.",
		example: "Wie der Schule Bescheid sagen, wenn du umziehst.",
	},
	"CC-REG-02": {
		what: "Die Firma berichtet der Aufsicht regelmäßig über ihre Gefahren.",
		why: "Die Aufsicht erkennt Probleme früh.",
		example: "Wie das Gespräch über das Zeugnis mit den Eltern.",
	},
	"CC-REG-03": {
		what: "Bevor die Firma loslegen darf, stellt sie einen Antrag mit allen Unterlagen.",
		why: "Nur geprüfte Firmen dürfen mit fremdem Geld arbeiten.",
		example: "Wie der Antrag für den Führerschein vor der ersten Fahrt.",
	},
	"CC-CND-01": {
		what: "Die Firma ist ehrlich zu ihrer Kundschaft. Die Werbung verspricht nichts Falsches.",
		why: "Niemand soll getäuscht werden.",
		example: "Wie ein Plakat, das nur zeigt, was es wirklich gibt.",
	},
	"CC-CND-02": {
		what: "Die Firma zeigt, wie viel Energie ihr digitales Geld verbraucht und was das für die Umwelt bedeutet.",
		why: "Die Kundschaft kann selbst entscheiden, was ihr wichtig ist.",
		example: "Wie das Energie-Etikett am Kühlschrank.",
	},
	"CC-CND-03": {
		what: "Preise und Regeln stehen offen. Aufträge führt die Firma so gut wie möglich für die Kundschaft aus.",
		why: "Niemand zahlt mehr als nötig.",
		example: "Wie Preisschilder im Laden, die jeder sehen kann.",
	},
	"CC-CND-04": {
		what: "Die Firma achtet auf Schummeln beim Handeln und meldet einen Verdacht.",
		why: "Der Handel soll für alle fair sein.",
		example: "Wie beim Spiel: Wer schummelt, wird dem Schiedsrichter gemeldet.",
	},
	"CC-CND-05": {
		what: "Beschwerden werden angenommen und innerhalb einer Frist beantwortet.",
		why: "Die Kundschaft wird gehört, und Fehler werden behoben.",
		example: "Wie ein Kummerkasten, auf den immer eine Antwort kommt.",
	},
	"CC-CND-06": {
		what: "Die Firma achtet darauf, dass sich niemand einen Vorteil zum Schaden der Kundschaft verschafft.",
		why: "Die Kundschaft soll sich auf faire Beratung verlassen können.",
		example:
			"Wie ein Schiedsrichter, der kein Spiel seiner eigenen Mannschaft pfeift.",
	},
	"CC-FRD-01": {
		what: "Bei Zahlungen wird mit zwei Schritten geprüft, ob wirklich die richtige Person bezahlt.",
		why: "Betrüger mit gestohlenen Daten kommen nicht durch.",
		example: "Wie ein Codewort am Telefon, bevor die Oma Geld überweist.",
	},
	"CC-FRD-02": {
		what: "Jede Zahlung wird auf Betrug geprüft. Betrugsfälle werden gezählt und gemeldet.",
		why: "So sieht man, wo Betrüger es versuchen.",
		example: "Wie eine Strichliste, wie oft jemand schummeln wollte.",
	},
	"CC-PAY-01": {
		what: "Es ist geregelt, über wen die Firma Zahlungen abwickelt und in welchen Ländern sie arbeitet.",
		why: "Nur erlaubte Wege und Länder werden genutzt.",
		example: "Wie der Schülerausweis, der nur an deiner Schule gilt.",
	},
	"CC-PAY-02": {
		what: "Elektronische Kassen sind gegen heimliche Änderungen geschützt und geben Belege aus.",
		why: "Einnahmen können nicht heimlich gelöscht werden.",
		example: "Wie der Kassenzettel, den du beim Bäcker bekommst.",
	},
	"CC-PAY-03": {
		what: "Vor einer Überweisung wird geprüft, ob Name und Kontonummer zusammenpassen.",
		why: "Geld landet nicht aus Versehen oder durch Betrug beim Falschen.",
		example: "Wie nachschauen, ob auf dem Briefkasten der richtige Name steht.",
	},
	"CC-TAX-01": {
		what: "Die Firma meldet dem Finanzamt die Geschäfte ihrer Kundschaft mit digitalem Geld.",
		why: "Auch auf digitales Geld sollen die richtigen Steuern gezahlt werden.",
		example:
			"Wie die Bescheinigung vom Verein, die Eltern für die Steuer brauchen.",
	},
	"CC-STAT-01": {
		what: "Größere Zahlungen ins Ausland meldet die Firma der Bundesbank.",
		why: "So weiß der Staat, wie viel Geld ins Ausland fließt.",
		example: "Wie eine Strichliste, wer wie oft ins Ausland fährt.",
	},
	"CC-WND-01": {
		what: "Es gibt einen Plan, wie die Firma geordnet schließt, falls es nötig wird.",
		why: "Die Kundschaft bekommt auch dann ihr Geld und ihre Daten zurück.",
		example:
			"Wie beim Umzug: Erst alles packen und verteilen, dann die Tür abschließen.",
	},
	"CC-PRV-01": {
		what: "Die Firma schreibt auf, welche Daten von Menschen sie nutzt und warum sie das darf.",
		why: "Für jede Nutzung muss es einen guten Grund geben.",
		example:
			"Wie eine Liste, wofür du die Telefonnummern deiner Freunde benutzt.",
	},
	"CC-PRV-02": {
		what: "Menschen dürfen fragen, welche Daten die Firma über sie hat, und das Löschen verlangen. Die Firma antwortet rechtzeitig.",
		why: "Jeder bestimmt mit, was mit seinen Daten passiert.",
		example: "Wie wenn du fragst, welche Fotos von dir im Klassenalbum sind.",
	},
	"CC-PRV-03": {
		what: "Vor einer riskanten Nutzung von Daten prüft die Firma, was für die Menschen schiefgehen könnte.",
		why: "Schaden wird verhindert, bevor er entsteht.",
		example:
			"Wie vor dem Hochladen eines Klassenfotos fragen: Ist das für alle in Ordnung?",
	},
	"CC-PRV-04": {
		what: "Helfer, die Daten für die Firma bearbeiten, unterschreiben feste Regeln. Für Länder außerhalb der EU gibt es extra Schutz.",
		why: "Daten sollen überall gleich gut geschützt sein.",
		example:
			"Wie ein Ferienlager, das dieselben Regeln einhält wie die Eltern zu Hause.",
	},
	"CC-PRV-05": {
		what: "Geraten Daten von Menschen in falsche Hände, meldet die Firma das innerhalb von 72 Stunden dem Amt.",
		why: "Die Betroffenen können sich dann schützen, zum Beispiel Passwörter ändern.",
		example:
			"Wie Bescheid sagen, wenn du die Liste mit den Adressen der Klasse verloren hast.",
	},
	"CC-PRV-06": {
		what: "Eine Person passt auf den Datenschutz auf. Neue Dinge werden von Anfang an sparsam mit Daten gebaut.",
		why: "Datenschutz ist dann von Beginn an eingebaut und nicht nachträglich angeklebt.",
		example: "Wie ein Rucksack, der schon ein Geheimfach hat.",
	},
	"CC-PRD-01": {
		what: "Die Firma listet alle ihre Produkte mit Software und schätzt ein, wie wichtig deren Sicherheit ist.",
		why: "Wichtige Produkte brauchen strengere Prüfungen.",
		example: "Wie Spielzeug, auf dem steht, ab welchem Alter es geeignet ist.",
	},
	"CC-PRD-02": {
		what: "Wer eine Lücke im Produkt findet, kann sie melden. Die Firma behebt sie und informiert alle.",
		why: "Lücken werden geschlossen, bevor Täter sie ausnutzen.",
		example: "Wie ein Fundbüro, nur für Fehler.",
	},
	"CC-PRD-03": {
		what: "Zu jeder Version gibt es eine Zutatenliste aller Software-Bausteine.",
		why: "Wird ein Baustein unsicher, sieht man sofort, welche Produkte betroffen sind.",
		example: "Wie die Zutatenliste auf der Packung, wichtig bei Allergien.",
	},
	"CC-PRD-04": {
		what: "Die Firma sagt vorher, wie lange sie Sicherheitsupdates liefert.",
		why: "Die Kundschaft weiß, wie lange ihr Gerät sicher bleibt.",
		example: "Wie die Garantie, die auf dem Karton steht.",
	},
	"CC-PRD-05": {
		what: "Sicherheitsupdates kommen schnell, kostenlos und echt bei der Kundschaft an.",
		why: "Gefälschte oder fehlende Updates machen Geräte angreifbar.",
		example: "Wie ein Brief mit Siegel, damit du weißt: Er ist echt.",
	},
	"CC-PRD-06": {
		what: "Für jedes Produkt wird überlegt, wie es angegriffen werden könnte.",
		why: "Schutz kommt genau dorthin, wo er nötig ist.",
		example: "Wie beim Spielzeug: Kann ein Kind kleine Teile verschlucken?",
	},
	"CC-PRD-07": {
		what: "Die Firma beschreibt genau, wie das Produkt gebaut und geschützt ist.",
		why: "Prüfer können nachvollziehen, dass es sicher ist.",
		example: "Wie eine Bauanleitung, die jeden Schritt erklärt.",
	},
	"CC-PRD-08": {
		what: "Bevor ein Produkt verkauft wird, wird bestätigt, dass es die Regeln erfüllt. Dann bekommt es das CE-Zeichen.",
		why: "Nur sichere Produkte dürfen in der EU verkauft werden.",
		example: "Wie das Prüfsiegel auf einem Fahrradhelm.",
	},
	"CC-PRD-09": {
		what: "Die Kundschaft bekommt einfache Hinweise, wie sie das Produkt sicher benutzt.",
		why: "Die beste Technik hilft nicht, wenn man sie falsch benutzt.",
		example: "Wie die Anleitung beim neuen Spielzeug.",
	},
	"CC-PRD-10": {
		what: "Das Produkt ist schon beim Auspacken sicher eingestellt.",
		why: "Viele Menschen ändern die Einstellungen nie.",
		example:
			"Wie ein Fahrrad, das schon mit funktionierenden Bremsen geliefert wird.",
	},
	"CC-PRD-11": {
		what: "Wer Produkte einführt oder verkauft, prüft, ob der Hersteller die Regeln erfüllt hat.",
		why: "Unsichere Produkte sollen gar nicht erst in den Laden kommen.",
		example:
			"Wie ein Laden, der nur Spielzeug mit Prüfsiegel ins Regal stellt.",
	},
	"CC-BSI-01": {
		what: "Die Firma zeichnet auf, welche Arbeiten, Programme, Geräte und Räume zusammengehören.",
		why: "So sieht man, was alles geschützt werden muss.",
		example: "Wie ein Plan eurer Wohnung mit allen Zimmern und Türen.",
	},
	"CC-BSI-02": {
		what: "Für jedes Teil wird geschätzt: Wie schlimm wäre es, wenn es ausfällt oder Daten nach außen gelangen?",
		why: "Wichtiges bekommt mehr Schutz als Unwichtiges.",
		example:
			"Wie das Sparschwein, das besser versteckt wird als der Radiergummi.",
	},
	"CC-BSI-03": {
		what: "Die Firma wählt aus einem großen Katalog passende Schutzbausteine und hakt ab, was schon erledigt ist.",
		why: "So wird nichts vergessen.",
		example: "Wie eine Packliste für die Klassenfahrt, auf der du abhakst.",
	},
	"CC-PCI-01": {
		what: "Alle Geräte und Programme mit Kreditkartendaten liegen in einem abgetrennten Bereich.",
		why: "Je kleiner der Bereich, desto leichter ist er zu schützen.",
		example: "Wie eine Schatzkiste in einem eigenen, abgeschlossenen Zimmer.",
	},
	"CC-PCI-02": {
		what: "Die Firma speichert so wenige Kartendaten wie möglich. Die Prüfnummer von der Kartenrückseite speichert sie nie.",
		why: "Was nicht gespeichert ist, kann nicht gestohlen werden.",
		example: "Wie keinen Zettel mit der Geheimzahl neben die Bankkarte legen.",
	},
	"CC-PCI-03": {
		what: "Kartennummern werden verschlüsselt gespeichert und nur teilweise angezeigt.",
		why: "Auch wer auf den Bildschirm schaut, kennt die ganze Nummer nicht.",
		example: "Wie auf dem Kassenzettel: nur die letzten vier Ziffern.",
	},
	"CC-PCI-04": {
		what: "Die Schlüssel für Kartendaten werden besonders sicher verwahrt und regelmäßig gewechselt.",
		why: "Ohne sicheren Schlüssel nützt die beste Verschlüsselung nichts.",
		example: "Wie der Tresorschlüssel, der nicht am Tresor hängt.",
	},
	"CC-PCI-05": {
		what: "Die Bezahlseite wird ständig überwacht, ob jemand fremde Programmteile eingeschleust hat.",
		why: "Sonst könnten Diebe Kartendaten direkt beim Eintippen abgreifen.",
		example:
			"Wie die Kontrolle, ob jemand eine Kamera am Geldautomaten versteckt hat.",
	},
	"CC-PCI-06": {
		what: "Eine zugelassene Prüffirma sucht alle drei Monate von außen nach Lücken.",
		why: "Neue Lücken werden regelmäßig gefunden.",
		example: "Wie der TÜV, der das Auto regelmäßig prüft.",
	},
	"CC-PCI-07": {
		what: "Für manche Regeln entscheidet die Firma nach einer kurzen Gefahrenprüfung, wie oft sie etwas kontrolliert.",
		why: "Wie oft kontrolliert wird, passt dann zur Gefahr.",
		example: "Wie öfter Zähne putzen, wenn du viel Süßes isst.",
	},
	"CC-PCI-08": {
		what: "Kartenlesegeräte werden regelmäßig auf heimliche Veränderungen geprüft.",
		why: "Betrüger bauen sonst unbemerkt eigene Lesegeräte ein.",
		example: "Wie das Nachschauen, ob am Geldautomaten etwas Fremdes klebt.",
	},
	"CC-PCI-09": {
		what: "Mit jedem Helfer ist schriftlich geklärt, wer welche Regel für Kartendaten erfüllt.",
		why: "Keine Regel bleibt liegen, weil jeder denkt, der andere macht es.",
		example: "Wie beim Gruppenreferat: Wer macht welche Folie?",
	},
	"CC-PCI-10": {
		what: "Die Firma sucht regelmäßig, ob Kartendaten irgendwo liegen, wo sie nicht hingehören.",
		why: "Vergessene Kopien sind ein leichtes Ziel für Diebe.",
		example:
			"Wie beim Aufräumen, wenn du verlorene Sachen unter dem Bett findest.",
	},
};
