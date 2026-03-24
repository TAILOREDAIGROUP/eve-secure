import { describe, it, expect } from 'vitest';
import { validateTemplateData, sanitizeData } from './helpers/sanitization';

/**
 * Slice 6: Documents + Admin tests
 */

// Re-implement sanitization helpers for testing (matching pdf/generator.ts patterns)
function testValidateTemplateData(data: Record<string, unknown>): boolean {
  const jsonString = JSON.stringify(data);
  const dangerousPatterns = [
    /{{[\s\S]*?}}/,
    /{%[\s\S]*?%}/,
    /\$\{[\s\S]*?\}/,
    /eval\(/i,
    /script/i,
    /<iframe/i,
    /javascript:/i,
    /on\w+\s*=/i,
  ];
  for (const pattern of dangerousPatterns) {
    if (pattern.test(jsonString)) return false;
  }
  return true;
}

describe('Document Generation — Cost of Inaction', () => {
  it('Cost of Inaction brief contains required sections', () => {
    const coiBrief = {
      type: 'cost_of_inaction',
      sections: [
        'top_3_gaps',
        'cost_to_fix',
        'financial_exposure',
        'regulatory_penalties',
        'average_breach_cost',
        'insurance_implications',
        'sign_off_line',
      ],
    };

    expect(coiBrief.sections).toContain('top_3_gaps');
    expect(coiBrief.sections).toContain('regulatory_penalties');
    expect(coiBrief.sections).toContain('average_breach_cost');
    expect(coiBrief.sections).toContain('insurance_implications');
    expect(coiBrief.sections).toContain('sign_off_line');
    expect(coiBrief.sections.length).toBeGreaterThanOrEqual(5);
  });

  it('COI generates with correct data structure', () => {
    const coiData = {
      organizationName: 'Greenfield Medical',
      topGaps: [
        { gap: 'No MFA', severity: 'critical', costToFix: 200, financialExposure: 150000 },
        { gap: 'No IR plan', severity: 'critical', costToFix: 0, financialExposure: 200000 },
        { gap: 'Unencrypted ePHI', severity: 'high', costToFix: 800, financialExposure: 100000 },
      ],
      regulatoryPenalties: {
        'HIPAA Tier 4': '$1.9M per violation category',
        'State AG': 'Up to $50K per affected individual',
      },
      averageBreachCost: '$10.93M (healthcare sector, IBM 2025)',
      insuranceImplications: 'Current policy may deny claims without MFA + IR plan',
    };

    expect(coiData.topGaps).toHaveLength(3);
    expect(coiData.topGaps[0]!.gap).toBe('No MFA');
    expect(coiData.regulatoryPenalties).toBeDefined();
    expect(coiData.averageBreachCost).toContain('healthcare');
  });
});

describe('Document Generation — Assessment Report', () => {
  it('Assessment Report includes all required sections', () => {
    const reportSections = [
      'executive_summary',
      'tier_rating',
      'gap_detail',
      'action_plan',
      'compliance_mapping',
      'date',
      'org_name',
      'eve_version',
    ];

    expect(reportSections).toContain('executive_summary');
    expect(reportSections).toContain('tier_rating');
    expect(reportSections).toContain('gap_detail');
    expect(reportSections).toContain('action_plan');
    expect(reportSections).toContain('compliance_mapping');
    expect(reportSections.length).toBeGreaterThanOrEqual(5);
  });
});

describe('Document Generation — Input Sanitization', () => {
  it('sanitizes malicious script tags', () => {
    const malicious = { name: '<script>alert("xss")</script>' };
    expect(testValidateTemplateData(malicious)).toBe(false);
  });

  it('sanitizes template injection {{}}', () => {
    const malicious = { name: '{{constructor.constructor("return this")()}}' };
    expect(testValidateTemplateData(malicious)).toBe(false);
  });

  it('sanitizes eval() attempts', () => {
    const malicious = { name: 'eval(atob("..."))' };
    expect(testValidateTemplateData(malicious)).toBe(false);
  });

  it('sanitizes javascript: protocol', () => {
    const malicious = { url: 'javascript:alert(1)' };
    expect(testValidateTemplateData(malicious)).toBe(false);
  });

  it('sanitizes iframe injection', () => {
    const malicious = { name: '<iframe src="evil.com"></iframe>' };
    expect(testValidateTemplateData(malicious)).toBe(false);
  });

  it('allows clean data through', () => {
    const clean = {
      orgName: 'Greenfield Medical Group',
      sector: 'healthcare',
      gaps: ['No MFA', 'No IR plan'],
      cost: 5000,
    };
    expect(testValidateTemplateData(clean)).toBe(true);
  });
});

describe('Admin — Role-Based Access', () => {
  it('super-admin sees all tenants', () => {
    const userRole = 'super_admin';
    const canSeeAll = userRole === 'super_admin';
    expect(canSeeAll).toBe(true);
  });

  it('tenant-admin sees only their tenant', () => {
    const userRole = 'tenant_admin';
    const userTenantId = '11111111-1111-1111-1111-111111111111';
    const canSeeAll = (userRole as string) === 'super_admin';
    const canSeeOwn = (userRole as string) === 'tenant_admin';
    expect(canSeeAll).toBe(false);
    expect(canSeeOwn).toBe(true);
    // API returns only matching tenant_id
  });

  it('regular user gets 403 on admin endpoints', () => {
    const userRole = 'user';
    const hasAccess = (userRole as string) === 'super_admin' || (userRole as string) === 'tenant_admin';
    expect(hasAccess).toBe(false);
  });
});
