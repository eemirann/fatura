import unittest

from dekont_regex import _kodlama_bozuk_mu, dekont_ayristir

# Gerçek bir Akbank EFT dekontunun (2 sütunlu gönderici/alıcı tablosu ve
# ücret kalemleri) sadeleştirilmiş hâli — satır bazlı (koordinat duyarlı)
# metin çıkarmanın ürettiği biçimle aynı: aynı satırdaki iki sütun değeri
# tek satırda yan yana duruyor (bkz. dekont_regex._pdf_metni).
IKI_SUTUNLU_DEKONT = """DEKONT
EFT BANKALAR ARASI HESABA HAVALE
GONDERICI BILGILERI
ALICI BILGILERI
Duzenleyen Sube
: 7777 - AKBANK DIREKT MOBIL CEP
Borclu Hesap No
: 888-0866-0067708
Alacakli Hesap No
: TR21 0006 4000 0012 2211 3625 14
Adi Soyadi/Unvan
: AYSE ERBAS
Adi Soyadi/Unvan
: Emirhan Erbas
TUTAR BILGILERI
MEVDUAT
18,37  TL
0,00  TL
TOPLAM
18,37 TL
Islem Tarihi/Saati
: 02.09.2026 18:47:04
"""

# Gerçek Akbank dekontunda TOPLAM (18,37 TL), ÜCH (Ücret Hariç: 10,00 TL)
# gönderilen asıl tutara komisyon (7,97 TL) ve BSMV (0,40 TL) eklenmiş hâli
# — 10 + 7,97 + 0,40 = 18,37. Faturaya karşılık gelen gerçek tutar 10 TL'dir.
UCRET_HARIC_DEKONT = """DEKONT
TUTAR BILGILERI
MEVDUAT 18,37 TL 0,00 TL
ÜCH 0,00 TL 10,00 TL
KOMISYON 0,00 TL 7,97 TL
BSMV 0,00 TL 0,40 TL
TOPLAM 18,37 TL
"""

ORNEK_DEKONT = """
Türkiye İş Bankası
EFT/Havale Dekontu

Gönderen: Emirhan Erbaş
Alıcı Adı: Ahmet Yılmaz
Alıcı IBAN: TR33 0006 1005 1978 6457 8413 26

İşlem Tarihi: 02.09.2026
İşlem Tutarı: 1.650,50 TL
İşlem Ücreti: 5,00 TL

Açıklama: Eylül kirası
"""


class DekontAyristirTest(unittest.TestCase):
    def test_temel_alanlar_dogru_cikiyor(self):
        s = dekont_ayristir(ORNEK_DEKONT)
        self.assertTrue(s.okunabilir)
        self.assertEqual(s.tutar, 1650.50)
        self.assertEqual(s.para_birimi, "TRY")
        self.assertEqual(s.tarih, "2026-09-02")
        self.assertEqual(s.alici_iban, "TR330006100519786457841326")
        self.assertEqual(s.alici_ad, "Ahmet Yılmaz")
        self.assertEqual(s.gonderen_ad, "Emirhan Erbaş")
        self.assertEqual(s.banka, "Türkiye İş Bankası")

    def test_islem_ucreti_tutar_olarak_alinmaz(self):
        s = dekont_ayristir(ORNEK_DEKONT)
        self.assertNotEqual(s.tutar, 5.00)

    def test_tutar_yoksa_okunamaz(self):
        s = dekont_ayristir("Bu bir dekont değil, rastgele bir metin.")
        self.assertFalse(s.okunabilir)
        self.assertIsNone(s.tutar)
        self.assertTrue(s.aciklama)

    def test_binlik_ayirici_olmadan_da_dogru_okunur(self):
        s = dekont_ayristir("Tutar: 750,25 TL")
        self.assertEqual(s.tutar, 750.25)

    def test_tam_sayi_tutar_da_okunur(self):
        s = dekont_ayristir("Tutar: 500 TL")
        self.assertEqual(s.tutar, 500.0)

    def test_amir_etiketi_gonderen_olarak_taninir(self):
        s = dekont_ayristir("Amir: Emirhan Erbaş\nTutar: 500 TL")
        self.assertEqual(s.gonderen_ad, "Emirhan Erbaş")

    def test_para_birimi_belirtilmezse_try_varsayilir(self):
        s = dekont_ayristir("Tutar: 500")
        self.assertEqual(s.para_birimi, "TRY")

    def test_usd_tutar_dogru_isaretlenir(self):
        s = dekont_ayristir("Gönderilen Tutar: 100,00 USD")
        self.assertEqual(s.para_birimi, "USD")
        self.assertEqual(s.tutar, 100.0)

    def test_iki_sutunlu_dekontta_toplam_birkac_satir_sonra_bulunur(self):
        s = dekont_ayristir(IKI_SUTUNLU_DEKONT)
        self.assertTrue(s.okunabilir)
        self.assertEqual(s.tutar, 18.37)
        self.assertEqual(s.banka, "Akbank")

    def test_iki_sutunlu_dekontta_ayni_etiket_iki_kez_gecerse_sira_ile_ayristirilir(self):
        s = dekont_ayristir(IKI_SUTUNLU_DEKONT)
        self.assertEqual(s.gonderen_ad, "AYSE ERBAS")
        self.assertEqual(s.alici_ad, "Emirhan Erbas")

    def test_ucret_haric_tutar_toplamdan_once_tercih_edilir(self):
        s = dekont_ayristir(UCRET_HARIC_DEKONT)
        self.assertEqual(s.tutar, 10.0)

    def test_bozuk_font_kodlamasi_tespit_edilir(self):
        bozuk = "G�NDER�C� B�LG�LER�\nAd� Soyad�\n"
        self.assertTrue(_kodlama_bozuk_mu(bozuk))
        self.assertFalse(_kodlama_bozuk_mu(IKI_SUTUNLU_DEKONT))


if __name__ == "__main__":
    unittest.main()
