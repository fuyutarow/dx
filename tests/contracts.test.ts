import {
  value,
  advance,
  checked,
  dx,
  main,
  markdown,
  repo,
  rows,
  snapshot,
  typeSource,
  write,
} from "./helpers.ts";
import { test, expect } from "bun:test";
import { readdir, readFile, lstat, symlink } from "node:fs/promises";
import { join } from "node:path";
import { readConfig } from "../src/config.ts";
import { CURRENT } from "../src/layout.ts";
import { sha256 } from "../src/formats.ts";
import { version } from "../package.json" with { type: "json" };

const timeout = 60000;

async function helpOutput(
  args: string[],
  env: NodeJS.ProcessEnv,
  columns?: number,
  expectedBytes = 0,
) {
  const cmd = [process.execPath, main, ...args];
  const signal = AbortSignal.timeout(10000);
  if (columns === undefined) {
    const child = Bun.spawn({
      cmd,
      env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      signal,
      killSignal: "SIGKILL",
    });
    const [stdout, stderr, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(signal.aborted).toBe(false);
    expect(exit, stderr).toBe(0);
    expect(stderr).toBe("");
    return stdout;
  }
  const chunks: Buffer[] = [];
  const drained = Promise.withResolvers<void>();
  let bytes = 0;
  signal.addEventListener(
    "abort",
    () => {
      drained.resolve();
    },
    { once: true },
  );
  await using terminal = new Bun.Terminal({
    cols: columns,
    rows: 24,
    data: (_terminal, data) => {
      chunks.push(Buffer.from(data));
      bytes += data.byteLength;
      if (bytes >= expectedBytes) drained.resolve();
    },
  });
  // Disable PTY newline translation so the test compares the actual emitted bytes.
  terminal.outputFlags = 0;
  const child = Bun.spawn({ cmd, env, terminal, signal, killSignal: "SIGKILL" });
  // Process exit may arrive before the final PTY data callback.
  const [exit] = await Promise.all([child.exited, drained.promise]);
  expect(exit).toBe(0);
  expect(signal.aborted).toBe(false);
  return Buffer.concat(chunks).toString("utf8");
}

test(
  "C1: help is identical plain text across color settings, pipes and TTY widths",
  async () => {
    const { FORCE_COLOR: _force, NO_COLOR: _noColor, TERM: _term, ...baseEnv } = process.env;
    const environments: NodeJS.ProcessEnv[] = [
      baseEnv,
      { ...baseEnv, TERM: "dumb" },
      { ...baseEnv, FORCE_COLOR: "1", TERM: "xterm-256color" },
      { ...baseEnv, FORCE_COLOR: "0", NO_COLOR: "1", TERM: "xterm-256color" },
      { ...baseEnv, FORCE_COLOR: "1", NO_COLOR: "1", TERM: "dumb" },
    ];
    for (const args of [
      ["--help"],
      ["-h"],
      ["ls", "--help"],
      ["check", "--help"],
      ["view", "--help"],
    ]) {
      const expected = await helpOutput(args, baseEnv);
      expect(expected).toContain("USAGE:");
      expect(expected).toContain("FLAGS:");
      expect(expected).not.toContain("\u001B");
      for (const [env, columns] of environments.flatMap((environment) =>
        [undefined, 20, 120].map((width) => [environment, width] as const),
      )) {
        const actual = await helpOutput(args, env, columns, Buffer.byteLength(expected));
        expect(actual).not.toContain("\u001B");
        expect(actual).toBe(expected);
      }
    }
    expect(await helpOutput(["--help"], baseEnv)).toContain("--version");
  },
  timeout,
);

test("C1: version flags print the package version and reject repetition", async () => {
  const { cwd } = await repo();
  for (const flag of ["--version", "-V"]) {
    const result = await dx(cwd, flag);
    expect(result).toEqual({ stdout: `semlint ${version}\n`, stderr: "", exit: 0 });
  }
  for (const args of [
    ["--version", "--version"],
    ["-V", "-V"],
  ]) {
    const result = await dx(cwd, ...args);
    expect(result.exit).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("USAGE:");
  }
});

async function inventory(root: string, path = ""): Promise<Record<string, string>> {
  const entries: Record<string, string> = {};
  for (const name of (await readdir(join(root, path))).toSorted()) {
    const relative = path === "" ? name : `${path}/${name}`;
    const absolute = join(root, relative);
    const stat = await lstat(absolute);
    if (stat.isDirectory()) Object.assign(entries, await inventory(root, relative));
    else if (stat.isFile())
      entries[relative] = sha256((await readFile(absolute)).toString("base64"));
  }
  return entries;
}

test(
  "I-07: all four commands are deterministic and leave every repo byte unchanged",
  async () => {
    const { cwd, base } = await repo();
    await write(cwd, "records/a.md", markdown("a"));
    await snapshot(cwd);
    const revision = await advance(cwd);
    await snapshot(cwd);
    await write(cwd, "records/unsnapshotted.md", markdown("not-in-revision"));
    const before = await inventory(cwd);
    const repoBytes = (entries: Record<string, string>) =>
      Object.fromEntries(Object.entries(entries).filter(([path]) =>
        !path.startsWith(".jj/") && !path.startsWith(".git/")
      ));
    for (const args of [["ls", revision], ["check", "--base", revision], ["view", "index", revision], ["view", "--list"]]) {
      const first = await dx(cwd, ...args);
      const second = await dx(cwd, ...args);
      expect(first.exit, first.stderr).toBe(0);
      expect(first).toEqual(second);
      if (args[0] === "ls") expect(rows(first.stdout).map((r) => r.id)).toEqual(["a"]);
    }
    expect(repoBytes(await inventory(cwd))).toEqual(repoBytes(before));
  },
  timeout,
);

test(
  "I-07: missing REV / view fail closed with empty stdout",
  async () => {
    const { cwd } = await repo();
    for (const args of [
      ["ls", "does-not-exist"],
      ["check", "--base", "does-not-exist"],
      ["view", "index", "does-not-exist"],
      ["view", "absent"],
    ]) {
      const result = await dx(cwd, ...args);
      expect(result.exit, `${args.join(",")}: ${result.stderr}`).toBe(4);
      expect(result.stdout).toBe("");
      expect(result.stderr).toStartWith("UNDETERMINED:");
    }
  },
  timeout,
);

test(
  "I-07: malformed / absent policy, throwing checks and wrong callback outputs return 4",
  async () => {
    const { cwd, base } = await repo();
    await write(cwd, "records/a.md", markdown("a"));
    for (const source of [
      "not TypeScript!",
      'export default { name: "note" }',
      typeSource().replace(
        "record.fields.bad === true",
        '(() => { throw Error("failed check"); })()',
      ),
      typeSource()
        .replace("checks: [(record)", "checks: [(_record)")
        .replace(
          'record.fields.bad === true ? [{ check: "quality", id: record.id,\n    path: record.path, field: "bad", message: "bad record" }] : []',
          "42",
        ),
    ]) {
      await write(cwd, ".semlint/note.ts", source);
      await snapshot(cwd);
      const result = await dx(cwd, "check", "--base", base);
      expect(result.exit, result.stderr).toBe(4);
      expect(result.stdout).toBe("");
    }
  },
  timeout,
);

test(
  "limits.record_bytes, limits.records and limits.links_per_record fail closed",
  async () => {
    for (const [config, contents] of [
      ["record_bytes=10", [markdown("a")]],
      ["records=1", [markdown("a"), markdown("b")]],
      ["links_per_record=1", [markdown("a", "next: [b, c]\n"), markdown("b"), markdown("c")]],
    ] satisfies [string, string[]][]) {
      const { cwd, base } = await repo({}, `[limits]\n${config}\n`);
      for (const [index, text] of contents.entries()) await write(cwd, `records/${index}.md`, text);
      await snapshot(cwd);
      const result = await dx(cwd, "check", "--base", base);
      expect(result.exit, result.stderr).toBe(4);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(`limits.${config.split("=")[0]}`);
    }
  },
  timeout,
);

test("configuration defaults match §6 exactly", () => {
  expect(value(readConfig('edition = 1\n[repo]\nname="fixture"\n', CURRENT))).toEqual({
    repo: { name: "fixture", remote: "origin", branch: "alpha" },
    review: {},
    limits: { record_bytes: 4194304, records: 200000, links_per_record: 10000 },
    files: {
      ignore: ["records/raw/**", "tools/**", "README.md", "**/node_modules/**"],
      inputs: [],
      strict: false,
    },
  });
});

test(
  "strict / ignores: report every untyped path, exempt infrastructure and sidecars",
  async () => {
    const { cwd, base } = await repo({}, '[files]\nstrict=true\nignore=["ignored/**"]\n');
    await write(cwd, "unknown.txt", "unknown");
    await write(cwd, "ignored/a.md", "invalid frontmatter");
    const result = await checked(cwd, base, 1);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.check).toBe("files.strict");
    expect(result.findings[0]?.path).toBe("unknown.txt");
  },
  timeout,
);

test(
  "C1: unknown/repeated options, extras, missing values, short options exit 2",
  async () => {
    const { cwd } = await repo();
    for (const args of [
      [],
      ["bogus"],
      ["schema"],
      ["ls", "--bogus"],
      ["ls", "a", "b"],
      ["ls", "-v"],
      ["ls", "-r", "@"],
      ["ls", "--help", "-h"],
      ["check", "--base", "@", "--base=@"],
      ["check", "--base"],
      ["check", "--base="],
      ["view"],
      ["view", "--list", "index"],
      ["view", "--list", "--list"],
      ["view", "a", "b", "c"],
      ["view", "--list=false"],
    ]) {
      const result = await dx(cwd, ...args);
      expect(result.exit, `${args.join(",")}: ${result.stderr}`).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("USAGE:");
    }
    for (const args of [["--help"], ["-h"], ["check", "--help"], ["view", "-h"]]) {
      const result = await dx(cwd, ...args);
      expect(result.exit, result.stderr).toBe(0);
      expect(result.stdout).toContain("USAGE:");
    }
  },
  timeout,
);

test(
  "C1: '--' makes subsequent tokens positional; options may follow REV",
  async () => {
    const { cwd, base } = await repo();
    await write(cwd, "records/a.md", markdown("a"));
    await snapshot(cwd);
    expect((await dx(cwd, "ls", "--", "@")).exit).toBe(0);
    expect((await dx(cwd, "check", "@", `--base=${base}`)).exit).toBe(0);
    expect((await dx(cwd, "view", "--", "index", "@")).exit).toBe(0);
    const result = await dx(cwd, "ls", "--", "--help");
    expect(result.exit).toBe(4);
    expect(result.stdout).toBe("");
  },
  timeout,
);

test(
  "revision loader resolves .dx-relative helpers without touching disk modules",
  async () => {
    const { cwd } = await repo();
    await write(
      cwd,
      ".semlint/helpers/identity.ts",
      "export const identity = file => String(file.fields.id);\n",
    );
    await write(
      cwd,
      ".semlint/note.ts",
      typeSource()
        .replace(
          'import { z } from "zod";',
          'import { z } from "zod"; import { identity } from "./helpers/identity.ts";',
        )
        .replace("id: file => String(file.fields.id)", "id: identity"),
    );
    const base = await advance(cwd);
    await write(cwd, "records/a.md", markdown("a"));
    await checked(cwd, base, 0);
  },
  timeout,
);

test(
  "symlink records cannot expose external files",
  async () => {
    const { cwd } = await repo();
    await write(cwd, "records/placeholder.md", markdown("a"));
    await symlink("/etc/passwd", join(cwd, "records/link.md"));
    await snapshot(cwd);
    const result = await dx(cwd, "ls");
    expect(result.exit).toBe(4);
    expect(result.stdout).toBe("");
  },
  timeout,
);

test(
  "unreadable record formats produce findings in check and exit 4 in ls",
  async () => {
    const { cwd, base } = await repo();
    await write(cwd, "records/a.md", "missing frontmatter");
    const result = await checked(cwd, base, 1);
    expect(result.findings[0]?.check).toBe("format");
    const list = await dx(cwd, "ls");
    expect(list.exit).toBe(4);
    expect(list.stdout).toBe("");
  },
  timeout,
);

test(
  "invalid config and invalid schema declarations fail closed",
  async () => {
    const { cwd } = await repo();
    await write(cwd, "semlint.toml", 'edition = 1\n[repo]\nname="fixture"\n[limits]\nrecords=0\n');
    await snapshot(cwd);
    const config = await dx(cwd, "ls");
    expect(config.exit).toBe(4);
    expect(config.stdout).toBe("");
    await write(cwd, "semlint.toml", 'edition = 1\n[repo]\nname="fixture"\n');
    await write(
      cwd,
      ".semlint/note.ts",
      typeSource().replace(
        "schema: z.looseObject({ id: z.string(), title: z.string().min(1) })",
        "schema: {}",
      ),
    );
    await snapshot(cwd);
    const invalidType = await dx(cwd, "ls");
    expect(invalidType.exit).toBe(4);
    expect(invalidType.stdout).toBe("");
  },
  timeout,
);

test(
  "fileset literals preserve spaces and metacharacters in record paths",
  async () => {
    const { cwd, base } = await repo();
    await write(cwd, 'records/a [0] "quoted".md', markdown("a"));
    await checked(cwd, base, 0);
    const result = await dx(cwd, "ls");
    expect(result.exit, result.stderr).toBe(0);
    expect(rows(result.stdout)[0]?.path).toBe('records/a [0] "quoted".md');
  },
  timeout,
);

test("retired and unknown config keys fail closed", async () => {
  const { cwd } = await repo();
  for (const [section, key] of [
    ["limits", "check_seconds"],
    ["review", "pass"],
    ["limits", "unknown"],
    ["review", "unknown"],
  ] as const) {
    await write(cwd, "semlint.toml", `edition = 1\n[repo]\nname="fixture"\n[${section}]\n${key}=1\n`);
    await snapshot(cwd);
    const invalid = await dx(cwd, "ls");
    expect(invalid.exit).toBe(4);
    expect(invalid.stdout).toBe("");
    expect(invalid.stderr).toContain("UNDETERMINED:");
    expect(invalid.stderr).toContain(key);
    expect(invalid.stderr).not.toContain("warning");
  }
});

test("C4: a later policy failure discards findings already computed for earlier records", async () => {
  const { cwd, base } = await repo();
  await write(cwd, "records/a.md", markdown("a", "bad: true\n"));
  await write(cwd, "records/b.md", markdown("b"));
  await write(
    cwd,
    ".semlint/note.ts",
    typeSource().replace(
      "record.fields.bad === true",
      '(() => { if (record.id === "b") throw Error("later policy failure"); return record.fields.bad === true; })()',
    ),
  );
  await snapshot(cwd);
  const result = await dx(cwd, "check", "--base", base);
  expect(result.exit).toBe(4);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("later policy failure");
});
