import { NextResponse } from "next/server";
import { getServerSupabase, getUser } from "@/lib/supabase/server";
import { durumHesapla } from "@/lib/durum";
import { isoGun } from "@/lib/format";

export const runtime = "nodejs";

const DURUM_ETIKET: Record<string, string> = {
  yok: "Fatura girilmedi",
  taslak: "Taslak",
  bekliyor: "Ödeme bekleniyor",
  gecikti: "Vadesi geçti",
  uyusmadi: "Tutar uyuşmadı",
  odendi_incelenmedi: "Ödendi",
  odendi: "Ödendi",
};

/** CSV alanını gerekirse tırnak içine alır (virgül/tırnak/satır sonu varsa). */
function csvAlan(deger: unknown): string {
  const s = deger === null || deger === undefined ? "" : String(deger);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Tüm faturaların (istenirse tek bir yıla filtrelenmiş) CSV dökümü.
 * Hem yönetici hem görüntüleyici indirebilir — salt okuma işlemi.
 */
export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ hata: "Giriş gerekli." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const yil = searchParams.get("yil");

  const supabase = await getServerSupabase();
  let sorgu = supabase
    .from("invoices")
    .select("donem, toplam, durum, son_odeme_tarihi, gonderildi_at, units(kapi_no, kiraci_adi, blocks(ad))")
    .order("donem", { ascending: false });

  if (yil && /^\d{4}$/.test(yil)) {
    sorgu = sorgu.gte("donem", `${yil}-01-01`).lte("donem", `${yil}-12-31`);
  }

  const { data, error } = await sorgu;
  if (error) return NextResponse.json({ hata: error.message }, { status: 500 });

  const bugun = isoGun();
  const satirlar = (data ?? []).map((f) => {
    // Supabase join tekil ilişkide bazen dizi bazen nesne dönebiliyor; ikisini de kapsa.
    const unit = Array.isArray(f.units) ? f.units[0] : f.units;
    const blockRel = unit ? (Array.isArray(unit.blocks) ? unit.blocks[0] : unit.blocks) : null;
    const durum = durumHesapla(
      { durum: f.durum, son_odeme_tarihi: f.son_odeme_tarihi, incelendi_at: null },
      bugun,
    );
    return [
      blockRel?.ad ?? "",
      unit?.kapi_no ?? "",
      unit?.kiraci_adi ?? "",
      f.donem,
      Number(f.toplam).toFixed(2).replace(".", ","),
      DURUM_ETIKET[durum.kod] ?? f.durum,
      f.son_odeme_tarihi,
      f.gonderildi_at ? new Date(f.gonderildi_at).toISOString().slice(0, 10) : "",
    ];
  });

  const baslik = [
    "Blok",
    "Daire",
    "Kiracı",
    "Dönem",
    "Toplam (TL)",
    "Durum",
    "Son Ödeme Tarihi",
    "Gönderilme Tarihi",
  ];

  const csv =
    "﻿" + // Excel'de Türkçe karakterler doğru görünsün diye UTF-8 BOM
    [baslik, ...satirlar].map((satir) => satir.map(csvAlan).join(",")).join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fatura-export${yil ? `-${yil}` : ""}.csv"`,
    },
  });
}
