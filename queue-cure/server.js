/**
 * Queue Cure '26
 * Final Backend Version
 * Features:
 * - Real-time Socket.IO updates
 * - Queue persistence
 * - Skip patient
 * - Dynamic wait times
 * - Patients ahead count
 * - Expected call time
 * - History tracking
 */

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const SAVE_FILE = "queue.json";

app.use(express.static("public"));

app.get("/", (req, res) => {
  res.redirect("/receptionist.html");
});

// ================= STATE =================

let nextTokenNumber = 1;
let currentlyServing = null;
let waitingQueue = [];
let history = [];

// ================= PERSISTENCE =================

function saveState() {
  try {
    fs.writeFileSync(
      SAVE_FILE,
      JSON.stringify(
        {
          nextTokenNumber,
          currentlyServing,
          waitingQueue,
          history,
        },
        null,
        2
      )
    );
  } catch (err) {
    console.error("Failed to save queue:", err);
  }
}

function loadState() {
  try {
    if (!fs.existsSync(SAVE_FILE)) return;

    const data = JSON.parse(
      fs.readFileSync(SAVE_FILE, "utf8")
    );

    nextTokenNumber = data.nextTokenNumber || 1;
    currentlyServing = data.currentlyServing || null;
    waitingQueue = data.waitingQueue || [];
    history = data.history || [];

    console.log("Queue restored successfully");
  } catch (err) {
    console.error("Failed to load queue:", err);
  }
}

loadState();

// ================= HELPERS =================

function buildPublicState() {
  let cumulative = 0;

  const queueWithWaitTimes = waitingQueue.map(
    (patient, index) => {
      const estimatedWaitMinutes = cumulative;

      cumulative += patient.consultMinutes;

      return {
        ...patient,
        position: index + 1,
        patientsAhead: index,
        estimatedWaitMinutes,

        expectedCallTime:
          Date.now() +
          estimatedWaitMinutes * 60 * 1000,
      };
    }
  );

  return {
    currentlyServing,
    waitingQueue: queueWithWaitTimes,
    totalWaiting: waitingQueue.length,
    totalQueueMinutes: cumulative,
    recentlyServed: history.slice(-5).reverse(),
  };
}

function broadcastState() {
  saveState();
  io.emit("state-update", buildPublicState());
}

// ================= SOCKETS =================

io.on("connection", (socket) => {
  console.log("Client connected");

  socket.emit("state-update", buildPublicState());

  // -------- ADD PATIENT --------

  socket.on("add-patient", (payload) => {
    const name =
      payload?.name?.trim() ||
      `Patient ${nextTokenNumber}`;

    const consultMinutes =
      Number(payload?.consultMinutes) > 0
        ? Number(payload.consultMinutes)
        : 5;

    waitingQueue.push({
      token: nextTokenNumber,
      name,
      consultMinutes,
      addedAt: Date.now(),
    });

    nextTokenNumber++;

    broadcastState();
  });

  // -------- CALL NEXT --------

  socket.on("call-next", () => {
    if (currentlyServing) {
      history.push({
        ...currentlyServing,
        finishedAt: Date.now(),
      });
    }

    if (waitingQueue.length === 0) {
      currentlyServing = null;
      broadcastState();
      return;
    }

    const nextPatient = waitingQueue.shift();

    currentlyServing = {
      ...nextPatient,
      calledAt: Date.now(),
    };

    broadcastState();
  });

  // -------- SKIP PATIENT --------

  socket.on("skip-patient", () => {
    if (waitingQueue.length <= 1) return;

    const skippedPatient =
      waitingQueue.shift();

    waitingQueue.push(skippedPatient);

    broadcastState();
  });

  // -------- RESET QUEUE --------

  socket.on("reset-queue", () => {
    waitingQueue = [];
    currentlyServing = null;

    broadcastState();
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

// ================= START =================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(
    `Queue Cure running on http://localhost:${PORT}`
  );
});