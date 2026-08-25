import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiVisionProvider } from "./gemini-vision-provider.js";

function jpegStub(): Uint8Array {
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
}

describe("GeminiVisionProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("requires an API key", () => {
    expect(
      () =>
        new GeminiVisionProvider({
          geminiApiKey: "",
          geminiModel: "gemini-2.0-flash",
          geminiBaseUrl: "https://generativelanguage.googleapis.com",
          trackEnabled: true,
          vlmEnabled: true,
          segmentEnabled: false,
          confidenceThreshold: 0.25,
        }),
    ).toThrow(/ARIA_GEMINI_API_KEY/);
  });

  it("parses box_2d detections and assigns trackIds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      description: "A desk with a phone.",
                      objects: [
                        {
                          label: "cell phone",
                          confidence: 0.91,
                          box_2d: [200, 100, 500, 400],
                        },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      })),
    );

    const provider = new GeminiVisionProvider({
      geminiApiKey: "test-key",
      geminiModel: "gemini-2.0-flash",
      geminiBaseUrl: "https://generativelanguage.googleapis.com",
      trackEnabled: true,
      vlmEnabled: true,
      segmentEnabled: false,
      confidenceThreshold: 0.25,
      geminiMinIntervalMs: 10,
    });

    const first = await provider.analyze(jpegStub(), { detect: true, track: true });
    expect(first.objects).toHaveLength(1);
    expect(first.objects[0]?.label).toBe("cell phone");
    expect(first.objects[0]?.bbox.x).toBeCloseTo(0.1);
    expect(first.objects[0]?.bbox.y).toBeCloseTo(0.2);
    expect(first.objects[0]?.bbox.width).toBeCloseTo(0.3);
    expect(first.objects[0]?.bbox.height).toBeCloseTo(0.3);
    expect(first.objects[0]?.trackId).toBeDefined();
    expect(first.description).toBe("A desk with a phone.");
    expect(first.source).toBe("live");

    const second = await provider.analyze(jpegStub(), { detect: true, track: true });
    expect(second.objects[0]?.trackId).toBe(first.objects[0]?.trackId);
  });

  it("requests a description when describe=true", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    description: "Someone holding a cup.",
                    objects: [],
                  }),
                },
              ],
            },
          },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GeminiVisionProvider({
      geminiApiKey: "test-key",
      geminiModel: "gemini-2.0-flash",
      geminiBaseUrl: "https://generativelanguage.googleapis.com",
      trackEnabled: false,
      vlmEnabled: true,
      segmentEnabled: false,
      confidenceThreshold: 0.25,
      geminiMinIntervalMs: 10,
    });

    const result = await provider.analyze(jpegStub(), {
      detect: false,
      describe: true,
    });
    expect(result.description).toBe("Someone holding a cup.");

    const calls = fetchMock.mock.calls as unknown as Array<
      [unknown, RequestInit]
    >;
    const body = JSON.parse(String(calls[0]?.[1]?.body ?? "{}")) as {
      contents: Array<{ parts: Array<{ text?: string }> }>;
    };
    const prompt = body.contents[0]?.parts.find((p) => p.text)?.text ?? "";
    expect(prompt).toMatch(/description/i);
  });

  it("backs off on HTTP 429 and can reuse last good scene", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        if (calls === 1) {
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => ({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: JSON.stringify({
                          description: "ok",
                          objects: [
                            {
                              label: "cup",
                              confidence: 0.9,
                              box_2d: [0, 0, 100, 100],
                            },
                          ],
                        }),
                      },
                    ],
                  },
                },
              ],
            }),
          };
        }
        return {
          ok: false,
          status: 429,
          headers: new Headers({ "retry-after": "1" }),
          json: async () => ({
            error: { message: "Resource exhausted. Please retry in 1.2s." },
          }),
        };
      }),
    );

    const provider = new GeminiVisionProvider({
      geminiApiKey: "test-key",
      geminiModel: "gemini-2.0-flash",
      geminiBaseUrl: "https://generativelanguage.googleapis.com",
      trackEnabled: false,
      vlmEnabled: true,
      segmentEnabled: false,
      confidenceThreshold: 0.25,
      geminiMinIntervalMs: 10,
    });

    const first = await provider.analyze(jpegStub(), { detect: true });
    expect(first.objects[0]?.label).toBe("cup");

    const second = await provider.analyze(jpegStub(), { detect: true });
    expect(second.objects[0]?.label).toBe("cup");
    expect(provider.cooldownRemainingMs()).toBeGreaterThan(0);
  });

  it("holds a token-bucket cooldown after a successful call", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify({ objects: [] }) }],
              },
            },
          ],
        }),
      })),
    );

    const provider = new GeminiVisionProvider({
      geminiApiKey: "test-key",
      geminiModel: "gemini-2.0-flash",
      geminiBaseUrl: "https://generativelanguage.googleapis.com",
      trackEnabled: false,
      vlmEnabled: false,
      segmentEnabled: false,
      confidenceThreshold: 0.25,
      geminiMinIntervalMs: 4500,
    });

    expect(provider.cooldownRemainingMs()).toBe(0);
    await provider.analyze(jpegStub(), { detect: true });
    expect(provider.cooldownRemainingMs()).toBeGreaterThan(4000);
  });
});
