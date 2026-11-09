
const API_URL = "/api";
const token = sessionStorage.getItem("spliaraToken");

const groupsList = document.getElementById("groupsList");
const groupDetails = document.getElementById("groupDetails");
const groupFormContainer = document.getElementById("groupFormContainer");
const expenseFormContainer = document.getElementById("expenseFormContainer");
const dashboardMessage = document.getElementById("dashboardMessage");

let selectedGroup = null;

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

    const data = await response.json();

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

// Display messages
function showMessage(message) {
    dashboardMessage.textContent = message;
}

// Load user profile
async function loadProfile() {
    try {
        const data = await apiRequest("/auth/profile");

        document.getElementById("welcomeUser").textContent =
            `Welcome, ${data.user.name}!`;
    } catch (error) {
        showMessage(error.message);
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
            card.tabIndex = 0;
            card.setAttribute("role", "button");

            const heading = document.createElement("h3");
            heading.textContent = group.name;

            const description = document.createElement("p");
            description.textContent = "View group expenses";

            const arrow = document.createElement("span");
            arrow.className = "group-arrow";
            arrow.textContent = "View details →";

            card.append(heading, description, arrow);

            card.addEventListener("click", () => {
                openGroup(group);
            });

            card.addEventListener("keydown", event => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openGroup(group);
                }
            });

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

document.getElementById("cancelGroupBtn").addEventListener("click", () => {
    groupFormContainer.classList.add("hidden");
    document.getElementById("groupForm").reset();
});

document.getElementById("groupForm").addEventListener("submit", async event => {
    event.preventDefault();

    const name = document.getElementById("groupName").value.trim();

    if (!name) return;

    try {
        const data = await apiRequest("/groups", {
            method: "POST",
            body: JSON.stringify({ name })
        });

        document.getElementById("groupForm").reset();
        groupFormContainer.classList.add("hidden");

        showMessage(data.message);
        await loadGroups();

    } catch (error) {
        showMessage(error.message);
    }
});

// Open a group's detail screen
async function openGroup(group) {
    selectedGroup = group;

    document.getElementById("selectedGroupName").textContent = group.name;

    document.querySelector(".groups-section").classList.add("hidden");
    groupDetails.classList.remove("hidden");

    expenseFormContainer.classList.add("hidden");

    await loadExpenses(group.id);
}

// Load expenses for the selected group
async function loadExpenses(groupId) {
    const expensesList = document.getElementById("expensesList");

    expensesList.textContent = "Loading expenses...";

    try {
        const data = await apiRequest(`/expenses?groupId=${groupId}&limit=100`);

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

            const heading = document.createElement("h3");
            heading.textContent = expense.description;

            const date = document.createElement("p");
            date.textContent = new Date(expense.created_at)
                .toLocaleDateString("en-IN");

            const amount = document.createElement("strong");
            amount.textContent = `₹${Number(expense.amount).toFixed(2)}`;

            details.append(heading, date);
            card.append(details, amount);

            expensesList.appendChild(card);
        });

    } catch (error) {
        expensesList.textContent = error.message;
    }
}

// Show the add expense form
document.getElementById("addExpenseBtn").addEventListener("click", () => {
    expenseFormContainer.classList.remove("hidden");
    document.getElementById("expenseDescription").focus();
});

// Cancel adding an expense
document.getElementById("cancelExpenseBtn").addEventListener("click", () => {
    expenseFormContainer.classList.add("hidden");
    document.getElementById("expenseForm").reset();
});

// Create a new expense
document.getElementById("expenseForm").addEventListener("submit", async event => {
    event.preventDefault();

    if (!selectedGroup) return;

    const description =
        document.getElementById("expenseDescription").value.trim();

    const amount =
        Number(document.getElementById("expenseAmount").value);

    if (!description || !Number.isFinite(amount) || amount <= 0) {
        showMessage("Enter a valid description and amount.");
        return;
    }

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

        showMessage(data.message);
        await loadExpenses(selectedGroup.id);

    } catch (error) {
        showMessage(error.message);
    }
});

// Return to the groups list
document.getElementById("backToGroupsBtn").addEventListener("click", () => {
    selectedGroup = null;

    groupDetails.classList.add("hidden");
    document.querySelector(".groups-section").classList.remove("hidden");

    expenseFormContainer.classList.add("hidden");
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
