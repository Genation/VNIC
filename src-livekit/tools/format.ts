import 'dotenv/config';
import { llm } from '@livekit/agents';
import OpenAI from 'openai';
import { z } from 'zod';

const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const FORMAT_PROMPT = `Bạn là công cụ format văn bản. Chuyển transcript lời nói thành markdown đẹp để hiển thị trong chat.

Quy tắc:
- Dùng $$...$$ cho công thức toán dạng block, $...$ cho inline.
- Dùng ### cho tiêu đề, - cho danh sách, ** cho in đậm.
- GIỮ NGUYÊN tất cả công thức toán học dưới dạng LaTeX.
- Giữ nguyên tiếng Việt, không dịch.
- Chỉ trả về markdown, không thêm bất kỳ lời giải thích nào.`;

export const formatTranscript = llm.tool({
  description:
    'Chuyển transcript lời nói thành markdown đẹp với LaTeX. KHÔNG block — LLM gọi tool này rồi tiếp tục trả lời ngay.',
  parameters: z.object({
    transcript: z.string().describe('Transcript lời nói cần format.'),
  }),
  execute: async ({ transcript }, { ctx }) => {
    // NON-BLOCKING: release control ngay → LLM tiếp tục nói, không chờ
    await ctx.update('Đang format...');

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

      const formatted = response.choices[0]?.message?.content ?? transcript;

      // Send formatted markdown to frontend via data channel (silent)
      const participant = ctx.session._roomIO?.localParticipant;
      if (participant) {
        const encoder = new TextEncoder();
        participant.publishData(
          encoder.encode(JSON.stringify({ type: 'formatted_message', content: formatted })),
          { reliable: true },
        ).catch(() => {});
      }

      return 'Format hoàn tất.';
    } catch {
      return 'Format thất bại.';
    }
  },
});
