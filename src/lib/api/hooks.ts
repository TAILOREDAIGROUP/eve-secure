/**
 * Reusable React Query hooks for EVE Secure API operations.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  assessment,
  onboarding,
  plan,
  documents,
  admin,
  settings,
  ir,
  type AssessmentSession,
  type OrganizationProfile,
  type ActionPlan,
  type GeneratedDocument,
  type UserSettings,
  type IRSession,
} from "./client";

// ---------------------------------------------------------------------------
// Assessment hooks
// ---------------------------------------------------------------------------

export function useAssessmentList() {
  return useQuery({
    queryKey: ["assessments"],
    queryFn: assessment.list,
  });
}

export function useAssessment(sessionId: string | null) {
  return useQuery({
    queryKey: ["assessment", sessionId],
    queryFn: () => assessment.get(sessionId!),
    enabled: !!sessionId,
  });
}

export function useCreateAssessment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: assessment.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assessments"] });
    },
  });
}

export function useAssessmentRespond(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { message: string; section: string }) =>
      assessment.respond(sessionId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assessment", sessionId] });
    },
  });
}

// ---------------------------------------------------------------------------
// Onboarding hooks
// ---------------------------------------------------------------------------

export function useOrganizationProfile(tenantId: string | null) {
  return useQuery({
    queryKey: ["organization-profile", tenantId],
    queryFn: () => onboarding.get(tenantId!),
    enabled: !!tenantId,
  });
}

export function useCreateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<OrganizationProfile>) => onboarding.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization-profile"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Plan hooks
// ---------------------------------------------------------------------------

export function usePlanList() {
  return useQuery({
    queryKey: ["plans"],
    queryFn: plan.list,
  });
}

export function usePlan(planId: string | null) {
  return useQuery({
    queryKey: ["plan", planId],
    queryFn: () => plan.get(planId!),
    enabled: !!planId,
  });
}

export function useCreatePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assessmentId: string) => plan.create(assessmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
    },
  });
}

export function useUpdateActionStatus(planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ actionId, status }: { actionId: string; status: string }) =>
      plan.updateAction(planId, actionId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plan", planId] });
    },
  });
}

// ---------------------------------------------------------------------------
// Document hooks
// ---------------------------------------------------------------------------

export function useDocumentList() {
  return useQuery({
    queryKey: ["documents"],
    queryFn: documents.list,
  });
}

export function useDocument(docId: string | null) {
  return useQuery({
    queryKey: ["document", docId],
    queryFn: () => documents.get(docId!),
    enabled: !!docId,
  });
}

export function useCreateDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { type: string; assessmentId?: string }) =>
      documents.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (docId: string) => documents.delete(docId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Admin hooks
// ---------------------------------------------------------------------------

export function useAdminStats() {
  return useQuery({
    queryKey: ["admin-stats"],
    queryFn: admin.stats,
  });
}

export function useAdminTenants() {
  return useQuery({
    queryKey: ["admin-tenants"],
    queryFn: admin.tenants,
  });
}

export function useKnowledgeMetrics() {
  return useQuery({
    queryKey: ["admin-knowledge"],
    queryFn: admin.knowledge,
  });
}

export function useEvalMetrics() {
  return useQuery({
    queryKey: ["admin-evals"],
    queryFn: admin.evals,
  });
}

// ---------------------------------------------------------------------------
// Settings hooks
// ---------------------------------------------------------------------------

export function useUserSettings() {
  return useQuery({
    queryKey: ["user-settings"],
    queryFn: settings.get,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<UserSettings>) => settings.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
    },
  });
}

// ---------------------------------------------------------------------------
// IR hooks
// ---------------------------------------------------------------------------

export function useStartIR() {
  return useMutation({
    mutationFn: (data: { severity: string; description: string }) =>
      ir.start(data),
  });
}

export function useIRSession(sessionId: string | null) {
  return useQuery({
    queryKey: ["ir-session", sessionId],
    queryFn: () => ir.get(sessionId!),
    enabled: !!sessionId,
  });
}
