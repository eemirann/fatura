# Kira Fatura Takip Paneli

Kiracılara aylık su/elektrik faturasını WhatsApp'tan gönderip dekontlarını takip
etmek için yapılmış panel.

**Akış:** Daireye tıkla → kalemleri gir → tek tıkla WhatsApp'a düş (daire sarı) →
kiracı mesajdaki linkten dekontunu yükler → Claude dekonttaki tutarı okur →
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

### 2. Claude API anahtarı

[console.anthropic.com](https://console.anthropic.com) → **API Keys** → yeni anahtar
oluştur → `ANTHROPIC_API_KEY`.

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
| Claude (dekont okuma) | Dekont başına ~1 ₺ · ayda 20 dekont ≈ 20 ₺ |

Daha ucuza çekmek istersen `lib/dekont-oku.ts` içindeki `model` satırını
`claude-haiku-4-5` yapman yeterli (~5 kat ucuz), ama Türk banka dekontlarında
okuma isabeti düşer.

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
lib/dekont-oku.ts   Claude çağrısı (PDF + görsel)
lib/whatsapp.ts     Mesaj şablonu doldurma ve wa.me linki
lib/veri.ts         Panel ve daire detayı sorguları
app/api/ingest/     Dekont giriş noktası — kiracı linki, panel ve otomasyon
app/y/[token]/      Kiracının gördüğü sayfa (oturum gerektirmez)
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

## Sonradan: n8n ile tam otomasyon

Şu an dekont ya kiracının linkinden ya da senin panelden yüklemenle geliyor.
İleride WhatsApp'a gelen dekontu otomatik yakalatmak istersen `/api/ingest` uç
noktası buna hazır — panel kodunu değiştirmen gerekmez:

```
POST /api/ingest
Header: X-Ingest-Key: <INGEST_API_KEY ile aynı değer>
Body (multipart/form-data):
  token veya invoice_id
  file
```

n8n'in WhatsApp'a bağlanması ayrı bir konu: kendi numaranı kullanmak için WAHA
gibi bir köprü (7/24 sunucu + hesap askıya alınma riski) ya da resmi WhatsApp
Business Cloud API (ayrı numara gerekir) kurman gerekir.

---

## Güvenlik notları

- Panel sayfaları middleware ile korunuyor; oturumsuz erişim `/giris`'e düşer.
- Kiracı sayfası `/y/<token>` oturum istemez — yetki token'ın kendisidir. Token
  fatura başına üretilen bir UUID'dir ve o faturadan başka hiçbir veri göstermez.
- Dekont bucket'ı private; dosyalar yalnızca 30 dakikalık imzalı adresle açılır.
- `ANTHROPIC_API_KEY` ve `SUPABASE_SERVICE_ROLE_KEY` yalnızca sunucuda kullanılır.
- Bir faturaya en fazla 15 dekont yüklenebilir (açık uçlu linkin kötüye
  kullanılmasına karşı).
