const { MongoClient } = require("mongodb");
const MONGO_URI = "mongodb+srv://ataur_dev:QzSoy1IYdiSGSAgU@practicemongodb.zhvbu.mongodb.net/?appName=PracticeMongoDB";
const client = new MongoClient(MONGO_URI);

async function run() {
    try {
        await client.connect();
        const db = client.db("mydb");
        const userCollection = db.collection("userCollection");

        const admin = await userCollection.findOne({ email: "admin@gmail.com" });
        if (!admin) {
            console.error("Admin not found!");
            return;
        }

        // Capture current values
        const currentBalance = admin.balance || 0; // This is currently holding PROFIT
        const currentSales = admin.adminSalesBalance || 0; // This is currently holding SALES

        console.log("Before Migration:");
        console.log(`balance (Profit): ${currentBalance}`);
        console.log(`adminSalesBalance (Sales): ${currentSales}`);

        const result = await userCollection.updateOne(
            { email: "admin@gmail.com" },
            {
                $set: {
                    balance: currentSales, // Move SALES to balance (withdrawable)
                    platformProfit: currentBalance, // Move PROFIT to new field
                    adminSalesBalance: 0 // Reset or remove this field? Remove is cleaner but 0 is okay.
                }
            }
        );

        console.log("Migration Result:", result);

        const updatedAdmin = await userCollection.findOne({ email: "admin@gmail.com" });
        console.log("After Migration:");
        console.log(`balance (Sales): ${updatedAdmin.balance}`);
        console.log(`platformProfit (Profit): ${updatedAdmin.platformProfit}`);

    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}

run();
