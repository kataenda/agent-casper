"use client";

import { useEffect, useRef } from "react";
import { useAgentStore } from "./store";

export function useAgentWebSocket() {
  const { setConnected, addCycle } = useAgentStore();
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);

  function connect() {
    const url = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws";
    ws.current = new WebSocket(url);

    ws.current.onopen = () => {
      setConnected(true);
      // Clear stale chart history on fresh connection so chart starts clean
      useAgentStore.setState({ portfolioHistory: [], cycles: [] });
    };

    ws.current.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === "cycle" || msg.event === "init") {
          addCycle(msg.data);
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.current.onclose = () => {
      setConnected(false);
      reconnectTimeout.current = setTimeout(connect, 3000);
    };

    ws.current.onerror = () => {
      ws.current?.close();
    };
  }

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      ws.current?.close();
    };
  }, []);
}
