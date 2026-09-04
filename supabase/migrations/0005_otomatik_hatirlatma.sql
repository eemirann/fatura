-- Vadesi geçmiş faturalar için otomatik WhatsApp hatırlatması (bkz.
-- app/api/cron/hatirlat). Aynı faturaya art arda hatırlatma gitmesin diye
-- son gönderim zamanı tutulur.
alter table invoices
  add column if not exists son_hatirlatma_at timestamptz;
