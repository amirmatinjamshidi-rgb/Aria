import { z } from "zod";

const ErrorResponseSchema = z.object({
  detail: z.unknown().optional(),
});

export class InferenceSidecarClient {
  constructor(private readonly baseUrl: string) {}

  async getJson<T>(
    path: string,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await fetch(new URL(path, this.baseUrl), { signal });
    return this.parse(response, schema);
  }

  async postJson<T>(
    path: string,
    body: Uint8Array | FormData | string,
    schema: z.ZodType<T>,
    init: Omit<RequestInit, "method" | "body"> = {},
  ): Promise<T> {
    const response = await fetch(new URL(path, this.baseUrl), {
      ...init,
      method: "POST",
      body,
    });
    return this.parse(response, schema);
  }

  /**
   * POST returning the raw response for chunked bodies. Errors are still read
   * eagerly so callers get a real message instead of an empty audio stream.
   */
  async postStream(
    path: string,
    body: string,
    init: Omit<RequestInit, "method" | "body"> = {},
  ): Promise<Response> {
    const response = await fetch(new URL(path, this.baseUrl), {
      ...init,
      method: "POST",
      body,
    });
    if (!response.ok) {
      let detail = response.statusText;
      try {
        const value: unknown = await response.json();
        const parsed = ErrorResponseSchema.safeParse(value);
        if (parsed.success) {
          detail = JSON.stringify(parsed.data.detail);
        }
      } catch {
        // Non-JSON error body; the status text is the best we have.
      }
      throw new Error(
        `Voice inference sidecar returned ${response.status}: ${detail}`,
      );
    }
    if (response.body === null) {
      throw new Error("Voice inference sidecar returned an empty audio stream");
    }
    return response;
  }

  private async parse<T>(
    response: Response,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const value: unknown = await response.json();
    if (!response.ok) {
      const parsed = ErrorResponseSchema.safeParse(value);
      const detail = parsed.success
        ? JSON.stringify(parsed.data.detail)
        : response.statusText;
      throw new Error(
        `Voice inference sidecar returned ${response.status}: ${detail}`,
      );
    }
    return schema.parse(value);
  }
}
