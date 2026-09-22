import { test } from "node:test";
import assert from "node:assert/strict";
import { durumHesapla, ilgilenmeliMi, panelGrubu } from "../lib/durum.ts";
import { sonOdemeTarihi, waTelefon, donemKaydir } from "../lib/format.ts";

const BUGUN = "2026-08-19";

function fatura(ek: Partial<Parameters<typeof durumHesapla>[0] & object> = {}) {
  return {
    durum: "gonderildi" as const,
    son_odeme_tarihi: "2026-08-25",
    incelendi_at: null,
    ...ek,
  };
}

test("fatura yoksa gri", () => {
  assert.equal(durumHesapla(null, BUGUN).kod, "yok");
});

// ------------------------------------------------------------- borç devri

test("devredilen fatura, vadesi geçmiş olsa bile kırmızı görünmez", () => {
  // Asıl mesele bu: borç artık hedef ayda takip ediliyor. Kaynak fatura
  // hâlâ "gonderildi" durumunda ve vadesi geçmiş olduğu için, damga
  // dikkate alınmazsa panelde kırmızı durmaya devam ederdi.
  const d = durumHesapla(
    fatura({
      son_odeme_tarihi: "2026-08-10",
      devredildi_at: "2026-08-19T10:00:00Z",
    }),
    BUGUN,
  );
  assert.equal(d.kod, "devredildi");
});

test("devredilen fatura ödendi sayılmaz", () => {
  // Para gelmedi; yalnızca alacağın takip edildiği yer değişti.
  const d = durumHesapla(
    fatura({ devredildi_at: "2026-08-19T10:00:00Z" }),
    BUGUN,
  );
  assert.notEqual(d.kod, "odendi");
  assert.equal(panelGrubu(d.kod), "faturasiz");
});

test("devredilen fatura ilgi bekleyenlere girmez", () => {
  // Aksi hâlde aynı borç hem kaynak hem hedef ayda sayılırdı.
  assert.equal(ilgilenmeliMi("devredildi"), false);
});

test("devir damgası yoksa davranış değişmez", () => {
  const d = durumHesapla(
    fatura({ son_odeme_tarihi: "2026-08-10", devredildi_at: null }),
    BUGUN,
  );
  assert.equal(d.kod, "gecikti");
});

test("gönderilmemiş fatura taslak kalır, vadesi geçse bile kırmızı olmaz", () => {
  const d = durumHesapla(
    fatura({ durum: "taslak", son_odeme_tarihi: "2026-08-01" }),
    BUGUN,
  );
  assert.equal(d.kod, "taslak");
});

test("vadesi gelmemiş gönderilmiş fatura sarı", () => {
  assert.equal(durumHesapla(fatura(), BUGUN).kod, "bekliyor");
});

test("son ödeme günü bugünse henüz gecikmiş sayılmaz", () => {
  assert.equal(
    durumHesapla(fatura({ son_odeme_tarihi: BUGUN }), BUGUN).kod,
    "bekliyor",
  );
});

test("son ödeme günü dünse gecikmiş", () => {
  assert.equal(
    durumHesapla(fatura({ son_odeme_tarihi: "2026-08-18" }), BUGUN).kod,
    "gecikti",
  );
});

test("uyuşmayan dekont turuncu ve rozetli", () => {
  const d = durumHesapla(fatura({ durum: "uyusmadi" }), BUGUN);
  assert.equal(d.kod, "uyusmadi");
  assert.equal(d.rozet, true);
});

test("ödendi ama incelenmedi ise rozet açık", () => {
  const d = durumHesapla(fatura({ durum: "odendi" }), BUGUN);
  assert.equal(d.kod, "odendi_incelenmedi");
  assert.equal(d.rozet, true);
});

test("incelendikten sonra rozet düşer", () => {
  const d = durumHesapla(
    fatura({ durum: "odendi", incelendi_at: "2026-08-19T10:00:00Z" }),
    BUGUN,
  );
  assert.equal(d.kod, "odendi");
  assert.equal(d.rozet, false);
});

test("ödenmiş fatura vadesi geçse de kırmızıya dönmez", () => {
  const d = durumHesapla(
    fatura({ durum: "odendi", son_odeme_tarihi: "2026-01-01" }),
    BUGUN,
  );
  assert.equal(d.kod, "odendi_incelenmedi");
});

test("ilgi bekleyen durumlar doğru sayılır", () => {
  assert.equal(ilgilenmeliMi("gecikti"), true);
  assert.equal(ilgilenmeliMi("uyusmadi"), true);
  assert.equal(ilgilenmeliMi("odendi_incelenmedi"), true);
  assert.equal(ilgilenmeliMi("bekliyor"), false);
  assert.equal(ilgilenmeliMi("odendi"), false);
});

test("kısa ayda son ödeme günü taşmaz", () => {
  assert.equal(sonOdemeTarihi("2026-02-01", 28), "2026-02-28");
  assert.equal(sonOdemeTarihi("2026-04-01", 15), "2026-04-15");
});

test("dönem kaydırma yıl sınırını doğru geçer", () => {
  assert.equal(donemKaydir("2026-01-01", -1), "2025-12-01");
  assert.equal(donemKaydir("2026-12-01", 1), "2027-01-01");
});

test("telefon wa.me biçimine normalize edilir", () => {
  assert.equal(waTelefon("0532 111 22 33"), "905321112233");
  assert.equal(waTelefon("+90 532 111 22 33"), "905321112233");
  assert.equal(waTelefon("5321112233"), "905321112233");
  assert.equal(waTelefon("00905321112233"), "905321112233");
  assert.equal(waTelefon("123"), null);
  assert.equal(waTelefon(null), null);
});

// --------------------------------------------------- panel sekmesi kovaları

test("ödenmiş durumlar ödeyen kovasına girer", () => {
  assert.equal(panelGrubu("odendi"), "odeyen");
  assert.equal(panelGrubu("odendi_incelenmedi"), "odeyen");
});

test("açık faturalar ödemeyen kovasına girer", () => {
  assert.equal(panelGrubu("bekliyor"), "odemeyen");
  assert.equal(panelGrubu("gecikti"), "odemeyen");
});

test("tutarı uyuşmayan fatura ödeme sayılmaz", () => {
  // Dekont gelmiştir ama fatura kapanmadığı için hâlâ takip edilmeli.
  assert.equal(panelGrubu("uyusmadi"), "odemeyen");
});

test("faturası girilmemiş ve taslak daireler ayrı kovada", () => {
  assert.equal(panelGrubu("yok"), "faturasiz");
  assert.equal(panelGrubu("taslak"), "faturasiz");
});

test("her durum kodu tam olarak bir kovaya düşer", () => {
  const kodlar = [
    "yok",
    "taslak",
    "bekliyor",
    "gecikti",
    "uyusmadi",
    "odendi_incelenmedi",
    "odendi",
  ] as const;
  const kovalar = kodlar.map(panelGrubu);
  assert.equal(kovalar.length, 7);
  assert.ok(kovalar.every((k) => ["odeyen", "odemeyen", "faturasiz"].includes(k)));
  // Sekme sayılarının toplamı daire sayısına eşit olmalı: hiçbir kod
  // birden fazla kovaya girmiyor, hiçbiri de dışarıda kalmıyor.
  assert.equal(
    kovalar.filter((k) => k === "odeyen").length +
      kovalar.filter((k) => k === "odemeyen").length +
      kovalar.filter((k) => k === "faturasiz").length,
    7,
  );
});
