// brevoEmailService.js
import { createRequire } from "module";
import logger from "../logger.js";
import "dotenv/config";

const require = createRequire(import.meta.url);
const { AccountApi, TransactionalEmailsApi } = require("@getbrevo/brevo");

const accountApi = new AccountApi();
accountApi.setApiKey(0, process.env.BREVO_API);

const emailApi = new TransactionalEmailsApi();
emailApi.setApiKey(0, process.env.BREVO_API);

export async function testBrevoConnection() {
  try {
    const response = await accountApi.getAccount();
    logger.info("Brevo connection successful");
    return true;
  } catch (error) {
    logger.error({ err: error.response?.body || error.message }, "Brevo connection failed");
    return false;
  }
}

export async function sendReminderEmail(toEmail, documentName, expiryDate, daysRemaining) {
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

    const response = await emailApi.sendTransacEmail({
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

    logger.info({ toEmail, documentName, daysRemaining }, "Reminder email sent");
    return { success: true, messageId: response.body.messageId };
  } catch (error) {
    logger.error(
      { err: error.response?.body || error.message, toEmail, documentName },
      "Failed to send reminder email"
    );
    return { success: false, error: error.message };
  }
}

export async function sendOtpEmail(toEmail, otp) {
  const senderName = process.env.BREVO_SENDER_NAME || "CheckMyWarranty";
  const senderEmail = process.env.BREVO_SENDER_EMAIL;

  await emailApi.sendTransacEmail({
    subject: `🔐 CheckMyWarranty Password Reset Code: ${otp}`,
    htmlContent: `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Reset OTP - CheckMyWarranty</title>
      <style>
        .otp-box {
          transition: all 0.2s ease-in-out;
          user-select: all;
          -webkit-user-select: all;
          cursor: pointer;
        }
        .otp-box:active {
          transform: scale(0.95);
          background-color: #dcfce7 !important;
          border-color: #16a34a !important;
        }
      </style>
      <script>
        function copyOtp(el, code) {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(code);
          } else {
            var t = document.createElement('textarea');
            t.value = code;
            document.body.appendChild(t);
            t.select();
            document.execCommand('copy');
            document.body.removeChild(t);
          }
          var notice = document.getElementById('copy-status');
          if (notice) {
            notice.innerHTML = '✅ Copied to clipboard!';
            notice.style.color = '#15803d';
            notice.style.fontWeight = '800';
            setTimeout(function() {
              notice.innerHTML = '👆 Tap/Click code to copy';
              notice.style.color = '#2563eb';
              notice.style.fontWeight = '700';
            }, 2500);
          }
          if (el) {
            el.style.backgroundColor = '#dcfce7';
            el.style.borderColor = '#16a34a';
            el.style.color = '#15803d';
            setTimeout(function() {
              el.style.backgroundColor = '#ffffff';
              el.style.borderColor = '#2563eb';
              el.style.color = '#1e3a8a';
            }, 2500);
          }
        }
      </script>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f4f6f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f6f9; padding: 40px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
              
              <!-- Header Banner -->
              <tr>
                <td style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%); padding: 32px 24px; text-align: center;">
                  <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.5px;">CheckMyWarranty</h1>
                  <p style="color: #94a3b8; margin: 6px 0 0 0; font-size: 13px; font-weight: 400;">Security & Account Verification</p>
                </td>
              </tr>

              <!-- Body Content -->
              <tr>
                <td style="padding: 32px 28px;">
                  <h2 style="color: #0f172a; font-size: 18px; font-weight: 600; margin: 0 0 12px 0;">Password Reset Request</h2>
                  <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">
                    Hello,<br>
                    We received a request to reset your password for your <strong>CheckMyWarranty</strong> account. Please use the 6-digit verification code below to complete your request:
                  </p>

                  <!-- OTP Card & Tap to Copy Box -->
                  <div style="background-color: #eff6ff; border: 2px dashed #93c5fd; border-radius: 10px; padding: 24px 20px; text-align: center; margin: 0 0 24px 0;">
                    <p style="color: #1e40af; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 12px 0;">Your One-Time Code</p>
                    
                    <div id="otp-code" class="otp-box" onclick="copyOtp(this, '${otp}')" style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; color: #1e3a8a; letter-spacing: 8px; user-select: all; -webkit-user-select: all; cursor: pointer; padding: 12px 24px; background: #ffffff; border: 2px solid #2563eb; border-radius: 8px; display: inline-block; margin-bottom: 12px; transition: all 0.2s ease;" title="Tap/Click code to copy">
                      ${otp}
                    </div>
                    
                    <p id="copy-status" style="color: #2563eb; font-size: 14px; font-weight: 700; margin: 4px 0 0 0; letter-spacing: 0.2px; transition: all 0.3s ease;">
                      👆 Tap/Click code to copy
                    </p>
                  </div>

                  <!-- Security & Attempt Limits Notice -->
                  <div style="background-color: #fffbebfb; border-left: 4px solid #f59e0b; border-radius: 4px; padding: 14px 16px; margin: 0 0 24px 0;">
                    <p style="color: #92400e; font-size: 13px; line-height: 1.5; margin: 0;">
                      ⚡ <strong>Important Security Information:</strong><br>
                      • Valid for <strong>5 minutes</strong> only.<br>
                      • You have a maximum of <strong>5 attempts</strong> to enter the code.<br>
                      • Entering an incorrect code more than 5 times will invalidate the OTP for security.
                    </p>
                  </div>

                  <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin: 0;">
                    If you did not request a password reset, please ignore this email or contact CheckMyWarranty support immediately if you suspect unauthorized access.
                  </p>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 24px; text-align: center;">
                  <p style="color: #64748b; font-size: 12px; font-weight: 500; margin: 0 0 6px 0;">
                    CheckMyWarranty — Warranty Management Made Simple
                  </p>
                  <p style="color: #94a3b8; font-size: 11px; margin: 0 0 4px 0;">
                    This is an automated notification. Please do not reply to this email.
                  </p>
                  <p style="color: #cbd5e1; font-size: 11px; margin: 0;">
                    &copy; ${new Date().getFullYear()} CheckMyWarranty. All rights reserved.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    `,
    sender: { name: senderName, email: senderEmail },
    to: [{ email: toEmail }],
  });
}