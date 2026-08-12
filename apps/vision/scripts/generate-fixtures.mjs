#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, "../test/fixtures/tracking");

mkdirSync(fixturesDir, { recursive: true });

const sequence = {
  label: "bottle",
  frames: [
    { id: "frame-0", bbox: { x: 0.1, y: 0.2, width: 0.1, height: 0.3 } },
    { id: "frame-1", bbox: { x: 0.1, y: 0.2, width: 0.1, height: 0.3 } },
    { id: "frame-2", bbox: { x: 0.1, y: 0.2, width: 0.1, height: 0.3 } },
  ],
};

writeFileSync(
  resolve(fixturesDir, "sequence.json"),
  `${JSON.stringify(sequence, null, 2)}\n`,
  "utf8",
);

for (const frame of sequence.frames) {
  writeFileSync(
    resolve(fixturesDir, `${frame.id}.jpg`),
    Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  );
}

console.log(`Wrote fixtures to ${fixturesDir}`);
