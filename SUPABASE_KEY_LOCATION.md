# 🔑 Supabase Project URLとAnon Keyの取得方法

## 📸 画像付きガイド

### 1️⃣ Supabaseにログイン
1. [https://supabase.com](https://supabase.com) にアクセス
2. 「Dashboard」または「Sign In」をクリック
3. GitHub/GitLab/Bitbucket またはメールでログイン

### 2️⃣ プロジェクトの作成（初回のみ）
**新規プロジェクトを作成する場合：**
1. 「New project」ボタンをクリック
2. 以下を入力：
   - **Project name**: 任意の名前（例：order-system）
   - **Database Password**: 強力なパスワードを設定（忘れないように！）
   - **Region**: 最寄りのリージョンを選択（日本なら「Northeast Asia (Tokyo)」）
3. 「Create new project」をクリック
4. プロジェクトの作成完了まで1-2分待つ

### 3️⃣ API認証情報の取得

**Project URLとAnon Keyは以下の場所にあります：**

#### 方法A: Settings → API から取得（推奨）

1. **左側メニューから「Settings」（歯車アイコン）をクリック**
2. **「API」タブを選択**
3. **以下の2つの情報が表示されます：**

```
Project URL:
https://xxxxxxxxxxxxxx.supabase.co
↑ これをコピー（例：https://jbwbrxjiujihsnymsipw.supabase.co）

anon public:
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZi...
↑ これをコピー（とても長い文字列）
```

#### 方法B: ホーム画面から取得

1. **プロジェクトのホーム画面を開く**
2. **「Connect」ボタンまたは「API」セクションを探す**
3. **接続情報が表示される**

### 4️⃣ supabase-config.jsに設定

取得した情報を以下のように設定します：

```javascript
// supabase-config.js ファイルを開く
const SUPABASE_CONFIG = {
    // ここにProject URLを貼り付け（クォーテーションは残す）
    url: 'https://xxxxxxxxxxxxxx.supabase.co',
    
    // ここにAnon Keyを貼り付け（クォーテーションは残す）
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZi...',
    
    // 以下は変更不要
    options: {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false
        }
    }
};
```

## ⚠️ 重要な注意点

### セキュリティについて
- **Anon Key（公開鍵）**は公開しても問題ありません
  - フロントエンドで使用するため
  - Row Level Security (RLS)で保護されている
  
- **Service Role Key（秘密鍵）**は絶対に公開しないでください
  - サーバーサイドのみで使用
  - 今回は使用しません

### よくあるミス
1. **URLの末尾にスラッシュを付けない**
   - ❌ 間違い: `https://xxx.supabase.co/`
   - ✅ 正解: `https://xxx.supabase.co`

2. **キーの一部だけコピーしない**
   - Anon Keyは非常に長い（300文字以上）
   - 最後まで全てコピーする

3. **クォーテーションを消さない**
   - JavaScriptの文字列として必要
   - `'` または `"` で囲む

## 🔍 確認方法

設定が正しいか確認するには：

1. **ブラウザで `/sync-debug.html` を開く**
2. **「接続テスト」ボタンをクリック**
3. **「接続テスト成功」と表示されればOK**

### エラーが出る場合のチェックリスト

- [ ] URLが正しくコピーされているか
- [ ] Anon Keyが完全にコピーされているか
- [ ] クォーテーションが正しいか
- [ ] カンマが正しい位置にあるか
- [ ] Supabaseプロジェクトが起動しているか

## 📞 トラブルシューティング

### 「Invalid API key」エラー
→ Anon Keyが正しくコピーされていません

### 「Failed to fetch」エラー
→ URLが間違っているか、プロジェクトが一時停止中

### 「relation "orders" does not exist」エラー
→ テーブルがまだ作成されていません
→ `setup-supabase.sql`を実行してください

## 🎯 次のステップ

1. **SQLでテーブルを作成**
   - Supabaseダッシュボードの「SQL Editor」を開く
   - `setup-supabase.sql`の内容を実行

2. **認証を有効化**
   - 「Authentication」→「Providers」
   - 「Email」を有効化

3. **リアルタイムを有効化**
   - 「Database」→「Replication」
   - `orders`テーブルを有効化

これで同期機能が使えるようになります！