# Ollama als selbstgehosteter AI-Provider — Konzept

> Status: Konzept · Nicht implementiert · Eigene Session zum Bauen

## Warum

- **Datenhoheit**: CV-Inhalte, Lebenslaufdaten, Gehaltsbänder verlassen nie
  unsere Infrastruktur. Aktuell schicken wir bei `ANTHROPIC_API_KEY=...` jeden
  Profil-Parse zu Anthropic — nicht ideal für DSGVO-Diskussionen mit
  Enterprise-Kunden.
- **Kosten**: Anthropic-API-Calls summieren sich bei Skalierung. Eine
  dedizierte Ollama-Maschine (z. B. Hetzner GPU Server mit RTX 4090 oder
  EX44 mit RAM-only-Modellen) ist nach 6-12 Monaten günstiger.
- **Anbieter-Unabhängigkeit**: Das `AIProvider`-Interface ist bereits sauber
  abstrahiert (P2/ADR-004). Mock und Claude existieren nebeneinander. Ollama
  fügt sich als dritter Provider ohne API-Refactor ein.

## Architektur (geplant)

### 1. Provider-Auswahl

Aktuell: `lib/ai/index.ts` wählt Mock vs. Claude über `ANTHROPIC_API_KEY`.

Geplant: explizite Auswahl über `AI_PROVIDER`-Env-Variable.

```env
# Reihenfolge bei der Auflösung (erste passende gewinnt):
# 1. AI_PROVIDER explizit gesetzt → genau dieser
# 2. ANTHROPIC_API_KEY gesetzt    → claude
# 3. OLLAMA_URL gesetzt           → ollama
# 4. fallback                     → mock

AI_PROVIDER=ollama          # oder: anthropic | mock
OLLAMA_URL=http://10.0.0.5:11434
OLLAMA_MODEL=qwen2.5:32b-instruct
OLLAMA_MODEL_VISION=llama3.2-vision:11b   # für CV-PDF-Parse mit Bildern
OLLAMA_TIMEOUT_MS=120000
```

### 2. Neuer Provider `lib/ai/ollama.ts`

Implementiert alle Methoden aus `AIProvider`:
- `parseCv`, `extractDocument`, `extractJobPosting` — JSON-Mode
  via Ollama `/api/chat` mit `format: "json"`
- `suggestJobRequirements`, `suggestAssessmentQuestions`,
  `analyzeCareerProspects`, `assessJobPostingQuality`,
  `gradeOpenAnswer`, `matchRationale`, `summarizeCandidate`,
  `benchmarkSalary`, `assessMatch` — gleiches Pattern

Skelett:

```ts
async function callOllama(input: {
	system: string;
	user: string;
	jsonOnly?: boolean;
	maxTokens?: number;
}): Promise<string> {
	const url = process.env.OLLAMA_URL!;
	const model = process.env.OLLAMA_MODEL ?? "llama3.1:70b";
	const res = await fetch(`${url}/api/chat`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			model,
			messages: [
				{ role: "system", content: input.system },
				{ role: "user", content: input.user },
			],
			stream: false,
			format: input.jsonOnly ? "json" : undefined,
			options: {
				temperature: 0.2,
				num_predict: input.maxTokens ?? 2000,
			},
		}),
		signal: AbortSignal.timeout(
			Number(process.env.OLLAMA_TIMEOUT_MS ?? 120000),
		),
	});
	if (!res.ok) throw new Error(`ollama_${res.status}`);
	const json = await res.json();
	return json.message?.content ?? "";
}
```

### 3. Modell-Empfehlungen

| Use-Case | Empfohlenes Modell | RAM | Anmerkung |
|---|---|---|---|
| CV-Parse, Job-Extract (JSON) | `qwen2.5:32b-instruct` | 24 GB | Gut bei strukturierter Ausgabe |
| Match-Rationale, Insights-Narrative | `llama3.1:70b-instruct` | 48 GB | Beste Qualität für Fließtext |
| Schnelle Klassifikation (Kind, Confidence) | `llama3.1:8b-instruct` | 6 GB | Reicht völlig |
| CV-PDF mit Bild-Inhalten | `llama3.2-vision:11b` | 12 GB | Multi-Modal |

Pro Methode kann der Provider unterschiedliche Modelle wählen:

```ts
class OllamaAIProvider {
	private modelFor(task: "json" | "narrative" | "classify" | "vision") {
		switch (task) {
			case "json":      return process.env.OLLAMA_MODEL ?? "qwen2.5:32b-instruct";
			case "narrative": return process.env.OLLAMA_MODEL_NARRATIVE ?? "llama3.1:70b";
			case "classify":  return process.env.OLLAMA_MODEL_FAST ?? "llama3.1:8b";
			case "vision":    return process.env.OLLAMA_MODEL_VISION ?? "llama3.2-vision:11b";
		}
	}
}
```

### 4. Hardware-Optionen

**Hetzner Lösungen** (alle in EU-Region, DSGVO-konform):

- **GEX44** (RTX 4000 SFF Ada, 20 GB VRAM, ~280 €/Monat) — reicht für 32B-
  Modelle in Q4-Quantisierung
- **GEX130** (RTX 4090, 24 GB VRAM, ~700 €/Monat) — komfortabel für 70B in
  Q3 oder mehrere parallele Modelle
- **Dedicated Custom** mit 2× RTX 4090 — wenn parallele Vision + Text
  laufen sollen

**Setup-Aufwand**: 1-2 Stunden mit Ansible-Playbook + systemd-Service.

### 5. Migration

Phase 1 (Schatten-Modus):
1. Ollama-Provider implementieren mit allen Methoden
2. `AI_PROVIDER=ollama` setzen, parallel beobachten ob Ergebnisse
   vergleichbar sind (Mock-Tests)
3. Ein paar reale Profile durch beide Pfade jagen, Output diffen

Phase 2 (Cutover):
1. `ANTHROPIC_API_KEY` aus `.env.production` entfernen
2. Logs überwachen — Fehlerquote, Latenz
3. Fallback-Pfad: bei Ollama-Timeout → return Mock-Output (degraded mode)

### 6. Was sich gegenüber Claude unterscheidet

- **Latenz**: 3-15 Sekunden statt 1-3 Sekunden bei Anthropic — die App hat
  bereits `after()`-Hintergrund-Pfade für die meisten AI-Calls, das reicht
- **JSON-Strenge**: Ollama mit `format: "json"` ist zuverlässig, aber das
  Schema-Following ist schwächer als Claude. Wir brauchen mehr Defensive-
  Parsing (Regex-Fallback) — das tun wir bereits in `claude.ts`
- **Tool-Use**: Ollama unterstützt Tool-Use seit Llama 3.1 — funktioniert,
  aber weniger robust. Für `parseCv` (das aktuell Claude-Tools nutzt) eher
  auf JSON-Mode umstellen
- **Kosten**: ~0 € pro Call nach Hardware-Kauf, statt ~0.5-3 ct pro Call

## Was vorher passieren muss

- [ ] Hetzner-GPU-Server bestellen + Ansible-Provisioning
- [ ] Ollama als systemd-Dienst hinter nginx-Reverse-Proxy mit Basic-Auth
      (NICHT öffentlich, intern nur)
- [ ] Test-Skript `scripts/ai-bench.ts` das die 12 Provider-Methoden gegen
      eine Referenz-Suite jagt und Mock vs. Claude vs. Ollama diffed
- [ ] Modelle vorab pullen (`ollama pull qwen2.5:32b-instruct` etc.)

## Schätzung

- Provider implementieren: 1 Session (~2-3h Coding + Tests)
- Setup Hetzner-Server + Ollama: 1 Session
- Bench + Tuning: 1 Session
- Cutover + Beobachtung: laufend

Total: 3 Sessions bevor wir live schalten können.
