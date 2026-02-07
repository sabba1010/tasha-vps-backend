const express = require("express");
const { MongoClient } = require("mongodb");

const router = express.Router();
const client = new MongoClient(process.env.MONGO_URI);

let chatCollection;
let userCollection;
let notifiCollection;

async function initDB() {
  if (chatCollection) return;

  await client.connect();
  const db = client.db("mydb");

  // আপনার ইমেজে থাকা কালেকশন নাম অনুযায়ী
  chatCollection = db.collection("adminChatCollection");
  userCollection = db.collection("userCollection");
  notifiCollection = db.collection("notifiCollection");
}

initDB();

const { sendNotification } = require("../utils/notification");

/* =========================
   SEND MESSAGE (Universal)
========================= */
router.post("/send", async (req, res) => {
  try {
    const { senderEmail, receiverEmail, message } = req.body;

    if (!senderEmail || !message) {
      return res.status(400).json({ error: "senderEmail and message required" });
    }

    // লজিক: 
    // ১. যদি ইউজার পাঠায় (receiverEmail না থাকে), তবে রিসিভার হবে admin@gmail.com
    // ২. যদি এডমিন রিপ্লাই দেয় (receiverEmail থাকে), তবে রিসিভার হবে ওই ইউজার
    const finalReceiver = receiverEmail || "admin@gmail.com";

    const doc = {
      senderId: senderEmail,    // ইমেজের স্ট্রাকচার অনুযায়ী
      receiverId: finalReceiver,
      message: message,
      timestamp: new Date(),    // ইমেজে ফিল্ডের নাম timestamp
      read: false,              // নতুন মেসেজ সবসময় আনরিড থাকবে
    };

    await chatCollection.insertOne(doc);

    // If admin is sending, notify the user
    if (senderEmail === "admin@gmail.com") {
      await sendNotification(req.app, {
        userEmail: finalReceiver,
        title: "New message from admin",
        message: "You have a new support message from administration.",
        type: "admin_chat",
        link: "https://acctempire.com/seller-chat"
      });
    }

    res.json({ success: true, data: doc });
  } catch (err) {
    console.error("Chat send error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   GET CHAT HISTORY
========================= */
router.get("/history/:userEmail", async (req, res) => {
  try {
    const { userEmail } = req.params;

    // এডমিন এবং এই নির্দিষ্ট ইউজারের মধ্যকার সব মেসেজ ফিল্টার হবে
    // এখানে userEmail হতে পারে কোনো সেলারের ইমেইল
    const chats = await chatCollection
      .find({
        $or: [
          { senderId: userEmail, receiverId: "admin@gmail.com" },
          { senderId: "admin@gmail.com", receiverId: userEmail }
        ],
      })
      .sort({ timestamp: 1 })
      .toArray();

    // ফ্রন্টএন্ডের ইন্টারফেস (IMessage) এর সাথে মিল রাখার জন্য ফরম্যাট
    const formattedChats = chats.map(chat => ({
      _id: chat._id,
      senderEmail: chat.senderId,
      receiverEmail: chat.receiverId,
      message: chat.message,
      createdAt: chat.timestamp
    }));

    res.json(formattedChats);
  } catch (err) {
    console.error("Chat history error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   GET UNREAD COUNTS (For Admin)
========================= */
router.get("/unread-counts", async (req, res) => {
  try {
    await initDB();
    // এডমিন রিসিভার হিসেবে আছে এমন সব আনরিড মেসেজ গ্রুপ করা হবে
    const pipeline = [
      {
        $match: {
          receiverId: "admin@gmail.com",
          read: false
        }
      },
      {
        $group: {
          _id: "$senderId",
          count: { $sum: 1 }
        }
      }
    ];

    const results = await chatCollection.aggregate(pipeline).toArray();

    // Transform to map { userEmail: count }
    const counts = {};
    results.forEach(item => {
      counts[item._id] = item.count;
    });

    res.json(counts);
  } catch (err) {
    console.error("Unread counts error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   MARK READ (By Admin)
========================= */
router.post("/mark-read-admin", async (req, res) => {
  try {
    const { userEmail } = req.body;
    if (!userEmail) return res.status(400).json({ error: "userEmail required" });

    await initDB();
    // এই ইউজারের পাঠানো সব মেসেজ যা এডমিন রিসিভ করেছে সেগুলো রিড মার্ক হবে
    await chatCollection.updateMany(
      { senderId: userEmail, receiverId: "admin@gmail.com", read: false },
      { $set: { read: true } }
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Mark read error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;