import { cli, command, type Renderers } from "cleye";
import { z } from "zod";

/** Keep cleye's help content while fixing decoration and layout across environments. */
function renderPlainHelp(nodes: Parameters<Renderers["render"]>[0], renderers: Renderers): string {
  renderers.bold = (text) => text.toUpperCase();
  const table = renderers.table.bind(renderers);
  renderers.table = ({ tableData }) =>
    table({
      tableData,
      tableOptions: {
        stdoutColumns: 1000,
        columns: [
          { width: "content-width", paddingLeft: 2, paddingRight: 8 },
          { width: "content-width" },
        ],
      },
    });
  return renderers.render(nodes);
}

export const invocationSchema = z.object({
  command: z.enum(["ls", "check", "view", "schema"]),
  rev: z.string().default("@"),
  base: z.string().optional(),
  name: z.string().optional(),
  list: z.boolean().default(false),
});
export type Invocation = z.infer<typeof invocationSchema>;
function usage(reason: string): never {
  process.stderr.write(`USAGE: ${reason}\nRun dx --help\n`);
  process.exit(2);
}
/** Cleye owns parsing/help. This extra gate rejects repeat flags and extra positionals. */
export function parseInvocation(args: string[]): Invocation | undefined {
  const commands = ["ls", "check", "view", "schema"];
  const name = args[0];
  if (name === undefined) usage("a command is required");
  if (name !== "--help" && name !== "-h" && !commands.includes(name))
    usage(`unknown command: ${name}`);
  const seen = new Set<string>();
  if (name === "--help" || name === "-h") seen.add("--help");
  const positional: string[] = [];
  let ended = false;
  for (let i = 1; i < args.length; i += 1) {
    const token = args[i];
    if (token === undefined) continue;
    if (ended) {
      positional.push(token);
      continue;
    }
    if (token === "--") {
      ended = true;
      continue;
    }
    if (!token.startsWith("-") || token === "-") {
      positional.push(token);
      continue;
    }
    const flag = token.split("=")[0] ?? token;
    const allowed =
      flag === "--help" ||
      flag === "-h" ||
      (name === "check" && flag === "--base") ||
      (name === "view" && flag === "--list");
    if (!allowed) usage(`unknown option: ${token}`);
    const key = flag === "-h" ? "--help" : flag;
    if (seen.has(key)) usage(`repeated option: ${flag}`);
    seen.add(key);
    if (flag === "--base") {
      if (token.includes("=")) {
        if (token.slice(token.indexOf("=") + 1) === "") usage("--base needs a REV");
      } else {
        const value = args[i + 1];
        if (value === undefined || value.startsWith("-")) usage("--base needs a REV");
        i += 1;
      }
    } else if (flag !== token) usage(`option does not take a value: ${token}`);
  }
  if (positional.length > (name === "view" ? 2 : 1)) usage("too many positional arguments");
  if (seen.has("--list") && (positional.length > 0 || seen.size > 1))
    usage("--list must be used alone");
  if (name === "view" && positional.length === 0 && !seen.has("--list") && !seen.has("--help"))
    usage("view needs a name or --list");
  const parsed = cli(
    {
      name: "dx",
      strictFlags: true,
      help: {
        version: "0.1.0",
        description: "Read and check records in a jj revision",
        render: renderPlainHelp,
      },
      commands: [
        command({
          name: "ls",
          parameters: ["[REV]"],
          help: { description: "List records as JSONL", render: renderPlainHelp },
        }),
        command({
          name: "check",
          parameters: ["[REV]"],
          flags: { base: String },
          help: {
            description: "Report all findings; reject newly introduced findings",
            render: renderPlainHelp,
          },
        }),
        command({
          name: "view",
          parameters: ["[name]", "[REV]"],
          flags: { list: Boolean },
          help: { description: "Compute a view, or list available views", render: renderPlainHelp },
        }),
        command({
          name: "schema",
          parameters: ["[type]"],
          help: { description: "Print JSON Schema for one or all types", render: renderPlainHelp },
        }),
      ],
    },
    undefined,
    args,
  );
  if (parsed.command === undefined) return undefined;
  const base = parsed.command === "check" ? parsed.flags.base : undefined;
  return invocationSchema.parse({
    command: parsed.command,
    rev: positional[parsed.command === "view" ? 1 : 0] ?? "@",
    ...(base === undefined ? {} : { base }),
    ...(parsed.command === "view" || parsed.command === "schema" ? { name: positional[0] } : {}),
    list: parsed.command === "view" && parsed.flags.list === true,
  });
}
