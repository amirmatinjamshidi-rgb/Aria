import type {
  ISearchProvider,
  PluginMetadata,
  SearchDomain,
  SearchQuery,
  SearchResponse,
} from "@aria/contracts";
import { createToolError } from "@aria/contracts";
import { ToolExecutionError } from "@aria/tool-runtime";

/** Stub provider for domains without a live adapter yet. */
export class StubSearchProvider implements ISearchProvider {
  readonly metadata: PluginMetadata;
  readonly domains: readonly SearchDomain[];

  constructor(id: string, domains: readonly SearchDomain[]) {
    this.metadata = {
      id,
      name: `Stub ${id}`,
      version: "0.0.0",
      description: "Not configured",
    };
    this.domains = domains;
  }

  async search(
    query: SearchQuery,
    _options?: { readonly signal?: AbortSignal },
  ): Promise<SearchResponse> {
    throw new ToolExecutionError(
      createToolError(
        "PROVIDER",
        `Search provider "${this.metadata.id}" is not configured`,
        { details: { query: query.text } },
      ),
    );
  }
}
