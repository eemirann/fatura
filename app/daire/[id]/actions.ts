"use server";

import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import { yoneticiDegilse } from "@/lib/supabase/rol";
import { donemEtiketi, sonOdemeTarihi } from "@/lib/format";
import { faturaDurumunuTazele } from "@/lib/fatura-durum";
import { faturaKalani } from "@/lib/borc";
import { denetimYaz } from "@/lib/denetim";
import type { ReceiptEslesme } from "@/lib/types";
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
  const yetkisiz = await yoneticiDegilse();
  if (yetkisiz) return yetkisiz;

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
  const girilenGecerli = /^\d{4}-\d{2}-\d{2}$/.test(girilenVade);
  const vade = girilenGecerli
    ? girilenVade
    : sonOdemeTarihi(donem, ayarlar?.varsayilan_son_odeme_gunu ?? 10);

  // Elle girilen bir tarih, ayın diğer günden farklı bir gününü işaret
  // ediyorsa bunu varsayılan yap — başka bir daireye girildiğinde de aynı
  // gün önerilsin diye. Sadece kullanıcı gerçekten bir tarih değiştirdiyse
  // (fallback'e düşülmediyse) devreye girer.
  if (girilenGecerli) {
    // settings.varsayilan_son_odeme_gunu 1-28 ile sınırlı (bkz. migration) —
    // ayın son günlerine denk gelen tarihler varsayılan olarak kaydedilmez.
    const girilenGun = Math.min(28, Number(girilenVade.split("-")[2]));
    if (girilenGun !== ayarlar?.varsayilan_son_odeme_gunu) {
      await supabase
        .from("settings")
        .update({ varsayilan_son_odeme_gunu: girilenGun })
        .eq("id", true);
    }
  }

  const { data: fatura, error: faturaHatasi } = await supabase
    .from("invoices")
    .upsert(
      { unit_id: unitId, donem, son_odeme_tarihi: vade },
      { onConflict: "unit_id,donem", ignoreDuplicates: false },
    )
    .select("id, gonderildi_at")
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

  const durumHatasi = await faturaDurumunuTazele(supabase, fatura.id, fatura.gonderildi_at);
  if (durumHatasi) return { hata: durumHatasi };

  await denetimYaz({
    eylem: "fatura_kaydedildi",
    hedefTur: "invoice",
    hedefId: fatura.id,
    detay: {
      unit_id: unitId,
      donem,
      toplam: kalemler.reduce((t, k) => t + k.tutar, 0),
      kalem_sayisi: kalemler.length,
    },
  });

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
  const yetkisiz = await yoneticiDegilse();
  if (yetkisiz) return yetkisiz;

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

  await denetimYaz({
    eylem: "fatura_gonderildi",
    hedefTur: "invoice",
    hedefId: faturaId,
    detay: { unit_id: unitId, otomatik: wahaAktifMi() },
  });

  revalidatePath(`/daire/${unitId}`);
  revalidatePath("/");
  return { basari: "Gönderildi ✓" };
}

/** Dekonta göz atıldıktan sonra "incelenmedi" rozetini düşürür. */
export async function incelendiIsaretle(
  _prev: ActionSonuc,
  fd: FormData,
): Promise<ActionSonuc> {
  const yetkisiz = await yoneticiDegilse();
  if (yetkisiz) return yetkisiz;

  const faturaId = String(fd.get("fatura_id") ?? "");
  const unitId = String(fd.get("unit_id") ?? "");

  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("invoices")
    .update({ incelendi_at: new Date().toISOString() })
    .eq("id", faturaId);

  if (error) return { hata: error.message };

  await denetimYaz({
    eylem: "dekont_incelendi",
    hedefTur: "invoice",
    hedefId: faturaId,
    detay: { unit_id: unitId },
  });

  revalidatePath(`/daire/${unitId}`);
  revalidatePath("/");
  return { basari: "İncelendi ✓" };
}

/**
 * Elle ödendi işaretleme. Otomatik eşleşmenin tutmadığı durumlar için:
 * nakit ödeme, tutarı okunamayan dekont, kısmi ödeme kabulü.
 */
export async function eldeOdendiIsaretle(
  _prev: ActionSonuc,
  fd: FormData,
): Promise<ActionSonuc> {
  const yetkisiz = await yoneticiDegilse();
  if (yetkisiz) return yetkisiz;

  const faturaId = String(fd.get("fatura_id") ?? "");
  const unitId = String(fd.get("unit_id") ?? "");

  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("invoices")
    .update({ durum: "odendi", incelendi_at: new Date().toISOString() })
    .eq("id", faturaId);

  if (error) return { hata: error.message };

  // Otomatik eşleşmeyi baypas eden, doğrudan para anlamına gelen işlem —
  // denetim kaydının asıl sebebi.
  await denetimYaz({
    eylem: "elle_odendi_isaretlendi",
    hedefTur: "invoice",
    hedefId: faturaId,
    detay: { unit_id: unitId },
  });

  revalidatePath(`/daire/${unitId}`);
  revalidatePath("/");
  return { basari: "Ödendi olarak işaretlendi." };
}

/**
 * Devredilen bir dönemin hedef faturadaki kalem başlığı.
 *
 * Dışa açılmıyor: "use server" dosyasındaki her export bir sunucu action'ı
 * sayılır ve async olmak zorundadır.
 */
function devirKalemBasligi(kaynakDonem: string): string {
  return `Devir: ${donemEtiketi(kaynakDonem)}`;
}

/**
 * Önceki dönemlerin ödenmemiş kalanını seçili döneme taşır.
 *
 * Neden elle: hangi daireyi ne zaman devredeceği yöneticinin kararı. Otomatik
 * yapmak, kiracı ödemeyi yolda göndermişken faturayı şişirebilirdi.
 *
 * Neden kaynak fatura KAPANIYOR: aksi hâlde aynı borç iki yerde birden durur.
 * Kiracı eski linkten ödediğinde hem eski fatura kapanır hem yenideki devir
 * kalemi yerinde kalır; aynı para iki kez tahsil edilmiş görünür.
 *
 * Her kaynak dönem hedef faturada AYRI bir kalem olur ("Devir: Eylül 2026").
 * Tek bir toplam kalem yerine böyle: kiracı hangi ayları taşıdığını görüyor ve
 * ikinci bir devir önceki devrin üstüne yazma riski taşımıyor.
 */
export async function borcuDevret(
  _prev: ActionSonuc,
  fd: FormData,
): Promise<ActionSonuc> {
  const yetkisiz = await yoneticiDegilse();
  if (yetkisiz) return yetkisiz;

  const unitId = String(fd.get("unit_id") ?? "");
  const hedefDonem = String(fd.get("donem") ?? "");
  if (!GECERLI_DONEM.test(hedefDonem)) return { hata: "Geçersiz dönem." };

  const supabase = await getServerSupabase();

  const { data: hedef, error: hedefHatasi } = await supabase
    .from("invoices")
    .select("id, gonderildi_at")
    .eq("unit_id", unitId)
    .eq("donem", hedefDonem)
    .maybeSingle();

  if (hedefHatasi) return { hata: hedefHatasi.message };
  if (!hedef) {
    return {
      hata: "Bu dönemin faturası yok. Önce kalemleri girip faturayı kaydedin.",
    };
  }

  // Daha eski, hâlâ açık ve henüz devredilmemiş dönemler.
  const { data: kaynaklar, error: kaynakHatasi } = await supabase
    .from("invoices")
    .select("id, donem, toplam, durum, son_odeme_tarihi, receipts(eslesme, okunan_tutar)")
    .eq("unit_id", unitId)
    .lt("donem", hedefDonem)
    .in("durum", ["gonderildi", "uyusmadi"])
    .is("devredildi_at", null)
    .order("donem", { ascending: true });

  if (kaynakHatasi) return { hata: kaynakHatasi.message };

  const devredilecek = (kaynaklar ?? [])
    .map((f) => {
      const satir = f as unknown as {
        id: string;
        donem: string;
        toplam: number | string;
        durum: "gonderildi" | "uyusmadi";
        son_odeme_tarihi: string;
        receipts: { eslesme: ReceiptEslesme; okunan_tutar: number | null }[] | null;
      };
      return {
        id: satir.id,
        donem: satir.donem,
        kalan: faturaKalani({
          donem: satir.donem,
          toplam: Number(satir.toplam ?? 0),
          durum: satir.durum,
          son_odeme_tarihi: satir.son_odeme_tarihi,
          dekontlar: (satir.receipts ?? []).map((r) => ({
            eslesme: r.eslesme,
            okunan_tutar: r.okunan_tutar === null ? null : Number(r.okunan_tutar),
          })),
        }),
      };
    })
    .filter((f) => f.kalan > 0);

  if (devredilecek.length === 0) {
    return { hata: "Önceki dönemlerden devredilecek ödenmemiş borç yok." };
  }

  // Yeni kalemler mevcutların ardına eklensin.
  const { count } = await supabase
    .from("invoice_items")
    .select("id", { count: "exact", head: true })
    .eq("invoice_id", hedef.id);

  const { error: ekleHatasi } = await supabase.from("invoice_items").insert(
    devredilecek.map((f, i) => ({
      invoice_id: hedef.id,
      baslik: devirKalemBasligi(f.donem),
      tutar: f.kalan,
      sira: (count ?? 0) + i,
    })),
  );
  if (ekleHatasi) return { hata: ekleHatasi.message };

  // Kaynakları kapat. Kalem eklendikten SONRA: bu adım patlarsa borç hedefte
  // görünür (fazladan takip), tersi sırada ise tamamen kaybolurdu.
  const { error: kapatmaHatasi } = await supabase
    .from("invoices")
    .update({
      devredildi_at: new Date().toISOString(),
      devredilen_donem: hedefDonem,
    })
    .in(
      "id",
      devredilecek.map((f) => f.id),
    );
  if (kapatmaHatasi) return { hata: kapatmaHatasi.message };

  // Toplam değişti; hedefin durumu dekontlarına göre yeniden hesaplanmalı.
  const durumHatasi = await faturaDurumunuTazele(
    supabase,
    hedef.id,
    hedef.gonderildi_at,
  );
  if (durumHatasi) return { hata: durumHatasi };

  const toplamDevir = devredilecek.reduce((t, f) => t + f.kalan, 0);

  await denetimYaz({
    eylem: "borc_devredildi",
    hedefTur: "invoice",
    hedefId: hedef.id,
    detay: {
      unit_id: unitId,
      hedef_donem: hedefDonem,
      toplam: toplamDevir,
      kaynaklar: devredilecek.map((f) => ({ donem: f.donem, kalan: f.kalan })),
    },
  });

  revalidatePath(`/daire/${unitId}`);
  revalidatePath("/");
  return {
    basari: `${devredilecek.length} dönemden toplam ${toplamDevir.toFixed(2)} ₺ devredildi.`,
  };
}

/** Yanlışlıkla ödendi işaretlenen faturayı geri alır. */
export async function odemeyiGeriAl(
  _prev: ActionSonuc,
  fd: FormData,
): Promise<ActionSonuc> {
  const yetkisiz = await yoneticiDegilse();
  if (yetkisiz) return yetkisiz;

  const faturaId = String(fd.get("fatura_id") ?? "");
  const unitId = String(fd.get("unit_id") ?? "");

  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("invoices")
    .update({ durum: "gonderildi", incelendi_at: null })
    .eq("id", faturaId);

  if (error) return { hata: error.message };

  await denetimYaz({
    eylem: "odeme_geri_alindi",
    hedefTur: "invoice",
    hedefId: faturaId,
    detay: { unit_id: unitId },
  });

  revalidatePath(`/daire/${unitId}`);
  revalidatePath("/");
  return { basari: "Ödeme geri alındı." };
}
