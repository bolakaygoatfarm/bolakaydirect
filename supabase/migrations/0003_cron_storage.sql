-- BOLAKAY DIRECT · 0003 · автоснятие просроченных резервов + хранилище фото
create extension if not exists pg_cron;
select cron.schedule('bolakay-expire-orders', '* * * * *', 'select public.expire_orders()');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy product_images_admin_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.has_role(array['admin']::public.staff_role[]));
create policy product_images_admin_upd on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.has_role(array['admin']::public.staff_role[]));
create policy product_images_admin_del on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.has_role(array['admin']::public.staff_role[]));
