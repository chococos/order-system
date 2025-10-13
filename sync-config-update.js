// Replicationが利用できない環境用の同期設定
// このスクリプトをHTMLに追加して、ポーリングベースの同期を最適化します

// 同期マネージャーの設定を調整
if (typeof syncManager !== 'undefined') {
    // リアルタイムが使えない場合の設定
    syncManager.realtimeEnabled = false;
    
    // ポーリング間隔を短くする（5秒→3秒）
    if (syncManager.syncInterval) {
        clearInterval(syncManager.syncInterval);
    }
    
    // 3秒ごとに同期チェック
    syncManager.startPollingSync = function() {
        console.log('Starting polling-based sync (3 second interval)');
        
        this.syncInterval = setInterval(async () => {
            // ローカルの変更を同期
            await this.syncPendingChanges();
            
            // サーバーの最新データを取得
            if (this.syncStatus.isOnline && !this.syncStatus.isSyncing) {
                await this.pullLatestChanges();
            }
        }, 3000);
    };
    
    // サーバーから最新データを取得
    syncManager.pullLatestChanges = async function() {
        if (!supabase || !this.syncStatus.isOnline) return;
        
        try {
            // 最終同期時刻を取得
            const lastPullTime = localStorage.getItem('lastPullTime') || new Date(Date.now() - 86400000).toISOString();
            
            // 更新されたデータを取得
            const { data, error } = await supabase
                .from('orders')
                .select('*')
                .gte('updated_at', lastPullTime)
                .order('updated_at', { ascending: false });
            
            if (!error && data && data.length > 0) {
                console.log(`Pulled ${data.length} updated records`);
                
                // ローカルストレージを更新
                const localOrders = JSON.parse(localStorage.getItem('orderSystem_orders') || '[]');
                
                data.forEach(serverOrder => {
                    const localIndex = localOrders.findIndex(o => o.id === serverOrder.id);
                    if (localIndex !== -1) {
                        // 更新
                        if (new Date(serverOrder.updated_at) > new Date(localOrders[localIndex].updated_at || 0)) {
                            localOrders[localIndex] = serverOrder;
                        }
                    } else {
                        // 新規追加
                        localOrders.unshift(serverOrder);
                    }
                });
                
                localStorage.setItem('orderSystem_orders', JSON.stringify(localOrders));
                localStorage.setItem('lastPullTime', new Date().toISOString());
                
                // UIを更新
                this.notifySubscribers({
                    type: 'PULL_UPDATE',
                    data: localOrders,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error('Pull sync error:', error);
        }
    };
    
    // ポーリング同期を開始
    syncManager.startPollingSync();
    
    console.log('Sync configuration updated for non-realtime environment');
}

// データベースマネージャーも調整
if (typeof enhancedDb !== 'undefined') {
    // リフレッシュ間隔を短くする
    enhancedDb.refreshInterval = 10000; // 10秒
    
    // 自動リフレッシュを有効化
    enhancedDb.enableAutoRefresh = function() {
        setInterval(() => {
            if (navigator.onLine) {
                this.refreshOrdersInBackground();
            }
        }, this.refreshInterval);
    };
    
    enhancedDb.enableAutoRefresh();
}

// 同期状態表示を更新
if (typeof syncStatusUI !== 'undefined') {
    // UIに「ポーリングモード」を表示
    const updateStatusText = syncStatusUI.updateStatus;
    syncStatusUI.updateStatus = function() {
        updateStatusText.call(this);
        
        const textEl = document.querySelector('.sync-text');
        if (textEl && this.syncManager?.syncStatus?.isOnline) {
            textEl.textContent += ' (ポーリング)';
        }
    };
}

console.log('✅ Polling-based sync configuration loaded');