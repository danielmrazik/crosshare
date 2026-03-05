#!/usr/bin/env -S npx tsx
export {};

import fs from 'fs';
import path from 'path';
import { rawBuild } from '../lib/WordDB.js';

type WordTuple = [string, number];

function normalizeWord(s: string): string {
  return s.trim().toUpperCase();
}

function loadBlacklist(filePath: string): Set<string> {
  const txt = fs.readFileSync(filePath, 'utf8');
  const out = new Set<string>();

  for (const line of txt.split(/\r?\n/)) {
    const t = line.trim();
    if (t.length === 0) continue;
    if (t.startsWith('#')) continue;
    out.add(normalizeWord(t));
  }
  return out;
}

function flattenWorddb(worddb: unknown): WordTuple[] {
  const anyDb = worddb as { words?: Record<string, unknown> };
  const wordsObj = anyDb.words ?? {};
  const tuples: WordTuple[] = [];

  for (const k of Object.keys(wordsObj)) {
    const arr = (wordsObj)[k];
    if (!Array.isArray(arr)) continue;

    for (const entry of arr) {
      if (
        Array.isArray(entry) &&
        typeof entry[0] === 'string' &&
        typeof entry[1] === 'number'
      ) {
        tuples.push([entry[0], entry[1]]);
      }
    }
  }
  return tuples;
}

// Usage:
//   ./scripts/filterWorddb.ts <inputWorddbJson> <blacklistTxt> <outputWorddbJson>
const argv = process.argv.slice(2);
if (argv.length !== 3) {
  throw new Error(
    'Usage: filterWorddb.ts <inputWorddbJson> <blacklistTxt> <outputWorddbJson>'
  );
}

const inputPath = argv[0];
const blacklistPath = argv[1];
const outputPath = argv[2];

if (
  typeof inputPath !== 'string' ||
  typeof blacklistPath !== 'string' ||
  typeof outputPath !== 'string'
) {
  throw new Error(
    'Usage: filterWorddb.ts <inputWorddbJson> <blacklistTxt> <outputWorddbJson>'
  );
}

const blacklist = loadBlacklist(blacklistPath);

const inputRaw = fs.readFileSync(inputPath, 'utf8');
const parsed = JSON.parse(inputRaw) as unknown;

const tuples = flattenWorddb(parsed);
const filtered = tuples.filter(([w]) => !blacklist.has(normalizeWord(w)));

console.log(`Loaded:   ${tuples.length.toLocaleString()} entries`);
console.log(
  `Removed:  ${(tuples.length - filtered.length).toLocaleString()} entries`
);
console.log(`Keeping:  ${filtered.length.toLocaleString()} entries`);

const rebuilt = rawBuild(filtered);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(rebuilt));
console.log(`Wrote: ${path.resolve(outputPath)}`);
