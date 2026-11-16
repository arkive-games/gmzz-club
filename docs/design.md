# Club system design

## Runtime

An independent Go HTTP API with a Taro mini-program client. The production binary
contains only the API; the optional React browser client is developed separately.
PostgreSQL is the only supporting service. No Redis, queues, object storage, Arkive API,
or live game-data service is required.

The visual language follows Arkive: neutral surfaces, rounded panels, a warm primary
action, blue selection and focus, light/dark themes, and a compact sidebar. The game
catalog is a small, checked-in extract of the existing Arkive GMZZ dataset. No scoring
formulas or map engines are imported.

## Accounts and clubs

- Registration always creates an ordinary account. An operator explicitly promotes a
  known account with the CLI. Registration order does not grant administrative access.
- Platform administrators may create clubs, selecting another registered user as the
  initial owner in the same transaction. The creator is not enrolled. Platform status
  alone grants no access to another club's roster, applications, or events.
- A user may join multiple clubs. Joining requires an application and approval by an
  existing club owner or administrator. Rejected applicants can reapply.
- Club owners can change roles and remove members, including other owners if another
  owner remains. Administrators can approve applications, remove ordinary members,
  manage events and lineups, and unbind any club character. They cannot change roles
  or remove peer administrators/owners. Ordinary members see the roster and lineups
  and manage their own characters and signups.
- At least one owner must exist. The last owner cannot be demoted. If they are the only
  member, leaving dissolves the club and unbinds characters; with other members they
  must first promote another owner. This interprets the single-user exception as
  dissolution on leaving, preserving the nonempty-club owner invariant.

## Characters

- Every character belongs to one account and zero or one club. Accounts and club
  memberships are separate; joining does not automatically bind characters.
- Only a character's account can bind it, and only to a club that account belongs to.
  Club administrators may unbind characters but cannot edit personal profiles or
  bind another user's character. Composite foreign keys enforce membership on binding.
- Profiles store profession, a manually entered score, owned grades for all 18 relics,
  and sparse lists of frequently used puppet and fellow skills with levels. Grade 0
  is the highest relic grade; an omitted relic means unowned, not grade 0.
- Default loadouts select a pathway talent, up to three relics, one puppet skill and
  one fellow skill. Defaults must come from the profile's inventory. Healing spectator
  talent 201 requires `yuxin` or `other`; other talents carry no healing category.
- A lineup slot snapshots the name, pathway, score and selected loadout. Admin changes
  in an event do not modify the character's defaults. On subsequent lineup saves,
  identity/pathway/score are refreshed from the current profile; loadout values remain
  event-specific and are validated against the current pathway.

## Activities and teams

- Club owners/administrators create activities with start time, signup deadline and
  1–20 teams. All club members can see every activity and its final lineup.
- Signups are per character. Users can enroll multiple bound characters. Signing up
  and cancelling are permitted only while database time is strictly before deadline.
  Equality is closed. All times are stored as `timestamptz`; the UI uses the browser's
  local timezone and synchronizes its clock offset with the API.
- Event time/deadline become immutable after the deadline, preventing reopening.
  Club administrators can still adjust the lineup after the deadline.
- Each team has five columns (squads), six rows (positions). The position is
  `squad * 6 + row`. A character may appear only once across all teams in an event.
- New events default to three teams. Administrators can add teams (up to 20) or
  delete any team while retaining at least one, including after signup cutoff.
  Deletion returns its characters to the candidate pool, retains signups, and
  compacts later team numbers atomically. Team changes use the lineup revision.
- Administrators can drag candidates onto positions, drag assigned characters to
  empty positions, or swap occupied positions while preserving their event loadouts.
  Hovering a team tab during a drag switches the destination team. Dropping a
  candidate on an occupied position returns the replaced character to the pool.
  Click-based selection remains available. Both candidate surfaces share pathway
  tags and combine them with text search and the registered-only filter.
- The candidate list shows signed-up characters first. Administrators may also select
  other bound club characters. Signups and lineup inclusion are distinct concepts.
- Every lineup update submits all slots and an expected revision. Stale edits get
  HTTP 409, and the UI allows refreshing. Each save is atomic.
- Leaving, unbinding and deletion clean up affected signups/slots. A user cannot use
  these operations to cancel a locked signup for an activity that has not started.
  Club administrators may remove other members/characters as administrative actions.
  Character deletion is blocked while there are locked signups for future activities.

## Integrity and operations

All API mutations acquire a PostgreSQL transaction advisory lock. For this small club
application, deliberately serializing writes keeps role checks, last-owner counts,
membership changes and deadline checks coherent across multiple application instances.
Reads remain concurrent. Membership checks occur inside the transaction. Deadline
checks use `clock_timestamp()` after lock acquisition, so waiting requests cannot use
an old transaction start time to enroll after cutoff.

SQL parameters, foreign keys, check constraints and unique indexes supplement application
validation. Startup applies the idempotent version-1 schema under a separate migration
lock. Future incompatible changes require ordered migrations rather than modifying the
initial DDL. Passwords use bcrypt; random sessions are hashed in the database and sent
in HttpOnly/SameSite cookies. HTTPS deployments enable Secure cookies. Same-origin
checks protect mutations, and a bounded global login/register window limits expensive
password operations. No credentials are stored in localStorage.

Current scope intentionally excludes email verification, password-reset delivery,
OAuth, notifications and a public club directory for anonymous visitors. Account
recovery needs an operator workflow or a later feature. Deployment and remote Git
publication are separate actions from local project creation.
