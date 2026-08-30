"use client";

import { FormEvent, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { useQuery } from "convex/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  ArrowUp,
  CircleStop,
  ExternalLink,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MatiSprite, type MatiAnimation } from "./mati-sprite";

type Usage = {
  remaining: number;
  limit: number;
  cycleEnd: number;
};

/**
 * Remaining quota as a share of the cycle's allowance.
 *
 * A percentage travels better than "14 de 15" as plans grow apart (LITE 0, PRO
 * 15, ULTRA 100): the bar reads the same at any allowance. The exact counts
 * stay available in the tooltip for anyone who wants them.
 */
function UsageMeter({ usage }: { usage: Usage }) {
  const percent =
    usage.limit > 0
      ? Math.max(0, Math.min(100, Math.round((usage.remaining / usage.limit) * 100)))
      : 0;
  const low = percent <= 20;

  return (
    <div
      className="flex items-center gap-2"
      title={`${usage.remaining} de ${usage.limit} consultas disponibles. Se reinicia el ${new Date(
        usage.cycleEnd,
      ).toLocaleDateString()}.`}
    >
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Consultas disponibles"
        className="h-1 w-14 overflow-hidden rounded-full bg-foreground/15"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            low ? "bg-amber-500" : "bg-foreground/70",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span
        className={cn(
          "text-[11px] tabular-nums",
          low ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground",
        )}
      >
        {percent}%
      </span>
    </div>
  );
}

function messageText(message: UIMessage) {
  return message.parts
    .filter((part): part is Extract<(typeof message.parts)[number], { type: "text" }> =>
      part.type === "text",
    )
    .map((part) => part.text)
    .join("");
}

function hasToolPart(message: UIMessage) {
  return message.parts.some(
    (part) => part.type.startsWith("tool-") || part.type === "dynamic-tool",
  );
}

function SafeMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children: label }) => {
          const safe = href?.startsWith("/dashboard") || href?.startsWith("https://");
          return safe ? (
            <a href={href} target={href?.startsWith("https://") ? "_blank" : undefined} rel="noreferrer">
              {label}
            </a>
          ) : (
            <span>{label}</span>
          );
        },
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

export function MatiChatPanel({
  conversationId,
  draft,
  setDraft,
  usage,
  role,
  onNeedConversation,
  onAnimationChange,
  fullPage = false,
}: {
  conversationId: Id<"aiConversations"> | null;
  draft: string;
  setDraft: (value: string) => void;
  usage: Usage;
  role: string;
  onNeedConversation: () => Promise<Id<"aiConversations">>;
  onAnimationChange?: (state: MatiAnimation) => void;
  fullPage?: boolean;
}) {
  const conversation = useQuery(
    api.ai.getConversation,
    conversationId ? { conversationId } : "skip",
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const loadedConversationRef = useRef<string | null>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/ai/chat",
        prepareSendMessagesRequest: ({ body }) => ({ body: body ?? {} }),
      }),
    [],
  );
  const { messages, setMessages, sendMessage, regenerate, stop, status, error, clearError } =
    useChat({
      id: conversationId ? `mati-${conversationId}` : "mati-new",
      transport,
    });
  const busy = status === "submitted" || status === "streaming";
  const exhausted = usage.remaining <= 0;

  useEffect(() => {
    if (!conversationId) {
      if (!busy) setMessages([]);
      loadedConversationRef.current = null;
      return;
    }
    if (!conversation || busy || loadedConversationRef.current === conversationId) return;
    setMessages(
      conversation.messages.map((message) => ({
        id: message.id,
        role: message.role,
        parts: [{ type: "text" as const, text: message.content }],
      })),
    );
    loadedConversationRef.current = conversationId;
  }, [busy, conversation, conversationId, setMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  useEffect(() => {
    if (!onAnimationChange) return;
    if (error) onAnimationChange("failed");
    else if (busy) onAnimationChange("running");
    else if (messages.at(-1)?.role === "assistant") onAnimationChange("review");
    else onAnimationChange("idle");
  }, [busy, error, messages, onAnimationChange]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy || exhausted) return;
    clearError();
    const targetConversationId = conversationId ?? (await onNeedConversation());
    setDraft("");
    await sendMessage(
      { text },
      {
        body: {
          conversationId: targetConversationId,
          clientRequestId: crypto.randomUUID().replaceAll("-", ""),
          message: text,
        },
      },
    );
  };

  const retry = async () => {
    const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
    const text = lastUserMessage ? messageText(lastUserMessage) : "";
    if (!text || !conversationId || busy || exhausted) return;
    clearError();
    await regenerate({
      body: {
        conversationId,
        clientRequestId: crypto.randomUUID().replaceAll("-", ""),
        message: text,
      },
    });
  };

  return (
    <section className={cn("flex min-h-0 flex-1 flex-col", fullPage && "h-full")}>
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 pb-8">
          {messages.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
              <MatiSprite animation="idle" className="h-[104px] w-24" />
              <h2 className="mt-3 text-lg font-semibold">¿Qué quieres saber?</h2>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Pregunta por miembros, clases, entrenamientos o cualquier dato al que tu rol tenga acceso.
              </p>
            </div>
          ) : null}

          {messages.map((message) => {
            const text = messageText(message);
            const toolProgress = hasToolPart(message) && !text;
            return (
              <div
                key={message.id}
                className={cn(
                  "max-w-[88%] rounded-2xl px-4 py-3 text-sm",
                  message.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "mr-auto border bg-muted/40",
                )}
              >
                {toolProgress ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <LoaderCircle className="h-4 w-4 animate-spin" /> Consultando datos autorizados…
                  </div>
                ) : message.role === "assistant" ? (
                  <div className="prose prose-sm max-w-none break-words dark:prose-invert prose-a:text-primary">
                    <SafeMarkdown>{text}</SafeMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap break-words">{text}</p>
                )}
              </div>
            );
          })}

          {status === "submitted" ? (
            <div className="mr-auto flex items-center gap-2 rounded-2xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin" /> Mati está pensando…
            </div>
          ) : null}
          {error ? (
            <div className="mr-auto rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p>No pude completar esa respuesta.</p>
              <Button className="mt-2" size="sm" variant="outline" onClick={retry} disabled={exhausted}>
                <RotateCcw /> Reintentar
              </Button>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="border-t bg-background p-3">
        {exhausted ? (
          <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
            <p>
              Alcanzaste el límite. Se reinicia el {new Date(usage.cycleEnd).toLocaleDateString()}.
            </p>
            {role === "admin" ? (
              <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
                <Link href="/dashboard/billing">Ver facturación <ExternalLink /></Link>
              </Button>
            ) : (
              <p className="mt-1 text-muted-foreground">Contacta a un administrador de tu organización.</p>
            )}
          </div>
        ) : null}
        <form onSubmit={submit} className="mx-auto max-w-3xl">
          <div className="rounded-2xl border bg-background shadow-sm transition-colors focus-within:border-ring">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              disabled={busy || exhausted}
              placeholder={exhausted ? "Límite alcanzado" : "Pregúntale a Mati…"}
              maxLength={4_000}
              // ring-offset-0 matters: the base Textarea sets a 2px focus ring offset in
              // the background colour, and that opaque halo paints over the
              // container's border along the straight edges, leaving only the
              // corners visible. Zeroing the ring alone does not remove it.
              className="min-h-16 resize-none border-0 bg-transparent px-4 pb-0 pt-3 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-transparent"
              aria-label="Mensaje para Mati"
            />
            {/* Controls sit inside the field so the meter reads as part of the
                composer rather than a caption under it. */}
            <div className="flex items-center justify-end gap-3 px-3 pb-3 pt-1">
              <UsageMeter usage={usage} />
              {busy ? (
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="size-8 rounded-full"
                  onClick={() => void stop()}
                  aria-label="Detener respuesta"
                >
                  <CircleStop />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  className="size-8 rounded-full"
                  disabled={!draft.trim() || exhausted}
                  aria-label="Enviar mensaje"
                >
                  <ArrowUp />
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
