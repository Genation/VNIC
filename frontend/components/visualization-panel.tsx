'use client';

import { useEffect, useState } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { RoomEvent } from 'livekit-client';
import { MarkdownWithLatex } from '@/lib/markdown';

interface VizData {
  type: 'visualization_ready';
  id: string;
  html: string;
  status: string;
}

interface FormatData {
  type: 'formatted_message';
  content: string;
}

type PanelData = VizData | FormatData;

export function VisualizationPanel() {
  const [html, setHtml] = useState<string | null>(null);
  const [formatted, setFormatted] = useState<string | null>(null);
  const room = useRoomContext();

  useEffect(() => {
    const handler = (payload: Uint8Array) => {
      try {
        const data = JSON.parse(new TextDecoder().decode(payload)) as PanelData;
        if (data.type === 'visualization_ready' && (data as VizData).html) {
          setHtml((data as VizData).html);
        }
        if (data.type === 'formatted_message' && (data as FormatData).content) {
          setFormatted((data as FormatData).content);
        }
      } catch {
        // Ignore non-JSON or malformed messages
      }
    };

    room.on(RoomEvent.DataReceived, handler);
    return () => {
      room.off(RoomEvent.DataReceived, handler);
    };
  }, [room]);

  if (!html && !formatted) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-zinc-400 dark:text-zinc-500">
        <div>
          <svg className="mx-auto mb-3 h-12 w-12 text-zinc-300 dark:text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
          </svg>
          <p className="text-sm font-medium">Hình minh họa sẽ hiển thị ở đây</p>
          <p className="mt-1 text-xs">Khi agent tạo hình xong, bạn sẽ thấy kết quả.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {html && (
        <div className="h-1/2 border-b">
          <iframe
            srcDoc={html}
            className="h-full w-full border-0 bg-white"
            sandbox="allow-scripts"
            title="Visualization"
          />
        </div>
      )}
      {formatted && (
        <div className="flex-1 overflow-y-auto p-4">
          <MarkdownWithLatex content={formatted} />
        </div>
      )}
    </div>
  );
}
