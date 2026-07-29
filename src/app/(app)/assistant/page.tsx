"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, FileText, Globe, Send } from "lucide-react";
import { PageHeader } from "@/components/ui";

interface Msg {
  role: "user" | "assistant";
  text: string;
  sources?: string[];
}

const SAMPLES = [
  "Which customers need follow-up?",
  "Cheapest supplier for acrylic binder",
  "What are the pending quotations?",
  "Who buys pigments?",
  "Top customers by revenue",
  "How much margin on Carnauba Wax?",
  "Slow moving products",
  "What is the dosage for Synthetic Fatliquor?",
  "Latest market trends in leather chemicals",
];

export default function AssistantPage() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: "Hi! I can answer questions about your customers, suppliers, products, quotations and orders from your company data — and market or industry questions using web search. Try one of the samples below.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(q?: string) {
    const question = (q ?? input).trim();
    if (!question || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: question }]);
    setBusy(true);
    try {
      const res = await fetch("/api/v1/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: res.ok ? data.answer : (data.error ?? "Something went wrong."),
          sources: data.sources,
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "Network error — please try again." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <PageHeader
        title="AI Assistant"
        subtitle="Answers from your CRM, supplier, product and order data"
      />

      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-brand-600 text-white"
                  : "bg-white border border-slate-200 text-slate-700"
              }`}
            >
              {m.role === "assistant" && (
                <div className="flex items-center gap-1.5 text-xs font-medium text-brand-600 mb-1">
                  <Bot size={14} /> Assistant
                </div>
              )}
              {m.text}
              {m.sources && m.sources.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {m.sources.map((s) =>
                    s.startsWith("http") ? (
                      <a
                        key={s}
                        href={s}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] bg-blue-50 text-blue-600 rounded-full px-2 py-0.5 hover:underline max-w-[240px] truncate"
                      >
                        <Globe size={10} className="shrink-0" />
                        {new URL(s).hostname.replace(/^www\./, "")}
                      </a>
                    ) : (
                      <span
                        key={s}
                        className="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-500 rounded-full px-2 py-0.5"
                      >
                        <FileText size={10} /> {s}
                      </span>
                    ),
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="text-sm text-slate-400 px-2">Thinking…</div>}
        <div ref={bottomRef} />
      </div>

      <div className="pt-3 border-t border-slate-200">
        <div className="flex flex-wrap gap-2 mb-3">
          {SAMPLES.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="text-xs bg-white border border-slate-200 rounded-full px-3 py-1.5 text-slate-600 hover:border-brand-300 hover:text-brand-700"
            >
              {s}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex gap-2"
        >
          <input
            className="input flex-1"
            placeholder="Ask about customers, suppliers, margins…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button className="btn btn-primary" disabled={busy || !input.trim()}>
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
