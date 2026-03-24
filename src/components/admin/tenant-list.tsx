"use client";

import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users, TrendingUp, AlertCircle, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Tenant {
  id: string;
  name: string;
  status: "active" | "inactive" | "suspended";
  userCount: number;
  monthlyUsage: number;
  monthlyLimit: number;
  createdAt: string;
  lastActivity: string;
  estimatedMonthlyUsage: number;
}

interface TenantListResponse {
  tenants: Tenant[];
  total: number;
  page: number;
  pageSize: number;
}

export function TenantList() {
  const { data: response, isLoading } = useQuery<TenantListResponse>({
    queryKey: ["tenants"],
    queryFn: async () => {
      const res = await fetch("/api/admin/tenants?page=1&pageSize=50");
      if (!res.ok) throw new Error("Failed to fetch tenants");
      return res.json();
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-900/30 text-green-200";
      case "inactive":
        return "bg-slate-900/30 text-slate-300";
      case "suspended":
        return "bg-red-900/30 text-red-200";
      default:
        return "bg-slate-900/30 text-slate-300";
    }
  };

  const getUsagePercentage = (usage: number, limit: number) => {
    return Math.round((usage / limit) * 100);
  };

  return (
    <Card className="border-slate-800 bg-slate-900/50 overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="border-b border-slate-800 bg-slate-800/50">
            <TableRow>
              <TableHead className="text-slate-300">Tenant</TableHead>
              <TableHead className="text-slate-300">Status</TableHead>
              <TableHead className="text-right text-slate-300">
                <div className="flex items-center justify-end gap-1">
                  <Users className="h-4 w-4" />
                  Users
                </div>
              </TableHead>
              <TableHead className="text-right text-slate-300">
                <div className="flex items-center justify-end gap-1">
                  <TrendingUp className="h-4 w-4" />
                  Monthly Usage
                </div>
              </TableHead>
              <TableHead className="text-right text-slate-300">
                Est. Monthly Cost
              </TableHead>
              <TableHead className="text-right text-slate-300">
                Last Activity
              </TableHead>
              <TableHead className="text-right text-slate-300">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <>
                {[1, 2, 3, 4, 5].map((i) => (
                  <TableRow key={i}>
                    {[1, 2, 3, 4, 5, 6, 7].map((j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </>
            ) : response && response.tenants.length > 0 ? (
              response.tenants.map((tenant) => {
                const usagePercent = getUsagePercentage(
                  tenant.monthlyUsage,
                  tenant.monthlyLimit
                );
                const isWarning = usagePercent > 80;

                return (
                  <TableRow key={tenant.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                    <TableCell>
                      <div>
                        <p className="font-medium text-white">{tenant.name}</p>
                        <p className="text-xs text-slate-500">ID: {tenant.id.slice(0, 8)}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(tenant.status)}>
                        {tenant.status.charAt(0).toUpperCase() +
                          tenant.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-white">
                      {tenant.userCount}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-24">
                          <div className="h-2 rounded-full bg-slate-700">
                            <div
                              className={`h-full rounded-full transition-all ${
                                isWarning
                                  ? "bg-red-500"
                                  : "bg-green-500"
                              }`}
                              style={{ width: `${Math.min(usagePercent, 100)}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-sm text-slate-400">
                          {usagePercent}%
                        </span>
                        {isWarning && (
                          <AlertCircle className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-white">
                      ${(tenant.estimatedMonthlyUsage || 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-sm text-slate-400">
                      {new Date(tenant.lastActivity).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          className="border-slate-700 bg-slate-800"
                          align="end"
                        >
                          <DropdownMenuItem className="text-slate-300">
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-slate-300">
                            View Metrics
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-slate-300">
                            Edit Settings
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-400">
                            Suspend
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center">
                  <p className="text-slate-400">No tenants found</p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
