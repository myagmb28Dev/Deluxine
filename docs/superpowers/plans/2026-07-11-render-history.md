# Render History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore and paginate every completed render owned by the logged-in user.

**Architecture:** Add the backend history contract to the typed API client, keep paginated history in `App`, and render it in `Sidebar`. Signed image URLs remain in memory only and the first page reloads after a completed render.

**Tech Stack:** React, TypeScript, Axios, Bun test

## Global Constraints

- Preserve the opaque cursor exactly.
- Deduplicate appended pages by `job_id`.
- Do not persist signed output URLs.
- Do not commit; the user will commit.

---

### Task 1: Contract And Page Merge

- [x] Add render history response types and API client method.
- [x] Write a failing test for `job_id` page deduplication.
- [x] Implement and verify the page merge helper.

### Task 2: App State And Refresh

- [x] Load the first page after login.
- [x] Append the next page with the opaque cursor.
- [x] Reload the first page after render completion.

### Task 3: Sidebar History UI

- [x] Replace the single generated output with a paginated thumbnail list.
- [x] Add loading, empty, error, and load-more states.
- [x] Navigate to an item's `session_id` when selected.
- [x] Run tests, build, diff checks, and browser verification.
