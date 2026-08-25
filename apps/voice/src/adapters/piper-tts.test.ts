import { describe, expect, it } from "vitest";
import { PiperTtsProvider } from "./piper-tts.js";

describe("PiperTtsProvider language routing", () => {
  it("sends fa + Ganji when the reply text contains Persian script", async () => {
    const posts: Array<{ path: string; body: string }> = [];
    const client = {
      async postJson(path: string, body: string) {
        posts.push({ path, body });
        return {
          audioBase64: Buffer.from("pcm").toString("base64"),
          sampleRateHz: 22050,
        };
      },
    };
    const tts = new PiperTtsProvider(client as never, {
      piperExecutable: "piper",
      piperEnglishModel: "models/piper/en_US-lessac-medium.onnx",
      piperPersianModel: "models/piper/fa_IR-ganji-medium.onnx",
    });

    await tts.synthesize("سلام، چطوری؟", { language: "en" });

    expect(posts).toHaveLength(1);
    const payload = JSON.parse(posts[0]?.body ?? "") as {
      language: string;
      model: string;
      text: string;
    };
    expect(payload.language).toBe("fa");
    expect(payload.model).toContain("ganji");
    expect(payload.text).toContain("سلام");
  });

  it("streams raw PCM from /v1/synthesize/stream", async () => {
    const posts: Array<{ path: string; body: string }> = [];
    const pcm = new Uint8Array([1, 2, 3, 4]);
    const client = {
      async postJson() {
        throw new Error("buffered synthesize should not be used");
      },
      async postStream(path: string, body: string) {
        posts.push({ path, body });
        return {
          headers: {
            get(name: string) {
              return name.toLowerCase() === "x-sample-rate" ? "22050" : null;
            },
          },
          body: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(pcm);
              controller.close();
            },
          }),
        };
      },
    };
    const tts = new PiperTtsProvider(client as never, {
      piperExecutable: "piper",
      piperEnglishModel: "models/piper/en_US-lessac-medium.onnx",
      piperPersianModel: "models/piper/fa_IR-ganji-medium.onnx",
    });

    const stream = await tts.synthesizeStream("Hello there.", { language: "en" });
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream.chunks) {
      chunks.push(chunk);
    }

    expect(posts[0]?.path).toBe("/v1/synthesize/stream");
    expect(stream.sampleRateHz).toBe(22050);
    expect(chunks).toEqual([pcm]);
    const payload = JSON.parse(posts[0]?.body ?? "") as { language: string };
    expect(payload.language).toBe("en");
  });

  it("reassembles HTTP frames that split a 16-bit sample", async () => {
    const client = {
      async postStream() {
        return {
          headers: {
            get(name: string) {
              return name.toLowerCase() === "x-sample-rate" ? "22050" : null;
            },
          },
          body: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(Uint8Array.from([0x01]));
              controller.enqueue(Uint8Array.from([0x02, 0x03]));
              controller.enqueue(Uint8Array.from([0x04]));
              controller.close();
            },
          }),
        };
      },
    };
    const tts = new PiperTtsProvider(client as never, {
      piperExecutable: "piper",
      piperEnglishModel: "models/piper/en_US-lessac-medium.onnx",
      piperPersianModel: "models/piper/fa_IR-ganji-medium.onnx",
    });

    const stream = await tts.synthesizeStream("Hi.", { language: "en" });
    const bytes: number[] = [];
    for await (const chunk of stream.chunks) {
      bytes.push(...chunk);
    }
    expect(bytes).toEqual([0x01, 0x02, 0x03, 0x04]);
  });
});
