# SPEC-001: Education Voice Agent — Hybrid Chat/Voice with LiveKit + GPT-Realtime

## Overview

Build a conversational AI platform for K-12 Math & Physics education (Vietnamese). The system provides a hybrid chat+voice interface where students can type questions or tap a voice button to speak — both modes share the same conversation context. The voice agent uses LiveKit + OpenAI GPT-Realtime for low-latency speech-to-speech, with an async visualization tool calling teammate's API. LLM handles math reasoning directly (no external solver needed). Neo4j RAG is out of scope for this spec (separate project).

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js + React 19)                     │
│                                                                       │
│  ┌──────────────────┐  ┌─────────────┐  ┌────────────────────────┐   │
│  │ AgentChatTranscript│  │ AgentControlBar│ Animation Renderer    │   │
│  │ (text chat +      │  │ (mic toggle,  │  │ (teammate component)  │   │
│  │  voice transcript)│  │  disconnect)  │  │ iframe/HTML render    │   │
│  └────────┬─────────┘  └──────┬───────┘  └───────────▲────────────┘   │
│           │                   │                       │                │
│           │    ┌──────────────┴───────────────┐       │                │
│           │    │     LiveKit Room (WebRTC)     │       │                │
│           └────┤  • audio track (voice)        │  data channel          │
│                │  • data channel (text/tools)  ├───────┘                │
│                └──────────────┬───────────────┘                        │
└───────────────────────────────┼────────────────────────────────────────┘
                                │ WebRTC
┌───────────────────────────────┼────────────────────────────────────────┐
│                    LiveKit Cloud / Self-hosted SFU                       │
└───────────────────────────────┼────────────────────────────────────────┘
                                │
┌───────────────────────────────┼────────────────────────────────────────┐
│              Agent Worker — Node.js (BẠN)                               │
│                                                                         │
│  AgentSession({                                                         │
│    llm: openai.realtime.RealtimeModel({                                 │
│      model: "gpt-realtime-2.1",                                         │
│      modalities: ["text", "audio"],                                     │
│      voice: "marin",                                                    │
│    }),                                                                  │
│  })                                                                     │
│                                                                         │
│  Tools:                                                                 │
│  ├── render_visualization(topic, requirements)  [async, non-blocking]   │
│  │      │                                                               │
│  │      └── POST http://teammate-api/api/visualize (fake 2s delay)     │
│  │                                                                     │
│  └── format_transcript() → gpt-4.1-mini (markdown với LaTeX)           │
│                                                                         │
│  LLM: tự giải toán, không cần tool solver riêng                         │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                │ HTTP
┌───────────────────────────────┼────────────────────────────────────────┐
│           Visualization API (TEAMMATE) — hiện tại FAKE                     │
│                                                                         │
│  POST /api/visualize                                                     │
│    { prompt, requirements, session_id }                                  │
│  → fake delay 2s → return HTML mặc định (placeholder)                    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Core Design Decisions

### 1. Single AgentSession — Hybrid Text+Voice

Không tách chat agent và voice agent. Một `AgentSession` với `RealtimeModel(modalities=["text", "audio"])` xử lý cả hai input modality. ChatContext là single source of truth cho toàn bộ conversation history.

**Cách hoạt động:**

| Mode | Input | Output |
|------|-------|--------|
| Text | Data channel: `conversation.item.create({type: "input_text", text: ...})` | Model trả text + optional audio |
| Voice | WebRTC audio track → streaming vào RealtimeModel | Audio streaming + transcript tự động |

Khi user tap voice button, chỉ toggle input modality — không tạo session mới, không mất context.

### 2. Transcript → Markdown Post-processing

GPT-Realtime text output là transcript plain text (lời nói), không có markdown/LaTeX. Sau mỗi response của agent, trigger tool `format_transcript()` gọi `gpt-4.1-mini` để format lại thành markdown đẹp:

```
Agent nói: "C n k bằng n giai thừa chia k giai thừa nhân n trừ k giai thừa"
                    │
                    ▼  format_transcript() → gpt-4.1-mini
Chat hiển thị: $$C(n,k) = \frac{n!}{k!(n-k)!}$$
```

### 3. Async Non-blocking Tools

Tool render visualization dùng `ctx.update()` để:
1. Release control về LLM ngay lập tức → agent nói preamble
2. Chạy render trong background → agent tiếp tục giải thích
3. Khi render xong → kết quả forward qua data channel → frontend hiển thị

### 4. Runner Loop (Multi-step Tool Calls)

`AgentSession` tự động handle tool loop qua `max_tool_steps` (default ~10). Mỗi user message có thể trigger nhiều tool call tuần tự:
- render_visualization (async, non-blocking) → LLM tiếp tục giải thích → hoàn thành → hiển thị

### 5. Multi-Session Chat Management

LiveKit dùng Room làm đơn vị conversation. Để hỗ trợ multi-session (sidebar chat list như ChatGPT/Gemini):

- **Mỗi conversation = 1 Room** với tên unique: `conv_<uuid>`
- **Backend (lightweight):** lưu metadata conversation vào SQLite/Postgres — `{ id, room_name, title, created_at }`
- **Frontend:** quản lý danh sách conversations, hiển thị sidebar
- **Chuyển conversation:** disconnect Room cũ → join Room mới → load ChatContext với history (nếu có)
- **ChatContext persistence:** lưu history vào DB khi session kết thúc, load lại khi reconnect

GPT-Realtime session tối đa 60 phút. Đối với multi-session dài hạn, mỗi lần join Room mới sẽ tạo Realtime session mới.

---

## Agent Logic (Pseudo-code)

```typescript
import { Agent, AgentSession, function_tool, RunContext } from '@livekit/agents';
import * as openai from '@livekit/agents-plugin-openai';

class EduTutorAgent extends Agent {
  constructor() {
    super({
      instructions: `Bạn là trợ lý học tập môn Toán và Vật Lý cho học sinh phổ thông Việt Nam.
- Trả lời bằng tiếng Việt, giọng thân thiện, dễ hiểu.
- Bạn có khả năng giải toán, suy luận logic — không cần công cụ ngoài.
- Khi học viên muốn xem hình minh họa, gọi render_visualization.
- Với render_visualization: nói preamble ("Để tôi vẽ...") rồi tiếp tục giải thích trong lúc chờ.
- LUÔN giải thích bằng lời, không chỉ đọc công thức.`,
      tools: [renderVisualization, formatTranscript],
    });
  }

  async on_enter() {
    await this.session.generate_reply({
      instructions: 'Chào học viên, hỏi hôm nay bạn muốn học gì.',
    });
  }
}

// === TOOLS ===

const renderVisualization = function_tool({
  name: 'render_visualization',
  description: 'Tạo animation/hình minh họa cho khái niệm. Gọi khi học viên muốn xem trực quan.',
  flags: ToolFlag.CANCELLABLE,
  on_duplicate: 'reject',
  parameters: z.object({
    topic: z.string().describe('Chủ đề cần minh họa.'),
    requirements: z.string().describe('Yêu cầu cụ thể: sơ đồ, animation, style...'),
  }),
  execute: async ({ topic, requirements }, { ctx }) => {
    // Release control → agent nói preamble ngay
    await ctx.update(`Để tôi vẽ hình minh họa cho ${topic}, bạn xem bên phải nhé.`);

    // FAKE: gọi teammate API (hiện tại fake 2s delay trả HTML mặc định)
    const viz = await fetch(`${VIS_API_URL}/api/visualize`, {
      method: 'POST',
      body: JSON.stringify({ prompt: topic, requirements }),
    }).then(r => r.json());

    // Forward kết quả qua data channel → frontend render
    await ctx.forwardToClient('visualization_ready', viz);

    return viz.status === 'done'
      ? `Hình minh họa cho ${topic} đã sẵn sàng, bạn xem bên phải nhé.`
      : `Đang tạo hình cho ${topic}, vui lòng đợi thêm.`;
  },
});

const formatTranscript = function_tool({
  name: 'format_transcript',
  description: 'Format transcript thành markdown với LaTeX cho công thức toán.',
  parameters: z.object({
    transcript: z.string(),
  }),
  execute: async ({ transcript }) => {
    const result = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [{
        role: 'system',
        content: `Reformat the following educational transcript into well-formatted markdown.
- Use $$...$$ for block LaTeX, $...$ for inline LaTeX.
- Use ### for headings, - for lists, ** for bold.
- Preserve ALL mathematical formulas in LaTeX.
- Keep the same meaning and Vietnamese language.`,
      }, {
        role: 'user',
        content: transcript,
      }],
    });
    return result.choices[0].message.content;
  },
});
```

---

## Frontend (Next.js + LiveKit Agents UI)

### Package Stack

| Package | Purpose |
|---------|---------|
| `@livekit/components-react` | `useSession`, `useAgent`, `useSessionMessages` hooks |
| `@agents-ui/*` (shadcn) | `AgentSessionProvider`, `AgentControlBar`, `AgentChatTranscript`, `AgentAudioVisualizerBar` |
| `livekit-client` | `TokenSource`, low-level room control |
| `kaTeX` | Render LaTeX math trong chat |

### Component Tree

```
<AgentSessionProvider session={session}>
  <main className="flex h-screen">
    {/* Sidebar: multi-session */}
    <ConversationSidebar
      conversations={conversations}
      activeId={activeConvId}
      onSelect={switchConversation}
      onNew={createConversation}
    />

    {/* Center: Chat + Voice */}
    <div className="flex-1 flex flex-col">
      <AgentChatTranscript
        agentState={state}
        messages={messages}
      />
      <AgentControlBar
        variant="default"
        controls={['microphone', 'chat']}
      />
    </div>

    {/* Right: Animation Renderer */}
    <div className="w-1/2">
      <VisualizationPanel sessionId={activeConvId} />
    </div>
  </main>

  <AgentAudioVisualizerBar />
</AgentSessionProvider>
```

### Session Initialization

```typescript
'use client';
import { useSession } from '@livekit/components-react';
import { TokenSource } from 'livekit-client';
import { AgentSessionProvider } from '@/components/agents-ui/agent-session-provider';

const tokenSource = TokenSource.endpoint('/api/livekit-token');

export default function Page() {
  const session = useSession(tokenSource, {
    agentName: 'edu-tutor-agent',
    participantIdentity: generateUserId(),
  });

  useEffect(() => {
    session.start();
    return () => { session.end(); };
  }, []);

  return (
    <AgentSessionProvider session={session}>
      <SessionView />
    </AgentSessionProvider>
  );
}
```

### Voice Mode Interaction

Khi user tap mic button (đã có sẵn trong `AgentControlBar`):
- Microphone bắt đầu stream audio vào LiveKit room
- RealtimeModel nhận audio track, VAD tự động detect turn
- Agent trả lời bằng giọng nói
- Transcript tự động append vào `AgentChatTranscript`
- Không cần code gì thêm — LiveKit handle toàn bộ

### Token Server (Next.js API route)

```typescript
// app/api/livekit-token/route.ts
import { AccessToken } from 'livekit-server-sdk';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const roomName = searchParams.get('room') || 'default-room';
  const userId = searchParams.get('userId') || `student-${Date.now()}`;

  const token = new AccessToken(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
    { identity: userId, ttl: '3h' }
  );
  token.addGrant({ roomJoin: true, room: roomName });
  return Response.json({ token: await token.toJwt() });
}
```

### Conversations API (lightweight backend)

```typescript
// app/api/conversations/route.ts
// GET    → list conversations của user
// POST   → tạo conversation mới (room = `conv_<uuid>`)
// DELETE → xóa conversation

interface Conversation {
  id: string;         // uuid
  room_name: string;  // "conv_<uuid>"
  title: string;      // "Bài học về tổ hợp"
  created_at: string;
  updated_at: string;
}

// Lưu trong SQLite (dev) hoặc Postgres (production)
// Khi user join conversation → gọi token endpoint với room=conv_<uuid>
```

### Multi-Session Flow

```typescript
// Frontend: switch conversation
async function switchConversation(conv: Conversation) {
  await session.end();                          // disconnect room cũ
  const newSession = useSession(tokenSource, {
    agentName: 'edu-tutor-agent',
    roomName: conv.room_name,                   // join room mới
    participantIdentity: userId,
  });
  await newSession.start();
  // AgentSession tự động tạo ChatContext mới hoặc load history nếu có
}
```

### Markdown Rendering in Chat

`AgentChatTranscript` có thể extended để render markdown + LaTeX:

```typescript
// Custom message renderer
function renderMessage(message: ReceivedChatMessage) {
  if (message.role === 'assistant') {
    return <MarkdownWithLatex content={message.content} />;
  }
  return <p>{message.content}</p>;
}
```

---

## Integration Contracts

### Bạn → Teammate: Visualization API (FAKE — test UX)

```
POST /api/visualize
Content-Type: application/json

{
  "prompt": "tổ hợp chập k của n",
  "requirements": "Sơ đồ chọn phần tử, animation",
  "session_id": "conv_abc"
}

// FAKE: delay 2s, return HTML placeholder
Response (sau 2s):
{
  "id": "viz_123",
  "html": "<html><body><h1>Tổ hợp</h1><p>Hình minh họa đang được xây dựng...</p></body></html>",
  "status": "done"
}
```

### Frontend: VisualizationPanel

```typescript
// Component render teammate's HTML trong iframe sandbox
function VisualizationPanel({ sessionId }: { sessionId: string }) {
  const [html, setHtml] = useState<string | null>(null);

  // Listen data channel event từ agent tool
  useDataChannelEvent('visualization_ready', (payload) => {
    setHtml(payload.html);
  });

  if (!html) return <div className="flex items-center justify-center h-full text-gray-400">
    Hình minh họa sẽ hiển thị ở đây
  </div>;

  return <iframe srcDoc={html} className="w-full h-full border-0" sandbox="allow-scripts" />;
}
```

---

## Environment Variables

```env
# LiveKit
LIVEKIT_API_KEY=xxx
LIVEKIT_API_SECRET=xxx
LIVEKIT_URL=wss://your-project.livekit.cloud

# OpenAI
OPENAI_API_KEY=sk-xxx

# Teammate API (fake for now)
VIS_API_URL=http://localhost:3001

# Frontend
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud
NEXT_PUBLIC_TOKEN_ENDPOINT=/api/livekit-token
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| OpenAI API error | AgentSession retry, sau 3 lần → thông báo lỗi |
| Visualization API timeout (>30s) | Tool cancel, agent nói "Đang gặp vấn đề tạo hình, tôi sẽ giải thích bằng lời" |
| Visualization API unavailable | Agent skip tool, giải thích bằng lời |
| Voice VAD false positive | Semantic VAD (default) xử lý — ít false trigger hơn server VAD |
| User interrupt while agent speaking | LiveKit tự động cancel response, truncate, và xử lý turn mới |

---

## Development Setup

### Prerequisites
- Node.js 22+ / Deno
- LiveKit Cloud account (hoặc self-hosted livekit-server)
- OpenAI API key (GPT-Realtime + gpt-4.1-mini)

### Quick Start

```bash
# 1. Agent worker (src-livekit/)
cd src-livekit
npm install
npm run dev

# 2. Teammate fake API (hoặc mock endpoint)
# Simple Express/Fastify server trả HTML mặc định sau 2s delay

# 3. Frontend
cd frontend
npm install
npx shadcn@latest add @agents-ui/agent-session-provider @agents-ui/agent-control-bar @agents-ui/agent-chat-transcript @agents-ui/agent-audio-visualizer-bar
npm run dev
```

### Local Testing with LiveKit CLI

```bash
lk agent dev     # chạy agent worker locally
```

---

## File Structure (Target)

```
VNIC/
├── .sdlc/SPEC001-edu-voice-agent/spec.md  ← this file
├── src-livekit/                            ← Agent worker (bạn)
│   ├── package.json
│   ├── agent.ts                            ← EduTutorAgent + tools
│   ├── session.ts                          ← AgentSession config
│   └── tools/
│       ├── visualization.ts                ← render_visualization (async)
│       └── format.ts                       ← format_transcript (gpt-4.1-mini)
├── fake-vis-api/                           ← Teammate mock API
│   └── server.ts                           ← delay 2s → return HTML placeholder
└── frontend/                               ← Next.js app (bạn)
    ├── package.json
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx
    │   └── api/
    │       ├── livekit-token/route.ts      ← token endpoint
    │       └── conversations/route.ts      ← CRUD conversations list
    ├── components/
    │   ├── agents-ui/                      ← shadcn components (generated)
    │   ├── chat/
    │   │   └── sidebar.tsx                 ← multi-session sidebar
    │   └── visualization/
    │       └── panel.tsx                   ← iframe renderer
    └── lib/
        ├── markdown.tsx                    ← Markdown + LaTeX renderer
        └── db.ts                           ← SQLite conversation store
```

---

## Acceptance Criteria

1. [ ] User có thể gõ text chat → agent trả lời bằng text (markdown + LaTeX)
2. [ ] User tap voice button → agent nghe và trả lời bằng giọng nói
3. [ ] Voice transcript hiển thị dưới dạng text trong chat
4. [ ] Chat và voice dùng chung context: chat trước → voice sau vẫn nhớ
5. [ ] Agent gọi visualization tool → preamble nói ngay → giải thích tiếp → animation hiển thị khi xong (2s delay)
6. [ ] Công thức toán hiển thị đẹp (LaTeX) trong chat
7. [ ] Agent xử lý interruption (user ngắt lời khi đang nói)
8. [ ] Sidebar hiển thị danh sách conversations, chuyển qua lại giữa các session
9. [ ] Error handling: tool/API fail không crash agent, thông báo lỗi rõ ràng
