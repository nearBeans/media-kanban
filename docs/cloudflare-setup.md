# Cloudflare setup

## Worker secrets

Set these values as Worker secrets before using authentication and email recovery:

```powershell
# Generate a random value for BETTER_AUTH_SECRET, then enter it when prompted.
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
npx wrangler secret put BETTER_AUTH_SECRET

# Generate a different random value for the one-time initial registration code.
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
npx wrangler secret put INITIAL_SETUP_CODE

# Create a sending-only API key in Resend, restricted to the verified medikan.mofh.dev domain.
npx wrangler secret put RESEND_API_KEY

# Create a Laya API key and keep it server-side for CSV row analysis.
npx wrangler secret put LAYA_API_KEY
```

Use a randomly generated `BETTER_AUTH_SECRET` of at least 32 characters. Choose a separate, high-entropy `INITIAL_SETUP_CODE`. Never commit or paste secret values into chat. `RESEND_FROM_EMAIL` is configured as the non-secret Worker variable `Media Kanban <recovery@medikan.mofh.dev>` in `wrangler.jsonc`; verify that sender domain in Resend before sending.

For local development, create an ignored `.dev.vars` file in the project root:

```dotenv
BETTER_AUTH_SECRET=replace-with-a-random-secret-at-least-32-characters
INITIAL_SETUP_CODE=replace-with-a-separate-random-code
RESEND_API_KEY=replace-with-your-resend-api-key
LAYA_API_KEY=replace-with-your-laya-api-key
```

The Laya key is used only by the authenticated Worker proxy during CSV import. It is never sent to the browser. For each non-empty work row, the proxy sends the title and every CSV column to Laya and requests a progress status and media-type classification. The editor can review or change those suggestions before importing. CSV import/export remains usable without the key; if analysis is unavailable, set the status and media type manually. Configure the key locally in the ignored `.dev.vars` file and in production with `npx wrangler secret put LAYA_API_KEY`.

## Database and deployment

Apply pending migrations and build/deploy the Worker. Account recovery uses migrations `0004_add_account_recovery.sql` and `0005_add_email_recovery.sql`:

```powershell
npm run db:migrate:remote
npm run build
npx wrangler deploy
```

The application uses the Worker `DB` binding configured in `wrangler.jsonc`. Authentication is passkey-only; email/password sign-in is disabled.

## Account recovery

After signing in, open **復旧設定**, enter an email address, and follow the confirmation link sent to that address. The address becomes the recovery address only after it is verified.

If every passkey is lost, request a recovery code using the verified email address, then enter the emailed code under **アカウント復旧** and register a new passkey. Codes expire after 20 minutes and are single-use; only a salted hash is stored. Email requests are limited to one per minute and five per address per day. Completing recovery invalidates all existing sessions and old passkeys. If passkey registration is interrupted, the code is temporarily reserved for up to 10 minutes and can then be tried again.

Email recovery depends on the security of the mailbox and is not a separate identity-verification channel. Anyone who controls the verified mailbox can request an account recovery code.

## First account

On the deployed site, enter the `INITIAL_SETUP_CODE` and choose a display name, then complete the browser's passkey registration prompt. The initial account is claimed only after the WebAuthn registration verifies successfully. Once registration is complete, remove the setup code from the Worker:

```powershell
npx wrangler secret delete INITIAL_SETUP_CODE
```

The database also prevents another initial account from being registered after the first one is created.
