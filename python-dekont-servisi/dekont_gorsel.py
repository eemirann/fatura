"""Dekont görselinden dHash (difference hash) çıkarır.

Amaç: aynı dekontun kırpılmış/yeniden sıkıştırılmış hâlde tekrar
yüklenmesini SHA-256'nın (birebir dosya eşleşmesi) yakalayamayacağı
durumlarda tespit etmek (bkz. app/api/ingest/route.ts).

Not: burada ayrıca bir "Error Level Analysis" (ELA) sahtecilik sinyali de
denendi, ancak basit global/bölgesel fark eşiklemesi sentetik test
görüntülerinde düzenlenmiş ve düzenlenmemiş görselleri güvenilir biçimde
ayıramadı (bazı senaryolarda düzenlenmiş görüntü DAHA DÜŞÜK fark skoru
üretti). Yanlış bir "şüpheli" damgası, hiç damga olmamasından daha kötü —
bu yüzden ELA kasıtlı olarak eklenmedi.
"""

import io
from typing import Optional

import pymupdf as fitz
from PIL import Image

DHASH_BOYUT = 8  # 8x8 -> 64 bit hash


def _gorsel_al(icerik: bytes, mime: str) -> Optional[Image.Image]:
    """Hashleme için dekontun görsel karşılığını döner.

    PDF ise ilk sayfa sabit DPI'da rasterize edilir (OCR'daki gibi);
    görsel formatlarda doğrudan açılır. Bozuk dosyada None döner — çağıran
    taraf bunu "sinyal üretilemedi" olarak ele alır, hata fırlatmaz.
    """
    try:
        if mime == "application/pdf":
            with fitz.open(stream=icerik, filetype="pdf") as belge:
                if belge.page_count == 0:
                    return None
                pix = belge[0].get_pixmap(dpi=150)
                return Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
        return Image.open(io.BytesIO(icerik)).convert("RGB")
    except Exception:
        return None


def gorsel_hash_hesapla(icerik: bytes, mime: str) -> Optional[str]:
    """dHash: 9x8 gri tonlamaya küçültülüp bitişik piksel farkları 64 bitlik
    bir imzaya çevrilir. Küçük kırpma/yeniden sıkıştırma farklarına
    dayanıklıdır — iki hash'in Hamming mesafesi küçükse aynı dekont
    olduğu varsayılır (bkz. app/api/ingest/route.ts).
    """
    gorsel = _gorsel_al(icerik, mime)
    if gorsel is None:
        return None
    try:
        kucuk = gorsel.convert("L").resize(
            (DHASH_BOYUT + 1, DHASH_BOYUT), Image.Resampling.LANCZOS
        )
        piksel = kucuk.load()
        bitler = []
        for y in range(DHASH_BOYUT):
            for x in range(DHASH_BOYUT):
                bitler.append("1" if piksel[x, y] > piksel[x + 1, y] else "0")
        return format(int("".join(bitler), 2), "016x")
    except Exception:
        return None


def hash_mesafesi(a: str, b: str) -> Optional[int]:
    """İki dHash arasındaki Hamming mesafesi (farklı bit sayısı, 0-64)."""
    try:
        return bin(int(a, 16) ^ int(b, 16)).count("1")
    except (ValueError, TypeError):
        return None
