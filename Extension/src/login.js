// login.js
// Handles auto-login functionality

// uxDebugModeState, uxDebugLog, uxDebugWarn, syncUxMasterStateToPage,
// STORAGE_KEY_EXTENSION_VISUAL_ENABLED, PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED
// are declared in shared.js (loaded before this file).
// Fallbacks are provided to avoid hard failure if shared.js is unavailable.
var uxDebugModeState = globalThis.uxDebugModeState || { enabled: false };
globalThis.uxDebugModeState = uxDebugModeState;

var uxDebugLog = typeof globalThis.uxDebugLog === 'function'
  ? globalThis.uxDebugLog
  : function (...args) {
    if (!uxDebugModeState.enabled) return;
    console.log(...args);
  };
if (typeof globalThis.uxDebugLog !== 'function') {
  globalThis.uxDebugLog = uxDebugLog;
}

var uxDebugWarn = typeof globalThis.uxDebugWarn === 'function'
  ? globalThis.uxDebugWarn
  : function (...args) {
    if (!uxDebugModeState.enabled) return;
    console.warn(...args);
  };
if (typeof globalThis.uxDebugWarn !== 'function') {
  globalThis.uxDebugWarn = uxDebugWarn;
}

var PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED = typeof globalThis.PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED === 'string'
  ? globalThis.PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED
  : 'webclass_ux_master_enabled';
if (typeof globalThis.PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED !== 'string') {
  globalThis.PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED = PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED;
}

var syncUxMasterStateToPage = typeof globalThis.syncUxMasterStateToPage === 'function'
  ? globalThis.syncUxMasterStateToPage
  : function (enabled) {
    const normalized = enabled ? '1' : '0';
    try {
      if (document && document.documentElement) {
        document.documentElement.dataset.webclassUxMasterEnabled = normalized;
      }
    } catch { }
    try {
      localStorage.setItem(PAGE_STORAGE_KEY_EXTENSION_VISUAL_ENABLED, normalized);
    } catch { }
  };
if (typeof globalThis.syncUxMasterStateToPage !== 'function') {
  globalThis.syncUxMasterStateToPage = syncUxMasterStateToPage;
}

(() => {
  try {
    chrome.storage.local.get({ debugModeEnabled: false, extensionVisualEnabled: true }, (items) => {
      uxDebugModeState.enabled = !!items.debugModeEnabled;
      if (document && document.documentElement) {
        document.documentElement.dataset.webclassUxDebugMode = uxDebugModeState.enabled ? '1' : '0';
      }
      syncUxMasterStateToPage(items.extensionVisualEnabled !== false);
    });
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      if (changes.debugModeEnabled) {
        uxDebugModeState.enabled = !!changes.debugModeEnabled.newValue;
        if (document && document.documentElement) {
          document.documentElement.dataset.webclassUxDebugMode = uxDebugModeState.enabled ? '1' : '0';
        }
      }
      if (changes.extensionVisualEnabled) {
        syncUxMasterStateToPage(changes.extensionVisualEnabled.newValue !== false);
      }
    });
  } catch {
    uxDebugModeState.enabled = false;
  }
})();

uxDebugLog("WebClass UX Improver: Login script loaded");

const AUTO_LOGIN_SESSION_DEFAULTS = {
  username: '',
  password: ''
};

function hasSessionStorageAccess() {
  return !!(chrome?.storage?.session?.get && chrome?.storage?.session?.set);
}

function storageSessionGet(defaults) {
  if (!hasSessionStorageAccess()) {
    return Promise.resolve({ ...defaults });
  }
  try {
    const result = chrome.storage.session.get(defaults);
    if (result && typeof result.then === 'function') {
      return result.catch(() => ({ ...defaults }));
    }
    return Promise.resolve(result || { ...defaults });
  } catch {
    return Promise.resolve({ ...defaults });
  }
}

function storageSessionSet(values) {
  if (!hasSessionStorageAccess()) {
    return Promise.resolve();
  }
  try {
    const result = chrome.storage.session.set(values);
    if (result && typeof result.then === 'function') {
      return result.catch(() => undefined);
    }
    return Promise.resolve();
  } catch {
    return Promise.resolve();
  }
}

async function getAutoLoginSettings() {
  const [localSettings, sessionSecrets] = await Promise.all([
    chrome.storage.local.get({
      autoLoginEnabled: false,
      username: '',
      password: ''
    }),
    storageSessionGet(AUTO_LOGIN_SESSION_DEFAULTS)
  ]);

  const localUsername = typeof localSettings.username === 'string' ? localSettings.username : '';
  const localPassword = typeof localSettings.password === 'string' ? localSettings.password : '';
  const sessionUsername = typeof sessionSecrets.username === 'string' ? sessionSecrets.username : '';
  const sessionPassword = typeof sessionSecrets.password === 'string' ? sessionSecrets.password : '';
  const username = sessionUsername || localUsername;
  const password = sessionPassword || localPassword;

  if (hasSessionStorageAccess() && ((!sessionUsername && localUsername) || (!sessionPassword && localPassword))) {
    await Promise.all([
      storageSessionSet({
        username,
        password
      }),
      chrome.storage.local.set({
        username: '',
        password: ''
      })
    ]);
  }

  return {
    autoLoginEnabled: localSettings.autoLoginEnabled === true,
    username,
    password
  };
}

// Function to retrieve credentials and login
async function attemptAutoLogin() {
  const settings = await getAutoLoginSettings();
  const autoLoginEnabled = settings.autoLoginEnabled === true;

  if (!autoLoginEnabled) {
    uxDebugLog("Auto-login is disabled.");
    return;
  }

  if (!settings.username || !settings.password) {
    uxDebugLog("Credentials not found.");
    return;
  }

  const usernameField = document.querySelector('input[name="username"], input[id="username"]');
  const passwordField = document.querySelector('input[name="password"], input[name="val"], input[id="password"]');
  const loginButton = document.querySelector('#LoginBtn, button[type="submit"], input[type="submit"]');

  // Specific selectors for Kanagawa U WebClass if generic ones fail
  // Based on standard WebClass login forms
  const specificUser = document.getElementById('username');
  const specificPass = document.getElementById('password');
  // Sometimes login button has specific ID or class
  const specificBtn = document.querySelector('#LoginBtn, button.btn-login')
    || document.querySelector('input[value="Login"]');

  const targetUser = usernameField || specificUser;
  const targetPass = passwordField || specificPass;
  const targetBtn = loginButton || specificBtn;

  if (targetUser && targetPass && targetBtn) {
    uxDebugLog("Filling credentials...");
    targetUser.value = settings.username;
    targetPass.value = settings.password;

    // Dispatch events to ensure frameworks detect changes
    targetUser.dispatchEvent(new Event('input', { bubbles: true }));
    targetPass.dispatchEvent(new Event('input', { bubbles: true }));

    uxDebugLog("Submitting form...");
    targetBtn.click();
  } else {
    uxDebugLog("Login fields not found. This might not be a login page.");
  }
}

// Run on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    attemptAutoLogin().catch((error) => {
      uxDebugWarn('Auto-login skipped due to storage access restrictions.', error);
    });
  });
} else {
  attemptAutoLogin().catch((error) => {
    uxDebugWarn('Auto-login skipped due to storage access restrictions.', error);
  });
}
