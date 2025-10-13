// 同期状態表示UIコンポーネント
class SyncStatusUI {
    constructor() {
        this.statusElement = null;
        this.syncManager = null;
        this.updateInterval = null;
        this.init();
    }
    
    init() {
        // 同期マネージャーの参照を取得
        if (typeof syncManager !== 'undefined') {
            this.syncManager = syncManager;
        }
        
        // DOM読み込み後にUI要素を作成
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.createUI());
        } else {
            this.createUI();
        }
    }
    
    createUI() {
        // 同期状態表示用の要素を作成
        const statusContainer = document.createElement('div');
        statusContainer.id = 'sync-status-container';
        statusContainer.className = 'sync-status-container';
        statusContainer.innerHTML = `
            <div class="sync-status">
                <span class="sync-icon">⚡</span>
                <span class="sync-text">初期化中...</span>
                <span class="sync-badge"></span>
            </div>
            <div class="sync-details" style="display: none;">
                <div class="sync-detail-item">
                    <span class="detail-label">接続状態:</span>
                    <span class="detail-value connection-status">確認中...</span>
                </div>
                <div class="sync-detail-item">
                    <span class="detail-label">最終同期:</span>
                    <span class="detail-value last-sync">未同期</span>
                </div>
                <div class="sync-detail-item">
                    <span class="detail-label">保留中:</span>
                    <span class="detail-value pending-count">0件</span>
                </div>
                <div class="sync-actions">
                    <button class="sync-button" onclick="syncStatusUI.forceSyncNow()">今すぐ同期</button>
                    <button class="sync-button" onclick="syncStatusUI.testConnection()">接続テスト</button>
                </div>
            </div>
        `;
        
        // スタイルを追加
        this.addStyles();
        
        // 要素をページに追加
        document.body.appendChild(statusContainer);
        this.statusElement = statusContainer;
        
        // クリックで詳細表示/非表示
        statusContainer.querySelector('.sync-status').addEventListener('click', () => {
            this.toggleDetails();
        });
        
        // 定期的に状態を更新
        this.startStatusUpdates();
        
        // 同期イベントをリッスン
        if (this.syncManager) {
            this.syncManager.subscribe((change) => {
                this.handleSyncEvent(change);
            });
        }
    }
    
    addStyles() {
        if (document.getElementById('sync-status-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'sync-status-styles';
        style.textContent = `
            .sync-status-container {
                position: fixed;
                top: 10px;
                right: 10px;
                background: white;
                border: 1px solid #ddd;
                border-radius: 8px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                z-index: 10000;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
                min-width: 200px;
                transition: all 0.3s ease;
            }
            
            .sync-status {
                padding: 10px 15px;
                display: flex;
                align-items: center;
                cursor: pointer;
                user-select: none;
            }
            
            .sync-icon {
                font-size: 18px;
                margin-right: 8px;
                animation: pulse 2s infinite;
            }
            
            .sync-status.online .sync-icon {
                color: #4CAF50;
            }
            
            .sync-status.offline .sync-icon {
                color: #f44336;
                animation: none;
            }
            
            .sync-status.syncing .sync-icon {
                color: #2196F3;
                animation: spin 1s linear infinite;
            }
            
            .sync-text {
                flex: 1;
                color: #333;
            }
            
            .sync-badge {
                background: #f44336;
                color: white;
                border-radius: 10px;
                padding: 2px 6px;
                font-size: 11px;
                display: none;
                margin-left: 8px;
            }
            
            .sync-badge.has-pending {
                display: inline-block;
            }
            
            .sync-details {
                border-top: 1px solid #eee;
                padding: 10px 15px;
                background: #fafafa;
                border-radius: 0 0 8px 8px;
            }
            
            .sync-detail-item {
                display: flex;
                justify-content: space-between;
                margin-bottom: 8px;
                color: #666;
            }
            
            .detail-label {
                font-weight: 500;
            }
            
            .detail-value {
                color: #333;
            }
            
            .connection-status.online {
                color: #4CAF50;
                font-weight: 500;
            }
            
            .connection-status.offline {
                color: #f44336;
                font-weight: 500;
            }
            
            .sync-actions {
                margin-top: 10px;
                display: flex;
                gap: 8px;
            }
            
            .sync-button {
                flex: 1;
                padding: 6px 12px;
                background: #2196F3;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                transition: background 0.3s;
            }
            
            .sync-button:hover {
                background: #1976D2;
            }
            
            .sync-button:disabled {
                background: #ccc;
                cursor: not-allowed;
            }
            
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.6; }
            }
            
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
            
            /* モバイル対応 */
            @media (max-width: 600px) {
                .sync-status-container {
                    top: auto;
                    bottom: 10px;
                    right: 10px;
                    left: 10px;
                    min-width: auto;
                }
            }
            
            /* 通知アニメーション */
            .sync-notification {
                position: fixed;
                top: 70px;
                right: 10px;
                background: #4CAF50;
                color: white;
                padding: 10px 15px;
                border-radius: 4px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                z-index: 10001;
                animation: slideIn 0.3s ease;
            }
            
            .sync-notification.error {
                background: #f44336;
            }
            
            .sync-notification.warning {
                background: #FF9800;
            }
            
            @keyframes slideIn {
                from {
                    transform: translateX(300px);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;
        
        document.head.appendChild(style);
    }
    
    startStatusUpdates() {
        // 即座に初回更新
        this.updateStatus();
        
        // 3秒ごとに状態を更新
        this.updateInterval = setInterval(() => {
            this.updateStatus();
        }, 3000);
    }
    
    stopStatusUpdates() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
    
    updateStatus() {
        if (!this.syncManager) return;
        
        const status = this.syncManager.getStatus();
        const statusEl = this.statusElement.querySelector('.sync-status');
        const textEl = this.statusElement.querySelector('.sync-text');
        const badgeEl = this.statusElement.querySelector('.sync-badge');
        
        // 接続状態を更新
        if (status.isSyncing) {
            statusEl.className = 'sync-status syncing';
            textEl.textContent = '同期中...';
        } else if (status.isOnline) {
            statusEl.className = 'sync-status online';
            textEl.textContent = 'オンライン';
        } else {
            statusEl.className = 'sync-status offline';
            textEl.textContent = 'オフライン';
        }
        
        // 保留中の件数を表示
        if (status.pendingCount > 0) {
            badgeEl.textContent = status.pendingCount;
            badgeEl.className = 'sync-badge has-pending';
        } else {
            badgeEl.className = 'sync-badge';
        }
        
        // 詳細情報を更新
        this.updateDetails(status);
    }
    
    updateDetails(status) {
        const connectionEl = this.statusElement.querySelector('.connection-status');
        const lastSyncEl = this.statusElement.querySelector('.last-sync');
        const pendingEl = this.statusElement.querySelector('.pending-count');
        
        // 接続状態
        if (status.isOnline) {
            connectionEl.textContent = 'オンライン';
            connectionEl.className = 'detail-value connection-status online';
        } else {
            connectionEl.textContent = 'オフライン';
            connectionEl.className = 'detail-value connection-status offline';
        }
        
        // 最終同期時刻
        if (status.lastSync) {
            const lastSync = new Date(status.lastSync);
            const now = new Date();
            const diff = Math.floor((now - lastSync) / 1000);
            
            if (diff < 60) {
                lastSyncEl.textContent = `${diff}秒前`;
            } else if (diff < 3600) {
                lastSyncEl.textContent = `${Math.floor(diff / 60)}分前`;
            } else {
                lastSyncEl.textContent = lastSync.toLocaleTimeString('ja-JP');
            }
        } else {
            lastSyncEl.textContent = '未同期';
        }
        
        // 保留中の件数
        pendingEl.textContent = `${status.pendingCount}件`;
    }
    
    toggleDetails() {
        const details = this.statusElement.querySelector('.sync-details');
        if (details.style.display === 'none') {
            details.style.display = 'block';
        } else {
            details.style.display = 'none';
        }
    }
    
    async forceSyncNow() {
        if (!this.syncManager) {
            this.showNotification('同期マネージャーが初期化されていません', 'error');
            return;
        }
        
        const button = this.statusElement.querySelector('.sync-button');
        button.disabled = true;
        button.textContent = '同期中...';
        
        try {
            await this.syncManager.forceSyncNow();
            this.showNotification('同期が完了しました', 'success');
        } catch (error) {
            this.showNotification('同期に失敗しました: ' + error.message, 'error');
        } finally {
            button.disabled = false;
            button.textContent = '今すぐ同期';
        }
    }
    
    async testConnection() {
        if (!this.syncManager) {
            this.showNotification('同期マネージャーが初期化されていません', 'error');
            return;
        }
        
        const button = this.statusElement.querySelectorAll('.sync-button')[1];
        button.disabled = true;
        button.textContent = 'テスト中...';
        
        try {
            const result = await this.syncManager.checkConnection();
            if (result) {
                this.showNotification('接続テスト成功！', 'success');
            } else {
                this.showNotification('接続テスト失敗', 'error');
            }
        } catch (error) {
            this.showNotification('接続エラー: ' + error.message, 'error');
        } finally {
            button.disabled = false;
            button.textContent = '接続テスト';
        }
    }
    
    handleSyncEvent(change) {
        // 同期イベントの種類に応じて通知を表示
        switch (change.type) {
            case 'INSERT':
                this.showNotification('新しいオーダーが追加されました', 'success');
                break;
            case 'UPDATE':
                this.showNotification('オーダーが更新されました', 'success');
                break;
            case 'DELETE':
                this.showNotification('オーダーが削除されました', 'warning');
                break;
            case 'FULL_SYNC':
                this.showNotification('データの完全同期が完了しました', 'success');
                break;
        }
        
        // ステータスを更新
        this.updateStatus();
    }
    
    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `sync-notification ${type === 'error' ? 'error' : type === 'warning' ? 'warning' : ''}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // 3秒後に自動的に削除
        setTimeout(() => {
            notification.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }
    
    // クリーンアップ
    destroy() {
        this.stopStatusUpdates();
        if (this.statusElement) {
            this.statusElement.remove();
        }
    }
}

// グローバルにUIを初期化
const syncStatusUI = new SyncStatusUI();