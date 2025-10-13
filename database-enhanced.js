// 強化されたデータベース管理モジュール（同期機能統合版）
class EnhancedDatabaseManager {
    constructor() {
        this.isOnline = false;
        this.tableName = 'orders';
        this.syncManager = null;
        this.retryAttempts = 3;
        this.retryDelay = 1000;
        this.init();
    }
    
    async init() {
        // Supabaseが利用可能かチェック
        this.isOnline = typeof supabase !== 'undefined' && supabase !== null;
        console.log(`Enhanced Database: ${this.isOnline ? 'Online' : 'Offline'} mode`);
        
        // 同期マネージャーの初期化を待つ
        if (typeof syncManager !== 'undefined') {
            this.syncManager = syncManager;
            
            // 同期イベントの購読
            this.syncManager.subscribe((change) => {
                this.handleSyncEvent(change);
            });
        }
    }
    
    // 同期イベントの処理
    handleSyncEvent(change) {
        console.log('Database: Sync event received:', change.type);
        
        // UIを更新するためのカスタムイベントを発火
        window.dispatchEvent(new CustomEvent('ordersUpdated', {
            detail: change
        }));
    }
    
    // オーダー取得（キャッシュ優先）
    async getOrders(filters = {}, forceRefresh = false) {
        // ローカルキャッシュから即座に返す
        const cachedOrders = this.getLocalOrders();
        
        // オンラインでリフレッシュが必要な場合
        if (this.isOnline && (forceRefresh || this.shouldRefreshCache())) {
            this.refreshOrdersInBackground(filters);
        }
        
        // フィルター適用
        return this.applyFilters(cachedOrders, filters);
    }
    
    // バックグラウンドでオーダーをリフレッシュ
    async refreshOrdersInBackground(filters = {}) {
        try {
            let query = supabase.from(this.tableName).select('*');
            
            // デフォルトで削除されていないもののみ
            if (filters.deleted === undefined) {
                query = query.eq('deleted', false);
            }
            
            query = query.order('created_at', { ascending: false });
            
            const { data, error } = await query;
            
            if (!error && data) {
                this.saveToLocalStorage(data);
                
                // UIを更新
                window.dispatchEvent(new CustomEvent('ordersUpdated', {
                    detail: { type: 'REFRESH', data }
                }));
            }
        } catch (error) {
            console.error('Background refresh failed:', error);
        }
    }
    
    // キャッシュをリフレッシュすべきか判定
    shouldRefreshCache() {
        const lastRefresh = localStorage.getItem('lastOrdersRefresh');
        if (!lastRefresh) return true;
        
        const refreshInterval = 30000; // 30秒
        return (Date.now() - parseInt(lastRefresh)) > refreshInterval;
    }
    
    // オーダー作成（最適化版）
    async createOrder(orderData) {
        const order = {
            ...orderData,
            id: this.generateId(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            created_by: authManager?.getUser()?.id || 'anonymous',
            sync_status: 'pending'
        };
        
        // まずローカルに保存（即座にUIを更新）
        this.saveLocalOrder(order);
        
        // UIを即座に更新
        window.dispatchEvent(new CustomEvent('orderCreated', {
            detail: order
        }));
        
        // オンラインの場合、バックグラウンドで同期
        if (this.isOnline) {
            this.syncOrderInBackground(order, 'create');
        } else {
            // オフラインの場合、同期キューに追加
            this.addToSyncQueue('create', order);
        }
        
        return order;
    }
    
    // バックグラウンドでオーダーを同期
    async syncOrderInBackground(order, operation) {
        try {
            if (operation === 'create') {
                const { data, error } = await this.retryOperation(async () => {
                    return await supabase
                        .from(this.tableName)
                        .insert([order])
                        .select()
                        .single();
                });
                
                if (data) {
                    // 実際のIDで更新
                    this.updateLocalOrderId(order.id, data.id);
                    order.sync_status = 'synced';
                    this.updateLocalStorage(data);
                }
            }
        } catch (error) {
            console.error('Background sync failed:', error);
            this.addToSyncQueue(operation, order);
        }
    }
    
    // リトライ機能付き操作
    async retryOperation(operation, attempts = this.retryAttempts) {
        for (let i = 0; i < attempts; i++) {
            try {
                return await operation();
            } catch (error) {
                if (i === attempts - 1) throw error;
                await this.delay(this.retryDelay * Math.pow(2, i));
            }
        }
    }
    
    // 遅延ユーティリティ
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    // オーダー更新（最適化版）
    async updateOrder(orderId, updates) {
        const updatedData = {
            ...updates,
            updated_at: new Date().toISOString(),
            updated_by: authManager?.getUser()?.id || 'anonymous',
            sync_status: 'pending'
        };
        
        // 即座にローカル更新
        const localOrder = this.updateLocalOrder(orderId, updatedData);
        
        // UIを更新
        window.dispatchEvent(new CustomEvent('orderUpdated', {
            detail: localOrder
        }));
        
        // オンラインの場合、バックグラウンドで同期
        if (this.isOnline) {
            this.syncUpdateInBackground(orderId, updatedData);
        } else {
            this.addToSyncQueue('update', { id: orderId, ...updatedData });
        }
        
        return localOrder;
    }
    
    // バックグラウンドで更新を同期
    async syncUpdateInBackground(orderId, updates) {
        try {
            const { data, error } = await this.retryOperation(async () => {
                return await supabase
                    .from(this.tableName)
                    .update(updates)
                    .eq('id', orderId)
                    .select()
                    .single();
            });
            
            if (data) {
                updates.sync_status = 'synced';
                this.updateLocalStorage(data);
            }
        } catch (error) {
            console.error('Update sync failed:', error);
            this.addToSyncQueue('update', { id: orderId, ...updates });
        }
    }
    
    // 同期キューに追加
    addToSyncQueue(operation, data) {
        if (this.syncManager) {
            this.syncManager.addPendingChange(operation, data, data.id);
        } else {
            // フォールバック：ローカルストレージに保存
            const queue = JSON.parse(localStorage.getItem('syncQueue') || '[]');
            queue.push({
                operation,
                data,
                timestamp: new Date().toISOString()
            });
            localStorage.setItem('syncQueue', JSON.stringify(queue));
        }
    }
    
    // バッチ操作のサポート
    async batchUpdate(orderIds, updates) {
        const results = [];
        
        for (const orderId of orderIds) {
            results.push(await this.updateOrder(orderId, updates));
        }
        
        return results;
    }
    
    // ========== LocalStorage用のヘルパーメソッド ==========
    
    getLocalOrders() {
        const stored = localStorage.getItem('orderSystem_orders');
        if (stored) {
            try {
                const orders = JSON.parse(stored);
                return orders.filter(o => !o.deleted);
            } catch (e) {
                console.error('Error parsing local data:', e);
                return [];
            }
        }
        return [];
    }
    
    saveLocalOrder(order) {
        const orders = this.getLocalOrders();
        orders.unshift(order);
        localStorage.setItem('orderSystem_orders', JSON.stringify(orders));
        localStorage.setItem('lastOrdersRefresh', Date.now().toString());
        return order;
    }
    
    updateLocalOrder(orderId, updates) {
        const orders = JSON.parse(localStorage.getItem('orderSystem_orders') || '[]');
        const index = orders.findIndex(o => o.id === orderId);
        if (index !== -1) {
            orders[index] = { ...orders[index], ...updates };
            localStorage.setItem('orderSystem_orders', JSON.stringify(orders));
            return orders[index];
        }
        return null;
    }
    
    updateLocalOrderId(oldId, newId) {
        const orders = JSON.parse(localStorage.getItem('orderSystem_orders') || '[]');
        const index = orders.findIndex(o => o.id === oldId);
        if (index !== -1) {
            orders[index].id = newId;
            localStorage.setItem('orderSystem_orders', JSON.stringify(orders));
        }
    }
    
    saveToLocalStorage(data) {
        localStorage.setItem('orderSystem_orders', JSON.stringify(data));
        localStorage.setItem('lastOrdersRefresh', Date.now().toString());
    }
    
    updateLocalStorage(updatedOrder) {
        const orders = JSON.parse(localStorage.getItem('orderSystem_orders') || '[]');
        const index = orders.findIndex(o => o.id === updatedOrder.id);
        if (index !== -1) {
            orders[index] = updatedOrder;
        } else {
            orders.unshift(updatedOrder);
        }
        this.saveToLocalStorage(orders);
    }
    
    // フィルター適用
    applyFilters(orders, filters) {
        let filtered = [...orders];
        
        if (filters.completed !== undefined) {
            filtered = filtered.filter(o => o.completed === filters.completed);
        }
        
        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            filtered = filtered.filter(o => 
                o.customer_name?.toLowerCase().includes(searchLower) ||
                o.phone?.includes(filters.search) ||
                o.delivery_address?.toLowerCase().includes(searchLower)
            );
        }
        
        if (filters.dateFrom) {
            filtered = filtered.filter(o => o.delivery_date >= filters.dateFrom);
        }
        
        if (filters.dateTo) {
            filtered = filtered.filter(o => o.delivery_date <= filters.dateTo);
        }
        
        return filtered;
    }
    
    // ID生成（改良版）
    generateId() {
        if (this.isOnline && crypto.randomUUID) {
            return crypto.randomUUID();
        } else {
            // オフライン用のユニークID生成
            return `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
    }
    
    // データ統計を取得
    async getStatistics() {
        const orders = await this.getOrders();
        
        return {
            total: orders.length,
            completed: orders.filter(o => o.completed).length,
            pending: orders.filter(o => !o.completed).length,
            todayDeliveries: orders.filter(o => {
                const today = new Date().toISOString().split('T')[0];
                return o.delivery_date === today;
            }).length,
            syncPending: orders.filter(o => o.sync_status === 'pending').length
        };
    }
}

// グローバルにエンハンスドデータベースマネージャーを初期化
const enhancedDb = new EnhancedDatabaseManager();