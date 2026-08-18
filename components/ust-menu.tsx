import Link from "next/link";
import CikisButonu from "./cikis-butonu";

export default function UstMenu({ aktif }: { aktif?: "panel" | "bloklar" | "ayarlar" }) {
  const baglantilar = [
    { href: "/", etiket: "Panel", anahtar: "panel" as const },
    { href: "/bloklar", etiket: "Blok & Daire", anahtar: "bloklar" as const },
    { href: "/ayarlar", etiket: "Ayarlar", anahtar: "ayarlar" as const },
  ];

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="font-semibold">
          Kira Fatura Takip
        </Link>

        <nav className="flex gap-1 text-sm">
          {baglantilar.map((b) => (
            <Link
              key={b.href}
              href={b.href}
              className={
                "rounded-lg px-3 py-1.5 " +
                (aktif === b.anahtar
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100")
              }
            >
              {b.etiket}
            </Link>
          ))}
        </nav>

        <div className="ml-auto">
          <CikisButonu />
        </div>
      </div>
    </header>
  );
}
