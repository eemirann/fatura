# Kira Fatura Takip Paneli

Kiracılara aylık su/elektrik faturasını WhatsApp'tan gönderip dekontlarını takip
etmek için yapılmış panel.

**Akış:** Daireye tıkla → kalemleri gir → tek tıkla WhatsApp'a düş (daire sarı) →
kiracı mesajdaki linkten dekontunu yükler → servis dekonttaki tutarı okur →
senin girdiğin tutarla eşleşirse daire yeşile döner.

## Panel renkleri

| Renk | Anlamı |
|---|---|
| ⚪ Gri | Fatura girilmedi ya da henüz gönderilmedi |
| 🟡 Sarı | Gönderildi, ödeme bekleniyor |
| 🔴 Kırmızı | Son ödeme tarihi geçti |
| 🟠 Turuncu | Dekont geldi ama tutar tutmuyor |
| 🟢 Yeşil | Ödendi |
| ⚫ Siyah nokta | Dekont geldi, sen henüz bakmadın |

Renklerin yanında panelin üstünde **sekmeler** var: **Tümü · Ödeyenler ·
Ödemeyenler · Faturasız**. Her sekmenin yanındaki sayı, filtreden bağımsız
olarak o gruptaki daire adedini gösterir. Seçim adreste taşınır
(`/?donem=2026-09-01&filtre=odemeyen`) — linki paylaşabilir, yenilediğinde
aynı görünümü bulursun.

- **Ödeyenler:** fatura kapanmış (yeşil)
- **Ödemeyenler:** ödeme bekleyen, vadesi geçen ve tutarı uyuşmayan daireler —
  yani hâlâ takip gerektirenler
- **Faturasız:** o dönem için fatura girilmemiş ya da taslakta kalmış daireler

---

## Kurulum

### 1. Supabase projesi

[supabase.com](https://supabase.com) üzerinde ücretsiz bir proje aç.

**Şemayı kur:** Supabase panelinde **SQL Editor** → `supabase/migrations/`
altındaki dosyaları **numara sırasıyla** yapıştırıp çalıştır:

| Dosya | Ne ekler |
|---|---|
| `0001_init.sql` | Tablolar, RLS, fatura toplamını hesaplayan trigger, `dekontlar` bucket'ı |
| `0002_kismi_odeme.sql` | Kısmi ödeme (birden fazla dekontun toplanması) |
| `0003_webhook_tekrar_onleme.sql` | WAHA webhook'unun aynı mesajı iki kez işlemesini önler |
| `0004_kullanici_rolleri.sql` | `profiles` tablosu, yönetici/görüntüleyici rolleri, rol bazlı RLS |
| `0005_otomatik_hatirlatma.sql` | Otomatik hatırlatma için `son_hatirlatma_at` kolonu |

> Sadece `0001`'i çalıştırmak yetmez — kısmi ödeme, roller ve hatırlatma
> özellikleri sessizce çalışmaz hâle gelir.

**Kendine kullanıcı aç:** **Authentication → Users → Add user** → e-posta ve şifre
gir, *Auto Confirm User* seçeneğini işaretle. Panele bu bilgilerle gireceksin.

> Herkese açık kayıt sayfası bilerek yok. İlk hesabı buradan açtıktan sonra
> diğer kullanıcıları panelin içinden davet edeceksin (aşağıya bak).

**Kullanıcılar ve roller:** İlk hesabı açtıktan sonra yeni kullanıcı eklemek
için Supabase'e dönmene gerek yok — **Ayarlar** sayfasındaki davet formundan
e-posta adresine davet gönderilir, kişi gelen linkten kendi şifresini belirler.

| Rol | Yapabildikleri |
|---|---|
| **Yönetici** | Her şey: fatura girme, gönderme, blok/daire düzenleme, ayarlar, davet |
| **Görüntüleyici** | Yalnızca okuma — panel, daire detayı, bildirimler ve CSV indirme |

Roller hem arayüzde (butonlar gizlenir) hem sunucuda (her yazma action'ının
başındaki `yoneticiDegilse` kapısı) hem de veritabanında (RLS politikaları,
`0004_kullanici_rolleri.sql`) uygulanır. Bu migration'dan önce açılmış
hesaplar otomatik olarak yönetici sayılır.

**Anahtarları al:** **Project Settings → API** sayfasından:
- Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- `anon` `public` anahtarı → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` anahtarı → `SUPABASE_SERVICE_ROLE_KEY`

> `service_role` anahtarı tüm güvenlik kurallarını baypas eder. Yalnızca sunucuda
> kullanılıyor, tarayıcıya asla gönderilmiyor. Kimseyle paylaşma.

### 2. Dekont okuma servisi (Python)

Dekont okuma, AI kullanmadan (regex + OCR) ayrı bir FastAPI mikroservisinde
çalışır — metni seçilebilir PDF'lerde doğrudan metinden, ekran görüntüsü/
taranmış PDF'lerde Tesseract OCR ile okur:

```bash
cd python-dekont-servisi
python -m venv .venv
.venv\Scripts\activate        # Windows (Linux/Mac: source .venv/bin/activate)
pip install -r requirements.txt
uvicorn main:app --port 8000
```

**Tesseract OCR kurulumu** (ekran görüntüsü/taranmış PDF okumak için gerekli;
kurulu değilse servis çökmez, sadece bu dosyalar "elle kontrol edin"e düşer):
- Windows: [UB-Mannheim Tesseract installer](https://github.com/UB-Mannheim/tesseract/wiki) —
  kurulumda **Turkish** dil paketini işaretle, `tesseract.exe`'nin PATH'e
  eklendiğinden emin ol.
- Linux (VPS): `apt install tesseract-ocr tesseract-ocr-tur`

**Servis anahtarı zorunludur.** `DEKONT_SERVICE_KEY` tanımlı değilse servis
hiçbir isteği kabul etmez (503 döner). Next.js tarafı aynı değeri
`X-Service-Key` başlığında gönderir. Üretimde servis internete açık bir portta
duracağı için bu bilinçli olarak fail-closed: anahtarı kurulumda atlamak ucu
herkese açık bırakmasın diye.

Yerelde `npm run dev:full` Next.js'i ve bu servisi tek komutla başlatır;
`.env.local`'deki `DEKONT_SERVICE_KEY`'i uvicorn'a kendisi taşır (anahtar boşsa
uyarı verip durur).

### 3. Ortam değişkenleri

```bash
cp .env.example .env.local
```

`.env.local` dosyasını yukarıda aldığın değerlerle doldur. `SITE_URL` yerel
çalışırken `http://localhost:3100` kalabilir; yayına aldığında sunucunun
adresini yazacaksın (kiracıya giden dekont linki buradan üretiliyor — sunucuda
bu değeri compose kendisi üretir).

`DEKONT_SERVICE_KEY` ve `CRON_SECRET` yerelde de dolu olmalı: ikisi de
fail-closed, boş bırakılırsa dekont okuma ve hatırlatma ucu istek kabul etmez.

### 4. Çalıştır

```bash
npm install
npm run dev
```

[localhost:3100](http://localhost:3100) → Supabase'de açtığın kullanıcıyla giriş yap.

**İlk kurulum sırası:**
1. **Ayarlar** → IBAN ve hesap sahibini gir (mesaj bunlar olmadan eksik gider).
2. **Blok & Daire** → blokları ve daireleri ekle, kiracı adı + telefonuyla.
3. **Panel** → daireye tıkla, fatura kalemlerini gir, WhatsApp'tan gönder.

---

## Yayına alma (kendi sunucunuz)

Panel Vercel'de değil, WAHA ve dekont servisiyle aynı VPS'te koşar. Gerekçe:
dekont okuma servisi Vercel'de zaten çalışamıyor (sistemde Tesseract ikilisi
şart), yani bir sunucuya ihtiyaç var. Paneli de oraya koymak ek maliyet
getirmiyor ve her şey tek kutuda toplanıyor.

> Vercel'in ücretsiz **Hobby** planı ticari kullanıma kapalı — "siteyi yapmak
> ya da barındırmak için para almak" tanımın içinde. Bu paneli bir müşteriye
> satıyorsanız Hobby uygun değildir; Pro'ya geçmek yerine kendi sunucunuzda
> barındırmak hem kurallara uygun hem daha ucuz.

### Sunucu gereksinimleri

| | |
|---|---|
| Sanallaştırma | **KVM / VMware ESXi** — OpenVZ/LXC'de Docker düzgün çalışmaz |
| Kaynak | 2 vCPU / 4 GB RAM / 40 GB disk |
| Ağ | 1 public IPv4, **80 ve 443 portları açık** |
| İşletim sistemi | Ubuntu 22.04 veya 24.04 |
| Alan adı | Şart — Let's Encrypt IP adresine sertifika vermiyor |

Veritabanı ve dekont dosyaları Supabase'de durur; sunucuda kalıcı veri yalnızca
WhatsApp oturumu (`waha_data`) ve TLS sertifikalarıdır (`caddy_data`).

### DNS

Üç A kaydı, hepsi sunucunun IP'sine:

```
panel.<alanadi>    -> <sunucu-ip>
waha.<alanadi>     -> <sunucu-ip>
dekont.<alanadi>   -> <sunucu-ip>
```

### Kurulum

```bash
# 1) Docker
curl -fsSL https://get.docker.com | sh

# 2) Projeyi al
git clone <repo-adresiniz> /opt/fatura && cd /opt/fatura

# 3) Ortam degiskenleri
cp .env.example .env
nano .env        # Supabase anahtarlari + asagidaki uc deger

openssl rand -hex 32   # DEKONT_SERVICE_KEY
openssl rand -hex 32   # CRON_SECRET
openssl rand -hex 16   # WAHA_API_KEY

# 4) Ayaga kaldir
docker compose up -d
```

`.env` dosyasına ek olarak şunlar gerekir (compose bunları okur):

```
DOMAIN=alanadiniz.com
ACME_EMAIL=siz@alanadiniz.com
WAHA_DASHBOARD_USERNAME=admin
WAHA_DASHBOARD_PASSWORD=<rastgele>
```

`SITE_URL`'i elle yazmanıza gerek yok — compose onu `https://panel.$DOMAIN`
olarak kendisi üretir.

### Sonra

1. `https://waha.<alanadi>/dashboard/` → `default` oturumunu başlatıp QR'ı
   müşterinin WhatsApp Business'ından taratın.
2. WAHA webhook'unu ayarlayın (aşağıdaki WAHA bölümü), adres artık
   `https://panel.<alanadi>/api/whatsapp-webhook`.
3. Supabase → **Authentication → URL Configuration → Redirect URLs** listesine
   `https://panel.<alanadi>/auth/callback` ekleyin, yoksa davet akışı kırılır.
4. Telefondan gerçek bir dekontla bir kez deneyin.

### Güncelleme

```bash
cd /opt/fatura && git pull && docker compose up -d --build
```

---

## Yedekleme ve geri yükleme

**Supabase'in kendi yedeği yetmez.** O yalnızca veritabanını kapsar; dekont
görselleri Storage'da durur ve yedeğe dahil değildir — oysa bir ödeme
ihtilafında kanıt niteliğindeki şey tam olarak odur. WhatsApp oturumu da
sunucudaki volume'de: kaybolursa müşterinin telefonundan yeniden eşleştirmek
gerekir.

`scripts/yedekle.sh` üçünü birden alır. Sunucuda Docker dışında bir şey
gerektirmez.

### Kurulum

`.env` dosyasına veritabanı adresini ekleyin (Supabase panosu → **Project
Settings → Database → Connection string → URI**):

```bash
SUPABASE_DB_URL=postgresql://postgres:<sifre>@db.<ref>.supabase.co:5432/postgres
```

Elle bir kez çalıştırıp doğrulayın:

```bash
cd /opt/fatura && ./scripts/yedekle.sh
```

Sonra host crontab'ına ekleyin (`crontab -e`):

```
15 3 * * * cd /opt/fatura && ./scripts/yedekle.sh >> /var/log/fatura-yedek.log 2>&1
```

Her yedek `/opt/fatura-yedek/<tarih>/` altına üç dosya bırakır:
`veritabani.sql.gz`, `dekontlar.tar.gz`, `waha-oturum.tar.gz` (+ `MANIFEST.txt`).
Varsayılan olarak 14 günden eski yedekler silinir (`YEDEK_SAKLAMA_GUN`).

> Yedek **sunucunun kendisinde** duruyor. Sunucu tamamen giderse yedek de
> gider. En az haftalık bir kopyayı başka bir yere (kendi bilgisayarınız veya
> bir nesne deposu) indirin.

### Geri yükleme

**1) Veritabanı** — hedef projeye geri basar (`--clean --if-exists` ile dump
alındığı için mevcut tabloları düşürüp yeniden kurar):

```bash
gzip -dc veritabani.sql.gz | docker run --rm -i postgres:17-alpine \
    psql "postgresql://postgres:<sifre>@db.<ref>.supabase.co:5432/postgres"
```

**2) Dekont dosyaları** — arşivi açıp her dosyayı Storage'a geri yükleyin:

```bash
tar -xzf dekontlar.tar.gz
cd dekontlar && find . -type f | sed 's|^\./||' | while read -r yol; do
    curl -s -X POST \
        -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
        -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
        --data-binary "@$yol" \
        "$NEXT_PUBLIC_SUPABASE_URL/storage/v1/object/dekontlar/$yol"
done
```

**3) WhatsApp oturumu** — container'ları durdurup volume'e geri açın:

```bash
docker compose stop waha
docker run --rm -v fatura_waha_data:/oturum -v "$PWD":/yedek alpine:3 \
    sh -c "rm -rf /oturum/* && tar -xzf /yedek/waha-oturum.tar.gz -C /oturum"
docker compose start waha
```

Oturum geri gelmezse QR yerine **eşleştirme kodu** kullanın (aşağıdaki WhatsApp
bölümü) — QR ~20 saniyede yenilendiği için uzaktan destek sırasında pratik
değildir.

> Yedeğin *varlığı* değil, *geri yüklenebildiği* önemlidir. İlk kurulumda
> yedeği boş bir Supabase projesine geri yükleyip bir kez deneyin.

---

## Maliyet

| Kalem | Tutar |
|---|---|
| Supabase | Ücretsiz katman bu ölçekte fazlasıyla yeter |
| Dekont okuma (regex + Tesseract OCR) | 0 ₺ — AI/API çağrısı yok |
| VPS (panel + WAHA + dekont + Caddy) | Müşteri başına tek sunucu; 2 vCPU / 4 GB yeterli |
| Alan adı | Yılda bir kez, sertifika için gerekli |

WhatsApp otomasyonunu kullanmıyorsanız (`WAHA_URL` boş) VPS yine de gerekir:
dekont okuma servisi Vercel'de çalışamıyor. Otomatik okumadan da vazgeçerseniz
panel çalışmayı sürdürür — dekontlar kaydedilir, siz elle kontrol edersiniz.

Dekont okuma AI kullanmadığı için isabeti Claude kadar yüksek olmayabilir,
özellikle bilinmeyen/alışılmadık banka formatlarında. Uygulama bunu baştan
beri ana güvenlik ağı olarak tasarlamış: okuma başarısız ya da şüpheliyse
fatura durumu değişmez, panelde "elle kontrol edin" uyarısı çıkar — dosya
hiçbir zaman kaybolmaz, siz elle bakıp onaylarsınız.

---

## Komutlar

```bash
npm run dev        # geliştirme sunucusu
npm run build      # üretim derlemesi
npm run typecheck  # tip kontrolü
npm test           # eşleştirme ve renk kurallarının birim testleri

# Dekont ayrıştırıcının testleri ayrı çalışır (npm test bunları kapsamaz):
cd python-dekont-servisi && python -m unittest -v

./scripts/yedekle.sh   # veritabanı + dekontlar + WhatsApp oturumu yedeği
```

Sunucunun durumunu dışarıdan sormak için:

```bash
# yalnızca HTTP kodu (200 = her şey yolunda, 503 = bir bileşen bozuk)
curl -s -o /dev/null -w '%{http_code}\n' https://panel.<alanadi>/api/saglik

# hangi bileşenin bozuk olduğunu görmek için
curl -s -H "Authorization: Bearer $CRON_SECRET" https://panel.<alanadi>/api/saglik
```

Bu ucu bir izleme servisine (UptimeRobot vb.) bağlarsanız WhatsApp oturumu
koptuğunda müşteriden önce siz haberdar olursunuz.

---

## Proje yapısı

```
lib/durum.ts        Panel renk kuralı — TEK kaynak, renk değişikliği burada yapılır
lib/esles.ts        Dekont tutarı ↔ fatura tutarı eşleştirme kuralı (saf fonksiyon)
lib/dekont-servis.ts   Dekont okuma servisine HTTP çağrısı (PDF + görsel)
python-dekont-servisi/ FastAPI mikroservisi — regex + OCR ile dekont okuma
python-dekont-servisi/Dockerfile  Tesseract + tur dil paketi içeren imaj
Dockerfile          Next.js paneli için imaj (standalone çıktı)
docker-compose.yml  VPS'te koşan beş servis: panel + waha + dekont + hatirlatma + caddy
lib/site-url.ts     Panelin genel adresi — çalışma anında okunur, imaja gömülmez
scripts/hatirlatma-zamanlayici.sh  Günlük hatırlatmayı tetikleyen crond betiği
Caddyfile           Caddy reverse proxy + otomatik Let's Encrypt sertifikası
lib/whatsapp.ts     Mesaj şablonu doldurma ve wa.me linki
lib/waha.ts         WAHA istemcisi — otomatik mesaj gönderimi, gelen medya indirme
lib/veri.ts         Panel ve daire detayı sorguları
app/api/ingest/     Dekont giriş noktası — kiracı linki, panel ve otomasyon
app/api/whatsapp-webhook/  WAHA'dan gelen dekontu /api/ingest'e yönlendirir
app/y/[token]/      Kiracının gördüğü sayfa (oturum gerektirmez), WAHA kapalıyken yedek
lib/csv.ts          CSV alan kaçışı (formül enjeksiyonu dahil) — saf, testli
components/panel-sekmeleri.tsx  Panelin Ödeyenler/Ödemeyenler/Faturasız sekmeleri
app/api/export/csv/ Fatura dökümünün CSV indirmesi
app/api/cron/hatirlat/  Vadesi geçmiş faturalara günlük otomatik hatırlatma
supabase/migrations/  0001–0005, sırayla çalıştırılır
```

### Eşleştirme kuralı

`lib/esles.ts` içinde, testleri `tests/esles.test.ts`:

- Dekont okunamazsa → faturanın durumu **değişmez**, dosya yine kaydedilir ve
  panelde "elle kontrol edin" uyarısı çıkar. Okuma hatası dekontu kaybettirmez.
- Tutar farkı 1 kuruşa kadar tolere edilir.
- TL dışı para birimi eşleştirilmez (1650 USD ≠ 1650 ₺).
- Alıcı IBAN'ı ayarlardakinden farklıysa eşleşme bozulmaz, sadece uyarı düşer.

---

## WhatsApp otomasyonu (WAHA)

`WAHA_URL` ayarlanırsa panel tam otomatik çalışır: fatura mesajı elle
tıklanmadan gider, kiracının sohbete attığı dekont fotoğrafı/PDF'i otomatik
yakalanıp okunur. `WAHA_URL` boşsa panel eskisi gibi manuel `wa.me` akışıyla
çalışmaya devam eder — otomasyon tamamen opsiyoneldir.

WAHA, WhatsApp Web protokolünü kullanan **resmi olmayan** bir köprüdür (WAHA
Cloud API değildir). Bu yüzden hesap askıya alınma riski taşır; her müşteri
kendi WhatsApp Business numarasıyla ayrı bir WAHA örneği çalıştırmalı, tek bir
sunucuda birden fazla müşteri numarasını toplamak riski büyütür.

**Kurulum (VPS'te, her müşteri için ayrı):**

`docker-compose.yml` üç servisi birden ayağa kaldırır: WAHA, dekont okuma
servisi ve ikisinin önünde TLS sonlandıran Caddy (bkz. "HTTPS ve alan adı").

**Önce DNS:** alan adınızda iki A kaydı bu sunucunun IP'sine bakmalı —
`dekont.<alanadi>` ve `waha.<alanadi>`. Caddy sertifikaları bu adlar üzerinden
alır, kayıtlar hazır değilken sertifika alamaz.

Sonra sunucudaki repo kökünde bir `.env` dosyası oluşturun:

```bash
cat > .env <<'SON'
DOMAIN=alanadiniz.com
ACME_EMAIL=siz@alanadiniz.com
WAHA_API_KEY=
WAHA_DASHBOARD_USERNAME=admin
WAHA_DASHBOARD_PASSWORD=
DEKONT_SERVICE_KEY=
SON

# Boş bırakılan üçünü doldurun:
openssl rand -hex 16   # WAHA_API_KEY
openssl rand -hex 16   # WAHA_DASHBOARD_PASSWORD
openssl rand -hex 32   # DEKONT_SERVICE_KEY

docker compose up -d
```

> `docker compose` repo kökündeki `.env`'i kendiliğinden okur; `export`
> etmenize ya da reboot sonrası tekrarlamanıza gerek kalmaz. Bu dosya
> sunucuda kalır, repoya girmez.

`https://waha.<alanadi>/dashboard/` üzerinden `default` oturumunu başlatıp QR'ı
müşterinin WhatsApp Business'ından taratın. Oturum verisi `waha_data`
volume'ünde kalıcıdır — container yeniden başlasa da QR'ı tekrar taratmak
gerekmez.

Sonra Next.js ortamına (Vercel'de Environment Variables):

```
WAHA_URL=https://waha.<alanadi>
WAHA_API_KEY=<yukarıdaki değer>
WAHA_SESSION=default
WAHA_WEBHOOK_SECRET=<kendi ürettiğiniz rastgele bir değer>
```

Son olarak WAHA session ayarına webhook'u ekleyin (`X-Api-Key` başlığıyla):

```bash
curl -X PUT https://waha.<alanadi>/api/sessions/default \
  -H "X-Api-Key: $WAHA_API_KEY" -H 'Content-Type: application/json' \
  -d '{"config":{"webhooks":[{"url":"https://<vercel-adresiniz>/api/whatsapp-webhook","events":["message"],"customHeaders":[{"name":"X-Webhook-Secret","value":"<WAHA_WEBHOOK_SECRET ile aynı değer>"}]}]}}'
```

**Nasıl işliyor:**
- Giden: `lib/waha.ts` → `wahaMesajGonder`, panelden "gönder" butonuna
  basıldığında sunucudan otomatik gider (`app/daire/[id]/actions.ts`).
- Gelen: `app/api/whatsapp-webhook/route.ts` — gönderenin numarasını daireyle
  eşleştirir, o daire için bekleyen faturayı bulur, medyayı WAHA'dan indirip
  mevcut `/api/ingest` uç noktasına (n8n için de hazırlanmış aynı sözleşmeyle,
  `X-Ingest-Key` ile) iletir. Okuma/eşleştirme mantığı değişmeden çalışır.
- Kendi gönderdiğiniz mesajlar (`fromMe: true`) ve medyasız mesajlar webhook'ta
  sessizce atlanır.

---

## CSV dökümü

Panelin sağ üstündeki **"<yıl> CSV indir"** butonu, o yıla ait tüm faturaları
blok/daire/kiracı/dönem/tutar/durum/son ödeme/gönderim tarihi sütunlarıyla
indirir (`/api/export/csv?yil=2026`, yıl parametresiz tüm geçmiş). Dosya UTF-8
BOM ile yazılır — Excel'de Türkçe karakterler bozulmaz. Hem yönetici hem
görüntüleyici indirebilir, salt okuma işlemidir.

`=`, `+`, `-` veya `@` ile başlayan hücrelerin başına tek tırnak konur; Excel
bunları formül olarak çalıştırmasın diye (`lib/csv.ts`). Tırnak görüntüde çıkmaz.

---

## Otomatik hatırlatma

Vadesi geçmiş ve hâlâ ödenmemiş faturalara günde bir kez WhatsApp hatırlatması
gider. İşi `app/api/cron/hatirlat` yapar; aynı faturaya 3 günden sık hatırlatma
gitmez (`son_hatirlatma_at` kolonu) ve son gönderim tarihi daire detayındaki
fatura kartında görünür.

**Zamanlayıcı `hatirlatma` container'ıdır.** Alpine'ın busybox `crond`'u her gün
09:00'da (container saati UTC) paneli `CRON_SECRET` ile çağırır — betik
`scripts/hatirlatma-zamanlayici.sh`. Saati değiştirmek için `.env`'e:

```
CRON_SAATI=30 6 * * *
```

> `vercel.json` içindeki cron tanımı repoda duruyor ama **kendi sunucunuzda
> çalışmaz**; yalnızca Vercel'e geri dönerseniz devreye girer. VPS'te işi
> yapan `hatirlatma` servisidir.

**Gerekli ayarlar:**

1. `CRON_SECRET` üretin (`openssl rand -hex 32`) ve `.env`'e yazın.
   **Tanımlı değilse uç nokta tüm istekleri reddeder** — bilinçli: değişkeni
   unutmak hatırlatma ucunu herkese açık bırakmasın diye.
2. `WAHA_URL` dolu olmalı. WAHA yapılandırılmamışsa mesaj atacak bir yol yok;
   iş hiçbir şey yapmadan `{"atlandi":"waha-aktif-degil"}` döner.

Zamanlayıcının çalıştığını görmek için:

```bash
docker compose logs -f hatirlatma
```

Beklemeden elle tetiklemek için:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3100/api/cron/hatirlat
```

---

## Dekont servisini yayına alma

Dekont okuma servisi Vercel'de **çalışamaz**: sistemde kurulu bir `tesseract`
ikilisi ve Türkçe dil paketi gerektiriyor, serverless fonksiyonlar ise böyle bir
bağımlılığı taşıyamıyor. Bu yüzden servis WAHA ile aynı VPS'te, Docker içinde
koşar. `python-dekont-servisi/Dockerfile` Tesseract'i ve `tur` dil paketini
imajın içine kurar — sunucuda elle kurulum yapmanız gerekmez.

**Adımlar (WAHA kurulumuyla aynı `docker compose up -d` içinde gelir):**

1. `DEKONT_SERVICE_KEY` üretin ve hem VPS'te hem Vercel'de aynı değeri kullanın:
   ```bash
   openssl rand -hex 32
   ```
2. Servisin ayakta olduğunu doğrulayın (bu uç anahtar istemez):
   ```bash
   curl https://dekont.<alanadi>/health          # {"durum":"ok"}
   ```
3. Anahtarın çalıştığını doğrulayın — anahtarsız istek reddedilmeli:
   ```bash
   # anahtarsız -> 401
   curl -o /dev/null -w '%{http_code}' -F file=@ornek.pdf https://dekont.<alanadi>/dekont-oku

   # doğru anahtarla -> okunan alanlar JSON olarak döner
   curl -F file=@ornek.pdf -H "X-Service-Key: <anahtar>" https://dekont.<alanadi>/dekont-oku
   ```
4. Vercel'de **Settings → Environment Variables**:
   ```
   DEKONT_SERVIS_URL=https://dekont.<alanadi>
   DEKONT_SERVICE_KEY=<yukarıdaki değer>
   ```

Kod değiştiğinde imajı yenilemek için:

```bash
docker compose up -d --build dekont
```

**Neden ayrı bir sunucu gerekiyor?** Panel Vercel'de, OCR servisi VPS'te.
`DEKONT_SERVIS_URL` yerelde `http://localhost:8000` kalırsa Vercel oraya
ulaşamaz; her dekont "okunamadı" düşer ve panelde "elle kontrol edin" uyarısı
çıkar. Veri kaybolmaz (dosya yine kaydedilir) ama otomatik eşleştirme devre dışı
kalır — yayına alırken bu adresi güncellemeyi atlamayın.

> Servis durumsuzdur: volume, veritabanı ya da kalıcı disk istemez. Yeniden
> başlatmak veya imajı güncellemek hiçbir veriyi etkilemez.

---

## HTTPS ve alan adı

Panel Vercel'de, WAHA ve dekont servisi sizin VPS'inizde — yani aralarındaki
trafik internetten geçiyor. Şifresiz bırakılırsa `DEKONT_SERVICE_KEY`,
`WAHA_API_KEY` ve dekont görüntülerinin kendisi hat üzerinde açık gider. Bu
yüzden ikisinin önünde **Caddy** duruyor.

Caddy sertifikaları Let's Encrypt'ten kendisi alır ve süresi dolmadan yeniler;
elle sertifika yönetmezsiniz. `Caddyfile` iki alt alan adını yayına çıkarır:

| Adres | Nereye gider |
|---|---|
| `https://panel.<alanadi>` | Panelin kendisi — kullanıcı buraya girer |
| `https://dekont.<alanadi>` | Dekont okuma servisi (Vercel buraya istek atar) |
| `https://waha.<alanadi>` | WAHA API'si ve panosu |

**Gereken:**

1. Üç A kaydı, sunucunun IP'sine: `panel.<alanadi>`, `dekont.<alanadi>` ve
   `waha.<alanadi>`.
2. 80 ve 443 portları dışarıya açık. 80 yalnızca sertifika doğrulaması ve
   HTTPS'e yönlendirme için kullanılır.
3. `.env` içinde `DOMAIN` ve `ACME_EMAIL` (bkz. kurulum bölümü).

**Servisler artık dışarıya açık değil.** `docker-compose.yml`'de WAHA ve dekont
port eşlemeleri `127.0.0.1`'e bağlı — yani yalnızca sunucunun kendi içinden
erişilebilirler, dışarıdan tek kapı Caddy. Sunucuda hata ayıklarken şifresiz
olarak hâlâ kullanabilirsiniz:

```bash
curl http://127.0.0.1:8000/health     # dekont
curl http://127.0.0.1:3001/api/health # waha
```

Sertifikalar `caddy_data` volume'ünde kalıcıdır — container yeniden başlasa da
Let's Encrypt'ten tekrar sertifika istenmez (rate limit'e takılmamak için önemli).

**Sık karşılaşılan sorun:** DNS kayıtları yayılmadan `docker compose up -d`
çalıştırırsanız Caddy sertifika alamaz ve tekrar dener; logu izleyin:

```bash
docker compose logs -f caddy
```

> Alan adınız yoksa bu kurulum çalışmaz — Let's Encrypt IP adresine sertifika
> vermez. Ucuz bir alan adı almak en pratik yol; alternatif olarak Cloudflare
> Tunnel gibi bir çözüm de VPS'i doğrudan açmadan HTTPS sağlar.

---

## Güvenlik notları

- Panel sayfaları middleware ile korunuyor; oturumsuz erişim `/giris`'e düşer.
- Kiracı sayfası `/y/<token>` oturum istemez — yetki token'ın kendisidir. Token
  fatura başına üretilen bir UUID'dir ve o faturadan başka hiçbir veri göstermez.
- Dekont bucket'ı private; dosyalar yalnızca 30 dakikalık imzalı adresle açılır.
- `SUPABASE_SERVICE_ROLE_KEY` yalnızca sunucuda kullanılır.
- WAHA ve dekont servisi dışarıya yalnızca Caddy üzerinden, HTTPS ile açılır;
  container portları `127.0.0.1`'e bağlıdır. Servis anahtarları ve dekont
  görüntüleri hat üzerinde şifresiz gitmez.
- Dekont okuma servisi `DEKONT_SERVICE_KEY` olmadan hiçbir istek kabul etmez
  (fail-closed). Anahtar sabit zamanlı karşılaştırmayla doğrulanır. Servis
  VPS'te public bir portta durduğu için bu zorunluluk bilinçlidir; yalnızca
  `/health` ucu anahtarsız cevap verir.
- Bir faturaya en fazla 15 dekont yüklenebilir (açık uçlu linkin kötüye
  kullanılmasına karşı).
- `/api/ingest` IP başına 10 dakikada 20 istekle sınırlı (`lib/rate-limit.ts`).
  Bu bellek içi bir frendir: Vercel'de her sunucu örneği kendi sayacını tutar,
  soğuk başlangıçta sıfırlanır. Asıl güvenlik sınırı tahmin edilemez
  `public_token`'ın kendisidir; bu yalnızca tek kaynaktan gelen hızlı spam'i
  yavaşlatır.
- Yazma yapan her sunucu action'ı role bakar (`yoneticiDegilse`). Veritabanı
  RLS'i ikinci katman; ama RLS dışarı giden WhatsApp mesajını durduramadığı
  için yetki kontrolü gönderimden **önce** yapılır.
- `/api/cron/hatirlat` `CRON_SECRET` olmadan tüm istekleri reddeder. Değişkeni
  tanımlamayı unutmak uç noktayı açıkta bırakmaz.
- Giriş sonrası `?devam=` parametresi yalnızca site içi bir yola izin verir
  (açık yönlendirme koruması).
