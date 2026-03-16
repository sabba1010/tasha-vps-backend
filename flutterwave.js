const express = require("express");
const axios = require("axios");
const { MongoClient } = require("mongodb");
const { updateStats } = require("./utils/stats");

const router = express.Router();

const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY;
const FLW_PUBLIC_KEY = process.env.NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY;
const MONGO_URI = process.env.MONGO_URI;

if (FLW_SECRET_KEY) {
  console.log(`[Flutterwave] Loaded Secret Key: ${FLW_SECRET_KEY.substring(0, 12)}...`);
} else {
  console.error("[Flutterwave] Secret Key MISSING in .env");
}

if (FLW_PUBLIC_KEY) {
  console.log(`[Flutterwave] Loaded Public Key: ${FLW_PUBLIC_KEY.substring(0, 12)}...`);
}

// ================= MongoDB =================
const client = new MongoClient(MONGO_URI);
const db = client.db("mydb");

const payments = db.collection("payments");
const users = db.collection("userCollection");

(async () => {
  await client.connect();
  console.log("MongoDB connected (Flutterwave)");
})();

// ================= CREATE PAYMENT =================
router.post("/create", async (req, res) => {
  try {
    const amountUSD = Number(req.body.amount); // amount is in USD from frontend
    const email = req.body.email; // ✅ LOGIN USER EMAIL

    if (!email) {
      return res.status(400).json({ success: false, message: "Email required" });
    }

    if (!amountUSD || amountUSD <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    // Fetch exchange rate (Deposit Rate)
    const settingsColl = db.collection("settings");
    const config = await settingsColl.findOne({ _id: "config" });
    const rate = config?.depositRate || config?.ngnToUsdRate || 1500;

    const amountNGN = Math.round(amountUSD * rate);
    const tx_ref = "flw-" + Date.now();

    const payload = {
      tx_ref,
      amount: amountNGN,
      currency: "NGN",
      redirect_url: `https://acctempire.com/payment?tx_ref=${tx_ref}`,
      customer: {
        email, // REQUIRED BY FLUTTERWAVE
      },
      meta: {
        amountUSD,
        appliedRate: rate,
      },
    };

    const response = await axios.post(
      "https://api.flutterwave.com/v3/payments",
      payload,
      { headers: { Authorization: `Bearer ${FLW_SECRET_KEY}` } }
    );

    res.json({ success: true, link: response.data.data.link });
  } catch (err) {
    console.error("Flutterwave create error:", err.response?.data || err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ================= VERIFY PAYMENT =================
router.get("/verify", async (req, res) => {
  try {
    const { tx_ref } = req.query;

    const response = await axios.get(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${tx_ref}`,
      { headers: { Authorization: `Bearer ${FLW_SECRET_KEY}` } }
    );

    const data = response.data.data;
    if (data.status !== "successful") {
      return res.json({ success: false });
    }

    // 🔥 OUR DB IS SOURCE OF TRUTH
    let payment = await payments.findOne({ tx_ref });

    if (payment && payment.credited) {
      return res.json({ success: true });
    }

    const { amount: amountNGN, customer, meta } = data;
    const customerEmail = customer?.email;
    const amountUSD = meta?.amountUSD ? Number(meta.amountUSD) : 0;
    const appliedRate = meta?.appliedRate ? Number(meta.appliedRate) : 0;

    if (!payment) {
      // Create record for the first time on success
      const newPayment = {
        tx_ref,
        transactionId: data.id,
        customerEmail,
        amountUSD,
        amountNGN,
        appliedRate,
        amount: amountNGN,
        method: "flutterwave",
        status: "successful",
        credited: true,
        createdAt: new Date(),
        verifiedAt: new Date(),
      };
      await payments.insertOne(newPayment);
      payment = newPayment;
    } else {
      // Record exists (e.g. from a previous partial attempt or webhook)
      await payments.updateOne(
        { tx_ref },
        {
          $set: {
            transactionId: data.id,
            status: "successful",
            credited: true,
            verifiedAt: new Date(),
          },
        }
      );
    }

    // ✅ ADD BALANCE (IN USD)
    const creditAmount = payment.amountUSD || (payment.amount / (payment.appliedRate || 1));
    const creditFixed = Number(creditAmount.toFixed(2));

    const userUpdate = await users.updateOne(
      { email: { $regex: `^${payment.customerEmail}$`, $options: "i" } },
      { $inc: { balance: creditFixed } }
    );

    if (userUpdate.matchedCount === 0) {
      console.error(`[Flutterwave Verify] User NOT found for email: ${payment.customerEmail}. Balance NOT credited.`);
      // We still return true to frontend because payment was successful, 
      // but admin needs to know balance wasn't added automatically.
    } else {
      console.log(`[Flutterwave Verify] Successfully credited $${creditFixed} to ${payment.customerEmail}`);
      try {
        await updateStats({ 
          totalUserBalance: creditFixed,
          totalDeposits: creditFixed,
          totalTurnover: creditFixed
        });
      } catch (statsErr) {
        console.error("[Flutterwave Verify] Stats update failed:", statsErr.message);
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
