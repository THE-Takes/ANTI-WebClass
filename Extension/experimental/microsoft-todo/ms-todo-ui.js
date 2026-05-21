/**
 * Microsoft To Do UI Controller
 * 設定画面のUIロジック
 */

class MSTodoUI {
  constructor() {
    this.sync = new MSTodoSync();
    this.elements = {};
    this.init();
  }

  /**
   * 初期化
   */
  async init() {
    this.cacheElements();
    this.bindEvents();
    this.showRedirectUri();
    await this.loadSettings();
    this.updateUI();
  }

  /**
   * DOM要素をキャッシュ
   */
  cacheElements() {
    this.elements = {
      // ステップ
      step1: document.getElementById('step1'),
      step2: document.getElementById('step2'),
      step3: document.getElementById('step3'),

      // 有効/無効
      msTodoEnabled: document.getElementById('msTodoEnabled'),

      // クライアントID
      clientIdSection: document.getElementById('clientIdSection'),
      clientId: document.getElementById('clientId'),
      redirectUri: document.getElementById('redirectUri'),
      saveClientId: document.getElementById('saveClientId'),
      clientIdStatus: document.getElementById('clientIdStatus'),

      // サインイン
      signInSection: document.getElementById('signInSection'),
      signInPrompt: document.getElementById('signInPrompt'),
      signInBtn: document.getElementById('signInBtn'),
      userInfo: document.getElementById('userInfo'),
      userAvatar: document.getElementById('userAvatar'),
      userName: document.getElementById('userName'),
      userEmail: document.getElementById('userEmail'),
      signOutBtn: document.getElementById('signOutBtn'),
      signInStatus: document.getElementById('signInStatus'),

      // リスト選択
      listSection: document.getElementById('listSection'),
      taskList: document.getElementById('taskList'),
      refreshLists: document.getElementById('refreshLists'),

      // 同期
      syncSection: document.getElementById('syncSection'),
      lastSyncTime: document.getElementById('lastSyncTime'),
      syncedCount: document.getElementById('syncedCount'),
      syncNow: document.getElementById('syncNow'),
      resetSync: document.getElementById('resetSync'),
      syncStatus: document.getElementById('syncStatus'),

      // デバッグ
      debugSection: document.getElementById('debugSection'),
      testTitle: document.getElementById('testTitle'),
      testCourse: document.getElementById('testCourse'),
      testDeadline: document.getElementById('testDeadline'),
      addTestTask: document.getElementById('addTestTask'),

      // タスク一覧
      tasksSection: document.getElementById('tasksSection'),
      toggleTasks: document.getElementById('toggleTasks'),
      tasksContent: document.getElementById('tasksContent'),
      tasksList: document.getElementById('tasksList'),
    };
  }

  /**
   * イベントをバインド
   */
  bindEvents() {
    this.elements.msTodoEnabled.addEventListener('change', () => this.onToggleEnabled());
    this.elements.saveClientId.addEventListener('click', () => this.onSaveClientId());
    this.elements.signInBtn.addEventListener('click', () => this.onSignIn());
    this.elements.signOutBtn.addEventListener('click', () => this.onSignOut());
    this.elements.refreshLists.addEventListener('click', () => this.onRefreshLists());
    this.elements.taskList.addEventListener('change', () => this.onSelectList());
    this.elements.syncNow.addEventListener('click', () => this.onSyncNow());
    this.elements.resetSync.addEventListener('click', () => this.onResetSync());
    this.elements.toggleTasks.addEventListener('click', () => this.toggleTasksSection());
    this.elements.addTestTask.addEventListener('click', () => this.onAddTestTask());
  }

  /**
   * リダイレクトURIを表示
   */
  showRedirectUri() {
    const redirectUri = chrome.identity.getRedirectURL();
    this.elements.redirectUri.value = redirectUri;
  }

  /**
   * 設定を読み込み
   */
  async loadSettings() {
    await this.sync.loadSettings();
    const settings = this.sync.settings;

    this.elements.msTodoEnabled.checked = settings.msTodoEnabled || false;
    this.elements.clientId.value = settings.msClientId || '';

    if (settings.msLastSync) {
      this.elements.lastSyncTime.textContent = this.formatDate(settings.msLastSync);
    }

    const syncedItems = settings.msSyncedItems || {};
    this.elements.syncedCount.textContent = `${Object.keys(syncedItems).length} 件`;

    // サインイン状態をチェック
    const isAuthenticated = await this.sync.isAuthenticated();
    if (isAuthenticated) {
      await this.loadUserInfo();
    }
  }

  /**
   * UIを更新
   */
  async updateUI() {
    const enabled = this.elements.msTodoEnabled.checked;
    const hasClientId = !!this.elements.clientId.value;
    const isAuthenticated = await this.sync.isAuthenticated();
    const hasListSelected = !!this.sync.settings?.msSelectedList;

    // ステップインジケーター更新
    this.elements.step1.className = 'ms-step ' + (hasClientId ? 'completed' : (enabled ? 'active' : ''));
    this.elements.step2.className = 'ms-step ' + (isAuthenticated ? 'completed' : (hasClientId ? 'active' : ''));
    this.elements.step3.className = 'ms-step ' + (hasListSelected ? 'completed' : (isAuthenticated ? 'active' : ''));

    // セクションの表示/非表示
    this.toggleElement(this.elements.clientIdSection, enabled);
    this.toggleElement(this.elements.signInSection, enabled && hasClientId);
    this.toggleElement(this.elements.listSection, enabled && isAuthenticated);
    this.toggleElement(this.elements.syncSection, enabled && isAuthenticated && hasListSelected);
    this.toggleElement(this.elements.debugSection, enabled && isAuthenticated && hasListSelected);
    this.toggleElement(this.elements.tasksSection, enabled && isAuthenticated && hasListSelected);

    // サインイン状態
    this.toggleElement(this.elements.signInPrompt, !isAuthenticated);
    this.toggleElement(this.elements.userInfo, isAuthenticated);

    // リストを読み込み
    if (isAuthenticated && this.elements.taskList.options.length <= 1) {
      await this.loadTaskLists();
    }
  }

  /**
   * 有効/無効切り替え
   */
  async onToggleEnabled() {
    const enabled = this.elements.msTodoEnabled.checked;
    await this.sync.saveSettings({ msTodoEnabled: enabled });
    this.updateUI();
  }

  /**
   * クライアントIDを保存
   */
  async onSaveClientId() {
    const clientId = this.elements.clientId.value.trim();

    if (!clientId) {
      this.showStatus(this.elements.clientIdStatus, 'error', 'クライアントIDを入力してください');
      return;
    }

    // UUID形式をチェック
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(clientId)) {
      this.showStatus(this.elements.clientIdStatus, 'error', 'クライアントIDの形式が正しくありません');
      return;
    }

    await this.sync.saveSettings({ msClientId: clientId });
    this.sync.client.setClientId(clientId);

    this.showStatus(this.elements.clientIdStatus, 'success', '✅ 保存しました');
    this.updateUI();

    setTimeout(() => {
      this.hideStatus(this.elements.clientIdStatus);
    }, 2000);
  }

  /**
   * サインイン
   */
  async onSignIn() {
    this.showStatus(this.elements.signInStatus, 'loading', 'サインイン中...');
    this.elements.signInBtn.disabled = true;

    try {
      await this.sync.signIn();
      await this.loadUserInfo();
      this.showStatus(this.elements.signInStatus, 'success', '✅ サインイン成功！');
      this.updateUI();

      // リストを読み込み
      await this.loadTaskLists();
    } catch (error) {
      console.error('Sign in failed:', error);
      this.showStatus(this.elements.signInStatus, 'error', `❌ サインイン失敗: ${error.message}`);
    } finally {
      this.elements.signInBtn.disabled = false;
    }
  }

  /**
   * サインアウト
   */
  async onSignOut() {
    if (!confirm('サインアウトしますか？')) {
      return;
    }

    await this.sync.signOut();
    this.elements.signInPrompt.classList.remove('ms-hidden');
    this.elements.userInfo.classList.add('ms-hidden');
    this.updateUI();
  }

  /**
   * ユーザー情報を読み込み
   */
  async loadUserInfo() {
    try {
      const user = await this.sync.getUserInfo();
      this.elements.userName.textContent = user.displayName || user.userPrincipalName;
      this.elements.userEmail.textContent = user.mail || user.userPrincipalName;
      this.elements.userAvatar.textContent = (user.displayName || 'U')[0].toUpperCase();
    } catch (error) {
      console.error('Failed to load user info:', error);
    }
  }

  /**
   * タスクリスト一覧を読み込み
   */
  async loadTaskLists() {
    try {
      const lists = await this.sync.getTaskLists();
      this.populateTaskLists(lists);
    } catch (error) {
      console.error('Failed to load task lists:', error);
    }
  }

  /**
   * タスクリストをプルダウンに追加
   */
  populateTaskLists(lists) {
    const select = this.elements.taskList;
    const currentValue = select.value;

    // 既存のオプションをクリア（最初のオプションは残す）
    while (select.options.length > 1) {
      select.remove(1);
    }

    // 新しいオプションを追加
    lists.forEach(list => {
      const option = document.createElement('option');
      option.value = list.id;
      option.textContent = list.displayName;
      select.appendChild(option);
    });

    // 以前の選択を復元
    if (currentValue) {
      select.value = currentValue;
    } else if (this.sync.settings.msSelectedList) {
      select.value = this.sync.settings.msSelectedList;
    }
  }

  /**
   * リストを更新
   */
  async onRefreshLists() {
    this.elements.refreshLists.disabled = true;

    try {
      await this.loadTaskLists();
    } catch (error) {
      console.error('Failed to refresh lists:', error);
      alert(`リストの取得に失敗しました: ${error.message}`);
    } finally {
      this.elements.refreshLists.disabled = false;
    }
  }

  /**
   * リストを選択
   */
  async onSelectList() {
    const selectedList = this.elements.taskList.value;
    const selectedOption = this.elements.taskList.options[this.elements.taskList.selectedIndex];
    const selectedListName = selectedOption ? selectedOption.textContent : '';

    await this.sync.saveSettings({
      msSelectedList: selectedList,
      msSelectedListName: selectedListName,
    });

    this.updateUI();
  }

  /**
   * 今すぐ同期
   */
  async onSyncNow() {
    if (!this.elements.taskList.value) {
      this.showStatus(this.elements.syncStatus, 'error', 'リストを選択してください');
      return;
    }

    this.showStatus(this.elements.syncStatus, 'loading', '同期中...');
    this.elements.syncNow.disabled = true;

    try {
      // ストレージから課題データを取得
      const assignments = await this.getStoredAssignments();

      if (assignments.length === 0) {
        this.showStatus(this.elements.syncStatus, 'info', 'ℹ️ 同期する課題がありません');
      } else {
        const results = await this.sync.syncAssignments(assignments);

        this.showStatus(
          this.elements.syncStatus,
          results.failed.length > 0 ? 'error' : 'success',
          `✅ ${results.success.length}件成功、❌ ${results.failed.length}件失敗`
        );

        // UIを更新
        await this.loadSettings();
        await this.loadSyncedTasks();
      }
    } catch (error) {
      console.error('Sync failed:', error);
      this.showStatus(this.elements.syncStatus, 'error', `❌ 同期失敗: ${error.message}`);
    } finally {
      this.elements.syncNow.disabled = false;
    }
  }

  /**
   * ストレージから課題データを取得
   */
  async getStoredAssignments() {
    return new Promise((resolve) => {
      chrome.storage.local.get({ assignments: [] }, (result) => {
        resolve(result.assignments);
      });
    });
  }

  /**
   * 同期をリセット
   */
  async onResetSync() {
    if (!confirm('同期データをリセットしますか？タスク自体は削除されません。')) {
      return;
    }

    await this.sync.resetSync();
    this.elements.lastSyncTime.textContent = '未同期';
    this.elements.syncedCount.textContent = '0 件';
    this.elements.tasksList.innerHTML = '<p style="color: #858585; font-size: 13px;">データがありません</p>';

    this.showStatus(this.elements.syncStatus, 'success', '✅ 同期データをリセットしました');
  }

  /**
   * 同期済みタスクを読み込み
   */
  async loadSyncedTasks() {
    try {
      const tasks = await this.sync.getSyncedTasks();
      this.renderTasks(tasks);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    }
  }

  /**
   * タスク一覧を描画
   */
  renderTasks(tasks) {
    const container = this.elements.tasksList;

    if (tasks.length === 0) {
      container.innerHTML = '<p style="color: #858585; font-size: 13px;">同期済みのタスクはありません</p>';
      return;
    }

    container.innerHTML = tasks.map(t => `
      <div class="ms-task-item">
        <span class="name">${this.escapeHtml(t.title.replace('[WebClass] ', ''))}</span>
        <span class="status ${t.status === 'completed' ? 'completed' : 'pending'}">
          ${t.status === 'completed' ? '✅ 完了' : '🔵 未完了'}
        </span>
      </div>
    `).join('');
  }

  /**
   * タスクセクションの折りたたみ
   */
  toggleTasksSection() {
    const toggle = this.elements.toggleTasks;
    const content = this.elements.tasksContent;

    toggle.classList.toggle('collapsed');
    content.classList.toggle('collapsed');
  }

  /**
   * テストタスクを追加
   */
  async onAddTestTask() {
    const title = this.elements.testTitle.value.trim();
    const course = this.elements.testCourse.value.trim();
    const deadline = this.elements.testDeadline.value;

    if (!title) {
      alert('タイトルを入力してください');
      return;
    }

    if (!this.elements.taskList.value) {
      alert('リストを選択してください');
      return;
    }

    const assignment = {
      id: `test_${Date.now()}`,
      title: title,
      courseName: course || 'テスト科目',
      deadline: deadline || null,
      url: 'https://example.com/test',
    };

    try {
      await this.sync.syncAssignment(assignment);
      alert('テストタスクを追加しました！');

      // フィールドをクリア
      this.elements.testTitle.value = '';
      this.elements.testCourse.value = '';
      this.elements.testDeadline.value = '';

      // 同期情報を更新
      await this.loadSettings();
      await this.loadSyncedTasks();
    } catch (error) {
      console.error('Failed to add test task:', error);
      alert(`追加失敗: ${error.message}`);
    }
  }

  /**
   * ステータスを表示
   */
  showStatus(element, type, message) {
    element.className = `ms-status ${type}`;
    element.innerHTML = type === 'loading'
      ? `<div class="ms-spinner"></div> ${message}`
      : message;
    element.classList.remove('ms-hidden');
  }

  /**
   * ステータスを非表示
   */
  hideStatus(element) {
    element.classList.add('ms-hidden');
  }

  /**
   * 要素の表示/非表示を切り替え
   */
  toggleElement(element, show) {
    if (show) {
      element.classList.remove('ms-hidden');
    } else {
      element.classList.add('ms-hidden');
    }
  }

  /**
   * 日付をフォーマット
   */
  formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * HTMLをエスケープ
   */
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  window.msTodoUI = new MSTodoUI();
});

