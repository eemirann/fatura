import type { InvoiceItem } from "./types.ts";
import { donemEtiketi, para, tarihTR, waTelefon } from "./format.ts";

export type MesajGirdisi = {
  sablon: string;
  kiraciAdi: string | null;
  blokAdi: string;
  kapiNo: string;
  donem: string;
  kalemler: Pick<InvoiceItem, "baslik" | "tutar">[];
  toplam: number;
  sonOdemeTarihi: string;
  iban: string;
  hesapSahibi: string;
  dekontLinki: string;
};

/**
 * Ayarlardaki şablonu doldurur.
 *
 * Bilinmeyen bir {yer_tutucu} varsa olduğu gibi bırakılır — kullanıcı şablonu
 * yanlış yazdığında sessizce boş metin üretmek yerine hatayı görsün.
 */
export function mesajOlustur(g: MesajGirdisi): string {
  const kalemSatirlari = g.kalemler
    .map((k) => `• ${k.baslik}: ${para(k.tutar)}`)
    .join("\n");

  const degerler: Record<string, string> = {
    kiraci_adi: g.kiraciAdi ?? "Sayın kiracımız",
    blok_adi: g.blokAdi,
    kapi_no: g.kapiNo,
    donem: donemEtiketi(g.donem),
    kalemler: kalemSatirlari,
    toplam: para(g.toplam),
    son_odeme_tarihi: tarihTR(g.sonOdemeTarihi),
    iban: g.iban,
    hesap_sahibi: g.hesapSahibi,
    dekont_linki: g.dekontLinki,
  };

  return g.sablon.replace(/\{(\w+)\}/g, (tam, anahtar: string) =>
    anahtar in degerler ? degerler[anahtar] : tam,
  );
}

/** Şablonda kullanılabilecek yer tutucular — ayarlar sayfasında listelenir. */
export const YER_TUTUCULAR = [
  { anahtar: "{kiraci_adi}", aciklama: "Kiracının adı" },
  { anahtar: "{blok_adi}", aciklama: "Blok adı (örn. A Blok)" },
  { anahtar: "{kapi_no}", aciklama: "Daire kapı numarası" },
  { anahtar: "{donem}", aciklama: "Dönem (örn. Ağustos 2026)" },
  { anahtar: "{kalemler}", aciklama: "Fatura kalemleri, alt alta madde olarak" },
  { anahtar: "{toplam}", aciklama: "Toplam tutar" },
  { anahtar: "{son_odeme_tarihi}", aciklama: "Son ödeme tarihi" },
  { anahtar: "{iban}", aciklama: "Ayarlardaki IBAN" },
  { anahtar: "{hesap_sahibi}", aciklama: "Ayarlardaki hesap sahibi" },
  { anahtar: "{dekont_linki}", aciklama: "Kiracıya özel dekont yükleme adresi" },
] as const;

/**
 * wa.me bağlantısı. Telefon okunamazsa null döner — bu durumda arayüz
 * "mesajı kopyala" seçeneğine düşer.
 */
export function whatsappLinki(telefon: string | null, mesaj: string): string | null {
  const numara = waTelefon(telefon);
  if (!numara) return null;
  return `https://wa.me/${numara}?text=${encodeURIComponent(mesaj)}`;
}

/** Kiracının dekont yükleyeceği tam adres. */
export function dekontLinki(token: string): string {
  const taban = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
  return `${taban}/y/${token}`;
}
