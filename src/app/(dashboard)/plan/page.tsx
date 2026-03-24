"use client";

import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ActionCard } from "@/components/plan/action-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import {
  BarChart3,
  Download,
  Filter,
  TrendingUp,
  AlertCircle,
} from "lucide-react";

interface ActionItem {
  id: string;
  title: string;
  description: string;
  rank: number;
  priority: "critical" | "high" | "medium" | "low";
  estimatedCost: {
    min: number;
    max: number;
    currency: string;
  };
  estimatedTime: string;
  difficulty: "easy" | "medium" | "hard";
  complianceTags: string[];
  insuranceTags: string[];
  category: string;
  resources: string[];
  status: "not_started" | "in_progress" | "completed";
}

interface ActionPlan {
  id: string;
  assessmentId: string;
  createdAt: string;
  totalActions: number;
  estimatedTotalCost: {
    min: number;
    max: number;
    currency: string;
  };
  actions: ActionItem[];
  summary: string;
}

type SortOption = "rank" | "cost" | "time" | "difficulty" | "priority";
type FilterOption = "all" | "critical" | "high" | "medium" | "low";

export default function PlanPage() {
  const [sortBy, setSortBy] = useState<SortOption>("rank");
  const [filterBy, setFilterBy] = useState<FilterOption>("all");

  const { data: actionPlan, isLoading } = useQuery<ActionPlan>({
    queryKey: ["action-plan"],
    queryFn: async () => {
      const res = await fetch("/api/plan/current");
      if (!res.ok) throw new Error("Failed to fetch plan");
      return res.json();
    },
  });

  const filteredActions = actionPlan?.actions.filter((action) => {
    if (filterBy === "all") return true;
    return action.priority === filterBy;
  });

  const sortedActions = [...(filteredActions || [])].sort((a, b) => {
    switch (sortBy) {
      case "rank":
        return a.rank - b.rank;
      case "cost":
        return a.estimatedCost.min - b.estimatedCost.min;
      case "priority":
        const priorityOrder = {
          critical: 0,
          high: 1,
          medium: 2,
          low: 3,
        };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      case "difficulty":
        const difficultyOrder = { easy: 0, medium: 1, hard: 2 };
        return difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty];
      case "time":
        return 0; // Would need proper time parsing
      default:
        return 0;
    }
  });

  const getCostRange = (actions?: ActionItem[]) => {
    if (!actions || actions.length === 0) return { min: 0, max: 0 };
    const min = Math.min(...actions.map((a) => a.estimatedCost.min));
    const max = Math.max(...actions.map((a) => a.estimatedCost.max));
    return { min, max };
  };

  const costRange = getCostRange(filteredActions);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-48" />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Action Plan</h1>
          <p className="mt-1 text-slate-400">
            Prioritized security recommendations based on your assessment
          </p>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => {
            const element = document.createElement("a");
            element.href = `/api/plan/${actionPlan?.id}/export`;
            element.click();
          }}
        >
          <Download className="h-4 w-4" />
          Export Plan
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-800 bg-slate-900/50 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-400">
                Total Actions
              </p>
              <p className="mt-2 text-2xl font-bold text-white">
                {actionPlan?.totalActions || 0}
              </p>
            </div>
            <BarChart3 className="h-8 w-8 text-blue-500/20" />
          </div>
        </Card>

        <Card className="border-slate-800 bg-slate-900/50 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-400">
                Estimated Cost
              </p>
              <p className="mt-2 text-2xl font-bold text-white">
                {costRange.min === costRange.max
                  ? `$${costRange.min.toLocaleString()}`
                  : `$${costRange.min.toLocaleString()}-${costRange.max.toLocaleString()}`}
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-green-500/20" />
          </div>
        </Card>

        <Card className="border-slate-800 bg-slate-900/50 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-400">Critical</p>
              <p className="mt-2 text-2xl font-bold text-red-400">
                {
                  actionPlan?.actions.filter(
                    (a) => a.priority === "critical"
                  ).length
                }
              </p>
            </div>
            <AlertCircle className="h-8 w-8 text-red-500/20" />
          </div>
        </Card>

        <Card className="border-slate-800 bg-slate-900/50 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-400">
                In Progress
              </p>
              <p className="mt-2 text-2xl font-bold text-amber-400">
                {
                  actionPlan?.actions.filter(
                    (a) => a.status === "in_progress"
                  ).length
                }
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-amber-500/20" />
          </div>
        </Card>
      </div>

      {/* Plan Summary */}
      {actionPlan?.summary && (
        <Card className="border-slate-800 bg-slate-900/50 p-6">
          <h2 className="font-semibold text-white">Summary</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            {actionPlan.summary}
          </p>
        </Card>
      )}

      {/* Filters and Sorting */}
      <Card className="border-slate-800 bg-slate-900/50 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Filter className="h-5 w-5 text-slate-400" />
            <Select value={filterBy} onValueChange={(v) => setFilterBy(v as FilterOption)}>
              <SelectTrigger className="w-full border-slate-700 bg-slate-800 sm:w-48">
                <SelectValue placeholder="Filter by priority" />
              </SelectTrigger>
              <SelectContent className="border-slate-700 bg-slate-800">
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="w-full border-slate-700 bg-slate-800 sm:w-48">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent className="border-slate-700 bg-slate-800">
              <SelectItem value="rank">Rank</SelectItem>
              <SelectItem value="priority">Priority</SelectItem>
              <SelectItem value="cost">Estimated Cost</SelectItem>
              <SelectItem value="time">Time Required</SelectItem>
              <SelectItem value="difficulty">Difficulty</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Actions List */}
      <div className="space-y-4">
        {sortedActions && sortedActions.length > 0 ? (
          sortedActions.map((action) => (
            <ActionCard
              key={action.id}
              action={action}
              onStatusChange={(status) => {
                // Handle status change
                console.log(`Action ${action.id} status changed to ${status}`);
              }}
            />
          ))
        ) : (
          <Card className="border-slate-800 bg-slate-900/50 p-12">
            <div className="text-center">
              <AlertCircle className="mx-auto h-12 w-12 text-slate-500" />
              <p className="mt-4 text-slate-400">No actions found</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
