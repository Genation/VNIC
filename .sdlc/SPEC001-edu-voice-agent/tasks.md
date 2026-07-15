# Tasks: SPEC-001 Education Voice Agent

---

### Task 1: Project scaffold — package.json + tsconfig.json + .env

**Files:**
- Create: `src-livekit/package.json`
- Create: `src-livekit/tsconfig.json`
- Create: `src-livekit/.env.example`

- [ ] **Step 1: Create package.json**

  ```json
  {
    "name": "vnic-edu-agent",
    "version": "0.1.0",
    "type": "module",
    "scripts": {
      "dev": "tsx index.ts dev",
      "start": "tsx index.ts start"
    },
    "dependencies": {
      "@livekit/agents": "^1.5.1",
      "@livekit/agents-plugin-openai": "^1.5.0",
      "dotenv": "^16.4.0",
      "openai": "^6.8.1",
      "zod": "^3.25.0"
    },
    "devDependencies": {
      "@types/node": "^22.0.0",
      "tsx": "^4.19.0",
      "typescript": "^5.7.0"
    }
  }
  ```

- [ ] **Step 2: Create tsconfig.json**

  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "ESNext",
      "moduleResolution": "bundler",
      "strict": true,
      "esModuleInterop": true,
      "skipLibCheck": true,
      "outDir": "dist",
      "rootDir": ".",
      "declaration": true
    },
    "include": ["*.ts", "tools/*.ts"]
  }
  ```

- [ ] **Step 3: Create .env.example**

  ```env
  LIVEKIT_API_KEY=
  LIVEKIT_API_SECRET=
  LIVEKIT_URL=ws://localhost:7880
  OPENAI_API_KEY=sk-
  VIS_API_URL=http://localhost:3001
  ```

- [ ] **Step 4: Install dependencies**

  ```bash
  npm install
  ```
  Expected: all packages install cleanly, no peer dependency errors.

- [ ] **Step 5: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```
  Expected: "No inputs were found in config file" (no .ts files yet — OK)

- [ ] **Step 6: Commit**

  ```bash
  git add src-livekit/package.json src-livekit/tsconfig.json src-livekit/.env.example
  git commit -m "chore: scaffold agent worker project"
  ```

---

### Task 2: Visualization tool

**Files:**
- Create: `src-livekit/tools/visualization.ts`

- [ ] **Step 1: Write the file**

  ```typescript
  import 'dotenv/config';
  import { llm } from '@livekit/agents';
  import { z } from 'zod';

  const VIS_API_URL = process.env.VIS_API_URL || 'http://localhost:3001';

  export const renderVisualization = llm.tool({
    name: 'render_visualization',
    description:
      'Tạo animation/hình minh họa cho khái niệm Toán/Vật Lý. Gọi khi học viên muốn xem trực quan một khái niệm.',
    parameters: z.object({
      topic: z.string().describe('Chủ đề cần minh họa, ví dụ: "tổ hợp", "định luật Newton".'),
      requirements: z
        .string()
        .describe(
          'Yêu cầu cụ thể cho hình minh họa: sơ đồ, animation, style, màu sắc, v.v.',
        ),
    }),
    execute: async ({ topic, requirements }, { ctx }) => {
      // Trigger immediate spoken preamble — agent nói ngay, không chờ fetch
      ctx.session.generateReply({
        userInput: `Hãy nói ngắn gọn: "Để tôi vẽ hình minh họa cho ${topic}, bạn xem bên phải nhé."`,
      });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);

      try {
        const response = await fetch(`${VIS_API_URL}/api/visualize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: topic, requirements }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          return 'Xin lỗi, tôi đang gặp vấn đề khi tạo hình minh họa. Tôi sẽ giải thích bằng lời.';
        }

        const viz = (await response.json()) as {
          id: string;
          html: string;
          status: string;
        };

        return viz.status === 'done'
          ? `Hình minh họa cho ${topic} đã sẵn sàng, bạn xem bên phải nhé.`
          : `Đang tạo hình cho ${topic}, vui lòng đợi thêm chút nhé.`;
      } catch (err) {
        clearTimeout(timeout);
        if ((err as Error).name === 'AbortError') {
          return 'Việc tạo hình minh họa mất quá nhiều thời gian. Tôi sẽ giải thích bằng lời thay vì chờ thêm.';
        }
        return 'Xin lỗi, tôi không thể tạo hình minh họa lúc này. Tôi sẽ giải thích bằng lời.';
      }
    },
  });
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add src-livekit/tools/visualization.ts
  git commit -m "feat: add render_visualization async tool"
  ```

---

### Task 3: Format transcript tool

**Files:**
- Create: `src-livekit/tools/format.ts`

- [ ] **Step 1: Write the file**

  ```typescript
  import 'dotenv/config';
  import { llm } from '@livekit/agents';
  import OpenAI from 'openai';
  import { z } from 'zod';

  const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const FORMAT_PROMPT = `Bạn là công cụ format văn bản. Nhiệm vụ của bạn là chuyển transcript lời nói thành markdown đẹp để hiển thị trong chat.

  Quy tắc:
  - Dùng $$...$$ cho công thức toán dạng block, $...$ cho inline.
  - Dùng ### cho tiêu đề, - cho danh sách, ** cho in đậm.
  - GIỮ NGUYÊN tất cả công thức toán học dưới dạng LaTeX.
  - Giữ nguyên tiếng Việt, không dịch.
  - Chỉ trả về markdown, không thêm bất kỳ lời giải thích nào.`;

  export const formatTranscript = llm.tool({
    name: 'format_transcript',
    description:
      'Chuyển transcript lời nói thành markdown đẹp với LaTeX cho công thức toán. Dùng sau mỗi lần agent giải thích kiến thức có chứa công thức.',
    parameters: z.object({
      transcript: z.string().describe('Transcript lời nói cần format.'),
    }),
    execute: async ({ transcript }) => {
      try {
        const response = await openaiClient.chat.completions.create({
          model: 'gpt-4.1-mini',
          messages: [
            { role: 'system', content: FORMAT_PROMPT },
            { role: 'user', content: transcript },
          ],
          temperature: 0.1,
          max_tokens: 2000,
        });

        return response.choices[0]?.message?.content ?? transcript;
      } catch {
        // Nếu format fail, trả về transcript gốc — không mất nội dung
        return transcript;
      }
    },
  });
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add src-livekit/tools/format.ts
  git commit -m "feat: add format_transcript tool for markdown post-processing"
  ```

---

### Task 4: EduTutorAgent class

**Files:**
- Create: `src-livekit/agent.ts`

- [ ] **Step 1: Write the file**

  ```typescript
  import 'dotenv/config';
  import { voice } from '@livekit/agents';
  import { renderVisualization } from './tools/visualization.js';
  import { formatTranscript } from './tools/format.js';

  const INSTRUCTIONS = `Bạn là trợ lý học tập môn Toán và Vật Lý cho học sinh phổ thông Việt Nam.

  Cách trả lời:
  - Trả lời bằng tiếng Việt, giọng thân thiện, dễ hiểu, phù hợp lứa tuổi học sinh.
  - LUÔN giải thích khái niệm bằng lời trước khi đưa ra công thức.
  - Bạn có khả năng giải toán và suy luận logic — hãy giải thích từng bước một.
  - Không chỉ đọc công thức — hãy diễn đạt ý nghĩa của chúng.

  Về hình minh họa:
  - Khi học viên muốn xem hình minh họa hoặc bạn thấy cần thiết, gọi render_visualization.
  - NGAY SAU KHI gọi render_visualization, hãy tiếp tục giải thích trong lúc chờ.
  - KHÔNG nói "đợi tôi một chút" — tool sẽ tự nói preamble, bạn chỉ cần tiếp tục bài giảng.

  Về format:
  - Sau khi giải thích xong một khái niệm có công thức toán, gọi format_transcript 
    để hiển thị đẹp trong chat.`;

  export function createEduTutorAgent(): voice.Agent {
    return new voice.Agent({
      instructions: INSTRUCTIONS,
      tools: {
        render_visualization: renderVisualization,
        format_transcript: formatTranscript,
      },
    });
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add src-livekit/agent.ts
  git commit -m "feat: add EduTutorAgent with instructions and tools"
  ```

---

### Task 5: Entry point — defineAgent + AgentSession with RealtimeModel

**Files:**
- Create: `src-livekit/index.ts`

- [ ] **Step 1: Write the file**

  ```typescript
  import 'dotenv/config';
  import {
    type JobContext,
    cli,
    defineAgent,
    voice,
  } from '@livekit/agents';
  import * as openai from '@livekit/agents-plugin-openai';
  import { fileURLToPath } from 'node:url';
  import { createEduTutorAgent } from './agent.js';

  export default defineAgent({
    entry: async (ctx: JobContext) => {
      const agent = createEduTutorAgent();

      const session = new voice.AgentSession({
        llm: new openai.realtime.RealtimeModel({
          model: 'gpt-realtime-2.1',
          modalities: ['text', 'audio'],
          voice: 'marin',
          turnDetection: {
            type: 'semantic_vad',
            create_response: true,
            interrupt_response: true,
          },
        }),
      });

      await session.start({
        agent,
        room: ctx.room,
      });

      await session.generateReply({
        instructions:
          'Chào học viên bằng tiếng Việt, giới thiệu bạn là trợ lý học tập Toán và Vật Lý, hỏi hôm nay bạn muốn học gì.',
      });
    },
  });

  cli.runApp(fileURLToPath(import.meta.url));
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 3: Test dry-run with LiveKit CLI**

  ```bash
  npx tsx index.ts dev
  ```
  Expected: agent worker starts, polls for rooms. (Will not fully work without LiveKit server running, but should not crash with startup errors.)

- [ ] **Step 4: Commit**

  ```bash
  git add src-livekit/index.ts
  git commit -m "feat: add entry point with AgentSession + RealtimeModel"
  ```

---

### Task 6: Fake visualization API (teammate mock)

**Files:**
- Create: `src-livekit/fake-vis-api.ts`

- [ ] **Step 1: Write the file**

  ```typescript
  import http from 'node:http';

  const PORT = parseInt(process.env.VIS_API_PORT || '3001', 10);

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'POST' && req.url === '/api/visualize') {
      const body = await readBody(req);
      const { prompt } = JSON.parse(body);

      // Simulate 2s render delay
      console.log(`[fake-vis] Rendering "${prompt}"...`);
      await sleep(2000);
      console.log(`[fake-vis] Done rendering "${prompt}"`);

      const resp = {
        id: `viz_${Date.now()}`,
        html: `<!DOCTYPE html>
  <html lang="vi">
  <head><meta charset="UTF-8"><style>
    body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f0f4ff; }
    .card { text-align: center; padding: 2rem; background: white; border-radius: 1rem; box-shadow: 0 4px 24px rgba(0,0,0,0.1); }
    h1 { color: #1a1a2e; }
    p { color: #555; }
  </style></head>
  <body>
    <div class="card">
      <h1>${escapeHtml(prompt)}</h1>
      <p>Hình minh họa đang được xây dựng...</p>
      <p style="font-size: 0.8rem; color: #999">Fake API — delay 2s</p>
    </div>
  </body>
  </html>`,
        status: 'done',
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(resp));
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.listen(PORT, () => {
    console.log(`[fake-vis] Teammate mock API running on http://localhost:${PORT}`);
  });

  function readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve) => {
      let data = '';
      req.on('data', (chunk) => { data += chunk; });
      req.on('end', () => resolve(data));
    });
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  ```

- [ ] **Step 2: Add dev script to package.json**

  In `src-livekit/package.json`, add to scripts:
  ```json
  "fake-vis": "tsx fake-vis-api.ts"
  ```

- [ ] **Step 3: Test fake API**

  ```bash
  npx tsx fake-vis-api.ts
  ```
  Expected: `[fake-vis] Teammate mock API running on http://localhost:3001`

  In another terminal:
  ```bash
  curl -X POST http://localhost:3001/api/visualize -H "Content-Type: application/json" -d '{"prompt":"tổ hợp","requirements":"sơ đồ"}'
  ```
  Expected (after 2s): JSON response with id, html, status: "done".

- [ ] **Step 4: Commit**

  ```bash
  git add src-livekit/fake-vis-api.ts
  git commit -m "feat: add fake visualization API for teammate mock"
  ```

---

### Task 7: End-to-end verification

**Files:**
- Modify: `src-livekit/.env` (copy from .env.example + fill values)

- [ ] **Step 1: Copy .env.example → .env and fill values**

  ```bash
  cp src-livekit/.env.example src-livekit/.env
  ```
  Fill in: `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`, `OPENAI_API_KEY`.
  `VIS_API_URL=http://localhost:3001` (already set).

- [ ] **Step 2: Start fake vis API in one terminal**

  ```bash
  cd src-livekit && npm run fake-vis
  ```
  Expected: `[fake-vis] Teammate mock API running on http://localhost:3001`

- [ ] **Step 3: Start agent worker in another terminal**

  ```bash
  cd src-livekit && npm run dev
  ```
  Expected: worker registers with LiveKit server, "Agent worker started" or similar.

- [ ] **Step 4: Verify no startup crashes**

  Check that the worker process stays running (doesn't crash with import errors, missing env vars, etc.).

- [ ] **Step 5: Commit**

  ```bash
  git add src-livekit/.env.example src-livekit/package.json
  git commit -m "chore: finalize agent worker scaffolding"
  ```
