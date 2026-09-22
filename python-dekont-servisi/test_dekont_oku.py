"""dekont_oku()'nun regex -> Gemini fallback orkestrasyonunu test eder.

gemini_ile_oku gerçekten çağrılmaz (mock'lanır) — network/anahtar gerektirmez.
"""

import unittest
from unittest import mock

import dekont_oku
from sema import DekontSemasi


def _regex_basarili(tutar: float = 100.0) -> DekontSemasi:
    return DekontSemasi(
        okunabilir=True,
        tutar=tutar,
        para_birimi="TRY",
        tarih="2026-09-01",
        alici_iban=None,
        alici_ad=None,
        gonderen_ad=None,
        banka=None,
        aciklama="ok",
    )


def _regex_basarisiz() -> DekontSemasi:
    return DekontSemasi(
        okunabilir=False,
        tutar=None,
        para_birimi=None,
        tarih=None,
        alici_iban=None,
        alici_ad=None,
        gonderen_ad=None,
        banka=None,
        aciklama="Metinde bir tutar bulunamadı.",
    )


class DekontOkuTest(unittest.IsolatedAsyncioTestCase):
    async def test_regex_basariliysa_ai_hic_cagrilmaz(self):
        with (
            mock.patch.object(dekont_oku, "metin_cikar", return_value="DEKONT\nTutar: 100,00 TL"),
            mock.patch.object(dekont_oku, "dekont_ayristir", return_value=_regex_basarili()),
            mock.patch.object(dekont_oku, "gemini_ile_oku", new=mock.AsyncMock()) as ai_mock,
            mock.patch.object(dekont_oku, "gorsel_hash_hesapla", return_value=None),
        ):
            sonuc = await dekont_oku.dekont_oku(b"veri", "image/jpeg")

        self.assertTrue(sonuc.okunabilir)
        ai_mock.assert_not_awaited()

    async def test_regex_basarisizsa_ai_denenir_basarili_sonuc_kullanilir(self):
        ai_sonuc = _regex_basarili(tutar=250.0)
        with (
            mock.patch.object(dekont_oku, "metin_cikar", return_value="alakasız metin"),
            mock.patch.object(dekont_oku, "dekont_ayristir", return_value=_regex_basarisiz()),
            mock.patch.object(
                dekont_oku, "gemini_ile_oku", new=mock.AsyncMock(return_value=ai_sonuc)
            ) as ai_mock,
            mock.patch.object(dekont_oku, "gorsel_hash_hesapla", return_value="deadbeef"),
        ):
            sonuc = await dekont_oku.dekont_oku(b"veri", "image/jpeg")

        ai_mock.assert_awaited_once()
        self.assertTrue(sonuc.okunabilir)
        self.assertEqual(sonuc.tutar, 250.0)
        # gorsel_hash AI'nin sonucundan bağımsız, koşulsuz hesaplanmalı.
        self.assertEqual(sonuc.gorsel_hash, "deadbeef")

    async def test_regex_ve_ai_ikisi_de_basarisizsa_regex_sonucu_korunur(self):
        regex_sonuc = _regex_basarisiz()
        with (
            mock.patch.object(dekont_oku, "metin_cikar", return_value="alakasız metin"),
            mock.patch.object(dekont_oku, "dekont_ayristir", return_value=regex_sonuc),
            mock.patch.object(
                dekont_oku, "gemini_ile_oku", new=mock.AsyncMock(return_value=None)
            ) as ai_mock,
            mock.patch.object(dekont_oku, "gorsel_hash_hesapla", return_value=None),
        ):
            sonuc = await dekont_oku.dekont_oku(b"veri", "image/jpeg")

        ai_mock.assert_awaited_once()
        self.assertFalse(sonuc.okunabilir)
        self.assertEqual(sonuc.aciklama, regex_sonuc.aciklama)

    async def test_metin_cikar_patlarsa_ai_yine_denenir(self):
        with (
            mock.patch.object(dekont_oku, "metin_cikar", side_effect=RuntimeError("tesseract yok")),
            mock.patch.object(
                dekont_oku, "gemini_ile_oku", new=mock.AsyncMock(return_value=None)
            ) as ai_mock,
            mock.patch.object(dekont_oku, "gorsel_hash_hesapla", return_value=None),
        ):
            sonuc = await dekont_oku.dekont_oku(b"veri", "image/jpeg")

        ai_mock.assert_awaited_once()
        self.assertFalse(sonuc.okunabilir)

    async def test_metin_cikar_patlar_ai_kurtarirsa_ai_sonucu_kullanilir(self):
        ai_sonuc = _regex_basarili(tutar=42.0)
        with (
            mock.patch.object(dekont_oku, "metin_cikar", side_effect=RuntimeError("tesseract yok")),
            mock.patch.object(
                dekont_oku, "gemini_ile_oku", new=mock.AsyncMock(return_value=ai_sonuc)
            ),
            mock.patch.object(dekont_oku, "gorsel_hash_hesapla", return_value=None),
        ):
            sonuc = await dekont_oku.dekont_oku(b"veri", "image/jpeg")

        self.assertTrue(sonuc.okunabilir)
        self.assertEqual(sonuc.tutar, 42.0)


if __name__ == "__main__":
    unittest.main()
