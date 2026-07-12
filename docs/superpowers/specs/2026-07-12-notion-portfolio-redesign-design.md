# Notion Portfolio Redesign Design

## Goal

Redesign the main Notion portfolio page and the DELUXINE, WindexBar, Paw근, and GBSWER detail pages for backend developer recruiting. The result should borrow the reference portfolio's generous spacing, short sections, strong headings, and restrained visual hierarchy without copying its content or erasing the existing technical evidence.

## Scope

- Main portfolio page
- DELUXINE detail page
- WindexBar detail page
- Paw근 detail page
- GBSWER detail page

Existing facts, images, project links, quantified results, and technical records must be preserved. Long material may be reorganized into toggles, but it must not be discarded.

## Audience and Reading Strategy

The primary audience is backend developer recruiters and technical interviewers. Each page should support two reading depths:

1. A fast first pass that exposes the problem, backend role, technical decisions, and measurable results.
2. A deeper pass through toggles containing implementation details, extended feature lists, validation notes, and retrospective material.

## Visual Principles

- Use large section headings, dividers, and whitespace as the main hierarchy.
- Reserve gray callouts for one or two genuinely important highlights per page.
- Keep first-pass paragraphs to two or three sentences.
- Use bold text for technologies, decisions, and verified outcomes.
- Show one representative image prominently; group related images into columns where possible.
- Place secondary screenshots and long technical records in clearly named toggles.
- Apply the same section order and naming across all project detail pages.
- Do not force a color theme because Notion appearance follows the viewer's settings.

## Main Portfolio Page

### Hero and About

- Keep the profile image in a two-column hero.
- Lead with `장준혁 · Backend Engineer`.
- Replace the long introduction with two concise sentences.
- Surface GitHub, email, and resume links when available.

### Skills

Use three short groups:

- Backend: Spring Boot, NestJS, JPA
- Data and Infra: PostgreSQL, MySQL, Redis, Docker, AWS
- Engineering: REST API, WebSocket, CI/CD, AI Integration

### Projects

Order projects as DELUXINE, WindexBar, Paw근, and GBSWER. Keep personal and team project labels, but replace the current large two-column descriptions with compact project summaries containing:

- Project name and period
- One-line problem statement
- Role
- Two key results
- Technology keywords
- Detail-page link

### Experience

Summarize the 익스팬드 field placement around AI-agent automation, PHP-to-Spring-Boot modernization, and documentation-driven handoff improvement. Preserve the extended explanation in a toggle.

### Certificates and Closing

Present qualifications and TOEIC as a compact list. Keep the existing closing message.

## Shared Project Detail Template

Every project detail page follows this order:

1. Project Hero
2. Overview
3. My Role
4. Key Results
5. Architecture or User Flow
6. Troubleshooting
7. Gallery
8. Detailed Technical Record toggle
9. Tech Stack and Links

### Project Hero

Show the title, one-line summary, period, personal or team classification, role, important links, and one representative image.

### Overview

Explain the user problem, target user, and solution in two or three sentences.

### My Role

Separate the user's implementation ownership from team-wide features. Prefer concrete responsibilities over generic role labels.

### Key Results

Expose three to five verified outcomes. Do not add speculative or target metrics as completed results.

### Architecture or User Flow

Show one architecture image when available and summarize the core flow in four to six steps. Move longer flows into the detailed record toggle.

### Troubleshooting

Keep the three strongest cases visible. Use the same structure for each case:

- Problem
- Cause
- Decision
- Result

Move remaining cases into the detailed record toggle.

### Gallery

Keep primary images in the main flow. Use two columns for related screenshots and move secondary images into a gallery toggle. Add short captions.

### Tech Stack and Links

Use short categorized lists instead of a large gray callout. Keep repository, release, deployment, and public-post links that already exist.

## Project-Specific Emphasis

### DELUXINE

- Mannequin-driven pose adjustment and AI line-art correction
- OpenRouter multi-model rendering
- Redis-based per-user usage limits and failure refunds
- Server-side asynchronous render progress and retry behavior
- R2 result storage, history, ownership checks, and deletion
- 95-98 percent reduction in pose-save requests

Historical NanoBanana material remains in the detailed refactoring record and must be clearly framed as a former architecture.

### WindexBar

- Codex app-server JSON-RPC integration
- Unified usage snapshot from RPC, session JSONL, and config
- Explicit separation of confirmed and estimated reset-credit data
- Windows tray, global shortcut, and window-state behavior
- Automated test, installer, and release pipeline

### Paw근

- 157 REST APIs and 6 WebSocket mappings
- Missing-pet and shelter-notice AI similarity workflow
- STOMP chat with ACK/NACK and read-state management
- Redis presence and FCM notification behavior
- 71 admin APIs, PassKey MFA, and audit logs
- Media validation, transformation, and S3 storage

Only the strongest four items should appear above the fold; the rest belong in the detailed record.

### GBSWER

- NEIS integration for meals, schedules, and timetables
- Role-aware student and teacher workflows
- Multipart request redesign using `@RequestPart`
- 50 percent reduction in API calls
- Approximately 30 percent improvement over Base64 file transfer

## Content Safety and Update Procedure

Before updating each page:

1. Fetch the latest page content.
2. Reconcile it with this design and preserve unrequested edits.
3. Retain child-page references and all existing media URLs.
4. Prefer targeted content updates where practical.
5. Re-fetch the page after the update and verify required sections, links, images, and toggles.

Because large page replacements can remove content, each detail page should be handled and verified individually. The main page should be updated last so its project links can be verified against the completed detail pages.

## Verification Criteria

- All five pages are readable without opening toggles.
- Every project exposes its problem, role, and verified results near the top.
- Existing images, links, and technical facts remain available.
- Long records are preserved in named toggles.
- Section names and order are consistent across four detail pages.
- The main page links to all four redesigned detail pages.
- No speculative target metric is presented as an achieved result.
- Each updated page is re-fetched and checked after writing.
