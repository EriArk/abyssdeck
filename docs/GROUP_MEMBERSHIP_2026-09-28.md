# Group membership — 28 September 2026

Group settings now open above the mounted messenger. Owners can invite a person,
remove a member, revoke a pending invitation and transfer ownership to an active
member. Ordinary members retain mute and leave controls. Direct conversations
remain direct and cannot acquire group-management operations.

An invited person explicitly accepts or declines in Communication; invitations
also appear in internal Events. Acceptance grants the complete existing group
history and materials, stated before acceptance. Removal/leave closes subsequent
server access, including file reads and sending. Already downloaded copies remain.
Rejoining requires a new invitation epoch. Replaying a completed acceptance receipt
never recreates membership. Membership changes bind the exact group revision and
actor; a stale list must be refreshed. Pending invitations reserve the existing
eight-person capacity. Ownership transfer revokes pending invitations; an owner
with other members must transfer ownership before leaving.

The existing initial group-creation behavior is unchanged. This pass does not add
presence or modify personal GPT/native/Windows helper contracts.

Validation:

- Nine focused tests passed: communication, membership, help and Team engine
  checkpoint/rollback fault cases. Includes private history/files before acceptance
  and after removal, wrong actor, stale revisions, repeated receipts, declined and
  revoked invitations, ownership, direct-chat rejection, disabled accounts and
  exact membership/invitation/receipt snapshot restoration.
- Hub/shared and web TypeScript checks passed. Changed-file Biome has no errors;
  existing CSS specificity warnings and style suggestions remain.
- Chromium and WebKit: invite/accept/leave through the real test Hub, recipient
  capabilities, mounted composer draft preservation, 16 themed viewport layouts
  each (phone, keyboard-height phone, tablet and wide). Actual screenshots checked
  across all four themes. These are browser checks, not physical iPhone acceptance.

Installed release: `6b75d45`, both actual Hub and engine images. The ordinary idle
guard returned `idle: true`; no forced update was used. Team cold checkpoint and
restore/admission verification succeeded. Maintenance reports `installed`.
Web ID: `a38e7afaeec7137af75c2ae5441120f2dbd6fe6d821f11db68406dc4098822c7`.
Authenticated installed conversation catalog (including invitations), internal
notices and health returned HTTP 200. No invitations/messages were sent in the
live installation; mutation acceptance used isolated test accounts.
Native adapters remain at the verified e845adb hotfix.
