const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
require("dotenv").config();

const router = express.Router();

// Middleware
router.use(express.json());

// MongoDB configuration
const MONGO_URI = process.env.MONGO_URI;
const client = new MongoClient(MONGO_URI);
const db = client.db("mydb");
const productCollection = db.collection("products");
const userCollection = db.collection("userCollection");

(async () => {
    try {
        await client.connect();
        console.log("Connected to MongoDB");
    } catch (err) {
        console.error("MongoDB Connection Error:", err);
    }
})();

// Helper: Check and Reset Credits (24h Logic)
async function checkAndResetCredits(user) {
    // If not a seller with a reset field, we skip
    if (!user.subscribedPlan) return user;

    const planCredits = {
        free: 10,
        basic: 20,
        business: 30,
        premium: 40
    };

    const now = new Date();
    const lastReset = user.lastCreditResetAt ? new Date(user.lastCreditResetAt) : new Date(user.createdAt || now);
    const diffMs = now - lastReset;
    const diffHours = diffMs / (1000 * 60 * 60);

    // If 24 hours passed OR they never had a reset field set
    if (diffHours >= 24 || !user.lastCreditResetAt) {
        const planLimit = user.planCredit || planCredits[user.subscribedPlan.toLowerCase()] || 0;

        if (planLimit > 0) {
            await userCollection.updateOne(
                { _id: user._id },
                {
                    $set: {
                        salesCredit: planLimit,
                        lastCreditResetAt: now
                    }
                }
            );
            return { ...user, salesCredit: planLimit, lastCreditResetAt: now };
        }
    }

    return user;
}

router.post("/sell", async (req, res) => {
    try {
        const { products } = req.body;

        // 🔴 STRICT: only array accepted
        if (!Array.isArray(products) || products.length === 0) {
            return res.status(400).json({
                message: "products must be a non-empty array",
            });
        }

        const userEmail = products[0].userEmail;
        if (!userEmail) {
            return res.status(400).json({ message: "userEmail is required" });
        }

        // Required fields
        const requiredFields = [
            "category",
            "name",
            "description",
            "price",
            "username",
            "accountPass",
            "userEmail",
            "userAccountName",
        ];

        for (const product of products) {
            for (const field of requiredFields) {
                if (!product[field]) {
                    return res.status(400).json({
                        message: `${field} is required for product: ${product.name || "unnamed"}`,
                    });
                }
            }

            // 🚚 Delivery Validation
            // 1. deliveryType must be present
            if (!product.deliveryType) {
                return res.status(400).json({
                    message: `deliveryType is required (manual or automated) for product: ${product.name || "unnamed"}`
                });
            }

            // 2. If manual, deliveryTime is required
            if (product.deliveryType === "manual" && !product.deliveryTime?.trim()) {
                return res.status(400).json({
                    message: `deliveryTime is required for manual delivery - product: ${product.name || "unnamed"}`
                });
            }

            // Optional: Validate allowed values
            if (!["manual", "automated"].includes(product.deliveryType)) {
                return res.status(400).json({
                    message: `deliveryType must be "manual" or "automated" - got: ${product.deliveryType} for product: ${product.name || "unnamed"}`
                });
            }

            // 2. If manual, deliveryTime is required and must match strict format
            if (product.deliveryType === "manual") {
                if (!product.deliveryTime || !product.deliveryTime.trim()) {
                    return res.status(400).json({
                        message: `deliveryTime is required for manual delivery - product: ${product.name || "unnamed"}`
                    });
                }

                // STRICT REGEX VALIDATION (Supports hours and mins)
                const strictRegex = /^(?:[1-9]\d{0,3}|[1-3]\d{4}|3724)\s(hours?|mins?)$/;
                if (!strictRegex.test(product.deliveryTime)) {
                    return res.status(400).json({
                        message: `Invalid delivery time format for product: ${product.name || "unnamed"}. Must be "<number> hours" or "<number> mins" (max 3724 hours). Example: "3 hours"`
                    });
                }

                // Numeric Check (~155 days max)
                const [valueStr, unit] = product.deliveryTime.split(' ');
                const value = parseInt(valueStr, 10);
                if (unit.startsWith('hour')) {
                    if (value > 3724) return res.status(400).json({ message: "Delivery time exceeds limit of 3724 hours." });
                } else {
                    if (value > 223424) return res.status(400).json({ message: "Delivery time exceeds limit of 223,424 mins." });
                }
            }
        }

        // Find user
        let user = await userCollection.findOne({ email: userEmail });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // 🔄 Recurring Credit Check
        user = await checkAndResetCredits(user);

        // Check if user has enough credits (1 credit per product)
        const creditsNeeded = products.length;
        if (!user.salesCredit || user.salesCredit < creditsNeeded) {
            return res.status(403).json({
                message:
                    `Insufficient listing credits. You need ${creditsNeeded} credit(s) but only have ${user.salesCredit || 0}. Please purchase more credits.`,
            });
        }

        // Deduct credits equal to number of products
        await userCollection.updateOne(
            { email: userEmail },
            { $inc: { salesCredit: -creditsNeeded } }
        );

        // 🔥 INSERT ALL PRODUCTS
        const formattedProducts = products.map((p) => ({
            ...p,
            deliveryType: p.deliveryType, // Explicitly include
            deliveryTime: p.deliveryType === 'manual' ? p.deliveryTime : null, // Only store time if manual
            status: p.status || "pending",
            createdAt: new Date(),
        }));

        const result = await productCollection.insertMany(formattedProducts);

        res.status(201).json({
            acknowledged: true,
            insertedCount: result.insertedCount,
            message: `${result.insertedCount} product(s) added successfully. ${creditsNeeded} credit(s) deducted.`,
        });
    } catch (error) {
        console.error("SELL ERROR:", error);
        res.status(500).json({
            message: "Server error while listing products",
        });
    }
});

router.get("/all-sells", async (req, res) => {
    const { status, userEmail } = req.query;
    try {
        // Build match object
        let match = {};
        if (status) {
            match.status = status;
            // For Marketplace (active), only show visible ads
            if (status === "active") match.isVisible = { $ne: false };
        }
        if (userEmail) match.userEmail = userEmail;

        // Using aggregate for joining store name
        const allData = await productCollection.aggregate([
            { $match: match },
            {
                $lookup: {
                    from: "userCollection",
                    localField: "userEmail",
                    foreignField: "email",
                    as: "sellerInfo"
                }
            },
            {
                $unwind: {
                    path: "$sellerInfo",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $addFields: {
                    storeName: "$sellerInfo.storeName",
                    sellerUsername: "$sellerInfo.username",
                    sellerName: "$sellerInfo.name"
                }
            },
            {
                $project: {
                    sellerInfo: 0 // Clean up sensitive user data
                }
            },
            { $sort: { _id: -1 } }
        ]).toArray();

        res.status(200).send(allData);
    } catch (error) {
        console.error("ALL SELLS ERROR:", error);
        res.status(500).send({ message: "Error fetching products" });
    }
});

// GET /product/credit - Fetch user's salesCredit (MUST come before /:id route)
router.get("/credit", async (req, res) => {
    try {
        const { email } = req.query;

        if (!email) {
            return res.status(400).json({ message: "Email query parameter is required" });
        }

        let user = await userCollection.findOne(
            { email: email }
        );

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // 🔄 Recurring Credit Check
        user = await checkAndResetCredits(user);

        res.json({ salesCredit: user.salesCredit || 0 });
    } catch (error) {
        console.error("Error fetching user credit:", error);
        res.status(500).json({ message: "Failed to fetch credits" });
    }
});

// GET SINGLE PRODUCT BY ID
router.get("/:id", async (req, res) => {
    try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid product ID" });
        }
        const product = await productCollection.aggregate([
            { $match: { _id: new ObjectId(id) } },
            {
                $lookup: {
                    from: "userCollection",
                    localField: "userEmail",
                    foreignField: "email",
                    as: "sellerInfo"
                }
            },
            {
                $unwind: {
                    path: "$sellerInfo",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $addFields: {
                    storeName: "$sellerInfo.storeName",
                    sellerUsername: "$sellerInfo.username",
                    sellerName: "$sellerInfo.name"
                }
            },
            {
                $project: {
                    sellerInfo: 0
                }
            }
        ]).next();

        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }
        res.status(200).json(product);
    } catch (error) {
        res.status(500).json({ message: "Error fetching product" });
    }
});

router.patch("/update-status/:id", async (req, res) => {
    const id = req.params.id;
    const { status, rejectReason } = req.body;

    try {
        if (!ObjectId.isValid(id)) {
            return res.status(400).send({ message: "Invalid ID format" });
        }

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
            $set: {
                status: status,
                rejectReason: status === "reject" ? rejectReason : ""
            },
        };

        const result = await productCollection.updateOne(filter, updateDoc);

        if (result.matchedCount === 0) {
            return res.status(404).send({ message: "Product not found" });
        }

        res.status(200).send({
            message: "Status updated successfully",
            success: true,
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        console.error("Update Error:", error);
        res.status(500).send({ message: "Internal server error" });
    }
});


// UPDATE PRODUCT DETAILS (for resubmitting denied ads)
router.patch("/update/:id", async (req, res) => {
    const id = req.params.id;
    const {
        username,
        accountPass,
        email,
        password,
        previewLink,
        additionalInfo,
        status,
        deliveryType,
        deliveryTime
    } = req.body;

    try {
        if (!ObjectId.isValid(id)) {
            return res.status(400).send({ message: "Invalid ID format" });
        }

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
            $set: {
                username: username || undefined,
                accountPass: accountPass || undefined,
                email: email || undefined,
                password: password || undefined,
                previewLink: previewLink || undefined,
                additionalInfo: additionalInfo || undefined,
                status: status || "pending",
                deliveryType: deliveryType || undefined,
                deliveryTime: deliveryType === 'manual' ? deliveryTime : (deliveryType === 'automated' ? null : undefined),
                rejectReason: "", // Clear rejection reason on resubmit
                updatedAt: new Date() // Add timestamp to show as recent
            },
        };

        // If switching to automated, ensure deliveryTime is nulled
        if (deliveryType === 'automated') {
            updateDoc.$set.deliveryTime = null;
        }

        // Remove undefined fields
        Object.keys(updateDoc.$set).forEach(key =>
            updateDoc.$set[key] === undefined && delete updateDoc.$set[key]
        );

        const result = await productCollection.updateOne(filter, updateDoc);

        if (result.matchedCount === 0) {
            return res.status(404).send({ message: "Product not found" });
        }

        res.status(200).send({
            message: "Product updated successfully",
            success: true,
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        console.error("Update Error:", error);
        res.status(500).send({ message: "Internal server error" });
    }
});



// DELETE API
router.delete("/delete/:id", async (req, res) => {
    const id = req.params.id;
    try {
        const result = await productCollection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount > 0) {
            res.status(200).send({ message: "Deleted successfully" });
        } else {
            res.status(404).send({ message: "Not found" });
        }
    } catch (error) {
        res.status(500).send({ message: "Server error" });
    }
});

// TOGGLE PRODUCT VISIBILITY
router.patch("/toggle-visibility/:id", async (req, res) => {
    const id = req.params.id;
    const { isVisible } = req.body;

    try {
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid product ID" });
        }

        if (typeof isVisible !== 'boolean') {
            return res.status(400).json({ message: "isVisible must be a boolean" });
        }

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
            $set: {
                isVisible: isVisible,
                updatedAt: new Date()
            },
        };

        const result = await productCollection.updateOne(filter, updateDoc);

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: "Product not found" });
        }

        res.status(200).json({
            message: isVisible ? "Product visibility enabled" : "Product visibility disabled",
            success: true,
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        console.error("Toggle visibility error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// TOGGLE ALL PRODUCTS VISIBILITY BY USER EMAIL
router.patch("/toggle-all-visibility", async (req, res) => {
    const { userEmail, isVisible } = req.body;

    try {
        if (!userEmail) {
            return res.status(400).json({ message: "userEmail is required" });
        }

        if (typeof isVisible !== 'boolean') {
            return res.status(400).json({ message: "isVisible must be a boolean" });
        }

        const filter = { userEmail: userEmail };
        const updateDoc = {
            $set: {
                isVisible: isVisible,
                updatedAt: new Date()
            },
        };

        const result = await productCollection.updateMany(filter, updateDoc);

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: "No products found for this user" });
        }

        res.status(200).json({
            message: isVisible ? "All products visibility enabled" : "All products visibility disabled",
            success: true,
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        console.error("Toggle all visibility error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// GET USER PRODUCTS (for listings page)
router.get("/user-products/:email", async (req, res) => {
    const { email } = req.params;

    try {
        if (!email) {
            return res.status(400).json({ message: "User email is required" });
        }

        const products = await productCollection.aggregate([
            {
                $match: {
                    userEmail: email,
                    status: "active",
                    isVisible: { $ne: false }
                }
            },
            {
                $lookup: {
                    from: "userCollection",
                    localField: "userEmail",
                    foreignField: "email",
                    as: "sellerInfo"
                }
            },
            {
                $unwind: {
                    path: "$sellerInfo",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $addFields: {
                    storeName: "$sellerInfo.storeName",
                    sellerUsername: "$sellerInfo.username",
                    sellerName: "$sellerInfo.name"
                }
            },
            {
                $project: {
                    sellerInfo: 0
                }
            },
            { $sort: { _id: -1 } }
        ]).toArray();

        res.status(200).json({
            success: true,
            products: products
        });
    } catch (error) {
        console.error("Error fetching user products:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

module.exports = router;




// const express = require("express");
// const { MongoClient, ObjectId } = require("mongodb");
// require("dotenv").config();

// const router = express.Router();

// // Middleware
// router.use(express.json());

// // MongoDB configuration
// const MONGO_URI = process.env.MONGO_URI;
// const client = new MongoClient(MONGO_URI);
// const db = client.db("mydb");
// const productCollection = db.collection("products");
// const userCollection = db.collection("userCollection");


// (async () => {
//     try {
//         await client.connect();
//         console.log("Connected to MongoDB");
//     } catch (err) {
//         console.error("MongoDB Connection Error:", err);
//     }
// })();


// router.post("/sell", async (req, res) => {
//   try {
//     const { products } = req.body;

//     // 🔴 STRICT: only array accepted
//     if (!Array.isArray(products) || products.length === 0) {
//       return res.status(400).json({
//         message: "products must be a non-empty array",
//       });
//     }

//     const userEmail = products[0].userEmail;
//     if (!userEmail) {
//       return res.status(400).json({ message: "userEmail is required" });
//     }

//     // Required fields (same as your old logic)
//     const requiredFields = [
//       "category",
//       "name",
//       "description",
//       "price",
//       "username",
//       "accountPass",
//       "userEmail",
//       "userAccountName",
//     ];

//     for (const product of products) {
//       for (const field of requiredFields) {
//         if (!product[field]) {
//           return res.status(400).json({
//             message: `${field} is required`,
//           });
//         }
//       }
//     }

//     // Find user
//     const user = await userCollection.findOne({ email: userEmail });
//     if (!user) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     // Check if user has enough credits (1 credit per product)
//     const creditsNeeded = products.length;
//     if (!user.salesCredit || user.salesCredit < creditsNeeded) {
//       return res.status(403).json({
//         message:
//           `Insufficient listing credits. You need ${creditsNeeded} credit(s) but only have ${user.salesCredit || 0}. Please purchase more credits.`,
//       });
//     }

//     // Deduct credits equal to number of products
//     await userCollection.updateOne(
//       { email: userEmail },
//       { $inc: { salesCredit: -creditsNeeded } }
//     );

//     // 🔥 INSERT ALL PRODUCTS (same title allowed)
//     const formattedProducts = products.map((p) => ({
//       ...p,
//       status: p.status || "pending",
//       createdAt: new Date(),
//     }));

//     const result = await productCollection.insertMany(formattedProducts);

//     res.status(201).json({
//       acknowledged: true,
//       insertedCount: result.insertedCount,
//       message: `${result.insertedCount} product(s) added successfully. ${creditsNeeded} credit(s) deducted.`,
//     });
//   } catch (error) {
//     console.error("SELL ERROR:", error);
//     res.status(500).json({
//       message: "Server error while listing products",
//     });
//   }
// });




// router.get("/all-sells", async (req, res) => {
//     try {
//         const allData = await productCollection.find({}).sort({ _id: -1 }).toArray();
//         res.status(200).send(allData);
//     } catch (error) {
//         res.status(500).send({ message: "Error fetching products" });
//     }
// });

// router.patch("/update-status/:id", async (req, res) => {
//     const id = req.params.id;
//     const { status, rejectReason } = req.body;

//     try {
//         if (!ObjectId.isValid(id)) {
//             return res.status(400).send({ message: "Invalid ID format" });
//         }

//         const filter = { _id: new ObjectId(id) };
//         const updateDoc = {
//             $set: {
//                 status: status,
//                 rejectReason: status === "reject" ? rejectReason : ""
//             },
//         };

//         const result = await productCollection.updateOne(filter, updateDoc);

//         if (result.matchedCount === 0) {
//             return res.status(404).send({ message: "Product not found" });
//         }

//         res.status(200).send({
//             message: "Status updated successfully",
//             success: true,
//             modifiedCount: result.modifiedCount
//         });
//     } catch (error) {
//         console.error("Update Error:", error);
//         res.status(500).send({ message: "Internal server error" });
//     }
// });


// // UPDATE PRODUCT DETAILS (for resubmitting denied ads)
// router.patch("/update/:id", async (req, res) => {
//     const id = req.params.id;
//     const { username, accountPass, email, password, previewLink, additionalInfo, status } = req.body;

//     try {
//         if (!ObjectId.isValid(id)) {
//             return res.status(400).send({ message: "Invalid ID format" });
//         }

//         const filter = { _id: new ObjectId(id) };
//         const updateDoc = {
//             $set: {
//                 username: username || undefined,
//                 accountPass: accountPass || undefined,
//                 email: email || undefined,
//                 password: password || undefined,
//                 previewLink: previewLink || undefined,
//                 additionalInfo: additionalInfo || undefined,
//                 status: status || "pending",
//                 rejectReason: "", // Clear rejection reason on resubmit
//                 updatedAt: new Date() // Add timestamp to show as recent
//             },
//         };

//         // Remove undefined fields
//         Object.keys(updateDoc.$set).forEach(key =>
//             updateDoc.$set[key] === undefined && delete updateDoc.$set[key]
//         );

//         const result = await productCollection.updateOne(filter, updateDoc);

//         if (result.matchedCount === 0) {
//             return res.status(404).send({ message: "Product not found" });
//         }

//         res.status(200).send({
//             message: "Product updated successfully",
//             success: true,
//             modifiedCount: result.modifiedCount
//         });
//     } catch (error) {
//         console.error("Update Error:", error);
//         res.status(500).send({ message: "Internal server error" });
//     }
// });



// // DELETE API
// router.delete("/delete/:id", async (req, res) => {
//     const id = req.params.id;
//     try {
//         const result = await productCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount > 0) {
//             res.status(200).send({ message: "Deleted successfully" });
//         } else {
//             res.status(404).send({ message: "Not found" });
//         }
//     } catch (error) {
//         res.status(500).send({ message: "Server error" });
//     }
// });


// // GET /product/credit - Fetch user's salesCredit
// router.get("/credit", async (req, res) => {
//   try {
//     const { email } = req.query;

//     if (!email) {
//       return res.status(400).json({ message: "Email query parameter is required" });
//     }

//     const user = await userCollection.findOne(
//       { email: email },
//       { projection: { salesCredit: 1, _id: 0 } }
//     );

//     if (!user) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     res.json({ salesCredit: user.salesCredit || 0 });
//   } catch (error) {
//     console.error("Error fetching user credit:", error);
//     res.status(500).json({ message: "Failed to fetch credits" });
//   }
// });


// module.exports = router;