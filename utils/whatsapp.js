const axios = require("axios");
require("dotenv").config();

/**
 * Send a WhatsApp message to a user.
 * @param {string} to - Recipient phone number (with country code, e.g., +234...)
 * @param {string} message - Message content
 * @returns {Promise<Object>} - Success status and response data
 */
const sendWhatsAppMessage = async (to, message) => {
    try {
        const url = process.env.WHATSAPP_API_URL;
        const instanceId = process.env.WHATSAPP_INSTANCE_ID;
        const token = process.env.WHATSAPP_TOKEN;

        // If not configured, skip
        if (!url || !instanceId || !token) {
            console.log("WhatsApp credentials not configured. Skipping...");
            return { success: false, error: "Credentials missing" };
        }

        // Clean phone number (remove +, spaces, dashes)
        const cleanPhone = to.replace(/[^\d]/g, "");

        const data = {
            token: token,
            to: cleanPhone,
            body: message
        };

        const response = await axios.post(url, data);

        console.log("WhatsApp message sent successfully:", response.data);
        return { success: true, data: response.data };
    } catch (error) {
        console.error("WhatsApp Send Error:", error.response ? error.response.data : error.message);
        return { success: false, error: error.message };
    }
};

module.exports = { sendWhatsAppMessage };
