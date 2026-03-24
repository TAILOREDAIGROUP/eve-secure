"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  Clock,
  Shield,
  CheckCircle2,
  ChevronRight,
  Copy,
} from "lucide-react";

interface IRSession {
  id: string;
  status: "initial_intake" | "containment" | "eradication" | "recovery" | "completed";
  createdAt: string;
  updates: IRUpdate[];
  summary: string;
}

interface IRUpdate {
  id: string;
  timestamp: string;
  action: string;
  severity: "critical" | "high" | "medium" | "low";
  notes: string;
  contacts: string[];
}

const SEVERITY_LEVELS = [
  { value: "critical", label: "Critical", color: "bg-red-900/30 text-red-200" },
  { value: "high", label: "High", color: "bg-orange-900/30 text-orange-200" },
  {
    value: "medium",
    label: "Medium",
    color: "bg-amber-900/30 text-amber-200",
  },
  { value: "low", label: "Low", color: "bg-blue-900/30 text-blue-200" },
];

const IR_PHASES = [
  { id: "initial_intake", label: "Initial Intake", icon: AlertTriangle },
  { id: "containment", label: "Containment", icon: Shield },
  { id: "eradication", label: "Eradication", icon: Clock },
  { id: "recovery", label: "Recovery", icon: Clock },
  { id: "completed", label: "Completed", icon: CheckCircle2 },
];

export default function IRWalkthroughPage() {
  const { toast } = useToast();
  const [currentPhase, setCurrentPhase] = useState<string>("initial_intake");
  const [actionTitle, setActionTitle] = useState("");
  const [actionNotes, setActionNotes] = useState("");
  const [severity, setSeverity] = useState("high");
  const [contacts, setContacts] = useState("");

  const { data: session, isLoading } = useQuery<IRSession>({
    queryKey: ["ir-session"],
    queryFn: async () => {
      const res = await fetch("/api/v1/ir/start");
      if (!res.ok) throw new Error("Failed to fetch IR session");
      return res.json();
    },
  });

  const addUpdateMutation = useMutation({
    mutationFn: async (data: Omit<IRUpdate, "id" | "timestamp">) => {
      const res = await fetch("/api/v1/ir/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to add update");
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Update logged successfully",
      });
      setActionTitle("");
      setActionNotes("");
      setSeverity("high");
      setContacts("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add update",
        variant: "destructive",
      });
    },
  });

  const getPhaseIndex = (phaseId: string) => {
    return IR_PHASES.findIndex((p) => p.id === phaseId);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Incident Response</h1>
        <p className="mt-1 text-slate-400">
          Guided incident response walkthrough with timestamped logging
        </p>
      </div>

      {/* Phase Progress */}
      <Card className="border-slate-800 bg-slate-900/50 p-6">
        <h2 className="mb-6 text-lg font-semibold text-white">
          Response Phase
        </h2>
        <div className="flex flex-col gap-4">
          {IR_PHASES.map((phase, idx) => {
            const isActive =
              getPhaseIndex(session?.status || "initial_intake") === idx;
            const isCompleted =
              getPhaseIndex(session?.status || "initial_intake") > idx;

            return (
              <button
                key={phase.id}
                onClick={() => setCurrentPhase(phase.id)}
                className={`flex items-center gap-4 rounded-lg border px-4 py-3 text-left transition-colors ${
                  isActive
                    ? "border-blue-500 bg-blue-500/10"
                    : isCompleted
                      ? "border-green-500/30 bg-green-500/5"
                      : "border-slate-700 bg-slate-800/30 opacity-50"
                }`}
              >
                <div
                  className={`rounded-full p-2 ${
                    isCompleted
                      ? "bg-green-500/20"
                      : isActive
                        ? "bg-blue-500/20"
                        : "bg-slate-700/30"
                  }`}
                >
                  <phase.icon
                    className={`h-5 w-5 ${
                      isCompleted
                        ? "text-green-400"
                        : isActive
                          ? "text-blue-400"
                          : "text-slate-500"
                    }`}
                  />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-white">{phase.label}</p>
                </div>
                {idx < IR_PHASES.length - 1 && (
                  <ChevronRight className="h-5 w-5 text-slate-500" />
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Phase Content */}
      <Card className="border-slate-800 bg-slate-900/50 p-6">
        <h2 className="mb-6 text-lg font-semibold text-white">
          {IR_PHASES.find((p) => p.id === currentPhase)?.label}
        </h2>

        <div className="space-y-4">
          <div>
            <Label htmlFor="action" className="text-slate-300">
              Action/Finding
            </Label>
            <Input
              id="action"
              placeholder="e.g., Malware detected on server 3, User account compromised"
              value={actionTitle}
              onChange={(e) => setActionTitle(e.target.value)}
              className="mt-2 border-slate-700 bg-slate-800 text-white"
            />
          </div>

          <div>
            <Label htmlFor="notes" className="text-slate-300">
              Detailed Notes
            </Label>
            <Textarea
              id="notes"
              placeholder="Document your actions, findings, and any relevant details..."
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              className="mt-2 border-slate-700 bg-slate-800 text-white"
              rows={6}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="severity" className="text-slate-300">
                Severity
              </Label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger className="mt-2 border-slate-700 bg-slate-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-slate-700 bg-slate-800">
                  {SEVERITY_LEVELS.map((level) => (
                    <SelectItem key={level.value} value={level.value}>
                      {level.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="contacts" className="text-slate-300">
                Contacts Notified (comma-separated)
              </Label>
              <Input
                id="contacts"
                placeholder="e.g., ciso@company.com, security@company.com"
                value={contacts}
                onChange={(e) => setContacts(e.target.value)}
                className="mt-2 border-slate-700 bg-slate-800 text-white"
              />
            </div>
          </div>

          <Button
            onClick={() =>
              addUpdateMutation.mutate({
                action: actionTitle,
                severity: severity as "critical" | "high" | "medium" | "low",
                notes: actionNotes,
                contacts: contacts
                  .split(",")
                  .map((c) => c.trim())
                  .filter(Boolean),
              })
            }
            disabled={
              !actionTitle ||
              !actionNotes ||
              addUpdateMutation.isPending
            }
            className="w-full"
          >
            {addUpdateMutation.isPending ? "Logging..." : "Log Update"}
          </Button>
        </div>
      </Card>

      {/* Timeline */}
      {session?.updates && session.updates.length > 0 && (
        <Card className="border-slate-800 bg-slate-900/50 p-6">
          <h2 className="mb-6 text-lg font-semibold text-white">
            Incident Timeline
          </h2>

          <div className="space-y-4">
            {session.updates.map((update, idx) => {
              const severityStyle = SEVERITY_LEVELS.find(
                (s) => s.value === update.severity
              );

              return (
                <div
                  key={update.id}
                  className="flex gap-4 border-l-2 border-slate-700 pl-4"
                >
                  {/* Timeline dot */}
                  <div className="mt-1 flex-shrink-0">
                    <div
                      className={`h-3 w-3 rounded-full border-2 border-slate-700 ${
                        severityStyle
                          ? `bg-${severityStyle.color.split(" ")[0]}`
                          : "bg-slate-700"
                      }`}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 pb-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-white">{update.action}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {new Date(update.timestamp).toLocaleString()}
                        </p>
                      </div>
                      <span
                        className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-medium ${
                          severityStyle?.color
                        }`}
                      >
                        {update.severity.charAt(0).toUpperCase() +
                          update.severity.slice(1)}
                      </span>
                    </div>

                    {update.notes && (
                      <p className="mt-2 text-sm text-slate-400">
                        {update.notes}
                      </p>
                    )}

                    {update.contacts.length > 0 && (
                      <div className="mt-2 text-xs text-slate-500">
                        <p className="font-medium text-slate-400">
                          Notified:
                        </p>
                        <p>{update.contacts.join(", ")}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Export Options */}
      <Card className="border-slate-800 bg-slate-900/50 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">
          Documentation
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2">
            <Copy className="h-4 w-4" />
            Export Timeline
          </Button>
          <Button variant="outline" className="gap-2">
            <Copy className="h-4 w-4" />
            Generate Report
          </Button>
          <Button variant="outline" className="gap-2">
            <Copy className="h-4 w-4" />
            Create Ticket
          </Button>
        </div>
      </Card>
    </div>
  );
}
