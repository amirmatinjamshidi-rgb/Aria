import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AriaEventType,
  createUserUtterance,
  type AssistantReplyEvent,
  type ToolCallCompletedEvent,
} from "@aria/contracts";
import { createBrainContainer, resolveBrainPorts } from "../src/composition-root.js";

interface GoldenCase {
  id: string;
  language: "en" | "fa";
  user: string;
  expectReplyIncludes: string[];
  expectTool: string | null;
}

const fixturesPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "golden-conversations.json",
);

const cases = JSON.parse(readFileSync(fixturesPath, "utf8")) as GoldenCase[];

describe("golden bilingual conversations (mock provider)", () => {
  for (const fixture of cases) {
    it(fixture.id, async () => {
      const { container, conversation } = await createBrainContainer({
        ARIA_LLM_PROVIDER: "mock",
        ARIA_LOG_LEVEL: "error",
      });
      const { bus } = resolveBrainPorts(container);
      const stop = conversation.start();

      let toolName: string | undefined;
      bus.subscribe(AriaEventType.ConversationToolCallCompleted, (event) => {
        toolName = (event as ToolCallCompletedEvent).result.name;
      });

      const replyPromise = new Promise<string>((resolve) => {
        bus.subscribe(AriaEventType.ConversationAssistantReply, (event) => {
          resolve((event as AssistantReplyEvent).text);
        });
      });

      await bus.publish(
        createUserUtterance(fixture.user, fixture.language, fixture.id),
      );
      const reply = await replyPromise;

      for (const fragment of fixture.expectReplyIncludes) {
        expect(reply).toContain(fragment);
      }

      if (fixture.expectTool) {
        expect(toolName).toBe(fixture.expectTool);
      } else {
        expect(toolName).toBeUndefined();
      }

      stop();
      await bus.dispose?.();
    });
  }
});
