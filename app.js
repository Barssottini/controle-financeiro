```javascript
/* ============================================
   FINCONTROL - CONTROLE FINANCEIRO PESSOAL
   Arquivo: app.js
   ============================================ */

// ============================================
// DADOS E CONFIGURAÇÕES
// ============================================

const DEFAULT_CATEGORIES = {
    expense: [
        { id: 'alimentacao', name: 'Alimentação', icon: '🍔', color: '#e74c3c' },
        { id: 'moradia', name: 'Moradia', icon: '🏠', color: '#9b59b6' },
        { id: 'transporte', name: 'Transporte', icon: '🚗', color: '#3498db' },
        { id: 'saude', name: 'Saúde', icon: '💊', color: '#1abc9c' },
        { id: 'educacao', name: 'Educação', icon: '📚', color: '#f39c12' },
        { id: 'lazer', name: 'Lazer', icon: '🎮', color: '#e67e22' },
        { id: 'vestuario', name: 'Vestuário', icon: '👕', color: '#2ecc71' },
        { id: 'contas', name: 'Contas/Serviços', icon: '📱', color: '#0984e3' },
        { id: 'mercado', name: 'Supermercado', icon: '🛒', color: '#6c5ce7' },
        { id: 'pets', name: 'Pets', icon: '🐾', color: '#fd79a8' },
        { id: 'outros_desp', name: 'Outros', icon: '📦', color: '#636e72' }
    ],
    income: [
        { id: 'salario', name: 'Salário', icon: '💼', color: '#00b894' },
        { id: 'freelance', name: 'Freelance', icon: '💻', color: '#00cec9' },
        { id: 'investimentos', name: 'Investimentos', icon: '📈', color: '#6c5ce7' },
        { id: 'presente', name: 'Presente', icon: '🎁', color: '#e84393' },
        { id: 'outros_rec', name: 'Outros', icon: '💰', color: '#fdcb6e' }
    ]
};

// Estado da aplicação
let state = {
    transactions: [],
    recurring: [],
    goals: [],
    categories: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)),
    currentType: 'expense',
    recurringType: 'expense'
};

// ============================================
// INICIALIZAÇÃO
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    processRecurring();
    initNavigation();
    initModals();
    initForms();
    initFilters();
    initImportExport();
    setCurrentDate();
    renderAll();
});

function loadData() {
    try {
        const saved = localStorage.getItem('fincontrol_data');
        if (saved) {
            const parsed = JSON.parse(saved);
            state.transactions = parsed.transactions || [];
            state.recurring = parsed.recurring || [];
            state.goals = parsed.goals || [];
            if (parsed.categories) {
                state.categories = parsed.categories;
            }
        }
    } catch (e) {
        console.error('Erro ao carregar dados:', e);
    }
}

function saveData() {
    try {
        localStorage.setItem('fincontrol_data', JSON.stringify({
            transactions: state.transactions,
            recurring: state.recurring,
            goals: state.goals,
            categories: state.categories
        }));
    } catch (e) {
        console.error('Erro ao salvar dados:', e);
    }
}

function setCurrentDate() {
    const now = new Date();
    const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    document.getElementById('currentDate').textContent =
        now.toLocaleDateString('pt-BR', options);

    // Setar mês atual no filtro
    const monthInput = document.getElementById('filterMonth');
    monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ============================================
// TRANSAÇÕES RECORRENTES (AUTOMÁTICO)
// ============================================

function processRecurring() {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    state.recurring.forEach(rec => {
        if (!rec.active) return;

        // Verifica se já foi lançada neste mês
        const alreadyExists = state.transactions.some(t =>
            t.recurringId === rec.id &&
            t.date.startsWith(currentMonth)
        );

        if (!alreadyExists) {
            const day = Math.min(rec.day, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate());
            const date = `${currentMonth}-${String(day).padStart(2, '0')}`;

            state.transactions.push({
                id: generateId(),
                type: rec.type,
                description: rec.description,
                value: rec.value,
                category: rec.category,
                date: date,
                note: '🔄 Lançamento automático',
                recurringId: rec.id,
                createdAt: new Date().toISOString()
            });
        }
    });

    saveData();
}

// ============================================
// NAVEGAÇÃO
// ============================================

function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item[data-page]');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            navigateTo(page);
        });
    });

    // Menu mobile
    document.getElementById('menuToggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.add('open');
        document.getElementById('sidebarOverlay').classList.add('show');
    });

    document.getElementById('menuClose').addEventListener('click', closeSidebar);
    document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);
}

function navigateTo(page) {
    // Atualiza nav
    document.querySelectorAll('.nav-item[data-page]').forEach(n => n.classList.remove('active'));
    document.querySelector(`.nav-item[data-page="${page}"]`).classList.add('active');

    // Atualiza páginas
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${page}`).classList.add('active');

    // Atualiza título
    const titles = {
        dashboard: 'Dashboard',
        transactions: 'Transações',
        recurring: 'Recorrentes',
        goals: 'Metas',
        reports: 'Relatórios'
    };
    document.getElementById('pageTitle').textContent = titles[page] || page;

    closeSidebar();
    renderAll();
}

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('show');
}

// ============================================
// MODAIS
// ============================================

function initModals() {
    // Modal transação
    document.getElementById('quickAddBtn').addEventListener('click', () => openTransactionModal());
    document.getElementById('modalClose').addEventListener('click', closeTransactionModal);
    document.getElementById('cancelTransaction').addEventListener('click', closeTransactionModal);
    document.getElementById('transactionModal').addEventListener('click', (e) => {
        if (e.target.id === 'transactionModal') closeTransactionModal();
    });

    // Modal recorrente
    document.getElementById('addRecurringBtn').addEventListener('click', () => openRecurringModal());
    document.getElementById('recurringModalClose').addEventListener('click', closeRecurringModal);
    document.getElementById('cancelRecurring').addEventListener('click', closeRecurringModal);
    document.getElementById('recurringModal').addEventListener('click', (e) => {
        if (e.target.id === 'recurringModal') closeRecurringModal();
    });

    // Modal meta
    document.getElementById('addGoalBtn').addEventListener('click', () => openGoalModal());
    document.getElementById('goalModalClose').addEventListener('click', closeGoalModal);
    document.getElementById('cancelGoal').addEventListener('click', closeGoalModal);
    document.getElementById('goalModal').addEventListener('click', (e) => {
        if (e.target.id === 'goalModal') closeGoalModal();
    });

    // Tipo toggle - transação
    document.querySelectorAll('.type-btn:not([data-form])').forEach(btn => {
        btn.addEventListener('click', () => {
            state.currentType = btn.dataset.type;
            document.querySelectorAll('.type-btn:not([data-form])').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            populateCategorySelect('transCategory', state.currentType);
        });
    });

    // Tipo toggle - recorrente
    document.querySelectorAll('.type-btn[data-form="recurring"]').forEach(btn => {
        btn.addEventListener('click', () => {
            state.recurringType = btn.dataset.type;
            document.querySelectorAll('.type-btn[data-form="recurring"]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            populateCategorySelect('recCategory', state.recurringType);
        });
    });
}

function openTransactionModal(transaction = null) {
    const modal = document.getElementById('transactionModal');
    const form = document.getElementById('transactionForm');
    form.reset();

    if (transaction) {
        document.getElementById('modalTitle').textContent = 'Editar Transação';
        document.getElementById('transactionId').value = transaction.id;
        document.getElementById('transDescription').value = transaction.description;
        document.getElementById('transValue').value = formatNumber(transaction.value);
        document.getElementById('transDate').value = transaction.date;
        document.getElementById('transNote').value = transaction.note || '';
        state.currentType = transaction.type;
    } else {
        document.getElementById('modalTitle').textContent = 'Nova Transação';
        document.getElementById('transactionId').value = '';
        document.getElementById('transDate').value = new Date().toISOString().split('T')[0];
        state.currentType = 'expense';
    }

    // Toggle tipo
    document.querySelectorAll('.type-btn:not([data-form])').forEach(b => {
        b.classList.toggle('active', b.dataset.type === state.currentType);
    });

    populateCategorySelect('transCategory', state.currentType);

    if (transaction) {
        document.getElementById('transCategory').value = transaction.category;
    }

    updateSuggestions();
    modal.classList.add('show');
    document.getElementById('transDescription').focus();
}

function closeTransactionModal() {
    document.getElementById('transactionModal').classList.remove('show');
}

function openRecurringModal(rec = null) {
    const modal = document.getElementById('recurringModal');
    const form = document.getElementById('recurringForm');
    form.reset();

    if (rec) {
        document.getElementById('recurringId').value = rec.id;
        document.getElementById('recDescription').value = rec.description;
        document.getElementById('recValue').value = formatNumber(rec.value);
        document.getElementById('recDay').value = rec.day;
        state.recurringType = rec.type;
    } else {
        document.getElementById('recurringId').value = '';
        document.getElementById('recDay').value = 1;
        state.recurringType = 'expense';
    }

    document.querySelectorAll('.type-btn[data-form="recurring"]').forEach(b => {
        b.classList.toggle('active', b.dataset.type === state.recurringType);
    });

    populateCategorySelect('recCategory', state.recurringType);

    if (rec) {
        document.getElementById('recCategory').value = rec.category;
    }

    modal.classList.add('show');
}

function closeRecurringModal() {
    document.getElementById('recurringModal').classList.remove('show');
}

function openGoalModal(goal = null) {
    const modal = document.getElementById('goalModal');
    const form = document.getElementById('goalForm');
    form.reset();

    populateCategorySelect('goalCategory', 'expense');

    if (goal) {
        document.getElementById('goalId').value = goal.id;
        document.getElementById('goalCategory').value = goal.category;
        document.getElementById('goalLimit').value = formatNumber(goal.limit);
    } else {
        document.getElementById('goalId').value = '';
    }

    modal.classList.add('show');
}

function closeGoalModal() {
    document.getElementById('goalModal').classList.remove('show');
}

// ============================================
// FORMULÁRIOS
// ============================================

function initForms() {
    // Salvar transação
    document.getElementById('transactionForm').addEventListener('submit', (e) => {
        e.preventDefault();
        saveTransaction();
    });

    // Salvar recorrente
    document.getElementById('recurringForm').addEventListener('submit', (e) => {
        e.preventDefault();
        saveRecurring();
    });

    // Salvar meta
    document.getElementById('goalForm').addEventListener('submit', (e) => {
        e.preventDefault();
        saveGoal();
    });

    // Máscara de dinheiro
    document.querySelectorAll('#transValue, #recValue, #goalLimit').forEach(input => {
        input.addEventListener('input', (e) => {
            let val = e.target.value.replace(/\D/g, '');
            if (val) {
                val = (parseInt(val) / 100).toFixed(2);
                e.target.value = formatNumber(parseFloat(val));
            }
        });
    });
}

function saveTransaction() {
    const id = document.getElementById('transactionId').value;
    const transaction = {
        id: id || generateId(),
        type: state.currentType,
        description: document.getElementById('transDescription').value.trim(),
        value: parseFormattedNumber(document.getElementById('transValue').value),
        category: document.getElementById('transCategory').value,
        date: document.getElementById('transDate').value,
        note: document.getElementById('transNote').value.trim(),
        createdAt: new Date().toISOString()
    };

    if (transaction.value <= 0) {
        showToast('Informe um valor válido!', 'error');
        return;
    }

    if (id) {
        const index = state.transactions.findIndex(t => t.id === id);
        if (index !== -1) {
            transaction.createdAt = state.transactions[index].createdAt;
            state.transactions[index] = transaction;
        }
        showToast('Transação atualizada! ✅');
    } else {
        state.transactions.push(transaction);
        showToast('Transação adicionada! ✅');
    }

    saveData();
    closeTransactionModal();
    renderAll();
}

function saveRecurring() {
    const id = document.getElementById('recurringId').value;
    const rec = {
        id: id || generateId(),
        type: state.recurringType,
        description: document.getElementById('recDescription').value.trim(),
        value: parseFormattedNumber(document.getElementById('recValue').value),
        category: document.getElementById('recCategory').value,
        day: parseInt(document.