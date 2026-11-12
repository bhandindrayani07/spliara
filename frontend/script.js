
const authForm = document.getElementById("authForm");

const loginTab = document.getElementById("loginTab");
const signupTab = document.getElementById("signupTab");

const formTitle = document.getElementById("formTitle");
const formSubtitle = document.getElementById("formSubtitle");

const nameGroup = document.getElementById("nameGroup");
const nameInput = document.getElementById("name");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");

const submitBtn = document.getElementById("submitBtn");
const message = document.getElementById("message");

const switchText = document.getElementById("switchText");
const switchBtn = document.getElementById("switchBtn");

let currentMode = "login";

// ==========================================
// INVITATION LINK HANDLING
// ==========================================

// Preserve an invitation token when a user opens
// the login or signup page through an invitation.

const urlParams = new URLSearchParams(window.location.search);

const invitationToken =
    urlParams.get("inviteToken") || urlParams.get("token");

if (invitationToken) {
    sessionStorage.setItem("pendingInvitationToken", invitationToken);
}

const pendingInvitationToken =
    sessionStorage.getItem("pendingInvitationToken");

// ==========================================
// LOGIN AND SIGNUP MODE
// ==========================================

function setMode(mode, updateUrl = true) {
    currentMode = mode;

    message.textContent = "";
    authForm.reset();

    if (mode === "signup") {
        formTitle.textContent = "Create your account";
        formSubtitle.textContent =
            "Join Spliara and simplify shared expenses.";

        nameGroup.hidden = false;
        nameInput.required = true;

        passwordInput.autocomplete = "new-password";
        submitBtn.textContent = "Create Account";

        loginTab.classList.remove("active");
        signupTab.classList.add("active");

        switchText.firstChild.textContent =
            "Already have an account? ";

        switchBtn.textContent = "Login";

    } else {
        formTitle.textContent = "Welcome back!";
        formSubtitle.textContent =
            "Log in to continue to your account.";

        nameGroup.hidden = true;
        nameInput.required = false;

        passwordInput.autocomplete = "current-password";
        submitBtn.textContent = "Login to Spliara";

        signupTab.classList.remove("active");
        loginTab.classList.add("active");

        switchText.firstChild.textContent =
            "Don't have an account? ";

        switchBtn.textContent = "Sign up";
    }

    // Update URL without removing invitation information.
    if (updateUrl && window.location.hash !== `#${mode}`) {
        window.location.hash = mode;
    }
}

// ==========================================
// TAB EVENTS
// ==========================================

loginTab.addEventListener("click", () => setMode("login"));

signupTab.addEventListener("click", () => setMode("signup"));

switchBtn.addEventListener("click", () => {
    setMode(currentMode === "login" ? "signup" : "login");
});

// ==========================================
// BROWSER BACK AND FORWARD
// ==========================================

window.addEventListener("hashchange", () => {
    const mode = window.location.hash === "#signup"
        ? "signup"
        : "login";

    if (mode !== currentMode) {
        setMode(mode, false);
    }
});

// ==========================================
// INITIAL PAGE MODE
// ==========================================

const initialMode = window.location.hash === "#signup"
    ? "signup"
    : "login";

setMode(initialMode);

// ==========================================
// AUTHENTICATION FORM
// ==========================================

authForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    const selectedMode = currentMode;

    const endpoint = selectedMode === "signup"
        ? "/api/auth/register"
        : "/api/auth/login";

    const requestData = selectedMode === "signup"
        ? {
            name: nameInput.value.trim(),
            email,
            password
        }
        : {
            email,
            password
        };

    submitBtn.disabled = true;
    submitBtn.textContent = "Please wait...";
    message.textContent = "";

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(requestData)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Something went wrong.");
        }

        // ======================================
        // SUCCESSFUL SIGNUP
        // ======================================

        if (selectedMode === "signup") {
            message.textContent =
                pendingInvitationToken
                    ? "Account created successfully! Log in using the invited email to accept your group invitation."
                    : "Account created successfully! You can now log in.";

            message.style.color = "#23834c";

            // Switch to login without losing the invitation.
            setMode("login");

            message.textContent =
                pendingInvitationToken
                    ? "Account created! Now log in using the invited email to accept your invitation."
                    : "Account created successfully! You can now log in.";

            message.style.color = "#23834c";

        } else {

            // ==================================
            // SUCCESSFUL LOGIN
            // ==================================

            if (!data.token) {
                throw new Error(
                    "Login succeeded but no token was received."
                );
            }

            sessionStorage.setItem("spliaraToken", data.token);

            message.textContent = "Login successful!";
            message.style.color = "#23834c";

            // If the user came through an invitation,
            // open the invitation acceptance page.
            const savedInvitationToken =
                sessionStorage.getItem("pendingInvitationToken");

            if (savedInvitationToken) {
                window.location.href =
                    `accept-invitation.html?token=${encodeURIComponent(savedInvitationToken)}`;
            } else {
                window.location.href = "dashboard.html";
            }

            return;
        }

    } catch (error) {
        message.textContent =
            error.message || "Unable to connect to server.";

        message.style.color = "#d04444";

    } finally {
        submitBtn.disabled = false;

        submitBtn.textContent = currentMode === "signup"
            ? "Create Account"
            : "Login to Spliara";
    }
});
