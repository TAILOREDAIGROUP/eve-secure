/**
 * EVE Secure Database Types
 * Auto-generated type definitions for Supabase tables
 * Generated from migrations 001, 002, 003
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string;
          name: string;
          sector: 'healthcare' | 'legal';
          state: string;
          employee_count: number | null;
          it_budget_range: string | null;
          current_tools: Json;
          has_cyber_insurance: boolean;
          carrier_name: string | null;
          status: 'active' | 'suspended' | 'offboarded';
          kms_key_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          sector: 'healthcare' | 'legal';
          state: string;
          employee_count?: number | null;
          it_budget_range?: string | null;
          current_tools?: Json;
          has_cyber_insurance?: boolean;
          carrier_name?: string | null;
          status?: 'active' | 'suspended' | 'offboarded';
          kms_key_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          sector?: 'healthcare' | 'legal';
          state?: string;
          employee_count?: number | null;
          it_budget_range?: string | null;
          current_tools?: Json;
          has_cyber_insurance?: boolean;
          carrier_name?: string | null;
          status?: 'active' | 'suspended' | 'offboarded';
          kms_key_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      users: {
        Row: {
          id: string;
          tenant_id: string;
          clerk_id: string;
          email: string;
          role: 'super_admin' | 'tenant_admin' | 'user';
          notification_preferences: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          clerk_id: string;
          email: string;
          role: 'super_admin' | 'tenant_admin' | 'user';
          notification_preferences?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          clerk_id?: string;
          email?: string;
          role?: 'super_admin' | 'tenant_admin' | 'user';
          notification_preferences?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'users_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          }
        ];
      };
      org_profiles: {
        Row: {
          id: string;
          tenant_id: string;
          org_name: string;
          sector: string;
          state: string;
          employee_count: number | null;
          it_budget_range: string | null;
          current_tools: Json;
          ehr_system: string | null;
          dms_system: string | null;
          cyber_insurance: boolean;
          carrier: string | null;
          profile_data: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          org_name: string;
          sector: string;
          state: string;
          employee_count?: number | null;
          it_budget_range?: string | null;
          current_tools?: Json;
          ehr_system?: string | null;
          dms_system?: string | null;
          cyber_insurance?: boolean;
          carrier?: string | null;
          profile_data?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          org_name?: string;
          sector?: string;
          state?: string;
          employee_count?: number | null;
          it_budget_range?: string | null;
          current_tools?: Json;
          ehr_system?: string | null;
          dms_system?: string | null;
          cyber_insurance?: boolean;
          carrier?: string | null;
          profile_data?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'org_profiles_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: true;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          }
        ];
      };
      assessment_sessions: {
        Row: {
          id: string;
          tenant_id: string;
          user_id: string;
          status: 'in_progress' | 'completed' | 'abandoned';
          current_section: string | null;
          progress_pct: number;
          tier_rating: number | null;
          gaps: Json;
          started_at: string;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          user_id: string;
          status?: 'in_progress' | 'completed' | 'abandoned';
          current_section?: string | null;
          progress_pct?: number;
          tier_rating?: number | null;
          gaps?: Json;
          started_at?: string;
          completed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          user_id?: string;
          status?: 'in_progress' | 'completed' | 'abandoned';
          current_section?: string | null;
          progress_pct?: number;
          tier_rating?: number | null;
          gaps?: Json;
          started_at?: string;
          completed_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'assessment_sessions_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'assessment_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      assessment_responses: {
        Row: {
          id: string;
          tenant_id: string;
          session_id: string;
          question_id: string | null;
          section: string;
          question_text: string;
          response_text: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          session_id: string;
          question_id?: string | null;
          section: string;
          question_text: string;
          response_text?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          session_id?: string;
          question_id?: string | null;
          section?: string;
          question_text?: string;
          response_text?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'assessment_responses_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'assessment_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'assessment_responses_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          }
        ];
      };
      action_plans: {
        Row: {
          id: string;
          tenant_id: string;
          session_id: string;
          recommendations: Json;
          total_cost_estimate: number | null;
          budget_constraint: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          session_id: string;
          recommendations?: Json;
          total_cost_estimate?: number | null;
          budget_constraint?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          session_id?: string;
          recommendations?: Json;
          total_cost_estimate?: number | null;
          budget_constraint?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'action_plans_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'assessment_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'action_plans_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          }
        ];
      };
      generated_documents: {
        Row: {
          id: string;
          tenant_id: string;
          session_id: string;
          doc_type: 'cost_of_inaction' | 'assessment_report' | 'ir_package' | 'tabletop' | 'insurance_questionnaire';
          s3_key: string;
          file_name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          session_id: string;
          doc_type: 'cost_of_inaction' | 'assessment_report' | 'ir_package' | 'tabletop' | 'insurance_questionnaire';
          s3_key: string;
          file_name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          session_id?: string;
          doc_type?: 'cost_of_inaction' | 'assessment_report' | 'ir_package' | 'tabletop' | 'insurance_questionnaire';
          s3_key?: string;
          file_name?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'generated_documents_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'assessment_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'generated_documents_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          }
        ];
      };
      knowledge_documents: {
        Row: {
          id: string;
          category: 'nist_csf' | 'hipaa' | 'legal' | 'threats' | 'insurance';
          subcategory: string | null;
          title: string;
          content: string;
          embedding: string | null; // vector(1024)
          metadata: Json;
          source_reference: string | null;
          hash: string;
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          category: 'nist_csf' | 'hipaa' | 'legal' | 'threats' | 'insurance';
          subcategory?: string | null;
          title: string;
          content: string;
          embedding?: string | null;
          metadata?: Json;
          source_reference?: string | null;
          hash: string;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          category?: 'nist_csf' | 'hipaa' | 'legal' | 'threats' | 'insurance';
          subcategory?: string | null;
          title?: string;
          content?: string;
          embedding?: string | null;
          metadata?: Json;
          source_reference?: string | null;
          hash?: string;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      compliance_matrix: {
        Row: {
          id: string;
          nist_subcategory_id: string | null;
          hipaa_spec: string | null;
          aba_rule: string | null;
          sec_rule: string | null;
          state: string | null;
          breach_notification_timeline: string | null;
          breach_notification_recipients: string | null;
          cmmc_level: number | null;
          circia_requirement: string | null;
          metadata: Json;
        };
        Insert: {
          id?: string;
          nist_subcategory_id?: string | null;
          hipaa_spec?: string | null;
          aba_rule?: string | null;
          sec_rule?: string | null;
          state?: string | null;
          breach_notification_timeline?: string | null;
          breach_notification_recipients?: string | null;
          cmmc_level?: number | null;
          circia_requirement?: string | null;
          metadata?: Json;
        };
        Update: {
          id?: string;
          nist_subcategory_id?: string | null;
          hipaa_spec?: string | null;
          aba_rule?: string | null;
          sec_rule?: string | null;
          state?: string | null;
          breach_notification_timeline?: string | null;
          breach_notification_recipients?: string | null;
          cmmc_level?: number | null;
          circia_requirement?: string | null;
          metadata?: Json;
        };
        Relationships: [];
      };
      audit_events: {
        Row: {
          id: string;
          tenant_id: string | null;
          user_id: string | null;
          event_type: string;
          event_data: Json;
          ip_address: string | null; // inet type
          user_agent: string | null;
          response_text: string | null;
          knowledge_version: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id?: string | null;
          user_id?: string | null;
          event_type: string;
          event_data?: Json;
          ip_address?: string | null;
          user_agent?: string | null;
          response_text?: string | null;
          knowledge_version?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string | null;
          user_id?: string | null;
          event_type?: string;
          event_data?: Json;
          ip_address?: string | null;
          user_agent?: string | null;
          response_text?: string | null;
          knowledge_version?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_events_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'audit_events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      notification_preferences: {
        Row: {
          id: string;
          tenant_id: string;
          user_id: string;
          email_enabled: boolean;
          sms_enabled: boolean;
          sms_critical_always: boolean;
          phone_number: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          user_id: string;
          email_enabled?: boolean;
          sms_enabled?: boolean;
          sms_critical_always?: boolean;
          phone_number?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          user_id?: string;
          email_enabled?: boolean;
          sms_enabled?: boolean;
          sms_critical_always?: boolean;
          phone_number?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_preferences_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notification_preferences_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      emergency_codes: {
        Row: {
          id: string;
          user_id: string;
          code_hash: string;
          used: boolean;
          used_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          code_hash: string;
          used?: boolean;
          used_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          code_hash?: string;
          used?: boolean;
          used_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'emergency_codes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      conversation_state: {
        Row: {
          id: string;
          tenant_id: string;
          session_id: string;
          context_summary: string | null;
          current_section_qa: Json;
          retrieved_knowledge_ids: string[];
          token_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          session_id: string;
          context_summary?: string | null;
          current_section_qa?: Json;
          retrieved_knowledge_ids?: string[];
          token_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          session_id?: string;
          context_summary?: string | null;
          current_section_qa?: Json;
          retrieved_knowledge_ids?: string[];
          token_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversation_state_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversation_state_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: true;
            referencedRelation: 'assessment_sessions';
            referencedColumns: ['id'];
          }
        ];
      };
      emergency_rate_limits: {
        Row: {
          id: string;
          identifier: string;
          attempt_count: number;
          window_start: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          identifier: string;
          attempt_count?: number;
          window_start?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          identifier?: string;
          attempt_count?: number;
          window_start?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      feature_flags: {
        Row: {
          id: string;
          name: string;
          enabled: boolean;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          enabled?: boolean;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          enabled?: boolean;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {};
    Functions: {
      set_config: {
        Args: {
          p_setting: string;
          p_value: string;
        };
        Returns: void;
      };
      search_knowledge_documents: {
        Args: {
          query_embedding: string; // vector(1024)
          match_threshold: number;
          match_count: number;
        };
        Returns: Array<{
          id: string;
          category: string;
          title: string;
          content: string;
          similarity: number;
        }>;
      };
    };
    Enums: {
      sector_type: 'healthcare' | 'legal';
      user_role: 'super_admin' | 'tenant_admin' | 'user';
      assessment_status: 'in_progress' | 'completed' | 'abandoned';
      doc_type: 'cost_of_inaction' | 'assessment_report' | 'ir_package' | 'tabletop' | 'insurance_questionnaire';
      knowledge_category: 'nist_csf' | 'hipaa' | 'legal' | 'threats' | 'insurance';
      tenant_status: 'active' | 'suspended' | 'offboarded';
    };
  };
}

/**
 * Convenience type exports
 */
export type Tenant = Database['public']['Tables']['tenants']['Row'];
export type TenantInsert = Database['public']['Tables']['tenants']['Insert'];
export type TenantUpdate = Database['public']['Tables']['tenants']['Update'];

export type User = Database['public']['Tables']['users']['Row'];
export type UserInsert = Database['public']['Tables']['users']['Insert'];
export type UserUpdate = Database['public']['Tables']['users']['Update'];

export type OrgProfile = Database['public']['Tables']['org_profiles']['Row'];
export type OrgProfileInsert = Database['public']['Tables']['org_profiles']['Insert'];
export type OrgProfileUpdate = Database['public']['Tables']['org_profiles']['Update'];

export type AssessmentSession = Database['public']['Tables']['assessment_sessions']['Row'];
export type AssessmentSessionInsert = Database['public']['Tables']['assessment_sessions']['Insert'];
export type AssessmentSessionUpdate = Database['public']['Tables']['assessment_sessions']['Update'];

export type AssessmentResponse = Database['public']['Tables']['assessment_responses']['Row'];
export type AssessmentResponseInsert = Database['public']['Tables']['assessment_responses']['Insert'];
export type AssessmentResponseUpdate = Database['public']['Tables']['assessment_responses']['Update'];

export type ActionPlan = Database['public']['Tables']['action_plans']['Row'];
export type ActionPlanInsert = Database['public']['Tables']['action_plans']['Insert'];
export type ActionPlanUpdate = Database['public']['Tables']['action_plans']['Update'];

export type GeneratedDocument = Database['public']['Tables']['generated_documents']['Row'];
export type GeneratedDocumentInsert = Database['public']['Tables']['generated_documents']['Insert'];
export type GeneratedDocumentUpdate = Database['public']['Tables']['generated_documents']['Update'];

export type KnowledgeDocument = Database['public']['Tables']['knowledge_documents']['Row'];
export type KnowledgeDocumentInsert = Database['public']['Tables']['knowledge_documents']['Insert'];
export type KnowledgeDocumentUpdate = Database['public']['Tables']['knowledge_documents']['Update'];

export type ComplianceMatrix = Database['public']['Tables']['compliance_matrix']['Row'];
export type ComplianceMatrixInsert = Database['public']['Tables']['compliance_matrix']['Insert'];
export type ComplianceMatrixUpdate = Database['public']['Tables']['compliance_matrix']['Update'];

export type AuditEvent = Database['public']['Tables']['audit_events']['Row'];
export type AuditEventInsert = Database['public']['Tables']['audit_events']['Insert'];
export type AuditEventUpdate = Database['public']['Tables']['audit_events']['Update'];

export type NotificationPreferences = Database['public']['Tables']['notification_preferences']['Row'];
export type NotificationPreferencesInsert = Database['public']['Tables']['notification_preferences']['Insert'];
export type NotificationPreferencesUpdate = Database['public']['Tables']['notification_preferences']['Update'];

export type EmergencyCode = Database['public']['Tables']['emergency_codes']['Row'];
export type EmergencyCodeInsert = Database['public']['Tables']['emergency_codes']['Insert'];
export type EmergencyCodeUpdate = Database['public']['Tables']['emergency_codes']['Update'];

export type ConversationState = Database['public']['Tables']['conversation_state']['Row'];
export type ConversationStateInsert = Database['public']['Tables']['conversation_state']['Insert'];
export type ConversationStateUpdate = Database['public']['Tables']['conversation_state']['Update'];

export type FeatureFlag = Database['public']['Tables']['feature_flags']['Row'];
export type FeatureFlagInsert = Database['public']['Tables']['feature_flags']['Insert'];
export type FeatureFlagUpdate = Database['public']['Tables']['feature_flags']['Update'];
