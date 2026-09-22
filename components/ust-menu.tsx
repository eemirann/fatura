import Link from "next/link";
import CikisButonu from "./cikis-butonu";

type Sekme = "panel" | "bloklar" | "toplu-giris" | "bildirimler" | "ayarlar";

const SEKMELER: { href: string; etiket: string; ikon: string; anahtar: Sekme }[] = [
  { href: "/", etiket: "Panel", ikon: "📋", anahtar: "panel" },
  { href: "/bloklar", etiket: "Blok & Daire", ikon: "🏢", anahtar: "bloklar" },
  { href: "/toplu-giris", etiket: "Toplu Giriş", ikon: "➕", anahtar: "toplu-giris" },
  { href: "/bildirimler", etiket: "Bildirimler", ikon: "🔔", anahtar: "bildirimler" },
  { href: "/ayarlar", etiket: "Ayarlar", ikon: "⚙️", anahtar: "ayarlar" },
];

/**
 * Üstte sadece başlık + çıkış (mobilde sekmeler sığmıyor); masaüstünde
 * ayrıca yatay menü. Mobilde onun yerine ekranın altında sabit bir sekme
 * çubuğu — telefonda gerçek bir uygulama gibi hissettirmesi için.
 */
export default function UstMenu({ aktif }: { aktif?: Sekme }) {
  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="font-semibold">
            Kira Fatura Takip
          </Link>

          <nav className="hidden gap-1 text-sm sm:flex">
            {SEKMELER.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className={
                  "rounded-lg px-3 py-1.5 " +
                  (aktif === s.anahtar
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100")
                }
              >
                {s.etiket}
              </Link>
            ))}
          </nav>

          <div className="ml-auto">
            <CikisButonu />
          </div>
        </div>
      </header>

      <nav
        className="fixed inset-x-0 bottom-0 z-10 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden"
        aria-label="Ana gezinme"
      >
        {SEKMELER.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className={
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] " +
              (aktif === s.anahtar ? "text-slate-900" : "text-slate-400")
            }
          >
            <span className="text-lg leading-none">{s.ikon}</span>
            {s.etiket}
          </Link>
        ))}
      </nav>
    </>
  );
}
