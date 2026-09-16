import { getServerSupabase, getUser } from "./server.ts";

export type KullaniciRolu = "yonetici" | "goruntuleyici";

/**
 * Oturum açmış kullanıcının rolünü döner. Profil satırı yoksa (ör. eski bir
 * hesap, migration'dan önce) "yonetici" varsayılır — geriye dönük uyumluluk.
 */
export async function kullaniciRolu(): Promise<KullaniciRolu> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "yonetici";

  const { data, error } = await supabase
    .from("profiles")
    .select("rol")
    .eq("id", user.id)
    .maybeSingle();

  // profiles tablosu henüz migration ile oluşturulmadıysa da panel çalışsın.
  if (error) return "yonetici";
  return (data?.rol as KullaniciRolu | undefined) ?? "yonetici";
}

export const YETKI_HATASI = "Bu işlem için yönetici yetkisi gerekir.";
export const OTURUM_HATASI = "Oturumunuz sona ermiş. Lütfen tekrar giriş yapın.";

/**
 * Yazma yapan sunucu action'larının başına konan ortak yetki kapısı.
 * Yöneticiyse null, değilse action'ların döndüğü `{ hata }` nesnesini verir.
 *
 * Neden gerekli: RLS (bkz. migrations/0004_kullanici_rolleri.sql) yazmayı
 * zaten yöneticiyle sınırlıyor, ama engellenen bir update/delete Supabase'den
 * `error: null` + 0 satır olarak döner — kullanıcı hiçbir şey değişmediği
 * hâlde "kaydedildi" görürdü. Ayrıca RLS bir veritabanı kuralıdır; WhatsApp
 * gönderimi gibi dışarı giden yan etkileri durduramaz (bkz. gonderildiIsaretle).
 *
 * kullaniciRolu() oturum yokken geriye dönük uyumluluk için "yonetici"
 * döndüğünden, oturumu burada ayrıca doğruluyoruz.
 */
export async function yoneticiDegilse(): Promise<{ hata: string } | null> {
  if (!(await getUser())) return { hata: OTURUM_HATASI };
  if ((await kullaniciRolu()) !== "yonetici") return { hata: YETKI_HATASI };
  return null;
}
