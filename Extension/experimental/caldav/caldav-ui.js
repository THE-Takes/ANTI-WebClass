/**
 * CalDAV UI Controller
 * 設定画面のUIロジック
 */

class CalDAVUI {
  constructor() {
    this.sync = new CalDAVSync();
    this.elements = {};
    this.init();
  }

  /**
   * 初期化
   */
  async init() {
    this.cacheElements();
    this.bindEvents();
    await this.loadSettings();
    this.updateUI();
  }

  /**
   * DOM要素をキャッシュ
   */
  cacheElements() {
    this.elements = {
      // 有効/無効
      caldavEnabled: document.getElementById('caldavEnabled'),
      
      // 認証
      authSection: document.getElementById('authSection'),
      appleId: document.getElementById('appleId'),
      appPassword: document.getElementById('appPassword'),
      testConnection: document.getElementById('testConnection'),
      saveAuth: document.getElementById('saveAuth'),
      authStatus: document.getElementById('authStatus'),
      
      // リスト選択
      listSection: document.getElementById('listSection'),
      reminderList: document.getElementById('reminderList'),
      refreshLists: document.getElementById('refreshLists'),
      
      // 同期
      syncSection: document.getElementById('syncSection'),
      lastSyncTime: document.getElementById('lastSyncTime'),
      syncedCount: document.getElementById('syncedCount'),
      syncNow: document.getElementById('syncNow'),
      resetSync: document.getElementById('resetSync'),
      syncStatus: document.getElementById('syncStatus'),
      
      // リマインダー一覧
      remindersSection: document.getElementById('remindersSection'),
      toggleReminders: document.getElementById('toggleReminders'),
      remindersContent: document.getElementById('remindersContent'),
      remindersList: document.getElementById('remindersList'),
      
      // デバッグ
      debugSection: document.getElementById('debugSection'),
      testTitle: document.getElementById('testTitle'),
      testCourse: document.getElementById('testCourse'),
      testDeadline: document.getElementById('testDeadline'),
      addTestReminder: document.getElementById('addTestReminder'),
    };
  }

  /**
   * イベントをバインド
   */
  bindEvents() {
    // 有効/無効切り替え
    this.elements.caldavEnabled.addEventListener('change', () => this.onToggleEnabled());

    // 接続テスト
    this.elements.testConnection.addEventListener('click', () => this.onTestConnection());

    // 保存
    this.elements.saveAuth.addEventListener('click', () => this.onSaveAuth());

    // リスト更新
    this.elements.refreshLists.addEventListener('click', () => this.onRefreshLists());

    // リスト選択
    this.elements.reminderList.addEventListener('change', () => this.onSelectList());

    // 今すぐ同期
    this.elements.syncNow.addEventListener('click', () => this.onSyncNow());

    // 同期リセット
    this.elements.resetSync.addEventListener('click', () => this.onResetSync());

    // リマインダー一覧の折りたたみ
    this.elements.toggleReminders.addEventListener('click', () => this.toggleRemindersSection());

    // テストリマインダー追加
    this.elements.addTestReminder.addEventListener('click', () => this.onAddTestReminder());
  }

  /**
   * 設定を読み込み
   */
  async loadSettings() {
    await this.sync.loadSettings();
    const settings = this.sync.settings;

    this.elements.caldavEnabled.checked = settings.caldavEnabled || false;
    this.elements.appleId.value = settings.caldavAppleId || '';
    this.elements.appPassword.value = settings.caldavAppPassword || '';

    if (settings.caldavLastSync) {
      this.elements.lastSyncTime.textContent = this.formatDate(settings.caldavLastSync);
    }

    const syncedItems = settings.caldavSyncedItems || {};
    this.elements.syncedCount.textContent = `${Object.keys(syncedItems).length} 件`;
  }

  /**
   * UIを更新
   */
  updateUI() {
    const enabled = this.elements.caldavEnabled.checked;
    const hasCredentials = this.elements.appleId.value && this.elements.appPassword.value;

    // セクションの表示/非表示
    this.toggleElement(this.elements.authSection, enabled);
    this.toggleElement(this.elements.listSection, enabled && hasCredentials);
    this.toggleElement(this.elements.syncSection, enabled && hasCredentials);
    this.toggleElement(this.elements.remindersSection, enabled && hasCredentials);
    this.toggleElement(this.elements.debugSection, enabled && hasCredentials);

    // 入力フィールドの有効/無効
    this.elements.appleId.disabled = !enabled;
    this.elements.appPassword.disabled = !enabled;
  }

  /**
   * 有効/無効切り替え
   */
  async onToggleEnabled() {
    const enabled = this.elements.caldavEnabled.checked;
    await this.sync.saveSettings({ caldavEnabled: enabled });
    this.updateUI();
  }

  /**
   * 接続テスト
   */
  async onTestConnection() {
    const appleId = this.elements.appleId.value.trim();
    const appPassword = this.elements.appPassword.value.trim();

    if (!appleId || !appPassword) {
      this.showStatus(this.elements.authStatus, 'error', 'Apple IDとアプリ用パスワードを入力してください');
      return;
    }

    this.showStatus(this.elements.authStatus, 'loading', '接続中...');
    this.elements.testConnection.disabled = true;

    try {
      const calendars = await this.sync.testConnection(appleId, appPassword);
      
      if (calendars.length > 0) {
        this.showStatus(
          this.elements.authStatus,
          'success',
          `✅ 接続成功！ ${calendars.length}個のリマインダーリストを検出`
        );
        
        // リストを更新
        this.populateReminderLists(calendars);
        this.updateUI();
      } else {
        this.showStatus(
          this.elements.authStatus,
          'info',
          'ℹ️ 接続成功しましたが、リマインダーリストが見つかりません'
        );
      }
    } catch (error) {
      console.error('Connection test failed:', error);
      this.showStatus(
        this.elements.authStatus,
        'error',
        `❌ 接続失敗: ${error.message}`
      );
    } finally {
      this.elements.testConnection.disabled = false;
    }
  }

  /**
   * 認証情報を保存
   */
  async onSaveAuth() {
    const appleId = this.elements.appleId.value.trim();
    const appPassword = this.elements.appPassword.value.trim();

    await this.sync.saveSettings({
      caldavAppleId: appleId,
      caldavAppPassword: appPassword,
    });

    this.showStatus(this.elements.authStatus, 'success', '✅ 保存しました');
    this.updateUI();

    setTimeout(() => {
      this.hideStatus(this.elements.authStatus);
    }, 2000);
  }

  /**
   * リマインダーリストを更新
   */
  async onRefreshLists() {
    this.elements.refreshLists.disabled = true;

    try {
      await this.sync.initialize();
      const calendars = await this.sync.getReminderLists();
      this.populateReminderLists(calendars);
    } catch (error) {
      console.error('Failed to refresh lists:', error);
      alert(`リストの取得に失敗しました: ${error.message}`);
    } finally {
      this.elements.refreshLists.disabled = false;
    }
  }

  /**
   * リマインダーリストをプルダウンに追加
   */
  populateReminderLists(calendars) {
    const select = this.elements.reminderList;
    const currentValue = select.value;

    // 既存のオプションをクリア（最初のオプションは残す）
    while (select.options.length > 1) {
      select.remove(1);
    }

    // 新しいオプションを追加
    calendars.forEach(cal => {
      const option = document.createElement('option');
      option.value = cal.href;
      option.textContent = cal.displayname;
      select.appendChild(option);
    });

    // 以前の選択を復元
    if (currentValue) {
      select.value = currentValue;
    } else if (this.sync.settings.caldavSelectedList) {
      select.value = this.sync.settings.caldavSelectedList;
    }
  }

  /**
   * リストを選択
   */
  async onSelectList() {
    const selectedList = this.elements.reminderList.value;
    await this.sync.saveSettings({ caldavSelectedList: selectedList });
  }

  /**
   * 今すぐ同期
   */
  async onSyncNow() {
    if (!this.elements.reminderList.value) {
      this.showStatus(this.elements.syncStatus, 'error', 'リマインダーリストを選択してください');
      return;
    }

    this.showStatus(this.elements.syncStatus, 'loading', '同期中...');
    this.elements.syncNow.disabled = true;

    try {
      // ここでWebClassからの課題データを取得する処理を呼び出す
      // 現在はストレージから既存の課題データを取得
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
        await this.loadSyncedReminders();
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
    if (!confirm('同期データをリセットしますか？リマインダー自体は削除されません。')) {
      return;
    }

    await this.sync.resetSync();
    this.elements.lastSyncTime.textContent = '未同期';
    this.elements.syncedCount.textContent = '0 件';
    this.elements.remindersList.innerHTML = '<p style="color: #64748b; font-size: 13px;">データがありません</p>';
    
    this.showStatus(this.elements.syncStatus, 'success', '✅ 同期データをリセットしました');
  }

  /**
   * 同期済みリマインダーを読み込み
   */
  async loadSyncedReminders() {
    try {
      const reminders = await this.sync.getSyncedReminders();
      this.renderReminders(reminders);
    } catch (error) {
      console.error('Failed to load reminders:', error);
    }
  }

  /**
   * リマインダー一覧を描画
   */
  renderReminders(reminders) {
    const container = this.elements.remindersList;
    
    if (reminders.length === 0) {
      container.innerHTML = '<p style="color: #64748b; font-size: 13px;">同期済みのリマインダーはありません</p>';
      return;
    }

    container.innerHTML = reminders.map(r => `
      <div class="caldav-list-item">
        <span class="name">${this.escapeHtml(r.summary.replace('[WebClass] ', ''))}</span>
        <span class="count">${r.status === 'COMPLETED' ? '✅ 完了' : '🔵 未完了'}</span>
      </div>
    `).join('');
  }

  /**
   * リマインダーセクションの折りたたみ
   */
  toggleRemindersSection() {
    const toggle = this.elements.toggleReminders;
    const content = this.elements.remindersContent;

    toggle.classList.toggle('collapsed');
    content.classList.toggle('collapsed');
  }

  /**
   * テストリマインダーを追加
   */
  async onAddTestReminder() {
    const title = this.elements.testTitle.value.trim();
    const course = this.elements.testCourse.value.trim();
    const deadline = this.elements.testDeadline.value;

    if (!title) {
      alert('タイトルを入力してください');
      return;
    }

    if (!this.elements.reminderList.value) {
      alert('リマインダーリストを選択してください');
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
      alert('テストリマインダーを追加しました！');
      
      // フィールドをクリア
      this.elements.testTitle.value = '';
      this.elements.testCourse.value = '';
      this.elements.testDeadline.value = '';

      // 同期情報を更新
      await this.loadSettings();
      await this.loadSyncedReminders();
    } catch (error) {
      console.error('Failed to add test reminder:', error);
      alert(`追加失敗: ${error.message}`);
    }
  }

  /**
   * ステータスを表示
   */
  showStatus(element, type, message) {
    element.className = `caldav-status ${type}`;
    element.innerHTML = type === 'loading' 
      ? `<div class="caldav-spinner"></div> ${message}`
      : message;
    element.classList.remove('caldav-hidden');
  }

  /**
   * ステータスを非表示
   */
  hideStatus(element) {
    element.classList.add('caldav-hidden');
  }

  /**
   * 要素の表示/非表示を切り替え
   */
  toggleElement(element, show) {
    if (show) {
      element.classList.remove('caldav-hidden');
    } else {
      element.classList.add('caldav-hidden');
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
  window.caldavUI = new CalDAVUI();
});

