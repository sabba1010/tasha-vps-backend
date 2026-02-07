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

const activeUsersSockets = new Map();

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
            socket.userId = userId;
            socket.join(userId);

            if (!activeUsersSockets.has(userId)) {
                activeUsersSockets.set(userId, new Set());
            }
            activeUsersSockets.get(userId).add(socket.id);

            try {
                if (presenceCollection) {
                    const now = new Date();
                    await presenceCollection.updateOne(
                        { userId },
                        { $set: { lastSeen: now, status: "online" } },
                        { upsert: true }
                    );
                    // Broadcast status update to EVERYONE
                    io.emit("user_status_update", { userId, status: "online", lastSeen: now.toISOString() });
                }
            } catch (e) {
                console.error("Error updating status:", e);
            }
        });

        socket.on("disconnect", async () => {
            const userId = socket.userId;
            console.log("User Disconnected", socket.id, "userId:", userId);

            if (userId && activeUsersSockets.has(userId)) {
                activeUsersSockets.get(userId).delete(socket.id);

                if (activeUsersSockets.get(userId).size === 0) {
                    activeUsersSockets.delete(userId);

                    try {
                        if (presenceCollection) {
                            const now = new Date();
                            await presenceCollection.updateOne(
                                { userId },
                                { $set: { status: "offline", lastSeen: now } }
                            );
                            // Broadcast offline status to EVERYONE only when ALL tabs are closed
                            io.emit("user_status_update", { userId, status: "offline", lastSeen: now.toISOString() });
                        }
                    } catch (e) {
                        console.error("Error setting offline:", e);
                    }
                }
            }
        });
    });
};
