const STORAGE_KEY = 'crosshare-blacklist';

function normalizeWord(word: string): string {
  return word.trim().toUpperCase();
}

export function getBlacklist(): Set<string> {
  if (typeof window === 'undefined') {
    return new Set<string>();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return new Set<string>();
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return new Set<string>();
    }

    return new Set(
      parsed
        .filter((v): v is string => typeof v === 'string')
        .map((v) => normalizeWord(v))
    );
  } catch {
    return new Set<string>();
  }
}

export function saveBlacklist(words: Set<string>): void {
  if (typeof window === 'undefined') {
    return;
  }

  const arr = Array.from(words).sort();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
}

export function addToBlacklist(word: string): void {
  const blacklist = getBlacklist();
  blacklist.add(normalizeWord(word));
  saveBlacklist(blacklist);
}

export function removeFromBlacklist(word: string): void {
  const blacklist = getBlacklist();
  blacklist.delete(normalizeWord(word));
  saveBlacklist(blacklist);
}

export function isBlacklisted(word: string): boolean {
  return getBlacklist().has(normalizeWord(word));
}

export function filterBlacklistedWords(words: string[]): string[] {
  const blacklist = getBlacklist();
  return words.filter((word) => !blacklist.has(normalizeWord(word)));
}

export function getBlacklistArray(): string[] {
  return Array.from(getBlacklist()).sort();
}
