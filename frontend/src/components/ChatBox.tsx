"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader, Bot, User } from "lucide-react";
import { adminHeaders } from "@/lib/adminAuth";

const BACKEND = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Message {
  role: "user" | "agent";
  text: string;
  ts: string;
}

export function ChatBox() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "agent",
      text: "Hello! I'm Agent Casper. Ask me anything about portfolio allocation, yield strategies, or market conditions.",
      ts: new Date().toLocaleTimeString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setMessages(prev => [...prev, { role: "user", text, ts: new Date().toLocaleTimeString() }]);
    setLoading(true);

    try {
      const res  = await fetch(`${BACKEND}/chat`, {
        method:  "POST",
        // Owner auth (wallet-sign session / admin token) travels with the request so
        // the owner can run privileged commands; anonymous visitors get Q&A only.
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body:    JSON.stringify({ message: text }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, {
        role: "agent",
        text: data.reply ?? "Error: no response",
        ts:   new Date().toLocaleTimeString(),
      }]);
    } catch {
      setMessages(prev => [...prev, {
        role: "agent",
        text: "Connection error — backend tidak merespons.",
        ts:   new Date().toLocaleTimeString(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-1.5 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5"
                 style={{
                   background: m.role === "agent"
                     ? "rgba(0,245,255,0.15)" : "rgba(191,90,242,0.15)",
                 }}>
              {m.role === "agent"
                ? <Bot size={10} style={{ color: "#00F5FF" }} />
                : <User size={10} style={{ color: "#BF5AF2" }} />
              }
            </div>
            <div className="flex flex-col gap-0.5 max-w-[85%]"
                 style={{ alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div className="text-[9px] font-mono rounded-xl px-2.5 py-1.5 leading-relaxed"
                   style={m.role === "agent" ? {
                     background:  "rgba(0,245,255,0.06)",
                     borderColor: "rgba(0,245,255,0.15)",
                     border:      "1px solid rgba(0,245,255,0.15)",
                     color:       "#e2e8f0",
                   } : {
                     background:  "rgba(191,90,242,0.12)",
                     borderColor: "rgba(191,90,242,0.25)",
                     border:      "1px solid rgba(191,90,242,0.25)",
                     color:       "#e2e8f0",
                   }}>
                {m.text}
              </div>
              <span className="text-[8px] font-mono text-cyber-muted/50 px-1">{m.ts}</span>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-1.5">
            <div className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
                 style={{ background: "rgba(0,245,255,0.15)" }}>
              <Bot size={10} style={{ color: "#00F5FF" }} />
            </div>
            <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[9px] font-mono"
                 style={{ background: "rgba(0,245,255,0.06)", border: "1px solid rgba(0,245,255,0.15)", color: "#00F5FF" }}>
              <Loader size={8} className="animate-spin" />
              <span>Thinking...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 flex gap-1.5 mt-2 pt-2"
           style={{ borderTop: "1px solid rgba(0,245,255,0.1)" }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Ask about portfolio..."
          className="flex-1 bg-transparent text-[10px] font-mono text-cyber-bright placeholder-cyber-muted/50 outline-none px-2 py-1 rounded-lg"
          style={{ border: "1px solid rgba(0,245,255,0.15)" }}
        />
        <button
          onClick={send}
          disabled={!input.trim() || loading}
          className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
          style={{ background: "rgba(0,245,255,0.12)", border: "1px solid rgba(0,245,255,0.25)" }}
        >
          <Send size={10} style={{ color: "#00F5FF" }} />
        </button>
      </div>
    </div>
  );
}
