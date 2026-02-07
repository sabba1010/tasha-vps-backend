const { MongoClient, ObjectId } = require("mongodb");

const MONGO_URI = "mongodb+srv://ataur_dev:QzSoy1IYdiSGSAgU@practicemongodb.zhvbu.mongodb.net/?appName=PracticeMongoDB";
// Adjust URI if needed. Assuming local default.
const client = new MongoClient(MONGO_URI);

async function run() {
    try {
        await client.connect();
        const db = client.db("mydb");
        const userCollection = db.collection("userCollection");
        const purchaseCollection = db.collection("mypurchase");
        const productsCollection = db.collection("products");

        console.log("Connected to DB");

        // 1. Get current Admin Stats
        const admin = await userCollection.findOne({ email: "admin@gmail.com" });
        if (!admin) {
            console.error("Admin user not found!");
            return;
        }
        console.log("Current Admin Balance:", admin.balance);
        console.log("Current Admin Sales Balance:", admin.adminSalesBalance);

        // 2. Simulate Sale (Admin is Seller)
        const product = {
            name: "Admin Product",
            price: 100,
            sellerEmail: "admin@gmail.com", // EXACTLY MATCHING
            deliveryTime: "1 hour"
        };

        const insertProduct = await productsCollection.insertOne(product);
        const productId = insertProduct.insertedId;

        const purchase = {
            buyerId: new ObjectId(),
            buyerEmail: "test_buyer@example.com",
            productName: "Admin Product",
            price: 100,
            sellerEmail: "admin@gmail.com",
            productId: productId,
            purchaseDate: new Date(),
            status: "pending",
            deliveryType: "manual",
            deliveryTime: "1 hour"
        };

        const insertPurchase = await purchaseCollection.insertOne(purchase);
        const orderId = insertPurchase.insertedId;
        console.log("Created test order:", orderId);

        // 3. Confirm Order (Manually via logic simulation matching purchase.js)
        const session = client.startSession();
        try {
            await session.withTransaction(async () => {
                const amount = 100;
                const platformFee = amount * 0.2; // 20
                const sellerShare = amount * 0.8; // 80

                // Logic from purchase.js for Admin Seller
                // Check logic inside purchase.js
                // if (order.sellerEmail === "admin@gmail.com")

                const pInside = await purchaseCollection.findOne({ _id: orderId }, { session });
                const sellerEmail = pInside.sellerEmail;

                // This mimics the logic in purchase.js exactly
                if (sellerEmail === "admin@gmail.com") {
                    await userCollection.updateOne({ email: "admin@gmail.com" }, { $inc: { balance: platformFee, adminSalesBalance: sellerShare } }, { session });
                } else {
                    if (sellerEmail) {
                        await userCollection.updateOne({ email: sellerEmail }, { $inc: { balance: sellerShare } }, { session });
                    }
                    await userCollection.updateOne({ email: "admin@gmail.com" }, { $inc: { balance: platformFee } }, { session });
                }

                await purchaseCollection.updateOne({ _id: orderId }, { $set: { status: "completed" } }, { session });
            });
        } finally {
            await session.endSession();
        }

        // 4. Check Admin Stats Again
        const updatedAdmin = await userCollection.findOne({ email: "admin@gmail.com" });
        console.log("--- After Sale ---");
        console.log("New Admin Balance:", updatedAdmin.balance);
        console.log("New Admin Sales Balance:", updatedAdmin.adminSalesBalance);

        console.log("Balance Change:", (updatedAdmin.balance || 0) - (admin.balance || 0));
        console.log("Sales Balance Change:", (updatedAdmin.adminSalesBalance || 0) - (admin.adminSalesBalance || 0));

    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}

run();
