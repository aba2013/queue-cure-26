const express = require("express");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

app.get("/", (req, res) => {
  res.redirect("/receptionist.html");
});

const STATE_FILE = path.join(
  __dirname,
  "queue.json"
);

// ================= STATE =================

let nextTokenNumber = 1;
let currentlyServing = null;
let waitingQueue = [];
let history = [];

// ================= HELPERS =================

function freshState() {
  return {
    nextTokenNumber: 1,
    currentlyServing: null,
    waitingQueue: [],
    history: []
  };
}

function saveState() {
  const data = {
    nextTokenNumber,
    currentlyServing,
    waitingQueue,
    history
  };

  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify(data, null, 2)
  );
}

function loadState() {
  try {

    if (!fs.existsSync(STATE_FILE)) {

      const fresh = freshState();

      nextTokenNumber =
        fresh.nextTokenNumber;

      currentlyServing =
        fresh.currentlyServing;

      waitingQueue =
        fresh.waitingQueue;

      history =
        fresh.history;

      saveState();

      return;
    }

    const raw =
      fs.readFileSync(
        STATE_FILE,
        "utf8"
      );

    const data =
      JSON.parse(raw);

    nextTokenNumber =
      data.nextTokenNumber ?? 1;

    currentlyServing =
      data.currentlyServing ?? null;

    waitingQueue =
      data.waitingQueue ?? [];

    history =
      data.history ?? [];

  }

  catch (err) {

    console.log(
      "Failed to load state. Starting fresh."
    );

    const fresh = freshState();

    nextTokenNumber =
      fresh.nextTokenNumber;

    currentlyServing =
      fresh.currentlyServing;

    waitingQueue =
      fresh.waitingQueue;

    history =
      fresh.history;

    saveState();
  }
}

loadState();

// ================= PUBLIC STATE =================

function buildPublicState() {

  let cumulative = 0;

  const queueWithWaitTimes =
    waitingQueue.map(
      (patient, index) => {

        const estimatedWaitMinutes =
          cumulative;

        cumulative +=
          patient.consultMinutes;

        return {

          ...patient,

          position:
            index + 1,

          patientsAhead:
            index,

          estimatedWaitMinutes,

          expectedCallTime:
            Date.now() +
            estimatedWaitMinutes *
            60 *
            1000

        };
      }
    );

  return {

    currentlyServing,

    waitingQueue:
      queueWithWaitTimes,

    totalWaiting:
      waitingQueue.length,

    totalQueueMinutes:
      cumulative,

    recentlyServed:
      history
        .slice(-10)
        .reverse()

  };
}

function broadcastState() {

  saveState();

  io.emit(
    "state-update",
    buildPublicState()
  );
}

// ================= SOCKETS =================

io.on(
  "connection",
  (socket) => {

    socket.emit(
      "state-update",
      buildPublicState()
    );

    // ===== ADD PATIENT =====

    socket.on(
      "add-patient",
      (payload) => {

        const name =
          (
            payload?.name ||
            `Patient ${nextTokenNumber}`
          ).trim();

        const parsed =
          Number(
            payload?.consultMinutes
          );

        const consultMinutes =
          Number.isFinite(parsed) &&
          parsed > 0
            ? parsed
            : 5;

        waitingQueue.push({

          token:
            nextTokenNumber,

          name,

          consultMinutes,

          addedAt:
            Date.now()

        });

        nextTokenNumber++;

        broadcastState();

      }
    );

    // ===== CALL NEXT =====

    socket.on(
      "call-next",
      () => {

        if (
          currentlyServing
        ) {

          history.push({

            ...currentlyServing,

            finishedAt:
              Date.now(),

            status:
              "completed"

          });

        }

        if (
          waitingQueue.length === 0
        ) {

          currentlyServing =
            null;

          broadcastState();

          return;
        }

        const nextPatient =
          waitingQueue.shift();

        currentlyServing = {

          ...nextPatient,

          calledAt:
            Date.now()

        };

        broadcastState();

      }
    );

    // ===== SKIP PATIENT =====

    socket.on(
      "skip-patient",
      () => {

        if (
          currentlyServing
        ) {

          history.push({

            ...currentlyServing,

            finishedAt:
              Date.now(),

            status:
              "skipped"

          });

        }

        if (
          waitingQueue.length === 0
        ) {

          currentlyServing =
            null;

          broadcastState();

          return;
        }

        const nextPatient =
          waitingQueue.shift();

        currentlyServing = {

          ...nextPatient,

          calledAt:
            Date.now()

        };

        broadcastState();

      }
    );

    // ===== RESET =====

    socket.on(
      "reset-queue",
      () => {

        const fresh =
          freshState();

        nextTokenNumber =
          fresh.nextTokenNumber;

        currentlyServing =
          fresh.currentlyServing;

        waitingQueue =
          fresh.waitingQueue;

        history =
          fresh.history;

        broadcastState();

      }
    );

    socket.on(
      "disconnect",
      () => {}
    );

  }
);

// ================= START =================

const PORT =
  process.env.PORT || 3000;

server.listen(
  PORT,
  () => {

    console.log(
      `Queue Cure running on http://localhost:${PORT}`
    );

  }
);
