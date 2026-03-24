"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChatInterface } from "@/components/assessment/chat-interface";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAssessmentStore } from "@/store/assessment";
import {
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Lock,
  Zap,
} from "lucide-react";

interface AssessmentSection {
  id: string;
  title: string;
  description: string;
  status: "locked" | "available" | "completed";
  progress: number;
  estimatedTime: number;
  questions: number;
}

interface AssessmentData {
  id: string;
  sections: AssessmentSection[];
  currentSection: string;
  overallProgress: number;
  estimatedCompletion: string;
}

export default function AssessmentPage() {
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const {
    currentAssessmentId,
    currentSection,
    setCurrentSection,
    setAssessmentData,
  } = useAssessmentStore();

  const { data: assessmentData, isLoading } = useQuery<AssessmentData>({
    queryKey: ["assessment", currentAssessmentId],
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/assessment/${currentAssessmentId || "current"}`
      );
      if (!res.ok) throw new Error("Failed to fetch assessment");
      return res.json();
    },
    enabled: !!currentAssessmentId,
  });

  useEffect(() => {
    if (assessmentData) {
      setAssessmentData(assessmentData);
      setSelectedSection(currentSection ?? assessmentData.sections[0]?.id ?? null);
    }
  }, [assessmentData, currentSection, setAssessmentData, setCurrentSection]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-48" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
          <Skeleton className="h-96 lg:col-span-2" />
        </div>
      </div>
    );
  }

  const currentSectionData = assessmentData?.sections.find(
    (s) => s.id === selectedSection
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Security Assessment</h1>
        <p className="mt-1 text-slate-400">
          Answer questions about your security posture. EVE will provide
          personalized guidance.
        </p>
      </div>

      {/* Overall Progress */}
      <Card className="border-slate-800 bg-slate-900/50 p-6">
        <div className="flex flex-col items-between justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-sm font-medium text-slate-400">
              Overall Progress
            </h2>
            <p className="mt-1 text-2xl font-bold text-white">
              {assessmentData?.overallProgress || 0}%
            </p>
          </div>
          <div className="flex-1 sm:max-w-xs">
            <div className="h-3 w-full rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all"
                style={{
                  width: `${assessmentData?.overallProgress || 0}%`,
                }}
              />
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Est. completion</p>
            <p className="text-sm font-medium text-slate-300">
              {assessmentData?.estimatedCompletion || "N/A"}
            </p>
          </div>
        </div>
      </Card>

      {/* Main Assessment Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Sections Sidebar */}
        <div className="space-y-4 lg:col-span-1">
          <h2 className="font-semibold text-white">Assessment Sections</h2>
          <div className="space-y-2">
            {assessmentData?.sections.map((section) => (
              <button
                key={section.id}
                onClick={() => {
                  setSelectedSection(section.id);
                  setCurrentSection(section.id);
                }}
                className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                  selectedSection === section.id
                    ? "border-blue-500 bg-blue-500/10 text-white"
                    : "border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-700/50"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-sm font-medium">{section.title}</h3>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {section.questions} questions
                    </p>
                  </div>
                  <div className="ml-2 flex-shrink-0">
                    {section.status === "completed" ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : section.status === "locked" ? (
                      <Lock className="h-5 w-5 text-slate-500" />
                    ) : (
                      <Zap className="h-5 w-5 text-blue-500" />
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                {section.status !== "locked" && (
                  <div className="mt-2 h-1.5 w-full rounded-full bg-slate-700">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all"
                      style={{ width: `${section.progress}%` }}
                    />
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Tips Box */}
          <Card className="border-slate-800 bg-slate-800/50 p-4">
            <div className="flex gap-2">
              <AlertCircle className="h-5 w-5 flex-shrink-0 text-amber-500" />
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-300">Pro Tip</p>
                <p className="text-xs text-slate-400">
                  Answer thoughtfully - EVE uses your responses to generate
                  personalized recommendations.
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Chat Interface */}
        <div className="lg:col-span-2">
          {currentSectionData ? (
            <Card className="border-slate-800 bg-slate-900/50">
              <div className="border-b border-slate-800 px-6 py-4">
                <h2 className="text-lg font-semibold text-white">
                  {currentSectionData.title}
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  {currentSectionData.description}
                </p>
              </div>
              <ChatInterface
                sectionId={currentSectionData.id}
                assessmentId={assessmentData?.id || ""}
                sectionProgress={currentSectionData.progress}
                totalQuestions={currentSectionData.questions}
              />
            </Card>
          ) : (
            <Card className="border-slate-800 bg-slate-900/50 p-6">
              <div className="text-center">
                <AlertCircle className="mx-auto h-12 w-12 text-slate-500" />
                <p className="mt-4 text-slate-400">
                  No section selected. Please choose a section from the list.
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/50 px-6 py-4">
        <p className="text-sm text-slate-400">
          Complete sections unlock advanced assessment features
        </p>
        <Button asChild variant="outline">
          <a href="/plan">
            View Action Plan
            <ChevronRight className="ml-2 h-4 w-4" />
          </a>
        </Button>
      </div>
    </div>
  );
}
