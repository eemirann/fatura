import Link from "next/link";
import UstMenu from "@/components/ust-menu";
import DonemSecici from "@/components/donem-secici";
import { borcVerisi, panelVerisi, type DaireKarti } from "@/lib/veri";
import { devredenBorc } from "@/lib/borc";
import PanelSekmeleri, { type PanelFiltresi } from "@/components/panel-sekmeleri";
import { durumHesapla, ilgilenmeliMi, panelGrubu, type DurumKodu } from "@/lib/durum";
import { donemAnahtari, donemEtiketi, isoGun, para } from "@/lib/format";

export const dynamic = "force-dynamic";

const GECERLI_DONEM = /^\d{4}-\d{2}-01$/;
const GECERLI_FILTRELER: PanelFiltresi[] = ["hepsi", "odeyen", "odemeyen", "faturasiz"];

export default async function PanelPage({
  searchParams,
}: {
  searchParams: Promise<{ donem?: string; filtre?: string }>;
}) {
  const { donem: istenenDonem, filtre: istenenFiltre } = await searchParams;
  const donem =
    istenenDonem && GECERLI_DONEM.test(istenenDonem) ? istenenDonem : donemAnahtari();
  const filtre: PanelFiltresi = GECERLI_FILTRELER.includes(istenenFiltre as PanelFiltresi)
    ? (istenenFiltre as PanelFiltresi)
    : "hepsi";

  const bugun = isoGun();
  const [bloklar, borclar] = await Promise.all([
    panelVerisi(donem),
    borcVerisi(bugun),
  ]);

  const daireler = bloklar.flatMap((b) => b.units).filter((d) => d.aktif);
  const durumlar = daireler.map((d) => durumHesapla(d.invoice, bugun).kod);
  const sayac = (kod: DurumKodu) => durumlar.filter((k) => k === kod).length;
  const dikkat = durumlar.filter(ilgilenmeliMi).length;

  // Sekme rozetleri her zaman filtrelenmemiş listeden sayılır — aksi hâlde
  // bir sekmeye geçince diğerlerinin sayısı sıfırlanmış görünürdü.
  const sekmeSayilari: Record<PanelFiltresi, number> = {
    hepsi: daireler.length,
    odeyen: durumlar.filter((k) => panelGrubu(k) === "odeyen").length,
    odemeyen: durumlar.filter((k) => panelGrubu(k) === "odemeyen").length,
    faturasiz: durumlar.filter((k) => panelGrubu(k) === "faturasiz").length,
  };

  /** Seçili sekmeye giren daireler. "hepsi" hiçbir şeyi elemez. */
  const filtreyeUyuyor = (daire: DaireKarti) =>
    filtre === "hepsi" || panelGrubu(durumHesapla(daire.invoice, bugun).kod) === filtre;

  const beklenenToplam = daireler.reduce((t, d) => t + Number(d.invoice?.toplam ?? 0), 0);
  const tahsilEdilen = daireler
    .filter((d) => d.invoice?.durum === "odendi")
    .reduce((t, d) => t + Number(d.invoice?.toplam ?? 0), 0);

  // Seçili ayın dışından gelen, gözden kaçmaya en müsait borç. Bu ayın
  // faturası zaten kartlarda görünüyor; asıl kaybolan eski aylar.
  const devredenler = daireler
    .map((d) => ({
      daire: d,
      devreden: borclar.has(d.id) ? devredenBorc(borclar.get(d.id)!, donem) : 0,
    }))
    .filter((x) => x.devreden > 0);

  const devredenToplam = devredenler.reduce((t, x) => t + x.devreden, 0);
  const devredenHaritasi = new Map(devredenler.map((x) => [x.daire.id, x.devreden]));

  return (
    <>
      <UstMenu aktif="panel" />

      <main className="mx-auto max-w-6xl p-4 pb-20 sm:pb-4">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{donemEtiketi(donem)}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {daireler.length} aktif daire
              {dikkat > 0 && (
                <>
                  {" · "}
                  <Link
                    href={`/bildirimler?donem=${donem}`}
                    className="font-medium text-slate-900 underline"
                  >
                    {dikkat} daire ilgi bekliyor
                  </Link>
                </>
              )}
            </p>
          </div>
          <div className="flex items-end gap-2">
            <a
              href={`/api/export/csv?yil=${donem.slice(0, 4)}`}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
            >
              {donem.slice(0, 4)} CSV indir
            </a>
            <DonemSecici donem={donem} />
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Ozet baslik="Tahsil edilen" deger={para(tahsilEdilen)} vurgu="emerald" />
          <Ozet baslik="Beklenen toplam" deger={para(beklenenToplam)} />
          <Ozet baslik="Ödeme bekleyen" deger={String(sayac("bekliyor"))} vurgu="amber" />
          <Ozet baslik="Vadesi geçen" deger={String(sayac("gecikti"))} vurgu="red" />
        </div>

        {devredenToplam > 0 && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <strong>Geçmiş dönemlerden devreden borç: {para(devredenToplam)}</strong>
            <span className="text-red-800">
              {" "}
              · {devredenler.length} daire. Bu tutar {donemEtiketi(donem)}{" "}
              faturalarına dahil değildir.
            </span>
          </div>
        )}

        <PanelSekmeleri aktif={filtre} donem={donem} sayilar={sekmeSayilari} />

        {bloklar.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            Henüz blok yok.{" "}
            <Link href="/bloklar" className="font-medium text-slate-900 underline">
              Blok &amp; Daire
            </Link>{" "}
            sayfasından başlayın.
          </p>
        ) : filtre !== "hepsi" && sekmeSayilari[filtre] === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            Bu dönemde bu sekmeye giren daire yok.
          </p>
        ) : (
          <div className="space-y-6">
            {bloklar.map((blok) => {
              const aktifDaireler = blok.units.filter((d) => d.aktif && filtreyeUyuyor(d));
              // Filtre uygulanmışken boş kalan blok başlığını hiç gösterme.
              if (filtre !== "hepsi" && aktifDaireler.length === 0) return null;
              return (
                <section key={blok.id}>
                  <h2 className="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">
                    {blok.ad}
                  </h2>
                  {aktifDaireler.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
                      Bu blokta aktif daire yok.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {aktifDaireler.map((daire) => (
                        <DaireKutusu
                          key={daire.id}
                          daire={daire}
                          donem={donem}
                          bugun={bugun}
                          devreden={devredenHaritasi.get(daire.id) ?? 0}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}

        <Lejant />
      </main>
    </>
  );
}

function Ozet({
  baslik,
  deger,
  vurgu,
}: {
  baslik: string;
  deger: string;
  vurgu?: "emerald" | "amber" | "red";
}) {
  const renk =
    vurgu === "emerald"
      ? "text-emerald-700"
      : vurgu === "amber"
        ? "text-amber-700"
        : vurgu === "red"
          ? "text-red-700"
          : "text-slate-900";

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs text-slate-500">{baslik}</p>
      <p className={"mt-0.5 text-lg font-semibold " + renk}>{deger}</p>
    </div>
  );
}

function DaireKutusu({
  daire,
  donem,
  bugun,
  devreden,
}: {
  daire: DaireKarti;
  donem: string;
  bugun: string;
  /** Seçili dönem dışından birikmiş borç; 0 ise gösterilmez. */
  devreden: number;
}) {
  const durum = durumHesapla(daire.invoice, bugun);

  return (
    <Link
      href={`/daire/${daire.id}?donem=${donem}`}
      className={`relative block rounded-xl border p-4 transition-colors ${durum.kart}`}
    >
      {durum.rozet && (
        <span
          title="Henüz incelemediniz"
          className="absolute top-2 right-2 flex h-2.5 w-2.5"
        >
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-slate-900 opacity-40" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-slate-900" />
        </span>
      )}

      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${durum.nokta}`} />
        <span className="font-semibold">{daire.kapi_no}</span>
      </div>

      <p className="mt-1 truncate text-sm text-slate-600">
        {daire.kiraci_adi ?? <span className="text-slate-400">kiracı girilmedi</span>}
      </p>

      <p className="mt-2 text-sm font-medium">
        {daire.invoice ? para(daire.invoice.toplam) : <span className="text-slate-400">—</span>}
      </p>

      <p className="mt-0.5 text-xs text-slate-500">{durum.etiket}</p>

      {devreden > 0 && (
        <p className="mt-1 text-xs font-medium text-red-700">
          + {para(devreden)} geçmiş borç
        </p>
      )}
    </Link>
  );
}

function Lejant() {
  const ogeler = [
    { renk: "bg-slate-300", etiket: "Fatura girilmedi" },
    { renk: "bg-amber-400", etiket: "Ödeme bekleniyor" },
    { renk: "bg-red-500", etiket: "Vadesi geçti" },
    { renk: "bg-orange-500", etiket: "Tutar uyuşmadı" },
    { renk: "bg-emerald-500", etiket: "Ödendi" },
  ];

  return (
    <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-200 pt-4 text-xs text-slate-500">
      {ogeler.map((o) => (
        <span key={o.etiket} className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${o.renk}`} />
          {o.etiket}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-slate-900" />
        Siyah nokta: dekont geldi, henüz incelemediniz
      </span>
    </div>
  );
}
