import Link from "next/link";
import type { PanelGrubu } from "@/lib/durum";

/** URL'de ?filtre= ile taşınan sekme değeri. "hepsi" varsayılan. */
export type PanelFiltresi = PanelGrubu | "hepsi";

const SEKMELER: { deger: PanelFiltresi; etiket: string }[] = [
  { deger: "hepsi", etiket: "Tümü" },
  { deger: "odeyen", etiket: "Ödeyenler" },
  { deger: "odemeyen", etiket: "Ödemeyenler" },
  { deger: "faturasiz", etiket: "Faturasız" },
];

/**
 * Panelin ödeyen/ödemeyen ayrımı. Filtre URL'de tutuluyor (DonemSecici'nin
 * ?donem= kalıbıyla aynı): sunucuda render edilir, istemci state'i gerekmez,
 * link paylaşılabilir ve yenilemede kaybolmaz. Bu yüzden "use client" yok —
 * sade <Link>'ler yeterli.
 */
export default function PanelSekmeleri({
  aktif,
  donem,
  sayilar,
}: {
  aktif: PanelFiltresi;
  donem: string;
  /** Filtre uygulanmadan önceki sayımlar — sekme değişince sabit kalmalı. */
  sayilar: Record<PanelFiltresi, number>;
}) {
  function adres(deger: PanelFiltresi): string {
    const p = new URLSearchParams();
    if (donem) p.set("donem", donem);
    if (deger !== "hepsi") p.set("filtre", deger);
    const q = p.toString();
    return q ? `/?${q}` : "/";
  }

  return (
    <div
      role="tablist"
      aria-label="Ödeme durumuna göre filtrele"
      className="mb-4 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1"
    >
      {SEKMELER.map((s) => {
        const secili = s.deger === aktif;
        return (
          <Link
            key={s.deger}
            href={adres(s.deger)}
            role="tab"
            aria-selected={secili}
            className={
              "flex min-h-11 items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors sm:min-h-0 " +
              (secili
                ? "bg-slate-900 font-medium text-white"
                : "text-slate-600 hover:bg-slate-100")
            }
          >
            {s.etiket}
            <span
              className={
                "rounded-md px-1.5 py-0.5 text-xs tabular-nums " +
                (secili ? "bg-white/20" : "bg-slate-100 text-slate-500")
              }
            >
              {sayilar[s.deger]}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
