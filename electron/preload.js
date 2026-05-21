/**
 * FinanceOS — Preload Script
 *
 * Expõe window.db ao renderer (React) de forma segura via contextBridge.
 * NUNCA expõe Node.js ou Electron diretamente — apenas chamadas IPC tipadas.
 *
 * Padrão de uso no React:
 *   const accounts = await window.db.accounts.list()
 *   const tx = await window.db.transactions.create({ ... })
 */

const { contextBridge, ipcRenderer } = require('electron')

// Helper: invoca canal IPC e propaga erros com mensagem amigável
const invoke = (channel, ...args) =>
  ipcRenderer.invoke(channel, ...args).catch(err => {
    console.error(`[window.db] ${channel} falhou:`, err)
    throw err
  })

contextBridge.exposeInMainWorld('db', {

  // ── Accounts ────────────────────────────────────────────────
  accounts: {
    /** Lista todas as contas */
    list: () => invoke('accounts:list'),

    /** Cria conta. Retorna o objeto inserido com id. */
    create: (data) => invoke('accounts:create', data),

    /** Atualiza campos de uma conta. Requer { id, ...campos }. */
    update: (data) => invoke('accounts:update', data),

    /** Remove conta por id. */
    delete: (id) => invoke('accounts:delete', id),

    /** Aplica delta ao saldo (positivo = crédito, negativo = débito). */
    updateBalance: (id, delta) => invoke('accounts:updateBalance', { id, delta }),
  },

  // ── Categories ───────────────────────────────────────────────
  categories: {
    /** Lista todas as categorias (income + expense). */
    list: () => invoke('categories:list'),

    /** Cria categoria. Retorna o objeto inserido. */
    create: (data) => invoke('categories:create', data),

    /** Atualiza categoria. Requer { id, ...campos }. */
    update: (data) => invoke('categories:update', data),

    /** Remove categoria por id. */
    delete: (id) => invoke('categories:delete', id),
  },

  // ── Transactions ─────────────────────────────────────────────
  transactions: {
    /**
     * Lista transações.
     * Sem parâmetros → todas.
     * Com { month (0-11), year } → filtra pelo mês/ano.
     * Tags são retornadas como array JS (desserializadas).
     */
    list: (filter) => invoke('transactions:list', filter),

    /**
     * Cria transação e ajusta saldo da conta automaticamente.
     * @param {{ description, amount, type, category_id, account_id, date, tags, notes }} tx
     */
    create: (tx) => invoke('transactions:create', tx),

    /**
     * Atualiza transação revertendo/aplicando impacto correto no saldo.
     * @param {{ id, ...campos }} data
     */
    update: (data) => invoke('transactions:update', data),

    /**
     * Remove transação e reverte o saldo da conta.
     * @param {number} id
     */
    delete: (id) => invoke('transactions:delete', id),

    /**
     * Busca full-text por descrição ou nome de categoria.
     * @param {{ query: string, month?: number, year?: number }} params
     */
    search: (params) => invoke('transactions:search', params),

    /**
     * Confirma (efetiva) um lançamento pendente e ajusta o saldo.
     * @param {number} id
     */
    confirm: (id) => invoke('transactions:confirm', id),

    transferToInvestment: (data) => invoke('transactions:transferToInvestment', data),
  },

  // ── Investments ──────────────────────────────────────────────
  investments: {
    /** Lista todos os investimentos. */
    list: () => invoke('investments:list'),

    /** Cria investimento. */
    create: (data) => invoke('investments:create', data),

    /** Atualiza investimento. Requer { id, ...campos }. */
    update: (data) => invoke('investments:update', data),

    /** Remove investimento por id. */
    delete: (id) => invoke('investments:delete', id),
  },

  // ── Recurring ────────────────────────────────────────────
  recurring: {
    list: () => invoke('recurring:list'),
    create: (data) => invoke('recurring:create', data),
    update: (data) => invoke('recurring:update', data),
    delete: (id) => invoke('recurring:delete', id),
    generateForMonth: (params) => invoke('recurring:generateForMonth', params),
  },

// ── Credit Cards ─────────────────────────────────────────────
  creditCards: {
    list:   ()     => invoke('creditCards:list'),
    create: (data) => invoke('creditCards:create', data),
    update: (data) => invoke('creditCards:update', data),
    delete: (id)   => invoke('creditCards:delete', id),
  },

// ── Credit Card Expenses ──────────────────────────────────────
  creditCardExpenses: {
    /** @param {{ card_id, billing_month }} params */
    list:    (params) => invoke('creditCardExpenses:list', params),
    /** @param {{ card_id, description, amount, category_id, date, notes }} data */
    create:  (data)   => invoke('creditCardExpenses:create', data),
    delete:  (id)     => invoke('creditCardExpenses:delete', id),
    /** Paga fatura, gera transaction e debita conta. @param {{ card_id, billing_month }} */
    payBill: (params) => invoke('creditCardExpenses:payBill', params),
  },

// ── Goals ────────────────────────────────────────────────────
  goals: {
    /** Lista todas as metas. */
    list: () => invoke('goals:list'),

    /** Cria meta. */
    create: (data) => invoke('goals:create', data),

    /** Atualiza meta. Requer { id, ...campos }. */
    update: (data) => invoke('goals:update', data),

    /** Remove meta por id. */
    delete: (id) => invoke('goals:delete', id),

    /**
     * Adiciona contribuição a uma meta (incrementa current até target).
     * @param {number} id
     * @param {number} amount
     */
    addContribution: (id, amount) => invoke('goals:addContribution', { id, amount }),
  },

  // ── Reports ──────────────────────────────────────────────────
  reports: {
    /**
     * Tendência mensal de receitas e despesas.
     * @param {{ months?: number }} options  — padrão: 6 meses
     * @returns {{ month: string, income: number, expense: number }[]}
     */
    monthlyTrend: (options) => invoke('reports:monthlyTrend', options),

    /**
     * Breakdown de despesas por categoria num mês.
     * @param {{ month: number, year: number }} params
     */
    categoryBreakdown: (params) => invoke('reports:categoryBreakdown', params),

    /**
       * Totais e breakdown para um período customizado.
       * @param {{ from: string, to: string }} params — formato YYYY-MM-DD
       */
      byRange: (params) => invoke('reports:byRange', params),
  },

    

  // ── Utilitários ──────────────────────────────────────────────
  /** Retorna o caminho do arquivo .db (para backup manual). */
  exportPath: () => invoke('db:exportPath'),
})
