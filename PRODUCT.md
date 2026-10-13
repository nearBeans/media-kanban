# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are individuals who track media they want to watch, read, or play, often across multiple series and statuses. They manage personal backlog, keep attention on what is in progress, and move items between phases without losing context.

## Product Purpose

Media Kanban helps people maintain a clear personal queue for manga, anime, light novels, and games. The product exists to turn a scattered list of interests into an actionable board that can be reviewed quickly, organized by status, and exported for later planning.

## Positioning

The product is a lightweight, private media-tracking board built around a kanban workflow rather than a general-purpose project manager. It distinguishes itself by centering the media-consumption lifecycle, the tag taxonomy, and fast personal use on a single board.

## Operating Context

The app is used by a single person on a personal device, often while browsing or planning media consumption. Work happens in a browser, with a small number of statuses and tags, and the user expects a fluid board that supports quick edits, drag-and-drop movement, and CSV export.

## Capabilities and Constraints

- Supports four workflow states: 未視聴・未読, 視聴中・読書中, 完結・読了, and 断念.
- Supports selecting one or more media types per card: マンガ, アニメ, ラノベ, and ゲーム.
- Allows creating, updating, deleting, and reordering cards.
- Exposes a table view for filtering and searching by title and tag.
- Requires authentication and account recovery flows with passkeys and email-based recovery.
- Keeps the product focused on a personal backlog, not team collaboration or shared project data.

## Brand Commitments

The project name is Media Kanban and its experience is rooted in a practical, calm personal-planning feel. The user-facing language is Japanese and the product intentionally uses direct, task-oriented copy rather than marketing language.

## Evidence on Hand

- `index.html` defines the app's core screens and board structure.
- `src/ts/main.ts` implements the board, filters, account flows, and card editing behavior.
- `src/css/style.css` contains the current visual system and interaction styling.
- The board categories and tags reflect the actual application domain of media consumption tracking.

## Product Principles

- Keep the queue understandable at a glance.
- Make progression feel immediate and low-friction.
- Preserve personal ownership and minimal cognitive overhead.
- Keep the interface readable, responsive, and calm under repeated use.

## Accessibility & Inclusion

The app should remain operable with keyboard input and touch interactions, and it should provide readable contrast and clear labels. The product does not currently declare a special accessibility requirement beyond support for a general user base and clear status semantics.
