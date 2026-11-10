
const API_URL = "/api";
const token = sessionStorage.getItem("spliaraToken");

const groupsList = document.getElementById("groupsList");
const groupDetails = document.getElementById("groupDetails");
const groupFormContainer = document.getElementById("groupFormContainer");
const expenseFormContainer = document.getElementById("expenseFormContainer");
const dashboardMessage = document.getElementById("dashboardMessage");

let selectedGroup = null;
let editingExpenseId = null;

// Check whether the user is logged in
if (!token) {
    window.location.href = "/";
}

// Common function for API requests
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
        throw new Error("Your session has expired. Please log in again.");
    }

    if (!response.ok) {
        throw new Error(data.message || "Something went wrong.");
    }

    return data;
}

// Display success and error messages
function showMessage(message, type = "success") {
    dashboardMessage.textContent = message;
    dashboardMessage.className = type === "error" ? "error" : "";
}

// Create action buttons
function createActionButton(text, className, handler) {
    const button = document.createElement("button");

    button.type = "button";
    button.textContent = text;
    button.className = `action-btn ${className}`;

    button.addEventListener("click", handler);

    return button;
}

// Load user profile
async function loadProfile() {
    try {
        const data = await apiRequest("/auth/profile");

        document.getElementById("welcomeUser").textContent =
            `Welcome, ${data.user.name}!`;

    } catch (error) {
        showMessage(error.message, "error");
    }
}

// Load all groups
async function loadGroups() {
    groupsList.textContent = "Loading your groups...";

    try {
        const data = await apiRequest("/groups");

        groupsList.replaceChildren();

        if (data.groups.length === 0) {
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

// Create a new group
document.getElementById("addGroupBtn").addEventListener("click", () => {
    groupFormContainer.classList.remove("hidden");
    document.getElementById("groupName").focus();
});

// Cancel group creation
document.getElementById("cancelGroupBtn").addEventListener("click", () => {
    document.getElementById("groupForm").reset();
    groupFormContainer.classList.add("hidden");
});

// Submit new group
document.getElementById("groupForm").addEventListener("submit", async event => {
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
});

// Open a group's detail screen
async function openGroup(group) {
    selectedGroup = group;

    document.getElementById("selectedGroupName").textContent = group.name;

    document.querySelector(".groups-section").classList.add("hidden");
    groupDetails.classList.remove("hidden");

    expenseFormContainer.classList.add("hidden");
    document.getElementById("editGroupContainer").classList.add("hidden");
    document.getElementById("editExpenseContainer").classList.add("hidden");

    await loadExpenses(group.id);
}

// Edit selected group
document.getElementById("editGroupBtn").addEventListener("click", () => {
    if (!selectedGroup) return;

    const editGroupContainer =
        document.getElementById("editGroupContainer");

    document.getElementById("editGroupName").value = selectedGroup.name;

    editGroupContainer.classList.remove("hidden");
    document.getElementById("editGroupName").focus();
});

// Cancel editing group
document.getElementById("cancelEditGroupBtn").addEventListener("click", () => {
    document.getElementById("editGroupForm").reset();
    document.getElementById("editGroupContainer").classList.add("hidden");
});

// Update selected group
document.getElementById("editGroupForm").addEventListener("submit", async event => {
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
});

// Delete selected group
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

// Load expenses for the selected group
async function loadExpenses(groupId) {
    const expensesList = document.getElementById("expensesList");

    expensesList.textContent = "Loading expenses...";

    try {
        const data = await apiRequest(
            `/expenses?groupId=${groupId}&limit=100`
        );

        expensesList.replaceChildren();

        const expenses = data.expenses;

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

// Show the add expense form
document.getElementById("addExpenseBtn").addEventListener("click", () => {
    document.getElementById("expenseForm").reset();

    editingExpenseId = null;

    document.getElementById("editExpenseContainer").classList.add("hidden");
    expenseFormContainer.classList.remove("hidden");

    document.getElementById("expenseDescription").focus();
});

// Cancel adding an expense
document.getElementById("cancelExpenseBtn").addEventListener("click", () => {
    document.getElementById("expenseForm").reset();
    expenseFormContainer.classList.add("hidden");
});

// Create a new expense
document.getElementById("expenseForm").addEventListener("submit", async event => {
    event.preventDefault();

    if (!selectedGroup) return;

    const description =
        document.getElementById("expenseDescription").value.trim();

    const amount =
        Number(document.getElementById("expenseAmount").value);

    const submitButton = event.submitter;

    if (!description || !Number.isFinite(amount) || amount <= 0) {
        showMessage("Enter a valid description and amount.", "error");
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Saving...";

    try {
        const data = await apiRequest("/expenses", {
            method: "POST",
            body: JSON.stringify({
                groupId: selectedGroup.id,
                description,
                amount
            })
        });

        document.getElementById("expenseForm").reset();
        expenseFormContainer.classList.add("hidden");

        showMessage(data.message || "Expense added successfully!");
        await loadExpenses(selectedGroup.id);

    } catch (error) {
        showMessage(error.message, "error");

    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Save Expense";
    }
});

// Start editing an expense
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

// Cancel editing an expense
document.getElementById("cancelEditExpenseBtn").addEventListener("click", () => {
    document.getElementById("editExpenseForm").reset();

    document.getElementById("editExpenseContainer").classList.add("hidden");

    editingExpenseId = null;
});

// Update an expense
document.getElementById("editExpenseForm").addEventListener("submit", async event => {
    event.preventDefault();

    if (!editingExpenseId || !selectedGroup) return;

    const description =
        document.getElementById("editExpenseDescription").value.trim();

    const amount =
        Number(document.getElementById("editExpenseAmount").value);

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
        await loadExpenses(selectedGroup.id);

    } catch (error) {
        showMessage(error.message, "error");

    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Update Expense";
    }
});

// Delete an expense
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

        await loadExpenses(selectedGroup.id);

    } catch (error) {
        showMessage(error.message, "error");
    }
}

// Return to the groups list
document.getElementById("backToGroupsBtn").addEventListener("click", () => {
    selectedGroup = null;
    editingExpenseId = null;

    groupDetails.classList.add("hidden");
    document.querySelector(".groups-section").classList.remove("hidden");

    expenseFormContainer.classList.add("hidden");
    document.getElementById("editExpenseContainer").classList.add("hidden");
    document.getElementById("editGroupContainer").classList.add("hidden");

    showMessage("");
});

// Logout
document.getElementById("logoutBtn").addEventListener("click", () => {
    sessionStorage.removeItem("spliaraToken");
    window.location.href = "/";
});

// Initial dashboard loading
loadProfile();
loadGroups();
