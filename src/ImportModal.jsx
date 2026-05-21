/**
 * FinanceOS — ImportModal.jsx
 * Modal de importação de extratos OFX e CSV.
 *
 * Props:
 *   accounts    {Array}    lista de contas do estado global
 *   categories  {Array}    lista de categorias do estado global
 *   onClose     {Function} fecha o modal
 *   onImported  {Function} chamado com as transações salvas após confirmação
 *
 * Uso em FinanceApp.jsx:
 *   import ImportModal from './ImportModal'
 *   ...
 *   {showModal === 'import' && (
 *     <ImportModal
 *       accounts={accounts}
 *       categories={categories}
 *       onClose={closeModal}
 *       onImported={(newTxs) => {
 *         setTransactions(prev => [...newTxs, ...prev])
 *         // Recarrega saldos das contas
 *         if (window.db) window.db.accounts.list().then(setAccounts)
 *       }}
 *     />
 *   )}
 */

import { useState, useRef, useCallback } from 'react'
import {
  parseOFX,
  parseCSVRaw,
  applyCSVMapping,
  suggestCategory,
  buildHash,
} from './importParser'

// ─── Estilos inline (herdam a paleta do FinanceApp) ──────────
const S = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1100,
  },
  box: {
    background: '#161B22', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16, width: 860, maxWidth: '96vw',
    maxHeight: '92vh', display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.07)',
    flexShrink: 0,
  },
  body: { flex: 1, overflow: 'auto', padding: '20px 24px' },
  footer: {
    display: 'flex', gap: 10, padding: '14px 24px',
    borderTop: '1px solid rgba(255,255,255,0.07)', flexShrink: 0,
  },
  label: { fontSize: 11, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4, display: 'block' },
  input: { width: '100%', padding: '9px 12px', background: '#0D1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#E6EDF3', fontSize: 13, outline: 'none', boxSizing: 'border-box' },
  select: { width: '100%', padding: '9px 12px', background: '#0D1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#E6EDF3', fontSize: 13, outline: 'none', boxSizing: 'border-box' },
  btn: (v = 'primary') => ({
    padding: '9px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
    display: 'flex', alignItems: 'center', gap: 6,
    border: v === 'ghost' ? '1px solid rgba(255,255,255,0.1)' : 'none',
    background: v === 'primary' ? '#8B5CF6' : v === 'danger' ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.06)',
    color: v === 'primary' ? '#fff' : v === 'danger' ? '#EF4444' : '#C9D1D9',
  }),
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: { textAlign: 'left', padding: '6px 8px', color: '#6B7280', fontWeight: 600, fontSize: 11, borderBottom: '1px solid rgba(255,255,255,0.07)' },
  td: { padding: '8px 8px', borderBottom: '1px solid rgba(255,255,255,0.04)', verticalAlign: 'middle' },
  badge: (color) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: color + '20', color }),
  dropzone: (hover) => ({
    border: `2px dashed ${hover ? '#8B5CF6' : 'rgba(255,255,255,0.15)'}`,
    borderRadius: 12, padding: '40px 24px', textAlign: 'center',
    background: hover ? 'rgba(139,92,246,0.07)' : 'transparent',
    transition: 'all 0.2s', cursor: 'pointer',
  }),
  fr: { marginBottom: 14 },
}

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0)

// ─── Etapas do wizard ────────────────────────────────────────
// 'upload' → (se CSV) 'csv_map' → 'preview' → 'done'

export default function ImportModal({ accounts, categories, onClose, onImported }) {
  const [step, setStep]             = useState('upload')
  const [fileType, setFileType]     = useState(null)        // 'ofx' | 'csv'
  const [parsedTxs, setParsedTxs]   = useState([])          // transações brutas do parser
  const [csvRaw, setCsvRaw]         = useState(null)        // { headers, rows } do CSV
  const [csvMap, setCsvMap]         = useState({            // mapeamento de colunas CSV
    colDate: 0, colDescription: 1, colAmount: 2,
    colType: null, dateFormat: 'DD/MM/YYYY', negativeIsExpense: true,
  })
  const [preview, setPreview]       = useState([])          // transações enriquecidas para revisão
  const [globalAccount, setGlobalAccount] = useState(accounts[0]?.id ?? '')
  const [isDragOver, setIsDragOver] = useState(false)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [dupCount, setDupCount]     = useState(0)
  const fileRef = useRef()

  // ── Leitura do arquivo ──────────────────────────────────────
  const readFile = useCallback((file) => {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['ofx', 'csv'].includes(ext)) {
      setError('Formato não suportado. Use .ofx ou .csv')
      return
    }
    setError('')
    setFileType(ext)

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target.result
      if (ext === 'ofx') {
        try {
          const txs = parseOFX(text)
          if (!txs.length) { setError('Nenhuma transação encontrada no arquivo OFX.'); return }
          buildPreview(txs)
          setStep('preview')
        } catch (err) {
          setError('Erro ao processar OFX: ' + err.message)
        }
      } else {
        // CSV: vai para etapa de mapeamento
        const raw = parseCSVRaw(text)
        if (!raw.headers.length) { setError('CSV inválido ou vazio.'); return }
        setCsvRaw(raw)
        setStep('csv_map')
      }
    }
    // OFX brasileiro pode ser Latin-1
    reader.readAsText(file, ext === 'ofx' ? 'ISO-8859-1' : 'UTF-8')
  }, [categories, accounts])

  // ── Enriquece transações com sugestões de categoria ──────────
  const buildPreview = useCallback((txs) => {
    const enriched = txs.map(tx => ({
      ...tx,
      account_id: globalAccount || accounts[0]?.id || null,
      category_id: tx.category_id ?? suggestCategory(tx.description, categories),
      _include: true,  // checkbox de inclusão
    }))

    // Detecta possíveis duplicatas (apenas informativo)
    let dups = 0
    if (window._importedHashes) {
      enriched.forEach(tx => { if (window._importedHashes.has(tx.hash)) { tx._duplicate = true; tx._include = false; dups++ } })
    }
    setDupCount(dups)
    setPreview(enriched)
    setParsedTxs(txs)
  }, [categories, accounts, globalAccount])

  // ── Aplica mapeamento CSV e avança ───────────────────────────
  const applyMapping = useCallback(() => {
    if (!csvRaw) return
    try {
      const txs = applyCSVMapping(csvRaw.rows, csvMap)
      if (!txs.length) { setError('Nenhuma linha válida após mapeamento. Verifique as colunas.'); return }
      setError('')
      buildPreview(txs)
      setStep('preview')
    } catch (err) {
      setError('Erro ao aplicar mapeamento: ' + err.message)
    }
  }, [csvRaw, csvMap, buildPreview])

  // ── Atualiza campo de uma tx no preview ─────────────────────
  const updateTx = (idx, field, value) => {
    setPreview(prev => prev.map((tx, i) => i === idx ? { ...tx, [field]: value } : tx))
  }

  // ── Confirma importação ──────────────────────────────────────
  const confirmImport = useCallback(async () => {
    const toImport = preview.filter(tx => tx._include && !tx._duplicate)
    if (!toImport.length) { setError('Nenhuma transação selecionada para importar.'); return }

    setLoading(true)
    setError('')
    try {
      let saved = []
      if (window.db?.transactions?.createBatch) {
        // Handler em lote (ideal — ver main.js)
        saved = await window.db.transactions.createBatch(toImport)
      } else if (window.db?.transactions?.create) {
        // Fallback: um por um
        for (const tx of toImport) {
          const s = await window.db.transactions.create(tx)
          saved.push(s)
        }
      } else {
        // Modo demo
        saved = toImport.map((tx, i) => ({ ...tx, id: Date.now() + i }))
      }

      // Registra hashes para evitar reimportação futura nesta sessão
      if (!window._importedHashes) window._importedHashes = new Set()
      toImport.forEach(tx => window._importedHashes.add(tx.hash))

      onImported(saved)
      setStep('done')
    } catch (err) {
      setError('Erro ao salvar: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [preview, onImported])

  // ── Drag & Drop ──────────────────────────────────────────────
  const onDrop = (e) => {
    e.preventDefault(); setIsDragOver(false)
    readFile(e.dataTransfer.files[0])
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.box} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={S.header}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>📂 Importar Extrato</div>
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
              {step === 'upload'  && 'Selecione ou arraste um arquivo .OFX ou .CSV'}
              {step === 'csv_map' && 'Mapeie as colunas do seu CSV'}
              {step === 'preview' && `Revisão — ${preview.filter(t => t._include).length} transação(ões) selecionada(s)`}
              {step === 'done'    && 'Importação concluída!'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        {/* Body */}
        <div style={S.body}>
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', color: '#EF4444', fontSize: 13, marginBottom: 16 }}>
              ⚠ {error}
            </div>
          )}

          {/* ── STEP: upload ── */}
          {step === 'upload' && (
            <div>
              {/* Dropzone */}
              <div
                style={S.dropzone(isDragOver)}
                onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
              >
                <div style={{ fontSize: 36, marginBottom: 12 }}>📥</div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Arraste o arquivo aqui</div>
                <div style={{ color: '#6B7280', fontSize: 13 }}>ou clique para selecionar · .OFX ou .CSV</div>
                <input ref={fileRef} type='file' accept='.ofx,.csv' style={{ display: 'none' }}
                  onChange={e => readFile(e.target.files[0])} />
              </div>

              {/* Conta padrão */}
              <div style={{ ...S.fr, marginTop: 20 }}>
                <label style={S.label}>Conta de destino padrão</label>
                <select style={S.select} value={globalAccount}
                  onChange={e => setGlobalAccount(+e.target.value)}>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.bank})</option>)}
                </select>
                <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>
                  Você poderá alterar conta por transação na etapa de revisão.
                </div>
              </div>

              {/* Dicas de formatos */}
              <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { icon: '🏦', title: 'OFX (Open Financial Exchange)', desc: 'Exportado pela maioria dos bancos (Banco do Brasil, Bradesco, Itaú, Santander, Sicoob). Procure em "Exportar extrato" no Internet Banking.' },
                  { icon: '📊', title: 'CSV (Nubank, Neon, Inter…)', desc: 'Planilha de movimentações. Cada banco usa colunas diferentes — você mapeará as colunas na próxima etapa.' },
                ].map((tip, i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 22, marginBottom: 6 }}>{tip.icon}</div>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{tip.title}</div>
                    <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.5 }}>{tip.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP: csv_map ── */}
          {step === 'csv_map' && csvRaw && (
            <div>
              <div style={{ marginBottom: 16, fontSize: 13, color: '#6B7280' }}>
                {csvRaw.rows.length} linhas detectadas. Colunas disponíveis: <strong style={{ color: '#C9D1D9' }}>{csvRaw.headers.join(', ')}</strong>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {[
                  { label: 'Coluna de Data *', key: 'colDate' },
                  { label: 'Coluna de Descrição *', key: 'colDescription' },
                  { label: 'Coluna de Valor *', key: 'colAmount' },
                  { label: 'Coluna de Tipo (opcional)', key: 'colType' },
                ].map(f => (
                  <div key={f.key} style={S.fr}>
                    <label style={S.label}>{f.label}</label>
                    <select style={S.select} value={csvMap[f.key] ?? ''}
                      onChange={e => setCsvMap(m => ({ ...m, [f.key]: e.target.value === '' ? null : +e.target.value }))}>
                      {f.key === 'colType' && <option value=''>— não usar —</option>}
                      {csvRaw.headers.map((h, i) => <option key={i} value={i}>{h} (col {i + 1})</option>)}
                    </select>
                  </div>
                ))}

                <div style={S.fr}>
                  <label style={S.label}>Formato de data</label>
                  <select style={S.select} value={csvMap.dateFormat}
                    onChange={e => setCsvMap(m => ({ ...m, dateFormat: e.target.value }))}>
                    <option value='DD/MM/YYYY'>DD/MM/AAAA (padrão BR)</option>
                    <option value='YYYY-MM-DD'>AAAA-MM-DD (ISO)</option>
                    <option value='MM/DD/YYYY'>MM/DD/AAAA (EUA)</option>
                  </select>
                </div>

                <div style={S.fr}>
                  <label style={S.label}>Interpretação do valor</label>
                  <select style={S.select} value={csvMap.negativeIsExpense ? '1' : '0'}
                    onChange={e => setCsvMap(m => ({ ...m, negativeIsExpense: e.target.value === '1' }))}>
                    <option value='1'>Negativo = despesa (padrão)</option>
                    <option value='0'>Positivo = despesa</option>
                  </select>
                </div>
              </div>

              {/* Preview das 3 primeiras linhas */}
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>Prévia das primeiras linhas:</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={S.table}>
                    <thead>
                      <tr>{csvRaw.headers.map((h, i) => <th key={i} style={S.th}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {csvRaw.rows.slice(0, 4).map((row, i) => (
                        <tr key={i}>{row.map((cell, j) => <td key={j} style={{ ...S.td, color: '#C9D1D9' }}>{cell}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP: preview ── */}
          {step === 'preview' && (
            <div>
              {dupCount > 0 && (
                <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '10px 14px', color: '#F59E0B', fontSize: 13, marginBottom: 12 }}>
                  ⚠ {dupCount} transação(ões) marcada(s) como provável duplicata e desmarcada(s). Revise antes de importar.
                </div>
              )}

              {/* Seleção rápida de conta global */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}>
                <label style={{ ...S.label, marginBottom: 0, whiteSpace: 'nowrap' }}>Conta para todas:</label>
                <select style={{ ...S.select, width: 'auto' }} value={globalAccount}
                  onChange={e => {
                    const id = +e.target.value
                    setGlobalAccount(id)
                    setPreview(prev => prev.map(tx => ({ ...tx, account_id: id })))
                  }}>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <span style={{ fontSize: 12, color: '#6B7280' }}>(pode alterar individualmente)</span>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={S.table}>
                  <thead>
                    <tr>
                      <th style={S.th}>✓</th>
                      <th style={S.th}>Data</th>
                      <th style={S.th}>Descrição</th>
                      <th style={S.th}>Tipo</th>
                      <th style={S.th}>Valor</th>
                      <th style={S.th}>Categoria</th>
                      <th style={S.th}>Conta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((tx, i) => (
                      <tr key={i} style={{ opacity: tx._include ? 1 : 0.4 }}>
                        <td style={S.td}>
                          <input type='checkbox' checked={!!tx._include}
                            onChange={e => updateTx(i, '_include', e.target.checked)} />
                        </td>
                        <td style={{ ...S.td, whiteSpace: 'nowrap', color: '#6B7280' }}>{tx.date}</td>
                        <td style={{ ...S.td, maxWidth: 200 }}>
                          <input
                            style={{ ...S.input, padding: '4px 8px', fontSize: 12 }}
                            value={tx.description}
                            onChange={e => updateTx(i, 'description', e.target.value)}
                          />
                          {tx._duplicate && <div style={{ fontSize: 10, color: '#F59E0B', marginTop: 2 }}>⚠ possível duplicata</div>}
                        </td>
                        <td style={S.td}>
                          <select style={{ ...S.select, width: 110, padding: '4px 8px', fontSize: 12 }}
                            value={tx.type} onChange={e => updateTx(i, 'type', e.target.value)}>
                            <option value='expense'>📤 Despesa</option>
                            <option value='income'>📥 Receita</option>
                          </select>
                        </td>
                        <td style={{ ...S.td, fontWeight: 700, color: tx.type === 'income' ? '#10B981' : '#EF4444', whiteSpace: 'nowrap' }}>
                          {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
                        </td>
                        <td style={S.td}>
                          <select style={{ ...S.select, width: 140, padding: '4px 8px', fontSize: 12 }}
                            value={tx.category_id ?? ''}
                            onChange={e => updateTx(i, 'category_id', e.target.value ? +e.target.value : null)}>
                            <option value=''>— sem categoria —</option>
                            {categories
                              .filter(c => c.type === tx.type)
                              .map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                          </select>
                        </td>
                        <td style={S.td}>
                          <select style={{ ...S.select, width: 130, padding: '4px 8px', fontSize: 12 }}
                            value={tx.account_id ?? ''}
                            onChange={e => updateTx(i, 'account_id', e.target.value ? +e.target.value : null)}>
                            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── STEP: done ── */}
          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Importação concluída!</div>
              <div style={{ color: '#6B7280', fontSize: 14 }}>
                As transações já aparecem em Movimentações.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={S.footer}>
          {step === 'upload' && (
            <button style={{ ...S.btn('ghost'), marginLeft: 'auto' }} onClick={onClose}>Cancelar</button>
          )}
          {step === 'csv_map' && (
            <>
              <button style={S.btn('ghost')} onClick={() => setStep('upload')}>← Voltar</button>
              <button style={{ ...S.btn('primary'), marginLeft: 'auto' }} onClick={applyMapping}>Mapear e Pré-visualizar →</button>
            </>
          )}
          {step === 'preview' && (
            <>
              <button style={S.btn('ghost')} onClick={() => setStep(fileType === 'csv' ? 'csv_map' : 'upload')}>← Voltar</button>
              <div style={{ flex: 1 }} />
              <div style={{ fontSize: 13, color: '#6B7280', alignSelf: 'center' }}>
                {preview.filter(t => t._include).length} de {preview.length} selecionadas
              </div>
              <button style={S.btn('primary')} onClick={confirmImport} disabled={loading}>
                {loading ? 'Salvando...' : `💾 Importar ${preview.filter(t => t._include).length} transação(ões)`}
              </button>
            </>
          )}
          {step === 'done' && (
            <button style={{ ...S.btn('primary'), marginLeft: 'auto' }} onClick={onClose}>Fechar</button>
          )}
        </div>
      </div>
    </div>
  )
}
