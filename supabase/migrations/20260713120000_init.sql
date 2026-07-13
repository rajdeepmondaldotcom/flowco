-- FlowCo Approvals Triage — schema
-- One jsonb row per expense (prototype-appropriate; the shape lives in lib/types.ts)

create table if not exists public.expenses (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Global hourly counters used as a cost guardrail for model calls on the
-- public demo. Atomic bump-and-check.
create table if not exists public.counters (
  key text primary key,
  value int not null default 0,
  window_start timestamptz not null default now()
);

create or replace function public.bump_counter(counter_key text, max_per_hour int)
returns boolean
language plpgsql
security definer
as $$
declare
  ok boolean;
begin
  insert into public.counters (key, value, window_start)
  values (counter_key, 0, now())
  on conflict (key) do nothing;

  update public.counters
  set value = case when now() - window_start > interval '1 hour' then 1 else value + 1 end,
      window_start = case when now() - window_start > interval '1 hour' then now() else window_start end
  where key = counter_key
  returning value <= max_per_hour into ok;

  return coalesce(ok, false);
end;
$$;

-- All app access goes through the service-role key server-side; block anon.
alter table public.expenses enable row level security;
alter table public.counters enable row level security;

-- Public bucket for uploaded receipt photos (employee submit flow).
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do nothing;
