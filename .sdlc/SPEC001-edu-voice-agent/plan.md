# Education Voice Agent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js agent worker with LiveKit + GPT-Realtime providing hybrid chat/voice tutoring for K-12 Math/Physics in Vietnamese.

**Architecture:** Single `AgentSession` with `openai.realtime.RealtimeModel(modalities=["text","audio"])` handles both text chat and voice input. Two tools: `render_visualization` (async, calls fake teammate API with 2s delay) and `format_transcript` (post-processes plain transcript into markdown with LaTeX via gpt-4.1-mini). LLM handles math reasoning directly.

**Tech Stack:** `@livekit/agents` 1.5, `@livekit/agents-plugin-openai` 1.5, `zod`, `dotenv`, TypeScript, Node.js 22+

---

## File Map

```
src-livekit/
├── package.json          ← dependencies + scripts
├── tsconfig.json         ← TypeScript config
├── .env.example          ← environment variable template
├── index.ts              ← entry point: defineAgent + cli.runApp
├── agent.ts              ← EduTutorAgent class (instructions + tools)
├── tools/
│   ├── visualization.ts  ← render_visualization (async fetch → fake API)
│   └── format.ts         ← format_transcript (gpt-4.1-mini call)
```

### Responsibility Boundaries

| File | Responsibility |
|------|---------------|
| `index.ts` | Wire up `defineAgent`, create `AgentSession` with `RealtimeModel`, start agent |
| `agent.ts` | Define `EduTutorAgent` with Vietnamese instructions, register tools |
| `tools/visualization.ts` | `render_visualization` tool — calls teammate fake API, non-blocking via `ctx.session.generateReply` |
| `tools/format.ts` | `format_transcript` tool — calls `gpt-4.1-mini` to convert plain transcript → markdown+LaTeX |

---

## Design Details

### RealtimeModel Configuration

```typescript
llm: new openai.realtime.RealtimeModel({
  model: "gpt-realtime-2.1",
  modalities: ["text", "audio"],   // hybrid text+voice
  voice: "marin",
  turnDetection: {
    type: "semantic_vad",
    create_response: true,
    interrupt_response: true,
  },
})
```

### Async Visualization Pattern (Node.js)

Node.js agents-js 1.5 uses `ctx.session.generateReply()` for immediate speech before tool work:

```typescript
execute: async ({ topic, requirements }, { ctx }) => {
  // 1. Trigger immediate spoken preamble
  ctx.session.generateReply({
    userInput: `Hãy nói: "Để tôi vẽ hình minh họa cho ${topic}, bạn xem bên phải nhé."`,
  });

  // 2. Fetch in background (fake API, 2s delay)
  const viz = await fetch(`${VIS_API_URL}/api/visualize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: topic, requirements }),
  }).then(r => r.json());

  // 3. Return result — agent speaks it when idle
  return viz.status === 'done'
    ? `Hình minh họa cho ${topic} đã sẵn sàng, bạn xem bên phải nhé.`
    : `Đang tạo hình cho ${topic}, vui lòng đợi thêm.`;
}
```

### Format Transcript Pattern

```typescript
execute: async ({ transcript }) => {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      { role: 'system', content: FORMAT_SYSTEM_PROMPT },
      { role: 'user', content: transcript },
    ],
    temperature: 0.1,
  });
  return response.choices[0].message.content ?? transcript;
}
```
