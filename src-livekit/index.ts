import "dotenv/config";
import {
  type JobContext,
  type JobProcess,
  ServerOptions,
  cli,
  defineAgent,
  voice,
} from "@livekit/agents";
import * as openai from "@livekit/agents-plugin-openai";
import * as silero from "@livekit/agents-plugin-silero";
import { fileURLToPath } from "node:url";
import { createEduTutorAgent } from "./agent.js";

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },
  entry: async (ctx: JobContext) => {
    await ctx.connect();

    const agent = createEduTutorAgent();

    const vad = ctx.proc.userData.vad! as silero.VAD;

    const session = new voice.AgentSession({
      vad,
      stt: new openai.STT({
        model: "gpt-4o-transcribe",
        language: "vi",
        useRealtime: true,
        vad,
      }),
      llm: new openai.LLM({
        model: "gpt-4.1-mini",
        temperature: 0.7,
      }),
      tts: new openai.TTS({
        model: "gpt-4o-mini-tts",
        voice: "ash",
        speed: 1.5,
      }),
      ttsTextTransforms: ["filter_markdown", "filter_emoji"],
    });

    await session.start({
      agent,
      room: ctx.room,
      inputOptions: {
        deleteRoomOnClose: true,
      },
    });

    await session.generateReply({
      instructions:
        "Chào học viên bằng tiếng Việt, giới thiệu bạn là trợ lý học tập Toán và Vật Lý, hỏi hôm nay bạn muốn học gì.",
    });
  },
});

cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url) }));
