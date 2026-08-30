"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { History, MessageCirclePlus, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { MatiChatPanel } from "./mati-chat-panel";
import { useMatiAssistant } from "./mati-assistant-provider";

type Conversation = { id: Id<"aiConversations">; title: string; updatedAt: number };

function ConversationList({
  conversations,
  activeId,
  onSelect,
  onRename,
  onDelete,
}: {
  conversations: Conversation[];
  activeId: Id<"aiConversations"> | null;
  onSelect: (id: Id<"aiConversations">) => void;
  onRename: (conversation: Conversation) => void;
  onDelete: (conversation: Conversation) => void;
}) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="space-y-1 p-2">
        {conversations.map((conversation) => (
          <div
            key={conversation.id}
            className={cn(
              "group flex items-center rounded-lg",
              activeId === conversation.id ? "bg-accent" : "hover:bg-muted/60",
            )}
          >
            <button
              type="button"
              className="min-w-0 flex-1 px-3 py-2.5 text-left"
              onClick={() => onSelect(conversation.id)}
            >
              <span className="block truncate text-sm font-medium">{conversation.title}</span>
              <span className="block text-xs text-muted-foreground">
                {new Date(conversation.updatedAt).toLocaleDateString()}
              </span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="mr-1 h-8 w-8" aria-label="Opciones de conversación">
                  <MoreVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onRename(conversation)}>
                  <Pencil /> Renombrar
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={() => onDelete(conversation)}>
                  <Trash2 /> Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
        {conversations.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">Todavía no hay conversaciones.</p>
        ) : null}
      </div>
    </ScrollArea>
  );
}

export function MatiFullPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bootstrap = useQuery(api.ai.getBootstrap);
  const renameConversation = useMutation(api.ai.renameConversation);
  const deleteConversation = useMutation(api.ai.deleteConversation);
  const {
    activeConversationId,
    setActiveConversationId,
    createConversation,
    draft,
    setDraft,
  } = useMatiAssistant();
  const [historyOpen, setHistoryOpen] = useState(false);
  const conversations = useMemo(
    () => bootstrap?.conversations ?? [],
    [bootstrap?.conversations],
  );

  useEffect(() => {
    if (bootstrap && !bootstrap.available) router.replace("/dashboard");
  }, [bootstrap, router]);

  useEffect(() => {
    if (!bootstrap?.available) return;
    const requested = searchParams.get("conversation") as Id<"aiConversations"> | null;
    const requestedExists = requested && conversations.some((item) => item.id === requested);
    if (requestedExists) setActiveConversationId(requested);
    else if (!activeConversationId && conversations[0]) {
      setActiveConversationId(conversations[0].id);
    }
  }, [activeConversationId, bootstrap?.available, conversations, searchParams, setActiveConversationId]);

  if (!bootstrap?.available || !bootstrap.usage || !bootstrap.role) {
    return <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Cargando Mati…</div>;
  }

  const selectConversation = (id: Id<"aiConversations">) => {
    setActiveConversationId(id);
    setHistoryOpen(false);
    router.replace(`/dashboard/ai?conversation=${id}`);
  };

  const newConversation = async () => {
    const id = await createConversation();
    selectConversation(id);
  };

  const rename = async (conversation: Conversation) => {
    const title = window.prompt("Nuevo nombre", conversation.title)?.trim();
    if (title) await renameConversation({ conversationId: conversation.id, title });
  };

  const remove = async (conversation: Conversation) => {
    if (!window.confirm(`¿Eliminar “${conversation.title}”?`)) return;
    await deleteConversation({ conversationId: conversation.id });
    if (activeConversationId === conversation.id) {
      const next = conversations.find((item) => item.id !== conversation.id)?.id ?? null;
      setActiveConversationId(next);
      router.replace(next ? `/dashboard/ai?conversation=${next}` : "/dashboard/ai");
    }
  };

  const listProps = {
    conversations,
    activeId: activeConversationId,
    onSelect: selectConversation,
    onRename: rename,
    onDelete: remove,
  };

  return (
    <div className="-m-4 flex min-h-0 flex-1 overflow-hidden border-t md:rounded-b-xl">
      <aside className="hidden w-72 shrink-0 flex-col border-r bg-muted/20 md:flex">
        <div className="flex h-14 items-center justify-between border-b px-3">
          <h1 className="font-semibold">Conversaciones</h1>
          <Button size="icon" variant="ghost" onClick={() => void newConversation()} aria-label="Nueva conversación">
            <MessageCirclePlus />
          </Button>
        </div>
        <ConversationList {...listProps} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b px-3 md:hidden">
          <Button size="icon" variant="ghost" onClick={() => setHistoryOpen(true)} aria-label="Abrir historial">
            <History />
          </Button>
          <span className="min-w-0 flex-1 truncate font-semibold">
            {conversations.find((item) => item.id === activeConversationId)?.title ?? "Mati"}
          </span>
          <Button size="icon" variant="ghost" onClick={() => void newConversation()} aria-label="Nueva conversación">
            <MessageCirclePlus />
          </Button>
        </div>
        <MatiChatPanel
          conversationId={activeConversationId}
          draft={draft}
          setDraft={setDraft}
          usage={bootstrap.usage}
          role={bootstrap.role}
          onNeedConversation={createConversation}
          fullPage
        />
      </div>

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="left" className="flex w-[86%] flex-col p-0 sm:max-w-sm">
          <SheetHeader className="border-b p-4">
            <SheetTitle>Conversaciones</SheetTitle>
          </SheetHeader>
          <ConversationList {...listProps} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
