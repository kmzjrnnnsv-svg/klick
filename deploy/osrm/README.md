# OSRM (Routenberechnung) selbst hosten

Klick nutzt OSRM für reale Pendel-Zeiten (Auto / Rad / zu Fuß). Standard
zeigt der Code auf den **public demo server** `router.project-osrm.org`
(Fair-Use-Limit, kein SLA). Für Production einen eigenen OSRM-Container
laufen lassen — Docker, ~10 Minuten Setup.

## 1. OSM-Daten herunterladen

OSRM braucht OpenStreetMap-Extracts pro Region. Geofabrik bietet sie kostenlos:

```bash
mkdir -p ~/osrm-data && cd ~/osrm-data

# Wähle eine Region. Klein anfangen (Berlin) → später erweitern.
# Deutschland gesamt: ca. 4 GB, RAM-Bedarf ~16 GB beim Preprocessing.
wget https://download.geofabrik.de/europe/germany-latest.osm.pbf

# Oder nur Berlin-Brandenburg (~250 MB, läuft auf 4-GB-Server):
# wget https://download.geofabrik.de/europe/germany/berlin-latest.osm.pbf
# wget https://download.geofabrik.de/europe/germany/brandenburg-latest.osm.pbf
```

## 2. Preprocessing (einmalig pro Datenupdate)

```bash
cd ~/osrm-data

# Profil = car / bicycle / foot. Für jeden Modus eigenen Container-Run.
docker run --rm -v "$PWD:/data" osrm/osrm-backend \
  osrm-extract -p /opt/car.lua /data/germany-latest.osm.pbf

docker run --rm -v "$PWD:/data" osrm/osrm-backend \
  osrm-partition /data/germany-latest.osrm

docker run --rm -v "$PWD:/data" osrm/osrm-backend \
  osrm-customize /data/germany-latest.osrm
```

Preprocessing dauert je nach Region zwischen 5 Minuten (Berlin) und mehreren
Stunden (Europa). RAM-Bedarf: ungefähr 2–3× Dateigröße.

Für Bike + Walk: Wiederhol mit `/opt/bicycle.lua` bzw. `/opt/foot.lua` und
verschiedenen Output-Pfaden. Oder: ein Container pro Modus.

## 3. OSRM als systemd-Service

```bash
sudo tee /etc/systemd/system/osrm-car.service > /dev/null <<'EOF'
[Unit]
Description=OSRM routing (car)
Requires=docker.service
After=docker.service

[Service]
Restart=always
ExecStartPre=-/usr/bin/docker rm -f osrm-car
ExecStart=/usr/bin/docker run --rm --name osrm-car \
  -p 127.0.0.1:5000:5000 \
  -v /home/nrply/osrm-data:/data \
  osrm/osrm-backend \
  osrm-routed --algorithm mld /data/germany-latest.osrm
ExecStop=/usr/bin/docker stop osrm-car

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable --now osrm-car
sudo systemctl status osrm-car
```

Test:

```bash
curl 'http://127.0.0.1:5000/route/v1/driving/13.405,52.52;13.388,52.517?overview=false' | jq
```

Sollte `code: "Ok"` liefern und eine `routes[].duration` in Sekunden.

## 4. Klick auf den lokalen Server zeigen

In `.env.production`:

```
OSRM_URL=http://127.0.0.1:5000
```

Restart:

```bash
sudo systemctl restart klick
```

Im Match-Log siehst du jetzt keine OSRM-Warnings mehr (oder zumindest keine
`HTTP 429` vom public demo). Pendel-Zeiten kommen aus deinem Container.

## 5. Daten regelmäßig aktualisieren

OSM ändert sich. Einmal pro Quartal:

```bash
cd ~/osrm-data
wget -O germany-latest.osm.pbf.new https://download.geofabrik.de/europe/germany-latest.osm.pbf
mv germany-latest.osm.pbf.new germany-latest.osm.pbf

# Preprocessing wiederholen, dann Service neu starten:
sudo systemctl restart osrm-car
```

Cron-Job sinnvoll. Während der Aktualisierung ist die Route-API kurz weg —
unsere `osrmRoute()` fällt in dem Fall auf die Haversine-Schätzung zurück,
also kein harter Ausfall.

## Dimensionierung

| Region | OSM-Datei | Preprocessing-RAM | Routing-RAM |
|--------|-----------|-------------------|-------------|
| Berlin-Brandenburg | ~250 MB | 1 GB | 500 MB |
| Deutschland | ~4 GB | 16 GB | 4 GB |
| Europa | ~25 GB | 64 GB | 16 GB |

Für die DACH-Region reicht ein 8-GB-Server für Preprocessing + Live-Routing
parallel.

## Nur ein Modus (Auto)?

Wenn du nur `mode: "car"` benötigst (typisch für DACH-Recruiting): nur das
`car.lua`-Preprocessing machen + nur den `osrm-car`-Service starten. Spart
Preprocessing-Zeit und Disk.
