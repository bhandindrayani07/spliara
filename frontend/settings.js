
const API_URL = "/api";

const token = sessionStorage.getItem("spliaraToken");

if (!token) {
    window.location.href = "index.html";
}

// ==========================================
// API HEADERS
// ==========================================

function getHeaders() {
    return {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
    };
}

// ==========================================
// MESSAGE DISPLAY
// ==========================================

function showMessage(elementId, message, type = "success") {
    const element = document.getElementById(elementId);
    if (!element) return;

    element.textContent = message;
    element.className = "settings-message";

    if (type === "error") {
        element.classList.add("error");
    }
}

// ==========================================
// LOGOUT
// ==========================================

function logout() {
    sessionStorage.removeItem("spliaraToken");
    window.location.href = "index.html";
}

document.getElementById("logoutBtn")?.addEventListener("click", logout);

document.getElementById("settingsLogoutBtn")
    ?.addEventListener("click", logout);

// ==========================================
// MOBILE SIDEBAR
// ==========================================

const sidebar = document.getElementById("sidebar");
const menuToggle = document.getElementById("menuToggle");
const sidebarCloseBtn = document.getElementById("sidebarCloseBtn");
const sidebarOverlay = document.getElementById("sidebarOverlay");

menuToggle?.addEventListener("click", () => {
    sidebar?.classList.add("active");
    sidebarOverlay?.classList.add("active");
});

sidebarCloseBtn?.addEventListener("click", () => {
    sidebar?.classList.remove("active");
    sidebarOverlay?.classList.remove("active");
});

sidebarOverlay?.addEventListener("click", () => {
    sidebar?.classList.remove("active");
    sidebarOverlay?.classList.remove("active");
});

// ==========================================
// THEME PREFERENCE
// ==========================================

const themePreference = document.getElementById("themePreference");

function applyTheme(theme) {
    const selectedTheme = theme === "dark" ? "dark" : "light";

    document.body.classList.toggle(
        "dark-theme",
        selectedTheme === "dark"
    );

    localStorage.setItem("spliaraTheme", selectedTheme);

    if (themePreference) {
        themePreference.value = selectedTheme;
    }
}

const savedTheme = localStorage.getItem("spliaraTheme") || "light";

applyTheme(savedTheme);

themePreference?.addEventListener("change", (event) => {
    applyTheme(event.target.value);
});

// ==========================================
// LOAD ACCOUNT INFORMATION
// ==========================================

let currentUser = null;

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

function displayProfilePicture(user) {
    const avatar = document.getElementById("settingsAvatar");
    if (!avatar) return;

    avatar.replaceChildren();

    if (user.profile_picture_url) {
        const image = document.createElement("img");

        image.src = new URL(
            user.profile_picture_url,
            window.location.origin
        ).href;

        image.alt = "Profile picture";

        image.onerror = () => {
            avatar.replaceChildren();
            avatar.textContent = user.name?.charAt(0).toUpperCase() || "U";
        };

        avatar.appendChild(image);
    } else {
        avatar.textContent = user.name?.charAt(0).toUpperCase() || "U";
    }
}

function displayAccountInformation(user) {
    if (!user) return;

    document.getElementById("settingsDisplayName").textContent =
        user.name || "User";

    document.getElementById("settingsAccountName").textContent =
        user.name || "Not available";

    document.getElementById("settingsAccountEmail").textContent =
        user.email || "Not available";

    document.getElementById("settingsMemberSince").textContent =
        formatMemberDate(user.created_at);

    document.getElementById("welcomeUser").textContent =
        `Welcome, ${user.name || "User"}!`;

    displayProfilePicture(user);
}

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
            throw new Error(data.message || "Could not load account information.");
        }

        currentUser = data.user;

        displayAccountInformation(currentUser);

    } catch (error) {
        console.error("Settings profile error:", error);

        document.getElementById("settingsDisplayName").textContent =
            "Could not load profile";
    }
}

loadProfile();

// ==========================================
// UPLOAD PROFILE PICTURE
// ==========================================

const profilePictureInput = document.getElementById("profilePictureInput");

profilePictureInput?.addEventListener("change", async () => {
    const file = profilePictureInput.files[0];

    if (!file) return;

    const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp"
    ];

    if (!allowedTypes.includes(file.type)) {
        showMessage(
            "pictureMessage",
            "Please select a JPG, PNG or WebP image.",
            "error"
        );

        profilePictureInput.value = "";
        return;
    }

    if (file.size > 2 * 1024 * 1024) {
        showMessage(
            "pictureMessage",
            "Image must be smaller than 2 MB.",
            "error"
        );

        profilePictureInput.value = "";
        return;
    }

    const formData = new FormData();

    // Must match upload.single("profilePicture") in auth.js
    formData.append("profilePicture", file);

    try {
        showMessage("pictureMessage", "Uploading picture...");

        const response = await fetch(
            `${API_URL}/auth/profile-picture`,
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`
                },
                body: formData
            }
        );

        const data = await response.json();

        if (response.status === 401 || response.status === 403) {
            logout();
            return;
        }

        if (!response.ok) {
            throw new Error(data.message || "Picture upload failed.");
        }

        // Preserve existing information such as created_at
        currentUser = { ...currentUser, ...data.user };

        displayAccountInformation(currentUser);

        showMessage(
            "pictureMessage",
            "Profile picture uploaded successfully!"
        );

    } catch (error) {
        console.error("Picture upload error:", error);

        showMessage(
            "pictureMessage",
            error.message || "Could not upload picture.",
            "error"
        );

    } finally {
        profilePictureInput.value = "";
    }
});

// ==========================================
// REMOVE PROFILE PICTURE
// ==========================================

document.getElementById("removePictureBtn")
    ?.addEventListener("click", async () => {

        if (!currentUser?.profile_picture_url) {
            showMessage(
                "pictureMessage",
                "You don't have a profile picture to remove.",
                "error"
            );
            return;
        }

        try {
            const response = await fetch(
                `${API_URL}/auth/profile-picture`,
                {
                    method: "DELETE",
                    headers: getHeaders()
                }
            );

            const data = await response.json();

            if (response.status === 401 || response.status === 403) {
                logout();
                return;
            }

            if (!response.ok) {
                throw new Error(data.message || "Could not remove picture.");
            }

            // Preserve existing information such as created_at
            currentUser = { ...currentUser, ...data.user };

            displayAccountInformation(currentUser);

            showMessage(
                "pictureMessage",
                "Profile picture removed successfully!"
            );

        } catch (error) {
            console.error("Remove picture error:", error);

            showMessage(
                "pictureMessage",
                error.message || "Could not remove picture.",
                "error"
            );
        }
    });

// ==========================================
// CHANGE PASSWORD
// ==========================================

const passwordForm = document.getElementById("passwordForm");

passwordForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const currentPassword =
        document.getElementById("currentPassword").value;

    const newPassword =
        document.getElementById("newPassword").value;

    const confirmPassword =
        document.getElementById("confirmPassword").value;

    const changePasswordBtn =
        document.getElementById("changePasswordBtn");

    if (newPassword.length < 8) {
        showMessage(
            "passwordMessage",
            "New password must contain at least 8 characters.",
            "error"
        );
        return;
    }

    if (newPassword !== confirmPassword) {
        showMessage(
            "passwordMessage",
            "New password and confirmation do not match.",
            "error"
        );
        return;
    }

    if (currentPassword === newPassword) {
        showMessage(
            "passwordMessage",
            "Your new password must be different from your current password.",
            "error"
        );
        return;
    }

    try {
        changePasswordBtn.disabled = true;
        changePasswordBtn.textContent = "Updating...";

        const response = await fetch(
            `${API_URL}/auth/change-password`,
            {
                method: "PUT",
                headers: getHeaders(),
                body: JSON.stringify({
                    currentPassword,
                    newPassword
                })
            }
        );

        const data = await response.json();

        if (response.status === 401 || response.status === 403) {
            logout();
            return;
        }

        if (!response.ok) {
            throw new Error(data.message || "Could not change password.");
        }

        passwordForm.reset();

        showMessage(
            "passwordMessage",
            "Password changed successfully!"
        );

    } catch (error) {
        console.error("Password update error:", error);

        showMessage(
            "passwordMessage",
            error.message || "Could not change password.",
            "error"
        );

    } finally {
        changePasswordBtn.disabled = false;
        changePasswordBtn.textContent = "Update Password";
    }
});
