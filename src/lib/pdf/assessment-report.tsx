import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

/**
 * Assessment Report — Multi-page PDF Template
 *
 * Comprehensive security posture report:
 * - Executive summary (LLM-generated)
 * - Score breakdown by NIST CSF category
 * - Critical findings with severity
 * - Remediation plan with timeline
 * - Next steps
 */

export interface AssessmentReportData {
  organizationName: string;
  sector: string;
  assessmentDate: string;
  completedDate: string;
  tierRating: number;
  overallScore: number; // 0-100
  executiveSummary: string;
  categoryScores: Array<{
    category: string;
    score: number; // 0-100
    tier: number; // 1-4
    questionCount: number;
    status: 'critical' | 'needs-improvement' | 'adequate' | 'strong';
  }>;
  findings: Array<{
    id: number;
    title: string;
    category: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    complianceTags: string[];
    recommendation: string;
  }>;
  remediationPlan: Array<{
    rank: number;
    title: string;
    estimatedCost: number;
    timeToImplement: string;
    difficulty: string;
    complianceTags: string[];
  }>;
  nextSteps: string[];
  generatedBy: 'llm' | 'template';
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#b71c1c',
  high: '#e65100',
  medium: '#f57f17',
  low: '#33691e',
};

const STATUS_COLORS: Record<string, string> = {
  critical: '#b71c1c',
  'needs-improvement': '#e65100',
  adequate: '#1565c0',
  strong: '#2e7d32',
};

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#1a1a2e',
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    borderBottomWidth: 2,
    borderBottomColor: '#0f3460',
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: '#0f3460',
  },
  headerSubtitle: {
    fontSize: 9,
    color: '#666',
    marginTop: 2,
  },
  headerRight: {
    textAlign: 'right',
  },
  confidential: {
    fontSize: 7,
    color: '#c62828',
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
  },
  // Section titles
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#0f3460',
    marginTop: 14,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Executive summary
  summaryText: {
    fontSize: 9,
    lineHeight: 1.5,
    marginBottom: 8,
    color: '#333',
  },
  // Overall score box
  scoreBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    marginBottom: 10,
    backgroundColor: '#e8eaf6',
    borderRadius: 4,
  },
  scoreValue: {
    fontSize: 28,
    fontFamily: 'Helvetica-Bold',
    color: '#0f3460',
    marginRight: 12,
  },
  scoreLabel: {
    fontSize: 9,
    color: '#333',
  },
  scoreTier: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#0f3460',
  },
  // Category scores table
  categoryRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#e0e0e0',
    paddingVertical: 4,
    alignItems: 'center',
  },
  categoryName: {
    width: '30%',
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
  },
  categoryScore: {
    width: '15%',
    fontSize: 9,
    textAlign: 'center',
  },
  categoryTier: {
    width: '10%',
    fontSize: 9,
    textAlign: 'center',
    fontFamily: 'Helvetica-Bold',
  },
  categoryQuestions: {
    width: '15%',
    fontSize: 8,
    textAlign: 'center',
    color: '#666',
  },
  categoryStatus: {
    width: '30%',
    fontSize: 8,
    textAlign: 'right',
    fontFamily: 'Helvetica-Bold',
  },
  // Findings
  findingCard: {
    marginBottom: 8,
    padding: 8,
    borderLeftWidth: 3,
    backgroundColor: '#fafafa',
  },
  findingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  findingTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    flex: 1,
  },
  findingSeverity: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    paddingHorizontal: 6,
    paddingVertical: 2,
    color: '#fff',
    borderRadius: 2,
  },
  findingBody: {
    fontSize: 8,
    color: '#444',
    lineHeight: 1.4,
    marginBottom: 3,
  },
  findingTags: {
    fontSize: 7,
    color: '#0f3460',
    fontFamily: 'Helvetica-Oblique',
  },
  findingRec: {
    fontSize: 8,
    color: '#1b5e20',
    marginTop: 2,
    fontFamily: 'Helvetica-Oblique',
  },
  // Remediation table
  remRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#e0e0e0',
    paddingVertical: 3,
  },
  remRank: {
    width: '5%',
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#0f3460',
  },
  remTitle: {
    width: '35%',
    fontSize: 8,
  },
  remCost: {
    width: '15%',
    fontSize: 8,
    textAlign: 'right',
  },
  remTime: {
    width: '15%',
    fontSize: 8,
    textAlign: 'center',
  },
  remDifficulty: {
    width: '12%',
    fontSize: 8,
    textAlign: 'center',
  },
  remTags: {
    width: '18%',
    fontSize: 7,
    color: '#0f3460',
  },
  // Next steps
  nextStepItem: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  nextStepBullet: {
    width: 14,
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#0f3460',
  },
  nextStepText: {
    flex: 1,
    fontSize: 9,
    lineHeight: 1.4,
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: '#999',
  },
  pageNumber: {
    fontSize: 7,
    color: '#999',
  },
});

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function statusLabel(status: string): string {
  switch (status) {
    case 'critical': return 'CRITICAL — Immediate Action Required';
    case 'needs-improvement': return 'NEEDS IMPROVEMENT';
    case 'adequate': return 'ADEQUATE';
    case 'strong': return 'STRONG';
    default: return status.toUpperCase();
  }
}

export function AssessmentReportDocument({ data }: { data: AssessmentReportData }) {
  return (
    <Document>
      {/* Page 1: Summary + Category Scores */}
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Security Assessment Report</Text>
            <Text style={styles.headerSubtitle}>{data.organizationName} — {data.sector} Sector</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.confidential}>Confidential</Text>
            <Text style={styles.headerSubtitle}>Assessed: {data.assessmentDate}</Text>
            <Text style={styles.headerSubtitle}>Completed: {data.completedDate}</Text>
          </View>
        </View>

        {/* Overall Score */}
        <View style={styles.scoreBox}>
          <Text style={styles.scoreValue}>{data.overallScore}</Text>
          <View>
            <Text style={styles.scoreTier}>NIST CSF Tier {data.tierRating}/4</Text>
            <Text style={styles.scoreLabel}>
              Overall Security Posture Score (0-100)
            </Text>
          </View>
        </View>

        {/* Executive Summary */}
        <Text style={styles.sectionTitle}>Executive Summary</Text>
        <Text style={styles.summaryText}>{data.executiveSummary}</Text>

        {/* Category Score Breakdown */}
        <Text style={styles.sectionTitle}>Score Breakdown by NIST CSF Category</Text>

        {/* Table header */}
        <View style={[styles.categoryRow, { backgroundColor: '#e8eaf6', borderBottomWidth: 1 }]}>
          <Text style={[styles.categoryName, { fontFamily: 'Helvetica-Bold' }]}>Category</Text>
          <Text style={[styles.categoryScore, { fontFamily: 'Helvetica-Bold' }]}>Score</Text>
          <Text style={[styles.categoryTier, { fontFamily: 'Helvetica-Bold' }]}>Tier</Text>
          <Text style={[styles.categoryQuestions, { fontFamily: 'Helvetica-Bold' }]}>Questions</Text>
          <Text style={[styles.categoryStatus, { fontFamily: 'Helvetica-Bold' }]}>Status</Text>
        </View>

        {data.categoryScores.map((cat) => (
          <View key={cat.category} style={styles.categoryRow}>
            <Text style={styles.categoryName}>{cat.category}</Text>
            <Text style={styles.categoryScore}>{cat.score}/100</Text>
            <Text style={styles.categoryTier}>{cat.tier}/4</Text>
            <Text style={styles.categoryQuestions}>{cat.questionCount} answered</Text>
            <Text style={[styles.categoryStatus, { color: STATUS_COLORS[cat.status] ?? '#333' }]}>
              {statusLabel(cat.status)}
            </Text>
          </View>
        ))}

        <View style={styles.footer}>
          <Text>Generated by EVE Secure — Cybersecurity Advisory Platform</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>

      {/* Page 2: Findings */}
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.sectionTitle}>Critical Findings</Text>

        {data.findings.map((finding) => (
          <View
            key={finding.id}
            style={[styles.findingCard, { borderLeftColor: SEVERITY_COLORS[finding.severity] ?? '#999' }]}
          >
            <View style={styles.findingHeader}>
              <Text style={styles.findingTitle}>{finding.title}</Text>
              <Text style={[styles.findingSeverity, { backgroundColor: SEVERITY_COLORS[finding.severity] ?? '#999' }]}>
                {finding.severity}
              </Text>
            </View>
            <Text style={styles.findingBody}>{finding.description}</Text>
            <Text style={styles.findingTags}>{finding.complianceTags.join(' · ')}</Text>
            <Text style={styles.findingRec}>Recommendation: {finding.recommendation}</Text>
          </View>
        ))}

        <View style={styles.footer}>
          <Text>Generated by EVE Secure — Cybersecurity Advisory Platform</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>

      {/* Page 3: Remediation Plan + Next Steps */}
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.sectionTitle}>Remediation Plan</Text>

        {/* Table header */}
        <View style={[styles.remRow, { backgroundColor: '#e8eaf6', borderBottomWidth: 1 }]}>
          <Text style={[styles.remRank, { fontFamily: 'Helvetica-Bold' }]}>#</Text>
          <Text style={[styles.remTitle, { fontFamily: 'Helvetica-Bold' }]}>Action Item</Text>
          <Text style={[styles.remCost, { fontFamily: 'Helvetica-Bold' }]}>Est. Cost</Text>
          <Text style={[styles.remTime, { fontFamily: 'Helvetica-Bold' }]}>Timeline</Text>
          <Text style={[styles.remDifficulty, { fontFamily: 'Helvetica-Bold' }]}>Difficulty</Text>
          <Text style={[styles.remTags, { fontFamily: 'Helvetica-Bold' }]}>Compliance</Text>
        </View>

        {data.remediationPlan.map((item) => (
          <View key={item.rank} style={styles.remRow}>
            <Text style={styles.remRank}>{item.rank}</Text>
            <Text style={styles.remTitle}>{item.title}</Text>
            <Text style={styles.remCost}>{formatCurrency(item.estimatedCost)}</Text>
            <Text style={styles.remTime}>{item.timeToImplement}</Text>
            <Text style={styles.remDifficulty}>{item.difficulty}</Text>
            <Text style={styles.remTags}>{item.complianceTags.slice(0, 2).join(', ')}</Text>
          </View>
        ))}

        {/* Next Steps */}
        <Text style={styles.sectionTitle}>Recommended Next Steps</Text>
        {data.nextSteps.map((step, idx) => (
          <View key={idx} style={styles.nextStepItem}>
            <Text style={styles.nextStepBullet}>{idx + 1}.</Text>
            <Text style={styles.nextStepText}>{step}</Text>
          </View>
        ))}

        {/* Disclaimer */}
        <View style={{ marginTop: 20, padding: 8, backgroundColor: '#f5f5f5', borderRadius: 4 }}>
          <Text style={{ fontSize: 7, color: '#666', lineHeight: 1.4 }}>
            This report is advisory only. It is not a substitute for a formal security audit,
            penetration test, or legal compliance review. Consult licensed professionals for
            definitive guidance. EVE Secure provides risk-aware recommendations based on industry
            frameworks (NIST CSF 2.0) and does not guarantee protection against security incidents.
          </Text>
        </View>

        <View style={styles.footer}>
          <Text>Generated by EVE Secure — Cybersecurity Advisory Platform</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
