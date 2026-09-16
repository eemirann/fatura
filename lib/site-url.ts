/**
 * Panelin kendi genel adresi (kiracıya giden dekont linki ve Supabase davet
 * yönlendirmesi buradan üretilir).
 *
 * Neden `NEXT_PUBLIC_` değil: Next, `NEXT_PUBLIC_*` değişkenlerini derleme
 * anında paketin içine gömüyor — sunucu tarafındaki kullanımlarda bile. Bu da
 * adresi çalışma anında değiştirmeyi imkânsız kılıyor, yani her müşteri için
 * ayrı bir imaj derlemek gerekirdi. Öneksiz `SITE_URL` çalışma anında okunur;
 * tek imaj, müşteri başına farklı ortam değişkeniyle çalışır.
 *
 * `NEXT_PUBLIC_SITE_URL` geriye dönük uyumluluk için hâlâ kabul ediliyor
 * (mevcut Vercel kurulumları ve eski .env.local dosyaları bozulmasın diye).
 */
export function siteUrl(): string {
  const ham = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  return ham.replace(/\/+$/, "");
}
