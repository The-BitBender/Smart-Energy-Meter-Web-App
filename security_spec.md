# Security Specification: ESP32 Smart Energy Meter & Anomaly System

## 1. Data Invariants
- A Meter cannot exist without a valid `ownerUid` that matches the authenticated caller `request.auth.uid`.
- A user cannot read, query, update, or delete another user's energy meters, telemetry logs, or anomaly alerts.
- Relay state can only be toggled between "ON" and "OFF".
- Telemetry logs belong to a meter; subcollection writes require ownership of the parent meter or valid auth matching `ownerUid`.
- Anomaly alerts cannot be spoofed or created for a meter that belongs to another user.
- User profile data is restricted strictly to the user matching `{userId} == request.auth.uid`.

## 2. The Dirty Dozen Payloads (Targeting Vulnerabilities)
1. **Unauthenticated Read of Meter Records**: Attempting to list `/meters` without auth -> Rejected (PERMISSION_DENIED).
2. **Cross-Tenant Meter Snooping**: User B attempting `get(/meters/{userA_meter})` -> Rejected (PERMISSION_DENIED).
3. **Spoofed Owner UID on Creation**: User A creating a meter with `ownerUid: "victim_user_b"` -> Rejected (PERMISSION_DENIED).
4. **Relay State Mutation by Attacker**: User B sending update to `/meters/{userA_meter}` with `relayState: "OFF"` -> Rejected (PERMISSION_DENIED).
5. **ID Poisoning Attack**: Trying to create a meter with ID `meter-../../../root-injection` or 2048 chars long -> Rejected (PERMISSION_DENIED).
6. **Shadow Field Injection**: Updating meter with ghost field `__adminOverride: true` -> Rejected (PERMISSION_DENIED).
7. **Cross-Tenant Telemetry Ingestion**: User B attempting to write telemetry into `/meters/{userA_meter}/telemetry/{logId}` -> Rejected (PERMISSION_DENIED).
8. **Invalid Anomaly Status**: Setting anomaly status to `"HACKED"` instead of `ACTIVE` / `RESOLVED` / `ACKNOWLEDGED` -> Rejected (PERMISSION_DENIED).
9. **Negative Energy Value / Overflow**: Injecting negative voltage or corrupted type into telemetry record -> Rejected (PERMISSION_DENIED).
10. **Blanket Query Scraping**: Running unbounded `collectionGroup("telemetry")` or `collection("meters")` without user constraint -> Rejected (PERMISSION_DENIED).
11. **User Profile Tampering**: Attempting to overwrite another user's `/users/{victimId}` -> Rejected (PERMISSION_DENIED).
12. **Relay Command Field Poisoning**: Modifying immutable fields like `createdAt` or `ownerUid` during a relay toggle -> Rejected (PERMISSION_DENIED).
