# Security-Checks aus GitHub Actions an Klick senden

Klick führt selbst keine aktiven Scans gegen eure Systeme aus. Die Scanner laufen in **eurer** CI
gegen **euer** Repository (und optional euer eigenes Staging); Klick nimmt die Ergebnisse an,
gleicht sie mit dem Bestand ab, setzt Fristen, eskaliert und zeigt die Wirkung auf die
Prüfungsreife (ADR-017).

## 1. Token anlegen

Einstellungen → **Integrationen** → „Neuer Token“ (Owner, mit Bestätigung per TOTP).

- Berechtigungen: `scan:write` (Scan-Ergebnisse), `sbom:write` (SBOMs je Release).
- Optional an ein Produkt binden — dann landen alle Übertragungen dort.
- Der Token wird **einmal** angezeigt. In GitHub unter *Settings → Secrets and variables →
  Actions* als `KLICK_TOKEN` speichern.

## 2. Workflow übernehmen

Die Vorlage unter Einstellungen → Integrationen ist mit eurem Klick-Host und Produkt vorbelegt.
Sie enthält:

| Schritt | Werkzeug (Lizenz) | Endpunkt |
|---|---|---|
| Abhängigkeiten, Fehlkonfiguration | Trivy (Apache-2.0) | `/api/ingest/scan?name=trivy.json&full=1` |
| Secrets in der Git-Historie | gitleaks (MIT) | `/api/ingest/scan?name=gitleaks.sarif` |
| SBOM (CRA Anhang I Teil II) | Syft (Apache-2.0) | `/api/ingest/sbom?product=PRD-001` |
| Passiver DAST (optional, nur eigenes Staging) | OWASP ZAP (Apache-2.0) | `/api/ingest/scan?name=zap.json` |

Alle Actions sind per Commit-SHA gepinnt. Für GitHub-Organisationen braucht gitleaks-action eine
kostenlose Lizenz (`GITLEAKS_LICENSE`).

Weitere Formate: SARIF von **Opengrep** (nicht die Semgrep-Registry-Regeln — deren Lizenz verbietet
die Nutzung in SaaS), OSV-Scanner JSON, Nuclei JSONL.

## 3. API

```
POST /api/ingest/scan?name=<datei>&product=<Code>&full=1&fail_on=<critical|high|medium|low>
POST /api/ingest/sbom?product=<Code>&name=<datei>
Authorization: Bearer klk_ingest_…
Body: die Datei (max. 25 MB)
```

| Antwort | Bedeutung |
|---|---|
| 200 | importiert (`counts`: kritisch/hoch/…, neu, wieder offen, behoben) |
| 422 | `fail_on` greift — offene Befunde ab dieser Schwere; mit `curl --fail-with-body` scheitert der CI-Schritt |
| 400 | Format nicht erkannt oder kein gültiges JSON |
| 401 / 403 | Token fehlt, ungültig, abgelaufen, widerrufen / Berechtigung fehlt |
| 404 | Produkt-Code unbekannt |
| 413 / 429 | zu groß / zu viele Anfragen |

`full=1` (Vollscan): Befunde desselben Ziels, die nicht mehr vorkommen, gelten als behoben; taucht
ein behobener Befund wieder auf, öffnet Klick ihn erneut (Regression).

## 4. Was mit den Ergebnissen passiert

- Fristen: kritisch 7, hoch 30, mittel 90, niedrig 180 Tage.
- Kritisch → eine gebündelte Abweichung (CAPA); hoch → Aufgabe; Secret → Sofort-Alarm.
- Vollscans tragen einen Wirksamkeitstest (`vuln_scan`) am geprüften Control ein.
- Offene Befunde fließen als Abzug und Blocker in die Prüfungsreife.
- Secrets werden beim Import redigiert; die Originaldatei wird dann nicht gespeichert.
