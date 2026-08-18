"use client";

export default function Hata({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6">
        <h1 className="text-lg font-semibold">Bir şeyler ters gitti</h1>
        <p className="mt-2 text-sm text-slate-600">
          Sayfa yüklenirken hata oluştu. Supabase şeması kurulu değilse veya
          ortam değişkenleri eksikse bu hatayı görürsünüz — README&apos;deki
          kurulum adımlarını kontrol edin.
        </p>
        <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          {error.message}
        </pre>
        <button
          onClick={reset}
          className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Tekrar dene
        </button>
      </div>
    </main>
  );
}
