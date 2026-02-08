const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const { processKorapayPayout, processFlutterwavePayout } = require("../utils/payout");
const { sendEmail, getWithdrawalSuccessTemplate, getWithdrawalDeclineTemplate, getWithdrawalPendingTemplate } = require("../utils/email");
const { sendNotification } = require("../utils/notification");
const { updateStats } = require("../utils/stats");

const router = express.Router();

// MongoDB connection URI from environment variables
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  throw new Error("Please define the MONGO_URI environment variable.");
}

// Create MongoDB client
const client = new MongoClient(MONGO_URI);

// Database and collection references
let withdrawalCollection;
let userCollection;
let notificationCollection;
let statsCollection;
let db;
// Connect to MongoDB once when the module loads
(async () => {
  try {
    await client.connect();

    db = client.db("mydb");
    withdrawalCollection = db.collection("withdraw");
    userCollection = db.collection("userCollection");
    notificationCollection = db.collection("notifiCollection");
    statsCollection = db.collection("systemStats");
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
    process.exit(1); // Exit if connection fails
  }
})();

// POST: Create a new withdrawal request
// Endpoint: POST /withdraw/post
router.post("/post", async (req, res) => {
  try {
    console.log("Withdraw payload:", req.body);

    const {
      userId,
      paymentMethod,
      amount,
      currency = "USD",
      accountNumber,
      bankCode,
      fullName,
      phoneNumber,
      email,
      note,
      bankName
    } = req.body;

    // Strict Validation
    if (!userId || !paymentMethod || !accountNumber || !bankCode || !fullName) {
      return res.status(422).json({
        success: false,
        message: "Missing required fields: userId, paymentMethod, accountNumber, bankCode, fullName"
      });
    }

    if (!amount || Number(amount) <= 0) {
      return res.status(422).json({
        success: false,
        message: "Invalid withdrawal amount"
      });
    }

    const withdrawAmount = Number(amount);

    // Find user
    const userObjectId = new ObjectId(userId);
    const user = await userCollection.findOne({ _id: userObjectId });

    if (!user) {
      return res.status(422).json({ success: false, message: "User not found" });
    }

    const currentBalance = Number(user.balance || 0);

    // Check sufficient balance
    if (currentBalance < withdrawAmount) {
      return res.status(422).json({
        success: false,
        message: `Insufficient balance. Available: $${currentBalance}, Requested: $${withdrawAmount}`
      });
    }

    // Use transaction for safety (balance deduct + request create)
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        // 1. Deduct amount from user's balance
        const updateResult = await userCollection.updateOne(
          { _id: userObjectId },
          { $inc: { balance: -withdrawAmount } },
          { session }
        );

        await updateStatsLocal({ totalUserBalance: -withdrawAmount }, session);

        if (updateResult.modifiedCount === 0) {
          throw new Error("Failed to update user balance");
        }

        // 2. Create withdrawal record (Pending Approval)
        const settingsCol = db.collection("settings");
        const settingsDoc = await settingsCol.findOne({ _id: "config" });
        // Fetch current rate
        const withdrawRate = (settingsDoc && settingsDoc.withdrawRate) ? Number(settingsDoc.withdrawRate) : 1400;

        const feeAmount = 0; // No fees
        const netAmountUSD = withdrawAmount;
        const amountNGN = Math.round(netAmountUSD * withdrawRate);

        const withdrawalDoc = {
          userId: userObjectId,
          userEmail: user.email,
          paymentMethod,
          amount: withdrawAmount.toString(),
          amountUSD: withdrawAmount,
          amountNGN: amountNGN,
          appliedRate: withdrawRate,
          fee: "0",
          netAmount: withdrawAmount.toString(),
          netAmountNGN: amountNGN,
          feeRate: 0,
          currency,
          accountNumber,
          bankCode,
          fullName,
          bankName: bankName || null,
          phoneNumber: phoneNumber || null,
          email: email || user.email,
          note: note || "",
          status: "pending", // ALWAYS PENDING
          adminNote: "",
          createdAt: new Date(),
          updatedAt: new Date()
        };

        const insertResult = await withdrawalCollection.insertOne(withdrawalDoc, { session });
        const withdrawalId = insertResult.insertedId;

        res.status(201).json({
          success: true,
          message: "Withdrawal request submitted successfully. Waiting for admin approval.",
          withdrawalId: withdrawalId.toString(),
          status: "pending"
        });

        // Emit socket event for real-time update
        const io = req.app.get("io");
        if (io) {
          io.emit("withdrawal_status_update", {
            userId: userObjectId.toString(),
            withdrawalId: withdrawalId.toString(),
            status: "pending",
            newBalance: currentBalance - withdrawAmount
          });
        }

        // SEND PENDING EMAIL NOTIFICATION
        try {
          const recipientEmail = user.email; // Account email (already fetched)
          if (recipientEmail) {
            const emailHtml = getWithdrawalPendingTemplate({
              name: user.name || "User",
              amountUSD: withdrawAmount,
              transactionId: withdrawalId.toString()
            });
            await sendEmail({
              to: recipientEmail,
              subject: "Withdrawal Request Received",
              html: emailHtml,
            });
          }
        } catch (emailErr) {
          console.error("Failed to send pending email:", emailErr);
        }
      });
    } finally {
      await session.endSession();
    }
  } catch (error) {
    console.error("Withdrawal submission error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "Server error during withdrawal processing.",
        error: error.message
      });
    }
  }
});

// PUT: Approve a withdrawal by ID (Manual Pay)
// Endpoint: PUT /withdraw/approve/:id
router.put("/approve/:id", async (req, res) => {
  try {
    if (!withdrawalCollection) {
      return res.status(503).send({ message: "Database not ready yet." });
    }

    const { id } = req.params;

    // Validate ObjectId format
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid withdrawal ID format." });
    }

    const withdrawal = await withdrawalCollection.findOne({ _id: new ObjectId(id) });
    if (!withdrawal) {
      return res.status(404).json({ message: "Withdrawal request not found." });
    }

    if (withdrawal.status !== "pending") {
      return res.status(400).json({ message: `Withdrawal is already ${withdrawal.status}.` });
    }

    // MANUAL APPROVAL ONLY - NO AUTO PAYOUT
    const result = await withdrawalCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: "approved",
          approvedAt: new Date(),
          autoPayout: false,
          adminNote: "Manually approved by admin. Payment must be sent manually."
        },
      }
    );

    // 🔥 Calculate Exchange Rate Profit (Withdrawal)
    // User receives less NGN than market rate for their USD
    // Example: withdrawRate=1400, marketRate=1480, user withdraws $100
    // User gets ₦140,000 but market value is ₦148,000
    // Profit = (1480-1400) × 100 / 1480 = $5.40
    try {
      const settingsCol = db.collection("settings");
      const settingsDoc = await settingsCol.findOne({ _id: "config" });
      const marketRate = (settingsDoc && settingsDoc.marketRate) ? Number(settingsDoc.marketRate) : 1480;
      const withdrawRate = withdrawal.appliedRate || 1400;
      const amountUSD = Number(withdrawal.amountUSD || withdrawal.amount || 0);

      if (amountUSD > 0 && marketRate > withdrawRate) {
        const profitPerDollar = (marketRate - withdrawRate) / marketRate;
        const exchangeProfit = Number((amountUSD * profitPerDollar).toFixed(2));

        // Add to admin platformProfit
        const adminUser = await userCollection.findOne({ email: "admin@gmail.com" });
        if (adminUser && exchangeProfit > 0) {
          await userCollection.updateOne(
            { email: "admin@gmail.com" },
            { $inc: { platformProfit: exchangeProfit } }
          );
          console.log(`💰 Exchange profit from withdrawal: $${exchangeProfit.toFixed(2)} added to admin platformProfit`);
        }

        // Store exchange profit in withdrawal record
        await withdrawalCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { exchangeProfit: exchangeProfit } }
        );
      }
    } catch (profitErr) {
      console.error("Exchange profit calculation error:", profitErr);
      // Don't fail the approval if profit tracking fails
    }

    // SEND EMAIL NOTIFICATION
    try {
      const recipientEmail = withdrawal.userEmail;
      if (recipientEmail) {
        // Fetch the actual user to get the logged-in name
        const userDoc = await userCollection.findOne({ _id: new ObjectId(withdrawal.userId) });

        const emailHtml = getWithdrawalSuccessTemplate({
          name: (userDoc && userDoc.name) ? userDoc.name : (withdrawal.fullName || "User"),
          amountUSD: withdrawal.amountUSD || withdrawal.amount,
          amountNGN: withdrawal.amountNGN || withdrawal.netAmountNGN,
          rate: withdrawal.appliedRate || 1400,
          transactionId: withdrawal._id.toString(),
          withdrawalDetailsUrl: `https://acctempire.com/dashboard/withdrawals`
        });
        await sendEmail({
          to: recipientEmail,
          subject: "Your Withdrawal Was Successful",
          html: emailHtml,
        });
      }
    } catch (emailErr) {
      console.error("Failed to send approval email:", emailErr);
    }

    // Emit socket event for real-time update
    const io = req.app.get("io");
    if (io) {
      io.emit("withdrawal_status_update", {
        userId: withdrawal.userId.toString(),
        withdrawalId: withdrawal._id.toString(),
        status: "approved",
        newBalance: null // Balance already deducted during request
      });
    }

    res.status(200).send({
      success: true,
      modifiedCount: result.modifiedCount,
      message: "Withdrawal approved and notification sent.",
    });

  } catch (error) {
    console.error("Approval Error:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
});

// PUT: Decline a withdrawal request with reason and refund
// Endpoint: PUT /withdraw/decline/:id
router.put("/decline/:id", async (req, res) => {
  try {
    if (!withdrawalCollection) {
      return res.status(503).send({ message: "Database not ready yet." });
    }

    const { id } = req.params;
    const { reason } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid withdrawal ID format." });
    }

    const withdrawal = await withdrawalCollection.findOne({ _id: new ObjectId(id) });
    if (!withdrawal) return res.status(404).send({ message: "Withdrawal request not found." });

    // Parse amount (stored as string in some places)
    const amt = Number(withdrawal.amount || 0);

    // Update withdrawal status and admin note
    const updateRes = await withdrawalCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "declined", adminNote: reason || "", updatedAt: new Date() } }
    );

    if (updateRes.matchedCount === 0) {
      return res.status(404).json({ message: "Withdrawal request not found when updating." });
    }

    // Refund user balance if userId exists
    try {
      if (withdrawal.userId) {
        const userIdObj = typeof withdrawal.userId === 'string' ? new ObjectId(withdrawal.userId) : withdrawal.userId;
        await userCollection.updateOne({ _id: userIdObj }, { $inc: { balance: amt } });
        await updateStats({ totalUserBalance: amt });
      }
    } catch (e) {
      console.error('Refund error:', e);
    }

    // Send notification and email for decline
    const userDoc = await userCollection.findOne({ _id: new ObjectId(withdrawal.userId) });
    await sendNotification(req.app, {
      userEmail: withdrawal.userEmail || "",
      title: "Withdrawal Declined",
      message: reason || "Your withdrawal request was declined.",
      type: "withdrawal",
      relatedId: id,
      link: "https://acctempire.com/wallet?tab=withdraw"
    });

    // Emit socket event for real-time update
    const io = req.app.get("io");
    if (io) {
      // Fetch updated user balance
      const updatedUser = await userCollection.findOne({ _id: withdrawal.userId });
      io.emit("withdrawal_status_update", {
        userId: withdrawal.userId.toString(),
        withdrawalId: id,
        status: "declined",
        newBalance: updatedUser ? updatedUser.balance : null
      });
    }

    res.status(200).send({ success: true, message: "Withdrawal declined and user refunded." });
  } catch (error) {
    console.error("Decline Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// GET: Get all withdrawal requests (for admin)
// Endpoint: GET /withdraw/getall
router.get("/getall", async (req, res) => {
  try {
    if (!withdrawalCollection) {
      return res.status(503).send({ message: "Database not ready yet." });
    }

    const withdrawals = await withdrawalCollection
      .find({})
      .sort({ createdAt: -1 }) // Latest first
      .toArray();

    res.status(200).send(withdrawals);
  } catch (error) {
    console.error("Fetch Error:", error);
    res.status(500).json({ message: "Failed to fetch withdrawals." });
  }
});

router.get("/get/:id", async (req, res) => {
  try {
    if (!withdrawalCollection) return res.status(503).send({ message: "DB not ready" });

    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid withdrawal ID format" });
    }

    const withdrawal = await withdrawalCollection.findOne({ _id: new ObjectId(id) });

    if (!withdrawal) {
      return res.status(404).json({ message: "Withdrawal not found" });
    }

    res.status(200).send(withdrawal);
  } catch (error) {
    console.error("Fetch Single Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// GET: Get withdrawal history for a specific user
// Endpoint: GET /withdraw/user/:userId
router.get("/user/:userId", async (req, res) => {
  try {
    if (!withdrawalCollection) {
      return res.status(503).json({ message: "Database not ready" });
    }

    const { userId } = req.params;

    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID format" });
    }

    const userObjectId = new ObjectId(userId);

    const withdrawals = await withdrawalCollection
      .find({ userId: userObjectId })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json(withdrawals);
  } catch (error) {
    console.error("User withdrawal fetch error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// POST: Admin withdrawal (Platform Profit or System Turnover)
// Endpoint: POST /withdraw/admin
router.post("/admin", async (req, res) => {
  try {
    const {
      withdrawalType,
      amount,
      accountNumber,
      bankCode,
      fullName,
      bankName,
      phoneNumber,
      note
    } = req.body;

    if (!withdrawalType || !["profit", "turnover"].includes(withdrawalType)) {
      return res.status(422).json({
        success: false,
        message: "Invalid withdrawalType. Must be 'profit' or 'turnover'"
      });
    }

    if (!amount || Number(amount) <= 0) {
      return res.status(422).json({
        success: false,
        message: "Invalid withdrawal amount"
      });
    }

    if (!accountNumber || !bankCode || !fullName) {
      return res.status(422).json({
        success: false,
        message: "Bank account details are required"
      });
    }

    const withdrawAmount = Number(amount);
    const adminUser = await userCollection.findOne({ email: "admin@gmail.com" });

    if (!adminUser) {
      return res.status(404).json({ success: false, message: "Admin user not found" });
    }

    let newBalance = adminUser.balance;

    if (withdrawalType === "profit") {
      const currentProfit = Number(adminUser.platformProfit || 0);

      if (currentProfit < withdrawAmount) {
        return res.status(422).json({
          success: false,
          message: `Insufficient platform profit. Available: ${currentProfit}, Requested: ${withdrawAmount}`
        });
      }

      await userCollection.updateOne(
        { _id: adminUser._id },
        { $inc: { platformProfit: -withdrawAmount } }
      );

      newBalance = currentProfit - withdrawAmount;
    } else if (withdrawalType === "turnover") {
      const { getStats, updateStats } = require("../utils/stats");
      const stats = await getStats();
      const currentTurnover = stats ? stats.totalTurnover : 0;

      if (currentTurnover < withdrawAmount) {
        return res.status(422).json({
          success: false,
          message: `Insufficient turnover balance. Available: ${currentTurnover}, Requested: ${withdrawAmount}`
        });
      }

      // Deduct from system stats
      await updateStats({ totalTurnover: -withdrawAmount });

      // Deduct from admin user balance record (to keep in sync)
      await userCollection.updateOne(
        { _id: adminUser._id },
        { $inc: { balance: -withdrawAmount } }
      );

      newBalance = currentTurnover - withdrawAmount;
    }

    const withdrawalDoc = {
      userId: adminUser._id,
      userEmail: adminUser.email,
      withdrawalType,
      isAdminWithdrawal: true,
      paymentMethod: "admin",
      amount: withdrawAmount.toString(),
      amountUSD: withdrawAmount,
      currency: "USD",
      accountNumber,
      bankCode,
      fullName,
      bankName: bankName || null,
      phoneNumber: phoneNumber || null,
      email: adminUser.email,
      note: note || "",
      status: "pending",
      adminNote: "",
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const insertResult = await withdrawalCollection.insertOne(withdrawalDoc);
    const withdrawalId = insertResult.insertedId;

    res.status(201).json({
      success: true,
      message: "Admin withdrawal request created successfully",
      withdrawalId: withdrawalId.toString()
    });

    // Optional: Emit socket event if needed
    const io = req.app.get("io");
    if (io) {
      io.emit("withdrawal_status_update", {
        userId: adminUser._id.toString(),
        withdrawalId: withdrawalId.toString(),
        status: "pending",
        newBalance: newBalance
      });
    }
  } catch (error) {
    console.error("Admin withdrawal error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Helper function for updating stats (move outside routes if needed)
async function updateStatsLocal(updates, session) {
  const updateObj = { $inc: {}, $set: { updatedAt: new Date() } };
  for (const [key, value] of Object.entries(updates)) {
    updateObj.$inc[key] = value;
  }
  await statsCollection.updateOne({ _id: "global" }, updateObj, { session });
}

module.exports = router;