/**
 * Microsoft To Do Sync Manager
 * WebClassの課題とMicrosoft To Doの同期を管理
 */

class MSTodoSync {
  constructor() {
    this.client = new MSGraphClient();
    this.settings = null;
    this.syncPrefix = '[WebClass] ';
  }

  /**
   * 設定を読み込み
   */
  async loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get({
        msTodoEnabled: false,
        msClientId: '',
        msSelectedList: '',
        msSelectedListName: '',
        msLastSync: null,
        msSyncedItems: {},
      }, (items) => {
        this.settings = items;
        if (items.msClientId) {
          this.client.setClientId(items.msClientId);
        }
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
   * 初期化
   */
  async initialize() {
    await this.loadSettings();
    await this.client.loadTokens();
    
    if (!this.settings.msTodoEnabled) {
      throw new Error('Microsoft To Do sync is not enabled');
    }

    if (!this.settings.msClientId) {
      throw new Error('Client ID is not configured');
    }

    return true;
  }

  /**
   * サインイン
   */
  async signIn() {
    await this.loadSettings();
    if (!this.settings.msClientId) {
      throw new Error('Client ID is not configured');
    }
    this.client.setClientId(this.settings.msClientId);
    await this.client.authenticate();
    return true;
  }

  /**
   * サインアウト
   */
  async signOut() {
    await this.client.signOut();
  }

  /**
   * 認証済みかチェック
   */
  async isAuthenticated() {
    await this.client.loadTokens();
    return this.client.accessToken !== null;
  }

  /**
   * ユーザー情報を取得
   */
  async getUserInfo() {
    return this.client.getMe();
  }

  /**
   * To Doリスト一覧を取得
   */
  async getTaskLists() {
    return this.client.getTaskLists();
  }

  /**
   * WebClassの課題データをTo Do形式に変換
   */
  convertAssignmentToTask(assignment) {
    const title = `${this.syncPrefix}${assignment.title}`;
    
    const bodyContent = [
      `科目: ${assignment.courseName || '不明'}`,
      assignment.url ? `URL: ${assignment.url}` : '',
      assignment.description || '',
    ].filter(Boolean).join('\n');

    const task = {
      title,
      body: {
        content: bodyContent,
        contentType: 'text',
      },
      importance: this.getImportance(assignment.deadline),
    };

    // 締め切りがある場合
    if (assignment.deadline) {
      const dueDate = new Date(assignment.deadline);
      task.dueDateTime = {
        dateTime: dueDate.toISOString().split('T')[0] + 'T00:00:00',
        timeZone: 'Asia/Tokyo',
      };
    }

    return task;
  }

  /**
   * 締め切りに基づいて重要度を決定
   */
  getImportance(deadline) {
    if (!deadline) return 'normal';
    
    const now = new Date();
    const due = new Date(deadline);
    const daysUntilDue = (due - now) / (1000 * 60 * 60 * 24);

    if (daysUntilDue < 0) return 'high';      // 期限切れ
    if (daysUntilDue <= 1) return 'high';     // 24時間以内
    if (daysUntilDue <= 3) return 'high';     // 3日以内
    return 'normal';
  }

  /**
   * 課題をTo Doに同期
   */
  async syncAssignment(assignment) {
    await this.initialize();

    if (!this.settings.msSelectedList) {
      throw new Error('Task list is not selected');
    }

    const syncKey = `${assignment.courseId || 'unknown'}_${assignment.id || assignment.title}`;
    const syncedItems = this.settings.msSyncedItems || {};

    const taskData = this.convertAssignmentToTask(assignment);

    if (syncedItems[syncKey]) {
      // 既存のタスクを更新
      const existingItem = syncedItems[syncKey];
      try {
        await this.client.updateTask(
          this.settings.msSelectedList,
          existingItem.taskId,
          taskData
        );
        console.log('Updated task:', taskData.title);
      } catch (error) {
        // タスクが見つからない場合は新規作成
        if (error.message.includes('404')) {
          delete syncedItems[syncKey];
          await this.saveSettings({ msSyncedItems: syncedItems });
          return this.syncAssignment(assignment);
        }
        throw error;
      }
    } else {
      // 新規作成
      const result = await this.client.createTask(
        this.settings.msSelectedList,
        taskData
      );

      // 同期情報を保存
      syncedItems[syncKey] = {
        taskId: result.id,
        syncedAt: new Date().toISOString(),
      };

      await this.saveSettings({ msSyncedItems: syncedItems });
      console.log('Created task:', taskData.title);
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
    await this.saveSettings({ msLastSync: new Date().toISOString() });

    return results;
  }

  /**
   * 同期済みのタスク一覧を取得
   */
  async getSyncedTasks() {
    await this.initialize();

    if (!this.settings.msSelectedList) {
      throw new Error('Task list is not selected');
    }

    const tasks = await this.client.getTasks(this.settings.msSelectedList);
    
    // WebClassから同期したものだけをフィルタ
    return tasks.filter(task => 
      task.title && task.title.startsWith(this.syncPrefix)
    );
  }

  /**
   * 同期をリセット
   */
  async resetSync() {
    await this.saveSettings({
      msSyncedItems: {},
      msLastSync: null,
    });
    console.log('Sync data reset');
  }
}

// エクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MSTodoSync;
} else {
  window.MSTodoSync = MSTodoSync;
}

