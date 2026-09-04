import "server-only";
import { waTelefon } from "./format.ts";

/**
 * WAHA (WhatsApp HTTP API) üzerinden otomatik mesaj gönderimi.
 *
 * WAHA_URL ayarlanmamışsa otomasyon kapalı sayılır — arayan taraf bunu kontrol
 * edip manuel wa.me akışına düşer, bu dosya sessizce hata üretmez.
 */

export function wahaAktifMi(): boolean {
  return Boolean(process.env.WAHA_URL);
}

export type WahaSonuc = { basari: true } | { basari: false; hata: string };

/** Telefonu WAHA'nın beklediği chatId biçimine çevirir: "905321112233@c.us" */
function chatId(telefon: string): string | null {
  const numara = waTelefon(telefon);
  return numara ? `${numara}@c.us` : null;
}

/** WAHA'nın webhook'ta gönderdiği mesaj payload'ının bu dosyada kullanılan alanları. */
export type WahaMesaj = {
  id?: string;
  from?: string;
  fromMe?: boolean;
  hasMedia?: boolean;
  media?: { url?: string; mimetype?: string; filename?: string | null };
  _data?: { key?: { remoteJidAlt?: string } };
};

/**
 * Gönderenin gerçek telefon numarasını çıkarır.
 *
 * WhatsApp'ın "lid" (linked ID) adresleme modunda `from` alanı numara değil,
 * bir bağlantı kimliği oluyor (`123...@lid`) — gerçek numara
 * `_data.key.remoteJidAlt`'ta (`905...@s.whatsapp.net`) geliyor. Eski/klasik
 * kişilerde `from` doğrudan `905...@c.us` biçiminde de gelebiliyor.
 */
export function wahaGonderenNumarasi(mesaj: WahaMesaj): string | null {
  const remoteJidAlt = mesaj._data?.key?.remoteJidAlt;
  if (remoteJidAlt) {
    const numara = remoteJidAlt.split("@")[0];
    if (numara) return numara;
  }
  if (mesaj.from?.endsWith("@c.us")) return mesaj.from.split("@")[0];
  return null;
}

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
