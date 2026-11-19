-- ==============================================================================
-- BHOOKR - UTM campaign master data
--
-- One row per tracked campaign link created from CRM → UTM sources.
-- The site stores utm_source + utm_sub_source on every lead, so each
-- (source, sub_source) pair must be unique to keep lead attribution unambiguous.
--
-- Safe to run more than once. Does not touch any existing table or row.
-- ==============================================================================

create table if not exists utm_campaigns (
  id              uuid primary key default gen_random_uuid(),
  campaign_name   text not null,                 -- human-friendly name, e.g. "Diwali offer 2026"
  campaign_slug   text not null,                 -- utm_campaign value, e.g. "diwali_offer_2026"
  source          text not null,                 -- utm_source, e.g. "instagram"
  sub_source      text not null,                 -- utm_sub_source, e.g. "reel_nov_week1"
  landing_url     text not null default 'https://www.bhookr.com/subscribe',
  final_url       text not null,                 -- full link to use in the campaign
  notes           text,
  created_by      text,                          -- CRM role that created it
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists utm_campaigns_source_sub_unique
  on utm_campaigns (lower(source), lower(sub_source));

create index if not exists idx_utm_campaigns_created_at on utm_campaigns (created_at desc);

-- Keep updated_at current (function defined in supabase/schema.sql)
drop trigger if exists utm_campaigns_updated_at on utm_campaigns;
create trigger utm_campaigns_updated_at
  before update on utm_campaigns
  for each row execute function update_updated_at_column();

-- Same access model as the other tables: only the server (service role) reads/writes.
alter table utm_campaigns enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'utm_campaigns'
      and policyname = 'Allow service_role full access on utm_campaigns'
  ) then
    create policy "Allow service_role full access on utm_campaigns" on utm_campaigns
      for all using (auth.role() = 'service_role');
  end if;
end $$;
