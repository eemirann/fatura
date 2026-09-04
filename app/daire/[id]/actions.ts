"use server";

import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import { sonOdemeTarihi } from "@/lib/format";
import { wahaAktifMi, wahaMesajGonder } from "@/lib/waha";

export type ActionSonuc = { hata?: string; basari?: string };

const GECERLI_DONEM = /^\d{4}-\d{2}-01$/;

/** "1.234,56" ve "1234.56" biçimlerinin ikisini de kabul eder. */
function tutarOku(ham: string): number | null {
  const temiz = ham.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (!temiz) return null;
  const n = Number(temiz);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

/**
 * Faturayı ve kalemlerini kaydeder.
 *
 * Fatura yoksa oluşturur, varsa kalemlerini komple değiştirir. invoices.toplam
 * veritabanı trigger'ı tarafından kalemlerden hesaplanır — burada elle yazılmaz.
 */
export async function faturaKaydet(
  _prev: ActionSonuc,
  fd: FormData,
): Promise<ActionSonuc> {
  const unitId = String(fd.get("unit_id") ?? "");
  const donem = String(fd.get("donem") ?? "");
  if (!GECERLI_DONEM.test(donem)) return { hata: "Geçersiz dönem." };

  const basliklar = fd.getAll("baslik").map((v) => String(v).trim());
  const tutarlar = fd.getAll("tutar").map((v) => String(v));

  const kalemler: { baslik: string; tutar: number; sira: number }[] = [];
  for (let i = 0; i < basliklar.length; i++) {
    const baslik = basliklar[i];
    const ham = tutarlar[i] ?? "";
    // Tamamen boş satırlar sessizce atlanır (formda hep bir boş satır durur).
    if (!baslik && !ham.trim()) continue;

    if (!baslik) return { hata: `${i + 1}. kalemin adı boş.` };
    const tutar = tutarOku(ham);
    if (tutar === null) return { hata: `"${baslik}" kaleminin tutarı geçersiz.` };

    kalemler.push({ baslik, tutar, sira: kalemler.length });
  }

  if (kalemler.length === 0) return { hata: "En az bir kalem girin." };

  const supabase = await getServerSupabase();

  const { data: ayarlar } = await supabase
    .from("settings")
    .select("varsayilan_son_odeme_gunu")
    .single();

  const girilenVade = String(fd.get("son_odeme_tarihi") ?? "").trim();
  const vade =
    /^\d{4}-\d{2}-\d{2}$/.test(girilenVade)
      ? girilenVade
      : sonOdemeTarihi(donem, ayarlar?.varsayilan_son_odeme_gunu ?? 10);

  const { data: fatura, error: faturaHatasi } = await supabase
    .from("invoices")
    .upsert(
      { unit_id: unitId, donem, son_odeme_tarihi: vade },
      { onConflict: "unit_id,donem", ignoreDuplicates: false },
    )
    .select("id")
    .single();

  if (faturaHatasi || !fatura) {
    return { hata: faturaHatasi?.message ?? "Fatura kaydedilemedi." };
  }

  // Kalemleri komple değiştir — düzenlemede silinen satır artık kalmasın.
  const { error: silmeHatasi } = await supabase
    .from("invoice_items")
    .delete()
    .eq("invoice_id", fatura.id);
  if (silmeHatasi) return { hata: silmeHatasi.message };

  const { error: eklemeHatasi } = await supabase
    .from("invoice_items")
    .insert(kalemler.map((k) => ({ ...k, invoice_id: fatura.id })));
  if (eklemeHatasi) return { hata: eklemeHatasi.message };

  revalidatePath(`/daire/${unitId}`);
  revalidatePath("/");
  return { basari: "Fatura kaydedildi." };
}

/**
 * WhatsApp'a basıldığında çağrılır.
 *
 * WAHA yapılandırılmışsa mesaj burada, sunucu tarafında otomatik gönderilir —
 * kullanıcı hiçbir şeye elle basmaz. Gönderim başarısız olursa fatura
 * "gönderildi" işaretlenmez, hata kullanıcıya gösterilir.
 *
 * WAHA yoksa (WAHA_URL boş) eski davranış aynen çalışır: buton zaten wa.me
 * linkini açmıştır, bu action sadece durumu günceller.
 */
export async function gonderildiIsaretle(
  _prev: ActionSonuc,
  fd: FormData,
): Promise<ActionSonuc> {
  const faturaId = String(fd.get("fatura_id") ?? "");
  const unitId = String(fd.get("unit_id") ?? "");

  if (wahaAktifMi()) {
    const telefon = String(fd.get("telefon") ?? "");
    const mesaj = String(fd.get("mesaj") ?? "");
    const sonuc = await wahaMesajGonder(telefon, mesaj);
    if (!sonuc.basari) return { hata: `WhatsApp mesajı gönderilemedi: ${sonuc.hata}` };
  }

  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("invoices")
    .update({ durum: "gonderildi", gonderildi_at: new Date().toISOString() })
    .eq("id", faturaId)
    // Ödenmiş bir faturayı yeniden "gönderildi"ye düşürmeyelim.
    .in("durum", ["taslak", "gonderildi"]);

  if (error) return { hata: error.message };

  revalidatePath(`/daire/${unitId}`);
  revalidatePath("/");
  return { basari: "Gönderildi ✓" };
}

/** Dekonta göz atıldıktan sonra "incelenmedi" rozetini düşürür. */
export async function incelendiIsaretle(
  _prev: ActionSonuc,
  fd: FormData,
): Promise<ActionSonuc> {
  const faturaId = String(fd.get("fatura_id") ?? "");
  const unitId = String(fd.get("unit_id") ?? "");

  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("invoices")
    .update({ incelendi_at: new Date().toISOString() })
    .eq("id", faturaId);

  if (error) return { hata: error.message };

  revalidatePath(`/daire/${unitId}`);
  revalidatePath("/");
  return {};
}

/**
 * Elle ödendi işaretleme. Otomatik eşleşmenin tutmadığı durumlar için:
 * nakit ödeme, tutarı okunamayan dekont, kısmi ödeme kabulü.
 */
export async function eldeOdendiIsaretle(
  _prev: ActionSonuc,
  fd: FormData,
): Promise<ActionSonuc> {
  const faturaId = String(fd.get("fatura_id") ?? "");
  const unitId = String(fd.get("unit_id") ?? "");

  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("invoices")
    .update({ durum: "odendi", incelendi_at: new Date().toISOString() })
    .eq("id", faturaId);

  if (error) return { hata: error.message };

  revalidatePath(`/daire/${unitId}`);
  revalidatePath("/");
  return { basari: "Ödendi olarak işaretlendi." };
}

/** Yanlışlıkla ödendi işaretlenen faturayı geri alır. */
export async function odemeyiGeriAl(
  _prev: ActionSonuc,
  fd: FormData,
): Promise<ActionSonuc> {
  const faturaId = String(fd.get("fatura_id") ?? "");
  const unitId = String(fd.get("unit_id") ?? "");

  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("invoices")
    .update({ durum: "gonderildi", incelendi_at: null })
    .eq("id", faturaId);

  if (error) return { hata: error.message };

  revalidatePath(`/daire/${unitId}`);
  revalidatePath("/");
  return { basari: "Ödeme geri alındı." };
}
