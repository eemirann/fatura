-- Ödenmemiş borcun bir sonraki aya devri.
--
-- Sorun: her ay bağımsız bir faturaydı. Eylül ödenmediyse Ekim faturası
-- Eylül'den habersiz açılıyor, kiracıya iki ayrı link gidiyor ve yönetici iki
-- ayrı kırmızı kart takip etmek zorunda kalıyordu.
--
-- Çözüm: yönetici "Devret" dediğinde Eylül'ün ödenmemiş kalanı Ekim
-- faturasına bir kalem olarak eklenir ve Eylül faturası DEVREDİLDİ olarak
-- kapanır.
--
-- Eski faturanın kapanması şart, süs değil: aksi hâlde borç iki yerde birden
-- durur. Kiracı eski linkten ödediğinde hem Eylül kapanır hem Ekim'deki devir
-- kalemi yerinde kalır ve aynı para iki kez tahsil edilmiş görünür.
--
-- Fatura silinmiyor, yalnızca damgalanıyor: geçmiş ve dekontları duruyor.

alter table invoices
  add column if not exists devredildi_at timestamptz;

-- Hangi döneme devredildiği — panelde "Ekim 2026'ya devredildi" diyebilmek
-- ve bir sorun olursa izi sürebilmek için.
alter table invoices
  add column if not exists devredilen_donem date;

-- Açık borç sorguları artık "durum + devredilmemiş" üzerinden gidiyor.
create index if not exists invoices_acik_idx
  on invoices (unit_id, durum)
  where devredildi_at is null;
