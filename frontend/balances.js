
const API_URL = "/api";
const token = sessionStorage.getItem("spliaraToken");

let currentUser = null;
let allGroups = [];
let allBalances = [];

const tableBody = document.getElementById("balancesTableBody");
const mobileList = document.getElementById("balancesMobileList");
const messageElement = document.getElementById("balancesMessage");

const searchInput = document.getElementById("balanceSearch");
const groupFilter = document.getElementById("balanceGroupFilter");
const clearFiltersBtn = document.getElementById("clearBalanceFiltersBtn");

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

function getMemberName(member) {
    return (
        member.name ||
        member.member_name ||
        member.user_name ||
        member.full_name ||
        "Group member"
    );
}

function getMemberUserId(member) {
    return (
        member.user_id ??
        member.userId ??
        member.member_id ??
        member.memberId ??
        null
    );
}

function getMemberBalance(member) {
    return Number(
        member.balance ??
        member.net_balance ??
        member.netBalance ??
        0
    );
}

function showMessage(message, type = "success") {
    if (!messageElement) return;

    messageElement.textContent = message;
    messageElement.className =
        type === "error"
            ? "balances-message error"
            : "balances-message";
}

// ========================================
// LOAD USER PROFILE
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
// LOAD BALANCES FROM ALL GROUPS
// ========================================

async function loadAllBalances() {
    allBalances = [];

    if (!allGroups.length) return;

    const results = await Promise.allSettled(
        allGroups.map(async group => {
            const data = await apiRequest(
                `/finance/groups/${encodeURIComponent(group.id)}/balances`
            );

            return (data.balances || []).map(member => ({
                ...member,
                groupId: group.id,
                groupName: group.name
            }));
        })
    );

    const failedGroups = [];

    results.forEach((result, index) => {
        if (result.status === "fulfilled") {
            allBalances.push(...result.value);
        } else {
            failedGroups.push(allGroups[index].name);

            console.error(
                `Could not load balances for ${allGroups[index].name}:`,
                result.reason
            );
        }
    });

    if (failedGroups.length === allGroups.length) {
        throw new Error(
            "Could not load balances for your groups. Please try again."
        );
    }

    if (failedGroups.length > 0) {
        showMessage(
            `Some group balances could not be loaded: ${failedGroups.join(", ")}.`
        );
    }
}

// ========================================
// IDENTIFY CURRENT USER
// ========================================

function isCurrentUser(member) {
    if (!currentUser) return false;

    const memberId = getMemberUserId(member);

    if (
        memberId !== null &&
        currentUser.id !== undefined &&
        currentUser.id !== null
    ) {
        return String(memberId) === String(currentUser.id);
    }

    return (
        getMemberName(member).toLowerCase() ===
        String(currentUser.name || "").toLowerCase()
    );
}

// ========================================
// SUMMARY CARDS
// ========================================

function updateSummary() {
    let youOwe = 0;
    let owedToYou = 0;

    allBalances.forEach(member => {
        if (!isCurrentUser(member)) return;

        const balance = getMemberBalance(member);

        if (balance < 0) {
            youOwe += Math.abs(balance);
        } else if (balance > 0) {
            owedToYou += balance;
        }
    });

    const netBalance = owedToYou - youOwe;

    document.getElementById("youOweAmount").textContent =
        formatCurrency(youOwe);

    document.getElementById("owedToYouAmount").textContent =
        formatCurrency(owedToYou);

    const netElement = document.getElementById("netBalanceAmount");
    const descriptionElement = document.getElementById(
        "netBalanceDescription"
    );

    if (netElement) {
        netElement.textContent = formatCurrency(Math.abs(netBalance));

        netElement.classList.remove(
            "balance-positive",
            "balance-negative",
            "balance-neutral"
        );

        if (netBalance > 0) {
            netElement.classList.add("balance-positive");
        } else if (netBalance < 0) {
            netElement.classList.add("balance-negative");
        } else {
            netElement.classList.add("balance-neutral");
        }
    }

    if (descriptionElement) {
        descriptionElement.textContent =
            netBalance > 0
                ? "You are owed more than you owe"
                : netBalance < 0
                    ? "You owe more than you are owed"
                    : "Your overall balance is settled";
    }
}

// ========================================
// FILTER BALANCES
// ========================================

function getFilteredBalances() {
    const searchValue = searchInput.value.trim().toLowerCase();
    const selectedGroup = groupFilter.value;

    return allBalances.filter(member => {
        const name = getMemberName(member).toLowerCase();
        const groupName = String(member.groupName || "").toLowerCase();

        const matchesSearch =
            name.includes(searchValue) ||
            groupName.includes(searchValue);

        const matchesGroup =
            !selectedGroup ||
            String(member.groupId) === String(selectedGroup);

        return matchesSearch && matchesGroup;
    });
}

// ========================================
// BALANCE STATUS
// ========================================

function getBalanceStatus(balance) {
    if (balance > 0) {
        return {
            label: "Gets back",
            className: "status-receivable"
        };
    }

    if (balance < 0) {
        return {
            label: "Owes",
            className: "status-owes"
        };
    }

    return {
        label: "Settled",
        className: "status-settled"
    };
}

// ========================================
// RENDER DESKTOP TABLE
// ========================================

function renderBalanceTable(balances) {
    if (!tableBody) return;

    tableBody.replaceChildren();

    if (!balances.length) {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td colspan="4" class="table-message">
                No balances found. Try changing your search or group filter.
            </td>
        `;

        tableBody.appendChild(row);
        return;
    }

    balances.forEach(member => {
        const balance = getMemberBalance(member);
        const status = getBalanceStatus(balance);

        const row = document.createElement("tr");

        row.innerHTML = `
            <td>
                <div class="balance-member-cell">
                    <div class="balance-avatar">
                        ${escapeHTML(
                            getMemberName(member)
                                .split(/\s+/)
                                .slice(0, 2)
                                .map(part => part[0] || "")
                                .join("")
                                .toUpperCase()
                        )}
                    </div>

                    <strong>${escapeHTML(getMemberName(member))}</strong>
                </div>
            </td>

            <td>
                <span class="balance-group-tag">
                    ${escapeHTML(member.groupName)}
                </span>
            </td>

            <td>
                <span class="balance-status ${status.className}">
                    ${status.label}
                </span>
            </td>

            <td class="balance-amount ${status.className}">
                ${formatCurrency(Math.abs(balance))}
            </td>
        `;

        tableBody.appendChild(row);
    });
}

// ========================================
// RENDER MOBILE CARDS
// ========================================

function renderMobileBalances(balances) {
    if (!mobileList) return;

    mobileList.replaceChildren();

    if (!balances.length) {
        const emptyMessage = document.createElement("p");

        emptyMessage.className = "table-message";
        emptyMessage.textContent =
            "No balances found. Try changing your filters.";

        mobileList.appendChild(emptyMessage);
        return;
    }

    balances.forEach(member => {
        const balance = getMemberBalance(member);
        const status = getBalanceStatus(balance);

        const card = document.createElement("article");

        card.className = "balance-mobile-card";

        card.innerHTML = `
            <div class="balance-mobile-top">

                <div class="balance-member-cell">
                    <div class="balance-avatar">
                        ${escapeHTML(
                            getMemberName(member)
                                .split(/\s+/)
                                .slice(0, 2)
                                .map(part => part[0] || "")
                                .join("")
                                .toUpperCase()
                        )}
                    </div>

                    <div>
                        <h3>${escapeHTML(getMemberName(member))}</h3>
                        <p>${escapeHTML(member.groupName)}</p>
                    </div>
                </div>

                <span class="balance-status ${status.className}">
                    ${status.label}
                </span>

            </div>

            <div class="balance-mobile-bottom">
                <span>Balance amount</span>

                <strong class="${status.className}">
                    ${formatCurrency(Math.abs(balance))}
                </strong>
            </div>
        `;

        mobileList.appendChild(card);
    });
}

// ========================================
// RENDER ALL BALANCES
// ========================================

function renderBalances() {
    const filteredBalances = getFilteredBalances();

    renderBalanceTable(filteredBalances);
    renderMobileBalances(filteredBalances);

    const resultCount = document.getElementById(
        "balancesResultCount"
    );

    const footerInfo = document.getElementById(
        "balancesFooterInfo"
    );

    if (resultCount) {
        resultCount.textContent =
            `${filteredBalances.length} member balances`;
    }

    if (footerInfo) {
        footerInfo.textContent =
            `Showing ${filteredBalances.length} member balances`;
    }
}

// ========================================
// FILTER EVENTS
// ========================================

searchInput?.addEventListener("input", renderBalances);
groupFilter?.addEventListener("change", renderBalances);

clearFiltersBtn?.addEventListener("click", () => {
    searchInput.value = "";
    groupFilter.value = "";

    renderBalances();
});

// ========================================
// LOGOUT
// ========================================

document.getElementById("logoutBtn")?.addEventListener("click", () => {
    sessionStorage.removeItem("spliaraToken");
    window.location.href = "/";
});

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
// INITIALIZE BALANCES PAGE
// ========================================

async function initializeBalancesPage() {
    if (!token) return;

    try {
        showMessage("Loading your balances...");

        // Load profile and groups simultaneously.
        await Promise.all([
            loadProfile(),
            loadGroups()
        ]);

        // Load balances after groups are available.
        await loadAllBalances();

        updateSummary();
        renderBalances();

        if (!allBalances.length) {
            showMessage(
                "No balances to display yet. Add expenses to your groups to get started."
            );
        } else if (
            !messageElement?.textContent.includes("Some group balances")
        ) {
            showMessage("");
        }

    } catch (error) {
        console.error("Balances page error:", error);

        showMessage(error.message, "error");

        if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="table-message error">
                        Unable to load balances. Please refresh the page.
                    </td>
                </tr>
            `;
        }

        if (mobileList) {
            mobileList.textContent =
                "Unable to load balances. Please refresh the page.";
        }
    }
}

initializeBalancesPage();
