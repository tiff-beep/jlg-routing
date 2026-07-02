import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req:NextRequest){
  const e=await req.json();
  const{error}=await supabase.from('lead_log').insert({
    agent_id:   e.agent_id,
    agent_name: e.agent_name,
    lead_type:  e.lead_type,
    price:      e.price||null,
    zone:       e.zone||null,
    source:     e.source,
    staff_name: e.staff_name||null,
    status:     e.status,
    pass_reason:e.pass_reason||null,
    is_cherry_pick:e.is_cherry_pick||false,
    logged_at:  new Date().toISOString(),
  });
  if(error){
    console.error('log insert error:',error);
    return NextResponse.json({error:error.message},{status:500});
  }
  return NextResponse.json({ok:true});
}

export async function GET(){
  const start=new Date();
  start.setDate(1);start.setHours(0,0,0,0);
  const{data,error}=await supabase.from('lead_log').select('*')
    .gte('logged_at',start.toISOString()).order('logged_at',{ascending:false});
  if(error)return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json(data??[]);
}
