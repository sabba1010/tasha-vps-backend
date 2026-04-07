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
        const adminUser = await userCollection.findOne({ role: "admin" });

        // Calculate Admin's true sales balance (only from their own products)
        const mypurchaseCollection = db.collection("mypurchase");
        const adminEmail = adminUser ? adminUser.email : "admin@gmail.com";
        const adminSalesDocs = await mypurchaseCollection.find({ sellerEmail: adminEmail, status: "completed" }).toArray();
        let totalAdminSales = 0;
        adminSalesDocs.forEach(order => {
           totalAdminSales += Number(order.price || order.totalPrice || 0);
        });

        const totalTurnover = stats ? (stats.totalTurnover || 0) : 0;
        const lifetimePlatformProfit = stats ? (stats.lifetimePlatformProfit || 0) : 0;
        const totalWithdrawn = stats ? (stats.totalAdminWithdrawn || 0) : 0;

        const response = {
            success: true,
            metrics: {
                // Total Platform Earnings (Activation Fees, Plan Fees, 20% Commissions)
                currentSystemTurnover: totalTurnover * 0.8,

                // Admin Sales Balance (Revenue strictly from admin's own products)
                adminSalesBalance: totalAdminSales,

                // Admin Total Balance (Admin Total Sales + Total Sales Volume) accounting for withdrawals via DB
                currentWalletPlatformProfit: adminUser ? (adminUser.balance || 0) : 0,

                lifetimePlatformProfit: lifetimePlatformProfit,
                totalWalletBalanceHeldByUsers: stats ? (stats.totalUserBalance || 0) : 0
            }
        };

        res.json(response);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
