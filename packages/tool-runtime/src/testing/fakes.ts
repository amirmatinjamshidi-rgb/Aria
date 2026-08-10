import type {
  ISearchProvider,
  ITool,
  PluginMetadata,
  SearchDomain,
  SearchQuery,
  SearchResponse,
  ToolDefinition,
  ToolExecutionContext,
  ToolMetadata,
} from "@aria/contracts";
import { ToolMetadataSchema, toLlmToolDefinition } from "@aria/contracts";

export class FakeTool implements ITool {
  readonly metadata: ToolMetadata;
  readonly calls: Array<Record<string, unknown>> = [];
  private readonly handler: (
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ) => Promise<unknown>;

  constructor(
    metadata: ToolMetadata,
    handler?: (
      args: Record<string, unknown>,
      context: ToolExecutionContext,
    ) => Promise<unknown>,
  ) {
    this.metadata = ToolMetadataSchema.parse(metadata);
    this.handler =
      handler ??
      (async (args) => ({ ok: true, echo: args }));
  }

  get definition(): ToolDefinition {
    return toLlmToolDefinition(this.metadata);
  }

  async execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<unknown> {
    this.calls.push(args);
    return this.handler(args, context);
  }
}

export class FakeSearchProvider implements ISearchProvider {
  readonly metadata: PluginMetadata;
  readonly domains: readonly SearchDomain[];
  readonly calls: SearchQuery[] = [];

  constructor(
    options: {
      readonly id?: string;
      readonly domains?: readonly SearchDomain[];
      readonly hits?: SearchResponse["hits"];
    } = {},
  ) {
    this.metadata = {
      id: options.id ?? "fake-search",
      name: "Fake Search",
      version: "0.1.0",
    };
    this.domains = options.domains ?? ["web"];
    this.hits = options.hits ?? [
      {
        title: "Fake result",
        url: "https://example.com/fake",
        snippet: "Fake snippet",
      },
    ];
  }

  private readonly hits: SearchResponse["hits"];

  async search(
    query: SearchQuery,
    options?: { readonly signal?: AbortSignal },
  ): Promise<SearchResponse> {
    options?.signal?.throwIfAborted();
    this.calls.push(query);
    const max = query.maxResults ?? 5;
    return {
      query: query.text,
      hits: this.hits.slice(0, max),
      provider: this.metadata.id,
      domain: query.domain ?? this.domains[0],
    };
  }
}
