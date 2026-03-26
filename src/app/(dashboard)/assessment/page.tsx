"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChatInterface } from "@/components/assessment/chat-interface";
import { Skeleton } from "@/components/ui/skeleton";
import { useAssessmentStore } from "@/store/assessment";
import {
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Lock,
  Zap,
  Plus,
  FileText,
} from "lucide-react";

const NIST_SECTIONS = [
  { id: "GOVERN", title: "Govern", description: "Cybersecurity governance, risk management strategy, and organizational context" },
  { id: "IDENTIFY", title: "Identify", description: "Asset management, risk assessment, and supply chain risk" },
  { id: "PROTECT", title: "Protect", description: "Access control, awareness training, data security, and platform security" },
  { id: "DETECT", title: "Detect", description: "Continuous monitoring and adverse event analysis" },
  { id: "RESPOND", title: "Respond", description: "Incident management, analysis, reporting, and mitigation" },
  { id: "RECOVER", title: "Recover", description: "Recovery planning and communication" },
] as const;

interface SessionSummary {
  id: string;
  status: string;
  current_section: string;
  progress_pct: number;
  tier_rating: number | null;
  started_at: string;
  completed_at: string | null;
}

export default function AssessmentPage() {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const {
    currentAssessmentId,
    setCurrentAssessmentId,
    progress,
    setProgress,
  } = useAssessmentStore();

  // Fetch existing sessions
  const { data: sessionsData, isLoading, refetch } = useQuery<{ items: SessionSummary[]; total: number }>({
    queryKey: ["assessment-sessions"],
    queryFn: async () => {
      const res = await fetch("/api/v1/assessment?page=1&pageSize=10");
      if (!res.ok) throw new Error("Failed to fetch sessions");
      return res.json();
    },
  });

  // Create new session
  const createSession = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/v1/assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Failed to create session");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setActiveSessionId(data.id);
      setCurrentAssessmentId(data.id);
      setProgress(0);
      refetch();
    },
  });

  // Auto-select most recent in-progress session
  useEffect(() => {
    if (!activeSessionId && sessionsData?.items) {
      const inProgress = sessionsData.items.find(s => s.status === "in_progress");
      if (inProgress) {
        setActiveSessionId(inProgress.id);
        setCurrentAssessmentId(inProgress.id);
        setProgress(inProgress.progress_pct);
      }
    }
  }, [sessionsData, activeSessionId, setCurrentAssessmentId, setProgress]);

  const activeSession = sessionsData?.items.find(s => s.id === activeSessionId);
  const currentSectionId = activeSession?.current_section ?? "GOVERN";
  const currentSectionIdx = NIST_SECTIONS.findIndex(s => s.id === currentSectionId);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-48" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-1">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
          <Skeleton className="h-[600px] lg:col-span-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Security Assessment</h1>
          <p className="mt-1 text-slate-400">
            Answer questions about your security posture. EVE provides personalized guidance.
          </p>
        </div>
        <Button
          onClick={() => createSession.mutate()}
          disabled={createSession.isPending}
          className="gap-2"
        >
          {createSession.isPending ? (
            <Zap className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          New Assessment
        </Button>
      </div>

      {/* Overall Progress */}
      {activeSession && (
        <Card className="border-slate-800 bg-slate-900/50 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-slate-400">Overall Progress</p>
              <p className="text-2xl font-bold text-white">{activeSession.progress_pct}%</p>
            </div>
            <div className="flex-1 max-w-sm">
              <div className="h-3 rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-500"
                  style={{ width: `${activeSession.progress_pct}%` }}
                />
              </div>
            </div>
            <div className="text-right text-xs text-slate-400">
              {activeSession.tier_rating ? (
                <span>Tier <span className="text-white font-bold">{activeSession.tier_rating}/4</span></span>
              ) : (
                <span>In Progress</span>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Main Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Section Sidebar */}
        <div className="space-y-3 lg:col-span-1">
          <h2 className="text-sm font-semibold text-slate-300">NIST CSF 2.0 Sections</h2>

          {NIST_SECTIONS.map((section, idx) => {
            const isActive = section.id === currentSectionId;
            const isCompleted = idx < currentSectionIdx;
            const isLocked = !activeSession || idx > currentSectionIdx + 1;

            return (
              <button
                key={section.id}
                disabled={isLocked || !activeSession}
                className={`w-full rounded-lg border px-4 py-3 text-left transition-all ${
                  isActive
                    ? "border-blue-500 bg-blue-500/10 text-white shadow-lg shadow-blue-500/5"
                    : isCompleted
                    ? "border-green-800 bg-green-900/10 text-green-300"
                    : isLocked
                    ? "border-slate-800 bg-slate-900/30 text-slate-600 cursor-not-allowed"
                    : "border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-700/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium">{section.title}</h3>
                    <p className="mt-0.5 text-[10px] text-slate-500 line-clamp-1">{section.description}</p>
                  </div>
                  {isCompleted ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : isActive ? (
                    <Zap className="h-5 w-5 text-blue-400" />
                  ) : isLocked ? (
                    <Lock className="h-4 w-4 text-slate-600" />
                  ) : null}
                </div>
              </button>
            );
          })}

          {/* Past Sessions */}
          {sessionsData && sessionsData.items.length > 1 && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold text-slate-500 mb-2">Past Sessions</h3>
              {sessionsData.items
                .filter(s => s.id !== activeSessionId)
                .slice(0, 3)
                .map(session => (
                  <button
                    key={session.id}
                    onClick={() => {
                      setActiveSessionId(session.id);
                      setCurrentAssessmentId(session.id);
                    }}
                    className="mb-1 w-full rounded border border-slate-800 bg-slate-900/30 px-3 py-2 text-left text-xs text-slate-400 hover:bg-slate-800/50"
                  >
                    <div className="flex items-center justify-between">
                      <span>{new Date(session.started_at).toLocaleDateString()}</span>
                      <span className={session.status === "completed" ? "text-green-400" : "text-slate-500"}>
                        {session.status === "completed" ? "Complete" : `${session.progress_pct}%`}
                      </span>
                    </div>
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* Chat Area */}
        <div className="lg:col-span-2">
          {activeSession ? (
            <Card className="border-slate-800 bg-slate-900/50 overflow-hidden">
              <div className="border-b border-slate-800 px-5 py-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-white">
                    {NIST_SECTIONS.find(s => s.id === currentSectionId)?.title ?? currentSectionId}
                  </h2>
                  <p className="text-[10px] text-slate-500">
                    {NIST_SECTIONS.find(s => s.id === currentSectionId)?.description}
                  </p>
                </div>
              </div>
              <ChatInterface
                sectionId={currentSectionId}
                assessmentId={activeSession.id}
                sectionProgress={activeSession.progress_pct}
                totalQuestions={4}
              />
            </Card>
          ) : (
            <Card className="border-slate-800 bg-slate-900/50 p-12">
              <div className="text-center space-y-4">
                <FileText className="mx-auto h-12 w-12 text-slate-600" />
                <h3 className="text-lg font-semibold text-white">No Active Assessment</h3>
                <p className="text-sm text-slate-400 max-w-md mx-auto">
                  Start a new security assessment to evaluate your organization against the
                  NIST Cybersecurity Framework 2.0. You'll receive personalized questions
                  and actionable recommendations.
                </p>
                <Button onClick={() => createSession.mutate()} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Start Assessment
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Bottom Nav */}
      {activeSession?.status === "completed" && (
        <Card className="border-green-800 bg-green-900/10 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <p className="text-sm text-green-300">Assessment complete! Generate your action plan and report.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <a href="/plan">
                  View Plan
                  <ChevronRight className="ml-1 h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
