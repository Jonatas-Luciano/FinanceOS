/**
 * FinanceOS — Electron Main Process
 * Gerencia o banco de dados SQLite via better-sqlite3
 * e expõe todas as operações necessárias via IPC.
 */

const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const Database = require('better-sqlite3')

// ─── Banco de Dados ──────────────────────────────────────────
const dbPath = path.join(app.getPath('userData'), 'financeos.db')
let db

function initDatabase() {
  // Migração segura — ignora se coluna já existir
  try { db.exec('ALTER TABLE credit_cards ADD COLUMN limit_total REAL NOT NULL DEFAULT 0') } catch {}
  // Retroativamente define limit_total = limit_amount para cartões existentes onde limit_total = 0
  db.exec('UPDATE credit_cards SET limit_total = limit_amount WHERE limit_total = 0')
  
  db = new Database(dbPath)

  // Performance: WAL mode para escrita concorrente mais rápida
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // ── Schema ────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name  TEXT    NOT NULL,
      type  TEXT    NOT NULL CHECK(type IN ('checking','savings','wallet','investment')),
      bank  TEXT    NOT NULL DEFAULT '',
      balance REAL  NOT NULL DEFAULT 0,
      color TEXT    NOT NULL DEFAULT '#8B5CF6'
    );

    CREATE TABLE IF NOT EXISTS categories (
      id     INTEGER PRIMARY KEY AUTOINCREMENT,
      name   TEXT NOT NULL,
      icon   TEXT NOT NULL DEFAULT '📦',
      type   TEXT NOT NULL CHECK(type IN ('income','expense')),
      color  TEXT NOT NULL DEFAULT '#6B7280',
      budget REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      amount      REAL NOT NULL CHECK(amount > 0),
      type        TEXT NOT NULL CHECK(type IN ('income','expense','transfer')),
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      account_id  INTEGER REFERENCES accounts(id)   ON DELETE SET NULL,
      to_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
      date        TEXT NOT NULL,
      tags        TEXT NOT NULL DEFAULT '[]',
      notes       TEXT NOT NULL DEFAULT '',
      status      TEXT    NOT NULL DEFAULT 'done'
                          CHECK(status IN ('done','pending','cancelled')),
      due_date    TEXT    NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS investments (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      type       TEXT NOT NULL,
      invested   REAL NOT NULL DEFAULT 0,
      current    REAL NOT NULL DEFAULT 0,
      rate       REAL NOT NULL DEFAULT 0,
      rate_type  TEXT NOT NULL DEFAULT '% a.a.',
      start_date TEXT NOT NULL DEFAULT '',
      maturity   TEXT
    );

    CREATE TABLE IF NOT EXISTS goals (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      name     TEXT NOT NULL,
      target   REAL NOT NULL DEFAULT 0,
      current  REAL NOT NULL DEFAULT 0,
      deadline TEXT NOT NULL DEFAULT '',
      icon     TEXT NOT NULL DEFAULT '🎯',
      color    TEXT NOT NULL DEFAULT '#8B5CF6'
    );

    CREATE TABLE IF NOT EXISTS recurring (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT    NOT NULL,
      amount      REAL    NOT NULL CHECK(amount > 0),
      type        TEXT    NOT NULL CHECK(type IN ('income','expense')),
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      account_id  INTEGER REFERENCES accounts(id)   ON DELETE SET NULL,
      day_of_month INTEGER NOT NULL DEFAULT 1,
      active      INTEGER NOT NULL DEFAULT 1,
      tags        TEXT    NOT NULL DEFAULT '[]',
      notes       TEXT    NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS credit_cards (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT    NOT NULL,
      limit_amount REAL    NOT NULL DEFAULT 0,   -- limite disponível (decrementado/restaurado)
      limit_total  REAL    NOT NULL DEFAULT 0,   -- limite original (só para exibição)
      closing_day  INTEGER NOT NULL DEFAULT 1,
      due_day      INTEGER NOT NULL DEFAULT 10,
      account_id   INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
      color        TEXT    NOT NULL DEFAULT '#EC4899'
    );

    CREATE TABLE IF NOT EXISTS credit_card_expenses (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id       INTEGER NOT NULL REFERENCES credit_cards(id) ON DELETE CASCADE,
      description   TEXT    NOT NULL,
      amount        REAL    NOT NULL CHECK(amount > 0),
      category_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      date          TEXT    NOT NULL,
      billing_month TEXT    NOT NULL, -- formato 'YYYY-MM' da fatura
      paid          INTEGER NOT NULL DEFAULT 0,
      notes         TEXT    NOT NULL DEFAULT ''
    );

    -- Garante que sempre existe pelo menos 1 conta e categorias padrão
    CREATE TABLE IF NOT EXISTS _meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `)

  seedIfEmpty()
}

// ─── Seed de dados iniciais ──────────────────────────────────
function seedIfEmpty() {
  const seeded = db.prepare("SELECT value FROM _meta WHERE key = 'seeded'").get()
  if (seeded) return

  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')

  const insertAccount  = db.prepare('INSERT INTO accounts  (name, type, bank, balance, color) VALUES (?,?,?,?,?)')
  const insertCategory = db.prepare('INSERT INTO categories (name, icon, type, color, budget) VALUES (?,?,?,?,?)')
  const insertTx       = db.prepare('INSERT INTO transactions (description, amount, type, category_id, account_id, date, tags, notes, status, due_date) VALUES (?,?,?,?,?,?,?,?,?,?)')
  const insertInv      = db.prepare('INSERT INTO investments (name, type, invested, current, rate, rate_type, start_date, maturity) VALUES (?,?,?,?,?,?,?,?)')
  const insertGoal     = db.prepare('INSERT INTO goals (name, target, current, deadline, icon, color) VALUES (?,?,?,?,?,?)')

  // Accounts
  insertAccount.run('Conta Corrente', 'checking',  'Nubank',  4850.00,  '#8B5CF6')
  insertAccount.run('Poupança',       'savings',   'Itaú',    12300.00, '#10B981')
  insertAccount.run('Carteira',       'wallet',    'Dinheiro', 350.00,  '#F59E0B')
  insertAccount.run('Investimentos',  'investment','XP',      45200.00, '#3B82F6')

  // Categories — expense
  insertCategory.run('Alimentação', '🍽️', 'expense', '#EF4444', 1200)
  insertCategory.run('Transporte',  '🚗', 'expense', '#F59E0B',  500)
  insertCategory.run('Moradia',     '🏠', 'expense', '#8B5CF6', 2000)
  insertCategory.run('Saúde',       '💊', 'expense', '#10B981',  400)
  insertCategory.run('Lazer',       '🎮', 'expense', '#3B82F6',  600)
  insertCategory.run('Educação',    '📚', 'expense', '#06B6D4',  300)
  insertCategory.run('Vestuário',   '👔', 'expense', '#EC4899',  250)
  // Categories — income
  insertCategory.run('Salário',     '💼', 'income',  '#10B981',  0)
  insertCategory.run('Freelance',   '💻', 'income',  '#3B82F6',  0)
  insertCategory.run('Investimento','📈', 'income',  '#8B5CF6',  0)

  // Transactions (mês atual)
  const d = (day) => `${y}-${m}-${String(day).padStart(2,'0')}`
  insertTx.run('Salário',          7500,   'income',  8, 1, d(5),  '["fixo"]',          '', 'done', '')
  insertTx.run('Supermercado',     485.30, 'expense', 1, 1, d(7),  '["mercado"]',       'Compra semanal', 'done', '')
  insertTx.run('Uber',             34.50,  'expense', 2, 1, d(8),  '[]',                '', 'done', '')
  insertTx.run('Aluguel',          1800,   'expense', 3, 1, d(10), '["fixo","moradia"]','', 'done', '')
  insertTx.run('Restaurante Sushi',120,    'expense', 1, 3, d(12), '["restaurante"]',   'Aniversário', 'done', '')
  insertTx.run('Freelance Design', 1200,   'income',  9, 1, d(14), '["extra"]',         'Projeto logo marca', 'done', '')
  insertTx.run('Academia',         89.90,  'expense', 4, 1, d(1),  '["fixo"]',          '', 'done', '')
  insertTx.run('Netflix',          39.90,  'expense', 5, 1, d(3),  '["assinatura"]',    '', 'done', '')
  insertTx.run('Curso Udemy',      74.90,  'expense', 6, 1, d(16), '[]',                'React avançado', 'done', '')
  insertTx.run('Posto Gasolina',   180,    'expense', 2, 3, d(18), '[]',                '', 'done', '')
  insertTx.run('Farmácia',         67.40,  'expense', 4, 1, d(9),  '[]',                '', 'done', '')
  insertTx.run('Dividendos XP',    320,    'income', 10, 4, d(15), '["passivo"]',       '', 'done', '')
  insertTx.run('Camisa polo',      159.90, 'expense', 7, 1, d(20), '[]',                '', 'done', '')
  insertTx.run('iFood',            55.80,  'expense', 1, 1, d(22), '[]',                '', 'done', '')

  // Investments
  insertInv.run('Tesouro Selic 2027',      'tesouro_direto', 10000, 10850, 11.65, '% a.a.',  '2023-03-01', '2027-03-01')
  insertInv.run('CDB Itaú 110% CDI',       'cdb',            15000, 16420, 110,   '% CDI',   '2023-06-15', '2025-06-15')
  insertInv.run('Fundo Imobiliário MXRF11','fii',             8200,  9130,  0.92,  '% a.m.',  '2022-11-01', null)
  insertInv.run('Ações PETR4',             'acoes',           6000,  7200,  0,     'variável', '2023-01-10', null)
  insertInv.run('LCI BB 98% CDI',          'lci',             6000,  6600,  98,    '% CDI',   '2024-01-01', '2025-12-31')

  // Goals
  insertGoal.run('Reserva de Emergência', 30000, 18400, '2025-12-31', '🛡️', '#10B981')
  insertGoal.run('Viagem Europa',         15000,  4200, '2026-07-01', '✈️', '#3B82F6')
  insertGoal.run('Notebook novo',          8000,  3500, '2025-09-01', '💻', '#8B5CF6')
  insertGoal.run('Entrada apartamento',   80000, 22000, '2028-01-01', '🏠', '#F59E0B')

  db.prepare("INSERT INTO _meta (key, value) VALUES ('seeded', '1')").run()
}

// ─── IPC Handlers ────────────────────────────────────────────

// ── Accounts ─────────────────────────────────────────────────
ipcMain.handle('accounts:list', () => {
  return db.prepare('SELECT * FROM accounts ORDER BY id').all()
})

ipcMain.handle('accounts:create', (_, { name, type, bank, balance, color }) => {
  const stmt = db.prepare(
    'INSERT INTO accounts (name, type, bank, balance, color) VALUES (?,?,?,?,?)'
  )
  const result = stmt.run(name, type, bank ?? '', balance ?? 0, color ?? '#8B5CF6')
  return db.prepare('SELECT * FROM accounts WHERE id = ?').get(result.lastInsertRowid)
})

ipcMain.handle('accounts:update', (_, { id, ...data }) => {
  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ')
  db.prepare(`UPDATE accounts SET ${fields} WHERE id = ?`).run(...Object.values(data), id)
  return db.prepare('SELECT * FROM accounts WHERE id = ?').get(id)
})

ipcMain.handle('accounts:delete', (_, id) => {
  db.prepare('DELETE FROM accounts WHERE id = ?').run(id)
  return { success: true }
})

ipcMain.handle('accounts:updateBalance', (_, { id, delta }) => {
  db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(delta, id)
  return db.prepare('SELECT * FROM accounts WHERE id = ?').get(id)
})

// ── Categories ────────────────────────────────────────────────
ipcMain.handle('categories:list', () => {
  return db.prepare('SELECT * FROM categories ORDER BY type, name').all()
})

ipcMain.handle('categories:create', (_, { name, icon, type, color, budget }) => {
  const result = db.prepare(
    'INSERT INTO categories (name, icon, type, color, budget) VALUES (?,?,?,?,?)'
  ).run(name, icon ?? '📦', type, color ?? '#6B7280', budget ?? 0)
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid)
})

ipcMain.handle('categories:update', (_, { id, ...data }) => {
  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ')
  db.prepare(`UPDATE categories SET ${fields} WHERE id = ?`).run(...Object.values(data), id)
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(id)
})

ipcMain.handle('categories:delete', (_, id) => {
  db.prepare('DELETE FROM categories WHERE id = ?').run(id)
  return { success: true }
})

// ── Transactions ──────────────────────────────────────────────
ipcMain.handle('transactions:list', (_, { month, year } = {}) => {
  let rows
  if (month !== undefined && year !== undefined) {
    // Filtra pelo mês/ano no formato YYYY-MM
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`
    rows = db.prepare(
      "SELECT * FROM transactions WHERE strftime('%Y-%m', date) = ? ORDER BY date DESC, id DESC"
    ).all(prefix)
  } else {
    rows = db.prepare('SELECT * FROM transactions ORDER BY date DESC, id DESC').all()
  }
  // Deserializa tags de JSON string para array
  return rows.map(t => ({ ...t, tags: JSON.parse(t.tags || '[]') }))
})

ipcMain.handle('transactions:create', (_, tx) => {
  const { description, amount, type, category_id, account_id,
          date, tags, notes, status = 'done', due_date = '' } = tx
  const tagsJson = JSON.stringify(Array.isArray(tags) ? tags : [])

  const run = db.transaction(() => {
    const result = db.prepare(
      `INSERT INTO transactions
       (description, amount, type, category_id, account_id,
        date, tags, notes, status, due_date)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(description, amount, type, category_id, account_id,
          date, tagsJson, notes ?? '', status, due_date)

    // Ajuste de saldo
    if (status === 'done') {
      if (type === 'income') {
        db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?')
          .run(amount, account_id)
      } else if (type === 'expense') {
        db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?')
          .run(amount, account_id)
      } else if (type === 'transfer') {
        // Debita origem
        db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?')
          .run(amount, account_id)
        // Credita destino
        if (to_account_id)
          db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?')
            .run(amount, to_account_id)
      }
    }

    const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid)
    return { ...row, tags: JSON.parse(row.tags || '[]') }
  })
  return run()
})

ipcMain.handle('transactions:update', (_, { id, ...data }) => {
  // Reverte saldo antigo, aplica novo
  const run = db.transaction(() => {
    const old = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id)
    if (!old) throw new Error('Transação não encontrada')

    // Reverte efeito da transação antiga no saldo
    if (old.type === 'income') {
      db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(old.amount, old.account_id)
    } else if (old.type === 'expense') {
      db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(old.amount, old.account_id)
    }

    // Aplica dados novos
    const newData = { ...data }
    if (Array.isArray(newData.tags)) newData.tags = JSON.stringify(newData.tags)

    const fields = Object.keys(newData).map(k => `${k} = ?`).join(', ')
    db.prepare(`UPDATE transactions SET ${fields} WHERE id = ?`).run(...Object.values(newData), id)

    // Aplica efeito da nova transação no saldo
    const updated = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id)
    if (updated.type === 'income') {
      db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(updated.amount, updated.account_id)
    } else if (updated.type === 'expense') {
      db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(updated.amount, updated.account_id)
    }

    return { ...updated, tags: JSON.parse(updated.tags || '[]') }
  })

  return run()
})

ipcMain.handle('transactions:delete', (_, id) => {
  const run = db.transaction(() => {
    const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id)
    if (!tx) throw new Error('Transação não encontrada')

    // Reverte saldo
    if (tx.type === 'income') {
      db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(tx.amount, tx.account_id)
    } else if (tx.type === 'expense') {
      db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(tx.amount, tx.account_id)
    }

    db.prepare('DELETE FROM transactions WHERE id = ?').run(id)
    return { success: true, id }
  })

  return run()
})

ipcMain.handle('transactions:confirm', (_, id) => {
  const run = db.transaction(() => {
    const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id)
    if (!tx || tx.status !== 'pending') throw new Error('Lançamento inválido')
    db.prepare("UPDATE transactions SET status = 'done' WHERE id = ?").run(id)
    if (tx.type === 'income')
      db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(tx.amount, tx.account_id)
    else if (tx.type === 'expense')
      db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(tx.amount, tx.account_id)
    const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id)
    return { ...row, tags: JSON.parse(row.tags || '[]') }
  })
  return run()
})

// Transferência de Accounts para Investment
ipcMain.handle('transactions:transferToInvestment', (_, { account_id, investment_id, amount, description, date, notes }) => {
  const run = db.transaction(() => {
    // Debita conta
    db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(amount, account_id)

    // Credita investimento (aumenta current e invested)
    db.prepare('UPDATE investments SET invested = invested + ?, current = current + ? WHERE id = ?').run(amount, amount, investment_id)

    // Registra transação como expense (saída da conta)
    const result = db.prepare(
      `INSERT INTO transactions
       (description, amount, type, category_id, account_id, date, tags, notes, status, due_date)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(description || 'Aporte em investimento', amount, 'expense', null, account_id, date, '["aporte","investimento"]', notes || '', 'done', '')

    const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid)
    return { ...row, tags: JSON.parse(row.tags || '[]') }
  })
  return run()
})

// Busca full-text simples
ipcMain.handle('transactions:search', (_, { query, month, year }) => {
  const like = `%${query}%`
  let sql = `
    SELECT t.*, c.name AS category_name
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE (t.description LIKE ? OR c.name LIKE ?)
  `
  const params = [like, like]

  if (month !== undefined && year !== undefined) {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`
    sql += " AND strftime('%Y-%m', t.date) = ?"
    params.push(prefix)
  }

  sql += ' ORDER BY t.date DESC, t.id DESC'
  const rows = db.prepare(sql).all(...params)
  return rows.map(t => ({ ...t, tags: JSON.parse(t.tags || '[]') }))
})

// ── Investments ───────────────────────────────────────────────
ipcMain.handle('investments:list', () => {
  return db.prepare('SELECT * FROM investments ORDER BY id').all()
})

ipcMain.handle('investments:create', (_, data) => {
  const { name, type, invested, current, rate, rate_type, start_date, maturity } = data
  const result = db.prepare(
    'INSERT INTO investments (name, type, invested, current, rate, rate_type, start_date, maturity) VALUES (?,?,?,?,?,?,?,?)'
  ).run(name, type, invested ?? 0, current ?? invested ?? 0, rate ?? 0, rate_type ?? '% a.a.', start_date ?? '', maturity ?? null)
  return db.prepare('SELECT * FROM investments WHERE id = ?').get(result.lastInsertRowid)
})

ipcMain.handle('investments:update', (_, { id, ...data }) => {
  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ')
  db.prepare(`UPDATE investments SET ${fields} WHERE id = ?`).run(...Object.values(data), id)
  return db.prepare('SELECT * FROM investments WHERE id = ?').get(id)
})

ipcMain.handle('investments:delete', (_, id) => {
  db.prepare('DELETE FROM investments WHERE id = ?').run(id)
  return { success: true }
})

// ── Goals ─────────────────────────────────────────────────────
ipcMain.handle('goals:list', () => {
  return db.prepare('SELECT * FROM goals ORDER BY id').all()
})

ipcMain.handle('goals:create', (_, { name, target, current, deadline, icon, color }) => {
  const result = db.prepare(
    'INSERT INTO goals (name, target, current, deadline, icon, color) VALUES (?,?,?,?,?,?)'
  ).run(name, target, current ?? 0, deadline ?? '', icon ?? '🎯', color ?? '#8B5CF6')
  return db.prepare('SELECT * FROM goals WHERE id = ?').get(result.lastInsertRowid)
})

ipcMain.handle('goals:update', (_, { id, ...data }) => {
  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ')
  db.prepare(`UPDATE goals SET ${fields} WHERE id = ?`).run(...Object.values(data), id)
  return db.prepare('SELECT * FROM goals WHERE id = ?').get(id)
})

ipcMain.handle('goals:delete', (_, id) => {
  db.prepare('DELETE FROM goals WHERE id = ?').run(id)
  return { success: true }
})

ipcMain.handle('goals:addContribution', (_, { id, amount }) => {
  db.prepare('UPDATE goals SET current = MIN(target, current + ?) WHERE id = ?').run(amount, id)
  return db.prepare('SELECT * FROM goals WHERE id = ?').get(id)
})

// ── Recurring (Lançamentos Fixos) ─────────────────────────
ipcMain.handle('recurring:list', () => {
  const rows = db.prepare('SELECT * FROM recurring ORDER BY day_of_month, id').all()
  return rows.map(r => ({ ...r, tags: JSON.parse(r.tags || '[]') }))
})

ipcMain.handle('recurring:create', (_, data) => {
  const { description, amount, type, category_id, account_id,
          day_of_month = 1, tags = [], notes = '' } = data
  const result = db.prepare(
    `INSERT INTO recurring
     (description, amount, type, category_id, account_id, day_of_month, tags, notes)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(description, amount, type, category_id, account_id, day_of_month,
        JSON.stringify(tags), notes)
  const row = db.prepare('SELECT * FROM recurring WHERE id = ?').get(result.lastInsertRowid)
  return { ...row, tags: JSON.parse(row.tags || '[]') }
})

ipcMain.handle('recurring:update', (_, { id, ...data }) => {
  if (Array.isArray(data.tags)) data.tags = JSON.stringify(data.tags)
  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ')
  db.prepare(`UPDATE recurring SET ${fields} WHERE id = ?`).run(...Object.values(data), id)
  const row = db.prepare('SELECT * FROM recurring WHERE id = ?').get(id)
  return { ...row, tags: JSON.parse(row.tags || '[]') }
})

ipcMain.handle('recurring:delete', (_, id) => {
  db.prepare('DELETE FROM recurring WHERE id = ?').run(id)
  return { success: true }
})

// Gera lançamentos pendentes para o mês atual a partir dos recorrentes ativos
ipcMain.handle('recurring:generateForMonth', (_, { month, year }) => {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`
  const today = new Date()
  const rows = db.prepare('SELECT * FROM recurring WHERE active = 1').all()
  const created = []

  const run = db.transaction(() => {
    for (const r of rows) {
      const dayStr = String(r.day_of_month).padStart(2, '0')
      const dateStr = `${prefix}-${dayStr}`

      const exists = db.prepare(
        `SELECT id FROM transactions
         WHERE description = ? AND amount = ? AND type = ?
           AND strftime('%Y-%m', date) = ?`
      ).get(r.description, r.amount, r.type, prefix)
      if (exists) continue

      // Se a data de vencimento já chegou → efetiva e ajusta saldo
      const dueDate = new Date(`${dateStr}T00:00:00`)
      const isDue = dueDate <= today
      const status = isDue ? 'done' : 'pending'

      const result = db.prepare(
        `INSERT INTO transactions
         (description, amount, type, category_id, account_id,
          date, tags, notes, status, due_date)
         VALUES (?,?,?,?,?,?,?,?,?,?)`
      ).run(r.description, r.amount, r.type, r.category_id, r.account_id,
            dateStr, r.tags, r.notes, status, dateStr)

      if (isDue) {
        if (r.type === 'income') {
          db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?')
            .run(r.amount, r.account_id)
        } else if (r.type === 'expense') {
          db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?')
            .run(r.amount, r.account_id)
        }
      }

      const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid)
      created.push({ ...row, tags: JSON.parse(row.tags || '[]') })
    }
  })
  run()
  return created
})

// ── Credit Cards ──────────────────────────────────────────────
ipcMain.handle('creditCards:list', () => {
  return db.prepare('SELECT * FROM credit_cards ORDER BY id').all()
})

ipcMain.handle('creditCards:create', (_, { name, limit_amount, closing_day, due_day, account_id, color }) => {
  const result = db.prepare(
    'INSERT INTO credit_cards (name, limit_amount, limit_total, closing_day, due_day, account_id, color) VALUES (?,?,?,?,?,?,?)'
  ).run(name, limit_amount ?? 0, limit_amount ?? 0, closing_day ?? 1, due_day ?? 10, account_id ?? null, color ?? '#EC4899')
  return db.prepare('SELECT * FROM credit_cards WHERE id = ?').get(result.lastInsertRowid)
})

ipcMain.handle('creditCards:update', (_, { id, ...data }) => {
  // Se o usuário editar o limite, atualiza também o limit_total
  if (data.limit_amount !== undefined) {
    data.limit_total = data.limit_amount
  }
  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ')
  db.prepare(`UPDATE credit_cards SET ${fields} WHERE id = ?`).run(...Object.values(data), id)
  return db.prepare('SELECT * FROM credit_cards WHERE id = ?').get(id)
})

ipcMain.handle('creditCards:delete', (_, id) => {
  db.prepare('DELETE FROM credit_cards WHERE id = ?').run(id)
  return { success: true }
})

// ── Credit Card Expenses ──────────────────────────────────────
ipcMain.handle('creditCardExpenses:list', (_, { card_id, billing_month }) => {
  return db.prepare(
    'SELECT * FROM credit_card_expenses WHERE card_id = ? AND billing_month = ? ORDER BY date DESC, id DESC'
  ).all(card_id, billing_month)
})

ipcMain.handle('creditCardExpenses:create', (_, { card_id, description, amount, category_id, date, notes }) => {
  const card = db.prepare('SELECT * FROM credit_cards WHERE id = ?').get(card_id)
  if (!card) throw new Error('Cartão não encontrado')

  const d = new Date(date + 'T00:00:00')
  const day = d.getDate()
  let billYear = d.getFullYear()
  let billMonth = d.getMonth()

  if (day >= card.closing_day) {
    billMonth += 1
    if (billMonth > 11) { billMonth = 0; billYear += 1 }
  }
  const billing_month = `${billYear}-${String(billMonth + 1).padStart(2, '0')}`

  const run = db.transaction(() => {
    const result = db.prepare(
      `INSERT INTO credit_card_expenses
       (card_id, description, amount, category_id, date, billing_month, notes)
       VALUES (?,?,?,?,?,?,?)`
    ).run(card_id, description, amount, category_id ?? null, date, billing_month, notes ?? '')

    //desconta do limite disponível
    db.prepare('UPDATE credit_cards SET limit_amount = limit_amount - ? WHERE id = ?')
      .run(amount, card_id)

    return db.prepare('SELECT * FROM credit_card_expenses WHERE id = ?').get(result.lastInsertRowid)
  })
  return run()
})

ipcMain.handle('creditCardExpenses:delete', (_, id) => {
  const run = db.transaction(() => {
    const exp = db.prepare('SELECT * FROM credit_card_expenses WHERE id = ?').get(id)
    if (!exp) throw new Error('Gasto não encontrado')

    //só restaura se ainda não foi pago (fatura não quitada)
    if (!exp.paid) {
      db.prepare('UPDATE credit_cards SET limit_amount = limit_amount + ? WHERE id = ?')
        .run(exp.amount, exp.card_id)
    }

    db.prepare('DELETE FROM credit_card_expenses WHERE id = ?').run(id)
    return { success: true }
  })
  return run()
})

ipcMain.handle('creditCardExpenses:payBill', (_, { card_id, billing_month }) => {
  const run = db.transaction(() => {
    const card = db.prepare('SELECT * FROM credit_cards WHERE id = ?').get(card_id)
    if (!card) throw new Error('Cartão não encontrado')

    const expenses = db.prepare(
      'SELECT * FROM credit_card_expenses WHERE card_id = ? AND billing_month = ? AND paid = 0'
    ).all(card_id, billing_month)
    if (!expenses.length) throw new Error('Nenhum gasto pendente nesta fatura')

    const total = expenses.reduce((s, e) => s + e.amount, 0)

    // Gera transaction de expense na conta vinculada
    const [billYear, billMonthNum] = billing_month.split('-').map(Number)
    const dueDate = `${billYear}-${String(billMonthNum).padStart(2,'0')}-${String(card.due_day).padStart(2,'0')}`

    db.prepare(
      `INSERT INTO transactions
       (description, amount, type, category_id, account_id, date, tags, notes, status, due_date)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(`Fatura ${card.name} ${billing_month}`, total, 'expense', null, card.account_id,
          dueDate, '["cartão"]', '', 'done', '')

    // Ajusta saldo da conta
    if (card.account_id) {
      db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(total, card.account_id)
    }

    // Marca gastos como pagos
    db.prepare(
      'UPDATE credit_card_expenses SET paid = 1 WHERE card_id = ? AND billing_month = ?'
    ).run(card_id, billing_month)

    //restaura o limite do cartão após pagamento da fatura
    db.prepare('UPDATE credit_cards SET limit_amount = limit_amount + ? WHERE id = ?').run(total, card_id)

    return { total, count: expenses.length, dueDate }
  })
  return run()
})

// ── Reports ───────────────────────────────────────────────────
ipcMain.handle('reports:monthlyTrend', (_, { months = 6 } = {}) => {
  // Retorna receitas e despesas dos últimos N meses
  const rows = db.prepare(`
    SELECT
      strftime('%Y-%m', date) AS month,
      SUM(CASE WHEN type = 'income'  THEN amount ELSE 0 END) AS income,
      SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS expense
    FROM transactions
    WHERE date >= date('now', ? || ' months')
    GROUP BY month
    ORDER BY month ASC
  `).all(`-${months}`)
  return rows
})

ipcMain.handle('reports:categoryBreakdown', (_, { month, year }) => {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`
  return db.prepare(`
    SELECT
      c.id, c.name, c.icon, c.color, c.budget,
      SUM(t.amount) AS total
    FROM transactions t
    JOIN categories c ON c.id = t.category_id
    WHERE t.type = 'expense'
      AND strftime('%Y-%m', t.date) = ?
    GROUP BY c.id
    ORDER BY total DESC
  `).all(prefix)
})

ipcMain.handle('reports:byRange', (_, { from, to }) => {
  return {
    income: db.prepare(
      `SELECT SUM(amount) AS total FROM transactions
       WHERE type='income' AND status='done' AND date BETWEEN ? AND ?`
    ).get(from, to)?.total || 0,
    expense: db.prepare(
      `SELECT SUM(amount) AS total FROM transactions
       WHERE type='expense' AND status='done' AND date BETWEEN ? AND ?`
    ).get(from, to)?.total || 0,
    byCategory: db.prepare(
      `SELECT c.id, c.name, c.icon, c.color, c.budget, SUM(t.amount) AS total
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
       WHERE t.type = 'expense' AND t.status = 'done'
         AND t.date BETWEEN ? AND ?
       GROUP BY c.id ORDER BY total DESC`
    ).all(from, to),
    transactions: (() => {
      const rows = db.prepare(
        `SELECT * FROM transactions
         WHERE date BETWEEN ? AND ? AND status = 'done'
         ORDER BY date DESC, id DESC`
      ).all(from, to)
      return rows.map(t => ({ ...t, tags: JSON.parse(t.tags || '[]') }))
    })(),
  }
})

// ── Backup / Export ───────────────────────────────────────────
ipcMain.handle('db:exportPath', () => dbPath)

// ─── Janela ───────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0D1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  const isDev = process.env.NODE_ENV === 'development'

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  initDatabase()
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => {
  if (db) db.close()
  if (process.platform !== 'darwin') app.quit()
})
