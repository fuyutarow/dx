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
    `    on_${arch === "arm64" ? "arm" : "intel"} do\n      # dx-${version}-${os}-${arch}.tar.gz\n      url "https://api.github.com/repos/fuyutarow/dx/releases/assets/${asset.id}",\n          using: DxGitHubReleaseDownloadStrategy\n      sha256 "${asset.sha256}"\n    end`,
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
    return ok(`require "download_strategy"
require "utils/github"

# Keep authentication out of the formula URL/specs and use Homebrew's existing credentials.
class DxGitHubReleaseDownloadStrategy < CurlDownloadStrategy
  def initialize(url, name, version, **meta)
    super
    token = GitHub::API.credentials
    raise CurlDownloadStrategyError.new(url, "Authenticate gh or set HOMEBREW_GITHUB_API_TOKEN") if token.nil?

    @meta[:headers] = ["Accept: application/octet-stream", "Authorization: token #{token}"]
  end
end

class Dx < Formula
  desc "Revision-based record checks and views for jj repositories"
  homepage "https://github.com/fuyutarow/dx"
  version "${version}"

  depends_on "git"
  depends_on "jj"

${blocks.join("\n\n")}

  def install
    # Homebrew strips the single top-level bin/ directory when staging these archives.
    bin.install "dx"
  end

  test do
    assert_equal "dx #{version}", shell_output("#{bin}/dx --version").strip
  end
end
`);
  });
}
