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

function sendRuntimeMessage(message) {
  if (!chrome?.runtime?.sendMessage) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime?.lastError) {
          resolve(null);
          return;
        }
        resolve(response ?? null);
      });
    } catch {
      resolve(null);
    }
  });
}

function normalizeAutoLoginSettings(rawSettings) {
  const settings = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
  return {
    autoLoginEnabled: settings.autoLoginEnabled === true,
    username: typeof settings.username === 'string' ? settings.username.trim() : '',
    password: typeof settings.password === 'string' ? settings.password.trim() : ''
  };
}

async function getAutoLoginSettingsFromBackground() {
  const response = await sendRuntimeMessage({ type: 'GET_AUTO_LOGIN_SETTINGS' });
  if (!response || response.success !== true || !response.settings) {
    return null;
  }
  return normalizeAutoLoginSettings(response.settings);
}

async function getAutoLoginSettings() {
  const backgroundSettings = await getAutoLoginSettingsFromBackground();
  if (backgroundSettings) {
    return backgroundSettings;
  }

  return {
    autoLoginEnabled: false,
    username: '',
    password: ''
  };
}

function findLoginElements() {
  const usernameField = document.querySelector('input[name="username"], input[id="username"]');
  const passwordField = document.querySelector('input[name="password"], input[name="val"], input[id="password"]');
  const loginButton = document.querySelector('#LoginBtn, button[type="submit"], input[type="submit"], button.btn-login')
    || document.querySelector('input[value="Login"]');
  const loginForm = usernameField?.form
    || passwordField?.form
    || loginButton?.form
    || document.forms?.login
    || document.querySelector('form[name="login"], form');

  return {
    usernameField,
    passwordField,
    loginButton,
    loginForm
  };
}

async function waitForLoginElements(timeoutMs = 5000, intervalMs = 200) {
  const deadline = Date.now() + timeoutMs;
  let elements = findLoginElements();

  while ((!elements.usernameField || !elements.passwordField) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    elements = findLoginElements();
  }

  return elements;
}

function setInputValue(element, value) {
  if (!element) return;

  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');

  if (descriptor?.set) {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }

  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function submitLoginForm(loginButton, loginForm) {
  if (loginButton) {
    loginButton.click();
    return;
  }

  if (loginForm?.requestSubmit) {
    loginForm.requestSubmit();
    return;
  }

  if (typeof loginForm?.submit === 'function') {
    loginForm.submit();
  }
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

  const elements = await waitForLoginElements();
  const targetUser = elements.usernameField;
  const targetPass = elements.passwordField;
  const targetBtn = elements.loginButton;
  const targetForm = elements.loginForm;

  if (targetUser && targetPass && (targetBtn || targetForm)) {
    uxDebugLog("Filling credentials...");
    setInputValue(targetUser, settings.username);
    setInputValue(targetPass, settings.password);

    uxDebugLog("Submitting form...");
    submitLoginForm(targetBtn, targetForm);
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
