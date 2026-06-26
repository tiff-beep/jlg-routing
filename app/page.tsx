"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  INITIAL_AGENTS, ZONES, DEV_COMMUNITIES, PASS_REASONS, SUB250K_POOL,
  buildRotation, formatPrice, Agent, LeadType, Source, Zone
} from "@/lib/agents";

// ── Types ─────────────────────────────────────────────────────────────────────
interface AppState {
  buyerRotation: string[];
  osaRotation: string[];
  listingRotation: string[];
  osaListingRotation: string[];
  buySellRotation: string[];
  devRotations: Record<string, number>;
  agents: Agent[];
  month: string;
}

interface LogEntry {
  agent_id: string;
  agent_name: string;
  lead_type: string;
  price: string | null;
  zone: string | null;
  source: string;
  status: "accepted" | "passed";
  pass_reason: string | null;
  is_cherry_pick: boolean;
  logged_at: string;
}

interface Rec {
  agent: Agent;
  zoneSignal: "strong" | "ok" | "flag";
  alternatives: { agent: Agent; zoneSignal: "strong" | "ok" | "flag" }[];
  isDev?: boolean;
  community?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function zoneSignal(agent: Agent, zoneId: string): "strong" | "ok" | "flag" {
  if (!zoneId || zoneId === "other") return "ok";
  if (agent.zoneFlags?.includes(zoneId as Zone)) return "flag";
  if (agent.zones?.includes(zoneId as Zone)) return "strong";
  return "ok";
}

function badge(color: string, text: string) {
  const colors: Record<string, string> = {
    green:  "bg-emerald-100 text-emerald-800",
    amber:  "bg-amber-100 text-amber-800",
    red:    "bg-red-100 text-red-800",
    blue:   "bg-blue-100 text-blue-800",
    purple: "bg-purple-100 text-purple-800",
    gray:   "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${colors[color] ?? colors.gray}`}>
      {text}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Home() {
  const [appState, setAppState] = useState<AppState | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [view, setView] = useState<"assign" | "roster" | "dev" | "admin">("assign");
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Lead form
  const [leadType, setLeadType] = useState<LeadType>("buyer");
  const [price, setPrice] = useState("");
  const [zone, setZone] = useState("");
  const [source, setSource] = useState<Source>("isa");
  const [isDevLead, setIsDevLead] = useState(false);
  const [devCommunity, setDevCommunity] = useState("");
  const [isRental, setIsRental] = useState(false);
  const [isCash, setIsCash] = useState(false);

  // Recommendation + timer
  const [rec, setRec] = useState<Rec | null>(null);
  const [timerSecs, setTimerSecs] = useState(0);
  const [timerActive, setTimerActive] = useState(false);

  // Pass modal
  const [showPass, setShowPass] = useState(false);
  const [passingId, setPassingId] = useState("");
  const [passReason, setPassReason] = useState("");

  // Admin
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Agent | null>(null);

  // ── Data fetching ───────────────────────────────────────────────────────────
  const fetchState = useCallback(async () => {
    const [stateRes, logRes] = await Promise.all([
      fetch("/api/state"),
      fetch("/api/log"),
    ]);
    const stateData = await stateRes.json();
    const logData = await logRes.json();
    setAppState(stateData);
    setLog(logData);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchState();
    const id = setInterval(fetchState, 5000);
    pollRef.current = id;
    return () => clearInterval(id);
  }, [fetchState]);

  // Auto-apply vacation start dates — pause agents when their vacationStart date hits
  useEffect(() => {
    if (!appState) return;
    const today = new Date().toISOString().split("T")[0];
    const updated = appState.agents.map((a: any) => {
      if (!a.onVacation && a.vacationStart && a.vacationStart <= today) {
        return { ...a, onVacation: true };
      }
      return a;
    });
    const changed = updated.some((a: any, i: number) => a.onVacation !== appState.agents[i].onVacation);
    if (changed) saveState({ agents: updated });
  }, [appState?.agents]);

  const saveState = async (patch: Partial<AppState>) => {
    await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setAppState(prev => prev ? { ...prev, ...patch } : prev);
  };

  const appendLog = async (entry: Partial<LogEntry>) => {
    await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
    setLog(prev => [entry as LogEntry, ...prev]);
  };

  // ── Timer ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!timerActive) return;
    if (timerSecs <= 0) { handleTimeout(); return; }
    const t = setTimeout(() => setTimerSecs(s => s - 1), 1000);
    return () => clearTimeout(t);
  });

  const handleTimeout = () => {
    if (!rec) return;
    appendLog({ agent_id: rec.agent.id, agent_name: rec.agent.name, lead_type: leadType, price: price || null, zone: zone || null, source, status: "passed", pass_reason: "timeout", is_cherry_pick: true, logged_at: new Date().toISOString() });
    advanceRotation(rec.agent.id, true);
    setRec(null);
    setTimerActive(false);
  };

  // ── Capacity helpers ────────────────────────────────────────────────────────
  const weightedCount = (agentId: string) =>
    log.filter(l => l.agent_id === agentId && l.status === "accepted")
       .reduce((s, l) => s + (l.source === "osa" ? 0.25 : 1), 0);

  const lastWasOSA = (agentId: string) => {
    const accepted = log.filter(l => l.agent_id === agentId && l.status === "accepted");
    if (!accepted.length) return false;
    const last = accepted.reduce((a, b) => a.logged_at > b.logged_at ? a : b);
    return last.source === "osa";
  };

  // ── Eligibility ─────────────────────────────────────────────────────────────
  const isEligible = (agent: Agent, type: LeadType, priceVal: number | null, rental: boolean, src: Source): { ok: boolean; reason?: string } => {
    if (!agent.active)      return { ok: false, reason: "Inactive" };
    if ((agent as any).offTeam) return { ok: false, reason: "Off team" };
    if (agent.onVacation)   return { ok: false, reason: "On vacation" };
    if (rental && !agent.takesRentals) return { ok: false, reason: "No rentals" };
    if (type === "seller" && (agent.buyerOnly || !agent.listingEligible)) return { ok: false, reason: "Not listing eligible" };
    if (type === "buyer"  && agent.listingsOnly) return { ok: false, reason: "Listings only" };
    const floor = type === "seller" ? agent.sellerFloor : agent.buyerFloor;
    const ceil  = type === "seller" ? agent.sellerMax   : agent.buyerMax;
    if (priceVal && floor && priceVal < floor) return { ok: false, reason: `Below floor (${formatPrice(floor)})` };
    if (priceVal && ceil  && priceVal > ceil)  return { ok: false, reason: `Above max (${formatPrice(ceil)})` };
    if (weightedCount(agent.id) >= agent.monthlyCapISA && !agent.referOut) return { ok: false, reason: "At capacity" };
    if (src === "osa" && lastWasOSA(agent.id)) return { ok: false, reason: "Skip — last lead was OSA" };
    return { ok: true };
  };

  // Cash-eligible filter applied at recommendation level
  const cashEligible = (agent: Agent) => !!(agent as any).cashOffer;

  // ── Rotation helpers ────────────────────────────────────────────────────────
  const getRotation = (type: LeadType, src: Source): string[] => {
    if (!appState) return [];
    const isOSA = src === "osa";
    if (type === "seller") return isOSA ? appState.osaListingRotation : appState.listingRotation;
    if (type === "buysell") return isOSA ? appState.osaListingRotation : appState.buySellRotation;
    return isOSA ? appState.osaRotation : appState.buyerRotation;
  };

  const advanceRotation = (agentId: string, isPass = false) => {
    if (!appState) return;
    if (isDevLead && devCommunity) {
      saveState({ devRotations: { ...appState.devRotations, [devCommunity]: (appState.devRotations[devCommunity] ?? 0) + 1 } });
      return;
    }
    const advance = (list: string[]) => {
      const idx = list.indexOf(agentId);
      if (idx === -1) return list;
      return [...list.slice(idx + 1), ...list.slice(0, idx + 1)];
    };
    const isOSA = source === "osa";
    const patch: Partial<AppState> = {};
    if (leadType === "seller") {
      if (isOSA) patch.osaListingRotation = advance(appState.osaListingRotation);
      else        patch.listingRotation    = advance(appState.listingRotation);
    } else if (leadType === "buysell") {
      if (isOSA) patch.osaListingRotation = advance(appState.osaListingRotation);
      else        patch.buySellRotation    = advance(appState.buySellRotation);
    } else {
      if (isOSA) patch.osaRotation   = advance(appState.osaRotation);
      else        patch.buyerRotation = advance(appState.buyerRotation);
    }
    saveState(patch);
  };

  // ── Find recommendation ─────────────────────────────────────────────────────
  const findRec = (): Rec | null => {
    if (!appState) return null;
    const priceVal = price ? parseFloat(price.replace(/[^0-9.]/g, "")) : null;

    // Sub-$250k pool
    if (priceVal && priceVal <= 250000) {
      const subRot = appState.buyerRotation.filter(id => SUB250K_POOL.includes(id));
      for (const id of subRot) {
        const agent = appState.agents.find(a => a.id === id);
        if (!agent || !agent.active || agent.onVacation) continue;
        if (weightedCount(agent.id) >= agent.monthlyCapISA && !agent.referOut) continue;
        const alts = subRot.filter(i => i !== id).map(i => appState.agents.find(a => a.id === i)!).filter(Boolean).filter(a => a.active && !a.onVacation);
        return { agent, zoneSignal: "strong", alternatives: alts.slice(0, 2).map(a => ({ agent: a, zoneSignal: "strong" as const })) };
      }
      return null;
    }

    // Dev community
    if (isDevLead && devCommunity) {
      const pool = appState.agents.filter(a => a.devCommunities?.includes(devCommunity) && a.active && !a.onVacation);
      if (!pool.length) return null;
      const idx = (appState.devRotations[devCommunity] ?? 0) % pool.length;
      return { agent: pool[idx], zoneSignal: "strong", alternatives: [], isDev: true, community: devCommunity };
    }

    const rotList = getRotation(leadType, source);
    let found: Rec | null = null;
    const alts: { agent: Agent; zoneSignal: "strong" | "ok" | "flag" }[] = [];

    for (const id of rotList) {
      const agent = appState.agents.find(a => a.id === id);
      if (!agent) continue;
      const elig = isEligible(agent, leadType, priceVal, isRental, source);
      if (!elig.ok) continue;
      if (isCash && !cashEligible(agent)) continue;
      const sig = zoneSignal(agent, zone);
      if (!found) { found = { agent, zoneSignal: sig, alternatives: [] }; }
      else { alts.push({ agent, zoneSignal: sig }); if (alts.length >= 2) break; }
    }
    if (!found) return null;
    // Promote strong-match alt if primary has zone flag
    if (found.zoneSignal === "flag") {
      const strong = alts.find(a => a.zoneSignal === "strong");
      if (strong) {
        found = { ...strong, alternatives: [{ agent: found.agent, zoneSignal: found.zoneSignal }, ...alts.filter(a => a.agent.id !== strong.agent.id)].slice(0, 2) };
        return found;
      }
    }
    return { ...found, alternatives: alts.slice(0, 2) };
  };

  // ── Actions ─────────────────────────────────────────────────────────────────
  const handleFind = () => {
    const r = findRec();
    setRec(r);
    // Timer does NOT auto-start — ISA/OSA starts it manually after reaching out
  };

  const handleStartTimer = () => {
    setTimerSecs(1200);
    setTimerActive(true);
  };

  const handleAccept = (agentId: string) => {
    const agent = appState?.agents.find(a => a.id === agentId);
    if (!agent) return;
    appendLog({ agent_id: agentId, agent_name: agent.name, lead_type: leadType, price: price || null, zone: zone || null, source, status: "accepted", is_cherry_pick: false, logged_at: new Date().toISOString() });
    advanceRotation(agentId);
    setRec(null); setTimerActive(false);
    setLeadType("buyer"); setPrice(""); setZone(""); setSource("isa"); setIsDevLead(false); setDevCommunity(""); setIsRental(false); setIsCash(false);
  };

  const handlePassOpen = (agentId: string) => { setPassingId(agentId); setPassReason(""); setShowPass(true); };

  const handleSkip = (agentId: string) => {
    // ISA/OSA skip — agent keeps their rotation position, no log entry, just show next
    if (!appState) return;
    const priceVal = price ? parseFloat(price.replace(/[^0-9.]/g, "")) : null;
    const rotList = getRotation(leadType, source);
    const skippedIdx = rotList.indexOf(agentId);
    for (let i = 1; i < rotList.length; i++) {
      const id = rotList[(skippedIdx + i) % rotList.length];
      const a = appState.agents.find(x => x.id === id);
      if (!a) continue;
      if (!isEligible(a, leadType, priceVal, isRental, source).ok) continue;
      setRec({ agent: a, zoneSignal: zoneSignal(a, zone), alternatives: [] });
      return;
    }
    setRec(null);
  };

  const handlePassConfirm = () => {
    if (!passReason || !appState) return;
    const agent = appState.agents.find(a => a.id === passingId);
    appendLog({ agent_id: passingId, agent_name: agent?.name ?? "", lead_type: leadType, price: price || null, zone: zone || null, source, status: "passed", pass_reason: passReason, is_cherry_pick: passReason === "cherry_pick", logged_at: new Date().toISOString() });
    advanceRotation(passingId);
    setShowPass(false);
    // Find next
    const priceVal = price ? parseFloat(price.replace(/[^0-9.]/g, "")) : null;
    const rotList = getRotation(leadType, source);
    const skipped = rotList.indexOf(passingId);
    for (let i = 1; i < rotList.length; i++) {
      const id = rotList[(skipped + i) % rotList.length];
      const a = appState.agents.find(x => x.id === id);
      if (!a) continue;
      if (!isEligible(a, leadType, priceVal, isRental, source).ok) continue;
      setRec({ agent: a, zoneSignal: zoneSignal(a, zone), alternatives: [] });
      // Timer not auto-started — user clicks start after reaching out
      return;
    }
    setRec(null);
  };

  const handleSaveAgent = () => {
    if (!editDraft || !appState) return;
    const newAgents = appState.agents.map(a => a.id === editDraft.id ? editDraft : a);
    saveState({ agents: newAgents });
    setEditingId(null); setEditDraft(null);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  const timerColor = timerSecs > 600 ? "#1D9E75" : timerSecs > 300 ? "#d97706" : "#dc2626";
  const timerPct = (timerSecs / 1200) * 100;

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-500 text-sm">Loading routing tool…</div>
    </div>
  );

  if (!appState) return <div className="p-8 text-red-600">Failed to load state. Check your Supabase connection.</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#1a1a2e] text-white px-6 py-4 flex items-center justify-between">
        <span className="font-bold text-lg tracking-wide">JLG · Lead Routing</span>
        <nav className="flex gap-1">
          {(["assign","roster","dev","admin"] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-4 py-1.5 rounded text-sm font-medium capitalize transition-colors ${view === v ? "bg-white text-[#1a1a2e]" : "text-white/70 hover:text-white"}`}>
              {v === "assign" ? "Assign lead" : v === "dev" ? "Dev communities" : v}
            </button>
          ))}
        </nav>
      </div>

      <div className="max-w-4xl mx-auto px-5 py-6">

        {/* ── ASSIGN ── */}
        {view === "assign" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="font-bold text-gray-900 mb-1">New lead handoff</p>
              <p className="text-sm text-gray-500 mb-5">Fill in what you know — the tool handles the rest.</p>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Lead type</label>
                  <div className="flex gap-2">
                    {(["buyer","seller","buysell"] as const).map(t => (
                      <button key={t} onClick={() => setLeadType(t)}
                        className={`flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition-colors ${leadType === t ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-gray-200 text-gray-700 hover:border-gray-300"}`}>
                        {t === "buysell" ? "Buy/Sell" : t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Source</label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" value={source} onChange={e => setSource(e.target.value as Source)}>
                    <option value="isa">ISA handoff</option>
                    <option value="osa">OSA handoff</option>
                    <option value="self">Self-generated</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Price point</label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="e.g. 450000" value={price} onChange={e => setPrice(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Zone / area</label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" value={zone} onChange={e => setZone(e.target.value)}>
                    <option value="">Select zone…</option>
                    {ZONES.map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex gap-6 mb-5">
                {[["Rental lead", isRental, setIsRental] as const, ["Dev community lead", isDevLead, (v: boolean) => { setIsDevLead(v); if (!v) setDevCommunity(""); }] as const, ["Cash offer", isCash, setIsCash] as const].map(([lbl, val, setter]) => (
                  <label key={lbl} className="flex items-center gap-2 cursor-pointer text-sm">
                    <div onClick={() => setter(!val)} className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer ${val ? "bg-emerald-500" : "bg-gray-200"}`}>
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${val ? "left-4" : "left-0.5"}`} />
                    </div>
                    {lbl}
                  </label>
                ))}
              </div>

              {isDevLead && (
                <div className="mb-5">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Community</label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" value={devCommunity} onChange={e => setDevCommunity(e.target.value)}>
                    <option value="">Select community…</option>
                    {DEV_COMMUNITIES.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                </div>
              )}

              <button onClick={handleFind} className="bg-[#1a1a2e] text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity">
                Find next agent →
              </button>
            </div>

            {/* Recommendation card */}
            {rec && (
              <div className="bg-white rounded-xl border-2 border-[#1a1a2e] p-5">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                      {rec.isDev ? DEV_COMMUNITIES.find(d => d.id === rec.community)?.label + " rotation" : "Recommended agent"}
                    </p>
                    <p className="text-2xl font-bold text-gray-900 flex items-center gap-2 flex-wrap">
                      {rec.agent.name}
                      {(rec.agent as any).cashOffer && badge("blue", "💵 Cash offers")}
                      {rec.zoneSignal === "strong" && badge("green", "✓ Good area match")}
                      {rec.zoneSignal === "flag"   && badge("red",   "⚠ Area mismatch — use judgment")}
                      {rec.zoneSignal === "ok"     && badge("amber", "Area ok")}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">{rec.agent.notes}</p>
                  </div>
                  <div className="text-center min-w-[72px]">
                    <p className="text-2xl font-bold" style={{ color: timerColor }}>
                      {Math.floor(timerSecs / 60)}:{String(timerSecs % 60).padStart(2, "0")}
                    </p>
                    <p className="text-xs text-gray-400">remaining</p>
                    <div className="h-1.5 bg-gray-100 rounded mt-1 overflow-hidden">
                      <div className="h-full rounded transition-all duration-1000" style={{ width: `${timerPct}%`, background: timerColor }} />
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mb-3 flex-wrap">
                  <button onClick={() => handleAccept(rec.agent.id)} className="bg-emerald-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-700">✓ Accepted</button>
                  <button onClick={() => handlePassOpen(rec.agent.id)} className="bg-red-500 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-red-600">✗ Pass / decline</button>
                  <button onClick={() => handleSkip(rec.agent.id)} className="bg-amber-500 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-amber-600">↷ Skip (better fit)</button>
                  <button onClick={() => { setRec(null); setTimerActive(false); }} className="ml-auto border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                </div>
                {!timerActive && (
                  <div className="mb-3">
                    <button onClick={handleStartTimer} className="w-full border-2 border-dashed border-gray-300 text-gray-500 py-2.5 rounded-lg text-sm font-medium hover:border-[#1a1a2e] hover:text-[#1a1a2e] transition-colors">
                      ▶ I've reached out — start 20-min timer
                    </button>
                  </div>
                )}
                {timerActive && (
                  <p className="text-xs text-gray-400 mb-3">Timer running — waiting for agent response.</p>
                )}
                {rec.alternatives.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 mb-2">Also eligible in rotation:</p>
                    <div className="flex gap-2">
                      {rec.alternatives.map(alt => (
                        <div key={alt.agent.id} onClick={() => handleAccept(alt.agent.id)}
                          className="flex-1 border border-gray-200 rounded-lg p-3 cursor-pointer hover:bg-gray-50 transition-colors">
                          <p className="font-semibold text-sm">{alt.agent.name}</p>
                          <div className="mt-1">
                            {alt.zoneSignal === "strong" && badge("green", "✓ Area match")}
                            {alt.zoneSignal === "flag"   && badge("red",   "⚠ Area flag")}
                            {alt.zoneSignal === "ok"     && badge("amber", "Area ok")}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Today's log */}
            {log.filter(l => l.logged_at > new Date(new Date().setHours(0,0,0,0)).toISOString()).length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="font-bold text-gray-900 mb-3">Today's handoffs</p>
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-gray-100">
                    {["Agent","Type","Price","Zone","Source","Status","Time"].map(h => (
                      <th key={h} className="text-left pb-2 text-gray-400 font-semibold">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {log.filter(l => l.logged_at > new Date(new Date().setHours(0,0,0,0)).toISOString()).map((l, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-2 font-semibold">{l.agent_name}</td>
                        <td className="py-2">{l.lead_type}</td>
                        <td className="py-2">{l.price ? `$${parseInt(l.price).toLocaleString()}` : "—"}</td>
                        <td className="py-2">{ZONES.find(z => z.id === l.zone)?.label?.split(" ")[0] ?? "—"}</td>
                        <td className="py-2 uppercase">{l.source}</td>
                        <td className="py-2">
                          {l.status === "accepted" ? badge("green", "Accepted") : l.is_cherry_pick ? badge("red", "Cherry-pick flag") : badge("amber", "Passed")}
                        </td>
                        <td className="py-2 text-gray-400">{new Date(l.logged_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── ROSTER ── */}
        {view === "roster" && (
          <div>
            <p className="font-bold text-gray-900 text-base mb-4">Agent roster</p>
            <div className="space-y-2.5">
              {appState.agents.map(agent => {
                const wt = weightedCount(agent.id);
                const pct = Math.min(100, (wt / agent.monthlyCapISA) * 100);
                const passes = log.filter(l => l.agent_id === agent.id && l.status === "passed");
                const cherry = passes.filter(l => l.is_cherry_pick).length;
                return (
                  <div key={agent.id} className={`bg-white rounded-xl border p-4 ${agent.onVacation ? "border-l-4 border-l-amber-400 border-gray-200 opacity-70" : "border-gray-200"}`}>
                    <div className="flex justify-between items-start">
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <span className="font-bold text-sm">{agent.name}</span>
                        {agent.role === "partner"    && badge("blue",   "Partner")}
                        {agent.role === "jr_partner" && badge("blue",   "Jr Partner")}
                        {(agent as any).referOut     && badge("purple", "Refer out")}
                        {(agent as any).offTeam      && badge("gray",   "Off team")}
                        {agent.listingsOnly          && badge("amber",  "Listings only")}
                        {agent.listingEligible && !agent.listingsOnly && badge("green", "Listings ✓")}
                        {agent.takesRentals          && badge("purple", "Rentals")}
                        {(agent as any).cashOffer   && badge("blue",   "💵 Cash offers")}
                        {agent.onVacation && badge("amber", `🌴 On vacation${agent.returnDate ? ` · back ${new Date(agent.returnDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}`)}
                      </div>
                      <span className="text-xs text-gray-400">{agent.conversionOverall ? `${agent.conversionOverall}% conv.` : ""}</span>
                    </div>
                    <div className="flex gap-4 text-xs text-gray-600 mt-1.5 flex-wrap">
                      <span>Buyer: {formatPrice(agent.buyerFloor)} – {formatPrice(agent.buyerMax)}</span>
                      {agent.listingEligible && <span>Seller: {formatPrice(agent.sellerFloor)} – {formatPrice(agent.sellerMax)}</span>}
                      <span>Cap: {agent.monthlyCapISA}/mo</span>
                    </div>
                    <div className="mt-2.5">
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>{wt.toFixed(1)} / {agent.monthlyCapISA} weighted leads</span>
                        <span>{Math.round(pct)}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded overflow-hidden">
                        <div className="h-full rounded" style={{ width: `${pct}%`, background: pct >= 100 ? "#dc2626" : pct >= 75 ? "#d97706" : "#1D9E75" }} />
                      </div>
                    </div>
                    {passes.length > 0 && (
                      <div className="mt-2 text-xs text-gray-400 flex items-center gap-2">
                        Passes: {passes.length}
                        {cherry > 0 && badge("red", `${cherry} cherry-pick flag${cherry > 1 ? "s" : ""}`)}
                      </div>
                    )}
                    {agent.devCommunities?.length > 0 && (
                      <p className="text-xs text-gray-400 mt-1">Dev: {agent.devCommunities.map(d => DEV_COMMUNITIES.find(x => x.id === d)?.label).join(", ")}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── DEV COMMUNITIES ── */}
        {view === "dev" && (
          <div>
            <p className="font-bold text-gray-900 text-base mb-1">New development communities</p>
            <p className="text-sm text-gray-500 mb-4">Independent round robins — don't affect the main rotation.</p>
            <div className="space-y-4">
              {DEV_COMMUNITIES.map(com => {
                const pool = appState.agents.filter(a => a.devCommunities?.includes(com.id) && a.active && !a.onVacation);
                const nextIdx = pool.length ? (appState.devRotations[com.id] ?? 0) % pool.length : 0;
                return (
                  <div key={com.id} className="bg-white rounded-xl border border-gray-200 p-5">
                    <p className="font-bold text-sm mb-3">{com.label}</p>
                    <div className="flex gap-2 flex-wrap">
                      {pool.map((agent, i) => (
                        <div key={agent.id} className={`px-4 py-2 rounded-lg text-sm font-medium border-2 ${i === nextIdx ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-gray-200 text-gray-700"}`}>
                          {agent.name}{i === nextIdx && <span className="ml-2 text-xs opacity-70">← next up</span>}
                        </div>
                      ))}
                      {!pool.length && <p className="text-sm text-gray-400">No active agents available.</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── ADMIN ── */}
        {view === "admin" && (
          <div>
            <p className="font-bold text-gray-900 text-base mb-1">Admin — agent settings</p>
            <p className="text-sm text-gray-500 mb-4">Changes take effect immediately for all users.</p>
            <div className="space-y-2.5">
              {appState.agents.map(agent => (
                <div key={agent.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">{agent.name}</span>
                      {agent.onVacation && badge("amber", `🌴 On vacation${agent.returnDate ? ` · back ${new Date(agent.returnDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}`)}
                    </div>
                    <button onClick={() => {
                      if (editingId === agent.id) { setEditingId(null); setEditDraft(null); }
                      else { setEditingId(agent.id); setEditDraft({ ...agent }); }
                    }} className="border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg text-xs hover:bg-gray-50">
                      {editingId === agent.id ? "Cancel" : "Edit"}
                    </button>
                  </div>

                  {editingId === agent.id && editDraft && (
                    <div className="mt-4 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        {[["Buyer floor","buyerFloor"],["Buyer max (blank = no cap)","buyerMax"],["Seller floor","sellerFloor"],["Seller max (blank = no cap)","sellerMax"]].map(([lbl, key]) => (
                          <div key={key}>
                            <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">{lbl}</label>
                            <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                              value={(editDraft as any)[key] ?? ""}
                              onChange={e => setEditDraft(d => d ? { ...d, [key]: parseInt(e.target.value) || null } : d)} />
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Monthly cap</label>
                          <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                            value={editDraft.monthlyCapISA}
                            onChange={e => setEditDraft(d => d ? { ...d, monthlyCapISA: parseInt(e.target.value) || 1 } : d)} />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Overall conv. %</label>
                          <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                            value={editDraft.conversionOverall ?? ""}
                            onChange={e => setEditDraft(d => d ? { ...d, conversionOverall: parseInt(e.target.value) || null } : d)} />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Listing conv. %</label>
                          <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                            value={editDraft.conversionListing ?? ""}
                            onChange={e => setEditDraft(d => d ? { ...d, conversionListing: parseInt(e.target.value) || null } : d)} />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Vacation start date (auto-pauses on this date)</label>
                        <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                          value={(editDraft as any).vacationStart ?? ""}
                          onChange={e => setEditDraft(d => d ? { ...d, vacationStart: e.target.value || null } as any : d)} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Vacation return date (auto-unpauses on this date)</label>
                        <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                          value={editDraft.returnDate ?? ""}
                          onChange={e => setEditDraft(d => d ? { ...d, returnDate: e.target.value || null } : d)} />
                      </div>
                      <div className="flex flex-wrap gap-4">
                        {[
                          ["Listing eligible", "listingEligible"],
                          ["Listings only", "listingsOnly"],
                          ["Buyers only (no sellers)", "buyerOnly"],
                          ["Active in rotation", "active"],
                          ["Takes rentals", "takesRentals"],
                          ["💵 Cash offer expert", "cashOffer"],
                          ["🌴 On vacation", "onVacation"],
                          ["🚫 No longer on team", "offTeam"],
                        ].map(([lbl, key]) => (
                          <label key={key} className="flex items-center gap-2 cursor-pointer text-sm">
                            <div onClick={() => setEditDraft(d => d ? { ...d, [key]: !(d as any)[key] } : d)}
                              className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer ${(editDraft as any)[key] ? "bg-emerald-500" : "bg-gray-200"}`}>
                              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${(editDraft as any)[key] ? "left-4" : "left-0.5"}`} />
                            </div>
                            {lbl}
                          </label>
                        ))}
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">Zone flags (poor fit)</label>
                        <div className="flex flex-wrap gap-2">
                          {ZONES.map(z => {
                            const flagged = editDraft.zoneFlags?.includes(z.id);
                            return (
                              <button key={z.id} onClick={() => setEditDraft(d => d ? { ...d, zoneFlags: flagged ? d.zoneFlags.filter(f => f !== z.id) : [...d.zoneFlags, z.id] } : d)}
                                className={`px-3 py-1 rounded-full text-xs border transition-colors ${flagged ? "border-red-300 bg-red-50 text-red-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                                {z.label.split(" ")[0]} {flagged ? "⚠" : ""}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">Development communities</label>
                        <div className="flex flex-wrap gap-2">
                          {DEV_COMMUNITIES.map(d => {
                            const inCom = editDraft.devCommunities?.includes(d.id);
                            return (
                              <button key={d.id} onClick={() => setEditDraft(dr => dr ? { ...dr, devCommunities: inCom ? dr.devCommunities.filter(x => x !== d.id) : [...dr.devCommunities, d.id] } : dr)}
                                className={`px-3 py-1 rounded-full text-xs border transition-colors ${inCom ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                                {d.label} {inCom ? "✓" : ""}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Agent notes (shows on recommendation card)</label>
                        <textarea
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
                          rows={3}
                          placeholder="e.g. Loves dogs, great with first-time buyers, condo expert..."
                          value={editDraft.notes ?? ""}
                          onChange={e => setEditDraft(d => d ? { ...d, notes: e.target.value } : d)}
                        />
                      </div>
                      <button onClick={handleSaveAgent} className="bg-[#1a1a2e] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:opacity-90">
                        Save changes
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Pass modal */}
      {showPass && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-7 w-[420px] max-w-[90vw] shadow-xl">
            <p className="font-bold text-base mb-1">Log pass reason</p>
            <p className="text-sm text-gray-500 mb-4">Helps track cherry-picking patterns over time.</p>
            <div className="space-y-2">
              {PASS_REASONS.map(r => (
                <div key={r.id} onClick={() => setPassReason(r.id)}
                  className={`px-4 py-3 rounded-lg border-2 cursor-pointer text-sm transition-colors ${passReason === r.id ? "border-[#1a1a2e] bg-gray-50" : "border-gray-200 hover:border-gray-300"}`}>
                  {r.label}
                  {r.id === "cherry_pick" && <span className="ml-2">{badge("red", "Flags agent")}</span>}
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={handlePassConfirm} disabled={!passReason}
                className="bg-[#1a1a2e] text-white px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 hover:opacity-90">
                Confirm &amp; find next
              </button>
              <button onClick={() => setShowPass(false)} className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
