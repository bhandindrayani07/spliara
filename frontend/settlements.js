
const API_URL = "/api";
const token = sessionStorage.getItem("spliaraToken");

let currentUser = null;
let currentUserId = null;

let groups = [];
let groupFinancialData = [];
let settlementHistory = [];

let currentSuggestions = [];
let selectedGroupSuggestions = [];

const elements = {
    welcomeUser: document.getElementById("welcomeUser"),

    oweAmount: document.getElementById("settlementsOweAmount"),
    receiveAmount: document.getElementById("settlementsReceiveAmount"),
    settlementCount: document.getElementById("settlementsCount"),

    suggestionList: document.getElementById("suggestedSettlementsList"),
    suggestionCount: document.getElementById("suggestedSettlementCount"),

    settlementForm: document.getElementById("settlementForm"),
    settlementGroup: document.getElementById("settlementGroup"),
    settlementReceiver: document.getElementById("settlementReceiver"),
    settlementAmount: document.getElementById("settlementAmount"),
    recordButton: document.getElementById("recordSettlementBtn"),

    historyCount: document.getElementById("settlementHistoryCount"),
    historyGroupFilter: document.getElementById("historyGroupFilter"),
    historyBody: document.getElementById("settlementHistoryBody"),
    historyMobile: document.getElementById("settlementHistoryMobile"),

    message: document.getElementById("settlementsMessage")
};

// ==========================================
// API REQUEST HELPER
// ==========================================

async function apiRequest(endpoint, options = {}) {
    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...options.headers
        }
    });

    let data;

    try {
        data = await response.json();
    } catch {
        data = {};
    }

    if (response.status === 401) {
        sessionStorage.removeItem("spliaraToken");
        window.location.href = "/";
        throw new Error("Your session has expired.");
    }

    if (!response.ok) {
        throw new Error(data.message || "Something went wrong.");
    }

    return data;
}

// ==========================================
// GENERAL HELPERS
// ==========================================

function formatCurrency(amount) {
    return Number(amount || 0).toLocaleString("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        };

        return entities[character];
    });
}

function getInitial(name) {
    return String(name || "?").trim().charAt(0).toUpperCase();
}

function showMessage(message, type = "success") {
    elements.message.textContent = message;
    elements.message.className = type === "error" ? "error" : "";

    if (!message) {
        elements.message.className = "";
    }
}

function getUserId(user) {
    return Number(user?.id ?? user?.userId);
}

function getGroupName(group) {
    return group.name || group.groupName || `Group ${group.id}`;
}

function getTodayDate(value) {
    if (!value) return "Date unavailable";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "Date unavailable";
    }

    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

// ==========================================
// SIDEBAR AND LOGOUT
// ==========================================

const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("sidebarOverlay");

document.getElementById("menuToggle")?.addEventListener("click", () => {
    sidebar?.classList.add("open");
    overlay?.classList.add("active");
});

document.getElementById("sidebarCloseBtn")?.addEventListener(
    "click",
    closeSidebar
);

overlay?.addEventListener("click", closeSidebar);

function closeSidebar() {
    sidebar?.classList.remove("open");
    overlay?.classList.remove("active");
}

document.getElementById("logoutBtn")?.addEventListener("click", () => {
    if (!confirm("Are you sure you want to logout?")) {
        return;
    }

    sessionStorage.removeItem("spliaraToken");
    window.location.href = "/";
});

// ==========================================
// LOAD USER PROFILE
// ==========================================

async function loadUserProfile() {
    const data = await apiRequest("/auth/profile");

    currentUser = data.user;

    if (!currentUser) {
        throw new Error("Unable to identify your account.");
    }

    currentUserId = getUserId(currentUser);

    if (!Number.isInteger(currentUserId) || currentUserId <= 0) {
        throw new Error("Your account ID could not be identified.");
    }

    if (elements.welcomeUser) {
        elements.welcomeUser.textContent =
            `Welcome, ${currentUser.name || "User"}!`;
    }
}

// ==========================================
// LOAD GROUPS
// ==========================================

async function loadGroups() {
    const data = await apiRequest("/groups");

    groups = data.groups || [];

    elements.settlementGroup.innerHTML = `
        <option value="">Choose a group</option>
    `;

    elements.historyGroupFilter.innerHTML = `
        <option value="">All groups</option>
    `;

    groups.forEach(group => {
        const name = escapeHTML(getGroupName(group));

        elements.settlementGroup.insertAdjacentHTML(
            "beforeend",
            `<option value="${group.id}">${name}</option>`
        );

        elements.historyGroupFilter.insertAdjacentHTML(
            "beforeend",
            `<option value="${group.id}">${name}</option>`
        );
    });
}

// ==========================================
// LOAD FINANCIAL DATA FOR EACH GROUP
// ONE REQUEST PER GROUP
// ==========================================

async function loadGroupFinancialData() {
    groupFinancialData = [];
    currentSuggestions = [];

    const results = await Promise.allSettled(
        groups.map(async group => {
            const balanceData = await apiRequest(
                `/finance/groups/${group.id}/balances`
            );

            return {
                groupId: Number(group.id),
                groupName: getGroupName(group),
                balances: balanceData.balances || [],
                transactions: balanceData.transactions || []
            };
        })
    );

    results.forEach((result, index) => {
        if (result.status === "fulfilled") {
            groupFinancialData.push(result.value);
        } else {
            console.error(
                `Unable to load financial data for ${getGroupName(groups[index])}:`,
                result.reason
            );
        }
    });

    groupFinancialData.forEach(groupData => {
        groupData.transactions.forEach(transaction => {
            currentSuggestions.push({
                ...transaction,
                groupId: groupData.groupId,
                groupName: groupData.groupName
            });
        });
    });
}

// ==========================================
// UPDATE SUMMARY CARDS
// ==========================================

function updateSummary() {
    let totalOwed = 0;
    let totalToReceive = 0;

    groupFinancialData.forEach(groupData => {
        groupData.balances.forEach(member => {
            if (Number(member.userId) !== currentUserId) {
                return;
            }

            const balance = Number(member.balance || 0);

            if (balance < 0) {
                totalOwed += Math.abs(balance);
            } else if (balance > 0) {
                totalToReceive += balance;
            }
        });
    });

    elements.oweAmount.textContent = formatCurrency(totalOwed);
    elements.receiveAmount.textContent = formatCurrency(totalToReceive);
}

// ==========================================
// SUGGESTED SETTLEMENTS
// ==========================================

function renderSuggestions() {
    elements.suggestionCount.textContent =
        `${currentSuggestions.length} suggested`;

    if (currentSuggestions.length === 0) {
        elements.suggestionList.innerHTML = `
            <div class="settlement-empty">
                <strong>You're all settled!</strong>
                <br>
                No outstanding payments were found across your groups.
            </div>
        `;

        return;
    }

    const cards = currentSuggestions.map(transaction => {
        const iAmPayer =
            Number(transaction.from.userId) === currentUserId;

        const iAmReceiver =
            Number(transaction.to.userId) === currentUserId;

        let description;

        if (iAmPayer) {
            description = `
                You need to pay
                <strong>${escapeHTML(transaction.to.name)}</strong>
            `;
        } else if (iAmReceiver) {
            description = `
                <strong>${escapeHTML(transaction.from.name)}</strong>
                needs to pay you
            `;
        } else {
            description = `
                <strong>${escapeHTML(transaction.from.name)}</strong>
                pays
                <strong>${escapeHTML(transaction.to.name)}</strong>
            `;
        }

        const actionButton = iAmPayer
            ? `
                <button
                    type="button"
                    class="settlement-record-btn"
                    data-group-id="${transaction.groupId}"
                    data-receiver-id="${transaction.to.userId}"
                    data-amount="${transaction.amount}"
                >
                    Record payment
                </button>
            `
            : "";

        return `
            <article class="settlement-suggestion">

                <div class="settlement-suggestion-info">

                    <div class="settlement-avatar">
                        ${getInitial(
                            iAmPayer
                                ? transaction.to.name
                                : transaction.from.name
                        )}
                    </div>

                    <div class="settlement-suggestion-details">
                        <h3>${escapeHTML(transaction.groupName)}</h3>
                        <p>${description}</p>
                    </div>

                </div>

                <div class="settlement-suggestion-action">

                    <span class="settlement-suggestion-amount">
                        ${formatCurrency(transaction.amount)}
                    </span>

                    ${actionButton}

                </div>

            </article>
        `;
    });

    elements.suggestionList.innerHTML = cards.join("");
}

// ==========================================
// GROUP SELECTION AND RECEIVER OPTIONS
// ==========================================

function updateReceiverOptions() {
    const groupId = Number(elements.settlementGroup.value);

    elements.settlementReceiver.innerHTML = `
        <option value="">Choose a member</option>
    `;

    elements.settlementReceiver.disabled = true;
    elements.settlementAmount.value = "";

    showMessage("");

    selectedGroupSuggestions = currentSuggestions.filter(transaction =>
        Number(transaction.groupId) === groupId &&
        Number(transaction.from.userId) === currentUserId
    );

    if (!groupId) {
        return;
    }

    const selectedGroup = groupFinancialData.find(groupData =>
        Number(groupData.groupId) === groupId
    );

    if (!selectedGroup) {
        elements.settlementReceiver.innerHTML = `
            <option value="">Group members unavailable</option>
        `;

        showMessage(
            "Unable to load this group's members. Please refresh the page.",
            "error"
        );

        return;
    }

    const otherMembers = selectedGroup.balances.filter(member =>
        Number(member.userId) !== currentUserId
    );

    if (otherMembers.length === 0) {
        elements.settlementReceiver.innerHTML = `
            <option value="">No other members found</option>
        `;

        return;
    }

    otherMembers.forEach(member => {
        const option = document.createElement("option");

        option.value = member.userId;
        option.textContent = member.name;

        elements.settlementReceiver.appendChild(option);
    });

    elements.settlementReceiver.disabled = false;
}

elements.settlementGroup.addEventListener(
    "change",
    updateReceiverOptions
);

// ==========================================
// RECEIVER SELECTION
// ==========================================

elements.settlementReceiver.addEventListener("change", () => {
    const receiverId = Number(elements.settlementReceiver.value);

    elements.settlementAmount.value = "";

    if (!receiverId) {
        showMessage("");
        return;
    }

    const matchingSuggestions = selectedGroupSuggestions.filter(
        transaction => Number(transaction.to.userId) === receiverId
    );

    const outstandingAmount = matchingSuggestions.reduce(
        (total, transaction) =>
            total + Number(transaction.amount),
        0
    );

    if (outstandingAmount > 0) {
        elements.settlementAmount.value =
            outstandingAmount.toFixed(2);

        showMessage("");
    } else {
        showMessage(
            "You currently have no outstanding payment to this member.",
            "error"
        );
    }
});

// ==========================================
// FILL FORM FROM SUGGESTION
// ==========================================

elements.suggestionList.addEventListener("click", event => {
    const button = event.target.closest(".settlement-record-btn");

    if (!button) return;

    const groupId = Number(button.dataset.groupId);
    const receiverId = Number(button.dataset.receiverId);
    const amount = Number(button.dataset.amount);

    elements.settlementGroup.value = String(groupId);

    updateReceiverOptions();

    elements.settlementReceiver.value = String(receiverId);
    elements.settlementAmount.value = amount.toFixed(2);

    elements.settlementForm.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });

    elements.settlementAmount.focus();

    showMessage(
        "Review the payment details before recording the settlement."
    );
});

// ==========================================
// RECORD SETTLEMENT
// ==========================================

elements.settlementForm.addEventListener("submit", async event => {
    event.preventDefault();

    showMessage("");

    const groupId = Number(elements.settlementGroup.value);
    const receivedBy = Number(elements.settlementReceiver.value);
    const amount = Number(elements.settlementAmount.value);

    if (
        !Number.isInteger(groupId) ||
        !Number.isInteger(receivedBy) ||
        receivedBy <= 0 ||
        !Number.isFinite(amount) ||
        amount <= 0
    ) {
        showMessage(
            "Please enter valid settlement details.",
            "error"
        );

        return;
    }

    const matchingSuggestions = selectedGroupSuggestions.filter(
        transaction => Number(transaction.to.userId) === receivedBy
    );

    const outstandingAmount = matchingSuggestions.reduce(
        (total, transaction) =>
            total + Number(transaction.amount),
        0
    );

    if (outstandingAmount <= 0) {
        showMessage(
            "You don't currently owe this member any money.",
            "error"
        );

        return;
    }

    if (amount > outstandingAmount + 0.001) {
        showMessage(
            `The outstanding suggested amount is ${formatCurrency(outstandingAmount)}.`,
            "error"
        );

        return;
    }

    const receiverName = matchingSuggestions[0].to.name;

    const confirmed = confirm(
        `Confirm that you have already paid ${receiverName} ${formatCurrency(amount)}?\n\nThis will record the payment in Spliara and update the group balance. It will NOT transfer money.`
    );

    if (!confirmed) return;

    elements.recordButton.disabled = true;
    elements.recordButton.textContent = "Recording...";

    try {
        const data = await apiRequest(
            `/finance/groups/${groupId}/settlements`,
            {
                method: "POST",
                body: JSON.stringify({
                    receivedBy,
                    amount
                })
            }
        );

        showMessage(
            data.message || "Settlement recorded successfully."
        );

        elements.settlementForm.reset();
        elements.settlementReceiver.disabled = true;

        await refreshSettlementData();

    } catch (error) {
        console.error("Record settlement error:", error);

        showMessage(
            error.message || "Unable to record settlement.",
            "error"
        );

    } finally {
        elements.recordButton.disabled = false;
        elements.recordButton.textContent = "Record Settlement";
    }
});

// ==========================================
// LOAD SETTLEMENT HISTORY
// ==========================================

async function loadSettlementHistory() {
    const data = await apiRequest("/finance/settlements");

    settlementHistory = data.settlements || [];

    elements.settlementCount.textContent =
        String(settlementHistory.length);

    renderSettlementHistory();
}

// ==========================================
// RENDER SETTLEMENT HISTORY
// ==========================================

function renderSettlementHistory() {
    const selectedGroupId = elements.historyGroupFilter.value;

    const filteredHistory = settlementHistory.filter(settlement => {
        return (
            !selectedGroupId ||
            Number(settlement.groupId) === Number(selectedGroupId)
        );
    });

    elements.historyCount.textContent =
        `${filteredHistory.length} payments`;

    if (filteredHistory.length === 0) {
        elements.historyBody.innerHTML = `
            <tr>
                <td colspan="5" class="table-message">
                    No settlement history found.
                </td>
            </tr>
        `;

        elements.historyMobile.innerHTML = `
            <div class="settlement-empty">
                No settlement history found.
            </div>
        `;

        return;
    }

    elements.historyBody.innerHTML = filteredHistory.map(settlement => `
        <tr>
            <td>${escapeHTML(settlement.paidByName)}</td>

            <td>${escapeHTML(settlement.receivedByName)}</td>

            <td>${escapeHTML(settlement.groupName)}</td>

            <td>${getTodayDate(settlement.settlementDate)}</td>

            <td class="settlement-paid-amount">
                ${formatCurrency(settlement.amount)}
            </td>
        </tr>
    `).join("");

    elements.historyMobile.innerHTML = filteredHistory.map(settlement => `
        <article class="settlement-mobile-card">

            <div class="settlement-mobile-card-top">
                <span>${escapeHTML(settlement.groupName)}</span>

                <strong>
                    ${formatCurrency(settlement.amount)}
                </strong>
            </div>

            <p>
                <strong>Paid by:</strong>
                ${escapeHTML(settlement.paidByName)}
            </p>

            <p>
                <strong>Received by:</strong>
                ${escapeHTML(settlement.receivedByName)}
            </p>

            <p>
                <strong>Date:</strong>
                ${getTodayDate(settlement.settlementDate)}
            </p>

        </article>
    `).join("");
}

elements.historyGroupFilter.addEventListener(
    "change",
    renderSettlementHistory
);

// ==========================================
// REFRESH ALL SETTLEMENT DATA
// ==========================================

async function refreshSettlementData() {
    // Financial data and settlement history are independent.
    // Load them simultaneously instead of waiting for each one.
    await Promise.all([
        loadGroupFinancialData(),
        loadSettlementHistory()
    ]);

    updateSummary();
    renderSuggestions();
}

// ==========================================
// INITIALIZE PAGE
// ==========================================

async function initializeSettlementsPage() {
    if (!token) {
        window.location.href = "/";
        return;
    }

    try {
        // Profile and groups do not depend on each other.
        // Start both requests simultaneously.
        await Promise.all([
            loadUserProfile(),
            loadGroups()
        ]);

        // Load financial data and history simultaneously.
        await refreshSettlementData();

    } catch (error) {
        console.error("Settlements page error:", error);

        showMessage(
            error.message || "Unable to load the settlements page.",
            "error"
        );

        elements.suggestionList.innerHTML = `
            <div class="settlement-empty">
                Unable to load settlement suggestions.
                Please refresh the page and try again.
            </div>
        `;

        elements.historyBody.innerHTML = `
            <tr>
                <td colspan="5" class="table-message">
                    Unable to load settlement history.
                </td>
            </tr>
        `;
    }
}

initializeSettlementsPage();
