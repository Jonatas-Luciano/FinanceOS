/**
 * FinanceOS — importParser.js
 * Utilitário de parsing para OFX e CSV.
 * Roda no renderer (sem Node.js). Não depende de bibliotecas externas.
 *
 * Uso:
 *   import { parseOFX, parseCSV } from './importParser'
 *   const transactions = parseOFX(fileText)
 *   const { headers, transactions } = parseCSV(fileText)
 */

// ─── Helpers ──────────────────────────────────────────────────

/**
 * Converte data OFX (20240115120000[0:GMT] ou 20240115) → 'YYYY-MM-DD'
 */
function parseOFXDate(raw) {
  if (!raw) return ''
  const s = raw.replace(/\[.*\]/, '').trim() // remove timezone
  const y = s.substring(0, 4)
  const m = s.substring(4, 6)
  const d = s.substring(6, 8)
  if (!y || !m || !d) return ''
  return `${y}-${m}-${d}`
}

/**
 * Extrai valor entre tags SGML/XML: <TAG>valor ou <TAG>valor</TAG>
 * Funciona tanto para OFX SGML (sem fechamento) quanto OFX-XML.
 */
function extractTag(text, tag) {
  const re = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i')
  const match = text.match(re)
  return match ? match[1].trim() : ''
}

/**
 * Gera um hash simples para detecção de duplicatas.
 * Combina data + valor + descrição (normalizada).
 */
export function buildHash(date, amount, description) {
  return `${date}|${parseFloat(amount).toFixed(2)}|${description.trim().toLowerCase()}`
}

// ─── OFX Parser ───────────────────────────────────────────────

/**
 * Faz parse de um arquivo OFX (SGML ou XML).
 * Retorna array de objetos no formato interno do FinanceOS.
 *
 * @param {string} text  Conteúdo bruto do arquivo OFX
 * @returns {{ description, amount, type, date, hash, raw }[]}
 */
export function parseOFX(text) {
  // OFX SGML não tem fechamento de tags — isolamos cada <STMTTRN> pelo próximo
  // marcador de bloco. Funciona para ambos SGML e OFX-XML.
  const blockRe = /<STMTTRN>([\s\S]*?)(?=<STMTTRN>|<\/BANKTRANLIST>|<\/STMTTRNRS>|$)/gi
  const transactions = []
  let match

  while ((match = blockRe.exec(text)) !== null) {
    const block = match[1]

    const trnType  = extractTag(block, 'TRNTYPE').toUpperCase()  // DEBIT | CREDIT | etc.
    const dtPosted = extractTag(block, 'DTPOSTED')
    const trnAmt   = extractTag(block, 'TRNAMT')
    const memo     = extractTag(block, 'MEMO') || extractTag(block, 'NAME')
    const fitid    = extractTag(block, 'FITID')

    if (!trnAmt || !dtPosted) continue

    const amount = Math.abs(parseFloat(trnAmt.replace(',', '.')))
    if (isNaN(amount) || amount === 0) continue

    // Determina tipo: OFX pode usar sinal negativo no valor OU TRNTYPE
    const rawAmt = parseFloat(trnAmt.replace(',', '.'))
    const type = (rawAmt > 0 || trnType === 'CREDIT') ? 'income' : 'expense'

    const date = parseOFXDate(dtPosted)
    const description = memo || trnType || 'Sem descrição'

    transactions.push({
      description,
      amount,
      type,
      date,
      external_id: fitid || buildHash(date, amount, description),
      hash: buildHash(date, amount, description),
      // Campos a preencher pelo usuário no preview
      category_id: null,
      account_id: null,
      tags: [],
      notes: '',
      status: 'done',
      due_date: '',
    })
  }

  return transactions
}

// ─── CSV Parser ───────────────────────────────────────────────

/**
 * Faz parse de um CSV genérico.
 * Retorna os headers detectados e linhas brutas para o usuário mapear as colunas.
 *
 * @param {string} text      Conteúdo bruto do CSV
 * @param {string} delimiter Auto-detectado ou forçado (';' | ',')
 * @returns {{ headers: string[], rows: string[][] }}
 */
export function parseCSVRaw(text, delimiter = null) {
  // Auto-detecta delimitador
  const sep = delimiter || (text.split(';').length > text.split(',').length ? ';' : ',')

  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0)

  if (lines.length < 2) return { headers: [], rows: [] }

  const parseRow = (line) =>
    line.split(sep).map(cell => cell.replace(/^"|"$/g, '').trim())

  const headers = parseRow(lines[0])
  const rows    = lines.slice(1).map(parseRow)

  return { headers, rows }
}

/**
 * Converte linhas CSV em transações usando um mapeamento de colunas definido pelo usuário.
 *
 * @param {string[][]} rows     Linhas brutas do parseCSVRaw
 * @param {{
 *   colDate:        number,   índice da coluna de data
 *   colDescription: number,   índice da coluna de descrição
 *   colAmount:      number,   índice da coluna de valor
 *   colType:        number | null,  índice da coluna de tipo (opcional)
 *   dateFormat:     'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY',
 *   negativeIsExpense: boolean,  true = valor negativo → despesa
 * }} mapping
 * @returns {{ description, amount, type, date, hash }[]}
 */
export function applyCSVMapping(rows, mapping) {
  const {
    colDate,
    colDescription,
    colAmount,
    colType = null,
    dateFormat = 'DD/MM/YYYY',
    negativeIsExpense = true,
  } = mapping

  return rows
    .map(row => {
      const rawDate  = row[colDate]        || ''
      const rawDesc  = row[colDescription] || ''
      const rawAmt   = row[colAmount]      || ''
      const rawType  = colType !== null ? (row[colType] || '') : ''

      // Normaliza valor: troca vírgula decimal, remove pontos de milhar
      const normalizedAmt = rawAmt
        .replace(/[^\d,.\-]/g, '')
        .replace(/\.(?=\d{3})/g, '')  // remove ponto separador de milhar (BR)
        .replace(',', '.')
      const numAmt = parseFloat(normalizedAmt)
      if (isNaN(numAmt) || numAmt === 0) return null

      const amount = Math.abs(numAmt)

      // Tipo: coluna explícita > sinal do valor > padrão expense
      let type = 'expense'
      if (rawType) {
        const t = rawType.toLowerCase()
        if (t.includes('crédito') || t.includes('credit') || t.includes('entrada') || t.includes('receita')) {
          type = 'income'
        }
      } else if (negativeIsExpense) {
        type = numAmt < 0 ? 'expense' : 'income'
      }

      // Normaliza data
      let date = ''
      if (dateFormat === 'DD/MM/YYYY') {
        const parts = rawDate.split(/[\/\-]/)
        if (parts.length === 3) date = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`
      } else if (dateFormat === 'MM/DD/YYYY') {
        const parts = rawDate.split(/[\/\-]/)
        if (parts.length === 3) date = `${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`
      } else {
        date = rawDate.substring(0, 10) // assume YYYY-MM-DD
      }

      const description = rawDesc || 'Sem descrição'

      return {
        description,
        amount,
        type,
        date,
        external_id: null,
        hash: buildHash(date, amount, description),
        category_id: null,
        account_id: null,
        tags: [],
        notes: '',
        status: 'done',
        due_date: '',
      }
    })
    .filter(Boolean)
}

// ─── Sugestão automática de categoria ────────────────────────

const KEYWORD_MAP = [
  { keywords: ['mercado', 'supermercado', 'extra', 'pão de açúcar', 'carrefour', 'ifood', 'restaurante', 'lanchonete', 'padaria', 'açougue'], name: 'Alimentação' },
  { keywords: ['uber', 'lyft', '99', 'taxi', 'combustivel', 'gasolina', 'posto', 'estacionamento', 'metrô', 'onibus', 'bilhete'], name: 'Transporte' },
  { keywords: ['aluguel', 'condomínio', 'iptu', 'luz', 'energia', 'água', 'gás', 'internet', 'telefone'], name: 'Moradia' },
  { keywords: ['farmácia', 'drogaria', 'hospital', 'clínica', 'médico', 'dentista', 'plano de saúde', 'unimed'], name: 'Saúde' },
  { keywords: ['netflix', 'spotify', 'cinema', 'teatro', 'show', 'ingresso', 'steam', 'playstation', 'xbox'], name: 'Lazer' },
  { keywords: ['escola', 'faculdade', 'curso', 'livro', 'udemy', 'alura', 'mensalidade'], name: 'Educação' },
  { keywords: ['roupa', 'calçado', 'zara', 'c&a', 'renner', 'hering', 'nike', 'adidas'], name: 'Vestuário' },
  { keywords: ['salário', 'salario', 'pagamento', 'folha'], name: 'Salário' },
  { keywords: ['freelance', 'projeto', 'honorário', 'serviço prestado'], name: 'Freelance' },
  { keywords: ['rendimento', 'dividendo', 'juros', 'cdb', 'tesouro', 'fundo'], name: 'Investimento' },
]

/**
 * Sugere o id de uma categoria com base na descrição da transação.
 * @param {string} description
 * @param {{ id, name }[]} categories
 * @returns {number | null}
 */
export function suggestCategory(description, categories) {
  const lower = description.toLowerCase()
  for (const rule of KEYWORD_MAP) {
    if (rule.keywords.some(k => lower.includes(k))) {
      const cat = categories.find(c => c.name === rule.name)
      if (cat) return cat.id
    }
  }
  return null
}
