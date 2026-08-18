import { test } from "node:test";
import assert from "node:assert/strict";
import { eslestir } from "../lib/esles.ts";
import type { DekontOkuma } from "../lib/dekont-oku.ts";

const IBAN = "TR330006100519786457841326";

function okuma(ek: Partial<DekontOkuma> = {}): DekontOkuma {
  return {
    okunabilir: true,
    tutar: 1650,
    para_birimi: "TRY",
    tarih: "2026-08-10",
    alici_iban: IBAN,
    alici_ad: "Emiran",
    gonderen_ad: "Kiracı",
    banka: "Ziraat",
    aciklama: "havale",
    ...ek,
  };
}

test("tutar birebir tutuyorsa ödendi işaretlenir", () => {
  const s = eslestir(okuma(), 1650, IBAN);
  assert.equal(s.eslesme, "matched");
  assert.equal(s.yeniDurum, "odendi");
});

test("bir kuruşluk fark tolere edilir", () => {
  assert.equal(eslestir(okuma({ tutar: 1650.01 }), 1650, IBAN).eslesme, "matched");
});

test("iki kuruşluk fark uyuşmazlık sayılır", () => {
  const s = eslestir(okuma({ tutar: 1650.02 }), 1650, IBAN);
  assert.equal(s.eslesme, "mismatch");
  assert.equal(s.yeniDurum, "uyusmadi");
});

test("eksik ödeme uyuşmazlıktır, ödendi olmaz", () => {
  const s = eslestir(okuma({ tutar: 1000 }), 1650, IBAN);
  assert.equal(s.eslesme, "mismatch");
  assert.equal(s.yeniDurum, "uyusmadi");
  assert.match(s.aciklama, /650\.00/);
});

test("okunamayan dekont faturanın durumunu değiştirmez", () => {
  const s = eslestir(
    okuma({ okunabilir: false, tutar: null, aciklama: "Fotoğraf bulanık." }),
    1650,
    IBAN,
  );
  assert.equal(s.eslesme, "unreadable");
  assert.equal(s.yeniDurum, null);
  assert.equal(s.aciklama, "Fotoğraf bulanık.");
});

test("okunabilir true olsa da tutar null ise ödendi sayılmaz", () => {
  const s = eslestir(okuma({ tutar: null }), 1650, IBAN);
  assert.equal(s.eslesme, "unreadable");
  assert.equal(s.yeniDurum, null);
});

test("TL dışı para birimi karşılaştırılmaz", () => {
  const s = eslestir(okuma({ para_birimi: "USD" }), 1650, IBAN);
  assert.equal(s.eslesme, "mismatch");
  assert.match(s.aciklama, /USD/);
});

test("TL yazımı da kabul edilir", () => {
  assert.equal(eslestir(okuma({ para_birimi: "TL" }), 1650, IBAN).eslesme, "matched");
});

test("farklı IBAN eşleşmeyi bozmaz, sadece uyarı ekler", () => {
  const s = eslestir(okuma({ alici_iban: "TR999999999999999999999999" }), 1650, IBAN);
  assert.equal(s.eslesme, "matched");
  assert.equal(s.yeniDurum, "odendi");
  assert.match(s.aciklama, /IBAN/);
});

test("IBAN boşluklu yazılmışsa da doğru karşılaştırılır", () => {
  const s = eslestir(
    okuma({ alici_iban: "TR33 0006 1005 1978 6457 8413 26" }),
    1650,
    IBAN,
  );
  assert.doesNotMatch(s.aciklama, /IBAN/);
});

test("ayarlarda IBAN yoksa uyarı üretilmez", () => {
  const s = eslestir(okuma({ alici_iban: "TR99" }), 1650, "");
  assert.equal(s.eslesme, "matched");
  assert.doesNotMatch(s.aciklama, /IBAN/);
});
