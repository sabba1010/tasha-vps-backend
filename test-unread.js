const { MongoClient } = require("mongodb");
require("dotenv").config();

async function run() {
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    const db = client.db("mydb");
    const chatCollection = db.collection("chatCollection");

    const unread = await chatCollection.find({ read: { $ne: true } }).toArray();
    console.log(`Found ${unread.length} unread messages globally.`);
    if (unread.length > 0) {
        console.log("Sample:", unread[0]);
    }
    
    // Test aggregate
    const results = await chatCollection.aggregate([
        { $match: { read: { $ne: true } } },
        { $group: { _id: "$orderId", count: { $sum: 1 } } }
    ]).toArray();
    console.log("Aggregate unread by orderId:", results);

    process.exit(0);
}
run();
