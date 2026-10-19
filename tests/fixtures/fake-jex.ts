import { jsonOf, z } from "../../.dx-preset/zod";

const questionsSchema = z.object({
  schema: z.literal(1),
  question: z.array(z.object({ id: z.string(), text: z.string() })).max(8),
});
const controlsSchema = z.object({
  p: z.number().optional(),
  exit: z.number().int().optional(),
  response: z.string().optional(),
  delay_ms: z.number().nonnegative().optional(),
  fail_on_call: z.number().int().positive().optional(),
});

const args = process.argv.slice(2);
const captureDir = args[0] === "--capture-dir" ? (args[1] ?? ".") : ".";
const controlPath = args[2] === "--control-file" ? (args[3] ?? "") : "";
let prefixLength = 0;
if (args[2] === "--control-file") prefixLength = 4;
else if (args[0] === "--capture-dir") prefixLength = 2;
const [questionsPath, ...inputPaths] = args.slice(prefixLength);
if (questionsPath === undefined) process.exit(2);
const questionsText = await Bun.file(questionsPath).text();
const questions = questionsSchema.safeParse(Bun.TOML.parse(questionsText));
if (!questions.success) process.exit(2);

const files: Record<string, string> = {};
for (const path of inputPaths) files[path] = await Bun.file(path).text();
const capture = { questions: questionsText, files, argv: [questionsPath, ...inputPaths] };
const capturePath = `${captureDir}/.jex-capture.json`;
const callsPath = `${captureDir}/.jex-calls`;
const callsFile = Bun.file(callsPath);
const calls = ((await callsFile.exists()) ? Number(await callsFile.text()) : 0) + 1;
await Bun.write(capturePath, JSON.stringify(capture));
await Bun.write(callsPath, String(calls));

const controlsFile = Bun.file(controlPath !== "" ? controlPath : `${captureDir}/.jex-fixture.json`);
const controlsResult = jsonOf(controlsSchema).safeParse(
  (await controlsFile.exists()) ? await controlsFile.text() : "{}",
);
if (
  !controlsResult.success &&
  controlsResult.error.issues.some((issue) => issue.code === "invalid_format")
)
  process.exit(1);
const controls = controlsResult.success ? controlsResult.data : {};
if (controls.delay_ms !== undefined) await Bun.sleep(controls.delay_ms);
if (controls.fail_on_call === calls) process.exit(3);

const output =
  controls.response ??
  JSON.stringify({
    model: "fake",
    bits: questions.data.question.map(({ id }) => ({
      id,
      p: controls.p ?? 0.8,
      reason: `fake reason for ${id}`,
    })),
  });
process.stdout.write(output);
process.exitCode = controls.exit ?? 0;
