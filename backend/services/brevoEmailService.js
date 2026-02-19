const { BrevoClient } = require("@getbrevo/brevo");
require("dotenv").config();

const brevo = new BrevoClient({ apiKey: process.env.BREVO_API });

async function testBrevoConnection() {
  try {
    const response = await brevo.account.getAccount();
    console.log("✅ Brevo connection successful");
    console.log("Account info:", response);
    return true;
  } catch (error) {
    console.error(
      "❌ Brevo connection failed",
      error.response?.body || error.message
    );
    return false;
  }
}

/**
 * Send a warranty expiry reminder email via Brevo.
 * @param {string} toEmail - Recipient email address
 * @param {string} documentName - Original filename of the document
 * @param {string} expiryDate - Expiry date string (YYYY-MM-DD)
 * @param {number} daysRemaining - Days until expiry
 */
async function sendReminderEmail(toEmail, documentName, expiryDate, daysRemaining) {
  try {
    const senderEmail = process.env.BREVO_SENDER_EMAIL;
    const senderName = process.env.BREVO_SENDER_NAME || "CheckMyWarranty";

    if (!senderEmail) {
      throw new Error("BREVO_SENDER_EMAIL is not set in environment variables");
    }

    const urgency = daysRemaining <= 3 ? "⚠️ URGENT" : "🔔 Reminder";
    const formattedDate = new Date(expiryDate).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const response = await brevo.transactionalEmails.sendTransacEmail({
      subject: `${urgency}: Warranty for "${documentName}" expires in ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}`,
      htmlContent: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1a1a2e;">${urgency}: Warranty Expiring Soon</h2>
        <div style="background: #f8f9fa; border-left: 4px solid ${daysRemaining <= 3 ? "#e74c3c" : "#f39c12"}; padding: 16px; margin: 16px 0; border-radius: 4px;">
          <p style="margin: 0 0 8px 0;"><strong>Document:</strong> ${documentName}</p>
          <p style="margin: 0 0 8px 0;"><strong>Expiry Date:</strong> ${formattedDate}</p>
          <p style="margin: 0; font-size: 18px; color: ${daysRemaining <= 3 ? "#e74c3c" : "#f39c12"};">
            <strong>${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} remaining</strong>
          </p>
        </div>
        <p style="color: #555;">Please take necessary action before the warranty expires — whether it's filing a claim, renewing coverage, or reviewing your options.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #999; font-size: 12px;">This is an automated reminder from CheckMyWarranty.</p>
      </div>
      `,
      sender: { name: senderName, email: senderEmail },
      to: [{ email: toEmail }],
    });

    console.log(`✅ Reminder email sent to ${toEmail} for "${documentName}" (${daysRemaining} days left)`);
    return { success: true, messageId: response.messageId };
  } catch (error) {
    console.error(
      `❌ Failed to send reminder email to ${toEmail}:`,
      error.response?.body || error.message
    );
    return { success: false, error: error.message };
  }
}

module.exports = {
  testBrevoConnection,
  sendReminderEmail,
};