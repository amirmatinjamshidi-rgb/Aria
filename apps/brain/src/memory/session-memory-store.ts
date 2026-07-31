import { randomUUID } from "node:crypto";
import type {
  IMemoryStore,
  MemoryQuery,
  MemoryRecord,
  MemoryStoreInput,
  PluginMetadata,
} from "@aria/contracts";

const DEFAULT_PREFERENCE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const DEFAULT_EPISODIC_TTL_MS = 1000 * 60 * 60 * 24; // 1 day

/**
 * Phase 1 in-process working memory implementing IMemoryStore.
 * Lexical relevance ranking now; Phase 3 swaps in Chroma embeddings.
 */
export class SessionMemoryStore implements IMemoryStore {
  readonly metadata: PluginMetadata = {
    id: "session-memory",
    name: "Session Memory Store",
    version: "0.1.0",
    description: "In-process preference/fact memory with decay (Phase 1)",
  };

  private readonly records = new Map<string, MemoryRecord & { expiresAt?: string }>();

  async store(input: MemoryStoreInput): Promise<MemoryRecord> {
    this.pruneExpired();

    const key =
      typeof input.metadata?.["key"] === "string"
        ? input.metadata["key"]
        : undefined;

    if (input.kind === "preference" && key) {
      const existing = [...this.records.values()].find(
        (r) =>
          r.kind === "preference" &&
          r.metadata["key"] === key &&
          !this.isExpired(r),
      );
      if (existing) {
        const updated: MemoryRecord & { expiresAt?: string } = {
          ...existing,
          content: input.content,
          metadata: { ...existing.metadata, ...input.metadata, key },
          createdAt: existing.createdAt,
          expiresAt: this.defaultExpiry(input.kind),
        };
        // Preserve original id; refresh content (duplicate detection / upsert)
        this.records.set(existing.id, updated);
        return updated;
      }
    }

    // Skip near-duplicate content
    const duplicate = [...this.records.values()].find(
      (r) =>
        !this.isExpired(r) &&
        r.kind === input.kind &&
        normalize(r.content) === normalize(input.content),
    );
    if (duplicate) {
      return duplicate;
    }

    const record: MemoryRecord & { expiresAt?: string } = {
      id: randomUUID(),
      kind: input.kind,
      content: input.content.trim(),
      metadata: input.metadata ?? {},
      createdAt: new Date().toISOString(),
      expiresAt: this.defaultExpiry(input.kind),
    };
    this.records.set(record.id, record);
    return record;
  }

  async query(query: MemoryQuery): Promise<MemoryRecord[]> {
    this.pruneExpired();
    const limit = query.limit ?? 5;
    const tokens = tokenize(query.text);
    const scored: MemoryRecord[] = [];

    for (const record of this.records.values()) {
      if (this.isExpired(record)) {
        continue;
      }
      if (query.kind && record.kind !== query.kind) {
        continue;
      }
      const score = relevanceScore(tokens, record);
      if (score <= 0 && tokens.length > 0) {
        continue;
      }
      scored.push({ ...record, score });
    }

    scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return scored.slice(0, limit);
  }

  async delete(id: string): Promise<void> {
    this.records.delete(id);
  }

  /** Convenience for preference tools / conversation loop */
  async upsertPreference(key: string, value: string): Promise<MemoryRecord> {
    return this.store({
      kind: "preference",
      content: `${key}: ${value}`,
      metadata: { key, value },
    });
  }

  formatForPrompt(records: readonly MemoryRecord[], language: "en" | "fa"): string {
    if (records.length === 0) {
      return "";
    }
    const header =
      language === "fa" ? "حافظه مرتبط این نشست:" : "Relevant session memory:";
    const lines = records.map((r) => `- (${r.kind}) ${r.content}`);
    return [header, ...lines].join("\n");
  }

  size(): number {
    this.pruneExpired();
    return this.records.size;
  }

  pruneExpired(): number {
    let removed = 0;
    for (const [id, record] of this.records) {
      if (this.isExpired(record)) {
        this.records.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  private defaultExpiry(kind: MemoryStoreInput["kind"]): string {
    const ttl =
      kind === "preference" ? DEFAULT_PREFERENCE_TTL_MS : DEFAULT_EPISODIC_TTL_MS;
    return new Date(Date.now() + ttl).toISOString();
  }

  private isExpired(record: MemoryRecord & { expiresAt?: string }): boolean {
    if (!record.expiresAt) {
      return false;
    }
    return Date.parse(record.expiresAt) <= Date.now();
  }
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1);
}

function relevanceScore(queryTokens: string[], record: MemoryRecord): number {
  if (queryTokens.length === 0) {
    return 0.1;
  }
  const hay = tokenize(`${record.content} ${JSON.stringify(record.metadata)}`);
  if (hay.length === 0) {
    return 0;
  }
  const haySet = new Set(hay);
  let hits = 0;
  for (const token of queryTokens) {
    if (haySet.has(token)) {
      hits += 1;
    }
  }
  const overlap = hits / queryTokens.length;
  const recencyBoost = 0.05;
  return overlap + recencyBoost;
}
