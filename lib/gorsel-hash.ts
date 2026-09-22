/**
 * dHash (difference hash) karşılaştırması —
 * python-dekont-servisi/dekont_gorsel.py ile aynı sözleşme (64 bit, hex).
 *
 * Amaç: aynı dekontun kırpılmış/yeniden sıkıştırılmış hâlde başka bir
 * fatura için tekrar yüklenmesini, SHA-256'nın (birebir dosya eşleşmesi)
 * yakalayamayacağı durumlarda tespit etmek (bkz. app/api/ingest/route.ts).
 */

/** Bu mesafenin altındaki iki hash "aynı dekont" sayılır (64 bitin ~%10'u). */
export const GORSEL_HASH_ESIK = 6;

/** İki dHash arasındaki Hamming mesafesi (farklı bit sayısı, 0-64). */
export function hammingMesafesi(
  a: string | null | undefined,
  b: string | null | undefined,
): number | null {
  if (!a || !b) return null;
  let x: bigint;
  let y: bigint;
  try {
    x = BigInt("0x" + a);
    y = BigInt("0x" + b);
  } catch {
    return null;
  }
  let fark = x ^ y;
  let sayac = 0;
  while (fark > 0n) {
    sayac += Number(fark & 1n);
    fark >>= 1n;
  }
  return sayac;
}
