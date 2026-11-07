-- BOLAKAY DIRECT · 0013 · статус «закрыта, откроется позже». Новое значение нельзя использовать в той же транзакции, поэтому отдельный файл
alter type public.fridge_status add value if not exists 'planned';
