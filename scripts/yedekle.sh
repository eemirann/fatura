#!/bin/sh
# Tam yedek: veritabani + dekont dosyalari + WhatsApp oturumu.
#
# NEDEN UCU DE: Supabase'in kendi yedegi yalnizca veritabanini kapsar.
# Dekont gorselleri Storage'da durur ve o yedege DAHIL DEGILDIR — oysa bir
# odeme ihtilafinda kanit niteligindeki sey tam olarak odur. WAHA oturumu ise
# sunucudaki volume'de: kaybolursa WhatsApp'i musterinin telefonundan yeniden
# eslestirmek gerekir.
#
# Sunucuda yalnizca Docker'a ihtiyac duyar; pg_dump ve wget gecici
# container'lardan gelir, hosta bir sey kurulmaz.
#
# Kullanim (repo kokunden):
#     ./scripts/yedekle.sh
#
# Her gun otomatik almak icin host crontab'ina:
#     15 3 * * * cd /opt/fatura && ./scripts/yedekle.sh >> /var/log/fatura-yedek.log 2>&1
#
# Geri yukleme prosedanu icin README "Yedekleme ve geri yukleme" bolumune bakin.
set -eu

REPO_KOK="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_KOK"

# .env'i oku (yorumlari ve bos satirlari atlayarak)
if [ ! -f .env ]; then
    echo "HATA: $REPO_KOK/.env bulunamadi." >&2
    exit 1
fi
set -a
# shellcheck disable=SC1091
. ./.env
set +a

YEDEK_DIZINI="${YEDEK_DIZINI:-/opt/fatura-yedek}"
YEDEK_SAKLAMA_GUN="${YEDEK_SAKLAMA_GUN:-14}"
PG_IMAJ="postgres:17-alpine"

if [ -z "${SUPABASE_DB_URL:-}" ]; then
    cat >&2 <<'SON'
HATA: SUPABASE_DB_URL tanimli degil.

Supabase panosunda: Project Settings -> Database -> Connection string ->
"URI" sekmesi. Sifreyi bilmiyorsaniz ayni sayfadan sifirlayabilirsiniz.
Bu degeri .env dosyasina ekleyin:

    SUPABASE_DB_URL=postgresql://postgres:<sifre>@db.<ref>.supabase.co:5432/postgres
SON
    exit 1
fi

DAMGA="$(date +%Y-%m-%d-%H%M)"
HEDEF="$YEDEK_DIZINI/$DAMGA"
mkdir -p "$HEDEF"

echo "[yedek] $DAMGA basliyor -> $HEDEF"

# ------------------------------------------------------------- veritabani
# --no-owner/--no-acl: baska bir Supabase projesine geri yuklerken rol
# adlari tutmayabilir; sema ve veri tasinabilir kalsin.
echo "[yedek] 1/3 veritabani"
docker run --rm -i \
    -e PGCONNECT_TIMEOUT=15 \
    "$PG_IMAJ" \
    pg_dump --no-owner --no-acl --clean --if-exists "$SUPABASE_DB_URL" \
    | gzip -9 > "$HEDEF/veritabani.sql.gz"

# Bos/kirik dump sessizce gecmesin.
if [ "$(gzip -dc "$HEDEF/veritabani.sql.gz" | head -c 200 | wc -c)" -lt 100 ]; then
    echo "HATA: veritabani yedegi bos gorunuyor." >&2
    exit 1
fi

# ------------------------------------------------------- dekont dosyalari
# Dosya listesini Storage API'sini gezmek yerine dogrudan veritabanindan
# aliyoruz: receipts.dosya_yolu zaten tam listeyi tutuyor ve sayfalama derdi
# olmuyor. Indirme de ayni container'dan, busybox wget ile.
echo "[yedek] 2/3 dekont dosyalari"
mkdir -p "$HEDEF/dekontlar"
docker run --rm -i \
    -e PGCONNECT_TIMEOUT=15 \
    -e DB_URL="$SUPABASE_DB_URL" \
    -e SB_URL="$NEXT_PUBLIC_SUPABASE_URL" \
    -e SB_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
    -v "$HEDEF/dekontlar:/cikti" \
    "$PG_IMAJ" sh -s <<'SON'
set -eu
# Sayaclarin dongude kaybolmamasi icin while ve ozet ayni alt kabukta:
# "psql | while ...; done" kalibinda dongu alt kabukta calisir ve disarida
# okunan degisken hep 0 gorunurdu.
psql "$DB_URL" -tAc "select dosya_yolu from receipts where dosya_yolu is not null" | {
    adet=0
    hata=0
    while IFS= read -r yol; do
        [ -n "$yol" ] || continue
        mkdir -p "/cikti/$(dirname "$yol")"
        if wget -q -O "/cikti/$yol" \
            --header="Authorization: Bearer $SB_KEY" \
            --header="apikey: $SB_KEY" \
            "$SB_URL/storage/v1/object/dekontlar/$yol"; then
            adet=$((adet + 1))
        else
            echo "  UYARI: indirilemedi -> $yol" >&2
            rm -f "/cikti/$yol"
            hata=$((hata + 1))
        fi
    done
    echo "  dekont: $adet indirildi, $hata hata"
    # Kayit var ama hicbiri inmediyse sessizce gecmesin.
    if [ "$adet" -eq 0 ] && [ "$hata" -gt 0 ]; then
        echo "HATA: hicbir dekont indirilemedi (anahtar/bucket adi?)." >&2
        exit 1
    fi
}
SON

tar -czf "$HEDEF/dekontlar.tar.gz" -C "$HEDEF" dekontlar
rm -rf "$HEDEF/dekontlar"

# --------------------------------------------------------- WAHA oturumu
# Volume adi compose proje adiyla oneklenir (repo dizini "fatura" ise
# "fatura_waha_data"). Once gercek adi bulalim.
echo "[yedek] 3/3 WhatsApp oturumu"
WAHA_VOLUME="$(docker volume ls --format '{{.Name}}' | grep -E '_waha_data$' | head -1 || true)"
if [ -n "$WAHA_VOLUME" ]; then
    docker run --rm \
        -v "$WAHA_VOLUME:/oturum:ro" \
        -v "$HEDEF:/cikti" \
        alpine:3 tar -czf /cikti/waha-oturum.tar.gz -C /oturum .
else
    echo "  UYARI: waha_data volume'u bulunamadi, atlandi." >&2
fi

# ------------------------------------------------------------------ ozet
{
    echo "tarih       : $(date -Iseconds)"
    echo "commit      : $(git -C "$REPO_KOK" rev-parse --short HEAD 2>/dev/null || echo bilinmiyor)"
    echo "waha volume : ${WAHA_VOLUME:-yok}"
    echo ""
    ls -lh "$HEDEF"
} > "$HEDEF/MANIFEST.txt"

# ------------------------------------------------------- eski yedekleri sil
find "$YEDEK_DIZINI" -maxdepth 1 -mindepth 1 -type d -mtime "+$YEDEK_SAKLAMA_GUN" \
    -exec rm -rf {} + 2>/dev/null || true

echo "[yedek] tamamlandi: $HEDEF ($(du -sh "$HEDEF" | cut -f1))"

# Izleme ucu tanimliysa "yedek gecti" sinyali gonder. Yedek hic calismazsa
# Healthchecks.io bunu fark edip uyarir (sessiz basarisizliga karsi).
if [ -n "${YEDEK_PING_URL:-}" ]; then
    wget -q -O- --timeout=10 "$YEDEK_PING_URL" >/dev/null 2>&1 || true
fi
