import { authClient } from "./auth-client";

const board = document.querySelector("body");
const authPanel = document.querySelector<HTMLElement>("#auth-panel");
const authMessage = document.querySelector<HTMLElement>("#auth-message");
const registrationForm = document.querySelector<HTMLFormElement>("#initial-registration");
const loginButton = document.querySelector<HTMLButtonElement>("#passkey-login");
const accountBar = document.querySelector<HTMLElement>("#account-bar");
const accountName = document.querySelector<HTMLElement>("#account-name");
const signOutButton = document.querySelector<HTMLButtonElement>("#sign-out");
const appMessage = document.querySelector<HTMLElement>("#app-message");
let draggedCard: HTMLElement | null = null;
let dropSection: HTMLElement | null = null;
let dropBefore: HTMLElement | null = null;
let dropIndicator: HTMLElement | null = null;
const tagOptions = ["マンガ", "アニメ", "ラノベ", "ゲーム"];
let nextTagInputId = 0;
type CardStatus = "yet" | "now" | "done" | "stop";
interface CardData {
    id: string;
    title: string;
    status: CardStatus;
    position: number;
    tags: string[];
}
interface CardsResponse {
    user: { id: string; name: string };
    cards: CardData[];
}

if (!board || !authPanel || !authMessage || !registrationForm || !loginButton ||
    !accountBar || !accountName || !signOutButton || !appMessage) {
    throw new Error("The application is missing required page elements.");
}
const pageBoard = board;
const loginPanel = authPanel;
const liveAuthMessage = authMessage;
const setupForm = registrationForm;
const passkeyLogin = loginButton;
const userBar = accountBar;
const userName = accountName;
const logOutButton = signOutButton;
const appStatus = appMessage;

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, {
        ...init,
        credentials: "same-origin",
        headers: {
            ...(init?.body ? { "Content-Type": "application/json" } : {}),
            ...init?.headers,
        },
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
        const message =
            typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
                ? data.error
                : `Request failed (${response.status}).`;
        throw new Error(message);
    }
    return data as T;
}

function setAuthMessage(message: string): void {
    liveAuthMessage.textContent = message;
}

function setAppMessage(message: string): void {
    appStatus.textContent = message;
}

function showSignIn(message = ""): void {
    loginPanel.hidden = false;
    userBar.hidden = true;
    pageBoard.querySelectorAll<HTMLElement>("section[data-status]").forEach((section) => {
        section.hidden = true;
    });
    setAuthMessage(message);
}

function createCard(id: string, title: string, tags: string[]): HTMLDivElement {
    const card = document.createElement("div");
    card.className = "card";
    card.draggable = true;
    card.dataset.cardId = id;

    const heading = document.createElement("h2");
    heading.className = "title";
    heading.textContent = title;
    card.append(heading);

    for (const tag of tags) {
        const tagElement = document.createElement("span");
        tagElement.className = "tag";
        tagElement.textContent = tag;
        card.append(tagElement);
    }

    return card;
}

async function loadBoard(): Promise<void> {
    const result = await requestJson<CardsResponse>("/api/cards");
    loginPanel.hidden = true;
    userBar.hidden = false;
    userName.textContent = result.user.name;
    setAppMessage("");

    for (const status of ["yet", "now", "done", "stop"] as const) {
        const section = pageBoard.querySelector<HTMLElement>(`section[data-status="${status}"]`);
        if (!section) {
            throw new Error(`The "${status}" column was not found.`);
        }
        section.hidden = false;
        section.querySelectorAll(".card").forEach((card) => card.remove());
        const addArea = section.querySelector<HTMLElement>(".add-card-area");
        if (!addArea) {
            throw new Error(`The add-card area for "${status}" was not found.`);
        }
        result.cards
            .filter((card) => card.status === status)
            .sort((left, right) => left.position - right.position)
            .forEach((card) => section.insertBefore(createCard(card.id, card.title, card.tags), addArea));
    }
}

async function checkAuthentication(): Promise<void> {
    try {
        await loadBoard();
    } catch (error) {
        if (error instanceof Error && error.message === "Authentication required.") {
            try {
                const setup = await requestJson<{ initialRegistrationAvailable: boolean }>("/api/setup-status");
                setupForm.hidden = !setup.initialRegistrationAvailable;
                showSignIn();
            } catch (setupError) {
                showSignIn(setupError instanceof Error ? setupError.message : "アプリの初期化を確認できません。");
            }
            return;
        }
        showSignIn(error instanceof Error ? error.message : "ボードを読み込めませんでした。");
    }
}

async function saveCardOrder(): Promise<void> {
    const cards: { id: string; status: CardStatus; position: number }[] = [];
    for (const status of ["yet", "now", "done", "stop"] as const) {
        const section = pageBoard.querySelector<HTMLElement>(`section[data-status="${status}"]`);
        if (!section) {
            throw new Error(`The "${status}" column was not found.`);
        }
        section.querySelectorAll<HTMLElement>(".card").forEach((card, position) => {
            const id = card.dataset.cardId;
            if (!id) {
                throw new Error("A card is missing its database ID.");
            }
            cards.push({ id, status, position });
        });
    }
    await requestJson<{ success: boolean }>("/api/cards/order", {
        method: "PUT",
        body: JSON.stringify({ cards }),
    });
}

function createAddCardForm(): HTMLFormElement {
    const form = document.createElement("form");
    form.className = "add-card-form";
    const content = document.createElement("div");
    content.className = "add-card-form-content";

    const titleLabel = document.createElement("label");
    titleLabel.className = "form-label";
    titleLabel.htmlFor = "card-title";
    titleLabel.textContent = "タイトル";

    const titleInput = document.createElement("input");
    titleInput.className = "title-input";
    titleInput.name = "title";
    titleInput.type = "text";
    titleInput.placeholder = "タイトルを入力";
    titleInput.required = true;
    titleInput.maxLength = 100;
    titleInput.autocomplete = "off";
    titleInput.addEventListener("input", () => titleInput.setCustomValidity(""));

    const tagFieldset = document.createElement("fieldset");
    tagFieldset.className = "tag-options";
    const legend = document.createElement("legend");
    legend.textContent = "タグ（複数選択可）";
    tagFieldset.append(legend);

    const tagGroupId = `card-tags-${nextTagInputId++}`;
    titleInput.id = `card-title-${tagGroupId}`;
    titleLabel.htmlFor = titleInput.id;

    for (const tag of tagOptions) {
        const label = document.createElement("label");
        label.className = "tag-option";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.name = "tags";
        checkbox.value = tag;
        checkbox.id = `${tagGroupId}-${tag}`;
        checkbox.addEventListener("change", () => {
            for (const option of tagFieldset.querySelectorAll<HTMLInputElement>('input[name="tags"]')) {
                option.setCustomValidity("");
            }
        });

        label.htmlFor = checkbox.id;
        label.append(checkbox, document.createTextNode(tag));
        tagFieldset.append(label);
    }

    const submitButton = document.createElement("button");
    submitButton.className = "submit-card";
    submitButton.type = "submit";
    submitButton.textContent = "追加";

    content.append(titleLabel, titleInput, tagFieldset, submitButton);
    form.append(content);
    form.addEventListener("transitionend", (event: TransitionEvent) => {
        if (event.target === form && event.propertyName === "height" && form.classList.contains("is-open")) {
            form.style.height = "auto";
        }
    });
    return form;
}

function closeAddCardForm(form: HTMLFormElement): void {
    if (form.inert) {
        return;
    }

    const area = form.closest<HTMLElement>(".add-card-area");
    const trigger = area?.querySelector<HTMLButtonElement>(".add-card-trigger");
    form.style.height = `${form.getBoundingClientRect().height}px`;
    form.getBoundingClientRect();
    form.classList.remove("is-open");
    form.style.height = "0px";
    form.inert = true;
    area?.classList.remove("is-expanded");
    if (trigger) {
        trigger.classList.remove("is-expanded");
        trigger.textContent = "+";
        trigger.setAttribute("aria-expanded", "false");
        trigger.setAttribute("aria-label", trigger.dataset.addLabel ?? "カードを追加");
    }

    let removalTimer = 0;
    const removeForm = (event?: TransitionEvent): void => {
        if (event && (event.target !== form || event.propertyName !== "height")) {
            return;
        }
        window.clearTimeout(removalTimer);
        form.removeEventListener("transitionend", removeForm);
        form.remove();
        trigger?.focus();
    };

    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        removeForm();
    } else {
        form.addEventListener("transitionend", removeForm);
        removalTimer = window.setTimeout(() => removeForm(), 500);
    }
}

pageBoard.addEventListener("click", (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) {
        return;
    }

    const trigger = target.closest<HTMLButtonElement>(".add-card-trigger");
    const section = trigger?.closest<HTMLElement>("section");
    const area = trigger?.closest<HTMLElement>(".add-card-area");
    if (!trigger || !section || !area) {
        return;
    }

    const existingForm = section.querySelector<HTMLFormElement>(".add-card-form");
    if (existingForm) {
        closeAddCardForm(existingForm);
        return;
    }

    const form = createAddCardForm();
    trigger.dataset.addLabel = trigger.getAttribute("aria-label") ?? "カードを追加";
    trigger.classList.add("is-expanded");
    trigger.textContent = "×";
    trigger.setAttribute("aria-expanded", "true");
    trigger.setAttribute("aria-label", "カード追加フォームを閉じる");
    area.classList.add("is-expanded");
    area.append(form);
    form.getBoundingClientRect();
    form.classList.add("is-open");
    form.style.height = `${form.scrollHeight}px`;
    form.querySelector<HTMLInputElement>(".title-input")?.focus();
});

pageBoard.addEventListener("submit", async (event: SubmitEvent) => {
    const target = event.target;
    if (!(target instanceof HTMLFormElement) || !target.matches(".add-card-form")) {
        return;
    }

    event.preventDefault();
    const titleInput = target.querySelector<HTMLInputElement>(".title-input");
    const section = target.closest<HTMLElement>("section");
    const area = target.closest<HTMLElement>(".add-card-area");
    if (!titleInput || !section || !area) {
        throw new Error("Card form is missing required elements.");
    }

    const title = titleInput.value.trim();
    if (!title) {
        titleInput.setCustomValidity("タイトルを入力してください。");
        titleInput.reportValidity();
        return;
    }

    const tagCheckboxes = Array.from(target.querySelectorAll<HTMLInputElement>('input[name="tags"]'));
    const tags = tagCheckboxes.filter((checkbox) => checkbox.checked).map((checkbox) => checkbox.value);
    if (tags.length === 0) {
        const firstTag = tagCheckboxes[0];
        if (!firstTag) {
            throw new Error("Card form has no tag options.");
        }
        firstTag.setCustomValidity("タグを1つ以上選択してください。");
        firstTag.reportValidity();
        return;
    }
    tagCheckboxes.forEach((checkbox) => checkbox.setCustomValidity(""));
    const status = section.dataset.status;
    if (status !== "yet" && status !== "now" && status !== "done" && status !== "stop") {
        throw new Error("The card form is not inside a valid column.");
    }
    const submitButton = target.querySelector<HTMLButtonElement>(".submit-card");
    if (submitButton) {
        submitButton.disabled = true;
    }
    try {
        const card = await requestJson<CardData>("/api/cards", {
            method: "POST",
            body: JSON.stringify({ title, tags, status }),
        });
        section.insertBefore(createCard(card.id, card.title, card.tags), area);
        closeAddCardForm(target);
    } catch (error) {
        setAppMessage(error instanceof Error ? error.message : "カードを保存できませんでした。");
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
        }
    }
});

pageBoard.addEventListener("dragstart", (event: DragEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) {
        return;
    }

    const card = target.closest<HTMLElement>(".card");
    if (!card) {
        return;
    }

    draggedCard = card;
    card.classList.add("is-dragging");
    dropIndicator = document.createElement("div");
    dropIndicator.className = "drop-indicator";
    dropIndicator.setAttribute("aria-hidden", "true");
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", "");
    }
});

pageBoard.addEventListener("dragover", (event: DragEvent) => {
    if (!draggedCard || !dropIndicator) {
        return;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
        return;
    }

    const section = target.closest<HTMLElement>("section");
    if (!section) {
        return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
    }

    pageBoard.querySelectorAll("section.is-drag-over").forEach((activeSection) => {
        if (activeSection !== section) {
            activeSection.classList.remove("is-drag-over");
        }
    });
    section.classList.add("is-drag-over");

    const nextCard = Array.from(section.querySelectorAll<HTMLElement>(".card"))
        .filter((card) => card !== draggedCard)
        .find((card) => {
            const bounds = card.getBoundingClientRect();
            return event.clientY < bounds.top + bounds.height / 2;
        });
    const addArea = section.querySelector<HTMLElement>(".add-card-area");
    const sectionBounds = section.getBoundingClientRect();
    const indicatorY = nextCard
        ? nextCard.getBoundingClientRect().top - sectionBounds.top + section.scrollTop
        : addArea
          ? addArea.getBoundingClientRect().top - sectionBounds.top + section.scrollTop
          : section.scrollHeight - Number.parseFloat(getComputedStyle(section).paddingBottom);

    dropSection = section;
    dropBefore = nextCard ?? addArea;
    dropIndicator.style.top = `${indicatorY}px`;
    section.append(dropIndicator);
});

pageBoard.addEventListener("drop", (event: DragEvent) => {
    if (!draggedCard || !dropSection) {
        return;
    }

    event.preventDefault();
    const addArea = dropSection.querySelector<HTMLElement>(".add-card-area");
    const insertionPoint = dropBefore?.parentElement === dropSection ? dropBefore : addArea;
    dropSection.insertBefore(draggedCard, insertionPoint ?? null);
    void saveCardOrder().catch(async (error: unknown) => {
        setAppMessage(error instanceof Error ? error.message : "カードの並び順を保存できませんでした。");
        await loadBoard().catch((reloadError: unknown) => {
            showSignIn(reloadError instanceof Error ? reloadError.message : "ボードを再読み込みできませんでした。");
        });
    });
});

pageBoard.addEventListener("dragend", () => {
    draggedCard?.classList.remove("is-dragging");
    dropIndicator?.remove();
    draggedCard = null;
    dropSection = null;
    dropBefore = null;
    dropIndicator = null;
    pageBoard.querySelectorAll("section.is-drag-over").forEach((section) => {
        section.classList.remove("is-drag-over");
    });
});

passkeyLogin.addEventListener("click", async () => {
    passkeyLogin.disabled = true;
    setAuthMessage("パスキーを確認しています…");
    try {
        const result = await authClient.signIn.passkey();
        if (result.error) {
            throw new Error(result.error.message || "パスキーでログインできませんでした。");
        }
        await loadBoard();
    } catch (error) {
        setAuthMessage(error instanceof Error ? error.message : "パスキーでログインできませんでした。");
    } finally {
        passkeyLogin.disabled = false;
    }
});

setupForm.addEventListener("submit", async (event: SubmitEvent) => {
    event.preventDefault();
    const name = new FormData(setupForm).get("name");
    const code = new FormData(setupForm).get("inviteCode");
    if (typeof name !== "string" || typeof code !== "string") {
        setAuthMessage("表示名と初回登録コードを入力してください。");
        return;
    }

    const submitButton = setupForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submitButton) {
        submitButton.disabled = true;
    }
    setAuthMessage("パスキーを登録しています…");
    try {
        const registration = await requestJson<{ context: string }>("/api/registration/context", {
            method: "POST",
            body: JSON.stringify({ code, name }),
        });
        const result = await authClient.passkey.addPasskey({
            name: `${name.trim()} のパスキー`,
            context: registration.context,
            createSession: true,
        });
        if (result.error) {
            throw new Error(result.error.message || "パスキーを登録できませんでした。");
        }
        setupForm.reset();
        await loadBoard();
    } catch (error) {
        setAuthMessage(error instanceof Error ? error.message : "パスキーを登録できませんでした。");
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
        }
    }
});

logOutButton.addEventListener("click", async () => {
    logOutButton.disabled = true;
    try {
        const result = await authClient.signOut();
        if (result.error) {
            throw new Error(result.error.message || "ログアウトできませんでした。");
        }
        showSignIn("ログアウトしました。");
    } catch (error) {
        setAppMessage(error instanceof Error ? error.message : "ログアウトできませんでした。");
    } finally {
        logOutButton.disabled = false;
    }
});

void checkAuthentication();