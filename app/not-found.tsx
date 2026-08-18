import Link from "next/link";

export default function Bulunamadi() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center">
        <h1 className="text-lg font-semibold">Sayfa bulunamadı</h1>
        <p className="mt-2 text-sm text-slate-600">
          Aradığınız sayfa yok ya da bağlantı geçersiz.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Panele dön
        </Link>
      </div>
    </main>
  );
}
