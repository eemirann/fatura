"""Gerçek ağ çağrısı YAPMAZ — google-genai client'ı mock'lanır."""

import asyncio
import json
import unittest
from unittest import mock

import dekont_gemini


class GeminiIleOkuTest(unittest.IsolatedAsyncioTestCase):
    async def test_anahtar_yoksa_hemen_none_doner_sdk_hic_cagrilmaz(self):
        with mock.patch.object(dekont_gemini, "GOOGLE_AI_API_KEY", None):
            with mock.patch.object(dekont_gemini, "genai") as sahte_genai:
                sonuc = await dekont_gemini.gemini_ile_oku(b"veri", "image/jpeg")
        self.assertIsNone(sonuc)
        sahte_genai.Client.assert_not_called()

    async def test_basarili_yanit_dekontsemasina_eslenir(self):
        yanit_json = json.dumps(
            {
                "okunabilir": True,
                "tutar": 750.0,
                "para_birimi": "TRY",
                "tarih": "2026-09-15",
                "alici_iban": "TR330006100519786457841326",
                "alici_ad": "Ahmet Yılmaz",
                "gonderen_ad": "Emirhan Erbaş",
                "banka": "Akbank",
                "referans_no": "12345",
                "aciklama": "750 TL tutarında işlem tespit edildi.",
            }
        )
        sahte_interaction = mock.Mock()
        sahte_interaction.output_text = yanit_json
        sahte_create = mock.AsyncMock(return_value=sahte_interaction)
        sahte_client = mock.Mock()
        sahte_client.aio.interactions.create = sahte_create

        with mock.patch.object(dekont_gemini, "GOOGLE_AI_API_KEY", "sahte-anahtar"):
            with mock.patch.object(dekont_gemini.genai, "Client", return_value=sahte_client):
                sonuc = await dekont_gemini.gemini_ile_oku(b"veri", "image/jpeg")

        self.assertIsNotNone(sonuc)
        self.assertTrue(sonuc.okunabilir)
        self.assertEqual(sonuc.tutar, 750.0)
        self.assertEqual(sonuc.alici_iban, "TR330006100519786457841326")
        self.assertIn("Google Gemini ile okundu", sonuc.aciklama)
        sahte_create.assert_awaited_once()
        _, kwargs = sahte_create.call_args
        self.assertEqual(kwargs["model"], dekont_gemini.GOOGLE_AI_MODEL)
        self.assertEqual(kwargs["response_format"]["type"], "text")

    async def test_pdf_icin_dogru_icerik_turu_gonderilir(self):
        sahte_interaction = mock.Mock()
        sahte_interaction.output_text = json.dumps(
            {"okunabilir": False, "aciklama": "boş"}
        )
        sahte_create = mock.AsyncMock(return_value=sahte_interaction)
        sahte_client = mock.Mock()
        sahte_client.aio.interactions.create = sahte_create

        with mock.patch.object(dekont_gemini, "GOOGLE_AI_API_KEY", "sahte-anahtar"):
            with mock.patch.object(dekont_gemini.genai, "Client", return_value=sahte_client):
                await dekont_gemini.gemini_ile_oku(b"%PDF-veri", "application/pdf")

        _, kwargs = sahte_create.call_args
        dosya_blogu = kwargs["input"][1]
        self.assertEqual(dosya_blogu["type"], "document")
        self.assertEqual(dosya_blogu["mime_type"], "application/pdf")

    async def test_sdk_hata_firlatirsa_none_doner(self):
        sahte_client = mock.Mock()
        sahte_client.aio.interactions.create = mock.AsyncMock(
            side_effect=RuntimeError("quota doldu")
        )
        with mock.patch.object(dekont_gemini, "GOOGLE_AI_API_KEY", "sahte-anahtar"):
            with mock.patch.object(dekont_gemini.genai, "Client", return_value=sahte_client):
                sonuc = await dekont_gemini.gemini_ile_oku(b"veri", "image/jpeg")
        self.assertIsNone(sonuc)

    async def test_gecersiz_json_yanitinda_none_doner(self):
        sahte_interaction = mock.Mock()
        sahte_interaction.output_text = "bu gecerli bir json degil"
        sahte_client = mock.Mock()
        sahte_client.aio.interactions.create = mock.AsyncMock(return_value=sahte_interaction)

        with mock.patch.object(dekont_gemini, "GOOGLE_AI_API_KEY", "sahte-anahtar"):
            with mock.patch.object(dekont_gemini.genai, "Client", return_value=sahte_client):
                sonuc = await dekont_gemini.gemini_ile_oku(b"veri", "image/jpeg")
        self.assertIsNone(sonuc)

    async def test_zaman_asiminda_none_doner(self):
        async def yavas_cagri(*args, **kwargs):
            await asyncio.sleep(999)

        sahte_client = mock.Mock()
        sahte_client.aio.interactions.create = mock.AsyncMock(side_effect=yavas_cagri)

        with mock.patch.object(dekont_gemini, "GOOGLE_AI_API_KEY", "sahte-anahtar"):
            with mock.patch.object(dekont_gemini, "ZAMAN_ASIMI_SANIYE", 0.05):
                with mock.patch.object(dekont_gemini.genai, "Client", return_value=sahte_client):
                    sonuc = await dekont_gemini.gemini_ile_oku(b"veri", "image/jpeg")
        self.assertIsNone(sonuc)


class GirdiTuruTest(unittest.TestCase):
    def test_pdf_document_olarak_isaretlenir(self):
        self.assertEqual(dekont_gemini._girdi_turu("application/pdf"), "document")

    def test_gorsel_image_olarak_isaretlenir(self):
        self.assertEqual(dekont_gemini._girdi_turu("image/jpeg"), "image")
        self.assertEqual(dekont_gemini._girdi_turu("image/png"), "image")


if __name__ == "__main__":
    unittest.main()
