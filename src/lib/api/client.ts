/**
 * Typed API client for EVE Secure frontend.
 * Wraps fetch with auth headers, error handling, and tenant context.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const API_BASE = "/api/v1";

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = path.startsWith("/") ? `${API_BASE}${path}` : `${API_BASE}/${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    let errorData: unknown;
    try {
      errorData = await res.json();
    } catch {
      errorData = await res.text();
    }
    throw new ApiError(
      res.status,
      (errorData as { error?: string })?.error || `Request failed: ${res.status}`,
      errorData
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ---------------------------------------------------------------------------
// Assessment
// ---------------------------------------------------------------------------

export interface AssessmentSession {
  id: string;
  status: "draft" | "in_progress" | "completed";
  progress: number;
  lastUpdated: string;
  completedSections: number;
  totalSections: number;
  currentSection?: string;
  sections?: AssessmentSection[];
}

export interface AssessmentSection {
  id: string;
  title: string;
  description: string;
  status: "locked" | "available" | "completed";
  progress: number;
  estimatedTime: number;
  questions: number;
}

export interface AssessmentResponse {
  message: string;
  section: string;
  progress: number;
}

export const assessment = {
  list: () => request<{ sessions: AssessmentSession[] }>("/assessment"),
  get: (sessionId: string) =>
    request<AssessmentSession>(`/assessment/${sessionId}`),
  create: () =>
    request<AssessmentSession>("/assessment", { method: "POST" }),
  respond: (sessionId: string, body: { message: string; section: string }) =>
    request<AssessmentResponse>(`/assessment/${sessionId}/respond`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

export interface OrganizationProfile {
  id: string;
  name: string;
  sector: string;
  size: string;
  location: string;
  website?: string;
  tools: string[];
  hasInsurance: boolean;
  insuranceProvider?: string;
  emergencyCodes?: string[];
}

export const onboarding = {
  get: (tenantId: string) =>
    request<OrganizationProfile>(`/onboarding/${tenantId}`),
  create: (data: Partial<OrganizationProfile>) =>
    request<OrganizationProfile>("/onboarding", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export interface ActionItem {
  id: string;
  title: string;
  description: string;
  rank: number;
  priority: "critical" | "high" | "medium" | "low";
  estimatedCost: { min: number; max: number; currency: string };
  estimatedTime: string;
  difficulty: "easy" | "medium" | "hard";
  complianceTags: string[];
  insuranceTags: string[];
  category: string;
  resources: string[];
  status: "not_started" | "in_progress" | "completed";
}

export interface ActionPlan {
  id: string;
  assessmentId: string;
  createdAt: string;
  totalActions: number;
  estimatedTotalCost: { min: number; max: number; currency: string };
  actions: ActionItem[];
  summary: string;
}

export const plan = {
  list: () => request<{ plans: ActionPlan[] }>("/plan"),
  get: (planId: string) => request<ActionPlan>(`/plan/${planId}`),
  create: (assessmentId: string) =>
    request<ActionPlan>("/plan", {
      method: "POST",
      body: JSON.stringify({ assessmentId }),
    }),
  updateAction: (planId: string, actionId: string, status: string) =>
    request<ActionItem>(`/plan/${planId}`, {
      method: "PUT",
      body: JSON.stringify({ actionId, status }),
    }),
};

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export interface GeneratedDocument {
  id: string;
  title: string;
  type: string;
  format: "pdf" | "docx" | "markdown";
  createdAt: string;
  updatedAt: string;
  size: number;
  status: "draft" | "ready" | "archived";
  sections: string[];
  downloadUrl?: string;
}

export const documents = {
  list: () => request<{ documents: GeneratedDocument[] }>("/documents"),
  get: (docId: string) => request<GeneratedDocument>(`/documents/${docId}`),
  create: (data: { type: string; assessmentId?: string }) =>
    request<GeneratedDocument>("/documents", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  delete: (docId: string) =>
    request<void>(`/documents/${docId}`, { method: "DELETE" }),
};

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export interface AdminStats {
  totalTenants: number;
  totalUsers: number;
  totalAssessments: number;
  totalCost: number;
  activeAssessments: number;
}

export interface KnowledgeMetrics {
  totalDocuments: number;
  generatedCodes: number;
  averageQuality: number;
  lastUpdated: string;
}

export interface EvalMetrics {
  totalRuns: number;
  averageScore: number;
  passRate: number;
  lastRun: string;
}

export const admin = {
  stats: () => request<AdminStats>("/admin/tenants"),
  tenants: () => request<{ tenants: Array<{ id: string; name: string; status: string }> }>("/admin/tenants"),
  knowledge: () => request<KnowledgeMetrics>("/admin/knowledge"),
  evals: () => request<EvalMetrics>("/admin/evals"),
};

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface UserSettings {
  id: string;
  email: string;
  name: string;
  notifications: {
    assessmentUpdates: boolean;
    securityAlerts: boolean;
    weeklyDigest: boolean;
    planUpdates: boolean;
  };
  emergencyCodes: string[];
  mfaEnabled: boolean;
}

export const settings = {
  get: () => request<UserSettings>("/onboarding"),
  update: (data: Partial<UserSettings>) =>
    request<UserSettings>("/onboarding", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
};

// ---------------------------------------------------------------------------
// Incident Response
// ---------------------------------------------------------------------------

export interface IRSession {
  id: string;
  status: "initial_intake" | "containment" | "eradication" | "recovery" | "completed";
  createdAt: string;
  updates: IRUpdate[];
  summary: string;
}

export interface IRUpdate {
  id: string;
  timestamp: string;
  action: string;
  severity: "critical" | "high" | "medium" | "low";
  notes: string;
  contacts: string[];
}

export const ir = {
  start: (data: { severity: string; description: string }) =>
    request<IRSession>("/ir/start", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  get: (sessionId: string) => request<IRSession>(`/ir/${sessionId}`),
};

// ---------------------------------------------------------------------------
// SSE Streaming URL helper
// ---------------------------------------------------------------------------

export function getSSEUrl(sessionId: string): string {
  return `${API_BASE}/sse?sessionId=${sessionId}`;
}
