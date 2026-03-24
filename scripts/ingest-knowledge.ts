/**
 * NIST CSF Knowledge Base Ingestion Script
 *
 * Reads corpus.json, flattens subcategories into individual knowledge documents,
 * calculates SHA-256 hashes, and upserts into the knowledge_documents table via Supabase.
 *
 * Supports embedding generation via Voyage AI or OpenAI (controlled by env var).
 *
 * Usage:
 *   npx tsx scripts/ingest-knowledge.ts
 *   npx tsx scripts/ingest-knowledge.ts --dry-run
 *   npx tsx scripts/ingest-knowledge.ts --force
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER ?? 'voyage'; // 'voyage' | 'openai'
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL ??
  (EMBEDDING_PROVIDER === 'voyage' ? 'voyage-law-2' : 'text-embedding-3-small');
const EMBEDDING_DIMENSIONS = parseInt(process.env.EMBEDDING_DIMENSIONS ?? '1024', 10);

const CORPUS_PATH = path.resolve(__dirname, '..', 'knowledge', 'nist-csf', 'corpus.json');
const MANIFEST_PATH = path.resolve(__dirname, '..', 'knowledge', 'nist-csf', 'manifest.json');

const BATCH_SIZE = 20; // Number of documents per embedding API call

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Subcategory {
  id: string;
  description: string;
  implementation_examples: string[];
  informative_references: string[];
}

interface Category {
  id: string;
  name: string;
  description?: string;
  subcategories: Subcategory[];
}

interface CSFFunction {
  id: string;
  name: string;
  description: string;
  categories: Category[];
}

interface Corpus {
  framework: string;
  version: string;
  published?: string;
  source?: string;
  functions: CSFFunction[];
  tiers: Array<{ level: number; name: string; description: string }>;
}

interface KnowledgeDocument {
  id: string;
  framework: string;
  framework_version: string;
  function_id: string;
  function_name: string;
  category_id: string;
  category_name: string;
  subcategory_id: string;
  description: string;
  implementation_examples: string[];
  informative_references: string[];
  content: string;
  content_hash: string;
}

interface ManifestEntry {
  subcategory_id: string;
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

function buildContent(doc: Omit<KnowledgeDocument, 'content' | 'content_hash' | 'id'>): string {
  const parts: string[] = [
    `Framework: ${doc.framework} ${doc.framework_version}`,
    `Function: ${doc.function_id} - ${doc.function_name}`,
    `Category: ${doc.category_id} - ${doc.category_name}`,
    `Subcategory: ${doc.subcategory_id}`,
    `Description: ${doc.description}`,
    '',
    'Implementation Examples:',
    ...doc.implementation_examples.map((ex, i) => `  ${i + 1}. ${ex}`),
    '',
    'Informative References:',
    ...doc.informative_references.map((ref, i) => `  ${i + 1}. ${ref}`),
  ];
  return parts.join('\n');
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

// ---------------------------------------------------------------------------
// Embedding generation
// ---------------------------------------------------------------------------

async function generateEmbeddingsVoyage(texts: string[]): Promise<number[][]> {
  if (!VOYAGE_API_KEY) {
    throw new Error('VOYAGE_API_KEY is required when EMBEDDING_PROVIDER=voyage');
  }

  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
      input_type: 'document',
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Voyage AI API error ${response.status}: ${errorBody}`);
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
    usage: { total_tokens: number };
  };

  log('debug', `Voyage AI usage: ${data.usage.total_tokens} tokens for ${texts.length} texts`);
  return data.data.map((d) => d.embedding);
}

async function generateEmbeddingsOpenAI(texts: string[]): Promise<number[][]> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required when EMBEDDING_PROVIDER=openai');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
    usage: { total_tokens: number };
  };

  log('debug', `OpenAI usage: ${data.usage.total_tokens} tokens for ${texts.length} texts`);
  return data.data.map((d) => d.embedding);
}

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (EMBEDDING_PROVIDER === 'openai') {
    return generateEmbeddingsOpenAI(texts);
  }
  return generateEmbeddingsVoyage(texts);
}

async function generateEmbeddingsBatched(texts: string[]): Promise<number[][]> {
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    log('info', `Generating embeddings batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(texts.length / BATCH_SIZE)} (${batch.length} texts)`);

    const embeddings = await generateEmbeddings(batch);
    allEmbeddings.push(...embeddings);

    // Rate limiting: small delay between batches
    if (i + BATCH_SIZE < texts.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return allEmbeddings;
}

// ---------------------------------------------------------------------------
// Corpus flattening
// ---------------------------------------------------------------------------

function flattenCorpus(corpus: Corpus): KnowledgeDocument[] {
  const documents: KnowledgeDocument[] = [];

  for (const func of corpus.functions) {
    for (const category of func.categories) {
      for (const sub of category.subcategories) {
        const partial = {
          framework: corpus.framework,
          framework_version: corpus.version,
          function_id: func.id,
          function_name: func.name,
          category_id: category.id,
          category_name: category.name,
          subcategory_id: sub.id,
          description: sub.description,
          implementation_examples: sub.implementation_examples,
          informative_references: sub.informative_references,
        };

        const content = buildContent(partial);
        const content_hash = sha256(content);

        documents.push({
          ...partial,
          id: sub.id, // Use subcategory ID as the document ID (e.g., "GV.OC-01")
          content,
          content_hash,
        });
      }
    }
  }

  return documents;
}

// ---------------------------------------------------------------------------
// Supabase operations
// ---------------------------------------------------------------------------

async function fetchExistingHashes(
  supabase: ReturnType<typeof createClient>,
): Promise<Map<string, string>> {
  const hashMap = new Map<string, string>();

  const { data, error } = await supabase
    .from('knowledge_documents')
    .select('subcategory_id, content_hash')
    .eq('framework', 'NIST CSF 2.0');

  if (error) {
    log('warn', 'Could not fetch existing hashes (table may not exist yet)', error.message);
    return hashMap;
  }

  for (const row of data ?? []) {
    hashMap.set(row.subcategory_id, row.content_hash);
  }

  return hashMap;
}

async function upsertDocuments(
  supabase: ReturnType<typeof createClient>,
  documents: KnowledgeDocument[],
  embeddings: number[][] | null,
): Promise<ManifestEntry[]> {
  const manifest: ManifestEntry[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const embedding = embeddings ? embeddings[i] : null;

    try {
      const record: Record<string, unknown> = {
        subcategory_id: doc.id,
        framework: doc.framework,
        framework_version: doc.framework_version,
        function_id: doc.function_id,
        function_name: doc.function_name,
        category_id: doc.category_id,
        category_name: doc.category_name,
        description: doc.description,
        implementation_examples: doc.implementation_examples,
        informative_references: doc.informative_references,
        content: doc.content,
        content_hash: doc.content_hash,
        updated_at: now,
      };

      if (embedding) {
        record.embedding = embedding;
      }

      const { error } = await supabase
        .from('knowledge_documents')
        .upsert(record, { onConflict: 'subcategory_id' });

      if (error) {
        log('error', `Failed to upsert ${doc.id}: ${error.message}`);
        manifest.push({
          subcategory_id: doc.id,
          content_hash: doc.content_hash,
          ingested_at: now,
          status: 'error',
        });
      } else {
        manifest.push({
          subcategory_id: doc.id,
          content_hash: doc.content_hash,
          ingested_at: now,
          status: 'inserted', // Will be refined in main flow
        });
      }
    } catch (err) {
      log('error', `Exception upserting ${doc.id}`, err);
      manifest.push({
        subcategory_id: doc.id,
        content_hash: doc.content_hash,
        ingested_at: now,
        status: 'error',
      });
    }
  }

  return manifest;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isForce = args.includes('--force');
  const skipEmbeddings = args.includes('--skip-embeddings');

  log('info', '=== NIST CSF Knowledge Base Ingestion ===');
  log('info', `Corpus path: ${CORPUS_PATH}`);
  log('info', `Embedding provider: ${EMBEDDING_PROVIDER} (model: ${EMBEDDING_MODEL})`);
  log('info', `Mode: ${isDryRun ? 'DRY RUN' : isForce ? 'FORCE' : 'NORMAL'}`);

  // --- Step 1: Read corpus ---
  if (!fs.existsSync(CORPUS_PATH)) {
    log('error', `Corpus file not found: ${CORPUS_PATH}`);
    process.exit(1);
  }

  const rawCorpus = fs.readFileSync(CORPUS_PATH, 'utf-8');
  const corpus: Corpus = JSON.parse(rawCorpus);
  log('info', `Loaded corpus: ${corpus.framework} v${corpus.version}`);

  // --- Step 2: Flatten into documents ---
  const documents = flattenCorpus(corpus);
  log('info', `Flattened ${documents.length} subcategory documents`);

  // Log breakdown by function
  const functionCounts = new Map<string, number>();
  for (const doc of documents) {
    const count = functionCounts.get(doc.function_id) ?? 0;
    functionCounts.set(doc.function_id, count + 1);
  }
  for (const [funcId, count] of functionCounts) {
    log('info', `  ${funcId}: ${count} documents`);
  }

  if (isDryRun) {
    log('info', '--- Dry Run: Document Preview ---');
    for (const doc of documents.slice(0, 3)) {
      log('info', `  ${doc.id} | hash: ${doc.content_hash.substring(0, 12)}... | ${doc.description.substring(0, 80)}...`);
    }
    log('info', `... and ${Math.max(0, documents.length - 3)} more`);

    // Write manifest even in dry run
    const dryManifest: ManifestEntry[] = documents.map((doc) => ({
      subcategory_id: doc.id,
      content_hash: doc.content_hash,
      ingested_at: new Date().toISOString(),
      status: 'unchanged' as const,
    }));
    writeManifest(dryManifest);

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

  // --- Step 4: Fetch existing hashes for idempotency ---
  const existingHashes = await fetchExistingHashes(supabase);
  log('info', `Found ${existingHashes.size} existing documents in knowledge_documents`);

  // --- Step 5: Determine which documents need insert/update ---
  const toUpsert: KnowledgeDocument[] = [];
  const unchanged: KnowledgeDocument[] = [];

  for (const doc of documents) {
    const existingHash = existingHashes.get(doc.id);

    if (!isForce && existingHash === doc.content_hash) {
      unchanged.push(doc);
    } else {
      toUpsert.push(doc);
    }
  }

  log('info', `Documents to upsert: ${toUpsert.length}`);
  log('info', `Documents unchanged: ${unchanged.length}`);

  if (toUpsert.length === 0) {
    log('info', 'No changes detected. Knowledge base is up to date.');

    const manifest: ManifestEntry[] = documents.map((doc) => ({
      subcategory_id: doc.id,
      content_hash: doc.content_hash,
      ingested_at: new Date().toISOString(),
      status: 'unchanged' as const,
    }));
    writeManifest(manifest);
    return;
  }

  // --- Step 6: Generate embeddings ---
  let embeddings: number[][] | null = null;

  if (!skipEmbeddings) {
    try {
      log('info', `Generating embeddings for ${toUpsert.length} documents...`);
      const texts = toUpsert.map((doc) => doc.content);
      embeddings = await generateEmbeddingsBatched(texts);
      log('info', `Generated ${embeddings.length} embeddings (${EMBEDDING_DIMENSIONS} dimensions each)`);
    } catch (err) {
      log('error', 'Failed to generate embeddings. Proceeding without embeddings.', err);
      embeddings = null;
    }
  } else {
    log('info', 'Skipping embedding generation (--skip-embeddings)');
  }

  // --- Step 7: Upsert documents ---
  log('info', `Upserting ${toUpsert.length} documents...`);
  const upsertManifest = await upsertDocuments(supabase, toUpsert, embeddings);

  // Refine status based on whether document existed before
  for (const entry of upsertManifest) {
    if (entry.status !== 'error') {
      entry.status = existingHashes.has(entry.subcategory_id) ? 'updated' : 'inserted';
    }
  }

  // --- Step 8: Build and write full manifest ---
  const unchangedManifest: ManifestEntry[] = unchanged.map((doc) => ({
    subcategory_id: doc.id,
    content_hash: doc.content_hash,
    ingested_at: new Date().toISOString(),
    status: 'unchanged' as const,
  }));

  const fullManifest = [...upsertManifest, ...unchangedManifest].sort((a, b) =>
    a.subcategory_id.localeCompare(b.subcategory_id),
  );

  writeManifest(fullManifest);

  // --- Step 9: Summary ---
  const inserted = fullManifest.filter((e) => e.status === 'inserted').length;
  const updated = fullManifest.filter((e) => e.status === 'updated').length;
  const unchangedCount = fullManifest.filter((e) => e.status === 'unchanged').length;
  const errors = fullManifest.filter((e) => e.status === 'error').length;

  log('info', '=== Ingestion Complete ===');
  log('info', `  Inserted:  ${inserted}`);
  log('info', `  Updated:   ${updated}`);
  log('info', `  Unchanged: ${unchangedCount}`);
  log('info', `  Errors:    ${errors}`);
  log('info', `  Total:     ${fullManifest.length}`);
  log('info', `Manifest written to: ${MANIFEST_PATH}`);

  if (errors > 0) {
    process.exit(1);
  }
}

function writeManifest(manifest: ManifestEntry[]): void {
  const output = {
    generated_at: new Date().toISOString(),
    framework: 'NIST CSF 2.0',
    total_documents: manifest.length,
    summary: {
      inserted: manifest.filter((e) => e.status === 'inserted').length,
      updated: manifest.filter((e) => e.status === 'updated').length,
      unchanged: manifest.filter((e) => e.status === 'unchanged').length,
      errors: manifest.filter((e) => e.status === 'error').length,
    },
    entries: manifest,
  };

  const dir = path.dirname(MANIFEST_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(output, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main().catch((err) => {
  log('error', 'Unhandled error during ingestion', err);
  process.exit(1);
});
