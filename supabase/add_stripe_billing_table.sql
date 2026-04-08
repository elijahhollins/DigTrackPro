-- Stripe Billing Integration
-- Run this migration to add subscription tracking to DigTrackPro

-- 1. Create company_subscriptions table
create table if not exists company_subscriptions (
    id uuid primary key default gen_random_uuid(),
    company_id uuid references companies(id) on delete cascade not null unique,
    stripe_customer_id text,
    stripe_subscription_id text,
    stripe_price_id text,
    plan_name text not null default 'free',
    status text not null default 'inactive',
    current_period_start timestamp with time zone,
    current_period_end timestamp with time zone,
    cancel_at_period_end boolean default false,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- 2. Enable RLS
alter table company_subscriptions enable row level security;

-- 3. RLS Policies

-- Company members can read their own subscription
create policy "read_own_subscription"
    on company_subscriptions
    for select
    to authenticated
    using (company_id = (select company_id from profiles where id = auth.uid()));

-- Only service-role (Edge Functions) can insert/update subscriptions
-- This prevents clients from bypassing payment requirements
create policy "service_role_manage_subscriptions"
    on company_subscriptions
    for all
    to service_role
    using (true)
    with check (true);

-- Super admins can read all subscriptions
create policy "super_admin_read_all_subscriptions"
    on company_subscriptions
    for select
    to authenticated
    using (exists (select 1 from profiles where id = auth.uid() and role = 'SUPER_ADMIN'));

-- 4. Grant read access to authenticated users (RLS still applies)
grant select on company_subscriptions to authenticated;
grant all on company_subscriptions to service_role;

-- 5. Updated_at trigger
create or replace function update_company_subscriptions_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger company_subscriptions_updated_at
    before update on company_subscriptions
    for each row execute procedure update_company_subscriptions_updated_at();

-- 6. Helper function to check if a company has an active subscription
create or replace function company_is_paid(p_company_id uuid)
returns boolean
language sql security definer stable as $$
    select exists (
        select 1 from public.company_subscriptions
        where company_id = p_company_id
          and status in ('active', 'trialing')
    )
$$;

grant execute on function company_is_paid to authenticated;

-- 7. Allow SUPER_ADMIN to manually upsert subscriptions (e.g. for check payments)
create policy "super_admin_write_subscriptions"
    on company_subscriptions
    for all
    to authenticated
    using (exists (select 1 from profiles where id = auth.uid() and role = 'SUPER_ADMIN'))
    with check (exists (select 1 from profiles where id = auth.uid() and role = 'SUPER_ADMIN'));
