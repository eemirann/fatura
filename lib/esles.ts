import type { DekontOkuma } from "./dekont-servis.ts";
import type { InvoiceDurum, ReceiptEslesme } from "./types.ts";

export type EslesmeSonucu = {
  eslesme: ReceiptEslesme;
  /** null ise faturanın durumuna dokunulmaz. */
  yeniDurum: InvoiceDurum | null;
  /** Panelde gösterilecek kısa açıklama. */
  aciklama: string;
};

/** Kuruş yuvarlamalarını tolere etmek için. */
export const TOLERANS = 0.01;

/**
 * Bir faturaya bugüne kadar "matched" ya da "kismi" sayılmış dekontların
 * toplamı — `eslestir()`'e `oncekiOdenenTutar` olarak geçirilir. Hem
 * `app/api/ingest/route.ts` (yeni dekont gelince) hem `app/daire/[id]/page.tsx`
 * (panelde "Toplanan: X/Y ₺" göstergesi) aynı kuralı kullanır — tek kaynak
 * burası, iki yerde ayrı ayrı `reduce` yazılmaz.
 */
export function toplananTutar(
  dekontlar: { eslesme: ReceiptEslesme; okunan_tutar: number | null }[],
): number {
  return dekontlar
    .filter((d) => d.eslesme === "matched" || d.eslesme === "kismi")
    .reduce((t, d) => t + (d.okunan_tutar ?? 0), 0);
}

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
 * `oncekiOdenenTutar`: bu faturaya bu ana kadar "matched" ya da "kismi"
 * sayılmış dekontların toplamı — paylaşımlı dairelerde (ör. 3 kişi kirayı
 * ayrı ayrı gönderiyor) her yeni dekont bu toplama eklenip fatura tutarına
 * ulaşılıp ulaşılmadığına bakılır.
 *
 * Kural:
 *   okunamadı            -> durum değişmez, panelde "elle bak" uyarısı
 *   toplam tam eşleşti   -> odendi (incelendi_at null bırakılır: yeşil + rozet)
 *   toplam hâlâ eksik    -> kismi (fatura "gönderildi" durumunda kalır)
 *   toplam fazla         -> uyusmadi (turuncu)
 *   TL dışı para birimi  -> uyusmadi (tutarlar karşılaştırılamaz)
 */
/** Dekont tarihi fatura döneminden bu kadar gün önceyse "eski tarihli" uyarısı verilir. */
const ESKI_TARIH_TOLERANS_GUN = 60;

/** "2026-09-01" gibi bir dönem, dekont tarihinden en az bu kadar gün sonraysa eskidir. */
function eskiTarihliMi(okunanTarih: string | null, faturaDonemi?: string): boolean {
  if (!okunanTarih || !faturaDonemi) return false;
  const dekont = new Date(okunanTarih);
  const donem = new Date(faturaDonemi);
  if (Number.isNaN(dekont.getTime()) || Number.isNaN(donem.getTime())) return false;
  const farkGun = (donem.getTime() - dekont.getTime()) / 86_400_000;
  return farkGun > ESKI_TARIH_TOLERANS_GUN;
}

export function eslestir(
  okuma: DekontOkuma,
  beklenenTutar: number,
  ayarlardakiIban: string,
  oncekiOdenenTutar = 0,
  faturaDonemi?: string,
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

  const toplamSimdi = oncekiOdenenTutar + okuma.tutar;
  const fark = toplamSimdi - beklenenTutar;
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

  // Eşleşmeyi bloklamaz — yalnızca dikkat çeker. Kiracı elindeki eski/başka
  // bir aya ait dekontu tekrar göndermiş olabilir.
  if (eskiTarihliMi(okuma.tarih, faturaDonemi)) {
    uyarilar.push(
      `Dikkat: dekont tarihi (${okuma.tarih}) fatura döneminden çok eski görünüyor — eski/yanlış bir dekont olabilir.`,
    );
  }

  if (Math.abs(fark) <= TOLERANS) {
    const kumulatif =
      oncekiOdenenTutar > 0
        ? [`Toplam ${toplamSimdi.toFixed(2)} ₺ ile fatura tam karşılandı.`]
        : ["Tutar eşleşti."];
    return {
      eslesme: "matched",
      yeniDurum: "odendi",
      aciklama: [...kumulatif, ...uyarilar].join(" "),
    };
  }

  if (fark < 0) {
    const kalan = beklenenTutar - toplamSimdi;
    return {
      eslesme: "kismi",
      yeniDurum: null,
      aciklama: [
        `Kısmi ödeme alındı: ${toplamSimdi.toFixed(2)} / ${beklenenTutar.toFixed(2)} ₺ (kalan ${kalan.toFixed(2)} ₺).`,
        ...uyarilar,
      ].join(" "),
    };
  }

  return {
    eslesme: "mismatch",
    yeniDurum: "uyusmadi",
    aciklama: [
      `Toplam ${toplamSimdi.toFixed(2)} ₺, beklenenden ${fark.toFixed(2)} ₺ fazla.`,
      ...uyarilar,
    ].join(" "),
  };
}
