import { jsonOf } from "../../.dx-preset/zod.ts";
// Offline consumer contract pinned to notes/jev-contract.md's successful request.
import { z } from "zod";
import reference from "./jev-request.json";

const evidence = z.object({
  locator: z.string(),
  status: z.string(),
  content: z.string().optional(),
  original_bytes: z.number().int().nonnegative().optional(),
  supplied_bytes: z.number().int().nonnegative().optional(),
});
const requestSchema = z.strictObject({
  model: z.literal(reference.model),
  state: z.strictObject({
    record: z.string(),
    repository_evidence: z.union([z.array(evidence), z.string()]),
    hex_locators: z.union([z.array(evidence), z.string()]),
  }),
  questions: z
    .record(
      z.string().min(1),
      z.strictObject({
        type: z.literal(reference.questions.blameless.type),
        instructions: z.string().min(1),
        criteria: z.strictObject({ true: z.string().min(1), false: z.string().min(1) }),
      }),
    )
    .refine((questions) => Object.keys(questions).length > 0),
});
const text = await Bun.stdin.text();
const request = jsonOf(requestSchema).safeParse(text);
if (!request.success || Buffer.byteLength(text) > 30000) {
  process.stderr.write("HTTP 422: invalid Jev request\n");
  process.exitCode = 1;
} else {
  await Bun.write("request.json", text);
  process.stdout.write(
    JSON.stringify({
      model: "fake",
      answers: Object.fromEntries(
        Object.keys(request.data.questions).map((id) => [id, { type: "noul", noul: 0.8 }]),
      ),
    }),
  );
}
