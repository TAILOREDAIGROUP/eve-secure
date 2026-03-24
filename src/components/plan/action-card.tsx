"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Zap,
  Clock,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  MoreVertical,
} from "lucide-react";
import { useState } from "react";

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

interface ActionCardProps {
  action: ActionItem;
  onStatusChange?: (status: string) => void;
}

const PRIORITY_COLORS = {
  critical: "bg-red-900/30 text-red-200 border-red-900/50",
  high: "bg-orange-900/30 text-orange-200 border-orange-900/50",
  medium: "bg-amber-900/30 text-amber-200 border-amber-900/50",
  low: "bg-blue-900/30 text-blue-200 border-blue-900/50",
};

const DIFFICULTY_COLORS = {
  easy: "text-green-400",
  medium: "text-amber-400",
  hard: "text-red-400",
};

const STATUS_ICONS = {
  not_started: AlertCircle,
  in_progress: Zap,
  completed: CheckCircle2,
};

export function ActionCard({ action, onStatusChange }: ActionCardProps) {
  const [status, setStatus] = useState(action.status);

  const handleStatusChange = (newStatus: string) => {
    setStatus(newStatus as ActionItem["status"]);
    onStatusChange?.(newStatus);
  };

  const StatusIcon = STATUS_ICONS[status];

  return (
    <Card className="border-slate-800 bg-slate-900/50 transition-all hover:bg-slate-800/50">
      <div className="space-y-4 p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-start gap-3">
              <StatusIcon
                className={`mt-1 h-5 w-5 flex-shrink-0 ${
                  status === "completed"
                    ? "text-green-500"
                    : status === "in_progress"
                      ? "text-blue-500"
                      : "text-slate-400"
                }`}
              />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white">
                  #{action.rank}. {action.title}
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  {action.description}
                </p>
              </div>
            </div>
          </div>

          {/* Priority Badge */}
          <span
            className={`flex-shrink-0 rounded-lg border px-3 py-1 text-xs font-medium ${
              PRIORITY_COLORS[action.priority]
            }`}
          >
            {action.priority.charAt(0).toUpperCase() +
              action.priority.slice(1)}
          </span>
        </div>

        {/* Metrics Row */}
        <div className="grid gap-4 sm:grid-cols-4">
          {/* Cost */}
          <div className="rounded-lg border border-slate-700 bg-slate-800/30 p-3">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <DollarSign className="h-4 w-4" />
              Cost
            </div>
            <p className="mt-1 font-semibold text-white">
              {action.estimatedCost.currency}
              {action.estimatedCost.min === action.estimatedCost.max
                ? action.estimatedCost.min.toLocaleString()
                : `${action.estimatedCost.min.toLocaleString()}-${action.estimatedCost.max.toLocaleString()}`}
            </p>
          </div>

          {/* Time */}
          <div className="rounded-lg border border-slate-700 bg-slate-800/30 p-3">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Clock className="h-4 w-4" />
              Time
            </div>
            <p className="mt-1 font-semibold text-white">
              {action.estimatedTime}
            </p>
          </div>

          {/* Difficulty */}
          <div className="rounded-lg border border-slate-700 bg-slate-800/30 p-3">
            <p className="text-xs text-slate-400">Difficulty</p>
            <p
              className={`mt-1 font-semibold capitalize ${
                DIFFICULTY_COLORS[action.difficulty]
              }`}
            >
              {action.difficulty}
            </p>
          </div>

          {/* Category */}
          <div className="rounded-lg border border-slate-700 bg-slate-800/30 p-3">
            <p className="text-xs text-slate-400">Category</p>
            <p className="mt-1 text-sm font-semibold text-white">
              {action.category}
            </p>
          </div>
        </div>

        {/* Tags */}
        <div className="space-y-2">
          {action.complianceTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {action.complianceTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-purple-900/30 px-3 py-1 text-xs text-purple-300"
                >
                  <Zap className="h-3 w-3" />
                  {tag}
                </span>
              ))}
            </div>
          )}

          {action.insuranceTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {action.insuranceTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-green-900/30 px-3 py-1 text-xs text-green-300"
                >
                  ✓ {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Resources */}
        {action.resources.length > 0 && (
          <div className="rounded-lg border border-slate-700 bg-slate-800/30 p-3">
            <p className="text-xs font-medium text-slate-400">Resources</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {action.resources.map((resource, idx) => (
                <a
                  key={idx}
                  href="#"
                  className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
                >
                  {resource}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 pt-4">
          <Select value={status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-40 border-slate-700 bg-slate-800 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-slate-700 bg-slate-800">
              <SelectItem value="not_started">Not Started</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="border-slate-700 bg-slate-800">
              <DropdownMenuItem className="text-slate-300">
                View Details
              </DropdownMenuItem>
              <DropdownMenuItem className="text-slate-300">
                Add Note
              </DropdownMenuItem>
              <DropdownMenuItem className="text-slate-300">
                Share with Team
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Card>
  );
}
