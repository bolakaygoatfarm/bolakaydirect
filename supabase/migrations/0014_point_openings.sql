-- BOLAKAY DIRECT · 0014 · сроки открытия точек и план открытия сети.
-- Закрытую точку видно на сайте со сроком открытия. Заказы не проходят: create_order принимает только status = 'active'.

alter table public.fridges
  add column opening_plan_uz text,
  add column opening_plan_ru text,
  add column opening_plan_en text,
  add column sort int not null default 100;

update public.fridges set
  status = 'planned', sort = 1,
  address_ru = 'Метро Тинчлик, ул. Матлубот',
  address_uz = 'Metro Tinchlik, Matlubot ko‘chasi',
  address_en = 'Tinchlik metro, Matlubot street',
  landmark_ru = 'Зоомагазин «Беданачи ока»',
  landmark_uz = '«Bedanachi oka» zoodo‘koni',
  landmark_en = 'Bedanachi Oka pet shop',
  opening_plan_ru = 'Откроется в январе 2027 года',
  opening_plan_uz = '2027-yil yanvarda ochiladi',
  opening_plan_en = 'Opens in January 2027'
where code = 'tinchlik-01';

insert into public.fridges (code, name, status, sort, address_ru, address_uz, address_en, landmark_ru, landmark_uz, landmark_en, opening_plan_ru, opening_plan_uz, opening_plan_en) values
  ('chilonzor-01', 'Chilonzor-01', 'planned', 2,
   'Метро Чиланзар, проспект Бунёдкор, 52', 'Metro Chilonzor, Bunyodkor shoh ko‘chasi, 52', 'Chilanzar metro, 52 Bunyodkor Avenue',
   'ТЦ Integro', 'Integro savdo markazi', 'Integro shopping centre',
   'Откроется в августе 2027 года', '2027-yil avgustda ochiladi', 'Opens in August 2027'),
  ('minor-01', 'Minor-01', 'planned', 3, 'Метро Минор', 'Metro Minor', 'Minor metro', null, null, null,
   'Откроется в сентябре–октябре 2028 года', '2028-yil sentabr–oktabrda ochiladi', 'Opens in September–October 2028'),
  ('hamid-olimjon-01', 'Hamid Olimjon-01', 'planned', 4, 'Метро Хамид Алимджан', 'Metro Hamid Olimjon', 'Hamid Olimjon metro', null, null, null,
   'Откроется в сентябре–октябре 2028 года', '2028-yil sentabr–oktabrda ochiladi', 'Opens in September–October 2028'),
  ('kosmonavtlar-01', 'Kosmonavtlar-01', 'planned', 5, 'Метро Космонавтлар', 'Metro Kosmonavtlar', 'Kosmonavtlar metro', null, null, null,
   'Откроется в сентябре–октябре 2029 года', '2029-yil sentabr–oktabrda ochiladi', 'Opens in September–October 2029'),
  ('xonobod-01', 'Xonobod-01', 'planned', 6, 'Метро Хонабод', 'Metro Xonobod', 'Khonobod metro', null, null, null,
   'Откроется в сентябре–октябре 2030 года', '2030-yil sentabr–oktabrda ochiladi', 'Opens in September–October 2030'),
  ('texnopark-01', 'Texnopark-01', 'planned', 7, 'Метро Технопарк', 'Metro Texnopark', 'Technopark metro', null, null, null,
   'Откроется в сентябре–октябре 2030 года', '2030-yil sentabr–oktabrda ochiladi', 'Opens in September–October 2030');

-- ТЦ Integro, Бунёдкор 52, по данным OpenStreetMap
update public.fridges set lat = 41.2771597, lng = 69.2052081 where code = 'chilonzor-01';

-- Заявку «сообщить о поступлении» по закрытой точке тоже не принимаем
create or replace function public.create_preorder(p_fridge_code text, p_phone text, p_product_id uuid, p_qty int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_fridge uuid; v_customer uuid; v_id uuid;
begin
  select id into v_fridge from public.fridges where code = p_fridge_code and status in ('active','maintenance');
  if not found then raise exception 'FRIDGE_UNAVAILABLE'; end if;
  if p_phone is null or p_phone !~ '^\+998[0-9]{9}$' then raise exception 'INVALID_PHONE'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 20 then raise exception 'INVALID_QTY'; end if;
  if not exists (select 1 from public.products where id = p_product_id and is_active) then raise exception 'PRODUCT_UNAVAILABLE'; end if;

  insert into public.customers(phone) values (p_phone)
  on conflict (phone) do update set phone = excluded.phone returning id into v_customer;

  if (select count(*) from public.preorders where customer_id = v_customer and status = 'waiting') >= 5 then
    raise exception 'TOO_MANY_PREORDERS';
  end if;

  insert into public.preorders(customer_id, fridge_id, product_id, qty)
  values (v_customer, v_fridge, p_product_id, p_qty) returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;
