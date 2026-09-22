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

/**
 * Kalemler değiştikten sonra faturanın durumunu dekontlardan yeniden belirler.
 *
 * Neden gerekli: fatura upsert'i `durum` alanına dokunmuyor. Ödenmiş bir
 * dönemin faturası yeni bir tutarla kaydedilince kalemler değişiyor, trigger
 * `toplam`'ı güncelliyor, ama durum `odendi` olarak kalıyordu — panelde
 * yeşil görünen ama aslında karşılığı ödenmemiş bir fatura. Yanlış ödeme
 * onayının en sessiz hâli: kimse bakmıyor, çünkü zaten ödenmiş görünüyor.
 *
 * `gonderildiMi`: fatura daha önce kiracıya gönderildiyse taslağa geri
 * düşürmemek için — hiç gönderilmemiş bir fatura "taslak" olarak kalmalı.
 */
export function kalemDegisimindeDurum(
  yeniToplam: number,
  dekontlar: { eslesme: ReceiptEslesme; okunan_tutar: number | null }[],
  gonderildiMi: boolean,
): InvoiceDurum {
  const toplanan = toplananTutar(dekontlar);

  if (toplanan > 0) {
    if (Math.abs(toplanan - yeniToplam) <= TOLERANS) return "odendi";
    if (toplanan > yeniToplam + TOLERANS) return "uyusmadi";
    // Eksik kalıyorsa kısmi ödeme: fatura hâlâ açık.
  }

  return gonderildiMi ? "gonderildi" : "taslak";
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
/**
 * Dekont, fatura döneminin başlangıcından bu kadar gün öncesine kadar kabul
 * edilir. Erken ödeyen kiracı için pay: 28 Ağustos'ta yapılan ödeme Eylül
 * aidatı olabilir.
 */
const ERKEN_TARIH_PAYI_GUN = 10;

/**
 * Dekont tarihi bu fatura dönemi için imkânsız denecek kadar erken mi?
 *
 * YALNIZCA erken tarih şüphelidir, geç tarih değil: Eylül'de yapılan bir
 * ödeme pekâlâ Temmuz'un borcunu kapatıyor olabilir (bkz. borç devri). Ama
 * dönem başlamadan haftalar önce yapılmış bir ödeme bu döneme ait olamaz —
 * kiracı elindeki eski bir dekontu yüklemiş demektir.
 */
function tarihDonemeUymuyorMu(
  okunanTarih: string | null,
  faturaDonemi?: string,
): boolean {
  if (!okunanTarih || !faturaDonemi) return false;
  const dekont = new Date(okunanTarih);
  const donem = new Date(faturaDonemi);
  if (Number.isNaN(dekont.getTime()) || Number.isNaN(donem.getTime())) return false;
  const gunFarki = (donem.getTime() - dekont.getTime()) / 86_400_000;
  return gunFarki > ERKEN_TARIH_PAYI_GUN;
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

  // Tutar karşılaştırmasından ÖNCE: tarih tutmuyorsa tutarın tutması bir şey
  // ifade etmiyor. Önceden burada yalnızca bir uyarı cümlesi ekleniyordu ve
  // fatura yine "ödendi" oluyordu — kiracının elindeki eski bir dekont,
  // tutarı denk geldiği için faturayı sessizce kapatabiliyordu.
  //
  // Dosya kaybolmuyor, panelde duruyor; yalnızca faturayı otomatik kapatmıyor.
  // Yönetici bakıp gerçekten bu aya aitse "Elle ödendi işaretle" diyebilir.
  if (tarihDonemeUymuyorMu(okuma.tarih, faturaDonemi)) {
    return {
      eslesme: "tarih_uyusmadi",
      yeniDurum: "uyusmadi",
      aciklama: [
        `Dekont tarihi (${okuma.tarih}) bu fatura döneminden önceye ait — bu ödeme bu aya ait görünmüyor.`,
        "Tutar tutsa bile fatura otomatik kapatılmadı; kontrol edip gerekirse elle ödendi işaretleyin.",
        ...uyarilar,
      ].join(" "),
    };
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
