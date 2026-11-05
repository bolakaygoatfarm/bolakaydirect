-- BOLAKAY DIRECT · демо-данные (цены и тексты — черновые, замените в админке)
update public.settings set support_phone = '+998900000000';

insert into public.fridges (code, name, address_uz, address_ru, landmark_uz, landmark_ru, lat, lng, open_time, close_time)
values ('tinchlik-01', 'Tinchlik-01',
 'Toshkent, Tinchlik metro bekati yonida', 'Ташкент, рядом со станцией метро Тинчлик',
 'Metrodan chiqishda, hamkor do''kon ichida', 'У выхода из метро, внутри магазина-партнёра',
 41.3229, 69.2167, '08:00', '21:00');

insert into public.products (slug, category, name_uz, name_ru, description_uz, description_ru, composition_uz, composition_ru, storage_uz, storage_ru, size_label, net_amount, net_unit, price, sell_days, sort) values
('echki-suti-1l','milk','Echki suti','Козье молоко','BOLAKAY fermasidan yangi sog‘ilgan, pasterizatsiyalangan echki suti.','Пастеризованное козье молоко с фермы BOLAKAY, надоенное в день производства.','Pasterizatsiyalangan echki suti 100%','Козье молоко пастеризованное 100%','+2…+6 °C da saqlang. Ochilgandan keyin 24 soat ichida iste’mol qiling.','Хранить при +2…+6 °C. После вскрытия употребить в течение 24 часов.','1 l',1000,'ml',30000,2,10),
('echki-suti-05l','milk','Echki suti','Козье молоко','Kichik qadoqdagi echki suti — bir kunlik ehtiyoj uchun.','Козье молоко в малой упаковке — на один день.','Pasterizatsiyalangan echki suti 100%','Козье молоко пастеризованное 100%','+2…+6 °C da saqlang.','Хранить при +2…+6 °C.','0,5 l',500,'ml',16000,2,11),
('tabiiy-yogurt','yogurt','Tabiiy yogurt','Натуральный йогурт','Echki sutidan tirik zakvaska bilan tayyorlangan, shakarsiz.','Йогурт из козьего молока на живой закваске, без сахара.','Echki suti, yogurt zakvaskasi','Козье молоко, йогуртовая закваска','+2…+6 °C da saqlang.','Хранить при +2…+6 °C.','400 g',400,'g',25000,5,20),
('echki-sariyogi','butter','Echki suti sariyog‘i','Козье сливочное масло','Echki qaymog‘idan qo‘lda tayyorlangan sariyog‘.','Сливочное масло из козьих сливок, ручная работа.','Echki qaymog‘i','Сливки козьи','+2…+6 °C da saqlang.','Хранить при +2…+6 °C.','200 g',200,'g',45000,14,30),
('kapuchino','drinks','Kapuchino (sovuq)','Капучино (холодный)','Echki suti bilan tayyor sovuq kapuchino, yopiq shishada.','Готовый холодный капучино на козьем молоке в закрытой бутылке.','Echki suti, arabika qahvasi, shakar','Козье молоко, кофе арабика, сахар','+2…+6 °C da saqlang. Iste’moldan oldin chayqating.','Хранить при +2…+6 °C. Перед употреблением взболтать.','250 ml',250,'ml',22000,3,40),
('latte','drinks','Latte (sovuq)','Латте (холодный)','Yumshoq ta’mli sovuq latte, echki sutida.','Мягкий холодный латте на козьем молоке.','Echki suti, arabika qahvasi','Козье молоко, кофе арабика','+2…+6 °C da saqlang.','Хранить при +2…+6 °C.','250 ml',250,'ml',22000,3,41),
('kakao','drinks','Kakao','Какао','Bolalar uchun ham mos echki sutli kakao.','Какао на козьем молоке — подходит и детям.','Echki suti, kakao kukuni, shakar','Козье молоко, какао-порошок, сахар','+2…+6 °C da saqlang.','Хранить при +2…+6 °C.','250 ml',250,'ml',18000,3,42),
('qulupnay-kokteyl','drinks','Qulupnayli sut kokteyli','Молочный коктейль клубничный','Echki suti va qulupnay bilan sovuq kokteyl.','Холодный коктейль на козьем молоке с клубникой.','Echki suti, qulupnay pyuresi, shakar','Козье молоко, клубничное пюре, сахар','+2…+6 °C da saqlang.','Хранить при +2…+6 °C.','300 ml',300,'ml',20000,3,43);

-- Демо-партии: сегодняшнее и вчерашнее молоко — отдельными партиями
with f as (select id from public.fridges where code='tinchlik-01'),
tz as (select date_trunc('day', now() at time zone 'Asia/Tashkent') as d),
src(slug, days_ago, qty, lot) as (values
  ('echki-suti-1l',0,12,'M-T0'),('echki-suti-1l',1,4,'M-T1'),('echki-suti-05l',0,8,'M5-T0'),
  ('tabiiy-yogurt',1,10,'Y-01'),('echki-sariyogi',3,6,'B-01'),
  ('kapuchino',0,10,'C-01'),('latte',0,8,'L-01'),('kakao',1,6,'K-01'))
insert into public.batches (product_id, fridge_id, lot_code, produced_at, expires_at, sell_until, qty_received, qty_on_hand)
select p.id, f.id, s.lot,
  ((tz.d - make_interval(days => s.days_ago)) + time '06:00') at time zone 'Asia/Tashkent',
  (((tz.d - make_interval(days => s.days_ago)) + make_interval(days => p.sell_days)) at time zone 'Asia/Tashkent') - interval '1 second',
  (((tz.d - make_interval(days => s.days_ago)) + make_interval(days => p.sell_days)) at time zone 'Asia/Tashkent') - interval '1 second',
  s.qty, s.qty
from src s join public.products p on p.slug = s.slug cross join f cross join tz;

insert into public.stock_movements (batch_id, kind, qty, note)
select id, 'receipt', qty_received, 'demo seed' from public.batches;
