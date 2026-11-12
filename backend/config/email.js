
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendGroupInvitationEmail({
  to,
  groupName,
  inviterName
}) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("Resend API key is missing.");
  }

  const { data, error } = await resend.emails.send({
    from: "Spliara <onboarding@resend.dev>",
    to: [to],
    subject: `You're invited to join ${groupName} on Spliara!`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 24px;">
        <h2>You've received a group invitation!</h2>
        <p>Hello,</p>
        <p>
          ${inviterName} has invited you to join
          <strong>${groupName}</strong> on Spliara.
        </p>
        <p>Log in to Spliara to view your invitation.</p>
        <p>Happy splitting!<br>The Spliara Team</p>
      </div>
    `
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

module.exports = { sendGroupInvitationEmail };
