# Q Bank Web — agent & contributor guide

Vite + React 19 web client for the Q Bank API (`../back_q_bank`), ported from the Expo app
(`../client_q_bank`). Same data layer, browser UI (Tailwind v4 + shadcn/ui).

## Commands

```bash
npm run dev      # Vite on :5173, proxies /api and /media to production (API_PROXY_TARGET to override)
npm run check    # typecheck + tests — run before declaring work done
npm run build    # production bundle in dist/
npm run deploy   # build + firebase deploy --only hosting
npx shadcn@latest add <component>   # adds to src/components/ui (components.json is set up)
```

## Shared with the mobile app — keep in sync

These are copies of `../client_q_bank/src`; change both sides together:
`api/*` (except `client.ts` env name and the foreground listeners of `attempt-sync.ts` and
`vocab-sync.ts`), `attempt-engine/*`, `vocab/*`, `stores/vocab-store.ts`,
`utils/*`, `components/question/answer-model.ts`, `screens/*/{rows,filters,review-filters,insights,schema}.ts`,
`components/charts/geometry.ts`, `i18n/locales/*.json` (merge keys, never copy the files over: the web
has a few of its own). Tests travel with them. `vocab/term.ts` is also the server's
`src/modules/vocab/term.ts`: the three must compute the same `termKey`.

## Rules

- API: validate every response with a zod schema; show errors with `describeError(error, t)`;
  branch on `toApiError(error).serverCode`. Keep `retry: { limit: 1, methods: [] }` in the ky client
  (it is what allows the replay after a token refresh).
- Server data → TanStack Query (keys in `api/query-keys.ts`); client state → zustand (+ `persist` on
  `zustandStorage`). Read zustand with one selector per value.
- Vocabulary (offline-first): notes live in `stores/vocab-store.ts` (per user, keys `vocab:<userId>:*`,
  user id read from the access token) and sync in the background through `api/vocab-sync.ts`
  (`POST /vocab/sync`). Change notes only through the store's functions (`noteTerm`,
  `deleteVocabNote`, …); never put them in TanStack Query. Pure rules (keys, matching, merge) are in
  `vocab/`.
- Question text on vocabulary screens goes through `<VocabText>` inside a `data-vocab-block`
  element, and the screen wraps it in `<VocabScope sourceTitle>` (`components/vocab/`: one popover
  and one capture-phase click handler per screen, so nothing interactive is nested in option
  buttons; note mode saves highlighted text through `use-note-selection.ts`).
- Sectioned attempts: the browser is the source of truth while open. Record every action through
  `dispatchAttempt`; never measure time with `Date.now()` differences (the engine uses
  `performance.now()`).
- Styling: shadcn token names (`bg-card`, `text-muted-foreground`, `bg-primary`…) plus the app
  tokens in `index.css` (`*-soft`, `*-soft-foreground`, `success`, `warning`, `chart-N`,
  `brand-*`, `on-brand-*`, `bg-brand-gradient`). No hard-coded colors; in SVG use `var(--token)`.
- Dialogs: `confirm()` / `notify()` from `components/app/confirm.tsx` replace `Alert.alert`.
- Every new string goes in both `vi.json` and `en.json` (keys are type-checked).
- Effects return nothing but a cleanup function: write `useEffect(() => { … }, deps)` with braces,
  never `useEffect(() => call(), deps)`. Since Chromium 154, `window.scrollTo()` and friends return
  a Promise; React keeps whatever an effect returns as its cleanup and crashes on unmount with
  "destroy is not a function".
- Routes are lazy (`app.tsx`): screens export a named component; add new ones with `screen(...)`.
- Tests sit next to the file: `foo.ts` + `foo.test.ts` (Vitest globals).
