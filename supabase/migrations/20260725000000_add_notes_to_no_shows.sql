-- Add an optional free-text notes column to no_shows.
-- Notes are entered by the foreman/user when logging a no show and are
-- included in the alert email alongside the utility type(s).
alter table public.no_shows add column if not exists notes text;
