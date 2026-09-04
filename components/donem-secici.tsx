"use client";

import { useRouter } from "next/navigation";
import { donemAnahtari, donemEtiketi, donemKaydir } from "@/lib/format";

/**
 * Ay bazlı dönem gezinmesi. Dönem URL'de (?donem=YYYY-MM-01) tutulur, böylece
 * geçmiş bir ayın paneli paylaşılabilir ve yenilemede kaybolmaz.
 */
export default function DonemSecici({
  donem,
  taban = "/",
}: {
  donem: string;
  /** Hangi sayfada gezinileceği — panel dışında (ör. /bildirimler) kullanmak için. */
  taban?: string;
}) {
  const router = useRouter();
  const buAy = donemAnahtari();

  function git(hedef: string) {
    router.push(hedef === buAy ? taban : `${taban}?donem=${hedef}`);
  }

  return (
    <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
      <button
        onClick={() => git(donemKaydir(donem, -1))}
        aria-label="Önceki ay"
        className="rounded-lg min-h-11 min-w-11 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 sm:min-h-0 sm:min-w-0"
      >
        ‹
      </button>

      <span className="min-w-36 text-center text-sm font-medium">
        {donemEtiketi(donem)}
      </span>

      <button
        onClick={() => git(donemKaydir(donem, 1))}
        aria-label="Sonraki ay"
        className="rounded-lg min-h-11 min-w-11 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 sm:min-h-0 sm:min-w-0"
      >
        ›
      </button>

      {donem !== buAy && (
        <button
          onClick={() => git(buAy)}
          className="ml-1 rounded-lg px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-100"
        >
          Bu ay
        </button>
      )}
    </div>
  );
}
