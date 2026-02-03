// const express = require("express");
// const { MongoClient, ObjectId } = require("mongodb");

// const router = express.Router();

// // MongoDB connection URI from environment variables
// const MONGO_URI = process.env.MONGO_URI;

// if (!MONGO_URI) {
//     throw new Error("Please define the MONGO_URI environment variable.");
// }

// // Create MongoDB client
// const client = new MongoClient(MONGO_URI);

// // Database and collection references
// let cartCollection; // We'll assign this after successful connection

// // Connect to MongoDB once when the module loads
// (async () => {
//     try {
//         await client.connect();

//         const db = client.db("mydb");
//         cartCollection = db.collection("withdraw"); 
//         userCollection = db.collection("userCollection");
//         withdrawalCollection = db.collection("withdraw");
//     } catch (error) {
//         console.error("Failed to connect to MongoDB:", error);
//         process.exit(1); // Exit if connection fails
//     }
// })();

// // POST: Create a new withdrawal request
// // Endpoint: POST /withdraw/post
// router.post("/post", async (req, res) => {
//   try {
//     const {
//       userId,
//       paymentMethod,     // "kora" | "flutterwave"
//       amount,
//       currency = "NGN",
//       accountNumber,
//       bankCode,
//       fullName,
//       phoneNumber,
//       email,
//       note
//     } = req.body;

//     // Validation
//     if (!userId || !amount || !paymentMethod || !accountNumber || !bankCode || !fullName) {
//       return res.status(400).json({
//         message: "Missing required fields: userId, amount, paymentMethod, accountNumber, bankCode, fullName"
//       });
//     }

//     const withdrawAmount = Number(amount);
//     if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
//       return res.status(400).json({ message: "Amount must be a positive number" });
//     }

//     // Find user
//     const userObjectId = new ObjectId(userId);
//     const user = await userCollection.findOne({ _id: userObjectId });

//     if (!user) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     const currentBalance = Number(user.balance || 0);

//     // Check sufficient balance
//     if (currentBalance < withdrawAmount) {
//       return res.status(400).json({
//         message: "Insufficient balance",
//         available: currentBalance,
//         requested: withdrawAmount
//       });
//     }

//     // Use transaction for safety (balance deduct + request create)
//     const session = client.startSession();
//     try {
//       await session.withTransaction(async () => {
//         // 1. Deduct amount from user's balance
//         const updateResult = await userCollection.updateOne(
//           { _id: userObjectId },
//           { $inc: { balance: -withdrawAmount } },
//           { session }
//         );

//         if (updateResult.modifiedCount === 0) {
//           throw new Error("Failed to update user balance");
//         }

//         // 2. Create withdrawal request
//         const insertResult = await withdrawalCollection.insertOne({
//           userId: userObjectId,
//           userEmail: user.email,
//           paymentMethod,
//           amount: withdrawAmount.toString(), // frontend string চায়
//           currency,
//           accountNumber,
//           bankCode,
//           fullName,
//           phoneNumber: phoneNumber || null,
//           email: email || user.email,
//           note: note || "",
//           status: "pending",
//           adminNote: "",
//           createdAt: new Date(),
//           updatedAt: new Date()
//         }, { session });

//         // Success response
//         res.status(201).json({
//           success: true,
//           message: "Withdrawal request submitted successfully. Amount deducted from balance.",
//           withdrawalId: insertResult.insertedId.toString(),
//           deductedAmount: withdrawAmount,
//           newBalance: currentBalance - withdrawAmount
//         });
//       });
//     } finally {
//       await session.endSession();
//     }

//   } catch (error) {
//     console.error("Withdrawal submission error:", error);
//     res.status(500).json({ message: "Server error. Please try again later." });
//   }
// });

// // PUT: Approve a withdrawal by ID
// // Endpoint: PUT /withdraw/approve/:id
// router.put("/approve/:id", async (req, res) => {
//     try {
//         if (!cartCollection) {
//             return res.status(503).send({ message: "Database not ready yet." });
//         }

//         const { id } = req.params;

//         // Validate ObjectId format
//         if (!ObjectId.isValid(id)) {
//             return res.status(400).send({ message: "Invalid withdrawal ID format." });
//         }

//         const result = await cartCollection.updateOne(
//             { _id: new ObjectId(id) },
//             {
//                 $set: {
//                     status: "approved",
//                     approvedAt: new Date(),
//                 },
//             }
//         );

//         if (result.matchedCount === 0) {
//             return res.status(404).send({ message: "Withdrawal request not found." });
//         }

//         res.status(200).send({
//             success: true,
//             modifiedCount: result.modifiedCount,
//             message: "Withdrawal approved successfully.",
//         });
//     } catch (error) {
//         console.error("Update Error:", error);
//         res.status(500).send({ message: "Internal Server Error" });
//     }
// });

// // GET: Get all withdrawal requests (for admin)
// // Endpoint: GET /withdraw/getall
// router.get("/getall", async (req, res) => {
//     try {
//         if (!cartCollection) {
//             return res.status(503).send({ message: "Database not ready yet." });
//         }

//         const withdrawals = await cartCollection
//             .find({})
//             .sort({ createdAt: -1 }) // Latest first
//             .toArray();

//         res.status(200).send(withdrawals);
//     } catch (error) {
//         console.error("Fetch Error:", error);
//         res.status(500).send({ message: "Failed to fetch withdrawals." });
//     }
// });

// router.get("/get/:id", async (req, res) => {
//     try {
//         if (!cartCollection) return res.status(503).send({ message: "DB not ready" });

//         const { id } = req.params;

//         if (!ObjectId.isValid(id)) {
//             return res.status(400).send({ message: "Invalid withdrawal ID format" });
//         }

//         const withdrawal = await cartCollection.findOne({ _id: new ObjectId(id) });

//         if (!withdrawal) {
//             return res.status(404).send({ message: "Withdrawal not found" });
//         }

//         res.status(200).send(withdrawal);
//     } catch (error) {
//         console.error("Fetch Single Error:", error);
//         res.status(500).send({ message: "Server error" });
//     }
// });
// module.exports = router;





// const express = require("express");
// const { MongoClient, ObjectId } = require("mongodb");

// const router = express.Router();

// // MongoDB connection URI from environment variables
// const MONGO_URI = process.env.MONGO_URI;

// if (!MONGO_URI) {
//     throw new Error("Please define the MONGO_URI environment variable.");
// }

// // Create MongoDB client
// const client = new MongoClient(MONGO_URI);

// // Database and collection references
// let cartCollection; // We'll assign this after successful connection
// let userCollection;
// let withdrawalCollection;
// let notificationCollection;

// // Connect to MongoDB once when the module loads
// (async () => {
//     try {
//         await client.connect();

//         const db = client.db("mydb");
//         cartCollection = db.collection("withdraw"); 
//         userCollection = db.collection("userCollection");
//         withdrawalCollection = db.collection("withdraw");
//         notificationCollection = db.collection("notifiCollection");
//     } catch (error) {
//         console.error("Failed to connect to MongoDB:", error);
//         process.exit(1); // Exit if connection fails
//     }
// })();

// // POST: Create a new withdrawal request
// // Endpoint: POST /withdraw/post
// router.post("/post", async (req, res) => {
//   try {
//     const {
//       userId,
//       paymentMethod,     // "kora" | "flutterwave"
//       amount,
//       currency = "NGN",
//       accountNumber,
//       bankCode,
//       fullName,
//       phoneNumber,
//       email,
//       note
//     } = req.body;

//     // Validation
//     if (!userId || !amount || !paymentMethod || !accountNumber || !bankCode || !fullName) {
//       return res.status(400).json({
//         message: "Missing required fields: userId, amount, paymentMethod, accountNumber, bankCode, fullName"
//       });
//     }

//     const withdrawAmount = Number(amount);
//     if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
//       return res.status(400).json({ message: "Amount must be a positive number" });
//     }

//     // Find user
//     const userObjectId = new ObjectId(userId);
//     const user = await userCollection.findOne({ _id: userObjectId });

//     if (!user) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     const currentBalance = Number(user.balance || 0);

//     // Check sufficient balance
//     if (currentBalance < withdrawAmount) {
//       return res.status(400).json({
//         message: "Insufficient balance",
//         available: currentBalance,
//         requested: withdrawAmount
//       });
//     }

//     // Use transaction for safety (balance deduct + request create)
//     const session = client.startSession();
//     try {
//       await session.withTransaction(async () => {
//         // 1. Deduct amount from user's balance
//         const updateResult = await userCollection.updateOne(
//           { _id: userObjectId },
//           { $inc: { balance: -withdrawAmount } },
//           { session }
//         );

//         if (updateResult.modifiedCount === 0) {
//           throw new Error("Failed to update user balance");
//         }

//         // 2. Create withdrawal request
//         const insertResult = await withdrawalCollection.insertOne({
//           userId: userObjectId,
//           userEmail: user.email,
//           paymentMethod,
//           amount: withdrawAmount.toString(), // frontend string চায়
//           currency,
//           accountNumber,
//           bankCode,
//           fullName,
//           phoneNumber: phoneNumber || null,
//           email: email || user.email,
//           note: note || "",
//           status: "pending",
//           adminNote: "",
//           createdAt: new Date(),
//           updatedAt: new Date()
//         }, { session });

//         // Success response
//         res.status(201).json({
//           success: true,
//           message: "Withdrawal request submitted successfully. Amount deducted from balance.",
//           withdrawalId: insertResult.insertedId.toString(),
//           deductedAmount: withdrawAmount,
//           newBalance: currentBalance - withdrawAmount
//         });
//       });
//     } finally {
//       await session.endSession();
//     }

//   } catch (error) {
//     console.error("Withdrawal submission error:", error);
//     res.status(500).json({ message: "Server error. Please try again later." });
//   }
// });

// // PUT: Approve a withdrawal by ID
// // Endpoint: PUT /withdraw/approve/:id
// router.put("/approve/:id", async (req, res) => {
//     try {
//         if (!cartCollection) {
//             return res.status(503).send({ message: "Database not ready yet." });
//         }

//         const { id } = req.params;

//         // Validate ObjectId format
//         if (!ObjectId.isValid(id)) {
//             return res.status(400).send({ message: "Invalid withdrawal ID format." });
//         }

//         const result = await cartCollection.updateOne(
//             { _id: new ObjectId(id) },
//             {
//                 $set: {
//                     status: "approved",
//                     approvedAt: new Date(),
//                 },
//             }
//         );

//         if (result.matchedCount === 0) {
//             return res.status(404).send({ message: "Withdrawal request not found." });
//         }

//         res.status(200).send({
//             success: true,
//             modifiedCount: result.modifiedCount,
//             message: "Withdrawal approved successfully.",
//         });
//     } catch (error) {
//         console.error("Update Error:", error);
//         res.status(500).send({ message: "Internal Server Error" });
//     }
// });

// // PUT: Decline a withdrawal request with reason and refund
// // Endpoint: PUT /withdraw/decline/:id
// router.put("/decline/:id", async (req, res) => {
//   try {
//     if (!cartCollection) {
//       return res.status(503).send({ message: "Database not ready yet." });
//     }

//     const { id } = req.params;
//     const { reason } = req.body;

//     if (!ObjectId.isValid(id)) {
//       return res.status(400).send({ message: "Invalid withdrawal ID format." });
//     }

//     const withdrawal = await cartCollection.findOne({ _id: new ObjectId(id) });
//     if (!withdrawal) return res.status(404).send({ message: "Withdrawal request not found." });

//     // Parse amount (stored as string in some places)
//     const amt = Number(withdrawal.amount || 0);

//     // Update withdrawal status and admin note
//     const updateRes = await cartCollection.updateOne(
//       { _id: new ObjectId(id) },
//       { $set: { status: "declined", adminNote: reason || "", updatedAt: new Date() } }
//     );

//     if (updateRes.matchedCount === 0) {
//       return res.status(404).send({ message: "Withdrawal request not found when updating." });
//     }

//     // Refund user balance if userId exists
//     try {
//       if (withdrawal.userId) {
//         const userIdObj = typeof withdrawal.userId === 'string' ? new ObjectId(withdrawal.userId) : withdrawal.userId;
//         await userCollection.updateOne({ _id: userIdObj }, { $inc: { balance: amt } });
//       }
//     } catch (e) {
//       console.error('Refund error:', e);
//     }

//     // Create a notification for the user explaining the decline
//     try {
//       if (notificationCollection) {
//         await notificationCollection.insertOne({
//           userEmail: withdrawal.email || withdrawal.userEmail || "",
//           title: "Withdrawal Declined",
//           message: reason || "Your withdrawal request was declined.",
//           type: "withdrawal",
//           relatedId: id,
//           read: false,
//           createdAt: new Date(),
//         });
//       }
//     } catch (e) {
//       console.error('Notification insert error:', e);
//     }

//     res.status(200).send({ success: true, message: "Withdrawal declined and user refunded." });
//   } catch (error) {
//     console.error("Decline Error:", error);
//     res.status(500).send({ message: "Internal Server Error" });
//   }
// });

// // GET: Get all withdrawal requests (for admin)
// // Endpoint: GET /withdraw/getall
// router.get("/getall", async (req, res) => {
//     try {
//         if (!cartCollection) {
//             return res.status(503).send({ message: "Database not ready yet." });
//         }

//         const withdrawals = await cartCollection
//             .find({})
//             .sort({ createdAt: -1 }) // Latest first
//             .toArray();

//         res.status(200).send(withdrawals);
//     } catch (error) {
//         console.error("Fetch Error:", error);
//         res.status(500).send({ message: "Failed to fetch withdrawals." });
//     }
// });

// router.get("/get/:id", async (req, res) => {
//     try {
//         if (!cartCollection) return res.status(503).send({ message: "DB not ready" });

//         const { id } = req.params;

//         if (!ObjectId.isValid(id)) {
//             return res.status(400).send({ message: "Invalid withdrawal ID format" });
//         }

//         const withdrawal = await cartCollection.findOne({ _id: new ObjectId(id) });

//         if (!withdrawal) {
//             return res.status(404).send({ message: "Withdrawal not found" });
//         }

//         res.status(200).send(withdrawal);
//     } catch (error) {
//         console.error("Fetch Single Error:", error);
//         res.status(500).send({ message: "Server error" });
//     }
// });
// module.exports = router;





const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const { processKorapayPayout, processFlutterwavePayout } = require("../utils/payout");

const router = express.Router();

// MongoDB connection URI from environment variables
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  throw new Error("Please define the MONGO_URI environment variable.");
}

// Create MongoDB client
const client = new MongoClient(MONGO_URI);

// Database and collection references
let cartCollection; // We'll assign this after successful connection
let userCollection;
let withdrawalCollection;
let notificationCollection;
let db;
// Connect to MongoDB once when the module loads
(async () => {
  try {
    await client.connect();

    // const db = client.db("mydb");
    db = client.db("mydb");
    cartCollection = db.collection("withdraw");
    userCollection = db.collection("userCollection");
    withdrawalCollection = db.collection("withdraw");
    notificationCollection = db.collection("notifiCollection");
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
    process.exit(1); // Exit if connection fails
  }
})();

// POST: Create a new withdrawal request
// Endpoint: POST /withdraw/post
router.post("/post", async (req, res) => {
  try {
    const {
      userId,
      paymentMethod,     // "kora" | "flutterwave" | "localbank"
      amount,
      currency = "NGN",
      accountNumber,
      bankCode,
      fullName,
      phoneNumber,
      email,
      note,
      bankName
    } = req.body;

    // Validation
    if (!userId || !amount || !paymentMethod || !accountNumber || !bankCode || !fullName) {
      return res.status(400).json({
        message: "Missing required fields: userId, amount, paymentMethod, accountNumber, bankCode, fullName"
      });
    }

    const withdrawAmount = Number(amount);
    if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
      return res.status(400).json({ message: "Amount must be a positive number" });
    }

    // Find user
    const userObjectId = new ObjectId(userId);
    const user = await userCollection.findOne({ _id: userObjectId });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const currentBalance = Number(user.balance || 0);

    // Check sufficient balance
    if (currentBalance < withdrawAmount) {
      return res.status(400).json({
        message: "Insufficient balance",
        available: currentBalance,
        requested: withdrawAmount
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

        if (updateResult.modifiedCount === 0) {
          throw new Error("Failed to update user balance");
        }

        // 2. Create withdrawal record (Instant & No Fees)
        const settingsCol = db.collection("settings");
        const settingsDoc = await settingsCol.findOne({ _id: "config" });
        // User requested NO FEES, but we still fetch the rate
        const withdrawRate = (settingsDoc && settingsDoc.withdrawRate) ? Number(settingsDoc.withdrawRate) : 1400;

        const feeAmount = 0; // Forced to 0 as requested
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
          status: "processing", // Initial state
          adminNote: "",
          createdAt: new Date(),
          updatedAt: new Date()
        };

        const insertResult = await withdrawalCollection.insertOne(withdrawalDoc, { session });
        const withdrawalId = insertResult.insertedId;

        // 3. ATTEMPT INSTANT PAYOUT (Bypassing Admin Approval)
        let payoutResult = { success: false, error: "Auto-payout skipped" };
        const payoutRecord = { ...withdrawalDoc, _id: withdrawalId };

        if (paymentMethod === "korapay") {
          payoutResult = await processKorapayPayout(payoutRecord);
        } else if (paymentMethod === "flutterwave" || paymentMethod === "flw") {
          payoutResult = await processFlutterwavePayout(payoutRecord);
        } else {
          // Manual fallback (if they choose something non-auto)
          payoutResult = { success: true, manual: true };
        }

        if (payoutResult.success) {
          await withdrawalCollection.updateOne(
            { _id: withdrawalId },
            {
              $set: {
                status: payoutResult.manual ? "approved" : "completed",
                payoutReference: payoutResult.reference || null,
                payoutData: payoutResult.data || null,
                autoPayout: !payoutResult.manual,
                updatedAt: new Date()
              }
            },
            { session }
          );

          res.status(201).json({
            success: true,
            message: payoutResult.manual
              ? "Withdrawal approved. Manual processing required."
              : "Withdrawal completed successfully and funds sent.",
            withdrawalId: withdrawalId.toString(),
            status: payoutResult.manual ? "approved" : "completed"
          });
        } else {
          // PAYOUT FAILED -> REFUND USER IMMEDIATELY
          await userCollection.updateOne(
            { _id: userObjectId },
            { $inc: { balance: withdrawAmount } },
            { session }
          );

          await withdrawalCollection.updateOne(
            { _id: withdrawalId },
            {
              $set: {
                status: "failed",
                adminNote: payoutResult.error,
                updatedAt: new Date()
              }
            },
            { session }
          );

          res.status(500).json({
            success: false,
            message: "Instant payout failed. Your balance has been refunded.",
            error: payoutResult.error
          });
        }
      });
    } finally {
      await session.endSession();
    }
  } catch (error) {
    console.error("Instant Withdrawal error:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Server error during withdrawal processing." });
    }
  }
});

// PUT: Approve a withdrawal by ID and trigger Automatic Payout
// Endpoint: PUT /withdraw/approve/:id
router.put("/approve/:id", async (req, res) => {
  try {
    if (!cartCollection) {
      return res.status(503).send({ message: "Database not ready yet." });
    }

    const { id } = req.params;

    // Validate ObjectId format
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid withdrawal ID format." });
    }

    const withdrawal = await cartCollection.findOne({ _id: new ObjectId(id) });
    if (!withdrawal) {
      return res.status(404).send({ message: "Withdrawal request not found." });
    }

    if (withdrawal.status !== "pending") {
      return res.status(400).send({ message: `Withdrawal is already ${withdrawal.status}.` });
    }

    // TRIGGER AUTOMATIC PAYOUT
    let payoutResult = { success: false, error: "Unsupported payment method for auto-payout" };

    if (withdrawal.paymentMethod === "korapay") {
      payoutResult = await processKorapayPayout(withdrawal);
    } else if (withdrawal.paymentMethod === "flutterwave" || withdrawal.paymentMethod === "flw") {
      payoutResult = await processFlutterwavePayout(withdrawal);
    } else {
      // If it's manual (localbank), we just mark as approved
      payoutResult = { success: true, manual: true };
    }

    if (!payoutResult.success) {
      return res.status(500).send({
        success: false,
        message: "Payout failed",
        error: payoutResult.error
      });
    }

    const result = await cartCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: payoutResult.manual ? "approved" : "completed",
          approvedAt: new Date(),
          payoutReference: payoutResult.reference || null,
          payoutData: payoutResult.data || null,
          autoPayout: !payoutResult.manual
        },
      }
    );

    res.status(200).send({
      success: true,
      modifiedCount: result.modifiedCount,
      message: payoutResult.manual
        ? "Withdrawal approved (Manual transfer required)."
        : "Automatic payout successful. Withdrawal completed.",
      reference: payoutResult.reference
    });

  } catch (error) {
    console.error("Approval/Payout Error:", error);
    res.status(500).send({ message: "Internal Server Error during payout process" });
  }
});

// PUT: Decline a withdrawal request with reason and refund
// Endpoint: PUT /withdraw/decline/:id
router.put("/decline/:id", async (req, res) => {
  try {
    if (!cartCollection) {
      return res.status(503).send({ message: "Database not ready yet." });
    }

    const { id } = req.params;
    const { reason } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid withdrawal ID format." });
    }

    const withdrawal = await cartCollection.findOne({ _id: new ObjectId(id) });
    if (!withdrawal) return res.status(404).send({ message: "Withdrawal request not found." });

    // Parse amount (stored as string in some places)
    const amt = Number(withdrawal.amount || 0);

    // Update withdrawal status and admin note
    const updateRes = await cartCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "declined", adminNote: reason || "", updatedAt: new Date() } }
    );

    if (updateRes.matchedCount === 0) {
      return res.status(404).send({ message: "Withdrawal request not found when updating." });
    }

    // Refund user balance if userId exists
    try {
      if (withdrawal.userId) {
        const userIdObj = typeof withdrawal.userId === 'string' ? new ObjectId(withdrawal.userId) : withdrawal.userId;
        await userCollection.updateOne({ _id: userIdObj }, { $inc: { balance: amt } });
      }
    } catch (e) {
      console.error('Refund error:', e);
    }

    // Create a notification for the user explaining the decline
    try {
      if (notificationCollection) {
        await notificationCollection.insertOne({
          userEmail: withdrawal.email || withdrawal.userEmail || "",
          title: "Withdrawal Declined",
          message: reason || "Your withdrawal request was declined.",
          type: "withdrawal",
          relatedId: id,
          read: false,
          createdAt: new Date(),
        });
      }
    } catch (e) {
      console.error('Notification insert error:', e);
    }

    res.status(200).send({ success: true, message: "Withdrawal declined and user refunded." });
  } catch (error) {
    console.error("Decline Error:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
});

// GET: Get all withdrawal requests (for admin)
// Endpoint: GET /withdraw/getall
router.get("/getall", async (req, res) => {
  try {
    if (!cartCollection) {
      return res.status(503).send({ message: "Database not ready yet." });
    }

    const withdrawals = await cartCollection
      .find({})
      .sort({ createdAt: -1 }) // Latest first
      .toArray();

    res.status(200).send(withdrawals);
  } catch (error) {
    console.error("Fetch Error:", error);
    res.status(500).send({ message: "Failed to fetch withdrawals." });
  }
});

router.get("/get/:id", async (req, res) => {
  try {
    if (!cartCollection) return res.status(503).send({ message: "DB not ready" });

    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid withdrawal ID format" });
    }

    const withdrawal = await cartCollection.findOne({ _id: new ObjectId(id) });

    if (!withdrawal) {
      return res.status(404).send({ message: "Withdrawal not found" });
    }

    res.status(200).send(withdrawal);
  } catch (error) {
    console.error("Fetch Single Error:", error);
    res.status(500).send({ message: "Server error" });
  }
});
module.exports = router;