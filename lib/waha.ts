import "server-only";

/**
 * WAHA (WhatsApp HTTP API) üzerinden otomatik mesaj gönderimi.
 *
 * WAHA_URL ayarlanmamışsa otomasyon kapalı sayılır — arayan taraf bunu kontrol
 * edip manuel wa.me akışına düşer, bu dosya sessizce hata üretmez.
 *
 * Saf ayrıştırma mantığı (testlerde de kullanılabilsin diye) lib/waha-ayristir.ts'te.
 */
export { wahaAktifMi, wahaGonderenNumarasi, type WahaMesaj } from "./waha-ayristir.ts";
import { chatId } from "./waha-ayristir.ts";

export type WahaSonuc = { basari: true } | { basari: false; hata: string };

/**
 * Webhook payload'ındaki medya URL'i WAHA'nın kendi iç adresini (ör.
 * container içi `http://localhost:3000`) taşıyabilir — dışarıdan erişilemez.
 * Yolu (path) alıp `WAHA_URL` ile birleştirerek gerçek adresi kurar.
 */
export async function wahaMedyaIndir(
  medyaUrl: string,
): Promise<{ veri: Buffer; mimetype: string; filename: string } | null> {
  const url = process.env.WAHA_URL;
  if (!url) return null;

  let yol: string;
  try {
    const ayristirilmis = new URL(medyaUrl);
    yol = ayristirilmis.pathname + ayristirilmis.search;
  } catch {
    return null;
  }

  const basliklar: Record<string, string> = {};
  const apiKey = process.env.WAHA_API_KEY;
  if (apiKey) basliklar["X-Api-Key"] = apiKey;

  const yanit = await fetch(url.replace(/\/+$/, "") + yol, {
    headers: basliklar,
    signal: AbortSignal.timeout(30_000),
  });
  if (!yanit.ok) return null;

  return {
    veri: Buffer.from(await yanit.arrayBuffer()),
    mimetype: yanit.headers.get("content-type") ?? "application/octet-stream",
    filename: yol.split("/").pop() ?? "dekont",
  };
}

/**
 * WAHA oturumunun gerçek durumu.
 *
 * `wahaAktifMi()` yalnızca WAHA_URL'in dolu olup olmadığına bakar — oturum
 * kopmuş olsa bile "aktif" der. Oysa WhatsApp oturumu düşünce (telefon
 * bağlantıyı kesti, numara askıya alındı, volume kayboldu) giden mesajlar
 * sessizce başarısız olur ve gelen dekontlar hiç ulaşmaz. Bu fonksiyon o
 * sessiz arızayı görünür kılmak için.
 *
 * WAHA durumları: STOPPED · STARTING · SCAN_QR_CODE · WORKING · FAILED
 */
export type WahaOturumDurumu =
  | { erisilebilir: true; calisiyor: boolean; durum: string }
  | { erisilebilir: false; hata: string };

export async function wahaOturumDurumu(): Promise<WahaOturumDurumu> {
  const url = process.env.WAHA_URL;
  if (!url) return { erisilebilir: false, hata: "WAHA_URL ayarlanmamış." };

  const oturum = process.env.WAHA_SESSION || "default";
  const basliklar: Record<string, string> = {};
  const apiKey = process.env.WAHA_API_KEY;
  if (apiKey) basliklar["X-Api-Key"] = apiKey;

  try {
    const yanit = await fetch(
      `${url.replace(/\/+$/, "")}/api/sessions/${encodeURIComponent(oturum)}`,
      { headers: basliklar, signal: AbortSignal.timeout(10_000) },
    );

    if (!yanit.ok) {
      return { erisilebilir: false, hata: `WAHA ${yanit.status} döndürdü.` };
    }

    const govde = (await yanit.json()) as { status?: unknown };
    const durum = typeof govde.status === "string" ? govde.status : "BILINMIYOR";
    return { erisilebilir: true, calisiyor: durum === "WORKING", durum };
  } catch (e) {
    return {
      erisilebilir: false,
      hata: e instanceof Error ? e.message : "Bilinmeyen hata.",
    };
  }
}

export async function wahaMesajGonder(
  telefon: string | null,
  mesaj: string,
): Promise<WahaSonuc> {
  const url = process.env.WAHA_URL;
  if (!url) return { basari: false, hata: "WAHA_URL ayarlanmamış." };

  const id = chatId(telefon ?? "");
  if (!id) return { basari: false, hata: "Telefon numarası geçersiz." };

  const basliklar: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = process.env.WAHA_API_KEY;
  if (apiKey) basliklar["X-Api-Key"] = apiKey;

  try {
    const yanit = await fetch(url.replace(/\/+$/, "") + "/api/sendText", {
      method: "POST",
      headers: basliklar,
      body: JSON.stringify({
        session: process.env.WAHA_SESSION || "default",
        chatId: id,
        text: mesaj,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!yanit.ok) {
      const detay = await yanit.text().catch(() => "");
      return { basari: false, hata: `WAHA hata döndürdü (${yanit.status}): ${detay.slice(0, 300)}` };
    }

    return { basari: true };
  } catch (e) {
    return { basari: false, hata: e instanceof Error ? e.message : "Bilinmeyen hata." };
  }
}
