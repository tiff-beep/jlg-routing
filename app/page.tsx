"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { INITIAL_AGENTS, ZONES, DEV_COMMUNITIES, PASS_REASONS, SUB250K_POOL, buildRotation, formatPrice, Agent, LeadType, Source, Zone } from "@/lib/agents";

// ── Types ─────────────────────────────────────────────────────────────────────
interface AppState {
  buyerRotation:string[]; osaRotation:string[];
  listingRotation:string[]; osaListingRotation:string[];
  buySellRotation:string[]; devRotations:Record<string,number>;
  agents:Agent[]; month:string;
}
interface LogEntry {
  agent_id:string; agent_name:string; lead_type:string;
  price:string|null; zone:string|null; source:string;
  staff_name?:string;
  status:"accepted"|"passed"; pass_reason:string|null;
  is_cherry_pick:boolean; logged_at:string;
}
interface Rec {
  agent:Agent; zoneSignal:"strong"|"ok"|"flag";
  alternatives:{agent:Agent;zoneSignal:"strong"|"ok"|"flag"}[];
  isDev?:boolean; community?:string;
}
interface Slot {
  id:number;
  leadType:LeadType; price:string; zone:string;
  staffName:string; direction:"inbound"|"outbound";
  isDevLead:boolean; devCommunity:string; isRental:boolean; isCash:boolean; isReferOut:boolean;
  rec:Rec|null; timerSecs:number; timerActive:boolean;
  showPass:boolean; passingId:string; passReason:string;
  prevAgentId:string|null;
  pendingAgentIds:string[];
  quickPickOpen:boolean; // agents currently being offered to in other slots
}

// These are overridden by editable state in the component
const DEFAULT_SEED: Record<string,number> = {};
const DEFAULT_PASSES: Record<string,number> = {};

const STAFF = ["Aidan","Jasmine","Kate","Michelle","Ryan"];
function buildSlot(id:number):Slot {
  return {id,leadType:"buyer",price:"",zone:"",
    staffName:"",direction:"inbound",
    isDevLead:false,devCommunity:"",isRental:false,isCash:false,isReferOut:false,
    rec:null,timerSecs:0,timerActive:false,
    showPass:false,passingId:"",passReason:"",prevAgentId:null,pendingAgentIds:[],quickPickOpen:false};
}

function zoneSignal(agent:Agent,zoneId:string):"strong"|"ok"|"flag"{
  if(!zoneId||zoneId==="other")return"ok";
  if(agent.zoneFlags?.includes(zoneId as Zone))return"flag";
  if(agent.zones?.includes(zoneId as Zone))return"strong";
  return"ok";
}

function bdg(color:string,text:string){
  const cls:Record<string,string>={
    green:"bg-green-100 text-green-800 border border-green-200",
    amber:"bg-amber-100 text-amber-800 border border-amber-200",
    red:"bg-red-100 text-red-800 border border-red-200",
    blue:"bg-blue-100 text-blue-800 border border-blue-200",
    purple:"bg-purple-100 text-purple-800 border border-purple-200",
    gray:"bg-gray-100 text-gray-700 border border-gray-200",
  };
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${cls[color]??cls.gray}`}>{text}</span>;
}

export default function Home(){
  const [appState,setAppState]=useState<AppState|null>(null);
  const [log,setLog]=useState<LogEntry[]>([]);
  const [view,setView]=useState<"assign"|"roster"|"tracker"|"dev"|"admin">("assign");
  const [loading,setLoading]=useState(true);
  const [slots,setSlots]=useState<Slot[]>([buildSlot(1)]);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [editDraft,setEditDraft]=useState<Agent|null>(null);
  const [seedCounts,setSeedCounts]=useState<Record<string,number>>(DEFAULT_SEED);
  const [seedPasses,setSeedPasses]=useState<Record<string,number>>(DEFAULT_PASSES);
  const [editTracker,setEditTracker]=useState(false);
  const [trackerDraft,setTrackerDraft]=useState<Record<string,{accepted:number,passes:number}>>({});
  const pollRef=useRef<ReturnType<typeof setInterval>|null>(null);

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const fetchState=useCallback(async()=>{
    const [sr,lr]=await Promise.all([fetch("/api/state"),fetch("/api/log")]);
    const sd=await sr.json(); const ld=await lr.json();
    setAppState(sd); setLog(ld); setLoading(false);
  },[]);

  useEffect(()=>{
    fetchState();
    const id=setInterval(fetchState,5000);
    pollRef.current=id;
    return()=>clearInterval(id);
  },[fetchState]);

  const saveState=async(patch:Partial<AppState>)=>{
    await fetch("/api/state",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(patch)});
    setAppState(prev=>prev?{...prev,...patch}:prev);
  };

  const appendLog=async(entry:Partial<LogEntry>)=>{
    await fetch("/api/log",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(entry)});
    setLog(prev=>[entry as LogEntry,...prev]);
  };

  // ── Timers ──────────────────────────────────────────────────────────────────
  useEffect(()=>{
    const interval=setInterval(()=>{
      setSlots(prev=>prev.map(slot=>{
        if(!slot.timerActive)return slot;
        if(slot.timerSecs<=1){
          // auto timeout
          if(slot.rec){
            appendLog({agent_id:slot.rec.agent.id,agent_name:slot.rec.agent.name,
              lead_type:slot.leadType,price:slot.price||null,zone:slot.zone||null,
              source:slot.direction,staff_name:slot.staffName,status:"passed",pass_reason:"timed_out",is_cherry_pick:false,
              logged_at:new Date().toISOString()});
          }
          return{...slot,timerSecs:0,timerActive:false,showPass:false};
        }
        return{...slot,timerSecs:slot.timerSecs-1};
      }));
    },1000);
    return()=>clearInterval(interval);
  },[]);

  // ── Capacity ────────────────────────────────────────────────────────────────
  const weightedCount=(agentId:string)=>{
    const seeded=seedCounts[agentId]??0;
    const fromLog=log.filter(l=>l.agent_id===agentId&&l.status==="accepted")
      .reduce((s,l)=>s+(l.source==="outbound"?0.5:1),0);
    return seeded+fromLog;
  };

  const passCount=(agentId:string)=>{
    const seeded=seedPasses[agentId]??0;
    const fromLog=log.filter(l=>l.agent_id===agentId&&l.status==="passed").length;
    return seeded+fromLog;
  };

  const timedOutCount=(agentId:string)=>
    log.filter(l=>l.agent_id===agentId&&l.pass_reason==="timed_out").length;

  const cherryPickCount=(agentId:string)=>
    log.filter(l=>l.agent_id===agentId&&l.is_cherry_pick).length;

  const lastOfferDate=(agentId:string)=>{
    const entries=log.filter(l=>l.agent_id===agentId);
    if(!entries.length)return null;
    return entries.reduce((a,b)=>a.logged_at>b.logged_at?a:b).logged_at;
  };

  const lastWasOSA=(agentId:string)=>{
    const accepted=log.filter(l=>l.agent_id===agentId&&l.status==="accepted");
    if(!accepted.length)return false;
    const last=accepted.reduce((a,b)=>a.logged_at>b.logged_at?a:b);
    return last.source==="outbound";
  };

  // ── Eligibility ─────────────────────────────────────────────────────────────
  const isEligible=(agent:Agent,type:LeadType,priceVal:number|null,rental:boolean,src:string,cash:boolean):{ok:boolean;reason?:string}=>{
    if(!agent.active)return{ok:false,reason:"Inactive"};
    if(agent.onVacation)return{ok:false,reason:"On vacation"};
    if((agent as any).offTeam)return{ok:false,reason:"Off team"};
    if(rental&&!agent.takesRentals)return{ok:false,reason:"No rentals"};
    if(cash&&!(agent as any).cashOffer)return{ok:false,reason:"No cash offers"};
    if(type==="seller"&&(agent.buyerOnly||!agent.listingEligible))return{ok:false,reason:"Not listing eligible"};
    if(type==="buyer"&&agent.listingsOnly)return{ok:false,reason:"Listings only"};
    const floor=type==="seller"?agent.sellerFloor:agent.buyerFloor;
    const ceil=type==="seller"?agent.sellerMax:agent.buyerMax;
    if(priceVal&&floor&&priceVal<floor)return{ok:false,reason:`Below floor (${formatPrice(floor)})`};
    if(priceVal&&ceil&&priceVal>ceil)return{ok:false,reason:`Above max (${formatPrice(ceil)})`};
    if(weightedCount(agent.id)>=agent.monthlyCapISA&&!agent.referOut)return{ok:false,reason:"At capacity"};
    if(src==="outbound"&&lastWasOSA(agent.id))return{ok:false,reason:"Skip — last lead was outbound"};
    return{ok:true};
  };

  // ── Rotation ────────────────────────────────────────────────────────────────
  const getRotation=(type:LeadType,src:string,state:AppState):string[]=>
  {
    const isOSA=src==="outbound";
    if(type==="seller")return isOSA?state.osaListingRotation:state.listingRotation;
    if(type==="buysell")return isOSA?state.osaListingRotation:state.buySellRotation;
    return isOSA?state.osaRotation:state.buyerRotation;
  };

  const advanceRotation=(agentId:string,slot:Slot,state:AppState):Partial<AppState>=>{
    if(slot.isDevLead&&slot.devCommunity){
      return{devRotations:{...state.devRotations,[slot.devCommunity]:(state.devRotations[slot.devCommunity]??0)+1}};
    }
    const advance=(list:string[])=>{const idx=list.indexOf(agentId);if(idx===-1)return list;return[...list.slice(idx+1),...list.slice(0,idx+1)];};
    const isOSA=slot.direction==="outbound";
    if(slot.leadType==="seller")return isOSA?{osaListingRotation:advance(state.osaListingRotation)}:{listingRotation:advance(state.listingRotation)};
    if(slot.leadType==="buysell")return isOSA?{osaListingRotation:advance(state.osaListingRotation)}:{buySellRotation:advance(state.buySellRotation)};
    return isOSA?{osaRotation:advance(state.osaRotation)}:{buyerRotation:advance(state.buyerRotation)};
  };

  // ── Find recommendation ─────────────────────────────────────────────────────
  const findRec=(slot:Slot,state:AppState):Rec|null=>{
    if(!state)return null;
    const priceVal=slot.price?parseFloat(slot.price.replace(/[^0-9.]/g,"")):null;
    // Sub-$250k only applies to buyer leads
    // Refer out — always routes to Justin only
    if(slot.isReferOut){
      const justin=state.agents.find(a=>a.id==="justin");
      if(!justin)return null;
      return{agent:justin,zoneSignal:"strong",alternatives:[]};
    }
    // For seller/buysell: always check Ashton first if eligible
    if(slot.leadType==="seller"||slot.leadType==="buysell"){
      const ashton=state.agents.find(a=>a.id==="ashton");
      if(ashton&&ashton.active&&!ashton.onVacation&&!(ashton as any).offTeam&&!slot.pendingAgentIds.includes("ashton")){
        const elig=isEligible(ashton,slot.leadType,priceVal,slot.isRental,slot.direction,slot.isCash);
        if(elig.ok){
          // Find next eligible after Ashton for alternatives
          const rotList=getRotation(slot.leadType,slot.direction,state);
          const alts:{agent:Agent;zoneSignal:"strong"|"ok"|"flag"}[]=[];
          for(const id of rotList){
            if(id==="ashton")continue;
            const a=state.agents.find(x=>x.id===id);
            if(!a)continue;
            if(!isEligible(a,slot.leadType,priceVal,slot.isRental,slot.direction,slot.isCash).ok)continue;
            if(slot.pendingAgentIds.includes(a.id))continue;
            alts.push({agent:a,zoneSignal:zoneSignal(a,slot.zone)});
            if(alts.length>=2)break;
          }
          return{agent:ashton,zoneSignal:zoneSignal(ashton,slot.zone),alternatives:alts};
        }
      }
    }

    if(priceVal&&priceVal<=250000&&slot.leadType==="buyer"){
      const subRot=state.buyerRotation.filter(id=>SUB250K_POOL.includes(id));
      for(const id of subRot){
        const agent=state.agents.find(a=>a.id===id);
        if(!agent||!agent.active||agent.onVacation||(agent as any).offTeam)continue;
        if(weightedCount(agent.id)>=agent.monthlyCapISA&&!agent.referOut)continue;
        const alts=subRot.filter(i=>i!==id).map(i=>state.agents.find(a=>a.id===i)!).filter(Boolean).filter(a=>a.active&&!a.onVacation&&!(a as any).offTeam);
        return{agent,zoneSignal:"strong",alternatives:alts.slice(0,2).map(a=>({agent:a,zoneSignal:"strong" as const}))};
      }
      return null;
    }
    if(slot.isDevLead&&slot.devCommunity){
      const pool=state.agents.filter(a=>a.devCommunities?.includes(slot.devCommunity)&&a.active&&!a.onVacation&&!(a as any).offTeam);
      if(!pool.length)return null;
      const idx=(state.devRotations[slot.devCommunity]??0)%pool.length;
      return{agent:pool[idx],zoneSignal:"strong",alternatives:[],isDev:true,community:slot.devCommunity};
    }
    const rotList=getRotation(slot.leadType,slot.direction,state);
    let found:Rec|null=null;
    const alts:{agent:Agent;zoneSignal:"strong"|"ok"|"flag"}[]=[];
    for(const id of rotList){
      const agent=state.agents.find(a=>a.id===id);
      if(!agent)continue;
      const elig=isEligible(agent,slot.leadType,priceVal,slot.isRental,slot.direction,slot.isCash);
      if(!elig.ok)continue;
      const sig=zoneSignal(agent,slot.zone);
      if(!found)found={agent,zoneSignal:sig,alternatives:[]};
      else{alts.push({agent,zoneSignal:sig});if(alts.length>=2)break;}
    }
    if(!found)return null;
    if(found.zoneSignal==="flag"){
      const strong=alts.find(a=>a.zoneSignal==="strong");
      if(strong){const rest=alts.filter(a=>a.agent.id!==strong.agent.id);return{...strong,alternatives:[{agent:found.agent,zoneSignal:found.zoneSignal},...rest].slice(0,2)};}
    }
    return{...found,alternatives:alts.slice(0,2)};
  };

  const findNextAfterPass=(skippedId:string,slot:Slot,state:AppState):Rec|null=>{
    if(!state)return null;
    const priceVal=slot.price?parseFloat(slot.price.replace(/[^0-9.]/g,"")):null;
    const rotList=getRotation(slot.leadType,slot.direction,state);
    const skippedIdx=rotList.indexOf(skippedId);
    for(let i=1;i<rotList.length;i++){
      const id=rotList[(skippedIdx+i)%rotList.length];
      const agent=state.agents.find(a=>a.id===id);
      if(!agent)continue;
      if(!isEligible(agent,slot.leadType,priceVal,slot.isRental,slot.direction,slot.isCash).ok)continue;
      if(slot.pendingAgentIds.includes(agent.id))continue; // temp-held by another slot
      return{agent,zoneSignal:zoneSignal(agent,slot.zone),alternatives:[]};
    }
    return null;
  };

  // ── Slot actions ────────────────────────────────────────────────────────────
  const updateSlot=(id:number,patch:Partial<Slot>)=>setSlots(prev=>prev.map(s=>s.id===id?{...s,...patch}:s));

  const handleFind=(slotId:number)=>{
    if(!appState)return;
    const slot=slots.find(s=>s.id===slotId)!;
    const r=findRec(slot,appState);
    updateSlot(slotId,{rec:r,timerSecs:0,timerActive:false,prevAgentId:null});
  };

  const handleStartTimer=(slotId:number)=>{
    const slot=slots.find(s=>s.id===slotId);
    if(!slot?.rec)return;
    const agentId=slot.rec.agent.id;
    // Mark this agent as pending in all other slots so they won't be offered
    setSlots(prev=>prev.map(s=>{
      if(s.id===slotId)return{...s,timerSecs:1200,timerActive:true};
      return{...s,pendingAgentIds:[...s.pendingAgentIds.filter(id=>id!==agentId),agentId]};
    }));
  };

  const handleAccept=(slotId:number,agentId:string)=>{
    if(!appState)return;
    const slot=slots.find(s=>s.id===slotId)!;
    const agent=appState.agents.find(a=>a.id===agentId);
    if(!agent)return;
    appendLog({agent_id:agentId,agent_name:agent.name,lead_type:slot.leadType,price:slot.price||null,
      zone:slot.zone||null,source:slot.direction,staff_name:slot.staffName,status:"accepted",is_cherry_pick:false,logged_at:new Date().toISOString()});
    const patch=advanceRotation(agentId,slot,appState);
    saveState(patch);
    const agentId2=agentId;
    setSlots(prev=>prev.map(s=>{
      if(s.id===slotId)return{...buildSlot(slotId),id:slotId};
      return{...s,pendingAgentIds:s.pendingAgentIds.filter(id=>id!==agentId2)};
    }));
  };

  const handleSkip=(slotId:number,agentId:string)=>{
    if(!appState)return;
    const slot=slots.find(s=>s.id===slotId)!;
    const next=findNextAfterPass(agentId,slot,appState);
    updateSlot(slotId,{rec:next,timerSecs:0,timerActive:false,prevAgentId:agentId});
  };

  const handlePassOpen=(slotId:number,agentId:string)=>
    updateSlot(slotId,{showPass:true,passingId:agentId,passReason:"",timerActive:false});

  const handlePassConfirm=(slotId:number)=>{
    if(!appState)return;
    const slot=slots.find(s=>s.id===slotId)!;
    if(!slot.passReason)return;
    const agent=appState.agents.find(a=>a.id===slot.passingId);
    const reasonDef=PASS_REASONS.find(r=>r.id===slot.passReason);
    const isCherryPick=reasonDef?.isCherryPick??false;
    appendLog({agent_id:slot.passingId,agent_name:agent?.name??"",
      lead_type:slot.leadType,price:slot.price||null,zone:slot.zone||null,
      source:slot.direction,staff_name:slot.staffName,status:"passed",pass_reason:slot.passReason,
      is_cherry_pick:isCherryPick,logged_at:new Date().toISOString()});
    const patch=advanceRotation(slot.passingId,slot,appState);
    saveState(patch);
    const next=findNextAfterPass(slot.passingId,slot,appState);
    updateSlot(slotId,{showPass:false,passReason:"",rec:next,timerSecs:0,timerActive:false,prevAgentId:slot.passingId});
  };

  const handleGiveBackToPrev=(slotId:number)=>{
    if(!appState)return;
    const slot=slots.find(s=>s.id===slotId)!;
    if(!slot.prevAgentId)return;
    const agent=appState.agents.find(a=>a.id===slot.prevAgentId);
    if(!agent)return;
    updateSlot(slotId,{rec:{agent,zoneSignal:zoneSignal(agent,slot.zone),alternatives:[]},timerSecs:0,timerActive:false,prevAgentId:null});
  };

  const handleSaveAgent=()=>{
    if(!editDraft||!appState)return;
    const newAgents=appState.agents.map(a=>a.id===editDraft.id?editDraft:a);
    saveState({agents:newAgents});
    setEditingId(null);setEditDraft(null);
  };

  // ── Slot UI ─────────────────────────────────────────────────────────────────
  const renderSlot=(slot:Slot)=>{
    const tc=slot.timerSecs>600?"#15803d":slot.timerSecs>300?"#b45309":"#dc2626";
    const tpct=(slot.timerSecs/1200)*100;
    const tmin=Math.floor(slot.timerSecs/60);
    const tsec=slot.timerSecs%60;
    return(
      <div key={slot.id} className="bg-white rounded-xl border-2 border-gray-200 p-5 mb-4">
        {slots.length>1&&<div className="flex justify-between items-center mb-3"><span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Slot {slot.id}</span><button onClick={()=>setSlots(prev=>prev.filter(s=>s.id!==slot.id))} className="text-xs text-gray-400 hover:text-red-500">✕ Close slot</button></div>}

        {/* Lead form */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Lead type</label>
            <div className="flex gap-1">
              {(["buyer","seller","buysell"] as const).map(t=>(
                <button key={t} onClick={()=>updateSlot(slot.id,{leadType:t})}
                  className={`flex-1 py-1.5 rounded-lg border-2 text-xs font-bold transition-colors ${slot.leadType===t?"border-gray-900 bg-gray-900 text-white":"border-gray-200 text-gray-700 hover:border-gray-300"}`}>
                  {t==="buysell"?"Buy/Sell":t.charAt(0).toUpperCase()+t.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Your name</label>
              <select className="w-full border-2 border-gray-200 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-800 bg-white" value={slot.staffName} onChange={e=>updateSlot(slot.id,{staffName:e.target.value})}>
                <option value="">Select…</option>
                {STAFF.map(n=><option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Type</label>
              <select className="w-full border-2 border-gray-200 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-800 bg-white" value={slot.direction} onChange={e=>updateSlot(slot.id,{direction:e.target.value as "inbound"|"outbound"})}>
                <option value="inbound">Inbound (1.0x)</option>
                <option value="outbound">Outbound (0.5x)</option>
              </select>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Price point</label>
            <input className="w-full border-2 border-gray-200 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-800" placeholder="e.g. 450000" value={slot.price} onChange={e=>updateSlot(slot.id,{price:e.target.value})}/>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Location</label>
            <select className="w-full border-2 border-gray-200 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-800 bg-white" value={slot.zone} onChange={e=>updateSlot(slot.id,{zone:e.target.value})}>
              <option value="">Select zone…</option>
              {ZONES.map(z=><option key={z.id} value={z.id}>{z.label}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-4 mb-3 flex-wrap">
          {([["Rental",slot.isRental,(v:boolean)=>updateSlot(slot.id,{isRental:v})],
             ["Dev community",slot.isDevLead,(v:boolean)=>updateSlot(slot.id,{isDevLead:v,devCommunity:v?slot.devCommunity:""})],
             ["Cash offer",slot.isCash,(v:boolean)=>updateSlot(slot.id,{isCash:v})],
             ["Refer out (Justin)",slot.isReferOut,(v:boolean)=>updateSlot(slot.id,{isReferOut:v})]] as [string,boolean,(v:boolean)=>void][]).map(([lbl,val,setter])=>(
            <label key={lbl} className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-700">
              <div onClick={()=>setter(!val)} className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer ${val?"bg-green-600":"bg-gray-300"}`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${val?"left-4":"left-0.5"}`}/>
              </div>
              {lbl}
            </label>
          ))}
        </div>
        {slot.isDevLead&&(
          <div className="mb-3">
            <select className="w-full border-2 border-gray-200 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-800 bg-white" value={slot.devCommunity} onChange={e=>updateSlot(slot.id,{devCommunity:e.target.value})}>
              <option value="">Select community…</option>
              {DEV_COMMUNITIES.map(d=><option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </div>
        )}
        <button onClick={()=>handleFind(slot.id)} className="bg-gray-900 text-white px-5 py-2 rounded-lg text-sm font-bold hover:bg-gray-800">Find next agent →</button>

        {/* Recommendation */}
        {slot.rec&&(
          <div className="mt-4 bg-gray-50 rounded-xl border-2 border-gray-900 p-4">
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                  {slot.rec.isDev?DEV_COMMUNITIES.find(d=>d.id===slot.rec!.community)?.label+" rotation":"Recommended agent"}
                </p>
                <p className="text-xl font-black text-gray-900 flex items-center gap-2 flex-wrap">
                  {slot.rec.agent.name}
                  {(slot.rec.agent as any).cashOffer&&bdg("blue","💵 Cash")}
                  {slot.rec.zoneSignal==="strong"&&bdg("green","✓ Area match")}
                  {slot.rec.zoneSignal==="flag"&&bdg("red","⚠ Area mismatch")}
                  {slot.rec.zoneSignal==="ok"&&bdg("amber","Area ok")}
                </p>
                <p className="text-sm text-gray-600 mt-1 font-medium">{slot.rec.agent.notes}</p>
              </div>
              {slot.timerActive&&(
                <div className="text-center min-w-[72px]">
                  <p className="text-2xl font-black" style={{color:tc}}>{tmin}:{String(tsec).padStart(2,"0")}</p>
                  <p className="text-xs font-semibold text-gray-500">remaining</p>
                  <div className="h-1.5 bg-gray-200 rounded mt-1 overflow-hidden">
                    <div className="h-full rounded transition-all duration-1000" style={{width:`${tpct}%`,background:tc}}/>
                  </div>
                </div>
              )}
            </div>

            {/* Timer start */}
            {!slot.timerActive&&(
              <button onClick={()=>handleStartTimer(slot.id)} className="w-full mb-3 border-2 border-dashed border-gray-400 text-gray-600 py-2 rounded-lg text-sm font-bold hover:border-gray-900 hover:text-gray-900 transition-colors">
                ▶ I've reached out — start 20-min timer
              </button>
            )}
            {slot.timerActive&&<p className="text-xs font-semibold text-gray-500 mb-3">Timer running — waiting for response.</p>}

            <div className="flex gap-2 flex-wrap mb-2">
              <button onClick={()=>handleAccept(slot.id,slot.rec!.agent.id)} className="bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-800">✓ Accepted</button>
              <button onClick={()=>handlePassOpen(slot.id,slot.rec!.agent.id)} className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-700">✗ Pass / decline</button>
              <button onClick={()=>handleSkip(slot.id,slot.rec!.agent.id)} className="bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-amber-600">↷ Skip (better fit)</button>
              <button onClick={()=>updateSlot(slot.id,{rec:null,timerActive:false,timerSecs:0})} className="ml-auto border-2 border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-xs font-bold hover:bg-gray-100">Cancel</button>
            </div>

            {/* Give back to previous */}
            {slot.prevAgentId&&(
              <button onClick={()=>handleGiveBackToPrev(slot.id)} className="text-xs font-bold text-blue-700 underline hover:text-blue-900 mb-2 block">
                ← Give back to {appState?.agents.find(a=>a.id===slot.prevAgentId)?.name} (previous agent)
              </button>
            )}

            {/* Next 2 in rotation */}
            {slot.rec.alternatives.length>0&&(
              <div className="mt-3">
                <p className="text-xs font-black text-gray-500 uppercase mb-2">Next in rotation:</p>
                <div className="flex gap-2">
                  {slot.rec.alternatives.map(alt=>(
                    <div key={alt.agent.id} onClick={()=>handleAccept(slot.id,alt.agent.id)}
                      className="flex-1 border-2 border-gray-200 rounded-lg p-3 cursor-pointer hover:border-gray-900 hover:bg-gray-900 hover:text-white transition-colors group">
                      <p className="font-black text-sm text-gray-900 group-hover:text-white">{alt.agent.name}</p>
                      <div className="mt-1">
                        {alt.zoneSignal==="strong"&&bdg("green","✓ Area")}
                        {alt.zoneSignal==="flag"&&bdg("red","⚠ Flag")}
                        {alt.zoneSignal==="ok"&&bdg("amber","Area ok")}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* None of these? Quick-pick from full roster */}
            {appState&&(()=>{
              const priceVal=slot.price?parseFloat(slot.price.replace(/[^0-9.]/g,"")):null;
              const shownIds=new Set([slot.rec!.agent.id,...slot.rec!.alternatives.map(a=>a.agent.id)]);
              const allAgents=[...appState.agents]
                .filter(a=>!shownIds.has(a.id)&&!(a as any).referOut&&!(a as any).offTeam)
                .sort((a,b)=>a.name.localeCompare(b.name));
              return(
                <div className="mt-3">
                  <button onClick={()=>updateSlot(slot.id,{quickPickOpen:!slot.quickPickOpen})}
                    className="text-xs font-black text-gray-500 hover:text-gray-900 underline underline-offset-2">
                    {slot.quickPickOpen?"▲ Hide":"▼ None of these? Pick someone else"}
                  </button>
                  {slot.quickPickOpen&&(
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {allAgents.map(a=>{
                        const elig=isEligible(a,slot.leadType,priceVal,slot.isRental,slot.direction,slot.isCash);
                        const sig=zoneSignal(a,slot.zone);
                        const isPending=slot.pendingAgentIds.includes(a.id);
                        return(
                          <button key={a.id} onClick={()=>!isPending&&handleAccept(slot.id,a.id)}
                            title={!elig.ok?elig.reason||"Ineligible":""}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-colors
                              ${isPending?"border-gray-200 text-gray-300 bg-gray-50 cursor-not-allowed":
                                !elig.ok?"border-gray-100 text-gray-400 bg-gray-50":
                                sig==="flag"?"border-red-200 text-red-700 bg-red-50 hover:bg-red-700 hover:text-white":
                                sig==="strong"?"border-green-200 text-green-800 bg-green-50 hover:bg-green-700 hover:text-white":
                                "border-gray-200 text-gray-700 hover:border-gray-900 hover:bg-gray-900 hover:text-white"}`}>
                            {a.name}
                            {isPending&&" 🔒"}
                            {!isPending&&!elig.ok&&" (ineligible)"}
                            {!isPending&&elig.ok&&sig==="flag"&&" ⚠"}
                            {!isPending&&elig.ok&&sig==="strong"&&" ✓"}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* Pass modal */}
        {slot.showPass&&(
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-[420px] max-w-[90vw] shadow-2xl border-2 border-gray-200">
              <p className="font-black text-base text-gray-900 mb-1">Log pass reason</p>
              <p className="text-sm font-medium text-gray-600 mb-4">Required before moving to next agent.</p>
              <div className="space-y-2">
                {PASS_REASONS.map(r=>(
                  <div key={r.id} onClick={()=>updateSlot(slot.id,{passReason:r.id})}
                    className={`px-4 py-3 rounded-lg border-2 cursor-pointer transition-colors ${slot.passReason===r.id?"border-gray-900 bg-gray-50":"border-gray-200 hover:border-gray-400"}`}>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-sm text-gray-900">{r.label}</span>
                      {r.isCherryPick&&bdg("red","Flags agent")}
                      {r.id==="timed_out"&&bdg("amber","No flag")}
                      {r.id==="legit"&&bdg("green","No flag")}
                    </div>
                    {r.examples&&<p className="text-xs font-semibold text-gray-500 mt-1">{r.examples}</p>}
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={()=>handlePassConfirm(slot.id)} disabled={!slot.passReason}
                  className="bg-gray-900 text-white px-5 py-2 rounded-lg text-sm font-bold disabled:opacity-40 hover:bg-gray-800">
                  Confirm &amp; find next
                </button>
                <button onClick={()=>updateSlot(slot.id,{showPass:false,timerActive:slot.timerSecs>0})}
                  className="border-2 border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Today log ────────────────────────────────────────────────────────────────
  const todayLog=log.filter(l=>l.logged_at>new Date(new Date().setHours(0,0,0,0)).toISOString());

  // ── Render ──────────────────────────────────────────────────────────────────
  if(loading)return<div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-700 font-semibold">Loading routing tool…</p></div>;
  if(!appState)return<div className="p-8 text-red-700 font-bold">Failed to load. Check Supabase connection.</div>;

  return(
    <div className="min-h-screen bg-gray-50" style={{colorScheme:"light"}}>
      {/* Header */}
      <div className="bg-gray-900 text-white px-6 py-4 flex items-center justify-between">
        <span className="font-black text-lg tracking-wide">JLG · Lead Routing</span>
        <nav className="flex gap-1">
          {(["assign","roster","tracker","dev","admin"] as const).map(v=>(
            <button key={v} onClick={()=>setView(v)}
              className={`px-4 py-1.5 rounded text-sm font-bold capitalize transition-colors ${view===v?"bg-white text-gray-900":"text-white/80 hover:text-white hover:bg-white/10"}`}>
              {v==="assign"?"Assign lead":v==="tracker"?"Tracker":v==="dev"?"Dev communities":v}
            </button>
          ))}
        </nav>
      </div>

      <div className="max-w-4xl mx-auto px-5 py-6">

        {/* ── ASSIGN ── */}
        {view==="assign"&&(
          <div>
            {slots.map(slot=>renderSlot(slot))}
            <button onClick={()=>setSlots(prev=>[...prev,buildSlot(prev.length+1)])}
              className="w-full border-2 border-dashed border-gray-300 text-gray-600 py-2.5 rounded-xl text-sm font-bold hover:border-gray-500 hover:text-gray-900 transition-colors mb-4">
              + Open second handoff slot
            </button>
            {todayLog.length>0&&(
              <div className="bg-white rounded-xl border-2 border-gray-200 p-5">
                <p className="font-black text-gray-900 mb-3">Today's handoffs</p>
                <table className="w-full text-xs">
                  <thead><tr className="border-b-2 border-gray-200">
                    {["Agent","Type","Price","Location","Staff","Type","Status","Time"].map(h=>(
                      <th key={h} className="text-left pb-2 text-gray-600 font-black">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {todayLog.map((l,i)=>(
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-2 font-black text-gray-900">{l.agent_name}</td>
                        <td className="py-2 font-semibold text-gray-800">{l.lead_type}</td>
                        <td className="py-2 font-semibold text-gray-800">{l.price?`$${parseInt(l.price).toLocaleString()}`:"—"}</td>
                        <td className="py-2 font-semibold text-gray-800">{ZONES.find(z=>z.id===l.zone)?.label?.split(" ")[0]??"—"}</td>
                        <td className="py-2 font-semibold text-gray-800">{(l as any).staff_name||"—"}</td>
                        <td className="py-2 font-bold text-gray-800">{l.source}</td>
                        <td className="py-2">{l.status==="accepted"?bdg("green","Accepted"):l.is_cherry_pick?bdg("red","Cherry-pick"):l.pass_reason==="timed_out"?bdg("amber","Timed out"):bdg("amber","Passed")}</td>
                        <td className="py-2 font-semibold text-gray-600">{new Date(l.logged_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── ROSTER ── */}
        {view==="roster"&&(
          <div>
            <p className="font-black text-gray-900 text-base mb-4">Agent roster</p>
            <div className="space-y-2">
              {[...appState.agents].sort((a,b)=>a.name.localeCompare(b.name)).map(agent=>{
                const wt=weightedCount(agent.id);
                const pct=Math.min(100,(wt/agent.monthlyCapISA)*100);
                const passes=passCount(agent.id);
                const cherry=cherryPickCount(agent.id);
                const timedOut=timedOutCount(agent.id);
                return(
                  <div key={agent.id} className={`bg-white rounded-xl border-2 p-4 ${(agent as any).offTeam?"opacity-40 bg-gray-50 border-gray-100":agent.onVacation?"border-l-4 border-amber-400 border-gray-200":"border-gray-200"}`}>
                    <div className="flex justify-between items-start">
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <span className="font-black text-gray-900 text-sm">{agent.name}</span>
                        {agent.role==="partner"&&bdg("blue","Partner")}
                        {agent.role==="jr_partner"&&bdg("blue","Jr Partner")}
                        {(agent as any).referOut&&bdg("purple","Refer out")}
                        {agent.listingsOnly&&bdg("amber","Listings only")}
                        {agent.listingEligible&&!agent.listingsOnly&&bdg("green","Listings ✓")}
                        {agent.takesRentals&&bdg("purple","Rentals")}
                        {(agent as any).cashOffer&&bdg("blue","💵 Cash")}
                        {(agent as any).offTeam&&bdg("gray","Off team")}
                        {agent.onVacation&&bdg("amber",`🌴 Vacation${agent.returnDate?` · back ${new Date(agent.returnDate+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}`:""}`)}
                      </div>
                      <span className="text-xs font-bold text-gray-600">{agent.conversionOverall?`${agent.conversionOverall}% conv.`:""}</span>
                    </div>
                    <div className="flex gap-4 text-xs font-semibold text-gray-700 mt-1.5 flex-wrap">
                      <span>Buyer: {formatPrice(agent.buyerFloor)} – {formatPrice(agent.buyerMax)}</span>
                      {agent.listingEligible&&<span>Seller: {formatPrice(agent.sellerFloor)} – {formatPrice(agent.sellerMax)}</span>}
                      <span>Cap: {agent.monthlyCapISA}/mo</span>
                    </div>
                    <div className="mt-2">
                      <div className="flex justify-between text-xs font-bold text-gray-600 mb-1">
                        <span>{wt.toFixed(1)} / {agent.monthlyCapISA} weighted leads</span>
                        <span>{Math.round(pct)}%</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded overflow-hidden">
                        <div className="h-full rounded" style={{width:`${pct}%`,background:pct>=100?"#dc2626":pct>=75?"#d97706":"#15803d"}}/>
                      </div>
                    </div>
                    {(passes>0||timedOut>0||cherry>0)&&(
                      <div className="mt-2 flex gap-2 flex-wrap text-xs">
                        {passes>0&&<span className="font-bold text-gray-600">Passes: {passes}</span>}
                        {timedOut>0&&bdg("amber",`${timedOut} timed out`)}
                        {cherry>0&&bdg("red",`${cherry} cherry-pick`)}
                      </div>
                    )}
                    {agent.devCommunities?.length>0&&(
                      <p className="text-xs font-semibold text-gray-600 mt-1">Dev: {agent.devCommunities.map(d=>DEV_COMMUNITIES.find(x=>x.id===d)?.label).join(", ")}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── TRACKER ── */}
        {view==="tracker"&&(
          <div>
            <div className="flex justify-between items-center mb-1">
              <p className="font-black text-gray-900 text-base">Handoff tracker</p>
              <button onClick={()=>{
                if(!editTracker){
                  const draft:Record<string,{accepted:number,passes:number}>={};
                  appState.agents.filter(a=>!a.referOut).forEach(a=>{
                    draft[a.id]={accepted:Math.round(weightedCount(a.id)),passes:passCount(a.id)};
                  });
                  setTrackerDraft(draft);
                }
                setEditTracker(!editTracker);
              }} className="border-2 border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-50">
                {editTracker?"Cancel edit":"✏ Edit starting counts"}
              </button>
            </div>
            <p className="text-sm font-semibold text-gray-600 mb-4">
              {editTracker?"Set the correct starting counts for each agent, then save.":"Live count of offers, accepts, passes, and last offer date for the month."}
            </p>
            {editTracker&&(
              <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 mb-4">
                <p className="text-xs font-black text-amber-800 uppercase mb-3">Edit starting counts</p>
                <div className="space-y-2">
                  {[...appState.agents].filter(a=>!a.referOut&&!(a as any).offTeam).sort((a,b)=>a.name.localeCompare(b.name)).map(agent=>(
                    <div key={agent.id} className="flex items-center gap-4">
                      <span className="font-black text-gray-900 text-sm w-28 shrink-0">{agent.name}</span>
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-gray-600">Handoffs:</label>
                        <input type="number" min="0"
                          className="w-16 border-2 border-gray-200 rounded px-2 py-1 text-sm font-bold text-gray-900"
                          value={trackerDraft[agent.id]?.accepted??0}
                          onChange={e=>setTrackerDraft(d=>({...d,[agent.id]:{...d[agent.id],accepted:parseInt(e.target.value)||0}}))}/>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-gray-600"># No:</label>
                        <input type="number" min="0"
                          className="w-16 border-2 border-gray-200 rounded px-2 py-1 text-sm font-bold text-gray-900"
                          value={trackerDraft[agent.id]?.passes??0}
                          onChange={e=>setTrackerDraft(d=>({...d,[agent.id]:{...d[agent.id],passes:parseInt(e.target.value)||0}}))}/>
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={()=>{
                  const newCounts:Record<string,number>={};
                  const newPasses:Record<string,number>={};
                  Object.entries(trackerDraft).forEach(([id,v])=>{
                    if(v.accepted>0)newCounts[id]=v.accepted;
                    if(v.passes>0)newPasses[id]=v.passes;
                  });
                  setSeedCounts(newCounts);
                  setSeedPasses(newPasses);
                  setEditTracker(false);
                }} className="mt-4 bg-gray-900 text-white px-5 py-2 rounded-lg text-sm font-bold hover:bg-gray-800">
                  Save starting counts
                </button>
              </div>
            )}
            <div className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-900 text-white">
                    {["Agent","Handoffs MTD","Timeouts","Legit pass","Cherry-pick","Last offer date"].map(h=>(
                      <th key={h} className="text-left px-4 py-3 font-black text-xs uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...appState.agents].filter(a=>!a.referOut).sort((a,b)=>a.name.localeCompare(b.name)).map((agent,i)=>{
                    const accepted=Math.round(weightedCount(agent.id));
                    const passes=passCount(agent.id);
                    const last=lastOfferDate(agent.id);
                    return(
                      <tr key={agent.id} className={`border-b border-gray-100 ${i%2===1?"bg-gray-50":""}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-gray-900">{agent.name}</span>
                            {agent.onVacation&&bdg("amber","🌴")}
                            {(agent as any).offTeam&&bdg("gray","Off team")}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-black text-gray-900 text-lg">{accepted||0}</td>
                        <td className="px-4 py-3 font-semibold text-gray-700">{timedOutCount(agent.id)||<span className="text-gray-400">—</span>}</td>
                        <td className="px-4 py-3 font-semibold text-gray-700">{log.filter(l=>l.agent_id===agent.id&&l.pass_reason==="legit").length||<span className="text-gray-400">—</span>}</td>
                        <td className="px-4 py-3">
                          {cherryPickCount(agent.id)>0?<span className="font-black text-red-700">{cherryPickCount(agent.id)}</span>:<span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-700">
                          {last?new Date(last).toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"numeric"}):<span className="text-gray-400">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Staff breakdown */}
            <div className="mt-6">
              <p className="font-black text-gray-900 text-sm mb-3">Handoffs by staff member</p>
              <div className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="bg-gray-900 text-white">
                    {["Staff","Inbound","Outbound","Total"].map(h=>(
                      <th key={h} className="text-left px-4 py-3 font-black text-xs uppercase tracking-wide">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {STAFF.map((name,i)=>{
                      const inbound=log.filter(l=>l.status==="accepted"&&(l as any).staff_name===name&&l.source==="inbound").length+(seedCounts[`staff_in_${name}`]??0);
                      const outbound=log.filter(l=>l.status==="accepted"&&(l as any).staff_name===name&&l.source==="outbound").length+(seedCounts[`staff_out_${name}`]??0);
                      return(
                        <tr key={name} className={`border-b border-gray-100 ${i%2===1?"bg-gray-50":""}`}>
                          <td className="px-4 py-3 font-black text-gray-900">{name}</td>
                          <td className="px-4 py-3 font-semibold text-gray-700">{inbound||"—"}</td>
                          <td className="px-4 py-3 font-semibold text-gray-700">{outbound||"—"}</td>
                          <td className="px-4 py-3 font-black text-gray-900">{inbound+outbound||"—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── DEV COMMUNITIES ── */}
        {view==="dev"&&(
          <div>
            <p className="font-black text-gray-900 text-base mb-1">New development communities</p>
            <p className="text-sm font-semibold text-gray-600 mb-4">Independent round robins — don't affect the main rotation.</p>
            <div className="space-y-4">
              {DEV_COMMUNITIES.map(com=>{
                const pool=appState.agents.filter(a=>a.devCommunities?.includes(com.id)&&a.active&&!a.onVacation&&!(a as any).offTeam);
                const nextIdx=pool.length?(appState.devRotations[com.id]??0)%pool.length:0;
                return(
                  <div key={com.id} className="bg-white rounded-xl border-2 border-gray-200 p-5">
                    <p className="font-black text-gray-900 text-sm mb-3">{com.label}</p>
                    <div className="flex gap-2 flex-wrap">
                      {pool.map((agent,i)=>(
                        <div key={agent.id} className={`px-4 py-2 rounded-lg text-sm font-bold border-2 ${i===nextIdx?"border-gray-900 bg-gray-900 text-white":"border-gray-200 text-gray-800"}`}>
                          {agent.name}{i===nextIdx&&<span className="ml-2 text-xs opacity-70">← next up</span>}
                        </div>
                      ))}
                      {!pool.length&&<p className="text-sm font-semibold text-gray-500">No active agents.</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── ADMIN ── */}
        {view==="admin"&&(
          <div>
            <p className="font-black text-gray-900 text-base mb-1">Admin — agent settings</p>
            <p className="text-sm font-semibold text-gray-600 mb-4">Changes take effect immediately for all users.</p>
            <div className="space-y-2">
              {[...appState.agents].sort((a,b)=>a.name.localeCompare(b.name)).map(agent=>(
                <div key={agent.id} className="bg-white rounded-xl border-2 border-gray-200 p-4">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-gray-900">{agent.name}</span>
                      {agent.onVacation&&bdg("amber",`🌴 Vacation${agent.returnDate?` · back ${new Date(agent.returnDate+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}`:""}`)}
                      {(agent as any).offTeam&&bdg("gray","Off team")}
                    </div>
                    <button onClick={()=>{if(editingId===agent.id){setEditingId(null);setEditDraft(null);}else{setEditingId(agent.id);setEditDraft({...agent});}}}
                      className="border-2 border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-50">
                      {editingId===agent.id?"Cancel":"Edit"}
                    </button>
                  </div>

                  {editingId===agent.id&&editDraft&&(
                    <div className="mt-4 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        {[["Buyer floor","buyerFloor"],["Buyer max (blank = no cap)","buyerMax"],["Seller floor","sellerFloor"],["Seller max (blank = no cap)","sellerMax"]].map(([lbl,key])=>(
                          <div key={key}>
                            <label className="block text-xs font-black text-gray-500 uppercase mb-1">{lbl}</label>
                            <input type="number" className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold text-gray-800"
                              value={(editDraft as any)[key]??""} onChange={e=>setEditDraft(d=>d?{...d,[key]:parseInt(e.target.value)||null}:d)}/>
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-black text-gray-500 uppercase mb-1">Monthly cap</label>
                          <input type="number" className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold text-gray-800"
                            value={editDraft.monthlyCapISA} onChange={e=>setEditDraft(d=>d?{...d,monthlyCapISA:parseInt(e.target.value)||1}:d)}/>
                        </div>
                        <div>
                          <label className="block text-xs font-black text-gray-500 uppercase mb-1">Overall conv. %</label>
                          <input type="number" className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold text-gray-800"
                            value={editDraft.conversionOverall??""} onChange={e=>setEditDraft(d=>d?{...d,conversionOverall:parseInt(e.target.value)||null}:d)}/>
                        </div>
                        <div>
                          <label className="block text-xs font-black text-gray-500 uppercase mb-1">Listing conv. %</label>
                          <input type="number" className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold text-gray-800"
                            value={editDraft.conversionListing??""} onChange={e=>setEditDraft(d=>d?{...d,conversionListing:parseInt(e.target.value)||null}:d)}/>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-black text-gray-500 uppercase mb-1">Vacation start (auto-pauses)</label>
                          <input type="date" className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold text-gray-800"
                            value={(editDraft as any).vacationStart??""} onChange={e=>setEditDraft(d=>d?{...d,vacationStart:e.target.value||null} as any:d)}/>
                        </div>
                        <div>
                          <label className="block text-xs font-black text-gray-500 uppercase mb-1">Return date (auto-unpauses)</label>
                          <input type="date" className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold text-gray-800"
                            value={editDraft.returnDate??""} onChange={e=>setEditDraft(d=>d?{...d,returnDate:e.target.value||null}:d)}/>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-4">
                        {[["Listing eligible","listingEligible"],["Listings only","listingsOnly"],["Buyers only","buyerOnly"],
                          ["Active in rotation","active"],["Takes rentals","takesRentals"],
                          ["💵 Cash offer expert","cashOffer"],["🌴 On vacation","onVacation"],
                          ["🚫 No longer on team","offTeam"]].map(([lbl,key])=>(
                          <label key={key} className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-gray-700">
                            <div onClick={()=>setEditDraft(d=>d?{...d,[key]:!(d as any)[key]}:d)}
                              className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer ${(editDraft as any)[key]?"bg-green-600":"bg-gray-300"}`}>
                              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${(editDraft as any)[key]?"left-4":"left-0.5"}`}/>
                            </div>
                            {lbl}
                          </label>
                        ))}
                      </div>
                      <div>
                        <label className="block text-xs font-black text-gray-500 uppercase mb-1">Zone flags (poor fit areas)</label>
                        <div className="flex flex-wrap gap-2">
                          {ZONES.map(z=>{
                            const flagged=editDraft.zoneFlags?.includes(z.id);
                            return<button key={z.id} onClick={()=>setEditDraft(d=>d?{...d,zoneFlags:flagged?d.zoneFlags.filter(f=>f!==z.id):[...d.zoneFlags,z.id]}:d)}
                              className={`px-3 py-1 rounded-full text-xs font-bold border-2 transition-colors ${flagged?"border-red-300 bg-red-50 text-red-700":"border-gray-200 text-gray-700 hover:border-gray-400"}`}>
                              {z.label.split(" ")[0]} {flagged?"⚠":""}
                            </button>;
                          })}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-black text-gray-500 uppercase mb-1">Development communities</label>
                        <div className="flex flex-wrap gap-2">
                          {DEV_COMMUNITIES.map(d=>{
                            const inCom=editDraft.devCommunities?.includes(d.id);
                            return<button key={d.id} onClick={()=>setEditDraft(dr=>dr?{...dr,devCommunities:inCom?dr.devCommunities.filter(x=>x!==d.id):[...dr.devCommunities,d.id]}:dr)}
                              className={`px-3 py-1 rounded-full text-xs font-bold border-2 transition-colors ${inCom?"border-green-300 bg-green-50 text-green-700":"border-gray-200 text-gray-700 hover:border-gray-400"}`}>
                              {d.label} {inCom?"✓":""}
                            </button>;
                          })}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-black text-gray-500 uppercase mb-1">Agent notes</label>
                        <textarea className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold text-gray-800 resize-none" rows={3}
                          value={editDraft.notes??""} onChange={e=>setEditDraft(d=>d?{...d,notes:e.target.value}:d)}/>
                      </div>
                      <button onClick={handleSaveAgent} className="bg-gray-900 text-white px-5 py-2 rounded-lg text-sm font-bold hover:bg-gray-800">Save changes</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
