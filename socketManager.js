const { MongoClient } = require("mongodb");
require("dotenv").config();

const MONGO_URI = process.env.MONGO_URI;
const client = new MongoClient(MONGO_URI);
let presenceCollection;

async function connectDB() {
    try {
        await client.connect();
        const db = client.db("mydb");
        presenceCollection = db.collection("presenceCollection");
        console.log("✅ Socket Manager Connected to MongoDB");
    } catch (error) {
        console.error("❌ Socket Manager MongoDB Error:", error);
    }
}

connectDB();

module.exports = (io) => {
    io.on("connection", (socket) => {
        console.log(`User Connected: ${socket.id}`);

        // Join a specific room (e.g., user email or order ID)
        socket.on("join_room", (data) => {
            socket.join(data);
            console.log(`User with ID: ${socket.id} joined room: ${data}`);
        });

        // Handle user online status
        socket.on("user_connected", async (userId) => {
            if (!userId) return;
            socket.join(userId); // Join room named after userId for personal notifications

            try {
                if (presenceCollection) {
                    await presenceCollection.updateOne(
                        { userId },
                        { $set: { lastSeen: new Date(), status: "online", socketId: socket.id } },
                        { upsert: true }
                    );
                    // Broadcast status update
                    io.emit("user_status_update", { userId, status: "online", lastSeen: new Date() });
                }
            } catch (e) {
                console.error("Error updating status:", e);
            }
        });

        socket.on("disconnect", async () => {
            console.log("User Disconnected", socket.id);
            // Ideally we should map socket.id to userId to set them offline
            // For simplicity/performance, we might rely on the client sending an offline signal 
            // or just letting the 'lastSeen' timestamp age. 
            // But let's try to update if we can find them.
            try {
                if (presenceCollection) {
                    // Find user with this socketId and set to offline
                    // Note: This requires us to save socketId on connect, which we added above.
                    const user = await presenceCollection.findOne({ socketId: socket.id });
                    if (user) {
                        await presenceCollection.updateOne(
                            { _id: user._id },
                            { $set: { status: "offline", lastSeen: new Date() } }
                        );
                        io.emit("user_status_update", { userId: user.userId, status: "offline", lastSeen: new Date() });
                    }
                }
            } catch (e) {
                console.error("Error setting offline:", e);
            }
        });
    });
};
