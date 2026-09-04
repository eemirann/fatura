import { waTelefon } from "./format.ts";

/**
 * Saf (server-only'e bağımlı olmayan) WAHA ayrıştırma mantığı — testlerde
 * doğrudan import edilebilsin diye lib/waha.ts'ten ayrı tutuluyor.
 */

export function wahaAktifMi(): boolean {
  return Boolean(process.env.WAHA_URL);
}

/** Telefonu WAHA'nın beklediği chatId biçimine çevirir: "905321112233@c.us" */
export function chatId(telefon: string): string | null {
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
