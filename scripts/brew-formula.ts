import { err, ok, safeTry } from "neverthrow";
import { z } from "zod";
import { releasePlatforms } from "./release-platforms.ts";

export const releaseVersion = z.string().regex(/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u);
export const formulaAsset = z.object({
  platform: z.enum(releasePlatforms),
  id: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
});
export type FormulaAsset = z.infer<typeof formulaAsset>;
function variant(version: string, os: string, arch: string, assets: readonly FormulaAsset[]) {
  const asset = assets.find((item) => item.platform === `${os}-${arch}`);
  if (asset === undefined) return err(`missing ${os}-${arch} release archive`);
  return ok(
    `    on_${arch === "arm64" ? "arm" : "intel"} do\n      # semlint-${version}-${os}-${arch}.tar.gz\n      url "https://github.com/fuyutarow/semlint/releases/download/v${version}/semlint-${version}-${os}-${arch}.tar.gz"\n      sha256 "${asset.sha256}"\n    end`,
  );
}

/** Only published, actually downloaded archives may supply these digests. */
export function renderFormula(version: string, assets: readonly FormulaAsset[]) {
  return safeTry(function* () {
    const parsed = z.array(formulaAsset).length(4).safeParse(assets);
    if (
      !releaseVersion.safeParse(version).success ||
      !parsed.success ||
      new Set(assets.map((asset) => asset.platform)).size !== 4
    )
      return err(
        "formula needs a stable version and exactly four distinct platform assets with SHA-256",
      );
    const blocks: string[] = [];
    for (const os of ["darwin", "linux"]) {
      const variants: string[] = [];
      for (const arch of ["arm64", "x64"]) {
        variants.push(yield* variant(version, os, arch, assets));
      }
      blocks.push(
        `  on_${os === "darwin" ? "macos" : "linux"} do\n${variants.join("\n\n")}\n  end`,
      );
    }
    return ok(`class Semlint < Formula
  desc "Revision-based record checks and views for jj repositories"
  homepage "https://github.com/fuyutarow/semlint"
  version "${version}"

  depends_on "git"
  depends_on "jj"

${blocks.join("\n\n")}

  def install
    executables = Dir["*"].select { |path| File.file?(path) && File.executable?(path) }
    if executables.empty?
      executables = Dir["bin/*"].select { |path| File.file?(path) && File.executable?(path) }
    end
    raise "no executables found in archive" if executables.empty?

    bin.install executables
  end

  test do
    assert_equal "semlint #{version}", shell_output("#{bin}/semlint --version").strip
  end
end
`);
  });
}
