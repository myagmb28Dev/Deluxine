# Notion Portfolio Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Notion portfolio main page and four project detail pages into a concise backend-recruiting portfolio while preserving every existing fact, image, link, and technical record.

**Architecture:** Treat each Notion page as an independently verified migration. Fetch the latest content immediately before editing, rebuild one detail page at a time with a shared section template, re-fetch and validate it, and update the main portfolio page only after all detail pages are complete.

**Tech Stack:** Notion connector, Notion-flavored Markdown, targeted page fetch/update operations

## Global Constraints

- Do not commit either the design document or this implementation plan.
- Preserve all existing images, links, quantified results, and technical records.
- Do not present future targets as completed achievements.
- Keep long records available inside named toggles instead of deleting them.
- Use at most one or two gray callouts per page.
- Keep project-detail section names and ordering consistent.
- Fetch a page immediately before every update and re-fetch it immediately afterward.
- Do not update the main portfolio page until all four detail pages pass verification.

---

### Task 1: Redesign the DELUXINE detail page

**Notion page:**
- ID: `341271a5-fe23-8168-b27c-f7fb53516138`
- URL: `https://app.notion.com/p/341271a5fe238168b27cf7fb53516138`

**Produces:** A verified DELUXINE detail page using the shared portfolio template.

- [ ] **Step 1: Fetch the latest page**

Read the page by ID and capture the complete current Markdown. Confirm that it still includes the existing screenshots, refactoring history, OpenRouter additions, tech stack, deployment link, and GitHub link.

- [ ] **Step 2: Build the replacement content**

Use this top-level order:

```markdown
## Project Overview
## My Role
## Key Results
## Architecture & User Flow
## Troubleshooting
## Gallery
<details>
<summary>전체 기술 기록 보기</summary>
	...
</details>
## Tech Stack & Links
```

Keep the first-pass emphasis on OpenRouter model selection, Redis usage limits and failure refunds, server render progress, R2 history and deletion, and the 95-98 percent pose-save reduction. Keep NanoBanana wording only as historical material inside the refactoring record.

- [ ] **Step 3: Update the page**

Use a page-content update that preserves the page title. Include every existing media URL and all links in either the visible flow or the detailed-record toggle.

- [ ] **Step 4: Verify the updated page**

Re-fetch and confirm:

- All nine shared sections exist in order.
- `OpenRouter`, `95~98%`, render progress, render history, and R2 deletion remain present.
- NanoBanana is framed as a former architecture.
- The Vercel and GitHub links remain present.
- Every original image URL remains in the page.

---

### Task 2: Redesign the WindexBar detail page

**Notion page:**
- ID: `390271a5-fe23-8172-a4b3-e2b8a7b25395`
- URL: `https://app.notion.com/p/390271a5fe238172a4b3e2b8a7b25395`

**Produces:** A verified WindexBar detail page using the shared portfolio template.

- [ ] **Step 1: Fetch the latest page**

Confirm that the latest content contains both result screenshots, JSON-RPC integration, session/config parsing, reset-credit limitations, Windows UX, validation, release automation, and all three external links.

- [ ] **Step 2: Build the replacement content**

Apply the shared section order. Above the detailed-record toggle, emphasize:

- `codex app-server` JSON-RPC integration
- Unified `UsageSnapshot` from RPC, JSONL, and config
- Confirmed versus estimated reset-credit information
- Tray, `Alt+O`, and preserved window state
- Automated test, installer, and release flow

Place the two result screenshots together in the Gallery section with English and Korean captions. Preserve secondary implementation and verification details in the toggle.

- [ ] **Step 3: Update the page**

Preserve the title and all links. Avoid callouts for ordinary feature lists; use one callout only if it materially highlights the confirmed-versus-estimated reset-credit decision.

- [ ] **Step 4: Verify the updated page**

Re-fetch and confirm the shared section order, two screenshots, `Alt+O`, JSON-RPC, reset-credit caveat, test/release evidence, GitHub link, Releases link, and Reddit link.

---

### Task 3: Redesign the Paw근 detail page

**Notion page:**
- ID: `362271a5-fe23-81d9-872d-f7c161599c83`
- URL: `https://app.notion.com/p/362271a5fe2381d9872df7c161599c83`

**Produces:** A verified Paw근 detail page whose first pass stays concise despite its large feature set.

- [ ] **Step 1: Fetch the latest page**

Capture the complete page and inventory all architecture, application, and admin screenshots before editing. Confirm the existing API counts, WebSocket mappings, tests, AI workflow, chat, presence, notifications, media, and admin-security records.

- [ ] **Step 2: Build the replacement content**

Apply the shared section order. Keep only four headline strengths visible near the top:

- 157 REST APIs and 6 WebSocket mappings
- Missing-pet and shelter-notice AI similarity workflow
- STOMP chat with ACK/NACK and read-state management
- 71 admin APIs with PassKey MFA and audit logs

Keep Redis presence, FCM, media processing, community/report operations, controller-by-controller detail, and extended screenshots inside the detailed-record or gallery toggles. Keep the architecture image visible.

- [ ] **Step 3: Update the page**

Preserve every image and factual count. Do not turn the 30/50/80 percent future improvement goals into achieved results.

- [ ] **Step 4: Verify the updated page**

Re-fetch and confirm all images remain, the four headline strengths appear above the toggle, extended features remain within the page, test evidence remains present, and future targets remain explicitly framed as goals.

---

### Task 4: Redesign the GBSWER detail page

**Notion page:**
- ID: `341271a5-fe23-8138-b43b-cb8243489f1a`
- URL: `https://app.notion.com/p/341271a5fe238138b43bcb8243489f1a`

**Produces:** A verified GBSWER detail page using the shared portfolio template.

- [ ] **Step 1: Fetch the latest page**

Inventory every product screenshot and confirm the NEIS integration, student/teacher flows, multipart redesign, quantified transfer results, deployment stack, and links.

- [ ] **Step 2: Build the replacement content**

Apply the shared section order. Emphasize NEIS integration for three school-data types, role-aware student and teacher flows, the `@RequestPart` multipart decision, 50 percent fewer API calls, and approximately 30 percent better transfer efficiency than Base64.

Keep one representative product screen visible and organize related screens into two-column groups where supported. Move the extended screen-by-screen feature catalog into the detailed-record toggle.

- [ ] **Step 3: Update the page**

Preserve all images and links. Keep survey and data-reliability context concise in Overview and retain its longer explanation in the toggle.

- [ ] **Step 4: Verify the updated page**

Re-fetch and confirm all shared sections, all original images, NEIS data types, `@RequestPart`, 50 percent call reduction, 30 percent transfer improvement, tech stack, and links remain present.

---

### Task 5: Redesign the main portfolio page

**Notion page:**
- ID: `a15e3ff7-c54c-4aa9-b091-8bca78214d21`
- URL: `https://app.notion.com/p/a15e3ff7c54c4aa9b0918bca78214d21`

**Consumes:** Four verified project-detail pages from Tasks 1-4.

**Produces:** A concise main portfolio page linking to every redesigned detail page.

- [ ] **Step 1: Fetch the latest main page**

Confirm the current profile image, introduction, skills, all four child-page references, project periods, experience, qualifications, TOEIC, and closing text.

- [ ] **Step 2: Build the new main-page content**

Use this order:

```markdown
# 장준혁 · Backend Engineer
## About Me
## Skills
# Projects
## DELUXINE
## WindexBar
## Paw근
## GBSWER
# Experience
# Certificate
```

Keep the profile image beside the short About text. Project cards contain only the project name and period, one-line problem statement, role, two verified results, technology keywords, and exact child-page reference. Keep personal/team classification visible without splitting the page into large repeated two-column blocks.

- [ ] **Step 3: Update the main page**

Preserve all four `<page url="...">` references exactly so child pages are not detached or deleted. Keep the existing external-activity detail inside a named toggle and retain the closing message.

- [ ] **Step 4: Verify the main page**

Re-fetch and confirm:

- The profile image remains.
- The About text is concise and backend-focused.
- Skills appear in three groups.
- Project order is DELUXINE, WindexBar, Paw근, GBSWER.
- All four exact child-page URLs remain.
- Experience, qualifications, TOEIC, and closing text remain available.

---

### Task 6: Perform cross-page visual and content verification

**Produces:** Final evidence that the redesigned portfolio is consistent and complete.

- [ ] **Step 1: Fetch all five pages again**

Verify the main page and every detail page using fresh reads rather than cached results.

- [ ] **Step 2: Check content consistency**

Confirm every detail page uses the shared order and contains a named detailed-record toggle. Confirm no completed-result section contains future-target language.

- [ ] **Step 3: Inspect representative visual states**

Open the main page and each detail page in the browser. Inspect the first viewport and at least one lower technical section at normal desktop width. Check for oversized callouts, excessive line wrapping, isolated headings, uncaptioned primary images, or long uncollapsed feature catalogs.

- [ ] **Step 4: Correct only verified presentation defects**

Apply targeted Notion updates for any defect found in Step 3, then re-fetch the affected page. Do not introduce new claims or broaden the redesign scope.

- [ ] **Step 5: Report completion**

Provide links to all five pages and summarize the verified layout, preserved records, and any content intentionally left inside toggles.
