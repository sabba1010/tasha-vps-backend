const axios = require("axios");

const KORAPAY_SECRET_KEY = process.env.KORAPAY_SECRET_KEY;
const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY;

/**
 * Process payout via Korapay
 * @param {object} withdrawal - Withdrawal document from DB
 */
async function processKorapayPayout(withdrawal) {
    try {
        const amountNGN = Number(withdrawal.amountNGN || withdrawal.netAmountNGN);
        const reference = `wd-kp-${Date.now()}`;

        const payload = {
            reference,
            amount: amountNGN,
            currency: "NGN",
            account_number: withdrawal.accountNumber,
            bank_code: withdrawal.bankCode,
            narration: withdrawal.note || "Platform Withdrawal",
        };

        const response = await axios.post(
            "https://api.korapay.com/merchant/api/v1/transactions/disburse",
            payload,
            {
                headers: {
                    Authorization: `Bearer ${KORAPAY_SECRET_KEY}`,
                    "Content-Type": "application/json",
                },
            }
        );

        return {
            success: true,
            data: response.data.data,
            reference,
        };
    } catch (err) {
        console.error("Korapay Payout Error:", err.response?.data || err.message);
        return {
            success: false,
            error: err.response?.data?.message || err.message,
        };
    }
}

/**
 * Process payout via Flutterwave
 * @param {object} withdrawal - Withdrawal document from DB
 */
async function processFlutterwavePayout(withdrawal) {
    try {
        const amountNGN = Number(withdrawal.amountNGN || withdrawal.netAmountNGN);
        const reference = `wd-flw-${Date.now()}`;

        const payload = {
            account_bank: withdrawal.bankCode,
            account_number: withdrawal.accountNumber,
            amount: amountNGN,
            narration: withdrawal.note || "Platform Withdrawal",
            currency: "NGN",
            reference,
            debit_currency: "NGN",
        };

        const response = await axios.post(
            "https://api.flutterwave.com/v3/transfers",
            payload,
            {
                headers: {
                    Authorization: `Bearer ${FLW_SECRET_KEY}`,
                    "Content-Type": "application/json",
                },
            }
        );

        return {
            success: true,
            data: response.data.data,
            reference,
        };
    } catch (err) {
        const errorData = err.response?.data || err.message;
        console.error("Flutterwave Payout Error:", errorData);

        // Detailed logging to file
        const fs = require('fs');
        try {
            const logMsg = `[${new Date().toISOString()}] Flutterwave Error Detail: ${JSON.stringify(errorData, null, 2)}\nPayload: ${JSON.stringify(withdrawal, null, 2)}\n`;
            fs.appendFileSync('debug_payout.log', logMsg);
        } catch (e) { }

        return {
            success: false,
            error: errorData.message || err.message,
        };
    }
}

module.exports = {
    processKorapayPayout,
    processFlutterwavePayout,
};
