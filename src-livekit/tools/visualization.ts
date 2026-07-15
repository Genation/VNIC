import 'dotenv/config';
import { llm } from '@livekit/agents';
import { z } from 'zod';

const VIS_API_URL = process.env.VIS_API_URL || 'http://localhost:3001';

export const renderVisualization = llm.tool({
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
    // NON-BLOCKING: release control ngay → LLM tiếp tục nói
    await ctx.update(`Để tôi vẽ hình minh họa cho ${topic}, bạn xem bên phải nhé.`);

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

      // Send HTML to frontend via data channel
      const participant = ctx.session._roomIO?.localParticipant;
      if (participant) {
        const encoder = new TextEncoder();
        participant.publishData(
          encoder.encode(JSON.stringify({ type: 'visualization_ready', ...viz })),
          { reliable: true },
        ).catch(() => {});
      }

      return viz.status === 'done'
        ? `Hình minh họa đã sẵn sàng, bạn xem bên phải nhé.`
        : `Đang tạo hình, vui lòng đợi thêm chút nhé.`;
    } catch (err) {
      clearTimeout(timeout);
      if ((err as Error).name === 'AbortError') {
        return 'Việc tạo hình minh họa mất quá nhiều thời gian. Tôi sẽ giải thích bằng lời thay vì chờ thêm.';
      }
      return 'Xin lỗi, tôi không thể tạo hình minh họa lúc này. Tôi sẽ giải thích bằng lời.';
    }
  },
});
