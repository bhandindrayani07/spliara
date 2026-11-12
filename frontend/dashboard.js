
const API_URL = "/api";
const token = sessionStorage.getItem("spliaraToken");

const groupsList = document.getElementById("groupsList");
const groupDetails = document.getElementById("groupDetails");
const groupFormContainer = document.getElementById("groupFormContainer");
const expenseFormContainer = document.getElementById("expenseFormContainer");
const dashboardMessage = document.getElementById("dashboardMessage");

let selectedGroup = null;
let editingExpenseId = null;
let currentUserId = null;
let groupMembers = [];
let simplifiedTransactions = [];

// ==========================================
// AUTHENTICATION
// ==========================================

if (!token) {
    window.location.href = "/";
}

// ==========================================
// COMMON API REQUEST FUNCTION
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

    const responseText = await response.text();

    let data = {};

    try {
        data = responseText ? JSON.parse(responseText) : {};
    } catch {
        data = {};
    }

    if (response.status === 401 || response.status === 403) {
        sessionStorage.removeItem("spliaraToken");
        window.location.href = "/";
        throw new Error(
            data.message || "Your session has expired. Please log in again."
        );
    }

    if (!response.ok) {
        throw new Error(data.message || "Something went wrong.");
    }

    return data;
}

// ==========================================
// MESSAGE FUNCTION
// ==========================================

function showMessage(message, type = "success") {
    dashboardMessage.textContent = message;
    dashboardMessage.className = type === "error" ? "error" : "";
}

// ==========================================
// ACTION BUTTON
// ==========================================

function createActionButton(text, className, handler) {
    const button = document.createElement("button");

    button.type = "button";
    button.textContent = text;
    button.className = `action-btn ${className}`;

    button.addEventListener("click", handler);

    return button;
}

// ==========================================
// LOAD USER PROFILE
// ==========================================

async function loadProfile() {
    try {
        const data = await apiRequest("/auth/profile");

        currentUserId = Number(data.user.id);

        document.getElementById("welcomeUser").textContent =
            `Welcome, ${data.user.name}!`;

    } catch (error) {
        showMessage(error.message, "error");
    }
}

// ==========================================
// LOAD GROUPS
// ==========================================

async function loadGroups() {
    groupsList.textContent = "Loading your groups...";

    try {
        const data = await apiRequest("/groups");

        groupsList.replaceChildren();

        if (!data.groups || data.groups.length === 0) {
            const emptyMessage = document.createElement("p");
            emptyMessage.textContent =
                "No groups yet. Create your first group!";

            groupsList.appendChild(emptyMessage);
            return;
        }

        data.groups.forEach(group => {
            const card = document.createElement("div");
            card.className = "group-card";

            const heading = document.createElement("h3");
            heading.textContent = group.name;

            const description = document.createElement("p");
            description.textContent = "View group expenses";

            const arrow = document.createElement("span");
            arrow.className = "group-arrow";
            arrow.textContent = "View details →";
            arrow.tabIndex = 0;
            arrow.setAttribute("role", "button");

            arrow.addEventListener("click", () => {
                openGroup(group);
            });

            arrow.addEventListener("keydown", event => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openGroup(group);
                }
            });

            card.append(heading, description, arrow);
            groupsList.appendChild(card);
        });

    } catch (error) {
        groupsList.textContent = error.message;
    }
}

// ==========================================
// CREATE GROUP
// ==========================================

document.getElementById("addGroupBtn").addEventListener("click", () => {
    groupFormContainer.classList.remove("hidden");
    document.getElementById("groupName").focus();
});

document.getElementById("cancelGroupBtn").addEventListener("click", () => {
    document.getElementById("groupForm").reset();
    groupFormContainer.classList.add("hidden");
});

document.getElementById("groupForm").addEventListener(
    "submit",
    async event => {
        event.preventDefault();

        const name = document.getElementById("groupName").value.trim();
        const submitButton = event.submitter;

        if (!name) return;

        submitButton.disabled = true;
        submitButton.textContent = "Saving...";

        try {
            const data = await apiRequest("/groups", {
                method: "POST",
                body: JSON.stringify({ name })
            });

            document.getElementById("groupForm").reset();
            groupFormContainer.classList.add("hidden");

            showMessage(data.message || "Group created successfully!");

            await loadGroups();

        } catch (error) {
            showMessage(error.message, "error");

        } finally {
            submitButton.disabled = false;
            submitButton.textContent = "Save Group";
        }
    }
);

// ==========================================
// OPEN GROUP
// ==========================================

async function openGroup(group) {
    selectedGroup = group;

    document.getElementById("selectedGroupName").textContent = group.name;

    document.querySelector(".groups-section").classList.add("hidden");
    groupDetails.classList.remove("hidden");

    expenseFormContainer.classList.add("hidden");
    document.getElementById("editGroupContainer").classList.add("hidden");
    document.getElementById("editExpenseContainer").classList.add("hidden");

    document.getElementById("settlementForm").reset();

    await Promise.all([
        loadExpenses(group.id),
        loadFinance(group.id),
        loadGroupMembers(group.id)
    ]);
}

// ==========================================
// EDIT GROUP
// ==========================================

document.getElementById("editGroupBtn").addEventListener("click", () => {
    if (!selectedGroup) return;

    document.getElementById("editGroupName").value = selectedGroup.name;

    document.getElementById("editGroupContainer").classList.remove("hidden");
    document.getElementById("editGroupName").focus();
});

document.getElementById("cancelEditGroupBtn").addEventListener("click", () => {
    document.getElementById("editGroupForm").reset();
    document.getElementById("editGroupContainer").classList.add("hidden");
});

document.getElementById("editGroupForm").addEventListener(
    "submit",
    async event => {
        event.preventDefault();

        if (!selectedGroup) return;

        const name = document.getElementById("editGroupName").value.trim();
        const submitButton = event.submitter;

        if (!name) return;

        submitButton.disabled = true;
        submitButton.textContent = "Updating...";

        try {
            const data = await apiRequest(`/groups/${selectedGroup.id}`, {
                method: "PUT",
                body: JSON.stringify({ name })
            });

            selectedGroup.name = name;

            document.getElementById("selectedGroupName").textContent = name;
            document.getElementById("editGroupContainer").classList.add("hidden");
            document.getElementById("editGroupForm").reset();

            showMessage(data.message || "Group updated successfully!");

            await loadGroups();

        } catch (error) {
            showMessage(error.message, "error");

        } finally {
            submitButton.disabled = false;
            submitButton.textContent = "Update Group";
        }
    }
);

// ==========================================
// DELETE GROUP
// ==========================================

document.getElementById("deleteGroupBtn").addEventListener("click", async () => {
    if (!selectedGroup) return;

    const confirmed = window.confirm(
        `Are you sure you want to delete "${selectedGroup.name}"?`
    );

    if (!confirmed) return;

    const button = document.getElementById("deleteGroupBtn");

    button.disabled = true;
    button.textContent = "Deleting...";

    try {
        const data = await apiRequest(`/groups/${selectedGroup.id}`, {
            method: "DELETE"
        });

        selectedGroup = null;

        groupDetails.classList.add("hidden");
        document.querySelector(".groups-section").classList.remove("hidden");

        showMessage(data.message || "Group deleted successfully!");

        await loadGroups();

    } catch (error) {
        showMessage(
            `${error.message} If the group contains expenses, delete those first.`,
            "error"
        );

    } finally {
        button.disabled = false;
        button.textContent = "Delete Group";
    }
});

// ==========================================
// LOAD GROUP MEMBERS
// ==========================================

async function loadGroupMembers(groupId) {
    const container = document.getElementById("splitMembersContainer");

    container.textContent = "Loading group members...";

    try {
        const data = await apiRequest(`/groups/${groupId}/members`);

        groupMembers = data.members || [];

        if (groupMembers.length === 0) {
            container.textContent = "No group members found.";
            return;
        }

        renderSplitMembers();

    } catch (error) {
        groupMembers = [];
        container.textContent = error.message;
        showMessage(error.message, "error");
    }
}

// ==========================================
// RENDER DYNAMIC SPLIT MEMBERS
// ==========================================

function renderSplitMembers() {
    const container = document.getElementById("splitMembersContainer");

    if (!container) return;

    container.replaceChildren();

    const splitType = document.getElementById("splitType").value;

    groupMembers.forEach(member => {
        const memberId = Number(member.id);

        const row = document.createElement("div");
        row.className = "split-member-row";

        const label = document.createElement("label");
        label.className = "split-member-label";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = true;
        checkbox.dataset.userId = memberId;
        checkbox.className = "split-member-checkbox";

        const name = document.createElement("span");
        name.textContent = member.name;

        label.append(checkbox, name);

        row.appendChild(label);

        if (splitType !== "equal") {
            const shareInput = document.createElement("input");

            shareInput.type = "number";
            shareInput.min = "0";
            shareInput.step = splitType === "percentage" ? "0.01" : "0.01";
            shareInput.placeholder =
                splitType === "exact" ? "Share ₹" : "Percentage %";

            shareInput.className = "split-share-input";
            shareInput.dataset.userId = memberId;
            shareInput.required = true;

            checkbox.addEventListener("change", () => {
                shareInput.disabled = !checkbox.checked;

                if (!checkbox.checked) {
                    shareInput.value = "";
                    shareInput.required = false;
                } else {
                    shareInput.required = true;
                }
            });

            row.appendChild(shareInput);
        }

        container.appendChild(row);
    });
}

// ==========================================
// SPLIT TYPE CHANGE
// ==========================================

document.getElementById("splitType").addEventListener("change", () => {
    renderSplitMembers();
});

// ==========================================
// COLLECT SELECTED SPLITS
// ==========================================

function getSelectedSplits() {
    const splitType = document.getElementById("splitType").value;

    const checkboxes = Array.from(
        document.querySelectorAll(".split-member-checkbox")
    );

    const selected = checkboxes.filter(checkbox => checkbox.checked);

    if (selected.length === 0) {
        throw new Error("Select at least one group member.");
    }

    return selected.map(checkbox => {
        const userId = Number(checkbox.dataset.userId);

        if (splitType === "equal") {
            return { userId };
        }

        const shareInput = document.querySelector(
            `.split-share-input[data-user-id="${userId}"]`
        );

        const value = Number(shareInput.value);

        if (
            shareInput.value.trim() === "" ||
            !Number.isFinite(value) ||
            value < 0
        ) {
            throw new Error(
                `Enter a valid share for ${checkbox.parentElement.textContent.trim()}.`
            );
        }

        if (splitType === "exact") {
            return {
                userId,
                amount: value
            };
        }

        return {
            userId,
            percentage: value
        };
    });
}

// ==========================================
// LOAD EXPENSES
// ==========================================

async function loadExpenses(groupId) {
    const expensesList = document.getElementById("expensesList");

    expensesList.textContent = "Loading expenses...";

    try {
        const data = await apiRequest(
            `/expenses?groupId=${groupId}&limit=100`
        );

        expensesList.replaceChildren();

        const expenses = data.expenses || [];

        const total = expenses.reduce((sum, expense) => {
            return sum + Number(expense.amount);
        }, 0);

        document.getElementById("totalExpenses").textContent =
            `₹${total.toFixed(2)}`;

        if (expenses.length === 0) {
            const emptyMessage = document.createElement("p");
            emptyMessage.textContent =
                "No expenses yet. Add your first expense!";

            expensesList.appendChild(emptyMessage);
            return;
        }

        expenses.forEach(expense => {
            const card = document.createElement("div");
            card.className = "expense-card";

            const details = document.createElement("div");
            details.className = "expense-info";

            const heading = document.createElement("h3");
            heading.textContent = expense.description;

            const date = document.createElement("p");
            date.textContent = new Date(expense.created_at)
                .toLocaleDateString("en-IN");

            const amount = document.createElement("strong");
            amount.textContent = `₹${Number(expense.amount).toFixed(2)}`;

            details.append(heading, date);

            const actions = document.createElement("div");
            actions.className = "expense-actions";

            const editButton = createActionButton(
                "Edit",
                "edit-btn",
                () => startEditExpense(expense)
            );

            const deleteButton = createActionButton(
                "Delete",
                "delete-btn",
                () => deleteExpense(expense)
            );

            actions.append(editButton, deleteButton);

            card.append(details, amount, actions);
            expensesList.appendChild(card);
        });

    } catch (error) {
        expensesList.textContent = error.message;
        showMessage(error.message, "error");
    }
}

// ==========================================
// LOAD FINANCIAL DATA
// ==========================================

async function loadFinance(groupId) {
    await Promise.all([
        loadBalances(groupId),
        loadSimplifiedDebts(groupId)
    ]);
}

// ==========================================
// LOAD MEMBER BALANCES
// ==========================================

async function loadBalances(groupId) {
    const container = document.getElementById("balancesList");

    container.textContent = "Loading balances...";

    try {
        const data = await apiRequest(
            `/finance/groups/${groupId}/balances`
        );

        container.replaceChildren();

        const balances = data.balances || [];

        if (balances.length === 0) {
            container.textContent = "No member balances available.";
            return;
        }

        balances.forEach(member => {
            const card = document.createElement("div");
            card.className = "balance-card";

            const name = document.createElement("h3");
            name.textContent = member.name;

            const status = document.createElement("p");
            status.className = "balance-status";

            const amount = document.createElement("strong");

            const balance = Number(member.balance);

            if (balance > 0) {
                status.textContent = "Gets back";
                amount.textContent = `+₹${balance.toFixed(2)}`;
                card.classList.add("balance-positive");

            } else if (balance < 0) {
                status.textContent = "Owes";
                amount.textContent = `-₹${Math.abs(balance).toFixed(2)}`;
                card.classList.add("balance-negative");

            } else {
                status.textContent = "All settled";
                amount.textContent = "₹0.00";
                card.classList.add("balance-settled");
            }

            card.append(name, status, amount);
            container.appendChild(card);
        });

    } catch (error) {
        container.textContent = error.message;
    }
}

// ==========================================
// LOAD SIMPLIFIED DEBTS
// ==========================================

async function loadSimplifiedDebts(groupId) {
    const container = document.getElementById("debtsList");

    container.textContent = "Calculating simplified debts...";

    try {
        const data = await apiRequest(
            `/finance/groups/${groupId}/simplified-debts`
        );

        container.replaceChildren();

        simplifiedTransactions = data.transactions || [];

        if (simplifiedTransactions.length === 0) {
            const message = document.createElement("p");
            message.textContent = "Everyone is settled. No payments needed!";

            container.appendChild(message);

        } else {
            const count = document.createElement("p");
            count.className = "transaction-count";
            count.textContent =
                `${data.transactionCount} suggested payment(s)`;

            container.appendChild(count);

            simplifiedTransactions.forEach(transaction => {
                const card = document.createElement("div");
                card.className = "debt-card";

                const from = document.createElement("strong");
                from.textContent = transaction.from.name;

                const arrow = document.createElement("span");
                arrow.className = "debt-arrow";
                arrow.textContent = "→";

                const to = document.createElement("strong");
                to.textContent = transaction.to.name;

                const amount = document.createElement("span");
                amount.className = "debt-amount";
                amount.textContent =
                    `₹${Number(transaction.amount).toFixed(2)}`;

                const people = document.createElement("div");
                people.className = "debt-people";
                people.append(from, arrow, to);

                card.append(people, amount);
                container.appendChild(card);
            });
        }

        updateSettlementOptions();

    } catch (error) {
        simplifiedTransactions = [];
        container.textContent = error.message;
        updateSettlementOptions();
    }
}

// ==========================================
// UPDATE SETTLEMENT RECEIVER OPTIONS
// ==========================================

function updateSettlementOptions() {
    const select = document.getElementById("settlementReceiver");

    select.replaceChildren();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select a suggested payment";

    select.appendChild(placeholder);

    const myDebts = simplifiedTransactions.filter(transaction => {
        return Number(transaction.from.userId) === currentUserId;
    });

    myDebts.forEach(transaction => {
        const option = document.createElement("option");

        option.value = transaction.to.userId;
        option.textContent =
            `${transaction.to.name} — ₹${Number(transaction.amount).toFixed(2)}`;

        option.dataset.maxAmount = transaction.amount;

        select.appendChild(option);
    });

    if (myDebts.length === 0) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "You have no suggested payments to make";
        option.disabled = true;

        select.appendChild(option);
    }
}

// ==========================================
// RECORD SETTLEMENT
// ==========================================

document.getElementById("settlementForm").addEventListener(
    "submit",
    async event => {
        event.preventDefault();

        if (!selectedGroup) return;

        const receiverId = Number(
            document.getElementById("settlementReceiver").value
        );

        const amount = Number(
            document.getElementById("settlementAmount").value
        );

        const select = document.getElementById("settlementReceiver");
        const selectedOption = select.options[select.selectedIndex];

        const maximumAmount = Number(selectedOption?.dataset.maxAmount);

        const submitButton = event.submitter;

        if (!receiverId || !Number.isFinite(amount) || amount <= 0) {
            showMessage("Please select a member and enter a valid amount.", "error");
            return;
        }

        if (!Number.isFinite(maximumAmount) || amount > maximumAmount + 0.001) {
            showMessage(
                "The payment cannot exceed the suggested amount for this member.",
                "error"
            );
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = "Recording...";

        try {
            const data = await apiRequest(
                `/finance/groups/${selectedGroup.id}/settlements`,
                {
                    method: "POST",
                    body: JSON.stringify({
                        receivedBy: receiverId,
                        amount
                    })
                }
            );

            document.getElementById("settlementForm").reset();

            showMessage(
                data.message || "Payment recorded successfully!"
            );

            await loadFinance(selectedGroup.id);

        } catch (error) {
            showMessage(error.message, "error");

        } finally {
            submitButton.disabled = false;
            submitButton.textContent = "Record Payment";
        }
    }
);

// ==========================================
// REFRESH FINANCES
// ==========================================

document.getElementById("refreshFinanceBtn").addEventListener(
    "click",
    async () => {
        if (!selectedGroup) return;

        const button = document.getElementById("refreshFinanceBtn");

        button.disabled = true;
        button.textContent = "Refreshing...";

        try {
            await loadFinance(selectedGroup.id);
            showMessage("Group balances refreshed!");

        } finally {
            button.disabled = false;
            button.textContent = "Refresh Balances";
        }
    }
);

// ==========================================
// SHOW ADD EXPENSE FORM
// ==========================================

document.getElementById("addExpenseBtn").addEventListener("click", () => {
    document.getElementById("expenseForm").reset();

    editingExpenseId = null;

    document.getElementById("editExpenseContainer").classList.add("hidden");
    expenseFormContainer.classList.remove("hidden");

    document.getElementById("splitType").value = "equal";
    renderSplitMembers();

    document.getElementById("expenseDescription").focus();
});

// ==========================================
// CANCEL ADD EXPENSE
// ==========================================

document.getElementById("cancelExpenseBtn").addEventListener("click", () => {
    document.getElementById("expenseForm").reset();
    expenseFormContainer.classList.add("hidden");
});

// ==========================================
// CREATE EXPENSE WITH SPLITS
// ==========================================

document.getElementById("expenseForm").addEventListener(
    "submit",
    async event => {
        event.preventDefault();

        if (!selectedGroup) return;

        const description = document
            .getElementById("expenseDescription")
            .value.trim();

        const amount = Number(
            document.getElementById("expenseAmount").value
        );

        const splitType = document.getElementById("splitType").value;

        const submitButton = event.submitter;

        if (!description || !Number.isFinite(amount) || amount <= 0) {
            showMessage("Enter a valid description and amount.", "error");
            return;
        }

        let splits;

        try {
            splits = getSelectedSplits();

        } catch (error) {
            showMessage(error.message, "error");
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = "Saving...";

        try {
            const data = await apiRequest(
                `/finance/groups/${selectedGroup.id}/expenses`,
                {
                    method: "POST",
                    body: JSON.stringify({
                        description,
                        amount,
                        splitType,
                        splits
                    })
                }
            );

            document.getElementById("expenseForm").reset();
            expenseFormContainer.classList.add("hidden");

            showMessage(
                data.message || "Expense and splits created successfully!"
            );

            await Promise.all([
                loadExpenses(selectedGroup.id),
                loadFinance(selectedGroup.id)
            ]);

        } catch (error) {
            showMessage(error.message, "error");

        } finally {
            submitButton.disabled = false;
            submitButton.textContent = "Save Expense";
        }
    }
);

// ==========================================
// START EDITING EXPENSE
// ==========================================

function startEditExpense(expense) {
    editingExpenseId = expense.id;

    document.getElementById("editExpenseDescription").value =
        expense.description;

    document.getElementById("editExpenseAmount").value =
        Number(expense.amount);

    expenseFormContainer.classList.add("hidden");

    document.getElementById("editExpenseContainer").classList.remove("hidden");

    document.getElementById("editExpenseDescription").focus();
}

// ==========================================
// CANCEL EDITING EXPENSE
// ==========================================

document.getElementById("cancelEditExpenseBtn").addEventListener("click", () => {
    document.getElementById("editExpenseForm").reset();

    document.getElementById("editExpenseContainer").classList.add("hidden");

    editingExpenseId = null;
});

// ==========================================
// UPDATE EXPENSE
// ==========================================

document.getElementById("editExpenseForm").addEventListener(
    "submit",
    async event => {
        event.preventDefault();

        if (!editingExpenseId || !selectedGroup) return;

        const description = document
            .getElementById("editExpenseDescription")
            .value.trim();

        const amount = Number(
            document.getElementById("editExpenseAmount").value
        );

        const submitButton = event.submitter;

        if (!description || !Number.isFinite(amount) || amount <= 0) {
            showMessage("Enter a valid description and amount.", "error");
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = "Updating...";

        try {
            const data = await apiRequest(`/expenses/${editingExpenseId}`, {
                method: "PUT",
                body: JSON.stringify({
                    description,
                    amount
                })
            });

            document.getElementById("editExpenseForm").reset();

            document.getElementById("editExpenseContainer").classList.add("hidden");

            editingExpenseId = null;

            showMessage(data.message || "Expense updated successfully!");

            await Promise.all([
                loadExpenses(selectedGroup.id),
                loadFinance(selectedGroup.id)
            ]);

        } catch (error) {
            showMessage(error.message, "error");

        } finally {
            submitButton.disabled = false;
            submitButton.textContent = "Update Expense";
        }
    }
);

// ==========================================
// DELETE EXPENSE
// ==========================================

async function deleteExpense(expense) {
    const confirmed = window.confirm(
        `Are you sure you want to delete "${expense.description}"?`
    );

    if (!confirmed) return;

    try {
        const data = await apiRequest(`/expenses/${expense.id}`, {
            method: "DELETE"
        });

        showMessage(data.message || "Expense deleted successfully!");

        await Promise.all([
            loadExpenses(selectedGroup.id),
            loadFinance(selectedGroup.id)
        ]);

    } catch (error) {
        showMessage(error.message, "error");
    }
}

// ==========================================
// BACK TO GROUPS
// ==========================================

document.getElementById("backToGroupsBtn").addEventListener("click", () => {
    selectedGroup = null;
    editingExpenseId = null;
    groupMembers = [];
    simplifiedTransactions = [];

    groupDetails.classList.add("hidden");
    document.querySelector(".groups-section").classList.remove("hidden");

    expenseFormContainer.classList.add("hidden");
    document.getElementById("editExpenseContainer").classList.add("hidden");
    document.getElementById("editGroupContainer").classList.add("hidden");

    showMessage("");
});

// ==========================================
// LOGOUT
// ==========================================

document.getElementById("logoutBtn").addEventListener("click", () => {
    sessionStorage.removeItem("spliaraToken");
    window.location.href = "/";
});

// ==========================================
// INITIAL DASHBOARD LOADING
// ==========================================

async function initializeDashboard() {
    await loadProfile();
    await loadGroups();
}

initializeDashboard();
