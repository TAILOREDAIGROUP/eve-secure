/**
 * EVE Secure — Multi-Corpus Knowledge Base Ingestion Script
 *
 * Reads all knowledge corpora (HIPAA, Legal, Threats, Insurance, Compliance Matrix),
 * generates embeddings via Supabase Automatic Embeddings (gte-small),
 * loads compliance matrix (A6) into SQL table,
 * calculates SHA-256 hashes for integrity checking (A7).
 *
 * Idempotent: safe to re-run. Uses content hashes to skip unchanged documents.
 *
 * Note: If Supabase Automatic Embeddings triggers are enabled on the
 * knowledge_documents table, embeddings will be auto-generated on INSERT/UPDATE.
 * The --skip-embeddings flag relies on this behavior.
 *
 * Usage:
 *   npx tsx scripts/ingest-all-knowledge.ts
 *   npx tsx scripts/ingest-all-knowledge.ts --dry-run
 *   npx tsx scripts/ingest-all-knowledge.ts --force
 *   npx tsx scripts/ingest-all-knowledge.ts --skip-embeddings
 *   npx tsx scripts/ingest-all-knowledge.ts --corpus hipaa,legal
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { generateEmbedding } from '../src/lib/ai/embeddings/supabase-embeddings';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const KNOWLEDGE_DIR = path.resolve(__dirname, '..', 'knowledge');
const BATCH_SIZE = 20;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KnowledgeDocument {
  id: string;
  category: 'hipaa' | 'legal' | 'threats' | 'insurance';
  subcategory: string;
  title: string;
  content: string;
  content_hash: string;
  source_reference: string;
  metadata: Record<string, unknown>;
}

interface ComplianceMatrixEntry {
  state: string;
  state_name: string;
  statute: string;
  breach_notification_timeline_days: number;
  ag_notification_required: boolean;
  ag_notification_details: string;
  content_requirements: string[];
  hipaa_applies: boolean;
  aba_applies: boolean;
  encrypted_data_exemption: boolean;
  private_right_of_action: boolean;
  special_provisions: string;
  penalties: string;
}

interface CrossReferenceEntry {
  nist_subcategory: string;
  nist_description: string;
  hipaa_spec: string;
  hipaa_detail: string;
  aba_rule: string;
  aba_detail: string;
  implementation_priority: string;
  audit_evidence: string[];
}

interface ManifestEntry {
  id: string;
  category: string;
  content_hash: string;
  ingested_at: string;
  status: 'inserted' | 'updated' | 'unchanged' | 'error';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

function log(level: 'info' | 'warn' | 'error' | 'debug', message: string, meta?: unknown): void {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}]`;
  if (meta !== undefined) {
    console.log(`${prefix} ${message}`, meta);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

function readJSON(filePath: string): unknown {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// ---------------------------------------------------------------------------
// Embedding generation — Supabase Automatic Embeddings (gte-small)
// ---------------------------------------------------------------------------

async function generateEmbeddingsSupabase(texts: string[]): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = [];
  for (const text of texts) {
    const embedding = await generateEmbedding(text);
    results.push(embedding);
  }
  return results;
}

async function generateEmbeddingsBatched(texts: string[]): Promise<(number[] | null)[]> {
  const allEmbeddings: (number[] | null)[] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    log(
      'info',
      `Generating embeddings batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(texts.length / BATCH_SIZE)} (${batch.length} texts)`,
    );

    const embeddings = await generateEmbeddingsSupabase(batch);
    allEmbeddings.push(...embeddings);

    if (i + BATCH_SIZE < texts.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return allEmbeddings;
}

// ---------------------------------------------------------------------------
// Corpus Flatteners
// ---------------------------------------------------------------------------

function flattenHIPAA(): KnowledgeDocument[] {
  const corpus = readJSON(path.join(KNOWLEDGE_DIR, 'hipaa', 'corpus.json')) as {
    specifications: Array<{
      id: string;
      title: string;
      cfr_section: string;
      safeguard_type: string;
      nist_mapping: string[];
      required_or_addressable: string;
      description: string;
      implementation_guidance: string;
      breach_notification_relevance: string;
    }>;
    breach_notification: Record<string, unknown>;
  };

  const docs: KnowledgeDocument[] = [];

  for (const spec of corpus.specifications) {
    const content = [
      `HIPAA Security Rule: ${spec.title}`,
      `CFR Section: ${spec.cfr_section}`,
      `Safeguard Type: ${spec.safeguard_type}`,
      `Status: ${spec.required_or_addressable}`,
      `NIST CSF Mapping: ${spec.nist_mapping.join(', ')}`,
      '',
      `Description: ${spec.description}`,
      '',
      `Implementation Guidance: ${spec.implementation_guidance}`,
      '',
      `Breach Notification Relevance: ${spec.breach_notification_relevance}`,
    ].join('\n');

    docs.push({
      id: spec.id,
      category: 'hipaa',
      subcategory: spec.safeguard_type.toLowerCase(),
      title: spec.title,
      content,
      content_hash: sha256(content),
      source_reference: spec.cfr_section,
      metadata: {
        nist_mapping: spec.nist_mapping,
        required_or_addressable: spec.required_or_addressable,
        safeguard_type: spec.safeguard_type,
      },
    });
  }

  if (corpus.breach_notification) {
    const bnContent = JSON.stringify(corpus.breach_notification, null, 2);
    const content = `HIPAA Breach Notification Requirements\n\n${bnContent}`;
    docs.push({
      id: 'HIPAA-BN-001',
      category: 'hipaa',
      subcategory: 'breach_notification',
      title: 'HIPAA Breach Notification Rule (45 CFR §164.404-408)',
      content,
      content_hash: sha256(content),
      source_reference: '45 CFR §164.404-408',
      metadata: { type: 'breach_notification' },
    });
  }

  return docs;
}

function flattenLegal(): KnowledgeDocument[] {
  const corpus = readJSON(path.join(KNOWLEDGE_DIR, 'legal', 'corpus.json')) as {
    aba_rules: Array<{
      id: string;
      rule_or_opinion: string;
      jurisdiction: string;
      full_text: string;
      cybersecurity_implications: string;
      nist_mapping: string[];
    }>;
    state_bar_opinions: Array<{
      id: string;
      rule_or_opinion: string;
      jurisdiction: string;
      full_text: string;
      cybersecurity_implications: string;
      nist_mapping: string[];
    }>;
  };

  const docs: KnowledgeDocument[] = [];

  for (const rule of corpus.aba_rules) {
    const content = [
      `ABA Model Rule: ${rule.rule_or_opinion}`,
      `Jurisdiction: ${rule.jurisdiction}`,
      `NIST CSF Mapping: ${rule.nist_mapping.join(', ')}`,
      '',
      `Rule Text: ${rule.full_text}`,
      '',
      `Cybersecurity Implications: ${rule.cybersecurity_implications}`,
    ].join('\n');

    docs.push({
      id: rule.id,
      category: 'legal',
      subcategory: 'aba_rule',
      title: rule.rule_or_opinion,
      content,
      content_hash: sha256(content),
      source_reference: rule.rule_or_opinion,
      metadata: { nist_mapping: rule.nist_mapping, jurisdiction: rule.jurisdiction },
    });
  }

  for (const opinion of corpus.state_bar_opinions) {
    const content = [
      `State Bar Ethics Opinion: ${opinion.rule_or_opinion}`,
      `Jurisdiction: ${opinion.jurisdiction}`,
      `NIST CSF Mapping: ${opinion.nist_mapping.join(', ')}`,
      '',
      `Opinion Summary: ${opinion.full_text}`,
      '',
      `Cybersecurity Implications: ${opinion.cybersecurity_implications}`,
    ].join('\n');

    docs.push({
      id: opinion.id,
      category: 'legal',
      subcategory: 'state_bar_opinion',
      title: opinion.rule_or_opinion,
      content,
      content_hash: sha256(content),
      source_reference: opinion.rule_or_opinion,
      metadata: { nist_mapping: opinion.nist_mapping, jurisdiction: opinion.jurisdiction },
    });
  }

  return docs;
}

function flattenThreats(): KnowledgeDocument[] {
  const corpus = readJSON(path.join(KNOWLEDGE_DIR, 'threats', 'corpus.json')) as {
    attack_chains: Array<{
      id: string;
      threat_type: string;
      sector_relevance: string[];
      attack_chain: string;
      indicators: string[];
      business_impact: string;
      defensive_measures: string[];
      source: string;
    }>;
    social_engineering: Array<{
      id: string;
      threat_type: string;
      sector_relevance: string[];
      attack_chain: string;
      indicators: string[];
      business_impact: string;
      defensive_measures: string[];
      source: string;
    }>;
    sector_threats: {
      healthcare: Array<{
        id: string;
        threat_type: string;
        sector_relevance: string[];
        attack_chain: string;
        indicators: string[];
        business_impact: string;
        defensive_measures: string[];
        source: string;
      }>;
      legal: Array<{
        id: string;
        threat_type: string;
        sector_relevance: string[];
        attack_chain: string;
        indicators: string[];
        business_impact: string;
        defensive_measures: string[];
        source: string;
      }>;
    };
  };

  const docs: KnowledgeDocument[] = [];

  const allThreats = [
    ...corpus.attack_chains,
    ...corpus.social_engineering,
    ...corpus.sector_threats.healthcare,
    ...corpus.sector_threats.legal,
  ];

  for (const threat of allThreats) {
    const content = [
      `Threat: ${threat.threat_type}`,
      `Sectors: ${threat.sector_relevance.join(', ')}`,
      `Source: ${threat.source}`,
      '',
      `Attack Chain: ${threat.attack_chain}`,
      '',
      `Indicators: ${threat.indicators.join('; ')}`,
      '',
      `Business Impact: ${threat.business_impact}`,
      '',
      `Defensive Measures: ${threat.defensive_measures.join('; ')}`,
    ].join('\n');

    docs.push({
      id: threat.id,
      category: 'threats',
      subcategory: threat.sector_relevance.includes('healthcare')
        ? 'healthcare'
        : threat.sector_relevance.includes('legal')
          ? 'legal'
          : 'general',
      title: threat.threat_type,
      content,
      content_hash: sha256(content),
      source_reference: threat.source,
      metadata: {
        sector_relevance: threat.sector_relevance,
        indicators: threat.indicators,
        defensive_measures: threat.defensive_measures,
      },
    });
  }

  return docs;
}

function flattenInsurance(): KnowledgeDocument[] {
  const corpus = readJSON(path.join(KNOWLEDGE_DIR, 'insurance', 'corpus.json')) as {
    requirements: Array<{
      id: string;
      requirement: string;
      nist_mapping: string;
      implementation_action: string;
      documentation_needed: string;
      common_exclusions: string[];
      carrier_notes: string;
    }>;
    common_exclusions: Array<{
      id: string;
      exclusion: string;
      description: string;
      risk_mitigation: string;
      affected_nist_controls: string[];
    }>;
  };

  const docs: KnowledgeDocument[] = [];

  for (const req of corpus.requirements) {
    const content = [
      `Insurance Requirement: ${req.requirement}`,
      `NIST CSF Mapping: ${req.nist_mapping}`,
      '',
      `Implementation Action: ${req.implementation_action}`,
      '',
      `Documentation Needed: ${req.documentation_needed}`,
      '',
      `Common Exclusions: ${req.common_exclusions.join('; ')}`,
      '',
      `Carrier Notes: ${req.carrier_notes}`,
    ].join('\n');

    docs.push({
      id: req.id,
      category: 'insurance',
      subcategory: 'requirement',
      title: req.requirement,
      content,
      content_hash: sha256(content),
      source_reference: `NIST ${req.nist_mapping}`,
      metadata: {
        nist_mapping: req.nist_mapping,
        common_exclusions: req.common_exclusions,
      },
    });
  }

  for (const exc of corpus.common_exclusions) {
    const content = [
      `Insurance Exclusion: ${exc.exclusion}`,
      `Affected NIST Controls: ${exc.affected_nist_controls.join(', ')}`,
      '',
      `Description: ${exc.description}`,
      '',
      `Risk Mitigation: ${exc.risk_mitigation}`,
    ].join('\n');

    docs.push({
      id: exc.id,
      category: 'insurance',
      subcategory: 'exclusion',
      title: exc.exclusion,
      content,
      content_hash: sha256(content),
      source_reference: 'Industry carrier requirements',
      metadata: { affected_nist_controls: exc.affected_nist_controls },
    });
  }

  return docs;
}

// ---------------------------------------------------------------------------
// Compliance Matrix Loader (SQL, not embeddings)
// ---------------------------------------------------------------------------

function loadComplianceMatrix(): {
  stateLaws: ComplianceMatrixEntry[];
  crossReferences: CrossReferenceEntry[];
} {
  const matrix = readJSON(
    path.join(KNOWLEDGE_DIR, 'compliance-matrix', 'matrix.json'),
  ) as {
    state_breach_laws: ComplianceMatrixEntry[];
    cross_reference: CrossReferenceEntry[];
  };

  return {
    stateLaws: matrix.state_breach_laws,
    crossReferences: matrix.cross_reference,
  };
}

// ---------------------------------------------------------------------------
// Supabase Operations
// ---------------------------------------------------------------------------

async function fetchExistingHashes(
  supabase: ReturnType<typeof createClient>,
  category: string,
): Promise<Map<string, string>> {
  const hashMap = new Map<string, string>();

  const { data, error } = await supabase
    .from('knowledge_documents')
    .select('id, hash')
    .eq('category', category);

  if (error) {
    log('warn', `Could not fetch existing hashes for ${category}`, error.message);
    return hashMap;
  }

  for (const row of data ?? []) {
    hashMap.set(row.id, row.hash);
  }

  return hashMap;
}

async function upsertKnowledgeDocuments(
  supabase: ReturnType<typeof createClient>,
  documents: KnowledgeDocument[],
  embeddings: (number[] | null)[] | null,
  existingHashes: Map<string, string>,
): Promise<ManifestEntry[]> {
  const manifest: ManifestEntry[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i]!;
    const embedding = embeddings ? embeddings[i] : null;

    try {
      const record: Record<string, unknown> = {
        category: doc.category,
        subcategory: doc.subcategory,
        title: doc.title,
        content: doc.content,
        hash: doc.content_hash,
        source_reference: doc.source_reference,
        metadata: doc.metadata,
        updated_at: now,
      };

      // Include embedding if available; otherwise rely on Supabase
      // Automatic Embeddings trigger to populate it on INSERT/UPDATE
      if (embedding) {
        record.embedding = embedding;
      }

      const { error } = await supabase
        .from('knowledge_documents')
        .upsert(
          { id: doc.id, ...record },
          { onConflict: 'id' },
        );

      if (error) {
        log('error', `Failed to upsert ${doc.id}: ${error.message}`);
        manifest.push({ id: doc.id, category: doc.category, content_hash: doc.content_hash, ingested_at: now, status: 'error' });
      } else {
        manifest.push({
          id: doc.id,
          category: doc.category,
          content_hash: doc.content_hash,
          ingested_at: now,
          status: existingHashes.has(doc.id) ? 'updated' : 'inserted',
        });
      }
    } catch (err) {
      log('error', `Exception upserting ${doc.id}`, err);
      manifest.push({ id: doc.id, category: doc.category, content_hash: doc.content_hash, ingested_at: now, status: 'error' });
    }
  }

  return manifest;
}

async function upsertComplianceMatrix(
  supabase: ReturnType<typeof createClient>,
  stateLaws: ComplianceMatrixEntry[],
  crossReferences: CrossReferenceEntry[],
): Promise<{ states: number; crossRefs: number; errors: number }> {
  let errors = 0;

  for (const law of stateLaws) {
    const { error } = await supabase
      .from('compliance_matrix')
      .upsert(
        {
          state: law.state,
          breach_notification_timeline: `${law.breach_notification_timeline_days} days`,
          breach_notification_recipients: law.ag_notification_details,
          hipaa_spec: law.statute,
          metadata: {
            state_name: law.state_name,
            ag_notification_required: law.ag_notification_required,
            content_requirements: law.content_requirements,
            hipaa_applies: law.hipaa_applies,
            aba_applies: law.aba_applies,
            encrypted_data_exemption: law.encrypted_data_exemption,
            private_right_of_action: law.private_right_of_action,
            special_provisions: law.special_provisions,
            penalties: law.penalties,
          },
        },
        { onConflict: 'id' },
      );

    if (error) {
      log('error', `Failed to upsert state law for ${law.state}: ${error.message}`);
      errors++;
    }
  }

  for (const ref of crossReferences) {
    const { error } = await supabase
      .from('compliance_matrix')
      .upsert(
        {
          nist_subcategory_id: ref.nist_subcategory,
          hipaa_spec: ref.hipaa_spec,
          aba_rule: ref.aba_rule,
          metadata: {
            nist_description: ref.nist_description,
            hipaa_detail: ref.hipaa_detail,
            aba_detail: ref.aba_detail,
            implementation_priority: ref.implementation_priority,
            audit_evidence: ref.audit_evidence,
          },
        },
        { onConflict: 'id' },
      );

    if (error) {
      log('error', `Failed to upsert cross-reference ${ref.nist_subcategory}: ${error.message}`);
      errors++;
    }
  }

  return { states: stateLaws.length, crossRefs: crossReferences.length, errors };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isForce = args.includes('--force');
  const skipEmbeddings = args.includes('--skip-embeddings');
  const corpusFilter = args.find((a) => a.startsWith('--corpus='))?.split('=')[1]?.split(',');

  log('info', '=== EVE Secure — Multi-Corpus Knowledge Ingestion ===');
  log('info', `Embedding provider: Supabase Automatic Embeddings (gte-small)`);
  log('info', `Mode: ${isDryRun ? 'DRY RUN' : isForce ? 'FORCE' : 'NORMAL'}`);
  if (corpusFilter) {
    log('info', `Corpus filter: ${corpusFilter.join(', ')}`);
  }

  // --- Step 1: Flatten all corpora ---
  const corpora: { name: string; category: string; documents: KnowledgeDocument[] }[] = [];

  const shouldProcess = (name: string) => !corpusFilter || corpusFilter.includes(name);

  if (shouldProcess('hipaa')) {
    try {
      const docs = flattenHIPAA();
      corpora.push({ name: 'HIPAA Healthcare Pack', category: 'hipaa', documents: docs });
      log('info', `HIPAA: ${docs.length} documents`);
    } catch (err) {
      log('error', 'Failed to flatten HIPAA corpus', err);
    }
  }

  if (shouldProcess('legal')) {
    try {
      const docs = flattenLegal();
      corpora.push({ name: 'Legal Pack', category: 'legal', documents: docs });
      log('info', `Legal: ${docs.length} documents`);
    } catch (err) {
      log('error', 'Failed to flatten Legal corpus', err);
    }
  }

  if (shouldProcess('threats')) {
    try {
      const docs = flattenThreats();
      corpora.push({ name: 'Threat Intelligence', category: 'threats', documents: docs });
      log('info', `Threats: ${docs.length} documents`);
    } catch (err) {
      log('error', 'Failed to flatten Threats corpus', err);
    }
  }

  if (shouldProcess('insurance')) {
    try {
      const docs = flattenInsurance();
      corpora.push({ name: 'Insurance Layer', category: 'insurance', documents: docs });
      log('info', `Insurance: ${docs.length} documents`);
    } catch (err) {
      log('error', 'Failed to flatten Insurance corpus', err);
    }
  }

  const allDocs = corpora.flatMap((c) => c.documents);
  log('info', `Total documents across all corpora: ${allDocs.length}`);

  // --- Step 2: Load compliance matrix ---
  let complianceMatrix: { stateLaws: ComplianceMatrixEntry[]; crossReferences: CrossReferenceEntry[] } | null = null;

  if (shouldProcess('compliance')) {
    try {
      complianceMatrix = loadComplianceMatrix();
      log('info', `Compliance Matrix: ${complianceMatrix.stateLaws.length} state laws, ${complianceMatrix.crossReferences.length} cross-references`);
    } catch (err) {
      log('error', 'Failed to load Compliance Matrix', err);
    }
  }

  if (isDryRun) {
    log('info', '--- Dry Run Summary ---');
    for (const c of corpora) {
      log('info', `  ${c.name}: ${c.documents.length} documents`);
      for (const doc of c.documents.slice(0, 2)) {
        log('info', `    ${doc.id} | ${doc.title.substring(0, 60)} | hash: ${doc.content_hash.substring(0, 12)}...`);
      }
      if (c.documents.length > 2) {
        log('info', `    ... and ${c.documents.length - 2} more`);
      }
    }
    if (complianceMatrix) {
      log('info', `  Compliance Matrix: ${complianceMatrix.stateLaws.length} states, ${complianceMatrix.crossReferences.length} cross-refs`);
    }

    writeManifest(
      allDocs.map((doc) => ({
        id: doc.id,
        category: doc.category,
        content_hash: doc.content_hash,
        ingested_at: new Date().toISOString(),
        status: 'unchanged' as const,
      })),
    );

    log('info', 'Dry run complete. No database changes made.');
    return;
  }

  // --- Step 3: Connect to Supabase ---
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    log('error', 'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  log('info', 'Connected to Supabase');

  // --- Step 4: Process each corpus ---
  const fullManifest: ManifestEntry[] = [];

  for (const corpus of corpora) {
    log('info', `\n--- Processing: ${corpus.name} ---`);

    const existingHashes = await fetchExistingHashes(supabase, corpus.category);
    log('info', `Existing documents in ${corpus.category}: ${existingHashes.size}`);

    const toUpsert: KnowledgeDocument[] = [];
    const unchanged: KnowledgeDocument[] = [];

    for (const doc of corpus.documents) {
      const existingHash = existingHashes.get(doc.id);
      if (!isForce && existingHash === doc.content_hash) {
        unchanged.push(doc);
      } else {
        toUpsert.push(doc);
      }
    }

    log('info', `To upsert: ${toUpsert.length}, Unchanged: ${unchanged.length}`);

    if (toUpsert.length === 0) {
      log('info', `${corpus.name} is up to date.`);
      fullManifest.push(
        ...corpus.documents.map((doc) => ({
          id: doc.id,
          category: doc.category,
          content_hash: doc.content_hash,
          ingested_at: new Date().toISOString(),
          status: 'unchanged' as const,
        })),
      );
      continue;
    }

    // Generate embeddings via Supabase
    let embeddings: (number[] | null)[] | null = null;
    if (!skipEmbeddings) {
      try {
        log('info', `Generating Supabase embeddings for ${toUpsert.length} ${corpus.name} documents...`);
        const texts = toUpsert.map((doc) => doc.content);
        embeddings = await generateEmbeddingsBatched(texts);
        const successCount = embeddings.filter((e) => e !== null).length;
        log('info', `Generated ${successCount}/${embeddings.length} embeddings`);
      } catch (err) {
        log('error', `Failed to generate embeddings for ${corpus.name}. Proceeding without.`, err);
      }
    }

    const upsertManifest = await upsertKnowledgeDocuments(supabase, toUpsert, embeddings, existingHashes);
    fullManifest.push(...upsertManifest);

    fullManifest.push(
      ...unchanged.map((doc) => ({
        id: doc.id,
        category: doc.category,
        content_hash: doc.content_hash,
        ingested_at: new Date().toISOString(),
        status: 'unchanged' as const,
      })),
    );
  }

  // --- Step 5: Load compliance matrix (SQL, not embeddings) ---
  if (complianceMatrix) {
    log('info', '\n--- Loading Compliance Matrix (SQL) ---');
    const result = await upsertComplianceMatrix(supabase, complianceMatrix.stateLaws, complianceMatrix.crossReferences);
    log('info', `Compliance Matrix: ${result.states} state laws, ${result.crossRefs} cross-references, ${result.errors} errors`);
  }

  // --- Step 6: Write manifest ---
  writeManifest(fullManifest);

  // --- Step 7: Summary ---
  const inserted = fullManifest.filter((e) => e.status === 'inserted').length;
  const updated = fullManifest.filter((e) => e.status === 'updated').length;
  const unchangedCount = fullManifest.filter((e) => e.status === 'unchanged').length;
  const errors = fullManifest.filter((e) => e.status === 'error').length;

  log('info', '\n=== Ingestion Complete ===');
  log('info', `  Inserted:  ${inserted}`);
  log('info', `  Updated:   ${updated}`);
  log('info', `  Unchanged: ${unchangedCount}`);
  log('info', `  Errors:    ${errors}`);
  log('info', `  Total:     ${fullManifest.length}`);

  const categories = new Set(fullManifest.map((e) => e.category));
  for (const cat of categories) {
    const catEntries = fullManifest.filter((e) => e.category === cat);
    log('info', `  ${cat}: ${catEntries.length} documents`);
  }

  if (errors > 0) {
    process.exit(1);
  }
}

function writeManifest(manifest: ManifestEntry[]): void {
  const manifestPath = path.join(KNOWLEDGE_DIR, 'ingestion-manifest.json');

  const output = {
    generated_at: new Date().toISOString(),
    total_documents: manifest.length,
    summary: {
      inserted: manifest.filter((e) => e.status === 'inserted').length,
      updated: manifest.filter((e) => e.status === 'updated').length,
      unchanged: manifest.filter((e) => e.status === 'unchanged').length,
      errors: manifest.filter((e) => e.status === 'error').length,
    },
    by_category: Object.fromEntries(
      [...new Set(manifest.map((e) => e.category))].map((cat) => [
        cat,
        manifest.filter((e) => e.category === cat).length,
      ]),
    ),
    entries: manifest.sort((a, b) => a.id.localeCompare(b.id)),
  };

  fs.writeFileSync(manifestPath, JSON.stringify(output, null, 2), 'utf-8');
  log('info', `Manifest written to: ${manifestPath}`);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main().catch((err) => {
  log('error', 'Unhandled error during ingestion', err);
  process.exit(1);
});
