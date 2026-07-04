{ pkgs, lib, config, inputs, ... }:

{
  env.GREET = "Fishdex";

  packages = [
    pkgs.git
    pkgs.bun
    pkgs.nodejs_22
  ];

  languages.javascript = {
    enable = true;
    bun.enable = true;
    bun.install.enable = true;
  };

  scripts.dev.exec = "bun run dev";
  scripts.build.exec = "bun run build";
  scripts.lint.exec = "bun run lint";
  scripts.format.exec = "bun run format";

  enterShell = ''
    echo "🐠 Reef Recall (Fishdex) development environment"
    echo "  bun  $(bun --version)"
    echo "  node $(node --version)"
    echo "  git  $(git --version | cut -d' ' -f3)"
    echo ""
    echo "Available scripts:"
    echo "  dev     - Start dev server"
    echo "  build   - Build for production"
    echo "  lint    - Run ESLint"
    echo "  format  - Run Prettier"
  '';

  # git-hooks.hooks.shellcheck.enable = true;

  # See full reference at https://devenv.sh/reference/options/
}
