const { MongoClient } = require("mongodb");

const MONGO_URI = process.env.MONGO_URI;
const client = new MongoClient(MONGO_URI);
let statsCollection;

async function getStatsCollection() {
    if (!statsCollection) {
        await client.connect();
        const db = client.db("mydb");
        statsCollection = db.collection("systemStats");
        // Ensure singleton
        const stats = await statsCollection.findOne({ _id: "global" });
        if (!stats) {
            const userCollection = db.collection("userCollection");
            const users = await userCollection.find({}).toArray();
            const initialTotalBalance = users.reduce((sum, u) => sum + (Number(u.balance) || 0), 0);

            await statsCollection.insertOne({
                _id: "global",
                totalTurnover: 0,
                lifetimePlatformProfit: 0,
                totalUserBalance: initialTotalBalance,
                updatedAt: new Date()
            });
        }
    }
    return statsCollection;
}

async function updateStats(updates, session = null) {
    const col = await getStatsCollection();
    const updateObj = { $inc: {}, $set: { updatedAt: new Date() } };

    for (const [key, value] of Object.entries(updates)) {
        updateObj.$inc[key] = value;
    }

    return await col.updateOne({ _id: "global" }, updateObj, { session });
}

async function getStats() {
    const col = await getStatsCollection();
    return await col.findOne({ _id: "global" });
}

module.exports = {
    updateStats,
    getStats
};
