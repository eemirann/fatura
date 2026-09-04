"use server";

import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import { sonOdemeTarihi } from "@/lib/format";

export type ActionSonuc = { hata?: string; basari?: string };

const GECERLI_DONEM_AY = /^\d{4}-\d{2}$/;

/** "1.234,56" ve "1234.56" biçimlerinin ikisini de kabul eder. */
function tutarOku(ham: string): number | null {
  const temiz = ham.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (!temiz) return null;
  const n = Number(temiz);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

/**
 * Tek bir kalemi (ör. "Aidat: 750") seçilen dairelerin faturasına uygular.
 *
 * Her daire için fatura yoksa oluşturur; kalemler arasında aynı başlık
 * varsa tutarını günceller, yoksa yeni kalem ekler. Dairenin kendi
 * kalemlerine (su, elektrik gibi farklı başlıklı) dokunmaz — yalnızca
 * gönderilen başlık hedeflenir.
 */
export async function topluKalemUygula(
  _prev: ActionSonuc,
  fd: FormData,
): Promise<ActionSonuc> {
  const donemAy = String(fd.get("donem") ?? "");
  if (!GECERLI_DONEM_AY.test(donemAy)) return { hata: "Geçersiz dönem." };
  const donem = `${donemAy}-01`;

  const baslik = String(fd.get("baslik") ?? "").trim();
  if (!baslik) return { hata: "Kalem adı gerekli." };

  const tutar = tutarOku(String(fd.get("tutar") ?? ""));
  if (tutar === null) return { hata: "Geçersiz tutar." };

  const unitIds = fd.getAll("unit_id").map(String);
  if (unitIds.length === 0) return { hata: "En az bir daire seçin." };

  const supabase = await getServerSupabase();

  const { data: ayarlar } = await supabase
    .from("settings")
    .select("varsayilan_son_odeme_gunu")
    .single();
  const vade = sonOdemeTarihi(donem, ayarlar?.varsayilan_son_odeme_gunu ?? 10);

  let uygulanan = 0;
  let hataSayisi = 0;

  for (const unitId of unitIds) {
    const { data: fatura, error: faturaHatasi } = await supabase
      .from("invoices")
      .upsert(
        { unit_id: unitId, donem, son_odeme_tarihi: vade },
        { onConflict: "unit_id,donem", ignoreDuplicates: false },
      )
      .select("id")
      .single();

    if (faturaHatasi || !fatura) {
      hataSayisi++;
      continue;
    }

    const { data: mevcutKalem } = await supabase
      .from("invoice_items")
      .select("id")
      .eq("invoice_id", fatura.id)
      .eq("baslik", baslik)
      .maybeSingle();

    if (mevcutKalem) {
      const { error } = await supabase
        .from("invoice_items")
        .update({ tutar })
        .eq("id", mevcutKalem.id);
      if (error) hataSayisi++;
      else uygulanan++;
      continue;
    }

    const { count } = await supabase
      .from("invoice_items")
      .select("id", { count: "exact", head: true })
      .eq("invoice_id", fatura.id);

    const { error } = await supabase
      .from("invoice_items")
      .insert({ invoice_id: fatura.id, baslik, tutar, sira: count ?? 0 });

    if (error) hataSayisi++;
    else uygulanan++;
  }

  revalidatePath("/");
  revalidatePath("/toplu-giris");

  if (uygulanan === 0) {
    return { hata: "Hiçbir daireye uygulanamadı." };
  }
  if (hataSayisi > 0) {
    return {
      basari: `${uygulanan} daireye uygulandı.`,
      hata: `${hataSayisi} dairede hata oluştu.`,
    };
  }
  return { basari: `${uygulanan} daireye "${baslik}: ${tutar.toFixed(2).replace(".", ",")} ₺" uygulandı.` };
}
