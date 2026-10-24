# Knoten-Hardware für both.money

Stand: Oktober 2026. Richtwerte; die Ketten wachsen laufend. Vor jeder Bestellung gegen die
aktuellen Angaben von Bitcoin Core, Reth und Lighthouse prüfen (PRÜFEN). Die öffentliche Fassung
für Investor:innen und Entwickler:innen steht auf https://both.money/roadmap (Inhalt:
`apps/wallet/lib/roadmap.ts`); dieses Dokument ergänzt die technischen Teile für den Betrieb.

## Grundsätze

- **Knoten halten keine Schlüssel.** Sie beobachten Adressen (aus der xpub) und reichen fertig
  signierte Transaktionen weiter. Unterschrieben wird nur im Signer. Mehrere Ketten dürfen deshalb
  auf derselben Maschine laufen; ein eigener Server je Währung ist nicht nötig.
- **Getrennt wird nach:**
  1. Testnetz und echtes Netz (eigene Server, damit Tests nie den Betrieb stören);
  2. Platte und Arbeitsspeicher (neue Kette auf vorhandenen Server, solange es reicht);
  3. Ausfallsicherheit (echtes Netz: zweiter, unabhängiger Knoten je Kette bei einem anderen
     Anbieter, gegengeprüft; siehe „Gegenprobe“).
- **Signer, App und Knoten** bleiben getrennte Maschinen. Eigener Signer-Server mit HSM in Phase 4.

## Richtwerte je Knoten

| Knoten | Platte (NVMe) | RAM | CPU | Wann |
|---|---|---|---|---|
| Bitcoin Signet | < 20 GB | 2 GB | 1–2 Kerne | läuft (heutiger Knoten-Server) |
| Bitcoin echtes Netz, `txindex=1` | ≈ 0,8–1 TB, +60–80 GB/Jahr | 4–8 GB (`dbcache` für den ersten Sync höher) | 2–4 Kerne | Phase 3 |
| Ethereum Sepolia, Reth Archiv + Lighthouse | mehrere hundert GB bis ≈ 1 TB (PRÜFEN) | 16 GB | 4+ Kerne | Stufe 1 |
| Ethereum echtes Netz, Reth Archiv + Lighthouse | ≈ 3–3,5 TB, wächst (PRÜFEN) | 32–64 GB | 8 Kerne, gute Einzelkernleistung | Phase 4 |

- **Archivknoten:** `wallet-sync` liest ETH-Bewegungen auch aus Verträgen über `trace_filter`
  (`lib/wallet/sync/*`). Für ältere Blöcke braucht das den vollständigen Verlauf. Werden Konten nur
  ab ihrer Anlage beobachtet (`history_from` = Anlage), reicht ein Full Node mit etwa halber
  Platte; dafür wäre eine kleine Codeänderung nötig (Option fürs echte Netz).
- **NVMe ist Pflicht.** Auf normalen SSDs oder Cloud-Volumes dauert der erste Ethereum-Sync Tage bis
  Wochen. Kein RAID für Kettendaten nötig (jederzeit neu ladbar); nur das System klein absichern.
- **Traffic:** Ethereum im echten Netz bewegt mehrere TB im Monat → dedizierte Server ohne
  Volumengrenze.

## Ausbau in Stufen

| Stufe | Ausstattung | Darauf | Wann |
|---|---|---|---|
| 1 · Knoten Test | 8 Kerne, 64 GB RAM, 2 × 1 TB NVMe (dediziert) | Bitcoin Signet (zieht um), Ethereum Sepolia | als Nächstes |
| 2 · Knoten Prod | 8–16 Kerne, 64–128 GB RAM, ≈ 6–8 TB NVMe nutzbar | Bitcoin + Ethereum echtes Netz | mit dem echten Netz |
| Zweiter Prod-Knoten | wie Stufe 2, anderer Anbieter | dieselben Ketten, unabhängig | mit dem echten Netz |
| Signer-Server mit HSM | eigene Maschine ohne Verbindung nach außen | nur der Signer | Phase 4 |

Der heutige Knoten-Server (4 GB RAM) reicht nur für Bitcoin Signet.

## Einrichtung (je Knoten-Server)

1. **WireGuard** zum App-Server: `deploy/wireguard/wg0-nodes.conf.example` (Knoten) bzw.
   `wg0-app.conf.example` (App). Weitere Knoten-Server bekommen eigene Tunnel-Adressen.
2. **Firewall** `deploy/wireguard/firewall-nodes.nft`: RPC (8332/38332, 8545/8546) nur über `wg0`
   vom App-Server, P2P offen, SSH begrenzt.
3. **Bitcoin Core:** `deploy/nodes/setup-bitcoind.sh` (Builder-Signaturen, `txindex`, `rpcauth`,
   `rpcwhitelist`), zweiter RPC-User für both.money mit `deploy/nodes/add-bitcoin-rpc-user.sh`.
   Passwort auf dem App-Server erzeugen und nur den Hash übertragen, wenn möglich (Runbook).
4. **Ethereum:** `deploy/nodes/setup-ethereum.sh` mit Versionen und GPG-Fingerabdrücken von den
   offiziellen Release-Seiten, nach dem Sync `deploy/nodes/verify-checkpoint.sh` gegen zwei Quellen.
5. **App anbinden:** Credentials `both_rpc_<netz>` und Drop-in
   `both.service.d/nodes.conf` (Runbook „both.money“), dann `pnpm wallet:check`.
6. **Überwachung:** Warnung bei voller Platte (z. B. ab 80 %), Sync-Stand über `wallet:check`.

## Gegenprobe (geplant)

- **Block-Hash-Gegenprobe:** regelmäßig den Hash einer sicher bestätigten Höhe (Bitcoin 6 Blöcke
  tief, Ethereum der finalisierte Block) mit einer unabhängigen öffentlichen Quelle vergleichen; nur
  den Block abfragen, nie eine eigene Adresse. Abweichung → `security_alert`, Auszahlungen anhalten,
  Hinweis an Klick.
- **Zweiter Knoten je Kette:** `WALLET_RPC_<NETZ>` plus `…_2`, Prüf-Job vergleicht Hash und Höhe;
  optional Gutschrift und Tagesabschluss erst, wenn beide übereinstimmen.
