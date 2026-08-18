import { Suspense } from "react";
import GirisFormu from "./giris-formu";

export default function GirisPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Kira Fatura Takip</h1>
        <p className="mt-1 mb-6 text-sm text-slate-500">Panele giriş yapın.</p>
        <Suspense fallback={null}>
          <GirisFormu />
        </Suspense>
      </div>
    </main>
  );
}
