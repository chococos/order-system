// Firebase Adapter - app.jsとの互換性レイヤー
// 既存のSupabaseコードとの互換性を保つために、同じインターフェースを提供

class FirebaseAdapter {
    constructor() {
        this.isOnline = false;
        this.authManager = null;
        this.dbManager = null;
        this.initialized = false;
    }

    // 初期化
    async initialize() {
        if (this.initialized) {
            return true;
        }

        try {
            console.log('FirebaseAdapter: Initializing...');
            
            // Firebase初期化
            await initializeFirebase();
            this.authManager = await initializeAuthManager();
            this.dbManager = await initializeDatabaseManager();

            if (this.authManager && this.dbManager) {
                this.isOnline = true;
                this.initialized = true;
                console.log('FirebaseAdapter: Initialized successfully ✅');
                return true;
            }

            console.warn('FirebaseAdapter: Initialization incomplete, falling back to offline mode');
            return false;
        } catch (error) {
            console.error('FirebaseAdapter: Initialization failed:', error);
            return false;
        }
    }

    // ログイン確認
    isAuthenticated() {
        return this.authManager?.isSignedIn() || false;
    }

    // 現在のユーザーを取得
    getUser() {
        const user = this.authManager?.getCurrentUser();
        if (!user) return null;

        // app.jsが期待する形式に変換
        return {
            id: user.uid,
            uid: user.uid,
            email: user.email,
            emailVerified: user.emailVerified,
            isAnonymous: user.isAnonymous || false
        };
    }

    // === オーダー操作（app.jsとの互換性） ===

    // オーダー一覧取得
    async getOrders(options = {}) {
        if (!this.isOnline || !this.dbManager) {
            console.warn('FirebaseAdapter: Offline mode, returning empty array');
            return [];
        }

        try {
            console.log('FirebaseAdapter: Getting orders...');
            const result = await this.dbManager.getOrders(options);
            
            if (!result.success) {
                console.error('FirebaseAdapter: Failed to get orders:', result.error);
                return [];
            }

            // app.jsが期待する形式に変換
            const orders = result.data.map(order => this.convertOrderFormat(order));
            console.log(`FirebaseAdapter: Retrieved ${orders.length} orders`);
            return orders;
        } catch (error) {
            console.error('FirebaseAdapter: Error getting orders:', error);
            return [];
        }
    }

    // オーダー作成
    async createOrder(orderData) {
        if (!this.isOnline || !this.dbManager) {
            console.warn('FirebaseAdapter: Offline mode, cannot create order');
            return null;
        }

        try {
            console.log('FirebaseAdapter: Creating order...');
            const result = await this.dbManager.createOrder(orderData);
            
            if (!result.success) {
                console.error('FirebaseAdapter: Failed to create order:', result.error);
                return null;
            }

            console.log('FirebaseAdapter: Order created:', result.id);
            
            // app.jsが期待する形式で返す
            return {
                id: result.id,
                ...orderData,
                created_at: new Date(),
                updated_at: new Date()
            };
        } catch (error) {
            console.error('FirebaseAdapter: Error creating order:', error);
            return null;
        }
    }

    // オーダー更新
    async updateOrder(orderId, orderData) {
        if (!this.isOnline || !this.dbManager) {
            console.warn('FirebaseAdapter: Offline mode, cannot update order');
            return false;
        }

        try {
            console.log('FirebaseAdapter: Updating order:', orderId);
            const result = await this.dbManager.updateOrder(orderId, orderData);
            
            if (!result.success) {
                console.error('FirebaseAdapter: Failed to update order:', result.error);
                return false;
            }

            console.log('FirebaseAdapter: Order updated:', orderId);
            return true;
        } catch (error) {
            console.error('FirebaseAdapter: Error updating order:', error);
            return false;
        }
    }

    // オーダー削除
    async deleteOrder(orderId) {
        if (!this.isOnline || !this.dbManager) {
            console.warn('FirebaseAdapter: Offline mode, cannot delete order');
            return false;
        }

        try {
            console.log('FirebaseAdapter: Deleting order:', orderId);
            const result = await this.dbManager.deleteOrder(orderId);
            
            if (!result.success) {
                console.error('FirebaseAdapter: Failed to delete order:', result.error);
                return false;
            }

            console.log('FirebaseAdapter: Order deleted:', orderId);
            return true;
        } catch (error) {
            console.error('FirebaseAdapter: Error deleting order:', error);
            return false;
        }
    }

    // === リアルタイム同期 ===

    // オーダー変更を監視
    subscribeToOrders(callback) {
        if (!this.isOnline || !this.dbManager) {
            console.warn('FirebaseAdapter: Offline mode, cannot subscribe');
            return () => {};
        }

        try {
            console.log('FirebaseAdapter: Subscribing to orders...');
            
            return this.dbManager.subscribeToOrders((orders) => {
                if (!orders) return;
                
                // app.jsが期待する形式に変換
                const convertedOrders = orders.map(order => this.convertOrderFormat(order));
                callback(convertedOrders);
            });
        } catch (error) {
            console.error('FirebaseAdapter: Error subscribing:', error);
            return () => {};
        }
    }

    // === ヘルパーメソッド ===

    // Firebase形式からapp.js形式に変換
    convertOrderFormat(firebaseOrder) {
        return {
            id: firebaseOrder.id,
            customer_name: firebaseOrder.customer_name || '',
            delivery_date: firebaseOrder.delivery_date || '',
            delivery_location: firebaseOrder.delivery_location || '',
            product_name: firebaseOrder.product_name || '',
            quantity: firebaseOrder.quantity || 1,
            notes: firebaseOrder.notes || '',
            status: firebaseOrder.status || 'pending',
            created_at: firebaseOrder.created_at instanceof Date 
                ? firebaseOrder.created_at 
                : new Date(firebaseOrder.created_at),
            updated_at: firebaseOrder.updated_at instanceof Date 
                ? firebaseOrder.updated_at 
                : new Date(firebaseOrder.updated_at),
            // その他のフィールドもそのままコピー
            ...firebaseOrder
        };
    }
}

// グローバルインスタンスを作成
let db = null;

// 初期化関数
async function initializeFirebaseAdapter() {
    if (db) {
        return db;
    }

    db = new FirebaseAdapter();
    await db.initialize();
    
    console.log('FirebaseAdapter: Global instance created', db.isOnline ? '(Online)' : '(Offline)');
    return db;
}

// DOMロード後に自動初期化
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', async () => {
        console.log('FirebaseAdapter: Auto-initializing...');
        await initializeFirebaseAdapter();
    });
    
    // グローバルにエクスポート
    window.initializeFirebaseAdapter = initializeFirebaseAdapter;
    window.FirebaseAdapter = FirebaseAdapter;
}
