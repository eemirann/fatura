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

function ibanNormalize(iban: string | null | undefined): string | null {
  if (!iban) return null;
  const temiz = iban.replace(/\s/g, "").toUpperCase();
  return temiz || null;
}

/**
 * IBAN'ın MOD-97 sağlama toplamını (ISO 7064) hiçbir dış servise ihtiyaç
 * duymadan doğrular. Ülke kodu + kontrol basamağı sona taşınır, harfler
 * sayıya çevrilir (A=10…Z=35), kalan sayının mod 97'si 1 ise IBAN geçerlidir.
 *
 * Bu, OCR'ın okuduğu IBAN'ın gerçekten bir IBAN biçimine uyup uymadığını
 * ayırt eder: uymuyorsa büyük ihtimalle OCR hatasıdır, sahtecilik değil —
 * bu yüzden yalnızca GEÇERLİ bir IBAN, ayarlardakinden farklıysa fatura
 * reddedilir (bkz. eslestir).
 */
function ibanChecksumGecerliMi(iban: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const donmus = iban.slice(4) + iban.slice(0, 4);
  const sayisal = donmus.replace(/[A-Z]/g, (h) => String(h.charCodeAt(0) - 55));
  try {
    return BigInt(sayisal) % 97n === 1n;
  } catch {
    return false;
  }
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

  // IBAN kontrolü, tarih ve tutar karşılaştırmasından ÖNCE: para başka bir
  // hesaba gittiyse tutarın tutması hiçbir şey ifade etmiyor. Yalnızca MOD-97
  // sağlama toplamına göre GEÇERLİ biçimli bir IBAN farklıysa reddedilir —
  // geçersiz sağlama toplamı büyük ihtimalle OCR hatasıdır, sahtecilik değil,
  // o durumda yalnızca uyarı eklenir ve akış devam eder.
  const okunanIban = ibanNormalize(okuma.alici_iban);
  const ayarIban = ibanNormalize(ayarlardakiIban);
  if (okunanIban && ayarIban && okunanIban !== ayarIban) {
    if (ibanChecksumGecerliMi(okunanIban)) {
      return {
        eslesme: "iban_uyusmadi",
        yeniDurum: "uyusmadi",
        aciklama: [
          `Dekonttaki alıcı IBAN'ı (…${okunanIban.slice(-4)}) ayarlardaki IBAN'la uyuşmuyor.`,
          "Bu ödeme başka bir hesaba yapılmış olabilir; fatura otomatik kapatılmadı.",
          "Kontrol edip gerekirse elle ödendi işaretleyin.",
        ].join(" "),
      };
    }
    uyarilar.push(
      `Dikkat: okunan IBAN geçersiz biçimli (…${okunanIban.slice(-4)}), OCR hatası olabilir.`,
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
