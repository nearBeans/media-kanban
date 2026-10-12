import { authClient } from "./auth-client";

const board = document.querySelector<HTMLElement>(".kanban-board");
const authPanel = document.querySelector<HTMLElement>("#auth-panel");
const authMessage = document.querySelector<HTMLElement>("#auth-message");
const recoveryRequestPanel = document.querySelector<HTMLElement>("#recovery-request-panel");
const recoveryRequestMessage = document.querySelector<HTMLElement>("#recovery-request-message");
const signupPanel = document.querySelector<HTMLElement>("#signup-panel");
const signupMessage = document.querySelector<HTMLElement>("#signup-message");
const signupLink = document.querySelector<HTMLAnchorElement>("#signup-link");
const registrationForm = document.querySelector<HTMLFormElement>("#initial-registration");
const recoveryCodePanel = document.querySelector<HTMLElement>("#recovery-code-panel");
const recoveryCodeMessage = document.querySelector<HTMLElement>("#recovery-code-message");
const recoveryForm = document.querySelector<HTMLFormElement>("#recovery-form");
const requestRecoveryCodeForm = document.querySelector<HTMLFormElement>("#request-recovery-code-form");
const loginButton = document.querySelector<HTMLButtonElement>("#passkey-login");
const accountBar = document.querySelector<HTMLElement>("#account-bar");
const accountName = document.querySelector<HTMLElement>("#account-name");
const signOutButton = document.querySelector<HTMLButtonElement>("#sign-out");
const toggleViewButton = document.querySelector<HTMLButtonElement>("#toggle-view");
const exportCsvButton = document.querySelector<HTMLButtonElement>("#export-csv");
const tableView = document.querySelector<HTMLElement>("#table-view");
const tableStatusFilter = document.querySelector<HTMLSelectElement>("#table-status-filter");
const tableSearch = document.querySelector<HTMLInputElement>("#table-search");
const tableTagFilters = document.querySelector<HTMLElement>("#table-tag-filters");
const clearTableFiltersButton = document.querySelector<HTMLButtonElement>("#clear-table-filters");
const tableResultCount = document.querySelector<HTMLOutputElement>("#table-result-count");
const tableRows = document.querySelector<HTMLTableSectionElement>("#table-rows");
const cardEditorDialog = document.querySelector<HTMLDialogElement>("#card-editor-dialog");
const cardEditorForm = document.querySelector<HTMLFormElement>("#card-editor-form");
const cardEditorTitle = document.querySelector<HTMLInputElement>("#card-editor-title");
const cardEditorStatus = document.querySelector<HTMLSelectElement>("#card-editor-status");
const cardEditorTags = document.querySelector<HTMLElement>("#card-editor-tags");
const cardEditorMessage = document.querySelector<HTMLElement>("#card-editor-message");
const deleteCardButton = document.querySelector<HTMLButtonElement>("#delete-card");
const closeCardEditorButton = document.querySelector<HTMLButtonElement>("#close-card-editor");
const manageRecoveryEmailButton = document.querySelector<HTMLButtonElement>("#manage-recovery-email");
const recoveryDialog = document.querySelector<HTMLDialogElement>("#recovery-dialog");
const recoveryDialogMessage = document.querySelector<HTMLElement>("#recovery-dialog-message");
const recoveryEmailStatus = document.querySelector<HTMLElement>("#recovery-email-status");
const recoveryEmailForm = document.querySelector<HTMLFormElement>("#recovery-email-form");
const confirmRecoveryEmailButton = document.querySelector<HTMLButtonElement>("#confirm-recovery-email");
const closeRecoveryDialogButton = document.querySelector<HTMLButtonElement>("#close-recovery-dialog");
const recoveryEmailConfirmedDialog = document.querySelector<HTMLDialogElement>("#recovery-email-confirmed-dialog");
const recoveryEmailConfirmedMessage = document.querySelector<HTMLElement>("#recovery-email-confirmed-message");
const closeRecoveryEmailConfirmedButton = document.querySelector<HTMLButtonElement>("#close-recovery-email-confirmed");
const appMessage = document.querySelector<HTMLElement>("#app-message");
const mobileBoardHint = document.querySelector<HTMLElement>(".mobile-board-hint");
let draggedCard: HTMLElement | null = null;
let dropSection: HTMLElement | null = null;
let dropBefore: HTMLElement | null = null;
let dropIndicator: HTMLElement | null = null;
type CardMediaType = "マンガ" | "アニメ" | "ラノベ" | "ゲーム";
const tagOptions: CardMediaType[] = ["マンガ", "アニメ", "ラノベ", "ゲーム"];
let nextTagInputId = 0;
type CardStatus = "yet" | "now" | "done" | "stop";
const cardStatusOrder: CardStatus[] = ["yet", "now", "done", "stop"];
const cardStatusLabels: Record<CardStatus, string> = {
    yet: "未視聴・未読",
    now: "視聴中・読書中",
    done: "完結・読了",
    stop: "断念",
};

function isCardStatus(value: string): value is CardStatus {
    return cardStatusOrder.includes(value as CardStatus);
}

function isCardMediaType(value: string): value is CardMediaType {
    return tagOptions.some((tag) => tag === value);
}

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
type BoardView = "kanban" | "table";
let currentCards: CardData[] = [];
let editingCardId: string | null = null;

if (!board || !authPanel || !authMessage || !recoveryRequestPanel || !recoveryRequestMessage ||
    !signupPanel || !signupMessage || !signupLink || !registrationForm || !recoveryCodePanel ||
    !recoveryCodeMessage || !recoveryForm || !requestRecoveryCodeForm || !loginButton ||
    !accountBar || !accountName || !signOutButton || !manageRecoveryEmailButton || !recoveryDialog ||
    !toggleViewButton || !tableView || !tableStatusFilter || !tableSearch ||
    !tableTagFilters || !clearTableFiltersButton || !tableResultCount || !tableRows ||
    !cardEditorDialog || !cardEditorForm || !cardEditorTitle || !cardEditorStatus ||
    !cardEditorTags || !cardEditorMessage || !deleteCardButton || !closeCardEditorButton ||
    !recoveryDialogMessage || !recoveryEmailStatus || !recoveryEmailForm ||
    !confirmRecoveryEmailButton || !closeRecoveryDialogButton || !recoveryEmailConfirmedDialog ||
    !recoveryEmailConfirmedMessage || !closeRecoveryEmailConfirmedButton || !appMessage || !mobileBoardHint ||
    !exportCsvButton) {
    throw new Error("The application is missing required page elements.");
}
const pageBoard = board;
const loginPanel = authPanel;
const liveAuthMessage = authMessage;
const recoveryEntryPanel = recoveryRequestPanel;
const recoveryEntryMessage = recoveryRequestMessage;
const newAccountPanel = signupPanel;
const newAccountMessage = signupMessage;
const setupForm = registrationForm;
const recoveryCodeScreen = recoveryCodePanel;
const recoveryCodeStatus = recoveryCodeMessage;
const accountRecoveryForm = recoveryForm;
const requestRecoveryCode = requestRecoveryCodeForm;
const passkeyLogin = loginButton;
const userBar = accountBar;
const userName = accountName;
const logOutButton = signOutButton;
const viewSwitcher = toggleViewButton;
const cardTableView = tableView;
const cardTableStatusFilter = tableStatusFilter;
const cardTableSearch = tableSearch;
const cardTableTagFilters = tableTagFilters;
const resetCardTableFiltersButton = clearTableFiltersButton;
const cardTableResultCount = tableResultCount;
const cardTableRows = tableRows;
const cardEditor = cardEditorDialog;
const editCardForm = cardEditorForm;
const editCardTitle = cardEditorTitle;
const editCardStatus = cardEditorStatus;
const editCardTags = cardEditorTags;
const editCardMessage = cardEditorMessage;
const removeCardButton = deleteCardButton;
const dismissCardEditorButton = closeCardEditorButton;
const openRecoveryDialogButton = manageRecoveryEmailButton;
const recoveryCodeModal = recoveryDialog;
const recoveryStatusMessage = recoveryDialogMessage;
const recoveryEmailStatusMessage = recoveryEmailStatus;
const manageRecoveryEmailForm = recoveryEmailForm;
const verifyRecoveryEmailButton = confirmRecoveryEmailButton;
const dismissRecoveryDialogButton = closeRecoveryDialogButton;
const emailConfirmedDialog = recoveryEmailConfirmedDialog;
const emailConfirmedMessage = recoveryEmailConfirmedMessage;
const dismissEmailConfirmedButton = closeRecoveryEmailConfirmedButton;
const appStatus = appMessage;
const boardSwipeHint = mobileBoardHint;
let requestedRecoveryEmail = "";
let pendingRecoveryEmailToken = new URL(location.href).searchParams.get("verify-recovery-email");
if (pendingRecoveryEmailToken) {
    history.replaceState(null, "", location.pathname);
}

function escapeCsvField(value: string): string {
    return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

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

function setBoardView(view: BoardView): void {
    const isKanban = view === "kanban";
    pageBoard.hidden = !isKanban;
    boardSwipeHint.hidden = !isKanban;
    cardTableView.hidden = isKanban;
    viewSwitcher.textContent = isKanban ? "表" : "カ";
    const nextViewLabel = isKanban ? "表形式に切り替え" : "カンバンに切り替え";
    viewSwitcher.setAttribute("aria-label", nextViewLabel);
    viewSwitcher.title = nextViewLabel;
    if (!isKanban) {
        renderCardTable();
    }
}

type AuthPage = "login" | "recovery" | "signup" | "recovery-code";

function showAuthPage(page: AuthPage): void {
    loginPanel.hidden = page !== "login";
    recoveryEntryPanel.hidden = page !== "recovery";
    newAccountPanel.hidden = page !== "signup";
    recoveryCodeScreen.hidden = page !== "recovery-code";
}

function authPageFromHash(): AuthPage {
    switch (location.hash) {
        case "#recovery":
            return "recovery";
        case "#signup":
            return "signup";
        case "#recovery-code":
            return "recovery-code";
        default:
            return "login";
    }
}

function navigateAuthPage(page: AuthPage): void {
    const hash = page === "login" ? "" : `#${page}`;
    if (location.hash !== hash) {
        history.pushState(null, "", `${location.pathname}${location.search}${hash}`);
    }
    showAuthPage(page);
}

function showSignIn(message = ""): void {
    showAuthPage(authPageFromHash());
    userBar.hidden = true;
    pageBoard.hidden = true;
    cardTableView.hidden = true;
    boardSwipeHint.hidden = true;
    pageBoard.querySelectorAll<HTMLElement>("section[data-status]").forEach((section) => {
        section.hidden = true;
    });
    setAuthMessage(message);
}

function createCard(id: string, title: string, tags: string[], status: CardStatus): HTMLDivElement {
    const card = document.createElement("div");
    card.className = "card";
    card.draggable = !matchMedia("(pointer: coarse)").matches;
    card.dataset.cardId = id;
    card.tabIndex = 0;
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", `${title} 編集`);

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

    const statusSelect = document.createElement("select");
    statusSelect.className = "card-status-select";
    statusSelect.setAttribute("aria-label", `${title}の列を変更`);
    for (const optionStatus of cardStatusOrder) {
        const option = document.createElement("option");
        option.value = optionStatus;
        option.textContent = cardStatusLabels[optionStatus];
        statusSelect.append(option);
    }
    statusSelect.value = status;
    card.append(statusSelect);

    return card;
}

function renderCardTable(): void {
    const status = cardTableStatusFilter.value;
    const search = cardTableSearch.value.trim().toLocaleLowerCase();
    const selectedTags = Array.from(
        cardTableTagFilters.querySelectorAll<HTMLInputElement>('input[name="filter-tag"]:checked'),
        (checkbox) => checkbox.value,
    );
    const filteredCards = currentCards.filter((card) => {
        const matchesStatus = !status || card.status === status;
        const matchesTitle = !search || card.title.toLocaleLowerCase().includes(search);
        const matchesTags = selectedTags.length === 0 ||
            selectedTags.some((tag) => card.tags.includes(tag));
        return matchesStatus && matchesTitle && matchesTags;
    });

    cardTableRows.replaceChildren();
    for (const card of filteredCards) {
        const row = document.createElement("tr");
        const editCell = document.createElement("td");
        editCell.className = "table-edit-cell";
        const editButton = document.createElement("button");
        editButton.className = "table-edit-button";
        editButton.type = "button";
        editButton.dataset.cardId = card.id;
        editButton.textContent = "編集";
        editButton.setAttribute("aria-label", `「${card.title}」を編集`);
        editCell.append(editButton);

        const titleCell = document.createElement("th");
        titleCell.scope = "row";
        titleCell.textContent = card.title;

        const statusCell = document.createElement("td");
        statusCell.textContent = cardStatusLabels[card.status];

        const tagsCell = document.createElement("td");
        tagsCell.className = "table-tags";
        if (card.tags.length === 0) {
            tagsCell.textContent = "—";
        } else {
            for (const tag of card.tags) {
                const badge = document.createElement("span");
                badge.className = "table-tag";
                badge.textContent = tag;
                tagsCell.append(badge);
            }
        }

        row.append(editCell, titleCell, statusCell, tagsCell);
        cardTableRows.append(row);
    }

    if (filteredCards.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.className = "table-empty";
        cell.colSpan = 4;
        cell.textContent = currentCards.length === 0
            ? "カードはまだありません。"
            : "条件に一致するカードがありません。";
        row.append(cell);
        cardTableRows.append(row);
    }

    cardTableResultCount.value = `${filteredCards.length} / ${currentCards.length} 件`;
}

function openCardEditor(cardId: string): void {
    const card = currentCards.find((item) => item.id === cardId);
    if (!card) {
        setAppMessage("編集する作品が見つかりません。ボードを再読み込みしてください。");
        return;
    }

    editingCardId = card.id;
    editCardTitle.value = card.title;
    editCardStatus.value = card.status;
    editCardTags.querySelectorAll<HTMLInputElement>('input[name="tags"]').forEach((checkbox) => {
        checkbox.checked = card.tags.includes(checkbox.value);
    });
    editCardMessage.textContent = "";
    cardEditor.showModal();
    editCardTitle.focus();
}

function renderUpdatedBoardCard(card: CardData): void {
    const existingCard = pageBoard.querySelector<HTMLElement>(`.card[data-card-id="${card.id}"]`);
    const destination = pageBoard.querySelector<HTMLElement>(`section[data-status="${card.status}"]`);
    const addArea = destination?.querySelector<HTMLElement>(".add-card-area");
    if (!destination || !addArea) {
        throw new Error(`The "${card.status}" column is missing its add-card area.`);
    }

    const replacement = createCard(card.id, card.title, card.tags, card.status);
    if (existingCard?.parentElement === destination) {
        existingCard.replaceWith(replacement);
    } else {
        existingCard?.remove();
        destination.insertBefore(replacement, addArea);
    }
}

async function loadBoard(): Promise<void> {
    const result = await requestJson<CardsResponse>("/api/cards");
    currentCards = result.cards;
    loginPanel.hidden = true;
    recoveryEntryPanel.hidden = true;
    newAccountPanel.hidden = true;
    recoveryCodeScreen.hidden = true;
    pageBoard.hidden = false;
    boardSwipeHint.hidden = false;
    userBar.hidden = false;
    userName.textContent = result.user.name;
    setAppMessage("");
    setBoardView("kanban");

    for (const status of cardStatusOrder) {
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
            .forEach((card) => section.insertBefore(
                createCard(card.id, card.title, card.tags, card.status),
                addArea,
            ));
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
                newAccountMessage.textContent = setup.initialRegistrationAvailable
                    ? ""
                    : "新しいアカウントの登録は現在受け付けていません。";
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
    for (const status of cardStatusOrder) {
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
    const statusById = new Map(cards.map((card) => [card.id, card]));
    currentCards = currentCards.map((card) => {
        const order = statusById.get(card.id);
        return order ? { ...card, status: order.status, position: order.position } : card;
    });
    renderCardTable();
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

    const card = target.closest<HTMLElement>(".card");
    if (card && !target.closest("select, button, input, a")) {
        const cardId = card.dataset.cardId;
        if (!cardId) {
            throw new Error("A card is missing its database ID.");
        }
        openCardEditor(cardId);
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

pageBoard.addEventListener("keydown", (event: KeyboardEvent) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches(".card") ||
        (event.key !== "Enter" && event.key !== " ")) {
        return;
    }
    event.preventDefault();
    const cardId = target.dataset.cardId;
    if (!cardId) {
        throw new Error("A card is missing its database ID.");
    }
    openCardEditor(cardId);
});

pageBoard.addEventListener("change", (event: Event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement) || !target.matches(".card-status-select")) {
        return;
    }

    const card = target.closest<HTMLElement>(".card");
    const destinationStatus = target.value;
    if (!card || !isCardStatus(destinationStatus)) {
        throw new Error("A card status selector is not inside a card or has an invalid status.");
    }

    const destination = pageBoard.querySelector<HTMLElement>(
        `section[data-status="${destinationStatus}"]`,
    );
    const addArea = destination?.querySelector<HTMLElement>(".add-card-area");
    if (!destination || !addArea) {
        throw new Error("The destination column is missing its add-card area.");
    }
    if (card.parentElement === destination) {
        return;
    }

    destination.insertBefore(card, addArea);
    void saveCardOrder().then(() => {
        setAppMessage(`「${cardStatusLabels[destinationStatus]}」へ移動しました。`);
        destination.scrollIntoView({
            behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
            block: "nearest",
            inline: "start",
        });
    }).catch(async (error: unknown) => {
        setAppMessage(error instanceof Error ? error.message : "カードの移動を保存できませんでした。");
        await loadBoard().catch((reloadError: unknown) => {
            showSignIn(reloadError instanceof Error ? reloadError.message : "ボードを再読み込みできませんでした。");
        });
    });
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
        section.insertBefore(createCard(card.id, card.title, card.tags, card.status), area);
        currentCards.push(card);
        renderCardTable();
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

viewSwitcher.addEventListener("click", () => {
    setBoardView(pageBoard.hidden ? "kanban" : "table");
});

cardTableRows.addEventListener("click", (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) {
        return;
    }
    const button = target.closest<HTMLButtonElement>(".table-edit-button");
    const cardId = button?.dataset.cardId;
    if (cardId) {
        openCardEditor(cardId);
    }
});

editCardForm.addEventListener("submit", async (event: SubmitEvent) => {
    event.preventDefault();
    if (!editingCardId) {
        throw new Error("No card is selected for editing.");
    }

    const title = editCardTitle.value.trim();
    if (!title) {
        editCardMessage.textContent = "タイトルを入力してください。";
        editCardTitle.focus();
        return;
    }
    const status = editCardStatus.value;
    if (!isCardStatus(status)) {
        throw new Error("The card editor contains an invalid status.");
    }
    const tagCheckboxes = Array.from(editCardTags.querySelectorAll<HTMLInputElement>('input[name="tags"]'));
    const tags = tagCheckboxes.filter((checkbox) => checkbox.checked).map((checkbox) => checkbox.value);
    if (tags.length === 0 || tags.some((tag) => !isCardMediaType(tag))) {
        editCardMessage.textContent = "メディアタイプを1つ以上選択してください。";
        return;
    }

    const buttons = Array.from(editCardForm.querySelectorAll<HTMLButtonElement>("button"));
    buttons.forEach((button) => {
        button.disabled = true;
    });
    editCardMessage.textContent = "保存しています…";
    try {
        const card = await requestJson<CardData>(`/api/cards/${encodeURIComponent(editingCardId)}`, {
            method: "PUT",
            body: JSON.stringify({ title, status, tags }),
        });
        currentCards = currentCards.map((current) => current.id === card.id ? card : current);
        renderUpdatedBoardCard(card);
        renderCardTable();
        cardEditor.close();
        setAppMessage("作品を更新しました。");
    } catch (error) {
        editCardMessage.textContent = error instanceof Error
            ? error.message
            : "作品を保存できませんでした。";
    } finally {
        buttons.forEach((button) => {
            button.disabled = false;
        });
    }
});

removeCardButton.addEventListener("click", async () => {
    if (!editingCardId) {
        throw new Error("No card is selected for deletion.");
    }
    const card = currentCards.find((item) => item.id === editingCardId);
    if (!card) {
        throw new Error("The selected card could not be found.");
    }
    if (!window.confirm(`「${card.title}」を削除します。この操作は取り消せません。`)) {
        return;
    }

    const buttons = Array.from(editCardForm.querySelectorAll<HTMLButtonElement>("button"));
    buttons.forEach((button) => {
        button.disabled = true;
    });
    editCardMessage.textContent = "削除しています…";
    try {
        await requestJson<{ success: boolean }>(`/api/cards/${encodeURIComponent(card.id)}`, {
            method: "DELETE",
        });
        currentCards = currentCards.filter((item) => item.id !== card.id);
        pageBoard.querySelector(`.card[data-card-id="${card.id}"]`)?.remove();
        renderCardTable();
        cardEditor.close();
        setAppMessage("作品を削除しました。");
    } catch (error) {
        editCardMessage.textContent = error instanceof Error
            ? error.message
            : "作品を削除できませんでした。";
    } finally {
        buttons.forEach((button) => {
            button.disabled = false;
        });
    }
});

dismissCardEditorButton.addEventListener("click", () => cardEditor.close());
cardEditor.addEventListener("close", () => {
    editingCardId = null;
});

cardTableStatusFilter.addEventListener("change", renderCardTable);
cardTableSearch.addEventListener("input", renderCardTable);
cardTableTagFilters.addEventListener("change", renderCardTable);
resetCardTableFiltersButton.addEventListener("click", () => {
    cardTableStatusFilter.value = "";
    cardTableSearch.value = "";
    cardTableTagFilters.querySelectorAll<HTMLInputElement>('input[name="filter-tag"]')
        .forEach((checkbox) => {
            checkbox.checked = false;
        });
    renderCardTable();
});

exportCsvButton.addEventListener("click", () => {
    const orderedCards = [...currentCards].sort((left, right) =>
        cardStatusOrder.indexOf(left.status) - cardStatusOrder.indexOf(right.status) ||
        left.position - right.position,
    );
    const records = [
        ["title", "status", "tags"],
        ...orderedCards.map((card) => [card.title, card.status, card.tags.join(";")]),
    ];
    const csv = `\uFEFF${records.map((record) => record.map(escapeCsvField).join(",")).join("\r\n")}\r\n`;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = `media-kanban-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    setAppMessage(`${orderedCards.length}件をCSVにエクスポートしました。`);
});

document.addEventListener("click", (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) {
        return;
    }
    const link = target.closest<HTMLAnchorElement>('a[href^="#"]');
    if (!link) {
        return;
    }
    const page = link.hash.slice(1);
    if (page !== "login" && page !== "recovery" && page !== "signup" && page !== "recovery-code") {
        return;
    }
    event.preventDefault();
    navigateAuthPage(page);
});

window.addEventListener("popstate", () => {
    showAuthPage(authPageFromHash());
});

requestRecoveryCode.addEventListener("submit", async (event: SubmitEvent) => {
    event.preventDefault();
    const email = new FormData(requestRecoveryCode).get("email");
    if (typeof email !== "string") {
        recoveryEntryMessage.textContent = "復旧用メールアドレスを入力してください。";
        return;
    }

    const submitButton = requestRecoveryCode.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submitButton) {
        submitButton.disabled = true;
    }
    recoveryEntryMessage.textContent = "復旧コードをメールで送信しています…";
    try {
        const result = await requestJson<{ message: string }>("/api/recovery/email-code", {
            method: "POST",
            body: JSON.stringify({ email }),
        });
        requestedRecoveryEmail = email.trim().toLowerCase();
        navigateAuthPage("recovery-code");
        recoveryCodeStatus.textContent = result.message;
        accountRecoveryForm.querySelector<HTMLInputElement>('input[name="recoveryCode"]')?.focus();
    } catch (error) {
        recoveryEntryMessage.textContent = error instanceof Error
            ? error.message
            : "復旧コードを送信できませんでした。";
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
        }
    }
});

accountRecoveryForm.addEventListener("submit", async (event: SubmitEvent) => {
    event.preventDefault();
    const code = new FormData(accountRecoveryForm).get("recoveryCode");
    if (typeof code !== "string" || !requestedRecoveryEmail) {
        recoveryCodeStatus.textContent = "復旧用メールアドレスでコードを受信してから入力してください。";
        return;
    }

    const submitButton = accountRecoveryForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submitButton) {
        submitButton.disabled = true;
    }
    recoveryCodeStatus.textContent = "復旧コードを確認しています…";
    try {
        const recovery = await requestJson<{ context: string }>("/api/recovery/start", {
            method: "POST",
            body: JSON.stringify({ email: requestedRecoveryEmail, code }),
        });
        const result = await authClient.passkey.addPasskey({
            name: "復旧後のパスキー",
            context: recovery.context,
            createSession: true,
        });
        if (result.error) {
            throw new Error(result.error.message || "復旧用パスキーを登録できませんでした。");
        }
        accountRecoveryForm.reset();
        await loadBoard();
        requestedRecoveryEmail = "";
        requestRecoveryCode.reset();
        accountRecoveryForm.hidden = true;
        setAppMessage("アカウントを復旧しました。");
    } catch (error) {
        recoveryCodeStatus.textContent = error instanceof Error
            ? error.message
            : "アカウントを復旧できませんでした。";
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
        }
    }
});

openRecoveryDialogButton.addEventListener("click", async () => {
    recoveryStatusMessage.textContent = "復旧コードの状態を確認しています…";
    recoveryEmailStatusMessage.textContent = "";
    verifyRecoveryEmailButton.hidden = true;
    recoveryCodeModal.showModal();
    try {
        const status = await requestJson<{
            email: string | null;
            pendingEmail: string | null;
            verified: boolean;
        }>("/api/recovery-email");
        const emailInput = manageRecoveryEmailForm.querySelector<HTMLInputElement>('input[name="email"]');
        if (!emailInput) {
            throw new Error("復旧用メールアドレスの入力欄がありません。");
        }
        emailInput.value = status.pendingEmail ?? status.email ?? "";
        recoveryEmailStatusMessage.textContent = status.verified
            ? `確認済み: ${status.email}`
            : status.pendingEmail
                ? `確認待ち: ${status.pendingEmail}`
                : "復旧用メールアドレスは未登録です。";
        recoveryStatusMessage.textContent = "";
    } catch (error) {
        recoveryStatusMessage.textContent = error instanceof Error
            ? error.message
            : "復旧用メールアドレスの状態を確認できませんでした。";
    }
});

manageRecoveryEmailForm.addEventListener("submit", async (event: SubmitEvent) => {
    event.preventDefault();
    const email = new FormData(manageRecoveryEmailForm).get("email");
    if (typeof email !== "string") {
        recoveryStatusMessage.textContent = "復旧用メールアドレスを入力してください。";
        return;
    }
    const submitButton = manageRecoveryEmailForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submitButton) {
        submitButton.disabled = true;
    }
    recoveryStatusMessage.textContent = "確認メールを送信しています…";
    try {
        const result = await requestJson<{ message: string }>("/api/recovery-email", {
            method: "POST",
            body: JSON.stringify({ email }),
        });
        recoveryStatusMessage.textContent = result.message;
        recoveryEmailStatusMessage.textContent = `確認待ち: ${email.trim()}`;
    } catch (error) {
        recoveryStatusMessage.textContent = error instanceof Error
            ? error.message
            : "確認メールを送信できませんでした。";
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
        }
    }
});

verifyRecoveryEmailButton.addEventListener("click", async () => {
    if (!pendingRecoveryEmailToken) {
        recoveryStatusMessage.textContent = "確認リンクが無効か、期限切れです。";
        return;
    }
    verifyRecoveryEmailButton.disabled = true;
    recoveryStatusMessage.textContent = "メールアドレスを確認しています…";
    try {
        const result = await requestJson<{ success: boolean; email: string }>("/api/recovery-email/verify", {
            method: "POST",
            body: JSON.stringify({ token: pendingRecoveryEmailToken }),
        });
        pendingRecoveryEmailToken = null;
        verifyRecoveryEmailButton.hidden = true;
        manageRecoveryEmailForm.hidden = false;
        recoveryCodeModal.close();
        emailConfirmedMessage.textContent = `確認済み: ${result.email}`;
        emailConfirmedDialog.showModal();
    } catch (error) {
        recoveryStatusMessage.textContent = error instanceof Error
            ? error.message
            : "メールアドレスを確認できませんでした。";
    } finally {
        verifyRecoveryEmailButton.disabled = false;
    }
});

dismissRecoveryDialogButton.addEventListener("click", () => recoveryCodeModal.close());
dismissEmailConfirmedButton.addEventListener("click", () => emailConfirmedDialog.close());

setupForm.addEventListener("submit", async (event: SubmitEvent) => {
    event.preventDefault();
    const name = new FormData(setupForm).get("name");
    const code = new FormData(setupForm).get("inviteCode");
    if (typeof name !== "string" || typeof code !== "string") {
        newAccountMessage.textContent = "表示名と初回登録コードを入力してください。";
        return;
    }

    const submitButton = setupForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submitButton) {
        submitButton.disabled = true;
    }
    newAccountMessage.textContent = "パスキーを登録しています…";
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
        newAccountMessage.textContent = error instanceof Error
            ? error.message
            : "パスキーを登録できませんでした。";
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
showAuthPage(authPageFromHash());
if (pendingRecoveryEmailToken) {
    recoveryEmailStatusMessage.textContent = "メール内のリンクを開きました。確認を完了してください。";
    recoveryStatusMessage.textContent = "";
    manageRecoveryEmailForm.hidden = true;
    verifyRecoveryEmailButton.hidden = false;
    recoveryCodeModal.showModal();
}