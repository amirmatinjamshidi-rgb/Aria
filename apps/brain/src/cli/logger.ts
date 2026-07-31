import boxen from "boxen";
import chalk from "chalk";
import ora, { type Ora } from "ora";

/** Brand palette — teal/cyan primary (avoid purple/glow CLI clichés). */
const brand = {
  primary: chalk.hex("#2DD4BF"),
  primaryBold: chalk.bold.hex("#2DD4BF"),
  accent: chalk.hex("#38BDF8"),
  accentBold: chalk.bold.hex("#38BDF8"),
  user: chalk.bold.hex("#60A5FA"),
  muted: chalk.hex("#94A3B8"),
  soft: chalk.hex("#CBD5E1"),
  ok: chalk.hex("#4ADE80"),
  warn: chalk.hex("#FBBF24"),
  err: chalk.hex("#F87171"),
  label: chalk.bold.hex("#E2E8F0"),
};

const DIVIDER = brand.muted("─".repeat(48));

/**
 * Presentation-only CLI helpers (chalk / ora / boxen).
 * Keep these out of domain services — use @aria/core ConsoleLogger there.
 */
export const cli = {
  brand,

  blank(): void {
    console.log();
  },

  divider(): void {
    console.log(DIVIDER);
  },

  dim(message: string): void {
    console.log(brand.muted(message));
  },

  info(message: string): void {
    console.log(`${brand.accent("●")}  ${brand.soft(message)}`);
  },

  success(message: string): void {
    console.log(`${brand.ok("✔")}  ${chalk.white(message)}`);
  },

  warn(message: string): void {
    console.log(`${brand.warn("⚠")}  ${brand.warn(message)}`);
  },

  error(message: string): void {
    console.error(`${brand.err("✖")}  ${brand.err(message)}`);
  },

  /** Full-width startup banner for chat / demo. */
  banner(subtitle?: string): void {
    const title = brand.primaryBold("A R I A");
    const tag = brand.muted("local-first · bilingual · phase 1");
    const lines = [
      "",
      `  ${title}`,
      `  ${tag}`,
      subtitle ? `  ${brand.accent(subtitle)}` : undefined,
      "",
    ].filter((line): line is string => line !== undefined);

    console.log(
      boxen(lines.join("\n"), {
        padding: { top: 0, bottom: 0, left: 1, right: 1 },
        margin: { top: 1, bottom: 0, left: 0, right: 0 },
        borderStyle: "round",
        borderColor: "cyan",
        backgroundColor: "#0F172A",
      }),
    );
  },

  user(text: string, language: string): void {
    const tag = brand.user("YOU");
    const lang = languageBadge(language);
    console.log();
    console.log(`${tag} ${lang}`);
    console.log(`  ${chalk.white(text)}`);
  },

  assistant(text: string, language: string): void {
    const tag = brand.primaryBold("ARIA");
    const lang = languageBadge(language);
    console.log(`${tag} ${lang}`);
    for (const line of wrapText(text, 72)) {
      console.log(`  ${brand.soft(line)}`);
    }
    console.log();
  },

  tool(name: string, ok: boolean): void {
    const icon = ok ? brand.ok("⚙") : brand.err("⚙");
    const status = ok ? brand.ok("ok") : brand.err("err");
    console.log(
      `  ${icon}  ${brand.muted("tool")}  ${brand.accent(name)}  ${status}`,
    );
  },

  spinner(text: string): Ora {
    return ora({
      text: brand.muted(text),
      color: "cyan",
      spinner: "dots",
    }).start();
  },

  box(title: string, lines: string[], variant: "info" | "metrics" | "help" = "info"): void {
    const borderColor =
      variant === "metrics" ? "green" : variant === "help" ? "yellow" : "cyan";
    const styledTitle = brand.primaryBold(title);
    const body = [styledTitle, "", ...lines.map((line) => styleBoxLine(line))].join(
      "\n",
    );
    console.log(
      boxen(body, {
        padding: 1,
        margin: { top: 1, bottom: 1, left: 0, right: 0 },
        borderStyle: "round",
        borderColor,
      }),
    );
  },

  /** Colored key/value rows for metrics and status panels. */
  kv(entries: ReadonlyArray<readonly [string, string]>): string[] {
    const keyWidth = Math.max(...entries.map(([k]) => k.length), 8);
    return entries.map(([key, value]) => {
      const padded = key.padEnd(keyWidth, " ");
      return `${brand.label(padded)}  ${brand.accent(value)}`;
    });
  },

  /** Slash-command help with highlighted commands. */
  helpLines(
    rows: ReadonlyArray<{ command: string; description: string }>,
  ): string[] {
    const width = Math.max(...rows.map((r) => r.command.length), 12);
    return rows.map((row) => {
      const cmd = brand.accent(row.command.padEnd(width, " "));
      return `  ${cmd}  ${brand.muted(row.description)}`;
    });
  },

  prompt(mode: string): string {
    const you = brand.user("you");
    const modeLabel = brand.muted(`(${mode})`);
    const arrow = brand.primary("❯");
    return `${you} ${modeLabel} ${arrow} `;
  },

  goodbye(): void {
    console.log();
    cli.divider();
    console.log(
      `  ${brand.primary("✦")}  ${brand.soft("Until next time.")}  ${brand.muted("— Aria")}`,
    );
    console.log();
  },
};

function languageBadge(language: string): string {
  const code = language.toLowerCase();
  if (code === "fa") {
    return chalk.bgHex("#0F766E").hex("#ECFDF5")(` ${code} `);
  }
  if (code === "en") {
    return chalk.bgHex("#1E3A5F").hex("#E0F2FE")(` ${code} `);
  }
  return brand.muted(`[${language}]`);
}

function styleBoxLine(line: string): string {
  // Highlight leading labels like "Provider:" or bullet-ish command rows
  const kv = /^(\s*)([\w /|:-]+?)(\s{2,})(.+)$/.exec(line);
  if (kv) {
    const [, indent, key, gap, rest] = kv;
    return `${indent}${brand.label(key)}${gap}${brand.soft(rest)}`;
  }
  if (line.trimStart().startsWith("/")) {
    return brand.accent(line);
  }
  return brand.soft(line);
}

function wrapText(text: string, width: number): string[] {
  const paragraphs = text.split(/\r?\n/);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.trim().length === 0) {
      lines.push("");
      continue;
    }
    const words = paragraph.split(/\s+/);
    let current = "";
    for (const word of words) {
      const next = current.length === 0 ? word : `${current} ${word}`;
      if (next.length > width && current.length > 0) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) {
      lines.push(current);
    }
  }
  return lines.length > 0 ? lines : [text];
}
