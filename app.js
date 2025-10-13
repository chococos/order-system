// オーダーシート管理システム ver.0.9 - 軽量化版

class OrderSystem {
    constructor() {
        // データ
        this.orders = [];
        this.currentOrder = null;
        this.editingOrderId = null;
        this.addedProducts = [];
        this.currentStep = 1;
        this.editingProductIndex = null;  // 商品編集用のインデックス
        this.workStatusHistory = [];  // 作業状態履歴
        this.contactRecordHistory = [];  // 連絡記録履歴
        this.currentTab = null;  // 現在のタブ
        this.previousTab = null;  // 前のタブ（input画面から戻る用）
        this.isSaving = false;  // 保存処理中フラグ
        this.handleFormSubmit = null;  // フォームサブミットハンドラー
        this.isInitialized = false;  // 初期化完了フラグ
        this.lastSaveTime = 0;  // 最後の保存時刻（デバウンス用）
        this.toastTimer = null;  // トースト表示タイマー
        
        // 初期化
        this.init();
    }
    
    init() {
        try {
            console.log('OrderSystem initializing... (init call count)');
            
            // 初期化が既に完了している場合はスキップ
            if (this.isInitialized) {
                console.log('Already initialized, skipping...');
                return;
            }
            
            // 初期設定
            this.setupEventListeners();
            this.loadData();
            this.updateOrderCount();
            
            // 今日の日付を設定
            const today = new Date().toISOString().split('T')[0];
            const receptionDate = document.getElementById('reception-date');
            if (receptionDate) {
                receptionDate.value = today;
            }
            
            // 全セクションを表示
            this.showAllSections();
            
            // 初期タブのデータを読み込み（本日から開始）
            this.switchTab('today');
            
            // 初期化完了フラグを設定
            this.isInitialized = true;
            console.log('OrderSystem initialized successfully');
        } catch (error) {
            console.error('Error initializing OrderSystem:', error);
        }
    }

    // ユーザー情報と一緒にアプリケーションを初期化（認証後に呼び出される）
    initWithUser(user) {
        console.log('Initializing OrderSystem with user:', user);
        
        // 既に初期化済みの場合は、ユーザー情報のみ更新
        if (this.isInitialized) {
            console.log('Already initialized, updating user info only');
            this.loadData(); // データのリロードのみ
            this.updateOrderCount();
            return;
        }
        
        this.init(); // 通常の初期化処理を実行
    }
    
    // 全セクションを表示
    showAllSections() {
        document.querySelectorAll('.step-section').forEach(section => {
            section.classList.add('active');
        });
        
        // 次へボタンを非表示
        document.querySelectorAll('.next-btn').forEach(btn => {
            btn.style.display = 'none';
        });
        
        // 新規作成時は完了セクションを非表示
        if (!this.editingOrderId) {
            const completedSection = document.getElementById('completed-section');
            if (completedSection) {
                completedSection.style.display = 'none';
            }
        }
    }
    
    setupEventListeners() {
        // タブ切り替え
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });
        
        // フィルターボタンのイベントリスナーを設定
        this.setupFilterButtons();
        
        // フォーム送信（重複登録を防ぐため、既存のリスナーを削除）
        const form = document.getElementById('order-form');
        if (form) {
            console.log('Setting up form submit handler for:', form);
            
            // 既存のすべてのイベントリスナーを削除（より確実に）
            if (this.handleFormSubmit) {
                form.removeEventListener('submit', this.handleFormSubmit);
            }
            
            // フォームを一度クローンして全イベントリスナーをリセット
            const newForm = form.cloneNode(true);
            form.parentNode.replaceChild(newForm, form);
            
            // 新しいイベントリスナーを追加
            this.handleFormSubmit = (e) => {
                console.log('Form submit event triggered');
                e.preventDefault();
                console.log('Calling saveOrder()');
                
                // 即座に追加の送信を防ぐ
                e.stopImmediatePropagation();
                
                this.saveOrder();
            };
            
            newForm.addEventListener('submit', this.handleFormSubmit, { once: false });
        } else {
            console.warn('order-form element not found during initialization');
        }
        
        // サービス内容変更
        document.querySelectorAll('input[name="service"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.updateServiceOptions();
                this.toggleSaveButtons(); // 保存ボタンの表示制御
            });
        });
        
        // 担当者選択
        document.getElementById('staff')?.addEventListener('change', (e) => {
            const otherInput = document.getElementById('staff-other');
            if (e.target.value === 'ゲスト') {
                otherInput.classList.remove('hidden');
                otherInput.focus();
            } else {
                otherInput.classList.add('hidden');
                otherInput.value = '';
            }
        });
        
        // 支払いステータス
        document.getElementById('payment-status')?.addEventListener('change', (e) => {
            const paymentDate = document.getElementById('payment-date');
            const paymentStaff = document.getElementById('payment-staff');
            const paymentStaffOther = document.getElementById('payment-staff-other');
            
            if (e.target.value === '済') {
                // 支払い済みの場合、日付と担当者を有効化
                paymentDate.disabled = false;
                paymentStaff.disabled = false;
                // 今日の日付を設定
                paymentDate.value = new Date().toISOString().split('T')[0];
            } else {
                // 未払いの場合、日付と担当者を無効化
                paymentDate.disabled = true;
                paymentStaff.disabled = true;
                paymentStaffOther.disabled = true;
                // 値をクリア
                paymentDate.value = '';
                paymentStaff.value = '';
                paymentStaffOther.value = '';
                // ゲスト入力欄も隠す
                paymentStaffOther?.classList.add('hidden');
            }
        });
        
        // 支払い担当者選択
        document.getElementById('payment-staff')?.addEventListener('change', (e) => {
            const otherInput = document.getElementById('payment-staff-other');
            const paymentStatus = document.getElementById('payment-status').value;
            
            if (e.target.value === 'ゲスト' && paymentStatus === '済') {
                otherInput.classList.remove('hidden');
                otherInput.disabled = false;
                otherInput.focus();
            } else {
                otherInput.classList.add('hidden');
                otherInput.disabled = true;
                otherInput.value = '';
            }
        });
        
        // 着手チェックボックス
        document.getElementById('work-started')?.addEventListener('change', (e) => {
            const details = document.getElementById('work-details');
            if (e.target.checked) {
                details.classList.remove('hidden');
                // 現在の日時を自動設定
                const now = new Date();
                const datetimeLocal = now.getFullYear() + '-' + 
                                    String(now.getMonth() + 1).padStart(2, '0') + '-' +
                                    String(now.getDate()).padStart(2, '0') + 'T' +
                                    String(now.getHours()).padStart(2, '0') + ':' +
                                    String(now.getMinutes()).padStart(2, '0');
                document.getElementById('work-datetime').value = datetimeLocal;
                
                // 初回入力時は追加ボタンを非表示
                this.updateWorkButtons();
            } else {
                details.classList.add('hidden');
                // ゲスト入力欄も隠す
                document.getElementById('work-staff-other')?.classList.add('hidden');
            }
        });
        
        // 着手担当者選択
        document.getElementById('work-staff')?.addEventListener('change', (e) => {
            const otherInput = document.getElementById('work-staff-other');
            if (e.target.value === 'ゲスト') {
                otherInput.classList.remove('hidden');
                otherInput.focus();
            } else {
                otherInput.classList.add('hidden');
                otherInput.value = '';
            }
        });
        
        // 日付・時間未定チェックボックス
        document.getElementById('date-undecided')?.addEventListener('change', (e) => {
            const fromInput = document.getElementById('date-from');
            const toInput = document.getElementById('date-to');
            fromInput.disabled = e.target.checked;
            toInput.disabled = e.target.checked;
            if (e.target.checked) {
                fromInput.value = '';
                toInput.value = '';
            }
        });
        
        document.getElementById('time-undecided')?.addEventListener('change', (e) => {
            const fromInput = document.getElementById('time-from');
            const toInput = document.getElementById('time-to');
            fromInput.disabled = e.target.checked;
            toInput.disabled = e.target.checked;
            if (e.target.checked) {
                fromInput.value = '';
                toInput.value = '';
            }
        });
        
        // 作業状態変更時
        document.getElementById('work-status')?.addEventListener('change', (e) => {
            if (e.target.value) {
                this.updateWorkButtons();
            }
        });
        
        // 連絡記録変更時
        document.getElementById('contact-record')?.addEventListener('change', (e) => {
            if (e.target.value) {
                this.updateWorkButtons();
            }
        });
        
        // 連絡記録担当者選択
        document.getElementById('contact-record-staff')?.addEventListener('change', (e) => {
            const otherInput = document.getElementById('contact-record-staff-other');
            if (e.target.value === 'ゲスト') {
                otherInput.classList.remove('hidden');
                otherInput.focus();
            } else {
                otherInput.classList.add('hidden');
                otherInput.value = '';
            }
        });
        
        // 完了チェックボックス
        document.getElementById('completed')?.addEventListener('change', (e) => {
            // 確認ダイアログを表示
            const isChecked = e.target.checked;
            const message = isChecked 
                ? 'このオーダーを完了としてマークしますか？' 
                : 'このオーダーを未完了に戻しますか？';
            
            if (!confirm(message)) {
                // キャンセルされた場合は元に戻す
                e.target.checked = !isChecked;
                return;
            }
            
            const details = document.getElementById('completed-details');
            if (e.target.checked) {
                details.classList.remove('hidden');
                // 現在の日時を自動設定
                const now = new Date();
                const datetimeLocal = now.getFullYear() + '-' + 
                                    String(now.getMonth() + 1).padStart(2, '0') + '-' +
                                    String(now.getDate()).padStart(2, '0') + 'T' +
                                    String(now.getHours()).padStart(2, '0') + ':' +
                                    String(now.getMinutes()).padStart(2, '0');
                document.getElementById('completed-datetime').value = datetimeLocal;
            } else {
                details.classList.add('hidden');
                // ゲスト入力欄も隠す
                document.getElementById('completed-staff-other')?.classList.add('hidden');
                // 完了情報をクリア
                document.getElementById('completed-staff').value = '';
                document.getElementById('completed-staff-other').value = '';
                document.getElementById('completed-datetime').value = '';
            }
        });
        
        // 完了担当者選択
        document.getElementById('completed-staff')?.addEventListener('change', (e) => {
            const otherInput = document.getElementById('completed-staff-other');
            if (e.target.value === 'ゲスト') {
                otherInput.classList.remove('hidden');
                otherInput.focus();
            } else {
                otherInput.classList.add('hidden');
                otherInput.value = '';
            }
        });
    }
    
    // 作業状態と連絡記録のボタン表示更新
    updateWorkButtons() {
        const workStatus = document.getElementById('work-status');
        const contactRecord = document.getElementById('contact-record');
        const confirmWorkBtn = document.getElementById('confirm-work-status-btn');
        const confirmContactBtn = document.getElementById('confirm-contact-record-btn');
        const addWorkBtn = document.getElementById('add-work-status-btn');
        const addContactBtn = document.getElementById('add-contact-record-btn');
        
        // 作業状態のボタン制御
        if (workStatus && workStatus.value) {
            if (this.workStatusHistory.length === 0) {
                // 初回入力時は決定ボタンを表示
                if (confirmWorkBtn) {
                    confirmWorkBtn.classList.remove('hidden');
                }
                if (addWorkBtn) {
                    addWorkBtn.classList.add('hidden');
                }
            } else if (this.workStatusHistory.length < 10) {
                // 2回目以降は追加ボタンを表示
                if (confirmWorkBtn) {
                    confirmWorkBtn.classList.add('hidden');
                }
                if (addWorkBtn) {
                    addWorkBtn.classList.remove('hidden');
                }
            }
        } else {
            // 値が空の場合は両方非表示
            if (confirmWorkBtn) {
                confirmWorkBtn.classList.add('hidden');
            }
            if (addWorkBtn) {
                addWorkBtn.classList.add('hidden');
            }
        }
        
        // 連絡記録のボタン制御
        if (contactRecord && contactRecord.value) {
            if (this.contactRecordHistory.length === 0) {
                // 初回入力時は決定ボタンを表示
                if (confirmContactBtn) {
                    confirmContactBtn.classList.remove('hidden');
                }
                if (addContactBtn) {
                    addContactBtn.classList.add('hidden');
                }
            } else if (this.contactRecordHistory.length < 10) {
                // 2回目以降は追加ボタンを表示
                if (confirmContactBtn) {
                    confirmContactBtn.classList.add('hidden');
                }
                if (addContactBtn) {
                    addContactBtn.classList.remove('hidden');
                }
            }
        } else {
            // 値が空の場合は両方非表示
            if (confirmContactBtn) {
                confirmContactBtn.classList.add('hidden');
            }
            if (addContactBtn) {
                addContactBtn.classList.add('hidden');
            }
        }
        
        // 10件に達したら追加ボタンを非表示
        if (this.workStatusHistory.length >= 10 && addWorkBtn) {
            addWorkBtn.classList.add('hidden');
        }
        if (this.contactRecordHistory.length >= 10 && addContactBtn) {
            addContactBtn.classList.add('hidden');
        }
    }
    
    // 作業状態を決定（初回入力時）
    confirmWorkStatus() {
        this.addWorkStatus(true);
    }
    
    // 作業状態を追加
    addWorkStatus(isFirst = false) {
        const select = document.getElementById('work-status');
        const historyDiv = document.getElementById('work-status-history');
        const workStaff = document.getElementById('work-staff');
        
        // 担当者が選択されているかチェック
        if (!workStaff || !workStaff.value) {
            this.showToast('担当者を選択してください', 'error');
            workStaff?.focus();
            return;
        }
        
        // 最大10件チェック
        if (this.workStatusHistory.length >= 10) {
            this.showToast('作業状態は最大10件まで追加できます', 'error');
            return;
        }
        
        if (select && select.value) {
            const now = new Date();
            const timeStr = now.toLocaleString('ja-JP');
            const statusEntry = {
                status: select.value,
                datetime: timeStr,
                staff: this.getWorkStaffName()
            };
            
            // 履歴に追加
            this.workStatusHistory.push(statusEntry);
            
            // 履歴表示を更新
            this.renderWorkStatusHistory();
            
            // セレクトをリセット
            select.value = '';
            
            // 着手担当者を「選択」に戻す
            workStaff.value = '';
            document.getElementById('work-staff-other')?.classList.add('hidden');
            document.getElementById('work-staff-other').value = '';
            
            // ボタン表示を更新
            this.updateWorkButtons();
            
            const message = isFirst ? '作業状態を決定しました' : `作業状態を追加しました (${this.workStatusHistory.length}/10)`;
            this.showToast(message);
        }
    }
    
    // 連絡記録を決定（初回入力時）
    confirmContactRecord() {
        this.addContactRecord(true);
    }
    
    // 連絡記録を追加
    addContactRecord(isFirst = false) {
        const select = document.getElementById('contact-record');
        const historyDiv = document.getElementById('contact-record-history');
        const contactStaffSelect = document.getElementById('contact-record-staff');
        
        // 担当者が選択されているかチェック
        if (!contactStaffSelect || !contactStaffSelect.value) {
            this.showToast('連絡担当者を選択してください', 'error');
            contactStaffSelect?.focus();
            return;
        }
        
        // 最大10件チェック
        if (this.contactRecordHistory.length >= 10) {
            this.showToast('連絡記録は最大10件まで追加できます', 'error');
            return;
        }
        
        if (select && select.value) {
            const now = new Date();
            const timeStr = now.toLocaleString('ja-JP');
            
            // 連絡記録用の担当者を取得
            const contactStaff = this.getContactStaffName();
            
            const recordEntry = {
                record: select.value,
                datetime: timeStr,
                staff: contactStaff
            };
            
            // 履歴に追加
            this.contactRecordHistory.push(recordEntry);
            
            // 履歴表示を更新
            this.renderContactRecordHistory();
            
            // セレクトをリセット
            select.value = '';
            document.getElementById('contact-record-staff').value = '';
            document.getElementById('contact-record-staff-other').value = '';
            document.getElementById('contact-record-staff-other').classList.add('hidden');
            
            // ボタン表示を更新
            this.updateWorkButtons();
            
            const message = isFirst ? '連絡記録を決定しました' : `連絡記録を追加しました (${this.contactRecordHistory.length}/10)`;
            this.showToast(message);
        }
    }
    
    // 連絡記録用の担当者名取得
    getContactStaffName() {
        const staff = document.getElementById('contact-record-staff')?.value;
        if (staff === 'ゲスト') {
            return document.getElementById('contact-record-staff-other')?.value || '';
        }
        return staff || '';
    }
    
    // 作業状態履歴を表示
    renderWorkStatusHistory() {
        const historyDiv = document.getElementById('work-status-history');
        if (!historyDiv) return;
        
        if (this.workStatusHistory.length === 0) {
            historyDiv.innerHTML = '';
            return;
        }
        
        historyDiv.innerHTML = `<div class="font-medium text-gray-700 mb-1">履歴 (${this.workStatusHistory.length}/10件):</div>` +
            this.workStatusHistory.map((entry, index) => `
                <div class="pl-3 border-l-2 border-sage-light">
                    <span class="text-xs text-gray-400">${index + 1}.</span>
                    <span class="font-medium">${entry.status}</span>
                    <span class="text-xs text-gray-500 ml-2">${entry.datetime}</span>
                    ${entry.staff ? `<span class="text-xs text-gray-600 ml-1">(${entry.staff})</span>` : ''}
                </div>
            `).join('');
    }
    
    // 連絡記録履歴を表示
    renderContactRecordHistory() {
        const historyDiv = document.getElementById('contact-record-history');
        if (!historyDiv) return;
        
        if (this.contactRecordHistory.length === 0) {
            historyDiv.innerHTML = '';
            return;
        }
        
        historyDiv.innerHTML = `<div class="font-medium text-gray-700 mb-1">履歴 (${this.contactRecordHistory.length}/10件):</div>` +
            this.contactRecordHistory.map((entry, index) => `
                <div class="pl-3 border-l-2 border-terracotta-light">
                    <span class="text-xs text-gray-400">${index + 1}.</span>
                    <span class="font-medium">${entry.record}</span>
                    <span class="text-xs text-gray-500 ml-2">${entry.datetime}</span>
                    ${entry.staff ? `<span class="text-xs text-gray-600 ml-1">(${entry.staff})</span>` : ''}
                </div>
            `).join('');
    }
    
    // タブ切り替え
    switchTab(tabName) {
        // タブナビゲーションの表示制御
        const tabNav = document.querySelector('nav.bg-white.border-b');
        
        if (tabName === 'input') {
            // 入力タブの場合はタブナビゲーションを非表示
            if (tabNav) {
                tabNav.style.display = 'none';
                tabNav.style.pointerEvents = 'none';
            }
            // すべてのタブボタンも非表示
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.style.display = 'none';
                btn.style.visibility = 'hidden';
                btn.style.pointerEvents = 'none';
            });
        } else {
            // 他のタブの場合はタブナビゲーションを表示
            if (tabNav) {
                tabNav.style.display = '';
                tabNav.style.pointerEvents = '';
            }
            // すべてのタブボタンを表示
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.style.display = '';
                btn.style.visibility = '';
                btn.style.pointerEvents = '';
            });
        }
        
        // タブボタンのアクティブ状態を更新
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // 入力タブの場合はタブボタンが存在しないため、特別処理
        if (tabName !== 'input') {
            const tabBtn = document.querySelector(`[data-tab="${tabName}"]`);
            if (tabBtn) {
                tabBtn.classList.add('active');
            }
        }
        
        // タブコンテンツの表示切り替え
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        const tabContent = document.getElementById(`tab-${tabName}`);
        if (tabContent) {
            tabContent.classList.add('active');
        }
        
        // タブごとのデータ読み込み
        this.loadTabData(tabName);
    }
    
    // タブデータ読み込み
    loadTabData(tabName) {
        // inputタブに入る前のタブを記憶
        if (tabName === 'input' && this.currentTab && this.currentTab !== 'input') {
            this.previousTab = this.currentTab;
        }
        
        // 現在のタブを保存
        this.currentTab = tabName;
        
        switch(tabName) {
            case 'input':
                // 入力タブの場合は何もしない（フォームを表示するだけ）
                break;
            case 'today':
                this.loadTodayTab();
                break;
            case 'dryflower':
                this.loadDryflowerTab('all');
                break;
            case 'plant':
                this.loadPlantTab('all');
                break;
            case 'all':
                this.renderOrders('all-orders', this.orders.filter(o => !o.deleted));
                break;
            case 'completed':
                this.renderOrders('completed-orders', this.filterByCompleted());
                break;
            case 'search':
                // 検索タブの場合も何もしない
                break;
        }
    }
    
    // 本日タブのデータ読み込み
    loadTodayTab() {
        // 本日の日付を表示
        const today = new Date();
        const dateStr = today.toLocaleDateString('ja-JP', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            weekday: 'long'
        });
        
        const todayDateElement = document.getElementById('today-date');
        if (todayDateElement) {
            todayDateElement.textContent = dateStr;
        }
        
        // 本日のオーダーを取得して表示
        const todayOrders = this.filterTodayOrders();
        this.renderOrders('today-orders', todayOrders);
        
        // カウントを更新
        this.updateTodayCount();
    }
    
    // ドライフラワータブのデータ読み込み
    loadDryflowerTab(filter = 'all') {
        let orders;
        
        switch(filter) {
            case 'pickup':
                orders = this.filterDryPickup();
                break;
            case 'production':
                orders = this.filterDryProduction();
                break;
            case 'prepare':
                orders = this.filterDryPrepare();
                break;
            default:
                // 全てのドライフラワー注文（完了含む）を完了済みタブへ
                const allDryOrders = this.orders.filter(order => {
                    if (order.deleted) return false;
                    return order.products?.some(p => p.category === 'dryflower');
                });
                
                // 未完了のみ表示
                orders = allDryOrders.filter(o => !o.completed);
                break;
        }
        
        this.renderOrders('dryflower-orders', orders);
        this.updateFilterCounts('dryflower');
    }
    
    // 植物タブのデータ読み込み
    loadPlantTab(filter = 'all') {
        let orders;
        
        switch(filter) {
            case 'pickup':
                orders = this.filterPlantPickup();
                break;
            case 'work':
                orders = this.filterPlantWork();
                break;
            case 'prepare':
                orders = this.filterPlantPrepare();
                break;
            default:
                // 全ての植物注文（完了含む）を完了済みタブへ
                const allPlantOrders = this.orders.filter(order => {
                    if (order.deleted) return false;
                    return order.products?.some(p => 
                        p.category === 'plant' || p.category === 'tree' || p.category === 'construction'
                    );
                });
                
                // 未完了のみ表示
                orders = allPlantOrders.filter(o => !o.completed);
                break;
        }
        
        this.renderOrders('plant-orders', orders);
        this.updateFilterCounts('plant');
    }
    
    // フィルターボタンのセットアップ
    setupFilterButtons() {
        // ドライフラワーフィルター
        document.querySelectorAll('#dryflower-filters .filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // アクティブ状態を更新
                document.querySelectorAll('#dryflower-filters .filter-btn').forEach(b => {
                    b.classList.remove('active');
                });
                btn.classList.add('active');
                
                // フィルター適用
                this.loadDryflowerTab(btn.dataset.filter);
            });
        });
        
        // 植物フィルター
        document.querySelectorAll('#plant-filters .filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // アクティブ状態を更新
                document.querySelectorAll('#plant-filters .filter-btn').forEach(b => {
                    b.classList.remove('active');
                });
                btn.classList.add('active');
                
                // フィルター適用
                this.loadPlantTab(btn.dataset.filter);
            });
        });
    }
    
    // フィルターカウントの更新
    updateFilterCounts(type) {
        if (type === 'dryflower') {
            const allCount = this.orders.filter(o => !o.deleted && !o.completed && o.products?.some(p => p.category === 'dryflower')).length;
            const pickupCount = this.filterDryPickup().length;
            const productionCount = this.filterDryProduction().length;
            const prepareCount = this.filterDryPrepare().length;
            
            document.querySelector('#dryflower-filters [data-filter="all"] .filter-count').textContent = `(${allCount})`;
            document.querySelector('#dryflower-filters [data-filter="pickup"] .filter-count').textContent = `(${pickupCount})`;
            document.querySelector('#dryflower-filters [data-filter="production"] .filter-count').textContent = `(${productionCount})`;
            document.querySelector('#dryflower-filters [data-filter="prepare"] .filter-count').textContent = `(${prepareCount})`;
        } else if (type === 'plant') {
            const allCount = this.orders.filter(o => !o.deleted && !o.completed && o.products?.some(p => 
                p.category === 'plant' || p.category === 'tree' || p.category === 'construction'
            )).length;
            const pickupCount = this.filterPlantPickup().length;
            const workCount = this.filterPlantWork().length;
            const prepareCount = this.filterPlantPrepare().length;
            
            document.querySelector('#plant-filters [data-filter="all"] .filter-count').textContent = `(${allCount})`;
            document.querySelector('#plant-filters [data-filter="pickup"] .filter-count').textContent = `(${pickupCount})`;
            document.querySelector('#plant-filters [data-filter="work"] .filter-count').textContent = `(${workCount})`;
            document.querySelector('#plant-filters [data-filter="prepare"] .filter-count').textContent = `(${prepareCount})`;
        }
    }
    
    // フィルター関数
    filterByCategory(categories) {
        return this.orders.filter(order => {
            if (order.deleted) return false;
            return order.products?.some(p => categories.includes(p.category));
        });
    }
    
    // 本日のオーダーをフィルタリング
    filterTodayOrders() {
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD形式
        
        return this.orders.filter(order => {
            if (order.deleted) return false;
            if (order.completed) return false; // 完了済みは除外
            
            // サービスに応じて参照する日付を決定
            let targetDate = null;
            
            switch(order.service) {
                case 'pickup':
                    // お引き取り日を参照
                    targetDate = order.date_from;
                    break;
                case 'delivery':
                    // 配送希望日を参照
                    targetDate = order.date_from;
                    break;
                case 'shipping':
                    // 発送日を参照（発送日が設定されている場合はそれを、なければ着希望日）
                    targetDate = order.shipping_date || order.date_from;
                    break;
                case 'construction':
                    // 施工日を参照
                    targetDate = order.date_from;
                    break;
            }
            
            // 日付が本日と一致するかチェック
            return targetDate === todayStr;
        });
    }
    
    // ドライ引取待ちフィルター（未完了・お引き取り・準備完了）
    filterDryPickup() {
        return this.orders.filter(order => {
            if (order.deleted) return false;
            if (order.completed) return false;
            
            // ドライフラワーの商品があるか
            const hasDryFlower = order.products?.some(p => p.category === 'dryflower');
            if (!hasDryFlower) return false;
            
            // お引き取りサービスかチェック
            if (order.service !== 'pickup') return false;
            
            // 最新の作業状態を取得（履歴または現在の状態）
            const latestWorkStatus = this.getLatestWorkStatus(order);
            return latestWorkStatus === '準備完了';
        });
    }
    
    // ドライ制作未フィルター（未完了・お引き取り・準備完了ではない）
    filterDryProduction() {
        return this.orders.filter(order => {
            if (order.deleted) return false;
            if (order.completed) return false;
            
            // ドライフラワーの商品があるか
            const hasDryFlower = order.products?.some(p => p.category === 'dryflower');
            if (!hasDryFlower) return false;
            
            // お引き取りサービスかチェック
            if (order.service !== 'pickup') return false;
            
            // 最新の作業状態を取得（履歴または現在の状態）
            const latestWorkStatus = this.getLatestWorkStatus(order);
            return latestWorkStatus !== '準備完了';
        });
    }
    
    // ドライ準備未フィルター（未完了・配送/発送/出張施工）
    filterDryPrepare() {
        return this.orders.filter(order => {
            if (order.deleted) return false;
            if (order.completed) return false;
            
            // ドライフラワーの商品があるか
            const hasDryFlower = order.products?.some(p => p.category === 'dryflower');
            if (!hasDryFlower) return false;
            
            // 配送、発送、出張施工のいずれか
            return order.service === 'delivery' || order.service === 'shipping' || order.service === 'construction';
        });
    }
    
    // 最新の作業状態を取得（履歴または現在の状態から）
    getLatestWorkStatus(order) {
        // 履歴がある場合は最新のものを返す
        if (order.work_status_history && order.work_status_history.length > 0) {
            return order.work_status_history[order.work_status_history.length - 1].status;
        }
        // 履歴がない場合は現在の状態を返す
        return order.work_status || null;
    }
    
    // 植物引取待ちフィルター（未完了・お引き取り・準備完了）
    filterPlantPickup() {
        return this.orders.filter(order => {
            if (order.deleted) return false;
            if (order.completed) return false;
            
            // 植物関連の商品があるか（plant, tree, construction）
            const hasPlant = order.products?.some(p => 
                p.category === 'plant' || p.category === 'tree' || p.category === 'construction'
            );
            if (!hasPlant) return false;
            
            // お引き取りサービスかチェック
            if (order.service !== 'pickup') return false;
            
            // 最新の作業状態が「準備完了」
            const latestWorkStatus = this.getLatestWorkStatus(order);
            return latestWorkStatus === '準備完了';
        });
    }
    
    // 植物植え替え等未フィルター（未完了・お引き取り・準備完了ではない）
    filterPlantWork() {
        return this.orders.filter(order => {
            if (order.deleted) return false;
            if (order.completed) return false;
            
            // 植物関連の商品があるか（plant, tree, construction）
            const hasPlant = order.products?.some(p => 
                p.category === 'plant' || p.category === 'tree' || p.category === 'construction'
            );
            if (!hasPlant) return false;
            
            // お引き取りサービスかチェック
            if (order.service !== 'pickup') return false;
            
            // 最新の作業状態が「準備完了」ではない
            const latestWorkStatus = this.getLatestWorkStatus(order);
            return latestWorkStatus !== '準備完了';
        });
    }
    
    // 植物準備未フィルター（未完了・配送/発送/出張施工）
    filterPlantPrepare() {
        return this.orders.filter(order => {
            if (order.deleted) return false;
            if (order.completed) return false;
            
            // 植物関連の商品があるか（plant, tree, construction）
            const hasPlant = order.products?.some(p => 
                p.category === 'plant' || p.category === 'tree' || p.category === 'construction'
            );
            if (!hasPlant) return false;
            
            // 配送、発送、出張施工のいずれか
            return order.service === 'delivery' || order.service === 'shipping' || order.service === 'construction';
        });
    }
    
    filterByProgress() {
        return this.orders.filter(o => !o.deleted && o.work_started && !o.completed);
    }
    
    filterByIncomplete() {
        return this.orders.filter(o => !o.deleted && !o.completed);
    }
    
    filterByCompleted() {
        return this.orders.filter(o => !o.deleted && o.completed);
    }
    
    // サービスラベル更新
    updateServiceLabels(service) {
        const dateLabel = document.getElementById('date-label');
        const timeLabel = document.getElementById('time-label');
        const shippingSection = document.getElementById('shipping-date-section');
        const deliverySection = document.getElementById('delivery-section');
        const shippingCostSection = document.getElementById('shipping-cost-section');
        
        // デフォルト
        shippingSection.classList.add('hidden');
        deliverySection.classList.add('hidden');
        shippingCostSection.classList.add('hidden');
        
        switch(service) {
            case 'pickup':
                dateLabel.textContent = 'お引き取り日';
                timeLabel.textContent = 'ご来店時間';
                break;
            case 'delivery':
                dateLabel.textContent = '配送希望日';
                timeLabel.textContent = '配送希望時間';
                deliverySection.classList.remove('hidden');
                shippingCostSection.classList.remove('hidden');
                break;
            case 'shipping':
                dateLabel.textContent = '着希望日';
                timeLabel.textContent = '着希望時間';
                shippingSection.classList.remove('hidden');
                deliverySection.classList.remove('hidden');
                shippingCostSection.classList.remove('hidden');
                break;
            case 'construction':
                dateLabel.textContent = '施工日';
                timeLabel.textContent = '施工時間';
                deliverySection.classList.remove('hidden');
                break;
        }
    }
    
    // サービスオプション更新（送料のデフォルト値設定を含む）
    updateServiceOptions() {
        const service = document.querySelector('input[name="service"]:checked')?.value;
        if (!service) return;
        
        // ラベルの更新
        this.updateServiceLabels(service);
        
        // 送料のデフォルト値設定
        const shippingCostInput = document.getElementById('shipping-cost');
        if (shippingCostInput) {
            switch(service) {
                case 'delivery':
                    // 配送の場合は1650円をデフォルト
                    if (!shippingCostInput.value || shippingCostInput.value === '0') {
                        shippingCostInput.value = 1650;
                    }
                    break;
                case 'shipping':
                    // 発送の場合は880円をデフォルト
                    if (!shippingCostInput.value || shippingCostInput.value === '0') {
                        shippingCostInput.value = 880;
                    }
                    break;
                default:
                    // その他の場合は0円
                    shippingCostInput.value = 0;
                    break;
            }
            // 合計金額を更新
            this.updateTotal();
        }
    }
    
    // ステップ進行
    nextStep(currentStep) {
        // 現在のステップの検証
        if (!this.validateStep(currentStep)) return;
        
        // 次のステップを表示
        const nextStep = currentStep + 1;
        if (nextStep <= 4) {
            document.getElementById(`step-${currentStep}`).classList.remove('active');
            document.getElementById(`step-${nextStep}`).classList.add('active');
            
            // スムーズスクロール
            document.getElementById(`step-${nextStep}`).scrollIntoView({ behavior: 'smooth' });
            
            this.currentStep = nextStep;
        }
    }
    
    // ステップ検証
    validateStep(step) {
        switch(step) {
            case 1:
                const receptionDate = document.getElementById('reception-date').value;
                const service = document.querySelector('input[name="service"]:checked');
                if (!receptionDate || !service) {
                    this.showToast('必須項目を入力してください', 'error');
                    return false;
                }
                break;
            case 2:
                const customerName = document.getElementById('customer-name').value;
                const customerPhone = document.getElementById('customer-phone').value;
                if (!customerName || !customerPhone) {
                    this.showToast('お名前と電話番号は必須です', 'error');
                    return false;
                }
                break;
            case 3:
                if (this.addedProducts.length === 0) {
                    this.showToast('商品を追加してください', 'error');
                    return false;
                }
                break;
        }
        return true;
    }
    
    // 商品フォーム表示
    showProductForm(category) {
        const container = document.getElementById('product-form-container');
        const step3 = document.getElementById('step-3');
        
        // フェードアウト
        if (step3) {
            step3.style.transition = 'opacity 0.2s ease-out';
            step3.style.opacity = '0';
        }
        
        setTimeout(() => {
            // フォーム内容を設定
            container.innerHTML = this.getProductFormHTML(category);
            container.classList.remove('hidden');
            
            // アニメーションクラスを追加
            container.classList.add('product-form-animate');
            
            // 他のセクションを非表示にする
            this.hideOtherSectionsForProduct();
            
            // フェードイン
            if (step3) {
                step3.style.opacity = '1';
            }
            
            // 商品備考欄の後にボタンを追加
            const productNotesDiv = document.querySelector('#product-notes').parentElement;
            if (productNotesDiv) {
                // 既存のボタンがあれば削除
                const existingButtons = document.getElementById('product-form-buttons');
                if (existingButtons) {
                    existingButtons.remove();
                }
                
                // ボタンテキストを決定
                const addButtonText = category === 'construction' ? '施工を追加' : '商品を追加';
                
                // ボタンを作成
                const buttonsDiv = document.createElement('div');
                buttonsDiv.id = 'product-form-buttons';
                buttonsDiv.className = 'grid grid-cols-2 gap-3 mt-4';
                buttonsDiv.innerHTML = `
                    <button type="button" onclick="app.hideProductForm()" class="btn-secondary">
                        キャンセル
                    </button>
                    <button type="button" onclick="app.addProduct('${category}')" class="btn-primary">
                        ${addButtonText}
                    </button>
                `;
                
                // 商品備考欄の後に挿入
                productNotesDiv.insertAdjacentElement('afterend', buttonsDiv);
            }
            
            // フォーカス
            setTimeout(() => {
                container.querySelector('input, select')?.focus();
            }, 100);
        }, 200);
    }
    
    // 商品フォーム表示時に他のセクションを非表示
    hideOtherSectionsForProduct() {
        // ステップ1,2,4を非表示（display: none を使用）
        const step1 = document.getElementById('step-1');
        const step2 = document.getElementById('step-2');
        const step4 = document.getElementById('step-4');
        
        if (step1) {
            step1.style.display = 'none';
        }
        if (step2) {
            step2.style.display = 'none';
        }
        if (step4) {
            step4.style.display = 'none';
        }
        
        // 商品カテゴリボタンを非表示
        const categoryButtons = document.querySelector('.grid.grid-cols-3.gap-3.mb-4');
        if (categoryButtons) {
            categoryButtons.style.display = 'none';
        }
        
        // 追加済み商品リストを非表示
        const addedProducts = document.getElementById('added-products');
        if (addedProducts) {
            addedProducts.style.display = 'none';
        }
        
        // タブナビゲーション全体を非表示（検索タブを含むすべてのタブを隠す）
        const tabNav = document.querySelector('nav.bg-white.border-b');
        if (tabNav) {
            tabNav.style.display = 'none';
            tabNav.style.pointerEvents = 'none';
        }
        
        // さらに確実にするため、すべてのタブボタンを非表示
        const allTabButtons = document.querySelectorAll('.tab-btn');
        allTabButtons.forEach(btn => {
            btn.style.display = 'none';
            btn.style.visibility = 'hidden';
            btn.style.pointerEvents = 'none';
        })
        
        // 特に検索タブボタンを確実に非表示
        const searchTabBtn = document.querySelector('[data-tab="search"]');
        if (searchTabBtn) {
            searchTabBtn.style.display = 'none';
            searchTabBtn.style.visibility = 'hidden';
            searchTabBtn.style.pointerEvents = 'none';
            searchTabBtn.setAttribute('disabled', 'true');
        }
        
        // 送料セクションを非表示
        const shippingSection = document.getElementById('shipping-cost-section');
        if (shippingSection) {
            shippingSection.style.display = 'none';
        }
        
        // 商品備考セクションを非表示
        const productNotesSection = document.querySelector('#product-notes')?.parentElement;
        if (productNotesSection) {
            productNotesSection.style.display = 'none';
        }
        
        // 次へボタンコンテナを非表示
        const nextBtnContainer = document.querySelector('#step-3 > div.bg-white > div.mt-4.pt-4.border-t:last-child');
        if (nextBtnContainer) {
            nextBtnContainer.style.display = 'none';
        }
    }
    
    // 商品フォーム非表示時に他のセクションを表示
    showOtherSectionsForProduct() {
        // ステップ1,2,4を表示（activeクラスがある場合のみ）
        const step1 = document.getElementById('step-1');
        const step2 = document.getElementById('step-2');
        const step4 = document.getElementById('step-4');
        
        if (step1?.classList.contains('active')) {
            step1.style.display = '';
        }
        if (step2?.classList.contains('active')) {
            step2.style.display = '';
        }
        if (step4?.classList.contains('active')) {
            step4.style.display = '';
        }
        
        // 商品カテゴリボタンを表示
        const categoryButtons = document.querySelector('.grid.grid-cols-3.gap-3.mb-4');
        if (categoryButtons) {
            categoryButtons.style.display = '';
        }
        
        // 追加済み商品リストを表示
        const addedProducts = document.getElementById('added-products');
        if (addedProducts) {
            addedProducts.style.display = '';
        }
        
        // タブナビゲーション全体を再表示
        const tabNav = document.querySelector('nav.bg-white.border-b');
        if (tabNav) {
            tabNav.style.display = '';
            tabNav.style.pointerEvents = '';
        }
        
        // すべてのタブボタンを再表示
        const allTabButtons = document.querySelectorAll('.tab-btn');
        allTabButtons.forEach(btn => {
            btn.style.display = '';
            btn.style.visibility = '';
            btn.style.pointerEvents = '';
        })
        
        // 検索タブボタンも確実に再表示
        const searchTabBtn = document.querySelector('[data-tab="search"]');
        if (searchTabBtn) {
            searchTabBtn.style.display = '';
            searchTabBtn.style.visibility = '';
            searchTabBtn.style.pointerEvents = '';
            searchTabBtn.removeAttribute('disabled');
        }
        
        // 送料セクションを表示（必要な場合）
        const service = document.querySelector('input[name="service"]:checked')?.value;
        const shippingSection = document.getElementById('shipping-cost-section');
        if (shippingSection) {
            if (service === 'delivery' || service === 'shipping') {
                shippingSection.style.display = '';
            }
        }
        
        // 商品備考セクションを表示
        const productNotesSection = document.querySelector('#product-notes')?.parentElement;
        if (productNotesSection) {
            productNotesSection.style.display = '';
        }
        
        // 次へボタンコンテナを表示（編集モードでない場合）
        if (!this.editingOrderId) {
            const nextBtnContainer = document.querySelector('#step-3 > div.bg-white > div.mt-4.pt-4.border-t:last-child');
            if (nextBtnContainer) {
                nextBtnContainer.style.display = '';
            }
        }
    }
    
    // 商品フォームHTML生成
    getProductFormHTML(category) {
        switch(category) {
            case 'dryflower':
                return this.getDryflowerFormHTML();
            case 'plant':
                return this.getPlantFormHTML();
            case 'tree':
                return this.getTreeFormHTML();
            case 'construction':
                return this.getConstructionFormHTML();
            default:
                return '';
        }
    }
    
    // ドライフラワーフォーム
    getDryflowerFormHTML() {
        return `
            <div class="border-t pt-4">
                <h4 class="font-bold text-sage-dark mb-3">
                    <i class="fas fa-flower text-terracotta mr-2"></i>
                    ドライフラワー商品
                </h4>
                <div class="space-y-4">
                    <div>
                        <label class="input-label">商品タイプ</label>
                        <select id="df-type" class="input-field" onchange="app.updateDryflowerOptions()">
                            <option value="">選択してください</option>
                            <option value="スワッグ">スワッグ</option>
                            <option value="ドライフラワーブーケ">ドライフラワーブーケ</option>
                            <option value="ボトルアレンジ">ボトルアレンジ</option>
                            <option value="フレームアレンジ">フレームアレンジ</option>
                            <option value="資材アレンジ">資材アレンジ</option>
                            <option value="ツインスワッグ">ツインスワッグ</option>
                            <option value="リングチャーム">リングチャーム</option>
                            <option value="ウェディングブーケ">ウェディングブーケ</option>
                            <option value="ブートニア/コサージュ">ブートニア/コサージュ</option>
                            <option value="ヘッドパーツ">ヘッドパーツ</option>
                            <option value="持ち込みリメイク">持ち込みリメイク</option>
                            <option value="卸商品">卸商品</option>
                            <option value="その他">その他</option>
                        </select>
                    </div>
                    
                    <div id="df-other-input" class="hidden">
                        <label class="input-label">商品タイプ詳細</label>
                        <input type="text" id="df-type-detail" class="input-field" placeholder="その他の商品タイプを入力">
                    </div>
                    
                    <div id="df-size-container" class="hidden">
                        <label class="input-label">サイズ</label>
                        <select id="df-size" class="input-field" onchange="app.updateDryflowerPrice()">
                            <option value="">選択してください</option>
                        </select>
                    </div>
                    
                    <div>
                        <label class="input-label">価格</label>
                        <div class="flex items-center gap-2">
                            <input type="number" id="df-price" class="input-field flex-1" placeholder="0" min="0" step="10">
                            <span class="text-gray-600">円</span>
                        </div>
                    </div>
                    
                    <div>
                        <label class="input-label">詳細</label>
                        <input type="text" id="df-details" class="input-field" placeholder="色・イメージなど">
                    </div>
                    
                    <div id="df-frame-text" class="hidden">
                        <label class="input-label">フレーム文字入れ　カッティングシート</label>
                        <select id="df-frame-option" class="input-field" onchange="app.updateFrameTextOptions()">
                            <option value="文字入れ不要">文字入れ不要 ¥0</option>
                            <option value="1か所通常">シートサイズ縦10cm横15cm以内 ¥2,200</option>
                            <option value="2か所以上通常">シートサイズ縦15cm横25cm以内 ¥3,300</option>
                            <option value="1か所最短">※4営業日以内制作 シートサイズ縦10cm横15cm以内 ¥3,300</option>
                            <option value="2か所以上最短">※4営業日以内制作 シートサイズ縦15cm横25cm以内 ¥4,400</option>
                        </select>
                    </div>
                    
                    <div id="df-frame-dates" class="hidden space-y-4">
                        <div>
                            <label class="input-label">文字発注日</label>
                            <input type="date" id="df-text-order-date" class="input-field" onchange="app.updateTextReceiveDate()">
                        </div>
                        <div>
                            <label class="input-label">文字受取予定日</label>
                            <input type="date" id="df-text-receive-date" class="input-field">
                            <p id="df-receive-date-hint" class="text-xs text-gray-600 mt-1"></p>
                        </div>
                    </div>
                    
                    <div>
                        <label class="input-label">メッセージカード・立札</label>
                        <div class="space-y-2">
                            <label class="checkbox-label">
                                <input type="checkbox" id="df-message-card" onchange="app.toggleMessageInput('df', 'message-card')">
                                <span class="ml-2">メッセージカード</span>
                            </label>
                            <label class="checkbox-label">
                                <input type="checkbox" id="df-celebration-sign" onchange="app.toggleMessageInput('df', 'celebration-sign')">
                                <span class="ml-2">お祝い立札</span>
                            </label>
                        </div>
                    </div>
                    
                    <div id="df-message-card-input" class="hidden">
                        <label class="input-label">メッセージカード内容</label>
                        <textarea id="df-message-card-content" class="input-field" rows="2" placeholder="メッセージ内容を入力"></textarea>
                    </div>
                    
                    <div id="df-celebration-sign-input" class="hidden">
                        <label class="input-label">お祝い立札内容</label>
                        <textarea id="df-celebration-sign-content" class="input-field" rows="2" placeholder="立札内容を入力"></textarea>
                    </div>
                    
                    <div>
                        <label class="input-label">写真送付</label>
                        <select id="df-photo" class="input-field">
                            <option value="不要">不要</option>
                            <option value="要">要</option>
                        </select>
                    </div>
                    
                    <div>
                        <label class="input-label">連絡</label>
                        <select id="df-contact" class="input-field" onchange="app.updateContactMethod('df')">
                            <option value="">選択してください</option>
                            <option value="出来次第の連絡要">出来次第の連絡要</option>
                            <option value="発送完了のお知らせ要">発送完了のお知らせ要</option>
                            <option value="その他連絡要">その他連絡要</option>
                            <option value="連絡不要">連絡不要</option>
                        </select>
                    </div>
                    
                    <div id="df-other-contact" class="hidden">
                        <label class="input-label">その他連絡内容</label>
                        <input type="text" id="df-other-contact-detail" class="input-field" placeholder="連絡内容を入力">
                    </div>
                    
                    <div id="df-contact-method" class="hidden">
                        <label class="input-label">連絡方法</label>
                        <select id="df-method" class="input-field" onchange="app.updateContactMethodOther('df')">
                            <option value="TEL">TEL</option>
                            <option value="メール">メール</option>
                            <option value="インスタグラムDM">インスタグラムDM</option>
                            <option value="その他">その他</option>
                        </select>
                        <input type="text" id="df-method-other" class="input-field mt-2 hidden" placeholder="連絡方法を入力">
                    </div>
                    
                    <div id="df-contact-deadline" class="hidden">
                        <label class="input-label">連絡期日 <span class="text-red-500">*</span></label>
                        <input type="date" id="df-deadline-date" class="input-field" onchange="app.updateDeadlineDisplay('df')">
                        <p id="df-deadline-display" class="text-sm text-terracotta mt-1"></p>
                    </div>
                </div>
            </div>
        `;
    }
    
    // 観葉植物フォーム
    getPlantFormHTML() {
        return `
            <div class="border-t pt-4">
                <h4 class="font-bold text-sage-dark mb-3">
                    <i class="fas fa-leaf text-sage mr-2"></i>
                    観葉植物・資材
                </h4>
                <div class="space-y-4">
                    <div>
                        <label class="input-label">商品ジャンル <span class="text-red-500">*</span></label>
                        <select id="plant-genre" class="input-field" onchange="app.updatePlantGenre()">
                            <option value="">選択してください</option>
                            <option value="観葉植物">観葉植物</option>
                            <option value="鉢(ポット・プランター)">鉢(ポット・プランター)</option>
                            <option value="鉢皿">鉢皿</option>
                            <option value="観葉資材(室内)">観葉資材(室内)</option>
                            <option value="薬剤">薬剤</option>
                            <option value="培養土">培養土</option>
                            <option value="植替え">植替え</option>
                            <option value="出張費">出張費</option>
                            <option value="その他経費">その他経費</option>
                        </select>
                    </div>
                    
                    <div id="plant-other-input" class="hidden">
                        <label class="input-label">その他経費詳細</label>
                        <input type="text" id="plant-genre-detail" class="input-field" placeholder="経費の内容を入力">
                    </div>
                    
                    <div>
                        <label class="input-label">商品名</label>
                        <input type="text" id="plant-name" class="input-field" placeholder="例：パキラ（任意）">
                    </div>
                    
                    <div>
                        <label class="input-label">価格</label>
                        <div class="flex items-center gap-2">
                            <input type="number" id="plant-price" class="input-field flex-1" placeholder="0" min="0" step="10">
                            <span class="text-gray-600">円</span>
                        </div>
                    </div>
                    
                    <div>
                        <label class="input-label">メッセージカード・立札</label>
                        <div class="space-y-2">
                            <label class="checkbox-label">
                                <input type="checkbox" id="plant-message-card" onchange="app.toggleMessageInput('plant', 'message-card')">
                                <span class="ml-2">メッセージカード</span>
                            </label>
                            <label class="checkbox-label">
                                <input type="checkbox" id="plant-celebration-sign" onchange="app.toggleMessageInput('plant', 'celebration-sign')">
                                <span class="ml-2">お祝い立札</span>
                            </label>
                        </div>
                    </div>
                    
                    <div id="plant-message-card-input" class="hidden">
                        <label class="input-label">メッセージカード内容</label>
                        <textarea id="plant-message-card-content" class="input-field" rows="2" placeholder="メッセージ内容を入力"></textarea>
                    </div>
                    
                    <div id="plant-celebration-sign-input" class="hidden">
                        <label class="input-label">お祝い立札内容</label>
                        <textarea id="plant-celebration-sign-content" class="input-field" rows="2" placeholder="立札内容を入力"></textarea>
                    </div>
                    
                    <div>
                        <label class="input-label">写真送付</label>
                        <select id="plant-photo" class="input-field">
                            <option value="不要">不要</option>
                            <option value="要">要</option>
                        </select>
                    </div>
                    
                    <div>
                        <label class="input-label">連絡</label>
                        <select id="plant-contact" class="input-field" onchange="app.updateContactMethod('plant')">
                            <option value="">選択してください</option>
                            <option value="出来次第の連絡要">出来次第の連絡要</option>
                            <option value="発送完了のお知らせ要">発送完了のお知らせ要</option>
                            <option value="その他連絡要">その他連絡要</option>
                            <option value="連絡不要">連絡不要</option>
                        </select>
                    </div>
                    
                    <div id="plant-other-contact" class="hidden">
                        <label class="input-label">その他連絡内容</label>
                        <input type="text" id="plant-other-contact-detail" class="input-field" placeholder="連絡内容を入力">
                    </div>
                    
                    <div id="plant-contact-method" class="hidden">
                        <label class="input-label">連絡方法</label>
                        <select id="plant-method" class="input-field" onchange="app.updateContactMethodOther('plant')">
                            <option value="TEL">TEL</option>
                            <option value="メール">メール</option>
                            <option value="インスタグラムDM">インスタグラムDM</option>
                            <option value="その他">その他</option>
                        </select>
                        <input type="text" id="plant-method-other" class="input-field mt-2 hidden" placeholder="連絡方法を入力">
                    </div>
                    
                    <div id="plant-contact-deadline" class="hidden">
                        <label class="input-label">連絡期日 <span class="text-red-500">*</span></label>
                        <input type="date" id="plant-deadline-date" class="input-field" onchange="app.updateDeadlineDisplay('plant')">
                        <p id="plant-deadline-display" class="text-sm text-terracotta mt-1"></p>
                    </div>
                </div>
            </div>
        `;
    }
    
    // 植木フォーム
    getTreeFormHTML() {
        return `
            <div class="border-t pt-4">
                <h4 class="font-bold text-sage-dark mb-3">
                    <i class="fas fa-tree text-forest mr-2"></i>
                    植木・資材
                </h4>
                <div class="space-y-4">
                    <div>
                        <label class="input-label">商品ジャンル <span class="text-red-500">*</span></label>
                        <select id="tree-genre" class="input-field" onchange="app.updateTreeGenre()">
                            <option value="">選択してください</option>
                            <option value="植木">植木</option>
                            <option value="植木資材(屋外)">植木資材(屋外)</option>
                            <option value="石材">石材</option>
                            <option value="石材施工費">石材施工費</option>
                            <option value="支柱">支柱</option>
                            <option value="薬剤">薬剤</option>
                            <option value="培養土">培養土</option>
                            <option value="植栽費">植栽費</option>
                            <option value="出張費">出張費</option>
                            <option value="その他経費">その他経費</option>
                        </select>
                    </div>
                    
                    <div id="tree-other-input" class="hidden">
                        <label class="input-label">その他経費詳細</label>
                        <input type="text" id="tree-genre-detail" class="input-field" placeholder="経費の内容を入力">
                    </div>
                    
                    <div>
                        <label class="input-label">商品名</label>
                        <input type="text" id="tree-name" class="input-field" placeholder="例：シマトネリコ（任意）">
                    </div>
                    
                    <div>
                        <label class="input-label">高さ</label>
                        <input type="text" id="tree-height" class="input-field" placeholder="例：1.5m（任意）">
                    </div>
                    
                    <div>
                        <label class="input-label">価格</label>
                        <div class="flex items-center gap-2">
                            <input type="number" id="tree-price" class="input-field flex-1" placeholder="0" min="0" step="10">
                            <span class="text-gray-600">円</span>
                        </div>
                    </div>
                    
                    <div>
                        <label class="input-label">メッセージカード・立札</label>
                        <div class="space-y-2">
                            <label class="checkbox-label">
                                <input type="checkbox" id="tree-message-card" onchange="app.toggleMessageInput('tree', 'message-card')">
                                <span class="ml-2">メッセージカード</span>
                            </label>
                            <label class="checkbox-label">
                                <input type="checkbox" id="tree-celebration-sign" onchange="app.toggleMessageInput('tree', 'celebration-sign')">
                                <span class="ml-2">お祝い立札</span>
                            </label>
                        </div>
                    </div>
                    
                    <div id="tree-message-card-input" class="hidden">
                        <label class="input-label">メッセージカード内容</label>
                        <textarea id="tree-message-card-content" class="input-field" rows="2" placeholder="メッセージ内容を入力"></textarea>
                    </div>
                    
                    <div id="tree-celebration-sign-input" class="hidden">
                        <label class="input-label">お祝い立札内容</label>
                        <textarea id="tree-celebration-sign-content" class="input-field" rows="2" placeholder="立札内容を入力"></textarea>
                    </div>
                    
                    <div>
                        <label class="input-label">写真送付</label>
                        <select id="tree-photo" class="input-field">
                            <option value="不要">不要</option>
                            <option value="要">要</option>
                        </select>
                    </div>
                    
                    <div>
                        <label class="input-label">連絡</label>
                        <select id="tree-contact" class="input-field" onchange="app.updateContactMethod('tree')">
                            <option value="">選択してください</option>
                            <option value="出来次第の連絡要">出来次第の連絡要</option>
                            <option value="発送完了のお知らせ要">発送完了のお知らせ要</option>
                            <option value="その他連絡要">その他連絡要</option>
                            <option value="連絡不要">連絡不要</option>
                        </select>
                    </div>
                    
                    <div id="tree-other-contact" class="hidden">
                        <label class="input-label">その他連絡内容</label>
                        <input type="text" id="tree-other-contact-detail" class="input-field" placeholder="連絡内容を入力">
                    </div>
                    
                    <div id="tree-contact-method" class="hidden">
                        <label class="input-label">連絡方法</label>
                        <select id="tree-method" class="input-field" onchange="app.updateContactMethodOther('tree')">
                            <option value="TEL">TEL</option>
                            <option value="メール">メール</option>
                            <option value="インスタグラムDM">インスタグラムDM</option>
                            <option value="その他">その他</option>
                        </select>
                        <input type="text" id="tree-method-other" class="input-field mt-2 hidden" placeholder="連絡方法を入力">
                    </div>
                    
                    <div id="tree-contact-deadline" class="hidden">
                        <label class="input-label">連絡期日 <span class="text-red-500">*</span></label>
                        <input type="date" id="tree-deadline-date" class="input-field" onchange="app.updateDeadlineDisplay('tree')">
                        <p id="tree-deadline-display" class="text-sm text-terracotta mt-1"></p>
                    </div>
                    

                </div>
            </div>
        `;
    }
    
    // 出張施工フォーム
    getConstructionFormHTML() {
        return `
            <div class="border-t pt-4">
                <h4 class="font-bold text-sage-dark mb-3">
                    <i class="fas fa-hard-hat text-forest mr-2"></i>
                    出張施工
                </h4>
                <div class="space-y-4">
                    <div>
                        <label class="input-label">施工内容</label>
                        <textarea id="construction-details" class="input-field" rows="2" placeholder="施工内容を入力"></textarea>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="input-label">出張費</label>
                            <div class="flex items-center gap-2">
                                <input type="number" id="construction-travel" class="input-field flex-1" placeholder="0" min="0" step="10">
                                <span class="text-gray-600 text-sm">円</span>
                            </div>
                        </div>
                        <div>
                            <label class="input-label">植栽費</label>
                            <div class="flex items-center gap-2">
                                <input type="number" id="construction-planting" class="input-field flex-1" placeholder="0" min="0" step="10">
                                <span class="text-gray-600 text-sm">円</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="input-label">割栗石</label>
                            <div class="flex items-center gap-2">
                                <input type="number" id="construction-gravel" class="input-field flex-1" placeholder="0" min="0" step="10">
                                <span class="text-gray-600 text-sm">円</span>
                            </div>
                        </div>
                        <div>
                            <label class="input-label">石材施工</label>
                            <div class="flex items-center gap-2">
                                <input type="number" id="construction-stone" class="input-field flex-1" placeholder="0" min="0" step="10">
                                <span class="text-gray-600 text-sm">円</span>
                            </div>
                        </div>
                    </div>
                    
                    <div>
                        <label class="input-label">その他</label>
                        <div class="flex items-center gap-2">
                            <input type="number" id="construction-other" class="input-field flex-1" placeholder="0" min="0" step="10">
                            <span class="text-gray-600">円</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    // 商品フォームを隠す
    hideProductForm() {
        const container = document.getElementById('product-form-container');
        
        // フェードアウトアニメーション
        container.style.transition = 'opacity 0.2s ease-out';
        container.style.opacity = '0';
        
        setTimeout(() => {
            // ホワイトアウトアニメーション
            this.triggerWhiteout(() => {
                container.style.opacity = '1';
                container.classList.add('hidden');
                container.classList.remove('product-form-animate');
                container.innerHTML = '';
                this.editingProductIndex = null;  // 編集モードをリセット
                
                // ボタンも削除
                const buttons = document.getElementById('product-form-buttons');
                if (buttons) {
                    buttons.remove();
                }
                
                // 他のセクションを再表示
                this.showOtherSectionsForProduct();
            });
        }, 200);
    }
    
    // ホワイトアウトアニメーション
    triggerWhiteout(callback) {
        const overlay = document.getElementById('whiteout-overlay');
        
        // オーバーレイが存在しない場合は直接実行
        if (!overlay) {
            console.error('Whiteout overlay not found');
            if (callback) callback();
            return;
        }
        
        // アニメーション開始
        overlay.classList.add('active');
        
        // 150ms後に処理実行
        setTimeout(() => {
            if (callback) callback();
            
            // さらに50ms後にフェードアウト
            setTimeout(() => {
                overlay.classList.remove('active');
            }, 50);
        }, 150);
    }
    
    // ドライフラワーオプション更新
    updateDryflowerOptions() {
        const type = document.getElementById('df-type').value;
        const sizeContainer = document.getElementById('df-size-container');
        const sizeSelect = document.getElementById('df-size');
        const frameText = document.getElementById('df-frame-text');
        const frameDates = document.getElementById('df-frame-dates');
        const otherInput = document.getElementById('df-other-input');
        
        // その他入力欄の表示制御
        if (type === 'その他') {
            otherInput.classList.remove('hidden');
        } else {
            otherInput.classList.add('hidden');
            document.getElementById('df-type-detail').value = '';
        }
        
        // サイズオプション
        const sizeOptions = {
            'ドライフラワーブーケ': [
                { value: 'S', label: 'S (¥3,300)' },
                { value: 'M', label: 'M (¥5,500)' },
                { value: 'L', label: 'L (¥11,000)' },
                { value: '任意', label: '任意のサイズ' }
            ],
            'ボトルアレンジ': [
                { value: 'S', label: 'S (¥2,200)' },
                { value: 'M', label: 'M (¥4,400)' },
                { value: '任意', label: '任意のサイズ' }
            ],
            'フレームアレンジ': [
                { value: 'S', label: 'S (¥5,500)' },
                { value: 'M', label: 'M (¥8,800)' },
                { value: 'L', label: 'L (¥11,000)' },
                { value: 'LL', label: 'LL (¥16,500)' }
            ]
        };
        
        // サイズ表示制御
        if (sizeOptions[type]) {
            sizeContainer.classList.remove('hidden');
            sizeSelect.innerHTML = '<option value="">選択してください</option>';
            sizeOptions[type].forEach(option => {
                sizeSelect.innerHTML += `<option value="${option.value}">${option.label}</option>`;
            });
        } else {
            sizeContainer.classList.add('hidden');
        }
        
        // フレーム文字入れ表示制御
        if (type === 'フレームアレンジ') {
            frameText.classList.remove('hidden');
        } else {
            frameText.classList.add('hidden');
            frameDates.classList.add('hidden');
            // フォームをリセット
            document.getElementById('df-frame-option').value = '文字入れ不要';
            document.getElementById('df-text-order-date').value = '';
            document.getElementById('df-text-receive-date').value = '';
        }
    }
    
    // 観葉植物ジャンル更新
    updatePlantGenre() {
        const genre = document.getElementById('plant-genre').value;
        const otherInput = document.getElementById('plant-other-input');
        
        // その他経費入力欄の表示制御
        if (genre === 'その他経費') {
            otherInput.classList.remove('hidden');
        } else {
            otherInput.classList.add('hidden');
            document.getElementById('plant-genre-detail').value = '';
        }
    }
    
    // 植木ジャンル更新
    updateTreeGenre() {
        const genre = document.getElementById('tree-genre').value;
        const otherInput = document.getElementById('tree-other-input');
        
        // その他経費入力欄の表示制御
        if (genre === 'その他経費') {
            otherInput.classList.remove('hidden');
        } else {
            otherInput.classList.add('hidden');
            document.getElementById('tree-genre-detail').value = '';
        }
    }
    
    // フレーム文字入れオプション更新
    updateFrameTextOptions() {
        const type = document.getElementById('df-type').value;
        const frameOption = document.getElementById('df-frame-option').value;
        const frameDates = document.getElementById('df-frame-dates');
        
        // フレームアレンジかつ文字入れ不要以外の場合
        if (type === 'フレームアレンジ' && frameOption !== '文字入れ不要') {
            frameDates.classList.remove('hidden');
            // 今日の日付を文字発注日のデフォルトに設定
            if (!document.getElementById('df-text-order-date').value) {
                document.getElementById('df-text-order-date').value = new Date().toISOString().split('T')[0];
            }
            // オプション変更時は必ず受取日の制限を更新
            this.updateTextReceiveDate();
        } else {
            frameDates.classList.add('hidden');
            document.getElementById('df-text-order-date').value = '';
            document.getElementById('df-text-receive-date').value = '';
        }
        
        // 価格を更新
        this.updateDryflowerTotalPrice();
    }
    
    // 文字受取予定日の制限を更新
    updateTextReceiveDate() {
        const orderDate = document.getElementById('df-text-order-date').value;
        const frameOption = document.getElementById('df-frame-option').value;
        const receiveInput = document.getElementById('df-text-receive-date');
        
        if (!orderDate || !receiveInput) return;
        
        const orderDateObj = new Date(orderDate);
        let businessDays = 0;
        
        // 通常は6営業日後、最短は3営業日後
        if (frameOption.includes('通常')) {
            businessDays = 6;
        } else if (frameOption.includes('最短')) {
            businessDays = 3;
        } else {
            // 文字入れ不要の場合は制限をクリア
            receiveInput.min = '';
            receiveInput.value = '';
            return;
        }
        
        // 営業日を計算（土日祝を除く）
        const minReceiveDate = this.addBusinessDays(orderDateObj, businessDays);
        
        // 最小日付を設定
        const minDateStr = minReceiveDate.toISOString().split('T')[0];
        receiveInput.min = minDateStr;
        
        // ヒント表示を更新
        const hintElement = document.getElementById('df-receive-date-hint');
        if (hintElement) {
            const formatDate = (date) => {
                const d = new Date(date);
                return `${d.getMonth() + 1}月${d.getDate()}日`;
            };
            
            if (frameOption.includes('通常')) {
                hintElement.textContent = `※通常制作: ${formatDate(minDateStr)}（${businessDays}営業日後）以降選択可能`;
                hintElement.className = 'text-xs text-blue-600 mt-1';
            } else if (frameOption.includes('最短')) {
                hintElement.textContent = `※最短制作: ${formatDate(minDateStr)}（${businessDays}営業日後）以降選択可能`;
                hintElement.className = 'text-xs text-orange-600 mt-1';
            }
        }
        
        // 現在の値が最小日付より前の場合、または
        // オプションが変更されて営業日数が変わった場合は値をリセット
        if (receiveInput.value) {
            const currentReceiveDate = new Date(receiveInput.value);
            const diffDays = this.getBusinessDaysDiff(orderDateObj, currentReceiveDate);
            
            // 通常→最短に変更時：6営業日未満なら維持可能
            // 最短→通常に変更時：6営業日未満ならリセット必要
            if (frameOption.includes('通常') && diffDays < 6) {
                // 通常の場合、6営業日未満ならリセット
                receiveInput.value = minDateStr;
                this.showToast('通常制作のため、文字受取予定日を6営業日後以降に変更しました', 'info');
            } else if (frameOption.includes('最短') && diffDays < 3) {
                // 最短の場合、3営業日未満ならリセット
                receiveInput.value = minDateStr;
                this.showToast('最短制作でも、文字受取予定日は3営業日後以降となります', 'info');
            }
            // それ以外は現在の値を維持
        } else {
            // 値が空の場合は最小日付を設定
            receiveInput.value = minDateStr;
        }
    }
    
    // 2つの日付間の営業日数を計算
    getBusinessDaysDiff(startDate, endDate) {
        let count = 0;
        const current = new Date(startDate);
        
        while (current < endDate) {
            current.setDate(current.getDate() + 1);
            const dayOfWeek = current.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                count++;
            }
        }
        
        return count;
    }
    
    // 営業日を追加する関数
    addBusinessDays(startDate, daysToAdd) {
        const result = new Date(startDate);
        let addedDays = 0;
        
        while (addedDays < daysToAdd) {
            result.setDate(result.getDate() + 1);
            
            // 土日をスキップ（0:日曜, 6:土曜）
            const dayOfWeek = result.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                addedDays++;
            }
        }
        
        return result;
    }
    
    // 連絡方法更新
    updateContactMethod(category) {
        const contact = document.getElementById(`${category}-contact`).value;
        const methodContainer = document.getElementById(`${category}-contact-method`);
        const otherContactContainer = document.getElementById(`${category}-other-contact`);
        const deadlineContainer = document.getElementById(`${category}-contact-deadline`);
        
        // その他連絡要の場合、入力欄を表示
        if (contact === 'その他連絡要') {
            otherContactContainer?.classList.remove('hidden');
        } else {
            otherContactContainer?.classList.add('hidden');
            const otherInput = document.getElementById(`${category}-other-contact-detail`);
            if (otherInput) otherInput.value = '';
        }
        
        // 連絡要が含まれる場合
        if (contact && contact.includes('要') && contact !== '連絡不要') {
            methodContainer?.classList.remove('hidden');
            deadlineContainer?.classList.remove('hidden');
            
            // 期日設定のアラート表示
            if (!document.getElementById(`${category}-deadline-date`).value) {
                setTimeout(() => {
                    this.showToast('連絡期日を設定してください', 'warning');
                    document.getElementById(`${category}-deadline-date`)?.focus();
                }, 100);
            }
        } else {
            methodContainer?.classList.add('hidden');
            deadlineContainer?.classList.add('hidden');
            // 連絡方法その他の入力欄も隠す
            const methodOther = document.getElementById(`${category}-method-other`);
            if (methodOther) methodOther.classList.add('hidden');
        }
    }
    
    // 連絡方法その他選択時の処理
    updateContactMethodOther(category) {
        const method = document.getElementById(`${category}-method`).value;
        const otherInput = document.getElementById(`${category}-method-other`);
        
        if (method === 'その他') {
            otherInput?.classList.remove('hidden');
            otherInput?.focus();
        } else {
            otherInput?.classList.add('hidden');
            if (otherInput) otherInput.value = '';
        }
    }
    
    // 期日表示更新
    updateDeadlineDisplay(category) {
        const deadlineDate = document.getElementById(`${category}-deadline-date`).value;
        const displayElement = document.getElementById(`${category}-deadline-display`);
        
        if (deadlineDate && displayElement) {
            const date = new Date(deadlineDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            date.setHours(0, 0, 0, 0);
            
            const diffTime = date - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays < 0) {
                displayElement.textContent = `⚠️ 期日を過ぎています（${Math.abs(diffDays)}日前）`;
                displayElement.className = 'text-sm text-red-600 mt-1 font-bold';
            } else if (diffDays === 0) {
                displayElement.textContent = '📅 本日が連絡期日です';
                displayElement.className = 'text-sm text-terracotta mt-1 font-bold';
            } else if (diffDays <= 3) {
                displayElement.textContent = `⏰ あと${diffDays}日で連絡期日`;
                displayElement.className = 'text-sm text-orange-600 mt-1 font-bold';
            } else {
                displayElement.textContent = `📅 ${this.formatDate(deadlineDate)}までに連絡`;
                displayElement.className = 'text-sm text-terracotta mt-1';
            }
        }
    }
    
    // ドライフラワー価格更新
    updateDryflowerPrice() {
        const type = document.getElementById('df-type').value;
        const size = document.getElementById('df-size').value;
        const priceInput = document.getElementById('df-price');
        
        const prices = {
            'ドライフラワーブーケ': { S: 3300, M: 5500, L: 11000 },
            'ボトルアレンジ': { S: 2200, M: 4400 },
            'フレームアレンジ': { S: 5500, M: 8800, L: 11000, LL: 16500 }
        };
        
        let basePrice = 0;
        if (prices[type] && prices[type][size]) {
            basePrice = prices[type][size];
            priceInput.value = basePrice;
            priceInput.readOnly = true;
        } else {
            priceInput.readOnly = false;
            basePrice = parseInt(priceInput.value) || 0;
        }
        
        // フレーム文字入れ料金を含めた合計を表示用に追加
        this.updateDryflowerTotalPrice();
    }
    
    // ドライフラワー合計価格更新（フレーム文字入れ込み）
    updateDryflowerTotalPrice() {
        const type = document.getElementById('df-type').value;
        const frameOption = document.getElementById('df-frame-option')?.value || '文字入れ不要';
        const basePrice = parseInt(document.getElementById('df-price').value) || 0;
        
        // フレーム文字入れ料金
        const frameTextPrices = {
            '文字入れ不要': 0,
            '1か所通常': 2200,
            '2か所以上通常': 3300,
            '1か所最短': 3300,
            '2か所以上最短': 4400
        };
        
        const frameTextPrice = frameTextPrices[frameOption] || 0;
        
        // 価格表示エリアを更新（将来的に表示したい場合）
        const totalPrice = basePrice + frameTextPrice;
        
        // 価格入力欄の下に合計表示を追加する場合のための準備
        return { basePrice, frameTextPrice, totalPrice };
    }
    
    // 連絡方法更新
    updateContactMethod(prefix) {
        const contact = document.getElementById(`${prefix}-contact`).value;
        const methodContainer = document.getElementById(`${prefix}-contact-method`);
        
        if (contact && contact !== '連絡不要') {
            methodContainer.classList.remove('hidden');
        } else {
            methodContainer.classList.add('hidden');
        }
    }
    
    // メッセージ入力欄の表示切替
    toggleMessageInput(prefix, type) {
        const checkbox = document.getElementById(`${prefix}-${type}`);
        const inputContainer = document.getElementById(`${prefix}-${type}-input`);
        
        if (checkbox?.checked) {
            inputContainer?.classList.remove('hidden');
        } else {
            inputContainer?.classList.add('hidden');
        }
    }
    
    // 商品追加
    addProduct(category) {
        let product = { category };
        
        switch(category) {
            case 'dryflower':
                product = this.collectDryflowerData();
                break;
            case 'plant':
                product = this.collectPlantData();
                break;
            case 'tree':
                product = this.collectTreeData();
                break;
            case 'construction':
                product = this.collectConstructionData();
                break;
        }
        
        if (!this.validateProduct(product)) {
            this.showToast('必要な情報を入力してください', 'error');
            return;
        }
        
        // 編集モードの場合は更新
        if (this.editingProductIndex !== undefined && this.editingProductIndex !== null) {
            this.addedProducts[this.editingProductIndex] = product;
            this.editingProductIndex = null;
            this.showToast('商品を更新しました', 'success');
        } else {
            this.addedProducts.push(product);
            // フレーム文字入れがある場合は詳細メッセージ
            if (product.category === 'dryflower' && product.frameTextPrice > 0) {
                this.showToast(`商品を追加しました（文字入れ料金 ¥${product.frameTextPrice.toLocaleString()} を含む）`, 'success');
            } else {
                this.showToast('商品を追加しました', 'success');
            }
        }
        
        this.renderAddedProducts();
        this.updateTotal();
        this.hideProductForm();
    }
    
    // ドライフラワーデータ収集
    collectDryflowerData() {
        const contact = document.getElementById('df-contact').value;
        let method = document.getElementById('df-method').value;
        
        // 連絡方法がその他の場合
        if (method === 'その他') {
            method = document.getElementById('df-method-other')?.value || method;
        }
        
        // その他連絡要の場合
        let contactDetail = contact;
        if (contact === 'その他連絡要') {
            contactDetail = document.getElementById('df-other-contact-detail')?.value || contact;
        }
        
        const contactInfo = contactDetail && contactDetail !== '連絡不要' && method ? 
            `${contactDetail}（${method}）` : contactDetail;
        
        const messages = [];
        if (document.getElementById('df-message-card')?.checked) {
            messages.push({
                type: 'メッセージカード',
                content: document.getElementById('df-message-card-content').value
            });
        }
        if (document.getElementById('df-celebration-sign')?.checked) {
            messages.push({
                type: 'お祝い立札',
                content: document.getElementById('df-celebration-sign-content').value
            });
        }
        
        const basePrice = parseInt(document.getElementById('df-price').value) || 0;
        const frameText = document.getElementById('df-frame-option')?.value || '';
        
        // フレーム文字入れ料金を計算
        const frameTextPrices = {
            '文字入れ不要': 0,
            '1か所通常': 2200,
            '2か所以上通常': 3300,
            '1か所最短': 3300,
            '2か所以上最短': 4400
        };
        
        const frameTextPrice = frameTextPrices[frameText] || 0;
        
        const type = document.getElementById('df-type').value;
        const data = {
            category: 'dryflower',
            type: type,
            typeDetail: type === 'その他' ? document.getElementById('df-type-detail').value : '',
            size: document.getElementById('df-size')?.value || '',
            price: basePrice,  // 商品本体価格
            frameTextPrice: frameTextPrice,  // フレーム文字入れ料金
            totalPrice: basePrice + frameTextPrice,  // 合計価格
            details: document.getElementById('df-details').value,
            frameText: frameText,
            messages,
            photo: document.getElementById('df-photo').value,
            contact: contactInfo,
            contactDeadline: document.getElementById('df-deadline-date')?.value || ''
        };
        
        // フレームアレンジの文字入れ日付
        if (data.type === 'フレームアレンジ' && data.frameText !== '文字入れ不要') {
            data.textOrderDate = document.getElementById('df-text-order-date')?.value || '';
            data.textReceiveDate = document.getElementById('df-text-receive-date')?.value || '';
        }
        
        return data;
    }
    
    // 観葉植物データ収集
    collectPlantData() {
        const contact = document.getElementById('plant-contact').value;
        let method = document.getElementById('plant-method').value;
        
        // 連絡方法がその他の場合
        if (method === 'その他') {
            method = document.getElementById('plant-method-other')?.value || method;
        }
        
        // その他連絡要の場合
        let contactDetail = contact;
        if (contact === 'その他連絡要') {
            contactDetail = document.getElementById('plant-other-contact-detail')?.value || contact;
        }
        
        const contactInfo = contactDetail && contactDetail !== '連絡不要' && method ? 
            `${contactDetail}（${method}）` : contactDetail;
        
        const messages = [];
        if (document.getElementById('plant-message-card')?.checked) {
            messages.push({
                type: 'メッセージカード',
                content: document.getElementById('plant-message-card-content').value
            });
        }
        if (document.getElementById('plant-celebration-sign')?.checked) {
            messages.push({
                type: 'お祝い立札',
                content: document.getElementById('plant-celebration-sign-content').value
            });
        }
        
        const genre = document.getElementById('plant-genre').value;
        return {
            category: 'plant',
            genre: genre,
            genreDetail: genre === 'その他経費' ? document.getElementById('plant-genre-detail').value : '',
            name: document.getElementById('plant-name').value,
            price: parseInt(document.getElementById('plant-price').value) || 0,
            messages,
            photo: document.getElementById('plant-photo').value,
            contact: contactInfo,
            contactDeadline: document.getElementById('plant-deadline-date')?.value || ''
        };
    }
    
    // 植木データ収集
    collectTreeData() {
        const contact = document.getElementById('tree-contact')?.value;
        let method = document.getElementById('tree-method')?.value;
        
        // 連絡方法がその他の場合
        if (method === 'その他') {
            method = document.getElementById('tree-method-other')?.value || method;
        }
        
        // その他連絡要の場合
        let contactDetail = contact;
        if (contact === 'その他連絡要') {
            contactDetail = document.getElementById('tree-other-contact-detail')?.value || contact;
        }
        
        const contactInfo = contactDetail && contactDetail !== '連絡不要' && method ? 
            `${contactDetail}（${method}）` : contactDetail;
        
        const messages = [];
        if (document.getElementById('tree-message-card')?.checked) {
            messages.push({
                type: 'メッセージカード',
                content: document.getElementById('tree-message-card-content').value
            });
        }
        if (document.getElementById('tree-celebration-sign')?.checked) {
            messages.push({
                type: 'お祝い立札',
                content: document.getElementById('tree-celebration-sign-content').value
            });
        }
        
        const genre = document.getElementById('tree-genre').value;
        return {
            category: 'tree',
            genre: genre,
            genreDetail: genre === 'その他経費' ? document.getElementById('tree-genre-detail').value : '',
            name: document.getElementById('tree-name').value,
            height: document.getElementById('tree-height').value,
            price: parseInt(document.getElementById('tree-price').value) || 0,
            messages,
            photo: document.getElementById('tree-photo')?.value || '不要',
            contact: contactInfo,
            contactDeadline: document.getElementById('tree-deadline-date')?.value || ''
        };
    }
    
    // 出張施工データ収集
    collectConstructionData() {
        const travel = parseInt(document.getElementById('construction-travel').value) || 0;
        const planting = parseInt(document.getElementById('construction-planting').value) || 0;
        const gravel = parseInt(document.getElementById('construction-gravel').value) || 0;
        const stone = parseInt(document.getElementById('construction-stone').value) || 0;
        const other = parseInt(document.getElementById('construction-other').value) || 0;
        
        return {
            category: 'construction',
            details: document.getElementById('construction-details').value,
            travel,
            planting,
            gravel,
            stone,
            other,
            price: travel + planting + gravel + stone + other
        };
    }
    
    // 商品検証
    validateProduct(product) {
        if (!product.category) return false;
        if (product.category === 'dryflower' && !product.type) return false;
        if (product.category === 'plant' && !product.genre) return false;
        if (product.category === 'tree' && !product.genre) return false;
        if (product.category === 'construction' && !product.details) return false;
        return true;
    }
    
    // 連絡期日アラート更新
    updateContactDeadlineAlert() {
        const alertContainer = document.getElementById('contact-deadline-alert');
        const messageElement = document.getElementById('contact-deadline-message');
        const detailsElement = document.getElementById('contact-deadline-details');
        
        if (!alertContainer || !messageElement || !detailsElement) return;
        
        // すべての商品から連絡期日を収集
        const deadlines = [];
        this.addedProducts.forEach(product => {
            if (product.contactDeadline && product.contact && product.contact.includes('要') && product.contact !== '連絡不要') {
                deadlines.push({
                    date: new Date(product.contactDeadline),
                    dateStr: product.contactDeadline,
                    contact: product.contact,
                    category: product.category,
                    type: product.type || product.genre || ''
                });
            }
        });
        
        if (deadlines.length === 0) {
            alertContainer.classList.add('hidden');
            return;
        }
        
        // 日付順にソート
        deadlines.sort((a, b) => a.date - b.date);
        
        // 最も近い期日を取得
        const nearest = deadlines[0];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        nearest.date.setHours(0, 0, 0, 0);
        
        const diffTime = nearest.date - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        // メッセージ設定
        let message = '';
        let className = '';
        
        if (diffDays < 0) {
            message = `⚠️ 連絡期日を過ぎています（${Math.abs(diffDays)}日超過）`;
            className = 'bg-red-50 border-red-400';
            alertContainer.className = `${className} border-l-4 p-3 mb-4 rounded-r`;
        } else if (diffDays === 0) {
            message = '📅 本日が連絡期日です';
            className = 'bg-orange-50 border-orange-400';
            alertContainer.className = `${className} border-l-4 p-3 mb-4 rounded-r`;
        } else if (diffDays <= 3) {
            message = `⏰ 連絡期日まであと${diffDays}日`;
            className = 'bg-yellow-50 border-yellow-400';
            alertContainer.className = `${className} border-l-4 p-3 mb-4 rounded-r`;
        } else {
            message = `📅 連絡期日: ${this.formatDate(nearest.dateStr)}`;
            className = 'bg-blue-50 border-blue-400';
            alertContainer.className = `${className} border-l-4 p-3 mb-4 rounded-r`;
        }
        
        messageElement.textContent = message;
        
        // 詳細メッセージ
        const details = deadlines.map(d => {
            const contactType = d.contact.replace('（', ' - ').replace('）', '');
            return `${this.formatDate(d.dateStr)}: ${d.type} ${contactType}`;
        }).join(' / ');
        detailsElement.textContent = details;
        
        alertContainer.classList.remove('hidden');
    }
    
    // 追加済み商品表示
    renderAddedProducts() {
        const container = document.getElementById('added-products');
        
        if (this.addedProducts.length === 0) {
            container.innerHTML = '';
            return;
        }
        
        container.innerHTML = `
            <h3 class="font-bold text-sage-dark mb-3">
                <i class="fas fa-shopping-bag mr-2"></i>
                追加済み商品 (${this.addedProducts.length}点)
            </h3>
            ${this.addedProducts.map((product, index) => this.renderProductCard(product, index)).join('')}
        `;
        
        // 連絡期日アラートを更新
        this.updateContactDeadlineAlert();
    }
    
    // 商品カード表示
    renderProductCard(product, index) {
        let title = '';
        let details = '';
        let displayPrice = product.price || 0;
        
        switch(product.category) {
            case 'dryflower':
                title = product.type === 'その他' && product.typeDetail ? 
                    product.typeDetail : product.type;
                // フレーム文字入れがある場合は合計価格を表示
                displayPrice = product.totalPrice || product.price || 0;
                
                const priceBreakdown = [];
                if (product.price) {
                    priceBreakdown.push(`商品: ¥${product.price.toLocaleString()}`);
                }
                if (product.frameTextPrice && product.frameTextPrice > 0) {
                    priceBreakdown.push(`文字入れ: ¥${product.frameTextPrice.toLocaleString()}`);
                }
                
                details = `
                    ${product.size ? `サイズ: ${product.size}` : ''}
                    ${product.details ? `<br>詳細: ${product.details}` : ''}
                    ${product.frameText && product.frameText !== '文字入れ不要' ? `<br>文字入れ: ${product.frameText}` : ''}
                    ${product.textOrderDate ? `<br>文字発注日: ${this.formatDate(product.textOrderDate)}` : ''}
                    ${product.textReceiveDate ? `<br>文字受取予定日: ${this.formatDate(product.textReceiveDate)}` : ''}
                    ${priceBreakdown.length > 1 ? `<br><span class="text-xs">${priceBreakdown.join(' + ')}</span>` : ''}
                    ${product.contact ? `<br>連絡: ${product.contact}` : ''}
                `;
                break;
            case 'plant':
                const plantGenre = product.genre === 'その他経費' && product.genreDetail ? 
                    product.genreDetail : product.genre;
                title = `【${plantGenre}】${product.name || ''}`;
                details = '';
                break;
            case 'tree':
                const treeGenre = product.genre === 'その他経費' && product.genreDetail ? 
                    product.genreDetail : product.genre;
                title = `【${treeGenre}】${product.name || ''}`;
                details = product.height ? `高さ: ${product.height}` : '';
                break;
            case 'construction':
                title = '出張施工';
                details = product.details;
                break;
        }
        
        // メッセージ・立札の表示
        const messages = product.messages || [];
        const messageDisplay = messages.map(m => 
            `<span class="inline-block px-2 py-1 bg-sage-light text-white text-xs rounded mr-1">${m.type}</span>`
        ).join('');
        
        return `
            <div class="bg-cream rounded-lg p-3 mb-2">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <h4 class="font-medium text-forest">${title}</h4>
                        ${messageDisplay ? `<div class="mt-1">${messageDisplay}</div>` : ''}
                        <p class="text-sm text-gray-600 mt-1">${details}</p>
                        <p class="text-lg font-bold text-terracotta mt-2">¥${displayPrice.toLocaleString()}</p>
                    </div>
                    <div class="flex gap-2">
                        <button type="button" onclick="app.editProduct(${index})" class="text-sage hover:text-sage-dark">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button type="button" onclick="app.removeProduct(${index})" class="text-red-500 hover:text-red-600">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
    
    // 商品削除
    removeProduct(index) {
        this.addedProducts.splice(index, 1);
        this.renderAddedProducts();
        this.updateTotal();
        this.showToast('商品を削除しました');
    }
    
    // 商品編集
    editProduct(index) {
        const product = this.addedProducts[index];
        if (!product) return;
        
        // 編集対象を保存
        this.editingProductIndex = index;
        
        // 該当カテゴリのフォームを表示
        this.showProductForm(product.category);
        
        // フォームにデータを復元
        setTimeout(() => {
            this.loadProductToForm(product);
        }, 100);
    }
    
    // 商品データをフォームに読み込み
    loadProductToForm(product) {
        switch(product.category) {
            case 'dryflower':
                document.getElementById('df-type').value = product.type || '';
                this.updateDryflowerOptions();
                if (product.typeDetail) {
                    document.getElementById('df-type-detail').value = product.typeDetail;
                }
                if (product.size) document.getElementById('df-size').value = product.size;
                document.getElementById('df-price').value = product.price || 0;
                document.getElementById('df-details').value = product.details || '';
                if (product.frameText) {
                    document.getElementById('df-frame-option').value = product.frameText;
                    this.updateFrameTextOptions();
                    // 編集時は日付を復元してから制限を更新
                    if (product.textOrderDate) {
                        document.getElementById('df-text-order-date').value = product.textOrderDate;
                    }
                    if (product.textReceiveDate) {
                        document.getElementById('df-text-receive-date').value = product.textReceiveDate;
                    }
                    // 制限を再計算
                    this.updateTextReceiveDate();
                }
                document.getElementById('df-photo').value = product.photo || '不要';
                
                // メッセージ・立札
                product.messages?.forEach(msg => {
                    if (msg.type === 'メッセージカード') {
                        document.getElementById('df-message-card').checked = true;
                        this.toggleMessageInput('df', 'message-card');
                        document.getElementById('df-message-card-content').value = msg.content;
                    } else if (msg.type === 'お祝い立札') {
                        document.getElementById('df-celebration-sign').checked = true;
                        this.toggleMessageInput('df', 'celebration-sign');
                        document.getElementById('df-celebration-sign-content').value = msg.content;
                    }
                });
                
                // 連絡設定
                if (product.contact) {
                    const match = product.contact.match(/(.+)（(.+)）/);
                    if (match) {
                        document.getElementById('df-contact').value = match[1];
                        this.updateContactMethod('df');
                        document.getElementById('df-method').value = match[2];
                    } else {
                        document.getElementById('df-contact').value = product.contact;
                    }
                }
                break;
                
            case 'plant':
                document.getElementById('plant-genre').value = product.genre || '';
                this.updatePlantGenre();
                if (product.genreDetail) {
                    document.getElementById('plant-genre-detail').value = product.genreDetail;
                }
                document.getElementById('plant-name').value = product.name || '';
                document.getElementById('plant-price').value = product.price || 0;
                document.getElementById('plant-photo').value = product.photo || '不要';
                
                // メッセージ・立札
                product.messages?.forEach(msg => {
                    if (msg.type === 'メッセージカード') {
                        document.getElementById('plant-message-card').checked = true;
                        this.toggleMessageInput('plant', 'message-card');
                        document.getElementById('plant-message-card-content').value = msg.content;
                    } else if (msg.type === 'お祝い立札') {
                        document.getElementById('plant-celebration-sign').checked = true;
                        this.toggleMessageInput('plant', 'celebration-sign');
                        document.getElementById('plant-celebration-sign-content').value = msg.content;
                    }
                });
                
                // 連絡設定
                if (product.contact) {
                    const match = product.contact.match(/(.+)（(.+)）/);
                    if (match) {
                        document.getElementById('plant-contact').value = match[1];
                        this.updateContactMethod('plant');
                        document.getElementById('plant-method').value = match[2];
                    } else {
                        document.getElementById('plant-contact').value = product.contact;
                    }
                }
                break;
                
            case 'tree':
                document.getElementById('tree-genre').value = product.genre || '';
                this.updateTreeGenre();
                if (product.genreDetail) {
                    document.getElementById('tree-genre-detail').value = product.genreDetail;
                }
                document.getElementById('tree-name').value = product.name || '';
                document.getElementById('tree-height').value = product.height || '';
                document.getElementById('tree-price').value = product.price || 0;
                
                // メッセージ・立札
                product.messages?.forEach(msg => {
                    if (msg.type === 'メッセージカード') {
                        document.getElementById('tree-message-card').checked = true;
                        this.toggleMessageInput('tree', 'message-card');
                        document.getElementById('tree-message-card-content').value = msg.content;
                    } else if (msg.type === 'お祝い立札') {
                        document.getElementById('tree-celebration-sign').checked = true;
                        this.toggleMessageInput('tree', 'celebration-sign');
                        document.getElementById('tree-celebration-sign-content').value = msg.content;
                    }
                });
                break;
                
            case 'construction':
                document.getElementById('construction-details').value = product.details || '';
                document.getElementById('construction-travel').value = product.travel || 0;
                document.getElementById('construction-planting').value = product.planting || 0;
                document.getElementById('construction-gravel').value = product.gravel || 0;
                document.getElementById('construction-stone').value = product.stone || 0;
                document.getElementById('construction-other').value = product.other || 0;
                break;
        }
    }
    
    // 合計更新
    updateTotal() {
        // 商品ごとの明細を作成
        let summaryHtml = '';
        let productTotal = 0;
        
        // 各商品を表示
        this.addedProducts.forEach((p, index) => {
            const displayPrice = p.totalPrice || p.price || 0;
            let productName = '';
            
            switch(p.category) {
                case 'dryflower':
                    productName = p.type || 'ドライフラワー';
                    break;
                case 'plant':
                    productName = `【${p.genre || ''}】${p.name || ''}`;
                    break;
                case 'tree':
                    productName = `【${p.genre || ''}】${p.name || ''}`;
                    break;
                case 'construction':
                    productName = '出張施工';
                    break;
            }
            
            summaryHtml += `
                <div class="flex justify-between items-center py-1 border-b border-gray-200">
                    <span class="text-gray-700">${index + 1}. ${productName}</span>
                    <span class="font-medium">¥${displayPrice.toLocaleString()}</span>
                </div>
            `;
            productTotal += displayPrice;
        });
        
        // 送料を追加
        const shipping = parseInt(document.getElementById('shipping-cost')?.value) || 0;
        if (shipping > 0) {
            summaryHtml += `
                <div class="flex justify-between items-center py-1 border-b border-gray-200">
                    <span class="text-gray-700">送料</span>
                    <span class="font-medium">¥${shipping.toLocaleString()}</span>
                </div>
            `;
        }
        
        // ディスカウントを追加（チェックされている場合のみ）
        const discountCheck = document.getElementById('discount-check');
        const discount = discountCheck?.checked ? (parseInt(document.getElementById('discount')?.value) || 0) : 0;
        if (discount > 0) {
            summaryHtml += `
                <div class="flex justify-between items-center py-1 border-b border-gray-200 text-red-600">
                    <span>ディスカウント</span>
                    <span class="font-medium">-¥${discount.toLocaleString()}</span>
                </div>
            `;
        }
        
        // 合計金額
        const total = productTotal + shipping - discount;
        summaryHtml += `
            <div class="flex justify-between items-center pt-2 mt-2 border-t-2 border-sage">
                <span class="font-bold text-sage-dark">合計</span>
                <span class="font-bold text-lg text-terracotta">¥${total.toLocaleString()}</span>
            </div>
        `;
        
        // 明細エリアを更新
        const summaryElement = document.getElementById('order-summary');
        if (summaryElement) {
            summaryElement.innerHTML = summaryHtml;
        }
    }
    
    // ディスカウントフィールドの表示切り替え
    toggleDiscountField() {
        const check = document.getElementById('discount-check');
        const field = document.getElementById('discount-field');
        
        if (check.checked) {
            field.classList.remove('hidden');
        } else {
            field.classList.add('hidden');
            document.getElementById('discount').value = '';
            this.updateTotal();
        }
    }
    
    // 備考フィールドの表示切り替え
    toggleNotesField() {
        const check = document.getElementById('notes-check');
        const field = document.getElementById('notes-field');
        
        if (check.checked) {
            field.classList.remove('hidden');
        } else {
            field.classList.add('hidden');
            document.getElementById('notes').value = '';
        }
    }
    
    // ディスカウント適用（削除予定）
    applyDiscount() {
        this.updateTotal();
        this.showToast('ディスカウントを適用しました');
    }
    
    // オーダー保存
    async saveOrder() {
        const currentTime = Date.now();
        console.log('saveOrder() called at:', currentTime);
        
        // 保存処理中の場合は重複実行を防ぐ
        if (this.isSaving) {
            console.log('Save process already in progress, skipping...');
            return;
        }
        
        // デバウンス処理：1秒以内の連続呼び出しを防ぐ
        if (currentTime - this.lastSaveTime < 1000) {
            console.log('Save called too quickly, debouncing...');
            return;
        }
        
        this.lastSaveTime = currentTime;
        
        try {
            this.isSaving = true;  // 保存開始フラグ
            console.log('Starting save process...');
            this.showLoading();
            
            console.log('Collecting order data...');
            const orderData = this.collectOrderData();
            console.log('Order data collected:', orderData);
            
            console.log('Validating order...');
            if (!this.validateOrder(orderData)) {
                console.log('Validation failed, stopping save process');
                this.hideLoading();
                this.isSaving = false;
                return;
            }
            console.log('Validation passed');
            
            if (this.editingOrderId) {
                // 編集モード
                const index = this.orders.findIndex(o => o.id === this.editingOrderId);
                if (index !== -1) {
                    this.orders[index] = { ...orderData, id: this.editingOrderId };
                }
                this.showToast('オーダーを更新しました', 'success', 4500);
            } else {
                // 新規作成
                // より安全なID生成（重複防止）
                orderData.id = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                orderData.created_at = new Date().toISOString();
                
                // 重複チェック（念のため）
                if (!this.orders.find(o => o.id === orderData.id)) {
                    this.orders.unshift(orderData);
                    console.log('New order saved with ID:', orderData.id);
                    this.showToast('オーダーを保存しました', 'success', 4500);
                } else {
                    console.error('Duplicate order ID detected:', orderData.id);
                    this.showToast('保存に失敗しました（ID重複）', 'error');
                    return;
                }
            }
            
            this.saveData();
            this.updateOrderCount();  // 件数を更新
            
            // 保存成功後は新規作成モードに戻る（キャンセルメッセージは表示しない）
            this.clearFormDataAfterSave();
            
            // 保存成功メッセージの後、全オーダータブへ
            if (!this.editingOrderId) {
                // 新規作成の場合
                this.switchTab('dryflower');
            } else {
                // 編集の場合も新規作成モードに戻る
                this.editingOrderId = null;
                this.switchTab('dryflower');
                // 完了セクションを非表示
                const completedSection = document.getElementById('completed-section');
                if (completedSection) {
                    completedSection.style.display = 'none';
                }
            }
            
        } catch (error) {
            console.error('Save error:', error);
            this.showToast('保存に失敗しました', 'error');
        } finally {
            this.hideLoading();
            this.isSaving = false;  // 保存完了フラグリセット
        }
    }
    
    // オーダーデータ収集
    collectOrderData() {
        const service = document.querySelector('input[name="service"]:checked')?.value;
        
        return {
            // 受注情報
            reception_date: document.getElementById('reception-date').value,
            staff: this.getStaffName(),
            service,
            
            // 日時
            date_from: document.getElementById('date-from').value,
            date_to: document.getElementById('date-to').value,
            date_undecided: document.getElementById('date-undecided').checked,
            time_from: document.getElementById('time-from').value,
            time_to: document.getElementById('time-to').value,
            time_undecided: document.getElementById('time-undecided').checked,
            shipping_date: document.getElementById('shipping-date')?.value,
            
            // 顧客情報
            customer_name: document.getElementById('customer-name').value,
            customer_phone: document.getElementById('customer-phone').value,
            customer_address: document.getElementById('customer-address').value,
            
            // お届け先
            delivery_name: document.getElementById('delivery-name')?.value,
            delivery_phone: document.getElementById('delivery-phone')?.value,
            delivery_address: document.getElementById('delivery-address')?.value,
            
            // 商品
            products: this.addedProducts,
            shipping_cost: parseInt(document.getElementById('shipping-cost')?.value) || 0,
            product_notes: document.getElementById('product-notes')?.value || '',
            
            // 金額
            discount: parseInt(document.getElementById('discount').value) || 0,
            total: this.calculateTotal(),
            
            // 支払い
            payment_status: document.getElementById('payment-status').value,
            payment_date: document.getElementById('payment-date')?.value,
            payment_staff: this.getPaymentStaffName(),
            
            // その他
            notes: document.getElementById('notes').value,
            work_started: document.getElementById('work-started')?.checked || false,
            work_staff: this.getWorkStaffName(),
            work_datetime: document.getElementById('work-datetime')?.value,
            work_status: document.getElementById('work-status')?.value,
            work_status_history: this.workStatusHistory,
            contact_record: document.getElementById('contact-record')?.value,
            contact_record_history: this.contactRecordHistory,
            completed: document.getElementById('completed').checked,
            completed_staff: this.getCompletedStaffName(),
            completed_datetime: document.getElementById('completed-datetime')?.value,
            
            // メタデータ
            updated_at: new Date().toISOString()
        };
    }
    
    // 担当者名取得
    getStaffName() {
        const staff = document.getElementById('staff').value;
        if (staff === 'ゲスト') {
            return document.getElementById('staff-other').value;
        }
        return staff;
    }
    
    // 支払い担当者名取得
    getPaymentStaffName() {
        const staff = document.getElementById('payment-staff')?.value;
        if (staff === 'ゲスト') {
            return document.getElementById('payment-staff-other')?.value || '';
        }
        return staff || '';
    }
    
    // 着手担当者名取得
    getWorkStaffName() {
        const staff = document.getElementById('work-staff')?.value;
        if (staff === 'ゲスト') {
            return document.getElementById('work-staff-other')?.value || '';
        }
        return staff || '';
    }
    
    // 完了担当者名取得
    getCompletedStaffName() {
        const staff = document.getElementById('completed-staff')?.value;
        if (staff === 'ゲスト') {
            return document.getElementById('completed-staff-other')?.value || '';
        }
        return staff || '';
    }
    
    // 合計計算
    calculateTotal() {
        // フレーム文字入れ料金を含めた合計を計算
        const subtotal = this.addedProducts.reduce((sum, p) => {
            if (p.category === 'dryflower' && p.totalPrice) {
                return sum + p.totalPrice;
            }
            return sum + (p.price || 0);
        }, 0);
        const shipping = parseInt(document.getElementById('shipping-cost')?.value) || 0;
        const discount = parseInt(document.getElementById('discount')?.value) || 0;
        return subtotal + shipping - discount;
    }
    
    // オーダー検証
    validateOrder(order) {
        const validationErrors = [];
        
        // 必須項目チェック
        if (!order.reception_date) {
            validationErrors.push({
                field: 'reception-date',
                message: '受注日を入力してください'
            });
        }
        
        if (!order.service) {
            validationErrors.push({
                field: 'service-pickup', // ラジオボタンの最初の要素
                message: 'サービス内容を選択してください'
            });
        }
        
        if (!order.customer_name) {
            validationErrors.push({
                field: 'customer-name',
                message: 'お客様名を入力してください'
            });
        }
        
        if (!order.customer_phone) {
            validationErrors.push({
                field: 'customer-phone',
                message: 'お客様電話番号を入力してください'
            });
        }
        
        if (!order.products || order.products.length === 0) {
            validationErrors.push({
                field: 'products-section',
                message: '商品を追加してください'
            });
        }
        
        // エラーがある場合、最初のエラー項目にスクロール
        if (validationErrors.length > 0) {
            this.scrollToAndHighlightField(validationErrors[0]);
            this.showToast(validationErrors[0].message, 'error');
            return false;
        }
        
        return true;
    }
    
    // 未入力項目への自動スクロール＋視覚的エフェクト
    scrollToAndHighlightField(error) {
        const fieldId = error.field;
        let targetElement = document.getElementById(fieldId);
        
        // 特別なケース対応
        if (fieldId === 'service-pickup') {
            // サービス選択セクション全体をターゲット
            targetElement = document.querySelector('input[name="service"]')?.closest('.grid');
        } else if (fieldId === 'products-section') {
            // 商品セクション全体をターゲット
            targetElement = document.getElementById('step-3') || 
                          document.querySelector('.category-btn')?.closest('.step-section');
        }
        
        if (!targetElement) {
            console.warn(`Validation target not found: ${fieldId}`);
            return;
        }
        
        // スクロール
        const headerHeight = 120; // ヘッダーとタブの高さを考慮
        const targetPosition = targetElement.getBoundingClientRect().top + window.pageYOffset - headerHeight;
        
        window.scrollTo({
            top: targetPosition,
            behavior: 'smooth'
        });
        
        // 視覚的ハイライト効果
        setTimeout(() => {
            this.highlightElement(targetElement);
        }, 500); // スクロール後にエフェクト実行
    }
    
    // 要素をハイライトするエフェクト
    highlightElement(element) {
        // 既存のハイライトクラスを削除
        document.querySelectorAll('.validation-error').forEach(el => {
            el.classList.remove('validation-error');
        });
        
        // ハイライト効果を追加
        element.classList.add('validation-error');
        
        // 3秒後にハイライトを削除
        setTimeout(() => {
            element.classList.remove('validation-error');
        }, 3000);
    }
    
    // 保存ボタンの表示/非表示制御
    toggleSaveButtons() {
        const saveButton = document.getElementById('save-button');
        const selectedService = document.querySelector('input[name="service"]:checked');
        
        if (selectedService && saveButton) {
            console.log('Service selected, showing save button');
            saveButton.classList.remove('hidden');
        } else if (saveButton) {
            console.log('No service selected, hiding save button');
            saveButton.classList.add('hidden');
        }
    }
    
    // 新規オーダーフォームを開く
    openNewOrderForm() {
        console.log('openNewOrderForm called');
        
        // 商品フォームが開いているか確認
        const productFormContainer = document.getElementById('product-form-container');
        const isProductFormOpen = productFormContainer && !productFormContainer.classList.contains('hidden');
        
        // 編集中のデータがある場合は確認
        if (this.editingOrderId || this.addedProducts.length > 0) {
            const hasData = this.editingOrderId || this.addedProducts.length > 0 || 
                           document.getElementById('customer-name')?.value || 
                           document.getElementById('customer-phone')?.value;
            
            if (hasData) {
                if (!confirm('編集中の内容がクリアされます。新規オーダーを作成しますか？')) {
                    return;
                }
            }
        }
        
        console.log('Starting whiteout animation');
        
        // ホワイトアウトアニメーション
        this.triggerWhiteout(() => {
            console.log('Clearing form data');
            
            // 商品フォームが開いている場合は閉じる
            if (isProductFormOpen) {
                // 商品フォームを閉じる
                productFormContainer.classList.add('hidden');
                productFormContainer.innerHTML = '';
                this.editingProductIndex = null;
                
                // ボタンも削除
                const buttons = document.getElementById('product-form-buttons');
                if (buttons) {
                    buttons.remove();
                }
                
                // 他のセクションを再表示
                this.showOtherSectionsForProduct();
            }
            
            // フォームをクリア
            this.clearFormData();
            
            // 保存ボタンを非表示（新規作成時はサービス未選択のため）
            const saveButton = document.getElementById('save-button');
            if (saveButton) {
                saveButton.classList.add('hidden');
            }
        });
        
        // ホワイトアウト完了後に画面切り替え
        setTimeout(() => {
            console.log('Switching to input tab');
            // 入力タブに切り替え
            this.switchTab('input');
            
            // ページトップへスクロール
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
            
            // トーストが表示されているか確認
            console.log('Showing toast message');
            this.showToast('新規オーダー作成画面を開きました', 'success');
            
            // 入力タブが表示されているか確認
            const inputTab = document.getElementById('tab-input');
            console.log('Input tab element:', inputTab);
            console.log('Input tab has active class:', inputTab?.classList.contains('active'));
        }, 300);
    }
    
    // フォームデータのクリア（内部処理用）
    clearFormData() {
        document.getElementById('order-form').reset();
        this.addedProducts = [];
        this.editingOrderId = null;
        this.currentStep = 1;
        
        // 全セクションを表示
        this.showAllSections();
        
        // 商品リストクリア
        this.renderAddedProducts();
        this.updateTotal();
        
        // 商品備考もクリア
        const productNotes = document.getElementById('product-notes');
        if (productNotes) {
            productNotes.value = '';
        }
        
        // 作業履歴をクリア
        this.workStatusHistory = [];
        this.contactRecordHistory = [];
        this.renderWorkStatusHistory();
        this.renderContactRecordHistory();
        
        // ボタンを非表示
        document.getElementById('confirm-work-status-btn')?.classList.add('hidden');
        document.getElementById('confirm-contact-record-btn')?.classList.add('hidden');
        document.getElementById('add-work-status-btn')?.classList.add('hidden');
        document.getElementById('add-contact-record-btn')?.classList.add('hidden');
        
        // 今日の日付を再設定
        document.getElementById('reception-date').value = new Date().toISOString().split('T')[0];
        
        // 編集モード解除
        document.getElementById('work-section')?.classList.add('hidden');
        
        // 完了詳細を非表示
        document.getElementById('completed-details')?.classList.add('hidden');
        document.getElementById('completed-staff-other')?.classList.add('hidden');
        
        // 完了セクションを非表示
        const completedSection = document.getElementById('completed-section');
        if (completedSection) {
            completedSection.style.display = 'none';
        }
        
        // 削除セクションも非表示
        const deleteSection = document.getElementById('delete-section');
        if (deleteSection) {
            deleteSection.classList.add('hidden');
            // チェックボックスとエリアをリセット
            const deleteCheck = document.getElementById('delete-check');
            const deleteConfirm = document.getElementById('delete-confirm');
            if (deleteCheck) deleteCheck.checked = false;
            if (deleteConfirm) deleteConfirm.classList.add('hidden');
        }
    }
    
    // 保存成功後のフォームクリア（キャンセルメッセージなし）
    clearFormDataAfterSave() {
        // 先にスクロールを開始
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // ホワイトアウトアニメーション
        this.triggerWhiteout(() => {
            this.clearFormData();
            
            // フォームをクリアした後、前のタブに戻る
            if (this.previousTab) {
                // inputタブに入る前のタブに戻る
                this.switchTab(this.previousTab);
            } else {
                // デフォルトで本日タブに戻る
                this.switchTab('today');
            }
            
            // 保存成功時はキャンセルメッセージを表示しない
        });
    }
    
    // フォームクリア
    clearForm() {
        // 先にスクロールを開始
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // ホワイトアウトアニメーション
        this.triggerWhiteout(() => {
            this.clearFormData();
            
            // 保存ボタンを非表示
            const saveButton = document.getElementById('save-button');
            if (saveButton) {
                saveButton.classList.add('hidden');
            }
            
            // フォームをクリアした後、前のタブに戻る
            if (this.previousTab) {
                // inputタブに入る前のタブに戻る
                this.switchTab(this.previousTab);
            } else {
                // デフォルトで本日タブに戻る
                this.switchTab('today');
            }
            
            this.showToast('キャンセルしました', 'info');
        });
    }
    
    // オーダー一覧表示
    renderOrders(containerId, orders) {
        const container = document.getElementById(containerId);
        
        if (!orders || orders.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-inbox text-4xl mb-3"></i>
                    <p>オーダーがありません</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = orders.map(order => this.renderOrderCard(order)).join('');
    }
    
    // HTMLエスケープ
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // 期日関連のテキストを強調表示
    highlightDeadline(text) {
        // 日付パターン（例: 1/29、1月29日、29日まで など）
        const datePattern = /(\d{1,2}[\/月]\d{1,2}日?|\d{1,2}日)/g;
        // 期限関連のキーワード
        const deadlineKeywords = /(まで|期日|期限|締切|締め切り|迄)/g;
        
        // 日付を強調
        text = text.replace(datePattern, '<strong class="text-red-600">$1</strong>');
        // キーワードを強調
        text = text.replace(deadlineKeywords, '<strong class="text-orange-600">$1</strong>');
        
        return text;
    }
    
    // オーダーカード表示
    renderOrderCard(order) {
        const statusBadge = this.getStatusBadge(order);
        const dateLabel = this.getServiceDateLabel(order);
        const productNames = this.getProductNamesForCard(order);
        const workStatus = order.work_started ? '着手済' : '未着手';
        const contactInfo = this.getContactRequiredInfo(order);
        const contactStatus = this.getContactStatus(order);
        
        return `
            <div class="bg-white rounded-lg shadow-sm p-4 mb-3 hover:shadow-md transition">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <h3 class="font-bold text-lg text-forest">
                            ${order.customer_name || '名前未設定'} 様
                        </h3>
                    </div>
                    <div class="flex gap-2">
                        ${statusBadge}
                    </div>
                </div>
                
                <div class="text-sm text-gray-700 mb-3 space-y-1">
                    <p><i class="fas fa-calendar mr-2 text-sage"></i>${dateLabel}</p>
                    ${productNames ? `<p><i class="fas fa-box mr-2 text-sage-dark"></i>${productNames}</p>` : ''}
                    <p><i class="fas fa-tools mr-2 text-${order.work_started ? 'green' : 'gray'}-500"></i>${workStatus}</p>
                    ${contactInfo ? `<p><i class="fas fa-bell mr-2 text-orange-500"></i>${contactInfo}</p>` : ''}
                    ${contactStatus ? `<p><i class="fas fa-phone mr-2 text-${contactStatus === '連絡済' ? 'green' : 'red'}-500"></i>${contactStatus}</p>` : ''}
                    ${order.product_notes ? `
                        <div class="mt-2 p-2 bg-yellow-50 border-l-4 border-yellow-400 rounded">
                            <p class="text-xs font-medium text-yellow-800">
                                <i class="fas fa-sticky-note mr-1"></i>商品備考: 
                                <span class="${order.product_notes.length > 50 ? 'block mt-1' : ''}">
                                    ${this.highlightDeadline(this.escapeHtml(order.product_notes))}
                                </span>
                            </p>
                        </div>
                    ` : ''}
                </div>
                
                <div class="flex justify-end gap-2">
                    <button onclick="app.showOrderDetail('${order.id}')" class="btn-small btn-outline-primary">
                        <i class="fas fa-eye mr-1"></i>詳細
                    </button>
                    <button onclick="app.editOrder('${order.id}')" class="btn-small btn-outline-success">
                        <i class="fas fa-edit mr-1"></i>編集
                    </button>
                </div>
            </div>
        `;
    }
    
    // ステータスバッジ取得
    getStatusBadge(order) {
        let badges = [];
        
        if (order.completed) {
            badges.push('<span class="badge badge-success">完了</span>');
        } else if (order.work_started) {
            badges.push('<span class="badge badge-info">進行中</span>');
        } else {
            badges.push('<span class="badge badge-warning">未着手</span>');
        }
        
        if (order.payment_status === '済') {
            badges.push('<span class="badge badge-success">支払済</span>');
        }
        
        return badges.join(' ');
    }
    
    // サービス別日付ラベル取得
    getServiceDateLabel(order) {
        let label = '';
        switch(order.service) {
            case 'pickup':
                label = 'お引き取り日: ';
                break;
            case 'delivery':
                label = '配送希望日: ';
                break;
            case 'shipping':
                if (order.shipping_date) {
                    return `発送日: ${this.formatDate(order.shipping_date)}`;
                }
                label = '着希望日: ';
                break;
            case 'construction':
                label = '施工日: ';
                break;
            default:
                label = '日付: ';
        }
        
        if (order.date_undecided) {
            return label + '未定';
        }
        
        const from = order.date_from;
        const to = order.date_to;
        
        if (from && to && from !== to) {
            return label + `${this.formatDate(from)}〜${this.formatDate(to)}`;
        } else if (from) {
            return label + this.formatDate(from);
        }
        
        return label + '未設定';
    }
    
    // 商品名リスト取得（カード表示用）
    getProductNamesForCard(order) {
        if (!order.products || order.products.length === 0) return '';
        
        const names = [];
        order.products.forEach(product => {
            let name = '';
            switch(product.category) {
                case 'dryflower':
                    name = product.type || 'ドライフラワー';
                    if (product.frameTextPrice && product.frameTextPrice > 0) {
                        name += '(文字入れ含む)';
                    }
                    break;
                case 'plant':
                    name = product.name || product.genre || '観葉植物';
                    break;
                case 'tree':
                    name = product.name || product.genre || '植木';
                    break;
                case 'construction':
                    name = '出張施工';
                    break;
            }
            names.push(name);
        });
        
        // 送料がある場合
        if (order.shipping_cost && order.shipping_cost > 0) {
            names.push('送料');
        }
        
        return names.join('、');
    }
    
    // 連絡要情報取得
    getContactRequiredInfo(order) {
        if (!order.products) return '';
        
        const contactRequired = [];
        order.products.forEach(product => {
            if (product.contact && product.contact !== '連絡不要') {
                let info = product.contact;
                if (product.deadline) {
                    info += `(期日:${this.formatDate(product.deadline)})`;
                }
                contactRequired.push(info);
            }
        });
        
        return contactRequired.length > 0 ? contactRequired.join('、') : '';
    }
    
    // 連絡状態取得
    getContactStatus(order) {
        // 連絡が必要な商品があるかチェック
        const needsContact = order.products?.some(p => p.contact && p.contact !== '連絡不要');
        
        if (!needsContact) return '';
        
        // 連絡記録があるかチェック
        if (order.contact_record_history && order.contact_record_history.length > 0) {
            return '連絡済';
        }
        
        return '未連絡';
    }
    
    // 日付ラベル取得（旧関数、互換性のため残す）
    getDateLabel(order) {
        if (order.date_undecided) {
            return '日付未定';
        }
        
        const from = order.date_from;
        const to = order.date_to;
        
        if (from && to && from !== to) {
            return `${this.formatDate(from)}〜${this.formatDate(to)}`;
        } else if (from) {
            return this.formatDate(from);
        }
        
        return '日付未設定';
    }
    
    // 日付フォーマット
    formatDate(dateStr) {
        const date = new Date(dateStr);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        
        // yyyy-mm-dd形式の場合は年月日を表示
        if (dateStr && dateStr.includes('-')) {
            return `${year}/${month}/${day}`;
        }
        // それ以外は月日のみ
        return `${month}/${day}`;
    }
    
    // オーダー詳細表示
    showOrderDetail(orderId) {
        const order = this.orders.find(o => o.id === orderId);
        if (!order) return;
        
        const modalTitle = document.getElementById('modal-title');
        const modalBody = document.getElementById('modal-body');
        
        modalTitle.textContent = 'オーダー詳細';
        modalBody.innerHTML = this.renderOrderDetail(order);
        
        this.openModal();
    }
    
    // オーダー詳細HTML
    renderOrderDetail(order) {
        return `
            <div class="space-y-4 max-h-[70vh] overflow-y-auto">
                <!-- 受注情報 -->
                <div class="bg-white p-3 rounded border border-sage-light">
                    <h4 class="font-bold text-sage-dark mb-2">
                        <i class="fas fa-info-circle mr-2"></i>受注情報
                    </h4>
                    <dl class="grid grid-cols-2 gap-2 text-sm">
                        <dt class="text-gray-600">受注日:</dt>
                        <dd>${order.reception_date || '-'}</dd>
                        <dt class="text-gray-600">担当者:</dt>
                        <dd>${order.staff || '-'}</dd>
                        <dt class="text-gray-600">サービス内容:</dt>
                        <dd>${this.getServiceLabel(order.service)}</dd>
                        ${this.renderDateTimeInfo(order)}
                        ${order.shipping_date ? `
                            <dt class="text-gray-600">発送日:</dt>
                            <dd>${order.shipping_date}</dd>
                        ` : ''}
                    </dl>
                </div>
                
                <!-- ご依頼主・お届け先情報 -->
                <div class="bg-white p-3 rounded border border-sage-light">
                    <h4 class="font-bold text-sage-dark mb-2">
                        <i class="fas fa-user mr-2"></i>ご依頼主・お届け先情報
                    </h4>
                    <dl class="grid grid-cols-2 gap-2 text-sm">
                        <dt class="text-gray-600">ご依頼主様:</dt>
                        <dd>${order.customer_name || '-'}</dd>
                        <dt class="text-gray-600">電話番号:</dt>
                        <dd>${order.customer_phone || '-'}</dd>
                        <dt class="text-gray-600 col-span-2">ご住所:</dt>
                        <dd class="col-span-2">${order.customer_address || '-'}</dd>
                        ${order.delivery_name ? `
                            <dt class="text-gray-600 col-span-2 pt-2 border-t">お届け先情報</dt>
                            <dt class="text-gray-600">お届け先様:</dt>
                            <dd>${order.delivery_name}</dd>
                            <dt class="text-gray-600">電話番号:</dt>
                            <dd>${order.delivery_phone || '-'}</dd>
                            <dt class="text-gray-600 col-span-2">お届け先住所:</dt>
                            <dd class="col-span-2">${order.delivery_address || '-'}</dd>
                        ` : ''}
                    </dl>
                </div>
                
                <!-- 商品詳細 -->
                <div class="bg-white p-3 rounded border border-sage-light">
                    <h4 class="font-bold text-sage-dark mb-2">
                        <i class="fas fa-shopping-cart mr-2"></i>商品詳細
                    </h4>
                    ${this.renderProductsDetail(order.products)}
                    ${order.shipping_cost ? `
                        <div class="bg-cream rounded p-2 mt-2">
                            <div class="flex justify-between">
                                <span class="font-medium"><i class="fas fa-truck mr-2"></i>送料</span>
                                <span class="font-bold">¥${order.shipping_cost.toLocaleString()}</span>
                            </div>
                        </div>
                    ` : ''}
                </div>
                
                <!-- 備考・合計 -->
                <div class="bg-white p-3 rounded border border-sage-light">
                    <h4 class="font-bold text-sage-dark mb-2">
                        <i class="fas fa-calculator mr-2"></i>備考・合計
                    </h4>
                    
                    ${order.product_notes ? `
                        <div class="mb-3">
                            <p class="text-sm font-medium text-gray-700 mb-1">商品備考:</p>
                            <p class="text-sm whitespace-pre-wrap bg-yellow-50 p-2 rounded">${order.product_notes}</p>
                        </div>
                    ` : ''}
                    
                    ${order.notes ? `
                        <div class="mb-3">
                            <p class="text-sm font-medium text-gray-700 mb-1">備考:</p>
                            <p class="text-sm whitespace-pre-wrap bg-gray-50 p-2 rounded">${order.notes}</p>
                        </div>
                    ` : ''}
                    
                    <div class="bg-cream rounded p-3">
                        <dl class="space-y-1 text-sm">
                            <div class="flex justify-between">
                                <dt>商品小計:</dt>
                                <dd>¥${(order.products?.reduce((sum, p) => sum + (p.totalPrice || p.price || 0), 0) || 0).toLocaleString()}</dd>
                            </div>
                            ${order.shipping_cost ? `
                                <div class="flex justify-between">
                                    <dt>送料:</dt>
                                    <dd>¥${order.shipping_cost.toLocaleString()}</dd>
                                </div>
                            ` : ''}
                            ${order.discount ? `
                                <div class="flex justify-between">
                                    <dt>ディスカウント:</dt>
                                    <dd>-¥${order.discount.toLocaleString()}</dd>
                                </div>
                            ` : ''}
                            <div class="flex justify-between font-bold text-base border-t pt-2">
                                <dt>合計金額:</dt>
                                <dd class="text-terracotta">¥${(order.total || 0).toLocaleString()}</dd>
                            </div>
                        </dl>
                    </div>
                    
                    <!-- 支払い情報 -->
                    <div class="mt-3 pt-3 border-t">
                        <dl class="grid grid-cols-2 gap-2 text-sm">
                            <dt class="text-gray-600">支払い状態:</dt>
                            <dd>${order.payment_status || '未'}</dd>
                            ${order.payment_date ? `
                                <dt class="text-gray-600">支払い日:</dt>
                                <dd>${order.payment_date}</dd>
                            ` : ''}
                            ${order.payment_staff ? `
                                <dt class="text-gray-600">支払い担当:</dt>
                                <dd>${order.payment_staff}</dd>
                            ` : ''}
                        </dl>
                    </div>
                    
                    <!-- 着手・完了情報 -->
                    ${order.work_started || order.completed ? `
                        <div class="mt-3 pt-3 border-t">
                            <dl class="grid grid-cols-2 gap-2 text-sm">
                                ${order.work_started ? `
                                    <dt class="text-gray-600">着手状態:</dt>
                                    <dd>着手済</dd>
                                    ${order.work_datetime ? `
                                        <dt class="text-gray-600">着手日時:</dt>
                                        <dd>${new Date(order.work_datetime).toLocaleString('ja-JP')}</dd>
                                    ` : ''}
                                    ${order.work_staff ? `
                                        <dt class="text-gray-600">着手担当:</dt>
                                        <dd>${order.work_staff}</dd>
                                    ` : ''}
                                ` : ''}
                                ${order.completed ? `
                                    <dt class="text-gray-600">完了状態:</dt>
                                    <dd>完了</dd>
                                    ${order.completed_datetime ? `
                                        <dt class="text-gray-600">完了日時:</dt>
                                        <dd>${new Date(order.completed_datetime).toLocaleString('ja-JP')}</dd>
                                    ` : ''}
                                    ${order.completed_staff ? `
                                        <dt class="text-gray-600">完了担当:</dt>
                                        <dd>${order.completed_staff}</dd>
                                    ` : ''}
                                ` : ''}
                            </dl>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    // 日時情報のレンダリング
    renderDateTimeInfo(order) {
        let html = '';
        const dateLabel = order.service === 'pickup' ? 'お引き取り日' : 
                         order.service === 'delivery' ? '配送希望日' :
                         order.service === 'shipping' ? '着希望日' :
                         order.service === 'construction' ? '施工日' : '日付';
        
        const timeLabel = order.service === 'pickup' ? 'ご来店時間' :
                         order.service === 'delivery' ? '配送希望時間' :
                         order.service === 'shipping' ? '着希望時間' :
                         order.service === 'construction' ? '施工時間' : '時間';
        
        if (order.date_undecided) {
            html += `
                <dt class="text-gray-600">${dateLabel}:</dt>
                <dd>日付指定なし</dd>
            `;
        } else {
            const dateRange = order.date_to && order.date_from !== order.date_to ? 
                            `${order.date_from} 〜 ${order.date_to}` : order.date_from || '-';
            html += `
                <dt class="text-gray-600">${dateLabel}:</dt>
                <dd>${dateRange}</dd>
            `;
        }
        
        if (order.time_undecided) {
            html += `
                <dt class="text-gray-600">${timeLabel}:</dt>
                <dd>時間指定なし</dd>
            `;
        } else {
            const timeRange = order.time_to && order.time_from !== order.time_to ? 
                            `${order.time_from} 〜 ${order.time_to}` : order.time_from || '-';
            html += `
                <dt class="text-gray-600">${timeLabel}:</dt>
                <dd>${timeRange}</dd>
            `;
        }
        
        return html;
    }
    
    // 商品詳細のレンダリング
    renderProductsDetail(products) {
        if (!products || products.length === 0) {
            return '<p class="text-gray-500">商品なし</p>';
        }
        
        return products.map(p => {
            const displayPrice = p.totalPrice || p.price || 0;
            let detailHtml = `
                <div class="bg-cream rounded p-3 mb-2">
                    <div class="flex justify-between mb-2">
                        <p class="font-medium">${this.getProductTitle(p)}</p>
                        <p class="font-bold">¥${displayPrice.toLocaleString()}</p>
                    </div>
            `;
            
            // 商品詳細情報
            const details = [];
            
            switch(p.category) {
                case 'dryflower':
                    if (p.size) details.push(`サイズ: ${p.size}`);
                    if (p.details) details.push(`詳細: ${p.details}`);
                    if (p.frameText && p.frameText !== '文字入れ不要') {
                        details.push(`文字入れ: ${p.frameText}`);
                        if (p.textOrderDate) details.push(`文字発注日: ${p.textOrderDate}`);
                        if (p.textReceiveDate) details.push(`文字受取予定日: ${p.textReceiveDate}`);
                    }
                    break;
                case 'plant':
                    if (p.genre) details.push(`ジャンル: ${p.genre}`);
                    if (p.name) details.push(`商品名: ${p.name}`);
                    break;
                case 'tree':
                    if (p.genre) details.push(`ジャンル: ${p.genre}`);
                    if (p.name) details.push(`商品名: ${p.name}`);
                    if (p.height) details.push(`高さ: ${p.height}`);
                    break;
                case 'construction':
                    if (p.details) details.push(`施工内容: ${p.details}`);
                    if (p.travel) details.push(`出張費: ¥${p.travel.toLocaleString()}`);
                    if (p.planting) details.push(`植栽費: ¥${p.planting.toLocaleString()}`);
                    break;
            }
            
            // メッセージカード・立札
            if (p.messageCard) details.push(`メッセージカード: ${p.messageCardContent || '内容未記載'}`);
            if (p.celebrationSign) details.push(`お祝い立札: ${p.celebrationSignContent || '内容未記載'}`);
            
            // 写真送付
            if (p.photo) details.push(`写真送付: ${p.photo}`);
            
            // 連絡
            if (p.contact && p.contact !== '連絡不要') {
                details.push(`連絡: ${p.contact}`);
                if (p.otherContactDetail) details.push(`連絡内容: ${p.otherContactDetail}`);
                if (p.method) details.push(`連絡方法: ${p.method}`);
                if (p.methodOther) details.push(`その他方法: ${p.methodOther}`);
                if (p.deadline) details.push(`連絡期日: ${p.deadline}`);
            }
            
            if (details.length > 0) {
                detailHtml += `<div class="text-sm text-gray-600 space-y-1">`;
                details.forEach(detail => {
                    detailHtml += `<p>・${detail}</p>`;
                });
                detailHtml += `</div>`;
            }
            
            detailHtml += `</div>`;
            return detailHtml;
        }).join('');
    }
    
    // サービスラベル取得
    getServiceLabel(service) {
        const labels = {
            pickup: 'お引き取り',
            delivery: '配送',
            shipping: '発送',
            construction: '植栽工事'
        };
        return labels[service] || service;
    }
    
    // 商品タイトル取得
    getProductTitle(product) {
        switch(product.category) {
            case 'dryflower': return product.type;
            case 'plant': return `【${product.genre}】${product.name || ''}`;
            case 'tree': return `【${product.genre}】${product.name || ''}`;
            case 'construction': return '植栽工事';
            default: return '商品';
        }
    }
    
    // 商品詳細取得
    getProductDetails(product) {
        let details = [];
        
        switch(product.category) {
            case 'dryflower':
                if (product.size) details.push(`サイズ: ${product.size}`);
                if (product.details) details.push(product.details);
                if (product.frameText && product.frameText !== '文字入れ不要') {
                    details.push(`文字入れ: ${product.frameText}`);
                }
                // 価格内訳を追加
                if (product.frameTextPrice && product.frameTextPrice > 0) {
                    details.push(`(商品¥${(product.price || 0).toLocaleString()} + 文字入れ¥${product.frameTextPrice.toLocaleString()})`);
                }
                break;
            case 'plant':
                if (product.genre) details.push(`ジャンル: ${product.genre}`);
                break;
            case 'tree':
                if (product.genre) details.push(`ジャンル: ${product.genre}`);
                if (product.height) details.push(`高さ: ${product.height}`);
                break;
            case 'construction':
                if (product.details) details.push(product.details);
                break;
        }
        
        return details.join(' / ');
    }
    
    // オーダー編集
    editOrder(orderId) {
        const order = this.orders.find(o => o.id === orderId);
        if (!order) return;
        
        this.editingOrderId = orderId;
        this.loadOrderToForm(order);
        this.switchTab('input');
        
        // 編集モードの表示
        document.getElementById('work-section')?.classList.remove('hidden');
        
        // 編集時は完了セクションを表示
        const completedSection = document.getElementById('completed-section');
        if (completedSection) {
            completedSection.style.display = 'block';
        }
        
        // 編集時は削除セクションも表示
        const deleteSection = document.getElementById('delete-section');
        if (deleteSection) {
            deleteSection.classList.remove('hidden');
        }
        
        // 編集時は保存ボタンを表示（サービス選択済みのため）
        const saveButton = document.getElementById('save-button');
        if (saveButton) {
            saveButton.classList.remove('hidden');
        }
        
        this.showToast('編集モードで開きました', 'info');
    }
    
    // オーダーをフォームに読み込み
    loadOrderToForm(order) {
        // 基本情報
        document.getElementById('reception-date').value = order.reception_date || '';
        if (order.staff) {
            const staffList = ['市山', '五十嵐', '藤田', '和佐田', '市山優', '梅本', '中山', '藤井'];
            if (staffList.includes(order.staff)) {
                document.getElementById('staff').value = order.staff;
                document.getElementById('staff-other').classList.add('hidden');
            } else {
                document.getElementById('staff').value = 'ゲスト';
                document.getElementById('staff-other').value = order.staff;
                document.getElementById('staff-other').classList.remove('hidden');
            }
        }
        
        // サービス
        if (order.service) {
            document.querySelector(`input[name="service"][value="${order.service}"]`).checked = true;
            this.updateServiceLabels(order.service);
        }
        
        // 日時
        document.getElementById('date-from').value = order.date_from || '';
        document.getElementById('date-to').value = order.date_to || '';
        document.getElementById('date-undecided').checked = order.date_undecided || false;
        document.getElementById('time-from').value = order.time_from || '';
        document.getElementById('time-to').value = order.time_to || '';
        document.getElementById('time-undecided').checked = order.time_undecided || false;
        if (order.shipping_date) {
            document.getElementById('shipping-date').value = order.shipping_date;
        }
        
        // お客様情報
        document.getElementById('customer-name').value = order.customer_name || '';
        document.getElementById('customer-phone').value = order.customer_phone || '';
        document.getElementById('customer-address').value = order.customer_address || '';
        
        // お届け先
        if (order.delivery_name) document.getElementById('delivery-name').value = order.delivery_name;
        if (order.delivery_phone) document.getElementById('delivery-phone').value = order.delivery_phone;
        if (order.delivery_address) document.getElementById('delivery-address').value = order.delivery_address;
        
        // 商品
        this.addedProducts = order.products || [];
        this.renderAddedProducts();
        if (order.shipping_cost) {
            document.getElementById('shipping-cost').value = order.shipping_cost;
        }
        if (order.product_notes) {
            document.getElementById('product-notes').value = order.product_notes;
        }
        
        // 金額・備考
        document.getElementById('discount').value = order.discount || 0;
        document.getElementById('notes').value = order.notes || '';
        
        // 支払い
        document.getElementById('payment-status').value = order.payment_status || '未';
        if (order.payment_status === '済') {
            document.getElementById('payment-date-container').classList.remove('hidden');
            document.getElementById('payment-staff-container').classList.remove('hidden');
            if (order.payment_date) document.getElementById('payment-date').value = order.payment_date;
            if (order.payment_staff) {
                const staffList = ['市山', '五十嵐', '藤田', '和佐田', '市山優', '梅本', '中山', '藤井'];
                if (staffList.includes(order.payment_staff)) {
                    document.getElementById('payment-staff').value = order.payment_staff;
                    document.getElementById('payment-staff-other')?.classList.add('hidden');
                } else {
                    document.getElementById('payment-staff').value = 'ゲスト';
                    document.getElementById('payment-staff-other').value = order.payment_staff;
                    document.getElementById('payment-staff-other')?.classList.remove('hidden');
                }
            }
        }
        
        // 着手・完了
        if (order.work_started) {
            document.getElementById('work-started').checked = true;
            document.getElementById('work-details').classList.remove('hidden');
            if (order.work_staff) {
                const staffList = ['市山', '五十嵐', '藤田', '和佐田', '市山優', '梅本', '中山', '藤井'];
                if (staffList.includes(order.work_staff)) {
                    document.getElementById('work-staff').value = order.work_staff;
                    document.getElementById('work-staff-other')?.classList.add('hidden');
                } else {
                    document.getElementById('work-staff').value = 'ゲスト';
                    document.getElementById('work-staff-other').value = order.work_staff;
                    document.getElementById('work-staff-other')?.classList.remove('hidden');
                }
            }
            if (order.work_datetime) {
                document.getElementById('work-datetime').value = order.work_datetime;
            } else if (order.work_date) {
                // 旧データ互換性のため
                document.getElementById('work-datetime').value = order.work_date + 'T09:00';
            }
            
            // 作業状態と連絡記録を設定
            if (order.work_status) {
                document.getElementById('work-status').value = order.work_status;
            }
            if (order.contact_record) {
                document.getElementById('contact-record').value = order.contact_record;
            }
            
            // 履歴を復元
            this.workStatusHistory = order.work_status_history || [];
            this.contactRecordHistory = order.contact_record_history || [];
            this.renderWorkStatusHistory();
            this.renderContactRecordHistory();
            
            // ボタンの表示を更新
            this.updateWorkButtons();
        }
        
        // 完了情報
        document.getElementById('completed').checked = order.completed || false;
        if (order.completed) {
            document.getElementById('completed-details').classList.remove('hidden');
            if (order.completed_datetime) {
                document.getElementById('completed-datetime').value = order.completed_datetime;
            }
            if (order.completed_staff) {
                const staffList = ['市山', '五十嵐', '藤田', '和佐田', '市山優', '梅本', '中山', '藤井'];
                if (staffList.includes(order.completed_staff)) {
                    document.getElementById('completed-staff').value = order.completed_staff;
                    document.getElementById('completed-staff-other')?.classList.add('hidden');
                } else {
                    document.getElementById('completed-staff').value = 'ゲスト';
                    document.getElementById('completed-staff-other').value = order.completed_staff;
                    document.getElementById('completed-staff-other')?.classList.remove('hidden');
                }
            }
        }
        
        // 合計更新
        this.updateTotal();
        
        // 全セクションを表示（編集モード用）
        this.showAllSections();
        
        // 編集時は完了セクションを表示
        const completedSection = document.getElementById('completed-section');
        if (completedSection) {
            completedSection.style.display = 'block';
        }
    }
    
    // 削除チェックボックスのトグル
    toggleDeleteConfirm() {
        const check = document.getElementById('delete-check');
        const confirmArea = document.getElementById('delete-confirm');
        
        if (check.checked) {
            confirmArea.classList.remove('hidden');
            // アニメーションクラスを一時的に追加
            confirmArea.classList.add('shake-once');
            setTimeout(() => {
                confirmArea.classList.remove('shake-once');
            }, 500);
        } else {
            confirmArea.classList.add('hidden');
        }
    }
    
    // 削除確認（編集画面から）
    confirmDelete() {
        if (!this.editingOrderId) {
            this.showToast('削除対象のオーダーがありません', 'error');
            return;
        }
        
        const order = this.orders.find(o => o.id === this.editingOrderId);
        if (!order) {
            this.showToast('オーダーが見つかりません', 'error');
            return;
        }
        
        // 詳細な確認メッセージ
        const customerName = order.customer_name || '名前未設定';
        const receptionDate = order.reception_date || '日付未設定';
        const message = `以下のオーダーを完全に削除します。この操作は取り消せません。\n\n` +
                       `お客様: ${customerName} 様\n` +
                       `受注日: ${receptionDate}\n\n` +
                       `本当に削除しますか？`;
        
        if (confirm(message)) {
            // 再度確認
            if (confirm('最終確認：本当にこのオーダーを削除してもよろしいですか？')) {
                this.deleteOrder(this.editingOrderId);
                // フォームをクリアして一覧に戻る
                this.clearForm();
                this.switchTab('today');
            }
        }
    }
    
    // オーダー削除（内部処理）
    deleteOrder(orderId) {
        const index = this.orders.findIndex(o => o.id === orderId);
        if (index !== -1) {
            // 論理削除
            this.orders[index].deleted = true;
            this.orders[index].deleted_at = new Date().toISOString();
            
            this.saveData();
            this.updateOrderCount();
            
            this.showToast('オーダーを削除しました', 'info');
        }
    }
    
    // 検索
    searchOrders() {
        const keyword = document.getElementById('search-keyword').value.toLowerCase();
        const status = document.getElementById('search-status').value;
        
        let results = this.orders.filter(o => !o.deleted);
        
        // キーワード検索（全フィールド対象）
        if (keyword) {
            results = results.filter(order => {
                // 基本情報
                const basicInfo = `
                    ${order.id || ''}
                    ${order.reception_date || ''}
                    ${order.staff || ''}
                    ${order.service || ''}
                    ${order.date_from || ''}
                    ${order.date_to || ''}
                    ${order.time_from || ''}
                    ${order.time_to || ''}
                    ${order.shipping_date || ''}
                `.toLowerCase();
                
                // 顧客情報
                const customerInfo = `
                    ${order.customer_name || ''}
                    ${order.customer_phone || ''}
                    ${order.customer_address || ''}
                    ${order.delivery_name || ''}
                    ${order.delivery_phone || ''}
                    ${order.delivery_address || ''}
                `.toLowerCase();
                
                // 商品情報（商品名、詳細、ジャンル、メッセージ等すべて）
                const productInfo = (order.products || []).map(p => {
                    return `
                        ${p.category || ''}
                        ${p.type || ''}
                        ${p.name || ''}
                        ${p.genre || ''}
                        ${p.genreDetail || ''}
                        ${p.size || ''}
                        ${p.details || ''}
                        ${p.frameText || ''}
                        ${p.height || ''}
                        ${p.messageCardContent || ''}
                        ${p.celebrationSignContent || ''}
                        ${p.photo || ''}
                        ${p.contact || ''}
                        ${p.otherContactDetail || ''}
                        ${p.method || ''}
                        ${p.methodOther || ''}
                        ${p.deadline || ''}
                    `;
                }).join(' ').toLowerCase();
                
                // 備考・その他
                const notesInfo = `
                    ${order.notes || ''}
                    ${order.product_notes || ''}
                    ${order.payment_status || ''}
                    ${order.payment_staff || ''}
                    ${order.work_status || ''}
                    ${order.work_staff || ''}
                    ${order.contact_record || ''}
                    ${order.completed_staff || ''}
                `.toLowerCase();
                
                // 履歴情報
                const historyInfo = [
                    ...(order.work_status_history || []).map(h => `${h.status} ${h.staff}`),
                    ...(order.contact_record_history || []).map(h => `${h.record} ${h.staff}`)
                ].join(' ').toLowerCase();
                
                // すべての情報を結合して検索
                const searchText = `${basicInfo} ${customerInfo} ${productInfo} ${notesInfo} ${historyInfo}`;
                return searchText.includes(keyword);
            });
        }
        
        // ステータスフィルター
        switch(status) {
            case 'incomplete':
                results = results.filter(o => !o.completed);
                break;
            case 'completed':
                results = results.filter(o => o.completed);
                break;
        }
        
        // 検索結果の情報を表示
        const resultInfo = document.getElementById('search-result-info');
        const resultCount = document.getElementById('search-result-count');
        
        if (keyword || status) {
            resultInfo.classList.remove('hidden');
            let message = `検索結果: ${results.length}件`;
            
            if (keyword) {
                message += ` (キーワード: "${keyword}")`;
            }
            if (status) {
                const statusLabels = {
                    'incomplete': '未完了',
                    'completed': '完了済み'
                };
                message += ` (状態: ${statusLabels[status] || status})`;
            }
            
            resultCount.textContent = message;
        } else {
            resultInfo.classList.add('hidden');
        }
        
        this.renderOrders('search-results', results);
    }
    
    // モーダル操作
    openModal() {
        document.getElementById('modal').classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
    
    closeModal() {
        document.getElementById('modal').classList.add('hidden');
        document.body.style.overflow = '';
    }
    
    // トースト通知
    showToast(message, type = 'info', duration = null) {
        console.log('showToast called:', message, type);
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toast-message');
        
        if (!toast || !toastMessage) {
            console.error('Toast elements not found:', { toast, toastMessage });
            return;
        }
        
        // 前回のタイマーをクリア（連続呼び出しの場合）
        if (this.toastTimer) {
            clearTimeout(this.toastTimer);
        }
        
        // メッセージタイプに応じた表示時間を設定
        let displayDuration = duration;
        if (!displayDuration) {
            switch (type) {
                case 'success':
                    displayDuration = 4000; // 成功メッセージは4秒
                    break;
                case 'error':
                    displayDuration = 5000; // エラーメッセージは5秒
                    break;
                case 'warning':
                    displayDuration = 4000; // 警告メッセージは4秒
                    break;
                default:
                    displayDuration = 3000; // 情報メッセージは3秒
            }
        }
        
        console.log('Setting toast message and showing for:', displayDuration, 'ms');
        toastMessage.textContent = message;
        toast.className = `toast ${type}`;
        toast.classList.remove('hidden');
        
        this.toastTimer = setTimeout(() => {
            console.log('Hiding toast after', displayDuration, 'ms');
            toast.classList.add('hidden');
            this.toastTimer = null;
        }, displayDuration);
    }
    
    // ローディング表示
    showLoading() {
        document.getElementById('loading').classList.remove('hidden');
    }
    
    hideLoading() {
        document.getElementById('loading').classList.add('hidden');
    }
    
    // データ同期
    async syncData() {
        try {
            this.showLoading();
            
            // API実装時はここでサーバーと同期
            await this.delay(1000); // デモ用遅延
            
            this.loadData();
            this.updateOrderCount();
            this.loadTabData(document.querySelector('.tab-btn.active').dataset.tab);
            
            this.showToast('データを同期しました', 'success');
        } catch (error) {
            this.showToast('同期に失敗しました', 'error');
        } finally {
            this.hideLoading();
        }
    }
    
    // 遅延用ヘルパー
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    // 本日のオーダー数を更新
    updateTodayCount() {
        const todayOrders = this.filterTodayOrders();
        const count = todayOrders.length;
        const countElement = document.getElementById('today-count');
        if (countElement) {
            countElement.textContent = count;
        }
    }
    
    // オーダー件数更新
    updateOrderCount() {
        const incompleteCount = this.orders.filter(o => !o.deleted && !o.completed).length;
        
        // モバイル・デスクトップ両方の要素を更新
        const incompleteTextMobile = document.getElementById('incomplete-count-text');
        const incompleteTextDesktop = document.querySelector('.incomplete-count-text');
        
        if (incompleteTextMobile) {
            incompleteTextMobile.textContent = incompleteCount;
        }
        if (incompleteTextDesktop) {
            incompleteTextDesktop.textContent = incompleteCount;
        }
        
        // ボタンの色を動的に変更（未完了がある場合は目立つ色に）
        const btn = document.getElementById('incomplete-count-btn');
        if (btn) {
            if (incompleteCount > 0) {
                btn.classList.remove('bg-sage', 'hover:bg-sage-dark');
                btn.classList.add('bg-terracotta', 'hover:bg-terracotta-light');
            } else {
                btn.classList.remove('bg-terracotta', 'hover:bg-terracotta-light');
                btn.classList.add('bg-sage', 'hover:bg-sage-dark');
            }
        }
        
        // 本日の件数も更新
        this.updateTodayCount();
    }
    
    // 未完了タブを開く
    showIncompleteTab() {
        // 検索タブに切り替えて、未完了のオーダーを表示
        this.switchTab('search');
        
        // 検索フォームをクリア
        const searchInput = document.getElementById('search-keyword');
        if (searchInput) {
            searchInput.value = '';
        }
        
        // ステータスを未完了に設定
        const statusSelect = document.getElementById('search-status');
        if (statusSelect) {
            statusSelect.value = 'incomplete';
        }
        
        // 検索を実行
        this.searchOrders();
        
        // スムーズスクロール
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    
    // データ保存（データベースまたはローカルストレージ）
    async saveData() {
        // データベースマネージャーが利用可能か確認
        if (typeof db !== 'undefined' && db.isOnline) {
            // オンラインモードの場合はSupabaseを使用
            console.log('Saving to Supabase...');
            // 注：個別の保存はcreateOrder/updateOrderメソッドで実行
        } else {
            // オフラインモードの場合はLocalStorageを使用
            localStorage.setItem('orderSystem_orders', JSON.stringify(this.orders));
        }
        this.updateOrderCount();
    }
    
    // データ読み込み
    async loadData() {
        // データベースマネージャーが利用可能か確認
        if (typeof db !== 'undefined' && db.isOnline) {
            // オンラインモードの場合はSupabaseから読み込み
            console.log('Loading from Supabase...');
            try {
                const orders = await db.getOrders({ deleted: false });
                this.orders = orders || [];
            } catch (error) {
                console.error('Failed to load from Supabase:', error);
                this.loadLocalData();
            }
        } else {
            // オフラインモードの場合はLocalStorageから読み込み
            this.loadLocalData();
        }
    }
    
    // ローカルデータ読み込み
    loadLocalData() {
        const stored = localStorage.getItem('orderSystem_orders');
        if (stored) {
            try {
                this.orders = JSON.parse(stored);
            } catch (e) {
                this.orders = [];
            }
        } else {
            // デモデータ
            this.loadDemoData();
        }
    }
    
    // デモデータ読み込み
    loadDemoData() {
        this.orders = [
            {
                id: '1',
                reception_date: '2025-01-27',
                staff: '市山',
                service: 'pickup',
                date_from: '2025-01-30',
                date_to: '2025-01-30',
                time_from: '10:00',
                time_to: '12:00',
                customer_name: '山田花子',
                customer_phone: '090-1234-5678',
                customer_address: '東京都渋谷区1-1-1',
                products: [
                    {
                        category: 'dryflower',
                        type: 'スワッグ',
                        price: 5500,
                        details: 'ピンク系',
                        photo: '要',
                        contact: '完成の連絡（TEL）'
                    }
                ],
                total: 5500,
                payment_status: '未',
                notes: 'プレゼント用にラッピング',
                work_started: false,
                completed: false,
                created_at: '2025-01-27T10:00:00Z',
                updated_at: '2025-01-27T10:00:00Z'
            },
            {
                id: '2',
                reception_date: '2025-01-26',
                staff: '五十嵐',
                service: 'delivery',
                date_from: '2025-01-28',
                customer_name: '鈴木一郎',
                customer_phone: '080-9876-5432',
                delivery_name: '鈴木二郎',
                delivery_address: '神奈川県横浜市2-2-2',
                products: [
                    {
                        category: 'plant',
                        name: 'パキラ',
                        size: '7号',
                        price: 8800,
                        pot: '白陶器'
                    }
                ],
                shipping_cost: 1100,
                total: 9900,
                payment_status: '済',
                payment_date: '2025-01-26',
                payment_staff: '佐藤',
                work_started: true,
                work_staff: '高橋',
                work_date: '2025-01-27',
                completed: false,
                created_at: '2025-01-26T14:00:00Z',
                updated_at: '2025-01-27T09:00:00Z'
            }
        ];
        
        this.saveData();
    }
}

// アプリケーション初期化（シングルトンパターン）
let app;
document.addEventListener('DOMContentLoaded', () => {
    // 既にインスタンスが存在する場合は新規作成しない
    if (window.app && window.app instanceof OrderSystem) {
        console.log('OrderSystem instance already exists, skipping creation');
        app = window.app;
        return;
    }
    
    console.log('Creating new OrderSystem instance');
    app = new OrderSystem();
    window.app = app; // グローバルスコープでも利用可能にする
});