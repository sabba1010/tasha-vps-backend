const { MongoClient } = require("mongodb");
const { sendEmail, getNotificationTemplate } = require("./email");
const { sendWhatsAppMessage } = require("./whatsapp");

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

        // Fetch user once for both Email and WhatsApp
        const user = await userCollection.findOne({ email: userEmail });
        const name = user ? user.name : "User";

        // 3. Send Email
        try {
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

        // 4. Send WhatsApp
        try {
            if (user && user.phone) {
                let fullPhone = user.phone;
                // If it doesn't start with +, prepend the dialCode if available
                if (!fullPhone.startsWith("+") && user.dialCode) {
                    fullPhone = user.dialCode + user.phone;
                }

                const waMessage = `*${title}*\n\n${message}`;
                await sendWhatsAppMessage(fullPhone, waMessage);
            }
        } catch (waErr) {
            console.error("Failed to send WhatsApp notification to:", userEmail, waErr);
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
