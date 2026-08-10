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
