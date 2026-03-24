"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  FileText,
  Download,
  Eye,
  Plus,
  Trash2,
  Calendar,
  User,
  AlertCircle,
} from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Document {
  id: string;
  title: string;
  type: string;
  format: "pdf" | "docx" | "markdown";
  createdAt: string;
  updatedAt: string;
  size: number;
  status: "draft" | "ready" | "archived";
  sections: string[];
}

interface DocumentList {
  documents: Document[];
  total: number;
}

const DOCUMENT_TYPES = [
  { id: "executive_summary", label: "Executive Summary" },
  { id: "remediation_plan", label: "Remediation Plan" },
  { id: "incident_response", label: "Incident Response Plan" },
  { id: "security_policy", label: "Security Policy" },
  { id: "compliance_report", label: "Compliance Report" },
  { id: "risk_assessment", label: "Risk Assessment" },
  { id: "business_continuity", label: "Business Continuity Plan" },
  { id: "vendor_matrix", label: "Vendor Security Matrix" },
];

export default function DocumentsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedType, setSelectedType] = useState<string>("");

  const { data: documentList, isLoading } = useQuery<DocumentList>({
    queryKey: ["documents"],
    queryFn: async () => {
      const res = await fetch("/api/documents");
      if (!res.ok) throw new Error("Failed to fetch documents");
      return res.json();
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (docType: string) => {
      setIsGenerating(true);
      const res = await fetch("/api/documents/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: docType }),
      });
      if (!res.ok) throw new Error("Failed to generate document");
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Document generated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setIsGenerating(false);
      setSelectedType("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate document",
        variant: "destructive",
      });
      setIsGenerating(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (docId: string) => {
      const res = await fetch(`/api/documents/${docId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete document");
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Document deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete document",
        variant: "destructive",
      });
    },
  });

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ready":
        return (
          <span className="inline-flex items-center gap-1 rounded-lg bg-green-900/30 px-2.5 py-1 text-xs font-medium text-green-200">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Ready
          </span>
        );
      case "draft":
        return (
          <span className="inline-flex items-center gap-1 rounded-lg bg-amber-900/30 px-2.5 py-1 text-xs font-medium text-amber-200">
            <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Draft
          </span>
        );
      case "archived":
        return (
          <span className="inline-flex items-center gap-1 rounded-lg bg-slate-700/30 px-2.5 py-1 text-xs font-medium text-slate-300">
            <div className="h-1.5 w-1.5 rounded-full bg-slate-500" />
            Archived
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Documents</h1>
          <p className="mt-1 text-slate-400">
            Generate and manage security documentation
          </p>
        </div>

        <Dialog>
          <DialogTrigger className="gap-2 inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2">
            <Plus className="h-4 w-4" />
            Generate Document
          </DialogTrigger>
          <DialogContent className="border-slate-700 bg-slate-900">
            <DialogHeader>
              <DialogTitle className="text-white">Generate Document</DialogTitle>
              <DialogDescription className="text-slate-400">
                Select the type of document to generate based on your assessment
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="border-slate-700 bg-slate-800">
                  <SelectValue placeholder="Select document type" />
                </SelectTrigger>
                <SelectContent className="border-slate-700 bg-slate-800">
                  {DOCUMENT_TYPES.map((docType) => (
                    <SelectItem key={docType.id} value={docType.id}>
                      {docType.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="rounded-lg border border-blue-900/30 bg-blue-900/10 p-4">
                <p className="text-sm text-blue-200">
                  ℹ️ Documents are generated using your assessment data and will
                  be available for download immediately.
                </p>
              </div>

              <Button
                onClick={() => generateMutation.mutate(selectedType)}
                disabled={!selectedType || isGenerating || generateMutation.isPending}
                className="w-full"
              >
                {generateMutation.isPending ? "Generating..." : "Generate"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-slate-800 bg-slate-900/50 p-6">
          <p className="text-sm font-medium text-slate-400">Total Documents</p>
          <p className="mt-2 text-2xl font-bold text-white">
            {documentList?.total || 0}
          </p>
        </Card>
        <Card className="border-slate-800 bg-slate-900/50 p-6">
          <p className="text-sm font-medium text-slate-400">Ready</p>
          <p className="mt-2 text-2xl font-bold text-green-400">
            {documentList?.documents.filter((d) => d.status === "ready").length || 0}
          </p>
        </Card>
        <Card className="border-slate-800 bg-slate-900/50 p-6">
          <p className="text-sm font-medium text-slate-400">In Draft</p>
          <p className="mt-2 text-2xl font-bold text-amber-400">
            {documentList?.documents.filter((d) => d.status === "draft").length || 0}
          </p>
        </Card>
      </div>

      {/* Documents List */}
      <div className="space-y-4">
        {isLoading ? (
          <>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </>
        ) : documentList && documentList.documents.length > 0 ? (
          documentList.documents.map((doc) => (
            <Card
              key={doc.id}
              className="border-slate-800 bg-slate-900/50 transition-all hover:bg-slate-800/50"
            >
              <div className="flex flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  <div className="flex-shrink-0">
                    <FileText className="h-8 w-8 text-blue-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-white">
                      {doc.title}
                    </h3>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </span>
                      <span>{doc.format.toUpperCase()}</span>
                      <span>{formatFileSize(doc.size)}</span>
                      {getStatusBadge(doc.status)}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <a href={`/api/documents/${doc.id}/preview`}>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                    >
                      <Eye className="h-4 w-4" />
                      <span className="hidden sm:inline">Preview</span>
                    </Button>
                  </a>
                  <a href={`/api/documents/${doc.id}/download`}>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                    >
                      <Download className="h-4 w-4" />
                      <span className="hidden sm:inline">Download</span>
                    </Button>
                  </a>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => deleteMutation.mutate(doc.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))
        ) : (
          <Card className="border-slate-800 bg-slate-900/50 p-12">
            <div className="text-center">
              <FileText className="mx-auto h-12 w-12 text-slate-500" />
              <p className="mt-4 text-slate-400">
                No documents generated yet. Create one to get started.
              </p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
