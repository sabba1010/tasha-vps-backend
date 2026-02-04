// const express = require("express");
// const { MongoClient } = require("mongodb");

// const router = express.Router();

// const MONGO_URI = process.env.MONGO_URI;

// // Mongo DB
// const client = new MongoClient(MONGO_URI);
// const db = client.db("mydb");
// const notification = db.collection("notifiCollection");

// (async () => await client.connect())();

// // POST /api/notification/notify
// router.post("/notify", async (req, res) => {
//   const data = req.body;
//   const result = await notification.insertOne(data)
//   res.send(result)
// });

// // GET /api/notification/getall
// router.get("/getall", async (req, res) => {
//   const notifications = await notification.find({}).toArray();
//   res.send(notifications);
// });

// // ... (আপনার আগের কোড) ...

// // DELETE: Clear all notifications for a specific user
// router.delete("/clear-all/:email", async (req, res) => {
//   const email = req.params.email;
  
//   if (!email) {
//     return res.status(400).json({ error: "Email is required" });
//   }

//   try {
//     const result = await notification.deleteMany({ userEmail: email });
//     res.json({ success: true, deletedCount: result.deletedCount });
//   } catch (err) {
//     console.error("Clear All Error:", err);
//     res.status(500).json({ error: "Failed to clear notifications" });
//   }
// });


// module.exports = router;



const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");

const router = express.Router();
const MONGO_URI = process.env.MONGO_URI;

// Mongo DB Connection
const client = new MongoClient(MONGO_URI);
const db = client.db("mydb");
const notification = db.collection("notifiCollection");

(async () => {
    try {
        await client.connect();
        console.log("Connected to MongoDB for Notifications");
    } catch (err) {
        console.error("MongoDB Connection Error:", err);
    }
})();

// --- ১. অ্যাডমিন অ্যানাউন্সমেন্ট (লিঙ্কসহ আপডেট করা) ---
router.post("/announcement", async (req, res) => {
  try {
    // এখানে 'link' রিসিভ করা হচ্ছে
    const { title, message, target, displayType, link } = req.body;
    
    const data = {
      title,
      message,
      target,       // "all", "buyers", or "sellers"
      displayType,  // "alert" or "popup"
      link: link || "", // লিঙ্ক সেভ করা হচ্ছে (না থাকলে এম্পটি স্ট্রিং)
      type: "announcement",
      createdAt: new Date(),
      read: false
    };

    const result = await notification.insertOne(data);
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    console.error('Announcement Error:', err);
    res.status(500).json({ error: 'Failed to send announcement' });
  }
});

// --- ২. স্পেসিফিক নোটিফিকেশন ---
router.post("/notify", async (req, res) => {
  try {
    const data = { 
      ...req.body, 
      createdAt: new Date(),
      read: false 
    };
    const result = await notification.insertOne(data);
    res.json(result);
  } catch (err) {
    res.status(500).send(err);
  }
});

// --- ৩. নোটিফিকেশন গেট করার লজিক ---
router.get("/getall", async (req, res) => {
  try {
    const { userId, role } = req.query; 
    
    // If no userId provided, it means we want all notifications (e.g. for Admin Dashboard)
    let query = {};
    if (userId) {
      query = {
        $and: [
          {
            $or: [
              { userEmail: userId },
              { target: "all" },
              { target: role },
              { target: role + "s" }
            ]
          },
          { deletedBy: { $ne: userId } }
        ]
      };
    }

    const notifications = await notification.find(query).sort({ createdAt: -1 }).toArray();
    res.json(notifications);
  } catch (err) {
    console.error('Get Notifications Error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

router.delete("/clear-all/:email", async (req, res) => {
  const email = req.params.email;
  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    const { role } = req.query;
    // Instead of deleting, we add the user to 'deletedBy' array
    // This allows global announcements to stay for others while being hidden for this user
    const query = {
      $or: [
        { userEmail: email },
        { target: "all" },
        { target: role },
        { target: role + "s" }
      ]
    };

    const result = await notification.updateMany(
      query,
      { $addToSet: { deletedBy: email } }
    );
    
    res.json({ success: true, updatedCount: result.modifiedCount });
  } catch (err) {
    console.error('Clear All Error:', err);
    res.status(500).json({ error: "Failed to clear notifications" });
  }
});

// Backend Route Example
router.post("/mark-read", async (req, res) => {
  const { email, role } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    // ১. সরাসরি ইউজারের ইমেইলে পাঠানো নোটিফিকেশনগুলো পুরোনো লজিক অনুযায়ী read: true করি
    await notification.updateMany(
      { userEmail: email, read: false }, 
      { $set: { read: true } }
    );

    // ২. সবার জন্য বা রোল ভিত্তিক অ্যানাউন্সমেন্টগুলোতে ইউজারকে readBy অ্যারেতে অ্যাড করি
    const announcementQuery = {
      $and: [
        {
          $or: [
            { target: "all" },
            { target: role },
            { target: role + "s" }
          ]
        },
        { readBy: { $ne: email } }
      ]
    };

    await notification.updateMany(
      announcementQuery,
      { $addToSet: { readBy: email } }
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Mark Read Error:', err);
    res.status(500).send(err);
  }
});

// --- ৪. নোটিফিকেশন ডিলিট করার লজিক ---
router.delete("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: "ID is required" });
    
    const result = await notification.deleteOne({ _id: new ObjectId(id) });
    
    if (result.deletedCount === 1) {
      res.json({ success: true, message: "Notification deleted successfully" });
    } else {
      res.status(404).json({ error: "Notification not found" });
    }
  } catch (err) {
    console.error('Delete Notification Error:', err);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

module.exports = router;


// const express = require("express");
// const { MongoClient } = require("mongodb");

// const router = express.Router();
// const MONGO_URI = process.env.MONGO_URI;

// // Mongo DB Connection
// const client = new MongoClient(MONGO_URI);
// const db = client.db("mydb");
// const notification = db.collection("notifiCollection");

// (async () => await client.connect())();

// // --- ১. নতুন রাউট: অ্যাডমিন অ্যানাউন্সমেন্ট (এই অংশটি আপনার কোডে নেই) ---
// // POST /api/notification/announcement
// router.post("/announcement", async (req, res) => {
//   try {
//     const { title, message, target, displayType } = req.body;
    
//     // ডাটাবেসে সেভ করার অবজেক্ট
//     const data = {
//       title,
//       message,
//       target,       // "all", "buyers", or "sellers"
//       displayType,  // "alert" or "popup"
//       type: "announcement",
//       createdAt: new Date(),
//       read: false
//     };

//     const result = await notification.insertOne(data);
//     res.status(201).json({ success: true, ...result });
//   } catch (err) {
//     console.error('Announcement Error:', err);
//     res.status(500).json({ error: 'Failed to send announcement' });
//   }
// });

// // --- ২. স্পেসিফিক নোটিফিকেশন (Listing, Orders, Disputes) ---
// // POST /api/notification/notify
// router.post("/notify", async (req, res) => {
//   const data = { 
//     ...req.body, 
//     createdAt: new Date(),
//     read: false 
//   };
//   const result = await notification.insertOne(data);
//   res.send(result);
// });

// // --- ৩. নোটিফিকেশন গেট করার লজিক (ফিল্টারিং সহ) ---
// // GET /api/notification/getall
// router.get("/getall", async (req, res) => {
//   try {
//     const { userId, role } = req.query; // role হতে পারে buyer/seller
    
//     // এমন নোটিফিকেশন খুজবে যা:
//     // ১. সরাসরি ওই ইউজারকে পাঠানো হয়েছে (userId)
//     // ২. অথবা সবার জন্য পাঠানো ঘোষণা (target: "all")
//     // ৩. অথবা ওই ইউজারের নির্দিষ্ট রোলের জন্য (target: role)
//     const query = {
//       $or: [
//         { userEmail: userId },
//         { target: "all" },
//         { target: role } 
//       ]
//     };

//     const notifications = await notification.find(query).sort({ createdAt: -1 }).toArray();
//     res.json(notifications);
//   } catch (err) {
//     console.error('Get Notifications Error:', err);
//     res.status(500).json({ error: 'Failed to fetch notifications' });
//   }
// });

// // ... বাকি mark-read এবং delete ফাংশনগুলো আগের মতোই থাকবে ...
// router.delete("/clear-all/:email", async (req, res) => {
//   const email = req.params.email;
  
//   if (!email) {
//     return res.status(400).json({ error: "Email is required" });
//   }

//   try {
//     const result = await notification.deleteMany({ userEmail: email });
//     res.json({ success: true, deletedCount: result.deletedCount });
//   } catch (err) {
//     console.error("Clear All Error:", err);
//     res.status(500).json({ error: "Failed to clear notifications" });
//   }
// });

// module.exports = router;
