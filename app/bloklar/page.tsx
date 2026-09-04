import UstMenu from "@/components/ust-menu";
import { getServerSupabase } from "@/lib/supabase/server";
import type { Block, Unit } from "@/lib/types";
import BlokYonetimi from "./blok-yonetimi";

export const dynamic = "force-dynamic";

export default async function BloklarPage() {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("blocks")
    .select("*, units(*)")
    .order("sira", { ascending: true });

  if (error) throw new Error(error.message);

  const bloklar = ((data ?? []) as (Block & { units: Unit[] })[]).map((b) => ({
    ...b,
    units: (b.units ?? []).sort(
      (x, y) => x.sira - y.sira || x.kapi_no.localeCompare(y.kapi_no, "tr"),
    ),
  }));

  return (
    <>
      <UstMenu aktif="bloklar" />
      <main className="mx-auto max-w-6xl p-4 pb-20 sm:pb-4">
        <h1 className="mb-1 text-2xl font-semibold">Blok &amp; Daire</h1>
        <p className="mb-6 text-sm text-slate-500">
          Blokları ve daireleri buradan yönetin. Kiracı adı ve telefonu WhatsApp
          mesajında kullanılır.
        </p>
        <BlokYonetimi bloklar={bloklar} />
      </main>
    </>
  );
}
