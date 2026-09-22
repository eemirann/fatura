import "server-only";
import { getAdminSupabase } from "./supabase/admin.ts";
import { getUser } from "./supabase/server.ts";

/**
 * Finansal etkisi olan işlemlerin "kim, ne zaman" kaydı (bkz.
 * supabase/migrations/0006_denetim_kaydi.sql).
 *
 * Yazma bilerek service_role ile yapılıyor: audit_log'da INSERT politikası yok,
 * dolayısıyla kayıt append-only kalıyor ve kullanıcı kendi izini silemiyor ya
 * da sahte kayıt üretemiyor.
 */

export type DenetimEylemi =
  | "fatura_kaydedildi"
  | "fatura_gonderildi"
  | "elle_odendi_isaretlendi"
  | "odeme_geri_alindi"
  | "dekont_incelendi"
  | "toplu_kalem_uygulandi"
  | "blok_silindi"
  | "daire_silindi"
  | "gider_eklendi"
  | "gider_silindi"
  | "ayarlar_degistirildi"
  | "kullanici_davet_edildi";

type DenetimGirdisi = {
  eylem: DenetimEylemi;
  hedefTur?: "invoice" | "unit" | "block" | "expense" | "settings" | "user";
  hedefId?: string;
  /** Sonradan "ne değişmişti" sorusuna cevap verecek kadar bağlam. */
  detay?: Record<string, unknown>;
};

/**
 * Denetim kaydı yazar.
 *
 * ÖNEMLİ: asla throw etmez. Denetim kaydının yazılamaması, kullanıcının
 * yapmak istediği asıl işi (faturayı kaydetmek, ödemeyi işaretlemek)
 * engellememeli — aksi hâlde yan bir kayıt mekanizması ana akışı kırar.
 * Başarısızlık log'a düşer.
 */
export async function denetimYaz({
  eylem,
  hedefTur,
  hedefId,
  detay,
}: DenetimGirdisi): Promise<void> {
  try {
    const kullanici = await getUser();

    const { error } = await getAdminSupabase().from("audit_log").insert({
      actor_id: kullanici?.id ?? null,
      actor_email: kullanici?.email ?? null,
      eylem,
      hedef_tur: hedefTur ?? null,
      hedef_id: hedefId ?? null,
      detay: detay ?? null,
    });

    if (error) {
      // Tablo henüz oluşturulmadıysa (migration çalıştırılmadan dağıtım)
      // panel yine de çalışmaya devam etsin.
      console.error("[denetim] kayit yazilamadi:", error.message);
    }
  } catch (e) {
    console.error("[denetim] kayit yazilamadi:", e);
  }
}
