"use server";

import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server.ts";

export type ActionSonuc = { hata?: string; basari?: string };

export async function ayarlariKaydet(
  _prev: ActionSonuc,
  fd: FormData,
): Promise<ActionSonuc> {
  const iban = String(fd.get("iban") ?? "").replace(/\s+/g, " ").trim();
  const hesap_sahibi = String(fd.get("hesap_sahibi") ?? "").trim();
  const mesaj_sablonu = String(fd.get("mesaj_sablonu") ?? "").trim();
  const gun = Number(fd.get("varsayilan_son_odeme_gunu"));

  if (!mesaj_sablonu) return { hata: "Mesaj şablonu boş olamaz." };
  if (!Number.isInteger(gun) || gun < 1 || gun > 28) {
    return { hata: "Varsayılan son ödeme günü 1 ile 28 arasında olmalı." };
  }

  // Şablonda dekont linki yoksa kiracı dosyayı yükleyemez — sessizce geçme.
  if (!mesaj_sablonu.includes("{dekont_linki}")) {
    return {
      hata:
        "Şablonda {dekont_linki} yer tutucusu bulunmalı, yoksa kiracı dekont yükleyemez.",
    };
  }

  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("settings")
    .update({
      iban,
      hesap_sahibi,
      mesaj_sablonu,
      varsayilan_son_odeme_gunu: gun,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);

  if (error) return { hata: error.message };

  revalidatePath("/ayarlar");
  revalidatePath("/", "layout");
  return { basari: "Ayarlar kaydedildi." };
}
