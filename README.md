# VNIC — Trợ lý học tập Toán & Vật Lý

Voice AI tutor for K-12 Math & Physics education (Vietnamese). Hybrid chat + voice interface using LiveKit + OpenAI GPT-Realtime.

## Architecture

```
Browser (Next.js + Agents UI)
    ↕ WebRTC
LiveKit Cloud / Self-hosted
    ↕
Agent Worker (Node.js)
    ├── GPT-Realtime (voice + text)
    ├── render_visualization (async tool → teammate API)
    └── format_transcript (gpt-4.1-mini → markdown + LaTeX)
    ↕ WebSocket
OpenAI Realtime API
```

## Quick Start

### Prerequisites

- Node.js 22+
- LiveKit server (Cloud or self-hosted at `ws://localhost:7880`)
- OpenAI API key with access to `gpt-realtime-2.1` and `gpt-4.1-mini`

### 1. Setup Agent Worker

```bash
cd src-livekit
cp .env.example .env
# Edit .env with your keys:
#   LIVEKIT_API_KEY=...
#   LIVEKIT_API_SECRET=...
#   LIVEKIT_URL=wss://your-project.livekit.cloud
#   OPENAI_API_KEY=sk-...
#   VIS_API_URL=http://localhost:3001

npm install
```

### 2. Setup Frontend

```bash
cd frontend
cp .env.example .env.local
# Edit .env.local with your LiveKit credentials

npm install
```

### 3. Start Fake Visualization API (optional, for development)

```bash
cd src-livekit
npm run fake-vis
# → http://localhost:3001 (2s delay, returns placeholder HTML)
```

### 4. Run

```bash
# Terminal 1: Agent worker
cd src-livekit && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev
# → http://localhost:3000
```

## Environment Variables

### Agent Worker (`src-livekit/.env`)

| Variable | Description |
|----------|-------------|
| `LIVEKIT_API_KEY` | LiveKit API key |
| `LIVEKIT_API_SECRET` | LiveKit API secret |
| `LIVEKIT_URL` | LiveKit server WebSocket URL |
| `OPENAI_API_KEY` | OpenAI API key |
| `VIS_API_URL` | Teammate visualization API (default: `http://localhost:3001`) |

### Frontend (`frontend/.env.local`)

| Variable | Description |
|----------|-------------|
| `LIVEKIT_API_KEY` | LiveKit API key |
| `LIVEKIT_API_SECRET` | LiveKit API secret |
| `NEXT_PUBLIC_LIVEKIT_URL` | LiveKit server WebSocket URL (client-facing) |
| `NEXT_PUBLIC_TOKEN_ENDPOINT` | Token endpoint path (default: `/api/livekit-token`) |

## Project Structure

```
VNIC/
├── src-livekit/               # Agent worker (Node.js)
│   ├── index.ts               # Entry point: defineAgent + RealtimeModel
│   ├── agent.ts               # EduTutorAgent (Vietnamese instructions)
│   ├── tools/
│   │   ├── visualization.ts   # render_visualization (async → fake API)
│   │   └── format.ts          # format_transcript → gpt-4.1-mini → markdown
│   └── fake-vis-api.ts        # Mock teammate visualization API
├── frontend/                  # Next.js + LiveKit Agents UI
│   ├── app/
│   │   ├── page.tsx           # Main page: SessionView + chat + voice
│   │   └── api/livekit-token/ # Token endpoint
│   ├── components/
│   │   ├── agents-ui/         # Shadcn Agents UI components
│   │   └── visualization-panel.tsx  # HTML renderer + formatted output
│   └── lib/markdown.tsx       # ReactMarkdown + LaTeX (KaTeX)
└── docker-compose.yml         # Neo4j (optional, separate project)
```

## Model Configuration

Agent worker uses `gpt-realtime-2.1` with optimized settings for Vietnamese education:

| Parameter | Value | Notes |
|-----------|-------|-------|
| `model` | `gpt-realtime-2.1` | Latest production voice model |
| `voice` | `marin` | Natural Vietnamese voice |
| `temperature` | `0.7` | Balanced accuracy vs naturalness |
| `speed` | `1.2` | 20% faster than default |
| `reasoning.effort` | `medium` | Math/physics requires reasoning |
| `turnDetection` | `semantic_vad` | Natural turn-taking |
| `modalities` | `["text", "audio"]` | Hybrid chat + voice |
