import "server-only";
import { getServerSupabase } from "@/lib/supabase/server";
import type { Receipt } from "@/lib/types";

/**
 * Dekont bucket'ı private — dosyalar yalnızca kısa ömürlü imzalı adresle
 * görüntülenir. Tek çağrıda hepsini imzalayıp id -> url haritası döner.
 */
export async function imzaliDekontUrlleri(
  dekontlar: Pick<Receipt, "id" | "dosya_yolu">[],
): Promise<Record<string, string>> {
  if (dekontlar.length === 0) return {};

  const supabase = await getServerSupabase();
  const { data, error } = await supabase.storage
    .from("dekontlar")
    .createSignedUrls(
      dekontlar.map((d) => d.dosya_yolu),
      60 * 30, // 30 dakika
    );

  if (error || !data) return {};

  const harita: Record<string, string> = {};
  data.forEach((sonuc, i) => {
    if (sonuc.signedUrl) harita[dekontlar[i].id] = sonuc.signedUrl;
  });
  return harita;
}
