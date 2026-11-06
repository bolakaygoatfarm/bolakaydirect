-- BOLAKAY DIRECT · 0007 · pg_net переносится в схему extensions
drop extension if exists pg_net;
create extension pg_net with schema extensions;
