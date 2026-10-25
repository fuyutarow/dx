require "download_strategy"
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
  version "0.1.6"

  depends_on "git"
  depends_on "jj"

  on_macos do
    on_arm do
      # dx-0.1.6-darwin-arm64.tar.gz
      url "https://api.github.com/repos/fuyutarow/dx/releases/assets/656124980",
          using: DxGitHubReleaseDownloadStrategy
      sha256 "02b10714c372ddeb8617709a4929d109995d6a80880559a0900b7aee65297502"
    end

    on_intel do
      # dx-0.1.6-darwin-x64.tar.gz
      url "https://api.github.com/repos/fuyutarow/dx/releases/assets/673995662",
          using: DxGitHubReleaseDownloadStrategy
      sha256 "13700b48178460a79d8d7ee2fdcddd6e60f7094ef2ecde0577eb96e52f5e5800"
    end
  end

  on_linux do
    on_arm do
      # dx-0.1.6-linux-arm64.tar.gz
      url "https://api.github.com/repos/fuyutarow/dx/releases/assets/673995661",
          using: DxGitHubReleaseDownloadStrategy
      sha256 "15ed298bba0730e5687819aeee67d8327af58f8a143f33faedd8bf087ba21602"
    end

    on_intel do
      # dx-0.1.6-linux-x64.tar.gz
      url "https://api.github.com/repos/fuyutarow/dx/releases/assets/656124982",
          using: DxGitHubReleaseDownloadStrategy
      sha256 "b3589ec8d5ecb16e71ae24a0045fbff5d885d995cd21e94c60784a4c7a1aba20"
    end
  end

  def install
    # Homebrew strips the single top-level bin/ directory when staging these archives.
    bin.install "dx"
  end

  test do
    assert_equal "dx #{version}", shell_output("#{bin}/dx -V").strip
  end
end
