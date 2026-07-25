import prisma from "../connection.js";

/**
 * Create a reminder for a document based on its expiry date.
 * Calculates remind_at as:
 *   - 7 days before expiry if >= 7 days away
 *   - 3 days before expiry if >= 3 days away
 *   - Immediately if less than 3 days away
 * Skips if the expiry date has already passed.
 *
 * @param {bigint} userId - The user's ID
 * @param {bigint} documentId - The document's ID
 * @param {string|Date} expiryDate - The expiry date of the document
 */
async function createReminder(userId, documentId, expiryDate) {
  const now = new Date();
  const expiry = new Date(expiryDate);

  if (expiry <= now) {
    console.log(
      `[reminder] Document ${documentId}: expiry already passed — skipping reminder`
    );
    return;
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysRemaining = Math.ceil((expiry - now) / msPerDay);

  let remindAt;
  if (daysRemaining >= 7) {
    remindAt = new Date(expiry);
    remindAt.setDate(remindAt.getDate() - 7);
  } else if (daysRemaining >= 3) {
    remindAt = new Date(expiry);
    remindAt.setDate(remindAt.getDate() - 3);
  } else {
    remindAt = now;
  }

  await prisma.reminders.create({
    data: {
      user_id: userId,
      document_id: documentId,
      remind_at: remindAt,
    },
  });

  console.log(
    `[reminder] Document ${documentId}: reminder created for ${remindAt.toISOString()} (${daysRemaining} days until expiry)`
  );
}

export { createReminder };