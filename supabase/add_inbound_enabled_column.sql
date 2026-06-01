-- Migration: add inbound_enabled flag to companies table
-- Run this in the Supabase SQL Editor to enable per-company Inbound Tickets access.
--
-- After running this migration, use the Platform Admin panel (Team → super-admin section)
-- to toggle "Inbound ON/OFF" for each company that has paid for the Inbound Tickets service.

alter table public.companies
  add column if not exists inbound_enabled boolean not null default false;

-- Allow super-admins to update this column
-- (The existing super_admin_update policy on companies already covers all columns, so
--  no additional policy is needed — this comment is just for documentation.)
