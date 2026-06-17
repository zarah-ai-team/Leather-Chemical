"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, FileText } from "lucide-react";

const SAMPLES = [
  "Which customers need follow-up?",
  "Which quotations are pending?",
  "Cheapest supplier for black dye?",
  "What margin did we make on pigments?",
  "Show customers buying acrylic binders",
  "Who are our top customers?",
  "What is the use of synthetic fatliquor?",
  "Fastest moving products?",
];

interface Msg {
  role: "user" | "assistant";
  text: string;
  sources?: string[];
}

export default function AssistantPage() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text:
        "Hi! I'm your AI business assistant. I answer from your live CRM, suppliers, products, quotations and uploaded documents — all locally. Ask me anything, or tap a sample question below.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(q: string) {
    if (!q.trim() || loading) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "assistant", text: data.answer, sources: data.sources }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "Something went wrong." }]);
    }
    setLoading(false);
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="px-8 py-5 border-b border-slate-200 bg-white">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Bot className="text-brand-600" /> AI Knowledge Assistant
        </h1>
        <p className="text-slate-500 text-sm mt-1">Local RAG-style Q&A over your business data. No external API.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
            {m.role === "assistant" && (
              <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 grid place-items-center shrink-0">
                <Bot size={16} />
              </div>
            )}
            <div className={`max-w-2xl ${m.role === "user" ? "order-1" : ""}`}>
              <div
                className={`rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                  m.role === "user" ? "bg-brand-600 text-white" : "bg-white border border-slate-200"
                }`}
              >
                {m.text}
              </div>
              {m.sources && m.sources.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {m.sources.map((s, j) => (
                    <span key={j} className="badge bg-slate-100 text-slate-500 gap-1">
                      <FileText size={11} /> {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {m.role === "user" && (
              <div className="w-8 h-8 rounded-full bg-slate-200 grid place-items-center shrink-0">
                <User size={16} />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 grid place-items-center">
              <Bot size={16} />
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-400">Thinking…</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-slate-200 bg-white p-4">
        <div className="flex flex-wrap gap-2 mb-3">
          {SAMPLES.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="text-xs px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              {s}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about customers, suppliers, margins, products…"
            className="input"
          />
          <button type="submit" disabled={loading} className="btn btn-primary disabled:opacity-50">
            <Send size={16} /> Send
          </button>
        </form>
      </div>
    </div>
  );
}
