
const API_URL = "/api";
const token = sessionStorage.getItem("spliaraToken");

let currentUser = null;
let allGroups = [];
let allExpenses = [];

let currentPage = 1;
const pageSize = 10;

// ========================================
// DOM ELEMENTS
// ========================================

const tableBody = document.getElementById("expensesTableBody");
const mobileList = document.getElementById("expensesMobileList");
const messageElement = document.getElementById("expensesMessage");

const searchInput = document.getElementById("expenseSearch");
const groupFilter = document.getElementById("groupFilter");
const minAmountFilter = document.getElementById("minAmountFilter");
const maxAmountFilter = document.getElementById("maxAmountFilter");

const applyFiltersBtn = document.getElementById("applyFiltersBtn");
const clearFiltersBtn = document.getElementById("clearFiltersBtn");

const previousPageBtn = document.getElementById("previousPageBtn");
const nextPageBtn = document.getElementById("nextPageBtn");

// ========================================
// AUTHENTICATION
// ========================================

if (!token) {
    window.location.href = "/";
}

// ========================================
// API REQUEST HANDLER
// ========================================

async function apiRequest(endpoint) {
    const response = await fetch(`${API_URL}${endpoint}`, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
        sessionStorage.removeItem("spliaraToken");
        window.location.href = "/";
        throw new Error("Your session has expired. Please log in again.");
    }

    if (!response.ok) {
        throw new Error(data.message || "Unable to load data.");
    }

    return data;
}

// ========================================
// HELPERS
// ========================================

function formatCurrency(amount) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    }).format(Number(amount) || 0);
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function formatDate(dateValue) {
    if (!dateValue) return "Date unavailable";

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
        return "Date unavailable";
    }

    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

function showMessage(message, type = "success") {
    if (!messageElement) return;

    messageElement.textContent = message;
    messageElement.className = type === "error" ? "error" : "";
}

// ========================================
// LOAD PROFILE
// ========================================

async function loadProfile() {
    const data = await apiRequest("/auth/profile");

    currentUser = data.user;

    const welcomeUser = document.getElementById("welcomeUser");

    if (welcomeUser && currentUser?.name) {
        welcomeUser.textContent = `Welcome, ${currentUser.name}!`;
    }
}

// ========================================
// LOAD GROUPS
// ========================================

async function loadGroups() {
    const data = await apiRequest("/groups");

    allGroups = data.groups || [];

    populateGroupFilter();
}

function populateGroupFilter() {
    if (!groupFilter) return;

    groupFilter.innerHTML = '<option value="">All groups</option>';

    allGroups.forEach(group => {
        const option = document.createElement("option");

        option.value = group.id;
        option.textContent = group.name;

        groupFilter.appendChild(option);
    });
}

// ========================================
// LOAD EXPENSES FROM ALL GROUPS
// ========================================

async function loadAllExpenses() {
    if (allGroups.length === 0) {
        allExpenses = [];
        return;
    }

    const requests = allGroups.map(async group => {
        const firstPage = await apiRequest(
            `/expenses?groupId=${encodeURIComponent(group.id)}&limit=100&page=1`
        );

        let expenses = [...(firstPage.expenses || [])];

        const totalPages = firstPage.pagination?.totalPages || 1;

        for (let page = 2; page <= totalPages; page++) {
            const pageData = await apiRequest(
                `/expenses?groupId=${encodeURIComponent(group.id)}&limit=100&page=${page}`
            );

            expenses.push(...(pageData.expenses || []));
        }

        return expenses.map(expense => ({
            ...expense,
            groupName: group.name,
            groupId: group.id
        }));
    });

    const results = await Promise.all(requests);

    allExpenses = results.flat();
}

// ========================================
// SUMMARY CARDS
// ========================================

function updateSummary() {
    const total = allExpenses.reduce((sum, expense) => {
        return sum + (Number(expense.amount) || 0);
    }, 0);

    const totalElement = document.getElementById(
        "expensesTotalAmount"
    );

    const transactionElement = document.getElementById(
        "expensesTransactionCount"
    );

    const groupElement = document.getElementById(
        "expensesGroupCount"
    );

    const groupsWithExpenses = new Set(
        allExpenses.map(expense => String(expense.groupId))
    );

    if (totalElement) {
        totalElement.textContent = formatCurrency(total);
    }

    if (transactionElement) {
        transactionElement.textContent = allExpenses.length;
    }

    if (groupElement) {
        groupElement.textContent = groupsWithExpenses.size;
    }
}

// ========================================
// FILTER EXPENSES
// ========================================

function getFilteredExpenses() {
    const searchValue = searchInput.value.trim().toLowerCase();

    const selectedGroup = groupFilter.value;

    const minValue = minAmountFilter.value.trim();
    const maxValue = maxAmountFilter.value.trim();

    const minAmount = minValue === "" ? null : Number(minValue);
    const maxAmount = maxValue === "" ? null : Number(maxValue);

    return allExpenses.filter(expense => {
        const description = String(
            expense.description || ""
        ).toLowerCase();

        const matchesSearch = description.includes(searchValue);

        const matchesGroup =
            !selectedGroup ||
            String(expense.groupId) === String(selectedGroup);

        const amount = Number(expense.amount) || 0;

        const matchesMinimum =
            minAmount === null || amount >= minAmount;

        const matchesMaximum =
            maxAmount === null || amount <= maxAmount;

        return (
            matchesSearch &&
            matchesGroup &&
            matchesMinimum &&
            matchesMaximum
        );
    });
}

// ========================================
// RENDER DESKTOP TABLE
// ========================================

function renderExpenseTable(expenses) {
    if (!tableBody) return;

    tableBody.replaceChildren();

    if (expenses.length === 0) {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td colspan="6" class="table-message">
                No expenses found. Try changing your search or filters.
            </td>
        `;

        tableBody.appendChild(row);
        return;
    }

    expenses.forEach(expense => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td>
                <div class="expense-description-cell">
                    <strong>${escapeHTML(expense.description)}</strong>
                    <span>Shared expense</span>
                </div>
            </td>

            <td>
                <span class="expense-group-tag">
                    ${escapeHTML(expense.groupName)}
                </span>
            </td>

            <td>
                <span class="expense-payer">
                    ${escapeHTML(
                        expense.payer_name ||
                        expense.paid_by_name ||
                        "Member"
                    )}
                </span>
            </td>

            <td>
                <span class="expense-date">
                    ${escapeHTML(formatDate(expense.created_at))}
                </span>
            </td>

            <td class="expense-amount">
                ${formatCurrency(expense.amount)}
            </td>

            <td>
                <span class="expense-date">—</span>
            </td>
        `;

        tableBody.appendChild(row);
    });
}

// ========================================
// RENDER MOBILE EXPENSE CARDS
// ========================================

function renderMobileExpenses(expenses) {
    if (!mobileList) return;

    mobileList.replaceChildren();

    if (expenses.length === 0) {
        const emptyMessage = document.createElement("p");

        emptyMessage.className = "table-message";
        emptyMessage.textContent =
            "No expenses found. Try changing your search or filters.";

        mobileList.appendChild(emptyMessage);
        return;
    }

    expenses.forEach(expense => {
        const card = document.createElement("article");

        card.className = "expenses-mobile-card";

        card.innerHTML = `
            <div class="mobile-expense-top">
                <div>
                    <h3>${escapeHTML(expense.description)}</h3>

                    <p>${escapeHTML(expense.groupName)}</p>
                </div>

                <span class="mobile-expense-amount">
                    ${formatCurrency(expense.amount)}
                </span>
            </div>

            <div class="mobile-expense-details">
                <span>
                    Paid by:
                    ${escapeHTML(
                        expense.payer_name ||
                        expense.paid_by_name ||
                        "Member"
                    )}
                </span>

                <span>
                    ${escapeHTML(formatDate(expense.created_at))}
                </span>
            </div>
        `;

        mobileList.appendChild(card);
    });
}

// ========================================
// PAGINATION
// ========================================

function updatePagination(total, totalPages) {
    const start = total === 0
        ? 0
        : (currentPage - 1) * pageSize + 1;

    const end = Math.min(currentPage * pageSize, total);

    const resultCount = document.getElementById(
        "expensesResultCount"
    );

    const paginationInfo = document.getElementById(
        "expensesPaginationInfo"
    );

    const currentPageInfo = document.getElementById(
        "currentPageInfo"
    );

    if (resultCount) {
        resultCount.textContent = `${total} expenses found`;
    }

    if (paginationInfo) {
        paginationInfo.textContent =
            `Showing ${start}–${end} of ${total} expenses`;
    }

    if (currentPageInfo) {
        currentPageInfo.textContent =
            `Page ${currentPage} of ${totalPages}`;
    }

    if (previousPageBtn) {
        previousPageBtn.disabled = currentPage <= 1;
    }

    if (nextPageBtn) {
        nextPageBtn.disabled = currentPage >= totalPages;
    }
}

// ========================================
// RENDER ALL EXPENSES
// ========================================

function renderExpenses() {
    const filteredExpenses = getFilteredExpenses();

    const total = filteredExpenses.length;

    const totalPages = Math.max(
        1,
        Math.ceil(total / pageSize)
    );

    if (currentPage > totalPages) {
        currentPage = totalPages;
    }

    const startIndex = (currentPage - 1) * pageSize;

    const visibleExpenses = filteredExpenses.slice(
        startIndex,
        startIndex + pageSize
    );

    renderExpenseTable(visibleExpenses);
    renderMobileExpenses(visibleExpenses);

    updatePagination(total, totalPages);
}

// ========================================
// APPLY FILTERS
// ========================================

function applyFilters() {
    const minValue = minAmountFilter.value.trim();
    const maxValue = maxAmountFilter.value.trim();

    if (
        (minValue !== "" && (!Number.isFinite(Number(minValue)) || Number(minValue) < 0)) ||
        (maxValue !== "" && (!Number.isFinite(Number(maxValue)) || Number(maxValue) < 0))
    ) {
        showMessage("Please enter valid non-negative amounts.", "error");
        return;
    }

    if (
        minValue !== "" &&
        maxValue !== "" &&
        Number(minValue) > Number(maxValue)
    ) {
        showMessage(
            "Minimum amount cannot be greater than maximum amount.",
            "error"
        );
        return;
    }

    currentPage = 1;
    showMessage("");
    renderExpenses();
}

// ========================================
// CLEAR FILTERS
// ========================================

function clearFilters() {
    searchInput.value = "";
    groupFilter.value = "";
    minAmountFilter.value = "";
    maxAmountFilter.value = "";

    currentPage = 1;

    showMessage("");
    renderExpenses();
}

// ========================================
// FILTER EVENT LISTENERS
// ========================================

if (applyFiltersBtn) {
    applyFiltersBtn.addEventListener("click", applyFilters);
}

if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener("click", clearFilters);
}

if (searchInput) {
    searchInput.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            applyFilters();
        }
    });
}

[
    groupFilter,
    minAmountFilter,
    maxAmountFilter
].forEach(element => {
    element?.addEventListener("change", applyFilters);
});

// ========================================
// PAGINATION EVENTS
// ========================================

if (previousPageBtn) {
    previousPageBtn.addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage--;
            renderExpenses();
        }
    });
}

if (nextPageBtn) {
    nextPageBtn.addEventListener("click", () => {
        const totalPages = Math.max(
            1,
            Math.ceil(getFilteredExpenses().length / pageSize)
        );

        if (currentPage < totalPages) {
            currentPage++;
            renderExpenses();
        }
    });
}

// ========================================
// LOGOUT
// ========================================

const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
        sessionStorage.removeItem("spliaraToken");
        window.location.href = "/";
    });
}

// ========================================
// MOBILE SIDEBAR
// ========================================

const sidebar = document.getElementById("sidebar");
const menuToggle = document.getElementById("menuToggle");
const sidebarCloseBtn = document.getElementById("sidebarCloseBtn");
const sidebarOverlay = document.getElementById("sidebarOverlay");

function closeSidebar() {
    sidebar?.classList.remove("open");
    sidebarOverlay?.classList.remove("active");
}

menuToggle?.addEventListener("click", () => {
    sidebar?.classList.add("open");
    sidebarOverlay?.classList.add("active");
});

sidebarCloseBtn?.addEventListener("click", closeSidebar);
sidebarOverlay?.addEventListener("click", closeSidebar);

// ========================================
// INITIALIZE PAGE
// ========================================

async function initializeExpensesPage() {
    if (!token) return;

    try {
        showMessage("Loading your expenses...");

        // Load profile and groups simultaneously
        const results = await Promise.allSettled([
            loadProfile(),
            loadGroups()
        ]);

        // Handle profile loading failure
        if (results[0].status === "rejected") {
            console.error(
                "Profile loading error:",
                results[0].reason
            );
        }

        // Groups are required for loading expenses
        if (results[1].status === "rejected") {
            throw results[1].reason;
        }

        // Load expenses after groups are available
        await loadAllExpenses();

        updateSummary();
        renderExpenses();

        showMessage("");

    } catch (error) {
        console.error("Expenses page error:", error);

        showMessage(error.message, "error");

        if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="table-message error">
                        Unable to load expenses. Please refresh the page.
                    </td>
                </tr>
            `;
        }

        if (mobileList) {
            mobileList.textContent =
                "Unable to load expenses. Please refresh the page.";
        }
    }
}

initializeExpensesPage();
