export type InvoiceDurum = "taslak" | "gonderildi" | "odendi" | "uyusmadi";
export type ReceiptKaynak = "kiraci_link" | "panel" | "api";
export type ReceiptEslesme = "matched" | "mismatch" | "unreadable";

export type Settings = {
  id: boolean;
  iban: string;
  hesap_sahibi: string;
  varsayilan_son_odeme_gunu: number;
  mesaj_sablonu: string;
  updated_at: string;
};

export type Block = {
  id: string;
  ad: string;
  sira: number;
  created_at: string;
};

export type Unit = {
  id: string;
  block_id: string;
  kapi_no: string;
  kiraci_adi: string | null;
  kiraci_telefon: string | null;
  notlar: string | null;
  aktif: boolean;
  sira: number;
  created_at: string;
};

export type InvoiceItem = {
  id: string;
  invoice_id: string;
  baslik: string;
  tutar: number;
  sira: number;
};

export type Invoice = {
  id: string;
  unit_id: string;
  /** İlgili ayın 1'i, YYYY-MM-DD */
  donem: string;
  son_odeme_tarihi: string;
  toplam: number;
  durum: InvoiceDurum;
  public_token: string;
  gonderildi_at: string | null;
  incelendi_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Receipt = {
  id: string;
  invoice_id: string;
  dosya_yolu: string;
  dosya_adi: string | null;
  mime: string;
  boyut: number | null;
  kaynak: ReceiptKaynak;
  eslesme: ReceiptEslesme;
  okunan_tutar: number | null;
  okunan_tarih: string | null;
  okunan_iban: string | null;
  okunan_alici: string | null;
  okunan_gonderen: string | null;
  okunan_banka: string | null;
  aciklama: string | null;
  ham_json: unknown;
  created_at: string;
};

/** Panelde bir daireyi tek kart olarak çizmek için gereken birleşik veri. */
export type UnitWithInvoice = Unit & {
  invoice: (Invoice & { items: InvoiceItem[]; receipts: Receipt[] }) | null;
};
