const express = require("express");
const { MongoClient } = require("mongodb");
const { getStats } = require("../utils/stats");

const router = express.Router();
const MONGO_URI = process.env.MONGO_URI;
const client = new MongoClient(MONGO_URI);

router.get("/financial-metrics", async (req, res) => {
    try {
        await client.connect();
        const db = client.db("mydb");
        const userCollection = db.collection("userCollection");

        // 1. Get stats from singleton
        const stats = await getStats();

        // 2. Get Admin details (Platform Profit and Admin Sales Balance)
        const adminUser = await userCollection.findOne({ email: "admin@gmail.com" });

        // 3. Aggregate Total Wallet Balance Held by Users
        // (We track it in stats, but let's calculate it periodically or just trust the running sum)
        // For accuracy, let's also have an endpoint to recalculate it if needed, 
        // but for now we trust stats.totalUserBalance.

        const response = {
            success: true,
            metrics: {
                // Admin total balance = actual system liquidity (deposits - withdrawals)
                adminWalletBalance: stats ? (stats.totalTurnover || 0) : 0,
                currentSystemTurnover: stats ? (stats.totalTurnover || 0) : 0,

                // Spent platform profit is tracked via stats.totalAdminWithdrawn
                // Available Profit = Lifetime Earned - Already Withdrawn
                currentWalletPlatformProfit: stats ? (Number(stats.lifetimePlatformProfit || 0) - Number(stats.totalAdminWithdrawn || 0)) : 0,

                // Admin sales balance is the withdrawable portion of the admin's balance
                adminSalesBalance: adminUser ? (adminUser.balance || 0) : 0,

                lifetimePlatformProfit: stats ? (stats.lifetimePlatformProfit || 0) : 0,
                totalWalletBalanceHeldByUsers: stats ? (stats.totalUserBalance || 0) : 0
            }
        };

        res.json(response);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
