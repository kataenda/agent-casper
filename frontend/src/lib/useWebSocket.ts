"use client";

import { useEffect, useRef } from "react";
import { useAgentStore } from "./store";

const BACKEND = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function fetchHistory() {
  try {
    const res = await fetch(`${BACKEND}/agent/history?limit=20`);
    if (!res.ok) return;
    const items: any[] = await res.json();
    if (!Array.isArray(items) || items.length === 0) return;
    const { addCycle, cycles } = useAgentStore.getState();
    // Deduplicate by timestamp — WebSocket init may have already added the latest
    const seen = new Set(cycles.map((c: any) => c.timestamp));
    // Add oldest first so store ends up with newest at index 0
    for (let i = items.length - 1; i >= 0; i--) {
      if (!seen.has(items[i].timestamp)) {
        addCycle(items[i]);
        seen.add(items[i].timestamp);
      }
    }
  } catch {
    // backend not ready yet — WebSocket init event will cover it
  }
}

export function useAgentWebSocket() {
  const { setConnected, addCycle } = useAgentStore();
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const isFirstConnect = useRef(true);

  function connect() {
    const url = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws";
    ws.current = new WebSocket(url);

    ws.current.onopen = () => {
      setConnected(true);
      if (isFirstConnect.current) {
        isFirstConnect.current = false;
        useAgentStore.setState({ portfolioHistory: [], cycles: [] });
      }
      // Always fetch history on (re)connect so data survives backend restarts
      fetchHistory();
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
