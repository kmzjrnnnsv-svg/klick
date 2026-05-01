# OpenTripPlanner (ÖPNV-Routing) selbst hosten

Klick nutzt OTP für reale Bahn/Bus-Verbindungen, wenn der Kandidat
`transportMode = transit` gewählt hat. Ohne OTP fällt die Match-Engine
auf eine Geschwindigkeits-Schätzung zurück (35 km/h) — das passt für
Demos, ist aber nicht wirklich „mit der Bahn um 7:30 Uhr".

OTP ist Java + Docker. Setup-Aufwand: 30–60 Min, abhängig von der GTFS-
Region.

## 1. OSM-Daten + GTFS-Feed besorgen

OTP braucht **beides** im selben Verzeichnis:

```bash
mkdir -p ~/otp-data && cd ~/otp-data

# OSM (gleiche Datei wie für OSRM, einfach symlinken):
ln -s ~/osrm-data/germany-latest.osm.pbf .

# GTFS — pro Region:
#  - Berlin / Brandenburg: VBB
wget -O vbb-gtfs.zip 'https://www.vbb.de/vbbgtfs'

#  - Hamburg: HVV → https://www.hvv.de/de/fahrplaene/abruf-fahrplaninfos/datenabruf
#  - München: MVV → https://www.mvv-muenchen.de/fahrplanauskunft/fuer-entwickler/opendata/index.html
#  - Bundesweit: DELFI → https://www.opendata-oepnv.de/ht/de/organisation/delfi
#
# Mehrere GTFS-ZIPs nebeneinander legen, OTP merged sie automatisch.
```

GTFS-Feeds aktualisieren sich monatlich. Lizenzbedingungen pro Verbund prüfen.

## 2. OTP-Graph bauen (einmalig)

```bash
cd ~/otp-data

docker run --rm -v "$PWD:/var/opentripplanner" \
  docker.io/opentripplanner/opentripplanner:latest \
  --build --save
```

Das schreibt `graph.obj` in `~/otp-data` (groß: 0.5–5 GB je nach Region).
RAM-Bedarf beim Build: ~16 GB für DACH, weniger für eine Stadt.

## 3. OTP als systemd-Service

```bash
sudo tee /etc/systemd/system/otp.service > /dev/null <<'EOF'
[Unit]
Description=OpenTripPlanner
Requires=docker.service
After=docker.service

[Service]
Restart=always
ExecStartPre=-/usr/bin/docker rm -f otp
ExecStart=/usr/bin/docker run --rm --name otp \
  -p 127.0.0.1:8080:8080 \
  -v /home/nrply/otp-data:/var/opentripplanner \
  -e JAVA_TOOL_OPTIONS=-Xmx6G \
  docker.io/opentripplanner/opentripplanner:latest \
  --load --serve
ExecStop=/usr/bin/docker stop otp

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable --now otp
sudo systemctl status otp
```

Test:

```bash
curl 'http://127.0.0.1:8080/otp/routers/default/plan?fromPlace=52.52,13.405&toPlace=52.504,13.392&mode=TRANSIT,WALK&time=08:00:00&date=2026-05-02' | jq '.plan.itineraries[0].duration'
```

Sollte eine Zahl in Sekunden zurückgeben (z. B. ~600 = 10 min).

## 4. Klick verbinden

In `.env.production`:

```
OTP_URL=http://127.0.0.1:8080
```

Restart:

```bash
sudo systemctl restart klick
```

Match-Engine ruft jetzt für `transit`-Kandidat:innen den lokalen OTP-Server.
Bei Fehler (OTP down, Adresse nicht im GTFS-Bereich, kein Verbindung
möglich) fällt `otpTransitRoute()` auf null zurück und der Code nutzt
weiter die Schätzung.

## 5. GTFS aktualisieren

Monatlich:

```bash
cd ~/otp-data
wget -O vbb-gtfs.zip.new 'https://www.vbb.de/vbbgtfs'
mv vbb-gtfs.zip.new vbb-gtfs.zip

# Graph neu bauen (dauert wieder Minuten bis Stunden):
docker run --rm -v "$PWD:/var/opentripplanner" \
  docker.io/opentripplanner/opentripplanner:latest \
  --build --save

sudo systemctl restart otp
```

## Begrenzungen / Hinweise

- **Region-spezifisch**: OTP kennt nur die GTFS-Feeds, die du eingespielt
  hast. Wer in Hamburg wohnt und in Berlin arbeiten will, braucht beide
  Verbund-Feeds. DELFI bietet einen bundesweiten Schwung.
- **Inter-City-Bahn ist tricky**: GTFS der DB ist nicht öffentlich
  vollständig. Verbund-Feeds enthalten in der Regel S-Bahn / Regio,
  aber nicht ICE. Routen über mehrere Verbünde brauchen sauberes
  Stitching.
- **CPU/RAM**: ein DACH-Setup mit 5+ Verbünden braucht 12–16 GB RAM für
  den Container. Für die Demo: nur Berlin → 4 GB reicht.
- **Adresse → Stop**: OTP findet automatisch die nächste Haltestelle.
  Bei Adressen in remote-Gegenden (kein Stop in 2 km Umkreis) gibt's
  kein Ergebnis → Fallback greift.

## Alternative: Kommerzieller Anbieter

Wenn dir das alles zu groß ist:
- **HERE Maps**: hat Transit-API, paid
- **Google Maps Directions**: Transit, paid mit Quota
- **Mapbox Directions**: kein Transit, nur driving
- **TravelTime**: hat Public-Transit-API, paid (UK-stark, DACH-mittel)

Code-Anpassung wäre 1 weiterer `xxxTransitRoute`-Helper analog zu
`otpTransitRoute()`.
