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

---

## Kurulum

### 1. Supabase projesi

[supabase.com](https://supabase.com) üzerinde ücretsiz bir proje aç.

**Şemayı kur:** Supabase panelinde **SQL Editor** → `supabase/migrations/0001_init.sql`
dosyasının içeriğini yapıştır → **Run**. Bu; tabloları, güvenlik kurallarını (RLS),
fatura toplamını otomatik hesaplayan trigger'ı ve dekont dosyalarının duracağı
`dekontlar` bucket'ını oluşturur.

**Kendine kullanıcı aç:** **Authentication → Users → Add user** → e-posta ve şifre
gir, *Auto Confirm User* seçeneğini işaretle. Panele bu bilgilerle gireceksin.

> Kayıt sayfası bilerek yok — panel tek kullanıcılık. Yeni kullanıcı gerekirse
> yine buradan eklenir.

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

Servis isteğe bağlı `DEKONT_SERVICE_KEY` ile korunur — tanımlıysa Next.js tarafı
aynı değeri `X-Service-Key` başlığında göndermek zorundadır.

### 3. Ortam değişkenleri

```bash
cp .env.example .env.local
```

`.env.local` dosyasını yukarıda aldığın değerlerle doldur. `NEXT_PUBLIC_SITE_URL`
yerel çalışırken `http://localhost:3000` kalabilir; yayına aldığında Vercel
adresini yazacaksın (kiracıya giden dekont linki buradan üretiliyor).

### 4. Çalıştır

```bash
npm install
npm run dev
```

[localhost:3000](http://localhost:3000) → Supabase'de açtığın kullanıcıyla giriş yap.

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
tüm değişkenleri ekle. `NEXT_PUBLIC_SITE_URL`'i Vercel'in verdiği adrese güncelle
(`https://xxx.vercel.app`) — kiracıya giden dekont linki bu adresi kullanıyor.

Yayına aldıktan sonra telefondan bir kez gerçek dekontla dene: mobilde dosya
seçici ve kamera akışı çalışıyor mu diye.

---

## Maliyet

| Kalem | Tutar |
|---|---|
| Supabase | Ücretsiz katman bu ölçekte fazlasıyla yeter |
| Vercel | Ücretsiz katman yeter |
| Dekont okuma (regex + Tesseract OCR) | 0 ₺ — AI/API çağrısı yok |

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
lib/whatsapp.ts     Mesaj şablonu doldurma ve wa.me linki
lib/waha.ts         WAHA istemcisi — otomatik mesaj gönderimi, gelen medya indirme
lib/veri.ts         Panel ve daire detayı sorguları
app/api/ingest/     Dekont giriş noktası — kiracı linki, panel ve otomasyon
app/api/whatsapp-webhook/  WAHA'dan gelen dekontu /api/ingest'e yönlendirir
app/y/[token]/      Kiracının gördüğü sayfa (oturum gerektirmez), WAHA kapalıyken yedek
supabase/migrations/0001_init.sql
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

```bash
export WAHA_API_KEY=$(openssl rand -hex 16)
export WAHA_DASHBOARD_USERNAME=admin
export WAHA_DASHBOARD_PASSWORD=$(openssl rand -hex 16)
docker compose -f docker-compose.waha.yml up -d
```

`http://<sunucu>:3001/dashboard/` üzerinden `default` oturumunu başlatıp QR'ı
müşterinin WhatsApp Business'ından taratın. Oturum verisi `waha_data`
volume'ünde kalıcıdır — container yeniden başlasa da QR'ı tekrar taratmak
gerekmez.

Sonra Next.js ortamına (Vercel'de Environment Variables):

```
WAHA_URL=http://<sunucu>:3001
WAHA_API_KEY=<yukarıdaki değer>
WAHA_SESSION=default
WAHA_WEBHOOK_SECRET=<kendi ürettiğiniz rastgele bir değer>
```

Son olarak WAHA session ayarına webhook'u ekleyin (`X-Api-Key` başlığıyla):

```bash
curl -X PUT http://<sunucu>:3001/api/sessions/default \
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

## Güvenlik notları

- Panel sayfaları middleware ile korunuyor; oturumsuz erişim `/giris`'e düşer.
- Kiracı sayfası `/y/<token>` oturum istemez — yetki token'ın kendisidir. Token
  fatura başına üretilen bir UUID'dir ve o faturadan başka hiçbir veri göstermez.
- Dekont bucket'ı private; dosyalar yalnızca 30 dakikalık imzalı adresle açılır.
- `SUPABASE_SERVICE_ROLE_KEY` yalnızca sunucuda kullanılır.
- Dekont okuma servisi `DEKONT_SERVICE_KEY` ile korunur; Next.js dışından
  çağrılacaksa anahtar zorunlu tutulmalıdır.
- Bir faturaya en fazla 15 dekont yüklenebilir (açık uçlu linkin kötüye
  kullanılmasına karşı).
