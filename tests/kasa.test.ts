import { test } from "node:test";
import assert from "node:assert/strict";
import {
  esitPaylastir,
  faturaTahsilati,
  kasaOzeti,
  toplamGider,
  type TahsilatFaturasi,
} from "../lib/kasa.ts";
import { faturaKalani, type BorcFaturasi } from "../lib/borc.ts";

function fatura(ek: Partial<TahsilatFaturasi> = {}): TahsilatFaturasi {
  return { toplam: 1000, durum: "gonderildi", dekontlar: [], ...ek };
}

// ------------------------------------------------------- faturaTahsilati

test("ödenmiş faturanın tamamı tahsilat sayılır", () => {
  assert.equal(faturaTahsilati(fatura({ durum: "odendi" })), 1000);
});

test("nakit tahsilatta dekont yoktur ama para kasaya girmiştir", () => {
  // Elle "ödendi" işaretlenen fatura; dekont listesi boş.
  assert.equal(faturaTahsilati(fatura({ durum: "odendi", dekontlar: [] })), 1000);
});

test("kısmi ödeme kadarı tahsilat sayılır", () => {
  const f = fatura({ dekontlar: [{ eslesme: "kismi", okunan_tutar: 400 }] });
  assert.equal(faturaTahsilati(f), 400);
});

test("hiç ödeme yoksa tahsilat sıfırdır", () => {
  assert.equal(faturaTahsilati(fatura()), 0);
});

test("okunamayan dekont tahsilat üretmez", () => {
  const f = fatura({ dekontlar: [{ eslesme: "unreadable", okunan_tutar: null }] });
  assert.equal(faturaTahsilati(f), 0);
});

test("açık faturada tahsilat ve kalan toplamı verir", () => {
  // kasa.ts ile borc.ts'in simetrisi: ikisi birden faturayı tüketmeli.
  const ortak = {
    toplam: 1000,
    durum: "gonderildi" as const,
    dekontlar: [{ eslesme: "kismi" as const, okunan_tutar: 400 }],
  };
  const borcGirdisi: BorcFaturasi = {
    ...ortak,
    donem: "2026-09-01",
    son_odeme_tarihi: "2026-09-10",
  };

  assert.equal(faturaTahsilati(ortak) + faturaKalani(borcGirdisi), 1000);
});

// ------------------------------------------------------------- kasaOzeti

test("kasa bakiyesi tahsilat eksi giderdir", () => {
  const ozet = kasaOzeti(
    [fatura({ durum: "odendi" }), fatura({ durum: "odendi" })],
    [{ tutar: 750 }, { tutar: 250 }],
  );

  assert.equal(ozet.tahsilat, 2000);
  assert.equal(ozet.gider, 1000);
  assert.equal(ozet.bakiye, 1000);
});

test("gider tahsilatı aşarsa bakiye eksiye düşer", () => {
  // Yönetici cebinden ödediğinde gerçek durum budur; gizlemek işe yaramaz.
  const ozet = kasaOzeti([fatura({ durum: "odendi" })], [{ tutar: 2500 }]);
  assert.equal(ozet.bakiye, -1500);
});

test("hiç hareket yoksa kasa sıfırdır", () => {
  const ozet = kasaOzeti([], []);
  assert.deepEqual(ozet, { tahsilat: 0, gider: 0, bakiye: 0 });
});

test("gider toplamı metin gelen tutarlarda da doğru", () => {
  // Supabase numeric alanları çalışma zamanında string dönebiliyor.
  assert.equal(toplamGider([{ tutar: "100.50" as unknown as number }, { tutar: 99.5 }]), 200);
});

// --------------------------------------------------------- esitPaylastir

test("bölünebilen tutar eşit dağıtılır", () => {
  assert.deepEqual(esitPaylastir(900, 3), [300, 300, 300]);
});

test("kuruş artığı kaybolmaz, son daireye eklenir", () => {
  const paylar = esitPaylastir(100, 3);
  assert.deepEqual(paylar, [33.33, 33.33, 33.34]);
  assert.equal(paylar.reduce((a, b) => a + b, 0), 100);
});

test("paylaştırma toplamı her zaman aslına eşittir", () => {
  for (const [tutar, adet] of [
    [1000, 7],
    [1234.56, 11],
    [0.05, 4],
    [99.99, 6],
  ] as const) {
    const toplam = esitPaylastir(tutar, adet).reduce((a, b) => a + b, 0);
    assert.equal(
      Math.round(toplam * 100),
      Math.round(tutar * 100),
      `${tutar} / ${adet} paylaştırmada toplam kaydı`,
    );
  }
});

test("tek daireye paylaştırma tutarın tamamını verir", () => {
  assert.deepEqual(esitPaylastir(750, 1), [750]);
});

test("daire yoksa boş dizi döner", () => {
  assert.deepEqual(esitPaylastir(750, 0), []);
});
