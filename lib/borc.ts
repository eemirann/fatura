import type { InvoiceDurum, ReceiptEslesme } from "./types.ts";
import { TOLERANS, toplananTutar } from "./esles.ts";

/**
 * Birikmiş borç hesabı.
 *
 * Panel bugüne kadar her ayı ayrı bir ada gibi ele alıyordu: üç ay ödemeyen
 * bir sakin için yönetici üç ayrı kırmızı kart görüyor, sakine üç ayrı link
 * gidiyor ve hiçbir yerde "toplam şu kadar borcunuz var" yazmıyordu. Aidat
 * yönetiminin bir numaralı derdi kronik borçlu olduğu için bu, ürünün en
 * belirgin eksiğiydi.
 *
 * Borç TÜRETİLMİŞ bir değerdir — ayrı bir bakiye kolonu tutulmuyor. Tek
 * kaynak faturalar ve dekontlar; böylece elle işaretleme, kısmi ödeme ve
 * tutar düzeltmesi sonrasında bakiyenin gerçekle arasının açılması mümkün
 * olmuyor.
 *
 * Borç DAİREYE aittir, kiracıya değil: apartman yönetiminde aidat borcu
 * daireyi/maliki takip eder, kiracı değişse bile bakiye durur. (Kiracı
 * dönemlerinin ayrıştırılması ayrı bir iş — bkz. plan B5.)
 */

/** Borç hesabı için bir faturadan gereken asgari alanlar. */
export type BorcFaturasi = {
  donem: string;
  toplam: number;
  durum: InvoiceDurum;
  son_odeme_tarihi: string;
  dekontlar: { eslesme: ReceiptEslesme; okunan_tutar: number | null }[];
};

export type BorcKalemi = {
  donem: string;
  toplam: number;
  odenen: number;
  kalan: number;
  son_odeme_tarihi: string;
  /** Son ödeme tarihi geçmiş mi. */
  gecikmis: boolean;
};

export type BorcOzeti = {
  /** Ödenmemiş tüm dönemlerin toplamı. */
  toplam: number;
  /** Yalnızca vadesi geçmiş dönemlerin toplamı. */
  gecikmis: number;
  /** Borcu olan dönemler, eskiden yeniye. */
  kalemler: BorcKalemi[];
};

/**
 * Tek bir faturanın ödenmemiş kalanı.
 *
 * `durum` bilinçli olarak dekont toplamının önüne geçiyor:
 * - `odendi`  → 0. Nakit tahsilat "elle ödendi" ile işaretlendiğinde ortada
 *   hiç dekont olmaz; dekonta bakıp borç üretmek yanlış olurdu.
 * - `taslak`  → 0. Henüz kiracıya gönderilmemiş fatura bir alacak değildir.
 */
export function faturaKalani(f: BorcFaturasi): number {
  if (f.durum === "odendi" || f.durum === "taslak") return 0;

  const kalan = Number(f.toplam) - toplananTutar(f.dekontlar);
  // Kuruş artıkları borç sayılmasın; fazla ödeme de negatif borç üretmesin.
  return kalan > TOLERANS ? kalan : 0;
}

/**
 * Bir dairenin tüm dönemlerdeki birikmiş borcu.
 *
 * `bugun` ISO gün ("YYYY-MM-DD"); gecikme ayrımı buna göre yapılır.
 */
export function borcOzeti(faturalar: BorcFaturasi[], bugun: string): BorcOzeti {
  const kalemler: BorcKalemi[] = [];

  for (const f of faturalar) {
    const kalan = faturaKalani(f);
    if (kalan <= 0) continue;

    kalemler.push({
      donem: f.donem,
      toplam: Number(f.toplam),
      odenen: toplananTutar(f.dekontlar),
      kalan,
      son_odeme_tarihi: f.son_odeme_tarihi,
      gecikmis: f.son_odeme_tarihi < bugun,
    });
  }

  kalemler.sort((a, b) => a.donem.localeCompare(b.donem));

  return {
    toplam: kalemler.reduce((t, k) => t + k.kalan, 0),
    gecikmis: kalemler.filter((k) => k.gecikmis).reduce((t, k) => t + k.kalan, 0),
    kalemler,
  };
}

/**
 * Seçili dönem dışında kalan borç — "geçmişten devir" tutarı.
 *
 * Panelde ve kiracı sayfasında asıl dikkat çekilmesi gereken bu: içinde
 * bulunulan ayın faturası zaten görünüyor, gözden kaçan eski aylar.
 */
export function devredenBorc(ozet: BorcOzeti, seciliDonem: string): number {
  return ozet.kalemler
    .filter((k) => k.donem !== seciliDonem)
    .reduce((t, k) => t + k.kalan, 0);
}
