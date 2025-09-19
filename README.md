# Audax Planner (Vercel + Supabase ready)

## Szybki start
1. Ustaw w Vercel zmienne:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON`
2. Deploy (repo → Vercel). Projekt używa `vercel.json`, więc Vercel wykona `npm run build` i użyje `dist`.

## Lokalnie
```bash
npm install
npm run dev
```

## Notatka
- W `package.json` dodano `@supabase/supabase-js` — wymagane, jeśli w `src/App.tsx` importujesz klienta Supabase.
