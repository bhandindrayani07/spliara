
const API_URL = "/api";
const token = sessionStorage.getItem("spliaraToken");

const groupsList = document.getElementById("groupsList");
const groupFormContainer = document.getElementById("groupFormContainer");
const dashboardMessage = document.getElementById("dashboardMessage");

let selectedGroup = null;

// Check login
if (!token) {
    window.location.href = "/";
}

// API request helper
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
        throw new Error("Your session has expired or you do not have access.");
    }

    if (!response.ok) {
        throw new Error(data.message || "Something went wrong.");
    }

    return data;
}

// Show messages
function showMessage(message, type = "success") {
    dashboardMessage.textContent = message;
    dashboardMessage.className = type === "error" ? "error" : "";
}

// Format Indian currency
function formatCurrency(amount) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0
    }).format(Number(amount) || 0);
}

// Get member initials
function getInitials(name) {
    if (!name) return "?";

    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(part => part.charAt(0).toUpperCase())
        .join("");
}

// Load profile
async function loadProfile() {
    try {
        const data = await apiRequest("/auth/profile");

        document.getElementById("welcomeUser").textContent =
            `Welcome, ${data.user.name}!`;

    } catch (error) {
        showMessage(error.message, "error");
    }
}

// Create member avatars
function createMemberAvatars(members) {
    const avatarContainer = document.createElement("div");
    avatarContainer.className = "group-member-avatars";

    members.slice(0, 4).forEach(member => {
        const avatar = document.createElement("span");

        avatar.className = "member-avatar";
        avatar.textContent = getInitials(member.name);
        avatar.title = member.name || "Group member";

        avatarContainer.appendChild(avatar);
    });

    if (members.length > 4) {
        const extra = document.createElement("span");

        extra.className = "member-avatar extra-members";
        extra.textContent = `+${members.length - 4}`;
        extra.title = `${members.length - 4} more members`;

        avatarContainer.appendChild(extra);
    }

    return avatarContainer;
}

// Open group workspace
function openGroupWorkspace(group) {
    window.location.href =
        `group-details.html?groupId=${encodeURIComponent(group.id)}`;
}

// Create group card
function createGroupCard(group) {
    const card = document.createElement("article");
    card.className = "group-card";
    card.tabIndex = 0;
    card.setAttribute("role", "link");
    card.setAttribute(
        "aria-label",
        `Open ${group.name} group workspace`
    );

    // Make card clickable
    card.addEventListener("click", () => {
        openGroupWorkspace(group);
    });

    // Keyboard accessibility
    card.addEventListener("keydown", event => {
        if (event.target !== card) return;

        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openGroupWorkspace(group);
        }
    });

    // Group icon
    const icon = document.createElement("div");
    icon.className = "group-card-icon";
    icon.textContent = "♧";

    // Group name
    const heading = document.createElement("h3");
    heading.textContent = group.name;

    // Expense total
    const expenseLabel = document.createElement("p");
    expenseLabel.className = "group-expense-label";
    expenseLabel.textContent = "Total group expenses";

    const expenseAmount = document.createElement("h4");
    expenseAmount.className = "group-expense-amount";
    expenseAmount.textContent = formatCurrency(group.total_expenses);

    // Member information
    const memberSection = document.createElement("div");
    memberSection.className = "group-member-section";

    const members = Array.isArray(group.members) ? group.members : [];

    const memberAvatars = createMemberAvatars(members);

    const memberCount = document.createElement("span");
    memberCount.className = "group-member-count";

    const count = Number(group.member_count) || members.length;

    memberCount.textContent =
        `${count} ${count === 1 ? "member" : "members"}`;

    memberSection.append(memberAvatars, memberCount);

    // Card actions
    const actions = document.createElement("div");
    actions.className = "group-card-actions";

    // Rename button
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "secondary-btn";
    editButton.textContent = "Rename";

    editButton.addEventListener("click", event => {
        event.stopPropagation();

        selectedGroup = group;

        document.getElementById("editGroupName").value = group.name;
        document.getElementById("editGroupContainer").classList.remove("hidden");

        document.getElementById("editGroupName").focus();

        document.getElementById("editGroupContainer").scrollIntoView({
            behavior: "smooth",
            block: "center"
        });
    });

    // Delete button
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-btn";
    deleteButton.textContent = "Delete";

    deleteButton.addEventListener("click", event => {
        event.stopPropagation();
        deleteGroup(group);
    });

    actions.append(editButton, deleteButton);

    // Assemble card
    card.append(
        icon,
        heading,
        expenseLabel,
        expenseAmount,
        memberSection,
        actions
    );

    return card;
}

// Load all groups
async function loadGroups() {
    groupsList.textContent = "Loading your groups...";

    try {
        const data = await apiRequest("/groups");
        const groups = data.groups || [];

        groupsList.replaceChildren();

        document.getElementById("totalGroupsCount").textContent =
            groups.length;

        if (groups.length === 0) {
            const emptyState = document.createElement("div");
            emptyState.className = "empty-state";

            const heading = document.createElement("h3");
            heading.textContent = "No groups yet";

            const description = document.createElement("p");
            description.textContent =
                "Create your first group to start sharing expenses.";

            emptyState.append(heading, description);
            groupsList.appendChild(emptyState);

            return;
        }

        groups.forEach(group => {
            groupsList.appendChild(createGroupCard(group));
        });

    } catch (error) {
        groupsList.textContent = error.message;
        showMessage(error.message, "error");
    }
}

// Open create group form
document.getElementById("addGroupBtn").addEventListener("click", () => {
    groupFormContainer.classList.remove("hidden");

    document.getElementById("groupName").focus();

    groupFormContainer.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });
});

// Cancel group creation
document.getElementById("cancelGroupBtn").addEventListener("click", () => {
    document.getElementById("groupForm").reset();
    groupFormContainer.classList.add("hidden");
});

// Create group
document.getElementById("groupForm").addEventListener("submit", async event => {
    event.preventDefault();

    const name = document.getElementById("groupName").value.trim();
    const submitButton = event.submitter;

    if (!name) return;

    submitButton.disabled = true;
    submitButton.textContent = "Creating...";

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
        submitButton.textContent = "Create Group";
    }
});

// Edit group
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

        document.getElementById("editGroupForm").reset();
        document.getElementById("editGroupContainer").classList.add("hidden");

        selectedGroup = null;

        showMessage(data.message || "Group updated successfully!");

        await loadGroups();

    } catch (error) {
        showMessage(error.message, "error");

    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Update Group";
    }
});

// Cancel editing
document.getElementById("cancelEditGroupBtn").addEventListener("click", () => {
    document.getElementById("editGroupForm").reset();
    document.getElementById("editGroupContainer").classList.add("hidden");

    selectedGroup = null;
});

// Delete group
async function deleteGroup(group) {
    const confirmed = window.confirm(
        `Are you sure you want to delete "${group.name}"?`
    );

    if (!confirmed) return;

    try {
        const data = await apiRequest(`/groups/${group.id}`, {
            method: "DELETE"
        });

        showMessage(data.message || "Group deleted successfully!");

        await loadGroups();

    } catch (error) {
        showMessage(
            `${error.message} If the group contains expenses, delete those first.`,
            "error"
        );
    }
}

// Logout
document.getElementById("logoutBtn").addEventListener("click", () => {
    sessionStorage.removeItem("spliaraToken");
    window.location.href = "/";
});

// Mobile sidebar
const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("sidebarOverlay");

document.getElementById("menuToggle").addEventListener("click", () => {
    sidebar.classList.add("open");
    overlay.classList.add("active");
});

function closeSidebar() {
    sidebar.classList.remove("open");
    overlay.classList.remove("active");
}

document.getElementById("sidebarCloseBtn").addEventListener("click", closeSidebar);
overlay.addEventListener("click", closeSidebar);

// Initial loading
loadProfile();
loadGroups();
