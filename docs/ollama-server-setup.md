# Ollama-Server auf Hetzner — sicheres Setup mit WireGuard

> Architektur: separater Ubuntu-Server bei Hetzner, erreichbar AUSSCHLIESSLICH
> über einen WireGuard-Tunnel vom Klick-Webapp-Server. Ollama lauscht
> niemals auf einer öffentlichen IP. SSH ist key-only und IP-restricted.

## Architektur in einem Bild

```
                              Internet
                                 │
       ┌─────────────────────────┴─────────────────────────┐
       │                                                   │
       ▼                                                   ▼
┌─────────────┐   WireGuard UDP/51820   ┌──────────────────────────┐
│ Klick-VM    │ ◄───────────────────► │ Ollama-VM                │
│ raza.work   │   verschlüsselter      │ ollama.intern (DNS opt.) │
│             │   Tunnel               │                          │
│ wg0:        │                        │ wg0: 10.10.10.2          │
│ 10.10.10.1  │                        │ Ollama lauscht NUR auf:  │
│             │                        │   10.10.10.2:11434       │
└─────────────┘                        │ Public Port 11434: ZU    │
                                       └──────────────────────────┘
```

Keine 11434/tcp ist je vom Internet erreichbar. Selbst wenn Ollama eine
Auth-Lücke hätte, würde sie nichts nützen — der Port ist nicht offen.

## Hardware-Empfehlung (Hetzner)

| Setup | Modell läuft | Wann |
|---|---|---|
| **CPX52** (Cloud, 16 vCPU, 32 GB) | qwen2.5:14b oder 32b langsam | Demo, niedrig Volumen |
| **CCX53** (Cloud Dedi-vCPU, 32 GB) | qwen2.5:32b in 15-25s | Produktion CPU-only |
| **EX44** (Dedi, AMD Ryzen, 64 GB) | llama3.3:70b in 30-60s | Mehr RAM für große Modelle |
| **GEX-130** (Hetzner GPU, RTX 4000 Ada 20GB) | qwen2.5:32b in 1-3s | Wenn Latenz wichtig ist |
| **GEX-44** (RTX 4000 SFF Ada 20GB) | qwen2.5:14b in 1-2s | Günstigste GPU-Option |

Ich schreibe die Anleitung gegen **CCX53** (dedicated vCPU, weil shared
vCPU bei langen LLM-Calls unzuverlässig ist). Anpassen ist trivial.

---

## Phase 0 — Vorbereitung

Du brauchst:
- Klick-Server läuft bereits (`KLICK_PUBLIC_IP=<deine-ip>`)
- Hetzner Cloud Account
- SSH-Key auf deinem Laptop (`~/.ssh/id_ed25519.pub`)

Notiere dir folgende Werte (du brauchst sie unten):

```
KLICK_PUBLIC_IP=        # z.B. 5.78.123.45 (Klick-Server, öffentlich)
OLLAMA_PUBLIC_IP=       # wird gleich ausgegeben
KLICK_WG_IP=10.10.10.1  # Klick im VPN
OLLAMA_WG_IP=10.10.10.2 # Ollama im VPN
WG_PORT=51820
```

### IPv6-only-Variante (empfohlen wenn dein Klick-Server auch IPv6 hat)

Hetzner verlangt für reine IPv4 ~€1/Monat extra. Reine IPv6 ist
kostenlos und sogar weniger Scan-Lärm.

Bei IPv6-only **alles** wie unten beschrieben mit drei Anpassungen:

1. **Server bestellen**: in Phase 1.1 unter „Networking" das **IPv4
   abwählen**. Hetzner zeigt dann nur eine IPv6 wie
   `2a01:4f8:c012:abcd::1`.

2. **WG-Endpoint im Klick-Config (Phase 2.4)**: IPv6 immer in eckige
   Klammern, sonst parst WireGuard den Port falsch:
   ```
   Endpoint = [2a01:4f8:c012:abcd::1]:51820
   ```

3. **ufw-Regel SSH (Phase 3)**: statt einer einzelnen IPv4 das
   /64-Prefix deines Klick-Servers freigeben (Hetzner gibt jeder VM
   ein /64), z.B.:
   ```bash
   ufw allow from 2a01:4f8:1234:5678::/64 to any port 22 proto tcp
   ```

**Wartungs-Hinweis**: Wenn dein Heim-Anschluss / Mobilfunk kein IPv6
hat (Tethering oft IPv4-only), kommst du nicht mehr direkt per SSH auf
den Ollama-Server. Lösung: über den Klick-Server als Bastion springen:
```bash
ssh -J klickadmin@$KLICK_PUBLIC_IP klickadmin@2a01:4f8:c012:abcd::1
```

Du brauchst dann auf dem Klick-Server keine separaten Keys — `-J`
nutzt deinen lokalen Agent über die Klick-Session weiter.

**WG-Tunnel-Adressen bleiben IPv4**: innerhalb des Tunnels ist
`10.10.10.1`↔`10.10.10.2` weiterhin die einfachste Variante. Das
Transport-Layer (UDP/51820) läuft über IPv6, aber das ist transparent
für Klick — die App spricht weiterhin `http://10.10.10.2:11434`.

---

## Phase 1 — Server bestellen & initialer Login

### 1.1 Server bei Hetzner anlegen

1. https://console.hetzner.cloud → New Server
2. Location: **Falkenstein** oder **Nürnberg** (gleiche wie Klick → niedrige Latenz)
3. Image: **Ubuntu 24.04**
4. Type: **CCX53** (oder CPX52 für günstiger / GEX für GPU)
5. Networking: nur Public IPv4 + IPv6 (KEIN Private Network nötig — wir nutzen WG)
6. SSH-Key: deinen Laptop-Key hochladen
7. Firewall: **erstmal keine** (richten wir gleich auf dem Server selbst ein)
8. Name: `ollama-prod`

Notiere die ausgegebene Public-IP als `OLLAMA_PUBLIC_IP`.

### 1.2 Erster Login

```bash
ssh root@$OLLAMA_PUBLIC_IP
```

System aktualisieren:

```bash
apt update && apt upgrade -y
apt install -y ufw fail2ban unattended-upgrades wireguard wireguard-tools
```

### 1.3 Non-Root-User anlegen

```bash
adduser klickadmin                                # Passwort vergeben
usermod -aG sudo klickadmin
mkdir -p /home/klickadmin/.ssh
cp /root/.ssh/authorized_keys /home/klickadmin/.ssh/
chown -R klickadmin:klickadmin /home/klickadmin/.ssh
chmod 700 /home/klickadmin/.ssh
chmod 600 /home/klickadmin/.ssh/authorized_keys
```

Test in **neuem Terminal** (alten offenlassen!):

```bash
ssh klickadmin@$OLLAMA_PUBLIC_IP
sudo whoami    # muss "root" zurückgeben
```

Wenn das klappt → zurück zum root-Terminal:

### 1.4 SSH härten

```bash
cat > /etc/ssh/sshd_config.d/99-klick-hardening.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AuthenticationMethods publickey
AllowUsers klickadmin
LoginGraceTime 20
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
EOF

systemctl restart ssh
```

Test im **neuen** Terminal:

```bash
ssh root@$OLLAMA_PUBLIC_IP             # muss FEHLSCHLAGEN
ssh klickadmin@$OLLAMA_PUBLIC_IP        # muss klappen
```

### 1.5 fail2ban + Auto-Updates aktivieren

```bash
sudo systemctl enable --now fail2ban
sudo dpkg-reconfigure -plow unattended-upgrades  # → "Yes"
```

---

## Phase 2 — WireGuard-Tunnel

### 2.1 Schlüssel auf dem Ollama-Server

```bash
sudo -i
cd /etc/wireguard
umask 077
wg genkey | tee privatekey | wg pubkey > publickey
wg genpsk > preshared      # Pre-Shared-Key, zusätzliche Quantum-Sicherheit
chmod 600 privatekey publickey preshared

# Werte ausgeben — gleich brauchen wir sie:
echo "OLLAMA_PRIV=$(cat privatekey)"
echo "OLLAMA_PUB=$(cat publickey)"
echo "WG_PSK=$(cat preshared)"
```

### 2.2 Schlüssel auf dem Klick-Server

```bash
# Auf Klick-Server einloggen
ssh deinuser@$KLICK_PUBLIC_IP

sudo apt install -y wireguard wireguard-tools
sudo -i
cd /etc/wireguard
umask 077
wg genkey | tee privatekey | wg pubkey > publickey
chmod 600 privatekey publickey

echo "KLICK_PRIV=$(cat privatekey)"
echo "KLICK_PUB=$(cat publickey)"
```

Notiere alle vier Werte:
- `OLLAMA_PRIV`, `OLLAMA_PUB`
- `KLICK_PRIV`, `KLICK_PUB`
- `WG_PSK`

### 2.3 WireGuard-Config auf dem Ollama-Server

```bash
# Auf Ollama-Server (als root)
cat > /etc/wireguard/wg0.conf <<EOF
[Interface]
Address = 10.10.10.2/24
ListenPort = 51820
PrivateKey = <OLLAMA_PRIV einfügen>
# Kein NAT/Forwarding — Ollama ist Endpunkt, kein Gateway

[Peer]
# Klick-Server
PublicKey = <KLICK_PUB einfügen>
PresharedKey = <WG_PSK einfügen>
AllowedIPs = 10.10.10.1/32
PersistentKeepalive = 25
EOF

chmod 600 /etc/wireguard/wg0.conf
systemctl enable --now wg-quick@wg0
wg show wg0    # sollte das Interface zeigen
```

### 2.4 WireGuard-Config auf dem Klick-Server

```bash
# Auf Klick-Server (als root)
cat > /etc/wireguard/wg0.conf <<EOF
[Interface]
Address = 10.10.10.1/24
PrivateKey = <KLICK_PRIV einfügen>

[Peer]
# Ollama-Server
PublicKey = <OLLAMA_PUB einfügen>
PresharedKey = <WG_PSK einfügen>
Endpoint = <OLLAMA_PUBLIC_IP>:51820
AllowedIPs = 10.10.10.2/32
PersistentKeepalive = 25
EOF

chmod 600 /etc/wireguard/wg0.conf
systemctl enable --now wg-quick@wg0
```

### 2.5 Tunnel testen

Vom Klick-Server:

```bash
ping -c 3 10.10.10.2
# Muss antworten. Wenn nicht → ufw blockt evtl. schon (kommt unten),
# oder Schlüssel sind verdreht.
```

---

## Phase 3 — Firewall dichtmachen

Auf dem **Ollama-Server**:

```bash
sudo -i

# Default deny everything inbound
ufw default deny incoming
ufw default allow outgoing

# SSH NUR vom Klick-Server zulassen
ufw allow from $KLICK_PUBLIC_IP to any port 22 proto tcp comment 'SSH from klick only'

# WireGuard von überall — Hetzner-IPs sind dynamisch genug,
# der WG-Handshake selbst schützt
ufw allow 51820/udp comment 'WireGuard'

# Ollama-Port NUR vom WG-Interface, nur vom WG-Subnet
ufw allow in on wg0 from 10.10.10.0/24 to any port 11434 proto tcp comment 'Ollama via WG only'

# Aktivieren
ufw --force enable
ufw status verbose
```

Teste vom Klick-Server-Terminal:

```bash
# Public Ollama-Port — MUSS scheitern (timeout)
curl -m 5 http://$OLLAMA_PUBLIC_IP:11434/        # → connection refused / timeout

# Über WG — geht (Ollama installieren wir gleich, momentan kein Service)
ping 10.10.10.2                                  # OK
```

Auf dem **Klick-Server** brauchst du keine Inbound-Regel ändern — Klick
spricht ausgehend zu Ollama, das ist Outbound (default allow).

---

## Phase 4 — Ollama installieren

Auf dem **Ollama-Server**:

```bash
# Install (offizielles Script)
curl -fsSL https://ollama.com/install.sh | sh

# Override damit Ollama NUR an 10.10.10.2 lauscht (nicht 0.0.0.0!)
sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo tee /etc/systemd/system/ollama.service.d/override.conf > /dev/null <<'EOF'
[Service]
Environment="OLLAMA_HOST=10.10.10.2:11434"
Environment="OLLAMA_KEEP_ALIVE=24h"
Environment="OLLAMA_NUM_PARALLEL=1"
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now ollama

# Bestätigen dass NICHT auf 0.0.0.0
ss -tlnp | grep 11434
# Erwartet: LISTEN ... 10.10.10.2:11434
# NICHT:    LISTEN ... 0.0.0.0:11434  oder  *:11434
```

Wenn da 0.0.0.0 steht → System hat das Override nicht übernommen, mit
`systemctl edit ollama` direkt setzen oder `sudo systemctl restart ollama`
nochmal.

### 4.1 Modelle ziehen

```bash
ollama pull qwen2.5:32b-instruct          # ~19 GB, primary
ollama pull llama3.2-vision:11b           # ~8 GB, für CV-Bilder
ollama list                                # Übersicht
```

Mit qwen2.5:32b auf CCX53 dauert die erste Anfrage ~30-60 sec
(Modell-Load), danach 15-25 sec pro Antwort. Bei GEX: ~1-3 sec.

### 4.2 JSON-Mode-Test vom Klick-Server

```bash
curl http://10.10.10.2:11434/api/chat -d '{
  "model": "qwen2.5:32b-instruct",
  "messages": [{"role":"user","content":"Sag Hallo als JSON mit key greeting"}],
  "format": {"type":"object","properties":{"greeting":{"type":"string"}}},
  "stream": false
}' | jq .
```

Erwartete Antwort:

```json
{
  "model": "qwen2.5:32b-instruct",
  "message": { "role": "assistant", "content": "{\"greeting\": \"Hallo\"}" },
  "done": true
}
```

---

## Phase 5 — Klick auf Ollama umstellen

Auf dem **Klick-Server**:

```bash
sudo -i
cd /var/www/klick    # oder wo dein Klick-Repo liegt

# .env.production ergänzen
cat >> .env.production <<EOF

# AI: Ollama via WireGuard
AI_PROVIDER=ollama
OLLAMA_URL=http://10.10.10.2:11434
OLLAMA_MODEL=qwen2.5:32b-instruct
OLLAMA_MODEL_VISION=llama3.2-vision:11b
OLLAMA_TIMEOUT_MS=120000
EOF

# Optional: PDF-Support für CV-Parse ohne Vision-Modell
pnpm add pdf-parse

pnpm build
sudo systemctl restart klick
```

In den Klick-Logs muss erscheinen:

```
[ai] using provider: ollama
```

Falls da noch `claude` oder `mock` steht: `ANTHROPIC_API_KEY` in der
`.env.production` auskommentieren und neu starten — sonst gewinnt
Claude in der Auflösungs-Reihenfolge.

---

## Phase 6 — Sicherheits-Checks (Smoke-Tests)

### 6.1 Ollama nicht öffentlich erreichbar

Von **deinem Laptop** (nicht vom Klick-Server):

```bash
curl -m 5 http://$OLLAMA_PUBLIC_IP:11434/   # MUSS in Timeout/refused enden
nmap -p 11434 $OLLAMA_PUBLIC_IP             # MUSS "filtered" oder "closed" zeigen
```

### 6.2 SSH dicht

```bash
ssh -o ConnectTimeout=5 root@$OLLAMA_PUBLIC_IP        # MUSS scheitern
ssh -o ConnectTimeout=5 klickadmin@$OLLAMA_PUBLIC_IP  # nur von deinem Laptop möglich
```

### 6.3 WG-Tunnel-Status

Auf beiden Servern:

```bash
sudo wg show
# Latest handshake: vor wenigen Sekunden
# transfer: > 0 B received, > 0 B sent
```

### 6.4 Ende-zu-Ende mit Klick-App

1. In Klick als Kandidat einloggen
2. CV als PDF hochladen
3. Klick-Logs beobachten:
   ```bash
   sudo journalctl -u klick -f
   ```
   Erwartete Zeilen:
   ```
   [ai] using provider: ollama
   [vault] extracting CV ...
   ```
4. Auf Ollama-Server gleichzeitig:
   ```bash
   sudo journalctl -u ollama -f
   ```
   Erwartete Zeilen: GET /api/chat, model load, generate.

---

## Routine-Wartung

```bash
# Updates auf beiden Servern (unattended-upgrades läuft automatisch,
# aber ab und zu manuell nachschauen)
sudo apt update && sudo apt upgrade -y
sudo systemctl reboot   # Kernel-Updates brauchen Reboot

# Modell-Updates (wenn Ollama eine neuere Version pusht)
ollama pull qwen2.5:32b-instruct

# fail2ban Status prüfen
sudo fail2ban-client status sshd

# Log-Größe prüfen
sudo du -sh /var/log/* | sort -h | tail
```

## Troubleshooting

### „connection refused" vom Klick-Server zu 10.10.10.2:11434

1. `sudo wg show` — Tunnel up?
2. `ssh klickadmin@$OLLAMA_PUBLIC_IP "ss -tlnp | grep 11434"` — Ollama lauscht auf richtiger IP?
3. `sudo ufw status` auf Ollama — Regel für `11434 on wg0` da?

### Ollama lauscht trotz Override auf 0.0.0.0

```bash
sudo systemctl cat ollama          # zeigt finale Config
sudo systemctl restart ollama
```

### Latenz katastrophal (>60 sec/Antwort)

- Modell zu groß für RAM → kleineres ziehen (qwen2.5:14b)
- CPU-only mit shared vCPU → auf CCX (dedicated vCPU) umstellen
- Lange Prompts → `OLLAMA_TIMEOUT_MS` höher setzen oder Prompts kürzen

### WireGuard-Handshake schlägt fehl

```bash
sudo wg show              # "latest handshake" sollte recent sein
sudo journalctl -u wg-quick@wg0 -n 50
```

Wahrscheinliche Ursachen: Public-Keys vertauscht, falsche Endpoint-IP,
ufw blockt 51820/udp.

---

## Was passiert wenn der Ollama-Server ausfällt?

Klicks `getAIProvider()` cached die Provider-Wahl. Wenn Ollama
unerreichbar ist, throwen die Calls — aber:

- **CV-Parse**: User sieht einen Fehler im Vault-Upload
- **Match-Rationale, Career-Analysis**: laufen in `after()`/Background,
  schlagen still fehl, Match wird ohne KI-Rationale gespeichert
- **Profil-Lesart**: alter Wert bleibt, recompute schlägt fehl

Pragmatischer Failover: bei kritischer Last `AI_PROVIDER` temporär auf
`claude` setzen und Klick neu starten. Oder beide Provider parallel
betreiben + Routing-Schicht (nicht implementiert, könnte eine separate
Session werden).

## Backup-Strategie

Auf dem Ollama-Server gibt es nichts Persistentes außer:
- `/etc/wireguard/` (Schlüssel)
- `~/.ollama/models/` (Modelle, ~30 GB)

WG-Schlüssel: einmalig sichern. Modelle: kann man neu pullen, ist also
de-facto disposable. Ein Vollausfall des Servers = neuer Server mit
neuen WG-Keys + Public-Key-Tausch + Modelle pullen, ~1 Stunde.
