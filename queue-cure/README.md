# Queue Cure '26 — Smart Clinic Token Queue

A real-time token queue system for clinics. Built for Queue Cure '26 (Wooble).

## Problem
Clinics run on paper tokens and shouting. Patients wait for hours with no
visibility. Receptionists track everything from memory.

## What this does
Two screens, always in sync, no manual refresh:

- **Receptionist screen** (`/receptionist.html`) — add a patient, call the
  next token, set the average consultation time.
- **Waiting room screen** (`/waitingroom.html`) — shows who's currently
  being served, who's next, and a live-calculated estimated wait time.

The moment the receptionist clicks **Call Next**, the waiting room screen
updates instantly — powered by Socket.io.

## How wait time is calculated
`estimatedWaitMinutes = (position in queue) × averageConsultationMinutes`

This is computed fresh on the server every time the queue changes — never
hardcoded. See `buildPublicState()` in `server.js`.

## Tech stack
- Node.js + Express (serves static screens)
- Socket.io (real-time sync between screens)
- Vanilla HTML/CSS/JS on the frontend (no build step needed)

## Running locally
```bash
npm install
node server.js
```
Then open:
- `http://localhost:3000/receptionist.html` in one tab
- `http://localhost:3000/waitingroom.html` in another tab

Click "Add Patient" and "Call Next" on the receptionist tab and watch the
waiting room tab update live.

## Architecture / Socket Event Diagram

```
 ┌────────────────────┐                       ┌────────────────────┐
 │ Receptionist Screen │                       │  Waiting Room      │
 │  (browser client)   │                       │  (browser client)  │
 └──────────┬──────────┘                       └──────────▲─────────┘
            │ emit: add-patient(name)                     │
            │ emit: call-next()                            │
            │ emit: set-avg-time(minutes)                  │
            ▼                                               │
   ┌─────────────────────────────────────────────────────────┐
   │                  Node.js / Express server                │
   │            (single source of truth, in-memory state)      │
   │                                                           │
   │  on add-patient   → push to waitingQueue → broadcast      │
   │  on call-next     → shift queue, set currentlyServing     │
   │                      → broadcast                          │
   │  on set-avg-time  → update avgConsultMinutes → broadcast  │
   │                                                           │
   │  broadcast = io.emit('state-update', fullState)            │
   └─────────────────────────────┬───────────────────────────┘
                                  │ emit: state-update(state)
                  ┌───────────────┴────────────────┐
                  ▼                                 ▼
          Receptionist screen               Waiting room screen
          re-renders from state              re-renders from state
```

Both screens are "dumb" — they never calculate queue state themselves.
They just render whatever `state-update` sends them. This is also why
there's no race condition: the server is single-threaded and processes
one socket event fully before starting the next, so two simultaneous
"Call Next" clicks can never corrupt the queue.

## Concurrency & edge cases (thought process)
See the comment block at the bottom of `server.js` for the full writeup,
covering:
- Simultaneous "Call Next" clicks from multiple devices
- Calling next when the queue is empty
- A patient leaving before being called (extension point)
- Server restart / state persistence (extension point — swap in Redis/Postgres)

## License
MIT — see LICENSE file.
