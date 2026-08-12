# LiveKit — рунбук развёртывания

Что именно поднято, как это сделано и как это диагностировать после `/clear`. Читать перед
любой работой с LiveKit на сервере.

## Топология (отступление от общего сценария LiveKit)

Официальный `livekit/generate` рассчитан на пустую машину: генерирует `docker-compose.yaml`
с **собственным** Caddy, который занимает `80/443` и сам получает сертификат. На нашей
машине `80/443` уже держит системный Caddy — он же обслуживает `qwill.mooo.com`,
`qwillhub.mooo.com` и другие домены (см. `deploy.md`, факты о сервере). Второй процесс не
может занять те же порты.

Поэтому вместо генератора здесь используется свой `docker-compose.yaml`
(`infra/livekit/docker-compose.yaml`): один контейнер `livekit-server` в режиме
`network_mode: host` (нужен из-за диапазона `50000-60000/udp` — публиковать десятки тысяч
портов через `-p` тяжелее и не даёт ничего сверх host-режима). TLS и HTTP-проксирование
`wss://livekit.<домен>/rtc` отдаёт **тот же системный Caddy**, как это уже сделано для
основного приложения (`deploy/Caddyfile.qwill`). Отдельная сложность — TURN на `5349/tcp`:
это не HTTP, Caddy как обратный прокси его не обслуживает, LiveKit должен сам держать TLS.
Сертификат для этого не выпускается отдельно: он копируется из хранилища Caddy (Caddy и так
выпускает и продлевает его, обслуживая HTTP-часть того же домена).

Ключи API переданы через переменную окружения `LIVEKIT_KEYS`, а не через секцию `keys:`
в `livekit.yaml`, как в черновом варианте ТЗ. Причина: `${VAR}`-подстановка в
`livekit.yaml` ничем не делается автоматически — Docker Compose раскрывает `${...}` только
в самом `docker-compose.yaml`, а не в файлах, которые он монтирует томом, и образ
`livekit-server` собран без шелла, `envsubst` в нём подставить некому. `LIVEKIT_KEYS` —
штатный способ LiveKit передать ключи через окружение, ничего не подставляя внутрь
смонтированного файла. Секрет по-прежнему нигде не появляется в репозитории: только в
`.env` на сервере.

## Файлы

| Путь | Что | Живёт |
|---|---|---|
| `infra/livekit/livekit.yaml` | Конфигурация LiveKit, без секретов | В репозитории и на сервере |
| `infra/livekit/docker-compose.yaml` | Запуск контейнера | В репозитории и на сервере |
| `/opt/livekit/.env` | Реальные `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` | Только на сервере |
| `/etc/livekit/certs/livekit.pem`, `livekit.key` | Копия сертификата Caddy для TURN TLS | Только на сервере |

## Предпосылки

- Домен `livekit.qwill.mooo.com` (или другое имя третьего уровня под `qwill.mooo.com`,
  если DNS-провайдер `mooo.com` не позволяет создать именно такую запись — тогда завести
  вместо него, например, `qwill-livekit.mooo.com` и везде ниже подставить его) с A-записью
  на IP машины. Без неё Caddy не выпустит сертификат.
- Открытые порты (см. `calls/01-livekit-infra.md`, раздел «Требования к машине»):
  `443/tcp` (уже открыт под основной домен), `7881/tcp`, `50000-60000/udp`, `3478/udp`,
  `5349/tcp`. Открыть и в `ufw`/аналоге на самой машине, и в фаерволе облачного провайдера,
  если он есть отдельно от ОС.
- Docker на машине уже стоит (`29.3.1`, зафиксировано в `deploy.md`).

## Шаги

### 1. Скопировать файлы на сервер

```bash
ssh <пользователь>@<машина> 'sudo -u qwill mkdir -p /opt/livekit'
scp infra/livekit/livekit.yaml infra/livekit/docker-compose.yaml <пользователь>@<машина>:/tmp/
ssh <пользователь>@<машина> 'sudo -u qwill cp /tmp/livekit.yaml /tmp/docker-compose.yaml /opt/livekit/'
```

### 2. Ключи API и `.env`

```bash
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"   # LIVEKIT_API_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"  # LIVEKIT_API_SECRET
```

На сервере, в `/opt/livekit/.env` (владелец `qwill`, права `600`):

```
LIVEKIT_API_KEY=<сгенерированный ключ>
LIVEKIT_API_SECRET=<сгенерированный секрет>
```

Те же два значения плюс `LIVEKIT_URL=wss://livekit.qwill.mooo.com` и
`VITE_LIVEKIT_URL=wss://livekit.qwill.mooo.com` дописать в `/var/www/message/shared/.env`
основного приложения — оттуда их прочитает сервер на шаге ЗВОНКИ-2.

### 3. Открыть порты

```bash
sudo ufw allow 7881/tcp
sudo ufw allow 50000:60000/udp
sudo ufw allow 3478/udp
sudo ufw allow 5349/tcp
```

Если машина ещё и за облачным фаерволом/security group — открыть те же порты там же.

### 4. Сайт в системном Caddy

Сохранить копию перед правкой:

```bash
sudo cp /etc/caddy/Caddyfile /root/Caddyfile.bak-$(date +%F)
```

Добавить блок (по образцу `deploy/Caddyfile.qwill`):

```
livekit.qwill.mooo.com {
	reverse_proxy 127.0.0.1:7880
}
```

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl restart caddy
```

`restart`, не `reload` — админ-API у Caddy на этой машине выключен (`admin off`, см.
`deploy.md`), поэтому правка любого блока на секунду прерывает **все** домены машины.

После рестарта Caddy сам получит сертификат для `livekit.qwill.mooo.com` при первом
обращении по HTTPS — достаточно один раз дёрнуть `curl https://livekit.qwill.mooo.com/`.

### 5. Сертификат для TURN TLS

LiveKit слушает `5349/tcp` (TURN over TLS) сам, Caddy туда не проксирует. Ему нужна копия
уже выпущенного Caddy сертификата.

```bash
sudo tee /usr/local/bin/livekit-sync-cert.sh > /dev/null <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
DOMAIN="livekit.qwill.mooo.com"
SRC="$(find /var/lib/caddy/.local/share/caddy/certificates -type d -iname "$DOMAIN" | head -1)"
if [ -z "$SRC" ]; then
  echo "Сертификат для $DOMAIN не найден в хранилище Caddy" >&2
  exit 1
fi
install -d -m 755 /etc/livekit/certs
install -m 644 "$SRC/$DOMAIN.crt" /etc/livekit/certs/livekit.pem
install -m 644 "$SRC/$DOMAIN.key" /etc/livekit/certs/livekit.key
EOF
sudo chmod +x /usr/local/bin/livekit-sync-cert.sh
sudo /usr/local/bin/livekit-sync-cert.sh
```

Автообновление раз в неделю (сертификат Let's Encrypt живёт 90 дней, Caddy продлевает его
задолго до истечения — раз в неделю с запасом):

```bash
echo '0 4 * * 1 root /usr/local/bin/livekit-sync-cert.sh && cd /opt/livekit && docker compose restart livekit' | sudo tee /etc/cron.d/livekit-cert-sync
```

### 6. Запустить

```bash
cd /opt/livekit
sudo docker compose up -d
sudo docker compose logs -f livekit
```

Ожидание в логах: `starting LiveKit server`, без ошибок про TLS-файлы или порты.

### 7. Проверить

```bash
curl -sS https://livekit.qwill.mooo.com/ ; echo
```

Ожидание: `OK`.

```bash
curl -sS -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" https://livekit.qwill.mooo.com/rtc | head -5
```

Ожидание: `HTTP/1.1 101` либо `400` с текстом от LiveKit. `502`/таймаут — Caddy не достучался
до контейнера (проверить `docker compose ps`, порт `7880`).

TURN: открыть `https://icetest.info` или
`https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/`, добавить сервер
`turn:livekit.qwill.mooo.com:3478` с сгенерированными ключом и секретом, убедиться, что
появляются кандидаты `relay`. Их отсутствие — закрыт `3478/udp` либо не подхватился
сертификат (шаг 5).

## Эксплуатация

- **Логи:** `cd /opt/livekit && sudo docker compose logs -f livekit`
- **Перезапуск:** `cd /opt/livekit && sudo docker compose restart livekit`
- **Обновление образа:** `cd /opt/livekit && sudo docker compose pull && sudo docker compose up -d`
- **Ключи:** `/opt/livekit/.env` на сервере и `/var/www/message/shared/.env` основного
  приложения. Нигде в репозитории.
- **Сертификат для TURN протух/не синхронизировался:** перезапустить
  `/usr/local/bin/livekit-sync-cert.sh` вручную, затем `docker compose restart livekit`.
