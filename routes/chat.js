// const express = require("express");
// const { MongoClient, ObjectId } = require("mongodb"); // ObjectId ইমপোর্ট করতে হবে
// const router = express.Router();

// const MONGO_URI = process.env.MONGO_URI;
// const client = new MongoClient(MONGO_URI);

// async function run() {
//   try {
//     await client.connect();
//     const db = client.db("mydb");
//     const chatCollection = db.collection("chatCollection");

//     await chatCollection.createIndex({ "timestamp": 1 }, { expireAfterSeconds: 2592000 });


//     // ---------------------------------------------------------
//     // 1. POST: Send Message (Save with Order ID)
//     // ---------------------------------------------------------
//     router.post("/send", async (req, res) => {
//       try {
//         const { senderId, receiverId, message, orderId } = req.body;

//         if (!senderId || !receiverId || !message || !orderId) {
//           return res.status(400).json({ 
//             error: "All fields including 'orderId' are required" 
//           });
//         }

//         const newMessage = {
//           senderId,
//           receiverId,
//           message,
//           orderId, 
//           // এখানে new Date() ব্যবহার করা জরুরি, কারণ TTL ইনডেক্স Date অবজেক্টের ওপর কাজ করে
//           timestamp: new Date(), 
//         };

//         const result = await chatCollection.insertOne(newMessage);
//         res.status(201).json({ success: true, data: result });
//       } catch (error) {
//         console.error("Send Error:", error);
//         res.status(500).json({ error: "Internal Server Error" });
//       }
//     });

//     // ---------------------------------------------------------
//     // 2. GET: Chat History (Filtered by User AND Order ID)
//     // ---------------------------------------------------------
//     router.get("/history/:user1/:user2", async (req, res) => {
//       try {
//         const { user1, user2 } = req.params;
//         const { orderId } = req.query; 

//         if (!orderId) {
//           return res.status(400).json({ 
//             error: "Order ID is required to fetch specific chat history" 
//           });
//         }

//         const query = {
//           $and: [
//             {
//               $or: [
//                 { senderId: user1, receiverId: user2 },
//                 { senderId: user2, receiverId: user1 },
//               ],
//             },
//             { orderId: orderId } 
//           ],
//         };

//         const chats = await chatCollection
//           .find(query)
//           .sort({ timestamp: 1 }) 
//           .toArray();

//         res.status(200).json(chats);
//       } catch (error) {
//         console.error("History Error:", error);
//         res.status(500).json({ error: "Internal Server Error" });
//       }
//     });

//     // ---------------------------------------------------------
//     // 3. DELETE: Delete Specific Message (For Frontend Manual Call)
//     // ---------------------------------------------------------
//     // যদি ফ্রন্টএন্ড থেকে ম্যানুয়ালি ডিলিট রিকোয়েস্ট আসে, এটা হ্যান্ডেল করবে
//     router.delete("/:id", async (req, res) => {
//       try {
//         const id = req.params.id;
//         const query = { _id: new ObjectId(id) };
//         const result = await chatCollection.deleteOne(query);
//         res.send(result);
//       } catch (error) {
//         console.error("Delete Error:", error);
//         res.status(500).json({ error: "Could not delete message" });
//       }
//     });

//   } catch (error) {
//     console.error("Database connection error:", error);
//   }
// }



// run();

// module.exports = router;



//ArifurRahman Updated Code Below



// const express = require("express");
// const { MongoClient, ObjectId } = require("mongodb"); // ObjectId ইমপোর্ট করতে হবে
// const router = express.Router();

// const MONGO_URI = process.env.MONGO_URI;
// const client = new MongoClient(MONGO_URI);

// async function run() {
//   try {
//     await client.connect();
//     const db = client.db("mydb");
//     const chatCollection = db.collection("chatCollection");

//     const presenceCollection = db.collection("presenceCollection");

//     await chatCollection.createIndex({ "timestamp": 1 }, { expireAfterSeconds: 2592000 });
//     // keep presence docs for up to 1 hour (cleanup)
//     await presenceCollection.createIndex({ "lastSeen": 1 }, { expireAfterSeconds: 3600 });
//     const notificationCollection = db.collection("notifiCollection");


//     // ---------------------------------------------------------
//     // 1. POST: Send Message (Save with Order ID)
//     // ---------------------------------------------------------
//     router.post("/send", async (req, res) => {
//       try {
//         const { senderId, receiverId, message, orderId } = req.body;

//         if (!senderId || !receiverId || !message || !orderId) {
//           return res.status(400).json({ 
//             error: "All fields including 'orderId' are required" 
//           });
//         }

//         const newMessage = {
//           senderId,
//           receiverId,
//           message,
//           orderId, 
//           // এখানে new Date() ব্যবহার করা জরুরি, কারণ TTL ইনডেক্স Date অবজেক্টের ওপর কাজ করে
//           timestamp: new Date(), 
//         };

//         const result = await chatCollection.insertOne(newMessage);
//         // mark sender presence as online when they send a message
//         try {
//           await presenceCollection.updateOne({ userId: senderId }, { $set: { lastSeen: new Date(), status: 'online' } }, { upsert: true });
//         } catch (e) { /* ignore presence update errors */ }

//         // create a notification for the receiver so they can be alerted when chat is closed
//         try {
//           await notificationCollection.insertOne({
//             userEmail: receiverId,
//             type: 'chat',
//             from: senderId,
//             message,
//             orderId: orderId || null,
//             read: false,
//             createdAt: new Date(),
//           });
//         } catch (e) { /* ignore notification errors */ }
//         res.status(201).json({ success: true, data: result });
//       } catch (error) {
//         console.error("Send Error:", error);
//         res.status(500).json({ error: "Internal Server Error" });
//       }
//     });

//     // ---------------------------------------------------------
//     // 2. GET: Chat History (Filtered by User AND Order ID)
//     // ---------------------------------------------------------
//     router.get("/history/:user1/:user2", async (req, res) => {
//       try {
//         const { user1, user2 } = req.params;
//         const { orderId } = req.query; 

//         if (!orderId) {
//           return res.status(400).json({ 
//             error: "Order ID is required to fetch specific chat history" 
//           });
//         }

//         const query = {
//           $and: [
//             {
//               $or: [
//                 { senderId: user1, receiverId: user2 },
//                 { senderId: user2, receiverId: user1 },
//               ],
//             },
//             { orderId: orderId } 
//           ],
//         };

//         const chats = await chatCollection
//           .find(query)
//           .sort({ timestamp: 1 }) 
//           .toArray();

//         res.status(200).json(chats);
//       } catch (error) {
//         console.error("History Error:", error);
//         res.status(500).json({ error: "Internal Server Error" });
//       }
//     });

//     // ---------------------------------------------------------
//     // 3. DELETE: Delete Specific Message (For Frontend Manual Call)
//     // ---------------------------------------------------------
//     // যদি ফ্রন্টএন্ড থেকে ম্যানুয়ালি ডিলিট রিকোয়েস্ট আসে, এটা হ্যান্ডেল করবে
//     router.delete("/:id", async (req, res) => {
//       try {
//         const id = req.params.id;
//         const query = { _id: new ObjectId(id) };
//         const result = await chatCollection.deleteOne(query);
//         res.send(result);
//       } catch (error) {
//         console.error("Delete Error:", error);
//         res.status(500).json({ error: "Could not delete message" });
//       }
//     });

//     // ---------------------------------------------------------
//     // 4. POST: Update presence (online/offline)
//     // body: { userId: string, status?: 'online'|'offline' }
//     // If status === 'online' we set lastSeen = now; if 'offline' we set lastSeen to epoch
//     // ---------------------------------------------------------
//     router.post('/status', async (req, res) => {
//       try {
//         const { userId, status } = req.body;
//         if (!userId) return res.status(400).json({ error: 'userId is required' });

//         const now = new Date();
//         if (status === 'offline') {
//           await presenceCollection.updateOne({ userId }, { $set: { lastSeen: new Date(0), status: 'offline' } }, { upsert: true });
//           return res.status(200).json({ success: true });
//         }

//         await presenceCollection.updateOne({ userId }, { $set: { lastSeen: now, status: 'online' } }, { upsert: true });
//         return res.status(200).json({ success: true });
//       } catch (error) {
//         console.error('Status Error:', error);
//         res.status(500).json({ error: 'Internal Server Error' });
//       }
//     });

//     // ---------------------------------------------------------
//     // 5. GET: Get presence for a single user
//     // ---------------------------------------------------------
//     router.get('/status/:userId', async (req, res) => {
//       try {
//         const { userId } = req.params;
//         const doc = await presenceCollection.findOne({ userId });
//         const lastSeen = doc?.lastSeen || null;
//         const online = lastSeen ? (Date.now() - new Date(lastSeen).getTime()) < 300000 : false; // online if seen within 5 minutes
//         return res.status(200).json({ userId, lastSeen, online });
//       } catch (error) {
//         console.error('Get Status Error:', error);
//         res.status(500).json({ error: 'Internal Server Error' });
//       }
//     });

//     // ---------------------------------------------------------
//     // 6. GET: Get presence for two users at once
//     // ---------------------------------------------------------
//     router.get('/status/pair/:user1/:user2', async (req, res) => {
//       try {
//         const { user1, user2 } = req.params;
//         const docs = await presenceCollection.find({ userId: { $in: [user1, user2] } }).toArray();
//         const map = {};
//         [user1, user2].forEach(u => {
//           const doc = docs.find(d => d.userId === u);
//           const lastSeen = doc?.lastSeen || null;
//           const online = lastSeen ? (Date.now() - new Date(lastSeen).getTime()) < 300000 : false; // 5 minutes
//           map[u] = { userId: u, lastSeen, online };
//         });
//         return res.status(200).json(map);
//       } catch (error) {
//         console.error('Pair Status Error:', error);
//         res.status(500).json({ error: 'Internal Server Error' });
//       }
//     });

//   } catch (error) {
//     console.error("Database connection error:", error);
//   }
// }



// run();

// module.exports = router;


//ArifurRahman Final Updated Code Below


// routes/chat.js
// const express = require("express");
// const { MongoClient, ObjectId } = require("mongodb");
// const router = express.Router();

// const MONGO_URI = process.env.MONGO_URI;
// const client = new MongoClient(MONGO_URI);

// async function run() {
//   try {
//     await client.connect();
//     const db = client.db("mydb");
//     const chatCollection = db.collection("chatCollection");
//     const presenceCollection = db.collection("presenceCollection");
//     const notificationCollection = db.collection("notifiCollection");

//     // TTL Indexes
//     await chatCollection.createIndex({ timestamp: 1 }, { expireAfterSeconds: 2592000 }); // 30 days
//     await presenceCollection.createIndex({ lastSeen: 1 }, { expireAfterSeconds: 3600 }); // 1 hour

//     // ----------------------
//     // 1. POST: Send Message
//     // ----------------------
//     router.post("/send", async (req, res) => {
//       try {
//         const { senderId, receiverId, message, orderId } = req.body || {};
//         if (!senderId || !receiverId || !message || !orderId) {
//           return res.status(400).json({ error: "All fields including 'orderId' are required" });
//         }

//         const newMessage = { senderId, receiverId, message, orderId, timestamp: new Date() };
//         const result = await chatCollection.insertOne(newMessage);

//         // Update sender presence
//         try {
//           await presenceCollection.updateOne(
//             { userId: senderId },
//             { $set: { lastSeen: new Date(), status: "online" } },
//             { upsert: true }
//           );
//         } catch (e) {}

//         // Notification for receiver
//         try {
//           await notificationCollection.insertOne({
//             userEmail: receiverId,
//             type: "chat",
//             from: senderId,
//             message,
//             orderId,
//             read: false,
//             createdAt: new Date(),
//           });
//         } catch (e) {}

//         res.status(201).json({ success: true, data: result });
//       } catch (error) {
//         console.error("Send Error:", error);
//         res.status(500).json({ error: "Internal Server Error" });
//       }
//     });

//     // ----------------------
//     // 2. GET: Chat History
//     // ----------------------
//     router.get("/history/:user1/:user2", async (req, res) => {
//       try {
//         const { user1, user2 } = req.params;
//         const { orderId } = req.query || {};
//         if (!orderId) return res.status(400).json({ error: "Order ID is required" });

//         const query = {
//           $and: [
//             {
//               $or: [
//                 { senderId: user1, receiverId: user2 },
//                 { senderId: user2, receiverId: user1 },
//               ],
//             },
//             { orderId },
//           ],
//         };

//         const chats = await chatCollection.find(query).sort({ timestamp: 1 }).toArray();
//         res.status(200).json(chats);
//       } catch (error) {
//         console.error("History Error:", error);
//         res.status(500).json({ error: "Internal Server Error" });
//       }
//     });

//     // ----------------------
//     // 3. DELETE: Delete Message
//     // ----------------------
//     router.delete("/:id", async (req, res) => {
//       try {
//         const id = req.params.id;
//         const result = await chatCollection.deleteOne({ _id: new ObjectId(id) });
//         res.json(result);
//       } catch (error) {
//         console.error("Delete Error:", error);
//         res.status(500).json({ error: "Could not delete message" });
//       }
//     });

//     // ----------------------
//     // 4. POST: Update Presence
//     // ----------------------
//     router.post("/status", async (req, res) => {
//       try {
//         const { userId, status } = req.body || {};
//         if (!userId) return res.status(400).json({ error: "userId is required" });

//         const now = new Date();
//         if (status === "offline") {
//           await presenceCollection.updateOne(
//             { userId },
//             { $set: { lastSeen: new Date(0), status: "offline" } },
//             { upsert: true }
//           );
//           return res.status(200).json({ success: true });
//         }

//         await presenceCollection.updateOne(
//           { userId },
//           { $set: { lastSeen: now, status: "online" } },
//           { upsert: true }
//         );
//         res.status(200).json({ success: true });
//       } catch (error) {
//         console.error("Status Error:", error);
//         res.status(500).json({ error: "Internal Server Error" });
//       }
//     });

//     // ----------------------
//     // 5. GET: Presence Single User
//     // ----------------------
//     router.get("/status/:userId", async (req, res) => {
//       try {
//         const { userId } = req.params;
//         const doc = await presenceCollection.findOne({ userId });
//         const lastSeen = doc?.lastSeen || null;
//         const online = lastSeen ? Date.now() - new Date(lastSeen).getTime() < 300000 : false;
//         res.json({ userId, lastSeen, online });
//       } catch (error) {
//         console.error("Get Status Error:", error);
//         res.status(500).json({ error: "Internal Server Error" });
//       }
//     });

//     // ----------------------
//     // 6. GET: Presence Pair Users
//     // ----------------------
//     router.get("/status/pair/:user1/:user2", async (req, res) => {
//       try {
//         const { user1, user2 } = req.params;
//         const docs = await presenceCollection.find({ userId: { $in: [user1, user2] } }).toArray();
//         const map = {};
//         [user1, user2].forEach(u => {
//           const doc = docs.find(d => d.userId === u);
//           const lastSeen = doc?.lastSeen || null;
//           const online = lastSeen ? Date.now() - new Date(lastSeen).getTime() < 300000 : false;
//           map[u] = { userId: u, lastSeen, online };
//         });
//         res.json(map);
//       } catch (error) {
//         console.error("Pair Status Error:", error);
//         res.status(500).json({ error: "Internal Server Error" });
//       }
//     });

//   } catch (error) {
//     console.error("Database connection error:", error);
//   }
// }

// run();
// module.exports = router;









const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const router = express.Router();

const MONGO_URI = process.env.MONGO_URI;
const client = new MongoClient(MONGO_URI);

/* ===============================
   Ensure uploads folder exists
================================ */
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/* ===============================
   Multer config
================================ */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

async function run() {
  try {
    await client.connect();
    const db = client.db("mydb");

    const chatCollection = db.collection("chatCollection");
    const presenceCollection = db.collection("presenceCollection");
    const notificationCollection = db.collection("notifiCollection");

    /* ===============================
       TTL Indexes
    ================================ */
    await chatCollection.createIndex(
      { timestamp: 1 },
      { expireAfterSeconds: 2592000 } // ~30 days
    );

    await presenceCollection.createIndex(
      { lastSeen: 1 },
      { expireAfterSeconds: 3600 } // 1 hour
    );

    /* ===============================
       POST: Send Message
    ================================ */
    router.post("/send", upload.single("image"), async (req, res) => {
      try {
        const { senderId, receiverId, orderId } = req.body;
        const message = req.body.message || "";

        if (!senderId || !receiverId || !orderId) {
          return res.status(400).json({
            error: "senderId, receiverId and orderId are required",
          });
        }

        const imageUrl = req.file
          ? `/uploads/${req.file.filename}`
          : null;

        const newMessage = {
          senderId: senderId.toString(),
          receiverId: receiverId.toString(),
          orderId: orderId.toString(),
          message,
          imageUrl,
          timestamp: new Date(),
        };

        const result = await chatCollection.insertOne(newMessage);

        const io = req.app.get("io");

        // Update sender's presence
        await presenceCollection.updateOne(
          { userId: senderId },
          { $set: { lastSeen: new Date(), status: "online" } },
          { upsert: true }
        );
        if (io) {
          io.emit("user_status_update", { userId: senderId, status: "online", lastSeen: new Date() });
        }

        // Create notification for receiver
        try {
          const purchaseDoc = await db.collection("mypurchase").findOne({ _id: new ObjectId(orderId) });
          await notificationCollection.insertOne({
            userEmail: receiverId,
            type: "chat",
            from: senderId,
            message: message || (imageUrl ? "[Image]" : ""),
            orderId,
            productId: purchaseDoc?.productId || null,
            productTitle: purchaseDoc?.productName || null,
            read: false,
            createdAt: new Date(),
          });
        } catch (notifErr) {
          console.error("Failed to create chat notification record:", notifErr);
        }

        // Real-time emit to receiver (and sender for sync)
        if (io) {
          // Emit message to room (orderId) or personal room (receiverId)
          // Ideally chat is persisted in 'orderId' room if both are joined, 
          // OR we send to specific user rooms. 
          // Let's send to both sender and receiver personal rooms or the order room.
          // Assuming frontend joins 'orderId' room or 'receiverId' room.
          // Let's emit to the Order room context if they are chatting there.
          io.to(orderId).emit("receive_message", result.insertedId ? { ...newMessage, _id: result.insertedId } : newMessage);

          // Also emit notification update to receiver
          io.to(receiverId).emit("notification_update", {
            type: 'chat',
            orderId,
            count: 1 // Increment logic should be handled by client or we send total unread
          });

          // Let's actually calculate total unread for this order for the receiver to be precise
          const unreadCount = await notificationCollection.countDocuments({
            userEmail: receiverId.toString(),
            orderId: orderId.toString(),
            read: false,
            type: 'chat'
          });
          io.to(receiverId).emit("unread_count_update", {
            orderId,
            count: unreadCount
          });
        }

        res.status(201).json({
          success: true,
          data: result,
        });
      } catch (error) {
        console.error("Send Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    /* ===============================
       GET: Chat History
    ================================ */
    router.get("/history/:user1/:user2", async (req, res) => {
      try {
        const { user1, user2 } = req.params;
        const { orderId } = req.query;

        if (!orderId) {
          return res.status(400).json({ error: "Order ID is required" });
        }

        const chats = await chatCollection
          .find({
            orderId,
            $or: [
              { senderId: user1, receiverId: user2 },
              { senderId: user2, receiverId: user1 },
            ],
          })
          .sort({ timestamp: 1 })
          .toArray();

        // Mark messages as read when history is fetched by the receiver
        // determining who is the viewer (receiver) is tricky here without auth token, 
        // strictly speaking history can be fetched by either party. 
        // For now, we rely on the explicit POST /mark-read or the frontend calling it.

        res.status(200).json(chats);
      } catch (error) {
        console.error("History Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    /* ===============================
       GET: Unread Counts
       Counts unread messages where userId is the receiverId
    ================================ */
    router.get("/unread/counts/:userId", async (req, res) => {
      try {
        const { userId } = req.params;
        if (!userId) return res.status(400).json({ error: "userId required" });

        // Count messages where user is receiver and message is unread
        const pipeline = [
          {
            $match: {
              receiverId: userId,
              read: { $ne: true } // Messages not marked as read
            }
          },
          {
            $group: {
              _id: "$orderId",
              count: { $sum: 1 }
            }
          }
        ];

        const results = await chatCollection.aggregate(pipeline).toArray();

        // Transform to map { orderId: count }
        const counts = {};
        results.forEach(item => {
          if (item._id) counts[item._id] = item.count;
        });

        res.json(counts);
      } catch (error) {
        console.error("Unread counts error:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });


    /* ===============================
       POST: Mark Read
       Marks messages as read in both chatCollection and notificationCollection
    ================================ */
    router.post("/mark-read", async (req, res) => {
      try {
        const { userId, orderId } = req.body;
        if (!userId || !orderId) return res.status(400).json({ error: "userId and orderId required" });

        // Mark messages as read in chatCollection (where user is receiver)
        await chatCollection.updateMany(
          { receiverId: userId, orderId, read: { $ne: true } },
          { $set: { read: true } }
        );

        // Also update notifications for backwards compatibility
        await notificationCollection.updateMany(
          { userEmail: userId, orderId, read: false },
          { $set: { read: true } }
        );

        const io = req.app.get("io");
        if (io) {
          io.to(userId).emit("unread_count_update", {
            orderId,
            count: 0
          });
        }

        res.json({ success: true });
      } catch (error) {
        console.error("Mark read error:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });


    /* ===============================
       Presence APIs
    ================================ */
    router.post("/status", async (req, res) => {
      try {
        const { userId, status } = req.body;

        if (!userId) {
          return res.status(400).json({ error: "userId is required" });
        }

        const now = new Date();
        const effectiveLastSeen = status === "offline" ? new Date(0) : now;

        await presenceCollection.updateOne(
          { userId },
          { $set: { lastSeen: effectiveLastSeen, status: status } },
          { upsert: true }
        );

        // Broadcast status update via global io
        const io = req.app.get("io");
        if (io) {
          io.emit("user_status_update", { userId, status, lastSeen: effectiveLastSeen.toISOString() });
        }

        res.json({ success: true });
      } catch (error) {
        console.error("Status update error:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    router.get("/status/:userId", async (req, res) => {
      try {
        const { userId } = req.params;
        const doc = await presenceCollection.findOne({ userId });

        if (!doc || !doc.lastSeen) {
          return res.json({
            userId,
            online: false,
            lastSeen: null,
            lastSeenText: "Never active",
          });
        }

        const lastSeenDate = new Date(doc.lastSeen);
        const diffMs = Date.now() - lastSeenDate.getTime();

        // Consider online if active in the last 2 minutes
        const online = diffMs < 120000;

        let lastSeenText = "";

        if (online) {
          lastSeenText = "Active now";
        } else {
          const seconds = Math.floor(diffMs / 1000);
          const minutes = Math.floor(seconds / 60);
          const hours = Math.floor(minutes / 60);
          const days = Math.floor(hours / 24);

          if (seconds < 60) {
            lastSeenText = "Last seen just now";
          } else if (minutes < 60) {
            lastSeenText = `Last seen ${minutes}m ago`;
          } else if (hours < 24) {
            lastSeenText = `Last seen ${hours}h ago`;
          } else if (days < 7) {
            lastSeenText = `Last seen ${days}d ago`;
          } else {
            lastSeenText = `Last seen on ${lastSeenDate.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}`;
          }
        }

        res.json({
          userId,
          online,
          lastSeen: doc.lastSeen.toISOString(),
          lastSeenText,
        });
      } catch (error) {
        console.error("Get status error:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });
  } catch (error) {
    console.error("Database connection error:", error);
  }
}

run().catch(console.dir);

module.exports = router;