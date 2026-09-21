import { test } from "node:test";
import assert from "node:assert/strict";
import { hatirlatmaBasligi, mesajOlustur } from "../lib/whatsapp.ts";

// ------------------------------------------------------- hatirlatmaBasligi

test("tek dönem borçluysa kısa etiket kullanılır", () => {
  const b = hatirlatmaBasligi([{ donem: "2026-09-01", kalan: 750 }], 750);
  assert.equal(b, "⏰ Hatırlatma:\n\n");
});

test("hiç kalem yoksa da kısa etiket kullanılır", () => {
  assert.equal(hatirlatmaBasligi([], 0), "⏰ Hatırlatma:\n\n");
});

test("birden fazla dönemde toplam borç ve döküm yazılır", () => {
  const b = hatirlatmaBasligi(
    [
      { donem: "2026-07-01", kalan: 750 },
      { donem: "2026-08-01", kalan: 750 },
      { donem: "2026-09-01", kalan: 500 },
    ],
    2000,
  );

  assert.match(b, /Ödenmemiş toplam borcunuz: 2\.000,00 ₺/);
  assert.match(b, /• Temmuz 2026: 750,00 ₺/);
  assert.match(b, /• Ağustos 2026: 750,00 ₺/);
  assert.match(b, /• Eylül 2026: 500,00 ₺/);
});

test("başlık şablonun önüne ekleneceği için sonu boş satırla biter", () => {
  const b = hatirlatmaBasligi(
    [
      { donem: "2026-08-01", kalan: 100 },
      { donem: "2026-09-01", kalan: 100 },
    ],
    200,
  );
  assert.ok(b.endsWith("\n\n"));
});

// ----------------------------------------------------------- mesajOlustur

test("yer tutucular doldurulur", () => {
  const m = mesajOlustur({
    sablon: "Sayın {kiraci_adi}, {donem} toplamı {toplam}. IBAN: {iban}",
    kiraciAdi: "Ayşe",
    blokAdi: "A Blok",
    kapiNo: "3",
    donem: "2026-09-01",
    kalemler: [],
    toplam: 750,
    sonOdemeTarihi: "2026-09-10",
    iban: "TR11",
    hesapSahibi: "Emiran",
    dekontLinki: "https://ornek/y/abc",
  });

  assert.equal(m, "Sayın Ayşe, Eylül 2026 toplamı 750,00 ₺. IBAN: TR11");
});

test("bilinmeyen yer tutucu olduğu gibi bırakılır", () => {
  // Sessizce boşa çevirmek, şablonu yanlış yazan kullanıcıya hatayı gizlerdi.
  const m = mesajOlustur({
    sablon: "{yanlis_anahtar} ve {toplam}",
    kiraciAdi: null,
    blokAdi: "",
    kapiNo: "",
    donem: "2026-09-01",
    kalemler: [],
    toplam: 10,
    sonOdemeTarihi: "2026-09-10",
    iban: "",
    hesapSahibi: "",
    dekontLinki: "",
  });

  assert.match(m, /^\{yanlis_anahtar\} ve 10,00 ₺$/);
});

test("kiracı adı yoksa nazik bir varsayılan kullanılır", () => {
  const m = mesajOlustur({
    sablon: "{kiraci_adi}",
    kiraciAdi: null,
    blokAdi: "",
    kapiNo: "",
    donem: "2026-09-01",
    kalemler: [],
    toplam: 0,
    sonOdemeTarihi: "2026-09-10",
    iban: "",
    hesapSahibi: "",
    dekontLinki: "",
  });

  assert.equal(m, "Sayın kiracımız");
});

test("kalemler madde madde alt alta yazılır", () => {
  const m = mesajOlustur({
    sablon: "{kalemler}",
    kiraciAdi: null,
    blokAdi: "",
    kapiNo: "",
    donem: "2026-09-01",
    kalemler: [
      { baslik: "Aidat", tutar: 750 },
      { baslik: "Su", tutar: 120.5 },
    ],
    toplam: 870.5,
    sonOdemeTarihi: "2026-09-10",
    iban: "",
    hesapSahibi: "",
    dekontLinki: "",
  });

  assert.equal(m, "• Aidat: 750,00 ₺\n• Su: 120,50 ₺");
});
