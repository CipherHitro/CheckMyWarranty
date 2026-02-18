const cron = require("node-cron");
const pool = require("../connection");
const { sendReminderEmail } = require("./brevoEmailService");
require("dotenv").config();

/**
 * Process all pending reminders whose remind_at time has arrived.
 *
 * For each reminder:
 *  1. If the document's expiry_date has already passed → mark 'expired', skip email
 *  2. Otherwise → send reminder email
 *  3. If expiry is still > 3 days away (this was the 7-day reminder) → update remind_at to expiry − 3 days
 *  4. Otherwise → mark status = 'sent' (final reminder done)
 */
async function processReminders() {
  try {
    console.log("[cron] processReminders() triggered at", new Date().toISOString());
    // Fetch all pending reminders that are due
    const { rows: dueReminders } = await pool.query(
      `SELECT 
         r.id AS reminder_id,
         r.remind_at,
         r.status,
         d.id AS document_id,
         d.original_filename,
         d.expiry_date,
         u.email AS user_email
       FROM reminders r
       JOIN documents d ON r.document_id = d.id
       JOIN users u ON r.user_id = u.id
       WHERE r.status = 'pending'
         AND r.remind_at <= NOW()`
    );

    if (dueReminders.length === 0) return;

    console.log(`[cron] Processing ${dueReminders.length} due reminder(s)…`);

    for (const reminder of dueReminders) {
      const now = new Date();
      const expiryDate = new Date(reminder.expiry_date);

      // ── Edge-case: expiry date has already passed ──
      if (expiryDate <= now) {
        await pool.query(
          `UPDATE reminders SET status = 'expired' WHERE id = $1`,
          [reminder.reminder_id]
        );
        console.log(
          `[cron] Reminder ${reminder.reminder_id}: expiry already passed — marked expired`
        );
        continue;
      }

      // ── Calculate days remaining ──
      const msPerDay = 24 * 60 * 60 * 1000;
      const daysRemaining = Math.ceil((expiryDate - now) / msPerDay);

      // ── Send the email ──
      const result = await sendReminderEmail(
        reminder.user_email,
        reminder.original_filename,
        reminder.expiry_date,
        daysRemaining
      );

      if (!result.success) {
        console.error(
          `[cron] Reminder ${reminder.reminder_id}: email failed — will retry next cycle`
        );
        continue; // leave it pending so it gets retried
      }

      // ── Decide next action ──
      if (daysRemaining > 3) {
        // This was the 7-day reminder → schedule the 3-day reminder
        const threeBeforeExpiry = new Date(expiryDate);
        threeBeforeExpiry.setDate(threeBeforeExpiry.getDate() - 3);

        await pool.query(
          `UPDATE reminders SET remind_at = $1 WHERE id = $2`,
          [threeBeforeExpiry, reminder.reminder_id]
        );
        console.log(
          `[cron] Reminder ${reminder.reminder_id}: 7-day email sent — next reminder at ${threeBeforeExpiry.toISOString()}`
        );
      } else {
        // This was the 3-day (or closer) reminder → done
        await pool.query(
          `UPDATE reminders SET status = 'sent' WHERE id = $1`,
          [reminder.reminder_id]
        );
        console.log(
          `[cron] Reminder ${reminder.reminder_id}: final reminder sent — marked 'sent'`
        );
      }
    }
  } catch (error) {
    console.error("[cron] Error processing reminders:", error.message);
  }
}

/**
 * Start the reminder cron job.
 * Runs every hour at minute 0 (e.g. 9:00, 10:00, 11:00 …).
 */
function startReminderCron() {
  // "0 * * * *" = at minute 0 of every hour
  cron.schedule("* * * * *", () => {
    console.log("[cron] Running reminder check…", new Date().toISOString());
    processReminders();
  });

  console.log("⏰ Reminder cron job started (runs every hour)");

  // Also run once immediately on server start so we don't wait up to 1 hour
  processReminders();
}

module.exports = { startReminderCron, processReminders };
