import { z } from "zod";

export const SearchDomainSchema = z.enum([
  "web",
  "documentation",
  "github",
  "stackoverflow",
  "news",
  "images",
  "wikipedia",
  "local_memory",
  "project",
  "repository",
]);
export type SearchDomain = z.infer<typeof SearchDomainSchema>;

export const SearchIntentSchema = z.enum([
  "react",
  "general_knowledge",
  "coding",
  "robot",
  "news",
  "default",
]);
export type SearchIntent = z.infer<typeof SearchIntentSchema>;

export const SearchQuerySchema = z.object({
  text: z.string().min(1),
  domain: SearchDomainSchema.optional(),
  intent: SearchIntentSchema.optional(),
  maxResults: z.number().int().min(1).max(20).optional(),
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export const SearchHitSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  snippet: z.string().default(""),
});
export type SearchHit = z.infer<typeof SearchHitSchema>;

export const SearchResponseSchema = z.object({
  query: z.string(),
  hits: z.array(SearchHitSchema),
  provider: z.string(),
  domain: SearchDomainSchema.optional(),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
