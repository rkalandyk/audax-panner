import React, { useEffect, useState } from "react";
import { addMonths, subMonths, format, eachDayOfInterval, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameDay, isSameMonth } from "date-fns";
import { Calendar as CalendarIcon, RotateCcw, Download, Upload, ChevronLeft, ChevronRight, ClipboardCheck, History, Trash2, MoveRight, LogIn, LogOut, Cloud } from "lucide-react";
import { createClient, type SupabaseClient, type Session, type User } from "@supabase/supabase-js";

/**
 * Audax Interactive Planner — server‑synced (Supabase) React app
 * - Zakres: 2025‑09‑18 → 2025‑11‑23
 * - Plan v1.1 (VO2/dynamika od tyg. 4)
 * - ✅ Zapis na serwerze (Supabase Postgres + RLS)
 * - ✅ Logowanie (magic link e‑mail)
 * - ✅ Synchronizacja między przeglądarkami/urządzeniami
 * - ✅ Historia akcji, przenoszenie zadań/dni, export/import JSON
 *
 * Deploy: Vercel/Netlify (frontend) + Supabase (backend). Instrukcje na dole pliku.
 */

// ---------- Typy ----------

type Task = { id: string; label: string; done: boolean; tips?: string[]; category: "GYM" | "BIKE" | "MOB" | "MICRO" | "HAND" | "NUTR" | "SLEEP" };

type DayPlan = { date: string; phase: string; week: number; tasks: Task[]; notes?: string };

type HistoryItem = { ts: number; date: string; action: string; detail: string };

type ServerState = { plans: DayPlan[]; history: HistoryItem[] };

// ---------- Stałe ----------

const START = new Date("2025-09-18");
const RACE = new Date("2025-11-23");

const LOCAL_PLANS = "audaxPlanner_v1_1";
const LOCAL_HISTORY = "audaxPlanner_v1_1_history";

// Wartości środowiskowe (Vite) lub globalne, jeśli wstawisz w index.html jako window.SUPABASE_URL/ANON
const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || (window as any).SUPABASE_URL;
const SUPABASE_ANON = (import.meta as any).env?.VITE_SUPABASE_ANON || (window as any).SUPABASE_ANON_KEY;

const dayNames = ["Poniedziałek","Wtorek","Środa","Czwartek","Piątek","Sobota","Niedziela"];

// ---------- Util ----------
const iso = (d: Date) => d.toISOString().slice(0,10);
const weekIndex = (d: Date) => Math.floor((+d - +START)/(1000*60*60*24)/7)+1;
const phaseName = (w:number) => w<=3?"BASE (stabilizacja bólu)": w<=6?"BUILD (VO2/dynamika + objętość)": w<=8?"SPECIFIC (ultra + trening jelit)":"TAPER (zmniejszanie objętości)";

const TIPS: Record<string,string[]> = {
  "McGill Big 3": ["Ból ≤3/10; kręgosłup neutralny.", "Curl‑up 3 s; side‑plank łokieć pod barkiem; bird‑dog 3 s zatrzymania."],
  "Glute bridge": ["Pięty pod kolanami, żebra w dół.", "Pośladki mocno w górze 1–2 s."],
  "Hip‑hinge drill": ["Kij: głowa‑plecy‑miednica w kontakcie.", "Ruch z bioder, nie z lędźwi."],
  "Hamstring sliders": ["Ekscentryk 3–4 s.", "Biodra w linii."],
  "Pallof press": ["Napięty core, bez rotacji.", "Pauza 2–3 s."],
  "RDL": ["Zawias w biodrach, neutralny kręgosłup.", "Sztanga/KB blisko; tempo 2‑0‑2."],
  "Split squat": ["Kolano nad śródstopiem.", "Ciężar na pięcie/środstopiu."],
  "Trap‑bar deadlift": ["Łopatki w kieszenie.", "Wypychaj podłogę."],
  "Wiosłowanie": ["Łokcie przez plecy.", "Pauza 1 s."],
  "Dead bug": ["Lędźwie dociśnięte.", "Wydech przy prostowaniu."],
  "Side‑plank": ["Ciało w linii.", "Równy oddech."],
  "Z2 jazda": ["Możliwa rozmowa.", "Co 10’ wstań 10–20 s."],
  "Tempo/technika": ["Stabilny tułów.", "Rozluźnij barki."],
  "VO2max": ["110–120% FTP (Z5).", "Kadencja 90–100."],
  "30/30": ["30 s mocno / 30 s lekko.", "Nie spal się w 1. serii."],
  "Sprinty": ["10–15 s z pełnego rozluźnienia.", "Odpoczynek 3–5 min."],
  "Over‑unders": ["Pod/ponad progiem.", "Kontrola oddechu."]
};

function gymFor(week:number, dow:number){ if(![0,2,4].includes(dow)) return [] as {label:string,tips?:string[]}[]; if(week<=3)return[{label:"McGill Big 3 — curl‑up 3×8–10 (3 s), side‑plank 3×15–20 s/str., bird‑dog 3×6–8/str.",tips:TIPS["McGill Big 3"]},{label:"Glute bridge 3×12–15 (pauza 2 s)",tips:TIPS["Glute bridge"]},{label:"Hip‑hinge drill 3×10",tips:TIPS["Hip‑hinge drill"]},{label:"Hamstring sliders 3×8–10 (wolny ekscentryk)",tips:TIPS["Hamstring sliders"]},{label:"Pallof press 3×12/str.",tips:TIPS["Pallof press"]},]; if(week<=6)return[{label:"RDL 4×6–8 (RPE 6–7)",tips:TIPS["RDL"]},{label:"Split squat 3×8/str.",tips:TIPS["Split squat"]},{label:"Wiosłowanie 3×10",tips:TIPS["Wiosłowanie"]},{label:"Trap‑bar deadlift 3×5 (opc., ból ≤3/10)",tips:TIPS["Trap‑bar deadlift"]},{label:"Dead bug 3×8/str.",tips:TIPS["Dead bug"]},{label:"Side‑plank 3×25–30 s",tips:TIPS["Side‑plank"]},]; if(week<=8){ if(dow===2)return[{label:"RDL 3×5 (RPE 6)",tips:TIPS["RDL"]},{label:"Goblet squat 3×8"},{label:"Wiosłowanie 3×10",tips:TIPS["Wiosłowanie"]},{label:"McGill Big 3 mix 10–12’"},]; return[{label:"RDL 3×5 (RPE 6)",tips:TIPS["RDL"]},{label:"McGill Big 3 mix 10’ / Pallof"},]; } return[{label:"Technika: lekkie RDL 2×5"},{label:"Core 8–10’ McGill / anti‑rotacje (bez DOMS)"},]; }

function bikeFor(week:number, dow:number){ if(week<=3){ if(dow===1) return{label:"Z2 60–90’ + kadencja mieszana: 5×3’ 85–90 rpm / 5×3’ 70–75 rpm.",tips:TIPS["Z2 jazda"]}; if(dow===3) return{label:"Z2 60–90’; co 10’ wstań 10–20 s.",tips:TIPS["Z2 jazda"]}; if(dow===5) return{label:"Z2 długi 90–120’ (tyg. 3: 120–150’).",tips:TIPS["Z2 jazda"]}; if(dow===6) return{label:"Opcjonalny recovery 45–60’ Z1–Z2 / spacer 45’."}; return null;} if(week<=6){ if(dow===1) return{label:"VO2max: 5×3’ @110–120% FTP (p. 3–4’) / alternatywa 2×(10×30/30)",tips:[...TIPS["VO2max"],...TIPS["30/30"]]}; if(dow===3) return{label:"Tempo/technika 60–90’ + 6–8×10–15 s sprintów (pełny odpoczynek)",tips:[...TIPS["Tempo/technika"],...TIPS["Sprinty"]]}; if(dow===5) return{label:"Z2 długi 3–4 h.",tips:TIPS["Z2 jazda"]}; if(dow===6) return{label:"Back‑to‑back: 2–3 h Z2 (jeśli sob. ≥3 h).",tips:TIPS["Z2 jazda"]}; return null;} if(week<=8){ if(dow===1) return{label:"Over‑unders: 3×10’ (2’ @95–100% / 30” @110–115%), p. 5’ (lub VO2 4×5’)",tips:TIPS["Over‑unders"]}; if(dow===3) return{label:"Nocny/świtny 2–3 h – test oświetlenia/ubioru; wstaw 10×15 s sprint.",tips:[...TIPS["Tempo/technika"],...TIPS["Sprinty"]]}; if(dow===5) return{label:"Długi 5–6 h; żywienie 60→90(100+) g/h.",tips:TIPS["Z2 jazda"]}; if(dow===6) return{label:"Back‑to‑back: 3–4 h Z2 (tydzień po długim).",tips:TIPS["Z2 jazda"]}; return null;} if(dow===1) return{label:"Z2 60–75’ z 3×3’ tempo. Lekko.",tips:TIPS["Z2 jazda"]}; if(dow===3) return{label:"Krótko 45–60’ Z2. Sprzęt check.",tips:TIPS["Z2 jazda"]}; if(dow===5) return{label:"Z2 90’ z przebieżkami 30–60 s.",tips:TIPS["Z2 jazda"]}; if(dow===6) return{label:"Odzyskanie: 45’ spacer/lekki rozjazd."}; return null; }

function mobility(){ return ["Zginacze biodra 2×45 s/str. (miednica podwinięta)","T‑spine na wałku + piersiowe 2×45 s","Oddech przeponowy 5 głębokich oddechów"]; }
function microBreaks(){ return ["Mikro‑przerwy (co 45–60 min, 2–4’): □ □ □ □ □ □ □ □ □ □"]; }
function handRehab(dow:number){ return [0,3,5].includes(dow)?["Nerwoglajding mediany 2×5–10 (bez bólu)","Chwyt izometryczny 3×30–45 s","Ekstensja nadgarstka 3×15"]:["Nerwoglajding mediany 1×5–10 (lekko)"]; }
function nutrition(week:number, dow:number, bike?:{label:string}|null){ const bt=bike?.label||""; const long=bt.includes("5–6 h")||bt.includes("3–4 h"); let carb="5–6 g/kg", inride="W trakcie: woda lub 20–30 g/h jeśli >60’."; if(long){carb="8–10 g/kg"; inride="W trakcie: 60–90(100+) g/h; sód 300–600 mg/h.";} else if([1,3].includes(dow)){carb="6–8 g/kg"; inride="W trakcie: 40–60 g/h; sód 300–500 mg/h.";} else if([5,6].includes(dow)){carb="7–9 g/kg"; inride="W trakcie: 60–90 g/h; sód 300–600 mg/h.";} const base=`Węgle: ${carb}; Białko: 1.6–2.0 g/kg (4×0.3–0.4 g/kg). Przed: 1–4 g/kg 1–4 h + kofeina 3 mg/kg (opc.). ${inride} Po: 0.3 g/kg białka + 1–1.2 g/kg/h 3–4 h (po długim).`; const extra=(week===7||week===8)?" Nitrany (burak) 400–800 mg NO₃⁻ 2–3 h przed kluczowym akcentem.":""; return [base+extra, "Meal prep: □ śniadanie  □ przekąski  □ obiad  □ kolacja  □ bidony/żele gotowe"]; }
function sleep(){ return ["Sen 7.5–9 h","Drzemka 20–30’ (opc.)","HR spocz., masa, nastrój — odnotowane"]; }

function generateInitialPlan(): DayPlan[] {
  const days = eachDayOfInterval({ start: START, end: RACE });
  return days.map((d)=>{
    const w = weekIndex(d); const phase = phaseName(w); const dow = d.getDay()===0?6:d.getDay()-1;
    const gym = gymFor(w,dow); const bike = bikeFor(w,dow); const mob = mobility(); const micro = microBreaks(); const hand = handRehab(dow); const nutr = nutrition(w,dow,bike||undefined); const slp = sleep();
    let tasks: Task[] = []; let idc=0; const push=(label:string,category:Task["category"],tips?:string[])=>{tasks.push({id:`${iso(d)}_${category}_${idc++}`,label,done:false,category,tips});};
    gym.forEach(g=>push(g.label,"GYM",g.tips)); if(bike) push(bike.label,"BIKE",bike.tips); mob.forEach(m=>push(m,"MOB")); micro.forEach(m=>push(m,"MICRO")); hand.forEach(h=>push(h,"HAND")); nutr.forEach(n=>push(n,"NUTR")); slp.forEach(s=>push(s,"SLEEP"));
    if(isSameDay(d,RACE)) tasks = tasks.filter(t=>t.category!=="GYM");
    return { date: iso(d), phase, week: w, tasks, notes: "" };
  });
}

// ---------- Supabase ----------
let supabase: SupabaseClient | null = null;
function getSupabase(){ if(!supabase && SUPABASE_URL && SUPABASE_ANON){ supabase = createClient(SUPABASE_URL, SUPABASE_ANON); } return supabase; }
async function serverLoad(user: User){ const sb = getSupabase(); if(!sb) return null; const { data, error } = await sb.from("user_state").select("plans,history").eq("user_id", user.id).single(); if(error && error.code!=="PGRST116") console.warn(error); return (data as any)||null; }
async function serverSave(user: User, state: ServerState){ const sb = getSupabase(); if(!sb) return; const payload = { user_id: user.id, plans: state.plans, history: state.history, updated_at: new Date().toISOString() }; const { error } = await sb.from("user_state").upsert(payload, { onConflict: "user_id" }); if(error) console.error(error); }
function useDebounced<T>(value:T, delay=1200){ const [deb, setDeb] = React.useState(value); React.useEffect(()=>{ const id=setTimeout(()=>setDeb(value), delay); return ()=>clearTimeout(id); },[value,delay]); return deb; }

// ---------- App ----------
export default function App(){
  const [plans, setPlans] = useState<DayPlan[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [current, setCurrent] = useState<Date>(START);
  const [monthCursor, setMonthCursor] = useState<Date>(START);

  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [syncing, setSyncing] = useState(false);

  // Init: local + Supabase session
  useEffect(()=>{
    const saved = localStorage.getItem(LOCAL_PLANS);
    const savedHistory = localStorage.getItem(LOCAL_HISTORY);
    if (saved) setPlans(JSON.parse(saved)); else setPlans(generateInitialPlan());
    if (savedHistory) setHistory(JSON.parse(savedHistory));

    const sb = getSupabase();
    if (sb) {
      sb.auth.getSession().then(({ data })=>{ setSession(data.session||null); setUser(data.session?.user||null); });
      const { data: sub } = sb.auth.onAuthStateChange((_event, sess)=>{ setSession(sess); setUser(sess?.user||null); });
      return ()=>{ sub.subscription.unsubscribe(); };
    }
  },[]);

  // Local fallback
  useEffect(()=>{ localStorage.setItem(LOCAL_PLANS, JSON.stringify(plans)); }, [plans]);
  useEffect(()=>{ localStorage.setItem(LOCAL_HISTORY, JSON.stringify(history)); }, [history]);

  // Pull from server after login
  useEffect(()=>{ (async()=>{ if(user){ const remote = await serverLoad(user); if(remote?.plans && remote?.history){ setPlans(remote.plans); setHistory(remote.history); } } })(); }, [user]);

  // Debounced push to server
  const debPlans = useDebounced(plans);
  const debHistory = useDebounced(history);
  useEffect(()=>{ (async()=>{ if(user){ setSyncing(true); await serverSave(user, { plans: debPlans, history: debHistory }); setSyncing(false); } })(); }, [user, debPlans, debHistory]);

  const currentISO = iso(current);
  const dayPlan = plans.find(p=>p.date===currentISO);

  // Month grid
  const monthStart = startOfMonth(monthCursor), monthEnd = endOfMonth(monthCursor);
  const gridStart = startOfWeek(monthStart,{weekStartsOn:1}), gridEnd = endOfWeek(monthEnd,{weekStartsOn:1});
  const gridDays = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const pushHist = (i:HistoryItem)=> setHistory(h=>[{...i, ts: Date.now()}, ...h]);

  const toggleTask = (dateISO: string, id: string, checked: boolean) => { setPlans(prev=>prev.map(p=>p.date!==dateISO?p:({...p,tasks:p.tasks.map(t=>t.id===id?{...t,done:checked}:t)}))); pushHist({ ts:0, date: dateISO, action: checked?"CHECK":"UNCHECK", detail: id }); };
  const resetDay = (dateISO: string) => { setPlans(prev=>prev.map(p=>p.date!==dateISO?p:({...p,tasks:p.tasks.map(t=>({...t,done:false}))}))); pushHist({ ts:0, date: dateISO, action: "RESET_DAY", detail: "reset" }); };
  const moveTask = (fromISO:string,toISO:string,id:string)=>{ if(fromISO===toISO) return; setPlans(prev=>{ const src=prev.find(p=>p.date===fromISO); const dst=prev.find(p=>p.date===toISO); if(!src||!dst) return prev; const task=src.tasks.find(t=>t.id===id); if(!task) return prev; const newSrc={...src,tasks:src.tasks.filter(t=>t.id!==id)}; const newTask:Task={...task,id:`${toISO}_${task.category}_${Math.random().toString(36).slice(2,8)}`}; const newDst={...dst,tasks:[...dst.tasks,newTask]}; pushHist({ ts:0, date: toISO, action: "MOVE_TASK", detail: `${task.label} ← ${fromISO}` }); return prev.map(p=>p.date===fromISO?newSrc:p.date===toISO?newDst:p); }); };
  const moveWholeDay = (fromISO:string,toISO:string)=>{ if(fromISO===toISO) return; setPlans(prev=>{ const src=prev.find(p=>p.date===fromISO); const dst=prev.find(p=>p.date===toISO); if(!src||!dst) return prev; const moved=src.tasks.map(t=>({...t,id:`${toISO}_${t.category}_${Math.random().toString(36).slice(2,8)}`})); const newSrc={...src,tasks:[]}; const newDst={...dst,tasks:[...dst.tasks,...moved]}; pushHist({ ts:0, date: toISO, action: "MOVE_DAY", detail: `zadania z ${fromISO}` }); return prev.map(p=>p.date===fromISO?newSrc:p.date===toISO?newDst:p); }); };
  const completion = (p?:DayPlan)=>!p||p.tasks.length===0?0:Math.round(100*p.tasks.filter(t=>t.done).length/p.tasks.length);

  // Auth
  const [emailInput, setEmailInput] = useState("");
  const signIn = async ()=>{ const sb=getSupabase(); if(!sb) return alert("Skonfiguruj SUPABASE_URL/ANON"); const { error } = await sb.auth.signInWithOtp({ email: emailInput, options: { emailRedirectTo: window.location.href } }); if(error) alert(error.message); else alert("Sprawdź e‑mail i kliknij link logowania."); };
  const signOut = async ()=>{ const sb=getSupabase(); if(sb){ await sb.auth.signOut(); setSession(null); setUser(null); } };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 p-4">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-2xl shadow p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2"><CalendarIcon className="w-5 h-5"/> Kalendarz</h2>
              <div className="flex items-center gap-2">
                <button className="p-2 rounded-xl hover:bg-neutral-100" onClick={()=>setMonthCursor(subMonths(monthCursor,1))}><ChevronLeft/></button>
                <div className="text-sm font-medium w-40 text-center">{format(monthCursor, 'LLLL yyyy')}</div>
                <button className="p-2 rounded-xl hover:bg-neutral-100" onClick={()=>setMonthCursor(addMonths(monthCursor,1))}><ChevronRight/></button>
              </div>
            </div>
            <div className="grid grid-cols-7 text-xs text-neutral-500 mt-3">{["Pn","Wt","Śr","Cz","Pt","So","Nd"].map(d=> <div key={d} className="text-center py-1">{d}</div>)}</div>
            <div className="grid grid-cols-7 gap-1">
              {gridDays.map(d=>{ const dateISO=iso(d); const p=plans.find(x=>x.date===dateISO); const comp=completion(p); const selected=isSameDay(d,current); const dim=!isSameMonth(d,monthCursor); return (
                <button key={dateISO} onClick={()=>setCurrent(d)} className={`aspect-square rounded-xl p-1 flex flex-col items-center justify-center border ${selected?'border-neutral-900':'border-neutral-200'} ${dim?'opacity-40':''} hover:shadow`}>
                  <div className="text-sm font-semibold">{format(d,'d')}</div>
                  <div className="text-[10px]">{p?`${comp}%`:''}</div>
                </button>
              ); })}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button className="px-3 py-2 bg-neutral-900 text-white rounded-xl shadow flex items-center gap-2" onClick={()=>setCurrent(new Date())}><MoveRight className="w-4 h-4"/> Dziś</button>
              <button className="px-3 py-2 bg-white border rounded-xl shadow-sm flex items-center gap-2" onClick={()=>{ const blob=new Blob([JSON.stringify({plans,history},null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='audax_planner_v1_1.json'; a.click(); URL.revokeObjectURL(url); }}><Download className="w-4 h-4"/> Export</button>
              <label className="px-3 py-2 bg-white border rounded-xl shadow-sm flex items-center gap-2 cursor-pointer">
                <Upload className="w-4 h-4"/> Import <input type="file" accept="application/json" className="hidden" onChange={(e)=>{ const f=e.target.files?.[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{ try{ const obj=JSON.parse(String(r.result)); if(obj.plans&&obj.history){ setPlans(obj.plans); setHistory(obj.history);} }catch{ alert('Nieprawidłowy plik JSON'); } }; r.readAsText(f); }}/>
              </label>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow p-4">
            <h2 className="text-lg font-semibold flex items-center gap-2"><History className="w-5 h-5"/> Historia</h2>
            <div className="mt-2 max-h-80 overflow-auto text-sm space-y-1">
              {history.length===0 && <div className="text-neutral-500">Brak wpisów</div>}
              {history.slice(0,200).map((h,i)=> (
                <div key={i} className="flex justify-between gap-2 border-b py-1">
                  <div>
                    <div className="font-medium">{h.action}</div>
                    <div className="text-neutral-500">{h.detail}</div>
                  </div>
                  <div className="text-neutral-500">{format(new Date(h.ts), 'yyyy-MM-dd HH:mm')}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl shadow p-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">
              <Cloud className="w-4 h-4"/>
              {user? <span>Zalogowano jako <b>{user.email}</b></span> : <span>Zaloguj się, aby synchronizować dane w chmurze.</span>}
              {syncing && <span className="text-neutral-500"> • sync…</span>}
            </div>
            <div className="flex items-center gap-2">
              {!user ? (
                <>
                  <input type="email" placeholder="twój e‑mail" value={emailInput} onChange={e=>setEmailInput(e.target.value)} className="border rounded-xl px-3 py-2 text-sm"/>
                  <button className="px-3 py-2 bg-neutral-900 text-white rounded-xl shadow flex items-center gap-2" onClick={signIn}><LogIn className="w-4 h-4"/> Zaloguj (magic link)</button>
                </>
              ) : (
                <button className="px-3 py-2 bg-white border rounded-xl shadow-sm flex items-center gap-2" onClick={signOut}><LogOut className="w-4 h-4"/> Wyloguj</button>
              )}
            </div>
          </div>

          {dayPlan ? (
            <div className="bg-white rounded-2xl shadow p-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="text-xl font-bold">{dayPlan.date} — {dayNames[(new Date(dayPlan.date).getDay()+6)%7]}</div>
                  <div className="text-sm text-neutral-600">Tydzień {dayPlan.week} • {dayPlan.phase}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-sm text-neutral-600">Ukończono: <b>{completion(dayPlan)}%</b></div>
                  <button className="px-3 py-2 bg-neutral-900 text-white rounded-xl shadow flex items-center gap-2" onClick={()=>{ setPlans(prev=>prev.map(p=>p.date!==dayPlan.date? p : ({...p, tasks:p.tasks.map(t=>({...t,done:true}))}))); pushHist({ ts: 0, date: dayPlan.date, action: "CHECK_ALL", detail: "wszystkie" }); }}><ClipboardCheck className="w-4 h-4"/> Zaznacz wszystko</button>
                  <button className="px-3 py-2 bg-white border rounded-xl shadow-sm flex items-center gap-2" onClick={()=>resetDay(dayPlan.date)}><RotateCcw className="w-4 h-4"/> Reset dnia</button>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mt-4">
                {(["GYM","BIKE","MOB","MICRO","HAND","NUTR","SLEEP"] as Task["category"][]).map(cat=>{
                  const catTasks = dayPlan.tasks.filter(t=>t.category===cat);
                  if (catTasks.length===0) return null;
                  const titleMap: Record<Task["category"],string> = { GYM:"Siłownia / CORE", BIKE:"Rower", MOB:"Mobilność", MICRO:"Mikro‑przerwy", HAND:"Rehab dłoni", NUTR:"Żywienie / Meal‑prep", SLEEP:"Sen / Regeneracja" };
                  return (
                    <div key={cat} className="border rounded-2xl p-3">
                      <div className="font-semibold mb-2">{titleMap[cat]}</div>
                      <div className="space-y-2">
                        {catTasks.map(t=> (
                          <TaskRow key={t.id} t={t} dateISO={dayPlan.date} onToggle={(checked)=>toggleTask(dayPlan.date, t.id, checked)} onMove={(to)=>moveTask(dayPlan.date, to, t.id)} onDelete={()=>{ setPlans(prev=>prev.map(p=>p.date!==dayPlan.date?p:({...p,tasks:p.tasks.filter(x=>x.id!==t.id)}))); pushHist({ ts:0, date: dayPlan.date, action: "DELETE_TASK", detail: t.label }); }} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 border rounded-2xl p-3">
                <div className="font-semibold mb-2">Przenieś cały dzień</div>
                <DateMove toLabel="Przenieś dzień na…" onMove={(to)=>moveWholeDay(dayPlan.date, to)} />
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium mb-1">Notatki / Ból (0–10) / RPE</label>
                <textarea value={dayPlan.notes||""} onChange={(e)=>setPlans(prev=>prev.map(p=>p.date!==dayPlan.date?p:({...p, notes:e.target.value})))} className="w-full rounded-xl border p-3" rows={4} placeholder="Zapisz jak się czułeś, co poprawić, co zadziałało."/>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow p-6 text-neutral-600">Wybierz dzień w kalendarzu…</div>
          )}
        </div>
      </div>

      <footer className="max-w-7xl mx-auto text-xs text-neutral-500 pt-6 pb-2">
        <span className="inline-flex items-center gap-1"><Cloud className="w-3.5 h-3.5"/>{user?`Zalogowano: ${user.email}`:"Niezalogowano"}{syncing?" • synchronizacja…":""}</span>
        {' '}• Uwaga: unikaj NLPZ (np. meloksykam) podczas długich jazd/startu; pij wg pragnienia + elektrolity.
      </footer>

      {/* ========= Instrukcje backend =========
      1) Supabase: utwórz projekt → skopiuj URL i Anon Key do env:
         - VITE_SUPABASE_URL
         - VITE_SUPABASE_ANON

      2) W SQL Editor wklej i uruchom:
         create table if not exists public.user_state (
           user_id uuid primary key references auth.users(id) on delete cascade,
           plans jsonb not null,
           history jsonb not null,
           updated_at timestamptz default now()
         );
         alter table public.user_state enable row level security;
         create policy "select own" on public.user_state for select using ( auth.uid() = user_id );
         create policy "upsert own" on public.user_state for insert with check ( auth.uid() = user_id );
         create policy "update own" on public.user_state for update using ( auth.uid() = user_id );

      3) Deploy frontendu (Vercel/Netlify). Ustaw zmienne środowiskowe w projekcie.

      4) Logowanie działa przez magic link. Po zalogowaniu stan zaczyta się z bazy, a zmiany zapisują się automatycznie (debounce ~1.2 s).
      ======================================== */}
    </div>
  );
}

function TaskRow({ t, dateISO, onToggle, onMove, onDelete }:{ t:Task; dateISO:string; onToggle:(c:boolean)=>void; onMove:(isoDate:string)=>void; onDelete:()=>void }){
  return (
    <div className="flex items-start gap-2">
      <input type="checkbox" checked={t.done} onChange={(e)=>onToggle(e.target.checked)} className="mt-1 w-4 h-4"/>
      <div className="flex-1">
        <div className="text-sm leading-snug">{t.label}</div>
        {t.tips && t.tips.length>0 && (
          <ul className="text-xs text-neutral-500 list-disc ml-5 mt-1">
            {t.tips.slice(0,2).map((tip,i)=>(<li key={i}>{tip}</li>))}
          </ul>
        )}
        <div className="flex items-center gap-2 mt-1">
          <DateMove toLabel="Przenieś na…" onMove={onMove} />
          <button className="text-xs text-red-600 hover:underline flex items-center gap-1" onClick={onDelete}><Trash2 className="w-3 h-3"/> usuń</button>
        </div>
      </div>
    </div>
  );
}

function DateMove({ toLabel, onMove }: { toLabel: string; onMove: (isoDate: string)=>void }){
  const [val, setVal] = useState(iso(new Date()));
  return (
    <div className="flex items-center gap-2 text-xs">
      <input type="date" value={val} onChange={(e)=>setVal(e.target.value)} className="border rounded-lg p-1"/>
      <button className="px-2 py-1 bg-neutral-900 text-white rounded-lg flex items-center gap-1" onClick={()=>onMove(val)}><MoveRight className="w-3 h-3"/> {toLabel}</button>
    </div>
  );
}
