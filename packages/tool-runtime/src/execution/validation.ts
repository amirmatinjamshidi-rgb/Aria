import { z } from "zod";

/**
 * Lightweight JSON-Schema → Zod for common tool parameter shapes.
 * Supports object, string, number, boolean, and required fields.
 */
export function jsonSchemaToZod(
  schema: Record<string, unknown>,
): z.ZodType<Record<string, unknown>> {
  const properties =
    schema["properties"] &&
    typeof schema["properties"] === "object" &&
    !Array.isArray(schema["properties"])
      ? (schema["properties"] as Record<string, Record<string, unknown>>)
      : {};

  const required = Array.isArray(schema["required"])
    ? (schema["required"] as string[])
    : [];

  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, prop] of Object.entries(properties)) {
    let field = propToZod(prop);
    if (!required.includes(key)) {
      field = field.optional();
    }
    shape[key] = field;
  }

  return z.object(shape).passthrough();
}

function propToZod(prop: Record<string, unknown>): z.ZodTypeAny {
  const type = prop["type"];
  switch (type) {
    case "string":
      return z.string();
    case "number":
    case "integer":
      return z.number();
    case "boolean":
      return z.boolean();
    case "array":
      return z.array(z.unknown());
    case "object":
      return z.record(z.unknown());
    default:
      return z.unknown();
  }
}

export function validateToolArgs(
  inputSchema: Record<string, unknown>,
  args: Record<string, unknown>,
): { ok: true; data: Record<string, unknown> } | { ok: false; message: string } {
  const zodSchema = jsonSchemaToZod(inputSchema);
  const parsed = zodSchema.safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; "),
    };
  }
  return { ok: true, data: parsed.data };
}
