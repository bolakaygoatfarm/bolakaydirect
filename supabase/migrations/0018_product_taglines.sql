-- BOLAKAY DIRECT · 0018 · Короткая строка о вкусе под названием товара, новые сроки и цена масла,
-- точки называются по району, а номер («Точка — 01») берётся из порядка (fridges.sort).

alter table public.products
  add column if not exists tagline_uz text,
  add column if not exists tagline_ru text,
  add column if not exists tagline_en text;

update public.products p set
  name_ru = v.name_ru, name_uz = v.name_uz, name_en = v.name_en,
  tagline_ru = v.t_ru, tagline_uz = v.t_uz, tagline_en = v.t_en
from (values
  ('echki-suti-1l',    'Козье молоко',        'Echki suti',              'Goat milk',            'С нашей фермы',          'O‘z fermamizdan',      'From our farm'),
  ('echki-suti-05l',   'Козье молоко',        'Echki suti',              'Goat milk',            'С нашей фермы',          'O‘z fermamizdan',      'From our farm'),
  ('tabiiy-yogurt',    'Натуральный йогурт',  'Tabiiy yogurt',           'Natural yogurt',       'Нежный вкус',            'Mayin ta’m',           'Delicate taste'),
  ('echki-sariyogi',   'Козье сливочное масло','Echki suti sariyog‘i',   'Goat butter',          'Сливочная нежность',     'Qaymoqli mayinlik',    'Creamy and soft'),
  ('kapuchino',        'Холодный капучино',   'Sovuq kapuchino',         'Iced cappuccino',      'Кофе и козье молоко',    'Qahva va echki suti',  'Coffee and goat milk'),
  ('latte',            'Холодный латте',      'Sovuq latte',             'Iced latte',           'Мягкий кофейный вкус',   'Yumshoq qahva ta’mi',  'Smooth coffee taste'),
  ('kakao',            'Какао',               'Kakao',                   'Cocoa',                'Шоколадное настроение',  'Shokoladli kayfiyat',  'A chocolate mood'),
  ('qulupnay-kokteyl', 'Клубничный милкшейк', 'Qulupnayli milksheyk',    'Strawberry milkshake', 'Клубничная нежность',    'Qulupnayli mayinlik',  'Strawberry delight')
) as v(slug, name_ru, name_uz, name_en, t_ru, t_uz, t_en)
where p.slug = v.slug;

-- Сроки продажи: молоко 2 дня, йогурт и напитки 3 дня, масло 3 месяца (90 дней)
update public.products set sell_days = 2 where category = 'milk';
update public.products set sell_days = 3 where category in ('yogurt', 'drinks');
update public.products set sell_days = 90, price = 60000 where slug = 'echki-sariyogi';

-- Точки: «Tinchlik-01» → «Tinchlik»; коды (и QR-ссылки) не меняются
update public.fridges set name = regexp_replace(name, '-\d+$', '') where name ~ '-\d+$';
