"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Bot, Expand, MessageCirclePlus, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MatiChatPanel } from "./mati-chat-panel";
import { MatiSprite, type MatiAnimation } from "./mati-sprite";

type MatiContextValue = {
  available: boolean;
  showPet: boolean;
  isAiPage: boolean;
  openChat: () => void;
  activeConversationId: Id<"aiConversations"> | null;
  setActiveConversationId: (id: Id<"aiConversations"> | null) => void;
  createConversation: () => Promise<Id<"aiConversations">>;
  draft: string;
  setDraft: (value: string) => void;
};

const MatiContext = createContext<MatiContextValue | null>(null);

export function useMatiAssistant() {
  const value = useContext(MatiContext);
  if (!value) throw new Error("useMatiAssistant must be used inside MatiAssistantProvider");
  return value;
}

export function MatiAssistantProvider({ children }: { children: ReactNode }) {
  const bootstrap = useQuery(api.ai.getBootstrap);
  const createConversationMutation = useMutation(api.ai.createConversation);
  const renameConversation = useMutation(api.ai.renameConversation);
  const deleteConversation = useMutation(api.ai.deleteConversation);
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [activeConversationId, setActiveConversationId] =
    useState<Id<"aiConversations"> | null>(null);
  const [animation, setAnimation] = useState<MatiAnimation>("idle");
  const waveUntilRef = useRef(0);
  const waveTimerRef = useRef<number | null>(null);
  const isAiPage = pathname === "/dashboard/ai";
  const available = bootstrap?.available === true;
  const conversations = useMemo(
    () => bootstrap?.conversations ?? [],
    [bootstrap?.conversations],
  );
  const showPet = Boolean(available && bootstrap?.showAiPet);
  const chatReady = available && Boolean(bootstrap?.usage && bootstrap?.role);
  const activeConversation = conversations.find(
    (conversation) => conversation.id === activeConversationId,
  );

  const createConversation = useCallback(async () => {
    const id = await createConversationMutation({});
    setActiveConversationId(id);
    return id;
  }, [createConversationMutation]);

  const openChat = useCallback(() => {
    if (!available) return;
    if (!activeConversationId && conversations[0]) {
      setActiveConversationId(conversations[0].id);
    }
    waveUntilRef.current = Date.now() + 900;
    if (waveTimerRef.current) window.clearTimeout(waveTimerRef.current);
    setAnimation("wave");
    setOpen(true);
  }, [activeConversationId, available, conversations]);

  const handleAnimationChange = useCallback((next: MatiAnimation) => {
    const remaining = waveUntilRef.current - Date.now();
    if (remaining > 0 && (next === "idle" || next === "review")) {
      if (waveTimerRef.current) window.clearTimeout(waveTimerRef.current);
      waveTimerRef.current = window.setTimeout(() => {
        waveUntilRef.current = 0;
        setAnimation(next);
      }, remaining);
      return;
    }
    if (next === "running" || next === "failed") waveUntilRef.current = 0;
    setAnimation(next);
  }, []);

  const value = useMemo<MatiContextValue>(
    () => ({
      available,
      showPet,
      isAiPage,
      openChat,
      activeConversationId,
      setActiveConversationId,
      createConversation,
      draft,
      setDraft,
    }),
    [activeConversationId, available, createConversation, draft, isAiPage, openChat, showPet],
  );

  return (
    <MatiContext.Provider value={value}>
      {children}
      {showPet && !isAiPage ? (
        <button
          type="button"
          onClick={openChat}
          className="fixed bottom-3 right-3 z-40 rounded-2xl outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:bottom-4 md:right-5"
          aria-label="Abrir chat con Mati"
        >
          <MatiSprite animation={animation} className="h-[78px] w-[72px] md:h-[104px] md:w-24" />
        </button>
      ) : null}

      {chatReady && !isAiPage ? (
        <Sheet open={open} onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            waveUntilRef.current = 0;
            if (waveTimerRef.current) window.clearTimeout(waveTimerRef.current);
            setAnimation("idle");
          }
        }}>
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[440px]">
            <SheetHeader className="border-b px-4 py-3 pr-14">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <SheetTitle>Mati</SheetTitle>
                  <SheetDescription>Tu asistente de MAT</SheetDescription>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" onClick={() => void createConversation()} aria-label="Nueva conversación">
                    <MessageCirclePlus />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      const query = activeConversationId ? `?conversation=${activeConversationId}` : "";
                      setOpen(false);
                      router.push(`/dashboard/ai${query}`);
                    }}
                    aria-label="Abrir chat en página completa"
                  >
                    <Expand />
                  </Button>
                  {activeConversation ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" aria-label="Opciones de conversación">
                          <MoreVertical />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            const title = window.prompt(
                              "Nuevo nombre",
                              activeConversation.title,
                            )?.trim();
                            if (title) {
                              void renameConversation({
                                conversationId: activeConversation.id,
                                title,
                              });
                            }
                          }}
                        >
                          <Pencil /> Renombrar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => {
                            if (!window.confirm(`¿Eliminar “${activeConversation.title}”?`)) return;
                            void deleteConversation({
                              conversationId: activeConversation.id,
                            }).then(() => {
                              const next = conversations.find(
                                (conversation) => conversation.id !== activeConversation.id,
                              );
                              setActiveConversationId(next?.id ?? null);
                            });
                          }}
                        >
                          <Trash2 /> Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              </div>
            </SheetHeader>
            <MatiChatPanel
              conversationId={activeConversationId}
              draft={draft}
              setDraft={setDraft}
              usage={bootstrap!.usage!}
              role={bootstrap!.role!}
              onNeedConversation={createConversation}
              onAnimationChange={handleAnimationChange}
            />
          </SheetContent>
        </Sheet>
      ) : null}
    </MatiContext.Provider>
  );
}

export function MatiHeaderButton() {
  const { available, showPet, isAiPage, openChat } = useMatiAssistant();
  if (!available || showPet || isAiPage) return null;
  return (
    <Button size="icon" variant="ghost" onClick={openChat} aria-label="Abrir chat con Mati">
      <Bot />
    </Button>
  );
}
