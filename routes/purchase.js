const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const cron = require("node-cron");
const { updateStats } = require("../utils/stats");
const { sendNotification } = require("../utils/notification");

const router = express.Router();

const MONGO_URI = process.env.MONGO_URI;

// ===============================
// Mongo Client Setup
// ===============================
const client = new MongoClient(MONGO_URI);

let db, cartCollection, purchaseCollection, userCollection, productsCollection, reportCollection, statsCollection;

(async () => {
  try {
    await client.connect();
    db = client.db("mydb"); 
    cartCollection = db.collection("cart");
    purchaseCollection = db.collection("mypurchase");
    userCollection = db.collection("userCollection");
    productsCollection = db.collection("products");
    reportCollection = db.collection("reports");
    statsCollection = db.collection("systemStats");
    console.log("✅ MongoDB Connected");
    
    // ===============================
    // Setup Auto-Confirm Cron Job
    // ===============================
    // Run every minute to check for expired orders
    cron.schedule('* * * * *', async () => {
      try {
        const now = Date.now();
        const pendingOrders = await purchaseCollection.find({ status: "pending" }).toArray();
        
        if (pendingOrders.length > 0) {
          console.log(`[Auto-Confirm Job] Checking ${pendingOrders.length} pending orders...`);
        }

        let processedCount = 0;

        for (const order of pendingOrders) {
          const product = await productsCollection.findOne({ _id: new ObjectId(order.productId) });
          // If product not found, we can't determine expiry, but could default to purchase date + 4h.
          // For now, only process if product exists to be safe.
          if (!product) continue;
          
          const deliveryMs = parseDeliveryTime(order.deliveryTime || product.deliveryTime);
          const expiresAt = new Date(order.purchaseDate).getTime() + deliveryMs;
          
          if (now >= expiresAt) {
            // Processing Auto-Confirmation
            console.log(`[Auto-Confirm Job] Order ${order._id} expired. Auto-confirming...`);
            const session = client.startSession();
            try {
              await session.withTransaction(async () => {
                const amount = order.price || order.totalPrice || 0;

                // 1. Update Order Status
                await purchaseCollection.updateOne(
                  { _id: order._id },
                  { $set: { status: "completed", autoConfirmed: true, completedAt: new Date() } },
                  { session }
                );

                // 2. Update Product Status
                if (order.productId) {
                  await productsCollection.updateOne(
                    { _id: new ObjectId(order.productId) },
                    { $set: { status: "completed", updatedAt: new Date() } },
                    { session }
                  );
                }

                // 3. Transfer Funds
                const platformFee = amount * 0.2;
                const sellerShare = amount * 0.8;

                if (order.sellerEmail === "admin@gmail.com") {
                   // Admin sold: Balance gets full amount (100%), Platform Profit gets fee (20%)
                   await userCollection.updateOne(
                       { email: "admin@gmail.com" }, 
                       { $inc: { balance: amount, platformProfit: platformFee } }, 
                       { session }
                   );
                   
                } else {
                   if (order.sellerEmail) {
                       await userCollection.updateOne({ email: order.sellerEmail }, { $inc: { balance: sellerShare } }, { session });
                   }
                   // Standard sale: Fee goes to both admin balance and platformProfit
                   await userCollection.updateOne({ email: "admin@gmail.com" }, { $inc: { balance: platformFee, platformProfit: platformFee } }, { session });
                }

                // 4. Update Global Stats
                await updateStatsLocal({
                   totalTurnover: amount,
                   lifetimePlatformProfit: platformFee,
                   totalUserBalance: 0 // Sales don't change total user balance (moves from buyer to seller)
                }, session);
              });
              processedCount++;
              console.log(`✅ [Auto-Confirm Job] Order ${order._id} confirmed successfully.`);
            } catch (txErr) {
              console.error(`❌ [Auto-Confirm Job] Failed for order ${order._id}:`, txErr.message);
            } finally {
              await session.endSession();
            }
          }
        }
        
        if (processedCount > 0) {
           console.log(`✅ [Auto-Confirm Job] ${processedCount} orders processed successfully at ${new Date().toLocaleTimeString()}`);
        }
      } catch (err) {
        console.error('❌ [Auto-Confirm Job] Error:', err.message);
      }
    });
    
    console.log("✅ Auto-Confirm Cron Job Started (runs every minute)");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  }
})();


// =======================================================
// 🚀 REPORT SECTION (ফিক্স করা রিপোর্ট রাউটসমূহ)
// =======================================================

// ১. রিপোর্ট জমা দেওয়া (POST)
router.post("/report/create", async (req, res) => {
  try {
    const { orderId, productName, reporterEmail, sellerEmail, reason, message, role } = req.body;

    if (!orderId || !productName || !reporterEmail || !sellerEmail || !reason || !message || !role) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    const newReport = {
      orderId,
      productName,
      reporterEmail,
      sellerEmail,
      reason,
      message,
      role,
      status: "Pending", 
      createdAt: new Date(),
    };

    const result = await reportCollection.insertOne(newReport);

    // 🔔 Notify Seller
    try {
      await sendNotification(req.app, {
        userEmail: sellerEmail,
        title: "Order Reported",
        message: `⚠️ Order #${orderId.slice(-6).toUpperCase()} has been reported for "${reason}".`,
        type: "report",
        relatedId: orderId,
        link: `https://acctempire.com/seller-orders`
      });
    } catch (notifErr) {
      console.error("Failed to send notification for report:", notifErr);
    }

    res.status(201).json({ success: true, message: "Report submitted successfully", reportId: result.insertedId });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ২. সব রিপোর্ট দেখা (Admin এর জন্য)
router.get("/report/getall", async (req, res) => {
  try {
    const reports = await reportCollection.find({}).sort({ createdAt: -1 }).toArray();
    res.status(200).json(reports);
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch reports" });
  }
});

// ৩. নির্দিষ্ট ইউজারের রিপোর্ট দেখা (GET)
router.get("/my-reports", async (req, res) => {
  try {
    const email = req.query.email; 
    if (!email) return res.status(400).send({ success: false, message: "Email is required" });

    const query = { sellerEmail: email }; 
    const result = await reportCollection.find(query).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

// ৪. রিপোর্ট স্ট্যাটাস আপডেট (PATCH)
router.patch("/report/update/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!ObjectId.isValid(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

    const result = await reportCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: status, updatedAt: new Date() } }
    );
    res.status(200).json({ success: true, message: "Status updated" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ৫. মার্ক এজ সোল্ড (Mark as Sold)
router.patch("/report/mark-sold/:id", async (req, res) => {
  const session = client.startSession();
  try {
    const { id } = req.params;
    
    await session.withTransaction(async () => {
      const report = await reportCollection.findOne({ _id: new ObjectId(id) }, { session });
      if (!report) throw new Error("Report not found");

      const order = await purchaseCollection.findOne({ _id: new ObjectId(report.orderId) }, { session });
      if (!order) throw new Error("Order not found");
      
      if (order.status === "completed") {
         // Already completed and funds transferred
         await reportCollection.updateOne({ _id: new ObjectId(id) }, { $set: { status: "Sold", updatedAt: new Date() } }, { session });
         return;
      }

      const amount = Number(order.price || order.totalPrice || 0);
      const sellerEmail = order.sellerEmail;
      
      const platformFee = amount * 0.2;
      const sellerShare = amount * 0.8;

      if (sellerEmail === "admin@gmail.com") {
        await userCollection.updateOne(
            { email: "admin@gmail.com" }, 
            { $inc: { balance: amount, platformProfit: platformFee } }, 
            { session }
        );
      } else {
        if (sellerEmail) {
          await userCollection.updateOne({ email: sellerEmail }, { $inc: { balance: sellerShare } }, { session });
        }
        await userCollection.updateOne({ email: "admin@gmail.com" }, { $inc: { balance: platformFee, platformProfit: platformFee } }, { session });
      }

      await purchaseCollection.updateOne({ _id: order._id }, { $set: { status: "completed", completedAt: new Date() } }, { session });
      
      if (order.productId) {
        await productsCollection.updateOne({ _id: new ObjectId(order.productId) }, { $set: { status: "completed", updatedAt: new Date() } }, { session });
      }

      await updateStatsLocal({
        totalTurnover: amount,
        lifetimePlatformProfit: platformFee,
        totalUserBalance: 0
      }, session);

      await reportCollection.updateOne({ _id: new ObjectId(id) }, { $set: { status: "Sold", updatedAt: new Date() } }, { session });
    });

    res.json({ success: true, message: "Order marked as sold and funds transferred" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  } finally {
    await session.endSession();
  }
});

// ৬. কনফার্ম রিফান্ড (Refund)
router.patch("/report/refund/:id", async (req, res) => {
  const session = client.startSession();
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ success: false, message: "Invalid report id" });

    await session.withTransaction(async () => {
      const report = await reportCollection.findOne({ _id: new ObjectId(id) }, { session });
      if (!report) throw new Error("Report not found");

      const order = await purchaseCollection.findOne({ _id: new ObjectId(report.orderId) }, { session });
      if (!order) throw new Error("Order not found");

      // Transfer funds (Refund)
      await userCollection.updateOne(
        { email: order.buyerEmail },
        { $inc: { balance: Number(order.price) } },
        { session }
      );

      // Update Stats
      if (order.status === "completed") {
        const platformFee = Number(order.price) * 0.2;
        const sellerShare = Number(order.price) * 0.8;

        if (order.sellerEmail === "admin@gmail.com") {
          await userCollection.updateOne({ email: "admin@gmail.com" }, { $inc: { balance: -platformFee, adminSalesBalance: -sellerShare } }, { session });
        } else {
          await userCollection.updateOne({ email: order.sellerEmail }, { $inc: { balance: -sellerShare } }, { session });
          await userCollection.updateOne({ email: "admin@gmail.com" }, { $inc: { balance: -platformFee } }, { session });
        }

        await updateStatsLocal({
          totalTurnover: -Number(order.price),
          lifetimePlatformProfit: -platformFee,
          totalUserBalance: 0
        }, session);
      } else {
        // Was pending, money was in escrow (deducted from buyer but not given to seller)
        await updateStatsLocal({ totalUserBalance: Number(order.price) }, session);
      }

      await purchaseCollection.updateOne({ _id: order._id }, { $set: { status: "refunded" } }, { session });
      await reportCollection.updateOne({ _id: new ObjectId(id) }, { $set: { status: "Refunded", updatedAt: new Date() } }, { session });
    });

    res.json({ success: true, message: "Refund completed" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    await session.endSession();
  }
});


// =======================================================
// 🚀 PURCHASE SECTION (অন্যান্য পারচেজ রাউট)
// =======================================================

router.post("/post", async (req, res) => {
  const { email: buyerEmail } = req.body;
  if (!buyerEmail) return res.status(400).json({ success: false, message: "Email required" });

  try {
    const cartItems = await cartCollection.find({ UserEmail: buyerEmail }).toArray();
    if (!cartItems.length) return res.status(400).json({ success: false, message: "Cart empty" });

    const buyer = await userCollection.findOne({ email: buyerEmail });
    const totalPrice = cartItems.reduce((sum, item) => sum + Number(item.price || 0), 0);

    if (Number(buyer.balance || 0) < totalPrice) return res.status(400).json({ success: false, message: "Insufficient balance" });

    await userCollection.updateOne({ email: buyerEmail }, { $inc: { balance: -totalPrice } });
    await updateStats({ totalUserBalance: -totalPrice });

    const purchaseDocs = cartItems.map((item) => ({
      buyerId: buyer._id,
      buyerEmail,
      productName: item.name,
      price: Number(item.price),
      sellerEmail: item.sellerEmail,
      productId: item.productId ? new ObjectId(item.productId) : new ObjectId(item._id),
      purchaseDate: new Date(),
      status: "pending",
      deliveryType: item.deliveryType || "manual",
      deliveryTime: item.deliveryTime || null,
    }));

    const result = await purchaseCollection.insertMany(purchaseDocs);

    // Notify Sellers
    try {
      // purchaseDocs might not have the generated _ids if not returned by insertMany in some drivers, 
      // but insertMany returns an object with insertedIds.
      const insertedIds = result.insertedIds;
      purchaseDocs.forEach(async (order, index) => {
        if (order.sellerEmail) {
          await sendNotification(req.app, {
            userEmail: order.sellerEmail,
            title: "New Order Received",
            message: `You have received a new order for "${order.productName}".`,
            type: "order",
            relatedId: insertedIds[index].toString(),
            link: "https://acctempire.com/seller-orders"
          });
        }
      });
    } catch (notifErr) {
      console.error("Failed to notify sellers of new orders:", notifErr);
    }

    const productUpdatePromises = cartItems.map(async (item) => {
      const pId = item.productId ? new ObjectId(item.productId) : new ObjectId(item._id);
      await productsCollection.updateOne({ _id: pId }, { $set: { status: "sold" } });
    });
    await Promise.all(productUpdatePromises);

    await cartCollection.deleteMany({ UserEmail: buyerEmail });
    res.json({ success: true, message: "Purchase successful" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/single-purchase", async (req, res) => {
  try {
    const { buyerEmail, productName, price, sellerEmail, productId } = req.body;
    const amount = Number(price);
    const buyer = await userCollection.findOne({ email: buyerEmail });

    if (!buyer || (buyer.balance || 0) < amount) return res.status(400).json({ success: false, message: "Insufficient balance" });

    const productObjectId = new ObjectId(productId);
    const product = await productsCollection.findOne({ _id: productObjectId });
    
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    
    await userCollection.updateOne({ email: buyerEmail }, { $inc: { balance: -amount } });
    await updateStats({ totalUserBalance: -amount });

    const purchaseData = {
      buyerId: buyer._id,
      buyerEmail,
      productName,
      price: amount,
      sellerEmail: sellerEmail || "admin@gmail.com",
      productId: productObjectId,
      purchaseDate: new Date(),
      status: "pending",
      deliveryType: product.deliveryType || "manual",
      deliveryTime: product.deliveryTime || null,
    };

    const result = await purchaseCollection.insertOne(purchaseData);
    
    // Notify Seller
    try {
      if (purchaseData.sellerEmail) {
        await sendNotification(req.app, {
          userEmail: purchaseData.sellerEmail,
          title: "New Order Received",
          message: `You have received a new order for "${purchaseData.productName}".`,
          type: "order",
          relatedId: result.insertedId.toString(),
          link: "https://acctempire.com/seller-orders"
        });
      }
    } catch (notifErr) {
      console.error("Failed to notify seller of new order:", notifErr);
    }
    await productsCollection.updateOne({ _id: productObjectId }, { $set: { status: "sold" } });

    res.status(200).json({ success: true, message: "Purchase successful" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error" });
  }
});

router.get("/getall", async (req, res) => {
  const { email, role } = req.query;
  try {
    let query = {};
    if (email) {
      query = role === "seller" ? { sellerEmail: email } : { buyerEmail: email };
    }
    const result = await purchaseCollection.find(query).sort({ purchaseDate: -1 }).toArray();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: "Error" });
  }
});

router.patch("/update-status/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, email, role } = req.body; // Use 'email' and 'role' for authorization

    if (!status) {
      return res.status(400).json({ success: false, message: "Status is required" });
    }

    // Validate status value
    const validStatuses = ["pending", "completed", "cancelled", "refunded"];
    if (!validStatuses.includes(status.toLowerCase())) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid status. Must be: pending, completed, cancelled, or refunded" 
      });
    }

    // Validate ID
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }

    // Fetch purchase record
    const purchase = await purchaseCollection.findOne({ _id: new ObjectId(id) });
    if (!purchase) {
      return res.status(404).json({ success: false, message: "Purchase not found" });
    }

    // 🔒 AUTHORIZATION: Check if user has permission to modify this order
    const isOwner = (role === "buyer" && email === purchase.buyerEmail) || 
                    (role === "seller" && email === purchase.sellerEmail);
    const isAdmin = role === "admin";

    if (!isAdmin && !isOwner) {
      console.warn(`[Update Status] Unauthorized attempt by ${email} (${role}) for order ${id}`);
      return res.status(403).json({ success: false, message: "Permission denied. You are not authorized for this order." });
    }

    // Status cycle validation
    // Can't modify completed orders (except to refund by admin/buyer?)
    if (purchase.status === "completed" && status.toLowerCase() !== "refunded") {
      return res.status(400).json({ 
        success: false, 
        message: "Cannot modify completed orders. Only refunds are allowed." 
      });
    }

    // Can't modify cancelled or refunded orders
    if ((purchase.status === "cancelled" || purchase.status === "refunded") && status.toLowerCase() !== purchase.status) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot modify ${purchase.status} orders` 
      });
    }

    // 🔒 RESTRICTION: Only Admin can cancel or refund
    if (["cancelled", "refunded"].includes(status.toLowerCase())) {
      if (!isAdmin) {
        return res.status(403).json({ 
          success: false, 
          message: `Permission denied. Only Admins can set status to ${status}.` 
        });
      }
    }

    // Only progress to Completion
    if (status.toLowerCase() !== "completed") {
      await purchaseCollection.updateOne({ _id: new ObjectId(id) }, { $set: { status: status.toLowerCase() } });
      return res.json({ success: true, message: `Status updated to ${status}` });
    }

    // HANDLE COMPLETION (Transfer funds)
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        // Re-fetch inside transaction for safety
        const pInside = await purchaseCollection.findOne({ _id: new ObjectId(id) }, { session });
        if (pInside.status === "completed") return; // Already done

        const amount = Number(pInside.price || pInside.totalPrice || 0);
        const sellerEmail = pInside.sellerEmail;
        
        await purchaseCollection.updateOne({ _id: new ObjectId(id) }, { $set: { status: "completed", completedAt: new Date() } }, { session });

        // Update product status
        if (pInside.productId) {
          await productsCollection.updateOne(
            { _id: new ObjectId(pInside.productId) },
            { $set: { status: "completed", updatedAt: new Date() } },
            { session }
          );
        }

        const platformFee = amount * 0.2;
        const sellerShare = amount * 0.8;

        if (sellerEmail === "admin@gmail.com") {
          // Admin sold: Balance gets full amount (100%), Platform Profit gets fee (20%)
          await userCollection.updateOne(
              { email: "admin@gmail.com" }, 
              { $inc: { balance: amount, platformProfit: platformFee } }, 
              { session }
          );
        } else {
          if (sellerEmail) {
            await userCollection.updateOne({ email: sellerEmail }, { $inc: { balance: sellerShare } }, { session });
          }
           // Standard sale: Fee goes to both admin balance and platformProfit
          await userCollection.updateOne({ email: "admin@gmail.com" }, { $inc: { balance: platformFee, platformProfit: platformFee } }, { session });
        }

        // Update stats
        await updateStatsLocal({
          totalTurnover: amount,
          lifetimePlatformProfit: platformFee,
          totalUserBalance: 0 // Moved from buyer to seller, no net change in system
        }, session);
      });

      console.log(`[Update Status] Order ${id} completed manually by ${email} (${role}). Funds transferred to ${purchase.sellerEmail}`);
      
      // Notify both parties
      try {
        // Notify Seller
        await sendNotification(req.app, {
          userEmail: purchase.sellerEmail,
          title: "Order Completed",
          message: `Order #${id.slice(-6).toUpperCase()} for "${purchase.productName}" has been marked as completed. Funds added to your balance.`,
          type: "order",
          relatedId: id,
          link: "https://acctempire.com/seller-orders"
        });

        // Notify Buyer
        await sendNotification(req.app, {
          userEmail: purchase.buyerEmail,
          title: "Order Completed",
          message: `Your order #${id.slice(-6).toUpperCase()} for "${purchase.productName}" has been successfully completed.`,
          type: "order",
          relatedId: id,
          link: "https://acctempire.com/orders"
        });
      } catch (notifErr) {
        console.error("Failed to send completion notifications:", notifErr);
      }

      res.json({ success: true, message: "Order completed & commission shared" });
    } catch (txErr) {
      console.error(`[Update Status] Transaction failed for order ${id}:`, txErr.message);
      res.status(500).json({ success: false, message: "Failed to complete transaction" });
    } finally {
      await session.endSession();
    }
  } catch (err) {
    console.error("[Update Status] Error:", err.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// Helper function to parse delivery time strings
function parseDeliveryTime(timeStr) {
  if (!timeStr) return 3600000; // default 1h
  const match = timeStr.match(/(\d+)\s*(mins?|minutes?|h|hours?|d|days?)/i);
  if (match) {
    const num = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    if (unit.startsWith('min')) return num * 60000;
    if (unit.startsWith('h')) return num * 3600000;
    if (unit.startsWith('d')) return num * 86400000;
  }
  return 3600000; // default 1h
}

router.get("/auto-confirm-check", async (req, res) => {
  try {
    const now = Date.now();
    
    // Get all pending purchases
    const pendingOrders = await purchaseCollection
      .find({ status: "pending" })
      .toArray();

    const toConfirm = [];

    for (const order of pendingOrders) {
      // Fetch product to get deliveryTime
      const product = await productsCollection.findOne({
        _id: new ObjectId(order.productId)
      });

      if (!product) continue;

      // Parse deliveryTime (defaults to 4h if missing)
      const deliveryMs = parseDeliveryTime(product.deliveryTime || order.deliveryTime);
      const purchaseTime = new Date(order.purchaseDate).getTime();
      const expiresAt = purchaseTime + deliveryMs;

      // Check if expired
      if (now >= expiresAt) {
        toConfirm.push(order._id);
      }
    }

    // Bulk update to completed
    if (toConfirm.length > 0) {
      await purchaseCollection.updateMany(
        { _id: { $in: toConfirm } },
        { $set: { status: "completed", autoConfirmed: true, completedAt: new Date() } }
      );
    }

    res.json({ 
      success: true, 
      confirmedCount: toConfirm.length,
      message: `${toConfirm.length} orders auto-confirmed based on delivery time`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

async function updateStatsLocal(updates, session) {
  const updateObj = { $inc: {}, $set: { updatedAt: new Date() } };
  for (const [key, value] of Object.entries(updates)) {
      updateObj.$inc[key] = value;
  }
  await statsCollection.updateOne({ _id: "global" }, updateObj, { session, upsert: true });
}

module.exports = router;
// const MONGO_URI = process.env.MONGO_URI;

// // ===============================
// // Mongo Client Setup
// // ===============================
// const client = new MongoClient(MONGO_URI);

// let db;
// let cartCollection;
// let purchaseCollection;
// let userCollection;
// let productsCollection;
// let reportCollection; // ✅ নিউ কালেকশন ভেরিয়েবল

// // ===============================
// // DB Connect (Run Once)
// // ===============================
// (async () => {
//   try {
//     await client.connect();
//     db = client.db("mydb"); 
//     cartCollection = db.collection("cart");
//     purchaseCollection = db.collection("mypurchase");
//     userCollection = db.collection("userCollection");
//     productsCollection = db.collection("products");
//     reportCollection = db.collection("reports"); // ✅ রিপোর্ট কালেকশন কানেক্ট করা হলো
//   } catch (err) {
//     console.error("❌ MongoDB connection failed:", err);
//     process.exit(1);
//   }
// })();

// // =======================================================
// // 🚀 FIXED: POST /purchase/report/create (রিপোর্ট জমা দেওয়া)
// // =======================================================
// router.post("/report/create", async (req, res) => {
//   try {
//     // এখানে 'role' অ্যাড করা হয়েছে req.body থেকে
//     const { orderId, reporterEmail, sellerEmail, reason, message, role } = req.body;

//     // ভ্যালিডেশন (role সহ)
//     if (!orderId || !reporterEmail || !sellerEmail || !reason || !message || !role) {
//       return res.status(400).json({ success: false, message: "All fields including role are required" });
//     }

// // BEFORE (Current code)
// const { orderId, reporterEmail, sellerEmail, reason, message, role } = req.body;

// if (!orderId || !reporterEmail || !sellerEmail || !reason || !message || !role) {
//   return res.status(400).json({ success: false, message: "All fields including role are required" });
// }

// const newReport = {
//   orderId,
//   reporterEmail,
//   sellerEmail,
//   reason,
//   message,
//   role,
//   status: "Pending", 
//   createdAt: new Date(),
// };

// // AFTER (Updated code)
// const { orderId, productName, reporterEmail, sellerEmail, reason, message, role } = req.body;

// if (!orderId || !productName || !reporterEmail || !sellerEmail || !reason || !message || !role) {
//   return res.status(400).json({ success: false, message: "All fields including productName and role are required" });
// }

// const newReport = {
//   orderId,
//   productName, // ✅ Added
//   reporterEmail,
//   sellerEmail,
//   reason,
//   message,
//   role,
//   status: "Pending", 
//   createdAt: new Date(),
// };

//     const result = await reportCollection.insertOne(newReport);

//     res.status(201).json({
//       success: true,
//       message: "Report submitted successfully",
//       reportId: result.insertedId,
//     });
//   } catch (error) {
//     console.error("❌ Report Create Error:", error);
//     res.status(500).json({ success: false, message: "Server error, failed to submit report" });
//   }
// });

// // =======================================================
// // 🚀 NEW: GET /purchase/report/getall (সব রিপোর্ট দেখা - Admin এর জন্য)
// // =======================================================
// router.get("/report/getall", async (req, res) => {
//   try {
//     const reports = await reportCollection
//       .find({})
//       .sort({ createdAt: -1 })
//       .toArray();
//     res.status(200).json(reports);
//   } catch (error) {
//     console.error("❌ Fetch Reports Error:", error);
//     res.status(500).json({ success: false, message: "Failed to fetch reports" });
//   }
// });

// // =======================================================
// // POST /purchase/post (Cart Checkout)
// // =======================================================
// router.post("/post", async (req, res) => {
//   const { email: buyerEmail } = req.body;

//   if (!buyerEmail) {
//     return res
//       .status(400)
//       .json({ success: false, message: "Buyer email required" });
//   }

//   try {
//     const cartItems = await cartCollection
//       .find({ UserEmail: buyerEmail })
//       .toArray();

//     if (!cartItems.length) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Cart is empty" });
//     }

//     const buyer = await userCollection.findOne({ email: buyerEmail });
//     if (!buyer) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Buyer not found" });
//     }

//     const totalPrice = cartItems.reduce(
//       (sum, item) => sum + Number(item.price || 0),
//       0
//     );

//     if (Number(buyer.balance || 0) < totalPrice) {
//       return res.status(400).json({
//         success: false,
//         message: "Insufficient balance",
//         required: totalPrice,
//         available: buyer.balance || 0,
//       });
//     }

//     // 1️⃣ Deduct buyer balance
//     await userCollection.updateOne(
//       { email: buyerEmail },
//       { $inc: { balance: -totalPrice } }
//     );

//     // 2️⃣ Create purchase docs (✅ buyerId added)
//     const purchaseDocs = cartItems.map((item) => ({
//       buyerId: buyer._id, // ✅ VERY IMPORTANT
//       buyerEmail,
//       productName: item.name,
//       price: Number(item.price),
//       sellerEmail: item.sellerEmail,
//       productId: item.productId
//         ? new ObjectId(item.productId)
//         : item._id
//         ? new ObjectId(item._id)
//         : null,
//       purchaseDate: new Date(),
//       status: "pending",
//     }));

//     await purchaseCollection.insertMany(purchaseDocs);

//     // 3️⃣ Update product status
//     const productUpdatePromises = cartItems.map(async (item) => {
//       const productObjectId = item.productId
//         ? new ObjectId(item.productId)
//         : item._id
//         ? new ObjectId(item._id)
//         : null;

//       if (productObjectId) {
//         await productsCollection.updateOne(
//           { _id: productObjectId },
//           { $set: { status: "ongoing" } }
//         );
//       }
//     });

//     await Promise.all(productUpdatePromises);

//     // 4️⃣ Clear cart
//     await cartCollection.deleteMany({ UserEmail: buyerEmail });

//     res.json({
//       success: true,
//       message: "Purchase successful!",
//       totalDeducted: totalPrice,
//       newBalance: Number(buyer.balance) - totalPrice,
//     });
//   } catch (err) {
//     console.error("❌ Cart Purchase error:", err);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// });

// // ✅ ADMIN: GET purchases by buyer (FINAL & SAFE)
// router.get("/admin/by-user/:userId", async (req, res) => {
//   try {
//     const { userId } = req.params;

//     if (!ObjectId.isValid(userId)) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Invalid user id" });
//     }

//     // 1️⃣ user খুঁজে বের করি
//     const user = await userCollection.findOne({
//       _id: new ObjectId(userId),
//     });

//     if (!user) {
//       return res.status(200).json([]);
//     }

//     // 2️⃣ MAIN FIX: buyerId + buyerEmail দুটো দিয়েই খুঁজি
//     const purchases = await purchaseCollection
//       .find({
//         $or: [
//           { buyerId: user._id },
//           { buyerEmail: user.email },
//         ],
//       })
//       .sort({ purchaseDate: -1 })
//       .toArray();

//     res.status(200).json(purchases);
//   } catch (error) {
//     console.error("❌ Admin fetch orders error:", error);
//     res
//       .status(500)
//       .json({ success: false, message: "Failed to fetch orders" });
//   }
// });


// // =======================================================
// // POST /purchase/single-purchase (Direct Buy)
// // =======================================================
// router.post("/single-purchase", async (req, res) => {
//   try {
//     const { buyerEmail, productName, price, sellerEmail, productId } = req.body;

//     if (!buyerEmail || !productName || !price || !productId) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Required fields are missing" });
//     }

//     const amount = Number(price);

//     // 1️⃣ Find buyer
//     const buyer = await userCollection.findOne({ email: buyerEmail });
//     if (!buyer) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Buyer not found" });
//     }

//     if ((buyer.balance || 0) < amount) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Insufficient balance" });
//     }

//     // 2️⃣ Find product
//     const productObjectId = new ObjectId(productId);
//     const product = await productsCollection.findOne({ _id: productObjectId });

//     if (!product || product.status !== "active") {
//       return res
//         .status(400)
//         .json({ success: false, message: "Product is not available" });
//     }

//     // 3️⃣ Deduct buyer balance
//     await userCollection.updateOne(
//       { email: buyerEmail },
//       { $inc: { balance: -amount } }
//     );

//     // 4️⃣ Create purchase (✅ buyerId added)
//     const purchaseData = {
//       buyerId: buyer._id,              // ✅ VERY IMPORTANT
//       buyerEmail,
//       productName,
//       price: amount,
//       sellerEmail: sellerEmail || "admin@example.com",
//       productId: productObjectId,
//       purchaseDate: new Date(),
//       status: "pending",
//     };

//     const result = await purchaseCollection.insertOne(purchaseData);

//     // 5️⃣ Update product status
//     await productsCollection.updateOne(
//       { _id: productObjectId },
//       { $set: { status: "ongoing" } }
//     );

//     // 6️⃣ Credit seller balance (if exists)
//     if (sellerEmail) {
//       await userCollection.updateOne(
//         { email: sellerEmail },
//         { $inc: { balance: amount } }
//       );
//     }

//     const updatedBuyer = await userCollection.findOne({ email: buyerEmail });

//     res.status(200).json({
//       success: true,
//       message: "Purchase successful",
//       purchaseId: result.insertedId,
//       newBuyerBalance: updatedBuyer?.balance || 0,
//     });
//   } catch (error) {
//     console.error("❌ Single Purchase Error:", error);
//     res
//       .status(500)
//       .json({ success: false, message: "Internal Server Error" });
//   }
// });

// // =======================================================
// // GET /purchase/getall (Buyer & Seller এর জন্য একটিই ক্লিন রাউট)
// // =======================================================
// router.get("/getall", async (req, res) => {
//   const { email, role } = req.query;

//   try {
//     let query = {};
//     if (email) {
//       if (role === "seller") {
//         query = { sellerEmail: email };
//       } else {
//         query = { buyerEmail: email };
//       }
//     }

//     const purchases = await purchaseCollection
//       .find(query)
//       .sort({ purchaseDate: -1 })
//       .toArray();

//     res.status(200).json(purchases);
//   } catch (error) {
//     console.error("❌ Fetch purchases error:", error);
//     res.status(500).json({ success: false, message: "Failed to fetch purchases" });
//   }
// });

// // =======================================================
// // PATCH /purchase/update-status/:id → Confirm/Reject Order
// // =======================================================
// router.patch("/update-status/:id", async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { status, sellerEmail } = req.body;  // sellerEmail frontend থেকে আসবে

//     if (!ObjectId.isValid(id) || !status) {
//       return res.status(400).json({ success: false, message: "Invalid ID or Status" });
//     }

//     if (status !== "completed") {
//       const result = await purchaseCollection.updateOne(
//         { _id: new ObjectId(id) },
//         { $set: { status } }
//       );

//       if (result.matchedCount === 0) {
//         return res.status(404).json({ success: false, message: "Purchase not found" });
//       }

//       return res.json({ success: true, message: `Order status updated to ${status}` });
//     }

//     // Only for "completed" status
//     if (!sellerEmail) {
//       return res.status(400).json({ success: false, message: "Seller email is required for completion" });
//     }

//     const session = await purchaseCollection.db.client.startSession();

//     let commissionResult;
//     try {
//       await session.withTransaction(async () => {
//         // Find purchase to get amount
//         const purchase = await purchaseCollection.findOne(
//           { _id: new ObjectId(id) },
//           { session }
//         );

//         if (!purchase) {
//           throw new Error("Purchase not found");
//         }

//         // Adjust these field names according to your actual schema
//         const amount = purchase.amount || purchase.totalPrice || purchase.price || purchase.totalAmount;

//         if (typeof amount !== "number" || amount <= 0) {
//           throw new Error("Invalid or missing purchase amount");
//         }

//         const sellerCommission = amount * 0.8;
//         const adminCommission = amount * 0.2;

//         // Update status
//         await purchaseCollection.updateOne(
//           { _id: new ObjectId(id) },
//           { $set: { status: "completed" } },
//           { session }
//         );

//         // Add to seller balance
//         const sellerUpdate = await userCollection.updateOne(
//           { email: sellerEmail },
//           { $inc: { balance: sellerCommission } },
//           { session }
//         );

//         if (sellerUpdate.matchedCount === 0) {
//           throw new Error(`Seller not found with email: ${sellerEmail}`);
//         }

//         // Add to admin balance
//         const adminUpdate = await userCollection.updateOne(
//           { email: "admin@gmail.com" },
//           { $inc: { balance: adminCommission } },
//           { session }
//         );

//         if (adminUpdate.matchedCount === 0) {
//           throw new Error("Admin account not found");
//         }

//         commissionResult = {
//           sellerEmail,
//           amount,
//           sellerCommission,
//           adminCommission,
//         };
//       });
//     } catch (transactionError) {
//       console.error("Transaction failed:", transactionError);
//       return res.status(500).json({
//         success: false,
//         message: transactionError.message || "Failed to process commission",
//       });
//     } finally {
//       await session.endSession();
//     }

//     res.json({
//       success: true,
//       message: "Order completed and commissions distributed successfully",
//       data: commissionResult,
//     });
//   } catch (err) {
//     console.error("❌ Update status error:", err);
//     res.status(500).json({ success: false, message: "Server Error" });
//   }
// });


// // ... আগের সব কোড ঠিক থাকবে ...

// // =======================================================
// // 🚀 NEW: GET /purchase/report/getall (সব রিপোর্ট দেখা - Admin এর জন্য)
// // =======================================================
// router.get("/report/getall", async (req, res) => {
//   try {
//     const reports = await reportCollection
//       .find({})
//       .sort({ createdAt: -1 })
//       .toArray();
//     res.status(200).json(reports);
//   } catch (error) {
//     console.error("❌ Fetch Reports Error:", error);
//     res.status(500).json({ success: false, message: "Failed to fetch reports" });
//   }
// });

// // =======================================================
// // 🛠️ FIX: PATCH /purchase/report/update/:id (রিপোর্ট স্ট্যাটাস আপডেট)
// // এই রাউটটি না থাকার কারণেই আপনার ৪০৪ এরর আসছিল
// // =======================================================
// router.patch("/report/update/:id", async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { status } = req.body;

//     if (!ObjectId.isValid(id)) {
//       return res.status(400).json({ success: false, message: "Invalid Report ID" });
//     }

//     const result = await reportCollection.updateOne(
//       { _id: new ObjectId(id) },
//       { $set: { status: status, updatedAt: new Date() } }
//     );

//     if (result.matchedCount === 0) {
//       return res.status(404).json({ success: false, message: "Report not found" });
//     }

//     res.status(200).json({ success: true, message: "Report status updated successfully" });
//   } catch (error) {
//     console.error("❌ Report Update Error:", error);
//     res.status(500).json({ success: false, message: "Failed to update report status" });
//   }
// });

// // ... বাকি সব কোড (post, single-purchase, ইত্যাদি) নিচে থাকবে ...

// //////Other purchase routes here...
// // ... আপনার ইমপোর্ট এবং কানেকশন কোড ঠিক আছে ...

// // =======================================================
// router.get("/auto-confirm-check", async (req, res) => {
//   try {
//     // ৪ ঘণ্টা আগের সময় নির্ধারণ (৪ ঘণ্টা = ৪ * ৬০ * ৬০ * ১০০০ মিলিসেকেন্ড)
//     const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);

//     // ৪ ঘণ্টার বেশি পুরনো "pending" অর্ডারগুলো খুঁজুন
//     const pendingOrders = await purchaseCollection.find({
//       status: "pending",
//       purchaseDate: { $lt: fourHoursAgo }
//     }).toArray();

//     if (pendingOrders.length > 0) {
//       const ids = pendingOrders.map(order => order._id);

//       // অর্ডার স্ট্যাটাস 'confirmed' করা
//       const result = await purchaseCollection.updateMany(
//         { _id: { $in: ids } },
//         { 
//           $set: { 
//             status: "confirmed", 
//             updatedAt: new Date(),
//             confirmedAt: new Date() // কনফার্ম হওয়ার সময় ট্র্যাক করার জন্য (ঐচ্ছিক)
//           } 
//         }
//       );

//       /* যেহেতু অর্ডার কনফার্ম হচ্ছে, তাই প্রোডাক্ট 'active' করার প্রয়োজন নেই। 
//          প্রোডাক্টটি অলরেডি সোল্ড বা বুকড হিসেবেই থাকবে।
//       */
//     }

//     res.json({ 
//       success: true, 
//       message: `${pendingOrders.length} orders confirmed.`,
//       processed: pendingOrders.length 
//     });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// });

// // =======================================================
// // 🚀 NEW: Mark as Sold (অর্ডার কমপ্লিট করা)
// // =======================================================
// router.patch("/report/mark-sold/:id", async (req, res) => {
//   try {
//     const { id } = req.params;
    
//     // ১. রিপোর্ট খুঁজুন অর্ডার আইডি পাওয়ার জন্য
//     const report = await reportCollection.findOne({ _id: new ObjectId(id) });
//     if (!report) return res.status(404).json({ success: false, message: "Report not found" });

//     // ২. মেইন পারচেজ টেবিল বা অর্ডার টেবিলে স্ট্যাটাস 'completed' করুন
//     await purchaseCollection.updateOne(
//       { orderId: report.orderId }, // অথবা আপনার ফিল্ড নাম অনুযায়ী productId/orderId
//       { $set: { status: "completed" } }
//     );

//     // ৩. রিপোর্ট স্ট্যাটাস আপডেট করুন
//     await reportCollection.updateOne(
//       { _id: new ObjectId(id) },
//       { $set: { status: "Sold", updatedAt: new Date() } }
//     );

//     res.json({ success: true, message: "Order marked as sold successfully" });
//   } catch (error) {
//     res.status(500).json({ success: false, message: error.message });
//   }
// });
// // আপনার রিপোর্ট কালেকশন থেকে ডাটা আনার রুট
// router.get("/my-reports", async (req, res) => {
//   try {
//     const email = req.query.email; 
    
//     if (!email) {
//       return res.status(400).send({ success: false, message: "Email is required" });
//     }

//     // Change 'email' to 'sellerEmail' to match your database screenshot
//     const query = { sellerEmail: email }; 
//     const result = await reportCollection.find(query).toArray();
    
//     res.send(result);
//   } catch (error) {
//     res.status(500).send({ success: false, message: error.message });
//   }
// });


// // =======================================================
// // 🚀 FIXED: Confirm Refund (বায়ারকে টাকা ফেরত দেওয়া)
// // =======================================================
// router.patch("/report/refund/:id", async (req, res) => {
//   const session = client.startSession();
//   try {
//     const { id } = req.params;

//     if (!ObjectId.isValid(id)) {
//       return res.status(400).json({ success: false, message: "Invalid report id" });
//     }

//     await session.withTransaction(async () => {
//       // 1️⃣ রিপোর্ট খোঁজা
//       const report = await reportCollection.findOne(
//         { _id: new ObjectId(id) },
//         { session }
//       );
//       if (!report) throw new Error("Report not found");

//       // 2️⃣ অর্ডার খোঁজা
//       const order = await purchaseCollection.findOne(
//         { _id: new ObjectId(report.orderId) },
//         { session }
//       );
//       if (!order) throw new Error("Order not found");

//       // 3️⃣ Buyer টাকা ফেরত
//       await userCollection.updateOne(
//         { email: order.buyerEmail },
//         { $inc: { balance: Number(order.price) } },
//         { session }
//       );

//       // 4️⃣ Product আবার active
//       if (order.productId) {
//         await productsCollection.updateOne(
//           { _id: new ObjectId(order.productId) },
//           { $set: { status: "active" } },
//           { session }
//         );
//       }

//       // 5️⃣ Order status → refunded
//       await purchaseCollection.updateOne(
//         { _id: order._id },
//         { $set: { status: "refunded" } },
//         { session }
//       );

//       // 6️⃣ Report status → Refunded
//       await reportCollection.updateOne(
//         { _id: new ObjectId(id) },
//         { $set: { status: "Refunded", updatedAt: new Date() } },
//         { session }
//       );
//     });

//     res.json({ success: true, message: "Refund completed successfully" });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   } finally {
//     await session.endSession();
//   }
// });



// module.exports = router;