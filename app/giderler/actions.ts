"use server";

import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/server";
import { yoneticiDegilse } from "@/lib/supabase/rol";
import { denetimYaz } from "@/lib/denetim";
import { GIDER_KATEGORILERI, type GiderKategorisi } from "@/lib/types";

export type ActionSonuc = { hata?: string; basari?: string };

const GECERLI_TARIH = /^\d{4}-\d{2}-\d{2}$/;

/** "1.234,56" ve "1234.56" biçimlerinin ikisini de kabul eder. */
function tutarOku(ham: string): number | null {
  const temiz = ham.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (!temiz) return null;
  const n = Number(temiz);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export async function giderEkle(
  _prev: ActionSonuc,
  fd: FormData,
): Promise<ActionSonuc> {
  const yetkisiz = await yoneticiDegilse();
  if (yetkisiz) return yetkisiz;

  const baslik = String(fd.get("baslik") ?? "").trim();
  if (!baslik) return { hata: "Gider adı gerekli." };

  const tutar = tutarOku(String(fd.get("tutar") ?? ""));
  if (tutar === null) return { hata: "Tutar sıfırdan büyük bir sayı olmalı." };

  const tarih = String(fd.get("tarih") ?? "").trim();
  if (!GECERLI_TARIH.test(tarih)) return { hata: "Geçersiz tarih." };

  const kategori = String(fd.get("kategori") ?? "diger");
  if (!GIDER_KATEGORILERI.includes(kategori as GiderKategorisi)) {
    return { hata: "Geçersiz kategori." };
  }

  const aciklama = String(fd.get("aciklama") ?? "").trim() || null;

  const supabase = await getServerSupabase();
  const kullanici = await getUser();

  const { error } = await supabase.from("expenses").insert({
    tarih,
    baslik,
    tutar,
    kategori,
    aciklama,
    created_by: kullanici?.id ?? null,
  });

  if (error) return { hata: error.message };

  await denetimYaz({
    eylem: "gider_eklendi",
    hedefTur: "expense",
    detay: { baslik, tutar, kategori, tarih },
  });

  revalidatePath("/giderler");
  return { basari: `"${baslik}" eklendi.` };
}

export async function giderSil(
  _prev: ActionSonuc,
  fd: FormData,
): Promise<ActionSonuc> {
  const yetkisiz = await yoneticiDegilse();
  if (yetkisiz) return yetkisiz;

  const id = String(fd.get("id") ?? "");
  const supabase = await getServerSupabase();

  // Silmeden önce oku: sonrasında denetim kaydında yalnızca bir UUID kalırdı
  // ve kasa bakiyesini değiştiren bir işlemin izi anlamsızlaşırdı.
  const { data: gider } = await supabase
    .from("expenses")
    .select("baslik, tutar, tarih")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) return { hata: error.message };

  await denetimYaz({
    eylem: "gider_silindi",
    hedefTur: "expense",
    hedefId: id,
    detay: {
      baslik: gider?.baslik ?? null,
      tutar: gider?.tutar ?? null,
      tarih: gider?.tarih ?? null,
    },
  });

  revalidatePath("/giderler");
  return { basari: "Gider silindi." };
}
