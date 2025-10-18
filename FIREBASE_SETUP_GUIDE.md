# 🔥 Firebase セットアップガイド

## 📋 目次
1. [Firebaseプロジェクト作成](#1-firebaseプロジェクト作成)
2. [認証の設定](#2-認証の設定)
3. [Firestoreデータベースの作成](#3-firestoreデータベースの作成)
4. [セキュリティルールの設定](#4-セキュリティルールの設定)
5. [設定情報の取得](#5-設定情報の取得)

---

## 1. Firebaseプロジェクト作成

### ステップ1: Firebaseコンソールにアクセス
1. [https://console.firebase.google.com/](https://console.firebase.google.com/) を開く
2. Googleアカウントでログイン
3. 「プロジェクトを追加」をクリック

### ステップ2: プロジェクト情報を入力
1. **プロジェクト名**を入力（例：`flower-shop-orders`）
2. 「続行」をクリック
3. **Google アナリティクス**は任意（オフでもOK）
4. 「プロジェクトを作成」をクリック
5. 作成完了まで30秒ほど待つ

---

## 2. 認証の設定

### ステップ1: Authentication を有効化
1. 左メニューから「**Authentication**」をクリック
2. 「**始める**」ボタンをクリック

### ステップ2: メール/パスワード認証を有効化
1. 「**Sign-in method**」タブをクリック
2. 「**メール/パスワード**」を選択
3. 1番目の「**有効にする**」トグルをONにする
   - 「パスワードレス」（2番目）はOFFのままでOK
4. 「**保存**」をクリック

### （オプション）匿名認証を有効化
お試し用に匿名ログインも使えます：
1. 「**匿名**」を選択
2. 「有効にする」をON
3. 「保存」

---

## 3. Firestoreデータベースの作成

### ステップ1: Firestoreを開始
1. 左メニューから「**Firestore Database**」をクリック
2. 「**データベースの作成**」をクリック

### ステップ2: セキュリティルールを選択
**本番モード**を選択（推奨）
- 「本番モードで開始」を選択
- セキュリティルールは後で設定します
- 「次へ」をクリック

### ステップ3: ロケーションを選択
**asia-northeast1（東京）** または **asia-northeast2（大阪）** を選択
- 日本からのアクセスが速くなります
- 「有効にする」をクリック
- データベース作成まで1-2分待つ

---

## 4. セキュリティルールの設定

### Firestoreセキュリティルール

Firebaseコンソールで：
1. 「**Firestore Database**」→「**ルール**」タブ
2. 以下のルールをコピー&ペースト：

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // ユーザー認証必須
    match /orders/{orderId} {
      // ログインユーザーのみ自分のデータを読み書き可能
      allow read, write: if request.auth != null 
                        && request.auth.uid == resource.data.user_id;
      // 新規作成時
      allow create: if request.auth != null 
                   && request.auth.uid == request.resource.data.user_id;
    }
    
    // ユーザー設定（任意）
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

3. 「**公開**」をクリック

### セキュリティルールの説明
- ✅ ログインユーザーのみアクセス可能
- ✅ 各ユーザーは自分のデータのみ操作可能
- ✅ user_idフィールドで所有者を判定
- 🔒 他のユーザーのデータは見えない

---

## 5. 設定情報の取得

### ステップ1: Webアプリを追加
1. プロジェクトのホーム画面に戻る
2. 「**</>**」（Webアイコン）をクリック
3. **アプリのニックネーム**を入力（例：`flower-shop-web`）
4. 「Firebase Hosting」はチェック不要
5. 「**アプリを登録**」をクリック

### ステップ2: 設定情報をコピー
以下のような設定情報が表示されます：

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdefghijklmnop"
};
```

**この設定情報を全てコピーしてください！**

### ステップ3: firebase-config.js に設定

プロジェクトの `firebase-config.js` ファイルを開いて、コピーした設定を貼り付けます：

```javascript
// firebase-config.js
const FIREBASE_CONFIG = {
  apiKey: "ここにコピーしたapiKeyを貼り付け",
  authDomain: "ここにコピーしたauthDomainを貼り付け",
  projectId: "ここにコピーしたprojectIdを貼り付け",
  storageBucket: "ここにコピーしたstorageBucketを貼り付け",
  messagingSenderId: "ここにコピーしたmessagingSenderIdを貼り付け",
  appId: "ここにコピーしたappIdを貼り付け"
};
```

---

## 6. 動作確認

### テストページで確認
1. ブラウザで `test-firebase.html` を開く
2. 「接続テスト」ボタンをクリック
3. ✅「Firebase接続成功」と表示されればOK

### 認証テスト
1. 「アカウント作成」でテストアカウントを作成
   - メール: `test@example.com`
   - パスワード: `test1234`（6文字以上）
2. ログインできればOK

### データ書き込みテスト
1. ログイン後、オーダーを1件作成
2. Firebaseコンソールの「Firestore Database」→「データ」で確認
3. `orders`コレクションにデータが表示されればOK ✅

---

## 🎯 トラブルシューティング

### エラー: "Missing or insufficient permissions"
→ セキュリティルールが正しく設定されていません
→ 「4. セキュリティルールの設定」を再確認

### エラー: "Firebase: Error (auth/invalid-api-key)"
→ `firebase-config.js`のapiKeyが間違っています
→ Firebaseコンソールから正しい値をコピーし直してください

### エラー: "Firebase: Error (auth/weak-password)"
→ パスワードが6文字未満です
→ 6文字以上のパスワードを設定してください

### データが表示されない
→ user_idフィールドが正しく設定されているか確認
→ ログインユーザーのUIDと一致しているか確認

---

## 📊 Firebaseコンソールの見方

### 認証ユーザー一覧
「Authentication」→「Users」で登録ユーザーを確認できます

### データベース内容
「Firestore Database」→「データ」で保存データを確認できます

### 使用量の確認
「使用状況」タブで無料枠の消費状況を確認できます

**無料枠（Sparkプラン）:**
- 認証: 無制限
- Firestore読み取り: 1日50,000件
- Firestore書き込み: 1日20,000件
- ストレージ: 1GB

通常の使用では無料枠内で十分です！

---

## 🎉 完了！

これでFirebaseの設定は完了です。
アプリから正常にデータの読み書きができるようになります。

何か問題があれば、エラーメッセージと共にお知らせください！
