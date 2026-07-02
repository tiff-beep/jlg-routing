import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const entry = await req.json();
  const { error } = await supabase.from('lead_log').insert({
    agent_id:   entry.agentId,
    agent_name: entry.agentName,
    lead_type:  entry.type,
    price:      entry.price || null,
    zone:       entry.zone || null,
    source:     entry.source,
    status:     entry.status,
    pass_reason:entry.passReason || null,
    is_cherry_pick: entry.isCherryPick || false,
    logged_at:  new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function GET() {
  // Return current month's logs
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('lead_log')
    .select('*')
    .gte('logged_at', start.toISOString())
    .order('logged_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
