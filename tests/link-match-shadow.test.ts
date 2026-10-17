import { expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { sha256 } from "../src/formats.ts";
import { readSnapshot, ruleFiles } from "../src/collection.ts";
import { readConfig } from "../src/config.ts";
import { loadTypes } from "../src/policy.ts";
import { advance, main, processRun, rows, value, write } from "./helpers.ts";

// Opt in to a read-only source snapshot and a detached temporary repository.
// Keep the copies and raw results so a coordinator can inspect every difference.
test.skipIf(process.env.DX_LINK_MATCH_SHADOW !== "1")(
  "soks own checks and declarative links differ only on missing supersedes targets",
  async () => {
    const source = process.env.DX_LINK_MATCH_SOKS ?? "/home/fuyu/Workspace/soks.ws/ws_dx-shadow";
    const cwd = await mkdtemp(join(tmpdir(), "dx-link-match-shadow-"));
    const run = (cmd: string[]) => processRun(cwd, cmd, 300000);
    for (const path of [".dx", "dx.toml", ".leakcheck"])
      await cp(join(source, path), join(cwd, path), { recursive: true });
    // Derived inputs belong to the policy snapshot, so adding the corpus later
    // does not manufacture I-09 findings for simultaneous input/record edits.
    for (const path of ["knowledge/index.md", "knowledge/types.json", "knowledge/log.md"]) {
      if (await Bun.file(join(source, path)).exists())
        await write(cwd, path, await readFile(join(source, path), "utf8"));
    }
    const policyPath = ".dx/helpers/type.ts";
    const originalPolicy = await readFile(join(cwd, policyPath), "utf8");
    expect(originalPolicy).toContain("links: { sok_supersedes: { to: role } },");
    // The baseline measures soks's custom checks without dx's pre-existing
    // supersedes links, which already diagnose the approved nine missing targets.
    const baselinePolicy = originalPolicy.replace(
      "links: { sok_supersedes: { to: role } },",
      "links: {},",
    );
    await write(cwd, policyPath, baselinePolicy);
    expect((await run(["jj", "git", "init", "--colocate"])).exit).toBe(0);
    await advance(cwd);
    await cp(join(source, "knowledge"), join(cwd, "knowledge"), { recursive: true });
    const corpusRevision = await advance(cwd);
    const before = await run([process.execPath, main, "check", "--base", "root()"]);
    expect(before.exit, before.stderr).toBe(1);
    const baseline = rows(before.stdout);
    const declaration = `links: {
      sources: {
        to: ["evi", "sok", "pro", "led"],
        acyclic: false,
        match: "^(urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$",
        values: value => z.array(z.unknown()).safeParse(value).data?.flatMap(entry => {
          const resource = z.object({ resource: z.string() }).safeParse(entry);
          return resource.success ? [resource.data.resource] : [];
        }) ?? [],
      },
      sok_supersedes: {
        to: role,
        match: "^(urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$",
      },
    },`;
    await write(
      cwd,
      policyPath,
      originalPolicy.replace("links: { sok_supersedes: { to: role } },", declaration),
    );
    await advance(cwd);
    const after = await run([process.execPath, main, "check", "--base", "root()"]);
    const unchanged = await run([process.execPath, main, "check", "--base", corpusRevision]);
    expect(after.exit, after.stderr).toBe(1);
    expect(unchanged.exit, unchanged.stderr).toBe(0);
    // ls deliberately refuses a partial corpus when existing format findings are
    // present. Inspect the same collected records through the library instead.
    const types = value(await loadTypes(value(await ruleFiles(cwd, "@", 300000))));
    const config = value(readConfig(await readFile(join(cwd, "dx.toml"), "utf8")));
    const collected = value(await readSnapshot(cwd, "@", config, types, 300000));
    const current = rows(after.stdout);
    const internal = current.filter((f) => String(f.check).startsWith("I-04."));
    const sourceFindings = internal.filter((f) => String(f.field).startsWith("sources:"));
    const missingSupersedes = internal.filter(
      (f) => f.check === "I-04.target" && String(f.field).startsWith("sok_supersedes:"),
    );
    // All sources edges opt out of cycle detection. Any remaining cycle is in
    // the supersedes graph and must be reported without stopping the audit.
    const supersedesCycles = internal.filter((f) => f.check === "I-04.cycle");
    const unexpectedLinks = internal.filter(
      (f) =>
        !sourceFindings.includes(f) &&
        !missingSupersedes.includes(f) &&
        !supersedesCycles.includes(f),
    );
    const sourceDifferences = sourceFindings.filter(
      (f) =>
        !baseline.some(
          (old) =>
            old.check === "soks.LOCALITY" &&
            old.path === f.path &&
            old.message ===
              `internal source UUID URN does not resolve uniquely: ${String(f.field).slice("sources:urn:uuid:".length)}`,
        ),
    );
    const customSourceFindings = baseline.filter(
      (f) =>
        f.check === "soks.LOCALITY" &&
        String(f.message).startsWith("internal source UUID URN does not resolve uniquely:"),
    );
    const missingSourceFindings = customSourceFindings.filter(
      (old) =>
        !sourceFindings.some(
          (f) =>
            f.path === old.path &&
            String(f.field) ===
              `sources:urn:uuid:${String(old.message).slice("internal source UUID URN does not resolve uniquely: ".length)}`,
        ),
    );
    const custom = current.filter((f) => !String(f.check).startsWith("I-04."));
    const customChanged = custom.filter(
      (f) => !baseline.some((old) => JSON.stringify(old) === JSON.stringify(f)),
    );
    const customRemoved = baseline.filter(
      (old) => !custom.some((f) => JSON.stringify(old) === JSON.stringify(f)),
    );
    const grandfathered = rows(unchanged.stdout).filter(
      (f) => f.check === "I-04.target" && String(f.field).startsWith("sok_supersedes:"),
    );
    const records = collected.records;
    const supersedesProvenance = missingSupersedes.map((f) => ({
      path: f.path,
      id: f.id,
      field: f.field,
      targetExists: records.some((r) => r.id === String(f.field).slice("sok_supersedes:".length)),
      newAgainstUnchangedCorpus: grandfathered.find((g) => g.key === f.key)?.new,
    }));
    const receipt = {
      measuredAt: Temporal.Now.instant().toString(),
      source,
      copy: cwd,
      corpusRevision,
      policySha256: sha256(originalPolicy),
      corpusManifestSha256: sha256(
        JSON.stringify(records.map((r) => ({ id: r.id, path: r.path, sha256: r.sha256 }))),
      ),
      counts:
        "deduplicated JSONL finding rows; source agreement compares path+target; supersedes count is missing reference edges, not unique target ids",
      versionChoice: "private alpha remains 0.1.0; no release or changeset",
      declaration,
      before: { exit: before.exit, findings: baseline.length },
      after: { exit: after.exit, findings: current.length },
      unchanged: { exit: unchanged.exit, findings: rows(unchanged.stdout).length },
      records: records.length,
      sourceFindings,
      customSourceFindings,
      sourceDifferences,
      missingSourceFindings,
      missingSupersedes,
      supersedesCycles,
      supersedesProvenance,
      unexpectedLinks,
      customChanged,
      customRemoved,
    };
    await mkdir(join(cwd, "comparison"));
    for (const [label, result] of [
      ["before", before],
      ["after", after],
      ["unchanged", unchanged],
    ] as const) {
      await write(cwd, `comparison/${label}.jsonl`, result.stdout);
      await write(cwd, `comparison/${label}.stderr`, result.stderr);
    }
    await write(
      cwd,
      "comparison/records.jsonl",
      records.map((r) => JSON.stringify(r)).join("\n") + "\n",
    );
    await write(cwd, "comparison/receipt.json", JSON.stringify(receipt, null, 2) + "\n");
    const output = process.env.DX_LINK_MATCH_RECEIPT;
    if (output !== undefined) await Bun.write(output, JSON.stringify(receipt, null, 2) + "\n");
    process.stderr.write(`shadow comparison: ${cwd}/comparison/receipt.json\n`);
    expect(sourceDifferences).toEqual([]);
    expect(missingSourceFindings).toEqual([]);
    expect(unexpectedLinks).toEqual([]);
    expect(customChanged).toEqual([]);
    expect(customRemoved).toEqual([]);
    expect(missingSupersedes).toHaveLength(9);
    expect(
      supersedesProvenance.every((f) => !f.targetExists && f.newAgainstUnchangedCorpus === false),
    ).toBe(true);
  },
  1200000,
);
