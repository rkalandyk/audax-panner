import React, { useEffect, useMemo, useState } from "react";
import {
  addMonths, subMonths, format, addDays, eachDayOfInterval,
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  isSameDay, isSameMonth
} from "date-fns";
import {
  Calendar as CalendarIcon, CheckCircle2, RotateCcw, Download, Upload,
  ChevronLeft, ChevronRight, ClipboardCheck, History as HistoryIcon,
  Trash2, MoveRight, MoreHorizontal
} from "lucide-react";
import { createClient, type Session, type User } from "@supabase/supabase-js";

/**
 * Audax Interactive Planner — single-file React app (FINAL)
 * - Daily checklist from 2025-09-18 → 2025-11-23
 * - Based on plan v1.1 (VO2/dynamics from week 4)
 * - LocalStorage persistence + history log
 * - Move tasks/day across dates, mark done, export/import JSON
 * - Minimal month calendar + detailed daily view
 * - Login gate (Supabase) — only robert@pego.cc
 * - Sleep & Micro-breaks metrics cards
 */

// ---------- Types ----------

type Task = {
  id: string;
  label: string;
  done: boolean;
  tips?: string[];
  category: "GYM" | "BIKE" | "MOB" | "MICRO" | "HAND" | "NUTR" | "SLEEP";
};

type DayPlan = {
  date: string; // ISO yyyy-mm-dd
  phase: string;
  week: number;
  tasks: Task[];
  notes?: string;
  // --- daily metrics ---
  sleepHours?: number;  // ile spałeś (h)
  napsNote?: string;    // opis drzemek
  hrRest?: number;      // HR spoczynkowe
  bodyMass?: number;    // masa (kg)
  microDone?: number;   // zrobione mikro-przerwy
  microTarget?: number; // cel mikro-przerw
};

type HistoryItem = {
  ts: number; // epoch ms
  date: string;
  action: string; // e.g., "CHECK" | "UNCHECK" | "MOVE_TASK" | "RESET_DAY"
  detail: string;
};

// ---------- Constants ----------

const START = new Date("2025-09-18");
const RACE = new Date("2025-11-23");
const STORAGE_KEY = "audaxPlanner_v1_1";
const HISTORY_KEY = "audaxPlanner_v1_1_history";

// Supabase config from Vite env (set in Vercel project settings)
const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || (window as any).SUPABASE_URL;
const SUPABASE_ANON = (import.meta as any).env?.VITE_SUPABASE_ANON || (window as any).SUPABASE_ANON_KEY;
const SITE_URL = (import.meta as any).env?.VITE_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : undefined);
const ALLOWED_EMAIL = "robert@pego.cc";

const supabase = SUPABASE_URL && SUPABASE_ANON ? createClient(SUPABASE_URL, SUPABASE_ANON) : null; // client init

const dayNames = ["Poniedziałek","Wtorek","Środa","Czwartek","Piątek","Sobota","Niedziela"];

// Utility
const iso = (d: Date) => d.toISOString().slice(0,10);

// ---------- Helpers for plan ----------

function weekIndex(d: Date): number {
  return Math.floor((+d - +START)/ (1000*60*60*24) / 7) + 1;
}
function phaseName(week: number): string {
  if (week<=3) return "BASE (stabilizacja bólu)";
  if (week<=6) return "BUILD (VO2/dynamika + objętość)";
  if (week<=8) return "SPECIFIC (ultra + trening jelit)";
  return "TAPER (zmniejszanie objętości)";
}

// Short tips
const TIPS: Record<string,string[]> = {
  "McGill Big 3": ["Ból ≤3/10; kręgosłup neutralny.", "Curl-up 3 s; side-plank łokieć pod barkiem; bird-dog 3 s zatrzymania."],
  "Glute bridge": ["Pięty pod kolanami, żebra w dół.", "Pośladki mocno w górze 1–2 s."],
  "Hip-hinge drill": ["Kij: głowa-plecy-miednica w kontakcie.", "Ruch z bioder, nie z lędźwi."],
  "Hamstring sliders": ["Ekscentryk 3–4 s.", "Biodra w linii, bez ciągnięcia lędźwiami."],
  "Pallof press": ["Napięty core, bez rotacji.", "Pauza 2–3 s na wyproście."],
  "RDL": ["Zawias w biodrach, neutralny kręgosłup.", "Sztanga/KB blisko ciała; tempo 2-0-2."],
  "Split squat": ["Kolano nad śródstopiem, miednica poziomo.", "Ciężar na pięcie/środstopiu, tułów lekko pochylony."],
  "Trap-bar deadlift": ["Łopatki w kieszenie, brzuch napięty.", "Wypychaj podłogę, nie ciągnij plecami."],
  "Wiosłowanie": ["Plecy neutralne, łokcie przez plecy.", "Pauza 1 s na szczycie ruchu."],
  "Dead bug": ["Lędźwie dociśnięte do podłoża.", "Wydech przy prostowaniu."],
  "Side-plank": ["Ciało w linii prostej.", "Miednica nie opada; równy oddech."],
  "Z2 jazda": ["Możliwa rozmowa.", "Co 10’ wstań 10–20 s, zmieniaj chwyt."],
  "Tempo/technika": ["Stabilny tułów, patrz daleko.", "Prowadź rower biodrem; barki luźno."],
  "VO2max": ["110–120% FTP (Z5); kadencja 90–100.", "Pozycja stabilna, nie szarp."],
  "30/30": ["30 s mocno / 30 s lekko.", "Nie spal się w 1. serii."],
  "Sprinty": ["10–15 s z pełnego rozluźnienia.", "Maks bez kołysania, odpoczynek 3–5 min."],
  "Over-unders": ["Sekwencje pod/ponad progiem.", "Kontrola oddechu, pozycja stabilna."]
};

// Generatory bloków
function gymFor(week:number, dow:number): {label:string,tips?:string[]}[] {
  if (![0,2,4].includes(dow)) return [];
  if (week<=3) return [
    {label:"McGill Big 3 — curl-up 3×8–10 (3 s), side-plank 3×15–20 s/str., bird-dog 3×6–8/str.", tips:TIPS["McGill Big 3"]},
    {label:"Glute bridge 3×12–15 (pauza 2 s)", tips:TIPS["Glute bridge"]},
    {label:"Hip-hinge drill 3×10", tips:TIPS["Hip-hinge drill"]},
    {label:"Hamstring sliders 3×8–10 (wolny ekscentryk)", tips:TIPS["Hamstring sliders"]},
    {label:"Pallof press 3×12/str.", tips:TIPS["Pallof press"]},
  ];
  if (week<=6) return [
    {label:"RDL 4×6–8 (RPE 6–7)", tips:TIPS["RDL"]},
    {label:"Split squat 3×8/str.", tips:TIPS["Split squat"]},
    {label:"Wiosłowanie 3×10", tips:TIPS["Wiosłowanie"]},
    {label:"Trap-bar deadlift 3×5 (opc., ból ≤3/10)", tips:TIPS["Trap-bar deadlift"]},
    {label:"Dead bug 3×8/str.", tips:TIPS["Dead bug"]},
    {label:"Side-plank 3×25–30 s", tips:TIPS["Side-plank"]},
  ];
  if (week<=8) {
    if (dow===2) return [
      {label:"RDL 3×5 (RPE 6)", tips:TIPS["RDL"]},
      {label:"Goblet squat 3×8"},
      {label:"Wiosłowanie 3×10", tips:TIPS["Wiosłowanie"]},
      {label:"McGill Big 3 mix 10–12’"},
    ];
    return [
      {label:"RDL 3×5 (RPE 6)", tips:TIPS["RDL"]},
      {label:"McGill Big 3 mix 10’ / Pallof"},
    ];
  }
  return [
    {label:"Technika: lekkie RDL 2×5"},
    {label:"Core 8–10’ McGill / anti-rotacje (bez DOMS)"},
  ];
}

function bikeFor(week:number, dow:number): {label:string,tips?:string[]} | null {
  if (week<=3) {
    if (dow===1) return {label:"Z2 60–90’ + kadencja mieszana: 5×3’ 85–90 rpm / 5×3’ 70–75 rpm.", tips:TIPS["Z2 jazda"]};
    if (dow===3) return {label:"Z2 60–90’; co 10’ wstań 10–20 s.", tips:TIPS["Z2 jazda"]};
    if (dow===5) return {label:"Z2 długi 90–120’ (tyg. 3: 120–150’).", tips:TIPS["Z2 jazda"]};
    if (dow===6) return {label:"Opcjonalny recovery 45–60’ Z1–Z2 / spacer 45’."};
    return null;
  }
  if (week<=6) {
    if (dow===1) return {label:"VO2max: 5×3’ @110–120% FTP (p. 3–4’) / alternatywa 2×(10×30/30)", tips:[...TIPS["VO2max"], ...TIPS["30/30"]]};
    if (dow===3) return {label:"Tempo/technika 60–90’ + 6–8×10–15 s sprintów (pełny odpoczynek)", tips:[...TIPS["Tempo/technika"], ...TIPS["Sprinty"]]};
    if (dow===5) return {label:"Z2 długi 3–4 h.", tips:TIPS["Z2 jazda"]};
    if (dow===6) return {label:"Back-to-back: 2–3 h Z2 (jeśli sob. ≥3 h).", tips:TIPS["Z2 jazda"]};
    return null;
  }
  if (week<=8) {
    if (dow===1) return {label:"Over-unders: 3×10’ (2’ @95–100% / 30” @110–115%), p. 5’ (lub VO2 4×5’)", tips:TIPS["Over-unders"]};
    if (dow===3) return {label:"Nocny/świtny 2–3 h – test oświetlenia/ubioru; wstaw 10×15 s sprint.", tips:[...TIPS["Tempo/technika"], ...TIPS["Sprinty"]]};
    if (dow===5) return {label:"Długi 5–6 h; żywienie 60→90(100+) g/h.", tips:TIPS["Z2 jazda"]};
    if (dow===6) return {label:"Back-to-back: 3–4 h Z2 (tydzień po długim).", tips:TIPS["Z2 jazda"]};
    return null;
  }
  // taper
  if (dow===1) return {label:"Z2 60–75’ z 3×3’ tempo. Lekko.", tips:TIPS["Z2 jazda"]};
  if (dow===3) return {label:"Krótko 45–60’ Z2. Sprzęt check.", tips:TIPS["Z2 jazda"]};
  if (dow===5) return {label:"Z2 90’ z przebieżkami 30–60 s.", tips:TIPS["Z2 jazda"]};
  if (dow===6) return {label:"Odzyskanie: 45’ spacer/lekki rozjazd."};
  return null;
}

function mobility(): string[] {
  return [
    "Zginacze biodra 2×45 s/str. (miednica podwinięta)",
    "T-spine na wałku + piersiowe 2×45 s",
    "Oddech przeponowy 5 głębokich oddechów",
  ];
}
function microBreaks(): string[] {
  return ["Mikro-przerwy (co 45–60 min, 2–4’): □ □ □ □ □ □ □ □ □ □"];
}
function handRehab(dow:number): string[] {
  if ([0,3,5].includes(dow)) return [
    "Nerwoglajding mediany 2×5–10 (bez bólu)",
    "Chwyt izometryczny 3×30–45 s",
    "Ekstensja nadgarstka 3×15",
  ];
  return ["Nerwoglajding mediany 1×5–10 (lekko)"];
}
function nutrition(week:number, dow:number, bike?:{label:string}|null): string[] {
  const bt = bike?.label||"";
  const long = bt.includes("5–6 h") || bt.includes("3–4 h");
  let carb = "5–6 g/kg", inride = "W trakcie: woda lub 20–30 g/h jeśli >60’.";
  if (long) { carb = "8–10 g/kg"; inride = "W trakcie: 60–90(100+) g/h; sód 300–600 mg/h."; }
  else if ([1,3].includes(dow)) { carb = "6–8 g/kg"; inride = "W trakcie: 40–60 g/h; sód 300–500 mg/h."; }
  else if ([5,6].includes(dow)) { carb = "7–9 g/kg"; inride = "W trakcie: 60–90 g/h; sód 300–600 mg/h."; }
  const base = `Węgle: ${carb}; Białko: 1.6–2.0 g/kg (4×0.3–0.4 g/kg). Przed: 1–4 g/kg 1–4 h + kofeina 3 mg/kg (opc.). ${inride} Po: 0.3 g/kg białka + 1–1.2 g/kg/h 3–4 h (po długim).`;
  const extra = (week===7||week===8) ? " Nitrany (burak) 400–800 mg NO₃⁻ 2–3 h przed kluczowym akcentem." : "";
  return [base+extra, "Meal prep: □ śniadanie  □ przekąski  □ obiad  □ kolacja  □ bidony/żele gotowe"];
}
function sleep(): string[] {
  return ["Sen 7.5–9 h", "Drzemka 20–30’ (opc.)", "HR spocz., masa, nastrój — odnotowane"];
}

function generateInitialPlan(): DayPlan[] {
  const days = eachDayOfInterval({ start: START, end: RACE });
  return days.map((d) => {
    const w = weekIndex(d);
    const phase = phaseName(w);
    const dow = d.getDay()===0?6:d.getDay()-1;
    const gym = gymFor(w, dow);
    const bike = bikeFor(w, dow);
    const mob = mobility();
    const micro = microBreaks();
    const hand = handRehab(dow);
    const nutr = nutrition(w, dow, bike||undefined);
    const slp = sleep();

    let tasks: Task[] = [];
    let idc = 0;
    const push = (label: string, category: Task["category"], tips?:string[])=>{
      tasks.push({ id: `${iso(d)}_${category}_${idc++}`, label, done:false, category, tips });
    };

    gym.forEach(g=>push(g.label, "GYM", g.tips));
    if (bike) push(bike.label, "BIKE", bike.tips);
    mob.forEach(m=>push(m, "MOB"));
    micro.forEach(m=>push(m, "MICRO"));
    hand.forEach(h=>push(h, "HAND"));
    nutr.forEach(n=>push(n, "NUTR"));
    slp.forEach(s=>push(s, "SLEEP"));

    if (isSameDay(d, RACE)) {
      tasks = tasks.filter(t=>t.category!=="GYM");
    }

    return { date: iso(d), phase, week: w, tasks, notes: "", microDone: 0, microTarget: 10 };
  });
}

// --- UI cards ---
function SleepCard({ dayPlan, setPlans }:{
  dayPlan: DayPlan; setPlans: React.Dispatch<React.SetStateAction<DayPlan[]>>
}) {
  const setField = (patch: Partial<DayPlan>) =>
    setPlans(prev=>prev.map(p=>p.date!==dayPlan.date? p : ({...p, ...patch})));
  return (
    <div className="space-y-2 text-sm">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">Sen (h)</span>
          <input type="number" step={0.25} min={0} value={dayPlan.sleepHours ?? ''} onChange={(e)=>setField({ sleepHours: e.target.value===''? undefined : Number(e.target.value) })} className="border rounded-lg px-2 py-1" placeholder="np. 7.5"/>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">HR spocz.</span>
          <input type="number" min={20} max={120} value={dayPlan.hrRest ?? ''} onChange={(e)=>setField({ hrRest: e.target.value===''? undefined : Number(e.target.value) })} className="border rounded-lg px-2 py-1" placeholder="np. 48"/>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">Masa (kg)</span>
          <input type="number" step={0.1} min={0} value={dayPlan.bodyMass ?? ''} onChange={(e)=>setField({ bodyMass: e.target.value===''? undefined : Number(e.target.value) })} className="border rounded-lg px-2 py-1" placeholder="np. 73.4"/>
        </label>
        <label className="flex flex-col gap-1 sm:col-span-1 col-span-2">
          <span className="text-xs text-neutral-500">Drzemki / opis</span>
          <input type="text" value={dayPlan.napsNote ?? ''} onChange={(e)=>setField({ napsNote: e.target.value })} className="border rounded-lg px-2 py-1" placeholder="np. 20’ o 14:00"/>
        </label>
      </div>
    </div>
  );
}
function MicroBreaksCard({ dayPlan, setPlans }:{
  dayPlan: DayPlan; setPlans: React.Dispatch<React.SetStateAction<DayPlan[]>>
}) {
  const target = dayPlan.microTarget ?? 10;
  const done = dayPlan.microDone ?? 0;
  const toggle = (idx:number)=>{
    const newDone = idx < done ? idx : idx+1;
    setPlans(prev=>prev.map(p=>p.date!==dayPlan.date? p : ({...p, microDone: newDone})));
  };
  return (
    <div className="space-y-2">
      <div className="text-xs text-neutral-600">Cel na dziś: {target} mikro-przerw (co 45–60 min, 2–4’)</div>
      <div className="flex flex-wrap gap-1">
        {Array.from({length: target}).map((_,i)=>{
          const checked=i<done;
          return (
            <button key={i} onClick={()=>toggle(i)}
              className={`w-5 h-5 rounded border text-[10px] flex items-center justify-center ${checked?'bg-neutral-900 text-white border-neutral-900':'bg-white'}`}
              title={`Mikro-przerwa ${i+1}`}>
              {checked?'✓':''}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// --- Small task menu (kebab) ---
function TaskMenu({
  onMove, onDelete
}:{ onMove:(isoDate:string)=>void; onDelete:()=>void }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(iso(new Date()));
  return (
    <div className="relative shrink-0">
      <button aria-label="Więcej" className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-500"
        onClick={()=>setOpen(v=>!v)}>
        <MoreHorizontal className="w-4 h-4"/>
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border bg-white shadow-lg p-2 text-sm">
          <div className="px-2 py-1.5 font-medium text-neutral-700">Akcje</div>
          <div className="px-2 py-2 space-y-2 border-t">
            <div className="flex items-center gap-2">
              <input type="date" value={val} onChange={(e)=>setVal(e.target.value)}
                     className="border rounded-lg p-1 text-xs w-full"/>
              <button className="px-2 py-1 bg-neutral-900 text-white rounded-lg text-xs"
                onClick={()=>{ onMove(val); setOpen(false); }}>
                Przenieś
              </button>
            </div>
            <button className="w-full text-left text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg"
              onClick={()=>{ onDelete(); setOpen(false); }}>
              Usuń
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- App ----------

export default function App() {
  // --- Auth state ---
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState(ALLOWED_EMAIL);

  useEffect(()=>{
    if(!supabase) return;
    supabase.auth.getSession().then(({ data })=>{ setSession(data.session||null); setUser(data.session?.user||null); });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess)=>{ setSession(sess); setUser(sess?.user||null); });
    return ()=>{ sub.subscription.unsubscribe(); };
  },[]);

  const signIn = async ()=>{
    if(!supabase) { alert("Brak konfiguracji Supabase"); return; }
    if(email.trim().toLowerCase() !== ALLOWED_EMAIL){ alert("Ten planer jest dostępny wyłącznie dla właściciela."); return; }
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: SITE_URL } });
    if(error) alert(error.message); else alert("Sprawdź skrzynkę i kliknij link logowania.");
  };
  const signOut = async ()=>{ if(supabase) await supabase.auth.signOut(); };

  // --- Planner state ---
  const [plans, setPlans] = useState<DayPlan[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [current, setCurrent] = useState<Date>(START);
  const [monthCursor, setMonthCursor] = useState<Date>(START);

  // Load or init
  useEffect(()=>{
    const saved = localStorage.getItem(STORAGE_KEY);
    const savedHistory = localStorage.getItem(HISTORY_KEY);
    if (saved) setPlans(JSON.parse(saved)); else setPlans(generateInitialPlan());
    if (savedHistory) setHistory(JSON.parse(savedHistory));
  },[]);
  useEffect(()=>{ localStorage.setItem(STORAGE_KEY, JSON.stringify(plans)); }, [plans]);
  useEffect(()=>{ localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); }, [history]);

  const currentISO = iso(current);
  const dayPlan = plans.find(p=>p.date===currentISO);

  // Month grid days
  const monthStart = startOfMonth(monthCursor);
  const monthEnd = endOfMonth(monthCursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const gridDays = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const toggleTask = (dateISO: string, id: string, checked: boolean) => {
    setPlans(prev => prev.map(p => p.date!==dateISO ? p : {
      ...p,
      tasks: p.tasks.map(t => t.id===id ? { ...t, done: checked } : t)
    }));
    setHistory(h=>[{ ts: Date.now(), date: dateISO, action: checked?"CHECK":"UNCHECK", detail: id }, ...h]);
  };
  const resetDay = (dateISO: string) => {
    setPlans(prev => prev.map(p => p.date!==dateISO ? p : ({...p, tasks: p.tasks.map(t=>({...t, done:false}))})));
    setHistory(h=>[{ ts: Date.now(), date: dateISO, action: "RESET_DAY", detail: "reset" }, ...h]);
  };
  const moveTask = (fromISO:string, toISO:string, id:string) => {
    if (fromISO===toISO) return;
    setPlans(prev => {
      const src = prev.find(p=>p.date===fromISO);
      const dst = prev.find(p=>p.date===toISO);
      if (!src || !dst) return prev;
      const task = src.tasks.find(t=>t.id===id);
      if (!task) return prev;
      const newSrc = { ...src, tasks: src.tasks.filter(t=>t.id!==id) };
      const newTask: Task = { ...task, id: `${toISO}_${task.category}_${Math.random().toString(36).slice(2,8)}` };
      const newDst = { ...dst, tasks: [...dst.tasks, newTask] };
      setHistory(h=>[{ ts: Date.now(), date: toISO, action: "MOVE_TASK", detail: `${task.label} ← ${fromISO}` }, ...h]);
      return prev.map(p => p.date===fromISO?newSrc : p.date===toISO?newDst : p);
    });
  };
  const moveWholeDay = (fromISO:string, toISO:string) => {
    if (fromISO===toISO) return;
    setPlans(prev => {
      const src = prev.find(p=>p.date===fromISO);
      const dst = prev.find(p=>p.date===toISO);
      if (!src || !dst) return prev;
      const moved = src.tasks.map(t=>({ ...t, id: `${toISO}_${t.category}_${Math.random().toString(36).slice(2,8)}` }));
      const newSrc = { ...src, tasks: [] };
      const newDst = { ...dst, tasks: [...dst.tasks, ...moved] };
      setHistory(h=>[{ ts: Date.now(), date: toISO, action: "MOVE_DAY", detail: `zadania z ${fromISO}` }, ...h]);
      return prev.map(p => p.date===fromISO?newSrc : p.date===toISO?newDst : p);
    });
  };
  const completion = (p?:DayPlan) => {
    if (!p || p.tasks.length===0) return 0;
    const done = p.tasks.filter(t=>t.done).length;
    return Math.round(100*done/p.tasks.length);
  };
  const exportJSON = () => {
    const blob = new Blob([JSON.stringify({ plans, history }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "audax_planner_v1_1.json"; a.click();
    URL.revokeObjectURL(url);
  };
  const importJSON = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result));
        if (obj.plans && obj.history) { setPlans(obj.plans); setHistory(obj.history); }
        else if (Array.isArray(obj)) { setPlans(obj); }
      } catch { alert("Nieprawidłowy plik JSON"); }
    };
    reader.readAsText(file);
  };

  // --- Access gate ---
  if (!user) { return <LoginScreen email={email} setEmail={setEmail} onSignIn={signIn} />; }
  if (user.email?.toLowerCase() !== ALLOWED_EMAIL) {
    return <LockedScreen onSignOut={signOut} allowedEmail={ALLOWED_EMAIL} currentEmail={user.email||""} />;
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 p-4">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sidebar: Month calendar & history */}
        <div className="lg:col-span-1 space-y-4">
          {/* Mini calendar */}
          <div className="bg-white rounded-2xl shadow p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <CalendarIcon className="w-5 h-5"/> Kalendarz
              </h2>
              <div className="flex items-center gap-2">
                <button className="p-1.5 rounded-lg hover:bg-neutral-100" onClick={()=>setMonthCursor(subMonths(monthCursor,1))}><ChevronLeft/></button>
                <div className="text-sm font-medium w-36 text-center">{format(monthCursor, "LLLL yyyy")}</div>
                <button className="p-1.5 rounded-lg hover:bg-neutral-100" onClick={()=>setMonthCursor(addMonths(monthCursor,1))}><ChevronRight/></button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-xs mt-3">
              {["Pn","Wt","Śr","Cz","Pt","So","Nd"].map(d=>(
                <div key={d} className="text-center text-neutral-500 py-1">{d}</div>
              ))}
              {gridDays.map(d=>{
                const dISO = iso(d);
                const isCur = isSameDay(d, current);
                const inMonth = isSameMonth(d, monthCursor);
                const p = plans.find(x=>x.date===dISO);
                const prog = completion(p);
                return (
                  <button key={dISO}
                    onClick={()=>{ setCurrent(d); }}
                    className={`aspect-square rounded-xl p-1 flex flex-col items-center justify-center border ${isCur?'border-neutral-900':'border-transparent'} ${inMonth?'bg-white':'bg-neutral-100'}`}>
                    <div className="text-xs">{format(d, "d")}</div>
                    <div className="w-full h-1 rounded bg-neutral-200 mt-1">
                      <div className="h-1 rounded bg-neutral-900" style={{width:`${prog}%`}}/>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* History */}
          <div className="bg-white rounded-2xl shadow p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <HistoryIcon className="w-5 h-5"/> Historia
              </h2>
              <button className="text-xs text-neutral-500 hover:underline" onClick={()=>setHistory([])}>Wyczyść</button>
            </div>
            <div className="mt-2 max-h-72 overflow-auto space-y-2 text-sm">
              {history.length===0 && <div className="text-neutral-500 text-sm">Brak zdarzeń</div>}
              {history.map((h,i)=>(
                <div key={i} className="flex items-start gap-2">
                  <div className="text-[11px] text-neutral-500">{new Date(h.ts).toLocaleString()}</div>
                  <div className="flex-1">
                    <div className="font-medium">{h.action}</div>
                    <div className="text-neutral-600">{h.detail} — {h.date}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Export / Import */}
          <div className="bg-white rounded-2xl shadow p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5"/> Narzędzia
              </h2>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={exportJSON} className="px-3 py-2 bg-white border rounded-xl shadow-sm flex items-center gap-2">
                <Download className="w-4 h-4"/> Export
              </button>
              <label className="px-3 py-2 bg-white border rounded-xl shadow-sm flex items-center gap-2 cursor-pointer">
                <Upload className="w-4 h-4"/> Import
                <input type="file" accept="application/json" className="hidden" onChange={(e)=>{ const f=e.target.files?.[0]; if (f) importJSON(f); e.currentTarget.value=""; }}/>
              </label>
              <button onClick={()=>{ if(dayPlan) resetDay(dayPlan.date); }}
                      className="px-3 py-2 bg-white border rounded-xl shadow-sm flex items-center gap-2">
                <RotateCcw className="w-4 h-4"/> Reset dnia
              </button>
            </div>
          </div>
        </div>

        {/* Main day view */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl shadow p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm text-neutral-500">{dayNames[new Date(currentISO).getDay()===0?6:new Date(currentISO).getDay()-1]}</div>
                <h1 className="text-2xl font-bold">{format(new Date(currentISO), "d LLLL yyyy")}</h1>
                <div className="text-sm text-neutral-600">{dayPlan?.phase} • tydzień {dayPlan?.week} • ukończone {completion(dayPlan)}%</div>
              </div>
              <div className="flex items-center gap-2">
                <button className="px-3 py-2 bg-white border rounded-xl shadow-sm" onClick={()=>setCurrent(addDays(current,-1))}><ChevronLeft className="w-4 h-4"/></button>
                <button className="px-3 py-2 bg-white border rounded-xl shadow-sm" onClick={()=>setCurrent(addDays(current,1))}><ChevronRight className="w-4 h-4"/></button>
                {/* Move whole day */}
                <div className="flex items-center gap-2 text-xs border rounded-xl p-2">
                  <span>Przenieś dzień na</span>
                  <input type="date" value={currentISO} onChange={(e)=>moveWholeDay(currentISO, e.target.value)} className="border rounded-lg p-1"/>
                </div>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Categories */}
            {dayPlan && (["GYM","BIKE","MOB","MICRO","HAND","NUTR","SLEEP"] as Task["category"][]).map(cat=>{
              const catTasks = dayPlan.tasks.filter(t=>t.category===cat);
              if (catTasks.length===0 && !["MICRO","SLEEP"].includes(cat)) return null;
              const titleMap: Record<Task["category"],string> = {
                GYM:"Siłownia / CORE", BIKE:"Rower", MOB:"Mobilność",
                MICRO:"Mikro-przerwy", HAND:"Rehab dłoni", NUTR:"Żywienie / Meal-prep",
                SLEEP:"Sen / Regeneracja"
              };
              return (
                <div key={cat} className="border rounded-2xl p-3 bg-white shadow-sm">
                  <div className="font-semibold mb-2">{titleMap[cat]}</div>

                  {cat === "MICRO" ? (
                    <MicroBreaksCard dayPlan={dayPlan} setPlans={setPlans} />
                  ) : cat === "SLEEP" ? (
                    <SleepCard dayPlan={dayPlan} setPlans={setPlans} />
                  ) : (
                    <div className="space-y-2">
                      {catTasks.map(t=> (
                        <div key={t.id} className="flex items-start gap-2">
                          <input type="checkbox" checked={t.done}
                            onChange={(e)=>toggleTask(dayPlan.date, t.id, e.target.checked)}
                            className="mt-1 w-4 h-4"/>
                          <div className="flex-1">
                            <div className="text-sm leading-snug flex items-start justify-between gap-2">
                              <span>{t.label}</span>
                              <TaskMenu
                                onMove={(to)=>moveTask(dayPlan.date, to, t.id)}
                                onDelete={()=>{
                                  setPlans(prev=>prev.map(p=>p.date!==dayPlan.date?p:({...p,tasks:p.tasks.filter(x=>x.id!==t.id)})));
                                  setHistory(h=>[{ ts: Date.now(), date: dayPlan.date, action: "DELETE_TASK", detail: t.label }, ...h]);
                                }}
                              />
                            </div>
                            {t.tips && t.tips.length>0 && (
                              <ul className="text-xs text-neutral-500 list-disc ml-5 mt-1">
                                {t.tips.slice(0,2).map((tip,i)=>(<li key={i}>{tip}</li>))}
                              </ul>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Auth screens ---
function LoginScreen({ email, setEmail, onSignIn }:{
  email:string; setEmail:(v:string)=>void; onSignIn:()=>void
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-4">
      <div className="bg-white rounded-2xl shadow p-6 w-full max-w-md">
        <h1 className="text-xl font-bold mb-2">Audax Planner — logowanie</h1>
        <p className="text-sm text-neutral-600 mb-4">
          Dostęp wyłącznie dla właściciela. Zaloguj się magic linkiem.
        </p>
        <label className="block text-sm font-medium mb-1">E-mail</label>
        <input type="email" value={email} onChange={(e)=>setEmail(e.target.value)}
               className="w-full border rounded-xl px-3 py-2 mb-3" placeholder="robert@pego.cc"/>
        <button onClick={onSignIn} className="w-full px-3 py-2 bg-neutral-900 text-white rounded-xl">
          Wyślij link logowania
        </button>
        <p className="text-xs text-neutral-500 mt-3">
          Po kliknięciu linku w e-mailu wrócisz do tej aplikacji zalogowany.
        </p>
      </div>
    </div>
  );
}
function LockedScreen({ onSignOut, allowedEmail, currentEmail }:{
  onSignOut:()=>void; allowedEmail:string; currentEmail:string
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-4">
      <div className="bg-white rounded-2xl shadow p-6 w-full max-w-md text-center">
        <h1 className="text-xl font-bold mb-2">Brak uprawnień</h1>
        <p className="text-sm text-neutral-600">
          Ta aplikacja jest dostępna tylko dla <b>{allowedEmail}</b>.<br/>
          Zalogowano jako: {currentEmail}
        </p>
        <button onClick={onSignOut} className="mt-4 px-3 py-2 bg-white border rounded-xl">
          Wyloguj
        </button>
      </div>
    </div>
  );
}
