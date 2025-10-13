// 認証管理モジュール
class AuthManager {
    constructor() {
        this.currentUser = null;
        this.isOnlineMode = false;
        this.init();
    }
    
    async init() {
        console.log('AuthManager initializing...');
        
        // Supabaseの初期化を非同期で待つ
        const client = await this.getSupabaseClientAsync();
        
        if (client) {
            this.isOnlineMode = true;
            console.log('Running in online mode with Supabase');
            
            try {
                // Supabaseクライアントが完全に初期化されているか確認
                if (client.auth && typeof client.auth.getSession === 'function') {
                    // セッションチェック
                    const { data: { session } } = await client.auth.getSession();
                    if (session) {
                        this.currentUser = session.user;
                        this.onAuthStateChange(session.user);
                    }
                    
                    // 認証状態の変更を監視
                    client.auth.onAuthStateChange((event, session) => {
                        console.log('Auth state changed:', event);
                        this.currentUser = session?.user || null;
                        this.onAuthStateChange(this.currentUser);
                    });
                } else {
                    console.error('Supabase client auth object not properly initialized');
                    this.isOnlineMode = false;
                    this.checkOfflineAuth();
                }
            } catch (error) {
                console.error('Supabase initialization error:', error);
                this.isOnlineMode = false;
                this.checkOfflineAuth();
            }
        } else {
            console.log('Running in offline mode (LocalStorage only)');
            this.checkOfflineAuth();
        }
    }
    

    
    // Supabaseクライアントを非同期で取得する
    async getSupabaseClientAsync() {
        // 既に初期化済みの場合は即座に返す
        if (typeof supabase !== 'undefined' && supabase) {
            return supabase;
        }
        
        // supabase-config.jsのensureSupabaseInitialized関数を使用
        if (typeof ensureSupabaseInitialized === 'function') {
            try {
                const client = await ensureSupabaseInitialized();
                return client;
            } catch (error) {
                console.error('Error getting Supabase client:', error);
                return null;
            }
        }
        
        console.error('Supabase initialization functions not available');
        return null;
    }

    // 同期的なSupabaseクライアント取得（後方互換性のため）
    getSupabaseClient() {
        // グローバルのsupabaseを確認
        if (typeof supabase !== 'undefined' && supabase) {
            return supabase;
        }
        
        console.warn('Supabase client not immediately available, use getSupabaseClientAsync() instead');
        return null;
    }
    
    // オフラインモードでの認証チェック（LocalStorageベース）
    checkOfflineAuth() {
        const savedUser = localStorage.getItem('offlineUser');
        if (savedUser) {
            this.currentUser = JSON.parse(savedUser);
            this.onAuthStateChange(this.currentUser);
        }
    }
    
    // ログイン処理
    async login(email, password) {
        console.log('Login attempt for:', email);
        
        // まず現在のオンラインモード状態を再確認
        if (!this.isOnlineMode) {
            const client = await this.getSupabaseClientAsync();
            if (client) {
                this.isOnlineMode = true;
                console.log('Online mode detected during login');
            }
        }
        
        if (this.isOnlineMode) {
            try {
                // Supabaseクライアントの確実な取得
                const client = await this.getSupabaseClientAsync();
                if (!client) {
                    throw new Error('Supabase client not available');
                }
                
                console.log('Attempting Supabase login...');
                const { data, error } = await client.auth.signInWithPassword({
                    email: email,
                    password: password
                });
                
                if (error) {
                    console.error('Supabase login error:', error);
                    throw error;
                }
                
                console.log('Supabase login successful');
                this.currentUser = data.user;
                return { success: true, user: data.user };
            } catch (error) {
                console.error('Login error:', error);
                return { success: false, error: error.message };
            }
        } else {
            // オフラインモード（デモ用）
            if (email && password === 'demo123') {
                const user = {
                    id: 'offline-user',
                    email: email,
                    name: email.split('@')[0],
                    role: 'staff'
                };
                localStorage.setItem('offlineUser', JSON.stringify(user));
                this.currentUser = user;
                this.onAuthStateChange(user);
                return { success: true, user: user };
            } else {
                return { success: false, error: 'オフラインモードでは、パスワードに "demo123" を入力してください' };
            }
        }
    }
    
    // サインアップ処理
    async signup(email, password, metadata = {}) {
        console.log('Signup attempt for:', email);
        
        // オンラインモード状態を再確認
        if (!this.isOnlineMode) {
            const client = await this.getSupabaseClientAsync();
            if (client) {
                this.isOnlineMode = true;
                console.log('Online mode detected during signup');
            }
        }
        
        if (!this.isOnlineMode) {
            return { 
                success: false, 
                error: 'サインアップにはSupabaseの設定が必要です。管理者にお問い合わせください。' 
            };
        }
        
        try {
            const client = await this.getSupabaseClientAsync();
            if (!client) {
                throw new Error('Supabase client not available');
            }
            
            console.log('Attempting Supabase signup...');
            const { data, error } = await client.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: metadata // ユーザーメタデータ（名前、役職など）
                }
            });
            
            if (error) {
                console.error('Supabase signup error:', error);
                throw error;
            }
            
            console.log('Supabase signup successful');
            return { 
                success: true, 
                user: data.user,
                message: 'メールアドレスに確認メールを送信しました。メールを確認してアカウントを有効化してください。'
            };
        } catch (error) {
            console.error('Signup error:', error);
            return { success: false, error: error.message };
        }
    }
    
    // ログアウト処理
    async logout() {
        if (this.isOnlineMode) {
            try {
                const { error } = await supabase.auth.signOut();
                if (error) throw error;
            } catch (error) {
                console.error('Logout error:', error);
            }
        } else {
            localStorage.removeItem('offlineUser');
        }
        
        this.currentUser = null;
        this.onAuthStateChange(null);
        window.location.href = '/'; // ログインページにリダイレクト
    }
    
    // 認証状態変更時の処理
    onAuthStateChange(user) {
        console.log('Auth state change:', user ? 'User logged in' : 'User logged out', user);
        
        const authStatus = document.getElementById('auth-status');
        const loginSection = document.getElementById('login-section');
        const mainApp = document.getElementById('app');
        
        if (user) {
            // ログイン済み
            console.log('Setting UI for authenticated user');
            if (loginSection) {
                loginSection.style.display = 'none';
                console.log('Login section hidden');
            }
            if (mainApp) {
                mainApp.style.display = 'block';
                console.log('Main app displayed');
            }
            
            // ユーザー情報表示（モバイル・デスクトップ両方）
            const authStatusDesktop = document.querySelector('.auth-status-text-desktop');
            const userName = user.email || user.name;
            
            if (authStatus) {
                authStatus.textContent = userName;
            }
            
            if (authStatusDesktop) {
                authStatusDesktop.innerHTML = `
                    <div class="flex items-center gap-2 text-sm">
                        <i class="fas fa-user-circle"></i>
                        <span>${userName}</span>
                        ${this.isOnlineMode ? '<span class="text-green-600">●</span>' : '<span class="text-gray-400">○</span>'}
                    </div>
                `;
            }
            
            // アプリケーションの初期化
            if (typeof app !== 'undefined' && app.initWithUser) {
                console.log('Initializing app with user');
                app.initWithUser(user);
            }
        } else {
            // 未ログイン
            console.log('Setting UI for unauthenticated state');
            if (loginSection) {
                loginSection.style.display = 'block';
                console.log('Login section displayed');
            }
            if (mainApp) {
                mainApp.style.display = 'none';
                console.log('Main app hidden');
            }
        }
    }
    
    // 現在のユーザー取得
    getUser() {
        return this.currentUser;
    }
    
    // 認証が必要かチェック
    requireAuth() {
        if (!this.currentUser) {
            window.location.href = '/';
            return false;
        }
        return true;
    }
    
    // パスワードリセット
    async resetPassword(email) {
        if (!this.isOnlineMode) {
            return { 
                success: false, 
                error: 'パスワードリセットにはSupabaseの設定が必要です。' 
            };
        }
        
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/reset-password',
            });
            
            if (error) throw error;
            
            return { 
                success: true,
                message: 'パスワードリセット用のメールを送信しました。メールをご確認ください。'
            };
        } catch (error) {
            console.error('Password reset error:', error);
            return { success: false, error: error.message };
        }
    }
}

// 認証マネージャーを遅延初期化（グローバルな単一インスタンス）
let authManager = null;
let authInitializationInProgress = false;
let authInitializationPromise = null;

// DOM読み込み後に認証マネージャーを初期化
function initAuthManager() {
    if (authManager) {
        return authManager;
    }
    
    if (authInitializationInProgress) {
        return authInitializationPromise;
    }
    
    authInitializationInProgress = true;
    console.log('Creating AuthManager instance...');
    
    authInitializationPromise = new Promise(async (resolve) => {
        authManager = new AuthManager();
        // AuthManagerの初期化完了を待つ
        await new Promise(resolveInit => {
            // AuthManagerのinit()完了を待つ簡単な方法
            setTimeout(() => {
                authInitializationInProgress = false;
                resolve(authManager);
                resolveInit();
            }, 500);
        });
    });
    
    return authInitializationPromise;
}

// DOMContentLoadedで初期化、または既に読み込み済みなら即座に初期化
if (typeof window !== 'undefined') {
    // 既に初期化済みでなければ初期化
    if (!authManager && !authInitializationInProgress) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(initAuthManager, 300); // Supabaseの初期化を待つ
            });
        } else {
            setTimeout(initAuthManager, 300);
        }
    }
}

// グローバルアクセス用の関数（非同期対応）
async function getAuthManager() {
    if (authManager) {
        return authManager;
    }
    
    if (authInitializationInProgress) {
        return await authInitializationPromise;
    }
    
    return await initAuthManager();
}

// 同期的なアクセス（既に初期化済みの場合のみ）
function getAuthManagerSync() {
    return authManager;
}