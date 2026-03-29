const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const { MongoClient } = require("mongodb");
const { updateStats } = require("./utils/stats");

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
    const { amount, email, name } = req.body; // amount is in USD from frontend

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
      redirect_url: `https://acctempire.com/payment?reference=${reference}`,
      customer: {
        email, // ✅ LOGIN USER EMAIL
        name: name || "Customer",
      },
      metadata: {
        amountUSD,
        amountNGN,
        appliedRate: rate,
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
      `https://api.korapay.com/merchant/api/v1/charges/${reference}`,
      {
        headers: { Authorization: `Bearer ${KORAPAY_SECRET_KEY}` },
      }
    );

    const data = kpRes.data.data;
    const isSuccess = data.status?.toLowerCase() === "success" || data.status?.toLowerCase() === "successful";
    
    if (!isSuccess) {
      console.warn(`[Korapay Verify] Transaction not successful: ${data.status}`, data);
      return res.json({ success: false });
    }

    let payment = await payments.findOne({ reference });
    
    if (payment && payment.credited) {
      return res.json({ success: true });
    }

    const { amount: amountNGN, customer, metadata } = data;
    const customerEmail = customer?.email;
    const amountUSD = metadata?.amountUSD ? Number(metadata.amountUSD) : 0;
    const appliedRate = metadata?.appliedRate ? Number(metadata.appliedRate) : 0;

    if (!payment) {
      // Create record for the first time on success (Like Flutterwave)
      const newPayment = {
        reference,
        transactionId: data.id || data.transaction_reference || data.transaction_id || data.reference || data.trx || "N/A",
        customerEmail,
        amountUSD,
        amountNGN,
        appliedRate,
        amount: amountNGN,
        method: "korapay",
        status: "successful",
        credited: true,
        createdAt: new Date(),
        verifiedAt: new Date(),
      };
      await payments.insertOne(newPayment);
      payment = newPayment;
    } else {
      // Record exists (unlikely in new flow but good for safety)
      await payments.updateOne(
        { reference },
        {
          $set: {
            status: "successful",
            transactionId: data.id || data.transaction_reference || data.transaction_id || data.reference || data.trx || "N/A",
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
      console.error(`[Korapay Verify] User NOT found for email: ${payment.customerEmail}. Balance NOT credited.`);
    } else {
      console.log(`[Korapay Verify] Successfully credited $${creditFixed} to ${payment.customerEmail}`);
      try {
        await updateStats({ 
          totalUserBalance: creditFixed,
          totalDeposits: creditFixed,
          totalTurnover: creditFixed
        });
      } catch (statsErr) {
        console.error("[Korapay Verify] Stats update failed:", statsErr.message);
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Korapay verify error:", err.response?.data || err.message);
    res.status(500).json({ success: false });
  }
});

// ================= WEBHOOK =================
router.post("/webhook", async (req, res) => {
  try {
    const signature = req.headers["x-korapay-signature"];
    if (!signature) {
      console.error("[Korapay Webhook] Missing x-korapay-signature header");
      return res.sendStatus(200); // Stop here, but tell Kora OK
    }

    // Verify Signature using raw body if available
    const payload = req.rawBody || JSON.stringify(req.body);
    const hash = crypto
      .createHmac("sha256", KORAPAY_SECRET_KEY)
      .update(payload)
      .digest("hex");

    if (hash !== signature) {
      console.error("[Korapay Webhook] Invalid signature mismatch.");
      return res.sendStatus(200);
    }

    const data = req.body?.data;
    if (!data?.reference) {
      console.log("[Korapay Webhook] No reference found in payload");
      return res.sendStatus(200);
    }

    console.log(`[Korapay Webhook] Received for ref: ${data.reference}, status: ${data.status}`);

    let payment = await payments.findOne({ reference: data.reference });
    
    if (payment && payment.credited) {
      console.log(`[Korapay Webhook] Payment already credited for ref: ${data.reference}`);
      return res.sendStatus(200);
    }

    const isSuccess = data.status?.toLowerCase() === "success" || data.status?.toLowerCase() === "successful";

    if (isSuccess) {
      const { customer, metadata } = data;
      const customerEmail = customer?.email;
      const amountUSD = metadata?.amountUSD ? Number(metadata.amountUSD) : 0;
      const amountNGN = data.amount;
      const appliedRate = metadata?.appliedRate ? Number(metadata.appliedRate) : 0;

      if (!payment) {
        // Create record on webhook success if not already verified
        const newPayment = {
          reference: data.reference,
          transactionId: data.id || data.transaction_reference || data.transaction_id || data.reference || data.trx || "N/A",
          customerEmail,
          amountUSD,
          amountNGN,
          appliedRate,
          amount: amountNGN,
          method: "korapay",
          status: "successful",
          credited: true,
          webhookReceived: true,
          createdAt: new Date(),
          verifiedAt: new Date(),
        };
        await payments.insertOne(newPayment);
        payment = newPayment;
      } else {
        await payments.updateOne(
          { reference: data.reference },
          {
            $set: {
              status: "successful",
              transactionId: data.id || data.transaction_reference || data.transaction_id || data.reference || data.trx || "N/A",
              credited: true,
              webhookReceived: true,
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
        console.error(`[Korapay Webhook] User NOT found for email: ${payment.customerEmail}. Balance NOT credited.`);
      } else {
        console.log(`[Korapay Webhook] Successfully credited $${creditFixed} to ${payment.customerEmail}`);
        try {
          await updateStats({ 
            totalUserBalance: creditFixed,
            totalDeposits: creditFixed,
            totalTurnover: creditFixed
          });
        } catch (statsErr) {
          console.error("[Korapay Webhook] Stats update failed:", statsErr.message);
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Korapay webhook error:", err.message);
    res.sendStatus(200);
  }
});

module.exports = router;
