# nginx-Konfig: raza.work → Klick (Next.js, Port 3000)

Reverse-Proxy mit DDoS-Schutz für die Klick-App. Liegt parallel zur bestehenden
`artisansole.com`-Site auf demselben Server — beide Domains zeigen per DNS auf
dieselbe IP, nginx routet anhand `server_name`.

## DNS

Bei der Domain-Verwaltung von `raza.work`:

```
A      raza.work       <SERVER-IP>
A      www.raza.work   <SERVER-IP>
```

(IPv6 analog mit `AAAA`-Records.)

## TLS-Zertifikat

```bash
sudo certbot certonly --nginx -d raza.work -d www.raza.work
```

Erzeugt `/etc/letsencrypt/live/raza.work/fullchain.pem` + `privkey.pem` —
die Pfade sind in `raza.work.conf` bereits eingetragen.

## Installation

```bash
# Konfig kopieren
sudo cp deploy/nginx/raza.work.conf /etc/nginx/sites-available/

# aktivieren
sudo ln -s /etc/nginx/sites-available/raza.work.conf /etc/nginx/sites-enabled/

# Konfig prüfen + reload
sudo nginx -t
sudo systemctl reload nginx
```

## Klick als systemd-Service (Beispiel)

Die nginx-Konfig erwartet die Next.js-App auf `127.0.0.1:3000`. Minimaler
systemd-Service:

```ini
# /etc/systemd/system/klick.service
[Unit]
Description=Klick (Next.js)
After=network.target postgresql.service

[Service]
Type=simple
User=klick
WorkingDirectory=/home/klick/klick
Environment=NODE_ENV=production
Environment=PORT=3000
EnvironmentFile=/home/klick/klick/.env.production
ExecStart=/usr/bin/pnpm start
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now klick
```

## Hinweis zum WebSocket-Map-Block

Der `map $http_upgrade $connection_upgrade { ... }`-Block am Ende der Datei
darf serverweit nur **einmal** existieren. Falls die `artisansole`-Konfig
oder eine andere Site denselben Block bereits definiert, hier auskommentieren
oder in eine gemeinsame `/etc/nginx/conf.d/upgrade.conf` auslagern.
