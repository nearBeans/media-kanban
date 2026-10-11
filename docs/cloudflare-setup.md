# Cloudflare setup

## Worker secrets

Set both values as Worker secrets before using authentication:

```powershell
# Generate a random value for BETTER_AUTH_SECRET, then enter it when prompted.
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
npx wrangler secret put BETTER_AUTH_SECRET

# Generate a different random value for the one-time initial registration code.
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
npx wrangler secret put INITIAL_SETUP_CODE
```

Use a randomly generated `BETTER_AUTH_SECRET` of at least 32 characters. Choose a separate, high-entropy `INITIAL_SETUP_CODE`; do not commit either value or paste them into chat.

For local development, create an ignored `.dev.vars` file in the project root:

```dotenv
BETTER_AUTH_SECRET=replace-with-a-random-secret-at-least-32-characters
INITIAL_SETUP_CODE=replace-with-a-separate-random-code
```

## Database and deployment

Apply pending migrations and build/deploy the Worker:

```powershell
npm run db:migrate:remote
npm run build
npx wrangler deploy
```

The application uses the Worker `DB` binding configured in `wrangler.jsonc`. Authentication is passkey-only; email/password sign-in is disabled.

## First account

On the deployed site, enter the `INITIAL_SETUP_CODE` and choose a display name, then complete the browser's passkey registration prompt. The initial account is claimed only after the WebAuthn registration verifies successfully. Once registration is complete, remove the setup code from the Worker:

```powershell
npx wrangler secret delete INITIAL_SETUP_CODE
```

The database also prevents another initial account from being registered after the first one is created.
