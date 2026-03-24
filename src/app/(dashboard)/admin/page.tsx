"use client";

import { createClient } from "@/lib/auth/supabase-auth";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  BarChart3,
  Users,
  Database,
  AlertTriangle,
  TrendingUp,
  Zap,
} from "lucide-react";
import { TenantList } from "@/components/admin/tenant-list";
import { redirect } from "next/navigation";
import { useEffect, useState } from "react";

interface AdminStats {
  totalTenants: number;
  totalUsers: number;
  totalAssessments: number;
  totalCost: number;
  activeAssessments: number;
}

interface KnowledgeMetrics {
  totalDocuments: number;
  generatedCodes: number;
  averageQuality: number;
  lastUpdated: string;
}

interface EvalMetrics {
  totalRuns: number;
  averageScore: number;
  passRate: number;
  lastRun: string;
}

export default function AdminPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id || null);
      setIsLoaded(true);
    });
  }, []);

  const isAdmin = process.env.NEXT_PUBLIC_ADMIN_IDS?.includes(userId || "");

  useEffect(() => {
    if (isLoaded && !isAdmin) {
      redirect("/dashboard");
    }
  }, [isLoaded, isAdmin]);

  const { data: stats, isLoading: statsLoading } = useQuery<AdminStats>({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const res = await fetch("/api/v1/admin/tenants");
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    enabled: isAdmin,
  });

  const { data: knowledgeMetrics, isLoading: knowledgeLoading } =
    useQuery<KnowledgeMetrics>({
      queryKey: ["knowledge-metrics"],
      queryFn: async () => {
        const res = await fetch("/api/v1/admin/knowledge");
        if (!res.ok) throw new Error("Failed to fetch metrics");
        return res.json();
      },
      enabled: isAdmin,
    });

  const { data: evalMetrics, isLoading: evalLoading } =
    useQuery<EvalMetrics>({
      queryKey: ["eval-metrics"],
      queryFn: async () => {
        const res = await fetch("/api/v1/admin/evals");
        if (!res.ok) throw new Error("Failed to fetch metrics");
        return res.json();
      },
      enabled: isAdmin,
    });

  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-blue-500"></div>
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Admin Panel</h1>
        <p className="mt-1 text-slate-400">
          System overview, tenant management, and analytics
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {statsLoading ? (
          <>
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </>
        ) : (
          <>
            <Card className="border-slate-800 bg-slate-900/50 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-400">Tenants</p>
                  <p className="mt-2 text-2xl font-bold text-white">
                    {stats?.totalTenants || 0}
                  </p>
                </div>
                <Users className="h-8 w-8 text-blue-500/20" />
              </div>
            </Card>

            <Card className="border-slate-800 bg-slate-900/50 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-400">Users</p>
                  <p className="mt-2 text-2xl font-bold text-white">
                    {stats?.totalUsers || 0}
                  </p>
                </div>
                <Users className="h-8 w-8 text-green-500/20" />
              </div>
            </Card>

            <Card className="border-slate-800 bg-slate-900/50 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-400">
                    Assessments
                  </p>
                  <p className="mt-2 text-2xl font-bold text-white">
                    {stats?.totalAssessments || 0}
                  </p>
                </div>
                <BarChart3 className="h-8 w-8 text-purple-500/20" />
              </div>
            </Card>

            <Card className="border-slate-800 bg-slate-900/50 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-400">
                    Active Now
                  </p>
                  <p className="mt-2 text-2xl font-bold text-white">
                    {stats?.activeAssessments || 0}
                  </p>
                </div>
                <Zap className="h-8 w-8 text-amber-500/20" />
              </div>
            </Card>

            <Card className="border-slate-800 bg-slate-900/50 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-400">
                    Total Cost
                  </p>
                  <p className="mt-2 text-xl font-bold text-white">
                    ${(stats?.totalCost || 0).toLocaleString()}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-red-500/20" />
              </div>
            </Card>
          </>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="tenants" className="w-full">
        <TabsList className="border-b border-slate-800 bg-transparent p-0">
          <TabsTrigger
            value="tenants"
            className="border-b-2 border-transparent px-4 py-2 text-slate-400 data-[state=active]:border-blue-500 data-[state=active]:text-white"
          >
            <Users className="mr-2 h-4 w-4" />
            Tenants
          </TabsTrigger>
          <TabsTrigger
            value="knowledge"
            className="border-b-2 border-transparent px-4 py-2 text-slate-400 data-[state=active]:border-blue-500 data-[state=active]:text-white"
          >
            <Database className="mr-2 h-4 w-4" />
            Knowledge
          </TabsTrigger>
          <TabsTrigger
            value="eval"
            className="border-b-2 border-transparent px-4 py-2 text-slate-400 data-[state=active]:border-blue-500 data-[state=active]:text-white"
          >
            <BarChart3 className="mr-2 h-4 w-4" />
            Evaluations
          </TabsTrigger>
          <TabsTrigger
            value="costs"
            className="border-b-2 border-transparent px-4 py-2 text-slate-400 data-[state=active]:border-blue-500 data-[state=active]:text-white"
          >
            <TrendingUp className="mr-2 h-4 w-4" />
            Costs
          </TabsTrigger>
        </TabsList>

        {/* Tenants Tab */}
        <TabsContent value="tenants" className="space-y-6">
          <TenantList />
        </TabsContent>

        {/* Knowledge Tab */}
        <TabsContent value="knowledge" className="space-y-6">
          <Card className="border-slate-800 bg-slate-900/50 p-6">
            <h2 className="text-lg font-semibold text-white">
              Knowledge Base Metrics
            </h2>
            {knowledgeLoading ? (
              <Skeleton className="mt-6 h-32 w-full" />
            ) : (
              <div className="mt-6 grid gap-6 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-slate-400">Total Documents</p>
                  <p className="mt-2 text-3xl font-bold text-white">
                    {knowledgeMetrics?.totalDocuments || 0}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Generated Codes</p>
                  <p className="mt-2 text-3xl font-bold text-white">
                    {knowledgeMetrics?.generatedCodes || 0}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Average Quality</p>
                  <p className="mt-2 text-3xl font-bold text-white">
                    {(knowledgeMetrics?.averageQuality || 0).toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Last Updated</p>
                  <p className="mt-2 text-sm text-white">
                    {knowledgeMetrics?.lastUpdated
                      ? new Date(
                          knowledgeMetrics.lastUpdated
                        ).toLocaleDateString()
                      : "N/A"}
                  </p>
                </div>
              </div>
            )}
            <Button variant="outline" className="mt-6">
              Manage Knowledge
            </Button>
          </Card>
        </TabsContent>

        {/* Evaluation Tab */}
        <TabsContent value="eval" className="space-y-6">
          <Card className="border-slate-800 bg-slate-900/50 p-6">
            <h2 className="text-lg font-semibold text-white">
              Evaluation Metrics
            </h2>
            {evalLoading ? (
              <Skeleton className="mt-6 h-32 w-full" />
            ) : (
              <div className="mt-6 grid gap-6 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-slate-400">Total Runs</p>
                  <p className="mt-2 text-3xl font-bold text-white">
                    {evalMetrics?.totalRuns || 0}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Average Score</p>
                  <p className="mt-2 text-3xl font-bold text-white">
                    {(evalMetrics?.averageScore || 0).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Pass Rate</p>
                  <p className="mt-2 text-3xl font-bold text-white">
                    {(evalMetrics?.passRate || 0).toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Last Run</p>
                  <p className="mt-2 text-sm text-white">
                    {evalMetrics?.lastRun
                      ? new Date(evalMetrics.lastRun).toLocaleDateString()
                      : "N/A"}
                  </p>
                </div>
              </div>
            )}
            <Button variant="outline" className="mt-6">
              Run Evaluations
            </Button>
          </Card>
        </TabsContent>

        {/* Costs Tab */}
        <TabsContent value="costs" className="space-y-6">
          <Card className="border-slate-800 bg-slate-900/50 p-6">
            <h2 className="text-lg font-semibold text-white">Cost Overview</h2>
            <div className="mt-6 space-y-4">
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                <p className="text-sm text-slate-400">Total System Cost</p>
                <p className="mt-2 text-3xl font-bold text-white">
                  ${(stats?.totalCost || 0).toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                <p className="text-sm text-slate-400">Cost per Tenant</p>
                <p className="mt-2 text-3xl font-bold text-white">
                  ${((stats?.totalCost || 0) / (stats?.totalTenants || 1)).toFixed(2)}
                </p>
              </div>
            </div>
            <Button variant="outline" className="mt-6">
              View Detailed Costs
            </Button>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
