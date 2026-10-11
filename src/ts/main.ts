const board = document.querySelector("body");
let draggedCard: HTMLElement | null = null;
let dropSection: HTMLElement | null = null;
let dropBefore: HTMLElement | null = null;
let dropIndicator: HTMLElement | null = null;
const tagOptions = ["マンガ", "アニメ", "ラノベ", "ゲーム"];
let nextTagInputId = 0;

if (!board) {
    throw new Error("Kanban board was not found.");
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

function createCard(title: string, tags: string[]): HTMLDivElement {
    const card = document.createElement("div");
    card.className = "card";
    card.draggable = true;

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

board.addEventListener("click", (event: MouseEvent) => {
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

board.addEventListener("submit", (event: SubmitEvent) => {
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
    section.insertBefore(createCard(title, tags), area);
    closeAddCardForm(target);
});

board.addEventListener("dragstart", (event: DragEvent) => {
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

board.addEventListener("dragover", (event: DragEvent) => {
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

    board.querySelectorAll("section.is-drag-over").forEach((activeSection) => {
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

board.addEventListener("drop", (event: DragEvent) => {
    if (!draggedCard || !dropSection) {
        return;
    }

    event.preventDefault();
    const addArea = dropSection.querySelector<HTMLElement>(".add-card-area");
    const insertionPoint = dropBefore?.parentElement === dropSection ? dropBefore : addArea;
    dropSection.insertBefore(draggedCard, insertionPoint ?? null);
});

board.addEventListener("dragend", () => {
    draggedCard?.classList.remove("is-dragging");
    dropIndicator?.remove();
    draggedCard = null;
    dropSection = null;
    dropBefore = null;
    dropIndicator = null;
    board.querySelectorAll("section.is-drag-over").forEach((section) => {
        section.classList.remove("is-drag-over");
    });
});