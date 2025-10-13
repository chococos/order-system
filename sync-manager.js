// 同期マネージャー - 複数デバイス間のデータ同期を管理
class SyncManager {
    constructor() {
        this.syncStatus = {
            isOnline: false,
            isSyncing: false,
            lastSync: null,
            pendingChanges: [],
            syncErrors: []
        };
        
        this.syncInterval = null;
        this.realtimeSubscription = null;
        this.conflictResolutionStrategy = 'last-write-wins'; // or 'merge'
        this.syncCallbacks = [];
        
        this.init();
    }
    
    async init() {
        console.log('SyncManager: Initializing...');
        
        // オンライン/オフライン状態の監視
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
        
        // Supabase接続チェック
        await this.checkConnection();
        
        // 自動同期の開始
        if (this.syncStatus.isOnline) {
            this.startAutoSync();
            this.subscribeToRealtimeChanges();
        }
        
        // ページ終了時の同期
        window.addEventListener('beforeunload', (e) => {
            if (this.syncStatus.pendingChanges.length > 0) {
                e.preventDefault();
                e.returnValue = '未保存の変更があります。';
                this.forceSyncNow();
            }
        });
    }
    
    // Supabase接続チェックと診断
    async checkConnection() {
        console.log('SyncManager: Checking Supabase connection...');
        
        try {
            // Supabaseクライアントの存在確認
            if (!window.supabase || !supabase) {
                throw new Error('Supabase client not initialized');
            }
            
            // 認証状態の確認
            const { data: { session }, error: authError } = await supabase.auth.getSession();
            if (authError) {
                console.error('Auth check failed:', authError);
                this.syncStatus.isOnline = false;
                return false;
            }
            
            // データベース接続テスト
            const { data, error } = await supabase
                .from('orders')
                .select('id')
                .limit(1);
            
            if (error) {
                console.error('Database connection test failed:', error);
                
                // テーブルが存在しない場合の処理
                if (error.message.includes('relation') && error.message.includes('does not exist')) {
                    console.warn('Orders table does not exist. Creating table...');
                    await this.createOrdersTable();
                } else {
                    throw error;
                }
            }
            
            this.syncStatus.isOnline = true;
            console.log('SyncManager: Connection successful');
            return true;
            
        } catch (error) {
            console.error('SyncManager: Connection check failed:', error);
            this.syncStatus.isOnline = false;
            this.syncStatus.syncErrors.push({
                time: new Date().toISOString(),
                error: error.message
            });
            return false;
        }
    }
    
    // テーブル作成（必要に応じて）
    async createOrdersTable() {
        // 注: 通常はSupabaseダッシュボードで作成しますが、
        // SQLを実行できる場合のサンプルコード
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS orders (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                customer_name VARCHAR(255),
                phone VARCHAR(50),
                email VARCHAR(255),
                delivery_date DATE,
                delivery_time VARCHAR(50),
                delivery_address TEXT,
                order_items TEXT,
                total_amount DECIMAL(10,2),
                notes TEXT,
                completed BOOLEAN DEFAULT false,
                deleted BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                created_by UUID,
                updated_by UUID,
                sync_version INTEGER DEFAULT 1
            );
        `;
        
        console.warn('Table creation should be done via Supabase Dashboard');
        // Supabaseダッシュボードで上記SQLを実行してください
    }
    
    // リアルタイム変更の購読
    subscribeToRealtimeChanges() {
        if (!this.syncStatus.isOnline || !supabase) return;
        
        console.log('SyncManager: Subscribing to realtime changes...');
        
        this.realtimeSubscription = supabase
            .channel('orders-sync-channel')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'orders'
                },
                (payload) => this.handleRealtimeChange(payload)
            )
            .subscribe((status) => {
                console.log('Realtime subscription status:', status);
            });
    }
    
    // リアルタイム変更の処理
    async handleRealtimeChange(payload) {
        console.log('SyncManager: Realtime change detected:', payload);
        
        const { eventType, new: newRecord, old: oldRecord } = payload;
        
        // 自分の変更は無視（ループ防止）
        const currentUserId = authManager?.getUser()?.id;
        if (newRecord?.updated_by === currentUserId) {
            return;
        }
        
        // UIを更新するためのイベント発火
        this.notifySubscribers({
            type: eventType,
            data: newRecord || oldRecord,
            timestamp: new Date().toISOString()
        });
        
        // ローカルストレージも更新
        await this.updateLocalCache(eventType, newRecord, oldRecord);
    }
    
    // ローカルキャッシュの更新
    async updateLocalCache(eventType, newRecord, oldRecord) {
        const orders = JSON.parse(localStorage.getItem('orderSystem_orders') || '[]');
        
        switch (eventType) {
            case 'INSERT':
                orders.unshift(newRecord);
                break;
                
            case 'UPDATE':
                const updateIndex = orders.findIndex(o => o.id === newRecord.id);
                if (updateIndex !== -1) {
                    orders[updateIndex] = newRecord;
                }
                break;
                
            case 'DELETE':
                const deleteIndex = orders.findIndex(o => o.id === oldRecord.id);
                if (deleteIndex !== -1) {
                    orders.splice(deleteIndex, 1);
                }
                break;
        }
        
        localStorage.setItem('orderSystem_orders', JSON.stringify(orders));
    }
    
    // 自動同期の開始
    startAutoSync() {
        console.log('SyncManager: Starting auto-sync...');
        
        // 5秒ごとに同期チェック
        this.syncInterval = setInterval(() => {
            this.syncPendingChanges();
        }, 5000);
        
        // 即座に初回同期
        this.syncPendingChanges();
    }
    
    // 自動同期の停止
    stopAutoSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }
    
    // 保留中の変更を同期
    async syncPendingChanges() {
        if (this.syncStatus.isSyncing || !this.syncStatus.isOnline) {
            return;
        }
        
        const pendingChanges = this.getPendingChanges();
        if (pendingChanges.length === 0) {
            return;
        }
        
        this.syncStatus.isSyncing = true;
        console.log(`SyncManager: Syncing ${pendingChanges.length} pending changes...`);
        
        try {
            for (const change of pendingChanges) {
                await this.syncChange(change);
            }
            
            this.syncStatus.lastSync = new Date().toISOString();
            this.clearPendingChanges();
            
            console.log('SyncManager: Sync completed successfully');
            
        } catch (error) {
            console.error('SyncManager: Sync failed:', error);
            this.syncStatus.syncErrors.push({
                time: new Date().toISOString(),
                error: error.message
            });
        } finally {
            this.syncStatus.isSyncing = false;
        }
    }
    
    // 個別の変更を同期
    async syncChange(change) {
        const { type, data, localId } = change;
        
        switch (type) {
            case 'create':
                return await this.syncCreate(data, localId);
            case 'update':
                return await this.syncUpdate(data);
            case 'delete':
                return await this.syncDelete(data.id);
        }
    }
    
    // 新規作成の同期
    async syncCreate(data, localId) {
        const { data: created, error } = await supabase
            .from('orders')
            .insert([data])
            .select()
            .single();
        
        if (error) throw error;
        
        // ローカルIDを実際のIDに置き換え
        this.replaceLocalId(localId, created.id);
        
        return created;
    }
    
    // 更新の同期
    async syncUpdate(data) {
        const { data: updated, error } = await supabase
            .from('orders')
            .update(data)
            .eq('id', data.id)
            .select()
            .single();
        
        if (error) {
            // 競合解決
            if (error.message.includes('conflict')) {
                return await this.resolveConflict(data);
            }
            throw error;
        }
        
        return updated;
    }
    
    // 削除の同期
    async syncDelete(id) {
        const { error } = await supabase
            .from('orders')
            .update({ deleted: true })
            .eq('id', id);
        
        if (error) throw error;
    }
    
    // 競合解決
    async resolveConflict(localData) {
        console.log('SyncManager: Resolving conflict...');
        
        // サーバーの最新データを取得
        const { data: serverData, error } = await supabase
            .from('orders')
            .select('*')
            .eq('id', localData.id)
            .single();
        
        if (error) throw error;
        
        if (this.conflictResolutionStrategy === 'last-write-wins') {
            // タイムスタンプ比較
            if (new Date(localData.updated_at) > new Date(serverData.updated_at)) {
                // ローカルデータで上書き
                return await this.forceUpdate(localData);
            } else {
                // サーバーデータを保持
                this.updateLocalCache('UPDATE', serverData, null);
                return serverData;
            }
        } else if (this.conflictResolutionStrategy === 'merge') {
            // フィールドごとにマージ（実装が必要）
            const mergedData = this.mergeData(localData, serverData);
            return await this.forceUpdate(mergedData);
        }
    }
    
    // 強制更新
    async forceUpdate(data) {
        const { data: updated, error } = await supabase
            .from('orders')
            .update(data)
            .eq('id', data.id)
            .select()
            .single();
        
        if (error) throw error;
        return updated;
    }
    
    // オンライン復帰時の処理
    async handleOnline() {
        console.log('SyncManager: Connection restored');
        this.syncStatus.isOnline = true;
        
        await this.checkConnection();
        
        if (this.syncStatus.isOnline) {
            this.startAutoSync();
            this.subscribeToRealtimeChanges();
            
            // 全データの再同期
            await this.fullSync();
        }
    }
    
    // オフライン時の処理
    handleOffline() {
        console.log('SyncManager: Connection lost');
        this.syncStatus.isOnline = false;
        
        this.stopAutoSync();
        
        if (this.realtimeSubscription) {
            this.realtimeSubscription.unsubscribe();
            this.realtimeSubscription = null;
        }
    }
    
    // 完全同期
    async fullSync() {
        console.log('SyncManager: Performing full sync...');
        
        try {
            // サーバーから全データ取得
            const { data: serverOrders, error } = await supabase
                .from('orders')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            // ローカルデータと比較・マージ
            const localOrders = JSON.parse(localStorage.getItem('orderSystem_orders') || '[]');
            const mergedOrders = this.mergeOrderLists(localOrders, serverOrders);
            
            // ローカルストレージを更新
            localStorage.setItem('orderSystem_orders', JSON.stringify(mergedOrders));
            
            console.log('SyncManager: Full sync completed');
            
            // UIを更新
            this.notifySubscribers({
                type: 'FULL_SYNC',
                data: mergedOrders,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('SyncManager: Full sync failed:', error);
        }
    }
    
    // オーダーリストのマージ
    mergeOrderLists(localOrders, serverOrders) {
        const merged = new Map();
        
        // サーバーデータを基準に
        serverOrders.forEach(order => {
            merged.set(order.id, order);
        });
        
        // ローカルのみのデータを追加
        localOrders.forEach(order => {
            if (!merged.has(order.id)) {
                // ローカルのみのデータは保留中としてマーク
                order._pendingSync = true;
                merged.set(order.id, order);
                
                // 同期対象として追加
                this.addPendingChange('create', order, order.id);
            }
        });
        
        return Array.from(merged.values());
    }
    
    // 保留中の変更を追加
    addPendingChange(type, data, localId = null) {
        const change = {
            id: Date.now().toString(),
            type,
            data,
            localId,
            timestamp: new Date().toISOString()
        };
        
        this.syncStatus.pendingChanges.push(change);
        
        // LocalStorageにも保存
        localStorage.setItem('syncPendingChanges', JSON.stringify(this.syncStatus.pendingChanges));
    }
    
    // 保留中の変更を取得
    getPendingChanges() {
        const stored = localStorage.getItem('syncPendingChanges');
        if (stored) {
            this.syncStatus.pendingChanges = JSON.parse(stored);
        }
        return this.syncStatus.pendingChanges;
    }
    
    // 保留中の変更をクリア
    clearPendingChanges() {
        this.syncStatus.pendingChanges = [];
        localStorage.removeItem('syncPendingChanges');
    }
    
    // ローカルIDを実際のIDに置き換え
    replaceLocalId(localId, actualId) {
        const orders = JSON.parse(localStorage.getItem('orderSystem_orders') || '[]');
        const index = orders.findIndex(o => o.id === localId);
        
        if (index !== -1) {
            orders[index].id = actualId;
            delete orders[index]._pendingSync;
            localStorage.setItem('orderSystem_orders', JSON.stringify(orders));
        }
    }
    
    // 変更通知の購読
    subscribe(callback) {
        this.syncCallbacks.push(callback);
    }
    
    // 購読者への通知
    notifySubscribers(change) {
        this.syncCallbacks.forEach(callback => {
            try {
                callback(change);
            } catch (error) {
                console.error('SyncManager: Subscriber notification failed:', error);
            }
        });
    }
    
    // 同期を強制実行
    async forceSyncNow() {
        console.log('SyncManager: Forcing immediate sync...');
        return await this.syncPendingChanges();
    }
    
    // 同期状態を取得
    getStatus() {
        return {
            ...this.syncStatus,
            pendingCount: this.syncStatus.pendingChanges.length
        };
    }
}

// グローバルに同期マネージャーを初期化
const syncManager = new SyncManager();