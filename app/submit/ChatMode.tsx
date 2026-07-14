"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ChatMessage } from "@/lib/chat";
import type { ExpenseDraft } from "@/lib/extract";
import type { Employee } from "@/lib/types";

// Conversational intake. The employee chats naturally; /api/chat (a cheap fast
// model) asks one short follow-up at a time until purpose, merchant, amount +
// currency, date and category are covered, then signals readyToExtract. At
// that point the FULL transcript goes through the existing /api/extract engine
// — the same structured extraction + USD conversion the Quick form uses — and
// the page takes over with the shared review card and /api/submit flow.

export interface SubmitFile {
  base64: string;
  mediaType: "image/png" | "image/jpeg" | "application/pdf";
  preview: string | null;
  name: string;
}

interface ChatModeProps {
  employees: Employee[];
  employee: Employee;
  onEmployee: (e: Employee) => void;
  file: SubmitFile | null;
  onFile: (picked: File | undefined) => void;
  onClearFile: () => void;
  onDraft: (draft: ExpenseDraft) => void;
}

const GREETING =
  "Hi! Tell me what you paid for and roughly how much — I'll ask for anything I'm missing. Attach the receipt whenever you like.";

const STARTERS = [
  "Team dinner at Farzi Cafe yesterday, ₹2,300 on my card",
  "Ola to the client meeting this morning, ₹740",
  "Figma seat for July, $45",
];

const MAX_INPUT_CHARS = 500;
// /api/extract caps description at 2,000 chars; keep the head (the facts) and
// the tail (the latest corrections) if a transcript ever runs long.
const TRANSCRIPT_HEAD = 1000;
const TRANSCRIPT_TAIL = 980;

type Pending = "idle" | "chatting" | "extracting";

function buildTranscript(messages: ChatMessage[]): string {
  const t = messages.map((m) => `${m.role === "user" ? "Employee" : "Assistant"}: ${m.content}`).join("\n");
  if (t.length <= TRANSCRIPT_HEAD + TRANSCRIPT_TAIL) return t;
  return `${t.slice(0, TRANSCRIPT_HEAD)}\n…\n${t.slice(t.length - TRANSCRIPT_TAIL)}`;
}

export default function ChatMode({ employees, employee, onEmployee, file, onFile, onClearFile, onDraft }: ChatModeProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<Pending>("idle");
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<"chat" | "extract" | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduced ? "auto" : "smooth" });
  }, [messages, pending, error]);

  const requestTurn = async (msgs: ChatMessage[]) => {
    setPending("chatting");
    setError(null);
    setFailed(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: msgs,
          fileBase64: file?.base64 ?? null,
          fileMediaType: file?.mediaType ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const next: ChatMessage[] = [...msgs, { role: "assistant", content: data.reply }];
      setMessages(next);
      if (data.readyToExtract) {
        await runExtract(next);
        return;
      }
      setPending("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setFailed("chat");
      setPending("idle");
    }
  };

  const runExtract = async (msgs: ChatMessage[]) => {
    setPending("extracting");
    setError(null);
    setFailed(null);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: buildTranscript(msgs),
          fileBase64: file?.base64 ?? null,
          fileMediaType: file?.mediaType ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPending("idle");
      onDraft(data.draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setFailed("extract");
      setPending("idle");
    }
  };

  const send = (preset?: string) => {
    if (pending !== "idle") return;
    const text = (preset ?? input).trim() || (file ? "Here's the receipt." : "");
    if (!text) return;
    const msgs: ChatMessage[] = [...messages, { role: "user", content: text.slice(0, MAX_INPUT_CHARS) }];
    setMessages(msgs);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    void requestTurn(msgs);
  };

  const retry = () => {
    if (failed === "extract") void runExtract(messages);
    else void requestTurn(messages);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const autosize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  };

  const initials = employee.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
      <div className="border-b border-line px-4 pb-3 pt-4">
        <label className="mb-1 block text-xs font-medium text-ink-faint">You are</label>
        <select
          value={employee.email}
          onChange={(e) => onEmployee(employees.find((emp) => emp.email === e.target.value)!)}
          className="w-full rounded border border-line px-3 py-2 text-sm"
        >
          {employees.map((emp) => (
            <option key={emp.email} value={emp.email}>
              {emp.name} — {emp.department}
            </option>
          ))}
        </select>
      </div>

      <div ref={listRef} className="flex max-h-[50vh] min-h-64 flex-col gap-3 overflow-y-auto p-4" aria-live="polite">
        <AssistantBubble text={GREETING} />

        {messages.length === 0 && (
          <div className="flex flex-wrap gap-1.5 pl-8">
            {STARTERS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                disabled={pending !== "idle"}
                className="rounded-full border border-line bg-surface px-2.5 py-1 text-left text-xs text-ink-soft transition hover:border-accent hover:text-accent disabled:opacity-40"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "assistant" ? (
            <AssistantBubble key={i} text={m.content} />
          ) : (
            <div key={i} className="fade-in flex items-start justify-end gap-2">
              <div className="max-w-[85%] rounded-lg rounded-tr-sm bg-accent px-3 py-2 text-sm text-white">{m.content}</div>
              <span
                aria-hidden
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-chip text-[10px] font-semibold text-ink-soft"
              >
                {initials}
              </span>
            </div>
          )
        )}

        {pending === "chatting" && (
          <div className="fade-in flex items-start gap-2" aria-label="Assistant is typing">
            <AssistantAvatar />
            <div className="flex items-center gap-1 rounded-lg rounded-tl-sm bg-paper px-3 py-2.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="pulse-soft h-1.5 w-1.5 rounded-full bg-ink-faint"
                  style={{ animationDelay: `${i * 0.18}s` }}
                />
              ))}
            </div>
          </div>
        )}

        {pending === "extracting" && (
          <div className="fade-in flex items-start gap-2">
            <AssistantAvatar />
            <div className="reconciling rounded-lg rounded-tl-sm border border-accent/25 bg-paper px-3 py-2 text-sm text-ink-soft">
              Filling in the review card…
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mx-4 mb-2 flex items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger-soft px-4 py-2 text-sm text-danger">
          <span className="min-w-0">{error}</span>
          <button
            onClick={retry}
            className="shrink-0 rounded border border-danger/40 px-2.5 py-1 text-xs font-semibold hover:bg-danger hover:text-white"
          >
            Retry
          </button>
        </div>
      )}

      {file && (
        <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-1.5 text-sm">
          {file.preview ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={file.preview} alt="Receipt preview" className="h-8 w-8 rounded border border-line object-cover" />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-danger-soft text-[10px] font-bold text-danger">
              PDF
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-ink-soft">{file.name}</span>
          <button
            onClick={onClearFile}
            aria-label="Remove attachment"
            className="shrink-0 rounded px-1.5 text-lg leading-none text-ink-faint transition hover:text-danger"
          >
            ×
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 border-t border-line p-3">
        <label
          className={`flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-line text-ink-soft transition hover:border-accent hover:text-accent ${
            pending !== "idle" ? "pointer-events-none opacity-40" : ""
          }`}
          title="Attach a receipt (PNG/JPG/PDF)"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path
              d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="sr-only">Attach a receipt photo or PDF</span>
          <input
            type="file"
            accept="image/png,image/jpeg,application/pdf"
            className="hidden"
            disabled={pending !== "idle"}
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            autosize(e.target);
          }}
          onKeyDown={onKeyDown}
          rows={1}
          maxLength={MAX_INPUT_CHARS}
          placeholder="Describe the expense…"
          aria-label="Message the expense assistant"
          className="max-h-28 flex-1 resize-none rounded-lg border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
        <button
          onClick={() => send()}
          disabled={pending !== "idle" || (input.trim().length === 0 && !file)}
          aria-label="Send message"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent text-white transition hover:opacity-90 disabled:opacity-40"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 22-7z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <p className="border-t border-line bg-surface-2 px-4 py-2 text-center text-[11px] text-ink-faint">
        Enter to send · Shift+Enter for a new line · when I have everything, you&apos;ll review before it submits
      </p>
    </div>
  );
}

function AssistantAvatar() {
  return (
    <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2c.7 4.4 3.6 7.3 8 8-4.4.7-7.3 3.6-8 8-.7-4.4-3.6-7.3-8-8 4.4-.7 7.3-3.6 8-8z" />
      </svg>
    </span>
  );
}

function AssistantBubble({ text }: { text: string }) {
  return (
    <div className="fade-in flex items-start gap-2">
      <AssistantAvatar />
      <div className="max-w-[85%] rounded-lg rounded-tl-sm bg-paper px-3 py-2 text-sm">{text}</div>
    </div>
  );
}
