# Block Clash: Arena — Online 1v1 Security Specification

## 1. Data Invariants
1. **No Room Enumeration**: Collection-level `list` queries on `/rooms` and `/rooms/{roomCode}/players` are strictly forbidden (`allow list: if false`). Players can only access a room by knowing its exact 4-letter uppercase `roomCode` (`^[A-Z]{4}$`).
2. **Master Gate & Atomicity**: A player document at `/rooms/{roomCode}/players/{role}` (`role in ['host', 'guest']`) cannot be created unless its parent room exists after the atomic write (`getAfter`) and the parent room's `hostId`/`guestId` matches the player's `playerId`.
3. **Immutable Identities & Creation Timestamps**: Once created, `roomCode`, `hostId`, `hostName`, `matchType`, and `createdAt` can never be altered. Once a guest joins, `guestId` and `guestName` become immutable.
4. **Action-Based Room State Machine**: Room updates only permit explicit named state transitions (`join`, `startPlaying`, `suddenDeath`, `finish`, `voteRematch`, `startRematch`, `abandon`) with exact `affectedKeys().hasOnly(...)` allowlists.
5. **Terminal State Locking**: Once a room transitions to `status == 'abandoned'`, no further updates are permitted on the room or its player documents.
6. **Strict Payload Boundaries (Denial-of-Wallet Guard)**: Every string has a hard `.size()` limit and regex constraint (e.g., `grid` is strictly 200 characters matching `^[.IOTSZJLGB]{200}$`), every numeric field is bounded, and all timestamps must equal `request.time`. No PII is ever stored.

## 2. Dirty Dozen Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. **Room Enumeration Scraping**: `LIST /rooms` -> Denied (`allow list: if false`).
2. **ID Poisoning**: `CREATE /rooms/AAAAAA_1KB_JUNK` -> Denied (`isValidRoomCode` enforces `^[A-Z]{4}$`).
3. **Shadow / Ghost Field Injection**: `CREATE /rooms/CLSH` with extra key `isAdmin: true` -> Denied (`hasOnly` check in `isValidRoom`).
4. **Timestamp Forgery**: `CREATE /rooms/CLSH` with client-supplied `createdAt: Timestamp(2020-01-01)` -> Denied (`incoming().createdAt == request.time`).
5. **State Shortcutting**: `CREATE /rooms/CLSH` with `status: 'finished'` and `winnerRole: 'host'` -> Denied (create requires `status == 'waiting'`).
6. **Host Hijacking on Join**: `UPDATE /rooms/CLSH` during Join attempting to overwrite `hostId` -> Denied (`affectedKeys().hasOnly(...)` + immutability check).
7. **Double-Join / Guest Hijacking**: `UPDATE /rooms/CLSH` attempting to replace `guestId` after a guest has already joined -> Denied (`existing().guestId == ''` gate).
8. **Orphaned Player Creation**: `CREATE /rooms/ZZZZ/players/host` when `/rooms/ZZZZ` does not exist -> Denied (`existsAfter` Master Gate).
9. **Role Spoofing**: `CREATE /rooms/CLSH/players/guest` with `playerId` that does not match `room.guestId` -> Denied (`getAfter` relational identity check).
10. **Grid / Value Poisoning**: `UPDATE /rooms/CLSH/players/host` with a 50KB `grid` string or invalid characters -> Denied (`grid.size() == 200 && grid.matches('^[.IOTSZJLGB]{200}$')`).
11. **Post-Abandonment Mutation**: `UPDATE /rooms/CLSH` after `status == 'abandoned'` -> Denied (Terminal State Lock).
12. **Client-Side Deletion**: `DELETE /rooms/CLSH` or `DELETE /rooms/CLSH/players/host` -> Denied (`allow delete: if false`).
