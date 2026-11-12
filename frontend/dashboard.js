
const API_URL = "/api";
const token = sessionStorage.getItem("spliaraToken");

const dashboardMessage = document.getElementById("dashboardMessage");

let currentUser = null;
let allGroups = [];
let allExpenses = [];
let spendingChart = null;

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

    if (response.status === 401 || response.status === 403) {
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
// DASHBOARD MESSAGES
// ========================================

function showMessage(message, type = "success") {
    if (!dashboardMessage) return;

    dashboardMessage.textContent = message;
    dashboardMessage.className = type === "error" ? "error" : "";
}

// ========================================
// CURRENCY FORMATTER
// ========================================

function formatCurrency(amount) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    }).format(Number(amount) || 0);
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

    updateGroupCount(allGroups.length);
    updateTotalExpenses(allGroups);

    return allGroups;
}

// ========================================
// UPDATE SUMMARY CARDS
// ========================================

function updateGroupCount(count) {
    const element = document.getElementById("dashboardGroupCount");

    if (element) {
        element.textContent = count;
    }
}

function updateTotalExpenses(groups) {
    const total = groups.reduce((sum, group) => {
        return sum + Number(group.total_expenses || 0);
    }, 0);

    const element = document.getElementById("dashboardTotalExpenses");

    if (element) {
        element.textContent = formatCurrency(total);
    }
}

// ========================================
// LOAD EXPENSES FROM ALL GROUPS
// ========================================

async function loadAllExpenses(groups) {
    if (groups.length === 0) {
        allExpenses = [];
        return [];
    }

    const requests = groups.map(async group => {
        try {
            const firstPage = await apiRequest(
                `/expenses?groupId=${encodeURIComponent(group.id)}&limit=100&page=1`
            );

            let expenses = [...(firstPage.expenses || [])];

            const totalPages = firstPage.pagination?.totalPages || 1;

            // Fetch remaining pages
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

        } catch (error) {
            console.error(
                `Could not load expenses for ${group.name}:`,
                error.message
            );

            return [];
        }
    });

    const results = await Promise.all(requests);

    allExpenses = results.flat();

    return allExpenses;
}

// ========================================
// SIX-MONTH DATE RANGE
// ========================================

function getLastSixMonths() {
    const months = [];
    const today = new Date();

    for (let i = 5; i >= 0; i--) {
        const date = new Date(
            today.getFullYear(),
            today.getMonth() - i,
            1
        );

        months.push({
            key: `${date.getFullYear()}-${String(
                date.getMonth() + 1
            ).padStart(2, "0")}`,

            label: date.toLocaleDateString("en-IN", {
                month: "short"
            }),

            year: date.getFullYear(),
            amount: 0
        });
    }

    return months;
}

// ========================================
// CALCULATE MONTHLY SPENDING
// ========================================

function calculateMonthlySpending(expenses) {
    const months = getLastSixMonths();

    const monthMap = new Map(
        months.map(month => [month.key, month])
    );

    expenses.forEach(expense => {
        const date = new Date(expense.created_at);

        if (Number.isNaN(date.getTime())) {
            return;
        }

        const key = `${date.getFullYear()}-${String(
            date.getMonth() + 1
        ).padStart(2, "0")}`;

        const month = monthMap.get(key);

        if (month) {
            month.amount += Number(expense.amount) || 0;
        }
    });

    return months;
}

// ========================================
// RENDER MONTHLY SPENDING CHART
// ========================================

function renderSpendingChart(months) {
    const container = document.getElementById(
        "monthlySpendingChart"
    );

    if (!container) return;

    if (spendingChart) {
        spendingChart.destroy();
        spendingChart = null;
    }

    const hasExpenses = months.some(month => month.amount > 0);

    if (!hasExpenses) {
        container.replaceChildren();

        const message = document.createElement("p");

        message.className = "empty-state";

        message.textContent =
            "No expenses recorded in the last six months yet. Add expenses to see your spending overview.";

        container.appendChild(message);

        return;
    }

    if (typeof Chart === "undefined") {
        container.textContent =
            "The spending chart could not be loaded. Please refresh the page.";

        return;
    }

    container.replaceChildren();

    const canvas = document.createElement("canvas");

    canvas.setAttribute(
        "aria-label",
        "Monthly spending for the last six months"
    );

    canvas.setAttribute("role", "img");

    container.appendChild(canvas);

    spendingChart = new Chart(canvas, {
        type: "bar",

        data: {
            labels: months.map(month => month.label),

            datasets: [{
                label: "Total Spending",

                data: months.map(month => month.amount),

                backgroundColor: "#87A96B",
                hoverBackgroundColor: "#66864D",

                borderRadius: 7,
                borderSkipped: false,

                barPercentage: 0.55,
                categoryPercentage: 0.7
            }]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            plugins: {
                legend: {
                    display: false
                },

                tooltip: {
                    backgroundColor: "#5A3E2B",
                    padding: 12,

                    callbacks: {
                        label: context => {
                            return ` ${formatCurrency(context.raw)}`;
                        }
                    }
                }
            },

            scales: {
                x: {
                    grid: {
                        display: false
                    },

                    border: {
                        display: false
                    },

                    ticks: {
                        color: "#82776D",

                        font: {
                            family: "DM Sans"
                        }
                    }
                },

                y: {
                    beginAtZero: true,

                    grid: {
                        color: "#EEE9E0"
                    },

                    border: {
                        display: false,
                        dash: [4, 4]
                    },

                    ticks: {
                        color: "#82776D",

                        callback: value => {
                            return "₹" + Number(value).toLocaleString("en-IN");
                        }
                    }
                }
            }
        }
    });
}

// ========================================
// SMART SPENDING INSIGHTS
// ========================================

function renderSpendingInsight(months) {
    const element = document.getElementById(
        "spendingInsightText"
    );

    if (!element) return;

    const currentMonth = months[months.length - 1];
    const previousMonth = months[months.length - 2];

    const totalRecorded = months.reduce((sum, month) => {
        return sum + month.amount;
    }, 0);

    if (totalRecorded === 0) {
        element.textContent =
            "There is not enough spending history yet. Add expenses to your groups and your insights will appear here.";

        return;
    }

    const highestMonth = months.reduce((highest, month) => {
        return month.amount > highest.amount ? month : highest;
    }, months[0]);

    if (currentMonth.amount === 0 && previousMonth.amount === 0) {
        element.textContent =
            `Your recorded spending over the last six months is ${formatCurrency(totalRecorded)}. No expenses have been recorded in the current or previous month yet.`;

        return;
    }

    if (previousMonth.amount === 0 && currentMonth.amount > 0) {
        element.textContent =
            `You have recorded ${formatCurrency(currentMonth.amount)} in expenses this month so far. Your highest spending month in this overview was ${highestMonth.label}, with ${formatCurrency(highestMonth.amount)}.`;

        return;
    }

    if (currentMonth.amount === 0 && previousMonth.amount > 0) {
        element.textContent =
            `You have not recorded any expenses this month so far. Last month, your groups recorded ${formatCurrency(previousMonth.amount)} in expenses.`;

        return;
    }

    const difference = currentMonth.amount - previousMonth.amount;

    const percentage = Math.round(
        Math.abs(difference) / previousMonth.amount * 100
    );

    let comparison;

    if (difference > 0) {
        comparison =
            `Spending is ${percentage}% higher than last month so far.`;
    } else if (difference < 0) {
        comparison =
            `Spending is ${percentage}% lower than last month so far.`;
    } else {
        comparison =
            "Spending is currently the same as last month.";
    }

    element.textContent =
        `Your groups have recorded ${formatCurrency(currentMonth.amount)} this month. ${comparison} Your highest spending month in this overview was ${highestMonth.label}, with ${formatCurrency(highestMonth.amount)}.`;
}

// ========================================
// UPDATE SPENDING OVERVIEW
// ========================================

function updateSpendingOverview(expenses) {
    const monthlyData = calculateMonthlySpending(expenses);

    renderSpendingChart(monthlyData);
    renderSpendingInsight(monthlyData);
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

if (menuToggle) {
    menuToggle.addEventListener("click", () => {
        sidebar?.classList.add("open");
        sidebarOverlay?.classList.add("active");
    });
}

if (sidebarCloseBtn) {
    sidebarCloseBtn.addEventListener("click", closeSidebar);
}

if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", closeSidebar);
}

// ========================================
// INITIALIZE DASHBOARD
// ========================================

async function initializeDashboard() {
    if (!token) return;

    try {
        await loadProfile();

        const groups = await loadGroups();

        const expenses = await loadAllExpenses(groups);

        updateSpendingOverview(expenses);

    } catch (error) {
        console.error("Dashboard initialization error:", error);

        showMessage(error.message, "error");

        const chartContainer = document.getElementById(
            "monthlySpendingChart"
        );

        if (chartContainer) {
            chartContainer.textContent =
                "Unable to load your spending overview. Please refresh the page.";
        }
    }
}

initializeDashboard();
