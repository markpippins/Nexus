CREATE SCHEMA IF NOT EXISTS peb;

-- Move tables into peb schema (preserving constraints)
ALTER TABLE public.peb_state SET SCHEMA peb;
ALTER TABLE public.peb_transactions SET SCHEMA peb;
ALTER TABLE public.peb_decisions SET SCHEMA peb;
ALTER TABLE public.peb_traces SET SCHEMA peb;
ALTER TABLE public.peb_violations SET SCHEMA peb;
ALTER TABLE public.peb_capabilities SET SCHEMA peb;

-- Rename tables to drop the peb_ prefix
ALTER TABLE peb.peb_state RENAME TO state;
ALTER TABLE peb.peb_transactions RENAME TO transactions;
ALTER TABLE peb.peb_decisions RENAME TO decisions;
ALTER TABLE peb.peb_traces RENAME TO traces;
ALTER TABLE peb.peb_violations RENAME TO violations;
ALTER TABLE peb.peb_capabilities RENAME TO capabilities;
