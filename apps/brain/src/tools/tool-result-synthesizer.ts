import type {
  IToolResultSynthesizer,
  LanguageCode,
  ToolResult,
} from "@aria/contracts";
import {
  CatalogToolResultSynthesizer,
  ToolResultFormatterRegistry,
} from "@aria/tool-runtime";
import { createBuiltinFormatters } from "./result-formatters/builtin-formatters.js";

/**
 * Converts structured tool results into natural language via formatter registry.
 */
export class ToolResultSynthesizer implements IToolResultSynthesizer {
  private readonly inner: CatalogToolResultSynthesizer;

  constructor() {
    const registry = new ToolResultFormatterRegistry();
    for (const formatter of createBuiltinFormatters()) {
      registry.register(formatter);
    }
    this.inner = new CatalogToolResultSynthesizer(registry);
  }

  synthesize(result: ToolResult, language: LanguageCode): string {
    return this.inner.synthesize(result, language);
  }

  looksLikeRawToolDump(text: string): boolean {
    return this.inner.looksLikeRawToolDump(text);
  }
}
