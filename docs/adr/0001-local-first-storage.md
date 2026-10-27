# ADR 0001: Local-first persistence

- Status: Accepted for the current product stage
- Date: 2026-10-27

## Context
Rapid, private decision logging must work on mobile and during unreliable connectivity. Accounts and sync add security, operating, and conflict-resolution complexity before they are required.

## Decision
Use IndexedDB as the primary browser store; retain a compatibility localStorage mirror and localStorage fallback. Cache the app shell with a service worker. Keep export/restore first-class.

## Consequences
- Offline reads and writes are possible.
- Data remains bound to the browser profile and origin; device transfer requires JSON backups.
- Multi-device sync is not implied and needs a separate privacy, identity, encryption, and conflict-resolution decision.
- Migrations need explicit schema versions and recovery tests.
