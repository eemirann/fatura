import Link from "next/link";
import { notFound } from "next/navigation";
import UstMenu from "@/components/ust-menu";
import { ayarlariGetir, daireDetayi } from "@/lib/veri";
import { durumHesapla } from "@/lib/durum";
import { donemAnahtari, donemEtiketi, isoGun, para, tarihTR } from "@/lib/format";
import { dekontLinki, mesajOlustur, whatsappLinki } from "@/lib/whatsapp";
import { wahaAktifMi } from "@/lib/waha";
import { kullaniciRolu } from "@/lib/supabase/rol.ts";
import { toplananTutar as toplananTutarHesapla } from "@/lib/esles.ts";
import FaturaPaneli from "./fatura-paneli";
import DekontListesi from "./dekont-listesi";
import { imzaliDekontUrlleri } from "./dekont-url";

export const dynamic = "force-dynamic";

const GECERLI_DONEM = /^\d{4}-\d{2}-01$/;

export default async function DairePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ donem?: string }>;
}) {
  const { id } = await params;
  const { donem: istenen } = await searchParams;
  const donem = istenen && GECERLI_DONEM.test(istenen) ? istenen : donemAnahtari();

  const [daire, ayarlar, rol] = await Promise.all([
    daireDetayi(id, donem),
    ayarlariGetir(),
    kullaniciRolu(),
  ]);
  if (!daire) notFound();
  const saltOkunur = rol !== "yonetici";

  const durum = durumHesapla(daire.invoice, isoGun());
  const fatura = daire.invoice;

  // WhatsApp mesajı yalnızca kalemler girilmişse anlamlı.
  const mesaj =
    fatura && fatura.items.length > 0
      ? mesajOlustur({
          sablon: ayarlar.mesaj_sablonu,
          kiraciAdi: daire.kiraci_adi,
          blokAdi: daire.block.ad,
          kapiNo: daire.kapi_no,
          donem,
          kalemler: fatura.items,
          toplam: Number(fatura.toplam),
          sonOdemeTarihi: fatura.son_odeme_tarihi,
          iban: ayarlar.iban,
          hesapSahibi: ayarlar.hesap_sahibi,
          dekontLinki: dekontLinki(fatura.public_token),
        })
      : null;

  const waLink = mesaj ? whatsappLinki(daire.kiraci_telefon, mesaj) : null;
  const dekontUrlleri = fatura ? await imzaliDekontUrlleri(fatura.receipts) : {};

  // Paylaşımlı dairelerde birden fazla kişi ayrı ayrı gönderebilir — şu ana
  // kadar sayılan (matched/kismi) tutarların toplamı ilerleme göstergesi için.
  const toplananTutar = fatura
    ? toplananTutarHesapla(
        fatura.receipts.map((d) => ({ eslesme: d.eslesme, okunan_tutar: Number(d.okunan_tutar ?? 0) })),
      )
    : 0;

  // "Geçen ayki kalemleri kopyala" için: en güncel, en az bir kalemi olan
  // geçmiş fatura. Yalnızca bu dönem hiç kalem girilmemişse kullanılır.
  const gecmisKalemliFatura = daire.gecmis.find((g) => g.items.length > 0);
  const oncekiKalemler = gecmisKalemliFatura
    ? gecmisKalemliFatura.items.map((k) => ({ baslik: k.baslik, tutar: Number(k.tutar) }))
    : null;

  return (
    <>
      <UstMenu aktif="panel" />

      <main className="mx-auto max-w-4xl p-4 pb-20 sm:pb-4">
        <Link
          href={`/?donem=${donem}`}
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          ‹ Panele dön
        </Link>

        <div className="mt-2 mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">
              {daire.block.ad} — {daire.kapi_no}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {daire.kiraci_adi ?? "kiracı girilmedi"}
              {daire.kiraci_telefon && ` · ${daire.kiraci_telefon}`}
              {" · "}
              {donemEtiketi(donem)}
            </p>
            {daire.notlar && (
              <p className="mt-1 text-sm text-slate-500">Not: {daire.notlar}</p>
            )}
          </div>

          <span
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${durum.kart}`}
          >
            <span className={`h-2 w-2 rounded-full ${durum.nokta}`} />
            {durum.etiket}
          </span>
        </div>

        {!daire.kiraci_telefon && (
          <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Bu daire için telefon girilmemiş. WhatsApp bağlantısı oluşturulamaz —{" "}
            <Link href="/bloklar" className="font-medium underline">
              Blok &amp; Daire
            </Link>{" "}
            sayfasından ekleyebilir ya da mesajı kopyalayıp elle gönderebilirsiniz.
          </p>
        )}

        {(!ayarlar.iban || !ayarlar.hesap_sahibi) && (
          <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            IBAN veya hesap sahibi bilgisi boş.{" "}
            <Link href="/ayarlar" className="font-medium underline">
              Ayarlar
            </Link>{" "}
            sayfasından doldurun, yoksa mesajda eksik görünür.
          </p>
        )}

        {!process.env.NEXT_PUBLIC_SITE_URL && (
          <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <strong>NEXT_PUBLIC_SITE_URL</strong> ayarlanmamış. Mesajdaki dekont
            bağlantısı eksik gider ve kiracı dosya yükleyemez. Ortam
            değişkenlerine sitenin tam adresini ekleyin.
          </p>
        )}

        <FaturaPaneli
          key={donem}
          unitId={daire.id}
          donem={donem}
          fatura={
            fatura
              ? {
                  id: fatura.id,
                  durum: fatura.durum,
                  toplam: Number(fatura.toplam),
                  son_odeme_tarihi: fatura.son_odeme_tarihi,
                  gonderildi_at: fatura.gonderildi_at,
                  incelendi_at: fatura.incelendi_at,
                  public_token: fatura.public_token,
                  items: fatura.items.map((k) => ({
                    baslik: k.baslik,
                    tutar: Number(k.tutar),
                  })),
                }
              : null
          }
          varsayilanVade={ayarlar.varsayilan_son_odeme_gunu}
          oncekiKalemler={oncekiKalemler}
          mesaj={mesaj}
          waLink={waLink}
          telefon={daire.kiraci_telefon}
          wahaAktif={wahaAktifMi()}
          dekontAdresi={fatura ? dekontLinki(fatura.public_token) : null}
          saltOkunur={saltOkunur}
        />

        {fatura && (
          <DekontListesi
            unitId={daire.id}
            faturaId={fatura.id}
            beklenenTutar={Number(fatura.toplam)}
            toplananTutar={toplananTutar}
            dekontlar={fatura.receipts.map((d) => ({
              id: d.id,
              kaynak: d.kaynak,
              eslesme: d.eslesme,
              okunan_tutar: d.okunan_tutar === null ? null : Number(d.okunan_tutar),
              okunan_tarih: d.okunan_tarih,
              okunan_iban: d.okunan_iban,
              okunan_gonderen: d.okunan_gonderen,
              okunan_banka: d.okunan_banka,
              aciklama: d.aciklama,
              dosya_adi: d.dosya_adi,
              mime: d.mime,
              created_at: d.created_at,
              url: dekontUrlleri[d.id] ?? null,
            }))}
            saltOkunur={saltOkunur}
          />
        )}

        {daire.gecmis.length > 0 && (
          <section className="mt-6 rounded-xl border border-slate-200 bg-white">
            <h2 className="border-b border-slate-100 px-4 py-3 font-medium">Geçmiş</h2>
            <ul className="divide-y divide-slate-100">
              {daire.gecmis.map((g) => {
                const gDurum = durumHesapla(g, isoGun());
                return (
                  <li key={g.id}>
                    <Link
                      href={`/daire/${daire.id}?donem=${g.donem}`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-slate-50"
                    >
                      <span className={`h-2 w-2 rounded-full ${gDurum.nokta}`} />
                      <span className="w-32 font-medium">{donemEtiketi(g.donem)}</span>
                      <span>{para(g.toplam)}</span>
                      <span className="text-slate-500">
                        son ödeme {tarihTR(g.son_odeme_tarihi)}
                      </span>
                      <span className="ml-auto text-slate-500">{gDurum.etiket}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
