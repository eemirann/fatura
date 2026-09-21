import type { InvoiceItem } from "./types.ts";
import { donemEtiketi, para, tarihTR, waTelefon } from "./format.ts";
import { siteUrl } from "./site-url.ts";

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

/**
 * Hatırlatma mesajının başına konan bölüm.
 *
 * Tek dönem borçluysa kısa bir etiket yeter — altındaki şablon zaten o ayın
 * dökümünü veriyor. Birden fazla dönem birikmişse asıl bilgi toplam tutardır:
 * kiracı "bu ay 750 TL" mesajını görüp ödediğinde geçmiş borcunun durduğunu
 * fark etmiyordu.
 */
export function hatirlatmaBasligi(
  kalemler: { donem: string; kalan: number }[],
  toplam: number,
): string {
  if (kalemler.length <= 1) return "⏰ Hatırlatma:\n\n";

  const satirlar = kalemler
    .map((k) => `• ${donemEtiketi(k.donem)}: ${para(k.kalan)}`)
    .join("\n");

  return (
    `⏰ Hatırlatma\n\n` +
    `Ödenmemiş toplam borcunuz: ${para(toplam)}\n${satirlar}\n\n` +
    `Son dönemin dökümü:\n\n`
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
  return `${siteUrl()}/y/${token}`;
}
