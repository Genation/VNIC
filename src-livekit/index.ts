import 'dotenv/config';
import {
  type JobContext,
  ServerOptions,
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
        temperature: 0.7,
        speed: 1.2,
        reasoning: {
          effort: 'medium',
        },
        turnDetection: {
          type: 'semantic_vad',
          eagerness: 'medium',
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

cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url) }));
