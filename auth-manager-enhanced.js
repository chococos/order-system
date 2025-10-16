// 拡張認証マネージャー（匿名ログイン対応）
class EnhancedAuthManager {
    constructor() {
        this.currentUser = null;
        this.isAnonymous = false;
        this.authMode = 'hybrid'; // 'anonymous', 'required', 'hybrid'
        this.init();
    }
    
    async init() {
        console.log('Enhanced Auth Manager: Initializing...');
        
        // 既存のセッションを確認
        const session = await this.checkSession();
        
        if (!session) {
            // セッションがない場合の処理
            if (this.authMode === 'anonymous' || this.authMode === 'hybrid') {
                // 匿名ログインを試みる
                await this.signInAnonymously();
            }
        }
    }
    
    // 匿名ログイン
    async signInAnonymously() {
        if (!supabase) {
            console.warn('Supabase not initialized, using local mode only');
            this.setupLocalOnlyMode();
            return;
        }
        
        try {
            console.log('Attempting anonymous sign-in...');
            
            // 匿名ユーザーとしてログイン
            const { data, error } = await supabase.auth.signInAnonymously();
            
            if (error) {
                console.error('Anonymous sign-in failed:', error);
                this.setupLocalOnlyMode();
            } else {
                console.log('Anonymous sign-in successful');
                this.currentUser = data.user;
                this.isAnonymous = true;
                
                // UIを更新
                this.updateAuthUI();
            }
        } catch (error) {
            console.error('Anonymous auth error:', error);
            this.setupLocalOnlyMode();
        }
    }
    
    // ローカルのみモードのセットアップ
    setupLocalOnlyMode() {
        console.log('Setting up local-only mode (no sync)');
        
        // ローカル専用のユーザーIDを生成
        const localUserId = localStorage.getItem('localUserId') || 'local_' + Date.now();
        localStorage.setItem('localUserId', localUserId);
        
        this.currentUser = {
            id: localUserId,
            email: 'local@device',
            isLocal: true
        };
        
        this.isAnonymous = false;
        
        // 同期を無効化
        if (typeof syncManager !== 'undefined') {
            syncManager.syncStatus.isOnline = false;
        }
        
        this.updateAuthUI();
    }
    
    // 既存セッションの確認
    async checkSession() {
        if (!supabase) return null;
        
        try {
            const { data: { session } } = await supabase.auth.getSession();
            
            if (session) {
                this.currentUser = session.user;
                this.isAnonymous = !session.user.email || session.user.email === '';
                this.updateAuthUI();
                return session;
            }
        } catch (error) {
            console.error('Session check error:', error);
        }
        
        return null;
    }
    
    // 通常のログイン
    async signInWithEmail(email, password) {
        if (!supabase) {
            alert('オンライン機能は利用できません');
            return { error: 'Supabase not initialized' };
        }
        
        try {
            // 匿名ユーザーのデータを保存
            const anonymousData = await this.saveAnonymousData();
            
            // メールでログイン
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });
            
            if (!error && data.user) {
                // 匿名データを新しいユーザーに移行
                await this.migrateAnonymousData(anonymousData, data.user.id);
                
                this.currentUser = data.user;
                this.isAnonymous = false;
                this.updateAuthUI();
            }
            
            return { data, error };
        } catch (error) {
            console.error('Sign in error:', error);
            return { error };
        }
    }
    
    // 匿名データの保存
    async saveAnonymousData() {
        if (!this.isAnonymous) return null;
        
        const orders = JSON.parse(localStorage.getItem('orderSystem_orders') || '[]');
        return {
            orders,
            userId: this.currentUser?.id
        };
    }
    
    // 匿名データの移行
    async migrateAnonymousData(anonymousData, newUserId) {
        if (!anonymousData || !anonymousData.orders.length) return;
        
        console.log('Migrating anonymous data to user account...');
        
        // ローカルデータのユーザーIDを更新
        const orders = anonymousData.orders.map(order => ({
            ...order,
            created_by: newUserId,
            updated_by: newUserId
        }));
        
        // データベースに保存
        if (supabase && enhancedDb) {
            for (const order of orders) {
                await enhancedDb.createOrder(order);
            }
        }
        
        console.log('Migration complete');
    }
    
    // UIの更新
    updateAuthUI() {
        const authStatusEl = document.getElementById('auth-status');
        if (!authStatusEl) return;
        
        if (this.currentUser) {
            if (this.currentUser.isLocal) {
                authStatusEl.textContent = '📱 ローカルモード（同期なし）';
                authStatusEl.style.color = '#FF9800';
            } else if (this.isAnonymous) {
                authStatusEl.textContent = '👤 ゲストモード（制限付き同期）';
                authStatusEl.style.color = '#2196F3';
            } else {
                authStatusEl.textContent = `✅ ${this.currentUser.email}`;
                authStatusEl.style.color = '#4CAF50';
            }
        } else {
            authStatusEl.textContent = '未ログイン';
            authStatusEl.style.color = '#666';
        }
        
        // ログインボタンの表示/非表示
        const loginPrompt = document.getElementById('login-prompt');
        if (loginPrompt) {
            loginPrompt.style.display = this.isAnonymous || this.currentUser?.isLocal ? 'block' : 'none';
        }
    }
    
    // アップグレードプロンプトを表示
    showUpgradePrompt() {
        if (!this.isAnonymous && !this.currentUser?.isLocal) return;
        
        const message = this.currentUser?.isLocal 
            ? 'アカウントを作成すると、他のデバイスでもデータを同期できます。'
            : 'アカウントを作成すると、データが永続的に保存され、全機能が利用できます。';
        
        if (confirm(message + '\n\nアカウントを作成しますか？')) {
            window.location.href = '/auth-production.html';
        }
    }
    
    // ログアウト
    async signOut() {
        if (!supabase) {
            localStorage.clear();
            window.location.reload();
            return;
        }
        
        try {
            await supabase.auth.signOut();
            this.currentUser = null;
            this.isAnonymous = false;
            
            // 匿名モードに戻る
            if (this.authMode === 'hybrid') {
                await this.signInAnonymously();
            } else {
                window.location.href = '/auth-production.html';
            }
        } catch (error) {
            console.error('Sign out error:', error);
        }
    }
    
    // 現在のユーザーを取得
    getUser() {
        return this.currentUser;
    }
    
    // 同期可能かチェック
    canSync() {
        return this.currentUser && !this.currentUser.isLocal && supabase;
    }
}

// グローバルに初期化
const enhancedAuthManager = new EnhancedAuthManager();