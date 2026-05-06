# Parcela Web

React/Vite frontend for Parcela.

## Stack

- React 19 + TypeScript
- Vite
- MapLibre GL JS
- Zustand
- i18next / react-i18next
- Vitest + Testing Library

## Development

```bash
npm install
npm run dev
```

The app runs at `http://localhost:5173` by default.

Set `VITE_API_BASE` in `web/.env` when the API is not available at the default local URL:

```bash
VITE_API_BASE=http://localhost:3000
```

## Validation

```bash
npm run typecheck
npm test -- --run
npm run build
```

## Source Layout

- `src/components/ChatPanel` — localized chat input and conversation controls
- `src/components/MapView` — MapLibre rendering and feature selection
- `src/components/ResultsPanel` — explanations, tables, exports, and metadata
- `src/store/chat-store.ts` — Zustand state and API orchestration
- `src/lib/api.ts` — typed API client
- `src/locales` — English and Spanish UI strings
