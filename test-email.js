require("dotenv").config();
const { sendEmail, getWithdrawalSuccessTemplate } = require("./utils/email");

const testMail = async () => {
    console.log("🚀 Starting Email Test...");
    console.log("Config Check:");
    console.log("- SMTP_HOST:", process.env.SMTP_HOST || "smtp.gmail.com (Default)");
    console.log("- SMTP_PORT:", process.env.SMTP_PORT || "587 (Default)");
    console.log("- SMTP_USER:", process.env.SMTP_USER ? "FOUND ✅" : "MISSING ❌");
    console.log("- SMTP_PASS:", process.env.SMTP_PASS ? "FOUND ✅" : "MISSING ❌");

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.error("\n❌ ERROR: Missing SMTP_USER or SMTP_PASS in .env file.");
        process.exit(1);
    }

    const result = await sendEmail({
        to: process.env.SMTP_USER, // Send to yourself
        subject: "AcctEmpire Test Email",
        html: getWithdrawalSuccessTemplate("Test User"),
    });

    if (result.success) {
        console.log("\n✅ SUCCESS! Email sent successfully. MessageID:", result.messageId);
    } else {
        console.error("\n❌ FAILED! Error:", result.error);
        console.log("\nPossible solutions:");
        console.log("1. App Passwords: If using Gmail, you MUST use an 'App Password', not your account password.");
        console.log("2. Less Secure Apps: Ensure your SMTP provider allows third-party connections.");
        console.log("3. Port: Try port 465 with 'secure: true' if 587 fails.");
    }
};

testMail();
