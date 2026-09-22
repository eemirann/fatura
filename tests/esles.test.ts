import { test } from "node:test";
import assert from "node:assert/strict";
import { eslestir, kalemDegisimindeDurum, toplananTutar } from "../lib/esles.ts";
import type { DekontOkuma } from "../lib/dekont-servis.ts";

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

test("eksik ödeme kısmi sayılır, fatura durumu değişmez", () => {
  const s = eslestir(okuma({ tutar: 1000 }), 1650, IBAN);
  assert.equal(s.eslesme, "kismi");
  assert.equal(s.yeniDurum, null);
  assert.match(s.aciklama, /650\.00/);
});

test("kısmi ödemeler toplanıp tam tutara ulaşınca ödendi olur", () => {
  // İlk 1000 TL zaten alınmış (oncekiOdenenTutar), şimdi kalan 650 TL geliyor.
  const s = eslestir(okuma({ tutar: 650 }), 1650, IBAN, 1000);
  assert.equal(s.eslesme, "matched");
  assert.equal(s.yeniDurum, "odendi");
  assert.match(s.aciklama, /1650\.00/);
});

test("kısmi ödeme sonrası fazla gelen tutar yine uyuşmazlıktır", () => {
  const s = eslestir(okuma({ tutar: 700 }), 1650, IBAN, 1000);
  assert.equal(s.eslesme, "mismatch");
  assert.equal(s.yeniDurum, "uyusmadi");
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

// -------------------------------------------------------- IBAN kontrolü (MOD-97)
//
// Bir dekonttaki alıcı IBAN'ı ayarlardakinden farklıysa, tutar/tarih tutsa
// bile ödeme başka bir hesaba yapılmış olabilir. Yalnızca MOD-97 sağlama
// toplamına göre GEÇERLİ biçimli bir IBAN bloklar — geçersiz sağlama toplamı
// büyük ihtimalle OCR hatasıdır, sahtecilik değil.

// Gerçek bir Akbank dekontundan (IKI_SUTUNLU_DEKONT fixture) alınmış, MOD-97
// sağlaması geçerli, ana IBAN'dan farklı ikinci bir IBAN.
const BASKA_GECERLI_IBAN = "TR210006400000122211362514";

test("geçerli biçimli ama farklı IBAN faturayı otomatik kapatmaz", () => {
  const s = eslestir(okuma({ alici_iban: BASKA_GECERLI_IBAN }), 1650, IBAN);
  assert.equal(s.eslesme, "iban_uyusmadi");
  assert.equal(s.yeniDurum, "uyusmadi");
  assert.match(s.aciklama, /IBAN/);
});

test("tutar tutsa da farklı IBAN'lı dekont toplanan tutara girmez", () => {
  assert.equal(
    toplananTutar([
      { eslesme: "matched", okunan_tutar: 500 },
      { eslesme: "iban_uyusmadi", okunan_tutar: 1000 },
    ]),
    500,
  );
});

test("geçersiz biçimli (checksum tutmayan) IBAN bloklamaz, sadece uyarı ekler", () => {
  // OCR'ın yanlış okuduğu bir IBAN gerçek bir sahtecilik kanıtı değildir.
  const s = eslestir(okuma({ alici_iban: "TR999999999999999999999999" }), 1650, IBAN);
  assert.equal(s.eslesme, "matched");
  assert.equal(s.yeniDurum, "odendi");
  assert.match(s.aciklama, /IBAN/);
  assert.match(s.aciklama, /geçersiz/i);
});

test("IBAN kontrolü tarih kontrolünden önce çalışır", () => {
  // Hem IBAN hem tarih uyuşmuyorsa, kesin olan (IBAN) sonucu belirler.
  const s = eslestir(
    okuma({ alici_iban: BASKA_GECERLI_IBAN, tarih: "2026-06-12" }),
    1650,
    IBAN,
    0,
    "2026-09-01",
  );
  assert.equal(s.eslesme, "iban_uyusmadi");
});

test("IBAN boşluklu yazılmışsa da doğru karşılaştırılır", () => {
  const s = eslestir(
    okuma({ alici_iban: "TR33 0006 1005 1978 6457 8413 26" }),
    1650,
    IBAN,
  );
  assert.doesNotMatch(s.aciklama, /IBAN/);
});

test("dekontta IBAN okunamadıysa kontrol atlanır", () => {
  const s = eslestir(okuma({ alici_iban: null }), 1650, IBAN);
  assert.equal(s.eslesme, "matched");
  assert.doesNotMatch(s.aciklama, /IBAN/);
});

test("ayarlarda IBAN yoksa uyarı üretilmez", () => {
  const s = eslestir(okuma({ alici_iban: "TR99" }), 1650, "");
  assert.equal(s.eslesme, "matched");
  assert.doesNotMatch(s.aciklama, /IBAN/);
});

// ---------------------------------------------------- dekont tarihi kontrolü
//
// Bildirilen hata: eski tarihli bir dekont, yalnızca tutarı denk geldiği için
// faturayı "ödendi" yapıyordu. Tarih kontrolü vardı ama sadece açıklamaya bir
// uyarı cümlesi ekliyordu; eşleşmeyi hiç durdurmuyordu.

test("dönemden çok önceki tarihli dekont, tutar tutsa bile faturayı kapatmaz", () => {
  const s = eslestir(
    okuma({ tarih: "2026-06-12" }),
    1650,
    IBAN,
    0,
    "2026-09-01",
  );
  assert.equal(s.eslesme, "tarih_uyusmadi");
  assert.notEqual(s.yeniDurum, "odendi");
  assert.match(s.aciklama, /tarihi/i);
});

test("bir önceki ayın ortasına ait dekont da kabul edilmez", () => {
  // Asıl sinsi durum: 60 günlük eski toleransta bu uyarı bile almıyordu.
  const s = eslestir(
    okuma({ tarih: "2026-08-15" }),
    1650,
    IBAN,
    0,
    "2026-09-01",
  );
  assert.equal(s.eslesme, "tarih_uyusmadi");
});

test("dönem başlamadan birkaç gün önce ödeyen kiracı kabul edilir", () => {
  // Erken ödeme payı: 28 Ağustos'taki ödeme Eylül aidatı olabilir.
  const s = eslestir(
    okuma({ tarih: "2026-08-28" }),
    1650,
    IBAN,
    0,
    "2026-09-01",
  );
  assert.equal(s.eslesme, "matched");
});

test("geç tarihli dekont kabul edilir - eski borç sonradan ödenebilir", () => {
  // Eylül'de yapılan ödeme pekâlâ Temmuz'un borcunu kapatıyor olabilir.
  const s = eslestir(
    okuma({ tarih: "2026-09-20" }),
    1650,
    IBAN,
    0,
    "2026-07-01",
  );
  assert.equal(s.eslesme, "matched");
});

test("fatura dönemi verilmezse tarih kontrolü yapılmaz", () => {
  const s = eslestir(okuma({ tarih: "2020-01-01" }), 1650, IBAN);
  assert.equal(s.eslesme, "matched");
});

test("dekont tarihi okunamadıysa tarih kontrolü atlanır", () => {
  // Tarihi okunamayan dekontu tarih yüzünden reddetmek, okunabilir tutarı da
  // çöpe atardı; bu durumda eski davranış doğru.
  const s = eslestir(okuma({ tarih: null }), 1650, IBAN, 0, "2026-09-01");
  assert.equal(s.eslesme, "matched");
});

test("tarihi uyuşmayan dekont toplanan tutara girmez", () => {
  // Kısmi ödeme toplamını şişirmemeli, yoksa reddedilen dekont dolaylı yoldan
  // faturayı kapatırdı.
  assert.equal(
    toplananTutar([
      { eslesme: "matched", okunan_tutar: 500 },
      { eslesme: "tarih_uyusmadi", okunan_tutar: 1000 },
    ]),
    500,
  );
});

test("toplananTutar yalnızca matched ve kismi dekontları sayar", () => {
  const toplam = toplananTutar([
    { eslesme: "matched", okunan_tutar: 500 },
    { eslesme: "kismi", okunan_tutar: 300 },
    { eslesme: "mismatch", okunan_tutar: 999 },
    { eslesme: "unreadable", okunan_tutar: null },
  ]);
  assert.equal(toplam, 800);
});

// ---------------------------------------------------- kalem değişiminde durum
// Fatura upsert'i durum alanına dokunmuyordu: ödenmiş bir dönemin faturası
// yeni bir tutarla kaydedilince panelde yeşil kalıyor, karşılığı ödenmemiş
// olmasına rağmen kimse fark etmiyordu.

test("tutar artınca ödenmiş fatura tekrar açılır", () => {
  const durum = kalemDegisimindeDurum(250, [{ eslesme: "matched", okunan_tutar: 10 }], true);
  assert.equal(durum, "gonderildi");
});

test("dekontlar yeni tutarı hâlâ karşılıyorsa ödendi kalır", () => {
  const durum = kalemDegisimindeDurum(10, [{ eslesme: "matched", okunan_tutar: 10 }], true);
  assert.equal(durum, "odendi");
});

test("dekont toplamı yeni tutarı aşıyorsa uyuşmadı olur", () => {
  const durum = kalemDegisimindeDurum(5, [{ eslesme: "matched", okunan_tutar: 10 }], true);
  assert.equal(durum, "uyusmadi");
});

test("hiç dekont yoksa ve fatura gönderilmemişse taslağa döner", () => {
  assert.equal(kalemDegisimindeDurum(250, [], false), "taslak");
});

test("hiç dekont yoksa ama fatura gönderilmişse gönderildi kalır", () => {
  assert.equal(kalemDegisimindeDurum(250, [], true), "gonderildi");
});

test("kısmi ödeme yeni tutarı karşılamıyorsa fatura açık kalır", () => {
  const durum = kalemDegisimindeDurum(250, [{ eslesme: "kismi", okunan_tutar: 100 }], true);
  assert.equal(durum, "gonderildi");
});
