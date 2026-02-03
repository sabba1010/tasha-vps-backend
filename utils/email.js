const nodemailer = require("nodemailer");
require("dotenv").config();

/**
 * Send an email to a user.
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - Email body in HTML
 */
const sendEmail = async ({ to, subject, html }) => {
  try {
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
 * @param {Object} data - Withdrawal details
 * @param {string} data.name - User's name
 * @param {string|number} data.amountUSD - Amount in USD
 * @param {string|number} data.amountNGN - Amount in NGN
 * @param {string|number} data.rate - Exchange rate used
 * @param {string} data.transactionId - Transaction/Withdrawal ID
 * @param {string} data.withdrawalDetailsUrl - URL to view details
 * @returns {string} - HTML email template
 */
const getWithdrawalSuccessTemplate = ({ name, amountUSD, amountNGN, rate, transactionId, withdrawalDetailsUrl }) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Withdrawal Successful</title>
        <style>
            body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #0c0c0c; color: #ffffff; }
            .container { max-width: 600px; margin: 20px auto; background-color: #141414; border-radius: 12px; overflow: hidden; border: 1px solid #222; }
            .header { padding: 40px 20px; text-align: center; background: linear-gradient(135deg, #1a1a1a 0%, #0c0c0c 100%); border-bottom: 1px solid #222; }
            .logo { width: 50px; height: 50px; margin-bottom: 15px; }
            .content { padding: 40px 30px; }
            h1 { color: #ffffff; font-size: 24px; margin: 0 0 10px; font-weight: 700; }
            p { color: #a0a0a0; font-size: 16px; line-height: 1.6; margin: 0 0 20px; }
            .summary-box { background-color: #1e1e1e; border-radius: 8px; padding: 25px; margin: 30px 0; border: 1px solid #333; }
            .summary-title { font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #666; margin-bottom: 20px; font-weight: 600; }
            .summary-item { display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 15px; }
            .summary-label { color: #888; }
            .summary-value { color: #ffffff; font-weight: 600; }
            .summary-value.highlight { color: #ff4d00; }
            .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; background-color: rgba(34, 197, 94, 0.1); color: #22c55e; font-size: 12px; font-weight: 600; text-transform: uppercase; }
            .btn-container { text-align: center; margin-top: 35px; }
            .btn { background-color: #ff4d00; color: #ffffff; padding: 14px 35px; text-decoration: none; font-weight: 700; border-radius: 8px; display: inline-block; transition: all 0.3s ease; box-shadow: 0 4px 15px rgba(255, 77, 0, 0.3); }
            .footer { padding: 30px; text-align: center; font-size: 13px; color: #555; background-color: #0c0c0c; border-top: 1px solid #222; }
            .footer p { margin: 5px 0; color: #555; font-size: 13px; }
            .footer a { color: #ff4d00; text-decoration: none; }
            hr { border: 0; border-top: 1px solid #222; margin: 25px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <img src="https://acctempire.com/logo.png" alt="AcctEmpire" class="logo" onerror="this.style.display='none'">
                <div style="font-size: 28px; font-weight: 800; color: #ff4d00; letter-spacing: -1px;">AcctEmpire</div>
            </div>
            <div class="content">
                <h1>Hey ${name},</h1>
                <p>Your withdrawal request has been successfully processed. The funds should appear in your account shortly.</p>
                
                <div class="summary-box">
                    <div class="summary-title">💳 Withdrawal Summary</div>
                    
                    <div class="summary-item">
                        <span class="summary-label">Amount Withdrawn:</span>
                        <span class="summary-value">$${amountUSD}</span>
                    </div>
                    
                    <div class="summary-item">
                        <span class="summary-label">Converted Amount:</span>
                        <span class="summary-value highlight">₦${amountNGN}</span>
                    </div>
                    
                    <div class="summary-item">
                        <span class="summary-label">Exchange Rate:</span>
                        <span class="summary-value">1 USD = ₦${rate}</span>
                    </div>
                    
                    <div class="summary-item">
                        <span class="summary-label">Transaction ID:</span>
                        <span class="summary-value">${transactionId}</span>
                    </div>
                    
                    <div class="summary-item">
                        <span class="summary-label">Status:</span>
                        <span class="status-badge">Successful</span>
                    </div>
                </div>

                <div class="btn-container">
                    <a href="${withdrawalDetailsUrl}" class="btn">View Details</a>
                </div>
            </div>
            <div class="footer">
                <p>This is an automatically generated email. Please do not reply.</p>
                <p>If you face any issues, please contact us at <a href="mailto:help@acctempire.com">help@acctempire.com</a></p>
                <hr>
                <p style="font-size: 16px; color: #888;">Thank you for choosing AcctEmpire 🚀</p>
                <p>&copy; ${new Date().getFullYear()} AcctEmpire Team</p>
            </div>
        </div>
    </body>
    </html>
    `;
};

/**
   * Get the withdrawal declined email template.
   * @param {Object} data - Withdrawal details
   * @param {string} data.name - User's name
   * @param {string|number} data.amountUSD - Amount in USD
   * @param {string} data.reason - Reason for decline
   * @param {string} data.transactionId - Transaction/Withdrawal ID
   * @returns {string} - HTML email template
   */
const getWithdrawalDeclineTemplate = ({ name, amountUSD, reason, transactionId }) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Withdrawal Declined</title>
        <style>
            body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #0c0c0c; color: #ffffff; }
            .container { max-width: 600px; margin: 20px auto; background-color: #141414; border-radius: 12px; overflow: hidden; border: 1px solid #222; }
            .header { padding: 40px 20px; text-align: center; background: linear-gradient(135deg, #1a1a1a 0%, #0c0c0c 100%); border-bottom: 1px solid #222; }
            .logo { width: 50px; height: 50px; margin-bottom: 15px; }
            .content { padding: 40px 30px; }
            h1 { color: #ffffff; font-size: 24px; margin: 0 0 10px; font-weight: 700; }
            p { color: #a0a0a0; font-size: 16px; line-height: 1.6; margin: 0 0 20px; }
            .decline-box { background-color: rgba(239, 68, 68, 0.05); border-radius: 8px; padding: 25px; margin: 30px 0; border: 1px solid rgba(239, 68, 68, 0.2); }
            .decline-title { font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #ef4444; margin-bottom: 15px; font-weight: 600; }
            .reason-text { color: #ffffff; font-size: 15px; font-style: italic; }
            .summary-item { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; color: #888; }
            .summary-value { color: #ccc; }
            .btn-container { text-align: center; margin-top: 35px; }
            .btn { background-color: #333; color: #ffffff; padding: 12px 30px; text-decoration: none; font-weight: 600; border-radius: 8px; display: inline-block; }
            .footer { padding: 30px; text-align: center; font-size: 13px; color: #555; background-color: #0c0c0c; border-top: 1px solid #222; }
            .footer a { color: #ff4d00; text-decoration: none; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div style="font-size: 28px; font-weight: 800; color: #ff4d00; letter-spacing: -1px;">AcctEmpire</div>
            </div>
            <div class="content">
                <h1 style="color: #ef4444;">Withdrawal Declined</h1>
                <p>Hey ${name},</p>
                <p>We're sorry to inform you that your withdrawal request has been declined and the funds have been returned to your balance.</p>
                
                <div class="decline-box">
                    <div class="decline-title">Reason for Decline</div>
                    <div class="reason-text">"${reason || "No specific reason provided."}"</div>
                </div>

                <div style="border-top: 1px solid #222; padding-top: 20px;">
                    <div class="summary-item">
                        <span>Amount:</span>
                        <span class="summary-value">$${amountUSD}</span>
                    </div>
                    <div class="summary-item">
                        <span>Transaction ID:</span>
                        <span class="summary-value">${transactionId}</span>
                    </div>
                </div>

                <div class="btn-container">
                    <a href="https://acctempire.com/dashboard/withdrawals" class="btn">View Dashboard</a>
                </div>
            </div>
            <div class="footer">
                <p>If you have questions, please contact <a href="mailto:help@acctempire.com">help@acctempire.com</a></p>
                <p>&copy; ${new Date().getFullYear()} AcctEmpire Team</p>
            </div>
        </div>
    </body>
    </html>
    `;
};

module.exports = {
  sendEmail,
  getWithdrawalSuccessTemplate,
  getWithdrawalDeclineTemplate,
};
