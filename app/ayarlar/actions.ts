"use server";

import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server.ts";
import { getAdminSupabase } from "@/lib/supabase/admin.ts";
import { yoneticiDegilse } from "@/lib/supabase/rol.ts";
import { denetimYaz } from "@/lib/denetim.ts";
import { siteUrl } from "@/lib/site-url.ts";

export type ActionSonuc = {
  hata?: string;
  basari?: string;
  /** Davet edilen kişiye elden iletilecek tek kullanımlık bağlantı. */
  davetLinki?: string;
};

/**
 * Yeni kullanıcı için tek kullanımlık davet bağlantısı üretir — herkese açık
 * kayıt formu yok, hesaplar yalnızca mevcut bir yöneticinin daveti ile açılır.
 *
 * Bağlantı e-postayla GÖNDERİLMEZ, panelde gösterilir ve yönetici onu WhatsApp
 * gibi bir kanaldan iletir. Nedeni: Supabase'in ücretsiz katmanında e-posta
 * şablonları düzenlenemiyor (özel SMTP şart) ve varsayılan şablonun ürettiği
 * bağlantı bizim `/auth/callback` akışımızla çalışmıyor — doğrulama verisini
 * adres fragment'ine yazıyor, fragment ise sunucuya ulaşmıyor. Ayrıca dahili
 * e-posta gönderimi saatte birkaç mesajla sınırlı ve üretim için önerilmiyor.
 * Bağlantıyı kendimiz üretince SMTP kurmaya da kota derdine de gerek kalmıyor.
 */
export async function kullaniciDavetEt(
  _prev: ActionSonuc,
  fd: FormData,
): Promise<ActionSonuc> {
  const yetkisiz = await yoneticiDegilse();
  if (yetkisiz) return yetkisiz;

  const eposta = String(fd.get("eposta") ?? "").trim();
  const rol = String(fd.get("rol") ?? "goruntuleyici");
  if (!eposta) return { hata: "E-posta gerekli." };
  if (rol !== "yonetici" && rol !== "goruntuleyici") {
    return { hata: "Geçersiz rol." };
  }

  const taban = siteUrl();
  if (!taban) return { hata: "SITE_URL tanımlı değil." };

  const admin = getAdminSupabase();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email: eposta,
    options: { data: { rol } },
  });

  if (error) return { hata: error.message };

  const tokenHash = data?.properties?.hashed_token;
  if (!tokenHash) return { hata: "Davet bağlantısı üretilemedi." };

  // Panele erişim verme işlemi — kimin kimi davet ettiği iz bırakmalı.
  await denetimYaz({
    eylem: "kullanici_davet_edildi",
    hedefTur: "user",
    hedefId: eposta,
    detay: { rol },
  });

  revalidatePath("/ayarlar");
  return {
    basari: `${eposta} için davet bağlantısı hazır. Bağlantıyı kendisine iletin — tek kullanımlıktır.`,
    davetLinki: `${taban}/auth/callback?token_hash=${tokenHash}&type=invite`,
  };
}

export async function ayarlariKaydet(
  _prev: ActionSonuc,
  fd: FormData,
): Promise<ActionSonuc> {
  const yetkisiz = await yoneticiDegilse();
  if (yetkisiz) return yetkisiz;

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

  // IBAN'ı değiştirmek paranın nereye gideceğini değiştirir; eski değeri
  // kaydedebilmek için güncellemeden önce okuyoruz.
  const { data: onceki } = await supabase
    .from("settings")
    .select("iban, hesap_sahibi")
    .eq("id", true)
    .maybeSingle();

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

  await denetimYaz({
    eylem: "ayarlar_degistirildi",
    hedefTur: "settings",
    detay: {
      iban_degisti: onceki?.iban !== iban,
      ...(onceki?.iban !== iban ? { eski_iban: onceki?.iban ?? null, yeni_iban: iban } : {}),
      hesap_sahibi_degisti: onceki?.hesap_sahibi !== hesap_sahibi,
    },
  });

  revalidatePath("/ayarlar");
  revalidatePath("/", "layout");
  return { basari: "Ayarlar kaydedildi." };
}
