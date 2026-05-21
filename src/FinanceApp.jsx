/**
 * FinanceOS — Aplicativo de Organização Financeira Pessoal
 * Versão: 2.0.0
 */

import { useState, useEffect, useCallback, useMemo } from "react";

// ============================================================
// MOCK DATA — vazio para começar do zero
// ============================================================
const MOCK_TRANSACTIONS = [];
const MOCK_ACCOUNTS = [];
const MOCK_CATEGORIES = [
  { id: 1,  name: "Alimentação", icon: "🍽️", type: "expense", color: "#EF4444", budget: 0 },
  { id: 2,  name: "Transporte",  icon: "🚗", type: "expense", color: "#F59E0B", budget: 0 },
  { id: 3,  name: "Moradia",     icon: "🏠", type: "expense", color: "#8B5CF6", budget: 0 },
  { id: 4,  name: "Saúde",       icon: "💊", type: "expense", color: "#10B981", budget: 0 },
  { id: 5,  name: "Lazer",       icon: "🎮", type: "expense", color: "#3B82F6", budget: 0 },
  { id: 6,  name: "Educação",    icon: "📚", type: "expense", color: "#06B6D4", budget: 0 },
  { id: 7,  name: "Vestuário",   icon: "👔", type: "expense", color: "#EC4899", budget: 0 },
  { id: 8,  name: "Salário",     icon: "💼", type: "income",  color: "#10B981", budget: 0 },
  { id: 9,  name: "Freelance",   icon: "💻", type: "income",  color: "#3B82F6", budget: 0 },
  { id: 10, name: "Investimento",icon: "📈", type: "income",  color: "#8B5CF6", budget: 0 },
];
const MOCK_INVESTMENTS = [];
const MOCK_GOALS = [];

// ============================================================
// UTILITIES
// ============================================================
const fmt = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);

const fmtCompact = (v) =>
  v >= 1000000 ? `R$ ${(v / 1000000).toFixed(1)}M` :
  v >= 1000 ? `R$ ${(v / 1000).toFixed(1)}K` : fmt(v);

const fmtPct = (v) => `${(v ?? 0).toFixed(1)}%`;
const fmtDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
const monthNames = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

const now = new Date();
const thisMonth = now.getMonth();
const thisYear = now.getFullYear();

// ============================================================
// MINI CHART COMPONENTS
// ============================================================
function MiniBar({ pct, color }) {
  const p = Math.min(100, Math.max(0, pct || 0));
  const barColor = pct > 90 ? "#EF4444" : pct > 70 ? "#F59E0B" : color;
  return (
    <div style={{ width: "100%", height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ width: `${p}%`, height: "100%", background: barColor, borderRadius: 3, transition: "width 0.6s ease" }} />
    </div>
  );
}

function DonutChart({ segments, size = 120 }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (!total) return <div style={{ width: size, height: size, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />;
  let offset = 0;
  const r = 46, cx = 60, cy = 60;
  const circ = 2 * Math.PI * r;
  const arcs = segments.map((seg) => {
    const pct = seg.value / total;
    const dash = pct * circ;
    const arc = { ...seg, dash, offset: circ - offset };
    offset += dash;
    return arc;
  });
  return (
    <svg width={size} height={size} viewBox="0 0 120 120">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="14" />
      {arcs.map((arc, i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={arc.color}
          strokeWidth="14" strokeDasharray={`${arc.dash} ${circ - arc.dash}`}
          strokeDashoffset={arc.offset} style={{ transform: "rotate(-90deg)", transformOrigin: "60px 60px" }} />
      ))}
    </svg>
  );
}

// ============================================================
// MAIN APP
// ============================================================
export default function FinanceOS() {
  const [page, setPage] = useState("dashboard");
  const [transactions, setTransactions] = useState(MOCK_TRANSACTIONS);
  const [accounts, setAccounts] = useState(MOCK_ACCOUNTS);
  const [categories, setCategories] = useState(MOCK_CATEGORIES);
  const [investments, setInvestments] = useState(MOCK_INVESTMENTS);
  const [goals, setGoals] = useState(MOCK_GOALS);
  const [showModal, setShowModal] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [search, setSearch] = useState("");
  const [filterMonth, setFilterMonth] = useState(thisMonth);
  const [filterYear, setFilterYear] = useState(thisYear);
  const [calMonth, setCalMonth] = useState(thisMonth);
  const [calYear, setCalYear] = useState(thisYear);
  const [txForm, setTxForm] = useState({ description: "", amount: "", type: "expense", category_id: 1, account_id: "", date: new Date().toISOString().split("T")[0], tags: "", notes: "",status: 'done', due_date: '', });
  const [accForm, setAccForm] = useState({ name: "", type: "checking", bank: "", balance: "", color: "#8B5CF6" });
  const [invForm, setInvForm] = useState({ name: "", type: "cdb", invested: "", current: "", rate: "", rate_type: "% a.a.", start_date: "", maturity: "" });
  const [goalForm, setGoalForm] = useState({ name: "", target: "", current: "", deadline: "", icon: "🎯", color: "#8B5CF6" });
  const [budgetEdits, setBudgetEdits] = useState({});
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState(null);
  const [catForm, setCatForm] = useState({ name: '', icon: '📦', type: 'expense', color: '#6B7280', budget: ''})
  const [recurring, setRecurring] = useState([])
  const [recForm, setRecForm] = useState({description: '', amount: '', type: 'expense', category_id: 1, account_id: '', day_of_month: 1, tags: '', notes: ''})
  const [reportFrom, setReportFrom] = useState(new Date(thisYear, thisMonth, 1).toISOString().split('T')[0])
  const [reportTo, setReportTo] = useState(new Date().toISOString().split('T')[0])
  const [reportData, setReportData] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [showAporteModal, setShowAporteModal] = useState(false)
  const [aporteForm, setAporteForm] = useState({ account_id: '', investment_id: '', amount: '', description: '', date: new Date().toISOString().split('T')[0], notes: '' })
  const [creditCards, setCreditCards] = useState([])
  const [selectedCard, setSelectedCard] = useState(null)
  const [selectedBillingMonth, setSelectedBillingMonth] = useState(`${thisYear}-${String(thisMonth + 1).padStart(2, '0')}`)
  const [cardExpenses, setCardExpenses] = useState([])
  const [cardForm, setCardForm] = useState({ name: '', limit_amount: '', closing_day: 10, due_day: 15, account_id: '', color: '#EC4899'})
  const [cardExpForm, setCardExpForm] = useState({ description: '', amount: '', category_id: '', date: new Date().toISOString().split('T')[0], notes: '', installments: 1 })

  useEffect(() => {
    if (!window.db) return;
    let cancelled = false;
    async function loadAll() {
      try {
        const [accs, cats, txs, invs, gls, recs, cards] = await Promise.all([
          window.db.accounts.list(),
          window.db.categories.list(),
          window.db.transactions.list({ month: filterMonth, year: filterYear }),
          window.db.investments.list(),
          window.db.goals.list(),
          window.db.recurring.list(),
          window.db.creditCards.list(),
        ]);
        if (cancelled) return;
        setAccounts(accs); setCategories(cats); setTransactions(txs);
        setInvestments(invs); setGoals(gls); setRecurring(recs); setCreditCards(cards); setDbReady(true);
      } catch (err) { if (!cancelled) setDbError(err.message); }
    }
    loadAll();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!window.db || !dbReady) return;
    window.db.transactions.list({ month: filterMonth, year: filterYear })
      .then(setTransactions).catch(console.error);
  }, [filterMonth, filterYear, dbReady]);

  // Derived
  const monthTx = useMemo(() => transactions.filter(t => {
    const d = new Date(t.date + "T00:00:00");
    return d.getMonth() === filterMonth && d.getFullYear() === filterYear;
  }), [transactions, filterMonth, filterYear]);

  const calTx = useMemo(() => transactions.filter(t => {
    const d = new Date(t.date + "T00:00:00");
    return d.getMonth() === calMonth && d.getFullYear() === calYear;
  }), [transactions, calMonth, calYear]);

  const totalIncome  = useMemo(() => monthTx.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0), [monthTx]);
  const totalExpense = useMemo(() => monthTx.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0), [monthTx]);
  const totalBalance = useMemo(() => accounts.reduce((s, a) => s + a.balance, 0), [accounts]);
  const totalInvested = useMemo(() => investments.reduce((s, i) => s + i.current, 0), [investments]);
  const netWorth = totalBalance + totalInvested;

  const expByCategory = useMemo(() => {
    const map = {};
    monthTx.filter(t => t.type === "expense").forEach(t => { map[t.category_id] = (map[t.category_id] || 0) + t.amount; });
    return Object.entries(map).map(([cid, total]) => {
      const c = categories.find(x => x.id === +cid);
      if (!c) return null;
      return { ...c, total, pct: c.budget ? (total / c.budget) * 100 : 0 };
    }).filter(Boolean).sort((a, b) => b.total - a.total);
  }, [monthTx, categories]);

  const monthlyTrend = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    const d = new Date(thisYear, thisMonth - 5 + i, 1);
    const m = d.getMonth(), y = d.getFullYear();
    const tx = transactions.filter(t => { const td = new Date(t.date + "T00:00:00"); return td.getMonth() === m && td.getFullYear() === y; });
    return { label: monthNames[m], income: tx.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0), expense: tx.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0) };
  }), [transactions]);

  const filteredTx = useMemo(() => {
    const q = search.toLowerCase();
    return monthTx.filter(t => t.description.toLowerCase().includes(q) || (categories.find(c => c.id === t.category_id)?.name || "").toLowerCase().includes(q)).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [monthTx, search, categories]);

  const cat = (id) => categories.find(c => c.id === id);
  const acc = (id) => accounts.find(a => a.id === id);

// ── Transaction CRUD ──────────────────────────────────────
  const openAddTx = () => {
    setEditTarget(null);
    setTxForm({ description: "", amount: "", type: "expense", category_id: categories[0]?.id || 1, account_id: accounts[0]?.id || "", date: new Date().toISOString().split("T")[0], tags: "", notes: "", status: 'done',due_date: '' });
    setShowModal("tx");
  };
  const openEditTx = (t) => {
    setEditTarget(t);
    setTxForm({ ...t, amount: String(t.amount), tags: Array.isArray(t.tags) ? t.tags.join(", ") : (t.tags || "") });
    setShowModal("tx");
  };
  const saveTx = useCallback(async () => {
    if (!txForm.description || !txForm.amount) return;
    const payload = { ...txForm, amount: parseFloat(txForm.amount), tags: txForm.tags ? txForm.tags.split(",").map(t => t.trim()).filter(Boolean) : [] };
    if (editTarget) {
      if (window.db) {
        try { const saved = await window.db.transactions.update({ id: editTarget.id, ...payload }); setTransactions(prev => prev.map(t => t.id === editTarget.id ? saved : t)); const accs = await window.db.accounts.list(); setAccounts(accs); } catch (err) { console.error(err); return; }
      } else { setTransactions(prev => prev.map(t => t.id === editTarget.id ? { ...payload, id: editTarget.id } : t)); }
    } else {
      if (window.db) {
        try { const saved = await window.db.transactions.create(payload); setTransactions(prev => [saved, ...prev]); const accs = await window.db.accounts.list(); setAccounts(accs); } catch (err) { console.error(err); return; }
      } else {
        setTransactions(prev => [{ ...payload, id: Date.now() }, ...prev]);
        if (payload.account_id) setAccounts(prev => prev.map(a => a.id === +payload.account_id ? { ...a, balance: a.balance + (payload.type === "income" ? payload.amount : -payload.amount) } : a));
      }
    }
    setShowModal(null); setEditTarget(null);
  }, [txForm, editTarget]);

  const deleteTx = useCallback(async (id) => {
    if (window.db) {
      try { await window.db.transactions.delete(id); const accs = await window.db.accounts.list(); setAccounts(accs); } catch (err) { console.error(err); return; }
    } else {
      const tx = transactions.find(t => t.id === id);
      if (tx?.account_id) setAccounts(prev => prev.map(a => a.id === tx.account_id ? { ...a, balance: a.balance + (tx.type === "income" ? -tx.amount : tx.amount) } : a));
    }
    setTransactions(prev => prev.filter(t => t.id !== id));
  }, [transactions]);

// ── Account CRUD ──────────────────────────────────────────
  const openAddAcc = () => { setEditTarget(null); setAccForm({ name: "", type: "checking", bank: "", balance: "", color: "#8B5CF6" }); setShowModal("acc"); };
  const openEditAcc = (a) => { setEditTarget(a); setAccForm({ ...a, balance: String(a.balance) }); setShowModal("acc"); };
  const saveAcc = useCallback(async () => {
    if (!accForm.name) return;
    const payload = { ...accForm, balance: parseFloat(accForm.balance) || 0 };
    if (editTarget) {
      if (window.db) { try { const saved = await window.db.accounts.update({ id: editTarget.id, ...payload }); setAccounts(prev => prev.map(a => a.id === editTarget.id ? saved : a)); } catch (err) { console.error(err); return; } }
      else { setAccounts(prev => prev.map(a => a.id === editTarget.id ? { ...payload, id: editTarget.id } : a)); }
    } else {
      if (window.db) { try { const saved = await window.db.accounts.create(payload); setAccounts(prev => [...prev, saved]); } catch (err) { console.error(err); return; } }
      else { setAccounts(prev => [...prev, { ...payload, id: Date.now() }]); }
    }
    setShowModal(null); setEditTarget(null);
  }, [accForm, editTarget]);
  const deleteAcc = useCallback(async (id) => {
    if (!window.confirm("Excluir esta conta? Movimentações associadas perderão a referência.")) return;
    if (window.db) { try { await window.db.accounts.delete(id); } catch (err) { console.error(err); return; } }
    setAccounts(prev => prev.filter(a => a.id !== id));
  }, []);

// ── Investment CRUD ───────────────────────────────────────
  const openAddInv = () => { setEditTarget(null); setInvForm({ name: "", type: "cdb", invested: "", current: "", rate: "", rate_type: "% a.a.", start_date: new Date().toISOString().split("T")[0], maturity: "" }); setShowModal("inv"); };
  const openEditInv = (inv) => { setEditTarget(inv); setInvForm({ ...inv, invested: String(inv.invested), current: String(inv.current), rate: String(inv.rate) }); setShowModal("inv"); };
  const saveInv = useCallback(async () => {
    if (!invForm.name || !invForm.invested) return;
    const payload = { ...invForm, invested: parseFloat(invForm.invested) || 0, current: parseFloat(invForm.current) || parseFloat(invForm.invested) || 0, rate: parseFloat(invForm.rate) || 0 };
    if (editTarget) {
      if (window.db) { try { const saved = await window.db.investments.update({ id: editTarget.id, ...payload }); setInvestments(prev => prev.map(i => i.id === editTarget.id ? saved : i)); } catch (err) { console.error(err); return; } }
      else { setInvestments(prev => prev.map(i => i.id === editTarget.id ? { ...payload, id: editTarget.id } : i)); }
    } else {
      if (window.db) { try { const saved = await window.db.investments.create(payload); setInvestments(prev => [...prev, saved]); } catch (err) { console.error(err); return; } }
      else { setInvestments(prev => [...prev, { ...payload, id: Date.now() }]); }
    }
    setShowModal(null); setEditTarget(null);
  }, [invForm, editTarget]);
  const deleteInv = useCallback(async (id) => {
    if (!window.confirm("Excluir este investimento?")) return;
    if (window.db) { try { await window.db.investments.delete(id); } catch (err) { console.error(err); return; } }
    setInvestments(prev => prev.filter(i => i.id !== id));
  }, []);

// ── Goal CRUD ─────────────────────────────────────────────
  const openAddGoal = () => { setEditTarget(null); setGoalForm({ name: "", target: "", current: "", deadline: "", icon: "🎯", color: "#8B5CF6" }); setShowModal("goal"); };
  const openEditGoal = (g) => { setEditTarget(g); setGoalForm({ ...g, target: String(g.target), current: String(g.current) }); setShowModal("goal"); };
  const saveGoal = useCallback(async () => {
    if (!goalForm.name || !goalForm.target) return;
    const payload = { ...goalForm, target: parseFloat(goalForm.target) || 0, current: parseFloat(goalForm.current) || 0 };
    if (editTarget) {
      if (window.db) { try { const saved = await window.db.goals.update({ id: editTarget.id, ...payload }); setGoals(prev => prev.map(g => g.id === editTarget.id ? saved : g)); } catch (err) { console.error(err); return; } }
      else { setGoals(prev => prev.map(g => g.id === editTarget.id ? { ...payload, id: editTarget.id } : g)); }
    } else {
      if (window.db) { try { const saved = await window.db.goals.create(payload); setGoals(prev => [...prev, saved]); } catch (err) { console.error(err); return; } }
      else { setGoals(prev => [...prev, { ...payload, id: Date.now() }]); }
    }
    setShowModal(null); setEditTarget(null);
  }, [goalForm, editTarget]);
  const deleteGoal = useCallback(async (id) => {
    if (!window.confirm("Excluir esta meta?")) return;
    if (window.db) { try { await window.db.goals.delete(id); } catch (err) { console.error(err); return; } }
    setGoals(prev => prev.filter(g => g.id !== id));
  }, []);

// ── Budget edit ───────────────────────────────────────────
  const saveBudget = useCallback(async (catId) => {
    const val = parseFloat(budgetEdits[catId]);
    if (isNaN(val)) return;
    if (window.db) { try { await window.db.categories.update({ id: catId, budget: val }); } catch (err) { console.error(err); } }
    setCategories(prev => prev.map(c => c.id === catId ? { ...c, budget: val } : c));
    setBudgetEdits(prev => { const n = { ...prev }; delete n[catId]; return n; });
  }, [budgetEdits]);

  const openAddCat = () => {
    setEditTarget(null)
    setCatForm({ name: '', icon: '📦', type: 'expense', color: '#6B7280', budget: '' })
    setShowModal('cat')
  }
  const openEditCat = (c) => {
    setEditTarget(c)
    setCatForm({ ...c, budget: String(c.budget || 0) })
    setShowModal('cat')
  }
  const saveCat = useCallback(async () => {
    if (!catForm.name) return
    const payload = { ...catForm, budget: parseFloat(catForm.budget) || 0 }
    if (editTarget) {
      if (window.db) {
        const saved = await window.db.categories.update({ id: editTarget.id, ...payload })
        setCategories(prev => prev.map(c => c.id === editTarget.id ? saved : c))
      } else {
        setCategories(prev => prev.map(c =>
          c.id === editTarget.id ? { ...payload, id: editTarget.id } : c))
      }
    } else {
      if (window.db) {
        const saved = await window.db.categories.create(payload)
        setCategories(prev => [...prev, saved])
      } else {
        setCategories(prev => [...prev, { ...payload, id: Date.now() }])
      }
    }
    setShowModal(null); setEditTarget(null)
  }, [catForm, editTarget])

  const deleteCat = useCallback(async (id) => {
    if (!window.confirm('Excluir esta categoria? Movimentações perderão a referência.')) return
    if (window.db) await window.db.categories.delete(id)
    setCategories(prev => prev.filter(c => c.id !== id))
  }, [])

  const openAddRec = () => {
  setEditTarget(null)
  const defaultType = 'expense'
  const firstCat = categories.find(c => c.type === defaultType)
  setRecForm({
    description: '', amount: '', type: defaultType,
    category_id: firstCat?.id || categories[0]?.id || 1,
    account_id: accounts[0]?.id || '', day_of_month: 1, tags: '', notes: ''
  })
  setShowModal('rec')
}
  const openEditRec = (r) => {
    setEditTarget(r)
    setRecForm({ ...r, amount: String(r.amount), tags: (r.tags || []).join(', ') })
    setShowModal('rec')
  }
  const saveRec = useCallback(async () => {
    if (!recForm.description || !recForm.amount) return
    if (!recForm.account_id) { 
      alert('Selecione uma conta.')
      return
    }
    const payload = {
      ...recForm,
      amount: parseFloat(recForm.amount),
      day_of_month: parseInt(recForm.day_of_month) || 1,
      tags: recForm.tags ? recForm.tags.split(',').map(t => t.trim()).filter(Boolean) : []
    }
    if (editTarget) {
      if (window.db) {
        const saved = await window.db.recurring.update({ id: editTarget.id, ...payload })
        setRecurring(prev => prev.map(r => r.id === editTarget.id ? saved : r))
      } else {
        setRecurring(prev => prev.map(r => r.id === editTarget.id ? { ...payload, id: editTarget.id } : r))
      }
    } else {
      if (window.db) {
        const saved = await window.db.recurring.create(payload)
        setRecurring(prev => [...prev, saved])
      } else {
        setRecurring(prev => [...prev, { ...payload, id: Date.now() }])
      }
    }
    setShowModal(null); setEditTarget(null)
  }, [recForm, editTarget])

  const deleteRec = useCallback(async (id) => {
    if (!window.confirm('Excluir este lançamento fixo?')) return
    if (window.db) await window.db.recurring.delete(id)
    setRecurring(prev => prev.filter(r => r.id !== id))
  }, [])

// ── Credit Cards CRUD ─────────────────────────────────────────
  const openAddCard = () => {
    setEditTarget(null)
    setCardForm({ name: '', limit_amount: '', closing_day: 10, due_day: 15, account_id: accounts[0]?.id || '', color: '#EC4899' })
    setShowModal('card')
  }
  const openEditCard = (c) => {
    setEditTarget(c)
    setCardForm({ ...c, limit_amount: String(c.limit_amount) })
    setShowModal('card')
  }
  const saveCard = useCallback(async () => {
    if (!cardForm.name) return
    const payload = { ...cardForm, limit_amount: parseFloat(cardForm.limit_amount) || 0, closing_day: parseInt(cardForm.closing_day), due_day: parseInt(cardForm.due_day) }
    if (editTarget) {
      const saved = window.db ? await window.db.creditCards.update({ id: editTarget.id, ...payload }) : { ...payload, id: editTarget.id }
      setCreditCards(prev => prev.map(c => c.id === editTarget.id ? saved : c))
    } else {
      const saved = window.db ? await window.db.creditCards.create(payload) : { ...payload, id: Date.now() }
      setCreditCards(prev => [...prev, saved])
    }
    setShowModal(null); setEditTarget(null)
  }, [cardForm, editTarget])

  const deleteCard = useCallback(async (id) => {
    if (!window.confirm('Excluir este cartão e todos os gastos?')) return
    if (window.db) await window.db.creditCards.delete(id)
    setCreditCards(prev => prev.filter(c => c.id !== id))
    if (selectedCard?.id === id) setSelectedCard(null)
  }, [selectedCard])

  const loadCardExpenses = useCallback(async (cardId, billingMonth) => {
    if (!window.db) return
    const exps = await window.db.creditCardExpenses.list({ card_id: cardId, billing_month: billingMonth })
    setCardExpenses(exps)
  }, [])

  const saveCardExpense = useCallback(async () => {
    if (!cardExpForm.description || !cardExpForm.amount || !selectedCard) return
    const payload = {
      ...cardExpForm,
      card_id: selectedCard.id,
      amount: parseFloat(cardExpForm.amount),
      category_id: cardExpForm.category_id ? +cardExpForm.category_id : null,
      installments: parseInt(cardExpForm.installments) || 1,  // <- adicionar
    }
    if (window.db) {
      await window.db.creditCardExpenses.create(payload)
      await loadCardExpenses(selectedCard.id, selectedBillingMonth)
      const cards = await window.db.creditCards.list()
      setCreditCards(cards)
      setSelectedCard(cards.find(c => c.id === selectedCard.id) || null)
    } else {
      // Modo demo: gera N objetos locais
      const totalInstallments = Math.max(1, parseInt(cardExpForm.installments) || 1)
      const installmentAmount = parseFloat((payload.amount / totalInstallments).toFixed(2))
      const group = totalInstallments > 1 ? `group_${Date.now()}` : ''
      const newExps = Array.from({ length: totalInstallments }, (_, i) => {
        const d = new Date(cardExpForm.date + 'T00:00:00')
        d.setMonth(d.getMonth() + i)
        const billing_month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        return {
          ...payload,
          id: Date.now() + i,
          description: totalInstallments > 1
            ? `${cardExpForm.description} (${i + 1}/${totalInstallments})`
            : cardExpForm.description,
          amount: i === totalInstallments - 1
            ? parseFloat((payload.amount - installmentAmount * (totalInstallments - 1)).toFixed(2))
            : installmentAmount,
          billing_month,
          paid: 0,
          installments: totalInstallments,
          installment_num: i + 1,
          installment_group: group,
        }
      })
      setCardExpenses(prev => [...newExps.filter(e => e.billing_month === selectedBillingMonth), ...prev])
    }
    setShowModal(null)
  }, [cardExpForm, selectedCard, selectedBillingMonth, loadCardExpenses])

  const payBill = useCallback(async () => {
    if (!selectedCard || !window.db) return
    try {
      const result = await window.db.creditCardExpenses.payBill({
        card_id: selectedCard.id,
        billing_month: selectedBillingMonth
      })
      alert(`Fatura paga! Total: ${fmt(result.total)} — vencimento ${fmtDate(result.dueDate)}`)
      
      const [exps, accs, txs] = await Promise.all([
        window.db.creditCardExpenses.list({ card_id: selectedCard.id, billing_month: selectedBillingMonth }),
        window.db.accounts.list(),
        window.db.transactions.list({ month: filterMonth, year: filterYear })
      ])
      setCardExpenses(exps)   // ← atualiza direto, sem depender do loadCardExpenses
      setAccounts(accs)
      setTransactions(txs)
    } catch (err) { alert('Erro: ' + err.message) }
  }, [selectedCard, selectedBillingMonth, filterMonth, filterYear])

// ── Styles ────────────────────────────────────────────────
  const s = {
    app: { display: "flex", height: "100vh", background: "#0D1117", color: "#E6EDF3", fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif", overflow: "hidden", fontSize: 14 },
    sidebar: { width: 220, background: "#161B22", borderRight: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", flexShrink: 0 },
    logo: { padding: "24px 20px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" },
    nav: { flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: 2 },
    navItem: (active) => ({ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: active ? 600 : 400, color: active ? "#8B5CF6" : "#8B949E", background: active ? "rgba(139,92,246,0.12)" : "transparent", transition: "all 0.15s", border: "none", width: "100%", textAlign: "left" }),
    main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
    topbar: { height: 56, background: "#161B22", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", padding: "0 24px", flexShrink: 0 },
    content: { flex: 1, overflow: "auto", padding: 24 },
    card: { background: "#161B22", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 20 },
    cardSm: { background: "#161B22", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 16 },
    label: { fontSize: 11, color: "#6B7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8 },
    value: { fontSize: 26, fontWeight: 700, marginTop: 4, letterSpacing: "-0.5px" },
    sectionTitle: { fontSize: 15, fontWeight: 600, marginBottom: 16, color: "#C9D1D9" },
    btn: (v = "primary") => ({
      padding: v === "sm" ? "6px 14px" : "10px 20px", borderRadius: 8,
      border: v === "ghost" ? "1px solid rgba(255,255,255,0.1)" : "none",
      background: v === "primary" ? "#8B5CF6" : v === "danger" ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.06)",
      color: v === "primary" ? "#fff" : v === "danger" ? "#EF4444" : "#C9D1D9",
      cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s",
    }),
    iconBtn: { background: "none", border: "none", cursor: "pointer", color: "#6B7280", fontSize: 14, padding: "2px 6px", flexShrink: 0 },
    input: { width: "100%", padding: "9px 12px", background: "#0D1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#E6EDF3", fontSize: 13, outline: "none", boxSizing: "border-box" },
    select: { width: "100%", padding: "9px 12px", background: "#0D1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#E6EDF3", fontSize: 13, outline: "none", boxSizing: "border-box" },
    badge: (color) => ({ display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: color + "20", color }),
    tag: { display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 11, background: "rgba(255,255,255,0.06)", color: "#8B949E" },
    modal: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
    modalBox: { background: "#161B22", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: 28, width: 480, maxHeight: "90vh", overflow: "auto" },
    row: { display: "flex", alignItems: "center", justifyContent: "space-between" },
    sep: { height: 1, background: "rgba(255,255,255,0.06)", margin: "12px 0" },
    pill: (color) => ({ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }),
    empty: { textAlign: "center", padding: "60px 0", color: "#6B7280" },
    fr: { marginBottom: 14 },
  };

  const navItems = [
    { id: "dashboard",    label: "Dashboard",     icon: "⊞" },
    { id: "transactions", label: "Movimentações", icon: "↕" },
    { id: "accounts",     label: "Contas",        icon: "🏦" },
    { id: "credit_cards", label: "Cartões",       icon: "💳" },
    { id: "budget",       label: "Orçamento",     icon: "◎" },
    { id: "categories",   label: "Categorias",    icon: "🏷️" },
    { id: "recurring", label: "Fixos / Recorrentes", icon: "🔄" },
    { id: "investments",  label: "Investimentos", icon: "📈" },
    { id: "goals",        label: "Metas",         icon: "🎯" },
    { id: "reports",      label: "Relatórios",    icon: "◫" },
    { id: "calendar",     label: "Calendário",    icon: "▦" },
  ];

  const invTypes = [
    { value: "tesouro_direto", label: "Tesouro Direto" },
    { value: "cdb", label: "CDB" }, { value: "lci", label: "LCI" },
    { value: "lca", label: "LCA" }, { value: "fii", label: "FII" },
    { value: "acoes", label: "Ações" }, { value: "outros", label: "Outros" },
  ];
  const invLabels = { tesouro_direto: "Tesouro Direto", cdb: "CDB", lci: "LCI", lca: "LCA", fii: "FII", acoes: "Ações", outros: "Outros" };
  const invColors = { tesouro_direto: "#10B981", cdb: "#3B82F6", fii: "#F59E0B", acoes: "#8B5CF6", lci: "#06B6D4", lca: "#EC4899", outros: "#6B7280" };
  const swatchColors = ["#8B5CF6","#10B981","#3B82F6","#F59E0B","#EF4444","#EC4899","#06B6D4"];
  const goalIcons = ["🎯","✈️","🏠","🚗","💻","📚","🛡️","💍","🏖️","🎓"];

  const closeModal = () => { setShowModal(null); setEditTarget(null); };

// ── PAGES ─────────────────────────────────────────────────
  const pages = {

    // DASHBOARD
    dashboard: (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={s.row}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.5px" }}>Visão Geral</div>
            <div style={{ color: "#6B7280", fontSize: 13, marginTop: 2 }}>{monthNames[filterMonth]} {filterYear}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <select style={{ ...s.select, width: "auto" }} value={filterMonth} onChange={e => setFilterMonth(+e.target.value)}>
              {monthNames.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select style={{ ...s.select, width: "auto" }} value={filterYear} onChange={e => setFilterYear(+e.target.value)}>
              {Array.from({ length: 5 }, (_, i) => thisYear - 2 + i).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button style={s.btn("primary")} onClick={openAddTx}>+ Lançamento</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {[
            { label: "Saldo Total", value: fmt(totalBalance), color: "#8B5CF6", icon: "💳" },
            { label: "Receitas do Mês", value: fmt(totalIncome), color: "#10B981", icon: "⬆" },
            { label: "Despesas do Mês", value: fmt(totalExpense), color: "#EF4444", icon: "⬇" },
            { label: "Patrimônio Total", value: fmtCompact(netWorth), color: "#F59E0B", icon: "🏦" },
          ].map((kpi, i) => (
            <div key={i} style={{ ...s.cardSm, borderTop: `3px solid ${kpi.color}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                <div style={s.label}>{kpi.label}</div>
                <span style={{ fontSize: 20 }}>{kpi.icon}</span>
              </div>
              <div style={{ ...s.value, color: kpi.color, fontSize: 22 }}>{kpi.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={s.card}>
            <div style={{ ...s.row, marginBottom: 16 }}>
              <div style={s.sectionTitle}>Contas e Carteiras</div>
              <button style={s.btn("ghost")} onClick={() => setPage("accounts")}>Ver todas →</button>
            </div>
            {accounts.length === 0
              ? <div style={{ color: "#6B7280", fontSize: 13 }}>Nenhuma conta. <button style={{ background: "none", border: "none", color: "#8B5CF6", cursor: "pointer", fontSize: 13 }} onClick={openAddAcc}>Adicionar →</button></div>
              : accounts.slice(0, 4).map(a => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: a.color + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
                    {a.type === "checking" ? "🏦" : a.type === "savings" ? "🐷" : a.type === "investment" ? "📈" : "👛"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{a.name}</div>
                    <div style={{ fontSize: 11, color: "#6B7280" }}>{a.bank}</div>
                  </div>
                  <div style={{ fontWeight: 700, color: a.color }}>{fmt(a.balance)}</div>
                </div>
              ))
            }
          </div>

          <div style={s.card}>
            <div style={s.sectionTitle}>Despesas por Categoria</div>
            {expByCategory.length === 0
              ? <div style={{ color: "#6B7280", fontSize: 13 }}>Sem despesas neste mês.</div>
              : <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                  <DonutChart segments={expByCategory.slice(0, 5).map(c => ({ value: c.total, color: c.color }))} size={100} />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                    {expByCategory.slice(0, 5).map(c => (
                      <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={s.pill(c.color)} />
                        <span style={{ flex: 1, fontSize: 12 }}>{c.name}</span>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{fmt(c.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
            }
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
          <div style={s.card}>
            <div style={s.sectionTitle}>Evolução — últimos 6 meses</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120 }}>
              {monthlyTrend.map((m, i) => {
                const maxVal = Math.max(...monthlyTrend.map(x => Math.max(x.income, x.expense)), 1);
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 100 }}>
                      <div style={{ width: 10, height: `${(m.income / maxVal) * 100}%`, background: "#10B981", borderRadius: "3px 3px 0 0", minHeight: 2 }} />
                      <div style={{ width: 10, height: `${(m.expense / maxVal) * 100}%`, background: "#EF4444", borderRadius: "3px 3px 0 0", minHeight: 2 }} />
                    </div>
                    <div style={{ fontSize: 10, color: "#6B7280" }}>{m.label}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 11, color: "#6B7280" }}>
              <span><span style={{ display: "inline-block", width: 8, height: 8, background: "#10B981", borderRadius: 2, marginRight: 4 }} />Receitas</span>
              <span><span style={{ display: "inline-block", width: 8, height: 8, background: "#EF4444", borderRadius: 2, marginRight: 4 }} />Despesas</span>
            </div>
          </div>
          <div style={s.card}>
            <div style={s.sectionTitle}>Últimas movimentações</div>
            {filteredTx.length === 0
              ? <div style={{ color: "#6B7280", fontSize: 13 }}>Nenhuma movimentação neste mês.</div>
              : filteredTx.slice(0, 5).map(t => {
                  const c = cat(t.category_id);
                  return (
                    <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: (c?.color || "#6B7280") + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{c?.icon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.description}</div>
                        <div style={{ fontSize: 11, color: "#6B7280" }}>{fmtDate(t.date)}</div>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: t.type === "income" ? "#10B981" : "#EF4444", flexShrink: 0 }}>
                        {t.type === "income" ? "+" : "-"}{fmt(t.amount)}
                      </div>
                    </div>
                  );
                })
            }
          </div>
        </div>

        {goals.length > 0 && (
          <div style={s.card}>
            <div style={{ ...s.row, marginBottom: 16 }}>
              <div style={s.sectionTitle}>Metas Financeiras</div>
              <button style={s.btn("ghost")} onClick={() => setPage("goals")}>Ver todas →</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {goals.slice(0, 4).map(g => {
                const pct = g.target ? (g.current / g.target) * 100 : 0;
                return (
                  <div key={g.id} style={{ ...s.cardSm, background: "#0D1117" }}>
                    <div style={{ fontSize: 22, marginBottom: 8 }}>{g.icon}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{g.name}</div>
                    <MiniBar pct={pct} color={g.color} />
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11 }}>
                      <span style={{ color: g.color, fontWeight: 700 }}>{fmtPct(pct)}</span>
                      <span style={{ color: "#6B7280" }}>{fmt(g.current)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    ),

    // TRANSACTIONS
    transactions: (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={s.row}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.5px" }}>Movimentações</div>
          <button style={s.btn("ghost")} onClick={() => {
              setAporteForm({ account_id: accounts[0]?.id || '', investment_id: investments[0]?.id || '', amount: '', description: 'Aporte', date: new Date().toISOString().split('T')[0], notes: '' })
              setShowAporteModal(true)
            }}>💸 Aportar conta → investimento</button>
          <button style={s.btn("primary")} onClick={openAddTx}>+ Nova movimentação</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { label: "Receitas", value: fmt(totalIncome), color: "#10B981" },
            { label: "Despesas", value: fmt(totalExpense), color: "#EF4444" },
            { label: "Saldo do Mês", value: fmt(totalIncome - totalExpense), color: totalIncome >= totalExpense ? "#10B981" : "#EF4444" },
          ].map((k, i) => (
            <div key={i} style={{ ...s.cardSm, textAlign: "center" }}>
              <div style={s.label}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>
        {/* Lançamentos pendentes / futuros */}
        {(() => {
          const pending = transactions.filter(t => t.status === 'pending')
          if (!pending.length) return null
          return (
            <div style={{ ...s.card, borderLeft: '4px solid #F59E0B' }}>
              <div style={{ ...s.sectionTitle, color: '#F59E0B' }}>⏳ Lançamentos Futuros / Pendentes</div>
              {pending.map(t => {
                const c = cat(t.category_id)
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center',
                    gap: 12, padding: '10px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8,
                      background: (c?.color || '#6B7280') + '20',
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 16 }}>{c?.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{t.description}</div>
                      <div style={{ fontSize: 11, color: '#6B7280' }}>
                        Vence: {t.due_date ? fmtDate(t.due_date) : fmtDate(t.date)}
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14,
                      color: t.type === 'income' ? '#10B981' : '#EF4444' }}>
                      {t.type === 'income' ? '+' : '-'}{fmt(t.amount)}
                    </div>
                    <button style={{ ...s.btn('primary'), padding: '6px 12px', fontSize: 12 }}
                      onClick={async () => {
                        if (window.db) {
                          const saved = await window.db.transactions.confirm(t.id)
                          setTransactions(prev => prev.map(x => x.id === t.id ? saved : x))
                          const accs = await window.db.accounts.list()
                          setAccounts(accs)
                        } else {
                          setTransactions(prev => prev.map(x =>
                            x.id === t.id ? { ...x, status: 'done' } : x))
                        }
                      }}>✓ Confirmar</button>
                    <button onClick={() => deleteTx(t.id)}
                      style={{ ...s.iconBtn, color: '#EF4444' }}>✕</button>
                  </div>
                )
              })}
            </div>
          )
        })()}
        <div style={{ display: "flex", gap: 10 }}>
          <input style={{ ...s.input, flex: 1 }} placeholder="🔍  Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
          <select style={{ ...s.select, width: "auto" }} value={filterMonth} onChange={e => setFilterMonth(+e.target.value)}>
            {monthNames.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select style={{ ...s.select, width: "auto" }} value={filterYear} onChange={e => setFilterYear(+e.target.value)}>
            {Array.from({ length: 5 }, (_, i) => thisYear - 2 + i).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={s.card}>
          {filteredTx.length === 0
            ? <div style={s.empty}>{accounts.length === 0 ? "Cadastre uma conta antes de adicionar movimentações." : "Nenhuma movimentação encontrada."}</div>
            : filteredTx.map((t, idx) => {
                const c = cat(t.category_id), a = acc(t.account_id);
                return (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: idx < filteredTx.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: (c?.color || "#6B7280") + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{c?.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{t.description}</div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 3 }}>
                        <span style={{ fontSize: 11, color: "#6B7280" }}>{fmtDate(t.date)}</span>
                        <span style={s.badge(c?.color || "#6B7280")}>{c?.name}</span>
                        {a && <span style={{ fontSize: 11, color: "#6B7280" }}>{a.name}</span>}
                        {(Array.isArray(t.tags) ? t.tags : []).map(tag => <span key={tag} style={s.tag}>{tag}</span>)}
                      </div>
                    </div>
                    <div style={{fontWeight: 700, fontSize: 15, flexShrink: 0, color: t.type === 'income' ? '#10B981': t.type === 'transfer' ? '#F59E0B': '#EF4444'}}>
                      {t.type === 'income' ? '+' : t.type === 'transfer' ? '↔' : '-'}{fmt(t.amount)}
                    </div>
                    <button onClick={() => openEditTx(t)} style={s.iconBtn} title="Editar">✏️</button>
                    <button onClick={() => deleteTx(t.id)} style={{ ...s.iconBtn, color: "#EF4444" }} title="Excluir">✕</button>
                  </div>
                );
              })
          }
        </div>
      </div>
    ),

    // ACCOUNTS
    accounts: (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={s.row}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.5px" }}>Contas e Carteiras</div>
          <button style={s.btn("primary")} onClick={openAddAcc}>+ Nova conta</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { label: "Contas / Carteiras", value: fmt(accounts.filter(a => a.type !== "investment").reduce((s, a) => s + a.balance, 0)), color: "#8B5CF6" },
            { label: "Contas de Invest.", value: fmt(accounts.filter(a => a.type === "investment").reduce((s, a) => s + a.balance, 0)), color: "#3B82F6" },
            { label: "Total Consolidado", value: fmt(totalBalance), color: "#10B981" },
          ].map((k, i) => (
            <div key={i} style={{ ...s.cardSm, borderTop: `3px solid ${k.color}` }}>
              <div style={s.label}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>
        {accounts.length === 0
          ? <div style={{ ...s.card, ...s.empty }}>Nenhuma conta cadastrada. Clique em "+ Nova conta" para começar.</div>
          : accounts.map(a => (
              <div key={a.id} style={{ ...s.card, display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: a.color + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                  {a.type === "checking" ? "🏦" : a.type === "savings" ? "🐷" : a.type === "investment" ? "📈" : "👛"}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{a.name}</div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                    {a.bank} · {a.type === "checking" ? "Conta Corrente" : a.type === "savings" ? "Poupança" : a.type === "investment" ? "Investimento" : "Carteira"}
                  </div>
                </div>
                <div style={{ fontWeight: 700, fontSize: 20, color: a.color }}>{fmt(a.balance)}</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => openEditAcc(a)} style={s.iconBtn} title="Editar">✏️</button>
                  <button onClick={() => deleteAcc(a.id)} style={{ ...s.iconBtn, color: "#EF4444" }} title="Excluir">✕</button>
                </div>
              </div>
            ))
        }
      </div>
    ),

    // CREDIT CARDS
    credit_cards: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={s.row}>          
          <div style={{ fontSize: 22, fontWeight: 700 }}>Cartões de Crédito<div style={{ fontWeight: 400, fontSize: 10, color: '#6B7280'}}>Necessário recarregar a página após pagar a fatura para atualizar limite disponível</div></div>
          <button style={s.btn('primary')} onClick={openAddCard}>+ Novo cartão</button>
        </div>

        {/* Grid de cartões */}
        {creditCards.length === 0
          ? <div style={{ ...s.card, ...s.empty }}>Nenhum cartão cadastrado.</div>
          : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {creditCards.map(card => {
                const a = acc(card.account_id)
                // calcula total gasto na fatura do mês selecionado
                const cardTotal = cardExpenses
                  .filter(e => e.card_id === card.id && !e.paid)
                  .reduce((s, e) => s + e.amount, 0)
                const available = card.limit_amount - (selectedCard?.id === card.id ? cardTotal : 0)
                return (
                  <div key={card.id} onClick={() => { setSelectedCard(card); loadCardExpenses(card.id, selectedBillingMonth) }}
                    style={{ ...s.card, borderTop: `4px solid ${card.color}`, cursor: 'pointer',
                      outline: selectedCard?.id === card.id ? `2px solid ${card.color}` : 'none' }}>                    
                    <div style={s.row}>                      
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{card.name}</div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={e => { e.stopPropagation(); openEditCard(card) }} style={s.iconBtn}>✏️</button>
                        <button onClick={e => { e.stopPropagation(); deleteCard(card.id) }} style={{ ...s.iconBtn, color: '#EF4444' }}>✕</button>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
                      Fecha dia {card.closing_day} · Vence dia {card.due_day}
                    </div>
                    {a && <div style={{ fontSize: 12, color: '#6B7280' }}>Débito: {a.name}</div>}
                    <div style={{ marginTop: 10 }}>
                      <div style={s.label}>Limite disponível / total</div>
                      <div style={{ fontWeight: 700, color: card.color }}>
                        {fmt(card.limit_amount)}
                        <span style={{ fontSize: 12, color: '#6B7280', fontWeight: 400 }}>
                          {' '}/ {fmt(card.limit_total || card.limit_amount)}
                        </span>
                      </div>
                      <MiniBar
                        pct={card.limit_total ? ((card.limit_total - card.limit_amount) / card.limit_total) * 100 : 0}
                        color={card.color}
                      />
                      <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>
                        {fmt(card.limit_total - card.limit_amount)} utilizado
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
        }

        {/* Detalhe da fatura */}
        {selectedCard && (
          <div style={s.card}>
            <div style={s.row}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                Fatura — {selectedCard.name}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type='month' value={selectedBillingMonth}
                  onChange={e => { setSelectedBillingMonth(e.target.value); loadCardExpenses(selectedCard.id, e.target.value) }}
                  style={{ ...s.input, width: 160 }} />
                <button style={s.btn('primary')} onClick={() => {
                  setCardExpForm({ description: '', amount: '', category_id: categories[0]?.id || '', date: new Date().toISOString().split('T')[0], notes: '', installments: 1 })
                  setShowModal('cardExp')
                }}>+ Gasto</button>
                <button style={{ ...s.btn('ghost'), borderColor: '#10B981', color: '#10B981' }} onClick={payBill}>
                  💰 Pagar fatura
                </button>
              </div>
            </div>

            {/* Totais da fatura */}
            {(() => {
              const total = cardExpenses.reduce((s, e) => s + e.amount, 0)
              const paid = cardExpenses.filter(e => e.paid).reduce((s, e) => s + e.amount, 0)
              const pending = total - paid
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, margin: '16px 0' }}>
                  {[
                    { label: 'Total da fatura', value: fmt(total), color: '#EF4444' },
                    { label: 'Já pago', value: fmt(paid), color: '#10B981' },
                    { label: 'Pendente', value: fmt(pending), color: '#F59E0B' },
                  ].map((k, i) => (
                    <div key={i} style={{ ...s.cardSm, background: '#0D1117', textAlign: 'center' }}>
                      <div style={s.label}>{k.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: k.color, marginTop: 4 }}>{k.value}</div>
                    </div>
                  ))}
                </div>
              )
            })()}

            {/* Lista de gastos */}
            {cardExpenses.length === 0
              ? <div style={{ color: '#6B7280', textAlign: 'center', padding: '24px 0' }}>Nenhum gasto nesta fatura.</div>
              : cardExpenses.map((e, idx) => {
                  const c = cat(e.category_id)
                  return (
                    <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                      borderBottom: idx < cardExpenses.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                      opacity: e.paid ? 0.5 : 1 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 8, background: (c?.color || '#6B7280') + '20',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{c?.icon || '💳'}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{e.description}</div>
                        <div style={{ fontSize: 11, color: '#6B7280' }}>{fmtDate(e.date)} {c && `· ${c.name}`}{e.installments > 1 && ` · Parcela ${e.installment_num}/${e.installments}`}{e.paid ? ' · ✅ pago' : ''}</div>
                      </div>
                      <div style={{ fontWeight: 700, color: '#EF4444' }}>{fmt(e.amount)}</div>
                      {!e.paid && (
                        <button onClick={async () => {
                          if (window.db) await window.db.creditCardExpenses.delete(e.id)
                          setCardExpenses(prev => prev.filter(x => x.id !== e.id))
                        }} style={{ ...s.iconBtn, color: '#EF4444' }}>✕</button>
                      )}
                    </div>
                  )
                })
            }
          </div>
        )}
      </div>
    ),

    // BUDGET
    budget: (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={s.row}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.5px" }}>Orçamento Mensal</div>
            <div style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>{monthNames[filterMonth]} {filterYear}</div>
          </div>
          <select style={{ ...s.select, width: "auto" }} value={filterMonth} onChange={e => setFilterMonth(+e.target.value)}>
            {monthNames.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select style={{ ...s.select, width: "auto" }} value={filterYear} onChange={e => setFilterYear(+e.target.value)}>
            {Array.from({ length: 5 }, (_, i) => thisYear - 2 + i).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {(() => {
          const budgetTotal = categories.filter(c => c.type === "expense").reduce((s, c) => s + (c.budget || 0), 0);
          return (
            <div style={{ ...s.card, background: "linear-gradient(135deg,#1A1F2E,#161B22)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, textAlign: "center" }}>
                {[
                  { label: "Orçado Total", value: fmt(budgetTotal), color: "#8B5CF6" },
                  { label: "Gasto até agora", value: fmt(totalExpense), color: "#EF4444" },
                  { label: "Disponível", value: fmt(Math.max(0, budgetTotal - totalExpense)), color: "#10B981" },
                ].map((item, i) => (
                  <div key={i}>
                    <div style={s.label}>{item.label}</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: item.color, marginTop: 6 }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
        <div style={s.card}>
          <div style={{ ...s.row, marginBottom: 16 }}>
            <div style={s.sectionTitle}>Orçamento por Categoria</div>
            <div style={{ fontSize: 12, color: "#6B7280" }}>Clique no valor para editar · Enter para salvar</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {categories.filter(c => c.type === "expense").map(c => {
              const spent = expByCategory.find(e => e.id === c.id)?.total || 0;
              const pct = c.budget ? (spent / c.budget) * 100 : 0;
              const isEditing = budgetEdits[c.id] !== undefined;
              return (
                <div key={c.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span>{c.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</span>
                      {pct > 90 && <span style={s.badge("#EF4444")}>⚠ estouro</span>}
                      {pct > 70 && pct <= 90 && <span style={s.badge("#F59E0B")}>atenção</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12, color: "#EF4444", fontWeight: 600 }}>{fmt(spent)}</span>
                      <span style={{ color: "#6B7280", fontSize: 12 }}>/</span>
                      {isEditing ? (
                        <>
                          <input type="number" value={budgetEdits[c.id]} autoFocus
                            onChange={e => setBudgetEdits(prev => ({ ...prev, [c.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === "Enter") saveBudget(c.id); if (e.key === "Escape") setBudgetEdits(prev => { const n = {...prev}; delete n[c.id]; return n; }); }}
                            style={{ ...s.input, width: 100, padding: "4px 8px" }} />
                          <button onClick={() => saveBudget(c.id)} style={{ ...s.btn("primary"), padding: "4px 10px", fontSize: 12 }}>✓</button>
                          <button onClick={() => setBudgetEdits(prev => { const n = {...prev}; delete n[c.id]; return n; })} style={{ ...s.btn("ghost"), padding: "4px 10px", fontSize: 12 }}>✕</button>
                        </>
                      ) : (
                        <button onClick={() => setBudgetEdits(prev => ({ ...prev, [c.id]: String(c.budget || 0) }))}
                          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#C9D1D9", cursor: "pointer", padding: "4px 10px", fontSize: 12, fontWeight: 600 }}>
                          {fmt(c.budget || 0)} ✏️
                        </button>
                      )}
                    </div>
                  </div>
                  <MiniBar pct={pct} color={c.color} />
                  {c.budget > 0 && <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>{fmtPct(pct)} utilizado</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    ),

    // CATEGORIAS
    categories: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={s.row}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Categorias</div>
          <button style={s.btn('primary')} onClick={openAddCat}>+ Nova categoria</button>
        </div>
        {['expense', 'income'].map(tipo => (
          <div key={tipo} style={s.card}>
            <div style={s.sectionTitle}>
              {tipo === 'expense' ? '📤 Despesas' : '📥 Receitas'}
            </div>
            {categories.filter(c => c.type === tipo).map(c => (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)'
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: c.color + '20', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: 18
                }}>{c.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{c.name}</div>
                  {c.budget > 0 && (
                    <div style={{ fontSize: 11, color: '#6B7280' }}>
                      Orçamento: {fmt(c.budget)}
                    </div>
                  )}
                </div>
                <div style={s.pill(c.color)} />
                <button onClick={() => openEditCat(c)} style={s.iconBtn}>✏️</button>
                <button onClick={() => deleteCat(c.id)}
                  style={{ ...s.iconBtn, color: '#EF4444' }}>✕</button>
              </div>
            ))}
          </div>
        ))}
      </div>
    ),

    // RECORRENTES
    recurring: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={s.row}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Lançamentos Fixos / Recorrentes</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {window.db && (
              <button style={s.btn('ghost')} onClick={async () => {
                const news = await window.db.recurring.generateForMonth({
                  month: filterMonth, year: filterYear
                  })
                  if (news.length) {
                  const done = news.filter(t => t.status === 'done').length
                  const pending = news.filter(t => t.status === 'pending').length
                  const parts = []
                    if (done) parts.push(`${done} efetivado(s)`)
                    if (pending) parts.push(`${pending} pendente(s)`)
                      alert(`${news.length} lançamento(s) gerado(s): ${parts.join(', ')}.`)
                  // Recarrega contas para refletir saldos atualizados
                  const accs = await window.db.accounts.list()
                  setAccounts(accs)
                  setTransactions(prev => [...news, ...prev])
                } else {
                  alert('Nenhum lançamento novo para gerar neste mês.')
                }
              }}>⚡ Gerar pendentes ({monthNames[filterMonth]})</button>
            )}
            <button style={s.btn('primary')} onClick={openAddRec}>+ Novo fixo</button>
          </div>
        </div>
        {recurring.length === 0
          ? <div style={{ ...s.card, ...s.empty }}>Nenhum lançamento fixo cadastrado.</div>
          : recurring.map(r => {
              const c = cat(r.category_id)
              const a = acc(r.account_id)
              return (
                <div key={r.id} style={{ ...s.card, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: (c?.color || '#6B7280') + '20',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20
                  }}>{c?.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{r.description}</div>
                    <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
                      Dia {r.day_of_month} · {c?.name} · {a?.name}
                    </div>
                  </div>
                  <div style={{
                    fontWeight: 700, fontSize: 16,
                    color: r.type === 'income' ? '#10B981' : '#EF4444'
                  }}>
                    {r.type === 'income' ? '+' : '-'}{fmt(r.amount)}
                  </div>
                  <button onClick={() => openEditRec(r)} style={s.iconBtn}>✏️</button>
                  <button onClick={() => deleteRec(r.id)}
                    style={{ ...s.iconBtn, color: '#EF4444' }}>✕</button>
                </div>
              )
            })
        }
      </div>
    ),

    // INVESTMENTS
    investments: (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={s.row}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.5px" }}>Investimentos</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={s.btn("ghost")} onClick={() => {
              setAporteForm({ account_id: accounts[0]?.id || '', investment_id: investments[0]?.id || '', amount: '', description: 'Aporte', date: new Date().toISOString().split('T')[0], notes: '' })
              setShowAporteModal(true)
            }}>💸 Aportar conta → investimento</button>
            <button style={s.btn("primary")} onClick={openAddInv}>+ Novo investimento</button>
          </div>
        </div>
        {(() => {
          const totalAplic = investments.reduce((s, i) => s + i.invested, 0);
          const totalAtual = investments.reduce((s, i) => s + i.current, 0);
          const gain = totalAtual - totalAplic;
          const rentPct = totalAplic ? ((totalAtual / totalAplic) - 1) * 100 : 0;
          return (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
              {[
                { label: "Total Aplicado", value: fmt(totalAplic), color: "#3B82F6" },
                { label: "Valor Atual", value: fmt(totalAtual), color: "#8B5CF6" },
                { label: "Rendimento", value: fmt(gain), color: "#10B981" },
                { label: "Rentabilidade", value: fmtPct(rentPct), color: "#F59E0B" },
              ].map((item, i) => (
                <div key={i} style={{ ...s.cardSm, borderTop: `3px solid ${item.color}` }}>
                  <div style={s.label}>{item.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>
          );
        })()}
        {investments.length === 0
          ? <div style={{ ...s.card, ...s.empty }}>Nenhum investimento cadastrado. Clique em "+ Novo investimento" para começar.</div>
          : <div style={s.card}>
              <div style={s.sectionTitle}>Carteira de Investimentos</div>
              {investments.map((inv, idx) => {
                const gain = inv.current - inv.invested;
                const pct = inv.invested ? ((inv.current / inv.invested) - 1) * 100 : 0;
                const color = invColors[inv.type] || "#6B7280";
                return (
                  <div key={inv.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto auto", gap: 16, alignItems: "center", padding: "14px 0", borderBottom: idx < investments.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{inv.name}</div>
                      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                        <span style={s.badge(color)}>{invLabels[inv.type] || inv.type}</span>
                        {inv.rate > 0 && <span style={{ fontSize: 11, color: "#6B7280" }}>{inv.rate} {inv.rate_type}</span>}
                        {inv.maturity && <span style={{ fontSize: 11, color: "#6B7280" }}>venc. {fmtDate(inv.maturity)}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: "#6B7280" }}>Aplicado</div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{fmt(inv.invested)}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: "#6B7280" }}>Atual</div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{fmt(inv.current)}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: "#6B7280" }}>Rendimento</div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: gain >= 0 ? "#10B981" : "#EF4444" }}>
                        {gain >= 0 ? "+" : ""}{fmt(gain)} ({fmtPct(pct)})
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => openEditInv(inv)} style={s.iconBtn} title="Editar">✏️</button>
                      <button onClick={() => deleteInv(inv.id)} style={{ ...s.iconBtn, color: "#EF4444" }} title="Excluir">✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
        }
        <InvestmentSimulator s={s} />
      </div>
    ),

    // GOALS
    goals: (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={s.row}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.5px" }}>Metas Financeiras</div>
          <button style={s.btn("primary")} onClick={openAddGoal}>+ Nova meta</button>
        </div>
        {goals.length === 0
          ? <div style={{ ...s.card, ...s.empty }}>Nenhuma meta cadastrada. Clique em "+ Nova meta" para começar.</div>
          : <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {goals.map(g => {
                const pct = g.target ? (g.current / g.target) * 100 : 0;
                const daysLeft = g.deadline ? Math.max(0, Math.floor((new Date(g.deadline) - new Date()) / 86400000)) : null;
                const monthlySave = (daysLeft && daysLeft > 30) ? ((g.target - g.current) / (daysLeft / 30)) : 0;
                return (
                  <div key={g.id} style={{ ...s.card, borderLeft: `4px solid ${g.color}` }}>
                    <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", marginBottom: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ fontSize: 28 }}>{g.icon}</div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 15 }}>{g.name}</div>
                          {daysLeft !== null && <div style={{ fontSize: 12, color: "#6B7280" }}>Prazo: {fmtDate(g.deadline)} · {daysLeft} dias</div>}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={() => openEditGoal(g)} style={s.iconBtn} title="Editar">✏️</button>
                        <button onClick={() => deleteGoal(g.id)} style={{ ...s.iconBtn, color: "#EF4444" }} title="Excluir">✕</button>
                      </div>
                    </div>
                    <MiniBar pct={pct} color={g.color} />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 14 }}>
                      <div><div style={s.label}>Acumulado</div><div style={{ fontWeight: 700, color: g.color, fontSize: 15, marginTop: 2 }}>{fmt(g.current)}</div></div>
                      <div><div style={s.label}>Meta</div><div style={{ fontWeight: 700, fontSize: 15, marginTop: 2 }}>{fmt(g.target)}</div></div>
                      <div><div style={s.label}>Falta</div><div style={{ fontWeight: 700, fontSize: 15, marginTop: 2, color: "#EF4444" }}>{fmt(Math.max(0, g.target - g.current))}</div></div>
                    </div>
                    {monthlySave > 0 && (
                      <div style={{ marginTop: 12, padding: "8px 12px", background: g.color + "15", borderRadius: 8, fontSize: 12, color: g.color }}>
                        💡 Poupe {fmt(monthlySave)}/mês para atingir no prazo
                      </div>
                    )}
                    <div style={{ fontSize: 18, fontWeight: 700, color: g.color, marginTop: 12 }}>{fmtPct(pct)}</div>
                  </div>
                );
              })}
            </div>
        }
      </div>
    ),

    // REPORTS
    reports: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={s.row}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Relatórios</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={s.label}>De</div>
            <input style={{ ...s.input, width: 140 }} type='date'
              value={reportFrom} onChange={e => setReportFrom(e.target.value)} />
            <div style={s.label}>Até</div>
            <input style={{ ...s.input, width: 140 }} type='date'
              value={reportTo} onChange={e => setReportTo(e.target.value)} />
            <button style={s.btn('primary')} onClick={async () => {
              if (!window.db) {alert('Banco de dados não disponível no modo demo.')
                return}
              setReportLoading(true)
              setReportData(null)
              try {
                const data = await window.db.reports.byRange({ from: reportFrom, to: reportTo })
                setReportData(data)
              } catch (err) {
                console.error('reports:byRange error:', err)
                alert('Erro ao gerar relatório: ' + err.message)
              } finally {
                setReportLoading(false)
              }
            }}>🔍 Gerar</button>
          </div>
        </div>
        {reportLoading && <div style={{ color: '#8B5CF6' }}>Carregando...</div>}
        {/* Cards de totais do período */}
        {reportData && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {[
              { label: 'Receitas no período', value: fmt(reportData.income), color: '#10B981' },
              { label: 'Despesas no período', value: fmt(reportData.expense), color: '#EF4444' },
              { label: 'Resultado', value: fmt(reportData.income - reportData.expense),
                color: reportData.income >= reportData.expense ? '#10B981' : '#EF4444' },
            ].map((k, i) => (
              <div key={i} style={{ ...s.cardSm, borderTop: `3px solid ${k.color}` }}>
                <div style={s.label}>{k.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={s.card}>
            <div style={s.sectionTitle}>Fluxo de Caixa — últimos 6 meses</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 140 }}>
              {monthlyTrend.map((m, i) => {
                const maxVal = Math.max(...monthlyTrend.map(x => Math.max(x.income, x.expense)), 1);
                const bal = m.income - m.expense;
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ width: "100%", height: Math.abs(bal) / maxVal * 110, background: bal >= 0 ? "#10B981" : "#EF4444", borderRadius: "3px 3px 0 0", minHeight: 2 }} />
                    <div style={{ fontSize: 9, color: "#6B7280" }}>{m.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={s.card}>
            <div style={s.sectionTitle}>Composição do Patrimônio</div>
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <DonutChart segments={[{ value: Math.max(0, totalBalance), color: "#8B5CF6" }, { value: Math.max(0, totalInvested), color: "#3B82F6" }]} size={110} />
              <div>
                {[{ label: "Contas/Carteiras", value: totalBalance, color: "#8B5CF6" }, { label: "Investimentos", value: totalInvested, color: "#3B82F6" }].map((item, i) => (
                  <div key={i} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={s.pill(item.color)} /><span style={{ fontSize: 12, color: "#6B7280" }}>{item.label}</span></div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: item.color, marginTop: 2 }}>{fmt(item.value)}</div>
                  </div>
                ))}
                <div style={s.sep} />
                <div style={{ fontSize: 11, color: "#6B7280" }}>Patrimônio total</div>
                <div style={{ fontWeight: 700, fontSize: 18, marginTop: 2 }}>{fmt(netWorth)}</div>
              </div>
            </div>
          </div>
          {expByCategory.length > 0 && (
            <div style={{ ...s.card, gridColumn: "1 / -1" }}>
              <div style={s.sectionTitle}>Análise de Despesas — {monthNames[filterMonth]}</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    {["Categoria","Gasto","Orçamento","Saldo","% uso"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: "#6B7280", fontWeight: 600, fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {expByCategory.map(c => {
                    const saldo = (c.budget || 0) - c.total;
                    return (
                      <tr key={c.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <td style={{ padding: "10px 8px" }}><span style={{ marginRight: 8 }}>{c.icon}</span>{c.name}</td>
                        <td style={{ padding: "10px 8px", fontWeight: 600, color: "#EF4444" }}>{fmt(c.total)}</td>
                        <td style={{ padding: "10px 8px", color: "#6B7280" }}>{fmt(c.budget || 0)}</td>
                        <td style={{ padding: "10px 8px", color: saldo >= 0 ? "#10B981" : "#EF4444", fontWeight: 600 }}>{fmt(saldo)}</td>
                        <td style={{ padding: "10px 8px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <MiniBar pct={c.pct} color={c.color} />
                            <span style={{ fontSize: 11, minWidth: 36 }}>{fmtPct(c.pct)}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    ),

    // CALENDAR
    calendar: (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={s.row}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.5px" }}>Calendário Financeiro</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button style={{ ...s.btn("ghost"), padding: "8px 14px" }} onClick={() => { const d = new Date(calYear, calMonth - 1, 1); setCalMonth(d.getMonth()); setCalYear(d.getFullYear()); }}>← Anterior</button>
            <div style={{ fontWeight: 600, fontSize: 15, minWidth: 140, textAlign: "center" }}>{monthNames[calMonth]} {calYear}</div>
            <button style={{ ...s.btn("ghost"), padding: "8px 14px" }} onClick={() => { const d = new Date(calYear, calMonth + 1, 1); setCalMonth(d.getMonth()); setCalYear(d.getFullYear()); }}>Próximo →</button>
          </div>
        </div>
        <CalendarView transactions={calTx} categories={categories} s={s} month={calMonth} year={calYear} />
      </div>
    ),
  };

  return (
    <div style={s.app}>
      {/* Sidebar */}
      <div style={s.sidebar}>
        <div style={s.logo}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#8B5CF6", letterSpacing: "-0.5px" }}>💜 FinanceOS</div>
          <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>Controle Financeiro Pessoal</div>
        </div>
        <nav style={s.nav}>
          {navItems.map(item => (
            <button key={item.id} style={s.navItem(page === item.id)} onClick={() => setPage(item.id)}>
              <span style={{ fontSize: 16, width: 18, textAlign: "center" }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div style={{ padding: "16px 20px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 6 }}>Patrimônio total</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#8B5CF6" }}>{fmtCompact(netWorth)}</div>
        </div>
      </div>

      {/* Main */}
      <div style={s.main}>
        <div style={s.topbar}>
          <div style={{ fontSize: 14, color: "#6B7280", flex: 1 }}>
            {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
          </div>
          <div style={{ fontSize: 13, color: "#6B7280", display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: window.db ? (dbReady ? "#10B981" : "#F59E0B") : "#6B7280", display: "inline-block" }} />
            {window.db ? (dbReady ? "Banco local conectado" : "Conectando...") : "Modo demo"}
          </div>
        </div>
        <div style={s.content}>
          {dbError && <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "10px 16px", marginBottom: 16, color: "#EF4444", fontSize: 13 }}>⚠ Erro no banco: {dbError}</div>}
          {pages[page]}
        </div>
      </div>

      {/* Modal — Transação */}
      {showModal === "tx" && (
        <div style={s.modal} onClick={closeModal}>
          <div style={s.modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 20 }}>{editTarget ? "Editar Movimentação" : "Nova Movimentação"}</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {["expense","income","transfer"].map(type => (
                <button key={type} onClick={() => setTxForm(f => ({ ...f, type }))} style={{ ...s.btn(txForm.type === type ? "primary" : "ghost"), flex: 1, justifyContent: "center" }}>
                  {type === "expense" ? "📤 Despesa" : type === "income" ? "📥 Receita" : "↔ Transf."}
                </button>
              ))}
            </div>
            {[
              { label: "Descrição *", key: "description", type: "text", placeholder: "Ex: Supermercado" },
              { label: "Valor *", key: "amount", type: "number", placeholder: "0,00" },
              { label: "Data", key: "date", type: "date" },
              { label: "Tags (separadas por vírgula)", key: "tags", type: "text", placeholder: "fixo, mercado..." },
              { label: "Observações", key: "notes", type: "text", placeholder: "Opcional..." },
            ].map(f => (
              <div key={f.key} style={s.fr}>
                <div style={{ ...s.label, marginBottom: 4 }}>{f.label}</div>
                <input style={s.input} type={f.type} placeholder={f.placeholder} value={txForm[f.key]} onChange={e => setTxForm(form => ({ ...form, [f.key]: e.target.value }))} />
              </div>
            ))}
            {/* Lançamento futuro */}
            <div style={s.fr}>
              <div style={{ ...s.label, marginBottom: 4 }}>Status</div>
              <select style={s.select} value={txForm.status}
                onChange={e => setTxForm(f => ({ ...f, status: e.target.value }))}>
                <option value='done'>✅ Efetivado</option>
                <option value='pending'>⏳ Futuro / Pendente</option>
              </select>
            </div>
            {txForm.status === 'pending' && (
              <div style={s.fr}>
                <div style={{ ...s.label, marginBottom: 4 }}>Data de vencimento</div>
                <input style={s.input} type='date' value={txForm.due_date}
                  onChange={e => setTxForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
            )}
            <div style={s.fr}>
              <div style={{ ...s.label, marginBottom: 4 }}>Categoria</div>
              <select style={s.select} value={txForm.category_id} onChange={e => setTxForm(f => ({ ...f, category_id: +e.target.value }))}>
                {categories.filter(c => c.type === txForm.type || txForm.type === "transfer").map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
            <div style={{ ...s.fr, marginBottom: 20 }}>
              <div style={{ ...s.label, marginBottom: 4 }}>Conta</div>
              <select style={s.select} value={txForm.account_id} onChange={e => setTxForm(f => ({ ...f, account_id: +e.target.value }))}>
                {accounts.length === 0 ? <option value="">-- Cadastre uma conta primeiro --</option> : accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.bank})</option>)}
              </select>
              {accounts.length === 0 && <div style={{ fontSize: 11, color: "#F59E0B", marginTop: 4 }}>⚠ Vá em "Contas" e cadastre uma conta antes.</div>}
            </div>
            {txForm.type === 'transfer' && (
              <div style={{ ...s.fr, marginBottom: 20 }}>
                <div style={{ ...s.label, marginBottom: 4 }}>Conta de Destino</div>
                <select style={s.select} value={txForm.to_account_id || ''}
                  onChange={e => setTxForm(f => ({ ...f, to_account_id: +e.target.value }))}>
                  {accounts
                    .filter(a => a.id !== +txForm.account_id)
                    .map(a => <option key={a.id} value={a.id}>{a.name} ({a.bank})</option>)}
                </select>
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ ...s.btn("ghost"), flex: 1, justifyContent: "center" }} onClick={closeModal}>Cancelar</button>
              <button style={{ ...s.btn("primary"), flex: 1, justifyContent: "center" }} onClick={saveTx}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — Conta */}
      {showModal === "acc" && (
        <div style={s.modal} onClick={closeModal}>
          <div style={s.modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 20 }}>{editTarget ? "Editar Conta" : "Nova Conta / Carteira"}</div>
            {[
              { label: "Nome *", key: "name", type: "text", placeholder: "Ex: Conta Nubank" },
              { label: "Banco / Instituição", key: "bank", type: "text", placeholder: "Ex: Nubank, Itaú..." },
              { label: "Saldo atual (R$)", key: "balance", type: "number", placeholder: "0,00" },
            ].map(f => (
              <div key={f.key} style={s.fr}>
                <div style={{ ...s.label, marginBottom: 4 }}>{f.label}</div>
                <input style={s.input} type={f.type} placeholder={f.placeholder} value={accForm[f.key]} onChange={e => setAccForm(form => ({ ...form, [f.key]: e.target.value }))} />
              </div>
            ))}
            <div style={s.fr}>
              <div style={{ ...s.label, marginBottom: 4 }}>Tipo</div>
              <select style={s.select} value={accForm.type} onChange={e => setAccForm(f => ({ ...f, type: e.target.value }))}>
                <option value="checking">Conta Corrente</option>
                <option value="savings">Poupança</option>
                <option value="wallet">Carteira / Dinheiro</option>
                <option value="investment">Conta de Investimento</option>
              </select>
            </div>
            <div style={{ ...s.fr, marginBottom: 20 }}>
              <div style={{ ...s.label, marginBottom: 6 }}>Cor</div>
              <div style={{ display: "flex", gap: 8 }}>
                {swatchColors.map(c => (
                  <div key={c} onClick={() => setAccForm(f => ({ ...f, color: c }))}
                    style={{ width: 28, height: 28, borderRadius: "50%", background: c, cursor: "pointer", border: accForm.color === c ? "3px solid white" : "3px solid transparent" }} />
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ ...s.btn("ghost"), flex: 1, justifyContent: "center" }} onClick={closeModal}>Cancelar</button>
              <button style={{ ...s.btn("primary"), flex: 1, justifyContent: "center" }} onClick={saveAcc}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — Cartão de Crédito */}
      {showModal === 'card' && (
        <div style={s.modal} onClick={closeModal}>
          <div style={s.modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 20 }}>
              {editTarget ? 'Editar Cartão' : 'Novo Cartão de Crédito'}
            </div>
            <div style={s.fr}>
              <div style={{ ...s.label, marginBottom: 4 }}>Nome *</div>
              <input style={s.input} type='text' placeholder='Ex: Nubank Roxinho'
                value={cardForm.name} onChange={e => setCardForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div style={s.fr}>
              <div style={{ ...s.label, marginBottom: 4 }}>Limite (R$)</div>
              <input style={s.input} type='number' value={cardForm.limit_amount}
                onChange={e => setCardForm(f => ({ ...f, limit_amount: e.target.value }))} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={s.fr}>
                <div style={{ ...s.label, marginBottom: 4 }}>Dia de fechamento</div>
                <input style={s.input} type='number' min={1} max={31} value={cardForm.closing_day}
                  onChange={e => setCardForm(f => ({ ...f, closing_day: e.target.value }))} />
              </div>
              <div style={s.fr}>
                <div style={{ ...s.label, marginBottom: 4 }}>Dia de vencimento</div>
                <input style={s.input} type='number' min={1} max={31} value={cardForm.due_day}
                  onChange={e => setCardForm(f => ({ ...f, due_day: e.target.value }))} />
              </div>
            </div>
            <div style={s.fr}>
              <div style={{ ...s.label, marginBottom: 4 }}>Conta de débito vinculada</div>
              <select style={s.select} value={cardForm.account_id}
                onChange={e => setCardForm(f => ({ ...f, account_id: +e.target.value }))}>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div style={{ ...s.fr, marginBottom: 20 }}>
              <div style={{ ...s.label, marginBottom: 6 }}>Cor</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {swatchColors.map(c => (
                  <div key={c} onClick={() => setCardForm(f => ({ ...f, color: c }))}
                    style={{ width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer',
                      border: cardForm.color === c ? '3px solid white' : '3px solid transparent' }} />
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={{ ...s.btn('ghost'), flex: 1, justifyContent: 'center' }} onClick={closeModal}>Cancelar</button>
              <button style={{ ...s.btn('primary'), flex: 1, justifyContent: 'center' }} onClick={saveCard}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — Gasto no Cartão */}
      {showModal === 'cardExp' && (
        <div style={s.modal} onClick={closeModal}>
          <div style={s.modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 20 }}>Novo Gasto — {selectedCard?.name}</div>
            <div style={s.fr}>
              <div style={{ ...s.label, marginBottom: 4 }}>Descrição *</div>
              <input style={s.input} type='text' placeholder='Ex: Restaurante'
                value={cardExpForm.description} onChange={e => setCardExpForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div style={s.fr}>
              <div style={{ ...s.label, marginBottom: 4 }}>Valor (R$) *</div>
              <input style={s.input} type='number' value={cardExpForm.amount}
                onChange={e => setCardExpForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div style={s.fr}>
              <div style={{ ...s.label, marginBottom: 4 }}>Parcelas</div>
              <select style={s.select} value={cardExpForm.installments}
                onChange={e => setCardExpForm(f => ({ ...f, installments: +e.target.value }))}>
                {Array.from({ length: 24 }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>{n === 1 ? 'À vista' : `${n}x de ${cardExpForm.amount ? `R$ ${(parseFloat(cardExpForm.amount) / n).toFixed(2)}` : '--'}`}</option>
                ))}
              </select>
            </div>
            <div style={s.fr}>
              <div style={{ ...s.label, marginBottom: 4 }}>Data</div>
              <input style={s.input} type='date' value={cardExpForm.date}
                onChange={e => setCardExpForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div style={s.fr}>
              <div style={{ ...s.label, marginBottom: 4 }}>Categoria</div>
              <select style={s.select} value={cardExpForm.category_id}
                onChange={e => setCardExpForm(f => ({ ...f, category_id: +e.target.value }))}>
                {categories.filter(c => c.type === 'expense').map(c =>
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
            <div style={{ ...s.fr, marginBottom: 20 }}>
              <div style={{ ...s.label, marginBottom: 4 }}>Observações</div>
              <input style={s.input} type='text' value={cardExpForm.notes}
                onChange={e => setCardExpForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={{ ...s.btn('ghost'), flex: 1, justifyContent: 'center' }} onClick={closeModal}>Cancelar</button>
              <button style={{ ...s.btn('primary'), flex: 1, justifyContent: 'center' }} onClick={saveCardExpense}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — Investimento */}
      {showModal === "inv" && (
        <div style={s.modal} onClick={closeModal}>
          <div style={s.modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 20 }}>{editTarget ? "Editar Investimento" : "Novo Investimento"}</div>
            <div style={s.fr}>
              <div style={{ ...s.label, marginBottom: 4 }}>Nome *</div>
              <input style={s.input} type="text" placeholder="Ex: Tesouro Selic 2026" value={invForm.name} onChange={e => setInvForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div style={s.fr}>
              <div style={{ ...s.label, marginBottom: 4 }}>Tipo</div>
              <select style={s.select} value={invForm.type} onChange={e => setInvForm(f => ({ ...f, type: e.target.value }))}>
                {invTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={s.fr}>
                <div style={{ ...s.label, marginBottom: 4 }}>Valor Aplicado (R$) *</div>
                <input style={s.input} type="number" placeholder="10000" value={invForm.invested} onChange={e => setInvForm(f => ({ ...f, invested: e.target.value }))} />
              </div>
              <div style={s.fr}>
                <div style={{ ...s.label, marginBottom: 4 }}>Valor Atual (R$)</div>
                <input style={s.input} type="number" placeholder="Igual ao aplicado" value={invForm.current} onChange={e => setInvForm(f => ({ ...f, current: e.target.value }))} />
              </div>
              <div style={s.fr}>
                <div style={{ ...s.label, marginBottom: 4 }}>Taxa / Rentabilidade</div>
                <input style={s.input} type="number" placeholder="Ex: 110" value={invForm.rate} onChange={e => setInvForm(f => ({ ...f, rate: e.target.value }))} />
              </div>
              <div style={s.fr}>
                <div style={{ ...s.label, marginBottom: 4 }}>Tipo de taxa</div>
                <select style={s.select} value={invForm.rate_type} onChange={e => setInvForm(f => ({ ...f, rate_type: e.target.value }))}>
                  {["% a.a.","% CDI","% a.m.","variável"].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={s.fr}>
                <div style={{ ...s.label, marginBottom: 4 }}>Data de início</div>
                <input style={s.input} type="date" value={invForm.start_date} onChange={e => setInvForm(f => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div style={{ ...s.fr, marginBottom: 20 }}>
                <div style={{ ...s.label, marginBottom: 4 }}>Vencimento (opcional)</div>
                <input style={s.input} type="date" value={invForm.maturity || ""} onChange={e => setInvForm(f => ({ ...f, maturity: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ ...s.btn("ghost"), flex: 1, justifyContent: "center" }} onClick={closeModal}>Cancelar</button>
              <button style={{ ...s.btn("primary"), flex: 1, justifyContent: "center" }} onClick={saveInv}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — Meta */}
      {showModal === "goal" && (
        <div style={s.modal} onClick={closeModal}>
          <div style={s.modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 20 }}>{editTarget ? "Editar Meta" : "Nova Meta Financeira"}</div>
            <div style={s.fr}>
              <div style={{ ...s.label, marginBottom: 6 }}>Ícone</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {goalIcons.map(ic => (
                  <button key={ic} onClick={() => setGoalForm(f => ({ ...f, icon: ic }))}
                    style={{ fontSize: 20, padding: 6, borderRadius: 8, border: goalForm.icon === ic ? "2px solid #8B5CF6" : "2px solid transparent", background: "rgba(255,255,255,0.06)", cursor: "pointer" }}>
                    {ic}
                  </button>
                ))}
              </div>
            </div>
            {[
              { label: "Nome *", key: "name", type: "text" },
              { label: "Valor alvo (R$) *", key: "target", type: "number" },
              { label: "Já tenho (R$)", key: "current", type: "number" },
              { label: "Prazo", key: "deadline", type: "date" },
            ].map(f => (
              <div key={f.key} style={s.fr}>
                <div style={{ ...s.label, marginBottom: 4 }}>{f.label}</div>
                <input style={s.input} type={f.type} value={goalForm[f.key]} onChange={e => setGoalForm(fm => ({ ...fm, [f.key]: e.target.value }))} />
              </div>
            ))}
            <div style={{ ...s.fr, marginBottom: 20 }}>
              <div style={{ ...s.label, marginBottom: 6 }}>Cor</div>
              <div style={{ display: "flex", gap: 8 }}>
                {swatchColors.map(c => (
                  <div key={c} onClick={() => setGoalForm(f => ({ ...f, color: c }))}
                    style={{ width: 28, height: 28, borderRadius: "50%", background: c, cursor: "pointer", border: goalForm.color === c ? "3px solid white" : "3px solid transparent" }} />
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ ...s.btn("ghost"), flex: 1, justifyContent: "center" }} onClick={closeModal}>Cancelar</button>
              <button style={{ ...s.btn("primary"), flex: 1, justifyContent: "center" }} onClick={saveGoal}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — Categoria */}
      {showModal === 'cat' && (
        <div style={s.modal} onClick={closeModal}>
          <div style={s.modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 20 }}>
              {editTarget ? 'Editar Categoria' : 'Nova Categoria'}
            </div>
            <div style={s.fr}>
              <div style={{ ...s.label, marginBottom: 4 }}>Nome *</div>
              <input style={s.input} type='text' placeholder='Ex: Alimentação'
                value={catForm.name}
                onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div style={s.fr}>
              <div style={{ ...s.label, marginBottom: 4 }}>Ícone (emoji)</div>
              <input style={s.input} type='text' maxLength={2}
                value={catForm.icon}
                onChange={e => setCatForm(f => ({ ...f, icon: e.target.value }))} />
            </div>
            <div style={s.fr}>
              <div style={{ ...s.label, marginBottom: 4 }}>Tipo</div>
              <select style={s.select} value={catForm.type}
                onChange={e => setCatForm(f => ({ ...f, type: e.target.value }))}>
                <option value='expense'>Despesa</option>
                <option value='income'>Receita</option>
              </select>
            </div>
            <div style={s.fr}>
              <div style={{ ...s.label, marginBottom: 4 }}>Orçamento Mensal (R$)</div>
              <input style={s.input} type='number' placeholder='0'
                value={catForm.budget}
                onChange={e => setCatForm(f => ({ ...f, budget: e.target.value }))} />
            </div>
            <div style={{ ...s.fr, marginBottom: 20 }}>
              <div style={{ ...s.label, marginBottom: 6 }}>Cor</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {swatchColors.map(c => (
                  <div key={c} onClick={() => setCatForm(f => ({ ...f, color: c }))}
                    style={{ width: 28, height: 28, borderRadius: '50%', background: c,
                      cursor: 'pointer',
                      border: catForm.color === c ? '3px solid white' : '3px solid transparent' }} />
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={{ ...s.btn('ghost'), flex: 1, justifyContent: 'center' }}
                onClick={closeModal}>Cancelar</button>
              <button style={{ ...s.btn('primary'), flex: 1, justifyContent: 'center' }}
                onClick={saveCat}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — Lançamento Fixo */}
      {showModal === 'rec' && (
        <div style={s.modal} onClick={closeModal}>
          <div style={s.modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 20 }}>
              {editTarget ? 'Editar Lançamento Fixo' : 'Novo Lançamento Fixo'}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {['expense','income'].map(type => (
                <button key={type} onClick={() => {
                  const firstCat = categories.find(c => c.type === type)
                  setRecForm(f => ({ ...f, type, category_id: firstCat?.id || f.category_id }))
                }}
                  style={{ ...s.btn(recForm.type === type ? 'primary' : 'ghost'),
                    flex: 1, justifyContent: 'center' }}>
                  {type === 'expense' ? '📤 Despesa' : '📥 Receita'}
                </button>
              ))}
            </div>
            {[
              { label: 'Descrição *', key: 'description', type: 'text' },
              { label: 'Valor (R$) *', key: 'amount', type: 'number' },
              { label: 'Dia do mês (1–31)', key: 'day_of_month', type: 'number' },
            ].map(f => (
              <div key={f.key} style={s.fr}>
                <div style={{ ...s.label, marginBottom: 4 }}>{f.label}</div>
                <input style={s.input} type={f.type} value={recForm[f.key]}
                  onChange={e => setRecForm(fm => ({ ...fm, [f.key]: e.target.value }))} />
              </div>
            ))}            
            <div style={s.fr}>
              <div style={{ ...s.label, marginBottom: 4 }}>Categoria</div>
              <select style={s.select} value={recForm.category_id}
                onChange={e => setRecForm(f => ({ ...f, category_id: +e.target.value }))}>
                {categories.filter(c => c.type === recForm.type)
                  .map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
            <div style={{ ...s.fr, marginBottom: 20 }}>
              <div style={{ ...s.label, marginBottom: 4 }}>Conta</div>
              <select style={s.select} value={recForm.account_id}
                onChange={e => setRecForm(f => ({ ...f, account_id: +e.target.value }))}>
                {accounts.length === 0
                  ? <option value="">-- Cadastre uma conta primeiro --</option>
                  : accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)
                }
              </select>
              {accounts.length === 0 && (     // ← adicionar
                <div style={{ fontSize: 11, color: '#F59E0B', marginTop: 4 }}>
                  ⚠ Vá em "Contas" e cadastre uma conta antes.
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={{ ...s.btn('ghost'), flex: 1, justifyContent: 'center' }}
                onClick={closeModal}>Cancelar</button>
              <button style={{ ...s.btn('primary'), flex: 1, justifyContent: 'center' }}
                onClick={saveRec}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {showAporteModal && (
        <div style={s.modal} onClick={() => setShowAporteModal(false)}>
          <div style={s.modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 20 }}>💸 Aportar em Investimento</div>
            <div style={s.fr}>
              <div style={{ ...s.label, marginBottom: 4 }}>Conta de origem *</div>
              <select style={s.select} value={aporteForm.account_id}
                onChange={e => setAporteForm(f => ({ ...f, account_id: +e.target.value }))}>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name} — {fmt(a.balance)}</option>)}
              </select>
            </div>
            <div style={s.fr}>
              <div style={{ ...s.label, marginBottom: 4 }}>Investimento de destino *</div>
              <select style={s.select} value={aporteForm.investment_id}
                onChange={e => setAporteForm(f => ({ ...f, investment_id: +e.target.value }))}>
                {investments.map(i => <option key={i.id} value={i.id}>{i.name} ({invLabels[i.type] || i.type})</option>)}
              </select>
            </div>
            {[
              { label: 'Valor (R$) *', key: 'amount', type: 'number', placeholder: '0,00' },
              { label: 'Descrição', key: 'description', type: 'text', placeholder: 'Aporte' },
              { label: 'Data', key: 'date', type: 'date' },
              { label: 'Observações', key: 'notes', type: 'text', placeholder: 'Opcional' },
            ].map(f => (
              <div key={f.key} style={s.fr}>
                <div style={{ ...s.label, marginBottom: 4 }}>{f.label}</div>
                <input style={s.input} type={f.type} placeholder={f.placeholder}
                  value={aporteForm[f.key]}
                  onChange={e => setAporteForm(fm => ({ ...fm, [f.key]: e.target.value }))} />
              </div>
            ))}
            {/* Resumo */}
            {aporteForm.amount && aporteForm.account_id && (
              <div style={{ padding: '10px 14px', background: 'rgba(139,92,246,0.1)', borderRadius: 8, fontSize: 12, color: '#8B5CF6', marginBottom: 16 }}>
                {fmt(accounts.find(a => a.id === +aporteForm.account_id)?.balance || 0)} → saldo após: {fmt((accounts.find(a => a.id === +aporteForm.account_id)?.balance || 0) - parseFloat(aporteForm.amount || 0))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={{ ...s.btn('ghost'), flex: 1, justifyContent: 'center' }}
                onClick={() => setShowAporteModal(false)}>Cancelar</button>
              <button style={{ ...s.btn('primary'), flex: 1, justifyContent: 'center' }}
                onClick={async () => {
                  if (!aporteForm.amount || !aporteForm.account_id || !aporteForm.investment_id) return
                  const payload = { ...aporteForm, amount: parseFloat(aporteForm.amount) }
                  if (window.db) {
                    try {
                      const tx = await window.db.transactions.transferToInvestment(payload)
                      setTransactions(prev => [tx, ...prev])
                      const accs = await window.db.accounts.list()
                      setAccounts(accs)
                      const invs = await window.db.investments.list()
                      setInvestments(invs)
                    } catch (err) { alert('Erro: ' + err.message); return }
                  } else {
                    // Modo demo: atualiza estado local
                    setAccounts(prev => prev.map(a =>
                      a.id === +payload.account_id ? { ...a, balance: a.balance - payload.amount } : a))
                    setInvestments(prev => prev.map(i =>
                      i.id === +payload.investment_id ? { ...i, invested: i.invested + payload.amount, current: i.current + payload.amount } : i))
                  }
                  setShowAporteModal(false)
                }}>Confirmar Aporte</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SUBCOMPONENTS
// ============================================================
function InvestmentSimulator({ s }) {
  const [amount, setAmount] = useState(10000);
  const [rate, setRate] = useState(11.5);
  const [years, setYears] = useState(5);
  const result = amount * Math.pow(1 + rate / 100, years);
  const gain = result - amount;
  return (
    <div style={s.card}>
      <div style={s.sectionTitle}>🧮 Simulador de Investimentos</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
        {[
          { label: "Valor inicial (R$)", value: amount, min: 100, max: 500000, step: 100, set: setAmount, display: `R$ ${amount.toLocaleString("pt-BR")}` },
          { label: "Taxa anual (%)", value: rate, min: 0.5, max: 30, step: 0.1, set: setRate, display: `${rate.toFixed(1)}%` },
          { label: "Prazo (anos)", value: years, min: 1, max: 30, step: 1, set: setYears, display: `${years} anos` },
        ].map((f, i) => (
          <div key={i}>
            <div style={{ ...s.label, marginBottom: 6 }}>{f.label}</div>
            <input type="range" min={f.min} max={f.max} step={f.step} value={f.value} onChange={e => f.set(+e.target.value)} style={{ width: "100%", accentColor: "#8B5CF6" }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: "#8B5CF6", marginTop: 4 }}>{f.display}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        {[
          { label: "Valor final", value: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(result), color: "#10B981" },
          { label: "Rendimento", value: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(gain), color: "#8B5CF6" },
          { label: "Multiplicador", value: `${(result / amount).toFixed(2)}x`, color: "#F59E0B" },
        ].map((item, i) => (
          <div key={i} style={{ ...s.cardSm, background: "#0D1117" }}>
            <div style={s.label}>{item.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: item.color, marginTop: 4 }}>{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CalendarView({ transactions, categories, s, month, year }) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: 42 }, (_, i) => { const d = i - firstDay + 1; return d > 0 && d <= daysInMonth ? d : null; });
  const txByDay = {};
  transactions.forEach(t => { const d = new Date(t.date + "T00:00:00").getDate(); if (!txByDay[d]) txByDay[d] = []; txByDay[d].push(t); });
  const isToday = (day) => day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();
  return (
    <div style={s.card}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 8 }}>
        {["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: 11, color: "#6B7280", fontWeight: 600, padding: "4px 0" }}>{d}</div>
        ))}
        {days.map((day, i) => {
          const txs = day ? (txByDay[day] || []) : [];
          return (
            <div key={i} style={{ minHeight: 64, padding: 6, borderRadius: 8, background: day ? (isToday(day) ? "rgba(139,92,246,0.15)" : "rgba(255,255,255,0.02)") : "transparent", border: isToday(day) ? "1px solid rgba(139,92,246,0.4)" : "1px solid transparent" }}>
              {day && (
                <>
                  <div style={{ fontSize: 12, fontWeight: isToday(day) ? 700 : 400, color: isToday(day) ? "#8B5CF6" : "#C9D1D9", marginBottom: 4 }}>{day}</div>
                  {txs.slice(0, 2).map((t, j) => {
                    const c = categories.find(cat => cat.id === t.category_id);
                    return (
                      <div key={j} style={{ fontSize: 10, padding: "1px 4px", borderRadius: 3, background: (t.type === "income" ? "#10B981" : "#EF4444") + "20", color: t.type === "income" ? "#10B981" : "#EF4444", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c?.icon} {t.description}
                      </div>
                    );
                  })}
                  {txs.length > 2 && <div style={{ fontSize: 10, color: "#6B7280" }}>+{txs.length - 2}</div>}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
