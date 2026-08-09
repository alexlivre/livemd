# Code signing policy

This project signs and distributes release artifacts for Windows.

## Windows — SignPath Foundation (pending)

LiveMD is applying to the [SignPath Foundation](https://signpath.org) free OSS code-signing program.

Planned statement (required by the program, once approved):

> Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org)

Status: Pending approval.

### What will be signed

- Windows installer packages (`.exe`) published on [GitHub Releases](https://github.com/alexlivre/livemd/releases).

### Build and signing process

- Artifacts are built from this repository using GitHub Actions (public workflow, GitHub-hosted runners).
- Only CI-built artifacts are submitted to SignPath for signing.
- The private key is held by SignPath (HSM-backed). This project does not store the private key.

### Team roles (single-maintainer project)

- **Authors** (commit access, may modify the repository without additional reviews):
  - https://github.com/alexlivre
- **Reviewers** (review required for changes proposed by non-committers, e.g. pull requests):
  - https://github.com/alexlivre
  - Policy: all external pull requests are reviewed by the maintainer before merge.
- **Approvers** (approve each signing request):
  - https://github.com/alexlivre
  - Policy: each signing request requires explicit approval by the maintainer.

## Distribution locations

- https://github.com/alexlivre/livemd/releases

## Privacy policy

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it.

The only automatic network activity is an update check: at startup (at most once per day) LiveMD queries the public GitHub Releases API to detect whether a newer version exists. No personal, file or usage data is ever transmitted. User-provided links are opened in the system browser only on explicit user action.
