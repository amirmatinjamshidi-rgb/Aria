import boxen from "boxen";
import chalk from "chalk";
import ora, { type Ora } from "ora";

/**
 * Presentation-only CLI helpers (chalk / ora / boxen).
 * Keep these out of domain services — use @aria/core ConsoleLogger there.
 */
export const cli = {
  dim(message: string): void {
    console.log(chalk.dim(message));
  },

  info(message: string): void {
    console.log(`${chalk.cyan("ℹ")}  ${message}`);
  },

  success(message: string): void {
    console.log(`${chalk.green("✔")}  ${message}`);
  },

  warn(message: string): void {
    console.log(`${chalk.yellow("⚠")}  ${message}`);
  },

  error(message: string): void {
    console.error(`${chalk.red("✖")}  ${message}`);
  },

  user(text: string, language: string): void {
    const tag = chalk.bold.blue("you");
    const lang = chalk.dim(`[${language}]`);
    console.log(`\n${tag} ${lang}  ${text}`);
  },

  assistant(text: string, language: string): void {
    const tag = chalk.bold.magenta("aria");
    const lang = chalk.dim(`[${language}]`);
    console.log(`${tag} ${lang}  ${text}`);
  },

  tool(name: string, ok: boolean): void {
    const status = ok ? chalk.green("ok") : chalk.red("err");
    console.log(`${chalk.dim("tool")}  ${chalk.cyan(name)}  ${status}`);
  },

  spinner(text: string): Ora {
    return ora({ text, color: "cyan", spinner: "dots" }).start();
  },

  box(title: string, lines: string[]): void {
    const body = [chalk.bold(title), "", ...lines].join("\n");
    console.log(
      boxen(body, {
        padding: 1,
        margin: { top: 1, bottom: 1, left: 0, right: 0 },
        borderStyle: "round",
        borderColor: "cyan",
      }),
    );
  },
};
