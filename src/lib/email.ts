/**
 * Minimal transactional email sender.
 *
 * Uses Resend's HTTP API (no SDK dependency) when RESEND_API_KEY is set.
 * When it isn't, the send is skipped and the message is logged instead — so
 * local dev and an un-provisioned prod won't crash; the reset link shows up in
 * the server logs. Set RESEND_API_KEY + EMAIL_FROM to actually deliver mail.
 */
type SendArgs = { to: string; subject: string; html: string; text: string };

export async function sendEmail({ to, subject, html, text }: SendArgs): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Zarahflow <no-reply@zarah-ai.com>";

  if (!apiKey) {
    console.warn(
      `[email] RESEND_API_KEY not set — not sending "${subject}" to ${to}.\n` +
        `[email] Message body (plain text):\n${text}`,
    );
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html, text }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Email send failed (${res.status}): ${body}`);
  }
}

/** Branded HTML for the password-reset email. */
export function passwordResetEmail(name: string, url: string) {
  const safeName = name || "there";
  return {
    subject: "Reset your Zarahflow password",
    text:
      `Hi ${safeName},\n\n` +
      `We received a request to reset your Zarahflow password. ` +
      `Open the link below to choose a new one. It expires in 1 hour.\n\n` +
      `${url}\n\n` +
      `If you didn't request this, you can safely ignore this email — your password won't change.`,
    html: `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
  <h2 style="margin:0 0 16px;font-size:20px">Reset your password</h2>
  <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#334155">
    Hi ${safeName}, we received a request to reset your Zarahflow password.
    Click the button below to choose a new one. This link expires in 1 hour.
  </p>
  <p style="margin:0 0 24px">
    <a href="${url}" style="display:inline-block;background:#e8590c;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:8px">
      Reset password
    </a>
  </p>
  <p style="margin:0 0 8px;font-size:12px;color:#64748b">Or paste this link into your browser:</p>
  <p style="margin:0 0 24px;font-size:12px;word-break:break-all"><a href="${url}" style="color:#e8590c">${url}</a></p>
  <p style="margin:0;font-size:12px;color:#94a3b8">
    If you didn't request this, you can safely ignore this email — your password won't change.
  </p>
</div>`,
  };
}
