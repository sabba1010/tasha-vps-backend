const { MongoClient } = require("mongodb");
const { sendEmail, getNotificationTemplate } = require("./email");

const MONGO_URI = process.env.MONGO_URI;
const client = new MongoClient(MONGO_URI);

let notificationCollection;
let userCollection;

async function initDB() {
    if (notificationCollection) return;
    try {
        await client.connect();
        const db = client.db("mydb");
        notificationCollection = db.collection("notifiCollection");
        userCollection = db.collection("userCollection");
    } catch (err) {
        console.error("Notification Utility DB Connection Error:", err);
    }
}

/**
 * Send a notification to a specific user via DB, Socket, and Email.
 * @param {Object} app - The express app instance (to get io)
 * @param {Object} data - Notification data
 * @param {string} data.userEmail - Recipient's email
 * @param {string} data.title - Notification title
 * @param {string} data.message - Notification message
 * @param {string} [data.type] - Notification type (e.g., "chat", "withdrawal", "order")
 * @param {string} [data.relatedId] - Related document ID (orderId, withdrawalId, etc.)
 * @param {string} [data.link] - Optional link for the email "View Update" button
 */
const sendNotification = async (app, { userEmail, title, message, type, relatedId, link }) => {
    try {
        await initDB();

        // 1. Insert into DB
        const notificationDoc = {
            userEmail,
            title,
            message,
            type: type || "system",
            relatedId: relatedId || null,
            read: false,
            createdAt: new Date(),
        };

        const result = await notificationCollection.insertOne(notificationDoc);

        // 2. Emit via Socket.IO
        const io = app.get("io");
        if (io) {
            io.to(userEmail).emit("new_notification", {
                ...notificationDoc,
                _id: result.insertedId
            });
        }

        // 3. Send Email
        try {
            // Fetch user's name for a personalized email
            const user = await userCollection.findOne({ email: userEmail });
            const name = user ? user.name : "User";

            const emailHtml = getNotificationTemplate({
                name,
                title,
                message,
                link: link || null
            });

            await sendEmail({
                to: userEmail,
                subject: title,
                html: emailHtml
            });
        } catch (emailErr) {
            console.error("Failed to send notification email to:", userEmail, emailErr);
        }

        return { success: true, notificationId: result.insertedId };
    } catch (err) {
        console.error("Send Notification Error:", err);
        return { success: false, error: err.message };
    }
};

module.exports = {
    sendNotification
};
