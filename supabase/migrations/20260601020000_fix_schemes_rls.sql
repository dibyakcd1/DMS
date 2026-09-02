-- Migration: Fix Schemes RLS policies
-- Since schemes was not processed by the nuclear recursion killer policy replacer,
-- we run it here to ensure correct RLS permissions for viewing and managing trade schemes.

SELECT public.fix_table_rls('schemes');
