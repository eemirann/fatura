import { getServerSupabase } from "./server.ts";

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
