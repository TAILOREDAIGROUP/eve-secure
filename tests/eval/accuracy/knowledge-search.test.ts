import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Knowledge base accuracy tests
 * Validates that the NIST CSF corpus is correctly structured
 * and search patterns would return expected results
 */

// Load the corpus for testing
const corpusPath = path.resolve(__dirname, '../../../knowledge/nist-csf/corpus.json');
let corpus: any;

try {
  corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf-8'));
} catch {
  corpus = null;
}

describe('NIST CSF Knowledge Corpus', () => {
  it('corpus.json exists and is valid JSON', () => {
    expect(corpus).not.toBeNull();
    expect(corpus.framework).toBe('NIST CSF 2.0');
    expect(corpus.version).toBe('2.0');
  });

  it('contains all 6 Functions', () => {
    expect(corpus.functions).toHaveLength(6);
    const functionIds = corpus.functions.map((f: any) => f.id);
    expect(functionIds).toContain('GV');
    expect(functionIds).toContain('ID');
    expect(functionIds).toContain('PR');
    expect(functionIds).toContain('DE');
    expect(functionIds).toContain('RS');
    expect(functionIds).toContain('RC');
  });

  it('contains all 4 Tiers', () => {
    expect(corpus.tiers).toHaveLength(4);
    expect(corpus.tiers[0].level).toBe(1);
    expect(corpus.tiers[0].name).toBe('Partial');
    expect(corpus.tiers[3].level).toBe(4);
    expect(corpus.tiers[3].name).toBe('Adaptive');
  });

  it('each function has categories with subcategories', () => {
    for (const func of corpus.functions) {
      expect(func.categories.length).toBeGreaterThan(0);
      for (const cat of func.categories) {
        expect(cat.id).toBeTruthy();
        expect(cat.subcategories.length).toBeGreaterThan(0);
        for (const sub of cat.subcategories) {
          expect(sub.id).toBeTruthy();
          expect(sub.description).toBeTruthy();
          expect(sub.implementation_examples.length).toBeGreaterThan(0);
          expect(sub.informative_references.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('total subcategories count is >= 80', () => {
    let totalSubs = 0;
    for (const func of corpus.functions) {
      for (const cat of func.categories) {
        totalSubs += cat.subcategories.length;
      }
    }
    expect(totalSubs).toBeGreaterThanOrEqual(80);
  });
});

describe('Knowledge Search — Expected Results', () => {
  // Helper to find subcategories matching a pattern
  function findSubcategories(pattern: string | RegExp): any[] {
    const results: any[] = [];
    for (const func of corpus.functions) {
      for (const cat of func.categories) {
        for (const sub of cat.subcategories) {
          const searchText = `${sub.id} ${sub.description} ${sub.implementation_examples.join(' ')}`;
          if (typeof pattern === 'string') {
            if (searchText.toLowerCase().includes(pattern.toLowerCase())) {
              results.push({ ...sub, function: func.id, category: cat.id });
            }
          } else {
            if (pattern.test(searchText)) {
              results.push({ ...sub, function: func.id, category: cat.id });
            }
          }
        }
      }
    }
    return results;
  }

  it("'access control' returns PR.AA subcategories", () => {
    const results = findSubcategories('access');
    const prAA = results.filter((r) => r.category === 'PR.AA');
    expect(prAA.length).toBeGreaterThan(0);

    // Should be from PROTECT function
    const protectResults = results.filter((r) => r.function === 'PR');
    expect(protectResults.length).toBeGreaterThan(0);
  });

  it("'incident response' returns RS subcategories", () => {
    const results = findSubcategories('incident');
    const rsResults = results.filter((r) => r.function === 'RS');
    expect(rsResults.length).toBeGreaterThan(0);
  });

  it("'risk assessment' returns ID.RA subcategories", () => {
    const results = findSubcategories('risk');
    const idRA = results.filter((r) => r.category === 'ID.RA');
    expect(idRA.length).toBeGreaterThan(0);
  });

  it("'recovery' returns RC subcategories", () => {
    const results = findSubcategories('recover');
    const rcResults = results.filter((r) => r.function === 'RC');
    expect(rcResults.length).toBeGreaterThan(0);
  });

  it('every subcategory includes source citations (informative_references)', () => {
    for (const func of corpus.functions) {
      for (const cat of func.categories) {
        for (const sub of cat.subcategories) {
          expect(sub.informative_references.length).toBeGreaterThan(0);
          // Each reference should be a non-empty string
          for (const ref of sub.informative_references) {
            expect(typeof ref).toBe('string');
            expect(ref.length).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("'cooking recipes' returns no relevant results", () => {
    const results = findSubcategories('cooking recipes');
    expect(results.length).toBe(0);
  });

  it("'what is the weather' returns no relevant results", () => {
    const results = findSubcategories('weather forecast');
    expect(results.length).toBe(0);
  });
});

describe('Hybrid Search — Citation Pattern Detection', () => {
  it('detects HIPAA citation pattern §164', () => {
    const query = '§164.312(a)(1)';
    const isCitation = /§\d+|CFR|Rule\s+\d/i.test(query);
    expect(isCitation).toBe(true);
  });

  it('detects CFR pattern', () => {
    const query = '45 CFR 164.312';
    const isCitation = /§\d+|CFR|Rule\s+\d/i.test(query);
    expect(isCitation).toBe(true);
  });

  it('regular query does not trigger citation search', () => {
    const query = 'how do I protect my network';
    const isCitation = /§\d+|CFR|Rule\s+\d/i.test(query);
    expect(isCitation).toBe(false);
  });

  it('hybrid search merges vector + exact results without duplicates', () => {
    // Simulate merge of two result sets
    const vectorResults = [
      { id: 'a', title: 'Access Control', score: 0.95 },
      { id: 'b', title: 'Authentication', score: 0.88 },
      { id: 'c', title: 'MFA Requirement', score: 0.82 },
    ];

    const exactResults = [
      { id: 'b', title: 'Authentication', score: 1.0 }, // duplicate
      { id: 'd', title: 'HIPAA §164.312(a)(1)', score: 1.0 },
    ];

    // Merge: deduplicate by id, keep highest score
    const merged = new Map<string, any>();
    for (const r of [...vectorResults, ...exactResults]) {
      const existing = merged.get(r.id);
      if (!existing || r.score > existing.score) {
        merged.set(r.id, r);
      }
    }

    const results = Array.from(merged.values()).sort((a, b) => b.score - a.score);

    // Should have 4 unique results (a, b, c, d) — b merged
    expect(results).toHaveLength(4);
    // b should have score 1.0 (from exact match, higher than 0.88)
    const bResult = results.find((r) => r.id === 'b');
    expect(bResult?.score).toBe(1.0);
    // First result should be exact match or highest vector
    expect(results[0]!.score).toBe(1.0);
  });
});
