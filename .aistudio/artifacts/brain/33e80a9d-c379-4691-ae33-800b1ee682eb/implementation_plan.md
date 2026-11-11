# Pending Relay Command Lock & Device-Twin Synchronization

Resolves the relay state race condition where a remote `OFF` (or `ON`) command issued from the VoltPulse web dashboard is overwritten by the meter's next telemetry `POST` before the MCU receives and executes the command. Introduces a **Pending Command Lock (Desired vs. Reported State)** architecture with live `PENDING OFF` / `PENDING ON` visual feedback until the meter confirms the state transition.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Both architectural and UX preferences were confirmed during clarification and govern this implementation:

- **Confirmed Decision 1 — Pending Command Lock**: When a relay toggle is triggered from the web dashboard, the server locks the target command in `pendingRelayCommand` (`'ON'` | `'OFF'`). Incoming telemetry `POST` requests will **not** overwrite the target relay state while a command is pending; instead, the server responds with the pending target `relayState` so the MCU switches its physical relay pin immediately upon reading the HTTP response, and the lock clears once the meter's reported `relayState` matches the target.
- **Confirmed Decision 2 — Pending State Visual Indicator**: The web dashboard (`Remote Control` bar and `Active Real Power` card) displays an explicit `PENDING OFF` or `PENDING ON` state until a subsequent telemetry `POST` from the meter confirms the physical relay has switched.

---

## 1. Overview & Core Concept

- **What It Does**: Decouples the **commanded target relay state** (`pendingRelayCommand`) from the **meter's reported physical relay state** (`relayState`). When an operator turns a meter `OFF` or `ON` from the web dashboard, the command is queued and locked on the server. When the meter sends its next telemetry `POST` (which still carries its previous physical `relayState`), the server ignores the stale incoming `relayState` for state-mutation purposes, evaluates anomaly detection against the actual physical state reported in that sample, and returns the commanded `relayState` in the compact JSON response.
- **Target Audience / Persona**: Utility grid operators, IoT hardware engineers, and residential/commercial energy managers controlling ESP32 smart meters over HTTP polling/telemetry intervals.
- **Key Value**: Guarantees 100% reliable remote load cutoff and reconnection over periodic HTTP telemetry links without requiring persistent inbound sockets on the microcontroller, while preventing false `UNMETERED_BYPASS` alarms on the transition packet.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Initiating Remote Cutoff (`Turn Off`)**:
     - Operator clicks **Turn Off** in the `Remote Control` bar and confirms in the modal.
     - The `Remote Control` status badge transitions to **`PENDING OFF`** (amber warning indicator with subtle activity spinner) and subtext reads `"Awaiting meter confirmation on next telemetry..."`.
     - The button label updates to **`Cancel / Turn On`** (allowing the operator to abort or reverse a pending command before the meter checks in).
  2. **First Telemetry Ingest After Command**:
     - The ESP32 sends `POST /api/telemetry/ingest` with its pre-existing physical state (`relayState: "ON"`).
     - The server responds with `"relayState": "OFF"` in the compact JSON response.
     - Upon receiving `"relayState": "OFF"` in the HTTP response, the ESP32 immediately drives its relay GPIO LOW (disconnecting the load), so the physical transition is now complete. The server clears `pendingRelayCommand` and sets `meter.relayState = "OFF"` (or if the meter's incoming packet already matches `"OFF"`, confirms it immediately).
  3. **Confirmed State on Dashboard**:
     - Once delivered/confirmed via telemetry `POST`, the dashboard badge transitions from **`PENDING OFF`** to **`OFF` (`Load disconnected`)** in rose-red (`#f43f5e`).
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Industrial utility telemetry console consistent with VoltPulse's deep teal-slate (`#112327`, `#1a2d31`, `#1e373e`) and high-contrast crisp white (`#ffffff`) palette.
  - *Color Palette & Mood*:
    - **Energized (`ON`)**: Emerald (`#34d399` / `bg-emerald-400 text-[#112327]`)
    - **Pending Command (`PENDING OFF` / `PENDING ON`)**: Amber (`#fbbf24` / `bg-amber-400 text-[#112327]`)
    - **Disconnected (`OFF`)**: Rose (`#f43f5e` / `bg-rose-500 text-white`)
  - *Typography & Hierarchy*: Monospace tabular numerals (`font-mono tabular-nums`) for all status indicators, timestamps, and electrical readings.
- **Interactive Feedback & Motion**:
  - Immediate optimistic transition to `PENDING OFF` / `PENDING ON` ($\le 150\text{ms}$) when the operator issues a command, eliminating UI flip-flopping during background polling.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Evaluating Anomalies Against Physical vs. Commanded State During Transition**:
  - *Chosen Approach*: During the transition telemetry packet (where `pendingRelayCommand === "OFF"` but the meter's incoming `payload.relayState === "ON"` because it hasn't received the response yet), anomaly detection evaluates using the meter's **actual physical state at the moment of sampling** (`payload.relayState === "ON"`).
  - *Why*: If the server evaluated that packet as `relayState === "OFF"` while `current > 0.8A`, it would falsely trigger a critical `UNMETERED_BYPASS` ("Unauthorized Current While Relay Tripped") alert just because the meter hadn't received the `OFF` response yet! Evaluating anomaly rules against the physical state reported in the packet—and only enforcing `relayState === "OFF"` bypass detection once the command has been delivered—eliminates false-positive theft alarms.
  - *Alternatives Considered*: Forcing `sample.relayState = "OFF"` immediately before the meter receives the command, which would cause a guaranteed false-positive `UNMETERED_BYPASS` anomaly on every remote shutoff under load.

- **Decision 2 — Two-Stage vs. Single-Packet Command Delivery Lifecycle**:
  - *Chosen Approach*:
    - When the operator toggles the relay on the web app, `pendingRelayCommand` is set to target state (`'OFF'` or `'ON'`), while `meter.relayState` remains the last confirmed physical state until telemetry arrives.
    - When the meter sends `POST /api/telemetry/ingest`:
      - If `payload.relayState === meter.pendingRelayCommand`, the meter has already switched; `meter.relayState` is confirmed as `pendingRelayCommand` and `pendingRelayCommand` is cleared (`null`).
      - If `payload.relayState !== meter.pendingRelayCommand`, the server returns `relayState: meter.pendingRelayCommand` in the HTTP `200 OK` response so the MCU switches immediately upon parsing the response. To support both hardware MCUs (which switch immediately upon reading the HTTP response) and the interactive simulator, how `pendingRelayCommand` resolves is tracked cleanly so the UI reflects `PENDING OFF` while waiting for the telemetry handshake and transitions to confirmed `OFF` once the command is delivered/confirmed.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & State Transition Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       VOLTPULSE WEB DASHBOARD                           │
│  [Remote Control Switch] ──(1) POST relay_toggle { relayState: "OFF" }  │
│         │                                                               │
│         ▼                                                               │
│  UI Badge: "PENDING OFF" (Amber) — awaiting next meter telemetry POST   │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  TELEMETRY & COMMAND ENGINE (Server + DB)               │
│  • Stores: relayState = "ON" (last physical state)                      │
│            pendingRelayCommand = "OFF" (locked target state)            │
│            relayCommandUpdatedAt = ISO timestamp                        │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
       (2) Next Telemetry POST      │      (3) Compact HTTP 200 Response
   { voltage: 230, current: 12,     │      { success: true,
     relayState: "ON", ... }        │        meterId: "MTR-0001",
                                    │        relayState: "OFF", ... }
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     ESP32 SMART METER / WORKBENCH                       │
│  • Reads "relayState": "OFF" from POST response                         │
│  • Drives Relay GPIO LOW (OFF) & updates local relayState = "OFF"       │
│  • Subsequent telemetry POST reports { relayState: "OFF", current: 0 }  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State Additions

- **`Meter` Entity**:
  - `relayState: 'ON' | 'OFF'` — Confirmed relay state of the meter.
  - `pendingRelayCommand?: 'ON' | 'OFF' | null` — Locked target state requested from the web dashboard (`null` when in sync).
  - `relayCommandUpdatedAt?: string | null` — Timestamp when the pending command was issued, used by client/server reconciliation so stale polls never overwrite an active command lock.

### Interactive Component & State Mapping

- **Remote Relay Control (`RemoteRelaySwitch`)**:
  - Computes effective states:
    - `hasPendingCommand = Boolean(meter.pendingRelayCommand && meter.pendingRelayCommand !== meter.relayState)`
    - When `hasPendingCommand` is true, renders the `PENDING OFF` or `PENDING ON` badge with a pulsing/spinning indicator, informs the user that the command is queued for the next telemetry packet, and allows cancelling/reversing the command.
- **Active Power Card (`TelemetryGauges`)**:
  - Updates the `Relay Contact` footer badge to show `PENDING OFF` / `PENDING ON` in amber when `pendingRelayCommand` is active, or `ENERGIZED (ON)` / `DISCONNECTED (OFF)` when confirmed.
- **Hardware Workbench (`HardwareWorkbench`)**:
  - Updates the simulator so when `POST /api/telemetry/ingest` returns a `relayState` command in its HTTP response, the simulator logs the remote command in the virtual serial monitor (`>> [RELAY] Remote command received: OFF`) and automatically syncs the simulated meter's relay state for the next transmission, mirroring the real ESP32 firmware behavior.
- **Client/Server Reconciliation (`reconcileMeter` & `syncMeters`)**:
  - Preserves `pendingRelayCommand` and `relayCommandUpdatedAt` across Firestore and backend polling cycles so background syncs never clear a pending command before a newer telemetry heartbeat confirms it.
