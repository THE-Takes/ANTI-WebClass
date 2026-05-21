/**
 * CalDAV Sync Manager
 * WebClassの課題とiCloudリマインダーの同期を管理
 */

class CalDAVSync {
  constructor() {
    this.client = null;
    this.settings = null;
    this.syncPrefix = '[WebClass] '; // 同期したタスクの識別用プレフィックス
  }

  /**
   * 設定を読み込み
   */
  async loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get({
        caldavEnabled: false,
        caldavAppleId: '',
        caldavAppPassword: '',
        caldavSelectedList: '',
        caldavLastSync: null,
        caldavSyncedItems: {},
      }, (items) => {
        this.settings = items;
        resolve(items);
      });
    });
  }

  /**
   * 設定を保存
   */
  async saveSettings(settings) {
    return new Promise((resolve) => {
      chrome.storage.local.set(settings, () => {
        this.settings = { ...this.settings, ...settings };
        resolve();
      });
    });
  }

  /**
   * CalDAVクライアントを初期化
   */
  async initialize() {
    await this.loadSettings();
    
    if (!this.settings.caldavEnabled) {
      throw new Error('CalDAV sync is not enabled');
    }

    if (!this.settings.caldavAppleId || !this.settings.caldavAppPassword) {
      throw new Error('Apple ID or App Password is not configured');
    }

    this.client = new CalDAVClient(
      this.settings.caldavAppleId,
      this.settings.caldavAppPassword
    );

    await this.client.connect();
    return true;
  }

  /**
   * 接続テスト
   */
  async testConnection(appleId, appPassword) {
    const testClient = new CalDAVClient(appleId, appPassword);
    await testClient.connect();
    const calendars = await testClient.getCalendars();
    return calendars;
  }

  /**
   * リマインダーリスト一覧を取得
   */
  async getReminderLists() {
    if (!this.client) {
      await this.initialize();
    }
    return await this.client.getCalendars();
  }

  /**
   * WebClassの課題データをリマインダー形式に変換
   */
  convertAssignmentToTodo(assignment) {
    const summary = `${this.syncPrefix}${assignment.title}`;
    const description = [
      `科目: ${assignment.courseName || '不明'}`,
      `URL: ${assignment.url || ''}`,
      assignment.description || '',
    ].filter(Boolean).join('\n');

    return {
      summary,
      description,
      due: assignment.deadline ? new Date(assignment.deadline) : null,
      priority: this.getPriority(assignment.deadline),
    };
  }

  /**
   * 締め切りに基づいて優先度を決定
   * iCal優先度: 1-4 = 高, 5 = 中, 6-9 = 低, 0 = なし
   */
  getPriority(deadline) {
    if (!deadline) return 0;
    
    const now = new Date();
    const due = new Date(deadline);
    const daysUntilDue = (due - now) / (1000 * 60 * 60 * 24);

    if (daysUntilDue < 0) return 1;      // 期限切れ: 最高優先度
    if (daysUntilDue <= 1) return 2;     // 24時間以内: 高
    if (daysUntilDue <= 3) return 4;     // 3日以内: やや高
    if (daysUntilDue <= 7) return 5;     // 1週間以内: 中
    return 7;                            // それ以上: 低
  }

  /**
   * 課題をリマインダーに同期
   */
  async syncAssignment(assignment) {
    if (!this.client) {
      await this.initialize();
    }

    if (!this.settings.caldavSelectedList) {
      throw new Error('Reminder list is not selected');
    }

    // 同期済みかチェック
    const syncKey = `${assignment.courseId || 'unknown'}_${assignment.id || assignment.title}`;
    const syncedItems = this.settings.caldavSyncedItems || {};

    const todoData = this.convertAssignmentToTodo(assignment);

    if (syncedItems[syncKey]) {
      // 既存のリマインダーを更新
      const existingItem = syncedItems[syncKey];
      todoData.uid = existingItem.uid;
      
      await this.client.updateTodo(existingItem.href, todoData, existingItem.etag);
      console.log('Updated reminder:', todoData.summary);
    } else {
      // 新規作成
      const result = await this.client.createTodo(
        this.settings.caldavSelectedList,
        todoData
      );

      // 同期情報を保存
      syncedItems[syncKey] = {
        uid: result.uid,
        href: result.href,
        syncedAt: new Date().toISOString(),
      };

      await this.saveSettings({ caldavSyncedItems: syncedItems });
      console.log('Created reminder:', todoData.summary);
    }

    return true;
  }

  /**
   * 複数の課題を一括同期
   */
  async syncAssignments(assignments) {
    const results = {
      success: [],
      failed: [],
    };

    for (const assignment of assignments) {
      try {
        await this.syncAssignment(assignment);
        results.success.push(assignment);
      } catch (error) {
        console.error('Failed to sync assignment:', assignment, error);
        results.failed.push({ assignment, error: error.message });
      }
    }

    // 最終同期日時を更新
    await this.saveSettings({ caldavLastSync: new Date().toISOString() });

    return results;
  }

  /**
   * 同期済みのリマインダー一覧を取得
   */
  async getSyncedReminders() {
    if (!this.client) {
      await this.initialize();
    }

    if (!this.settings.caldavSelectedList) {
      throw new Error('Reminder list is not selected');
    }

    const todos = await this.client.getTodos(this.settings.caldavSelectedList);
    
    // WebClassから同期したものだけをフィルタ
    return todos.filter(todo => 
      todo.summary && todo.summary.startsWith(this.syncPrefix)
    );
  }

  /**
   * リマインダーの完了状態を課題に反映（将来拡張用）
   */
  async pullCompletedStatus() {
    const reminders = await this.getSyncedReminders();
    const completed = reminders.filter(r => r.status === 'COMPLETED');
    
    // TODO: 完了したリマインダーに対応する課題を特定し、
    // ローカルストレージで完了マークを付ける処理を実装

    return completed;
  }

  /**
   * 同期をリセット（全ての同期情報をクリア）
   */
  async resetSync() {
    await this.saveSettings({
      caldavSyncedItems: {},
      caldavLastSync: null,
    });
    console.log('Sync data reset');
  }
}

// エクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CalDAVSync;
} else {
  window.CalDAVSync = CalDAVSync;
}

