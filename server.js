const cron = require("node-cron");
const express = require("express");
const cors = require("cors");
const path = require("path"); // ইমেজ পাথের জন্য এটি যোগ করা হয়েছে
require("dotenv").config();
const { MongoClient, ObjectId } = require("mongodb");

const app = express();

// ---------------------------------------
// MIDDLEWARE
// ---------------------------------------
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);

app.use(cors());

// --- ইমেজ শো করার জন্য নিচের এই লাইনটি যোগ করা হয়েছে ---
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ---------------------------------------
// DATABASE (Vercel-safe Singleton)
// ---------------------------------------
const MONGO_URI = process.env.MONGO_URI;
const client = new MongoClient(MONGO_URI);

let isConnected = false;
let payments;
let iconsdb;
let userCollection;

async function connectDB() {
  if (isConnected) return;

  try {
    await client.connect();
    const db = client.db("mydb");

    payments = db.collection("payments");
    iconsdb = db.collection("icons");
    userCollection = db.collection("userCollection");

    isConnected = true;
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
  }
}

connectDB();

// ---------------------------------------
// ROOT CHECK
// ---------------------------------------
app.get("/", (req, res) => {
  res.send("VPS Backend Server is running 🚀");
});

// ---------------------------------------
// ROUTES
// ---------------------------------------
const flutterwaveRoutes = require("./flutterwave");
const korapayRoutes = require("./korapay");
const userRoute = require("./routes/user");
const notificationRoute = require("./routes/notification");
const settingsRoute = require("./routes/settings");
const productRoute = require("./routes/product");
const chatRoute = require("./routes/chat");
const cartRoute = require("./routes/cart");
const testPaymentRoute = require("./routes/testpayment");
const withdrawRoute = require("./routes/withdraw");
const purchaseRoute = require("./routes/purchase");
const refarelRoute = require("./routes/refarel");
const ratingRoute = require("./routes/rating");
const adminsetingRoute = require("./routes/adminseting");
const adminChat = require("./routes/adminChat");
const reputationRoute = require("./routes/reputation");

app.use("/api/adminchat", adminChat);
app.use("/flutterwave", flutterwaveRoutes);
app.use("/korapay", korapayRoutes);
app.use("/api/user", userRoute);
app.use("/api/settings", settingsRoute);
app.use("/api/notification", notificationRoute);
app.use("/product", productRoute);
app.use("/chat", chatRoute);
app.use("/cart", cartRoute);
app.use("/api", testPaymentRoute);
app.use("/withdraw", withdrawRoute);
app.use("/purchase", purchaseRoute);
app.use("/referral", refarelRoute);
app.use("/rating", ratingRoute);
app.use("/api/admin", adminsetingRoute);
app.use("/reputation", reputationRoute);

// ---------------------------------------
// PAYMENTS API
// ---------------------------------------

// Create payment
app.post("/api/submit", async (req, res) => {
  try {
    const data = req.body;
    const result = await payments.insertOne(data);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all payments
app.get("/payments", async (req, res) => {
  try {
    const allPayments = await payments.find({}).toArray();
    res.json(allPayments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single payment
app.get("/payments/:id", async (req, res) => {
  try {
    const payment = await payments.findOne({
      _id: new ObjectId(req.params.id),
    });

    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    res.json(payment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update payment status
app.patch("/payments/:id", async (req, res) => {
  try {
    const { status } = req.body;
    const id = req.params.id;

    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

    const payment = await payments.findOne({ _id: new ObjectId(id) });

    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    await payments.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status,
          updatedAt: new Date(),
        },
      }
    );

    // If approved → update user balance
    if (status === "Approved") {
      const user = await userCollection.findOne({
        email: payment.email || payment.customerEmail,
      });

      if (user) {
        // Use amountUSD if available, otherwise fallback to amount
        const creditAmount = payment.amountUSD || payment.amount;
        await userCollection.updateOne(
          { _id: user._id },
          {
            $inc: {
              balance: Number(creditAmount),
            },
          }
        );
      }
    }

    res.json({
      success: true,
      message: "Payment status updated successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ---------------------------------------
// ICONS API
// ---------------------------------------
app.get("/icon-data", async (req, res) => {
  try {
    const data = await iconsdb.find({}).toArray();
    res.json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch icon data",
    });
  }
});

// ---------------------------------------
// LOCAL DEV SERVER (ONLY FOR LOCAL)
// ---------------------------------------
// if (process.env.NODE_ENV !== "production") {
//   const PORT = process.env.PORT || 3200;
//   app.listen(PORT, () => {
//     console.log(`Server running on port ${PORT}`);
//   });
// }
const http = require("http");
const { Server } = require("socket.io");
const socketManager = require("./socketManager");

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for now, restrict in production
    methods: ["GET", "POST"]
  }
});

// Pass io to logical modules
app.set("io", io);
socketManager(io);


// ---------------------------------------
// GLOBAL ERROR HANDLER
// ---------------------------------------
app.use((err, req, res, next) => {
  console.error("Global Error:", err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
    error: process.env.NODE_ENV === "development" ? err : {}
  });
});

const PORT = 3200;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Socket.IO initialized and listening`);
});

// Final export for testing or other uses
module.exports = { app, server, io };
