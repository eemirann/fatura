import UstMenu from "@/components/ust-menu";
import { ayarlariGetir } from "@/lib/veri.ts";
import { YER_TUTUCULAR } from "@/lib/whatsapp.ts";
import AyarFormu from "./ayar-formu";

export const dynamic = "force-dynamic";

export default async function AyarlarPage() {
  const ayarlar = await ayarlariGetir();

  return (
    <>
      <UstMenu aktif="ayarlar" />
      <main className="mx-auto max-w-3xl p-4 pb-20 sm:pb-4">
        <h1 className="mb-1 text-2xl font-semibold">Ayarlar</h1>
        <p className="mb-6 text-sm text-slate-500">
          Buradaki bilgiler kiracılara gidecek WhatsApp mesajında ve dekont
          sayfasında kullanılır.
        </p>

        <AyarFormu ayarlar={ayarlar} yerTutucular={[...YER_TUTUCULAR]} />

        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <h2 className="mb-2 font-medium text-slate-900">Nasıl çalışıyor?</h2>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>Panelden daireye tıklayıp fatura kalemlerini girersiniz.</li>
            <li>
              &quot;WhatsApp&apos;ta gönder&quot; ile mesaj hazır gelir; siz gönder
              tuşuna basarsınız, daire sarıya döner.
            </li>
            <li>
              Kiracı mesajdaki linkten dekontunu yükler; tutar otomatik okunup
              sizin girdiğiniz tutarla karşılaştırılır.
            </li>
            <li>
              Tutar tutarsa daire yeşile döner ve üzerinde küçük siyah bir nokta
              kalır — dekonta göz atıp &quot;İnceledim&quot; dediğinizde nokta düşer.
            </li>
            <li>Tutar tutmazsa daire turuncu olur ve fark size gösterilir.</li>
          </ol>
        </section>
      </main>
    </>
  );
}
