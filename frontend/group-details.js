
const API_URL = "/api";
const token = sessionStorage.getItem("spliaraToken");

const params = new URLSearchParams(window.location.search);
const groupId = params.get("groupId");

let currentGroup = null;
let groupMembers = [];
let groupExpenses = [];
let groupBalances = [];
let suggestedDebts = [];
let groupInvitations = [];

// ==========================================
// API HEADERS
// ==========================================

const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
};

// ==========================================
// API HELPER
// ==========================================

async function apiRequest(endpoint, options = {}) {
    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
            ...headers,
            ...options.headers
        }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        console.error("API request failed:", {
            endpoint,
            status: response.status,
            response: data
        });

        if (response.status === 401) {
            sessionStorage.removeItem("spliaraToken");
            window.location.href = "/";
        }

        throw new Error(
            data.message || `Request failed (${response.status})`
        );
    }

    return data;
}

// ==========================================
// HELPERS
// ==========================================

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function formatCurrency(value) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    }).format(Number(value) || 0);
}

function getInitials(name) {
    return String(name || "User")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(part => part[0]?.toUpperCase() || "")
        .join("");
}

function showMessage(message, type = "success") {
    const element = document.getElementById("groupMessage");

    if (!element) {
        console.log(message);
        return;
    }

    element.textContent = message;
    element.className = `dashboard-message ${type}`;
    element.style.display = "block";

    window.clearTimeout(showMessage.timeout);

    showMessage.timeout = window.setTimeout(() => {
        element.style.display = "none";
    }, 4000);
}

// ==========================================
// MODAL FUNCTIONS
// ==========================================

function openModal(id) {
    const modal = document.getElementById(id);

    if (!modal) {
        console.error(`Modal not found: ${id}`);
        showMessage(`Could not open ${id}.`, "error");
        return;
    }

    modal.classList.remove("hidden");
    modal.classList.add("active");
    modal.style.display = "flex";

    document.body.style.overflow = "hidden";
}

function closeModal(id) {
    const modal = document.getElementById(id);

    if (!modal) return;

    modal.classList.remove("active");
    modal.classList.add("hidden");
    modal.style.display = "none";

    const anotherModalOpen = [
        "expenseModal",
        "memberModal",
        "editExpenseModal"
    ].some(modalId => {
        const item = document.getElementById(modalId);
        return item && item.classList.contains("active");
    });

    if (!anotherModalOpen) {
        document.body.style.overflow = "";
    }
}

function closeAllModals() {
    [
        "expenseModal",
        "memberModal",
        "editExpenseModal"
    ].forEach(closeModal);
}

// ==========================================
// INITIAL PAGE SETUP
// ==========================================

document.addEventListener("DOMContentLoaded", async () => {
    if (!token) {
        window.location.href = "/";
        return;
    }

    if (!groupId || !Number.isInteger(Number(groupId)) || Number(groupId) <= 0) {
        showMessage("Invalid group. Return to My Groups.", "error");
        return;
    }

    setupSidebar();
    setupModalClosing();
    setupExpenseForm();
    setupMemberForm();
    setupEditExpenseForm();

    document.getElementById("addExpenseBtn")
        ?.addEventListener("click", () => {
            prepareExpenseSplitForm();
            openModal("expenseModal");
        });

    document.getElementById("addMemberBtn")
        ?.addEventListener("click", () => {
            openModal("memberModal");
        });

    document.getElementById("logoutBtn")
        ?.addEventListener("click", logout);

    await loadGroupWorkspace();
});

// ==========================================
// LOAD GROUP WORKSPACE
// ==========================================

async function loadGroupWorkspace() {
    try {
        // Load group details and members simultaneously
        await Promise.all([
            loadGroup(),
            loadMembers()
        ]);

        // Load independent workspace sections simultaneously.
        // Balances also provide the suggested debt transactions.
        await Promise.all([
            loadExpenses(),
            loadBalances(),
            loadInvitations()
        ]);

        renderSettlementForm();
        updateSummary();

    } catch (error) {
        console.error("Workspace loading error:", error);
        showMessage(error.message, "error");
    }
}

// ==========================================
// GROUP DETAILS
// ==========================================

async function loadGroup() {
    const data = await apiRequest(`/groups/${groupId}`);

    currentGroup = data.group;

    document.getElementById("groupName").textContent =
        currentGroup.name || "Group";

    document.getElementById("groupDescription").textContent =
        "Manage shared expenses and payments with your group.";

    document.title = `${currentGroup.name} | Spliara`;
}

// ==========================================
// GROUP MEMBERS
// ==========================================

async function loadMembers() {
    const data = await apiRequest(`/groups/${groupId}/members`);

    groupMembers = data.members || [];

    renderMembers();
}

function renderMembers() {
    const container = document.getElementById("groupMembers");

    if (!container) return;

    if (!groupMembers.length) {
        container.innerHTML = `
            <p class="empty-state">No members found.</p>
        `;
        return;
    }

    container.innerHTML = groupMembers.map(member => `
        <div class="member-row">
            <div class="member-avatar">
                ${escapeHTML(getInitials(member.name))}
            </div>

            <div class="member-info">
                <strong>${escapeHTML(member.name)}</strong>
                <small>${escapeHTML(member.email)}</small>
            </div>
        </div>
    `).join("");
}

// ==========================================
// GROUP INVITATIONS
// ==========================================

async function loadInvitations() {
    const container = document.getElementById("pendingInvitations");

    if (!container) return;

    try {
        const data = await apiRequest(
            `/groups/${groupId}/invitations`
        );

        groupInvitations = data.invitations || [];

        renderInvitations();

    } catch (error) {
        console.error("Load invitations error:", error);

        if (
            error.message.toLowerCase().includes("only the group creator")
        ) {
            groupInvitations = [];

            container.innerHTML = `
                <p class="empty-state">
                    Only the group creator can manage pending invitations.
                </p>
            `;

            return;
        }

        container.innerHTML = `
            <p class="empty-state">
                Unable to load invitations right now.
                Please try again later.
            </p>
        `;
    }
}

function renderInvitations() {
    const container = document.getElementById("pendingInvitations");

    if (!container) return;

    const pendingInvitations = groupInvitations.filter(
        invitation => invitation.status === "pending"
    );

    if (!pendingInvitations.length) {
        container.innerHTML = `
            <p class="empty-state">
                No pending invitations.
            </p>
        `;
        return;
    }

    container.innerHTML = pendingInvitations.map(invitation => {
        const date = invitation.expires_at
            ? new Date(invitation.expires_at).toLocaleDateString("en-IN")
            : "Not specified";

        return `
            <div class="invitation-row">
                <div class="invitation-info">
                    <strong>
                        ${escapeHTML(invitation.invited_email)}
                    </strong>

                    <small>
                        <span class="invitation-status">Pending</span>
                        · Expires ${escapeHTML(date)}
                    </small>
                </div>

                <button
                    type="button"
                    class="delete-button"
                    data-cancel-invitation="${escapeHTML(invitation.id)}">
                    Cancel
                </button>
            </div>
        `;
    }).join("");

    container.querySelectorAll("[data-cancel-invitation]")
        .forEach(button => {
            button.addEventListener("click", () => {
                cancelInvitation(button.dataset.cancelInvitation);
            });
        });
}

// ==========================================
// ADD MEMBERS AND GENERATE INVITATION LINKS
// ==========================================

function setupMemberForm() {
    const form = document.getElementById("memberForm");

    if (!form) return;

    let linkPanel = document.getElementById("invitationLinkPanel");

    if (!linkPanel) {
        linkPanel = document.createElement("div");
        linkPanel.id = "invitationLinkPanel";

        linkPanel.style.display = "none";
        linkPanel.style.marginTop = "20px";
        linkPanel.style.padding = "16px";
        linkPanel.style.background = "#eef2e9";
        linkPanel.style.borderRadius = "12px";

        linkPanel.innerHTML = `
            <strong style="display:block; margin-bottom:8px;">
                Your invitation link is ready!
            </strong>

            <p style="font-size:13px; margin-bottom:12px;">
                Share this link with the invited person.
                It expires after 7 days.
            </p>

            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <input
                    type="text"
                    id="invitationLinkInput"
                    readonly
                    aria-label="Invitation link"
                    style="flex:1; min-width:0; padding:10px;
                    border:1px solid #d5ddce; border-radius:8px;"
                >

                <button
                    type="button"
                    id="copyInvitationLinkBtn"
                    class="primary-btn">
                    Copy Link
                </button>
            </div>

            <p
                id="invitationCopyMessage"
                style="font-size:13px; margin-top:10px;">
            </p>
        `;

        form.appendChild(linkPanel);
    }

    const copyButton = document.getElementById(
        "copyInvitationLinkBtn"
    );

    copyButton?.addEventListener("click", async () => {
        const linkInput = document.getElementById(
            "invitationLinkInput"
        );

        const copyMessage = document.getElementById(
            "invitationCopyMessage"
        );

        try {
            await navigator.clipboard.writeText(linkInput.value);

            copyMessage.textContent = "Invitation link copied!";
            copyMessage.style.color = "#47734b";

        } catch (error) {
            linkInput.focus();
            linkInput.select();
            linkInput.setSelectionRange(0, 99999);

            const copied = document.execCommand("copy");

            copyMessage.textContent = copied
                ? "Invitation link copied!"
                : "Please select and copy the link manually.";

            copyMessage.style.color = copied
                ? "#47734b"
                : "#b05a42";
        }
    });

    form.addEventListener("submit", async event => {
        event.preventDefault();

        const email = document.getElementById("memberEmail")
            ?.value.trim();

        if (!email) {
            showMessage("Enter the member's email address.", "error");
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(email)) {
            showMessage("Enter a valid email address.", "error");
            return;
        }

        const submitButton = form.querySelector(
            'button[type="submit"]'
        );

        try {
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = "Adding...";
            }

            const data = await apiRequest(
                `/groups/${groupId}/members`,
                {
                    method: "POST",
                    body: JSON.stringify({ email })
                }
            );

            if (data.invitationLink) {
                document.getElementById("invitationLinkInput").value =
                    data.invitationLink;

                document.getElementById(
                    "invitationCopyMessage"
                ).textContent = "";

                linkPanel.style.display = "block";

                document.getElementById("memberEmail").value = "";

                await loadInvitations();

                showMessage(
                    "Invitation link created. Copy and share it!"
                );

            } else {
                form.reset();

                linkPanel.style.display = "none";

                closeModal("memberModal");

                await Promise.all([
                    loadMembers(),
                    loadInvitations(),
                    loadBalances()
                ]);

                updateSummary();
                renderSettlementForm();

                showMessage(
                    data.message || "Member added to the group!"
                );
            }

        } catch (error) {
            console.error("Add member error:", error);
            showMessage(error.message, "error");

        } finally {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = "Send Invitation";
            }
        }
    });
}

// ==========================================
// CANCEL INVITATION
// ==========================================

async function cancelInvitation(invitationId) {
    const confirmed = window.confirm(
        "Are you sure you want to cancel this invitation?"
    );

    if (!confirmed) return;

    try {
        await apiRequest(
            `/groups/${groupId}/invitations/${invitationId}`,
            {
                method: "DELETE"
            }
        );

        await loadInvitations();

        showMessage("Invitation cancelled successfully!");

    } catch (error) {
        console.error("Cancel invitation error:", error);
        showMessage(error.message, "error");
    }
}

// ==========================================
// EXPENSE HISTORY
// ==========================================

async function loadExpenses() {
    const container = document.getElementById("expenseHistory");

    try {
        const data = await apiRequest(
            `/expenses?groupId=${encodeURIComponent(groupId)}&limit=100`
        );

        groupExpenses = data.expenses || [];

        renderExpenses();

    } catch (error) {
        groupExpenses = [];

        if (container) {
            container.innerHTML = `
                <p class="empty-state">
                    Could not load expenses.
                    ${escapeHTML(error.message)}
                </p>
            `;
        }

        console.error("Expense history error:", error);
    }
}

function renderExpenses() {
    const container = document.getElementById("expenseHistory");

    if (!container) return;

    if (!groupExpenses.length) {
        container.innerHTML = `
            <p class="empty-state">
                No expenses yet. Add your first expense.
            </p>
        `;
        return;
    }

    container.innerHTML = groupExpenses.map(expense => {
        const payerName =
            expense.payer_name ||
            expense.paid_by_name ||
            expense.name ||
            "Group member";

        const date = expense.created_at
            ? new Date(expense.created_at).toLocaleDateString("en-IN")
            : "";

        return `
            <div class="expense-row">
                <div class="expense-details">
                    <strong>${escapeHTML(expense.description)}</strong>

                    <small>
                        Paid by ${escapeHTML(payerName)}
                        ${date ? ` · ${escapeHTML(date)}` : ""}
                    </small>
                </div>

                <div class="expense-actions">
                    <strong>${formatCurrency(expense.amount)}</strong>

                    <button
                        type="button"
                        data-edit-expense="${escapeHTML(expense.id)}">
                        Edit
                    </button>

                    <button
                        type="button"
                        class="delete-button"
                        data-delete-expense="${escapeHTML(expense.id)}">
                        Delete
                    </button>
                </div>
            </div>
        `;
    }).join("");

    container.querySelectorAll("[data-edit-expense]")
        .forEach(button => {
            button.addEventListener("click", () => {
                const expense = groupExpenses.find(
                    item => String(item.id) === button.dataset.editExpense
                );

                if (expense) openEditExpense(expense);
            });
        });

    container.querySelectorAll("[data-delete-expense]")
        .forEach(button => {
            button.addEventListener("click", () => {
                deleteExpense(button.dataset.deleteExpense);
            });
        });
}

// ==========================================
// EXPENSE SPLIT FORM
// ==========================================

function prepareExpenseSplitForm() {
    const form = document.getElementById("expenseForm");

    if (!form) {
        showMessage("Expense form is missing.", "error");
        return;
    }

    if (!groupMembers.length) {
        showMessage("Group members are still loading.", "error");
        return;
    }

    let editor = document.getElementById("expenseSplitEditor");

    if (!editor) {
        editor = document.createElement("div");
        editor.id = "expenseSplitEditor";
        editor.className = "expense-split-editor";

        const submitButton = form.querySelector(
            'button[type="submit"], input[type="submit"]'
        );

        if (submitButton && submitButton.parentNode) {
            submitButton.parentNode.insertBefore(editor, submitButton);
        } else {
            form.appendChild(editor);
        }
    }

    editor.innerHTML = `
        <div class="form-group">
            <label for="expenseSplitType">Split type</label>

            <select id="expenseSplitType" required>
                <option value="equal">Split equally</option>
                <option value="exact">Exact amounts</option>
                <option value="percentage">Percentage</option>
            </select>
        </div>

        <p class="form-label">Include members in this expense</p>

        <div id="expenseSplitMembers">
            ${groupMembers.map(member => `
                <label class="split-member-option">
                    <input
                        type="checkbox"
                        name="splitMember"
                        value="${escapeHTML(member.id)}"
                        checked
                    >

                    <span>${escapeHTML(member.name)}</span>

                    <input
                        class="split-share-input"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Share"
                        data-share-user="${escapeHTML(member.id)}"
                        style="display:none"
                    >
                </label>
            `).join("")}
        </div>
    `;

    document.getElementById("expenseSplitType")
        ?.addEventListener("change", updateSplitInputs);

    updateSplitInputs();
}

function updateSplitInputs() {
    const splitType =
        document.getElementById("expenseSplitType")?.value;

    document.querySelectorAll("[data-share-user]").forEach(input => {
        input.style.display =
            splitType === "equal" ? "none" : "inline-block";

        input.placeholder =
            splitType === "percentage" ? "%" : "₹";
    });
}

function getSelectedSplits(amount) {
    const splitType =
        document.getElementById("expenseSplitType")?.value;

    const selected = [
        ...document.querySelectorAll(
            'input[name="splitMember"]:checked'
        )
    ];

    if (!selected.length) {
        throw new Error("Select at least one group member.");
    }

    const splits = selected.map(checkbox => {
        const userId = Number(checkbox.value);

        if (splitType === "equal") {
            return { userId };
        }

        const input = document.querySelector(
            `[data-share-user="${userId}"]`
        );

        const value = Number(input?.value);

        if (!Number.isFinite(value) || value <= 0) {
            throw new Error(
                "Enter a valid share for every selected member."
            );
        }

        return splitType === "exact"
            ? { userId, amount: value }
            : { userId, percentage: value };
    });

    if (splitType === "exact") {
        const total = splits.reduce(
            (sum, item) => sum + item.amount,
            0
        );

        if (Math.abs(total - amount) > 0.01) {
            throw new Error(
                "Exact shares must add up to the full expense amount."
            );
        }
    }

    if (splitType === "percentage") {
        const total = splits.reduce(
            (sum, item) => sum + item.percentage,
            0
        );

        if (Math.abs(total - 100) > 0.001) {
            throw new Error("Percentages must add up to 100%.");
        }
    }

    return { splitType, splits };
}

// ==========================================
// CREATE EXPENSE
// ==========================================

function setupExpenseForm() {
    const form = document.getElementById("expenseForm");

    if (!form) return;

    form.addEventListener("submit", async event => {
        event.preventDefault();

        const description =
            document.getElementById("expenseDescription")?.value.trim();

        const amount = Number(
            document.getElementById("expenseAmount")?.value
        );

        if (!description || !Number.isFinite(amount) || amount <= 0) {
            showMessage(
                "Enter a valid description and amount.",
                "error"
            );
            return;
        }

        const submitButton = form.querySelector(
            'button[type="submit"]'
        );

        try {
            const { splitType, splits } = getSelectedSplits(amount);

            if (submitButton) submitButton.disabled = true;

            await apiRequest(
                `/finance/groups/${groupId}/expenses`,
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

            form.reset();
            closeModal("expenseModal");

            await refreshFinancialData();

            showMessage("Expense added successfully!");

        } catch (error) {
            console.error("Add expense error:", error);
            showMessage(error.message, "error");

        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });
}

// ==========================================
// EDIT EXPENSE
// ==========================================

function openEditExpense(expense) {
    document.getElementById("editExpenseDescription").value =
        expense.description || "";

    document.getElementById("editExpenseAmount").value =
        expense.amount || "";

    const form = document.getElementById("editExpenseForm");

    if (form) {
        form.dataset.expenseId = expense.id;
    }

    openModal("editExpenseModal");
}

function setupEditExpenseForm() {
    const form = document.getElementById("editExpenseForm");

    if (!form) return;

    form.addEventListener("submit", async event => {
        event.preventDefault();

        const expenseId = form.dataset.expenseId;

        const description =
            document.getElementById("editExpenseDescription")?.value.trim();

        const amount = Number(
            document.getElementById("editExpenseAmount")?.value
        );

        if (!description || !Number.isFinite(amount) || amount <= 0) {
            showMessage("Enter valid expense details.", "error");
            return;
        }

        try {
            await apiRequest(`/expenses/${expenseId}`, {
                method: "PUT",
                body: JSON.stringify({ description, amount })
            });

            closeModal("editExpenseModal");

            await refreshFinancialData();

            showMessage("Expense updated successfully!");

        } catch (error) {
            console.error("Edit expense error:", error);
            showMessage(error.message, "error");
        }
    });
}

async function deleteExpense(expenseId) {
    if (!window.confirm("Are you sure you want to delete this expense?")) {
        return;
    }

    try {
        await apiRequest(`/expenses/${expenseId}`, {
            method: "DELETE"
        });

        await refreshFinancialData();

        showMessage("Expense deleted successfully!");

    } catch (error) {
        console.error("Delete expense error:", error);
        showMessage(error.message, "error");
    }
}

// ==========================================
// BALANCES AND SIMPLIFIED DEBTS
// ==========================================

async function loadBalances() {
    const data = await apiRequest(
        `/finance/groups/${groupId}/balances`
    );

    // Both balances and suggested debts come from this response.
    groupBalances = data.balances || [];
    suggestedDebts = data.transactions || [];

    renderBalances();
    renderSuggestedDebts();
}

function renderBalances() {
    const container = document.getElementById("groupBalances");

    if (!container) return;

    if (!groupBalances.length) {
        container.innerHTML = `
            <p class="empty-state">No balances available yet.</p>
        `;
        return;
    }

    container.innerHTML = groupBalances.map(member => {
        const balance = Number(member.balance) || 0;

        const statusClass =
            balance > 0 ? "positive" :
            balance < 0 ? "negative" : "neutral";

        const statusText =
            balance > 0 ? "Gets back" :
            balance < 0 ? "Owes" : "Settled";

        return `
            <div class="balance-row">
                <div>
                    <strong>${escapeHTML(member.name)}</strong>
                    <small>${statusText}</small>
                </div>

                <strong class="${statusClass}">
                    ${formatCurrency(Math.abs(balance))}
                </strong>
            </div>
        `;
    }).join("");
}

// ==========================================
// SIMPLIFIED DEBTS
// ==========================================

function renderSuggestedDebts() {
    const container = document.getElementById("groupSettlements");

    if (!container) return;

    if (!suggestedDebts.length) {
        container.innerHTML = `
            <p class="empty-state">
                Everyone is settled. No payments are currently suggested.
            </p>
        `;
        return;
    }

    container.innerHTML = suggestedDebts.map(transaction => `
        <div class="settlement-row">
            <div>
                <strong>${escapeHTML(transaction.from.name)}</strong>
                <small>pays ${escapeHTML(transaction.to.name)}</small>
            </div>

            <strong>${formatCurrency(transaction.amount)}</strong>
        </div>
    `).join("");
}

// ==========================================
// RECORD SETTLEMENT
// ==========================================

function renderSettlementForm() {
    const container = document.getElementById("groupSettlements");

    if (!container) return;

    document.getElementById("recordSettlementForm")?.remove();

    const formHTML = `
        <form id="recordSettlementForm" class="settlement-form">

            <h4>Record a payment</h4>

            <div class="form-group">
                <label for="settlementReceiver">Paid to</label>

                <select id="settlementReceiver" required>
                    <option value="">Select member</option>

                    ${groupMembers.map(member => `
                        <option value="${escapeHTML(member.id)}">
                            ${escapeHTML(member.name)}
                        </option>
                    `).join("")}
                </select>
            </div>

            <div class="form-group">
                <label for="settlementAmount">Amount (₹)</label>

                <input
                    id="settlementAmount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    placeholder="Enter amount"
                >
            </div>

            <button type="submit" class="primary-btn">
                Record payment
            </button>

        </form>
    `;

    container.insertAdjacentHTML("beforeend", formHTML);

    const form = document.getElementById("recordSettlementForm");

    form?.addEventListener("submit", async event => {
        event.preventDefault();

        const receivedBy = Number(
            document.getElementById("settlementReceiver").value
        );

        const amount = Number(
            document.getElementById("settlementAmount").value
        );

        if (!receivedBy || !Number.isFinite(amount) || amount <= 0) {
            showMessage("Enter valid settlement details.", "error");
            return;
        }

        const submitButton = form.querySelector(
            'button[type="submit"]'
        );

        try {
            if (submitButton) submitButton.disabled = true;

            await apiRequest(
                `/finance/groups/${groupId}/settlements`,
                {
                    method: "POST",
                    body: JSON.stringify({
                        receivedBy,
                        amount
                    })
                }
            );

            await refreshFinancialData();

            showMessage("Payment recorded successfully!");

        } catch (error) {
            console.error("Settlement error:", error);
            showMessage(error.message, "error");

        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });
}

// ==========================================
// SUMMARY CARDS
// ==========================================

function updateSummary() {
    const totalExpenses = groupExpenses.reduce(
        (sum, expense) => sum + Number(expense.amount || 0),
        0
    );

    const totalExpensesElement =
        document.getElementById("totalExpenses");

    const totalMembersElement =
        document.getElementById("totalMembers");

    const totalTransactionsElement =
        document.getElementById("totalTransactions");

    if (totalExpensesElement) {
        totalExpensesElement.textContent =
            formatCurrency(totalExpenses);
    }

    if (totalMembersElement) {
        totalMembersElement.textContent = groupMembers.length;
    }

    if (totalTransactionsElement) {
        totalTransactionsElement.textContent = groupExpenses.length;
    }
}

// ==========================================
// REFRESH FINANCIAL DATA
// ==========================================

async function refreshFinancialData() {
    // One balances request updates both balances and suggested debts.
    await Promise.all([
        loadExpenses(),
        loadBalances()
    ]);

    updateSummary();
    renderSettlementForm();
}

// ==========================================
// MODAL CLOSING
// ==========================================

function setupModalClosing() {
    document.querySelectorAll("[data-close-modal]")
        .forEach(button => {
            button.addEventListener("click", () => {
                closeModal(button.dataset.closeModal);
            });
        });

    document.querySelectorAll(
        "#expenseModal, #memberModal, #editExpenseModal"
    ).forEach(modal => {
        modal.addEventListener("click", event => {
            if (event.target === modal) {
                closeModal(modal.id);
            }
        });
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeAllModals();
        }
    });
}

// ==========================================
// SIDEBAR
// ==========================================

function setupSidebar() {
    const menuToggle = document.getElementById("menuToggle");
    const sidebarClose = document.getElementById("sidebarCloseBtn");
    const overlay = document.getElementById("sidebarOverlay");

    menuToggle?.addEventListener("click", () => {
        document.body.classList.add("sidebar-open");
    });

    sidebarClose?.addEventListener("click", () => {
        document.body.classList.remove("sidebar-open");
    });

    overlay?.addEventListener("click", () => {
        document.body.classList.remove("sidebar-open");
    });
}

// ==========================================
// LOGOUT
// ==========================================

function logout() {
    sessionStorage.removeItem("spliaraToken");
    window.location.href = "/";
}
