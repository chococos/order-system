// Firebase設定ファイル
// Firebaseプロジェクトの設定情報を入力してください

const FIREBASE_CONFIG = {
    // Firebase Console の Project Settings > General > Your apps から取得
    // https://console.firebase.google.com/ でプロジェクトを選択
    // 歯車アイコン → プロジェクトの設定 → 下にスクロール → SDK の設定と構成
    
    apiKey: "YOUR_API_KEY_HERE",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Firebase初期化の状態管理
let firebaseInitialized = false;
let firebaseApp = null;
let firebaseAuth = null;
let firebaseDb = null;

// Firebase初期化関数
async function initializeFirebase() {
    if (firebaseInitialized) {
        return { app: firebaseApp, auth: firebaseAuth, db: firebaseDb };
    }

    try {
        // Firebase SDKが読み込まれているか確認
        if (typeof firebase === 'undefined') {
            console.error('Firebase SDK が読み込まれていません');
            return null;
        }

        // 設定が完了しているか確認
        if (FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY_HERE') {
            console.warn('Firebase設定がまだ完了していません。FIREBASE_SETUP_GUIDE.md を参照してください。');
            return null;
        }

        console.log('Firebaseを初期化しています...');

        // Firebase初期化
        firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
        firebaseAuth = firebase.auth();
        firebaseDb = firebase.firestore();

        // 日本語化設定
        firebaseAuth.languageCode = 'ja';

        // オフライン永続化を有効化
        try {
            await firebaseDb.enablePersistence({ synchronizeTabs: true });
            console.log('Firestore オフライン永続化が有効になりました');
        } catch (err) {
            if (err.code === 'failed-precondition') {
                console.warn('複数のタブが開かれているため、永続化が有効になりませんでした');
            } else if (err.code === 'unimplemented') {
                console.warn('このブラウザは永続化をサポートしていません');
            }
        }

        firebaseInitialized = true;
        console.log('Firebase初期化完了✅');

        return { app: firebaseApp, auth: firebaseAuth, db: firebaseDb };
    } catch (error) {
        console.error('Firebase初期化エラー:', error);
        return null;
    }
}

// 認証状態の変更を監視
function onAuthStateChanged(callback) {
    if (!firebaseAuth) {
        console.error('Firebase Auth が初期化されていません');
        return () => {};
    }
    return firebaseAuth.onAuthStateChanged(callback);
}

// 現在のユーザーを取得
function getCurrentUser() {
    return firebaseAuth?.currentUser || null;
}

// Firebaseが使用可能か確認
function isFirebaseAvailable() {
    return firebaseInitialized && firebaseApp && firebaseAuth && firebaseDb;
}

// エクスポート（他のファイルから使用可能に）
if (typeof window !== 'undefined') {
    window.FIREBASE_CONFIG = FIREBASE_CONFIG;
    window.initializeFirebase = initializeFirebase;
    window.onAuthStateChanged = onAuthStateChanged;
    window.getCurrentUser = getCurrentUser;
    window.isFirebaseAvailable = isFirebaseAvailable;
}
