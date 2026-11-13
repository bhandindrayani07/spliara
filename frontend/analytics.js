
const API_URL = "/api";
const token = sessionStorage.getItem("spliaraToken");

let groups = [];
let allExpenses = [];
let currentGroupId = "";

const elements = {
    welcomeUser: document.getElementById("welcomeUser"),
    groupFilter: document.getElementById("analyticsGroupFilter"),

    totalExpenses: document.getElementById("totalExpenses"),
    averageExpense: document.getElementById("averageExpense"),
    totalTransactions: document.getElementById("totalTransactions"),
    highestExpense: document.getElementById("highestExpense"),
    highestExpenseName: document.getElementById("highestExpenseName"),

    monthlyChart: document.getElementById("monthlyChart"),
    categoryChart: document.getElementById("categoryChart"),
    categoryLegend: document.getElementById("categoryLegend"),

    groupComparison: document.getElementById("groupComparison"),

    recentExpensesBody: document.getElementById("recentExpensesBody"),
    recentExpensesMobile: document.getElementById("recentExpensesMobile"),

    message: document.getElementById("analyticsMessage")
};

// ==========================================
// API REQUEST
// ==========================================

async function apiRequest(endpoint) {
    const response = await fetch(`${API_URL}${endpoint}`, {
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
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
        throw new Error(data.message || "Unable to load data.");
    }

    return data;
}

// ==========================================
// HELPERS
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

function getGroupId(group) {
    return Number(group.id ?? group.groupId);
}

function getGroupName(group) {
    return group.name || group.groupName || `Group ${getGroupId(group)}`;
}

function getExpenseAmount(expense) {
    return Number(
        expense.amount ??
        expense.totalAmount ??
        expense.total_amount ??
        0
    );
}

function getExpenseName(expense) {
    return (
        expense.description ||
        expense.title ||
        expense.name ||
        "Untitled expense"
    );
}

function getExpenseCategory(expense) {
    return (
        expense.category ||
        expense.category_name ||
        expense.expenseCategory ||
        "Uncategorized"
    );
}

function getExpenseDate(expense) {
    return (
        expense.expenseDate ||
        expense.expense_date ||
        expense.date ||
        expense.createdAt ||
        expense.created_at ||
        null
    );
}

function getPaidByName(expense) {
    return (
        expense.paidByName ||
        expense.paid_by_name ||
        expense.payerName ||
        expense.payer_name ||
        expense.paidBy?.name ||
        expense.payer?.name ||
        "Unknown"
    );
}

function getDateObject(value) {
    if (!value) return null;

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
    const date = getDateObject(value);

    if (!date) return "Date unavailable";

    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

function showMessage(message, type = "success") {
    elements.message.textContent = message;
    elements.message.className =
        type === "error" ? "analytics-message error" : "analytics-message";
}

// ==========================================
// SIDEBAR
// ==========================================

const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("sidebarOverlay");

document.getElementById("menuToggle")?.addEventListener("click", () => {
    sidebar?.classList.add("open");
    overlay?.classList.add("active");
});

function closeSidebar() {
    sidebar?.classList.remove("open");
    overlay?.classList.remove("active");
}

document.getElementById("sidebarCloseBtn")?.addEventListener("click", closeSidebar);
overlay?.addEventListener("click", closeSidebar);

document.getElementById("logoutBtn")?.addEventListener("click", () => {
    if (!confirm("Are you sure you want to logout?")) return;

    sessionStorage.removeItem("spliaraToken");
    window.location.href = "/";
});

// ==========================================
// LOAD USER
// ==========================================

async function loadUser() {
    const data = await apiRequest("/auth/profile");

    const user = data.user;

    if (!user) {
        throw new Error("Unable to load your profile.");
    }

    elements.welcomeUser.textContent =
        `Welcome, ${user.name || "User"}!`;
}

// ==========================================
// LOAD GROUPS
// ==========================================

async function loadGroups() {
    const data = await apiRequest("/groups");

    groups = data.groups || [];

    elements.groupFilter.innerHTML = `
        <option value="">All Groups</option>
    `;

    groups.forEach(group => {
        const option = document.createElement("option");

        option.value = getGroupId(group);
        option.textContent = getGroupName(group);

        elements.groupFilter.appendChild(option);
    });
}

// ==========================================
// LOAD EXPENSES
// ==========================================

async function loadExpenses() {
    allExpenses = [];

    const results = await Promise.allSettled(
        groups.map(async group => {
            const groupId = getGroupId(group);

            const data = await apiRequest(
                `/expenses?groupId=${groupId}&limit=100&page=1`
            );

            const expenses = data.expenses || [];

            return expenses.map(expense => ({
                ...expense,
                analyticsGroupId: groupId,
                analyticsGroupName: getGroupName(group)
            }));
        })
    );

    results.forEach((result, index) => {
        if (result.status === "fulfilled") {
            allExpenses.push(...result.value);
        } else {
            console.error(
                `Could not load expenses for ${getGroupName(groups[index])}:`,
                result.reason
            );
        }
    });
}

// ==========================================
// FILTER EXPENSES
// ==========================================

function getFilteredExpenses() {
    if (!currentGroupId) {
        return allExpenses;
    }

    return allExpenses.filter(expense =>
        Number(expense.analyticsGroupId) === Number(currentGroupId)
    );
}

// ==========================================
// SUMMARY CARDS
// ==========================================

function renderSummary(expenses) {
    const total = expenses.reduce(
        (sum, expense) => sum + getExpenseAmount(expense),
        0
    );

    const average = expenses.length ? total / expenses.length : 0;

    const highest = expenses.reduce((max, expense) => {
        return getExpenseAmount(expense) > getExpenseAmount(max)
            ? expense
            : max;
    }, expenses[0] || null);

    elements.totalExpenses.textContent = formatCurrency(total);

    elements.averageExpense.textContent = formatCurrency(average);

    elements.totalTransactions.textContent = expenses.length;

    elements.highestExpense.textContent = formatCurrency(
        highest ? getExpenseAmount(highest) : 0
    );

    elements.highestExpenseName.textContent = highest
        ? getExpenseName(highest)
        : "No expenses yet";
}

// ==========================================
// MONTHLY SPENDING CHART
// ==========================================

function renderMonthlyChart(expenses) {
    const months = [];
    const today = new Date();

    for (let i = 5; i >= 0; i--) {
        const date = new Date(
            today.getFullYear(),
            today.getMonth() - i,
            1
        );

        months.push({
            year: date.getFullYear(),
            month: date.getMonth(),
            label: date.toLocaleDateString("en-IN", {
                month: "short"
            }),
            total: 0
        });
    }

    expenses.forEach(expense => {
        const date = getDateObject(getExpenseDate(expense));

        if (!date) return;

        const month = months.find(item =>
            item.year === date.getFullYear() &&
            item.month === date.getMonth()
        );

        if (month) {
            month.total += getExpenseAmount(expense);
        }
    });

    const maximum = Math.max(
        ...months.map(month => month.total),
        1
    );

    elements.monthlyChart.innerHTML = `
        <div class="monthly-chart">
            ${months.map(month => {
                const height = month.total
                    ? Math.max((month.total / maximum) * 100, 3)
                    : 0;

                return `
                    <div class="monthly-bar-item">

                        <span class="monthly-bar-value">
                            ${month.total
                                ? formatCurrency(month.total)
                                : "—"}
                        </span>

                        <div class="monthly-bar-track">
                            <div
                                class="monthly-bar"
                                style="height: ${height}%"
                            ></div>
                        </div>

                        <span class="monthly-bar-label">
                            ${month.label}
                        </span>

                    </div>
                `;
            }).join("")}
        </div>
    `;
}

// ==========================================
// CATEGORY BREAKDOWN
// ==========================================

function renderCategoryChart(expenses) {
    const categoryTotals = {};

    expenses.forEach(expense => {
        const category = getExpenseCategory(expense);

        categoryTotals[category] =
            (categoryTotals[category] || 0) +
            getExpenseAmount(expense);
    });

    const categories = Object.entries(categoryTotals)
        .filter(([, amount]) => amount > 0)
        .sort((a, b) => b[1] - a[1]);

    const total = categories.reduce(
        (sum, category) => sum + category[1],
        0
    );

    const colors = [
        "#879477",
        "#b4a58a",
        "#c5b9a3",
        "#66745e",
        "#d3cbb8",
        "#a1aa8e",
        "#8c8271"
    ];

    if (!categories.length) {
        elements.categoryChart.innerHTML = `
            <div class="analytics-empty">
                No category data available yet.
            </div>
        `;

        elements.categoryLegend.innerHTML = "";
        return;
    }

    let currentPercentage = 0;

    const gradientParts = categories.map((category, index) => {
        const percentage = category[1] / total * 100;

        const start = currentPercentage;
        const end = start + percentage;

        currentPercentage = end;

        return `${colors[index % colors.length]} ${start}% ${end}%`;
    });

    elements.categoryChart.innerHTML = `
        <div class="category-chart-layout">

            <div
                class="category-donut"
                style="background: conic-gradient(${gradientParts.join(", ")})"
            >

                <div class="category-donut-center">
                    <strong>${formatCurrency(total)}</strong>
                    <span>Total spending</span>
                </div>

            </div>

        </div>
    `;

    elements.categoryLegend.innerHTML = categories.map(
        (category, index) => `
            <div class="category-legend-item">

                <span
                    class="category-legend-dot"
                    style="background: ${colors[index % colors.length]}"
                ></span>

                <span class="category-legend-name">
                    ${escapeHTML(category[0])}
                </span>

                <span class="category-legend-value">
                    ${formatCurrency(category[1])}
                </span>

            </div>
        `
    ).join("");
}

// ==========================================
// GROUP-WISE SPENDING
// ==========================================

function renderGroupComparison(expenses) {
    const totals = {};

    expenses.forEach(expense => {
        const groupId = expense.analyticsGroupId;

        if (!totals[groupId]) {
            totals[groupId] = {
                name: expense.analyticsGroupName,
                total: 0
            };
        }

        totals[groupId].total += getExpenseAmount(expense);
    });

    const groupTotals = Object.values(totals)
        .sort((a, b) => b.total - a.total);

    if (!groupTotals.length) {
        elements.groupComparison.innerHTML = `
            <div class="analytics-empty">
                No group spending data available.
            </div>
        `;

        return;
    }

    const maximum = Math.max(
        ...groupTotals.map(group => group.total),
        1
    );

    elements.groupComparison.innerHTML = `
        <div class="group-comparison-list">

            ${groupTotals.map(group => {
                const percentage = group.total / maximum * 100;

                return `
                    <div class="group-comparison-item">

                        <div class="group-comparison-top">

                            <span class="group-comparison-name">
                                ${escapeHTML(group.name)}
                            </span>

                            <span class="group-comparison-amount">
                                ${formatCurrency(group.total)}
                            </span>

                        </div>

                        <div class="group-comparison-track">

                            <div
                                class="group-comparison-bar"
                                style="width: ${percentage}%"
                            ></div>

                        </div>

                    </div>
                `;
            }).join("")}

        </div>
    `;
}

// ==========================================
// RECENT EXPENSES
// ==========================================

function renderRecentExpenses(expenses) {
    const recent = [...expenses]
        .sort((a, b) => {
            const dateA = getDateObject(getExpenseDate(a))?.getTime() || 0;
            const dateB = getDateObject(getExpenseDate(b))?.getTime() || 0;

            return dateB - dateA;
        })
        .slice(0, 8);

    if (!recent.length) {
        elements.recentExpensesBody.innerHTML = `
            <tr>
                <td colspan="5" class="table-message">
                    No expenses found.
                </td>
            </tr>
        `;

        elements.recentExpensesMobile.innerHTML = `
            <div class="analytics-empty">
                No expenses found.
            </div>
        `;

        return;
    }

    elements.recentExpensesBody.innerHTML = recent.map(expense => `
        <tr>

            <td>${escapeHTML(getExpenseName(expense))}</td>

            <td>${escapeHTML(expense.analyticsGroupName)}</td>

            <td>${escapeHTML(getPaidByName(expense))}</td>

            <td>${formatDate(getExpenseDate(expense))}</td>

            <td class="amount-cell">
                ${formatCurrency(getExpenseAmount(expense))}
            </td>

        </tr>
    `).join("");

    elements.recentExpensesMobile.innerHTML = recent.map(expense => `
        <article class="recent-expense-card">

            <div class="recent-expense-card-top">

                <strong>
                    ${escapeHTML(getExpenseName(expense))}
                </strong>

                <strong class="recent-expense-card-amount">
                    ${formatCurrency(getExpenseAmount(expense))}
                </strong>

            </div>

            <p>
                Group: ${escapeHTML(expense.analyticsGroupName)}
            </p>

            <p>
                Paid by: ${escapeHTML(getPaidByName(expense))}
            </p>

            <p>
                ${formatDate(getExpenseDate(expense))}
            </p>

        </article>
    `).join("");
}

// ==========================================
// RENDER ALL ANALYTICS
// ==========================================

function renderAnalytics() {
    const expenses = getFilteredExpenses();

    renderSummary(expenses);
    renderMonthlyChart(expenses);
    renderCategoryChart(expenses);
    renderGroupComparison(expenses);
    renderRecentExpenses(expenses);
}

// ==========================================
// GROUP FILTER
// ==========================================

elements.groupFilter.addEventListener("change", () => {
    currentGroupId = elements.groupFilter.value;
    renderAnalytics();
});

// ==========================================
// INITIALIZE ANALYTICS
// ==========================================

async function initializeAnalytics() {
    if (!token) {
        window.location.href = "/";
        return;
    }

    try {
        await loadUser();
        await loadGroups();
        await loadExpenses();

        renderAnalytics();

        showMessage("");

    } catch (error) {
        console.error("Analytics error:", error);

        showMessage(
            error.message || "Unable to load analytics.",
            "error"
        );

        elements.monthlyChart.innerHTML = `
            <div class="analytics-empty">
                Unable to load monthly data.
            </div>
        `;

        elements.categoryChart.innerHTML = `
            <div class="analytics-empty">
                Unable to load category data.
            </div>
        `;

        elements.groupComparison.innerHTML = `
            <div class="analytics-empty">
                Unable to load group data.
            </div>
        `;

        elements.recentExpensesBody.innerHTML = `
            <tr>
                <td colspan="5" class="table-message">
                    Unable to load expenses.
                </td>
            </tr>
        `;
    }
}

initializeAnalytics();
