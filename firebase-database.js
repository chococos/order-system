// Firebase Firestore データベース管理システム
// オーダーデータのCRUD操作とリアルタイム同期を提供

class FirebaseDatabaseManager {
    constructor() {
        this.db = null;
        this.auth = null;
        this.listeners = new Map(); // リアルタイムリスナーの管理
    }

    // 初期化
    async initialize() {
        const firebase = await initializeFirebase();
        if (!firebase) {
            console.error('Firebase初期化に失敗しました');
            return false;
        }

        this.db = firebase.db;
        this.auth = firebase.auth;

        console.log('データベースマネージャー初期化完了✅');
        return true;
    }

    // === オーダー操作 ===

    // オーダー作成
    async createOrder(orderData) {
        try {
            const user = this.auth.currentUser;
            if (!user) {
                throw new Error('ログインしていません');
            }

            // user_idを自動追加
            const dataWithUser = {
                ...orderData,
                user_id: user.uid,
                created_at: firebase.firestore.FieldValue.serverTimestamp(),
                updated_at: firebase.firestore.FieldValue.serverTimestamp()
            };

            console.log('オーダー作成中:', dataWithUser);
            const docRef = await this.db.collection('orders').add(dataWithUser);
            
            console.log('オーダー作成成功:', docRef.id);
            return {
                success: true,
                id: docRef.id,
                data: dataWithUser
            };
        } catch (error) {
            console.error('オーダー作成エラー:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // オーダー取得（単一）
    async getOrder(orderId) {
        try {
            const user = this.auth.currentUser;
            if (!user) {
                throw new Error('ログインしていません');
            }

            console.log('オーダー取得中:', orderId);
            const doc = await this.db.collection('orders').doc(orderId).get();

            if (!doc.exists) {
                throw new Error('オーダーが見つかりません');
            }

            const data = doc.data();
            
            // 権限チェック
            if (data.user_id !== user.uid) {
                throw new Error('アクセス権限がありません');
            }

            console.log('オーダー取得成功:', orderId);
            return {
                success: true,
                data: {
                    id: doc.id,
                    ...data,
                    created_at: data.created_at?.toDate(),
                    updated_at: data.updated_at?.toDate()
                }
            };
        } catch (error) {
            console.error('オーダー取得エラー:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // オーダー一覧取得
    async getOrders(options = {}) {
        try {
            const user = this.auth.currentUser;
            if (!user) {
                throw new Error('ログインしていません');
            }

            console.log('オーダー一覧取得中...');
            
            // クエリ構築
            let query = this.db.collection('orders')
                .where('user_id', '==', user.uid);

            // ソート
            const orderBy = options.orderBy || 'created_at';
            const direction = options.direction || 'desc';
            query = query.orderBy(orderBy, direction);

            // 制限
            if (options.limit) {
                query = query.limit(options.limit);
            }

            const snapshot = await query.get();
            
            const orders = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                orders.push({
                    id: doc.id,
                    ...data,
                    created_at: data.created_at?.toDate(),
                    updated_at: data.updated_at?.toDate()
                });
            });

            console.log(`オーダー一覧取得成功: ${orders.length}件`);
            return {
                success: true,
                data: orders,
                count: orders.length
            };
        } catch (error) {
            console.error('オーダー一覧取得エラー:', error);
            return {
                success: false,
                error: error.message,
                data: []
            };
        }
    }

    // オーダー更新
    async updateOrder(orderId, updateData) {
        try {
            const user = this.auth.currentUser;
            if (!user) {
                throw new Error('ログインしていません');
            }

            // 権限チェック
            const existingDoc = await this.db.collection('orders').doc(orderId).get();
            if (!existingDoc.exists) {
                throw new Error('オーダーが見つかりません');
            }
            if (existingDoc.data().user_id !== user.uid) {
                throw new Error('アクセス権限がありません');
            }

            // 更新データに updated_at を追加
            const dataToUpdate = {
                ...updateData,
                updated_at: firebase.firestore.FieldValue.serverTimestamp()
            };

            // user_id の上書きを防ぐ
            delete dataToUpdate.user_id;
            delete dataToUpdate.created_at;

            console.log('オーダー更新中:', orderId);
            await this.db.collection('orders').doc(orderId).update(dataToUpdate);
            
            console.log('オーダー更新成功:', orderId);
            return {
                success: true,
                id: orderId
            };
        } catch (error) {
            console.error('オーダー更新エラー:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // オーダー削除
    async deleteOrder(orderId) {
        try {
            const user = this.auth.currentUser;
            if (!user) {
                throw new Error('ログインしていません');
            }

            // 権限チェック
            const existingDoc = await this.db.collection('orders').doc(orderId).get();
            if (!existingDoc.exists) {
                throw new Error('オーダーが見つかりません');
            }
            if (existingDoc.data().user_id !== user.uid) {
                throw new Error('アクセス権限がありません');
            }

            console.log('オーダー削除中:', orderId);
            await this.db.collection('orders').doc(orderId).delete();
            
            console.log('オーダー削除成功:', orderId);
            return {
                success: true,
                id: orderId
            };
        } catch (error) {
            console.error('オーダー削除エラー:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // === リアルタイム同期 ===

    // オーダーのリアルタイム監視を開始
    subscribeToOrders(callback) {
        try {
            const user = this.auth.currentUser;
            if (!user) {
                throw new Error('ログインしていません');
            }

            console.log('リアルタイム監視開始...');

            const unsubscribe = this.db.collection('orders')
                .where('user_id', '==', user.uid)
                .orderBy('created_at', 'desc')
                .onSnapshot((snapshot) => {
                    const orders = [];
                    snapshot.forEach((doc) => {
                        const data = doc.data();
                        orders.push({
                            id: doc.id,
                            ...data,
                            created_at: data.created_at?.toDate(),
                            updated_at: data.updated_at?.toDate()
                        });
                    });

                    console.log(`リアルタイム更新: ${orders.length}件のオーダー`);
                    callback(orders);
                }, (error) => {
                    console.error('リアルタイム監視エラー:', error);
                    callback(null, error);
                });

            // リスナーを保存
            const listenerId = `orders_${user.uid}`;
            this.listeners.set(listenerId, unsubscribe);

            // 解除関数を返す
            return () => {
                console.log('リアルタイム監視停止');
                unsubscribe();
                this.listeners.delete(listenerId);
            };
        } catch (error) {
            console.error('リアルタイム監視開始エラー:', error);
            return () => {};
        }
    }

    // 特定オーダーのリアルタイム監視
    subscribeToOrder(orderId, callback) {
        try {
            const user = this.auth.currentUser;
            if (!user) {
                throw new Error('ログインしていません');
            }

            console.log('オーダー監視開始:', orderId);

            const unsubscribe = this.db.collection('orders')
                .doc(orderId)
                .onSnapshot((doc) => {
                    if (!doc.exists) {
                        callback(null, new Error('オーダーが見つかりません'));
                        return;
                    }

                    const data = doc.data();
                    
                    // 権限チェック
                    if (data.user_id !== user.uid) {
                        callback(null, new Error('アクセス権限がありません'));
                        return;
                    }

                    console.log('オーダー更新:', orderId);
                    callback({
                        id: doc.id,
                        ...data,
                        created_at: data.created_at?.toDate(),
                        updated_at: data.updated_at?.toDate()
                    });
                }, (error) => {
                    console.error('オーダー監視エラー:', error);
                    callback(null, error);
                });

            // リスナーを保存
            const listenerId = `order_${orderId}`;
            this.listeners.set(listenerId, unsubscribe);

            // 解除関数を返す
            return () => {
                console.log('オーダー監視停止:', orderId);
                unsubscribe();
                this.listeners.delete(listenerId);
            };
        } catch (error) {
            console.error('オーダー監視開始エラー:', error);
            return () => {};
        }
    }

    // すべてのリスナーを解除
    unsubscribeAll() {
        console.log(`全リスナー解除: ${this.listeners.size}個`);
        this.listeners.forEach((unsubscribe) => {
            unsubscribe();
        });
        this.listeners.clear();
    }

    // === 検索・フィルタリング ===

    // オーダー検索
    async searchOrders(searchText) {
        try {
            const user = this.auth.currentUser;
            if (!user) {
                throw new Error('ログインしていません');
            }

            console.log('オーダー検索中:', searchText);

            // すべてのオーダーを取得してクライアント側でフィルタ
            const result = await this.getOrders();
            if (!result.success) {
                return result;
            }

            const searchLower = searchText.toLowerCase();
            const filtered = result.data.filter(order => {
                return (
                    order.customer_name?.toLowerCase().includes(searchLower) ||
                    order.product_name?.toLowerCase().includes(searchLower) ||
                    order.delivery_location?.toLowerCase().includes(searchLower) ||
                    order.notes?.toLowerCase().includes(searchLower)
                );
            });

            console.log(`検索結果: ${filtered.length}件`);
            return {
                success: true,
                data: filtered,
                count: filtered.length
            };
        } catch (error) {
            console.error('オーダー検索エラー:', error);
            return {
                success: false,
                error: error.message,
                data: []
            };
        }
    }
}

// グローバルインスタンス
let dbManager = null;

// 初期化関数
async function initializeDatabaseManager() {
    if (dbManager) {
        return dbManager;
    }

    dbManager = new FirebaseDatabaseManager();
    const initialized = await dbManager.initialize();

    if (!initialized) {
        console.error('データベースマネージャーの初期化に失敗しました');
        return null;
    }

    console.log('データベースマネージャー初期化完了✅');
    return dbManager;
}

// エクスポート
if (typeof window !== 'undefined') {
    window.FirebaseDatabaseManager = FirebaseDatabaseManager;
    window.initializeDatabaseManager = initializeDatabaseManager;
    window.getDatabaseManager = () => dbManager;
}
