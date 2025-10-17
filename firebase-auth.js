// Firebase認証管理システム
// ユーザー登録、ログイン、ログアウトなどの認証機能を提供

class FirebaseAuthManager {
    constructor() {
        this.auth = null;
        this.currentUser = null;
        this.authStateListeners = [];
    }

    // 初期化
    async initialize() {
        const firebase = await initializeFirebase();
        if (!firebase) {
            console.error('Firebase初期化に失敗しました');
            return false;
        }

        this.auth = firebase.auth;

        // 認証状態の監視
        this.auth.onAuthStateChanged((user) => {
            this.currentUser = user;
            console.log('認証状態変更:', user ? `ログイン中 (${user.email})` : 'ログアウト');
            
            // すべてのリスナーに通知
            this.authStateListeners.forEach(callback => {
                try {
                    callback(user);
                } catch (error) {
                    console.error('認証状態リスナーエラー:', error);
                }
            });
        });

        return true;
    }

    // 認証状態リスナーを追加
    onAuthStateChanged(callback) {
        this.authStateListeners.push(callback);
        // 現在の状態を即座に通知
        if (this.currentUser !== null) {
            callback(this.currentUser);
        }
        // リスナー解除関数を返す
        return () => {
            const index = this.authStateListeners.indexOf(callback);
            if (index > -1) {
                this.authStateListeners.splice(index, 1);
            }
        };
    }

    // メール/パスワードでアカウント作成
    async signUp(email, password) {
        try {
            if (!this.auth) {
                throw new Error('Firebase認証が初期化されていません');
            }

            console.log('アカウント作成中:', email);
            const userCredential = await this.auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;

            console.log('アカウント作成成功:', user.uid);
            return {
                success: true,
                user: {
                    uid: user.uid,
                    email: user.email,
                    emailVerified: user.emailVerified
                }
            };
        } catch (error) {
            console.error('アカウント作成エラー:', error);
            return {
                success: false,
                error: this.getErrorMessage(error.code)
            };
        }
    }

    // メール/パスワードでログイン
    async signIn(email, password) {
        try {
            if (!this.auth) {
                throw new Error('Firebase認証が初期化されていません');
            }

            console.log('ログイン中:', email);
            const userCredential = await this.auth.signInWithEmailAndPassword(email, password);
            const user = userCredential.user;

            console.log('ログイン成功:', user.uid);
            return {
                success: true,
                user: {
                    uid: user.uid,
                    email: user.email,
                    emailVerified: user.emailVerified
                }
            };
        } catch (error) {
            console.error('ログインエラー:', error);
            return {
                success: false,
                error: this.getErrorMessage(error.code)
            };
        }
    }

    // 匿名ログイン
    async signInAnonymously() {
        try {
            if (!this.auth) {
                throw new Error('Firebase認証が初期化されていません');
            }

            console.log('匿名ログイン中...');
            const userCredential = await this.auth.signInAnonymously();
            const user = userCredential.user;

            console.log('匿名ログイン成功:', user.uid);
            return {
                success: true,
                user: {
                    uid: user.uid,
                    email: null,
                    isAnonymous: true
                }
            };
        } catch (error) {
            console.error('匿名ログインエラー:', error);
            return {
                success: false,
                error: this.getErrorMessage(error.code)
            };
        }
    }

    // ログアウト
    async signOut() {
        try {
            if (!this.auth) {
                throw new Error('Firebase認証が初期化されていません');
            }

            console.log('ログアウト中...');
            await this.auth.signOut();
            console.log('ログアウト成功');
            return { success: true };
        } catch (error) {
            console.error('ログアウトエラー:', error);
            return {
                success: false,
                error: this.getErrorMessage(error.code)
            };
        }
    }

    // パスワードリセットメール送信
    async sendPasswordResetEmail(email) {
        try {
            if (!this.auth) {
                throw new Error('Firebase認証が初期化されていません');
            }

            console.log('パスワードリセットメール送信中:', email);
            await this.auth.sendPasswordResetEmail(email);
            console.log('パスワードリセットメール送信成功');
            return { success: true };
        } catch (error) {
            console.error('パスワードリセットメール送信エラー:', error);
            return {
                success: false,
                error: this.getErrorMessage(error.code)
            };
        }
    }

    // メールアドレス確認メール送信
    async sendEmailVerification() {
        try {
            if (!this.auth || !this.auth.currentUser) {
                throw new Error('ログインしていません');
            }

            console.log('確認メール送信中...');
            await this.auth.currentUser.sendEmailVerification();
            console.log('確認メール送信成功');
            return { success: true };
        } catch (error) {
            console.error('確認メール送信エラー:', error);
            return {
                success: false,
                error: this.getErrorMessage(error.code)
            };
        }
    }

    // 現在のユーザーを取得
    getCurrentUser() {
        return this.currentUser;
    }

    // ログイン状態を確認
    isSignedIn() {
        return this.currentUser !== null;
    }

    // ユーザーIDを取得
    getUserId() {
        return this.currentUser?.uid || null;
    }

    // ユーザーメールを取得
    getUserEmail() {
        return this.currentUser?.email || null;
    }

    // エラーメッセージを日本語化
    getErrorMessage(errorCode) {
        const errorMessages = {
            'auth/invalid-email': 'メールアドレスの形式が正しくありません',
            'auth/user-disabled': 'このアカウントは無効化されています',
            'auth/user-not-found': 'メールアドレスまたはパスワードが間違っています',
            'auth/wrong-password': 'メールアドレスまたはパスワードが間違っています',
            'auth/email-already-in-use': 'このメールアドレスは既に使用されています',
            'auth/weak-password': 'パスワードは6文字以上で設定してください',
            'auth/network-request-failed': 'ネットワークエラーが発生しました',
            'auth/too-many-requests': 'リクエストが多すぎます。しばらく待ってから再試行してください',
            'auth/operation-not-allowed': 'この操作は許可されていません',
            'auth/requires-recent-login': 'この操作には再ログインが必要です',
            'auth/invalid-credential': '認証情報が無効です',
            'auth/credential-already-in-use': 'この認証情報は既に使用されています'
        };

        return errorMessages[errorCode] || `エラーが発生しました: ${errorCode}`;
    }
}

// グローバルインスタンス
let authManager = null;

// 初期化関数
async function initializeAuthManager() {
    if (authManager) {
        return authManager;
    }

    authManager = new FirebaseAuthManager();
    const initialized = await authManager.initialize();

    if (!initialized) {
        console.error('認証マネージャーの初期化に失敗しました');
        return null;
    }

    console.log('認証マネージャー初期化完了✅');
    return authManager;
}

// エクスポート
if (typeof window !== 'undefined') {
    window.FirebaseAuthManager = FirebaseAuthManager;
    window.initializeAuthManager = initializeAuthManager;
    window.getAuthManager = () => authManager;
}
