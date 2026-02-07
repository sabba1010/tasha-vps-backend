require("dotenv").config();
const { getStats, updateStats } = require("./utils/stats");

async function runTest() {
    try {
        console.log("Checking stats initialization...");
        const stats = await getStats();
        console.log("Current Stats:", stats);

        if (stats) {
            console.log("Stats initialized successfully.");

            console.log("Testing updateStats...");
            await updateStats({ totalTurnover: 10, lifetimePlatformProfit: 2 });

            const updatedStats = await getStats();
            console.log("Updated Stats:", updatedStats);

            if (updatedStats.totalTurnover === stats.totalTurnover + 10) {
                console.log("updateStats works correctly.");
            } else {
                console.log("updateStats FAILED.");
            }
        } else {
            console.log("Stats initialization failed.");
        }
    } catch (err) {
        console.error("Test failed:", err);
    } finally {
        process.exit();
    }
}

runTest();
