# Audax Planner

Interaktywny planer przygotowań do zawodów **Audax Trail (23.11.2025)**

## Funkcje
- Checklisty dzienne (siłownia, rower, mobilność, żywienie, sen)
- Historia akcji
- Przenoszenie zadań/dni
- Export/Import JSON
- (opcjonalnie) synchronizacja z Supabase

## Uruchomienie lokalne
```bash
npm install
npm run dev
```

Aplikacja uruchomi się na [http://localhost:5173](http://localhost:5173)

## Build produkcyjny
```bash
npm run build
npm run preview
```

## Deploy na Vercel
1. Wrzuć repozytorium na GitHub.
2. Podłącz projekt w [Vercel](https://vercel.com).
3. Ustaw:
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Dodaj zmienne środowiskowe:
   - `VITE_SUPABASE_URL` = `https://twoj-projekt.supabase.co`
   - `VITE_SUPABASE_ANON` = Twój anon key

Po wdrożeniu dostaniesz link w stylu `https://audax-planner.vercel.app`.
