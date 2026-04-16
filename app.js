// ============================================
// SISTEMA DE CONTROLE FINANCEIRO
// ============================================

// Estado global da aplicação
const state = {
    transactions: [],
    currentPage: 'dashboard',
    filters: {
        search: '',
        type: 'all',
        category: 'all',
        startDate: '',
        endDate: ''
    }
};

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    loadTransactions();
    initEventListeners();
    showPage('dashboard');
    updateDashboard();
});

// ============================================
// NAVEGAÇÃO
// ============================================
function showPage(pageId) {
    // Esconde todas as páginas
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // Mostra página selecionada
    const page = document.getElementById(pageId);
    if (page) {
        page.classList.add('active');
    }
    
    // Atualiza menu ativo
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
    });
    
    const activeMenuItem = document.querySelector('[onclick="showPage(\'' + pageId + '\')"]');
    if (activeMenuItem) {
        activeMenuItem.classList.add('active');
    }
    
    state.currentPage = pageId;
    
    // Atualiza conteúdo da página
    if (pageId === 'dashboard') {
        updateDashboard();
    } else if (pageId === 'transactions') {
        renderTransactions();
    }
    
    // Fecha sidebar no mobile
    closeSidebar();
}

// ============================================
// SIDEBAR MOBILE
// ============================================
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    
    sidebar.classList.toggle('open');
    overlay.classList.toggle('show');
}

function closeSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
}

// ============================================
// MODAIS
// ============================================
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('show');
        
        // Reset form se for modal de transação
        if (modalId === 'transaction-modal') {
            document.getElementById('transaction-form').reset();
            document.getElementById('transaction-id').value = '';
            document.getElementById('modal-title').textContent = 'Nova Transação';
            setTransactionType('expense');
        }
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
    }
}

// ============================================
// GERENCIAMENTO DE TRANSAÇÕES
// ============================================
function setTransactionType(type) {
    document.querySelectorAll('.type-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const selectedBtn = document.querySelector('.type-btn.' + type);
    if (selectedBtn) {
        selectedBtn.classList.add('active');
    }
    
    document.getElementById('transaction-type').value = type;
}

function saveTransaction(event) {
    event.preventDefault();
    
    const id = document.getElementById('transaction-id').value;
    const description = document.getElementById('description').value.trim();
    const amount = parseFloat(document.getElementById('amount').value);
    const type = document.getElementById('transaction-type').value;
    const category = document.getElementById('category').value;
    const date = document.getElementById('date').value;
    
    if (!description || !amount || !date) {
        showToast('Preencha todos os campos!', 'error');
        return;
    }
    
    const transaction = {
        id: id || Date.now().toString(),
        description: description,
        amount: amount,
        type: type,
        category: category,
        date: date,
        createdAt: id ? state.transactions.find(t => t.id === id).createdAt : new Date().toISOString()
    };
    
    if (id) {
        // Editar transação existente
        const index = state.transactions.findIndex(t => t.id === id);
        state.transactions[index] = transaction;
        showToast('Transação atualizada!', 'success');
    } else {
        // Nova transação
        state.transactions.push(transaction);
        showToast('Transação adicionada!', 'success');
    }
    
    saveTransactions();
    closeModal('transaction-modal');
    updateDashboard();
    renderTransactions();
}

function editTransaction(id) {
    const transaction = state.transactions.find(t => t.id === id);
    
    if (transaction) {
        document.getElementById('transaction-id').value = transaction.id;
        document.getElementById('description').value = transaction.description;
        document.getElementById('amount').value = transaction.amount;
        document.getElementById('category').value = transaction.category;
        document.getElementById('date').value = transaction.date;
        
        setTransactionType(transaction.type);
        
        document.getElementById('modal-title').textContent = 'Editar Transação';
        openModal('transaction-modal');
    }
}

function deleteTransaction(id) {
    if (confirm('Tem certeza que deseja excluir esta transação?')) {
        state.transactions = state.transactions.filter(t => t.id !== id);
        saveTransactions();
        showToast('Transação excluída!', 'success');
        updateDashboard();
        renderTransactions();
    }
}

// ============================================
// CÁLCULOS
// ============================================
function calculateTotals() {
    const income = state.transactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);
    
    const expenses = state.transactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);
    
    const balance = income - expenses;
    
    return { income: income, expenses: expenses, balance: balance };
}

// ============================================
// ATUALIZAÇÃO DO DASHBOARD
// ============================================
function updateDashboard() {
    const totals = calculateTotals();
    
    // Atualiza cards
    document.getElementById('total-income').textContent = formatCurrency(totals.income);
    document.getElementById('total-expenses').textContent = formatCurrency(totals.expenses);
    document.getElementById('balance').textContent = formatCurrency(totals.balance);
    
    // Atualiza lista de transações recentes
    renderRecentTransactions();
}

function renderRecentTransactions() {
    const container = document.getElementById('recent-transactions');
    const recent = state.transactions
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);
    
    if (recent.length === 0) {
        container.innerHTML = '<div class="empty-state"><span class="empty-icon">📝</span><p>Nenhuma transação ainda</p></div>';
        return;
    }
    
    container.innerHTML = recent.map(t => 
        '<div class="transaction-item">' +
            '<div class="trans-info">' +
                '<div class="trans-desc">' + t.description + '</div>' +
                '<div class="trans-meta">' + t.category + ' • ' + formatDate(t.date) + '</div>' +
            '</div>' +
            '<div class="trans-amount ' + t.type + '">' +
                (t.type === 'income' ? '+' : '-') + ' ' + formatCurrency(t.amount) +
            '</div>' +
        '</div>'
    ).join('');
}

// ============================================
// PÁGINA DE TRANSAÇÕES
// ============================================
function renderTransactions() {
    const container = document.getElementById('transactions-list');
    let filtered = state.transactions.slice();
    
    // Aplicar filtros
    if (state.filters.search) {
        filtered = filtered.filter(t => 
            t.description.toLowerCase().includes(state.filters.search.toLowerCase())
        );
    }
    
    if (state.filters.type !== 'all') {
        filtered = filtered.filter(t => t.type === state.filters.type);
    }
    
    if (state.filters.category !== 'all') {
        filtered = filtered.filter(t => t.category === state.filters.category);
    }
    
    // Ordenar por data (mais recente primeiro)
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state"><span class="empty-icon">🔍</span><p>Nenhuma transação encontrada</p></div>';
        return;
    }
    
    container.innerHTML = filtered.map(t =>
        '<div class="transaction-item">' +
            '<div class="trans-info">' +
                '<div class="trans-desc">' + t.description + '</div>' +
                '<div class="trans-meta">' + t.category + ' • ' + formatDate(t.date) + '</div>' +
            '</div>' +
            '<div class="trans-amount ' + t.type + '">' +
                (t.type === 'income' ? '+' : '-') + ' ' + formatCurrency(t.amount) +
            '</div>' +
            '<div class="trans-actions">' +
                '<button class="btn btn-icon" onclick="editTransaction(\'' + t.id + '\')" title="Editar">✏️</button>' +
                '<button class="btn btn-icon" onclick="deleteTransaction(\'' + t.id + '\')" title="Excluir">🗑️</button>' +
            '</div>' +
        '</div>'
    ).join('');
}

function applyFilters() {
    state.filters.search = document.getElementById('search').value;
    state.filters.type = document.getElementById('filter-type').value;
    state.filters.category = document.getElementById('filter-category').value;
    
    renderTransactions();
}

// ============================================
// PERSISTÊNCIA DE DADOS
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

// ============================================
// UTILIDADES
// ============================================
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

function formatDate(dateString) {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('pt-BR');
}

function showToast(message, type) {
    type = type || 'success';
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// ============================================
// EVENT LISTENERS
// ============================================
function initEventListeners() {
    // Fecha modal ao clicar no overlay
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('show');
            }
        });
    });
    
    // Fecha sidebar ao clicar no overlay
    const sidebarOverlay = document.querySelector('.sidebar-overlay');
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', closeSidebar);
    }
}
