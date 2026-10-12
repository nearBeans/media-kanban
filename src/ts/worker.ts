import { betterAuth } from "better-auth";
import { passkey } from "@better-auth/passkey";

interface Env {
    DB: D1Database;
    ASSETS: { fetch(request: Request): Promise<Response> };
    BETTER_AUTH_SECRET?: string;
    INITIAL_SETUP_CODE?: string;
    RESEND_API_KEY?: string;
    RESEND_FROM_EMAIL?: string;
}

interface RegistrationToken {
    tokenHash: string;
    userId: string;
    name: string;
}

interface RecoveryCode {
    id: string;
    userId: string;
    salt: string;
    codeHash: string;
    expiresAt: string | null;
}

interface RecoveryEmail {
    email: string | null;
    pendingEmail: string | null;
    verifiedAt: string | null;
}

interface RecoveryChallenge {
    userId: string;
    userName: string;
    recoveryCodeId: string;
}

type CardStatus = "yet" | "now" | "done" | "stop";
type CardTag = "マンガ" | "アニメ" | "ラノベ" | "ゲーム";

const recoveryContextPrefix = "recovery:";

interface CardRow {
    id: string;
    title: string;
    status: CardStatus;
    position: number;
}

interface CardOrder {
    id: string;
    status: CardStatus;
    position: number;
}

const cardStatuses = new Set<CardStatus>(["yet", "now", "done", "stop"]);
const cardTags = new Set<CardTag>(["マンガ", "アニメ", "ラノベ", "ゲーム"]);
const cardStatusOrder: CardStatus[] = ["yet", "now", "done", "stop"];

function json(data: unknown, status = 200): Response {
    return Response.json(data, { status });
}

function createAuth(env: Env, origin: string) {
    if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) {
        throw new Error("BETTER_AUTH_SECRET must be configured with at least 32 characters.");
    }

    return betterAuth({
        appName: "Media Kanban",
        baseURL: origin,
        trustedOrigins: [origin],
        secret: env.BETTER_AUTH_SECRET,
        database: env.DB,
        emailAndPassword: { enabled: false },
        plugins: [
            passkey({
                rpID: new URL(origin).hostname,
                rpName: "Media Kanban",
                origin,
                registration: {
                    requireSession: false,
                    resolveUser: async ({ context }) => {
                        if (context?.startsWith(recoveryContextPrefix)) {
                            const recovery = await getRecoveryChallenge(env, context);
                            return {
                                id: recovery.userId,
                                name: recovery.userName,
                                displayName: recovery.userName,
                            };
                        }
                        const registration = await getRegistrationToken(env, context);
                        return {
                            id: registration.userId,
                            name: registration.name,
                            displayName: registration.name,
                        };
                    },
                    afterVerification: async ({ context, user }) => {
                        if (context?.startsWith(recoveryContextPrefix)) {
                            await completeRecovery(env, context, user.id);
                            return { userId: user.id, name: user.name };
                        }
                        const registration = await getRegistrationToken(env, context);
                        if (registration.userId !== user.id) {
                            throw new Error("The initial registration token does not match the verified user.");
                        }
                        const createdAt = new Date().toISOString();
                        const email = `${user.id}@passkey.media-kanban.invalid`;
                        const results = await env.DB.batch([
                            env.DB.prepare(
                                `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
                                 SELECT user_id, name, ?, 1, ?, ?
                                 FROM registration_tokens
                                 WHERE token_hash = ? AND user_id = ?
                                   AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                                   AND NOT EXISTS (SELECT 1 FROM registration_state WHERE id = 'initial')
                                   AND NOT EXISTS (SELECT 1 FROM "user")`,
                            ).bind(email, createdAt, createdAt, registration.tokenHash, user.id),
                            env.DB.prepare(
                                `INSERT INTO registration_state (id, userId)
                                 SELECT 'initial', id FROM "user"
                                 WHERE id = ? AND NOT EXISTS (
                                     SELECT 1 FROM registration_state WHERE id = 'initial'
                                 )`,
                            ).bind(user.id),
                            env.DB.prepare(
                                `DELETE FROM registration_tokens
                                 WHERE token_hash = ? AND user_id = ?
                                   AND EXISTS (
                                       SELECT 1 FROM registration_state
                                       WHERE id = 'initial' AND userId = ?
                                   )`,
                            ).bind(registration.tokenHash, user.id, user.id),
                        ]);

                        if (
                            results[0]?.meta.changes !== 1 ||
                            results[1]?.meta.changes !== 1 ||
                            results[2]?.meta.changes !== 1
                        ) {
                            throw new Error("Initial account registration has already been completed.");
                        }
                        return { userId: user.id };
                    },
                },
            }),
        ],
    });
}

function parseRegistrationContext(value: unknown): { code: string; name: string } | Response {
    if (typeof value !== "object" || value === null ||
        !("code" in value) || typeof value.code !== "string" ||
        !("name" in value) || typeof value.name !== "string") {
        return json({ error: "A registration code and display name are required." }, 400);
    }

    const name = value.name.trim();
    if (!name || name.length > 60 || value.code.length > 256) {
        return json({ error: "The display name or registration code is invalid." }, 400);
    }
    return { code: value.code, name };
}

async function hashRegistrationToken(token: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomHex(byteCount: number): string {
    return Array.from(
        crypto.getRandomValues(new Uint8Array(byteCount)),
        (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
}

async function hashRecoveryCode(salt: string, code: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(`${salt}:${code}`),
    );
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeRecoveryCode(value: string): string {
    return value.replace(/[\s-]/g, "").toLowerCase();
}

function formatRecoveryCode(code: string): string {
    return code.match(/.{1,4}/g)?.join("-") ?? code;
}

async function getRecoveryChallenge(env: Env, context: string): Promise<RecoveryChallenge> {
    const token = context.slice(recoveryContextPrefix.length);
    if (!/^[0-9a-f]{64}$/.test(token)) {
        throw new Error("The recovery request is invalid or expired.");
    }
    const contextHash = await hashRegistrationToken(token);
    const challenge = await env.DB.prepare(
        `SELECT recovery_challenges.user_id AS userId, "user".name AS userName,
                recovery_challenges.recovery_code_id AS recoveryCodeId
         FROM recovery_challenges
         INNER JOIN recovery_codes
           ON recovery_codes.id = recovery_challenges.recovery_code_id
         INNER JOIN "user" ON "user".id = recovery_challenges.user_id
         WHERE recovery_challenges.context_hash = ?
           AND recovery_challenges.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           AND recovery_codes.reserved_by = recovery_challenges.context_hash
           AND recovery_codes.reserved_until > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           AND (recovery_codes.expires_at IS NULL OR
                recovery_codes.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
           AND recovery_codes.consumed_at IS NULL
         LIMIT 1`,
    ).bind(contextHash).first<RecoveryChallenge>();
    if (!challenge) {
        throw new Error("The recovery request is invalid or expired.");
    }
    return challenge;
}

async function completeRecovery(env: Env, context: string, userId: string): Promise<void> {
    const recovery = await getRecoveryChallenge(env, context);
    if (recovery.userId !== userId) {
        throw new Error("The recovery request does not match the account.");
    }
    const token = context.slice(recoveryContextPrefix.length);
    const contextHash = await hashRegistrationToken(token);
    const completedAt = new Date().toISOString();
    const results = await env.DB.batch([
        env.DB.prepare(
            `UPDATE recovery_codes
             SET consumed_at = ?, reserved_by = NULL, reserved_until = NULL
             WHERE id = ? AND user_id = ? AND reserved_by = ? AND consumed_at IS NULL
               AND reserved_until > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
               AND (expires_at IS NULL OR expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
               AND EXISTS (
                   SELECT 1 FROM recovery_challenges
                   WHERE context_hash = ? AND user_id = ? AND recovery_code_id = ?
                     AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
               )`,
        ).bind(completedAt, recovery.recoveryCodeId, userId, contextHash, contextHash, userId, recovery.recoveryCodeId),
        env.DB.prepare(
            `DELETE FROM passkey WHERE userId = ?
             AND EXISTS (SELECT 1 FROM recovery_codes WHERE id = ? AND consumed_at = ?)`,
        ).bind(userId, recovery.recoveryCodeId, completedAt),
        env.DB.prepare(
            `DELETE FROM session WHERE userId = ?
             AND EXISTS (SELECT 1 FROM recovery_codes WHERE id = ? AND consumed_at = ?)`,
        ).bind(userId, recovery.recoveryCodeId, completedAt),
        env.DB.prepare(
            `DELETE FROM recovery_codes WHERE user_id = ? AND id != ?
             AND EXISTS (SELECT 1 FROM recovery_codes WHERE id = ? AND consumed_at = ?)`,
        ).bind(userId, recovery.recoveryCodeId, recovery.recoveryCodeId, completedAt),
        env.DB.prepare(
            `DELETE FROM recovery_challenges WHERE user_id = ?
             AND EXISTS (SELECT 1 FROM recovery_codes WHERE id = ? AND consumed_at = ?)`,
        ).bind(userId, recovery.recoveryCodeId, completedAt),
        env.DB.prepare(
            "DELETE FROM recovery_codes WHERE id = ? AND user_id = ? AND consumed_at = ?",
        ).bind(recovery.recoveryCodeId, userId, completedAt),
    ]);
    if (results[0]?.meta.changes !== 1 || (results[4]?.meta.changes ?? 0) < 1 ||
        results[5]?.meta.changes !== 1) {
        throw new Error("The recovery code has already been used or has expired.");
    }
}

async function startRecovery(request: Request, env: Env): Promise<Response> {
    const body: unknown = await request.json().catch(() => null);
    if (typeof body !== "object" || body === null ||
        !("email" in body) || typeof body.email !== "string" ||
        !("code" in body) || typeof body.code !== "string" || body.code.length > 64) {
        return json({ error: "メールアドレスと復旧コードを入力してください。" }, 400);
    }
    const email = body.email.trim().toLowerCase();
    const code = normalizeRecoveryCode(body.code);
    if (!isValidEmail(email) || !/^[0-9a-f]{32}$/.test(code)) {
        return json({ error: "復旧コードが正しくありません。" }, 401);
    }

    const account = await env.DB.prepare(
        `SELECT user_id AS userId FROM recovery_emails
         WHERE email = ? COLLATE NOCASE AND verified_at IS NOT NULL`,
    ).bind(email).first<{ userId: string }>();
    if (!account) {
        return json({ error: "復旧コードが正しくないか、すでに使用されています。" }, 401);
    }
    const candidates = await env.DB.prepare(
        `SELECT id, user_id AS userId, salt, code_hash AS codeHash, expires_at AS expiresAt
         FROM recovery_codes
         WHERE user_id = ? AND consumed_at IS NULL
           AND (expires_at IS NULL OR expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
           AND (reserved_by IS NULL OR reserved_until <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
    ).bind(account.userId).all<RecoveryCode>();
    let matched: RecoveryCode | undefined;
    for (const candidate of candidates.results) {
        if (constantTimeEquals(await hashRecoveryCode(candidate.salt, code), candidate.codeHash)) {
            matched = candidate;
        }
    }
    if (!matched) {
        return json({ error: "復旧コードが正しくないか、すでに使用されています。" }, 401);
    }

    const token = randomHex(32);
    const contextHash = await hashRegistrationToken(token);
    const reservedUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const results = await env.DB.batch([
        env.DB.prepare(
            `DELETE FROM recovery_challenges
             WHERE recovery_code_id = ? AND expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
        ).bind(matched.id),
        env.DB.prepare(
            `UPDATE recovery_codes
             SET reserved_by = ?, reserved_until = ?
             WHERE id = ? AND user_id = ? AND consumed_at IS NULL
               AND (expires_at IS NULL OR expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
               AND (reserved_by IS NULL OR reserved_until <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
        ).bind(contextHash, reservedUntil, matched.id, matched.userId),
        env.DB.prepare(
            `INSERT INTO recovery_challenges (context_hash, user_id, recovery_code_id, expires_at)
             SELECT ?, ?, ?, ?
             WHERE EXISTS (
                 SELECT 1 FROM recovery_codes
                 WHERE id = ? AND user_id = ? AND reserved_by = ? AND consumed_at IS NULL
             )`,
        ).bind(contextHash, matched.userId, matched.id, reservedUntil, matched.id, matched.userId, contextHash),
    ]);
    if (results[1]?.meta.changes !== 1 || results[2]?.meta.changes !== 1) {
        return json({ error: "復旧コードがすでに使用中です。時間をおいて再度お試しください。" }, 409);
    }
    return json({ context: `${recoveryContextPrefix}${token}` });
}

async function sendEmail(
    env: Env,
    to: string,
    subject: string,
    text: string,
): Promise<void> {
    if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
        throw new Error("Email delivery is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL.");
    }
    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: env.RESEND_FROM_EMAIL, to: [to], subject, text }),
    });
    if (!response.ok) {
        throw new Error(`Resend email delivery failed with status ${response.status}.`);
    }
}

async function reserveEmailDelivery(
    env: Env,
    email: string,
    purpose: "verification" | "recovery",
): Promise<boolean> {
    const now = new Date();
    const timestamp = now.toISOString();
    const dailyCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const recentCutoff = new Date(now.getTime() - 60 * 1000).toISOString();
    const results = await env.DB.batch([
        env.DB.prepare("DELETE FROM recovery_email_deliveries WHERE created_at <= ?").bind(dailyCutoff),
        env.DB.prepare(
            `INSERT INTO recovery_email_deliveries (id, email, purpose, created_at)
             SELECT ?, ?, ?, ?
             WHERE (
                 SELECT COUNT(*) FROM recovery_email_deliveries
                 WHERE email = ? AND purpose = ? AND created_at > ?
             ) < 5
             AND NOT EXISTS (
                 SELECT 1 FROM recovery_email_deliveries
                 WHERE email = ? AND purpose = ? AND created_at > ?
             )`,
        ).bind(
            crypto.randomUUID(),
            email,
            purpose,
            timestamp,
            email,
            purpose,
            dailyCutoff,
            email,
            purpose,
            recentCutoff,
        ),
    ]);
    return results[1]?.meta.changes === 1;
}

function isValidEmail(value: string): boolean {
    return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function getRecoveryEmailStatus(env: Env, userId: string): Promise<Response> {
    const row = await env.DB.prepare(
        `SELECT email, pending_email AS pendingEmail, verified_at AS verifiedAt
         FROM recovery_emails WHERE user_id = ?`,
    ).bind(userId).first<RecoveryEmail>();
    return json({
        email: row?.email ?? null,
        pendingEmail: row?.pendingEmail ?? null,
        verified: Boolean(row?.email && row.verifiedAt),
    });
}

async function requestRecoveryEmailVerification(
    request: Request,
    env: Env,
    userId: string,
    origin: string,
): Promise<Response> {
    const body: unknown = await request.json().catch(() => null);
    if (typeof body !== "object" || body === null ||
        !("email" in body) || typeof body.email !== "string") {
        return json({ error: "メールアドレスを入力してください。" }, 400);
    }
    const email = body.email.trim().toLowerCase();
    if (!isValidEmail(email)) {
        return json({ error: "有効なメールアドレスを入力してください。" }, 400);
    }

    const existing = await env.DB.prepare(
        `SELECT user_id FROM recovery_emails
         WHERE (email = ? COLLATE NOCASE OR pending_email = ? COLLATE NOCASE)
           AND user_id != ? LIMIT 1`,
    ).bind(email, email, userId).first<{ user_id: string }>();
    if (existing) {
        return json({ error: "このメールアドレスは別のアカウントですでに使用されています。" }, 409);
    }
    if (!await reserveEmailDelivery(env, email, "verification")) {
        return json({ error: "確認メールは1分後に再送できます。1日あたりの送信上限は5通です。" }, 429);
    }

    const token = randomHex(32);
    const tokenHash = await hashRegistrationToken(token);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const saved = await env.DB.prepare(
        `INSERT INTO recovery_emails (
            user_id, pending_email, verification_token_hash, verification_expires_at, updated_at
         ) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
            pending_email = excluded.pending_email,
            verification_token_hash = excluded.verification_token_hash,
            verification_expires_at = excluded.verification_expires_at,
            updated_at = excluded.updated_at
         WHERE NOT EXISTS (
            SELECT 1 FROM recovery_emails
            WHERE (email = ? COLLATE NOCASE OR pending_email = ? COLLATE NOCASE)
              AND user_id != ?
         )`,
    ).bind(userId, email, tokenHash, expiresAt, new Date().toISOString(), email, email, userId).run();
    if (saved.meta.changes !== 1) {
        return json({ error: "このメールアドレスは別のアカウントですでに使用されています。" }, 409);
    }

    const verificationUrl = new URL("/", origin);
    verificationUrl.searchParams.set("verify-recovery-email", token);
    await sendEmail(
        env,
        email,
        "Media Kanbanの復旧用メールアドレスを確認",
        `復旧用メールアドレスを登録するリクエストを受け付けました。\n\n` +
            `次のリンクを開き、確認ボタンを押して登録を完了してください。\n` +
            `${verificationUrl.toString()}\n\nこのリンクは30分で期限切れになります。`,
    );
    return json({ message: "確認メールを送信しました。メール内のリンクを開いて登録を完了してください。" });
}

async function verifyRecoveryEmail(request: Request, env: Env): Promise<Response> {
    const body: unknown = await request.json().catch(() => null);
    if (typeof body !== "object" || body === null ||
        !("token" in body) || typeof body.token !== "string" ||
        !/^[0-9a-f]{64}$/.test(body.token)) {
        return json({ error: "確認リンクが無効か、期限切れです。" }, 400);
    }
    const tokenHash = await hashRegistrationToken(body.token);
    const pending = await env.DB.prepare(
        `SELECT pending_email AS email FROM recovery_emails
         WHERE verification_token_hash = ? AND pending_email IS NOT NULL
           AND verification_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    ).bind(tokenHash).first<{ email: string }>();
    if (!pending) {
        return json({ error: "確認リンクが無効か、期限切れです。" }, 400);
    }
    const result = await env.DB.prepare(
        `UPDATE recovery_emails
         SET email = pending_email, pending_email = NULL, verified_at = ?,
             verification_token_hash = NULL, verification_expires_at = NULL,
             updated_at = ?
         WHERE verification_token_hash = ? AND pending_email IS NOT NULL
           AND verification_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           AND NOT EXISTS (
               SELECT 1 FROM recovery_emails AS other
               WHERE other.user_id != recovery_emails.user_id
                 AND other.email = recovery_emails.pending_email COLLATE NOCASE
           )`,
    ).bind(new Date().toISOString(), new Date().toISOString(), tokenHash).run();
    if (result.meta.changes !== 1) {
        return json({ error: "確認リンクが無効か、期限切れです。" }, 400);
    }
    return json({ success: true, email: pending.email });
}

const genericRecoveryEmailMessage =
    "登録済みの復旧用メールアドレスに一致する場合、コードの送信を受け付けました。届かない場合は時間をおいて再度お試しください。";

async function requestRecoveryCodeByEmail(request: Request, env: Env): Promise<Response> {
    const body: unknown = await request.json().catch(() => null);
    if (typeof body !== "object" || body === null ||
        !("email" in body) || typeof body.email !== "string") {
        return json({ error: "メールアドレスを入力してください。" }, 400);
    }
    const email = body.email.trim().toLowerCase();
    if (!isValidEmail(email)) {
        return json({ error: "有効なメールアドレスを入力してください。" }, 400);
    }

    const account = await env.DB.prepare(
        `SELECT recovery_emails.user_id AS userId, "user".name AS userName
         FROM recovery_emails
         INNER JOIN "user" ON "user".id = recovery_emails.user_id
         WHERE recovery_emails.email = ? COLLATE NOCASE
           AND recovery_emails.verified_at IS NOT NULL
         LIMIT 1`,
    ).bind(email).first<{ userId: string; userName: string }>();
    if (!account || !await reserveEmailDelivery(env, email, "recovery")) {
        return json({ message: genericRecoveryEmailMessage }, 202);
    }

    await env.DB.prepare(
        `DELETE FROM recovery_codes WHERE user_id = ? AND consumed_at IS NULL
         AND expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    ).bind(account.userId).run();
    const code = randomHex(16);
    const salt = randomHex(16);
    const codeId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();
    await env.DB.prepare(
        `INSERT INTO recovery_codes (id, user_id, salt, code_hash, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
    ).bind(codeId, account.userId, salt, await hashRecoveryCode(salt, code), expiresAt).run();
    try {
        await sendEmail(
            env,
            email,
            "Media Kanbanのアカウント復旧コード",
            `Media Kanbanのアカウント復旧リクエストを受け付けました。\n\n` +
                `復旧コード: ${formatRecoveryCode(code)}\n\n` +
                `このコードは20分間有効で、一度だけ使用できます。` +
                `心当たりがない場合は、このメールを無視してください。`,
        );
    } catch (error) {
        await env.DB.prepare("DELETE FROM recovery_codes WHERE id = ? AND consumed_at IS NULL")
            .bind(codeId).run();
        console.error("Recovery email delivery failed.", error);
        return json({ message: genericRecoveryEmailMessage }, 202);
    }
    return json({ message: genericRecoveryEmailMessage }, 202);
}

async function getRegistrationToken(
    env: Env,
    context: string | null | undefined,
): Promise<RegistrationToken> {
    if (!context) {
        throw new Error("A valid initial registration token is required.");
    }

    const tokenHash = await hashRegistrationToken(context);
    const registration = await env.DB.prepare(
        `SELECT token_hash AS tokenHash, user_id AS userId, name
         FROM registration_tokens
         WHERE token_hash = ? AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           AND NOT EXISTS (SELECT 1 FROM registration_state WHERE id = 'initial')
         LIMIT 1`,
    ).bind(tokenHash).first<RegistrationToken>();
    if (!registration) {
        throw new Error("The initial registration token is invalid or expired.");
    }
    return registration;
}

function constantTimeEquals(candidate: string, expected: string): boolean {
    const length = Math.max(candidate.length, expected.length);
    let difference = candidate.length ^ expected.length;
    for (let index = 0; index < length; index++) {
        difference |= (candidate.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
    }
    return difference === 0;
}

async function createRegistrationToken(request: Request, env: Env): Promise<Response> {
    const expectedCode = env.INITIAL_SETUP_CODE;
    if (!expectedCode) {
        return json({ error: "Initial account registration is disabled." }, 403);
    }

    const body: unknown = await request.json().catch(() => null);
    const registration = parseRegistrationContext(body);
    if (registration instanceof Response) {
        return registration;
    }
    if (!constantTimeEquals(registration.code, expectedCode)) {
        return json({ error: "The initial registration code is invalid." }, 403);
    }

    const state = await env.DB.prepare(
        `SELECT id FROM registration_state WHERE id = 'initial'
         UNION ALL SELECT id FROM "user" LIMIT 1`,
    ).first();
    if (state) {
        return json({ error: "Initial account registration has already been completed." }, 409);
    }

    const token = randomHex(32);
    const tokenHash = await hashRegistrationToken(token);
    const userId = crypto.randomUUID();
    const result = await env.DB.prepare(
        `INSERT INTO registration_tokens (token_hash, user_id, name, expires_at)
         SELECT ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+10 minutes')
         WHERE NOT EXISTS (SELECT 1 FROM registration_state WHERE id = 'initial')
           AND NOT EXISTS (SELECT 1 FROM "user")`,
    ).bind(tokenHash, userId, registration.name).run();
    if (result.meta.changes !== 1) {
        return json({ error: "Initial account registration has already been completed." }, 409);
    }
    return json({ context: token });
}

async function getSessionUser(
    request: Request,
    env: Env,
): Promise<{ id: string; name: string } | Response> {
    const auth = createAuth(env, new URL(request.url).origin);
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
        return json({ error: "Authentication required." }, 401);
    }
    return { id: session.user.id, name: session.user.name };
}

async function getBoardId(env: Env, userId: string): Promise<string> {
    const existing = await env.DB.prepare(
        "SELECT id FROM boards WHERE owner_user_id = ? LIMIT 1",
    ).bind(userId).first<{ id: string }>();
    if (existing) {
        return existing.id;
    }

    const id = crypto.randomUUID();
    await env.DB.prepare(
        `INSERT OR IGNORE INTO boards (id, owner_user_id, name)
         VALUES (?, ?, 'Media Kanban')`,
    ).bind(id, userId).run();

    const board = await env.DB.prepare(
        "SELECT id FROM boards WHERE owner_user_id = ? LIMIT 1",
    ).bind(userId).first<{ id: string }>();
    if (!board) {
        throw new Error("The user's board could not be created.");
    }
    return board.id;
}

async function getCards(env: Env, user: { id: string; name: string }): Promise<Response> {
    const boardId = await getBoardId(env, user.id);
    const cardRows = await env.DB.prepare(
        `SELECT cards.id, cards.title, cards.status, cards.position
         FROM cards
         INNER JOIN boards ON boards.id = cards.board_id
         WHERE boards.id = ? AND boards.owner_user_id = ?
         ORDER BY cards.status, cards.position, cards.created_at`,
    ).bind(boardId, user.id).all<CardRow>();

    const tagRows = await env.DB.prepare(
        `SELECT card_tags.card_id AS cardId, card_tags.tag
         FROM card_tags
         INNER JOIN cards ON cards.id = card_tags.card_id
         INNER JOIN boards ON boards.id = cards.board_id
         WHERE boards.id = ? AND boards.owner_user_id = ?`,
    ).bind(boardId, user.id).all<{ cardId: string; tag: CardTag }>();
    const tagsByCard = new Map<string, CardTag[]>();
    for (const row of tagRows.results) {
        const tags = tagsByCard.get(row.cardId) ?? [];
        tags.push(row.tag);
        tagsByCard.set(row.cardId, tags);
    }

    return json({
        user,
        cards: cardRows.results.map((card) => ({ ...card, tags: tagsByCard.get(card.id) ?? [] })),
    });
}

async function addCard(request: Request, env: Env, userId: string): Promise<Response> {
    const body: unknown = await request.json().catch(() => null);
    if (typeof body !== "object" || body === null) {
        return json({ error: "A JSON request body is required." }, 400);
    }

    if (!("title" in body) || typeof body.title !== "string") {
        return json({ error: "A card title is required." }, 400);
    }
    const title = body.title.trim();
    if (!title || title.length > 100) {
        return json({ error: "The title must contain between 1 and 100 characters." }, 400);
    }
    if (!("status" in body) || typeof body.status !== "string" || !cardStatuses.has(body.status as CardStatus)) {
        return json({ error: "A valid card status is required." }, 400);
    }
    if (!("tags" in body) || !Array.isArray(body.tags) || body.tags.length === 0 ||
        !body.tags.every((tag: unknown) => typeof tag === "string" && cardTags.has(tag as CardTag))) {
        return json({ error: "Select at least one valid tag." }, 400);
    }

    const tags = [...new Set(body.tags as CardTag[])];
    const boardId = await getBoardId(env, userId);
    const positionRow = await env.DB.prepare(
        "SELECT COALESCE(MAX(position), -1) + 1 AS position FROM cards WHERE board_id = ? AND status = ?",
    ).bind(boardId, body.status).first<{ position: number }>();
    if (!positionRow) {
        throw new Error("A position for the new card could not be calculated.");
    }

    const cardId = crypto.randomUUID();
    const statements = [
        env.DB.prepare(
            `INSERT INTO cards (id, board_id, title, status, position)
             SELECT ?, id, ?, ?, ?
             FROM boards WHERE id = ? AND owner_user_id = ?`,
        ).bind(cardId, title, body.status, positionRow.position, boardId, userId),
        ...tags.map((tag) => env.DB.prepare(
            "INSERT INTO card_tags (card_id, tag) VALUES (?, ?)",
        ).bind(cardId, tag)),
    ];
    const results = await env.DB.batch(statements);
    if (results[0]?.meta.changes !== 1) {
        throw new Error("The card could not be added to the user's board.");
    }

    return json({
        id: cardId,
        title,
        status: body.status,
        position: positionRow.position,
        tags,
    }, 201);
}

async function updateCard(
    request: Request,
    env: Env,
    userId: string,
    cardId: string,
): Promise<Response> {
    const body: unknown = await request.json().catch(() => null);
    if (typeof body !== "object" || body === null) {
        return json({ error: "A JSON request body is required." }, 400);
    }
    if (!("title" in body) || typeof body.title !== "string") {
        return json({ error: "A card title is required." }, 400);
    }
    const title = body.title.trim();
    if (!title || title.length > 100) {
        return json({ error: "The title must contain between 1 and 100 characters." }, 400);
    }
    if (!("status" in body) || typeof body.status !== "string" || !cardStatuses.has(body.status as CardStatus)) {
        return json({ error: "A valid card status is required." }, 400);
    }
    if (!("tags" in body) || !Array.isArray(body.tags) || body.tags.length === 0 ||
        !body.tags.every((tag: unknown) => typeof tag === "string" && cardTags.has(tag as CardTag))) {
        return json({ error: "Select at least one valid tag." }, 400);
    }

    const status = body.status as CardStatus;
    const tags = [...new Set(body.tags as CardTag[])];
    const boardId = await getBoardId(env, userId);
    const existingCard = await env.DB.prepare(
        `SELECT cards.status, cards.position
         FROM cards
         INNER JOIN boards ON boards.id = cards.board_id
         WHERE cards.id = ? AND boards.id = ? AND boards.owner_user_id = ?`,
    ).bind(cardId, boardId, userId).first<{ status: CardStatus; position: number }>();
    if (!existingCard) {
        return json({ error: "Card not found." }, 404);
    }

    let position = existingCard.position;
    if (status !== existingCard.status) {
        const positionRow = await env.DB.prepare(
            "SELECT COALESCE(MAX(position), -1) + 1 AS position FROM cards WHERE board_id = ? AND status = ?",
        ).bind(boardId, status).first<{ position: number }>();
        if (!positionRow) {
            throw new Error("A position for the updated card could not be calculated.");
        }
        position = positionRow.position;
    }

    const results = await env.DB.batch([
        env.DB.prepare(
            `UPDATE cards
             SET title = ?, status = ?, position = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ? AND board_id = ?`,
        ).bind(title, status, position, cardId, boardId),
        env.DB.prepare("DELETE FROM card_tags WHERE card_id = ?").bind(cardId),
        ...tags.map((tag) => env.DB.prepare(
            "INSERT INTO card_tags (card_id, tag) VALUES (?, ?)",
        ).bind(cardId, tag)),
    ]);
    if (results[0]?.meta.changes !== 1) {
        return json({ error: "Card not found." }, 404);
    }

    return json({ id: cardId, title, status, position, tags });
}

async function deleteCard(env: Env, userId: string, cardId: string): Promise<Response> {
    const boardId = await getBoardId(env, userId);
    const result = await env.DB.prepare(
        `DELETE FROM cards
         WHERE id = ? AND board_id = ?
           AND EXISTS (
               SELECT 1 FROM boards
               WHERE boards.id = cards.board_id AND boards.owner_user_id = ?
           )`,
    ).bind(cardId, boardId, userId).run();
    if (result.meta.changes !== 1) {
        return json({ error: "Card not found." }, 404);
    }
    return json({ success: true });
}

async function reorderCards(request: Request, env: Env, userId: string): Promise<Response> {
    const body: unknown = await request.json().catch(() => null);
    if (typeof body !== "object" || body === null || !("cards" in body) || !Array.isArray(body.cards)) {
        return json({ error: "A cards array is required." }, 400);
    }
    if (body.cards.length > 500) {
        return json({ error: "A board cannot contain more than 500 cards." }, 400);
    }

    const orders: CardOrder[] = [];
    const seen = new Set<string>();
    for (const item of body.cards) {
        if (
            typeof item !== "object" ||
            item === null ||
            !("id" in item) ||
            typeof item.id !== "string" ||
            !("status" in item) ||
            typeof item.status !== "string" ||
            !cardStatuses.has(item.status as CardStatus) ||
            !("position" in item) ||
            typeof item.position !== "number" ||
            !Number.isInteger(item.position) ||
            item.position < 0 ||
            seen.has(item.id)
        ) {
            return json({ error: "The cards array contains an invalid order." }, 400);
        }
        seen.add(item.id);
        orders.push({ id: item.id, status: item.status as CardStatus, position: item.position });
    }

    const boardId = await getBoardId(env, userId);
    const currentCards = await env.DB.prepare(
        `SELECT cards.id FROM cards
         INNER JOIN boards ON boards.id = cards.board_id
         WHERE boards.id = ? AND boards.owner_user_id = ?`,
    ).bind(boardId, userId).all<{ id: string }>();
    if (
        currentCards.results.length !== orders.length ||
        currentCards.results.some((card) => !seen.has(card.id))
    ) {
        return json({ error: "The board changed. Reload it before saving the new order." }, 409);
    }

    const statements = orders.map((card) => env.DB.prepare(
        `UPDATE cards
         SET status = ?, position = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND board_id = ?`,
    ).bind(card.status, card.position, card.id, boardId));
    if (statements.length > 0) {
        const results = await env.DB.batch(statements);
        if (results.some((result) => result.meta.changes !== 1)) {
            throw new Error("One or more card positions could not be saved.");
        }
    }
    return json({ success: true });
}

async function handleApi(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/setup-status" && request.method === "GET") {
        const state = await env.DB.prepare(
            `SELECT id FROM registration_state WHERE id = 'initial'
             UNION ALL SELECT id FROM "user" LIMIT 1`,
        ).first();
        return json({ initialRegistrationAvailable: !state && Boolean(env.INITIAL_SETUP_CODE) });
    }

    if (request.method !== "GET" && request.headers.get("origin") !== url.origin) {
        return json({ error: "Requests must come from this application's origin." }, 403);
    }

    if (url.pathname === "/api/registration/context" && request.method === "POST") {
        return createRegistrationToken(request, env);
    }

    if (url.pathname === "/api/recovery/start" && request.method === "POST") {
        return startRecovery(request, env);
    }

    if (url.pathname === "/api/recovery/email-code" && request.method === "POST") {
        return requestRecoveryCodeByEmail(request, env);
    }

    if (url.pathname === "/api/recovery-email/verify" && request.method === "POST") {
        return verifyRecoveryEmail(request, env);
    }

    if (url.pathname === "/api/recovery-email" &&
        (request.method === "GET" || request.method === "POST")) {
        const user = await getSessionUser(request, env);
        if (user instanceof Response) {
            return user;
        }
        if (request.method === "GET") {
            return getRecoveryEmailStatus(env, user.id);
        }
        return requestRecoveryEmailVerification(request, env, user.id, url.origin);
    }

    if (url.pathname === "/api/cards" && (request.method === "GET" || request.method === "POST")) {
        const user = await getSessionUser(request, env);
        if (user instanceof Response) {
            return user;
        }
        if (request.method === "GET") {
            return getCards(env, user);
        }
        return addCard(request, env, user.id);
    }

    const cardMatch = /^\/api\/cards\/([0-9a-f-]{36})$/i.exec(url.pathname);
    if (cardMatch && (request.method === "PUT" || request.method === "DELETE")) {
        const user = await getSessionUser(request, env);
        if (user instanceof Response) {
            return user;
        }
        const cardId = cardMatch[1];
        if (!cardId) {
            return json({ error: "Card not found." }, 404);
        }
        return request.method === "PUT"
            ? updateCard(request, env, user.id, cardId)
            : deleteCard(env, user.id, cardId);
    }

    if (url.pathname === "/api/cards/order" && request.method === "PUT") {
        const user = await getSessionUser(request, env);
        if (user instanceof Response) {
            return user;
        }
        return reorderCards(request, env, user.id);
    }

    return json({ error: "Not found." }, 404);
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        try {
            if (url.pathname.startsWith("/api/auth/")) {
                const auth = createAuth(env, url.origin);
                return auth.handler(request);
            }
            if (url.pathname.startsWith("/api/")) {
                return await handleApi(request, env);
            }
            return env.ASSETS.fetch(request);
        } catch (error) {
            console.error("Media Kanban request failed.", error);
            return json({ error: "The request could not be completed. Check the Worker logs." }, 500);
        }
    },
};
