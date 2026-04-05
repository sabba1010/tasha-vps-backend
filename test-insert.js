const { MongoClient, ObjectId } = require("mongodb");
require("dotenv").config();

async function run() {
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    const db = client.db("mydb");
    const chatCollection = db.collection("chatCollection");
    const purchaseCollection = db.collection("mypurchase");

    const orders = await purchaseCollection.find({}).limit(1).toArray();
    if(orders.length === 0) {
        console.log("No orders found");
        process.exit();
    }
    const o = orders[0];
    
    // insert a mock message as UNREAD
    const result = await chatCollection.insertOne({
        senderId: o.buyerEmail.toLowerCase(),
        receiverId: o.sellerEmail.toLowerCase(),
        orderId: o._id.toString(),
        message: "Hello from test script! " + Date.now(),
        read: false, // explicitly false
        timestamp: new Date()
    });

    console.log("Inserted UNREAD message! ID:", result.insertedId);

    const counts = await chatCollection.aggregate([
        { $match: { receiverId: o.sellerEmail.toLowerCase(), read: { $ne: true } } },
        { $group: { _id: "$orderId", count: { $sum: 1 } } }
    ]).toArray();

    console.log("Query Results for this receiver:", counts);
    
    process.exit(0);
}
run();
