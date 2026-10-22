---
name: beta-deploy
description: Put a branch on the beta at poe2.quest/beta/, or start a branch from what the beta runs. Use when the user says "put this on beta" or "build on beta". Not for "ship it", which means merge into main and go live (CLAUDE.md).
---

# Beta and building on beta

The beta lives at poe2.quest/beta/ (README, "Beta").

Put a branch there only when the user's latest message asks for it. An earlier "put this on beta" doesn't cover later changes: after more edits, commit and push the branch and stop. Several sessions run in parallel and share the one beta, so a redeploy nobody asked for overwrites another session's. Don't remind the user that they could put it there either.

- **"Put this on beta"**: push your branch, then run the *Deploy to GitHub Pages* workflow on `main` with input `beta` set to your branch (GitHub MCP `actions_run_trigger`), watch the run until it's live (if it's cancelled while waiting, run it again), and say so.
- **"Build on beta"**: find the newest successful run of that workflow named *Beta: …* (`actions_list`), read the line `Beta commit: <sha>` from its find-beta job's log (`get_job_logs`), and start your branch from that commit instead of `main` (the branch it came from may have moved on).
