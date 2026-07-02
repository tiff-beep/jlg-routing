-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query)

-- Table 1: stores the entire rotation state as a single JSON blob
create table if not exists routing_state (
  id    integer primary key,
  state jsonb   not null,
  updated_at timestamptz default now()
);

-- Table 2: append-only log of every handoff
create table if not exists lead_log (
  id            bigserial primary key,
  agent_id      text not null,
  agent_name    text not null,
  lead_type     text not null,
  price         text,
  zone          text,
  source        text not null,
  status        text not null,
  pass_reason   text,
  is_cherry_pick boolean default false,
  logged_at     timestamptz default now()
);

-- Enable Row Level Security but allow all operations via anon key
-- (The tool is internal — no public access beyond your team's URL)
alter table routing_state enable row level security;
alter table lead_log       enable row level security;

create policy "allow all" on routing_state for all using (true) with check (true);
create policy "allow all" on lead_log       for all using (true) with check (true);
