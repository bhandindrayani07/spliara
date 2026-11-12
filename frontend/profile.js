
// ==========================================
// SPLIARA - USER PROFILE
// ==========================================

const API_URL = "/api";
const token = sessionStorage.getItem("spliaraToken");

const DEFAULT_PROFILE_IMAGE =
    "https://placehold.co/160x160?text=Profile";

const DEFAULT_PREVIEW_IMAGE =
    "https://placehold.co/100x100?text=Photo";

let currentUser = null;
let selectedPicture = null;
let previewObjectUrl = null;

// ==========================================
// AUTHENTICATION CHECK
// ==========================================

if (!token) {
    window.location.href = "/";
}

// ==========================================
// ELEMENTS
// ==========================================

const profileForm = document.getElementById("profileForm");
const passwordForm = document.getElementById("passwordForm");

const fullNameInput = document.getElementById("fullName");
const emailInput = document.getElementById("emailAddress");

const profileImage = document.getElementById("profileImage");
const picturePreview = document.getElementById("picturePreview");
const pictureInput = document.getElementById("profilePictureInput");

const choosePictureBtn = document.getElementById("choosePictureBtn");
const removePictureBtn = document.getElementById("removePictureBtn");

const profileMessage = document.getElementById("profileMessage");

// ==========================================
// API REQUEST FUNCTION
// ==========================================

async function apiRequest(endpoint, options = {}) {
    const headers = {
        Authorization: `Bearer ${token}`,
        ...options.headers
    };

    if (options.body && !(options.body instanceof FormData)) {
        headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers
    });

    const data = await response.json();

    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            sessionStorage.removeItem("spliaraToken");
            window.location.href = "/";
        }

        throw new Error(data.message || "Something went wrong.");
    }

    return data;
}

// ==========================================
// MESSAGE DISPLAY
// ==========================================

function showProfileMessage(message, type = "success") {
    profileMessage.textContent = message;
    profileMessage.className = `profile-message ${type}`;

    window.setTimeout(() => {
        profileMessage.textContent = "";
        profileMessage.className = "profile-message";
    }, 4000);
}

// ==========================================
// PROFILE PICTURE DISPLAY
// ==========================================

function updatePictureDisplay(pictureUrl) {
    if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = null;
    }

    if (pictureUrl) {
        const imageUrl = pictureUrl.startsWith("http")
            ? pictureUrl
            : `${window.location.origin}${pictureUrl}`;

        profileImage.src = imageUrl;
        picturePreview.src = imageUrl;
    } else {
        profileImage.src = DEFAULT_PROFILE_IMAGE;
        picturePreview.src = DEFAULT_PREVIEW_IMAGE;
    }

    profileImage.onerror = () => {
        profileImage.src = DEFAULT_PROFILE_IMAGE;
    };

    picturePreview.onerror = () => {
        picturePreview.src = DEFAULT_PREVIEW_IMAGE;
    };
}

// ==========================================
// LOAD USER PROFILE
// ==========================================

async function loadProfile() {
    try {
        const data = await apiRequest("/auth/profile");

        currentUser = data.user;

        fullNameInput.value = currentUser.name || "";
        emailInput.value = currentUser.email || "";

        document.getElementById("profileDisplayName").textContent =
            currentUser.name || "Spliara Member";

        document.getElementById("profileDisplayEmail").textContent =
            currentUser.email || "";

        document.getElementById("accountId").textContent =
            currentUser.id ?? "—";

        if (currentUser.created_at) {
            const date = new Date(currentUser.created_at);

            document.getElementById("memberSince").textContent =
                date.toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "long",
                    year: "numeric"
                });
        }

        updatePictureDisplay(currentUser.profile_picture_url);

    } catch (error) {
        showProfileMessage(error.message, "error");
    }
}

// ==========================================
// CANCEL PROFILE CHANGES
// ==========================================

profileForm.addEventListener("reset", () => {
    window.setTimeout(() => {
        if (currentUser) {
            fullNameInput.value = currentUser.name || "";
            emailInput.value = currentUser.email || "";
        }
    }, 0);
});

// ==========================================
// UPDATE PERSONAL INFORMATION
// ==========================================

profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = fullNameInput.value.trim();
    const email = emailInput.value.trim();

    if (name.length < 2) {
        showProfileMessage(
            "Name must contain at least 2 characters.",
            "error"
        );
        return;
    }

    try {
        const data = await apiRequest("/auth/profile", {
            method: "PUT",
            body: JSON.stringify({ name, email })
        });

        currentUser = {
            ...currentUser,
            ...data.user
        };

        document.getElementById("profileDisplayName").textContent =
            currentUser.name;

        document.getElementById("profileDisplayEmail").textContent =
            currentUser.email;

        fullNameInput.value = currentUser.name;
        emailInput.value = currentUser.email;

        showProfileMessage(data.message);

    } catch (error) {
        showProfileMessage(error.message, "error");
    }
});

// ==========================================
// SELECT PROFILE PICTURE
// ==========================================

choosePictureBtn.addEventListener("click", () => {
    if (selectedPicture) {
        uploadProfilePicture();
    } else {
        pictureInput.click();
    }
});

pictureInput.addEventListener("change", () => {
    const file = pictureInput.files[0];

    if (!file) return;

    const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp"
    ];

    if (!allowedTypes.includes(file.type)) {
        showProfileMessage(
            "Please select a JPG, PNG or WebP image.",
            "error"
        );

        pictureInput.value = "";
        return;
    }

    if (file.size > 2 * 1024 * 1024) {
        showProfileMessage(
            "Image must be smaller than 2 MB.",
            "error"
        );

        pictureInput.value = "";
        return;
    }

    selectedPicture = file;

    if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
    }

    previewObjectUrl = URL.createObjectURL(file);

    profileImage.src = previewObjectUrl;
    picturePreview.src = previewObjectUrl;

    showProfileMessage(
        "Picture selected. Click Choose Picture again to upload."
    );
});

// ==========================================
// UPLOAD PROFILE PICTURE
// ==========================================

async function uploadProfilePicture() {
    if (!selectedPicture) {
        pictureInput.click();
        return;
    }

    const formData = new FormData();

    formData.append("profilePicture", selectedPicture);

    try {
        choosePictureBtn.disabled = true;

        const data = await apiRequest("/auth/profile-picture", {
            method: "POST",
            body: formData
        });

        currentUser = {
            ...currentUser,
            ...data.user
        };

        selectedPicture = null;
        pictureInput.value = "";

        updatePictureDisplay(currentUser.profile_picture_url);

        showProfileMessage(data.message);

    } catch (error) {
        showProfileMessage(error.message, "error");

    } finally {
        choosePictureBtn.disabled = false;
    }
}

// ==========================================
// REMOVE PROFILE PICTURE
// ==========================================

removePictureBtn.addEventListener("click", async () => {
    try {
        removePictureBtn.disabled = true;

        const data = await apiRequest("/auth/profile-picture", {
            method: "DELETE"
        });

        currentUser = {
            ...currentUser,
            ...data.user
        };

        selectedPicture = null;
        pictureInput.value = "";

        updatePictureDisplay(null);

        showProfileMessage(data.message);

    } catch (error) {
        showProfileMessage(error.message, "error");

    } finally {
        removePictureBtn.disabled = false;
    }
});

// ==========================================
// CHANGE PASSWORD
// ==========================================

passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const currentPassword =
        document.getElementById("currentPassword").value;

    const newPassword =
        document.getElementById("newPassword").value;

    const confirmPassword =
        document.getElementById("confirmPassword").value;

    if (newPassword.length < 8) {
        showProfileMessage(
            "New password must be at least 8 characters.",
            "error"
        );
        return;
    }

    if (newPassword !== confirmPassword) {
        showProfileMessage(
            "New passwords do not match.",
            "error"
        );
        return;
    }

    try {
        const data = await apiRequest("/auth/change-password", {
            method: "PUT",
            body: JSON.stringify({
                currentPassword,
                newPassword
            })
        });

        passwordForm.reset();

        showProfileMessage(data.message);

    } catch (error) {
        showProfileMessage(error.message, "error");
    }
});

// ==========================================
// LOGOUT
// ==========================================

document.getElementById("logoutBtn").addEventListener("click", () => {
    sessionStorage.removeItem("spliaraToken");
    window.location.href = "/";
});

// ==========================================
// INITIALIZE PROFILE PAGE
// ==========================================

loadProfile();
