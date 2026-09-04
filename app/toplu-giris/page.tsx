import UstMenu from "@/components/ust-menu";
import { getServerSupabase } from "@/lib/supabase/server";
import { kullaniciRolu } from "@/lib/supabase/rol";
import { donemAnahtari } from "@/lib/format";
import type { Block, Unit } from "@/lib/types";
import TopluGirisFormu from "./toplu-giris-formu";

export const dynamic = "force-dynamic";

export default async function TopluGirisPage() {
  const rol = await kullaniciRolu();
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("blocks")
    .select("*, units(*)")
    .order("sira", { ascending: true });

  if (error) throw new Error(error.message);

  const bloklar = ((data ?? []) as (Block & { units: Unit[] })[]).map((b) => ({
    ...b,
    units: (b.units ?? [])
      .filter((u) => u.aktif)
      .sort((x, y) => x.sira - y.sira || x.kapi_no.localeCompare(y.kapi_no, "tr")),
  }));

  return (
    <>
      <UstMenu aktif="toplu-giris" />
      <main className="mx-auto max-w-3xl p-4 pb-20 sm:pb-4">
        <h1 className="mb-1 text-2xl font-semibold">Toplu Giriş</h1>
        <p className="mb-6 text-sm text-slate-500">
          Aidat gibi çoğu dairede aynı olan bir kalemi tek seferde birden fazla
          daireye uygulayın. Dairenin kendi kalemleri (su, elektrik gibi) etkilenmez.
        </p>
        {rol === "yonetici" ? (
          <TopluGirisFormu bloklar={bloklar} donemVarsayilan={donemAnahtari()} />
        ) : (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            Görüntüleyici rolündesiniz — toplu giriş yapmak için yönetici
            yetkisi gerekir.
          </p>
        )}
      </main>
    </>
  );
}
