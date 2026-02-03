const nodemailer = require("nodemailer");

/**
 * Send an email to a user.
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - Email body in HTML
 */
const sendEmail = async ({ to, subject, html }) => {
    try {
        // 💡 SMTP Configuration from .env
        // User needs to provide: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || "smtp.gmail.com",
            port: process.env.SMTP_PORT || 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });

        const mailOptions = {
            from: `"AcctEmpire" <${process.env.SMTP_FROM || "noreply@acctempire.com"}>`,
            to,
            subject,
            html,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log("Email sent: %s", info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error("Error sending email:", error);
        return { success: false, error: error.message };
    }
};

/**
 * Get the withdrawal successful email template.
 * @param {string} name - User's name
 * @returns {string} - HTML email template
 */
const getWithdrawalSuccessTemplate = (name) => {
    return `
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; background-color: #111; color: white; border-radius: 10px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #ff4d00; margin: 0;">AcctEmpire</h1>
      </div>
      <div style="background-color: #1a1a1a; padding: 30px; border-radius: 10px; border: 1px solid #333;">
        <h2 style="font-size: 24px; margin-top: 0;">Hey ${name}</h2>
        <p style="font-size: 16px; line-height: 1.6; color: #ccc;">
          Your withdrawal request has been successfully processed. The funds should appear in your account shortly.
        </p>
        <div style="text-align: center; margin-top: 30px;">
          <a href="https://acctempire.com/dashboard/withdrawals" style="background-color: #ff4d00; color: white; padding: 12px 30px; text-decoration: none; font-weight: bold; border-radius: 5px; display: inline-block;">View</a>
        </div>
      </div>
      <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #666;">
        <p>This is an automatically generated email. Please do not reply to this email.</p>
        <p>If you face any issues, please contact us at <a href="mailto:help@acctempire.com" style="color: #ff4d00;">help@acctempire.com</a></p>
      </div>
    </div>
  `;
};

module.exports = {
    sendEmail,
    getWithdrawalSuccessTemplate,
};
