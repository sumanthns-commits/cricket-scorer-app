# Cricket Scorer

React Native + Expo app for local cricket clubs. Live scoring, player management, stats tracking, and AI-powered team selection.

## Stack

- React Native, Expo SDK (managed workflow), TypeScript strict
- Firebase JS SDK v10 — Firestore, Auth, Cloud Functions
- React Navigation v6 (bottom tabs + native stack)
- Zustand for local state, React Query for server state
- Firebase AI SDK (`firebase/ai`, Vertex AI backend) with Gemini 2.5 Flash

## Docs

- [AI Assistant — supported query types](docs/ai-assistant-capabilities.txt)
- [CLAUDE.md](CLAUDE.md) — codebase rules and domain notes for AI coding assistants

## Getting started

```bash
npm install
npx expo start
```

Set `EXPO_PUBLIC_USE_EMULATOR=true` in `.env` to run against the local Firebase emulator.
