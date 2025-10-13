-- Supabaseデータベースセットアップスクリプト
-- このSQLをSupabaseダッシュボードのSQL Editorで実行してください

-- UUID拡張機能を有効化
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- オーダーテーブルの作成
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_name VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255),
    delivery_date DATE,
    delivery_time VARCHAR(50),
    delivery_address TEXT,
    order_items JSONB,
    total_amount DECIMAL(10,2),
    notes TEXT,
    completed BOOLEAN DEFAULT false,
    deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),
    sync_version INTEGER DEFAULT 1,
    sync_status VARCHAR(50) DEFAULT 'synced'
);

-- インデックスの作成（パフォーマンス最適化）
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON orders(delivery_date);
CREATE INDEX IF NOT EXISTS idx_orders_completed ON orders(completed);
CREATE INDEX IF NOT EXISTS idx_orders_deleted ON orders(deleted);
CREATE INDEX IF NOT EXISTS idx_orders_created_by ON orders(created_by);

-- Row Level Security (RLS) の有効化
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- 既存のポリシーを削除（エラー防止）
DROP POLICY IF EXISTS "Orders are viewable by authenticated users" ON orders;
DROP POLICY IF EXISTS "Orders are insertable by authenticated users" ON orders;
DROP POLICY IF EXISTS "Orders are updatable by authenticated users" ON orders;
DROP POLICY IF EXISTS "Orders are deletable by authenticated users" ON orders;

-- ポリシーの作成（認証ユーザーのみアクセス可能）
CREATE POLICY "Orders are viewable by authenticated users" 
    ON orders FOR SELECT 
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Orders are insertable by authenticated users" 
    ON orders FOR INSERT 
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Orders are updatable by authenticated users" 
    ON orders FOR UPDATE 
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Orders are deletable by authenticated users" 
    ON orders FOR DELETE 
    USING (auth.uid() IS NOT NULL);

-- 更新時刻を自動更新するトリガー関数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 既存のトリガーを削除（エラー防止）
DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;

-- トリガーの作成
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- リアルタイム機能を有効化
ALTER PUBLICATION supabase_realtime ADD TABLE orders;

-- ビューの作成（統計情報用）
CREATE OR REPLACE VIEW order_statistics AS
SELECT
    COUNT(*) AS total_orders,
    COUNT(*) FILTER (WHERE completed = true) AS completed_orders,
    COUNT(*) FILTER (WHERE completed = false) AS pending_orders,
    COUNT(*) FILTER (WHERE delivery_date = CURRENT_DATE) AS today_deliveries,
    COUNT(*) FILTER (WHERE deleted = true) AS deleted_orders
FROM orders
WHERE deleted = false;

-- 権限の付与
GRANT SELECT ON order_statistics TO authenticated;

-- 同期競合解決用のストアドプロシージャ
CREATE OR REPLACE FUNCTION resolve_order_conflict(
    p_order_id UUID,
    p_local_data JSONB,
    p_strategy VARCHAR DEFAULT 'last-write-wins'
)
RETURNS JSONB AS $$
DECLARE
    v_server_data JSONB;
    v_merged_data JSONB;
BEGIN
    -- サーバーの現在のデータを取得
    SELECT to_jsonb(orders.*) INTO v_server_data
    FROM orders
    WHERE id = p_order_id;
    
    IF v_server_data IS NULL THEN
        -- サーバーにデータがない場合はローカルデータを返す
        RETURN p_local_data;
    END IF;
    
    IF p_strategy = 'last-write-wins' THEN
        -- タイムスタンプ比較
        IF (p_local_data->>'updated_at')::timestamp > (v_server_data->>'updated_at')::timestamp THEN
            RETURN p_local_data;
        ELSE
            RETURN v_server_data;
        END IF;
    ELSIF p_strategy = 'merge' THEN
        -- フィールドごとにマージ
        v_merged_data := v_server_data;
        RETURN v_merged_data;
    ELSE
        -- デフォルトはサーバーデータを優先
        RETURN v_server_data;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 関数の権限付与
GRANT EXECUTE ON FUNCTION resolve_order_conflict TO authenticated;