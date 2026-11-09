
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

// Switch between Login and Sign Up
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

    // Update the URL
    if (updateUrl && window.location.hash !== `#${mode}`) {
        window.location.hash = mode;
    }
}

// Login and Signup tab events
loginTab.addEventListener("click", () => setMode("login"));
signupTab.addEventListener("click", () => setMode("signup"));

// Switch between Login and Signup
switchBtn.addEventListener("click", () => {
    setMode(currentMode === "login" ? "signup" : "login");
});

// Handle browser back and forward buttons
window.addEventListener("hashchange", () => {
    const mode = window.location.hash === "#signup"
        ? "signup"
        : "login";

    if (mode !== currentMode) {
        setMode(mode, false);
    }
});

// Set the initial route
const initialMode = window.location.hash === "#signup"
    ? "signup"
    : "login";

setMode(initialMode);

// Connect authentication form to backend API
authForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    const endpoint = currentMode === "signup"
        ? "/api/auth/register"
        : "/api/auth/login";

    const requestData = currentMode === "signup"
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

        if (currentMode === "signup") {
            message.textContent =
                "Account created successfully! You can now log in.";

            message.style.color = "#23834c";

        } else {
            if (!data.token) {
                throw new Error("Login succeeded but no token was received.");
            }

            sessionStorage.setItem("spliaraToken", data.token);

            message.textContent = "Login successful!";
            message.style.color = "#23834c";

            // Open dashboard after successful login
            window.location.href = "dashboard.html";
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
