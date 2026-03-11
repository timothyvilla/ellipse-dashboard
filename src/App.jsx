import React, { useState, useEffect, createContext, useContext } from 'react';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell } from 'recharts';
import { Plus, TrendingUp, TrendingDown, ChevronDown, Calendar, BarChart3, BookOpen, Wallet, CheckCircle, Clock, X, Eye, Database, ChevronLeft, ChevronRight, Trash2, Edit3, Moon, Sun, Settings, Link, Image, ExternalLink } from 'lucide-react';

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

// Symbol configurations - lotSize is contract size, pipSize is minimum pip movement
const SYMBOL_CONFIG = {
  // Forex - USD quote (pip value = $10 per standard lot)
  'EURUSD': { pipSize: 0.0001, lotSize: 100000, quoteUSD: true },
  'GBPUSD': { pipSize: 0.0001, lotSize: 100000, quoteUSD: true },
  'AUDUSD': { pipSize: 0.0001, lotSize: 100000, quoteUSD: true },
  'NZDUSD': { pipSize: 0.0001, lotSize: 100000, quoteUSD: true },
  // Forex - JPY quote (pip value = lotSize * pipSize / rate)
  'USDJPY': { pipSize: 0.01, lotSize: 100000, quoteJPY: true },
  'EURJPY': { pipSize: 0.01, lotSize: 100000, quoteJPY: true },
  'GBPJPY': { pipSize: 0.01, lotSize: 100000, quoteJPY: true },
  'AUDJPY': { pipSize: 0.01, lotSize: 100000, quoteJPY: true },
  'CADJPY': { pipSize: 0.01, lotSize: 100000, quoteJPY: true },
  'CHFJPY': { pipSize: 0.01, lotSize: 100000, quoteJPY: true },
  'NZDJPY': { pipSize: 0.01, lotSize: 100000, quoteJPY: true },
  // Forex - Other crosses
  'USDCAD': { pipSize: 0.0001, lotSize: 100000, quoteOther: true },
  'USDCHF': { pipSize: 0.0001, lotSize: 100000, quoteOther: true },
  'EURGBP': { pipSize: 0.0001, lotSize: 100000, quoteOther: true },
  'EURAUD': { pipSize: 0.0001, lotSize: 100000, quoteOther: true },
  'GBPAUD': { pipSize: 0.0001, lotSize: 100000, quoteOther: true },
  'AUDCAD': { pipSize: 0.0001, lotSize: 100000, quoteOther: true },
  // Gold - $1 per 0.01 move per 1 oz, standard lot = 100 oz
  'XAUUSD': { pipSize: 0.01, lotSize: 100, quoteUSD: true },
  // Indices - $1 per point per contract (varies by broker)
  'US30': { pipSize: 1, lotSize: 1, pointValue: 1 },
  'NAS100': { pipSize: 1, lotSize: 1, pointValue: 1 },
  'SPX500': { pipSize: 0.1, lotSize: 1, pointValue: 10 },
  'DEFAULT': { pipSize: 0.0001, lotSize: 100000, quoteUSD: true }
};

// Calculate pip value based on symbol and current price
const calculatePipValue = (symbol, exitPrice) => {
  const config = SYMBOL_CONFIG[symbol.toUpperCase()] || SYMBOL_CONFIG['DEFAULT'];
  
  if (config.quoteUSD) {
    // For XXX/USD pairs: pip value = pipSize * lotSize
    return config.pipSize * config.lotSize;
  } else if (config.quoteJPY) {
    // For XXX/JPY pairs: pip value = (pipSize * lotSize) / current rate
    const rate = parseFloat(exitPrice) || 150; // fallback to ~150 if no rate
    return (config.pipSize * config.lotSize) / rate;
  } else if (config.pointValue) {
    // For indices: fixed point value
    return config.pointValue;
  } else {
    // For other crosses, approximate (would need live rates for accuracy)
    return config.pipSize * config.lotSize * 0.75; // rough approximation
  }
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
    bg: darkMode ? '#0a0a0a' : '#f8fafc',
    card: darkMode ? '#111111' : '#ffffff',
    cardBorder: darkMode ? '#1f1f1f' : '#e2e8f0',
    text: darkMode ? '#f1f5f9' : '#0f172a',
    textMuted: darkMode ? '#94a3b8' : '#64748b',
    textFaint: darkMode ? '#64748b' : '#94a3b8',
    inputBg: darkMode ? '#1a1a1a' : '#ffffff',
    inputBorder: darkMode ? '#2a2a2a' : '#e2e8f0',
    hoverBg: darkMode ? '#1a1a1a' : '#f1f5f9',
  };

  const cardClass = `bg-[${theme.card}] border border-[${theme.cardBorder}] rounded-xl`;

  return (
    <ThemeContext.Provider value={theme}>
      <div className="min-h-screen" style={{ background: theme.bg, fontFamily: "'Inter', system-ui, sans-serif" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
          * { box-sizing: border-box; }
          .card { background: ${theme.card}; border: 1px solid ${theme.cardBorder}; border-radius: 12px; }
          .card-lg { background: ${theme.card}; border: 1px solid ${theme.cardBorder}; border-radius: 16px; }
          .input { background: ${theme.inputBg}; border: 1px solid ${theme.inputBorder}; border-radius: 10px; padding: 10px 14px; font-size: 14px; color: ${theme.text}; width: 100%; transition: border-color 0.15s; }
          .input:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1); }
          .input-sm { padding: 8px 12px; font-size: 13px; }
          .btn-primary { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; border: none; border-radius: 10px; padding: 10px 18px; font-size: 14px; font-weight: 500; cursor: pointer; transition: transform 0.15s, box-shadow 0.15s; }
          .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3); }
          .nav-item { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-radius: 10px; font-size: 14px; font-weight: 500; color: ${theme.textMuted}; cursor: pointer; transition: all 0.15s; }
          .nav-item:hover { background: ${theme.hoverBg}; }
          .nav-item.active { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; }
          .label { font-size: 12px; font-weight: 500; color: ${theme.textMuted}; margin-bottom: 6px; display: block; }
          .stat-value { font-size: 24px; font-weight: 700; color: ${theme.text}; }
          .stat-label { font-size: 11px; font-weight: 600; color: ${theme.textMuted}; text-transform: uppercase; letter-spacing: 0.5px; }
          .table-header { font-size: 11px; font-weight: 600; color: ${theme.textMuted}; text-transform: uppercase; letter-spacing: 0.5px; padding: 12px 16px; background: ${darkMode ? '#0f0f0f' : '#f8fafc'}; border-bottom: 1px solid ${theme.cardBorder}; }
          .table-row { padding: 14px 16px; border-bottom: 1px solid ${theme.cardBorder}; cursor: pointer; transition: background 0.15s; }
          .table-row:hover { background: ${theme.hoverBg}; }
          .table-row:last-child { border-bottom: none; }
          .badge { font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 6px; }
          .scrollbar::-webkit-scrollbar { width: 6px; }
          .scrollbar::-webkit-scrollbar-thumb { background: ${darkMode ? '#333' : '#ddd'}; border-radius: 3px; }
        `}</style>

        <div className="flex h-screen">
          {/* Sidebar */}
          <aside style={{ width: 240, background: theme.card, borderRight: `1px solid ${theme.cardBorder}` }} className="flex flex-col">
            <div style={{ padding: 20, borderBottom: `1px solid ${theme.cardBorder}` }}>
              <div className="flex items-center gap-3">
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', width: 22, height: 22, border: '2px solid rgba(255,255,255,0.9)', borderRadius: '50%', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}></div>
                  <div style={{ position: 'absolute', width: 10, height: 10, background: 'rgba(255,255,255,0.9)', borderRadius: '50%', top: 6, right: 6 }}></div>
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: theme.text }}>Ellipse</div>
                  <div style={{ fontSize: 11, color: theme.textFaint }}>Trading Journal</div>
                </div>
              </div>
            </div>

            <nav style={{ flex: 1, padding: 12 }}>
              {[
                { id: 'journal', label: 'Journal', icon: BookOpen },
                { id: 'analytics', label: 'Analytics', icon: BarChart3 },
                { id: 'accounts', label: 'Accounts', icon: Wallet },
                { id: 'calendar', label: 'Calendar', icon: Calendar },
              ].map(item => (
                <div key={item.id} onClick={() => setActiveTab(item.id)} className={`nav-item ${activeTab === item.id ? 'active' : ''}`}>
                  <item.icon size={18} />{item.label}
                </div>
              ))}
            </nav>

            <div style={{ padding: 12, borderTop: `1px solid ${theme.cardBorder}` }}>
              <div onClick={() => setDarkMode(!darkMode)} className="nav-item" style={{ justifyContent: 'space-between' }}>
                <span className="flex items-center gap-3">{darkMode ? <Moon size={18} /> : <Sun size={18} />}{darkMode ? 'Dark' : 'Light'}</span>
                <div style={{ width: 36, height: 20, borderRadius: 10, background: darkMode ? '#6366f1' : '#cbd5e1', position: 'relative' }}>
                  <div style={{ position: 'absolute', width: 16, height: 16, borderRadius: 8, background: 'white', top: 2, left: darkMode ? 18 : 2, transition: 'left 0.2s' }}></div>
                </div>
              </div>
              
              <div className="card" style={{ marginTop: 12, padding: 16 }}>
                <div className="stat-label">Today's P&L</div>
                <div className="stat-value" style={{ color: totalPnl >= 0 ? '#10b981' : '#ef4444', marginTop: 4 }}>
                  {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}
                </div>
                <div style={{ marginTop: 8, display: 'flex', gap: 12, fontSize: 12, color: theme.textMuted }}>
                  <span className="flex items-center gap-1"><span style={{ width: 6, height: 6, borderRadius: 3, background: '#10b981' }}></span>{winningTrades}W</span>
                  <span className="flex items-center gap-1"><span style={{ width: 6, height: 6, borderRadius: 3, background: '#ef4444' }}></span>{filteredTrades.length - winningTrades}L</span>
                </div>
              </div>
            </div>
          </aside>

          {/* Main */}
          <main className="flex-1 overflow-hidden flex flex-col">
            <header style={{ background: theme.card, borderBottom: `1px solid ${theme.cardBorder}`, padding: '16px 24px' }}>
              <div className="flex items-center justify-between">
                <div>
                  <h1 style={{ fontSize: 18, fontWeight: 600, color: theme.text }}>
                    {activeTab === 'journal' && 'Trading Journal'}
                    {activeTab === 'analytics' && 'Analytics'}
                    {activeTab === 'accounts' && 'Accounts'}
                    {activeTab === 'calendar' && 'Calendar'}
                  </h1>
                  <p style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>
                    {activeTab === 'journal' && 'Document and analyze your trades'}
                    {activeTab === 'analytics' && 'Performance metrics and insights'}
                    {activeTab === 'accounts' && 'Manage trading accounts'}
                    {activeTab === 'calendar' && 'Visual trade history'}
                  </p>
                </div>
                <div className="flex gap-3">
                  {activeTab === 'journal' && <button onClick={() => setShowNewTrade(true)} className="btn-primary flex items-center gap-2"><Plus size={16} />Log Trade</button>}
                  {activeTab === 'accounts' && <button onClick={() => setShowNewAccount(true)} className="btn-primary flex items-center gap-2"><Plus size={16} />Add Account</button>}
                </div>
              </div>
            </header>

            <div className="flex-1 overflow-auto scrollbar" style={{ padding: 24 }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="flex gap-3">
        <select value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)} className="input input-sm" style={{ width: 200 }}>
          <option value="all">All Accounts</option>
          {accounts.map(acc => <option key={acc.id} value={acc.name}>{acc.name}</option>)}
        </select>
      </div>

      <div className="card-lg" style={{ overflow: 'hidden' }}>
        <div className="table-header" style={{ display: 'grid', gridTemplateColumns: '1.5fr 80px 100px 80px 100px 50px', gap: 12 }}>
          <div>Trade</div><div>Side</div><div>Structure</div><div>Lots</div><div style={{ textAlign: 'right' }}>P&L</div><div></div>
        </div>
        
        {filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <BookOpen size={40} style={{ color: theme.textFaint, margin: '0 auto 12px', opacity: 0.5 }} />
            <p style={{ fontSize: 14, color: theme.textMuted }}>No trades logged yet</p>
            <p style={{ fontSize: 13, color: theme.textFaint, marginTop: 4 }}>Click "Log Trade" to get started</p>
          </div>
        ) : filtered.map(trade => (
          <div key={trade.id} onClick={() => onSelectTrade(trade)} className="table-row" style={{ display: 'grid', gridTemplateColumns: '1.5fr 80px 100px 80px 100px 50px', gap: 12, alignItems: 'center' }}>
            <div className="flex items-center gap-3">
              <div style={{ width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, background: trade.pnl >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: trade.pnl >= 0 ? '#10b981' : '#ef4444' }}>
                {trade.symbol?.slice(0, 2)}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: theme.text }}>{trade.symbol}</div>
                <div style={{ fontSize: 12, color: theme.textFaint }}>{trade.date}</div>
              </div>
              {trade.chartLink && <ExternalLink size={14} style={{ color: theme.textFaint }} />}
            </div>
            <span className="badge" style={{ background: trade.side === 'Long' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: trade.side === 'Long' ? '#10b981' : '#ef4444' }}>{trade.side}</span>
            <span className="badge" style={{ background: MARKET_STRUCTURES[trade.marketStructure]?.color, color: 'white' }}>{trade.marketStructure?.replace('_', ' ').slice(0, 8)}</span>
            <span style={{ fontSize: 14, color: theme.text }}>{trade.lots}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: trade.pnl >= 0 ? '#10b981' : '#ef4444', textAlign: 'right' }}>{trade.pnl >= 0 ? '+' : ''}${trade.pnl?.toFixed(2)}</span>
            <Eye size={16} style={{ color: theme.textFaint }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalyticsView({ trades, accounts, selectedAccount, setSelectedAccount }) {
  const theme = useTheme();
  const filtered = selectedAccount === 'all' ? trades : trades.filter(t => t.account === selectedAccount);
  
  // Basic stats
  const totalTrades = filtered.length;
  const wins = filtered.filter(t => t.pnl > 0);
  const losses = filtered.filter(t => t.pnl < 0);
  const profitableTrades = wins.length;
  const totalPnl = filtered.reduce((s, t) => s + t.pnl, 0);
  const winRate = totalTrades > 0 ? ((wins.length / totalTrades) * 100).toFixed(1) : 0;
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;
  
  // Profit Factor
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : grossProfit > 0 ? '∞' : '0.00';
  
  // Sharpe Ratio (simplified - using daily returns)
  const returns = filtered.map(t => t.pnl);
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdDev = returns.length > 1 ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1)) : 0;
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev * Math.sqrt(252)).toFixed(2) : '0.00';
  
  // Max Drawdown
  let peak = 0, maxDrawdown = 0, runningPnl = 0;
  filtered.forEach(t => {
    runningPnl += t.pnl;
    if (runningPnl > peak) peak = runningPnl;
    const drawdown = peak - runningPnl;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  });

  const structureStats = Object.keys(MARKET_STRUCTURES).map(key => ({
    name: MARKET_STRUCTURES[key].label,
    trades: filtered.filter(t => t.marketStructure === key).length,
    pnl: filtered.filter(t => t.marketStructure === key).reduce((s, t) => s + t.pnl, 0),
    winRate: filtered.filter(t => t.marketStructure === key).length > 0 ? (filtered.filter(t => t.marketStructure === key && t.pnl > 0).length / filtered.filter(t => t.marketStructure === key).length * 100).toFixed(0) : 0,
    color: MARKET_STRUCTURES[key].color
  })).filter(s => s.trades > 0);

  const metrics = [
    { label: 'Total P&L', value: `$${totalPnl.toFixed(2)}`, color: totalPnl >= 0 ? '#10b981' : '#ef4444' },
    { label: 'Win Rate', value: `${winRate}%`, color: parseFloat(winRate) >= 50 ? '#10b981' : '#ef4444' },
    { label: 'Profit Factor', value: profitFactor, color: parseFloat(profitFactor) >= 1.5 ? '#10b981' : parseFloat(profitFactor) >= 1 ? '#f59e0b' : '#ef4444' },
    { label: 'Sharpe Ratio', value: sharpeRatio, color: parseFloat(sharpeRatio) >= 1 ? '#10b981' : '#ef4444' },
    { label: 'Max Drawdown', value: `$${maxDrawdown.toFixed(2)}`, color: '#ef4444' },
    { label: 'Total Trades', value: totalTrades, color: theme.text },
    { label: 'Profitable', value: profitableTrades, color: '#10b981' },
    { label: 'Avg Win', value: `$${avgWin.toFixed(2)}`, color: '#10b981' },
    { label: 'Avg Loss', value: `$${avgLoss.toFixed(2)}`, color: '#ef4444' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="flex items-center gap-3">
        <span style={{ fontSize: 13, color: theme.textMuted }}>Analytics for:</span>
        <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)} className="input input-sm" style={{ width: 200, fontWeight: 500 }}>
          <option value="all">All Accounts</option>
          {accounts.map(acc => <option key={acc.id} value={acc.name}>{acc.name}</option>)}
        </select>
      </div>

      {/* Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {metrics.map((m, i) => (
          <div key={i} className="card" style={{ padding: 20 }}>
            <div className="stat-label">{m.label}</div>
            <div className="stat-value" style={{ color: m.color, marginTop: 6 }}>{m.value}</div>
          </div>
        ))}
      </div>

      {totalTrades === 0 ? (
        <div className="card" style={{ padding: 60, textAlign: 'center' }}>
          <BarChart3 size={40} style={{ color: theme.textFaint, margin: '0 auto 12px', opacity: 0.5 }} />
          <p style={{ fontSize: 14, color: theme.textMuted }}>No trades to analyze</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginBottom: 16 }}>Performance by Structure</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {structureStats.map(s => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 10, background: theme.dark ? '#0f0f0f' : '#f8fafc' }}>
                <div className="flex items-center gap-3">
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 13, fontWeight: 600 }}>{s.trades}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: theme.text }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: theme.textMuted }}>{s.winRate}% win rate</div>
                  </div>
                </div>
                <span style={{ fontSize: 14, fontWeight: 600, color: s.pnl >= 0 ? '#10b981' : '#ef4444' }}>{s.pnl >= 0 ? '+' : ''}${s.pnl.toFixed(2)}</span>
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

  const totals = {
    balance: accounts.reduce((s, a) => s + a.balance, 0),
    equity: accounts.reduce((s, a) => s + a.equity, 0)
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="stat-label">Total Balance</div>
          <div className="stat-value" style={{ marginTop: 6 }}>${totals.balance.toLocaleString()}</div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div className="stat-label">Total Equity</div>
          <div className="stat-value" style={{ color: '#10b981', marginTop: 6 }}>${totals.equity.toLocaleString()}</div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div className="stat-label">Accounts</div>
          <div className="stat-value" style={{ marginTop: 6 }}>{accounts.length}</div>
        </div>
      </div>

      <div className="card-lg" style={{ overflow: 'hidden' }}>
        {accounts.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <Database size={40} style={{ color: theme.textFaint, margin: '0 auto 12px', opacity: 0.5 }} />
            <p style={{ fontSize: 14, color: theme.textMuted }}>No accounts yet</p>
          </div>
        ) : accounts.map(acc => (
          <div key={acc.id} className="table-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="flex items-center gap-3">
              <div style={{ width: 44, height: 44, borderRadius: 10, background: acc.platform === 'MT5' ? 'rgba(59,130,246,0.1)' : 'rgba(139,92,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Database size={20} style={{ color: acc.platform === 'MT5' ? '#3b82f6' : '#8b5cf6' }} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: theme.text }}>{acc.name}</div>
                <div style={{ fontSize: 12, color: theme.textFaint }}>{acc.broker} · {acc.server}</div>
              </div>
            </div>
            <div className="flex items-center gap-8">
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>${acc.balance.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: theme.textFaint }}>Balance</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: acc.equity >= acc.balance ? '#10b981' : '#ef4444' }}>${acc.equity.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: theme.textFaint }}>Equity</div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => setEditAcc(acc)} style={{ padding: 8, borderRadius: 8, background: 'transparent', border: 'none', cursor: 'pointer' }} className="hover:bg-indigo-500/10"><Edit3 size={16} style={{ color: theme.textFaint }} /></button>
                <button onClick={() => setDeleteId(acc.id)} style={{ padding: 8, borderRadius: 8, background: 'transparent', border: 'none', cursor: 'pointer' }} className="hover:bg-red-500/10"><Trash2 size={16} style={{ color: theme.textFaint }} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editAcc && <EditAccountModal account={editAcc} onClose={() => setEditAcc(null)} onSave={(updated) => { setAccounts(accounts.map(a => a.id === updated.id ? updated : a)); setEditAcc(null); }} />}
      
      {deleteId && (
        <Modal onClose={() => setDeleteId(null)}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: theme.text, marginBottom: 8 }}>Remove Account?</h3>
          <p style={{ fontSize: 14, color: theme.textMuted, marginBottom: 20 }}>This will remove {accounts.find(a => a.id === deleteId)?.name}</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteId(null)} className="input" style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }}>Cancel</button>
            <button onClick={() => { setAccounts(accounts.filter(a => a.id !== deleteId)); setDeleteId(null); }} className="btn-primary" style={{ flex: 1, background: '#ef4444' }}>Remove</button>
          </div>
        </Modal>
      )}
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="flex items-center justify-between">
        <h3 style={{ fontSize: 16, fontWeight: 600, color: theme.text }}>{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h3>
        <div className="flex gap-2">
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1))} style={{ padding: 8, borderRadius: 8, background: theme.hoverBg, border: 'none', cursor: 'pointer' }}><ChevronLeft size={18} style={{ color: theme.textMuted }} /></button>
          <button onClick={() => setMonth(new Date())} style={{ padding: '8px 14px', fontSize: 13, color: theme.textMuted, background: theme.hoverBg, border: 'none', borderRadius: 8, cursor: 'pointer' }}>Today</button>
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1))} style={{ padding: 8, borderRadius: 8, background: theme.hoverBg, border: 'none', cursor: 'pointer' }}><ChevronRight size={18} style={{ color: theme.textMuted }} /></button>
        </div>
      </div>

      <div className="card-lg" style={{ overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="table-header" style={{ textAlign: 'center', padding: 12 }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {days.map((day, i) => {
            const dayTrades = getTradesForDay(day);
            const pnl = dayTrades.reduce((s, t) => s + t.pnl, 0);
            return (
              <div key={i} style={{ minHeight: 90, padding: 10, borderBottom: `1px solid ${theme.cardBorder}`, borderRight: `1px solid ${theme.cardBorder}`, background: !day ? (theme.dark ? '#0a0a0a' : '#f8fafc') : 'transparent' }}>
                {day && <>
                  <div style={{ fontSize: 13, color: theme.textMuted }}>{day}</div>
                  {dayTrades.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: pnl >= 0 ? '#10b981' : '#ef4444' }}>{pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}</div>
                      <div style={{ fontSize: 11, color: theme.textFaint }}>{dayTrades.length} trade{dayTrades.length > 1 ? 's' : ''}</div>
                    </div>
                  )}
                </>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Modal({ children, onClose, width = 420 }) {
  const theme = useTheme();
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
      <div className="card-lg" style={{ width: '100%', maxWidth: width, maxHeight: '90vh', overflow: 'auto' }}>
        {children}
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
    account: accounts[0]?.name || '',
    chartLink: '', chartImage: ''
  });

  useEffect(() => {
    if (trade.entry && trade.exit && trade.lots && trade.symbol) {
      const config = SYMBOL_CONFIG[trade.symbol.toUpperCase()] || SYMBOL_CONFIG['DEFAULT'];
      const entry = parseFloat(trade.entry), exit = parseFloat(trade.exit), lots = parseFloat(trade.lots);
      const commission = parseFloat(trade.commission) || 0, swap = parseFloat(trade.swap) || 0;
      if (!isNaN(entry) && !isNaN(exit) && !isNaN(lots)) {
        const diff = trade.side === 'Long' ? exit - entry : entry - exit;
        const pips = diff / config.pipSize;
        const pipValue = calculatePipValue(trade.symbol, exit);
        const gross = pips * pipValue * lots;
        setTrade(prev => ({ ...prev, pnl: gross - commission + swap }));
      }
    }
  }, [trade.entry, trade.exit, trade.lots, trade.symbol, trade.side, trade.commission, trade.swap]);

  const handleSave = () => {
    const rr = trade.stopLoss && trade.takeProfit && trade.entry
      ? `1:${Math.abs((parseFloat(trade.takeProfit) - parseFloat(trade.entry)) / (parseFloat(trade.entry) - parseFloat(trade.stopLoss))).toFixed(1)}` : '-';
    onSave({ ...trade, entry: parseFloat(trade.entry), exit: parseFloat(trade.exit), lots: parseFloat(trade.lots), stopLoss: parseFloat(trade.stopLoss) || 0, takeProfit: parseFloat(trade.takeProfit) || 0, commission: parseFloat(trade.commission) || 0, swap: parseFloat(trade.swap) || 0, riskReward: rr });
  };

  const toggleLiq = (key, type) => {
    const field = type === 'taken' ? 'liquidityTaken' : 'liquidityTarget';
    setTrade(prev => ({ ...prev, [field]: prev[field].includes(key) ? prev[field].filter(k => k !== key) : [...prev[field], key] }));
  };

  return (
    <Modal width={520} onClose={onClose}>
      <div style={{ padding: 20, borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: theme.text }}>Log Trade</h3>
          <p style={{ fontSize: 12, color: theme.textFaint }}>Step {step} of 3</p>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={20} style={{ color: theme.textFaint }} /></button>
      </div>

      <div style={{ padding: 20, maxHeight: '60vh', overflow: 'auto' }} className="scrollbar">
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label className="label">Date</label><input type="date" value={trade.date} onChange={(e) => setTrade({...trade, date: e.target.value})} className="input" /></div>
              <div><label className="label">Time</label><input type="time" value={trade.time} onChange={(e) => setTrade({...trade, time: e.target.value})} className="input" /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label className="label">Symbol</label><input value={trade.symbol} onChange={(e) => setTrade({...trade, symbol: e.target.value.toUpperCase()})} placeholder="EURUSD" className="input" /></div>
              <div><label className="label">Account</label><select value={trade.account} onChange={(e) => setTrade({...trade, account: e.target.value})} className="input">{accounts.length === 0 ? <option>No accounts</option> : accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}</select></div>
            </div>
            <div>
              <label className="label">Side</label>
              <div className="flex gap-2">{['Long', 'Short'].map(s => (
                <button key={s} onClick={() => setTrade({...trade, side: s})} style={{ flex: 1, padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 500, border: 'none', cursor: 'pointer', background: trade.side === s ? (s === 'Long' ? '#10b981' : '#ef4444') : theme.hoverBg, color: trade.side === s ? 'white' : theme.textMuted }}>{s}</button>
              ))}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div><label className="label">Entry</label><input type="number" step="any" value={trade.entry} onChange={(e) => setTrade({...trade, entry: e.target.value})} className="input" /></div>
              <div><label className="label">Exit</label><input type="number" step="any" value={trade.exit} onChange={(e) => setTrade({...trade, exit: e.target.value})} className="input" /></div>
              <div><label className="label">Lots</label><input type="number" step="0.01" value={trade.lots} onChange={(e) => setTrade({...trade, lots: e.target.value})} className="input" /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label className="label">Stop Loss</label><input type="number" step="any" value={trade.stopLoss} onChange={(e) => setTrade({...trade, stopLoss: e.target.value})} className="input" /></div>
              <div><label className="label">Take Profit</label><input type="number" step="any" value={trade.takeProfit} onChange={(e) => setTrade({...trade, takeProfit: e.target.value})} className="input" /></div>
            </div>
            <div style={{ padding: 16, borderRadius: 10, background: theme.hoverBg }}>
              <div className="flex items-center gap-2" style={{ marginBottom: 12 }}><Settings size={14} style={{ color: theme.textMuted }} /><span style={{ fontSize: 12, fontWeight: 500, color: theme.textMuted }}>Fees & Adjustments</span></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label className="label">Commission ($)</label><input type="number" step="0.01" value={trade.commission} onChange={(e) => setTrade({...trade, commission: e.target.value})} placeholder="0.00" className="input" /></div>
                <div><label className="label">Swap ($)</label><input type="number" step="0.01" value={trade.swap} onChange={(e) => setTrade({...trade, swap: e.target.value})} placeholder="0.00" className="input" /></div>
              </div>
            </div>
            <div style={{ padding: 16, borderRadius: 10, background: trade.pnl >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' }}>
              <div className="flex justify-between items-center">
                <span style={{ fontSize: 13, color: theme.textMuted }}>Calculated P&L</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: trade.pnl >= 0 ? '#10b981' : '#ef4444' }}>{trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <label className="label" style={{ marginBottom: 12 }}>Market Structure</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Object.entries(MARKET_STRUCTURES).map(([key, val]) => (
                  <button key={key} onClick={() => setTrade({...trade, marketStructure: key})} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 10, border: `1px solid ${trade.marketStructure === key ? '#6366f1' : theme.cardBorder}`, background: trade.marketStructure === key ? 'rgba(99,102,241,0.1)' : 'transparent', cursor: 'pointer' }}>
                    <div className="flex items-center gap-3">
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: val.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: 10, height: 10, borderRadius: 5, background: val.color }}></div></div>
                      <div style={{ textAlign: 'left' }}><div style={{ fontSize: 14, fontWeight: 500, color: theme.text }}>{val.label}</div><div style={{ fontSize: 12, color: theme.textFaint }}>{val.description}</div></div>
                    </div>
                    {trade.marketStructure === key && <CheckCircle size={20} style={{ color: '#6366f1' }} />}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label" style={{ marginBottom: 12 }}>Candle Type</label>
              <div className="flex gap-3">{Object.entries(CANDLE_TYPES).map(([key, val]) => (
                <button key={key} onClick={() => setTrade({...trade, candleType: key})} style={{ flex: 1, padding: 14, borderRadius: 10, border: `1px solid ${trade.candleType === key ? '#6366f1' : theme.cardBorder}`, background: trade.candleType === key ? 'rgba(99,102,241,0.1)' : 'transparent', textAlign: 'left', cursor: 'pointer' }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: theme.text }}>{val.label}</div>
                  <div style={{ fontSize: 12, color: theme.textFaint }}>{val.description}</div>
                </button>
              ))}</div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <label className="label" style={{ marginBottom: 8 }}>Liquidity Taken</label>
              <div className="flex flex-wrap gap-2">{LIQUIDITY_LEVELS.map(l => (
                <button key={l.key} onClick={() => toggleLiq(l.key, 'taken')} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer', background: trade.liquidityTaken.includes(l.key) ? '#f59e0b' : theme.hoverBg, color: trade.liquidityTaken.includes(l.key) ? 'white' : theme.textMuted }}>{l.abbr}</button>
              ))}</div>
            </div>
            <div>
              <label className="label" style={{ marginBottom: 8 }}>Liquidity Target</label>
              <div className="flex flex-wrap gap-2">{LIQUIDITY_LEVELS.map(l => (
                <button key={l.key} onClick={() => toggleLiq(l.key, 'target')} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer', background: trade.liquidityTarget.includes(l.key) ? '#3b82f6' : theme.hoverBg, color: trade.liquidityTarget.includes(l.key) ? 'white' : theme.textMuted }}>{l.abbr}</button>
              ))}</div>
            </div>
            
            {/* Chart Link/Embed Section */}
            <div style={{ padding: 16, borderRadius: 10, background: theme.hoverBg }}>
              <div className="flex items-center gap-2" style={{ marginBottom: 12 }}><Link size={14} style={{ color: theme.textMuted }} /><span style={{ fontSize: 12, fontWeight: 500, color: theme.textMuted }}>Chart Reference</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div><label className="label">TradingView Link</label><input value={trade.chartLink} onChange={(e) => setTrade({...trade, chartLink: e.target.value})} placeholder="https://www.tradingview.com/chart/..." className="input" /></div>
                <div><label className="label">Chart Image URL</label><input value={trade.chartImage} onChange={(e) => setTrade({...trade, chartImage: e.target.value})} placeholder="https://i.imgur.com/..." className="input" /></div>
              </div>
              {trade.chartImage && (
                <div style={{ marginTop: 12, borderRadius: 8, overflow: 'hidden', border: `1px solid ${theme.cardBorder}` }}>
                  <img src={trade.chartImage} alt="Chart" style={{ width: '100%', height: 150, objectFit: 'cover' }} onError={(e) => e.target.style.display = 'none'} />
                </div>
              )}
            </div>

            <div>
              <label className="label">Notes</label>
              <textarea value={trade.notes} onChange={(e) => setTrade({...trade, notes: e.target.value})} rows={3} className="input" placeholder="Trade thesis, observations..." style={{ resize: 'none' }} />
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: 20, borderTop: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={() => step > 1 ? setStep(step - 1) : onClose()} style={{ background: 'none', border: 'none', fontSize: 14, color: theme.textMuted, cursor: 'pointer' }}>{step > 1 ? 'Back' : 'Cancel'}</button>
        <button onClick={() => step < 3 ? setStep(step + 1) : handleSave()} className="btn-primary">{step < 3 ? 'Continue' : 'Save Trade'}</button>
      </div>
    </Modal>
  );
}

function NewAccountModal({ onClose, onSave }) {
  const theme = useTheme();
  const [acc, setAcc] = useState({ name: '', platform: 'MT5', broker: '', server: '', balance: '', equity: '' });

  return (
    <Modal onClose={onClose}>
      <div style={{ padding: 20, borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: theme.text }}>Add Account</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} style={{ color: theme.textFaint }} /></button>
      </div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label className="label">Platform</label>
          <div className="flex gap-2">{['MT5', 'cTrader'].map(p => (
            <button key={p} onClick={() => setAcc({...acc, platform: p})} style={{ flex: 1, padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 500, border: 'none', cursor: 'pointer', background: acc.platform === p ? (p === 'MT5' ? '#3b82f6' : '#8b5cf6') : theme.hoverBg, color: acc.platform === p ? 'white' : theme.textMuted }}>{p}</button>
          ))}</div>
        </div>
        <div><label className="label">Account Name</label><input value={acc.name} onChange={(e) => setAcc({...acc, name: e.target.value})} placeholder="Main Account" className="input" /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label className="label">Broker</label><input value={acc.broker} onChange={(e) => setAcc({...acc, broker: e.target.value})} placeholder="ICMarkets" className="input" /></div>
          <div><label className="label">Server</label><input value={acc.server} onChange={(e) => setAcc({...acc, server: e.target.value})} placeholder="Live-01" className="input" /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label className="label">Balance</label><input type="number" value={acc.balance} onChange={(e) => setAcc({...acc, balance: e.target.value})} placeholder="10000" className="input" /></div>
          <div><label className="label">Equity</label><input type="number" value={acc.equity} onChange={(e) => setAcc({...acc, equity: e.target.value})} placeholder="10000" className="input" /></div>
        </div>
      </div>
      <div style={{ padding: 20, borderTop: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 14, color: theme.textMuted, cursor: 'pointer' }}>Cancel</button>
        <button onClick={() => onSave({ ...acc, balance: parseFloat(acc.balance) || 0, equity: parseFloat(acc.equity) || 0, connected: true })} className="btn-primary">Add Account</button>
      </div>
    </Modal>
  );
}

function EditAccountModal({ account, onClose, onSave }) {
  const theme = useTheme();
  const [data, setData] = useState({ ...account, balance: account.balance.toString(), equity: account.equity.toString() });

  return (
    <Modal onClose={onClose}>
      <div style={{ padding: 20, borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: theme.text }}>Edit Account</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} style={{ color: theme.textFaint }} /></button>
      </div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div><label className="label">Name</label><input value={data.name} onChange={(e) => setData({...data, name: e.target.value})} className="input" /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label className="label">Balance</label><input type="number" value={data.balance} onChange={(e) => setData({...data, balance: e.target.value})} className="input" /></div>
          <div><label className="label">Equity</label><input type="number" value={data.equity} onChange={(e) => setData({...data, equity: e.target.value})} className="input" /></div>
        </div>
      </div>
      <div style={{ padding: 20, borderTop: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 14, color: theme.textMuted, cursor: 'pointer' }}>Cancel</button>
        <button onClick={() => onSave({ ...data, balance: parseFloat(data.balance) || 0, equity: parseFloat(data.equity) || 0 })} className="btn-primary">Save</button>
      </div>
    </Modal>
  );
}

function TradeDetailModal({ trade, onClose, onDelete }) {
  const theme = useTheme();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <Modal width={520} onClose={onClose}>
      <div style={{ padding: 20, borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="flex items-center gap-3">
          <div style={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: trade.pnl >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: trade.pnl >= 0 ? '#10b981' : '#ef4444' }}>{trade.symbol?.slice(0, 2)}</span>
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: theme.text }}>{trade.symbol}</div>
            <div style={{ fontSize: 12, color: theme.textFaint }}>{trade.date} · {trade.time}</div>
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} style={{ color: theme.textFaint }} /></button>
      </div>

      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="flex justify-between items-center">
          <span className="badge" style={{ background: trade.side === 'Long' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: trade.side === 'Long' ? '#10b981' : '#ef4444', padding: '8px 14px', fontSize: 13 }}>{trade.side}</span>
          <span style={{ fontSize: 24, fontWeight: 700, color: trade.pnl >= 0 ? '#10b981' : '#ef4444' }}>{trade.pnl >= 0 ? '+' : ''}${trade.pnl?.toFixed(2)}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {[{ l: 'Entry', v: trade.entry }, { l: 'Exit', v: trade.exit }, { l: 'Lots', v: trade.lots }, { l: 'R:R', v: trade.riskReward }].map(x => (
            <div key={x.l} style={{ padding: 14, borderRadius: 10, background: theme.hoverBg, textAlign: 'center' }}>
              <div className="stat-label">{x.l}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginTop: 4 }}>{x.v}</div>
            </div>
          ))}
        </div>

        {(trade.commission || trade.swap) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ padding: 14, borderRadius: 10, background: theme.hoverBg }}><div className="stat-label">Commission</div><div style={{ fontSize: 14, fontWeight: 600, color: '#ef4444', marginTop: 4 }}>-${trade.commission?.toFixed(2)}</div></div>
            <div style={{ padding: 14, borderRadius: 10, background: theme.hoverBg }}><div className="stat-label">Swap</div><div style={{ fontSize: 14, fontWeight: 600, color: trade.swap >= 0 ? '#10b981' : '#ef4444', marginTop: 4 }}>{trade.swap >= 0 ? '+' : ''}${trade.swap?.toFixed(2)}</div></div>
          </div>
        )}

        <div style={{ padding: 14, borderRadius: 10, background: theme.hoverBg, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: theme.textMuted }}>Structure</span>
          <span className="badge" style={{ background: MARKET_STRUCTURES[trade.marketStructure]?.color, color: 'white' }}>{MARKET_STRUCTURES[trade.marketStructure]?.label}</span>
        </div>

        {/* Chart Section */}
        {(trade.chartLink || trade.chartImage) && (
          <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${theme.cardBorder}` }}>
            {trade.chartImage && <img src={trade.chartImage} alt="Chart" style={{ width: '100%', height: 180, objectFit: 'cover' }} />}
            {trade.chartLink && (
              <a href={trade.chartLink} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 14, fontSize: 13, color: '#6366f1', textDecoration: 'none', background: theme.hoverBg }}>
                <ExternalLink size={14} />Open in TradingView
              </a>
            )}
          </div>
        )}

        {trade.notes && (
          <div>
            <div className="stat-label" style={{ marginBottom: 8 }}>Notes</div>
            <p style={{ fontSize: 14, color: theme.text, padding: 14, borderRadius: 10, background: theme.hoverBg }}>{trade.notes}</p>
          </div>
        )}
      </div>

      <div style={{ padding: 20, borderTop: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between' }}>
        {!confirmDelete ? <>
          <button onClick={() => setConfirmDelete(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', fontSize: 14, color: '#ef4444', cursor: 'pointer' }}><Trash2 size={16} />Delete</button>
          <button onClick={onClose} className="btn-primary">Close</button>
        </> : <>
          <span style={{ fontSize: 14, color: theme.textMuted }}>Delete this trade?</span>
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(false)} style={{ background: 'none', border: 'none', fontSize: 14, color: theme.textMuted, cursor: 'pointer' }}>Cancel</button>
            <button onClick={() => onDelete(trade.id)} className="btn-primary" style={{ background: '#ef4444' }}>Delete</button>
          </div>
        </>}
      </div>
    </Modal>
  );
}
