const express = require("express");
const axios = require("axios");
const { MongoClient } = require("mongodb");

const router = express.Router();

const KORAPAY_SECRET_KEY = process.env.KORAPAY_SECRET_KEY;
const MONGO_URI = process.env.MONGO_URI;

// ================= Mongo =================
const client = new MongoClient(MONGO_URI);
const db = client.db("mydb");

const payments = db.collection("payments");
const users = db.collection("userCollection");

(async () => {
  await client.connect();
  console.log("MongoDB connected (Korapay)");
})();

// ================= CREATE PAYMENT =================
router.post("/create", async (req, res) => {
  try {
    const { amount, email } = req.body; // amount is in USD from frontend

    if (!amount || !email) {
      return res.status(400).json({ message: "Invalid payload" });
    }

    // Fetch exchange rate (Deposit Rate)
    const settingsColl = db.collection("settings");
    const config = await settingsColl.findOne({ _id: "config" });
    const rate = config?.depositRate || config?.ngnToUsdRate || 1500;

    const amountUSD = Number(amount);
    const amountNGN = Math.round(amountUSD * rate);

    const reference = "kora-" + Date.now();

    const payload = {
      amount: String(amountNGN), // Korapay requires string of NGN
      currency: "NGN",
      reference,
      redirect_url: `http://localhost:3000/payment?reference=${reference}`,
      customer: {
        email, // ✅ LOGIN USER EMAIL
      },
    };

    const kpRes = await axios.post(
      "https://api.korapay.com/merchant/api/v1/charges/initialize",
      payload,
      {
        headers: {
          Authorization: `Bearer ${KORAPAY_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    // 🔐 SOURCE OF TRUTH
    await payments.insertOne({
      reference,
      customerEmail: email,
      amountUSD,
      amountNGN,
      appliedRate: rate,
      amount: amountNGN, // Keep for legacy/compat
      method: "korapay",
      status: "pending",
      credited: false,
      createdAt: new Date(),
    });

    res.json({
      checkoutUrl: kpRes.data.data.checkout_url,
    });
  } catch (err) {
    console.error("Korapay create error:", err.response?.data || err.message);
    res.status(500).json({ message: "Korapay create failed" });
  }
});

// ================= VERIFY (MANUAL REDIRECT) =================
router.get("/verify", async (req, res) => {
  try {
    const { reference } = req.query;
    if (!reference) return res.status(400).json({ success: false });

    const kpRes = await axios.get(
      `https://api.korapay.com/merchant/api/v1/transactions/${reference}`,
      {
        headers: { Authorization: `Bearer ${KORAPAY_SECRET_KEY}` },
      }
    );

    const data = kpRes.data.data;
    if (data.status !== "successful") {
      return res.json({ success: false });
    }

    const payment = await payments.findOne({ reference });
    if (!payment || payment.credited) {
      return res.json({ success: true });
    }

    // ✅ UPDATE PAYMENT
    await payments.updateOne(
      { reference },
      {
        $set: {
          status: "successful",
          transactionId: data.id,
          credited: true,
          verifiedAt: new Date(),
        },
      }
    );

    // ✅ ADD BALANCE (IN USD)
    const creditAmount = payment.amountUSD || (payment.amount / (payment.appliedRate || 1));
    await users.updateOne(
      { email: payment.customerEmail },
      { $inc: { balance: Number(creditAmount.toFixed(2)) } }
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Korapay verify error:", err.response?.data || err.message);
    res.status(500).json({ success: false });
  }
});

// ================= WEBHOOK =================
router.post("/webhook", async (req, res) => {
  try {
    const data = req.body?.data;
    if (!data?.reference) return res.sendStatus(200);

    const payment = await payments.findOne({ reference: data.reference });
    if (!payment || payment.credited) return res.sendStatus(200);

    if (data.status === "successful") {
      await payments.updateOne(
        { reference: data.reference },
        {
          $set: {
            status: "successful",
            credited: true,
            webhookReceived: true,
            verifiedAt: new Date(),
          },
        }
      );

      // ✅ ADD BALANCE (IN USD)
      const creditAmount = payment.amountUSD || (payment.amount / (payment.appliedRate || 1));
      await users.updateOne(
        { email: payment.customerEmail },
        { $inc: { balance: Number(creditAmount.toFixed(2)) } }
      );
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Korapay webhook error:", err.message);
    res.sendStatus(200);
  }
});

module.exports = router;
