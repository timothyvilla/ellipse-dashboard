import React, { useState, useEffect, createContext, useContext } from 'react';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell } from 'recharts';
import { Plus, TrendingUp, TrendingDown, ChevronDown, Calendar, BarChart3, BookOpen, Wallet, CheckCircle, Clock, X, Eye, Database, ChevronLeft, ChevronRight, Trash2, Edit3, Moon, Sun, Settings } from 'lucide-react';

const ThemeContext = createContext();
const useTheme = () => useContext(ThemeContext);

const MARKET_STRUCTURES = {
  TRENDING_BULLISH: { label: 'Trending Bullish', color: '#10B981', description: 'Higher Highs + Higher Lows' },
  TRENDING_BEARISH: { label: 'Trending Bearish', color: '#EF4444', description: 'Lower Highs + Lower Lows' },
  REVERSING_BULLISH: { label: 'Reversal to Bullish', color: '#3B82F6', description: 'Break of Lower High' },
  REVERSING_BEARISH: { label: 'Reversal to Bearish', color: '#F59E0B', description: 'Break of Higher Low' },
  CHOPPY: { label: 'Choppy/Range', color: '#8B5CF6', description: 'No clear structure' }
};

const CANDLE_TYPES = {
  OHLC: { label: 'OHLC (Bullish)', description: 'Open → Low → High → Close' },
  OLHC: { label: 'OLHC (Bearish)', description: 'Open → High → Low → Close' }
};

const LIQUIDITY_LEVELS = [
  { key: 'prevSessionHigh', label: 'Previous Session High', abbr: 'PSH' },
  { key: 'prevSessionLow', label: 'Previous Session Low', abbr: 'PSL' },
  { key: 'prevDailyHigh', label: 'Previous Daily High', abbr: 'PDH' },
  { key: 'prevDailyLow', label: 'Previous Daily Low', abbr: 'PDL' },
  { key: 'prevWeeklyHigh', label: 'Previous Weekly High', abbr: 'PWH' },
  { key: 'prevWeeklyLow', label: 'Previous Weekly Low', abbr: 'PWL' },
  { key: 'trueDayOpen', label: 'True Day Open', abbr: 'TDO' }
];

const PIP_VALUES = {
  'EURUSD': { pipSize: 0.0001, pipValue: 10 }, 'GBPUSD': { pipSize: 0.0001, pipValue: 10 },
  'USDJPY': { pipSize: 0.01, pipValue: 9.1 }, 'XAUUSD': { pipSize: 0.01, pipValue: 1 },
  'US30': { pipSize: 1, pipValue: 1 }, 'NAS100': { pipSize: 1, pipValue: 1 },
  'DEFAULT': { pipSize: 0.0001, pipValue: 10 }
};

export default function TradingJournal() {
  const [darkMode, setDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState('journal');
  const [trades, setTrades] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [showNewTrade, setShowNewTrade] = useState(false);
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [filterAccount, setFilterAccount] = useState('all');
  const [analyticsAccount, setAnalyticsAccount] = useState('all');

  const filteredTrades = filterAccount === 'all' ? trades : trades.filter(t => t.account === filterAccount);
  const totalPnl = filteredTrades.reduce((sum, t) => sum + t.pnl, 0);
  const winningTrades = filteredTrades.filter(t => t.pnl > 0).length;

  const theme = {
    dark: darkMode,
    bg: darkMode ? 'bg-[#0f0f0f]' : 'bg-[#FAFBFC]',
    card: darkMode ? 'bg-[#1a1a1a]' : 'bg-white',
    text: darkMode ? 'text-gray-100' : 'text-gray-900',
    textMuted: darkMode ? 'text-gray-400' : 'text-gray-500',
    textFaint: darkMode ? 'text-gray-500' : 'text-gray-400',
    border: darkMode ? 'border-[#2a2a2a]' : 'border-gray-200',
    input: darkMode ? 'bg-[#222] border-[#333] text-gray-100' : 'bg-white border-gray-200 text-gray-900',
  };

  return (
    <ThemeContext.Provider value={theme}>
      <div className={`min-h-screen ${theme.bg}`} style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
          .glass-card { background: ${darkMode ? '#1a1a1a' : 'white'}; border: 1px solid ${darkMode ? '#2a2a2a' : '#e5e7eb'}; }
          .metric-card { background: ${darkMode ? '#1a1a1a' : 'white'}; border: 1px solid ${darkMode ? '#2a2a2a' : '#e5e7eb'}; }
          .nav-item.active { background: linear-gradient(135deg, #4F46E5, #7C3AED); color: white; }
          .btn-primary { background: linear-gradient(135deg, #4F46E5, #7C3AED); }
        `}</style>

        <div className="flex h-screen">
          {/* Sidebar */}
          <aside className={`w-60 ${theme.card} border-r ${theme.border} flex flex-col`}>
            <div className={`p-5 border-b ${theme.border}`}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center relative">
                  <div className="absolute w-6 h-6 border-2 border-white/90 rounded-full"></div>
                  <div className="absolute w-3 h-3 bg-white/90 rounded-full" style={{ transform: 'translate(4px, -4px)' }}></div>
                </div>
                <div>
                  <h1 className={`font-semibold ${theme.text}`}>Ellipse</h1>
                  <p className={`text-[10px] ${theme.textFaint}`}>Price Action Journal</p>
                </div>
              </div>
            </div>

            <nav className="flex-1 p-3 space-y-1">
              {[
                { id: 'journal', label: 'Journal', icon: BookOpen },
                { id: 'analytics', label: 'Analytics', icon: BarChart3 },
                { id: 'accounts', label: 'Accounts', icon: Wallet },
                { id: 'calendar', label: 'Calendar', icon: Calendar },
              ].map(item => (
                <button key={item.id} onClick={() => setActiveTab(item.id)} className={`nav-item w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${activeTab === item.id ? 'active' : theme.textMuted}`}>
                  <item.icon className="w-4 h-4" />{item.label}
                </button>
              ))}
            </nav>

            <div className={`p-3 border-t ${theme.border}`}>
              <button onClick={() => setDarkMode(!darkMode)} className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm ${theme.textMuted} hover:opacity-80 mb-3`}>
                <span className="flex items-center gap-3">{darkMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}{darkMode ? 'Dark' : 'Light'}</span>
                <div className={`w-8 h-5 rounded-full ${darkMode ? 'bg-indigo-600' : 'bg-gray-300'} relative`}>
                  <div className={`absolute top-0.5 ${darkMode ? 'right-0.5' : 'left-0.5'} w-4 h-4 rounded-full bg-white shadow`}></div>
                </div>
              </button>
              <div className="glass-card rounded-xl p-4">
                <p className={`text-[10px] ${theme.textFaint} mb-2 uppercase tracking-wider`}>Today's P&L</p>
                <p className={`text-xl font-semibold ${totalPnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)} <span className={`text-xs ${theme.textFaint}`}>USD</span></p>
                <div className={`mt-2 flex gap-3 text-xs ${theme.textMuted}`}>
                  <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>{winningTrades}W</span>
                  <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-red-400"></div>{filteredTrades.length - winningTrades}L</span>
                </div>
              </div>
            </div>
          </aside>

          {/* Main */}
          <main className="flex-1 overflow-hidden flex flex-col">
            <header className={`${theme.card} border-b ${theme.border} px-6 py-4`}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className={`text-lg font-semibold ${theme.text}`}>
                    {activeTab === 'journal' && 'Trading Journal'}{activeTab === 'analytics' && 'Analytics'}{activeTab === 'accounts' && 'Accounts'}{activeTab === 'calendar' && 'Calendar'}
                  </h2>
                </div>
                <div className="flex gap-3">
                  {activeTab === 'journal' && <button onClick={() => setShowNewTrade(true)} className="btn-primary flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-medium"><Plus className="w-4 h-4" />Log Trade</button>}
                  {activeTab === 'accounts' && <button onClick={() => setShowNewAccount(true)} className="btn-primary flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-medium"><Plus className="w-4 h-4" />Add Account</button>}
                </div>
              </div>
            </header>

            <div className="flex-1 overflow-auto p-6">
              {activeTab === 'journal' && <JournalView trades={trades} accounts={accounts} filterAccount={filterAccount} setFilterAccount={setFilterAccount} onSelectTrade={setSelectedTrade} />}
              {activeTab === 'analytics' && <AnalyticsView trades={trades} accounts={accounts} selectedAccount={analyticsAccount} setSelectedAccount={setAnalyticsAccount} />}
              {activeTab === 'accounts' && <AccountsView accounts={accounts} setAccounts={setAccounts} />}
              {activeTab === 'calendar' && <CalendarView trades={trades} />}
            </div>
          </main>
        </div>

        {showNewTrade && <NewTradeModal onClose={() => setShowNewTrade(false)} onSave={(trade) => { setTrades([{ ...trade, id: Date.now() }, ...trades]); setShowNewTrade(false); }} accounts={accounts} />}
        {showNewAccount && <NewAccountModal onClose={() => setShowNewAccount(false)} onSave={(acc) => { setAccounts([...accounts, { ...acc, id: Date.now() }]); setShowNewAccount(false); }} />}
        {selectedTrade && <TradeDetailModal trade={selectedTrade} onClose={() => setSelectedTrade(null)} onDelete={(id) => { setTrades(trades.filter(t => t.id !== id)); setSelectedTrade(null); }} />}
      </div>
    </ThemeContext.Provider>
  );
}

function JournalView({ trades, accounts, filterAccount, setFilterAccount, onSelectTrade }) {
  const theme = useTheme();
  const filtered = filterAccount === 'all' ? trades : trades.filter(t => t.account === filterAccount);

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <select value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)} className={`${theme.input} border rounded-xl px-3 py-2 text-sm`}>
          <option value="all">All Accounts</option>
          {accounts.map(acc => <option key={acc.id} value={acc.name}>{acc.name}</option>)}
        </select>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className={`grid grid-cols-[1fr,80px,90px,80px,90px,50px] gap-3 px-5 py-2.5 ${theme.dark ? 'bg-white/5' : 'bg-gray-50'} border-b ${theme.border} text-[10px] font-medium ${theme.textMuted} uppercase`}>
          <div>Trade</div><div>Side</div><div>Structure</div><div>Lots</div><div className="text-right">P&L</div><div></div>
        </div>
        
        {filtered.length === 0 ? (
          <div className="py-10 text-center">
            <BookOpen className={`w-10 h-10 ${theme.textFaint} mx-auto mb-3 opacity-50`} />
            <p className={`text-sm ${theme.textMuted}`}>No trades yet</p>
          </div>
        ) : filtered.map(trade => (
          <div key={trade.id} onClick={() => onSelectTrade(trade)} className={`grid grid-cols-[1fr,80px,90px,80px,90px,50px] gap-3 px-5 py-3 border-b ${theme.border} items-center cursor-pointer hover:${theme.dark ? 'bg-white/5' : 'bg-gray-50'}`}>
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold ${trade.pnl >= 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>{trade.symbol?.slice(0, 2)}</div>
              <div><p className={`font-medium ${theme.text} text-sm`}>{trade.symbol}</p><p className={`text-[10px] ${theme.textFaint}`}>{trade.date}</p></div>
            </div>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${trade.side === 'Long' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>{trade.side}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: MARKET_STRUCTURES[trade.marketStructure]?.color }}>{trade.marketStructure?.slice(0, 5)}</span>
            <span className={`text-sm ${theme.text}`}>{trade.lots}</span>
            <span className={`text-right font-semibold text-sm ${trade.pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{trade.pnl >= 0 ? '+' : ''}${trade.pnl?.toFixed(2)}</span>
            <Eye className={`w-4 h-4 ${theme.textFaint}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalyticsView({ trades, accounts, selectedAccount, setSelectedAccount }) {
  const theme = useTheme();
  const filtered = selectedAccount === 'all' ? trades : trades.filter(t => t.account === selectedAccount);
  
  const totalPnl = filtered.reduce((s, t) => s + t.pnl, 0);
  const wins = filtered.filter(t => t.pnl > 0);
  const losses = filtered.filter(t => t.pnl < 0);
  const winRate = filtered.length > 0 ? ((wins.length / filtered.length) * 100).toFixed(1) : 0;
  const avgWin = wins.length > 0 ? (wins.reduce((s, t) => s + t.pnl, 0) / wins.length).toFixed(2) : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length).toFixed(2) : 0;

  const structureStats = Object.keys(MARKET_STRUCTURES).map(key => ({
    name: MARKET_STRUCTURES[key].label,
    trades: filtered.filter(t => t.marketStructure === key).length,
    pnl: filtered.filter(t => t.marketStructure === key).reduce((s, t) => s + t.pnl, 0),
    winRate: filtered.filter(t => t.marketStructure === key).length > 0 ? (filtered.filter(t => t.marketStructure === key && t.pnl > 0).length / filtered.filter(t => t.marketStructure === key).length * 100).toFixed(0) : 0,
    color: MARKET_STRUCTURES[key].color
  })).filter(s => s.trades > 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className={`text-sm ${theme.textMuted}`}>Analytics for:</span>
        <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)} className={`${theme.input} border rounded-xl px-3 py-2 text-sm font-medium`}>
          <option value="all">All Accounts</option>
          {accounts.map(acc => <option key={acc.id} value={acc.name}>{acc.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total P&L', value: `$${totalPnl.toFixed(2)}`, pos: totalPnl >= 0 },
          { label: 'Win Rate', value: `${winRate}%`, pos: parseFloat(winRate) >= 50 },
          { label: 'Avg Win', value: `$${avgWin}`, pos: true },
          { label: 'Avg Loss', value: `$${avgLoss}`, pos: false }
        ].map((m, i) => (
          <div key={i} className="metric-card rounded-xl p-4">
            <p className={`text-[10px] ${theme.textMuted} uppercase`}>{m.label}</p>
            <p className={`text-xl font-semibold mt-1 ${m.pos ? 'text-emerald-500' : 'text-red-500'}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="glass-card rounded-xl p-10 text-center">
          <BarChart3 className={`w-12 h-12 ${theme.textFaint} mx-auto mb-3 opacity-50`} />
          <p className={`text-sm ${theme.textMuted}`}>No trades to analyze</p>
        </div>
      ) : (
        <div className="glass-card rounded-xl p-5">
          <h3 className={`font-semibold ${theme.text} text-sm mb-4`}>Performance by Structure</h3>
          <div className="space-y-3">
            {structureStats.map(s => (
              <div key={s.name} className={`flex items-center justify-between p-3 rounded-lg ${theme.dark ? 'bg-white/5' : 'bg-gray-50'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-semibold" style={{ backgroundColor: s.color }}>{s.trades}</div>
                  <div><p className={`text-sm font-medium ${theme.text}`}>{s.name}</p><p className={`text-[10px] ${theme.textMuted}`}>{s.winRate}% win rate</p></div>
                </div>
                <span className={`font-semibold ${s.pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{s.pnl >= 0 ? '+' : ''}${s.pnl.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AccountsView({ accounts, setAccounts }) {
  const theme = useTheme();
  const [deleteId, setDeleteId] = useState(null);
  const [editAcc, setEditAcc] = useState(null);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <div className="metric-card rounded-xl p-4">
          <p className={`text-[10px] ${theme.textMuted} uppercase`}>Total Balance</p>
          <p className={`text-xl font-semibold mt-1 ${theme.text}`}>${accounts.reduce((s, a) => s + a.balance, 0).toLocaleString()}</p>
        </div>
        <div className="metric-card rounded-xl p-4">
          <p className={`text-[10px] ${theme.textMuted} uppercase`}>Total Equity</p>
          <p className="text-xl font-semibold mt-1 text-emerald-500">${accounts.reduce((s, a) => s + a.equity, 0).toLocaleString()}</p>
        </div>
        <div className="metric-card rounded-xl p-4">
          <p className={`text-[10px] ${theme.textMuted} uppercase`}>Accounts</p>
          <p className={`text-xl font-semibold mt-1 ${theme.text}`}>{accounts.length}</p>
        </div>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        {accounts.length === 0 ? (
          <div className="py-10 text-center">
            <Database className={`w-10 h-10 ${theme.textFaint} mx-auto mb-3 opacity-50`} />
            <p className={`text-sm ${theme.textMuted}`}>No accounts yet</p>
          </div>
        ) : accounts.map(acc => (
          <div key={acc.id} className={`flex items-center justify-between px-5 py-4 border-b ${theme.border}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${acc.platform === 'MT5' ? 'bg-blue-500/10' : 'bg-purple-500/10'}`}>
                <Database className={`w-5 h-5 ${acc.platform === 'MT5' ? 'text-blue-500' : 'text-purple-500'}`} />
              </div>
              <div><p className={`font-medium ${theme.text}`}>{acc.name}</p><p className={`text-[10px] ${theme.textFaint}`}>{acc.broker} · {acc.server}</p></div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right"><p className={`font-semibold ${theme.text}`}>${acc.balance.toLocaleString()}</p><p className={`text-[10px] ${theme.textFaint}`}>Balance</p></div>
              <div className="text-right"><p className={`font-semibold ${acc.equity >= acc.balance ? 'text-emerald-500' : 'text-red-500'}`}>${acc.equity.toLocaleString()}</p><p className={`text-[10px] ${theme.textFaint}`}>Equity</p></div>
              <div className="flex gap-1">
                <button onClick={() => setEditAcc(acc)} className="p-2 hover:bg-indigo-500/10 rounded-lg"><Edit3 className={`w-4 h-4 ${theme.textFaint}`} /></button>
                <button onClick={() => setDeleteId(acc.id)} className="p-2 hover:bg-red-500/10 rounded-lg"><Trash2 className={`w-4 h-4 ${theme.textFaint}`} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editAcc && <EditAccountModal account={editAcc} onClose={() => setEditAcc(null)} onSave={(updated) => { setAccounts(accounts.map(a => a.id === updated.id ? updated : a)); setEditAcc(null); }} />}
      
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`${theme.card} rounded-2xl w-full max-w-sm p-6 border ${theme.border}`}>
            <h3 className={`font-semibold ${theme.text} mb-4`}>Remove Account?</h3>
            <p className={`text-sm ${theme.textMuted} mb-5`}>This will remove {accounts.find(a => a.id === deleteId)?.name}</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className={`flex-1 py-2.5 rounded-xl ${theme.textMuted} border ${theme.border}`}>Cancel</button>
              <button onClick={() => { setAccounts(accounts.filter(a => a.id !== deleteId)); setDeleteId(null); }} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white">Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EditAccountModal({ account, onClose, onSave }) {
  const theme = useTheme();
  const [data, setData] = useState({ ...account, balance: account.balance.toString(), equity: account.equity.toString() });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`${theme.card} rounded-2xl w-full max-w-md border ${theme.border}`}>
        <div className={`flex justify-between px-6 py-4 border-b ${theme.border}`}>
          <h3 className={`font-semibold ${theme.text}`}>Edit Account</h3>
          <button onClick={onClose}><X className={`w-5 h-5 ${theme.textFaint}`} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div><label className={`text-xs ${theme.textMuted}`}>Name</label><input value={data.name} onChange={(e) => setData({...data, name: e.target.value})} className={`w-full ${theme.input} border rounded-xl px-3 py-2 text-sm mt-1`} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={`text-xs ${theme.textMuted}`}>Balance</label><input type="number" value={data.balance} onChange={(e) => setData({...data, balance: e.target.value})} className={`w-full ${theme.input} border rounded-xl px-3 py-2 text-sm mt-1`} /></div>
            <div><label className={`text-xs ${theme.textMuted}`}>Equity</label><input type="number" value={data.equity} onChange={(e) => setData({...data, equity: e.target.value})} className={`w-full ${theme.input} border rounded-xl px-3 py-2 text-sm mt-1`} /></div>
          </div>
        </div>
        <div className={`flex justify-end gap-3 px-6 py-4 border-t ${theme.border}`}>
          <button onClick={onClose} className={`px-4 py-2 ${theme.textMuted}`}>Cancel</button>
          <button onClick={() => onSave({ ...data, balance: parseFloat(data.balance) || 0, equity: parseFloat(data.equity) || 0 })} className="btn-primary px-5 py-2 rounded-xl text-white text-sm font-medium">Save</button>
        </div>
      </div>
    </div>
  );
}

function CalendarView({ trades }) {
  const theme = useTheme();
  const [month, setMonth] = useState(new Date());
  
  const days = [];
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const getTradesForDay = (day) => {
    if (!day) return [];
    const dateStr = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return trades.filter(t => t.date === dateStr);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className={`text-lg font-semibold ${theme.text}`}>{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h3>
        <div className="flex gap-2">
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1))} className={`p-2 rounded-lg ${theme.dark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={() => setMonth(new Date())} className={`px-3 py-1.5 text-sm ${theme.textMuted}`}>Today</button>
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1))} className={`p-2 rounded-lg ${theme.dark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>
      <div className="glass-card rounded-xl overflow-hidden">
        <div className={`grid grid-cols-7 border-b ${theme.border}`}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d} className={`px-3 py-2 text-center text-[10px] font-medium ${theme.textMuted} uppercase ${theme.dark ? 'bg-white/5' : 'bg-gray-50'}`}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const dayTrades = getTradesForDay(day);
            const pnl = dayTrades.reduce((s, t) => s + t.pnl, 0);
            return (
              <div key={i} className={`min-h-[90px] p-2 border-b border-r ${theme.border} ${!day ? (theme.dark ? 'bg-white/[0.02]' : 'bg-gray-50/30') : ''}`}>
                {day && <>
                  <p className={`text-sm ${theme.textMuted}`}>{day}</p>
                  {dayTrades.length > 0 && <div className={`text-xs font-semibold mt-1 ${pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}</div>}
                </>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NewTradeModal({ onClose, onSave, accounts }) {
  const theme = useTheme();
  const [step, setStep] = useState(1);
  const [trade, setTrade] = useState({
    date: new Date().toISOString().split('T')[0], time: new Date().toTimeString().slice(0, 5),
    symbol: '', side: 'Long', entry: '', exit: '', lots: '', stopLoss: '', takeProfit: '',
    commission: '', swap: '', pnl: 0,
    marketStructure: '', candleType: '', liquidityTaken: [], liquidityTarget: [], notes: '',
    account: accounts[0]?.name || ''
  });

  useEffect(() => {
    if (trade.entry && trade.exit && trade.lots && trade.symbol) {
      const pip = PIP_VALUES[trade.symbol.toUpperCase()] || PIP_VALUES['DEFAULT'];
      const entry = parseFloat(trade.entry), exit = parseFloat(trade.exit), lots = parseFloat(trade.lots);
      const commission = parseFloat(trade.commission) || 0, swap = parseFloat(trade.swap) || 0;
      if (!isNaN(entry) && !isNaN(exit) && !isNaN(lots)) {
        const diff = trade.side === 'Long' ? exit - entry : entry - exit;
        const pips = diff / pip.pipSize;
        const gross = pips * pip.pipValue * lots;
        setTrade(prev => ({ ...prev, pnl: gross - commission + swap }));
      }
    }
  }, [trade.entry, trade.exit, trade.lots, trade.symbol, trade.side, trade.commission, trade.swap]);

  const handleSave = () => {
    const rr = trade.stopLoss && trade.takeProfit && trade.entry
      ? `1:${Math.abs((parseFloat(trade.takeProfit) - parseFloat(trade.entry)) / (parseFloat(trade.entry) - parseFloat(trade.stopLoss))).toFixed(1)}` : '1:0';
    onSave({ ...trade, entry: parseFloat(trade.entry), exit: parseFloat(trade.exit), lots: parseFloat(trade.lots), stopLoss: parseFloat(trade.stopLoss), takeProfit: parseFloat(trade.takeProfit), commission: parseFloat(trade.commission) || 0, swap: parseFloat(trade.swap) || 0, riskReward: rr });
  };

  const toggleLiq = (key, type) => {
    const field = type === 'taken' ? 'liquidityTaken' : 'liquidityTarget';
    setTrade(prev => ({ ...prev, [field]: prev[field].includes(key) ? prev[field].filter(k => k !== key) : [...prev[field], key] }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`${theme.card} rounded-2xl w-full max-w-xl max-h-[90vh] overflow-hidden border ${theme.border}`}>
        <div className={`flex justify-between px-6 py-4 border-b ${theme.border}`}>
          <div><h3 className={`font-semibold ${theme.text}`}>Log Trade</h3><p className={`text-xs ${theme.textFaint}`}>Step {step}/3</p></div>
          <button onClick={onClose}><X className={`w-5 h-5 ${theme.textFaint}`} /></button>
        </div>

        <div className="p-6 max-h-[60vh] overflow-auto space-y-4">
          {step === 1 && <>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={`text-xs ${theme.textMuted}`}>Date</label><input type="date" value={trade.date} onChange={(e) => setTrade({...trade, date: e.target.value})} className={`w-full ${theme.input} border rounded-xl px-3 py-2 text-sm mt-1`} /></div>
              <div><label className={`text-xs ${theme.textMuted}`}>Time</label><input type="time" value={trade.time} onChange={(e) => setTrade({...trade, time: e.target.value})} className={`w-full ${theme.input} border rounded-xl px-3 py-2 text-sm mt-1`} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={`text-xs ${theme.textMuted}`}>Symbol</label><input value={trade.symbol} onChange={(e) => setTrade({...trade, symbol: e.target.value.toUpperCase()})} placeholder="EURUSD" className={`w-full ${theme.input} border rounded-xl px-3 py-2 text-sm mt-1`} /></div>
              <div><label className={`text-xs ${theme.textMuted}`}>Account</label><select value={trade.account} onChange={(e) => setTrade({...trade, account: e.target.value})} className={`w-full ${theme.input} border rounded-xl px-3 py-2 text-sm mt-1`}>{accounts.length === 0 ? <option>No accounts</option> : accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}</select></div>
            </div>
            <div><label className={`text-xs ${theme.textMuted}`}>Side</label>
              <div className="flex gap-2 mt-1">{['Long', 'Short'].map(s => <button key={s} onClick={() => setTrade({...trade, side: s})} className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${trade.side === s ? (s === 'Long' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white') : `${theme.dark ? 'bg-white/10' : 'bg-gray-100'} ${theme.textMuted}`}`}>{s}</button>)}</div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><label className={`text-xs ${theme.textMuted}`}>Entry</label><input type="number" step="any" value={trade.entry} onChange={(e) => setTrade({...trade, entry: e.target.value})} className={`w-full ${theme.input} border rounded-xl px-3 py-2 text-sm mt-1`} /></div>
              <div><label className={`text-xs ${theme.textMuted}`}>Exit</label><input type="number" step="any" value={trade.exit} onChange={(e) => setTrade({...trade, exit: e.target.value})} className={`w-full ${theme.input} border rounded-xl px-3 py-2 text-sm mt-1`} /></div>
              <div><label className={`text-xs ${theme.textMuted}`}>Lots</label><input type="number" step="0.01" value={trade.lots} onChange={(e) => setTrade({...trade, lots: e.target.value})} className={`w-full ${theme.input} border rounded-xl px-3 py-2 text-sm mt-1`} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={`text-xs ${theme.textMuted}`}>Stop Loss</label><input type="number" step="any" value={trade.stopLoss} onChange={(e) => setTrade({...trade, stopLoss: e.target.value})} className={`w-full ${theme.input} border rounded-xl px-3 py-2 text-sm mt-1`} /></div>
              <div><label className={`text-xs ${theme.textMuted}`}>Take Profit</label><input type="number" step="any" value={trade.takeProfit} onChange={(e) => setTrade({...trade, takeProfit: e.target.value})} className={`w-full ${theme.input} border rounded-xl px-3 py-2 text-sm mt-1`} /></div>
            </div>
            <div className={`p-4 rounded-xl ${theme.dark ? 'bg-white/5' : 'bg-gray-50'}`}>
              <p className={`text-xs font-medium ${theme.textMuted} mb-3 flex items-center gap-2`}><Settings className="w-3.5 h-3.5" />Fees</p>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={`text-[10px] ${theme.textFaint}`}>Commission ($)</label><input type="number" step="0.01" value={trade.commission} onChange={(e) => setTrade({...trade, commission: e.target.value})} placeholder="0.00" className={`w-full ${theme.input} border rounded-xl px-3 py-2 text-sm mt-1`} /></div>
                <div><label className={`text-[10px] ${theme.textFaint}`}>Swap ($)</label><input type="number" step="0.01" value={trade.swap} onChange={(e) => setTrade({...trade, swap: e.target.value})} placeholder="0.00" className={`w-full ${theme.input} border rounded-xl px-3 py-2 text-sm mt-1`} /></div>
              </div>
            </div>
            <div className={`p-4 rounded-xl ${trade.pnl >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
              <div className="flex justify-between items-center">
                <span className={`text-sm ${theme.textMuted}`}>Calculated P&L</span>
                <span className={`text-xl font-bold ${trade.pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}</span>
              </div>
            </div>
          </>}

          {step === 2 && <>
            <p className={`text-sm font-medium ${theme.text} mb-3`}>Market Structure</p>
            <div className="space-y-2">{Object.entries(MARKET_STRUCTURES).map(([key, val]) => (
              <button key={key} onClick={() => setTrade({...trade, marketStructure: key})} className={`w-full flex items-center justify-between p-3 rounded-xl border ${trade.marketStructure === key ? 'border-indigo-500 bg-indigo-500/10' : theme.border}`}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: val.color + '20' }}><div className="w-full h-full flex items-center justify-center"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: val.color }}></div></div></div>
                  <div className="text-left"><p className={`text-sm font-medium ${theme.text}`}>{val.label}</p><p className={`text-[10px] ${theme.textFaint}`}>{val.description}</p></div>
                </div>
                {trade.marketStructure === key && <CheckCircle className="w-5 h-5 text-indigo-500" />}
              </button>
            ))}</div>
            <p className={`text-sm font-medium ${theme.text} mb-3 mt-5`}>Candle Type</p>
            <div className="grid grid-cols-2 gap-3">{Object.entries(CANDLE_TYPES).map(([key, val]) => (
              <button key={key} onClick={() => setTrade({...trade, candleType: key})} className={`p-3 rounded-xl border text-left ${trade.candleType === key ? 'border-indigo-500 bg-indigo-500/10' : theme.border}`}>
                <p className={`text-sm font-medium ${theme.text}`}>{val.label}</p><p className={`text-[10px] ${theme.textFaint}`}>{val.description}</p>
              </button>
            ))}</div>
          </>}

          {step === 3 && <>
            <div><p className={`text-sm font-medium ${theme.text} mb-2`}>Liquidity Taken</p><div className="flex flex-wrap gap-2">{LIQUIDITY_LEVELS.map(l => <button key={l.key} onClick={() => toggleLiq(l.key, 'taken')} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${trade.liquidityTaken.includes(l.key) ? 'bg-amber-500 text-white' : `${theme.dark ? 'bg-white/10' : 'bg-gray-100'} ${theme.textMuted}`}`}>{l.abbr}</button>)}</div></div>
            <div><p className={`text-sm font-medium ${theme.text} mb-2`}>Liquidity Target</p><div className="flex flex-wrap gap-2">{LIQUIDITY_LEVELS.map(l => <button key={l.key} onClick={() => toggleLiq(l.key, 'target')} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${trade.liquidityTarget.includes(l.key) ? 'bg-blue-500 text-white' : `${theme.dark ? 'bg-white/10' : 'bg-gray-100'} ${theme.textMuted}`}`}>{l.abbr}</button>)}</div></div>
            <div><label className={`text-sm font-medium ${theme.text}`}>Notes</label><textarea value={trade.notes} onChange={(e) => setTrade({...trade, notes: e.target.value})} rows={3} className={`w-full ${theme.input} border rounded-xl px-3 py-2 text-sm mt-2`} placeholder="Trade thesis..." /></div>
          </>}
        </div>

        <div className={`flex justify-between px-6 py-4 border-t ${theme.border}`}>
          <button onClick={() => step > 1 ? setStep(step - 1) : onClose()} className={`px-4 py-2 ${theme.textMuted}`}>{step > 1 ? 'Back' : 'Cancel'}</button>
          <button onClick={() => step < 3 ? setStep(step + 1) : handleSave()} className="btn-primary px-5 py-2 rounded-xl text-white text-sm font-medium">{step < 3 ? 'Continue' : 'Save Trade'}</button>
        </div>
      </div>
    </div>
  );
}

function NewAccountModal({ onClose, onSave }) {
  const theme = useTheme();
  const [acc, setAcc] = useState({ name: '', platform: 'MT5', broker: '', server: '', balance: '', equity: '' });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`${theme.card} rounded-2xl w-full max-w-md border ${theme.border}`}>
        <div className={`flex justify-between px-6 py-4 border-b ${theme.border}`}><h3 className={`font-semibold ${theme.text}`}>Add Account</h3><button onClick={onClose}><X className={`w-5 h-5 ${theme.textFaint}`} /></button></div>
        <div className="p-6 space-y-4">
          <div><label className={`text-xs ${theme.textMuted}`}>Platform</label><div className="flex gap-2 mt-1">{['MT5', 'cTrader'].map(p => <button key={p} onClick={() => setAcc({...acc, platform: p})} className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${acc.platform === p ? (p === 'MT5' ? 'bg-blue-500 text-white' : 'bg-purple-500 text-white') : `${theme.dark ? 'bg-white/10' : 'bg-gray-100'} ${theme.textMuted}`}`}>{p}</button>)}</div></div>
          <div><label className={`text-xs ${theme.textMuted}`}>Name</label><input value={acc.name} onChange={(e) => setAcc({...acc, name: e.target.value})} placeholder="Main Account" className={`w-full ${theme.input} border rounded-xl px-3 py-2 text-sm mt-1`} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={`text-xs ${theme.textMuted}`}>Broker</label><input value={acc.broker} onChange={(e) => setAcc({...acc, broker: e.target.value})} className={`w-full ${theme.input} border rounded-xl px-3 py-2 text-sm mt-1`} /></div>
            <div><label className={`text-xs ${theme.textMuted}`}>Server</label><input value={acc.server} onChange={(e) => setAcc({...acc, server: e.target.value})} className={`w-full ${theme.input} border rounded-xl px-3 py-2 text-sm mt-1`} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={`text-xs ${theme.textMuted}`}>Balance</label><input type="number" value={acc.balance} onChange={(e) => setAcc({...acc, balance: e.target.value})} className={`w-full ${theme.input} border rounded-xl px-3 py-2 text-sm mt-1`} /></div>
            <div><label className={`text-xs ${theme.textMuted}`}>Equity</label><input type="number" value={acc.equity} onChange={(e) => setAcc({...acc, equity: e.target.value})} className={`w-full ${theme.input} border rounded-xl px-3 py-2 text-sm mt-1`} /></div>
          </div>
        </div>
        <div className={`flex justify-end gap-3 px-6 py-4 border-t ${theme.border}`}>
          <button onClick={onClose} className={`px-4 py-2 ${theme.textMuted}`}>Cancel</button>
          <button onClick={() => onSave({ ...acc, balance: parseFloat(acc.balance) || 0, equity: parseFloat(acc.equity) || 0, connected: true })} className="btn-primary px-5 py-2 rounded-xl text-white text-sm font-medium">Add</button>
        </div>
      </div>
    </div>
  );
}

function TradeDetailModal({ trade, onClose, onDelete }) {
  const theme = useTheme();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`${theme.card} rounded-2xl w-full max-w-lg border ${theme.border}`}>
        <div className={`flex justify-between px-6 py-4 border-b ${theme.border}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${trade.pnl >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}><span className={`font-semibold ${trade.pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{trade.symbol?.slice(0, 2)}</span></div>
            <div><h3 className={`font-semibold ${theme.text}`}>{trade.symbol}</h3><p className={`text-xs ${theme.textFaint}`}>{trade.date}</p></div>
          </div>
          <button onClick={onClose}><X className={`w-5 h-5 ${theme.textFaint}`} /></button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex justify-between items-center">
            <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${trade.side === 'Long' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>{trade.side}</span>
            <span className={`text-2xl font-semibold ${trade.pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{trade.pnl >= 0 ? '+' : ''}${trade.pnl?.toFixed(2)}</span>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {[{ l: 'Entry', v: trade.entry }, { l: 'Exit', v: trade.exit }, { l: 'Lots', v: trade.lots }, { l: 'R:R', v: trade.riskReward }].map(x => (
              <div key={x.l} className={`${theme.dark ? 'bg-white/5' : 'bg-gray-50'} rounded-xl p-3 text-center`}><p className={`text-[10px] ${theme.textMuted} uppercase`}>{x.l}</p><p className={`text-sm font-semibold ${theme.text} mt-1`}>{x.v}</p></div>
            ))}
          </div>
          {(trade.commission || trade.swap) && <div className="grid grid-cols-2 gap-3">
            <div className={`${theme.dark ? 'bg-white/5' : 'bg-gray-50'} rounded-xl p-3`}><p className={`text-[10px] ${theme.textMuted} uppercase`}>Commission</p><p className="text-sm font-semibold text-red-500 mt-1">-${trade.commission?.toFixed(2)}</p></div>
            <div className={`${theme.dark ? 'bg-white/5' : 'bg-gray-50'} rounded-xl p-3`}><p className={`text-[10px] ${theme.textMuted} uppercase`}>Swap</p><p className={`text-sm font-semibold ${trade.swap >= 0 ? 'text-emerald-500' : 'text-red-500'} mt-1`}>{trade.swap >= 0 ? '+' : ''}${trade.swap?.toFixed(2)}</p></div>
          </div>}
          <div className={`flex justify-between p-3 rounded-xl ${theme.dark ? 'bg-white/5' : 'bg-gray-50'}`}><span className={`text-sm ${theme.textMuted}`}>Structure</span><span className="text-[10px] px-2 py-1 rounded text-white" style={{ backgroundColor: MARKET_STRUCTURES[trade.marketStructure]?.color }}>{MARKET_STRUCTURES[trade.marketStructure]?.label}</span></div>
          {trade.notes && <div><p className={`text-xs ${theme.textMuted} mb-2`}>Notes</p><p className={`text-sm ${theme.text} ${theme.dark ? 'bg-white/5' : 'bg-gray-50'} rounded-xl p-3`}>{trade.notes}</p></div>}
        </div>

        <div className={`flex justify-between px-6 py-4 border-t ${theme.border}`}>
          {!confirmDelete ? <>
            <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-2 px-4 py-2 text-red-500 hover:bg-red-500/10 rounded-xl text-sm"><Trash2 className="w-4 h-4" />Delete</button>
            <button onClick={onClose} className="btn-primary px-5 py-2 rounded-xl text-white text-sm font-medium">Close</button>
          </> : <>
            <p className={`text-sm ${theme.textMuted}`}>Delete trade?</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(false)} className={`px-4 py-2 ${theme.textMuted}`}>Cancel</button>
              <button onClick={() => onDelete(trade.id)} className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm">Confirm</button>
            </div>
          </>}
        </div>
      </div>
    </div>
  );
}
