"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAgent,
  useSession,
  useSessionContext,
  useSessionMessages,
  useTrackToggle,
} from "@livekit/components-react";
import { TokenSource, Track } from "livekit-client";
import { AgentSessionProvider } from "@/components/agent-session-provider";
import { AgentControlBar } from "@/components/agent-control-bar";
import { AgentChatTranscript } from "@/components/agent-chat-transcript";
import { AgentAudioVisualizerBar } from "@/components/agent-audio-visualizer-bar";
import { VisualizationPanel } from "@/components/visualization-panel";
import { Button } from "@/components/ui/button";

function generateUserId() {
  return `student-${Math.random().toString(36).slice(2, 10)}`;
}

function App() {
  const sessionCtx = useSessionContext();
  const agent = useAgent(sessionCtx);
  const { messages } = useSessionMessages(sessionCtx);
  const micToggle = useTrackToggle({ source: Track.Source.Microphone });

  return (
    <div className="flex h-svh flex-col bg-zinc-50 dark:bg-black">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold">
            VNIC — Trợ lý học tập Toán & Vật Lý
          </h1>
          {/* Mic toggle */}
          <Button
            size="sm"
            variant={micToggle.enabled ? "default" : "outline"}
            onClick={() => micToggle.toggle()}
            className="text-xs"
          >
            {micToggle.enabled ? "🎤 Mic ON" : "🔇 Mic OFF"}
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <AgentAudioVisualizerBar state={agent.state} size="sm" />
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat panel */}
        <div className="flex flex-1 flex-col">
          <div className="flex-1 overflow-y-auto p-4">
            <AgentChatTranscript agentState={agent.state} messages={messages} />
          </div>

          {/* Control bar */}
          <div className="border-t p-2">
            <AgentControlBar
              variant="default"
              isConnected={sessionCtx.isConnected}
              isChatOpen={true}
              controls={{
                microphone: true,
                camera: false,
                screenShare: false,
                chat: true,
                leave: true,
              }}
            />
          </div>
        </div>

        {/* Visualization panel */}
        <div className="hidden w-1/2 border-l md:block">
          <VisualizationPanel />
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const [connected, setConnected] = useState(false);
  const [userId] = useState(generateUserId);

  const tokenSource = useMemo(
    () =>
      TokenSource.custom(async (options) => {
        const url =
          process.env.NEXT_PUBLIC_TOKEN_ENDPOINT || "/api/livekit-token";
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(options),
        });
        if (!res.ok) throw new Error(`Token error: ${res.status}`);
        return res.json();
      }),
    [],
  );

  const session = useSession(tokenSource, {
    participantIdentity: userId,
  });

  useEffect(() => {
    if (connected) {
      session.start().catch((err) => {
        console.error("Failed to start session:", err);
        setConnected(false);
      });
    } else {
      session.end().catch(() => {});
    }
  }, [connected, session.start, session.end]);

  const toggleConnection = useCallback(() => {
    setConnected((prev) => !prev);
  }, []);

  if (!connected) {
    return (
      <div className="flex h-svh items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold">VNIC — Trợ lý học tập</h1>
          <p className="mb-8 text-zinc-500">
            Toán & Vật Lý cho học sinh phổ thông
          </p>
          <Button
            size="lg"
            onClick={toggleConnection}
            disabled={session.connectionState === "connecting"}
          >
            {session.connectionState === "connecting"
              ? "Đang kết nối..."
              : "Bắt đầu học"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <AgentSessionProvider session={session}>
      <App />
    </AgentSessionProvider>
  );
}
