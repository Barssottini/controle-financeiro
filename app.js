// ============================================
// STATE MANAGEMENT
// ============================================
const state = {
    transactions: [],
    currentEditId: null,
    openBanking: {
        connected: false,
        accounts: [],
        importedTransactions: [],
        lastSync: null
    }
};

const AVAILABLE_BANKS = [
    { id: 1,  name: 'Banco do Brasil', logo: '🟡', code: '001' },
    { id: 2,  name: 'Bradesco',        logo: '🔴', code: '237' },
    { id: 3,  name: 'Caixa Econômica', logo: '🔵', code: '104' },
    { id: 4,  name: 'Itaú',            logo: '🟠', code: '341' },
    { id: 5,  name: 'Santander',       logo: '🔴', code: '033' },
    { id: 6,  name: 'Nubank',          logo: '🟣', code: '260' },
    { id: 7,  name: 'Inter',           logo: '🟠', code: '077' },
    { id: 8,  name: 'BTG Pactual',     logo: '⚫', code: '208' },
    { id: 9,  name: 'C6 Bank',         logo: '⚫', code: '336' },
    { id: 10, name: 'Banco Original',  logo: '🟢', code: '212' }
];

let selectedBank = null;

// ============================================
// NAVIGATION
// ============================================
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));

    document.getElementById(pageId).classList.add('active');

    document.querySelectorAll('.menu-item').forEach(item => {
        const itemText = item.querySelector('.menu-text').textContent.toLowerCase();
        if (
            (pageId === 'dashboard'    && itemText === 'dashboard')    ||
            (pageId === 'transactions' && itemText === 'transações')   ||
            (pageId === 'open-banking' && itemText === 'open banking')
        ) {
            item.classList.add('active');
        }
    });

    if (pageId === 'dashboard')    updateDashboard();
    if (pageId === 'transactions') renderTransactions();
    if (pageId === 'open-banking') updateOpenBankingPage();
}

// ============================================
// MODAL MANAGEMENT
// ============================================
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.add('active');

    if (modalId === 'transaction-modal') {
        document.getElementById('date').valueAsDate = new Date();
    }
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    if (modalId === 'transaction-modal') {
        resetTransactionForm();
    }
}

function resetTransactionForm() {
    document.querySelector('#transaction-modal form').reset();
    document.getElementById('modal-title').textContent = 'Nova Transação';
    state.currentEditId = null;
}

// ============================================
// TRANSACTIONS CRUD
// ============================================
function saveTransaction(event) {
    event.preventDefault();

    const formData = {
        id:          state.currentEditId || Date.now(),
        type:        document.querySelector('input[name="type"]:checked').value,
        description: document.getElementById('description').value,
        amount:      parseFloat(document.getElementById('amount').value),
        date:        document.getElementById('date').value,
        category:    document.getElementById('category').value
    };

    if (state.currentEditId) {
        const index = state.transactions.findIndex(t => t.id === state.currentEditId);
        state.transactions[index] = formData;
    } else {
        state.transactions.push(formData);
    }

    saveTransactions();
    closeModal('transaction-modal');
    updateDashboard();
    renderTransactions();
}

// FIX: template literal backtick was missing around the querySelector string
function editTransaction(id) {
    const transaction = state.transactions.find(t => t.id === id);
    if (!transaction) return;

    state.currentEditId = id;
    document.getElementById('modal-title').textContent = 'Editar Transação';

    // FIXED: added backtick template literal correctly
    const radioEl = document.querySelector(`input[name="type"][value="${transaction.type}"]`);
    if (radioEl) radioEl.checked = true;

    document.getElementById('description').value = transaction.description;
    document.getElementById('amount').value      = transaction.amount;
    document.getElementById('date').value        = transaction.date;
    document.getElementById('category').value    = transaction.category;

    openModal('transaction-modal');
}

function deleteTransaction(id) {
    if (confirm('Tem certeza que deseja excluir esta transação?')) {
        state.transactions = state.transactions.filter(t => t.id !== id);
        saveTransactions();
        updateDashboard();
        renderTransactions();
    }
}

// ============================================
// RENDER FUNCTIONS
// ============================================
function updateDashboard() {
    const income  = state.transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expense = state.transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const balance = income - expense;

    document.getElementById('total-income').textContent  = formatCurrency(income);
    document.getElementById('total-expense').textContent = formatCurrency(expense);
    document.getElementById('total-balance').textContent = formatCurrency(balance);

    const recent = [...state.transactions]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);

    renderTransactionsList('recent-transactions', recent);
}

function renderTransactions() {
    renderTransactionsList('transactions-list', state.transactions);
}

// FIX: rebuilt the entire HTML template — was completely stripped/corrupted in original
function renderTransactionsList(containerId, transactions) {
    const container = document.getElementById(containerId);

    if (transactions.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">💳</span>
                <p>Nenhuma transação encontrada</p>
            </div>`;
        return;
    }

    container.innerHTML = [...transactions]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .map(t => `
            <div class="transaction-item">
                <div class="trans-icon ${t.type}">
                    ${t.type === 'income' ? '💰' : '💸'}
                </div>
                <div class="trans-info">
                    <div class="trans-desc">${t.description}</div>
                    <div class="trans-meta">${t.category} • ${formatDate(t.date)}</div>
                </div>
                <div class="trans-amount ${t.type}">
                    ${t.type === 'income' ? '+' : '-'} ${formatCurrency(t.amount)}
                </div>
                <div class="trans-actions">
                    <button class="icon-btn" onclick="editTransaction(${t.id})" title="Editar">✏️</button>
                    <button class="icon-btn delete" onclick="deleteTransaction(${t.id})" title="Excluir">🗑️</button>
                </div>
            </div>`)
        .join('');
}

// ============================================
// FILTERS
// ============================================
function filterTransactions() {
    const searchTerm     = document.getElementById('search-input').value.toLowerCase();
    const typeFilter     = document.getElementById('filter-type').value;
    const categoryFilter = document.getElementById('filter-category').value;

    const filtered = state.transactions.filter(t => {
        const matchesSearch   = t.description.toLowerCase().includes(searchTerm);
        const matchesType     = !typeFilter     || t.type     === typeFilter;
        const matchesCategory = !categoryFilter || t.category === categoryFilter;
        return matchesSearch && matchesType && matchesCategory;
    });

    renderTransactionsList('transactions-list', filtered);
}

// ============================================
// OPEN BANKING
// ============================================

// FIX: rebuilt HTML template — was completely stripped/corrupted in original
function renderBanksList() {
    const container = document.getElementById('banks-list');
    container.innerHTML = AVAILABLE_BANKS.map(bank => `
        <div class="bank-item" onclick="selectBank(${bank.id})">
            <div class="bank-logo">${bank.logo}</div>
            <div class="bank-info">
                <div class="bank-name">${bank.name}</div>
                <div class="bank-status">✓ Disponível</div>
            </div>
        </div>`).join('');
}

function filterBanks() {
    const searchTerm = document.getElementById('bank-search').value.toLowerCase();
    const filtered   = AVAILABLE_BANKS.filter(b => b.name.toLowerCase().includes(searchTerm));
    const container  = document.getElementById('banks-list');

    container.innerHTML = filtered.map(bank => `
        <div class="bank-item" onclick="selectBank(${bank.id})">
            <div class="bank-logo">${bank.logo}</div>
            <div class="bank-info">
                <div class="bank-name">${bank.name}</div>
                <div class="bank-status">✓ Disponível</div>
            </div>
        </div>`).join('');
}

function selectBank(bankId) {
    selectedBank = AVAILABLE_BANKS.find(b => b.id === bankId);
    document.getElementById('auth-bank-logo').textContent = selectedBank.logo;
    document.getElementById('auth-bank-name').textContent = selectedBank.name;
    closeModal('bank-selection-modal');
    openModal('bank-auth-modal');
}

function authenticateBank(event) {
    event.preventDefault();

    const agency  = document.getElementById('agency').value;
    const account = document.getElementById('account').value;

    setTimeout(() => {
        const newAccount = {
            id:      Date.now(),
            bank:    selectedBank,
            agency:  agency,
            account: account,
            type:    'Conta Corrente',
            balance: Math.random() * 10000 + 5000
        };

        state.openBanking.accounts.push(newAccount);
        state.openBanking.connected = true;

        generateMockTransactions();
        saveOpenBankingData();
        closeModal('bank-auth-modal');

        document.getElementById('agency').value  = '';
        document.getElementById('account').value = '';

        updateOpenBankingPage();
        alert('✅ Banco conectado com sucesso!');
    }, 1000);
}

function generateMockTransactions() {
    const mockData = [
        { description: 'Supermercado Extra',  amount: 234.50,  type: 'expense', category: 'Alimentação' },
        { description: 'Salário',             amount: 5000.00, type: 'income',  category: 'Salário'     },
        { description: 'Uber',                amount: 45.80,   type: 'expense', category: 'Transporte'  },
        { description: 'Netflix',             amount: 39.90,   type: 'expense', category: 'Lazer'       },
        { description: 'Farmácia',            amount: 67.20,   type: 'expense', category: 'Saúde'       },
        { description: 'Freelance - Site',    amount: 1500.00, type: 'income',  category: 'Freelance'   },
        { description: 'Conta de Luz',        amount: 156.70,  type: 'expense', category: 'Moradia'     },
        { description: 'Academia',            amount: 89.90,   type: 'expense', category: 'Saúde'       }
    ];

    const today = new Date();

    state.openBanking.importedTransactions = mockData.map((t, i) => ({
        id:       Date.now() + i,
        ...t,
        date:     new Date(today.getTime() - i * 86400000).toISOString().split('T')[0],
        imported: true
    }));

    state.openBanking.lastSync = new Date().toISOString();
}

// FIX: syncTransactions now receives the event parameter explicitly
function syncTransactions(event) {
    const btn          = event.currentTarget;
    const originalText = btn.textContent;
    btn.textContent    = '⏳ Sincronizando...';
    btn.disabled       = true;

    setTimeout(() => {
        generateMockTransactions();
        state.openBanking.lastSync = new Date().toISOString();
        saveOpenBankingData();
        updateOpenBankingPage();

        btn.textContent = originalText;
        btn.disabled    = false;

        alert('✅ Transações sincronizadas!');
    }, 2000);
}

function disconnectBank(accountId) {
    if (confirm('Tem certeza que deseja desconectar esta conta?')) {
        state.openBanking.accounts = state.openBanking.accounts.filter(a => a.id !== accountId);

        if (state.openBanking.accounts.length === 0) {
            state.openBanking.connected            = false;
            state.openBanking.importedTransactions = [];
            state.openBanking.lastSync             = null;
        }

        saveOpenBankingData();
        updateOpenBankingPage();
    }
}

// FIX: rebuilt entire HTML template — was heavily corrupted with broken inline styles in original
function updateOpenBankingPage() {
    const accountsContainer = document.getElementById('connected-accounts');
    const importedSection   = document.getElementById('imported-section');

    if (state.openBanking.connected && state.openBanking.accounts.length > 0) {
        accountsContainer.innerHTML = state.openBanking.accounts.map(acc => `
            <div class="connected-account">
                <div class="account-info">
                    <span style="font-size: 28px;">${acc.bank.logo}</span>
                    <div>
                        <div style="font-weight: 700; font-size: 15px;">${acc.bank.name}</div>
                        <div class="account-details">Ag: ${acc.agency} • Conta: ${acc.account} • ${acc.type}</div>
                        ${state.openBanking.lastSync
                            ? `<div style="font-size: 11px; color: var(--text-lighter); margin-top: 4px;">
                                   Sync: ${new Date(state.openBanking.lastSync).toLocaleString('pt-BR', {
                                       day: '2-digit', month: '2-digit',
                                       hour: '2-digit', minute: '2-digit'
                                   })}
                               </div>`
                            : ''}
                    </div>
                </div>
                <div style="text-align: right;">
                    <div class="account-balance">${formatCurrency(acc.balance)}</div>
                    <button class="btn btn-danger btn-small" onclick="disconnectBank(${acc.id})" style="margin-top: 8px;">
                        Desconectar
                    </button>
                </div>
            </div>`).join('');

        importedSection.style.display = 'block';
        renderImportedTransactions();
    } else {
        accountsContainer.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">🏦</span>
                <p>Nenhuma conta conectada ainda</p>
                <button class="btn btn-primary" onclick="openModal('bank-selection-modal')" style="margin-top: 16px;">
                    Conectar meu banco
                </button>
            </div>`;
        importedSection.style.display = 'none';
    }
}

function renderImportedTransactions() {
    const container = document.getElementById('imported-transactions');

    if (state.openBanking.importedTransactions.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">📥</span>
                <p>Nenhuma transação importada</p>
            </div>`;
        return;
    }

    container.innerHTML = state.openBanking.importedTransactions
        .slice(0, 10)
        .map(t => `
            <div class="transaction-item">
                <div class="trans-icon ${t.type}">
                    ${t.type === 'income' ? '💰' : '💸'}
                </div>
                <div class="trans-info">
                    <div class="trans-desc">${t.description}</div>
                    <div class="trans-meta">
                        <span class="sync-badge">🔄 Importada</span>
                        ${t.category} • ${formatDate(t.date)}
                    </div>
                </div>
                <div class="trans-amount ${t.type}">
                    ${t.type === 'income' ? '+' : '-'} ${formatCurrency(t.amount)}
                </div>
                <div class="trans-actions">
                    <button class="btn btn-primary btn-small" onclick="importToTransactions(${t.id})">
                        ➕ Adicionar
                    </button>
                </div>
            </div>`)
        .join('');
}

function importToTransactions(transactionId) {
    const imported = state.openBanking.importedTransactions.find(t => t.id === transactionId);
    if (!imported) return;

    const alreadyImported = state.transactions.some(t =>
        t.description === imported.description &&
        t.amount      === imported.amount      &&
        t.date        === imported.date
    );

    if (alreadyImported) {
        alert('⚠️ Esta transação já foi adicionada!');
        return;
    }

    state.transactions.push({
        id:          Date.now(),
        type:        imported.type,
        description: imported.description,
        amount:      imported.amount,
        date:        imported.date,
        category:    imported.category
    });

    saveTransactions();
    updateDashboard();
    alert('✅ Transação adicionada ao seu controle financeiro!');
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDate(dateString) {
    return new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric'
    });
}

// ============================================
// LOCAL STORAGE
// ============================================
function saveTransactions() {
    localStorage.setItem('transactions', JSON.stringify(state.transactions));
}

function loadTransactions() {
    const saved = localStorage.getItem('transactions');
    if (saved) state.transactions = JSON.parse(saved);
}

function saveOpenBankingData() {
    localStorage.setItem('openBanking', JSON.stringify(state.openBanking));
}

function loadOpenBankingData() {
    const saved = localStorage.getItem('openBanking');
    if (saved) state.openBanking = JSON.parse(saved);
}

// ============================================
// EVENT LISTENERS
// ============================================
function initEventListeners() {
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', e => {
            if (e.target === overlay) closeModal(overlay.id);
        });
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.active').forEach(modal => {
                closeModal(modal.id);
            });
        }
    });
}

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    loadTransactions();
    loadOpenBankingData();
    initEventListeners();
    renderBanksList();
    showPage('dashboard');
});
