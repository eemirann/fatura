import Link from "next/link";
import UstMenu from "@/components/ust-menu";
import DonemSecici from "@/components/donem-secici";
import { bildirimVerisi, type BildirimDaire } from "@/lib/veri";
import { durumHesapla } from "@/lib/durum";
import { toplananTutar } from "@/lib/esles.ts";
import { donemAnahtari, isoGun, para, tarihTR } from "@/lib/format";

export const dynamic = "force-dynamic";

const GECERLI_DONEM = /^\d{4}-\d{2}-01$/;

/** Bir dairenin (matched+kismi) toplanan tutarı — Supabase numeric alanları
 * çalışma zamanında string dönebildiği için Number() ile normalize edilir. */
function daireToplananTutar(daire: BildirimDaire): number {
  if (!daire.invoice) return 0;
  return toplananTutar(
    daire.invoice.receipts.map((r) => ({
      eslesme: r.eslesme,
      okunan_tutar: Number(r.okunan_tutar ?? 0),
    })),
  );
}

type Bolum = {
  baslik: string;
  renk: string;
  filtre: (d: BildirimDaire, bugun: string) => boolean;
  aciklama: (d: BildirimDaire) => string;
};

const BOLUMLER: Bolum[] = [
  {
    baslik: "Vadesi geçti",
    renk: "border-red-200 bg-red-50",
    filtre: (d, bugun) => durumHesapla(d.invoice, bugun).kod === "gecikti",
    aciklama: (d) => `Son ödeme: ${tarihTR(d.invoice?.son_odeme_tarihi)}`,
  },
  {
    baslik: "Tutar uyuşmadı",
    renk: "border-orange-200 bg-orange-50",
    filtre: (d, bugun) => durumHesapla(d.invoice, bugun).kod === "uyusmadi",
    aciklama: (d) => `Beklenen: ${para(d.invoice?.toplam)}`,
  },
  {
    baslik: "Kısmi ödeme var",
    renk: "border-amber-200 bg-amber-50",
    filtre: (d) => d.invoice?.durum === "gonderildi" && daireToplananTutar(d) > 0,
    aciklama: (d) => `Toplanan: ${para(daireToplananTutar(d))} / ${para(d.invoice?.toplam)}`,
  },
  {
    baslik: "İncelenmeyi bekliyor",
    renk: "border-emerald-200 bg-emerald-50",
    filtre: (d, bugun) => durumHesapla(d.invoice, bugun).kod === "odendi_incelenmedi",
    aciklama: () => "Dekont geldi, henüz incelenmedi.",
  },
];

export default async function BildirimlerPage({
  searchParams,
}: {
  searchParams: Promise<{ donem?: string }>;
}) {
  const { donem: istenen } = await searchParams;
  const donem = istenen && GECERLI_DONEM.test(istenen) ? istenen : donemAnahtari();

  const daireler = await bildirimVerisi(donem);
  const bugun = isoGun();

  const gruplar = BOLUMLER.map((b) => ({
    ...b,
    daireler: daireler.filter((d) => b.filtre(d, bugun)),
  })).filter((g) => g.daireler.length > 0);

  return (
    <>
      <UstMenu aktif="bildirimler" />
      <main className="mx-auto max-w-4xl p-4 pb-20 sm:pb-4">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-2xl font-semibold">Bildirimler</h1>
          <DonemSecici donem={donem} taban="/bildirimler" />
        </div>

        {gruplar.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            İlgi bekleyen daire yok 🎉
          </p>
        ) : (
          <div className="space-y-6">
            {gruplar.map((g) => (
              <section key={g.baslik} className={`rounded-xl border ${g.renk}`}>
                <h2 className="border-b border-black/5 px-4 py-3 font-medium">
                  {g.baslik}{" "}
                  <span className="font-normal text-slate-500">({g.daireler.length})</span>
                </h2>
                <ul className="divide-y divide-black/5">
                  {g.daireler.map((d) => (
                    <li key={d.id}>
                      <Link
                        href={`/daire/${d.id}?donem=${donem}`}
                        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-white/60"
                      >
                        <span className="font-medium">
                          {d.block.ad} — {d.kapi_no}
                          {d.kiraci_adi && (
                            <span className="ml-2 font-normal text-slate-500">
                              {d.kiraci_adi}
                            </span>
                          )}
                        </span>
                        <span className="text-slate-600">{g.aciklama(d)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
