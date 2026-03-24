/**
 * Sector-specific prompt generation for EVE Secure
 * Ensures recommendations are scaled to org size, revenue, and industry context
 */

import type { OrgProfile } from "@/types";

/**
 * Generate sector-specific system prompt overlay based on org profile
 * Appends budget guardrails and sector-appropriate language to every prompt
 */
export function getSectorPrompt(sector: string, orgProfile: OrgProfile): string {
  const baseScaling = getScalingDirective(orgProfile);
  const sectorBlock = getSectorBlock(sector, orgProfile);

  return `${sectorBlock}

${baseScaling}

CLIENT CONTEXT: ${sector} org, ${orgProfile.employees} employees, $${formatRevenue(orgProfile.annualRevenue)} revenue`;
}

/**
 * Universal scaling directive — included in EVERY sector prompt
 */
function getScalingDirective(orgProfile: OrgProfile): string {
  return `## Organization Scaling Requirements

Scale all recommendations to an organization of ${orgProfile.employees} employees with approximately $${formatRevenue(orgProfile.annualRevenue)} annual revenue. Do not recommend solutions costing more than 15% of annual revenue.

Maximum single-recommendation budget: $${formatRevenue(orgProfile.annualRevenue * 0.15)}
Organization size class: ${getSizeClass(orgProfile.employees)}
Budget sensitivity: ${orgProfile.annualRevenue < 5_000_000 ? "HIGH — every dollar counts" : orgProfile.annualRevenue < 50_000_000 ? "MODERATE — justify ROI clearly" : "STANDARD — focus on effectiveness"}`;
}

/**
 * Sector-specific prompt block
 */
function getSectorBlock(sector: string, orgProfile: OrgProfile): string {
  const normalized = sector.toLowerCase().trim();

  if (normalized === "healthcare" || orgProfile.industryCompliance?.some(c => c.toLowerCase().includes("hipaa"))) {
    return getHealthcarePrompt(orgProfile);
  }

  if (normalized === "legal" || normalized === "law" || normalized === "law firm") {
    return getLegalPrompt(orgProfile);
  }

  // Financial, technology, manufacturing, retail, energy, government, education, other
  return getGeneralPrompt(orgProfile, normalized);
}

/**
 * Healthcare sector prompt — HIPAA, PHI, breach notification, clinical workflows
 */
function getHealthcarePrompt(orgProfile: OrgProfile): string {
  return `## Sector Context: Healthcare

This client operates in the healthcare sector and is subject to HIPAA regulations.

### Regulatory Framework
- **HIPAA Privacy Rule**: PHI handling, minimum necessary standard, patient rights
- **HIPAA Security Rule**: Administrative, physical, and technical safeguards
- **HITECH Act**: Breach notification requirements (60-day notification to HHS for 500+ records)
- **State breach notification**: Varies by state (client is in ${orgProfile.headquartersState})

### Clinical Language Requirements
- Frame security controls in terms of **patient safety** and **care continuity**
- Reference EHR/EMR systems${orgProfile.dataHandlingCategory === 'phi' ? " — this org handles PHI directly" : ""}
- Business Associate Agreements (BAAs) for all vendors touching PHI
- Emphasize audit trail requirements for clinical access

### HHS Enforcement Context
- HHS OCR enforcement actions average $1.5M–$2M for willful neglect
- Corrective Action Plans (CAPs) typically span 2–3 years
- Right of Access enforcement is currently aggressive

### Priority Framing
- Patient safety > compliance > efficiency
- Breach notification timeline: 60 days to individuals, 60 days to HHS (500+ records)
- State AG notification requirements vary`;
}

/**
 * Legal sector prompt — ABA ethics, privilege, client confidentiality
 */
function getLegalPrompt(orgProfile: OrgProfile): string {
  return `## Sector Context: Legal / Law Firm

This client is a law firm or legal services organization.

### Ethical Framework
- **ABA Model Rules of Professional Conduct**: Rule 1.6 (Confidentiality), Rule 1.1 (Competence includes tech competence)
- **State bar requirements**: Client is in ${orgProfile.headquartersState} — check state-specific ethics opinions on cybersecurity
- **Attorney-client privilege**: Security controls must protect privileged communications
- **Work product doctrine**: Litigation materials require enhanced protection

### Client Confidentiality Requirements
- ALL client data is confidential by default — not just "sensitive" data
- Document Management Systems (DMS) are critical infrastructure
- Email encryption is not optional for client communications
- Mobile device management for attorneys with client data

### Regulatory Posture
- Law firms are increasingly targeted by sophisticated threat actors (nation-state, organized crime)
- Malpractice insurers are requiring baseline cyber hygiene
- Client security questionnaires are now standard for large engagements
- State bar disciplinary proceedings for data breaches are increasing

### Priority Framing
- Client confidentiality > business continuity > efficiency
- Privilege preservation during incident response is critical
- Chain of custody for digital evidence
- Conflict-of-interest screening systems need protection`;
}

/**
 * General sector prompt — business continuity, cyber insurance, cost-benefit, plain language
 */
function getGeneralPrompt(orgProfile: OrgProfile, sector: string): string {
  const sectorLabel = sector.charAt(0).toUpperCase() + sector.slice(1);

  return `## Sector Context: ${sectorLabel || "General Business"}

This client is a ${sectorLabel || "general business"} organization.

### Business Focus
- Frame all recommendations in terms of **business continuity** and **financial impact**
- Use plain business language — avoid jargon unless the client's compliance requirements demand it
- Every recommendation needs a clear **cost-benefit analysis**
- Prioritize recommendations by **ROI** and **risk reduction**

### Cyber Insurance Context
${orgProfile.dataHandlingCategory !== 'none' ? `- This organization handles ${orgProfile.dataHandlingCategory?.toUpperCase()} data — insurability depends on baseline controls` : "- Standard commercial data handling"}
- Cyber insurance carriers increasingly require: MFA, EDR, backup testing, incident response plan
- Premium reductions available for demonstrable security posture improvements
- First-party vs. third-party coverage distinctions matter for recommendations

### Cost-Benefit Framework
- Total Cost of Ownership (TCO) over 3 years, not just license cost
- Include implementation labor, training, and ongoing management
- Compare against risk reduction (annualized loss expectancy)
- Identify "good enough" solutions — don't gold-plate for ${orgProfile.employees < 50 ? "a small" : orgProfile.employees < 200 ? "a mid-size" : "a large"} organization

### Compliance Context
${orgProfile.industryCompliance?.length > 0 ? `- Active compliance requirements: ${orgProfile.industryCompliance.join(", ")}` : "- No specific regulatory compliance requirements identified"}
- Focus on frameworks that provide business value, not just checkbox compliance`;
}

/**
 * Classify organization size
 */
function getSizeClass(employees: number): string {
  if (employees <= 10) return "micro (1-10)";
  if (employees <= 50) return "small (11-50)";
  if (employees <= 200) return "mid-market (51-200)";
  if (employees <= 1000) return "upper mid-market (201-1000)";
  return "enterprise (1000+)";
}

/**
 * Format revenue for display (e.g., 1000000 → "1M", 500000 → "500K")
 */
function formatRevenue(amount: number): string {
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}K`;
  return amount.toFixed(0);
}

// Export helpers for testing
export { formatRevenue, getSizeClass, getScalingDirective };
