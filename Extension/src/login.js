// login.js
// Handles auto-login functionality

console.log("WebClass UX Improver: Login script loaded");

// Function to retrieve credentials and login
async function attemptAutoLogin() {
  const settings = await chrome.storage.local.get(['autoLoginEnabled', 'username', 'password']);

  if (!settings.autoLoginEnabled) {
    console.log("Auto-login is disabled.");
    return;
  }

  if (!settings.username || !settings.password) {
    console.log("Credentials not found.");
    return;
  }

  const usernameField = document.querySelector('input[name="username"], input[id="username"]');
  const passwordField = document.querySelector('input[name="password"], input[id="password"]');
  const loginButton = document.querySelector('button[type="submit"], input[type="submit"]');

  // Specific selectors for Kanagawa U WebClass if generic ones fail
  // Based on standard WebClass login forms
  const specificUser = document.getElementById('username');
  const specificPass = document.getElementById('password');
  // Sometimes login button has specific ID or class
  const specificBtn = document.querySelector('button.btn-login') || document.querySelector('input[value="Login"]');

  const targetUser = usernameField || specificUser;
  const targetPass = passwordField || specificPass;
  const targetBtn = loginButton || specificBtn;

  if (targetUser && targetPass && targetBtn) {
    console.log("Filling credentials...");
    targetUser.value = settings.username;
    targetPass.value = settings.password;

    // Dispatch events to ensure frameworks detect changes
    targetUser.dispatchEvent(new Event('input', { bubbles: true }));
    targetPass.dispatchEvent(new Event('input', { bubbles: true }));

    console.log("Submitting form...");
    targetBtn.click();
  } else {
    console.log("Login fields not found. This might not be a login page.");
  }
}

// Run on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', attemptAutoLogin);
} else {
  attemptAutoLogin();
}
