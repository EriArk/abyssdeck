import { z } from "zod";

const identity = z
  .string()
  .regex(/^[a-zA-Z0-9_-]{1,128}$/)
  .refine((value) => !["__proto__", "constructor", "prototype"].includes(value));
const revision = z.string().regex(/^[a-f0-9]{64}$/);
const graphSchema = z
  .object({
    conversation_id: z.string().uuid(),
    current_node: identity,
    title: z.string().max(4096),
    gizmo_id: z
      .string()
      .regex(/^g-p-[a-zA-Z0-9-]{1,80}$/)
      .nullable(),
    mapping: z.record(
      identity,
      z
        .object({
          id: identity,
          parent: identity.nullable(),
          children: z.array(identity).max(10000),
          message: z.record(z.string(), z.unknown()).nullable(),
        })
        .strict(),
    ),
  })
  .strict();
const envelope = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unchanged"), conversationId: z.string().uuid(), revision }).strict(),
  z
    .object({
      kind: z.literal("full"),
      conversationId: z.string().uuid(),
      revision,
      graph: graphSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("delta"),
      conversationId: z.string().uuid(),
      revision,
      base: revision,
      graph: graphSchema,
      removed: z.array(identity).max(10000),
    })
    .strict(),
]);
type Graph = z.infer<typeof graphSchema> & { codex_native_assets: true };
type Projection = { revision: string; graph: Graph; bytes: number };
function fail(): never {
  throw Error("NATIVE_INVALID_HISTORY");
}
function freeze(value: unknown): void {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
}

/** Bounded IPC baselines only. Durable normalized history stays in GptHistoryDisk.
 * Never used for mutation, receipt, account or media authorization. */
export class NativeHistoryProjection {
  private entries = new Map<string, Projection>();
  get(id: string) {
    return this.entries.get(id);
  }
  clear() {
    this.entries.clear();
  }
  remove(id: string) {
    this.entries.delete(id);
  }
  accept(id: string, previous: Projection | undefined, input: unknown): Graph {
    const value = envelope.parse(input);
    if (value.conversationId !== id) fail();
    if (value.kind === "unchanged") {
      if (!previous || previous.revision !== value.revision) fail();
      return previous.graph;
    }
    if (value.graph.conversation_id !== id) fail();
    let mapping = value.graph.mapping;
    if (value.kind === "delta") {
      if (!previous || previous.revision !== value.base) fail();
      mapping = { ...previous.graph.mapping };
      for (const removed of value.removed) {
        if (!Object.hasOwn(mapping, removed) || Object.hasOwn(value.graph.mapping, removed)) fail();
        delete mapping[removed];
      }
      Object.assign(mapping, value.graph.mapping);
    }
    if (Object.keys(mapping).length > 10000) fail();
    for (const [key, node] of Object.entries(mapping)) {
      if (node.id !== key) fail();
    }
    const seen = new Set<string>();
    let current: string | null = value.graph.current_node;
    while (current !== null) {
      if (seen.has(current) || !Object.hasOwn(mapping, current)) fail();
      seen.add(current);
      current = mapping[current]!.parent;
    }
    const graph: Graph = { ...value.graph, mapping, codex_native_assets: true };
    const bytes = Buffer.byteLength(JSON.stringify(graph));
    if (bytes > 2 * 1024 ** 2) fail();
    freeze(graph);
    // A slower concurrent response cannot roll the current baseline backwards.
    if (this.entries.get(id) === previous) {
      this.entries.delete(id);
      this.entries.set(id, { revision: value.revision, graph, bytes });
      let total = [...this.entries.values()].reduce((n, entry) => n + entry.bytes, 0);
      for (const [key, entry] of this.entries) {
        if (this.entries.size <= 8 && total <= 16 * 1024 ** 2) break;
        this.entries.delete(key);
        total -= entry.bytes;
      }
    }
    return graph;
  }
}
