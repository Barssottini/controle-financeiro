css
Copiar
Baixar
: 1fr;
    }
    
    .filters {
        grid-template-columns: 1fr;
    }
    
    .form-row {
        grid-template-columns: 1fr;
    }
    
    .page-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 16px;
    }
    
    .banks-grid {
        grid-template-columns: 1fr;
    }
}

3️⃣ app.js (completo)

```javascript
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

// Lista de bancos disponíveis
const AVAILABLE_BANKS = [
{ id: 1, name: 'Banco do Brasil', logo: '🟡', code: '001' },
{ id: 2, name: 'Bradesco', logo: '🔴', code: '237' },
{ id: 3, name: 'Caixa Econômica', logo: '🔵', code: '104' },
{ id: 4, name: 'Itaú', logo: '🟠', code: '341' },
{ id: 5, name: 'Santander', logo: '🔴', code: '033' },
{ id: 6, name: 'Nubank', logo: '🟣', code: '260' },
{ id: 7, name: 'Inter', logo: '🟠', code: '077' },
{ id: 8, name: 'BTG Pactual', logo: '⚫', code: '208' },
{ id: 9, name: 'C6 Bank', logo: '⚫', code: '336' },
{ id: 10, name: 'Banco Original', logo: '🟢', code: '212' }
];

let selectedBank = null;

// ============================================
// NAVIGATION
// ============================================
function showPage(pageId) {
// Remove active class from all pages and menu items
document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));

// Add active class to selected page
document.getElementById(pageId).classList.add('active');

// Add active class to corresponding menu item
event.target.closest('.menu-item')?.classList.add('active');

// Update content based on page
if (pageId === 'dashboard') {
updateDashboard();
} else if (pageId === 'transactions') {
renderTransactions();
} else if (pageId === 'open-banking') {
updateOpenBankingPage();
}
}

// ============================================
// MODAL MANAGEMENT
// ============================================
function openModal(modalId) {
const modal = document.getElementById(modalId);
modal.classList.add('active');

if (modalId === 'transaction-modal') {
// Set today's date as default
document.getElementById('date').valueAsDate = new Date();
}
}

function closeModal(modalId) {
const modal = document.getElementById(modalId);
modal.classList.remove('active');

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
id: state.currentEditId || Date.now(),
type: document.querySelector('input[name="type"]:checked').value,
description: document.getElementById('description').value,
amount: parseFloat(document.getElementById('amount').value),
date: document.getElementById('date').value,
category: document.getElementById('category').value
};

if (state.currentEditId) {
// Edit existing transaction
const index = state.transactions.findIndex(t => t.id === state.currentEditId);
state.transactions[index] = formData;
} else {
// Add new transaction
state.transactions.push(formData);
}

saveTransactions();
closeModal('transaction-modal');
updateDashboard();
renderTransactions();
}

function editTransaction(id) {
const transaction = state.transactions.find(t => t.id === id);
if (!transaction) return;

state.currentEditId = id;

// Fill form with transaction data
document.getElementById('modal-title').textContent = 'Editar Transação';
document.querySelector(input[name="type"][value="${transaction.type}"]).checked = true;
document.getElementById('description').value = transaction.description;
document.getElementById('amount').value = transaction.amount;
document.getElementById('date').value = transaction.date;
document.getElementById('category').value = transaction.category;

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
const income = state.transactions
.filter(t => t.type === 'income')
.reduce((sum, t) => sum + t.amount, 0);

const expense = state.transactions
.filter(t => t.type === 'expense')
.reduce((sum, t) => sum + t.amount, 0);

const balance = income - expense;

document.getElementById('total-income').textContent = formatCurrency(income);
document.getElementById('total-expense').textContent = formatCurrency(expense);
document.getElementById('total-balance').textContent = formatCurrency(balance);

// Render recent transactions (last 5)
const recentTransactions = state.transactions
.sort((a, b) => new Date(b.date) - new Date(a.date))
.slice(0, 5);

renderTransactionsList('recent-transactions', recentTransactions);
}

function renderTransactions() {
renderTransactionsList('transactions-list', state.transactions);
}

function renderTransactionsList(containerId, transactions) {
const container = document.getElementById(containerId);

if (transactions.length === 0) {
container.innerHTML = `




💳



Nenhuma transação encontrada




`;
return;
}

container.innerHTML = transactions
.sort((a, b) => new Date(b.date) - new Date(a.date))
.map(transaction => `





${transaction.type === 'income' ? '💰' : '💸'}





${transaction.description}



${transaction.category} • ${formatDate(transaction.date)}






${transaction.type === 'income' ? '+' : '-'} ${formatCurrency(transaction.amount)}




✏️
🗑️




`).join('');
}

// ============================================
// FILTERS
// ============================================
function filterTransactions() {
const searchTerm = document.getElementById('search-input').value.toLowerCase();
const typeFilter = document.getElementById('filter-type').value;
const categoryFilter = document.getElementById('filter-category').value;

const filtered = state.transactions.filter(transaction => {
const matchesSearch = transaction.description.toLowerCase().includes(searchTerm);
const matchesType = !typeFilter || transaction.type === typeFilter;
const matchesCategory = !categoryFilter || transaction.category === categoryFilter;

return matchesSearch && matchesType && matchesCategory;
});

renderTransactionsList('transactions-list', filtered);
}

// ============================================
// OPEN BANKING
// ============================================
function renderBanksList() {
const container = document.getElementById('banks-list');
container.innerHTML = AVAILABLE_BANKS.map(bank => `




${bank.logo}




${bank.name}


✓ Disponível





`).join('');
}

function filterBanks() {
const searchTerm = document.getElementById('bank-search').value.toLowerCase();
const container = document.getElementById('banks-list');

const filtered = AVAILABLE_BANKS.filter(bank =>
bank.name.toLowerCase().includes(searchTerm)
);

container.innerHTML = filtered.map(bank => `




${bank.logo}




${bank.name}


✓ Disponível





`).join('');
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

const agency = document.getElementById('agency').value;
const account = document.getElementById('account').value;

// Simular autenticação
setTimeout(() => {
// Adicionar conta conectada
const newAccount = {
id: Date.now(),
bank: selectedBank,
agency: agency,
account: account,
type: 'Conta Corrente',
balance: Math.random() * 10000 + 5000 // Saldo aleatório para simulação
};

state.openBanking.accounts.push(newAccount);
state.openBanking.connected = true;

// Gerar transações fictícias
generateMockTransactions();

saveOpenBankingData();
closeModal('bank-auth-modal');

// Limpar formulário
document.getElementById('agency').value = '';
document.getElementById('account').value = '';

updateOpenBankingPage();

alert('✅ Banco conectado com sucesso!');
}, 1000);
}

function generateMockTransactions() {
const mockTransactions = [
{ description: 'Supermercado Extra', amount: 234.50, type: 'expense', category: 'Alimentação' },
{ description: 'Salário', amount: 5000.00, type: 'income', category: 'Salário' },
{ description: 'Uber', amount: 45.80, type: 'expense', category: 'Transporte' },
{ description: 'Netflix', amount: 39.90, type: 'expense', category: 'Lazer' },
{ description: 'Farmácia', amount: 67.20, type: 'expense', category: 'Saúde' }
];

const today = new Date();

state.openBanking.importedTransactions = mockTransactions.map((t, index) => ({
id: Date.now() + index,
...t,
date: new Date(today.getTime() - index * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
imported: true
}));

state.openBanking.lastSync = new Date().toISOString();
}

function syncTransactions() {
// Simular sincronização
const btn = event.target;
btn.textContent = '⏳ Sincronizando...';
btn.disabled = true;

setTimeout(() => {
generateMockTransactions();
state.openBanking.lastSync = new Date().toISOString();
saveOpenBankingData();
updateOpenBankingPage();

btn.textContent = '🔄 Sincronizar';
btn.disabled = false;

alert('✅ Transações sincronizadas!');
}, 2000);
}

function disconnectBank(accountId) {
if (confirm('Tem certeza que deseja desconectar esta conta?')) {
state.openBanking.accounts = state.openBanking.accounts.filter(acc => acc.id !== accountId);

if (state.openBanking.accounts.length === 0) {
state.openBanking.connected = false;
state.openBanking.importedTransactions = [];
state.openBanking.lastSync = null;
}

saveOpenBankingData();
updateOpenBankingPage();
}
}

function updateOpenBankingPage() {
const accountsContainer = document.getElementById('connected-accounts');
const importedSection = document.getElementById('imported-section');

if (state.openBanking.connected && state.openBanking.accounts.length > 0) {
// Mostrar contas conectadas
accountsContainer.innerHTML = state.openBanking.accounts.map(acc => `





${acc.bank.logo}



${acc.bank.name}



Ag: ${acc.agency} • Conta: ${acc.account} • ${acc.type}









${formatCurrency(acc.balance)}

${state.openBanking.lastSync ?
`

Sync: ${new Date(state.openBanking.lastSync).toLocaleString('pt-BR', {
day: '2-digit',
month: '2-digit',
hour: '2-digit',
minute: '2-digit'
})}
                        </div>` : ''
                    }
                    <button class="btn btn-danger btn-small" onclick="disconnectBank(${acc.id})" style="margin-top: 8px;">
                        Desconectar
                    </button>
                </div>
            </div>
        `).join('');
        
        // Mostrar seção de importadas
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
            </div>
        `;
        importedSection.style.display = 'none';
    }
}

function renderImportedTransactions() {
    const container = document.getElementById('imported-transactions');
    
    if (state.openBanking.importedTransactions.length === 0) {
        container.innerHTML = '<div class="empty-state"><span class="empty-icon">📥</span><p>Nenhuma transação importada</p></div>';
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
            </div>
        `).join('');
}

function importToTransactions(transactionId) {
    const imported = state.openBanking.importedTransactions.find(t => t.id === transactionId);
    
    if (!imported) return;
    
    // Adicionar às transações principais
    const newTransaction = {
        id: Date.now(),
        type: imported.type,
        description: imported.description,
        amount: imported.amount,
        date: imported.date,
        category: imported.category
    };
    
    state.transactions.push(newTransaction);
    saveTransactions();
    
    alert('✅ Transação adicionada ao seu controle financeiro!');
    updateDashboard();
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

function formatDate(dateString) {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
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
    if (saved) {
        state.transactions = JSON.parse(saved);
    }
}

function saveOpenBankingData() {
    localStorage.setItem('openBanking', JSON.stringify(state.openBanking));
}

function loadOpenBankingData() {
    const saved = localStorage.getItem('openBanking');
    if (saved) {
        state.openBanking = JSON.parse(saved);
    }
}

// ============================================
// EVENT LISTENERS
// ============================================
function initEventListeners() {
    // Close modal on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeModal(overlay.id);
            }
        });
    });
    
    // Close modal on ESC key
    document.addEventListener('keydown', (e) => {
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
    updateDashboard();
});
