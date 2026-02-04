const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");

const router = express.Router();
const MONGO_URI = process.env.MONGO_URI;
const client = new MongoClient(MONGO_URI);

let db, ratingCollection, reportCollection, purchaseCollection, userCollection;

(async () => {
    try {
        await client.connect();
        db = client.db("mydb");
        ratingCollection = db.collection("ratings");
        reportCollection = db.collection("reports");
        purchaseCollection = db.collection("mypurchase");
        userCollection = db.collection("userCollection");
        console.log("✅ Reputation Service Connected");
    } catch (err) {
        console.error("❌ Reputation Service Connection failed:", err);
    }
})();

// =======================================================
// 🚀 GET /reputation/summary (Admin Only)
// =======================================================
router.get("/summary", async (req, res) => {
    try {
        // 1. Get all ratings grouped by seller
        const allRatings = await ratingCollection.find({}).toArray();

        // 2. Get all reports
        const allReports = await reportCollection.find({}).toArray();

        // 3. Get all purchases (for completion rates)
        const allPurchases = await purchaseCollection.find({}).toArray();

        // 4. Get all sellers (from userCollection where role is seller)
        // We fetch all to ensure we cover those with 0 ratings/reports too
        const sellers = await userCollection.find({ role: "seller" }).toArray();

        const summary = sellers.map(seller => {
            const email = seller.email;
            const sellerRatings = allRatings.filter(r => r.sellerEmail === email);
            const sellerReports = allReports.filter(r => r.sellerEmail === email);
            const sellerPurchases = allPurchases.filter(p => p.sellerEmail === email);

            // Calculations
            const totalReviews = sellerRatings.length;
            const avgRating = totalReviews > 0
                ? Number((sellerRatings.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(1))
                : 5.0; // Assume 5.0 for new sellers with no reviews

            const reportsCount = sellerReports.length;
            const disputesCount = sellerReports.filter(r => r.status === "Refunded").length;

            const completedOrders = sellerPurchases.filter(p => ["completed", "success"].includes(p.status?.toLowerCase())).length;
            const cancelledOrders = sellerPurchases.filter(p => p.status?.toLowerCase() === "cancelled").length;
            const totalInvolved = completedOrders + cancelledOrders;

            const completionRate = totalInvolved > 0
                ? Number(((completedOrders / totalInvolved) * 100).toFixed(1))
                : 100;

            // Reputation Score Formula
            // Base Score (50) Weight: Average Rating
            const baseScore = (avgRating / 5) * 50;

            // Completion Bonus (30) Weight
            const completionBonus = (completionRate / 100) * 30;

            // Penalty Weight
            const penalty = (reportsCount * 2) + (disputesCount * 5) + (cancelledOrders * 1);

            const rawScore = baseScore + completionBonus - penalty;
            const finalScore = Math.max(0, Math.min(100, Math.round(rawScore)));

            // Status logic
            let status = "normal";
            if (finalScore >= 90 && totalReviews > 5) status = "verified";
            if (finalScore < 50 || disputesCount > 3) status = "warning";
            if (finalScore < 20) status = "at_risk";

            return {
                sellerEmail: email,
                sellerName: seller.name || email.split("@")[0],
                avgRating,
                totalReviews,
                reportsCount,
                disputesCount,
                cancelledOrders,
                completedOrders,
                completionRate,
                reputationScore: finalScore,
                status,
                recentReviews: sellerRatings.slice(-5)
            };
        });

        // Sort by reputation score descending
        summary.sort((a, b) => b.reputationScore - a.reputationScore);

        res.status(200).json({
            success: true,
            data: summary
        });
    } catch (error) {
        console.error("❌ Reputation Summary Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
