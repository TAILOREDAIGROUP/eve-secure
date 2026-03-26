"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StreamingText } from "@/components/shared/streaming-text";
import { useAssessmentStore } from "@/store/assessment";
import {
  Send,
  Loader2,
  AlertCircle,
  Quote,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  citations?: string[];
  isStreaming?: boolean;
  generatedBy?: "llm" | "template";
}

interface ChatInterfaceProps {
  sectionId: string;
  assessmentId: string;
  sectionProgress: number;
  totalQuestions: number;
}

const NIST_SECTIONS = ["GOVERN", "IDENTIFY", "PROTECT", "DETECT", "RESPOND", "RECOVER"] as const;

export function ChatInterface({
  sectionId,
  assessmentId,
  sectionProgress,
  totalQuestions,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setLocalProgress] = useState(sectionProgress);
  const [currentSection, setCurrentSection] = useState(sectionId);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { addMessage, setProgress: setStoreProgress } = useAssessmentStore();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load session data and generate first question
  useEffect(() => {
    const loadSession = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/v1/assessment/${assessmentId}`);
        if (!response.ok) throw new Error("Failed to load session");

        const data = await response.json();
        const session = data.session;
        const responses = data.responses ?? [];

        // Build message history from existing responses
        const history: Message[] = [];
        for (const r of responses) {
          if (r.question_text) {
            history.push({
              id: `q-${r.id}`,
              role: "assistant",
              content: r.question_text,
              timestamp: r.created_at,
            });
          }
          if (r.response_text) {
            history.push({
              id: `r-${r.id}`,
              role: "user",
              content: r.response_text,
              timestamp: r.created_at,
            });
          }
        }

        // If no history, show a welcome + first question
        if (history.length === 0) {
          const section = session?.current_section ?? "GOVERN";
          history.push({
            id: "welcome",
            role: "assistant",
            content: `Welcome to your security assessment. I'll guide you through the NIST Cybersecurity Framework 2.0, starting with the **${section}** function.\n\nPlease answer each question based on your organization's current practices. There are no wrong answers — your honest responses help me provide the most relevant recommendations.\n\nLet's begin.`,
            timestamp: new Date().toISOString(),
          });

          // Fetch first question via SSE or use a default
          try {
            const sseUrl = `/api/v1/sse?sessionId=${assessmentId}`;
            const sseRes = await fetch(sseUrl);
            if (sseRes.ok && sseRes.body) {
              const reader = sseRes.body.getReader();
              const decoder = new TextDecoder();
              let fullText = "";
              let citations: string[] = [];

              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split("\n");
                for (const line of lines) {
                  if (line.startsWith("data: ")) {
                    try {
                      const event = JSON.parse(line.slice(6));
                      if (event.type === "chunk") fullText += event.content;
                      if (event.type === "complete") {
                        if (event.citations) citations = event.citations;
                        if (event.fullText) fullText = event.fullText;
                      }
                    } catch { /* skip parse errors */ }
                  }
                }
              }

              if (fullText) {
                history.push({
                  id: "first-q",
                  role: "assistant",
                  content: fullText,
                  timestamp: new Date().toISOString(),
                  citations,
                  generatedBy: "llm",
                });
              }
            }
          } catch {
            // Fallback: static first question
            history.push({
              id: "first-q",
              role: "assistant",
              content: "How does your organization currently define cybersecurity roles and responsibilities? Who is ultimately accountable for security decisions?",
              timestamp: new Date().toISOString(),
              citations: ["NIST CSF 2.0 — GOVERN"],
              generatedBy: "template",
            });
          }
        }

        setMessages(history);
        setLocalProgress(session?.progress_pct ?? 0);
        setCurrentSection(session?.current_section ?? sectionId);
      } catch (err) {
        setError("Failed to load assessment session. Please refresh.");
      } finally {
        setIsLoading(false);
      }
    };

    if (assessmentId) loadSession();
  }, [assessmentId, sectionId]);

  const handleSendMessage = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    setInput("");
    setError(null);

    // Add user message immediately
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: userText,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      // POST response to assessment API
      const res = await fetch(`/api/v1/assessment/${assessmentId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: currentSection,
          responseText: userText,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Request failed" }));
        throw new Error(err.message ?? `HTTP ${res.status}`);
      }

      const data = await res.json();

      // Update progress
      setLocalProgress(data.progress ?? progress);
      setStoreProgress(data.progress ?? progress);

      // Add EVE's next question
      const eveMsg: Message = {
        id: `eve-${Date.now()}`,
        role: "assistant",
        content: data.nextQuestion,
        timestamp: new Date().toISOString(),
        citations: data.citations,
        generatedBy: data.generatedBy,
      };
      setMessages((prev) => [...prev, eveMsg]);

      // Store in Zustand
      addMessage({ id: userMsg.id, role: "user", content: userText });
      addMessage({ id: eveMsg.id, role: "assistant", content: data.nextQuestion });
    } catch (err) {
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `I encountered an issue processing your response. ${err instanceof Error ? err.message : "Please try again."}`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, assessmentId, currentSection, progress, addMessage, setStoreProgress]);

  const handleAdvanceSection = useCallback(() => {
    const currentIdx = NIST_SECTIONS.indexOf(currentSection as typeof NIST_SECTIONS[number]);
    if (currentIdx < NIST_SECTIONS.length - 1) {
      const nextSection = NIST_SECTIONS[currentIdx + 1]!;
      setCurrentSection(nextSection);

      const transitionMsg: Message = {
        id: `transition-${Date.now()}`,
        role: "assistant",
        content: `Great progress on **${currentSection}**! Let's move on to the **${nextSection}** function.\n\nThis section focuses on ${
          nextSection === "IDENTIFY" ? "understanding your assets, risks, and vulnerabilities" :
          nextSection === "PROTECT" ? "implementing safeguards for critical services" :
          nextSection === "DETECT" ? "monitoring and detecting cybersecurity events" :
          nextSection === "RESPOND" ? "incident response planning and execution" :
          nextSection === "RECOVER" ? "recovery planning and communication" :
          "the next area of your security posture"
        }.`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, transitionMsg]);
    }
  }, [currentSection]);

  return (
    <div className="flex h-[600px] flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-gradient-to-b from-slate-900 to-slate-950 p-6">
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${
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
                className={`max-w-[75%] rounded-lg px-4 py-3 ${
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

                    {message.citations && message.citations.length > 0 && (
                      <div className="border-t border-slate-700 pt-2">
                        <p className="flex items-center gap-1 text-xs font-medium text-slate-400">
                          <Quote className="h-3 w-3" />
                          Sources
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {message.citations.map((source, idx) => (
                            <Badge
                              key={idx}
                              variant="outline"
                              className="border-slate-600 text-[10px] text-slate-400"
                            >
                              {source}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {message.generatedBy && (
                      <div className="flex items-center gap-1 text-[10px] text-slate-500">
                        {message.generatedBy === "llm" ? (
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                        ) : (
                          <AlertCircle className="h-3 w-3 text-slate-500" />
                        )}
                        {message.generatedBy === "llm" ? "AI-generated" : "Template"}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Score + Progress Bar */}
      <div className="border-t border-slate-800 bg-slate-900/50 px-6 py-3">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <span className="text-slate-400">
              Section: <span className="font-medium text-white">{currentSection}</span>
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">
              Progress: <span className="font-medium text-white">{progress}%</span>
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAdvanceSection}
            className="h-7 gap-1 text-xs text-blue-400 hover:text-blue-300"
            disabled={currentSection === "RECOVER"}
          >
            Next Section
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
        <div className="mt-2 h-1.5 w-full rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-slate-800 bg-slate-900/50 p-4">
        {error && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-900/30 bg-red-900/10 p-2 text-xs text-red-300">
            <AlertCircle className="h-3 w-3 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <Textarea
            placeholder="Describe your organization's current practices..."
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, 4000))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            disabled={isLoading}
            className="flex-1 resize-none border-slate-700 bg-slate-800 text-white focus:border-blue-500"
            rows={2}
          />
          <Button
            onClick={handleSendMessage}
            disabled={isLoading || !input.trim()}
            className="h-auto self-end"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
          <span>{input.length}/4000</span>
          <span>Enter to send, Shift+Enter for new line</span>
        </div>
      </div>
    </div>
  );
}
