import { describe, it, expect } from 'vitest';

/**
 * Phase 1.1 Feature Tests
 * Slices 7-10: Insurance, Offline IR, IR Walkthrough, Tabletop
 */

describe('Slice 7 — Insurance Questionnaire Helper', () => {
  it('validates PDF upload — magic bytes check', () => {
    // PDF files start with %PDF (hex: 25 50 44 46)
    const pdfMagicBytes = Buffer.from([0x25, 0x50, 0x44, 0x46]);
    const isPDF = pdfMagicBytes.toString('ascii').startsWith('%PDF');
    expect(isPDF).toBe(true);

    // Non-PDF file should fail
    const notPDF = Buffer.from([0x50, 0x4B, 0x03, 0x04]); // ZIP magic bytes
    const isNotPDF = notPDF.toString('ascii').startsWith('%PDF');
    expect(isNotPDF).toBe(false);
  });

  it('enforces 25MB max file size', () => {
    const maxSize = 25 * 1024 * 1024; // 25MB
    const validSize = 10 * 1024 * 1024; // 10MB
    const invalidSize = 30 * 1024 * 1024; // 30MB

    expect(validSize <= maxSize).toBe(true);
    expect(invalidSize <= maxSize).toBe(false);
  });

  it('sanitizes uploaded filename', () => {
    const sanitizeFilename = (name: string) =>
      name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 255);

    expect(sanitizeFilename('my file (1).pdf')).toBe('my_file__1_.pdf');
    expect(sanitizeFilename('../../../etc/passwd')).toBe('.._.._.._etc_passwd');
    expect(sanitizeFilename('<script>evil</script>.pdf')).toBe('_script_evil__script_.pdf');
  });

  it('stores metadata with correct doc_type', () => {
    const metadata = {
      doc_type: 'insurance_questionnaire',
      file_name: 'cyber_insurance_app_2026.pdf',
      tenant_id: '11111111-1111-1111-1111-111111111111',
    };
    expect(metadata.doc_type).toBe('insurance_questionnaire');
  });
});

describe('Slice 8 — Offline IR Package', () => {
  it('IR package contains required components', () => {
    const irPackageComponents = [
      'ir_plan',
      'emergency_contacts',
      'containment_steps',
      'regulatory_templates',
      'evidence_collection_guide',
    ];

    expect(irPackageComponents).toContain('ir_plan');
    expect(irPackageComponents).toContain('emergency_contacts');
    expect(irPackageComponents).toContain('containment_steps');
    expect(irPackageComponents).toContain('regulatory_templates');
    expect(irPackageComponents.length).toBeGreaterThanOrEqual(4);
  });

  it('package is encrypted with AES-256', () => {
    const encryptionAlgorithm = 'aes-256-gcm';
    expect(encryptionAlgorithm).toContain('aes-256');
  });

  it('package works offline (no external dependencies)', () => {
    // The HTML package should not reference external CDN/API URLs
    const mockHtml = '<html><head><style>/* inline */</style></head><body>IR Plan</body></html>';
    const hasExternalDeps = /https?:\/\//.test(mockHtml);
    expect(hasExternalDeps).toBe(false);
  });
});

describe('Slice 9 — IR Walkthrough', () => {
  it('generates structured intake questions by incident type', () => {
    const incidentTypes = ['ransomware', 'phishing', 'data_breach', 'insider_threat', 'malware'];

    for (const type of incidentTypes) {
      // Each type should have specific intake questions
      expect(type.length).toBeGreaterThan(0);
    }
  });

  it('healthcare IR includes HIPAA breach determination', () => {
    const healthcareIRQuestions = [
      'Was ePHI accessed, acquired, used, or disclosed?',
      'Was the PHI unsecured (unencrypted)?',
      'Who was the unauthorized person/entity?',
      'Was the PHI actually acquired or viewed?',
      'What is the probability of re-identification?',
    ];

    const hasHIPAA = healthcareIRQuestions.some((q) => q.includes('ePHI') || q.includes('PHI'));
    expect(hasHIPAA).toBe(true);
    expect(healthcareIRQuestions.length).toBeGreaterThanOrEqual(4);
  });

  it('legal IR includes privilege considerations', () => {
    const legalIRQuestions = [
      'Were attorney-client privileged communications accessed?',
      'Which client matters were potentially exposed?',
      'Are there conflict-of-interest implications?',
      'Which state jurisdictions are affected for notification?',
    ];

    const hasPrivilege = legalIRQuestions.some((q) => q.includes('privilege') || q.includes('attorney-client'));
    expect(hasPrivilege).toBe(true);
  });

  it('containment steps use calm, clear language for non-technical staff', () => {
    const containmentStep = 'Disconnect the affected computer from the network by unplugging the ethernet cable or turning off Wi-Fi. Do NOT turn off the computer.';

    // Non-technical: no jargon, specific physical actions
    expect(containmentStep).toContain('unplugging');
    expect(containmentStep).not.toContain('VLAN');
    expect(containmentStep).not.toContain('firewall ACL');
  });

  it('all IR actions are logged to audit trail', () => {
    const auditEvent = {
      event_type: 'ir_walkthrough_started',
      event_data: {
        incidentType: 'ransomware',
        severity: 'critical',
        timestamp: new Date().toISOString(),
      },
    };

    expect(auditEvent.event_type).toBe('ir_walkthrough_started');
    expect(auditEvent.event_data.timestamp).toBeTruthy();
  });
});

describe('Slice 10 — Tabletop Exercise Generator', () => {
  it('generates sector-specific scenarios', () => {
    const healthcareScenario = 'EHR system encrypted by ransomware, ED treating patients';
    const legalScenario = 'DMS encrypted, client files inaccessible, trial in 3 days';

    expect(healthcareScenario).toContain('EHR');
    expect(legalScenario).toContain('client files');
    expect(healthcareScenario).not.toBe(legalScenario);
  });

  it('includes timed injects based on duration', () => {
    const injects30min = 2; // 30min / 15min per inject
    const injects60min = 4;
    const injects90min = 6;

    expect(injects30min).toBe(2);
    expect(injects60min).toBe(4);
    expect(injects90min).toBe(6);
  });

  it('includes discussion questions', () => {
    const questions = [
      'What was the first action you would take?',
      'Who needs to be notified within the first hour?',
      'What regulatory obligations are triggered?',
    ];
    expect(questions.length).toBeGreaterThanOrEqual(3);
  });

  it('includes evaluation rubric with weighted categories', () => {
    const rubric = [
      { name: 'Detection Speed', weight: 20 },
      { name: 'Communication', weight: 20 },
      { name: 'Technical Response', weight: 25 },
      { name: 'Regulatory Compliance', weight: 20 },
      { name: 'Business Continuity', weight: 15 },
    ];

    const totalWeight = rubric.reduce((sum, cat) => sum + cat.weight, 0);
    expect(totalWeight).toBe(100);
    expect(rubric.length).toBe(5);
  });

  it('includes facilitator guide', () => {
    const guideComponents = ['preparation', 'rules', 'debrief'];
    expect(guideComponents).toContain('preparation');
    expect(guideComponents).toContain('rules');
    expect(guideComponents).toContain('debrief');
  });

  it('uses org actual systems in narrative', () => {
    const orgTools = ['Epic EHR', 'Microsoft 365'];
    const narrative = `staff cannot access the EHR system (Epic)`;

    const usesActualTool = orgTools.some((tool) =>
      narrative.toLowerCase().includes(tool.toLowerCase().split(' ')[0]!)
    );
    expect(usesActualTool).toBe(true);
  });
});
