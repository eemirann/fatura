import { test } from "node:test";
import assert from "node:assert/strict";
import { borcOzeti, devredenBorc, faturaKalani, type BorcFaturasi } from "../lib/borc.ts";

const BUGUN = "2026-09-15";

function fatura(ek: Partial<BorcFaturasi> = {}): BorcFaturasi {
  return {
    donem: "2026-09-01",
    toplam: 1000,
    durum: "gonderildi",
    son_odeme_tarihi: "2026-09-10",
    dekontlar: [],
    ...ek,
  };
}

// ------------------------------------------------------------- faturaKalani

test("hiç ödeme yoksa borç faturanın tamamıdır", () => {
  assert.equal(faturaKalani(fatura()), 1000);
});

test("kısmi ödeme borçtan düşer", () => {
  const f = fatura({ dekontlar: [{ eslesme: "kismi", okunan_tutar: 400 }] });
  assert.equal(faturaKalani(f), 600);
});

test("birden fazla kısmi ödeme toplanarak düşer", () => {
  const f = fatura({
    dekontlar: [
      { eslesme: "kismi", okunan_tutar: 400 },
      { eslesme: "kismi", okunan_tutar: 350 },
    ],
  });
  assert.equal(faturaKalani(f), 250);
});

test("elle ödendi işaretlenen faturanın borcu yoktur (nakit tahsilat)", () => {
  // Nakit ödemede ortada hiç dekont olmaz; duruma bakmayıp dekont toplamına
  // bakmak burada 1000 TL'lik hayalî bir borç üretirdi.
  assert.equal(faturaKalani(fatura({ durum: "odendi" })), 0);
});

test("taslak fatura borç sayılmaz - henüz kiracıya gönderilmemiştir", () => {
  assert.equal(faturaKalani(fatura({ durum: "taslak" })), 0);
});

test("tutarı uyuşmayan fatura borç olarak durur", () => {
  const f = fatura({
    durum: "uyusmadi",
    dekontlar: [{ eslesme: "mismatch", okunan_tutar: 250 }],
  });
  // mismatch dekont toplanan tutara girmez (bkz. esles.toplananTutar),
  // dolayısıyla borç düşmez — elle kontrol edilene kadar tam borç görünür.
  assert.equal(faturaKalani(f), 1000);
});

test("okunamayan dekont borcu azaltmaz", () => {
  const f = fatura({ dekontlar: [{ eslesme: "unreadable", okunan_tutar: null }] });
  assert.equal(faturaKalani(f), 1000);
});

test("kuruş artığı borç sayılmaz", () => {
  const f = fatura({ dekontlar: [{ eslesme: "kismi", okunan_tutar: 999.995 }] });
  assert.equal(faturaKalani(f), 0);
});

test("fazla ödeme negatif borç üretmez", () => {
  const f = fatura({ dekontlar: [{ eslesme: "kismi", okunan_tutar: 1200 }] });
  assert.equal(faturaKalani(f), 0);
});

// --------------------------------------------------------------- borcOzeti

test("birden fazla dönemin borcu toplanır", () => {
  const ozet = borcOzeti(
    [
      fatura({ donem: "2026-07-01", son_odeme_tarihi: "2026-07-10" }),
      fatura({ donem: "2026-08-01", son_odeme_tarihi: "2026-08-10" }),
      fatura({ donem: "2026-09-01", son_odeme_tarihi: "2026-09-10" }),
    ],
    BUGUN,
  );

  assert.equal(ozet.toplam, 3000);
  assert.equal(ozet.kalemler.length, 3);
});

test("ödenmiş dönemler özete hiç girmez", () => {
  const ozet = borcOzeti(
    [
      fatura({ donem: "2026-07-01", durum: "odendi" }),
      fatura({ donem: "2026-08-01" }),
    ],
    BUGUN,
  );

  assert.equal(ozet.toplam, 1000);
  assert.deepEqual(
    ozet.kalemler.map((k) => k.donem),
    ["2026-08-01"],
  );
});

test("kalemler eskiden yeniye sıralanır", () => {
  const ozet = borcOzeti(
    [
      fatura({ donem: "2026-09-01" }),
      fatura({ donem: "2026-07-01" }),
      fatura({ donem: "2026-08-01" }),
    ],
    BUGUN,
  );

  assert.deepEqual(
    ozet.kalemler.map((k) => k.donem),
    ["2026-07-01", "2026-08-01", "2026-09-01"],
  );
});

test("vadesi geçen ve geçmeyen borç ayrı toplanır", () => {
  const ozet = borcOzeti(
    [
      fatura({ donem: "2026-08-01", son_odeme_tarihi: "2026-08-10" }), // geçmiş
      fatura({ donem: "2026-09-01", son_odeme_tarihi: "2026-09-25" }), // henüz değil
    ],
    BUGUN,
  );

  assert.equal(ozet.toplam, 2000);
  assert.equal(ozet.gecikmis, 1000);
});

test("son ödeme günü bugün ise henüz gecikmiş sayılmaz", () => {
  const ozet = borcOzeti([fatura({ son_odeme_tarihi: BUGUN })], BUGUN);
  assert.equal(ozet.gecikmis, 0);
});

test("kalem içinde ödenen ve kalan ayrı ayrı görünür", () => {
  const ozet = borcOzeti(
    [fatura({ dekontlar: [{ eslesme: "kismi", okunan_tutar: 400 }] })],
    BUGUN,
  );

  assert.equal(ozet.kalemler[0].toplam, 1000);
  assert.equal(ozet.kalemler[0].odenen, 400);
  assert.equal(ozet.kalemler[0].kalan, 600);
});

test("hiç borç yoksa özet sıfırdır", () => {
  const ozet = borcOzeti([fatura({ durum: "odendi" })], BUGUN);
  assert.equal(ozet.toplam, 0);
  assert.equal(ozet.gecikmis, 0);
  assert.equal(ozet.kalemler.length, 0);
});

// ------------------------------------------------------------ devredenBorc

test("devreden borç seçili dönemi dışarıda bırakır", () => {
  const ozet = borcOzeti(
    [
      fatura({ donem: "2026-07-01" }),
      fatura({ donem: "2026-08-01" }),
      fatura({ donem: "2026-09-01" }),
    ],
    BUGUN,
  );

  // Eylül'e bakarken devreden, Temmuz + Ağustos.
  assert.equal(devredenBorc(ozet, "2026-09-01"), 2000);
});

test("yalnızca seçili dönemin borcu varsa devreden sıfırdır", () => {
  const ozet = borcOzeti([fatura({ donem: "2026-09-01" })], BUGUN);
  assert.equal(devredenBorc(ozet, "2026-09-01"), 0);
});
