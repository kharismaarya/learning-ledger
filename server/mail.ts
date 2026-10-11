/* Sending email: a placeholder until there's an email service (for example Resend or Postmark).

   Two features are waiting on this:
   - Email verification: after sign-up, email a link holding a one-time token. Opening it sets users.email_verified_at.
     Once that exists, unverified accounts could be limited, and an account can safely be matched to an email address.
   - Password reset: email a short-lived one-time token. Using it sets a new password_hash and calls
     deleteSessionsForUser (server/db.ts), so anyone holding an old session is signed out.
   Both tokens should be stored hashed, like sessions are (hashToken in auth.ts), in a table with an expiry.

   Until then, this only prints the message on the server's console, which is enough for local testing. */
export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export async function sendMail(mail: Mail): Promise<void> {
  console.log(`[mail not sent: no email service yet] To: ${mail.to} | ${mail.subject}\n${mail.text}`);
}
