import UstMenu from "@/components/ust-menu";
import { kasaVerisi } from "@/lib/veri";
import { kullaniciRolu } from "@/lib/supabase/rol.ts";
import { isoGun, para } from "@/lib/format";
import GiderYonetimi from "./gider-yonetimi";

export const dynamic = "force-dynamic";

export default async function GiderlerPage() {
  const [{ ozet, giderler }, rol] = await Promise.all([
    kasaVerisi(),
    kullaniciRolu(),
  ]);
  const saltOkunur = rol !== "yonetici";

  return (
    <>
      <UstMenu aktif="giderler" />

      <main className="mx-auto max-w-4xl p-4 pb-20 sm:pb-4">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Gider &amp; Kasa</h1>
          <p className="mt-1 text-sm text-slate-500">
            Apartmanın tüm zamanlarına ait tahsilat ve harcama özeti. Kasa
            bakiyesi saklanmaz, her seferinde faturalardan ve giderlerden
            hesaplanır.
          </p>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Kutu baslik="Toplam tahsilat" deger={para(ozet.tahsilat)} renk="emerald" />
          <Kutu baslik="Toplam gider" deger={para(ozet.gider)} renk="red" />
          <Kutu
            baslik="Kasa bakiyesi"
            deger={para(ozet.bakiye)}
            renk={ozet.bakiye < 0 ? "red" : "slate"}
            vurgulu
          />
        </div>

        {ozet.bakiye < 0 && (
          <p className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            Kasa açık veriyor: giderler tahsil edilenden {para(-ozet.bakiye)} fazla.
          </p>
        )}

        <GiderYonetimi
          giderler={giderler}
          bugun={isoGun()}
          saltOkunur={saltOkunur}
        />
      </main>
    </>
  );
}

function Kutu({
  baslik,
  deger,
  renk,
  vurgulu = false,
}: {
  baslik: string;
  deger: string;
  renk: "emerald" | "red" | "slate";
  vurgulu?: boolean;
}) {
  const yazi =
    renk === "emerald"
      ? "text-emerald-700"
      : renk === "red"
        ? "text-red-700"
        : "text-slate-900";

  return (
    <div
      className={`rounded-xl border bg-white px-4 py-3 ${
        vurgulu ? "border-slate-900" : "border-slate-200"
      }`}
    >
      <p className="text-xs text-slate-500">{baslik}</p>
      <p className={`mt-0.5 text-xl font-semibold ${yazi}`}>{deger}</p>
    </div>
  );
}
