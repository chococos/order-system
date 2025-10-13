// データベース管理モジュール（Supabase/LocalStorage自動切り替え）
class DatabaseManager {
    constructor() {
        this.isOnline = false;
        this.tableName = 'orders'; // Supabaseのテーブル名
        this.init();
    }
    
    init() {
        // Supabaseが利用可能かチェック
        this.isOnline = typeof supabase !== 'undefined' && supabase !== null;
        console.log(`Database mode: ${this.isOnline ? 'Online (Supabase)' : 'Offline (LocalStorage)'}`);
    }
    
    // オーダー取得
    async getOrders(filters = {}) {
        if (this.isOnline) {
            try {
                let query = supabase.from(this.tableName).select('*');
                
                // フィルター適用
                if (filters.completed !== undefined) {
                    query = query.eq('completed', filters.completed);
                }
                if (filters.deleted !== undefined) {
                    query = query.eq('deleted', filters.deleted);
                }
                if (filters.dateFrom) {
                    query = query.gte('date_from', filters.dateFrom);
                }
                if (filters.dateTo) {
                    query = query.lte('date_to', filters.dateTo);
                }
                
                // 作成日時で降順ソート
                query = query.order('created_at', { ascending: false });
                
                const { data, error } = await query;
                
                if (error) {
                    console.error('Error fetching orders:', error);
                    return this.getLocalOrders(); // フォールバック
                }
                
                // LocalStorageにもキャッシュとして保存
                this.saveToLocalStorage(data);
                return data;
            } catch (error) {
                console.error('Database error:', error);
                return this.getLocalOrders();
            }
        } else {
            return this.getLocalOrders();
        }
    }
    
    // オーダー作成
    async createOrder(orderData) {
        // IDとタイムスタンプを追加
        const order = {
            ...orderData,
            id: this.generateId(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            created_by: authManager?.getUser()?.id || 'anonymous'
        };
        
        if (this.isOnline) {
            try {
                const { data, error } = await supabase
                    .from(this.tableName)
                    .insert([order])
                    .select()
                    .single();
                
                if (error) {
                    console.error('Error creating order:', error);
                    return this.saveLocalOrder(order); // フォールバック
                }
                
                // LocalStorageにも保存
                this.updateLocalStorage(data);
                return data;
            } catch (error) {
                console.error('Database error:', error);
                return this.saveLocalOrder(order);
            }
        } else {
            return this.saveLocalOrder(order);
        }
    }
    
    // オーダー更新
    async updateOrder(orderId, updates) {
        const updatedData = {
            ...updates,
            updated_at: new Date().toISOString(),
            updated_by: authManager?.getUser()?.id || 'anonymous'
        };
        
        if (this.isOnline) {
            try {
                const { data, error } = await supabase
                    .from(this.tableName)
                    .update(updatedData)
                    .eq('id', orderId)
                    .select()
                    .single();
                
                if (error) {
                    console.error('Error updating order:', error);
                    return this.updateLocalOrder(orderId, updatedData);
                }
                
                // LocalStorageも更新
                this.updateLocalStorage(data);
                return data;
            } catch (error) {
                console.error('Database error:', error);
                return this.updateLocalOrder(orderId, updatedData);
            }
        } else {
            return this.updateLocalOrder(orderId, updatedData);
        }
    }
    
    // オーダー削除（論理削除）
    async deleteOrder(orderId) {
        return this.updateOrder(orderId, { deleted: true });
    }
    
    // リアルタイム同期の設定
    subscribeToChanges(callback) {
        if (this.isOnline) {
            const subscription = supabase
                .channel('orders_channel')
                .on('postgres_changes', 
                    { 
                        event: '*', 
                        schema: 'public', 
                        table: this.tableName 
                    },
                    (payload) => {
                        console.log('Database change:', payload);
                        callback(payload);
                    }
                )
                .subscribe();
            
            return subscription;
        }
        return null;
    }
    
    // ========== LocalStorage用のヘルパーメソッド ==========
    
    getLocalOrders() {
        const stored = localStorage.getItem('orderSystem_orders');
        if (stored) {
            try {
                return JSON.parse(stored);
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
        return order;
    }
    
    updateLocalOrder(orderId, updates) {
        const orders = this.getLocalOrders();
        const index = orders.findIndex(o => o.id === orderId);
        if (index !== -1) {
            orders[index] = { ...orders[index], ...updates };
            localStorage.setItem('orderSystem_orders', JSON.stringify(orders));
            return orders[index];
        }
        return null;
    }
    
    saveToLocalStorage(data) {
        localStorage.setItem('orderSystem_orders', JSON.stringify(data));
    }
    
    updateLocalStorage(updatedOrder) {
        const orders = this.getLocalOrders();
        const index = orders.findIndex(o => o.id === updatedOrder.id);
        if (index !== -1) {
            orders[index] = updatedOrder;
        } else {
            orders.unshift(updatedOrder);
        }
        this.saveToLocalStorage(orders);
    }
    
    // ID生成
    generateId() {
        if (this.isOnline) {
            // Supabaseの場合はUUIDを使用（サーバー側で自動生成も可能）
            return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();
        } else {
            // オフラインの場合はタイムスタンプベース
            return Date.now().toString();
        }
    }
    
    // データ同期（オフライン→オンライン）
    async syncOfflineData() {
        if (!this.isOnline) {
            console.log('Cannot sync: Not connected to Supabase');
            return { success: false, message: 'オンライン接続が必要です' };
        }
        
        try {
            const localOrders = this.getLocalOrders();
            const onlineOrders = await this.getOrders();
            
            // オフラインで作成されたオーダーを検出
            const offlineCreated = localOrders.filter(local => 
                !onlineOrders.find(online => online.id === local.id)
            );
            
            if (offlineCreated.length > 0) {
                console.log(`Syncing ${offlineCreated.length} offline orders...`);
                
                for (const order of offlineCreated) {
                    await supabase.from(this.tableName).insert([order]);
                }
                
                return { 
                    success: true, 
                    message: `${offlineCreated.length}件のオーダーを同期しました` 
                };
            }
            
            return { success: true, message: '同期が完了しました（更新なし）' };
        } catch (error) {
            console.error('Sync error:', error);
            return { success: false, message: 'データ同期中にエラーが発生しました' };
        }
    }
}

// グローバルにデータベースマネージャーを初期化
const db = new DatabaseManager();