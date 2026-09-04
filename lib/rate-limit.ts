/**
 * Basit, bellek içi (in-memory) sliding-window rate limiter.
 *
 * Not: Serverless ortamda (Vercel) her instance kendi belleğini tutar; cold
 * start'ta sıfırlanır, bölgeler arası paylaşılmaz. Bu yüzden "organize bir
 * saldırıya karşı sağlam güvenlik duvarı" değil — asıl güvenlik sınırı zaten
 * tahmin edilemez public_token'ın kendisi. Bu sadece tek bir kaynaktan gelen
 * hızlı/otomatik spam'i frenlemek için "son çare" bir katman.
 */
const istekler = new Map<string, number[]>();

/** Aynı anahtar altında biriken eski zaman damgalarını periyodik temizler. */
let sonTemizlik = 0;
function eskileriTemizle(simdi: number) {
  if (simdi - sonTemizlik < 60_000) return;
  sonTemizlik = simdi;
  for (const [anahtar, zamanlar] of istekler) {
    const kalan = zamanlar.filter((t) => simdi - t < 10 * 60_000);
    if (kalan.length === 0) istekler.delete(anahtar);
    else istekler.set(anahtar, kalan);
  }
}

/**
 * `anahtar` için son `pencereMs` içinde `limit`'ten fazla istek varsa false
 * döner (izin yok). Aksi halde bu isteği sayıp true döner.
 */
export function rateLimitIzniVar(anahtar: string, limit: number, pencereMs: number): boolean {
  const simdi = Date.now();
  eskileriTemizle(simdi);

  const zamanlar = (istekler.get(anahtar) ?? []).filter((t) => simdi - t < pencereMs);
  if (zamanlar.length >= limit) {
    istekler.set(anahtar, zamanlar);
    return false;
  }

  zamanlar.push(simdi);
  istekler.set(anahtar, zamanlar);
  return true;
}

/** İstek başlıklarından en olası istemci IP'sini çıkarır (Vercel arkasında). */
export function istekIpAdresi(request: Request): string {
  const ileriIcin = request.headers.get("x-forwarded-for");
  if (ileriIcin) return ileriIcin.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "bilinmeyen";
}
