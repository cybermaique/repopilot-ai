# Development workflow

Use GitHub Flow with `master` as the main branch. There is no `develop`. The first implementation is `feat/bootstrap-v0.1.0`; follow-up work uses short `feat/*`, `fix/*`, `docs/*` or `chore/*` branches from the current master.

Before working, inspect the directory, `git status --short --branch`, `git log`, and `git remote -v`. Preserve uncommitted work and existing history. An empty, clean, unborn master receives `git commit --allow-empty -m "chore: initialize repository"`. Never configure a fictitious identity or reset someone else's work.

Review each diff and stage only relevant files. Use English Conventional Commits: feat, fix, chore, docs, test, refactor. Keep commits coherent and reviewable. Actual environment files, secrets, dependencies, builds and temporary artifacts must remain ignored.

## Integration

Push and PR creation are manual, separately authorized steps. After local work is ready:

```sh
git push -u origin feat/bootstrap-v0.1.0
gh pr create --base master --head feat/bootstrap-v0.1.0 --title "feat: bootstrap RepoPilot AI" --body-file .local/pr-body.md
```

Prepare the PR body using `.github/pull_request_template.md`, including actual validation and limitations. Review and required CI checks precede integration into master. CI runs on PRs targeting master and pushes to master with only the demo provider and local database.

The remote had no branch refs during bootstrap (`git ls-remote --heads origin`). Before the first PR, a later authorized publication must establish the initial main branch with `git push origin master`, then push the feature branch. The local master points only to the initial empty commit; this publishes the base and does not merge the implementation. If remote history appears meanwhile, inspect it and adapt without overwriting it. No push was executed in bootstrap.

## Product version

Use a coordinated product version across private workspace packages. Start bootstrap at `0.0.0`. Target `v0.1.0` for phases 0 and 1. Prepare `0.1.0` only when acceptance is satisfied; do not mark the increment complete while critical verification is pending. Update `CHANGELOG.md` with real changes and limitations. No package publication or complex release automation.

After review, integration, and validation on master, a maintainer can tag the integrated commit:

```sh
git switch master
git pull --ff-only
git tag -a v0.1.0 -m "RepoPilot AI v0.1.0"
git push origin v0.1.0
```

These commands are instructions for a later authorized release, not actions performed by bootstrap. Never tag v0.1.0 on the feature branch.
