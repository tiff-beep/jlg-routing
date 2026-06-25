import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { INITIAL_AGENTS, buildRotation } from '@/lib/agents';

const DEFAULT_STATE = {
  buyerRotation:      buildRotation(INITIAL_AGENTS, "buyer"),
  osaRotation:        buildRotation(INITIAL_AGENTS, "buyer"),
  listingRotation:    buildRotation(INITIAL_AGENTS, "listing"),
  osaListingRotation: buildRotation(INITIAL_AGENTS, "listing"),
  buySellRotation:    INITIAL_AGENTS.map(a => a.id),
  devRotations:       { brookglen: 0, grand_terraza: 0, blvd_heights: 0 },
  agents:             INITIAL_AGENTS,
  month:              new Date().toISOString().slice(0, 7),
};

export async function GET() {
  const { data, error } = await supabase
    .from('routing_state')
    .select('*')
    .eq('id', 1)
    .single();

  if (error || !data) {
    // First run — seed default state
    await supabase.from('routing_state').upsert({ id: 1, state: DEFAULT_STATE });
    return NextResponse.json(DEFAULT_STATE);
  }

  // Auto-return agents from vacation if returnDate has passed
  const today = new Date().toISOString().split('T')[0];
  const state = data.state;
  let changed = false;
  state.agents = state.agents.map((a: any) => {
    if (a.onVacation && a.returnDate && a.returnDate <= today) {
      changed = true;
      return { ...a, onVacation: false };
    }
    return a;
  });
  if (changed) {
    await supabase.from('routing_state').update({ state }).eq('id', 1);
  }

  return NextResponse.json(state);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { data: current } = await supabase
    .from('routing_state')
    .select('state')
    .eq('id', 1)
    .single();

  const merged = { ...(current?.state ?? DEFAULT_STATE), ...body };
  const { error } = await supabase
    .from('routing_state')
    .upsert({ id: 1, state: merged });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
