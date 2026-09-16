#!/bin/sh
# Vadesi geçmiş faturaların günlük hatırlatmasını tetikler.
#
# Vercel'de bu işi vercel.json'daki cron yapıyordu; kendi sunucumuzda böyle bir
# zamanlayıcı olmadığı için küçük bir container üstleniyor. Alpine'ın busybox'ı
# hem crond'u hem wget'i içinde taşıyor — ek paket kurulumu yok.
set -eu

: "${CRON_SECRET:?CRON_SECRET tanimlanmali}"
PANEL_URL="${PANEL_URL:-http://panel:3100}"
CRON_SAATI="${CRON_SAATI:-0 9 * * *}"

# Crontab'i calisma aninda uretiyoruz ki anahtar imaja gomulu olmasin.
# Ciktiyi /proc/1/fd/1'e yonlendirmek, "docker compose logs" ile gorunur kilar
# (crond is ciktisini normalde mail'e gondermeye calisir, burada mail yok).
cat > /etc/crontabs/root <<SON
$CRON_SAATI wget -q -O- --header="Authorization: Bearer $CRON_SECRET" "$PANEL_URL/api/cron/hatirlat" > /proc/1/fd/1 2>&1
SON

echo "[hatirlatma] zamanlayici hazir: '$CRON_SAATI' -> $PANEL_URL/api/cron/hatirlat"
exec crond -f -l 8
