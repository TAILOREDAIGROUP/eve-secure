import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

/**
 * Cost of Inaction Brief — Executive PDF Template
 *
 * One-page executive summary showing:
 * - Top 3 security gaps
 * - Financial exposure (breach cost, penalties, downtime)
 * - Regulatory penalties
 * - Insurance implications
 * - Sign-off line
 */

export interface COIBriefData {
  organizationName: string;
  sector: string;
  assessmentDate: string;
  tierRating: number;
  topGaps: Array<{
    rank: number;
    title: string;
    description: string;
    complianceTags: string[];
    estimatedCost: number;
  }>;
  financialExposure: {
    estimatedBreachCost: number;
    regulatoryPenalties: number;
    businessDowntimeCost: number;
    reputationDamage: number;
    totalAnnualExposure: number;
  };
  insuranceImpact: string;
  llmExecutiveSummary: string;
  generatedBy: 'llm' | 'template';
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#1a1a2e',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: '#0f3460',
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#0f3460',
  },
  headerSubtitle: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
  },
  headerRight: {
    textAlign: 'right',
  },
  confidentialBadge: {
    fontSize: 8,
    color: '#c62828',
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#0f3460',
    marginTop: 12,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  executiveSummary: {
    fontSize: 10,
    lineHeight: 1.5,
    marginBottom: 10,
    color: '#333',
  },
  gapRow: {
    flexDirection: 'row',
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e0e0e0',
  },
  gapRank: {
    width: 24,
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#c62828',
  },
  gapContent: {
    flex: 1,
  },
  gapTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  gapDescription: {
    fontSize: 8,
    color: '#555',
    marginBottom: 2,
  },
  gapTags: {
    fontSize: 7,
    color: '#0f3460',
    fontFamily: 'Helvetica-Oblique',
  },
  gapCost: {
    width: 70,
    textAlign: 'right',
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#c62828',
  },
  financialTable: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  financialRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#e0e0e0',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  financialRowHighlight: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: '#fce4ec',
  },
  financialLabel: {
    flex: 1,
    fontSize: 9,
  },
  financialValue: {
    width: 100,
    textAlign: 'right',
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
  },
  financialTotal: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#c62828',
  },
  insuranceBox: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#fff3e0',
    borderLeftWidth: 3,
    borderLeftColor: '#e65100',
  },
  insuranceText: {
    fontSize: 9,
    color: '#333',
    lineHeight: 1.4,
  },
  signoffSection: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#ccc',
  },
  signoffText: {
    fontSize: 8,
    color: '#666',
    marginBottom: 20,
  },
  signoffLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  signoffField: {
    width: '45%',
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 4,
  },
  signoffLabel: {
    fontSize: 8,
    color: '#666',
  },
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
});

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function COIBriefDocument({ data }: { data: COIBriefData }) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Cost of Inaction Brief</Text>
            <Text style={styles.headerSubtitle}>{data.organizationName} — {data.sector} Sector</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.confidentialBadge}>Confidential</Text>
            <Text style={styles.headerSubtitle}>Assessment Date: {data.assessmentDate}</Text>
            <Text style={styles.headerSubtitle}>Current Tier: {data.tierRating}/4 (NIST CSF)</Text>
          </View>
        </View>

        {/* Executive Summary */}
        <Text style={styles.sectionTitle}>Executive Summary</Text>
        <Text style={styles.executiveSummary}>{data.llmExecutiveSummary}</Text>

        {/* Top 3 Gaps */}
        <Text style={styles.sectionTitle}>Critical Security Gaps</Text>
        {data.topGaps.map((gap) => (
          <View key={gap.rank} style={styles.gapRow}>
            <Text style={styles.gapRank}>{gap.rank}</Text>
            <View style={styles.gapContent}>
              <Text style={styles.gapTitle}>{gap.title}</Text>
              <Text style={styles.gapDescription}>{gap.description}</Text>
              <Text style={styles.gapTags}>{gap.complianceTags.join(' · ')}</Text>
            </View>
            <Text style={styles.gapCost}>{formatCurrency(gap.estimatedCost)}</Text>
          </View>
        ))}

        {/* Financial Exposure */}
        <Text style={styles.sectionTitle}>Estimated Financial Exposure (Annual)</Text>
        <View style={styles.financialTable}>
          <View style={styles.financialRow}>
            <Text style={styles.financialLabel}>Estimated Breach Cost (avg. for {data.sector})</Text>
            <Text style={styles.financialValue}>{formatCurrency(data.financialExposure.estimatedBreachCost)}</Text>
          </View>
          <View style={styles.financialRow}>
            <Text style={styles.financialLabel}>Regulatory Penalties (non-compliance fines)</Text>
            <Text style={styles.financialValue}>{formatCurrency(data.financialExposure.regulatoryPenalties)}</Text>
          </View>
          <View style={styles.financialRow}>
            <Text style={styles.financialLabel}>Business Downtime Cost (operational disruption)</Text>
            <Text style={styles.financialValue}>{formatCurrency(data.financialExposure.businessDowntimeCost)}</Text>
          </View>
          <View style={styles.financialRow}>
            <Text style={styles.financialLabel}>Reputation & Client Loss Impact</Text>
            <Text style={styles.financialValue}>{formatCurrency(data.financialExposure.reputationDamage)}</Text>
          </View>
          <View style={styles.financialRowHighlight}>
            <Text style={[styles.financialLabel, styles.financialTotal]}>Total Annual Exposure</Text>
            <Text style={[styles.financialValue, styles.financialTotal]}>
              {formatCurrency(data.financialExposure.totalAnnualExposure)}
            </Text>
          </View>
        </View>

        {/* Insurance Impact */}
        <Text style={styles.sectionTitle}>Insurance Implications</Text>
        <View style={styles.insuranceBox}>
          <Text style={styles.insuranceText}>{data.insuranceImpact}</Text>
        </View>

        {/* Sign-off */}
        <View style={styles.signoffSection}>
          <Text style={styles.signoffText}>
            I acknowledge receipt and review of this Cost of Inaction Brief. I understand the identified
            security gaps and their potential financial impact on the organization.
          </Text>
          <View style={styles.signoffLine}>
            <View style={styles.signoffField}>
              <Text style={styles.signoffLabel}>Signature / Name / Title</Text>
            </View>
            <View style={styles.signoffField}>
              <Text style={styles.signoffLabel}>Date</Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>Generated by EVE Secure — Cybersecurity Advisory Platform</Text>
          <Text>This document is advisory only. Consult licensed professionals for definitive guidance.</Text>
        </View>
      </Page>
    </Document>
  );
}
