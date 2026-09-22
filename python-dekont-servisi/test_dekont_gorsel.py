import io
import unittest

from PIL import Image

from dekont_gorsel import gorsel_hash_hesapla, hash_mesafesi


def _jpeg_bytes(img: Image.Image, quality: int = 95) -> bytes:
    tampon = io.BytesIO()
    img.convert("RGB").save(tampon, "JPEG", quality=quality)
    return tampon.getvalue()


def _desenli_gorsel(boyut=(200, 200)) -> Image.Image:
    """Düz bir renk yerine desenli görsel: dHash düz renklerde her zaman
    aynı (0 farklı) çıkar, gerçek bir dekonttaki gibi kenar/metin içeren
    bir görseli simüle etmek için basit bir gradyan kullanılıyor."""
    img = Image.new("RGB", boyut)
    piksel = img.load()
    for x in range(boyut[0]):
        for y in range(boyut[1]):
            piksel[x, y] = ((x * 7) % 256, (y * 3) % 256, ((x + y) * 5) % 256)
    return img


class GorselHashTest(unittest.TestCase):
    def test_ayni_goruntu_ayni_hash_uretir(self):
        img = _desenli_gorsel()
        h1 = gorsel_hash_hesapla(_jpeg_bytes(img), "image/jpeg")
        h2 = gorsel_hash_hesapla(_jpeg_bytes(img), "image/jpeg")
        self.assertIsNotNone(h1)
        self.assertEqual(h1, h2)

    def test_yeniden_sikistirilmis_goruntu_yakin_hash_uretir(self):
        """Aynı dekontun farklı bir kalitede kaydedilmiş hâli — birebir aynı
        dosya değil ama görsel olarak aynı. SHA-256 bunu yakalayamaz,
        dHash'in Hamming mesafesi küçük kalmalı."""
        img = _desenli_gorsel()
        h1 = gorsel_hash_hesapla(_jpeg_bytes(img, quality=95), "image/jpeg")
        h2 = gorsel_hash_hesapla(_jpeg_bytes(img, quality=40), "image/jpeg")
        mesafe = hash_mesafesi(h1, h2)
        self.assertIsNotNone(mesafe)
        self.assertLess(mesafe, 6)

    def test_farkli_goruntuler_uzak_hash_uretir(self):
        img1 = _desenli_gorsel()
        img2 = Image.new("RGB", (200, 200), (255, 255, 255))
        h1 = gorsel_hash_hesapla(_jpeg_bytes(img1), "image/jpeg")
        h2 = gorsel_hash_hesapla(_jpeg_bytes(img2), "image/jpeg")
        mesafe = hash_mesafesi(h1, h2)
        self.assertIsNotNone(mesafe)
        self.assertGreater(mesafe, 6)

    def test_bozuk_dosyada_none_doner(self):
        self.assertIsNone(gorsel_hash_hesapla(b"gecersiz veri", "image/jpeg"))

    def test_pdf_mimesinde_de_calisir(self):
        # Gerçek bir PDF üretmeden dekont_gorsel'in PDF dalını test etmek
        # zor; burada yalnızca bozuk "PDF" ile zarifçe None döndüğünü
        # doğruluyoruz (gerçek PDF akışı test_dekont_regex'teki PyMuPDF
        # bağımlılığıyla dolaylı olarak zaten kapsanıyor).
        self.assertIsNone(gorsel_hash_hesapla(b"gecersiz pdf", "application/pdf"))


class HashMesafesiTest(unittest.TestCase):
    def test_ayni_hash_sifir_mesafe(self):
        self.assertEqual(hash_mesafesi("abcd1234", "abcd1234"), 0)

    def test_gecersiz_hashte_none_doner(self):
        self.assertIsNone(hash_mesafesi("gecersiz", "abcd1234"))
        self.assertIsNone(hash_mesafesi(None, "abcd1234"))


if __name__ == "__main__":
    unittest.main()
