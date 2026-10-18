---
name: beta-deploy
description: Put a branch on the beta at poe2.quest/beta/, ship a change to main, or start a branch from what the beta runs. Use when the user says "put this on beta", "ship it" or "build on beta".
---

# Beta, shipping and building on beta

The beta lives at poe2.quest/beta/ (README, "Beta").

- **"Put this on beta"**: push your branch, then run the *Deploy to GitHub Pages* workflow on `main` with input `beta` set to your branch (GitHub MCP `actions_run_trigger`), watch the run until it's live (if it's cancelled while waiting, run it again), and say so.
- **"Ship it"**: open a PR into `main` and merge it right away; "ship it" is the go-ahead to merge.
- **"Build on beta"**: find the newest successful run of that workflow named *Beta: …* (`actions_list`), read the line `Beta commit: <sha>` from its find-beta job's log (`get_job_logs`), and start your branch from that commit instead of `main` (the branch it came from may have moved on).
