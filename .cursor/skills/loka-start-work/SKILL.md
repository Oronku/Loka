---
name: loka-start-work
description: Gate before starting a Loka bug or feature. Requires a work statement, then checks Jira and GitHub for duplicate tickets, branches, and PRs, and rebases onto the latest remote base. Use when the user invokes loka-start-work, starts a Loka bug/feature, or is about to fix something found by walking the app.
disable-model-invocation: true
---

# Loka start work

Do not write product code until this gate passes.

Most Loka work is walking the app, finding a bug, and fixing it. That still needs a work statement, a duplicate check, and a rebase onto the newest remote base.

## Repos

| Area | Path | GitHub | Remote base for new work |
|------|------|--------|--------------------------|
| App (Expo) | `meetloka-front` | `weremain/meetloka-front` (also fetch `urmango`) | `origin/main` |
| API | `Loka` (`backend/`) | `UrMango/Loka` | `origin/dev` |

Search **both** repos unless the user scoped to one. PRs in one repo often have a pair in the other (same `LOKA-XX` or `feat/` name).

Jira: site `remain.atlassian.net`, cloudId `875b3749-6262-4db1-8b59-d881bf81e741`. Search `project in (LOKA, KAN)`.

## Gate — work statement

If the user has **not** said what they will work on, stop and ask. Do not invent the bug.

A valid statement is any of:

- A Jira key (`LOKA-62`)
- A screen + expected vs actual ("Add flight from trip timeline: picking a return date doesn't update the card")
- A named feature ("price tracking on the flight card")

If they already described it in this message, do not re-ask. If it is too vague ("timeline is broken"), ask for:

1. Screen / flow (home, explore, trip timeline, add flight, expenses, chat, auth, …)
2. Expected vs actual
3. Platform (iOS / web) if it matters
4. Ticket key if they have one

Copy this checklist and track it:

```
Start-work:
- [ ] Work statement
- [ ] Jira search
- [ ] GitHub PRs (open + draft) in both repos
- [ ] GitHub / remote branches in both repos
- [ ] Overlap decision (stop if someone else owns it)
- [ ] Fetch + rebase onto remote base
- [ ] Branch ready — then implement
```

## Duplicate search (run in parallel)

Use the work statement as keywords (screen, symptom, LOKA key). Search incomplete work, not only Done.

### Jira

Atlassian MCP `searchJiraIssuesUsingJql`:

```
project in (LOKA, KAN) AND statusCategory != Done AND text ~ "<keywords>" ORDER BY updated DESC
```

If they gave a key, also `getJiraIssue` for that key. Note summary, status, assignee, and linked PRs in the description.

Treat as overlap: In Progress / To Do with a similar summary, or assigned to someone else for the same flow.

### GitHub PRs

```
gh pr list --repo weremain/meetloka-front --state open --search "<keywords>"
gh pr list --repo UrMango/Loka --state open --search "<keywords>"
```

If there is a `LOKA-XX` key, also search that key. Include drafts. Read title, branch, base, author, and whether a paired PR exists in the other repo.

### Branches

```
git fetch --all --prune
```

In **both** repos, match local + remote branch names (`LOKA-*`, `feat/`, `fix/`, `Fix/`):

```
git branch -a | rg -i '<keywords|LOKA-XX>'
```

Front has remotes `origin` and `urmango` — search both.

## Overlap decision

**Stop and show the user** (do not start a parallel fix) when any of these exist:

- Open or draft PR for the same bug/feature
- Remote branch that is clearly the same work
- Jira issue In Progress assigned to someone else for the same work

Show: ticket/PR/branch links, author, and a one-line "this already exists because…". Then ask: join that branch, wait, or still start new work.

If it is related but not the same (same screen, different bug), say so and continue only if the user wants a new fix.

If nothing matches, say so in one sentence and continue.

## Rebase onto the newest remote

After the overlap decision, sync **every repo you will touch**.

Remote base:

- Front → `origin/main`
- Backend → `origin/dev` (PRs target `dev`, not `main`)

If joining an existing branch: check it out, then rebase **that** branch onto the same remote base.

If starting new work:

1. `git fetch --all --prune`
2. If the working tree is dirty, stop and ask (stash / commit / discard). Never destroy local work.
3. Checkout the remote base (`main` / `dev`) and fast-forward: `git pull --ff-only`
4. Create a branch from that tip:
   - Ticket: `LOKA-<n>-short-slug` (existing convention)
   - Bug, no ticket: `fix/short-slug`
   - Feature, no ticket: `feat/short-slug`
5. If already on a feature branch you will keep: `git rebase origin/main` (front) or `git rebase origin/dev` (backend). Do not merge the base in.

If rebase conflicts: stop, report the conflicting files, do not invent a resolution unless the user asks.

## After the gate

Only then implement. For app-flow bugs, reproduce the stated flow and verify the same flow after the fix (including other surfaces that share the state).

Front UI/trip-shell: follow repo `AGENTS.md` (DESIGN.md, loka-voice, design tokens).

Do not open a PR in this skill unless the user asks.

## Report (before coding)

```
Work: <one sentence>
Overlap: none | <PR/branch/ticket + owner>
Base: <repo> rebased onto <origin/main or origin/dev> @ <short sha>
Branch: <name>
Next: <what you will change>
```
