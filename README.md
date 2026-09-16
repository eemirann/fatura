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

`.env.local` dosyasını yukarıda aldığın değerlerle doldur. `NEXT_PUBLIC_SITE_URL`
yerel çalışırken `http://localhost:3100` kalabilir; yayına aldığında Vercel
adresini yazacaksın (kiracıya giden dekont linki buradan üretiliyor).

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

## Yayına alma (Vercel)

```bash
npx vercel
```

Vercel panelinden **Settings → Environment Variables** altına `.env.local`'daki
tüm değişkenleri ekle. Yerel değerleriyle bırakılmaması gereken üçü:

| Değişken | Üretimdeki değeri |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Vercel adresiniz (`https://xxx.vercel.app`) — kiracıya giden dekont linki buradan üretiliyor |
| `DEKONT_SERVIS_URL` | VPS'inizdeki dekont servisi (`https://dekont.<alanadi>`) — `localhost` kalırsa Vercel ulaşamaz |
| `CRON_SECRET` | Rastgele bir değer; tanımsızsa hatırlatma ucu tüm istekleri reddeder |

Yayına aldıktan sonra telefondan bir kez gerçek dekontla dene: mobilde dosya
seçici ve kamera akışı çalışıyor mu diye.

---

## Maliyet

| Kalem | Tutar |
|---|---|
| Supabase | Ücretsiz katman bu ölçekte fazlasıyla yeter |
| Vercel | Ücretsiz katman yeter |
| Dekont okuma (regex + Tesseract OCR) | 0 ₺ — AI/API çağrısı yok |
| VPS (WAHA + dekont servisi) | En küçük paket yeter; ikisi aynı sunucuda koşar |

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
```

---

## Proje yapısı

```
lib/durum.ts        Panel renk kuralı — TEK kaynak, renk değişikliği burada yapılır
lib/esles.ts        Dekont tutarı ↔ fatura tutarı eşleştirme kuralı (saf fonksiyon)
lib/dekont-servis.ts   Dekont okuma servisine HTTP çağrısı (PDF + görsel)
python-dekont-servisi/ FastAPI mikroservisi — regex + OCR ile dekont okuma
python-dekont-servisi/Dockerfile  Tesseract + tur dil paketi içeren imaj
docker-compose.yml  VPS'te koşan üç servis: caddy + waha + dekont
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
gider. Zamanlama `vercel.json`'daki cron ile tanımlı (her gün 09:00 UTC),
işi `app/api/cron/hatirlat` yapar. Aynı faturaya 3 günden sık hatırlatma
gitmez (`son_hatirlatma_at` kolonu); son gönderim tarihi daire detayındaki
fatura kartında görünür.

**Gerekli ayarlar:**

1. `CRON_SECRET` üret ve hem `.env.local`'e hem Vercel ortam değişkenlerine
   ekle: `openssl rand -hex 32`. **Tanımlı değilse uç nokta tüm istekleri
   reddeder** — bu bilinçli: değişkeni unutmak hatırlatma ucunu herkese açık
   bırakmasın diye.
2. `WAHA_URL` dolu olmalı. WAHA yapılandırılmamışsa mesaj atacak bir yol yok;
   cron hiçbir şey yapmadan `{"atlandi":"waha-aktif-degil"}` döner.

> Vercel ücretsiz (Hobby) katmanında cron günde bir kez çalışır ve tam
> 09:00'da değil, o saat civarında tetiklenir.

Elle denemek için:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3100/api/cron/hatirlat
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
| `https://dekont.<alanadi>` | Dekont okuma servisi (Vercel buraya istek atar) |
| `https://waha.<alanadi>` | WAHA API'si ve panosu |

**Gereken:**

1. İki A kaydı, sunucunun IP'sine: `dekont.<alanadi>` ve `waha.<alanadi>`.
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
