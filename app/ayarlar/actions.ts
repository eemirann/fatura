"use server";

import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server.ts";
import { getAdminSupabase } from "@/lib/supabase/admin.ts";
import { kullaniciRolu } from "@/lib/supabase/rol.ts";

export type ActionSonuc = { hata?: string; basari?: string };

/**
 * Yeni kullanıcıya davet e-postası gönderir — herkese açık kayıt formu yok,
 * hesaplar yalnızca mevcut bir yöneticinin daveti ile açılır.
 */
export async function kullaniciDavetEt(
  _prev: ActionSonuc,
  fd: FormData,
): Promise<ActionSonuc> {
  if ((await kullaniciRolu()) !== "yonetici") {
    return { hata: "Bu işlem için yönetici yetkisi gerekir." };
  }

  const eposta = String(fd.get("eposta") ?? "").trim();
  const rol = String(fd.get("rol") ?? "goruntuleyici");
  if (!eposta) return { hata: "E-posta gerekli." };
  if (rol !== "yonetici" && rol !== "goruntuleyici") {
    return { hata: "Geçersiz rol." };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) return { hata: "NEXT_PUBLIC_SITE_URL tanımlı değil." };

  const admin = getAdminSupabase();
  const { error } = await admin.auth.admin.inviteUserByEmail(eposta, {
    data: { rol },
    redirectTo: `${siteUrl}/auth/callback`,
  });

  if (error) return { hata: error.message };

  revalidatePath("/ayarlar");
  return { basari: `${eposta} adresine davet gönderildi.` };
}

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
