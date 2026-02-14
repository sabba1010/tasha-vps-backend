const { MongoClient } = require("mongodb");
require("dotenv").config();

const MONGO_URI = process.env.MONGO_URI;
const client = new MongoClient(MONGO_URI);

async function run() {
    try {
        await client.connect();
        const db = client.db("mydb");

        console.log("-----------------------------------------");
        console.log("   FINANCIAL METRICS CONSISTENCY CHECK   ");
        console.log("-----------------------------------------");

        // 1. Calculate Total Deposits (Gross)
        const payments = await db.collection("payments").find({ credited: true }).toArray();
        const actualTotalDeposits = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const totalDepositFees = payments.reduce((sum, p) => sum + Number(p.fee || 0), 0);
        const totalDepositExchangeProfit = payments.reduce((sum, p) => sum + Number(p.exchangeProfit || 0), 0);

        // 2. Calculate Total Withdrawals
        const withdrawals = await db.collection("withdraw").find({ status: "approved" }).toArray();
        const actualTotalSellerWithdrawn = withdrawals
            .filter(w => !w.isAdminWithdrawal && w.userEmail !== "admin@gmail.com")
            .reduce((sum, w) => sum + Number(w.amountUSD || w.amount || 0), 0);

        const actualTotalAdminWithdrawn = withdrawals
            .filter(w => w.isAdminWithdrawal || w.userEmail === "admin@gmail.com")
            .reduce((sum, w) => sum + Number(w.amountUSD || w.amount || 0), 0);

        const totalWithdrawalExchangeProfit = withdrawals.reduce((sum, w) => sum + Number(w.exchangeProfit || 0), 0);

        // 3. Calculate Lifetime Profit components from Sales (Requires complex aggregation or simple sum of commissions)
        // For simplicity in this script, we'll look at completed purchases
        const purchases = await db.collection("mypurchase").find({ status: "completed" }).toArray();
        const totalCommissionProfit = purchases
            .filter(p => p.sellerEmail !== "admin@gmail.com")
            .reduce((sum, p) => sum + (Number(p.price || 0) * 0.2), 0);

        const totalAdminSalesProfit = purchases
            .filter(p => p.sellerEmail === "admin@gmail.com")
            .reduce((sum, p) => sum + Number(p.price || 0), 0);

        // 4. Get Global Stats Document
        const stats = await db.collection("systemStats").findOne({ _id: "global" });

        // Expected Lifetime Profit
        const expectedLifetimeProfit = totalCommissionProfit + totalAdminSalesProfit + totalDepositFees + totalDepositExchangeProfit + totalWithdrawalExchangeProfit;

        // Expected Turnover (Liquidity)
        const expectedTurnover = actualTotalDeposits - actualTotalSellerWithdrawn - actualTotalAdminWithdrawn;

        console.log("\n--- TRANSACTION HISTORY TOTALS ---");
        console.log(`Total Deposits:       $${actualTotalDeposits.toFixed(2)}`);
        console.log(`Seller Withdrawn:     $${actualTotalSellerWithdrawn.toFixed(2)}`);
        console.log(`Admin Withdrawn:      $${actualTotalAdminWithdrawn.toFixed(2)}`);
        console.log(`Expected Turnover:    $${expectedTurnover.toFixed(2)}`);

        console.log("\n--- PROFIT BREAKDOWN ---");
        console.log(`Commissions:          $${totalCommissionProfit.toFixed(2)}`);
        console.log(`Admin Sales:          $${totalAdminSalesProfit.toFixed(2)}`);
        console.log(`Deposit Fees:         $${totalDepositFees.toFixed(2)}`);
        console.log(`Exchange Profits:     $${(totalDepositExchangeProfit + totalWithdrawalExchangeProfit).toFixed(2)}`);
        console.log(`Expected Lifetime:    $${expectedLifetimeProfit.toFixed(2)}`);

        console.log("\n--- GLOBAL STATS (DB) ---");
        if (stats) {
            console.log(`Stat Turnover:        $${(stats.totalTurnover || 0).toFixed(2)}`);
            console.log(`Stat Lifetime Profit: $${(stats.lifetimePlatformProfit || 0).toFixed(2)}`);
            console.log(`Stat Total Deposits:  $${(stats.totalDeposits || 0).toFixed(2)}`);
            console.log(`Stat Admin Withdr:    $${(stats.totalAdminWithdrawn || 0).toFixed(2)}`);

            const availableProfit = (stats.lifetimePlatformProfit || 0) - (stats.totalAdminWithdrawn || 0);
            console.log(`Derived Available:    $${availableProfit.toFixed(2)}`);
        } else {
            console.log("Stats document not found!");
        }

        console.log("\n-----------------------------------------");
        console.log("Note: If Stats don't match History, a migration is needed to sync them.");
        console.log("-----------------------------------------");

    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}

run();
