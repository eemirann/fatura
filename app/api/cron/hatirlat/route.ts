import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { wahaAktifMi } from "@/lib/waha-ayristir.ts";
import { wahaMesajGonder, wahaOturumDurumu } from "@/lib/waha";
import { mesajOlustur, dekontLinki, hatirlatmaBasligi } from "@/lib/whatsapp";
import { borcOzeti } from "@/lib/borc";
import { isoGun } from "@/lib/format";
import type { ReceiptEslesme } from "@/lib/types";

export const runtime = "nodejs";
// Kendi sunucumuzda bu değerin bir karşılığı yok (Next onu yalnızca Vercel'de
// uygular); gönderim aralıkları yüzünden uzun sürebilen bu iş için yine de
// gerçekçi bir üst sınır olarak duruyor.
export const maxDuration = 300;

/** Aynı faturaya bu kadar gün geçmeden ikinci bir hatırlatma gitmez. */
const TEKRAR_ARALIGI_GUN = 3;

/**
 * Tek çalıştırmada gönderilecek en fazla mesaj. WhatsApp'ın toplu gönderim
 * tespitine takılmamak için bilinçli bir tavan: kalanlar ertesi gün gider.
 */
const CALISMA_BASINA_TAVAN = 40;

/**
 * Mesajlar arası bekleme. Art arda, gecikmesiz gönderim klasik bot paterni
 * olduğu ve WAHA resmî olmayan bir köprü olduğu için hesabın askıya alınma
 * riskini doğrudan artırır. Sabit bir aralık da kendi başına düzenli bir imza
 * bıraktığından üstüne rastgele bir pay ekleniyor.
 */
const MESAJ_ARASI_MS = 4_000;
const MESAJ_ARASI_JITTER_MS = 3_000;

const bekle = (ms: number) => new Promise((coz) => setTimeout(coz, ms));

/**
 * Vadesi geçmiş, ödenmemiş faturalar için WhatsApp hatırlatması gönderir.
 * `hatirlatma` container'ındaki crond günlük tetikler (scripts/hatirlatma-zamanlayici.sh).
 *
 * WAHA yapılandırılmamışsa (yerelde/henüz VPS yoksa) hiçbir şey yapmadan
 * "atlandı" bilgisiyle döner — otomatik gönderim olmadan mesaj atacak bir
 * yol yok, bu isteğe bağlı bir üst katman.
 */
export async function GET(request: Request) {
  // Fail-closed: CRON_SECRET tanımlı değilse istek reddedilir. Aksi hâlde
  // değişkeni kurulumda atlamak, uç noktayı herkese açık bırakır — çağıran
  // herkes vadesi geçmiş tüm kiracılara WhatsApp hatırlatması yağdırabilirdi.
  // (Aynı kalıp: app/api/whatsapp-webhook/route.ts)
  const beklenenSir = process.env.CRON_SECRET;
  if (!beklenenSir || request.headers.get("authorization") !== `Bearer ${beklenenSir}`) {
    return NextResponse.json({ hata: "Yetkisiz." }, { status: 401 });
  }

  if (!wahaAktifMi()) {
    return NextResponse.json({ tamam: true, atlandi: "waha-aktif-degil" });
  }

  // Oturum kopmuşken göndermeye çalışmak her fatura için ayrı bir başarısız
  // istek üretir ve `son_hatirlatma_at` yazılmadığı için ertesi gün aynısı
  // tekrarlanır. Baştan durup nedeni açıkça bildiriyoruz.
  const oturum = await wahaOturumDurumu();
  if (!oturum.erisilebilir || !oturum.calisiyor) {
    return NextResponse.json(
      {
        tamam: false,
        atlandi: "waha-oturum-hazir-degil",
        detay: oturum.erisilebilir ? oturum.durum : oturum.hata,
      },
      { status: 503 },
    );
  }

  const admin = getAdminSupabase();
  const bugun = isoGun();
  const tekrarSiniri = new Date(
    Date.now() - TEKRAR_ARALIGI_GUN * 86_400_000,
  ).toISOString();

  // Vadesi geçmiş olanları süzmek yerine dairenin KAPANMAMIŞ TÜM dönemlerini
  // çekiyoruz: hatırlatma artık toplam borcu da yazdığı için eksik veriyle
  // kurulamıyor (bkz. lib/borc.ts).
  const [{ data: ayarlar }, { data: faturalar, error }] = await Promise.all([
    admin.from("settings").select("iban, hesap_sahibi, mesaj_sablonu").single(),
    admin
      .from("invoices")
      .select(
        "id, unit_id, donem, toplam, durum, son_odeme_tarihi, son_hatirlatma_at, public_token, units(kapi_no, kiraci_adi, kiraci_telefon, blocks(ad)), invoice_items(baslik, tutar), receipts(eslesme, okunan_tutar)",
      )
      .in("durum", ["gonderildi", "uyusmadi"]),
  ]);

  if (error) return NextResponse.json({ hata: error.message }, { status: 500 });
  if (!ayarlar) return NextResponse.json({ hata: "Ayarlar bulunamadı." }, { status: 500 });

  type FaturaSatiri = {
    id: string;
    unit_id: string;
    donem: string;
    toplam: number | string;
    durum: "gonderildi" | "uyusmadi";
    son_odeme_tarihi: string;
    son_hatirlatma_at: string | null;
    public_token: string;
    units:
      | { kapi_no: string; kiraci_adi: string | null; kiraci_telefon: string | null; blocks: { ad: string } | { ad: string }[] | null }
      | { kapi_no: string; kiraci_adi: string | null; kiraci_telefon: string | null; blocks: { ad: string } | { ad: string }[] | null }[]
      | null;
    invoice_items: { baslik: string; tutar: number }[] | null;
    receipts: { eslesme: ReceiptEslesme; okunan_tutar: number | null }[] | null;
  };

  // Daire başına grupla. Üç ayı geciken bir kiracıya bugüne kadar ÜÇ AYRI
  // mesaj gidiyordu — hem kafa karıştırıcı hem de arka arkaya çok mesaj
  // olduğu için ban riskini artırıyordu. Artık daire başına tek mesaj.
  const daireler = new Map<string, FaturaSatiri[]>();
  for (const f of (faturalar ?? []) as unknown as FaturaSatiri[]) {
    const liste = daireler.get(f.unit_id) ?? [];
    liste.push(f);
    daireler.set(f.unit_id, liste);
  }

  const sonuclar: { unit_id: string; basari: boolean; detay?: string }[] = [];
  let gonderimDenemesi = 0;
  let tavandanKalan = 0;
  let ilgilenenDaire = 0;

  for (const [unitId, dairefaturalari] of daireler) {
    // Vadesi geçmiş ve tekrar aralığını doldurmuş olanlar — hatırlatmayı
    // tetikleyen küme.
    const tetikleyenler = dairefaturalari.filter(
      (f) =>
        f.son_odeme_tarihi < bugun &&
        (f.son_hatirlatma_at === null || f.son_hatirlatma_at < tekrarSiniri),
    );
    if (tetikleyenler.length === 0) continue;

    ilgilenenDaire++;

    const ilk = dairefaturalari[0];
    const unit = Array.isArray(ilk.units) ? ilk.units[0] : ilk.units;
    if (!unit?.kiraci_telefon) {
      sonuclar.push({ unit_id: unitId, basari: false, detay: "telefon-yok" });
      continue;
    }

    // Tavana gelindiyse kalanları say ve bırak: `son_hatirlatma_at`
    // yazılmadığı için bunlar yarınki çalıştırmada yeniden sıraya girer.
    if (gonderimDenemesi >= CALISMA_BASINA_TAVAN) {
      tavandanKalan++;
      continue;
    }

    // İlk mesajdan sonrakilerin arasına bekleme koy.
    if (gonderimDenemesi > 0) {
      await bekle(
        MESAJ_ARASI_MS + Math.floor(Math.random() * MESAJ_ARASI_JITTER_MS),
      );
    }
    gonderimDenemesi++;

    const borc = borcOzeti(
      dairefaturalari.map((f) => ({
        donem: f.donem,
        toplam: Number(f.toplam),
        durum: f.durum,
        son_odeme_tarihi: f.son_odeme_tarihi,
        dekontlar: (f.receipts ?? []).map((r) => ({
          eslesme: r.eslesme,
          okunan_tutar: r.okunan_tutar === null ? null : Number(r.okunan_tutar),
        })),
      })),
      bugun,
    );

    // Şablon en yeni dönem üzerinden doldurulur: IBAN, hesap sahibi ve dekont
    // linki oradan geliyor. Toplam borç varsa başlıkta ayrıca özetleniyor.
    const enYeni = [...dairefaturalari].sort((a, b) =>
      b.donem.localeCompare(a.donem),
    )[0];
    const blockRel = Array.isArray(unit.blocks) ? unit.blocks[0] : unit.blocks;

    const mesaj =
      hatirlatmaBasligi(borc.kalemler, borc.toplam) +
      mesajOlustur({
        sablon: ayarlar.mesaj_sablonu,
        kiraciAdi: unit.kiraci_adi,
        blokAdi: blockRel?.ad ?? "",
        kapiNo: unit.kapi_no,
        donem: enYeni.donem,
        kalemler: enYeni.invoice_items ?? [],
        toplam: Number(enYeni.toplam),
        sonOdemeTarihi: enYeni.son_odeme_tarihi,
        iban: ayarlar.iban,
        hesapSahibi: ayarlar.hesap_sahibi,
        dekontLinki: dekontLinki(enYeni.public_token),
      });

    const sonuc = await wahaMesajGonder(unit.kiraci_telefon, mesaj);
    sonuclar.push({
      unit_id: unitId,
      basari: sonuc.basari,
      detay: sonuc.basari ? undefined : sonuc.hata,
    });

    if (sonuc.basari) {
      // Tek mesaj tüm gecikmiş dönemleri kapsadığı için hepsinin damgası
      // birden güncelleniyor; aksi hâlde yarın aynı daire tekrar sıraya girerdi.
      await admin
        .from("invoices")
        .update({ son_hatirlatma_at: new Date().toISOString() })
        .in(
          "id",
          tetikleyenler.map((f) => f.id),
        );
    }
  }

  return NextResponse.json({
    tamam: true,
    ilgilenenDaire,
    gonderilen: sonuclar.filter((s) => s.basari).length,
    // Tavana takılıp bu çalıştırmada gönderilmeyenler; sıfırdan büyük kalması
    // süreklilik arz ediyorsa tavanı yükseltmek ya da cron'u sıklaştırmak
    // gerekir.
    tavandanKalan,
    sonuclar,
  });
}
