/**
 * Microsoft Graph API Client
 * Microsoft To Do連携用
 */

class MSGraphClient {
  constructor() {
    this.clientId = null;
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    this.baseUrl = 'https://graph.microsoft.com/v1.0';
    this.authUrl = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
    this.scopes = ['Tasks.ReadWrite', 'User.Read', 'offline_access'];
    this.codeVerifier = null;
  }

  /**
   * PKCE用のcode_verifierを生成
   */
  generateCodeVerifier() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return this.base64UrlEncode(array);
  }

  /**
   * PKCE用のcode_challengeを生成
   */
  async generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return this.base64UrlEncode(new Uint8Array(digest));
  }

  /**
   * Base64 URL エンコード
   */
  base64UrlEncode(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * クライアントIDを設定
   */
  setClientId(clientId) {
    this.clientId = clientId;
  }

  /**
   * トークン情報を設定
   */
  setTokens(accessToken, refreshToken = null, expiresIn = 3600) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.tokenExpiry = Date.now() + (expiresIn * 1000);
  }

  /**
   * トークンが有効かチェック
   */
  isTokenValid() {
    if (!this.accessToken) return false;
    // 5分前に期限切れとみなす
    return Date.now() < (this.tokenExpiry - 5 * 60 * 1000);
  }

  /**
   * OAuth2認証を開始（chrome.identity API使用 + PKCE）
   */
  async authenticate() {
    if (!this.clientId) {
      throw new Error('Client ID is not set');
    }

    const redirectUrl = chrome.identity.getRedirectURL();
    console.log('Redirect URL:', redirectUrl);

    // PKCE: code_verifierとcode_challengeを生成
    this.codeVerifier = this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(this.codeVerifier);
    console.log('PKCE code_verifier generated');

    const authParams = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: redirectUrl,
      scope: this.scopes.join(' '),
      response_mode: 'query',
      prompt: 'select_account',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const authUrl = `${this.authUrl}/authorize?${authParams.toString()}`;
    console.log('Auth URL:', authUrl);

    return new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        {
          url: authUrl,
          interactive: true,
        },
        async (responseUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          if (!responseUrl) {
            reject(new Error('No response URL'));
            return;
          }

          try {
            console.log('Response URL:', responseUrl);
            
            // 認証コードを抽出
            const url = new URL(responseUrl);
            const code = url.searchParams.get('code');
            const error = url.searchParams.get('error');
            const errorDescription = url.searchParams.get('error_description');

            if (error) {
              reject(new Error(`Auth error: ${error} - ${errorDescription || ''}`));
              return;
            }

            if (!code) {
              reject(new Error('No authorization code received'));
              return;
            }

            // コードをトークンに交換（PKCEのcode_verifier付き）
            await this.exchangeCodeForToken(code, redirectUrl);
            resolve(true);
          } catch (err) {
            reject(err);
          }
        }
      );
    });
  }

  /**
   * 認証コードをアクセストークンに交換（PKCE対応）
   */
  async exchangeCodeForToken(code, redirectUri) {
    const tokenParams = new URLSearchParams({
      client_id: this.clientId,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri,
      scope: this.scopes.join(' '),
      code_verifier: this.codeVerifier, // PKCE: code_verifierを追加
    });

    console.log('Exchanging code for token...');

    const response = await fetch(`${this.authUrl}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenParams.toString(),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Token exchange error:', errorData);
      throw new Error(`Token exchange failed: ${errorData.error_description || errorData.error}`);
    }

    const data = await response.json();
    console.log('Token received successfully');
    this.setTokens(data.access_token, data.refresh_token, data.expires_in);

    // トークンを保存
    await this.saveTokens();

    // code_verifierをクリア
    this.codeVerifier = null;

    return data;
  }

  /**
   * リフレッシュトークンでアクセストークンを更新
   */
  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    const tokenParams = new URLSearchParams({
      client_id: this.clientId,
      grant_type: 'refresh_token',
      refresh_token: this.refreshToken,
      scope: this.scopes.join(' '),
    });

    const response = await fetch(`${this.authUrl}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenParams.toString(),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Token refresh failed: ${errorData.error_description || errorData.error}`);
    }

    const data = await response.json();
    this.setTokens(data.access_token, data.refresh_token || this.refreshToken, data.expires_in);

    // トークンを保存
    await this.saveTokens();

    return data;
  }

  /**
   * トークンをストレージに保存
   */
  async saveTokens() {
    return new Promise((resolve) => {
      chrome.storage.local.set({
        msAccessToken: this.accessToken,
        msRefreshToken: this.refreshToken,
        msTokenExpiry: this.tokenExpiry,
      }, resolve);
    });
  }

  /**
   * トークンをストレージから読み込み
   */
  async loadTokens() {
    return new Promise((resolve) => {
      chrome.storage.local.get({
        msAccessToken: null,
        msRefreshToken: null,
        msTokenExpiry: null,
        msClientId: null,
      }, (items) => {
        if (items.msClientId) {
          this.clientId = items.msClientId;
        }
        if (items.msAccessToken) {
          this.accessToken = items.msAccessToken;
          this.refreshToken = items.msRefreshToken;
          this.tokenExpiry = items.msTokenExpiry;
        }
        resolve(items);
      });
    });
  }

  /**
   * 認証済みかチェック（必要に応じてトークン更新）
   */
  async ensureAuthenticated() {
    await this.loadTokens();

    if (!this.accessToken) {
      throw new Error('Not authenticated. Please sign in.');
    }

    if (!this.isTokenValid()) {
      if (this.refreshToken) {
        await this.refreshAccessToken();
      } else {
        throw new Error('Token expired. Please sign in again.');
      }
    }

    return true;
  }

  /**
   * Graph APIリクエストを送信
   */
  async request(endpoint, method = 'GET', body = null) {
    await this.ensureAuthenticated();

    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Graph API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
    }

    // 204 No Content
    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  /**
   * ユーザー情報を取得
   */
  async getMe() {
    return this.request('/me');
  }

  /**
   * To Doリスト一覧を取得
   */
  async getTaskLists() {
    const data = await this.request('/me/todo/lists');
    return data.value || [];
  }

  /**
   * 特定のリストのタスク一覧を取得
   */
  async getTasks(listId) {
    const data = await this.request(`/me/todo/lists/${listId}/tasks`);
    return data.value || [];
  }

  /**
   * 新しいタスクを作成
   */
  async createTask(listId, task) {
    return this.request(`/me/todo/lists/${listId}/tasks`, 'POST', task);
  }

  /**
   * タスクを更新
   */
  async updateTask(listId, taskId, updates) {
    return this.request(`/me/todo/lists/${listId}/tasks/${taskId}`, 'PATCH', updates);
  }

  /**
   * タスクを削除
   */
  async deleteTask(listId, taskId) {
    return this.request(`/me/todo/lists/${listId}/tasks/${taskId}`, 'DELETE');
  }

  /**
   * 新しいリストを作成
   */
  async createTaskList(displayName) {
    return this.request('/me/todo/lists', 'POST', { displayName });
  }

  /**
   * サインアウト
   */
  async signOut() {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;

    return new Promise((resolve) => {
      chrome.storage.local.remove([
        'msAccessToken',
        'msRefreshToken',
        'msTokenExpiry',
      ], resolve);
    });
  }
}

// エクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MSGraphClient;
} else {
  window.MSGraphClient = MSGraphClient;
}

