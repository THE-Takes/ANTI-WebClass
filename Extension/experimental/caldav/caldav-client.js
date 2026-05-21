/**
 * CalDAV Client for iCloud Reminders
 * 実験的機能 - Apple iCloud CalDAVとの連携
 */

class CalDAVClient {
  constructor(appleId, appPassword) {
    this.baseUrl = 'https://caldav.icloud.com/';
    this.appleId = appleId;
    this.appPassword = appPassword;
    this.principalUrl = null;
    this.calendarHomeUrl = null;
  }

  /**
   * Basic認証ヘッダーを生成
   */
  getAuthHeader() {
    const credentials = btoa(`${this.appleId}:${this.appPassword}`);
    return `Basic ${credentials}`;
  }

  /**
   * Background Script経由でリクエストを送信（CORS回避）
   */
  async sendViaBackground(url, method, headers, body = null) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'CALDAV_REQUEST',
        url,
        method,
        headers,
        body,
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        if (!response) {
          reject(new Error('No response from background script'));
          return;
        }
        
        if (!response.success) {
          reject(new Error(response.error || 'Unknown error'));
          return;
        }
        
        resolve(response);
      });
    });
  }

  /**
   * CalDAVリクエストを送信
   */
  async request(url, method, body = null, depth = '0') {
    const headers = {
      'Authorization': this.getAuthHeader(),
      'Content-Type': 'application/xml; charset=utf-8',
      'Depth': depth,
    };

    try {
      // Background Script経由でリクエスト
      const response = await this.sendViaBackground(url, method, headers, body);
      
      if (response.status >= 400) {
        throw new Error(`CalDAV request failed: ${response.status} ${response.statusText}`);
      }

      return this.parseXML(response.body);
    } catch (error) {
      console.error('CalDAV request error:', error);
      throw error;
    }
  }

  /**
   * XMLをパース
   */
  parseXML(xmlString) {
    const parser = new DOMParser();
    return parser.parseFromString(xmlString, 'application/xml');
  }

  /**
   * 接続テスト & Principal URLを取得
   */
  async connect() {
    const propfindBody = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:current-user-principal/>
  </d:prop>
</d:propfind>`;

    try {
      const doc = await this.request(this.baseUrl, 'PROPFIND', propfindBody, '0');
      
      // Principal URLを抽出
      const hrefElement = doc.querySelector('current-user-principal href');
      if (hrefElement) {
        this.principalUrl = hrefElement.textContent;
        console.log('Principal URL:', this.principalUrl);
        
        // Calendar Home URLを取得
        await this.getCalendarHome();
        return true;
      }
      
      throw new Error('Principal URL not found in response');
    } catch (error) {
      console.error('Connection failed:', error);
      throw error;
    }
  }

  /**
   * Calendar Home URLを取得
   */
  async getCalendarHome() {
    if (!this.principalUrl) {
      throw new Error('Principal URL not set. Call connect() first.');
    }

    const propfindBody = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <c:calendar-home-set/>
  </d:prop>
</d:propfind>`;

    const fullUrl = this.principalUrl.startsWith('http') 
      ? this.principalUrl 
      : `https://caldav.icloud.com${this.principalUrl}`;

    const doc = await this.request(fullUrl, 'PROPFIND', propfindBody, '0');
    
    const hrefElement = doc.querySelector('calendar-home-set href');
    if (hrefElement) {
      this.calendarHomeUrl = hrefElement.textContent;
      console.log('Calendar Home URL:', this.calendarHomeUrl);
      return this.calendarHomeUrl;
    }

    throw new Error('Calendar home URL not found');
  }

  /**
   * 利用可能なカレンダー/リマインダーリストを取得
   */
  async getCalendars() {
    if (!this.calendarHomeUrl) {
      await this.connect();
    }

    const propfindBody = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:a="http://apple.com/ns/ical/">
  <d:prop>
    <d:displayname/>
    <d:resourcetype/>
    <c:supported-calendar-component-set/>
    <cs:getctag/>
    <a:calendar-color/>
  </d:prop>
</d:propfind>`;

    const fullUrl = this.calendarHomeUrl.startsWith('http')
      ? this.calendarHomeUrl
      : `https://caldav.icloud.com${this.calendarHomeUrl}`;

    const doc = await this.request(fullUrl, 'PROPFIND', propfindBody, '1');
    
    const calendars = [];
    const allCalendars = []; // デバッグ用：すべてのカレンダー
    const responses = doc.querySelectorAll('response');
    
    responses.forEach(response => {
      const href = response.querySelector('href')?.textContent;
      const displayname = response.querySelector('displayname')?.textContent;
      const resourcetype = response.querySelector('resourcetype');
      const supportedComponents = response.querySelector('supported-calendar-component-set');
      
      // カレンダーかどうか
      const isCalendar = resourcetype?.querySelector('calendar') !== null;
      
      // VTODOをサポートしているか
      let supportsVTODO = false;
      if (supportedComponents) {
        // comp要素を探す（名前空間の問題を回避）
        const comps = supportedComponents.querySelectorAll('comp');
        comps.forEach(comp => {
          if (comp.getAttribute('name') === 'VTODO') {
            supportsVTODO = true;
          }
        });
      }
      
      // デバッグ用：すべてのカレンダー情報をログ
      if (isCalendar && displayname) {
        allCalendars.push({
          href,
          displayname,
          supportsVTODO,
          supportedComponentsHtml: supportedComponents?.innerHTML || 'none',
        });
      }
      
      // VTODOをサポートしているカレンダーのみ（リマインダー）
      if (isCalendar && supportsVTODO && displayname) {
        calendars.push({
          href,
          displayname,
          supportsVTODO,
        });
      }
    });

    console.log('All calendars found:', allCalendars);
    console.log('Reminder lists (VTODO):', calendars);
    
    // VTODOフィルタで見つからない場合は、すべてのカレンダーを返す（フォールバック）
    if (calendars.length === 0 && allCalendars.length > 0) {
      console.log('No VTODO calendars found, returning all calendars as fallback');
      return allCalendars;
    }
    
    return calendars;
  }

  /**
   * 特定のリマインダーリストから全タスクを取得
   */
  async getTodos(calendarHref) {
    const reportBody = `<?xml version="1.0" encoding="UTF-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VTODO"/>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;

    const fullUrl = calendarHref.startsWith('http')
      ? calendarHref
      : `https://caldav.icloud.com${calendarHref}`;

    const doc = await this.request(fullUrl, 'REPORT', reportBody, '1');
    
    const todos = [];
    const responses = doc.querySelectorAll('response');
    
    responses.forEach(response => {
      const href = response.querySelector('href')?.textContent;
      const etag = response.querySelector('getetag')?.textContent;
      const calendarData = response.querySelector('calendar-data')?.textContent;
      
      if (calendarData) {
        const todo = this.parseVTODO(calendarData);
        if (todo) {
          todo.href = href;
          todo.etag = etag;
          todos.push(todo);
        }
      }
    });

    return todos;
  }

  /**
   * VTODOデータをパース
   */
  parseVTODO(icalData) {
    const lines = icalData.split(/\r?\n/);
    const todo = {};
    let inVTODO = false;

    for (const line of lines) {
      if (line === 'BEGIN:VTODO') {
        inVTODO = true;
        continue;
      }
      if (line === 'END:VTODO') {
        inVTODO = false;
        continue;
      }

      if (inVTODO) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          let key = line.substring(0, colonIndex);
          const value = line.substring(colonIndex + 1);

          // パラメータを除去（例: DTSTART;VALUE=DATE）
          const semicolonIndex = key.indexOf(';');
          if (semicolonIndex > 0) {
            key = key.substring(0, semicolonIndex);
          }

          switch (key) {
            case 'UID':
              todo.uid = value;
              break;
            case 'SUMMARY':
              todo.summary = this.unescapeIcal(value);
              break;
            case 'DESCRIPTION':
              todo.description = this.unescapeIcal(value);
              break;
            case 'STATUS':
              todo.status = value;
              break;
            case 'DUE':
              todo.due = this.parseIcalDate(value);
              break;
            case 'COMPLETED':
              todo.completed = this.parseIcalDate(value);
              break;
            case 'PRIORITY':
              todo.priority = parseInt(value, 10);
              break;
          }
        }
      }
    }

    return todo.uid ? todo : null;
  }

  /**
   * iCalの日付をパース
   */
  parseIcalDate(dateStr) {
    // 形式: YYYYMMDD または YYYYMMDDTHHmmssZ
    if (dateStr.length === 8) {
      const year = dateStr.substring(0, 4);
      const month = dateStr.substring(4, 6);
      const day = dateStr.substring(6, 8);
      return new Date(`${year}-${month}-${day}`);
    }
    
    if (dateStr.length >= 15) {
      const year = dateStr.substring(0, 4);
      const month = dateStr.substring(4, 6);
      const day = dateStr.substring(6, 8);
      const hour = dateStr.substring(9, 11);
      const minute = dateStr.substring(11, 13);
      const second = dateStr.substring(13, 15);
      return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
    }

    return null;
  }

  /**
   * iCalのエスケープを解除
   */
  unescapeIcal(str) {
    return str
      .replace(/\\n/g, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\');
  }

  /**
   * iCalの値をエスケープ
   */
  escapeIcal(str) {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n');
  }

  /**
   * 日付をiCal形式に変換
   */
  formatIcalDate(date) {
    const pad = (n) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  }

  /**
   * 日時をiCal形式に変換（UTC）
   */
  formatIcalDateTime(date) {
    const pad = (n) => n.toString().padStart(2, '0');
    return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
  }

  /**
   * 新しいリマインダーを作成
   */
  async createTodo(calendarHref, todoData) {
    const uid = this.generateUID();
    const now = this.formatIcalDateTime(new Date());
    
    let vtodo = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//WebClass UX Improver//CalDAV Sync//JP
BEGIN:VTODO
UID:${uid}
DTSTAMP:${now}
CREATED:${now}
SUMMARY:${this.escapeIcal(todoData.summary)}
STATUS:NEEDS-ACTION`;

    if (todoData.description) {
      vtodo += `\nDESCRIPTION:${this.escapeIcal(todoData.description)}`;
    }

    if (todoData.due) {
      const dueDate = todoData.due instanceof Date ? todoData.due : new Date(todoData.due);
      vtodo += `\nDUE;VALUE=DATE:${this.formatIcalDate(dueDate)}`;
    }

    if (todoData.priority) {
      vtodo += `\nPRIORITY:${todoData.priority}`;
    }

    vtodo += `
END:VTODO
END:VCALENDAR`;

    const fullUrl = calendarHref.startsWith('http')
      ? calendarHref
      : `https://caldav.icloud.com${calendarHref}`;
    
    const todoUrl = `${fullUrl}${uid}.ics`;

    const headers = {
      'Authorization': this.getAuthHeader(),
      'Content-Type': 'text/calendar; charset=utf-8',
      'If-None-Match': '*',
    };

    const response = await this.sendViaBackground(todoUrl, 'PUT', headers, vtodo);

    if (response.status >= 400 && response.status !== 201) {
      throw new Error(`Failed to create todo: ${response.status}`);
    }

    console.log('Created todo:', todoData.summary);
    return { uid, href: todoUrl };
  }

  /**
   * リマインダーを更新
   */
  async updateTodo(todoHref, todoData, etag = null) {
    const now = this.formatIcalDateTime(new Date());
    
    let vtodo = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//WebClass UX Improver//CalDAV Sync//JP
BEGIN:VTODO
UID:${todoData.uid}
DTSTAMP:${now}
LAST-MODIFIED:${now}
SUMMARY:${this.escapeIcal(todoData.summary)}
STATUS:${todoData.status || 'NEEDS-ACTION'}`;

    if (todoData.description) {
      vtodo += `\nDESCRIPTION:${this.escapeIcal(todoData.description)}`;
    }

    if (todoData.due) {
      const dueDate = todoData.due instanceof Date ? todoData.due : new Date(todoData.due);
      vtodo += `\nDUE;VALUE=DATE:${this.formatIcalDate(dueDate)}`;
    }

    if (todoData.completed) {
      vtodo += `\nCOMPLETED:${this.formatIcalDateTime(new Date(todoData.completed))}`;
    }

    vtodo += `
END:VTODO
END:VCALENDAR`;

    const fullUrl = todoHref.startsWith('http')
      ? todoHref
      : `https://caldav.icloud.com${todoHref}`;

    const headers = {
      'Authorization': this.getAuthHeader(),
      'Content-Type': 'text/calendar; charset=utf-8',
    };

    if (etag) {
      headers['If-Match'] = etag;
    }

    const response = await this.sendViaBackground(fullUrl, 'PUT', headers, vtodo);

    if (response.status >= 400) {
      throw new Error(`Failed to update todo: ${response.status}`);
    }

    console.log('Updated todo:', todoData.summary);
    return true;
  }

  /**
   * リマインダーを削除
   */
  async deleteTodo(todoHref, etag = null) {
    const fullUrl = todoHref.startsWith('http')
      ? todoHref
      : `https://caldav.icloud.com${todoHref}`;

    const headers = {
      'Authorization': this.getAuthHeader(),
    };

    if (etag) {
      headers['If-Match'] = etag;
    }

    const response = await this.sendViaBackground(fullUrl, 'DELETE', headers, null);

    if (response.status >= 400 && response.status !== 204) {
      throw new Error(`Failed to delete todo: ${response.status}`);
    }

    return true;
  }

  /**
   * UIDを生成
   */
  generateUID() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let uid = '';
    for (let i = 0; i < 32; i++) {
      uid += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${uid}@webclass-sync`;
  }
}

// エクスポート（ES Modulesとグローバル両対応）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CalDAVClient;
} else {
  window.CalDAVClient = CalDAVClient;
}

