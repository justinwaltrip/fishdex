{ pkgs, lib, config, inputs, ... }:

{
  packages = [
    pkgs.git
    pkgs.bun
    pkgs.nodejs_22
    pkgs.chromium
  ];

  languages.javascript = {
    enable = true;
    bun.enable = true;
    bun.install.enable = true;
  };

  scripts = {
    dev.exec = "bun run dev";
    check.exec = ''
      bun run lint
      bun run format --check
    '';
  };

  enterShell = ''
    clear
  '';
}
