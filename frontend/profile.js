
const API_URL = "/api";
const token = sessionStorage.getItem("spliaraToken");

// ==========================================
// DOM ELEMENTS
// ==========================================

const profileForm = document.getElementById("profileForm");
const profileName = document.getElementById("profileName");
const profileEmail = document.getElementById("profileEmail");

const profileDisplayName = document.getElementById("profileDisplayName");
const profileDisplayEmail = document.getElementById("profileDisplayEmail");
const profileAvatar = document.getElementById("profileAvatar");

const welcomeUser = document.getElementById("welcomeUser");
const profileMessage = document.getElementById("profileMessage");
const saveProfileBtn = document.getElementById("saveProfileBtn");

const memberAccountName = document.getElementById("memberAccountName");
const memberAccountEmail = document.getElementById("memberAccountEmail");
const profileMemberSince = document.getElementById("profileMemberSince");

// ==========================================
// AUTHENTICATION
// ==========================================

if (!token) {
    window.location.href = "index.html";
}

function getHeaders() {
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
    };
}

// ==========================================
// PROFILE MESSAGES
// ==========================================

function showMessage(message, type = "success") {
    if (!profileMessage) return;

    profileMessage.textContent = message;
    profileMessage.className = "profile-message";

    if (type === "error") {
        profileMessage.classList.add("error");
    }
}

// ==========================================
// FORMAT MEMBERSHIP DATE
// ==========================================

function formatMemberDate(dateValue) {
    if (!dateValue) return "Not available";

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
        return "Not available";
    }

    return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}

// ==========================================
// LOAD PROFILE
// ==========================================

async function loadProfile() {
    try {
        const response = await fetch(`${API_URL}/auth/profile`, {
            method: "GET",
            headers: getHeaders()
        });

        const data = await response.json();

        if (response.status === 401 || response.status === 403) {
            logout();
            return;
        }

        if (!response.ok) {
            throw new Error(data.message || "Could not load profile.");
        }

        displayProfile(data.user);

    } catch (error) {
        console.error("Profile loading error:", error);
        showMessage(error.message, "error");
    }
}

// ==========================================
// DISPLAY PROFILE
// ==========================================

function displayProfile(user) {
    if (!user) return;

    const name = user.name || "Spliara Member";
    const email = user.email || "";

    if (profileName) {
        profileName.value = name;
    }

    if (profileEmail) {
        profileEmail.value = email;
    }

    if (profileDisplayName) {
        profileDisplayName.textContent = name;
    }

    if (profileDisplayEmail) {
        profileDisplayEmail.textContent = email;
    }

    if (welcomeUser) {
        welcomeUser.textContent = `Welcome, ${name}!`;
    }

    if (memberAccountName) {
        memberAccountName.textContent = name;
    }

    if (memberAccountEmail) {
        memberAccountEmail.textContent = email;
    }

    if (profileMemberSince) {
        profileMemberSince.textContent =
            formatMemberDate(user.created_at);
    }

    // PROFILE AVATAR

    if (profileAvatar) {
        const firstLetter = name.trim().charAt(0).toUpperCase() || "U";

        profileAvatar.textContent = firstLetter;

        if (user.profile_picture_url) {
            const image = document.createElement("img");

            image.src = user.profile_picture_url;
            image.alt = "Profile picture";
            image.style.width = "100%";
            image.style.height = "100%";
            image.style.objectFit = "cover";
            image.style.borderRadius = "50%";

            image.onerror = () => {
                profileAvatar.textContent = firstLetter;
            };

            profileAvatar.textContent = "";
            profileAvatar.appendChild(image);
        }
    }
}

// ==========================================
// UPDATE PROFILE
// ==========================================

if (profileForm) {
    profileForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const name = profileName.value.trim();
        const email = profileEmail.value.trim();

        if (name.length < 2 || name.length > 100) {
            showMessage(
                "Name must contain between 2 and 100 characters.",
                "error"
            );
            return;
        }

        if (saveProfileBtn) {
            saveProfileBtn.disabled = true;
            saveProfileBtn.textContent = "Saving...";
        }

        try {
            const response = await fetch(`${API_URL}/auth/profile`, {
                method: "PUT",
                headers: getHeaders(),
                body: JSON.stringify({ name, email })
            });

            const data = await response.json();

            if (response.status === 401 || response.status === 403) {
                logout();
                return;
            }

            if (!response.ok) {
                throw new Error(data.message || "Could not update profile.");
            }

            displayProfile(data.user);

            showMessage("Your profile has been updated successfully!");

        } catch (error) {
            console.error("Profile update error:", error);
            showMessage(error.message, "error");

        } finally {
            if (saveProfileBtn) {
                saveProfileBtn.disabled = false;
                saveProfileBtn.textContent = "Save Changes";
            }
        }
    });
}

// ==========================================
// MIDNIGHT FOREST THEME
// Reads the theme selected in Settings
// ==========================================

const darkThemeStyles = document.createElement("style");

darkThemeStyles.textContent = `

    body.dark-theme {
        --ivory: #171B18;
        --white: #252B26;
        --walnut: #F5F1E8;
        --muted: #B7BEB5;
        --border: #414B40;
        --sage: #78916F;
        --sage-dark: #607858;
        --sage-light: #26352B;

        background: #171B18;
        color: #F5F1E8;
        color-scheme: dark;
    }

    body.dark-theme .main-content {
        background: #171B18;
        color: #F5F1E8;
    }

    body.dark-theme .sidebar,
    body.dark-theme .topbar {
        background: #202920;
        color: #F5F1E8;
        border-color: #414B40;
    }

    body.dark-theme .sidebar a,
    body.dark-theme .nav-link {
        color: #D9DFD5;
    }

    body.dark-theme .nav-link:hover,
    body.dark-theme .nav-link.active {
        background: #344536;
        color: #FFFFFF;
    }

    body.dark-theme .profile-container {
        color: #F5F1E8;
    }

    body.dark-theme .profile-overview,
    body.dark-theme .profile-panel {
        background: #252B26;
        border: 1px solid #414B40;
        color: #F5F1E8;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
    }

    body.dark-theme h1,
    body.dark-theme h2,
    body.dark-theme h3 {
        color: #F5F1E8;
    }

    body.dark-theme p,
    body.dark-theme .profile-intro {
        color: #B7BEB5;
    }

    body.dark-theme .section-eyebrow {
        color: #AFC3A6;
    }

    body.dark-theme .profile-field label {
        color: #E3E9DF;
    }

    body.dark-theme .profile-field input {
        background: #202920;
        color: #F5F1E8;
        border: 1px solid #536052;
    }

    body.dark-theme .profile-field input:focus {
        border-color: #91A987;
        outline: 2px solid rgba(120, 145, 111, 0.2);
    }

    body.dark-theme .profile-field input:disabled {
        color: #B7BEB5;
        opacity: 1;
    }

    body.dark-theme .profile-primary-btn {
        background: #78916F;
        color: #FFFFFF;
        border: none;
    }

    body.dark-theme .profile-primary-btn:hover {
        background: #8BA481;
    }

    body.dark-theme .profile-avatar {
        background: #344B37;
        color: #F5F1E8;
    }

    body.dark-theme .settings-item {
        border-color: #414B40;
    }

    body.dark-theme .settings-item-icon {
        background: #344536;
        color: #C6D6BE;
    }

    body.dark-theme .settings-status {
        color: #B8C9B1;
    }

    body.dark-theme .profile-message {
        color: #B8D5AE;
    }

    body.dark-theme .profile-message.error {
        color: #F2B7A9;
    }

    body.dark-theme .profile-footer {
        color: #A9B2A6;
        border-color: #414B40;
    }

    body.dark-theme .sidebar-overlay {
        background: rgba(0, 0, 0, 0.65);
    }

    body.dark-theme button:focus-visible,
    body.dark-theme a:focus-visible {
        outline: 2px solid #AFC3A6;
        outline-offset: 3px;
    }
`;

document.head.appendChild(darkThemeStyles);

// Apply previously selected theme

const savedTheme = localStorage.getItem("spliaraTheme") || "light";

document.body.classList.toggle(
    "dark-theme",
    savedTheme === "dark"
);

// ==========================================
// LOGOUT
// ==========================================

function logout() {
    sessionStorage.removeItem("spliaraToken");
    window.location.href = "index.html";
}

const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {
    logoutBtn.addEventListener("click", logout);
}

// ==========================================
// MOBILE SIDEBAR
// ==========================================

const sidebar = document.getElementById("sidebar");
const menuToggle = document.getElementById("menuToggle");
const sidebarCloseBtn = document.getElementById("sidebarCloseBtn");
const sidebarOverlay = document.getElementById("sidebarOverlay");

function openSidebar() {
    if (!sidebar || !sidebarOverlay) return;

    sidebar.classList.add("open");
    sidebarOverlay.classList.add("active");
}

function closeSidebar() {
    if (!sidebar || !sidebarOverlay) return;

    sidebar.classList.remove("open");
    sidebarOverlay.classList.remove("active");
}

if (menuToggle) {
    menuToggle.addEventListener("click", openSidebar);
}

if (sidebarCloseBtn) {
    sidebarCloseBtn.addEventListener("click", closeSidebar);
}

if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", closeSidebar);
}

// ==========================================
// INITIALIZE
// ==========================================

if (token) {
    loadProfile();
}
