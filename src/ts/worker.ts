import { betterAuth } from "better-auth";
import { passkey } from "@better-auth/passkey";

interface Env {
    DB: D1Database;
    ASSETS: { fetch(request: Request): Promise<Response> };
    BETTER_AUTH_SECRET?: string;
    INITIAL_SETUP_CODE?: string;
}

interface RegistrationToken {
    tokenHash: string;
    userId: string;
    name: string;
}

type CardStatus = "yet" | "now" | "done" | "stop";
type CardTag = "マンガ" | "アニメ" | "ラノベ" | "ゲーム";

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
                        const registration = await getRegistrationToken(env, context);
                        return {
                            id: registration.userId,
                            name: registration.name,
                            displayName: registration.name,
                        };
                    },
                    afterVerification: async ({ context, user }) => {
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

    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(tokenBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
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
