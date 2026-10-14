// tests/fixtures.ts
// Deterministic, synthetic fixtures. No real personal data.

import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

/** Create a unique temp SQLite file path for an isolated test database. */
export function tmpDbPath(label = "test"): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `sb-${label}-`));
  return path.join(dir, "test.db");
}

export function cleanupDbPath(dbPath: string): void {
  try {
    const dir = path.dirname(dbPath);
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}

export const USER_A = "user-a";
export const USER_B = "user-b";

// A small synthetic corpus with clearly separable topics so semantic vs lexical
// behavior is distinguishable and relevance is unambiguous.
export const DOCS: { name: string; text: string }[] = [
  {
    name: "pets.txt",
    text: "The cat sat quietly on the warm windowsill. Cats are independent and curious animals that enjoy sunlight and short naps throughout the day.",
  },
  {
    name: "canines.txt",
    text: "Dogs are loyal companions that thrive on routine and exercise. A well trained puppy learns to fetch, sit, and stay with consistent practice.",
  },
  {
    name: "finance.txt",
    text: "Quarterly revenue grew twelve percent year over year. The fiscal outlook remains positive and investors expect steady dividend growth next quarter.",
  },
  {
    name: "astronomy.txt",
    text: "The telescope captured distant galaxies and nebulae. Astronomers study starlight to understand the age and expansion of the universe.",
  },
];

// Retrieval relevance judgments for the evaluation + hybrid tests.
// Each query maps to the document name(s) that are genuinely relevant.
export const QUERIES: { query: string; relevantDocs: string[]; kind: "semantic" | "lexical" }[] = [
  // Semantic: no exact keyword overlap with the doc; requires embeddings.
  { query: "a feline napping in the sun", relevantDocs: ["pets.txt"], kind: "semantic" },
  // Lexical: rare exact keywords present in exactly one doc.
  { query: "quarterly revenue fiscal dividend", relevantDocs: ["finance.txt"], kind: "lexical" },
  // Semantic: synonyms for dog/puppy.
  { query: "training a loyal canine companion", relevantDocs: ["canines.txt"], kind: "semantic" },
  // Lexical: astronomy-specific terms.
  { query: "galaxies nebulae telescope starlight", relevantDocs: ["astronomy.txt"], kind: "lexical" },
];

export function sha(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 8);
}
