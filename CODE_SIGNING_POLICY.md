# Code signing policy

## Windows — unsigned builds

LiveMD is currently distributed as **unsigned** Windows installers. Windows
SmartScreen may show an "Unknown publisher" warning the first time the app is
run.

Code signing is planned for a future release once a signing certificate is
available. Until then:

- Installers are built from this repository using GitHub Actions (public
  workflow, GitHub-hosted runners) and published to
  [GitHub Releases](https://github.com/alexlivre/livemd/releases).
- No signing certificate or private key is stored in this repository.

## Distribution locations

- https://github.com/alexlivre/livemd/releases

## Privacy policy

This program will not transfer any information to other networked systems
unless specifically requested by the user or the person installing or
operating it.

The only automatic network activity is an update check: at startup (at most
once per day) LiveMD queries the public GitHub Releases API to detect whether
a newer version exists. No personal, file or usage data is ever transmitted.
User-provided links are opened in the system browser only on explicit user
action.
