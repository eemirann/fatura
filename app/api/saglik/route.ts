import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { wahaAktifMi } from "@/lib/waha-ayristir.ts";
import { wahaOturumDurumu } from "@/lib/waha";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dışarıdan izlenebilir durum ucu.
 *
 * Buradaki asıl dert sessiz arızalar: WhatsApp oturumu koptuğunda panel
 * yeşil görünmeye devam ediyor, giden hatırlatmalar başarısız oluyor ve gelen
 * dekontlar hiç ulaşmıyor — kimse fark etmeden günler geçebiliyor. Bu uç,
 * UptimeRobot benzeri bir servisin dakikada bir okuyup alarm üretebileceği
 * tek bir karar noktası sunuyor.
 *
 * Yan fayda: Supabase kontrolü veritabanına dokunduğu için ücretsiz katmanın
 * "7 gün hareketsizlikte duraklatma" sayacını da sıfırlar.
 *
 * Gizlilik: oturumsuz çağrıda yalnızca HTTP kodu ve tek bir boolean döner.
 * Hangi bileşenin bozuk olduğu altyapı bilgisidir; ayrıntı için
 * `Authorization: Bearer $CRON_SECRET` gerekir.
 */
type Kontrol = { ad: string; tamam: boolean; detay?: string };

const ZAMAN_ASIMI_MS = 8_000;

async function supabaseKontrol(): Promise<Kontrol> {
  try {
    const { error } = await getAdminSupabase()
      .from("settings")
      .select("id")
      .limit(1);
    return error
      ? { ad: "supabase", tamam: false, detay: error.message }
      : { ad: "supabase", tamam: true };
  } catch (e) {
    return {
      ad: "supabase",
      tamam: false,
      detay: e instanceof Error ? e.message : "bilinmeyen hata",
    };
  }
}

async function dekontKontrol(): Promise<Kontrol> {
  const url = process.env.DEKONT_SERVIS_URL;
  if (!url) return { ad: "dekont", tamam: false, detay: "DEKONT_SERVIS_URL yok" };

  try {
    const yanit = await fetch(`${url.replace(/\/+$/, "")}/health`, {
      signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
    });
    return yanit.ok
      ? { ad: "dekont", tamam: true }
      : { ad: "dekont", tamam: false, detay: `HTTP ${yanit.status}` };
  } catch (e) {
    return {
      ad: "dekont",
      tamam: false,
      detay: e instanceof Error ? e.message : "bilinmeyen hata",
    };
  }
}

async function wahaKontrol(): Promise<Kontrol> {
  // WAHA isteğe bağlı bir üst katman: kapalıysa bu bir arıza değil.
  if (!wahaAktifMi()) return { ad: "waha", tamam: true, detay: "kapali" };

  const durum = await wahaOturumDurumu();
  if (!durum.erisilebilir) return { ad: "waha", tamam: false, detay: durum.hata };
  return { ad: "waha", tamam: durum.calisiyor, detay: durum.durum };
}

export async function GET(request: Request) {
  const kontroller = await Promise.all([
    supabaseKontrol(),
    dekontKontrol(),
    wahaKontrol(),
  ]);

  const tamam = kontroller.every((k) => k.tamam);

  const sir = process.env.CRON_SECRET;
  const yetkili =
    Boolean(sir) && request.headers.get("authorization") === `Bearer ${sir}`;

  return NextResponse.json(
    yetkili ? { tamam, kontroller } : { tamam },
    { status: tamam ? 200 : 503 },
  );
}
