"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  BarChart3,
  AlertCircle,
  CheckCircle2,
  Clock,
  Plus,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/auth/supabase-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useState } from "react";

interface AssessmentStatus {
  id: string;
  status: "draft" | "in_progress" | "completed";
  progress: number;
  lastUpdated: string;
  completedSections: number;
  totalSections: number;
}

interface RecentActivity {
  id: string;
  type: "assessment_created" | "assessment_updated" | "plan_generated" | "document_created";
  title: string;
  timestamp: string;
  details: string;
}

export default function DashboardPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id ?? null);
    });
  }, [supabase]);

  const { data: assessmentStatus, isLoading: assessmentLoading } =
    useQuery<AssessmentStatus>({
      queryKey: ["assessment-status", userId],
      queryFn: async () => {
        const res = await fetch("/api/v1/assessment");
        if (!res.ok) throw new Error("Failed to fetch assessment status");
        const data = await res.json();
        // Return the most recent session as the current status
        const sessions = data.sessions || [data];
        return sessions[0] || null;
      },
      enabled: !!userId,
    });

  const { data: recentActivity, isLoading: activityLoading } = useQuery<
    RecentActivity[]
  >({
    queryKey: ["recent-activity", userId],
    queryFn: async () => {
      // Derive activity from assessment and plan data
      const [assessRes, planRes] = await Promise.all([
        fetch("/api/v1/assessment"),
        fetch("/api/v1/plan"),
      ]);
      const activities: RecentActivity[] = [];
      if (assessRes.ok) {
        const data = await assessRes.json();
        const sessions = data.sessions || [data];
        for (const session of sessions.slice(0, 3)) {
          activities.push({
            id: session.id,
            type: session.status === "completed" ? "assessment_updated" : "assessment_created",
            title: `Assessment ${session.status}`,
            timestamp: session.lastUpdated || session.createdAt || new Date().toISOString(),
            details: `Progress: ${session.progress || 0}%`,
          });
        }
      }
      if (planRes.ok) {
        const data = await planRes.json();
        const plans = data.plans || [data];
        for (const p of plans.slice(0, 2)) {
          activities.push({
            id: p.id,
            type: "plan_generated",
            title: "Action plan generated",
            timestamp: p.createdAt || new Date().toISOString(),
            details: `${p.totalActions || 0} action items`,
          });
        }
      }
      return activities.slice(0, 5);
    },
    enabled: !!userId,
  });

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "assessment_created":
        return <Plus className="h-4 w-4 text-blue-500" />;
      case "assessment_updated":
        return <Clock className="h-4 w-4 text-amber-500" />;
      case "plan_generated":
        return <BarChart3 className="h-4 w-4 text-green-500" />;
      case "document_created":
        return <CheckCircle2 className="h-4 w-4 text-purple-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-slate-400" />;
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <p className="mt-1 text-slate-400">
            Manage your security assessments and incident response
          </p>
        </div>
        <Button asChild>
          <Link href="/assessment">Start Assessment</Link>
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {assessmentLoading ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="border-slate-800 bg-slate-900/50 p-6">
                <Skeleton className="mb-2 h-4 w-24" />
                <Skeleton className="h-8 w-16" />
              </Card>
            ))}
          </>
        ) : (
          <>
            <Card className="border-slate-800 bg-slate-900/50 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-400">
                    Assessment Status
                  </p>
                  <p className="mt-2 text-2xl font-bold text-white capitalize">
                    {assessmentStatus?.status || "Not Started"}
                  </p>
                </div>
                <BarChart3 className="h-8 w-8 text-blue-500/20" />
              </div>
            </Card>

            <Card className="border-slate-800 bg-slate-900/50 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-400">Progress</p>
                  <p className="mt-2 text-2xl font-bold text-white">
                    {assessmentStatus?.progress || 0}%
                  </p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-green-500/20" />
              </div>
            </Card>

            <Card className="border-slate-800 bg-slate-900/50 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-400">
                    Sections Completed
                  </p>
                  <p className="mt-2 text-2xl font-bold text-white">
                    {assessmentStatus?.completedSections || 0} /{" "}
                    {assessmentStatus?.totalSections || 0}
                  </p>
                </div>
                <Clock className="h-8 w-8 text-amber-500/20" />
              </div>
            </Card>

            <Card className="border-slate-800 bg-slate-900/50 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-400">
                    Last Updated
                  </p>
                  <p className="mt-2 text-sm font-mono text-white">
                    {assessmentStatus?.lastUpdated
                      ? new Date(assessmentStatus.lastUpdated).toLocaleDateString()
                      : "Never"}
                  </p>
                </div>
                <AlertCircle className="h-8 w-8 text-slate-500/20" />
              </div>
            </Card>
          </>
        )}
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Activity */}
        <Card className="border-slate-800 bg-slate-900/50 lg:col-span-2">
          <div className="border-b border-slate-800 px-6 py-4">
            <h2 className="font-semibold text-white">Recent Activity</h2>
          </div>
          <div className="divide-y divide-slate-800">
            {activityLoading ? (
              <div className="space-y-4 p-6">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            ) : recentActivity && recentActivity.length > 0 ? (
              recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-slate-800/50"
                >
                  {getActivityIcon(activity.type)}
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">
                      {activity.title}
                    </p>
                    <p className="text-xs text-slate-500">{activity.details}</p>
                  </div>
                  <time className="text-xs text-slate-400">
                    {new Date(activity.timestamp).toLocaleDateString()}
                  </time>
                </div>
              ))
            ) : (
              <div className="px-6 py-12 text-center">
                <p className="text-sm text-slate-400">No activity yet</p>
              </div>
            )}
          </div>
          <div className="border-t border-slate-800 px-6 py-4">
            <Button variant="ghost" asChild className="w-full justify-center">
              <Link href="/activity">View All Activity</Link>
            </Button>
          </div>
        </Card>

        {/* Quick Actions */}
        <Card className="border-slate-800 bg-slate-900/50">
          <div className="border-b border-slate-800 px-6 py-4">
            <h2 className="font-semibold text-white">Quick Actions</h2>
          </div>
          <div className="space-y-2 p-6">
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/assessment">
                <BarChart3 className="mr-2 h-4 w-4" />
                Continue Assessment
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/onboarding">
                <Plus className="mr-2 h-4 w-4" />
                Update Profile
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/plan">
                <ArrowRight className="mr-2 h-4 w-4" />
                View Action Plan
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/documents">
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Generated Docs
              </Link>
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
