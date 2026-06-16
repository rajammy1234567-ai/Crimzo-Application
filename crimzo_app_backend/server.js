require("dotenv").config();
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const { connectDB, initDatabase, mongoose } = require("./config/db");
const { setIo } = require("./utils/socketEmitter");
const { authenticateToken } = require("./middleware/auth");
const user = require("./controllers/userController");

// ── App Setup ──
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});
setIo(io);

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Serve local uploads (for dev when not using Cloudinary)
const path = require('path');
const uploadsPath = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsPath));

// ── Routes ──
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/agora", require("./routes/agoraRoutes"));
app.use("/api/live", require("./routes/liveRoutes")(io)); // pass io for stream_ended event
app.use("/api/stickers", require("./routes/stickerRoutes"));
app.use("/api/gifts", require("./routes/giftRoutes"));
app.use("/api/user", require("./routes/userRoutes"));
app.use("/api/pk", require("./routes/pkRoutes"));
app.use("/api/stories", require("./routes/storyRoutes"));
app.use("/api/reels", require("./routes/reelRoutes"));
app.use("/api/messages", require("./routes/messageRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes"));
app.use("/api/payments", require("./routes/paymentRoutes"));
app.use("/api/tasks", require("./routes/taskRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));

// Online count lives under /api/users (not /api/user)
app.get("/api/users/online-count", authenticateToken, user.getOnlineCount);

app.use("/", require("./routes/legalRoutes"));

// Root route
app.get("/api", (req, res) => {
  res.json({ status: "ok", message: "Crimzo Backend API is live 🚀" });
});

// Health check
app.get("/api/health", (req, res) => {
  const dbState = mongoose.connection.readyState; // 0=disconnected,1=connected,2=connecting,3=disconnecting
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const { hasRealCloudinary } = require('./config/cloudinary');
  const { getRazorpayStatus } = require('./config/razorpay');
  const rz = getRazorpayStatus();
  res.json({
    status: "ok",
    message: "Crimzo API is running",
    db: states[dbState] || 'unknown',
    port: PORT,
    services: {
      cloudinary: hasRealCloudinary,
      razorpay: rz.configured,
      razorpayMode: rz.mode,
      agora: !!(process.env.AGORA_APP_ID && process.env.AGORA_APP_CERTIFICATE),
    },
  });
});

// Multer / upload errors
app.use((err, req, res, next) => {
  if (err && err.name === 'MulterError') {
    console.error('Multer error:', err.code, err.field, err.message);
    return res.status(400).json({
      error: `Upload failed: ${err.message}`,
      field: err.field,
      hint: 'Reels use field "video", stories use field "media".',
    });
  }
  if (err) {
    console.error('API error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
  next();
});

// 404 handler for debugging missing routes (e.g. /api/auth/me)
app.use((req, res) => {
  console.warn(`404 Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Not found' });
});

// ── Socket.IO ──
require("./sockets/socketHandler")(io);

// ── Start Server ──
const PORT = process.env.PORT || 8001;

// ── Start server immediately (don't block on DB) ──
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`✅ Agora App ID: ${process.env.AGORA_APP_ID}`);
  const mediaMode =
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_CLOUD_NAME !== "your_cloud_name" &&
    process.env.CLOUDINARY_CLOUD_NAME !== "demo"
      ? "Cloudinary (cloud)"
      : "LOCAL /uploads (no Cloudinary needed for testing)";
  console.log(`✅ Media mode: ${mediaMode}`);

  const { getRazorpayStatus } = require("./config/razorpay");
  const rz = getRazorpayStatus();
  if (rz.configured) {
    console.log(
      `✅ Razorpay: ${rz.keyType === "live" ? "LIVE" : "TEST"} keys active (${rz.keyIdMasked})`,
    );
  } else if (process.env.NODE_ENV !== "production") {
    console.log(
      "⚠️  Razorpay: DEV MOCK — set RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET in .env, then restart",
    );
  } else {
    console.log("❌ Razorpay: not configured — wallet top-up disabled in production");
  }
});

// ── Connect to MongoDB Atlas with retry logic ──
async function connectWithRetry(attemptsLeft = 8, delayMs = 4000) {
  try {
    await connectDB();
    await initDatabase();

    // Clean up stale live sessions (Mongo)
    try {
      const LiveSession = require("./models/LiveSession");
      const User = require("./models/User");
      const staleRes = await LiveSession.updateMany(
        { status: "active" },
        { status: "ended", ended_at: new Date() },
      );
      if (staleRes.modifiedCount > 0) {
        console.log(
          `🧹 Cleaned up ${staleRes.modifiedCount} stale live session(s)`,
        );
        await User.updateMany({ status: "live" }, { status: "online" });
      }
    } catch (err) {
      console.error("Cleanup stale sessions error:", err.message);
    }

    // Purge expired stories (24h TTL) on startup + hourly
    try {
      const { purgeExpiredStories } = require("./controllers/storyController");
      await purgeExpiredStories();
      setInterval(() => purgeExpiredStories(), 60 * 60 * 1000);
    } catch (err) {
      console.error("Story cleanup setup error:", err.message);
    }
  } catch (err) {
    console.error(`❌ MongoDB connection failed: ${err.message}`);
    if (attemptsLeft > 0) {
      console.log(
        `🔄 Retrying in ${delayMs / 1000}s... (${attemptsLeft} attempts left)`,
      );
      setTimeout(
        () =>
          connectWithRetry(attemptsLeft - 1, Math.min(delayMs * 1.5, 30000)),
        delayMs,
      );
    } else {
      console.error("💀 Could not connect to MongoDB Atlas after retries.");
      console.error(
        "   → Check MONGO_URI in .env and Atlas IP whitelist / cluster status",
      );
    }
  }
}

connectWithRetry();
