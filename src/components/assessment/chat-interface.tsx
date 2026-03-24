"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { StreamingText } from "@/components/shared/streaming-text";
import { useSSE } from "@/lib/hooks/use-sse";
import { useAssessmentStore } from "@/store/assessment";
import {
  Send,
  Loader2,
  AlertCircle,
  Quote,
  CheckCircle2,
  MoreVertical,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  sources?: string[];
  isStreaming?: boolean;
}

interface ChatInterfaceProps {
  sectionId: string;
  assessmentId: string;
  sectionProgress: number;
  totalQuestions: number;
}

export function ChatInterface({
  sectionId,
  assessmentId,
  sectionProgress,
  totalQuestions,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { addMessage } = useAssessmentStore();
  const { subscribe, isConnected } = useSSE();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load initial message for section
  useEffect(() => {
    const loadInitialMessage = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(
          `/api/assessment/${assessmentId}/section/${sectionId}/initial`
        );
        if (response.ok) {
          const data = await response.json();
          const initialMessage: Message = {
            id: `msg-${Date.now()}`,
            role: "assistant",
            content: data.content,
            timestamp: new Date().toISOString(),
            sources: data.sources || [],
          };
          setMessages([initialMessage]);
        }
      } catch (error) {
        console.error("Failed to load initial message:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialMessage();
  }, [sectionId, assessmentId]);

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    // Add user message
    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: input,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // Add assistant placeholder with streaming
      const assistantMessageId = `msg-${Date.now() + 1}`;
      let fullContent = "";

      // Subscribe to SSE stream
      await subscribe(
        `/api/assessment/${assessmentId}/section/${sectionId}/response`,
        {
          method: "POST",
          body: JSON.stringify({
            message: input,
            previousMessages: messages,
          }),
        },
        (chunk) => {
          fullContent += chunk;
          // Update or create streaming message
          setMessages((prev) => {
            const existingIndex = prev.findIndex(
              (m) => m.id === assistantMessageId
            );
            if (existingIndex >= 0) {
              const updated = [...prev];
              updated[existingIndex] = {
                ...updated[existingIndex],
                content: fullContent,
              };
              return updated;
            } else {
              return [
                ...prev,
                {
                  id: assistantMessageId,
                  role: "assistant",
                  content: fullContent,
                  timestamp: new Date().toISOString(),
                  isStreaming: true,
                },
              ];
            }
          });
        }
      );

      // Mark as not streaming and add to store
      setMessages((prev) => {
        const updated = [...prev];
        const msgIndex = updated.findIndex((m) => m.id === assistantMessageId);
        if (msgIndex >= 0) {
          updated[msgIndex].isStreaming = false;
        }
        return updated;
      });

      addMessage({
        id: userMessage.id,
        role: "user",
        content: input,
      });
    } catch (error) {
      console.error("Failed to get response:", error);
      const errorMessage: Message = {
        id: `msg-${Date.now() + 2}`,
        role: "assistant",
        content:
          "Sorry, I encountered an error processing your message. Please try again.",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto bg-gradient-to-b from-slate-900 to-slate-950 p-6">
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-4 ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {message.role === "assistant" && (
                <div className="flex-shrink-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                    <span className="text-xs font-bold">EVE</span>
                  </div>
                </div>
              )}

              <div
                className={`max-w-2xl rounded-lg px-4 py-3 ${
                  message.role === "user"
                    ? "bg-blue-600 text-white"
                    : "border border-slate-700 bg-slate-800 text-slate-100"
                }`}
              >
                {message.isStreaming ? (
                  <StreamingText content={message.content} />
                ) : (
                  <div className="space-y-2">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {message.content}
                    </p>

                    {message.sources && message.sources.length > 0 && (
                      <div className="border-t border-slate-700 pt-2">
                        <p className="flex items-center gap-1 text-xs font-medium text-slate-400">
                          <Quote className="h-3 w-3" />
                          Sources
                        </p>
                        <ul className="mt-1 space-y-1">
                          {message.sources.map((source, idx) => (
                            <li
                              key={idx}
                              className="text-xs text-slate-500 hover:text-slate-300"
                            >
                              • {source}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {message.role === "assistant" && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex-shrink-0 text-slate-500 hover:text-slate-300">
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="border-slate-700 bg-slate-800">
                    <DropdownMenuItem className="text-slate-300">
                      Copy
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-slate-300">
                      Regenerate
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Progress Bar */}
      <div className="border-t border-slate-800 bg-slate-900/50 px-6 py-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">
            Progress: {sectionProgress}/{totalQuestions} questions
          </span>
          <div className="flex items-center gap-2">
            {isConnected ? (
              <span className="flex items-center gap-1 text-green-400">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                Connected
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-400">
                <div className="h-2 w-2 rounded-full bg-amber-500" />
                Connecting...
              </span>
            )}
          </div>
        </div>
        <div className="mt-2 h-1.5 w-full rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all"
            style={{ width: `${(sectionProgress / totalQuestions) * 100}%` }}
          />
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-slate-800 bg-slate-900/50 p-6">
        <div className="space-y-4">
          {!isConnected && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-900/30 bg-amber-900/10 p-3 text-xs text-amber-200">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              Reconnecting to server...
            </div>
          )}

          <div className="space-y-2">
            <Textarea
              placeholder="Type your response (max 4000 characters)..."
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, 4000))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.ctrlKey) {
                  handleSendMessage();
                }
              }}
              disabled={isLoading || !isConnected}
              className="border-slate-700 bg-slate-800 text-white resize-none focus:border-blue-500"
              rows={3}
            />
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{input.length}/4000</span>
              <Button
                onClick={handleSendMessage}
                disabled={
                  isLoading ||
                  !input.trim() ||
                  !isConnected
                }
                className="gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send
                  </>
                )}
              </Button>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            💡 Tip: Be thorough and specific in your answers for better
            recommendations
          </p>
        </div>
      </div>
    </div>
  );
}
