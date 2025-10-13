// Supabase設定ファイル
// SupabaseプロジェクトのURLとAnon Keyを設定してください

const SUPABASE_CONFIG = {
    // Supabaseプロジェクトの設定
    // これらの値は、Supabaseダッシュボードの Settings > API から取得できます
    url: 'https://jbwbrxjiujihsnymsipw.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impid2JyeGppdWppaHNueW1zaXB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0NzUzOTYsImV4cCI6MjA3NTA1MTM5Nn0.Fxg7t4b9IAE2_eW71ypX1wtVnWLdnAV_mjT8jbJy3rM',
    
    // オプション設定
    options: {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false
        }
    }
};

// Supabase初期化完了の状態を管理
let supabaseInitialized = false;
let initializationPromise = null;

// Supabaseクライアントの初期化（設定が完了している場合のみ）
let supabase = null;

// 同期的な初期化関数（後方互換性のため残す）
function initializeSupabase() {
    if (supabaseInitialized && supabase) {
        return true;
    }
    
    if (SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey) {
        if (typeof window !== 'undefined' && window.supabase && window.supabase.createClient) {
            try {
                console.log('Creating Supabase client (sync) with URL:', SUPABASE_CONFIG.url);
                supabase = window.supabase.createClient(
                    SUPABASE_CONFIG.url,
                    SUPABASE_CONFIG.anonKey,
                    SUPABASE_CONFIG.options
                );
                
                // クライアントが正しく初期化されたか検証
                if (supabase && supabase.auth && typeof supabase.auth.getSession === 'function') {
                    supabaseInitialized = true;
                    console.log('Supabase client initialized and validated successfully (sync)');
                    return true;
                } else {
                    console.error('Supabase client created but auth methods not available (sync)');
                    supabase = null;
                    return false;
                }
            } catch (error) {
                console.error('Error initializing Supabase (sync):', error);
                supabase = null;
            }
        } else {
            console.warn('Supabase SDK not loaded (sync). Window.supabase:', typeof window.supabase);
        }
    } else {
        console.info('Supabase configuration not set (sync). Running in offline mode.');
    }
    return false;
}

// 遅延初期化関数
function ensureSupabaseInitialized() {
    if (!supabase) {
        initializeSupabase();
    }
    return supabase;
}

// 非同期初期化関数
async function asyncInitializeSupabase() {
    if (supabaseInitialized) {
        return supabase;
    }

    if (initializationPromise) {
        return initializationPromise;
    }

    initializationPromise = new Promise((resolve) => {
        const attemptInit = () => {
            if (SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey) {
                if (typeof window !== 'undefined' && window.supabase && window.supabase.createClient) {
                    try {
                        console.log('Creating Supabase client with URL:', SUPABASE_CONFIG.url);
                        console.log('Supabase SDK version:', window.supabase);
                        
                        supabase = window.supabase.createClient(
                            SUPABASE_CONFIG.url,
                            SUPABASE_CONFIG.anonKey,
                            SUPABASE_CONFIG.options
                        );
                        
                        console.log('Supabase client created:', supabase);
                        console.log('Supabase client auth object:', supabase?.auth);
                        console.log('Supabase auth methods:', supabase?.auth ? Object.keys(supabase.auth) : 'none');
                        
                        // クライアントが正しく初期化されたか検証
                        if (supabase && supabase.auth && typeof supabase.auth.getSession === 'function') {
                            supabaseInitialized = true;
                            console.log('Supabase client initialized and validated successfully');
                            resolve(supabase);
                        } else {
                            console.error('Supabase client created but auth methods not available');
                            console.error('supabase exists:', !!supabase);
                            console.error('supabase.auth exists:', !!(supabase?.auth));
                            console.error('getSession method exists:', typeof supabase?.auth?.getSession);
                            supabase = null;
                            resolve(null);
                        }
                        return;
                    } catch (error) {
                        console.error('Error initializing Supabase:', error);
                        supabase = null;
                    }
                } else {
                    console.warn('Supabase SDK not available. Window.supabase:', typeof window.supabase);
                    console.warn('createClient method:', typeof window.supabase?.createClient);
                }
            } else {
                console.warn('Supabase configuration incomplete. URL:', !!SUPABASE_CONFIG.url, 'Key:', !!SUPABASE_CONFIG.anonKey);
            }
            
            // 初期化に失敗した場合はnullを返す
            console.warn('Supabase client initialization failed');
            resolve(null);
        };

        // SDKのロードを少し待つ
        if (typeof window !== 'undefined' && window.supabase) {
            attemptInit();
        } else {
            setTimeout(attemptInit, 200);
        }
    });

    return initializationPromise;
}

// 遅延初期化関数を更新
async function ensureSupabaseInitialized() {
    if (supabaseInitialized && supabase) {
        return supabase;
    }
    return await asyncInitializeSupabase();
}

// DOM読み込み後に初期化
if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            asyncInitializeSupabase();
        });
    } else {
        asyncInitializeSupabase();
    }
}

// エクスポート
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { supabase, SUPABASE_CONFIG };
}