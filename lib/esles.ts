import type { DekontOkuma } from "./dekont-oku.ts";
import type { InvoiceDurum, ReceiptEslesme } from "./types.ts";

export type EslesmeSonucu = {
  eslesme: ReceiptEslesme;
  /** null ise faturanın durumuna dokunulmaz. */
  yeniDurum: InvoiceDurum | null;
  /** Panelde gösterilecek kısa açıklama. */
  aciklama: string;
};

/** Kuruş yuvarlamalarını tolere etmek için. */
const TOLERANS = 0.01;

function ibanSonHane(iban: string | null | undefined, n = 4): string | null {
  if (!iban) return null;
  const temiz = iban.replace(/\s/g, "").toUpperCase();
  return temiz.length >= n ? temiz.slice(-n) : null;
}

/**
 * Dekont okumasını beklenen tutarla karşılaştırıp faturanın yeni durumunu
 * belirler. Saf fonksiyon — veritabanına dokunmaz, böylece kuralı tek başına
 * test etmek mümkün.
 *
 * Kural:
 *   okunamadı            -> durum değişmez, panelde "elle bak" uyarısı
 *   tutar eşleşti        -> odendi (incelendi_at null bırakılır: yeşil + rozet)
 *   tutar tutmadı        -> uyusmadi (turuncu)
 *   TL dışı para birimi  -> uyusmadi (tutarlar karşılaştırılamaz)
 */
export function eslestir(
  okuma: DekontOkuma,
  beklenenTutar: number,
  ayarlardakiIban: string,
): EslesmeSonucu {
  if (!okuma.okunabilir || okuma.tutar === null) {
    return {
      eslesme: "unreadable",
      yeniDurum: null,
      aciklama:
        okuma.aciklama?.trim() ||
        "Dosyadan tutar okunamadı. Dekontu açıp elle kontrol edin.",
    };
  }

  const birim = okuma.para_birimi?.trim().toUpperCase();
  if (birim && birim !== "TRY" && birim !== "TL") {
    return {
      eslesme: "mismatch",
      yeniDurum: "uyusmadi",
      aciklama: `Dekont ${birim} cinsinden. TL tutarla karşılaştırılamadı.`,
    };
  }

  const fark = Math.abs(okuma.tutar - beklenenTutar);
  const uyarilar: string[] = [];

  // IBAN kontrolü eşleşmeyi bloklamaz — yalnızca dikkat çeker. Kiracı
  // ödemeyi başka bir hesaba yapmış olabilir.
  const beklenenSon = ibanSonHane(ayarlardakiIban);
  const okunanSon = ibanSonHane(okuma.alici_iban);
  if (beklenenSon && okunanSon && beklenenSon !== okunanSon) {
    uyarilar.push(
      `Dikkat: alıcı IBAN'ı ayarlardakinden farklı görünüyor (…${okunanSon}).`,
    );
  }

  if (fark <= TOLERANS) {
    return {
      eslesme: "matched",
      yeniDurum: "odendi",
      aciklama: ["Tutar eşleşti.", ...uyarilar].join(" "),
    };
  }

  return {
    eslesme: "mismatch",
    yeniDurum: "uyusmadi",
    aciklama: [
      `Beklenen tutar ile dekonttaki tutar arasında ${fark.toFixed(2)} ₺ fark var.`,
      ...uyarilar,
    ].join(" "),
  };
}
