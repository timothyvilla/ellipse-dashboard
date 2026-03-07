import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell } from 'recharts';
import { Plus, TrendingUp, TrendingDown, ChevronDown, Calendar, BarChart3, BookOpen, Link2, Wallet, Activity, CheckCircle, Clock, ArrowUpRight, ArrowDownRight, Search, X, Eye, RefreshCw, Database, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';

// Market Structure Types - Based on Price Action (No EMAs)
const MARKET_STRUCTURES = {
  TRENDING_BULLISH: { label: 'Trending Bullish', color: '#10B981', description: 'Higher Highs + Higher Lows' },
  TRENDING_BEARISH: { label: 'Trending Bearish', color: '#EF4444', description: 'Lower Highs + Lower Lows' },
  REVERSING_BULLISH: { label: 'Reversal to Bullish', color: '#3B82F6', description: 'Break of Lower High after downtrend' },
  REVERSING_BEARISH: { label: 'Reversal to Bearish', color: '#F59E0B', description: 'Break of Higher Low after uptrend' },
  CHOPPY: { label: 'Choppy/Range', color: '#8B5CF6', description: 'No clear HH/HL or LH/LL sequence' }
};

// Candle Types
const CANDLE_TYPES = {
  OHLC: { label: 'OHLC (Bullish)', description: 'Open → Low → High → Close', color: '#10B981' },
  OLHC: { label: 'OLHC (Bearish)', description: 'Open → High → Low → Close', color: '#EF4444' }
};

// Liquidity Levels
const LIQUIDITY_LEVELS = [
  { key: 'prevSessionHigh', label: 'Previous Session High', abbr: 'PSH' },
  { key: 'prevSessionLow', label: 'Previous Session Low', abbr: 'PSL' },
  { key: 'prevDailyHigh', label: 'Previous Daily High', abbr: 'PDH' },
  { key: 'prevDailyLow', label: 'Previous Daily Low', abbr: 'PDL' },
  { key: 'prevWeeklyHigh', label: 'Previous Weekly High', abbr: 'PWH' },
  { key: 'prevWeeklyLow', label: 'Previous Weekly Low', abbr: 'PWL' },
  { key: 'prevMonthlyHigh', label: 'Previous Monthly High', abbr: 'PMH' },
  { key: 'prevMonthlyLow', label: 'Previous Monthly Low', abbr: 'PML' },
  { key: 'trueDayOpen', label: 'True Day Open', abbr: 'TDO' }
];

// Start with empty trades - your journal begins fresh
const sampleTrades = [];

const sampleAccounts = [
  { id: 1, name: 'MT5 - Main', platform: 'MT5', broker: 'ICMarkets', balance: 25420.50, equity: 25890.30, connected: true, lastSync: '2024-05-10 15:30', server: 'ICMarkets-Live' },
  { id: 2, name: 'cTrader - Prop', platform: 'cTrader', broker: 'FTMO', balance: 100000.00, equity: 102350.00, connected: true, lastSync: '2024-05-10 15:28', server: 'FTMO-Live' },
  { id: 3, name: 'MT5 - Backup', platform: 'MT5', broker: 'Pepperstone', balance: 5000.00, equity: 5120.00, connected: false, lastSync: '2024-05-08 09:15', server: 'Pepperstone-Edge' }
];

const performanceData = [
  { date: 'Mon', pnl: 330, trades: 3, winRate: 66 },
  { date: 'Tue', pnl: -120, trades: 2, winRate: 50 },
  { date: 'Wed', pnl: 450, trades: 4, winRate: 75 },
  { date: 'Thu', pnl: 280, trades: 3, winRate: 100 },
  { date: 'Fri', pnl: -85, trades: 2, winRate: 50 }
];

export default function TradingJournal() {
  const [activeTab, setActiveTab] = useState('journal');
  const [trades, setTrades] = useState(sampleTrades);
  const [accounts, setAccounts] = useState(sampleAccounts);
  const [showNewTrade, setShowNewTrade] = useState(false);
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [filterAccount, setFilterAccount] = useState('all');

  const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
  const winningTrades = trades.filter(t => t.pnl > 0).length;

  return (
    <div className="min-h-screen bg-[#FAFBFC]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=JetBrains+Mono:wght@400;500&display=swap');
        
        .glass-card {
          background: rgba(255, 255, 255, 0.98);
          border: 1px solid rgba(0, 0, 0, 0.05);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.02);
        }
        
        .metric-card {
          background: linear-gradient(135deg, #FFFFFF 0%, #FAFBFC 100%);
          border: 1px solid rgba(0, 0, 0, 0.04);
          transition: all 0.2s ease;
        }
        
        .metric-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
        }
        
        .nav-item {
          transition: all 0.15s ease;
        }
        
        .nav-item:hover {
          background: rgba(0, 0, 0, 0.03);
        }
        
        .nav-item.active {
          background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%);
          color: white;
        }
        
        .btn-primary {
          background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%);
          transition: all 0.2s ease;
        }
        
        .btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.35);
        }
        
        .structure-badge {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.3px;
        }
        
        .liquidity-tag {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
        }
        
        .trade-row {
          transition: all 0.15s ease;
        }
        
        .trade-row:hover {
          background: rgba(79, 70, 229, 0.02);
        }
        
        input:focus, select:focus, textarea:focus {
          outline: none;
          border-color: #4F46E5;
          box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
        }
        
        .scrollbar-thin::-webkit-scrollbar {
          width: 5px;
        }
        
        .scrollbar-thin::-webkit-scrollbar-track {
          background: transparent;
        }
        
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.08);
          border-radius: 3px;
        }
      `}</style>

      <div className="flex h-screen">
        {/* Sidebar */}
        <aside className="w-60 bg-white border-r border-gray-100 flex flex-col">
          <div className="p-5 border-b border-gray-50">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/25 relative overflow-hidden">
                <div className="absolute w-6 h-6 border-2 border-white/90 rounded-full"></div>
                <div className="absolute w-3 h-3 bg-white/90 rounded-full" style={{ transform: 'translate(4px, -4px)' }}></div>
              </div>
              <div>
                <h1 className="font-semibold text-gray-900 tracking-tight">Ellipse</h1>
                <p className="text-[10px] text-gray-400">Price Action Journal</p>
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
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`nav-item w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium ${
                  activeTab === item.id ? 'active' : 'text-gray-600'
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="p-3 border-t border-gray-50">
            <div className="glass-card rounded-xl p-4">
              <p className="text-[10px] text-gray-400 mb-2 font-medium uppercase tracking-wider">Today's P&L</p>
              <p className={`text-xl font-semibold ${totalPnl >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {totalPnl >= 0 ? '+' : ''}{totalPnl.toLocaleString()}
                <span className="text-xs text-gray-400 ml-1">USD</span>
              </p>
              <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                  {winningTrades}W
                </span>
                <span className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400"></div>
                  {trades.length - winningTrades}L
                </span>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden flex flex-col">
          <header className="bg-white border-b border-gray-100 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {activeTab === 'journal' && 'Trading Journal'}
                  {activeTab === 'analytics' && 'Analytics & Metrics'}
                  {activeTab === 'accounts' && 'Trading Accounts'}
                  {activeTab === 'calendar' && 'Trade Calendar'}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {activeTab === 'journal' && 'Document trades with price action context'}
                  {activeTab === 'analytics' && 'Performance by market structure & liquidity'}
                  {activeTab === 'accounts' && 'Manage MT5 and cTrader connections'}
                  {activeTab === 'calendar' && 'Visual trading activity overview'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {activeTab === 'journal' && (
                  <button
                    onClick={() => setShowNewTrade(true)}
                    className="btn-primary flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    Log Trade
                  </button>
                )}
                {activeTab === 'accounts' && (
                  <button
                    onClick={() => setShowNewAccount(true)}
                    className="btn-primary flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-medium"
                  >
                    <Link2 className="w-4 h-4" />
                    Connect Account
                  </button>
                )}
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-auto p-6 scrollbar-thin">
            {activeTab === 'journal' && (
              <JournalView 
                trades={trades} 
                accounts={accounts}
                filterAccount={filterAccount}
                setFilterAccount={setFilterAccount}
                onSelectTrade={setSelectedTrade}
              />
            )}
            {activeTab === 'analytics' && (
              <AnalyticsView trades={trades} performanceData={performanceData} />
            )}
            {activeTab === 'accounts' && (
              <AccountsView accounts={accounts} setAccounts={setAccounts} />
            )}
            {activeTab === 'calendar' && (
              <CalendarView trades={trades} />
            )}
          </div>
        </main>
      </div>

      {showNewTrade && (
        <NewTradeModal 
          onClose={() => setShowNewTrade(false)} 
          onSave={(trade) => {
            setTrades([{ ...trade, id: Date.now() }, ...trades]);
            setShowNewTrade(false);
          }}
          accounts={accounts}
        />
      )}

      {showNewAccount && (
        <NewAccountModal 
          onClose={() => setShowNewAccount(false)}
          onSave={(account) => {
            setAccounts([...accounts, { ...account, id: Date.now() }]);
            setShowNewAccount(false);
          }}
        />
      )}

      {selectedTrade && (
        <TradeDetailModal 
          trade={selectedTrade}
          onClose={() => setSelectedTrade(null)}
          onDelete={(tradeId) => {
            setTrades(trades.filter(t => t.id !== tradeId));
            setSelectedTrade(null);
          }}
        />
      )}
    </div>
  );
}

function JournalView({ trades, accounts, filterAccount, setFilterAccount, onSelectTrade }) {
  const filteredTrades = filterAccount === 'all' 
    ? trades 
    : trades.filter(t => t.account === filterAccount);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative">
          <select
            value={filterAccount}
            onChange={(e) => setFilterAccount(e.target.value)}
            className="appearance-none bg-white border border-gray-200 rounded-xl px-3 py-2 pr-8 text-sm text-gray-700 cursor-pointer"
          >
            <option value="all">All Accounts</option>
            {accounts.map(acc => (
              <option key={acc.id} value={acc.name}>{acc.name}</option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search trades..."
            className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-4 py-2 text-sm"
          />
        </div>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="grid grid-cols-[1fr,80px,90px,100px,100px,90px,60px] gap-3 px-5 py-2.5 bg-gray-50/50 border-b border-gray-100 text-[10px] font-medium text-gray-500 uppercase tracking-wider">
          <div>Trade</div>
          <div>Side</div>
          <div>Structure</div>
          <div>Liquidity</div>
          <div>Candle</div>
          <div className="text-right">P&L</div>
          <div></div>
        </div>
        
        {filteredTrades.map(trade => (
          <div 
            key={trade.id}
            className="trade-row grid grid-cols-[1fr,80px,90px,100px,100px,90px,60px] gap-3 px-5 py-3 border-b border-gray-50 items-center cursor-pointer"
            onClick={() => onSelectTrade(trade)}
          >
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold ${
                trade.pnl >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
              }`}>
                {trade.symbol.slice(0, 2)}
              </div>
              <div>
                <p className="font-medium text-gray-900 text-sm">{trade.symbol}</p>
                <p className="text-[10px] text-gray-400">{trade.date} · {trade.time}</p>
              </div>
            </div>
            
            <div>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium ${
                trade.side === 'Long' 
                  ? 'bg-emerald-50 text-emerald-700' 
                  : 'bg-red-50 text-red-600'
              }`}>
                {trade.side === 'Long' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {trade.side}
              </span>
            </div>
            
            <div>
              <span 
                className="structure-badge inline-block px-1.5 py-0.5 rounded text-white"
                style={{ backgroundColor: MARKET_STRUCTURES[trade.marketStructure]?.color }}
              >
                {trade.marketStructure === 'TRENDING_BULLISH' ? 'TREND ↑' :
                 trade.marketStructure === 'TRENDING_BEARISH' ? 'TREND ↓' :
                 trade.marketStructure === 'REVERSING_BULLISH' ? 'REV ↑' :
                 trade.marketStructure === 'REVERSING_BEARISH' ? 'REV ↓' : 'CHOP'}
              </span>
            </div>
            
            <div className="flex flex-wrap gap-0.5">
              {trade.liquidityTaken.slice(0, 2).map(liq => (
                <span key={liq} className="liquidity-tag px-1 py-0.5 bg-amber-50 text-amber-700 rounded">
                  {LIQUIDITY_LEVELS.find(l => l.key === liq)?.abbr}
                </span>
              ))}
              {trade.liquidityTaken.length > 2 && (
                <span className="liquidity-tag px-1 py-0.5 bg-gray-100 text-gray-500 rounded">
                  +{trade.liquidityTaken.length - 2}
                </span>
              )}
            </div>
            
            <div>
              <span className={`text-[10px] font-medium ${
                trade.candleType === 'OHLC' ? 'text-emerald-600' : 'text-red-500'
              }`}>
                {trade.candleType}
              </span>
            </div>
            
            <div className="text-right">
              <span className={`font-semibold text-sm ${trade.pnl >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {trade.pnl >= 0 ? '+' : ''}{trade.pnl}
              </span>
              <p className="text-[10px] text-gray-400">{trade.riskReward}</p>
            </div>
            
            <div className="flex justify-end">
              <button className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <Eye className="w-3.5 h-3.5 text-gray-400" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalyticsView({ trades, performanceData }) {
  const structureStats = Object.keys(MARKET_STRUCTURES).map(key => ({
    name: key === 'TRENDING_BULLISH' ? 'Trend ↑' :
          key === 'TRENDING_BEARISH' ? 'Trend ↓' :
          key === 'REVERSING_BULLISH' ? 'Rev ↑' :
          key === 'REVERSING_BEARISH' ? 'Rev ↓' : 'Chop',
    fullName: MARKET_STRUCTURES[key].label,
    trades: trades.filter(t => t.marketStructure === key).length,
    pnl: trades.filter(t => t.marketStructure === key).reduce((sum, t) => sum + t.pnl, 0),
    winRate: trades.filter(t => t.marketStructure === key).length > 0
      ? (trades.filter(t => t.marketStructure === key && t.pnl > 0).length / 
         trades.filter(t => t.marketStructure === key).length * 100).toFixed(0)
      : 0,
    color: MARKET_STRUCTURES[key].color
  }));

  const liquidityStats = LIQUIDITY_LEVELS.map(liq => ({
    name: liq.abbr,
    fullName: liq.label,
    trades: trades.filter(t => t.liquidityTaken.includes(liq.key)).length,
    pnl: trades.filter(t => t.liquidityTaken.includes(liq.key)).reduce((sum, t) => sum + t.pnl, 0)
  })).filter(s => s.trades > 0);

  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const winRate = ((trades.filter(t => t.pnl > 0).length / trades.length) * 100).toFixed(1);
  const avgWin = (trades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0) / (trades.filter(t => t.pnl > 0).length || 1)).toFixed(0);
  const avgLoss = Math.abs(trades.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0) / (trades.filter(t => t.pnl < 0).length || 1)).toFixed(0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total P&L', value: `$${totalPnl.toLocaleString()}`, positive: totalPnl >= 0 },
          { label: 'Win Rate', value: `${winRate}%`, positive: parseFloat(winRate) >= 50 },
          { label: 'Avg Winner', value: `$${avgWin}`, positive: true },
          { label: 'Avg Loser', value: `$${avgLoss}`, positive: false }
        ].map((metric, i) => (
          <div key={i} className="metric-card rounded-xl p-4">
            <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">{metric.label}</p>
            <p className={`text-xl font-semibold mt-1 ${metric.positive ? 'text-emerald-600' : 'text-red-500'}`}>
              {metric.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="glass-card rounded-xl p-5">
          <h3 className="font-semibold text-gray-900 text-sm mb-4">Weekly Performance</h3>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={performanceData}>
              <defs>
                <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 11 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 11 }} />
              <Tooltip 
                contentStyle={{ 
                  background: 'white', 
                  border: '1px solid #E5E7EB', 
                  borderRadius: '10px',
                  fontSize: '12px'
                }}
              />
              <Area type="monotone" dataKey="pnl" stroke="#10B981" strokeWidth={2} fill="url(#pnlGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card rounded-xl p-5">
          <h3 className="font-semibold text-gray-900 text-sm mb-4">P&L by Market Structure</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={structureStats} layout="vertical">
              <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 11 }} />
              <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 11 }} width={55} />
              <Tooltip 
                contentStyle={{ 
                  background: 'white', 
                  border: '1px solid #E5E7EB', 
                  borderRadius: '10px',
                  fontSize: '12px'
                }}
                formatter={(value, name) => [`$${value}`, 'P&L']}
              />
              <Bar dataKey="pnl" radius={[0, 4, 4, 0]}>
                {structureStats.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="glass-card rounded-xl p-5">
          <h3 className="font-semibold text-gray-900 text-sm mb-4">Market Structure Breakdown</h3>
          <div className="space-y-3">
            {structureStats.map(stat => (
              <div key={stat.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-semibold" style={{ backgroundColor: stat.color }}>
                    {stat.trades}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{stat.fullName}</p>
                    <p className="text-[10px] text-gray-500">{stat.winRate}% win rate</p>
                  </div>
                </div>
                <span className={`font-semibold text-sm ${stat.pnl >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {stat.pnl >= 0 ? '+' : ''}${stat.pnl}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card rounded-xl p-5">
          <h3 className="font-semibold text-gray-900 text-sm mb-4">Liquidity Level Performance</h3>
          <div className="space-y-3">
            {liquidityStats.map(stat => (
              <div key={stat.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700 text-xs font-semibold" style={{ fontFamily: 'JetBrains Mono' }}>
                    {stat.name}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{stat.fullName}</p>
                    <p className="text-[10px] text-gray-500">{stat.trades} trades</p>
                  </div>
                </div>
                <span className={`font-semibold text-sm ${stat.pnl >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {stat.pnl >= 0 ? '+' : ''}${stat.pnl}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountsView({ accounts, setAccounts }) {
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
  const totalEquity = accounts.reduce((sum, acc) => sum + acc.equity, 0);

  const handleDeleteAccount = (accountId) => {
    setAccounts(accounts.filter(acc => acc.id !== accountId));
    setDeleteConfirmId(null);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <div className="metric-card rounded-xl p-4">
          <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Total Balance</p>
          <p className="text-xl font-semibold mt-1 text-gray-900">${totalBalance.toLocaleString()}</p>
        </div>
        <div className="metric-card rounded-xl p-4">
          <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Total Equity</p>
          <p className="text-xl font-semibold mt-1 text-emerald-600">${totalEquity.toLocaleString()}</p>
        </div>
        <div className="metric-card rounded-xl p-4">
          <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Connected Accounts</p>
          <p className="text-xl font-semibold mt-1 text-gray-900">{accounts.filter(a => a.connected).length} / {accounts.length}</p>
        </div>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1fr,100px,120px,120px,100px,100px] gap-4 px-5 py-2.5 bg-gray-50/50 border-b border-gray-100 text-[10px] font-medium text-gray-500 uppercase tracking-wider">
          <div>Account</div>
          <div>Platform</div>
          <div className="text-right">Balance</div>
          <div className="text-right">Equity</div>
          <div>Status</div>
          <div>Actions</div>
        </div>

        {accounts.map(account => (
          <div key={account.id} className="grid grid-cols-[1fr,100px,120px,120px,100px,100px] gap-4 px-5 py-4 border-b border-gray-50 items-center">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                account.platform === 'MT5' ? 'bg-blue-50' : 'bg-purple-50'
              }`}>
                <Database className={`w-5 h-5 ${
                  account.platform === 'MT5' ? 'text-blue-600' : 'text-purple-600'
                }`} />
              </div>
              <div>
                <p className="font-medium text-gray-900 text-sm">{account.name}</p>
                <p className="text-[10px] text-gray-400">{account.broker} · {account.server}</p>
              </div>
            </div>

            <div>
              <span className={`inline-block px-2 py-1 rounded-md text-[10px] font-medium ${
                account.platform === 'MT5' 
                  ? 'bg-blue-50 text-blue-700' 
                  : 'bg-purple-50 text-purple-700'
              }`}>
                {account.platform}
              </span>
            </div>

            <div className="text-right">
              <p className="font-semibold text-gray-900">${account.balance.toLocaleString()}</p>
            </div>

            <div className="text-right">
              <p className={`font-semibold ${account.equity >= account.balance ? 'text-emerald-600' : 'text-red-500'}`}>
                ${account.equity.toLocaleString()}
              </p>
            </div>

            <div>
              <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium ${
                account.connected 
                  ? 'bg-emerald-50 text-emerald-700' 
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {account.connected ? (
                  <>
                    <CheckCircle className="w-3 h-3" />
                    Connected
                  </>
                ) : (
                  <>
                    <Clock className="w-3 h-3" />
                    Offline
                  </>
                )}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" title="Refresh">
                <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
              </button>
              <button className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" title="View Details">
                <Eye className="w-3.5 h-3.5 text-gray-400" />
              </button>
              <button 
                onClick={() => setDeleteConfirmId(account.id)}
                className="p-1.5 hover:bg-red-50 rounded-lg transition-colors" 
                title="Remove Account"
              >
                <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
              </button>
            </div>
          </div>
        ))}

        {accounts.length === 0 && (
          <div className="px-5 py-10 text-center">
            <Database className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No accounts connected</p>
            <p className="text-xs text-gray-400 mt-1">Click "Connect Account" to add your first trading account</p>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Remove Account</h3>
                <p className="text-xs text-gray-400">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-5">
              Are you sure you want to remove <strong>{accounts.find(a => a.id === deleteConfirmId)?.name}</strong>? 
              All associated data will be disconnected.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 px-4 py-2.5 rounded-xl text-gray-600 hover:bg-gray-100 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteAccount(deleteConfirmId)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarView({ trades }) {
  const [currentMonth, setCurrentMonth] = useState(new Date(2024, 4, 1)); // May 2024

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();
    
    const days = [];
    for (let i = 0; i < startingDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  };

  const getTradesForDay = (day) => {
    if (!day) return [];
    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return trades.filter(t => t.date === dateStr);
  };

  const days = getDaysInMonth(currentMonth);
  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">{monthName}</h3>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>
          <button className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            Today
          </button>
          <button 
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        <div className="grid grid-cols-7 border-b border-gray-100">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase tracking-wider bg-gray-50/50">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day, idx) => {
            const dayTrades = getTradesForDay(day);
            const dayPnl = dayTrades.reduce((sum, t) => sum + t.pnl, 0);
            
            return (
              <div 
                key={idx} 
                className={`min-h-[100px] p-2 border-b border-r border-gray-50 ${
                  !day ? 'bg-gray-50/30' : 'hover:bg-gray-50/50'
                } transition-colors`}
              >
                {day && (
                  <>
                    <p className="text-sm text-gray-600 mb-1">{day}</p>
                    {dayTrades.length > 0 && (
                      <div className="space-y-1">
                        <div className={`text-xs font-semibold ${dayPnl >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {dayPnl >= 0 ? '+' : ''}${dayPnl}
                        </div>
                        <div className="text-[10px] text-gray-400">
                          {dayTrades.length} trade{dayTrades.length > 1 ? 's' : ''}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NewTradeModal({ onClose, onSave, accounts }) {
  const [step, setStep] = useState(1);
  const [trade, setTrade] = useState({
    date: new Date().toISOString().split('T')[0],
    time: new Date().toTimeString().slice(0, 5),
    symbol: '',
    side: 'Long',
    entry: '',
    stopLoss: '',
    takeProfit: '',
    exit: '',
    pnl: '',
    marketStructure: '',
    candleType: '',
    liquidityTaken: [],
    liquidityTarget: [],
    notes: '',
    account: accounts[0]?.name || ''
  });

  const handleSave = () => {
    const rr = trade.stopLoss && trade.takeProfit && trade.entry
      ? `1:${Math.abs((parseFloat(trade.takeProfit) - parseFloat(trade.entry)) / (parseFloat(trade.entry) - parseFloat(trade.stopLoss))).toFixed(1)}`
      : '1:0';
    
    onSave({
      ...trade,
      entry: parseFloat(trade.entry),
      stopLoss: parseFloat(trade.stopLoss),
      takeProfit: parseFloat(trade.takeProfit),
      exit: parseFloat(trade.exit),
      pnl: parseFloat(trade.pnl),
      riskReward: rr
    });
  };

  const toggleLiquidity = (key, type) => {
    const field = type === 'taken' ? 'liquidityTaken' : 'liquidityTarget';
    setTrade(prev => ({
      ...prev,
      [field]: prev[field].includes(key)
        ? prev[field].filter(k => k !== key)
        : [...prev[field], key]
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-900">Log New Trade</h3>
            <p className="text-xs text-gray-400">Step {step} of 3</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-6 max-h-[60vh] overflow-auto">
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-gray-700 mb-3">Trade Details</p>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Date</label>
                  <input
                    type="date"
                    value={trade.date}
                    onChange={(e) => setTrade({...trade, date: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Time</label>
                  <input
                    type="time"
                    value={trade.time}
                    onChange={(e) => setTrade({...trade, time: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Symbol</label>
                  <input
                    type="text"
                    value={trade.symbol}
                    onChange={(e) => setTrade({...trade, symbol: e.target.value.toUpperCase()})}
                    placeholder="EURUSD"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Account</label>
                  <select
                    value={trade.account}
                    onChange={(e) => setTrade({...trade, account: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.name}>{acc.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Side</label>
                <div className="flex gap-2">
                  {['Long', 'Short'].map(side => (
                    <button
                      key={side}
                      onClick={() => setTrade({...trade, side})}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                        trade.side === side
                          ? side === 'Long' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {side === 'Long' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      {side}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Entry</label>
                  <input
                    type="number"
                    step="any"
                    value={trade.entry}
                    onChange={(e) => setTrade({...trade, entry: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Exit</label>
                  <input
                    type="number"
                    step="any"
                    value={trade.exit}
                    onChange={(e) => setTrade({...trade, exit: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Stop Loss</label>
                  <input
                    type="number"
                    step="any"
                    value={trade.stopLoss}
                    onChange={(e) => setTrade({...trade, stopLoss: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Take Profit</label>
                  <input
                    type="number"
                    step="any"
                    value={trade.takeProfit}
                    onChange={(e) => setTrade({...trade, takeProfit: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">P&L ($)</label>
                  <input
                    type="number"
                    value={trade.pnl}
                    onChange={(e) => setTrade({...trade, pnl: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-3">Market Structure</p>
                <p className="text-xs text-gray-400 mb-3">Based on price action swing points (HH/HL/LH/LL)</p>
                <div className="grid grid-cols-1 gap-2">
                  {Object.entries(MARKET_STRUCTURES).map(([key, val]) => (
                    <button
                      key={key}
                      onClick={() => setTrade({...trade, marketStructure: key})}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                        trade.marketStructure === key
                          ? 'border-emerald-500 bg-emerald-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: `${val.color}20` }}
                        >
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: val.color }}></div>
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-medium text-gray-900">{val.label}</p>
                          <p className="text-[10px] text-gray-500">{val.description}</p>
                        </div>
                      </div>
                      {trade.marketStructure === key && (
                        <CheckCircle className="w-5 h-5 text-emerald-500" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-3">Candle Type</p>
                <p className="text-xs text-gray-400 mb-3">Price delivery sequence</p>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(CANDLE_TYPES).map(([key, val]) => (
                    <button
                      key={key}
                      onClick={() => setTrade({...trade, candleType: key})}
                      className={`p-3 rounded-xl border transition-all text-left ${
                        trade.candleType === key
                          ? 'border-emerald-500 bg-emerald-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <p className="text-sm font-medium text-gray-900">{val.label}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">{val.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Liquidity Taken</p>
                <p className="text-xs text-gray-400 mb-3">Which levels were swept before your entry?</p>
                <div className="flex flex-wrap gap-2">
                  {LIQUIDITY_LEVELS.map(liq => (
                    <button
                      key={liq.key}
                      onClick={() => toggleLiquidity(liq.key, 'taken')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        trade.liquidityTaken.includes(liq.key)
                          ? 'bg-amber-500 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {liq.abbr}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Liquidity Target</p>
                <p className="text-xs text-gray-400 mb-3">Which levels were you targeting?</p>
                <div className="flex flex-wrap gap-2">
                  {LIQUIDITY_LEVELS.map(liq => (
                    <button
                      key={liq.key}
                      onClick={() => toggleLiquidity(liq.key, 'target')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        trade.liquidityTarget.includes(liq.key)
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {liq.abbr}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Trade Notes</label>
                <textarea
                  value={trade.notes}
                  onChange={(e) => setTrade({...trade, notes: e.target.value})}
                  placeholder="What was your thesis? What did you observe?"
                  rows={4}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <button
            onClick={() => step > 1 ? setStep(step - 1) : onClose()}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            {step > 1 ? 'Back' : 'Cancel'}
          </button>
          <button
            onClick={() => step < 3 ? setStep(step + 1) : handleSave()}
            className="btn-primary px-5 py-2 rounded-xl text-white text-sm font-medium"
          >
            {step < 3 ? 'Continue' : 'Save Trade'}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewAccountModal({ onClose, onSave }) {
  const [account, setAccount] = useState({
    name: '',
    platform: 'MT5',
    broker: '',
    server: '',
    login: '',
    password: '',
    balance: 0,
    equity: 0,
    connected: false,
    lastSync: ''
  });

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Connect Trading Account</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Platform</label>
            <div className="flex gap-2">
              {['MT5', 'cTrader'].map(platform => (
                <button
                  key={platform}
                  onClick={() => setAccount({...account, platform})}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    account.platform === platform
                      ? platform === 'MT5' ? 'bg-blue-500 text-white' : 'bg-purple-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {platform}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Account Name</label>
            <input
              type="text"
              value={account.name}
              onChange={(e) => setAccount({...account, name: e.target.value})}
              placeholder="e.g., MT5 - Main"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Broker</label>
            <input
              type="text"
              value={account.broker}
              onChange={(e) => setAccount({...account, broker: e.target.value})}
              placeholder="e.g., ICMarkets"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Server</label>
            <input
              type="text"
              value={account.server}
              onChange={(e) => setAccount({...account, server: e.target.value})}
              placeholder="e.g., ICMarkets-Live"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Login ID</label>
              <input
                type="text"
                value={account.login}
                onChange={(e) => setAccount({...account, login: e.target.value})}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Password</label>
              <input
                type="password"
                value={account.password}
                onChange={(e) => setAccount({...account, password: e.target.value})}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="bg-amber-50 rounded-xl p-3">
            <p className="text-xs text-amber-700">
              <strong>Note:</strong> Use investor/read-only password for security. Full trading access is not required for journaling.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave({...account, connected: true, lastSync: new Date().toISOString()})}
            className="btn-primary px-5 py-2 rounded-xl text-white text-sm font-medium"
          >
            Connect Account
          </button>
        </div>
      </div>
    </div>
  );
}

function TradeDetailModal({ trade, onClose, onDelete }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              trade.pnl >= 0 ? 'bg-emerald-50' : 'bg-red-50'
            }`}>
              <span className="font-semibold text-gray-700">{trade.symbol.slice(0, 2)}</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{trade.symbol}</h3>
              <p className="text-xs text-gray-400">{trade.date} · {trade.time}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${
              trade.side === 'Long' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
            }`}>
              {trade.side === 'Long' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {trade.side}
            </span>
            <span className={`text-2xl font-semibold ${trade.pnl >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {trade.pnl >= 0 ? '+' : ''}{trade.pnl.toLocaleString()} USD
            </span>
          </div>

          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Entry', value: trade.entry },
              { label: 'Exit', value: trade.exit },
              { label: 'Stop Loss', value: trade.stopLoss },
              { label: 'Take Profit', value: trade.takeProfit }
            ].map(item => (
              <div key={item.label} className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">{item.label}</p>
                <p className="text-sm font-semibold text-gray-900 mt-1" style={{ fontFamily: 'JetBrains Mono' }}>
                  {item.value}
                </p>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <span className="text-sm text-gray-600">Market Structure</span>
              <span 
                className="structure-badge px-2 py-1 rounded text-white"
                style={{ backgroundColor: MARKET_STRUCTURES[trade.marketStructure]?.color }}
              >
                {MARKET_STRUCTURES[trade.marketStructure]?.label}
              </span>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <span className="text-sm text-gray-600">Candle Type</span>
              <span className={`text-sm font-medium ${
                trade.candleType === 'OHLC' ? 'text-emerald-600' : 'text-red-500'
              }`}>
                {CANDLE_TYPES[trade.candleType]?.label}
              </span>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <span className="text-sm text-gray-600">Risk:Reward</span>
              <span className="text-sm font-semibold text-gray-900">{trade.riskReward}</span>
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-2">Liquidity Taken</p>
            <div className="flex flex-wrap gap-1.5">
              {trade.liquidityTaken.map(liq => (
                <span key={liq} className="liquidity-tag px-2 py-1 bg-amber-50 text-amber-700 rounded-lg text-xs">
                  {LIQUIDITY_LEVELS.find(l => l.key === liq)?.label}
                </span>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-2">Liquidity Target</p>
            <div className="flex flex-wrap gap-1.5">
              {trade.liquidityTarget.map(liq => (
                <span key={liq} className="liquidity-tag px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs">
                  {LIQUIDITY_LEVELS.find(l => l.key === liq)?.label}
                </span>
              ))}
            </div>
          </div>

          {trade.notes && (
            <div>
              <p className="text-xs text-gray-500 mb-2">Notes</p>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3">{trade.notes}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          {!showDeleteConfirm ? (
            <>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-red-600 hover:bg-red-50 text-sm font-medium transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
              <button
                onClick={onClose}
                className="btn-primary px-5 py-2 rounded-xl text-white text-sm font-medium"
              >
                Close
              </button>
            </>
          ) : (
            <div className="flex items-center justify-between w-full">
              <p className="text-sm text-gray-600">Delete this trade?</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 rounded-xl text-gray-600 hover:bg-gray-100 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => onDelete(trade.id)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Confirm Delete
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
