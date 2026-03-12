import React, { useState, useEffect, createContext, useContext, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell } from 'recharts';
import { Plus, TrendingUp, TrendingDown, ChevronDown, Calendar, BarChart3, BookOpen, Wallet, CheckCircle, Clock, X, Eye, Database, ChevronLeft, ChevronRight, Trash2, Edit3, Moon, Sun, Settings, Link, Image, ExternalLink, Loader2, CloudOff, Cloud, LayoutGrid, LayoutList, Upload, FileText, AlertCircle, Trophy, Shield, Target, AlertTriangle, Zap, Activity } from 'lucide-react';

// Supabase client
const supabase = createClient(
  'https://ksbhbhjnrrkcnunehksx.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzYmhiaGpucnJrY251bmVoa3N4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMTUwNDAsImV4cCI6MjA4ODc5MTA0MH0.t0tbxMpMzYxWtrejNi0TrcM3cUPPopAe2GaUdIuCjeA'
);

const ThemeContext = createContext();
const useTheme = () => useContext(ThemeContext);

const MARKET_STRUCTURES = {
  TRENDING_BULLISH: { label: 'Trending Bullish', color: '#10B981', description: 'Higher Highs + Higher Lows' },
  TRENDING_BEARISH: { label: 'Trending Bearish', color: '#EF4444', description: 'Lower Highs + Lower Lows' },
  REVERSING_BULLISH: { label: 'Reversal to Bullish', color: '#3B82F6', description: 'Break of Lower High' },
  REVERSING_BEARISH: { label: 'Reversal to Bearish', color: '#F59E0B', description: 'Break of Higher Low' },
  CHOPPY: { label: 'Choppy/Range', color: '#8B5CF6', description: 'No clear structure' }
};

// ===== PROP FIRM PRESETS =====
const PROP_FIRM_PRESETS = {
  FTMO: {
    name: 'FTMO',
    color: '#0ea5e9',
    phases: [
      { name: 'FTMO Challenge', profitTarget: 10, maxDailyDrawdown: 5, maxTotalDrawdown: 10, minTradingDays: 4, maxTradingDays: 30, drawdownType: 'balance' },
      { name: 'Verification', profitTarget: 5, maxDailyDrawdown: 5, maxTotalDrawdown: 10, minTradingDays: 4, maxTradingDays: 60, drawdownType: 'balance' },
      { name: 'Funded', profitTarget: null, maxDailyDrawdown: 5, maxTotalDrawdown: 10, minTradingDays: 0, maxTradingDays: null, drawdownType: 'balance', profitSplit: 80 }
    ],
    consistencyRule: null,
    accountSizes: [10000, 25000, 50000, 100000, 200000]
  },
  FUNDED_HIVE: {
    name: 'Funded Hive',
    color: '#f59e0b',
    phases: [
      { name: 'Evaluation', profitTarget: 8, maxDailyDrawdown: 5, maxTotalDrawdown: 10, minTradingDays: 5, maxTradingDays: 45, drawdownType: 'balance' },
      { name: 'Verification', profitTarget: 5, maxDailyDrawdown: 5, maxTotalDrawdown: 10, minTradingDays: 5, maxTradingDays: 45, drawdownType: 'balance' },
      { name: 'Funded', profitTarget: null, maxDailyDrawdown: 5, maxTotalDrawdown: 10, minTradingDays: 0, maxTradingDays: null, drawdownType: 'balance', profitSplit: 80 }
    ],
    consistencyRule: null,
    accountSizes: [5000, 10000, 25000, 50000, 100000]
  },
  CUSTOM: {
    name: 'Custom',
    color: '#8b5cf6',
    phases: [
      { name: 'Phase 1', profitTarget: 8, maxDailyDrawdown: 5, maxTotalDrawdown: 10, minTradingDays: 0, maxTradingDays: 30, drawdownType: 'balance' },
      { name: 'Phase 2', profitTarget: 5, maxDailyDrawdown: 5, maxTotalDrawdown: 8, minTradingDays: 0, maxTradingDays: 60, drawdownType: 'balance' },
      { name: 'Funded', profitTarget: null, maxDailyDrawdown: 5, maxTotalDrawdown: 8, minTradingDays: 0, maxTradingDays: null, drawdownType: 'balance', profitSplit: 80 }
    ],
    consistencyRule: null,
    accountSizes: [10000, 25000, 50000, 100000, 200000]
  }
};

// Convert TradingView share URL to direct image URL
const getTradingViewImageUrl = (url) => {
  if (!url) return null;
  if (url.includes('s3.tradingview.com') || url.match(/\.(png|jpg|jpeg|gif|webp)$/i)) return url;
  const match = url.match(/tradingview\.com\/x\/([a-zA-Z0-9]+)/);
  if (match) {
    const id = match[1];
    return `https://s3.tradingview.com/snapshots/${id.charAt(0).toLowerCase()}/${id}.png`;
  }
  return url;
};

// Parse MT5 HTML statement
const parseMT5Statement = (html) => {
  const trades = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const tables = doc.querySelectorAll('table');
  
  for (const table of tables) {
    const rows = table.querySelectorAll('tr');
    let headers = [];
    
    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      const rowText = row.textContent.toLowerCase();
      if (rowText.includes('deals') || rowText.includes('positions') || rowText.includes('orders')) continue;
      
      if (cells.length >= 8 && headers.length === 0) {
        const firstCell = cells[0]?.textContent?.trim().toLowerCase();
        if (firstCell === 'time' || firstCell === 'open time' || firstCell === 'ticket') {
          headers = Array.from(cells).map(c => c.textContent.trim().toLowerCase());
          continue;
        }
      }
      
      if (cells.length >= 8 && headers.length > 0) {
        const getValue = (names) => {
          for (const name of names) {
            const idx = headers.findIndex(h => h.includes(name));
            if (idx !== -1) return cells[idx]?.textContent?.trim() || '';
          }
          return '';
        };
        
        const symbol = getValue(['symbol']);
        const type = getValue(['type']).toLowerCase();
        const volume = parseFloat(getValue(['volume', 'lots'])) || 0;
        const openPrice = parseFloat(getValue(['open price', 'price'])) || 0;
        const closePrice = parseFloat(getValue(['close price', 'price'])) || 0;
        const profit = parseFloat(getValue(['profit']).replace(/[^-\d.]/g, '')) || 0;
        const commission = Math.abs(parseFloat(getValue(['commission']).replace(/[^-\d.]/g, '')) || 0);
        const swap = parseFloat(getValue(['swap']).replace(/[^-\d.]/g, '')) || 0;
        const timeStr = getValue(['time', 'open time', 'close time']);
        
        if (!type.includes('buy') && !type.includes('sell')) continue;
        if (!symbol || volume === 0) continue;
        
        let date = new Date().toISOString().split('T')[0];
        let time = '00:00';
        if (timeStr) {
          const dateMatch = timeStr.match(/(\d{4}[.\-/]\d{2}[.\-/]\d{2})/);
          const timeMatch = timeStr.match(/(\d{2}:\d{2})/);
          if (dateMatch) date = dateMatch[1].replace(/[./]/g, '-');
          if (timeMatch) time = timeMatch[1];
        }
        
        trades.push({
          date, time, symbol,
          side: type.includes('buy') ? 'Long' : 'Short',
          entry: openPrice || closePrice, exit: closePrice || openPrice,
          lots: volume, pnl: profit, commission, swap,
          stopLoss: 0, takeProfit: 0,
          marketStructure: '', candleType: '',
          liquidityTaken: [], liquidityTarget: [],
          notes: 'Imported from MT5', chartLink: '', chartImage: ''
        });
      }
    }
  }
  return trades;
};

// Parse cTrader HTML statement  
const parseCTraderStatement = (html) => {
  const trades = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const rows = doc.querySelectorAll('tr');
  let headers = [];
  
  for (const row of rows) {
    const cells = row.querySelectorAll('td');
    if (cells.length >= 6 && headers.length === 0) {
      const text = cells[0]?.textContent?.trim().toLowerCase();
      if (text.includes('position') || text.includes('id') || !isNaN(parseInt(text))) {
        headers = ['id', 'symbol', 'direction', 'volume', 'open', 'close', 'profit'];
      }
    }
    
    if (cells.length >= 6) {
      let symbol = '', direction = '', volume = 0, openPrice = 0, closePrice = 0, profit = 0;
      let date = new Date().toISOString().split('T')[0], time = '00:00';
      
      for (let i = 0; i < cells.length; i++) {
        const text = cells[i]?.textContent?.trim() || '';
        const textLower = text.toLowerCase();
        if (/^[A-Z]{6}$/.test(text) || /^[A-Z]{3}\/[A-Z]{3}$/.test(text)) symbol = text.replace('/', '');
        if (textLower === 'buy' || textLower === 'sell' || textLower === 'long' || textLower === 'short') direction = textLower.includes('buy') || textLower.includes('long') ? 'Long' : 'Short';
        if (/^\d+\.?\d*$/.test(text) && parseFloat(text) < 100 && parseFloat(text) > 0 && volume === 0) volume = parseFloat(text);
        if (/^\d+\.\d{2,5}$/.test(text)) { const price = parseFloat(text); if (openPrice === 0) openPrice = price; else if (closePrice === 0) closePrice = price; }
        if (/^-?[\d,]+\.?\d*$/.test(text.replace(/[$€£]/g, '')) && Math.abs(parseFloat(text.replace(/[^-\d.]/g, ''))) < 100000) profit = parseFloat(text.replace(/[^-\d.]/g, '')) || 0;
        const dateMatch = text.match(/(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4})/);
        if (dateMatch) { const parts = dateMatch[1].split(/[.\-/]/); if (parts[2]?.length === 4) date = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`; }
      }
      
      if (symbol && direction && volume > 0) {
        trades.push({ date, time, symbol, side: direction, entry: openPrice, exit: closePrice || openPrice, lots: volume, pnl: profit, commission: 0, swap: 0, stopLoss: 0, takeProfit: 0, marketStructure: '', candleType: '', liquidityTaken: [], liquidityTarget: [], notes: 'Imported from cTrader', chartLink: '', chartImage: '' });
      }
    }
  }
  return trades;
};

// Parse CSV file
const parseCSV = (csv, platform) => {
  const trades = [];
  const lines = csv.split('\n').filter(l => l.trim());
  if (lines.length < 2) return trades;
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
    const row = {};
    headers.forEach((h, idx) => row[h] = values[idx] || '');
    
    const symbol = row.symbol || row.instrument || row.pair || '';
    const type = (row.type || row.direction || row.side || '').toLowerCase();
    const volume = parseFloat(row.volume || row.lots || row.size) || 0;
    const entry = parseFloat(row.entry || row.open || row['open price'] || row.openprice) || 0;
    const exit = parseFloat(row.exit || row.close || row['close price'] || row.closeprice) || 0;
    const profit = parseFloat((row.profit || row.pnl || row['p&l'] || '0').replace(/[^-\d.]/g, '')) || 0;
    const commission = Math.abs(parseFloat((row.commission || '0').replace(/[^-\d.]/g, ''))) || 0;
    const swap = parseFloat((row.swap || '0').replace(/[^-\d.]/g, '')) || 0;
    
    let date = row.date || row['close time'] || row['open time'] || '';
    const dateMatch = date.match(/(\d{4}[.\-/]\d{2}[.\-/]\d{2})/);
    date = dateMatch ? dateMatch[1].replace(/[./]/g, '-') : new Date().toISOString().split('T')[0];
    const timeMatch = (row.time || row['close time'] || '').match(/(\d{2}:\d{2})/);
    const time = timeMatch ? timeMatch[1] : '00:00';
    
    if (!symbol || volume === 0) continue;
    if (!type.includes('buy') && !type.includes('sell') && !type.includes('long') && !type.includes('short')) continue;
    
    trades.push({ date, time, symbol: symbol.replace('/', '').toUpperCase(), side: type.includes('buy') || type.includes('long') ? 'Long' : 'Short', entry, exit: exit || entry, lots: volume, pnl: profit, commission, swap, stopLoss: 0, takeProfit: 0, marketStructure: '', candleType: '', liquidityTaken: [], liquidityTarget: [], notes: `Imported from ${platform}`, chartLink: '', chartImage: '' });
  }
  return trades;
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

const SYMBOL_CONFIG = {
  'EURUSD': { pipSize: 0.0001, lotSize: 100000, quoteUSD: true },
  'GBPUSD': { pipSize: 0.0001, lotSize: 100000, quoteUSD: true },
  'AUDUSD': { pipSize: 0.0001, lotSize: 100000, quoteUSD: true },
  'NZDUSD': { pipSize: 0.0001, lotSize: 100000, quoteUSD: true },
  'USDJPY': { pipSize: 0.01, lotSize: 100000, quoteJPY: true },
  'EURJPY': { pipSize: 0.01, lotSize: 100000, quoteJPY: true },
  'GBPJPY': { pipSize: 0.01, lotSize: 100000, quoteJPY: true },
  'AUDJPY': { pipSize: 0.01, lotSize: 100000, quoteJPY: true },
  'CADJPY': { pipSize: 0.01, lotSize: 100000, quoteJPY: true },
  'CHFJPY': { pipSize: 0.01, lotSize: 100000, quoteJPY: true },
  'NZDJPY': { pipSize: 0.01, lotSize: 100000, quoteJPY: true },
  'USDCAD': { pipSize: 0.0001, lotSize: 100000, quoteOther: true },
  'USDCHF': { pipSize: 0.0001, lotSize: 100000, quoteOther: true },
  'EURGBP': { pipSize: 0.0001, lotSize: 100000, quoteOther: true },
  'EURAUD': { pipSize: 0.0001, lotSize: 100000, quoteOther: true },
  'GBPAUD': { pipSize: 0.0001, lotSize: 100000, quoteOther: true },
  'AUDCAD': { pipSize: 0.0001, lotSize: 100000, quoteOther: true },
  'XAUUSD': { pipSize: 0.01, lotSize: 100, quoteUSD: true },
  'US30': { pipSize: 1, lotSize: 1, pointValue: 1 },
  'NAS100': { pipSize: 1, lotSize: 1, pointValue: 1 },
  'SPX500': { pipSize: 0.1, lotSize: 1, pointValue: 10 },
  'DEFAULT': { pipSize: 0.0001, lotSize: 100000, quoteUSD: true }
};

const calculatePipValue = (symbol, exitPrice) => {
  const config = SYMBOL_CONFIG[symbol.toUpperCase()] || SYMBOL_CONFIG['DEFAULT'];
  if (config.quoteUSD) return config.pipSize * config.lotSize;
  if (config.quoteJPY) { const rate = parseFloat(exitPrice) || 150; return (config.pipSize * config.lotSize) / rate; }
  if (config.pointValue) return config.pointValue;
  return config.pipSize * config.lotSize * 0.75;
};

const loadDarkMode = () => { try { return localStorage.getItem('ellipse_darkMode') === 'true'; } catch { return false; } };

export default function TradingJournal() {
  const [darkMode, setDarkMode] = useState(loadDarkMode);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [trades, setTrades] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [showNewTrade, setShowNewTrade] = useState(false);
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [showNewChallenge, setShowNewChallenge] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [editingTrade, setEditingTrade] = useState(null);
  const [filterAccount, setFilterAccount] = useState('all');
  const [analyticsAccount, setAnalyticsAccount] = useState('all');
  const [loading, setLoading] = useState(true);
  const [synced, setSynced] = useState(false);

  useEffect(() => { localStorage.setItem('ellipse_darkMode', darkMode); }, [darkMode]);

  // Load data from Supabase
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [tradesRes, accountsRes] = await Promise.all([
          supabase.from('trades').select('*').order('date', { ascending: false }),
          supabase.from('accounts').select('*').order('created_at', { ascending: true })
        ]);
        
        if (tradesRes.data) {
          setTrades(tradesRes.data.map(t => ({
            id: t.id, date: t.date, time: t.time, symbol: t.symbol, side: t.side,
            entry: t.entry, exit: t.exit_price, lots: t.lots,
            stopLoss: t.stop_loss, takeProfit: t.take_profit,
            pnl: parseFloat(t.pnl) || 0, commission: t.commission, swap: t.swap,
            riskReward: t.risk_reward, marketStructure: t.market_structure,
            candleType: t.candle_type, liquidityTaken: t.liquidity_taken || [],
            liquidityTarget: t.liquidity_target || [], notes: t.notes,
            account: t.account, chartLink: t.chart_link, chartImage: t.chart_image,
            challengeId: t.challenge_id || null
          })));
        }
        
        if (accountsRes.data) {
          setAccounts(accountsRes.data.map(a => ({
            id: a.id, name: a.name, platform: a.platform, broker: a.broker,
            server: a.server, balance: parseFloat(a.balance) || 0,
            equity: parseFloat(a.equity) || 0, connected: a.connected
          })));
        }

        // Load challenges from localStorage (or could be Supabase table)
        try {
          const saved = localStorage.getItem('ellipse_challenges');
          if (saved) setChallenges(JSON.parse(saved));
        } catch {}

        setSynced(true);
      } catch (err) {
        console.error('Error loading data:', err);
        setSynced(false);
      }
      setLoading(false);
    };
    loadData();
  }, []);

  // Save challenges to localStorage whenever they change
  useEffect(() => {
    if (challenges.length > 0 || !loading) {
      localStorage.setItem('ellipse_challenges', JSON.stringify(challenges));
    }
  }, [challenges]);

  // CRUD functions
  const addTrade = async (trade) => {
    const dbTrade = {
      date: trade.date, time: trade.time, symbol: trade.symbol, side: trade.side,
      entry: trade.entry, exit_price: trade.exit, lots: trade.lots,
      stop_loss: trade.stopLoss, take_profit: trade.takeProfit,
      pnl: trade.pnl, commission: trade.commission, swap: trade.swap,
      risk_reward: trade.riskReward, market_structure: trade.marketStructure,
      candle_type: trade.candleType, liquidity_taken: trade.liquidityTaken,
      liquidity_target: trade.liquidityTarget, notes: trade.notes,
      account: trade.account, chart_link: trade.chartLink, chart_image: trade.chartImage
    };
    const { data, error } = await supabase.from('trades').insert(dbTrade).select().single();
    if (error) { console.error('Error adding trade:', error); return; }
    setTrades(prev => [{ ...trade, id: data.id }, ...prev]);
  };

  const importTrades = async (newTrades, accountName) => {
    const dbTrades = newTrades.map(trade => ({
      date: trade.date, time: trade.time, symbol: trade.symbol, side: trade.side,
      entry: trade.entry, exit_price: trade.exit, lots: trade.lots,
      stop_loss: trade.stopLoss, take_profit: trade.takeProfit,
      pnl: trade.pnl, commission: trade.commission, swap: trade.swap,
      risk_reward: '-', market_structure: trade.marketStructure,
      candle_type: trade.candleType, liquidity_taken: trade.liquidityTaken,
      liquidity_target: trade.liquidityTarget, notes: trade.notes,
      account: accountName, chart_link: trade.chartLink, chart_image: trade.chartImage
    }));
    const { data, error } = await supabase.from('trades').insert(dbTrades).select();
    if (error) { console.error('Error importing trades:', error); return 0; }
    const importedTrades = data.map((t, i) => ({ ...newTrades[i], id: t.id, account: accountName }));
    setTrades(prev => [...importedTrades, ...prev].sort((a, b) => new Date(b.date) - new Date(a.date)));
    return data.length;
  };

  const deleteTrade = async (id) => {
    const { error } = await supabase.from('trades').delete().eq('id', id);
    if (error) { console.error('Error deleting trade:', error); return; }
    setTrades(prev => prev.filter(t => t.id !== id));
  };

  const updateTrade = async (trade) => {
    const dbTrade = {
      date: trade.date, time: trade.time, symbol: trade.symbol, side: trade.side,
      entry: trade.entry, exit_price: trade.exit, lots: trade.lots,
      stop_loss: trade.stopLoss, take_profit: trade.takeProfit,
      pnl: trade.pnl, commission: trade.commission, swap: trade.swap,
      risk_reward: trade.riskReward, market_structure: trade.marketStructure,
      candle_type: trade.candleType, liquidity_taken: trade.liquidityTaken,
      liquidity_target: trade.liquidityTarget, notes: trade.notes,
      account: trade.account, chart_link: trade.chartLink, chart_image: trade.chartImage
    };
    const { error } = await supabase.from('trades').update(dbTrade).eq('id', trade.id);
    if (error) { console.error('Error updating trade:', error); return; }
    setTrades(prev => prev.map(t => t.id === trade.id ? trade : t));
  };

  const addAccount = async (account) => {
    const { data, error } = await supabase.from('accounts').insert({
      name: account.name, platform: account.platform, broker: account.broker,
      server: account.server, balance: account.balance, equity: account.equity,
      connected: account.connected
    }).select().single();
    if (error) { console.error('Error adding account:', error); return; }
    setAccounts(prev => [...prev, { ...account, id: data.id }]);
  };

  const updateAccount = async (account) => {
    const { error } = await supabase.from('accounts').update({
      name: account.name, balance: account.balance, equity: account.equity
    }).eq('id', account.id);
    if (error) { console.error('Error updating account:', error); return; }
    setAccounts(prev => prev.map(a => a.id === account.id ? account : a));
  };

  const deleteAccount = async (id) => {
    const { error } = await supabase.from('accounts').delete().eq('id', id);
    if (error) { console.error('Error deleting account:', error); return; }
    setAccounts(prev => prev.filter(a => a.id !== id));
  };

  // Challenge CRUD
  const addChallenge = (challenge) => {
    const newChallenge = { ...challenge, id: Date.now().toString(), createdAt: new Date().toISOString() };
    setChallenges(prev => [...prev, newChallenge]);
  };

  const updateChallenge = (challenge) => {
    setChallenges(prev => prev.map(c => c.id === challenge.id ? challenge : c));
  };

  const deleteChallenge = (id) => {
    setChallenges(prev => prev.filter(c => c.id !== id));
  };

  const filteredTrades = filterAccount === 'all' ? trades : trades.filter(t => t.account === filterAccount);
  const totalPnl = filteredTrades.reduce((sum, t) => sum + t.pnl, 0);
  const winningTrades = filteredTrades.filter(t => t.pnl > 0).length;

  // Count active challenges for badge
  const activeChallenges = challenges.filter(c => c.status === 'active').length;

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
          .progress-bar { height: 8px; border-radius: 4px; overflow: hidden; position: relative; }
          .progress-fill { height: 100%; border-radius: 4px; transition: width 0.5s ease; }
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes pulse-danger { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
          .pulse-danger { animation: pulse-danger 1.5s ease-in-out infinite; }
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
                { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
                { id: 'journal', label: 'Journal', icon: BookOpen },
                { id: 'propfirm', label: 'Prop Firms', icon: Trophy, badge: activeChallenges },
                { id: 'accounts', label: 'Accounts', icon: Wallet },
                { id: 'calendar', label: 'Calendar', icon: Calendar },
              ].map(item => (
                <div key={item.id} onClick={() => setActiveTab(item.id)} className={`nav-item ${activeTab === item.id ? 'active' : ''}`} style={{ position: 'relative' }}>
                  <item.icon size={18} />
                  {item.label}
                  {item.badge > 0 && (
                    <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: activeTab === item.id ? 'rgba(255,255,255,0.25)' : '#6366f1', color: 'white' }}>{item.badge}</span>
                  )}
                </div>
              ))}
            </nav>

            <div style={{ padding: 12, borderTop: `1px solid ${theme.cardBorder}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', marginBottom: 8, fontSize: 12, color: synced ? '#10b981' : '#ef4444' }}>
                {loading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : synced ? <Cloud size={14} /> : <CloudOff size={14} />}
                {loading ? 'Syncing...' : synced ? 'Synced to cloud' : 'Offline'}
              </div>
              <div className="card" style={{ padding: 16 }}>
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
                    {activeTab === 'dashboard' && 'Dashboard'}
                    {activeTab === 'journal' && 'Trading Journal'}
                    {activeTab === 'propfirm' && 'Prop Firm Challenges'}
                    {activeTab === 'accounts' && 'Accounts'}
                    {activeTab === 'calendar' && 'Calendar'}
                  </h1>
                  <p style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>
                    {activeTab === 'dashboard' && 'Performance metrics and insights'}
                    {activeTab === 'journal' && 'Document and analyze your trades'}
                    {activeTab === 'propfirm' && 'Track challenges, drawdowns & profit targets'}
                    {activeTab === 'accounts' && 'Manage trading accounts'}
                    {activeTab === 'calendar' && 'Visual trade history'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setDarkMode(!darkMode)} style={{ padding: 10, borderRadius: 10, border: `1px solid ${theme.cardBorder}`, background: theme.card, cursor: 'pointer' }}>
                    {darkMode ? <Sun size={18} style={{ color: theme.textMuted }} /> : <Moon size={18} style={{ color: theme.textMuted }} />}
                  </button>
                  {activeTab === 'journal' && (
                    <>
                      <button onClick={() => setShowImport(true)} style={{ padding: 10, borderRadius: 10, border: `1px solid ${theme.cardBorder}`, background: theme.card, cursor: 'pointer' }} title="Import trades">
                        <Upload size={18} style={{ color: theme.textMuted }} />
                      </button>
                      <button onClick={() => setShowNewTrade(true)} className="btn-primary flex items-center gap-2"><Plus size={16} />Log Trade</button>
                    </>
                  )}
                  {activeTab === 'accounts' && <button onClick={() => setShowNewAccount(true)} className="btn-primary flex items-center gap-2"><Plus size={16} />Add Account</button>}
                  {activeTab === 'propfirm' && <button onClick={() => setShowNewChallenge(true)} className="btn-primary flex items-center gap-2"><Plus size={16} />New Challenge</button>}
                </div>
              </div>
            </header>

            <div className="flex-1 overflow-auto scrollbar" style={{ padding: 24 }}>
              {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <Loader2 size={32} style={{ color: theme.textMuted, animation: 'spin 1s linear infinite' }} />
                </div>
              ) : (
                <>
                  {activeTab === 'dashboard' && <DashboardView trades={trades} accounts={accounts} selectedAccount={analyticsAccount} setSelectedAccount={setAnalyticsAccount} challenges={challenges} />}
                  {activeTab === 'journal' && <JournalView trades={trades} accounts={accounts} filterAccount={filterAccount} setFilterAccount={setFilterAccount} onSelectTrade={setSelectedTrade} />}
                  {activeTab === 'propfirm' && <PropFirmView challenges={challenges} trades={trades} accounts={accounts} onUpdate={updateChallenge} onDelete={deleteChallenge} onAddChallenge={() => setShowNewChallenge(true)} />}
                  {activeTab === 'accounts' && <AccountsView accounts={accounts} onUpdate={updateAccount} onDelete={deleteAccount} />}
                  {activeTab === 'calendar' && <CalendarView trades={trades} />}
                </>
              )}
            </div>
          </main>
        </div>

        {showNewTrade && <NewTradeModal onClose={() => setShowNewTrade(false)} onSave={(trade) => { addTrade(trade); setShowNewTrade(false); }} accounts={accounts} challenges={challenges} />}
        {showNewAccount && <NewAccountModal onClose={() => setShowNewAccount(false)} onSave={(acc) => { addAccount(acc); setShowNewAccount(false); }} />}
        {showNewChallenge && <NewChallengeModal onClose={() => setShowNewChallenge(false)} onSave={(ch) => { addChallenge(ch); setShowNewChallenge(false); }} accounts={accounts} />}
        {showImport && <ImportModal onClose={() => setShowImport(false)} onImport={importTrades} accounts={accounts} />}
        {selectedTrade && <TradeDetailModal trade={selectedTrade} onClose={() => setSelectedTrade(null)} onDelete={(id) => { deleteTrade(id); setSelectedTrade(null); }} onEdit={(trade) => { setSelectedTrade(null); setEditingTrade(trade); }} />}
        {editingTrade && <EditTradeModal trade={editingTrade} onClose={() => setEditingTrade(null)} onSave={(trade) => { updateTrade(trade); setEditingTrade(null); }} accounts={accounts} />}
      </div>
    </ThemeContext.Provider>
  );
}

// ===== PROP FIRM VIEW =====
function PropFirmView({ challenges, trades, accounts, onUpdate, onDelete, onAddChallenge }) {
  const theme = useTheme();
  const [selectedChallenge, setSelectedChallenge] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const activeChallenges = challenges.filter(c => c.status === 'active');
  const completedChallenges = challenges.filter(c => c.status !== 'active');

  const getChallengeStats = (challenge) => {
    // Get trades linked to this challenge's account within the challenge date range
    const challengeTrades = trades.filter(t => {
      if (t.account !== challenge.account) return false;
      if (challenge.startDate && t.date < challenge.startDate) return false;
      if (challenge.endDate && t.date > challenge.endDate) return false;
      return true;
    }).sort((a, b) => new Date(a.date + ' ' + a.time) - new Date(b.date + ' ' + b.time));

    const totalPnl = challengeTrades.reduce((s, t) => s + t.pnl, 0);
    const profitTargetAmount = challenge.accountSize * (challenge.profitTarget / 100);
    const profitProgress = challenge.profitTarget ? (totalPnl / profitTargetAmount) * 100 : 0;

    // Daily P&L for drawdown calculation
    const dailyPnl = {};
    challengeTrades.forEach(t => {
      if (!dailyPnl[t.date]) dailyPnl[t.date] = 0;
      dailyPnl[t.date] += t.pnl;
    });

    const tradingDays = Object.keys(dailyPnl).length;
    const dailyPnlValues = Object.values(dailyPnl);
    const todayStr = new Date().toISOString().split('T')[0];
    const todayPnl = dailyPnl[todayStr] || 0;

    // Max daily loss (worst single day)
    const worstDay = dailyPnlValues.length > 0 ? Math.min(...dailyPnlValues) : 0;
    const maxDailyDrawdownAmount = challenge.accountSize * (challenge.maxDailyDrawdown / 100);
    const dailyDrawdownUsed = todayPnl < 0 ? (Math.abs(todayPnl) / maxDailyDrawdownAmount) * 100 : 0;

    // Total drawdown (cumulative low point)
    let runningPnl = 0;
    let maxDrawdown = 0;
    const equityCurve = [];
    Object.entries(dailyPnl).sort(([a], [b]) => a.localeCompare(b)).forEach(([date, pnl]) => {
      runningPnl += pnl;
      if (runningPnl < maxDrawdown) maxDrawdown = runningPnl;
      equityCurve.push({ date: date.slice(5), equity: challenge.accountSize + runningPnl, pnl: runningPnl });
    });

    const maxTotalDrawdownAmount = challenge.accountSize * (challenge.maxTotalDrawdown / 100);
    const totalDrawdownUsed = maxDrawdown < 0 ? (Math.abs(maxDrawdown) / maxTotalDrawdownAmount) * 100 : 0;

    // Days remaining
    let daysRemaining = null;
    if (challenge.maxTradingDays && challenge.startDate) {
      const start = new Date(challenge.startDate);
      const end = new Date(start);
      end.setDate(end.getDate() + challenge.maxTradingDays);
      const today = new Date();
      daysRemaining = Math.max(0, Math.ceil((end - today) / (1000 * 60 * 60 * 24)));
    }

    // Status alerts
    const alerts = [];
    if (dailyDrawdownUsed >= 80) alerts.push({ type: 'danger', message: `Daily drawdown at ${dailyDrawdownUsed.toFixed(0)}%` });
    else if (dailyDrawdownUsed >= 60) alerts.push({ type: 'warning', message: `Daily drawdown at ${dailyDrawdownUsed.toFixed(0)}%` });
    if (totalDrawdownUsed >= 80) alerts.push({ type: 'danger', message: `Total drawdown at ${totalDrawdownUsed.toFixed(0)}%` });
    else if (totalDrawdownUsed >= 60) alerts.push({ type: 'warning', message: `Total drawdown at ${totalDrawdownUsed.toFixed(0)}%` });
    if (daysRemaining !== null && daysRemaining <= 5) alerts.push({ type: 'warning', message: `${daysRemaining} days remaining` });

    // Breach detection
    const dailyBreached = todayPnl <= -maxDailyDrawdownAmount;
    const totalBreached = totalPnl <= -maxTotalDrawdownAmount;

    return {
      challengeTrades, totalPnl, profitTargetAmount, profitProgress,
      tradingDays, todayPnl, worstDay,
      dailyDrawdownUsed, totalDrawdownUsed,
      maxDailyDrawdownAmount, maxTotalDrawdownAmount,
      daysRemaining, alerts, equityCurve,
      dailyBreached, totalBreached,
      dailyPnl
    };
  };

  if (challenges.length === 0) {
    return (
      <div className="card-lg" style={{ padding: 60, textAlign: 'center' }}>
        <Trophy size={48} style={{ color: theme.textFaint, margin: '0 auto 16px', opacity: 0.4 }} />
        <p style={{ fontSize: 16, fontWeight: 500, color: theme.text, marginBottom: 4 }}>No challenges yet</p>
        <p style={{ fontSize: 13, color: theme.textFaint, marginBottom: 20 }}>Start tracking your prop firm challenge to monitor drawdowns and profit targets</p>
        <button onClick={onAddChallenge} className="btn-primary flex items-center gap-2" style={{ margin: '0 auto' }}><Plus size={16} />New Challenge</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Active Challenges */}
      {activeChallenges.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Active Challenges</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 16 }}>
            {activeChallenges.map(challenge => {
              const stats = getChallengeStats(challenge);
              const preset = PROP_FIRM_PRESETS[challenge.preset] || PROP_FIRM_PRESETS.CUSTOM;
              const firmColor = challenge.firmColor || preset.color;

              return (
                <div key={challenge.id} className="card-lg" style={{ overflow: 'hidden' }}>
                  {/* Header */}
                  <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="flex items-center gap-3">
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: `${firmColor}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Trophy size={20} style={{ color: firmColor }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: theme.text }}>{challenge.name}</div>
                        <div style={{ fontSize: 12, color: theme.textFaint }}>{challenge.firmName} · ${challenge.accountSize?.toLocaleString()} · {challenge.phaseName}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {stats.alerts.map((alert, i) => (
                        <div key={i} className={alert.type === 'danger' ? 'pulse-danger' : ''} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: alert.type === 'danger' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)', color: alert.type === 'danger' ? '#ef4444' : '#f59e0b' }}>
                          {alert.message}
                        </div>
                      ))}
                      <button onClick={() => setSelectedChallenge(selectedChallenge === challenge.id ? null : challenge.id)} style={{ padding: 6, borderRadius: 6, border: 'none', background: theme.hoverBg, cursor: 'pointer' }}>
                        <ChevronDown size={16} style={{ color: theme.textMuted, transform: selectedChallenge === challenge.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                      </button>
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div style={{ padding: 20 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
                      <div style={{ textAlign: 'center' }}>
                        <div className="stat-label">Net P&L</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: stats.totalPnl >= 0 ? '#10b981' : '#ef4444', marginTop: 4 }}>
                          {stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toFixed(2)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div className="stat-label">Today</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: stats.todayPnl >= 0 ? '#10b981' : '#ef4444', marginTop: 4 }}>
                          {stats.todayPnl >= 0 ? '+' : ''}${stats.todayPnl.toFixed(2)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div className="stat-label">Trade Days</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: theme.text, marginTop: 4 }}>
                          {stats.tradingDays}{challenge.minTradingDays > 0 ? `/${challenge.minTradingDays}` : ''}
                        </div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div className="stat-label">Days Left</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: stats.daysRemaining !== null && stats.daysRemaining <= 5 ? '#f59e0b' : theme.text, marginTop: 4 }}>
                          {stats.daysRemaining !== null ? stats.daysRemaining : '∞'}
                        </div>
                      </div>
                    </div>

                    {/* Profit Target Progress */}
                    {challenge.profitTarget && (
                      <div style={{ marginBottom: 16 }}>
                        <div className="flex justify-between items-center" style={{ marginBottom: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 500, color: theme.textMuted }}>Profit Target ({challenge.profitTarget}%)</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: stats.profitProgress >= 100 ? '#10b981' : theme.text }}>
                            ${stats.totalPnl.toFixed(2)} / ${stats.profitTargetAmount.toFixed(2)}
                          </span>
                        </div>
                        <div className="progress-bar" style={{ background: theme.hoverBg }}>
                          <div className="progress-fill" style={{ width: `${Math.min(Math.max(stats.profitProgress, 0), 100)}%`, background: stats.profitProgress >= 100 ? '#10b981' : `linear-gradient(90deg, ${firmColor}, ${firmColor}cc)` }} />
                        </div>
                        <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 4, textAlign: 'right' }}>
                          {stats.profitProgress.toFixed(1)}% complete
                        </div>
                      </div>
                    )}

                    {/* Drawdown Meters */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      {/* Daily Drawdown */}
                      <div style={{ padding: 14, borderRadius: 10, background: stats.dailyBreached ? 'rgba(239,68,68,0.1)' : theme.hoverBg, border: stats.dailyDrawdownUsed >= 80 ? '1px solid rgba(239,68,68,0.3)' : 'none' }}>
                        <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                          <Shield size={14} style={{ color: stats.dailyDrawdownUsed >= 80 ? '#ef4444' : stats.dailyDrawdownUsed >= 60 ? '#f59e0b' : '#10b981' }} />
                          <span style={{ fontSize: 12, fontWeight: 500, color: theme.textMuted }}>Daily Drawdown</span>
                        </div>
                        <div className="flex justify-between items-center" style={{ marginBottom: 6 }}>
                          <span style={{ fontSize: 16, fontWeight: 700, color: stats.todayPnl < 0 ? '#ef4444' : '#10b981' }}>
                            ${Math.abs(stats.todayPnl).toFixed(2)}
                          </span>
                          <span style={{ fontSize: 12, color: theme.textFaint }}>
                            / ${stats.maxDailyDrawdownAmount.toFixed(2)}
                          </span>
                        </div>
                        <div className="progress-bar" style={{ background: darkMode ? '#1f1f1f' : '#e2e8f0' }}>
                          <div className="progress-fill" style={{
                            width: `${Math.min(stats.dailyDrawdownUsed, 100)}%`,
                            background: stats.dailyDrawdownUsed >= 80 ? '#ef4444' : stats.dailyDrawdownUsed >= 60 ? '#f59e0b' : '#10b981'
                          }} />
                        </div>
                        {stats.dailyBreached && <div style={{ fontSize: 11, color: '#ef4444', fontWeight: 600, marginTop: 4 }}>BREACHED</div>}
                      </div>

                      {/* Total Drawdown */}
                      <div style={{ padding: 14, borderRadius: 10, background: stats.totalBreached ? 'rgba(239,68,68,0.1)' : theme.hoverBg, border: stats.totalDrawdownUsed >= 80 ? '1px solid rgba(239,68,68,0.3)' : 'none' }}>
                        <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                          <Activity size={14} style={{ color: stats.totalDrawdownUsed >= 80 ? '#ef4444' : stats.totalDrawdownUsed >= 60 ? '#f59e0b' : '#10b981' }} />
                          <span style={{ fontSize: 12, fontWeight: 500, color: theme.textMuted }}>Max Drawdown</span>
                        </div>
                        <div className="flex justify-between items-center" style={{ marginBottom: 6 }}>
                          <span style={{ fontSize: 16, fontWeight: 700, color: stats.totalPnl < 0 ? '#ef4444' : '#10b981' }}>
                            {stats.totalDrawdownUsed.toFixed(1)}%
                          </span>
                          <span style={{ fontSize: 12, color: theme.textFaint }}>
                            / {challenge.maxTotalDrawdown}%
                          </span>
                        </div>
                        <div className="progress-bar" style={{ background: darkMode ? '#1f1f1f' : '#e2e8f0' }}>
                          <div className="progress-fill" style={{
                            width: `${Math.min(stats.totalDrawdownUsed, 100)}%`,
                            background: stats.totalDrawdownUsed >= 80 ? '#ef4444' : stats.totalDrawdownUsed >= 60 ? '#f59e0b' : '#10b981'
                          }} />
                        </div>
                        {stats.totalBreached && <div style={{ fontSize: 11, color: '#ef4444', fontWeight: 600, marginTop: 4 }}>BREACHED</div>}
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {selectedChallenge === challenge.id && (
                      <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${theme.cardBorder}` }}>
                        {/* Equity Curve */}
                        {stats.equityCurve.length > 0 && (
                          <div style={{ marginBottom: 16 }}>
                            <div className="stat-label" style={{ marginBottom: 8 }}>Equity Curve</div>
                            <div style={{ height: 140 }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={stats.equityCurve}>
                                  <defs>
                                    <linearGradient id={`eq-${challenge.id}`} x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="0%" stopColor={firmColor} stopOpacity={0.3} />
                                      <stop offset="100%" stopColor={firmColor} stopOpacity={0} />
                                    </linearGradient>
                                  </defs>
                                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: theme.textFaint }} />
                                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: theme.textFaint }} tickFormatter={v => `$${(v/1000).toFixed(1)}k`} />
                                  <Tooltip contentStyle={{ background: theme.card, border: `1px solid ${theme.cardBorder}`, borderRadius: 8, fontSize: 12 }} formatter={(v) => [`$${v.toLocaleString()}`, 'Equity']} />
                                  <Area type="monotone" dataKey="equity" stroke={firmColor} fill={`url(#eq-${challenge.id})`} strokeWidth={2} />
                                </AreaChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        )}

                        {/* Daily P&L Breakdown */}
                        <div style={{ marginBottom: 16 }}>
                          <div className="stat-label" style={{ marginBottom: 8 }}>Daily P&L</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflow: 'auto' }} className="scrollbar">
                            {Object.entries(stats.dailyPnl).sort(([a], [b]) => b.localeCompare(a)).map(([date, pnl]) => (
                              <div key={date} className="flex justify-between items-center" style={{ padding: '8px 12px', borderRadius: 6, background: theme.hoverBg }}>
                                <span style={{ fontSize: 12, color: theme.textMuted }}>{date}</span>
                                <span style={{ fontSize: 13, fontWeight: 600, color: pnl >= 0 ? '#10b981' : '#ef4444' }}>{pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Challenge Rules */}
                        <div style={{ padding: 14, borderRadius: 10, background: theme.hoverBg }}>
                          <div className="stat-label" style={{ marginBottom: 8 }}>Rules</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                            {challenge.profitTarget && <div><span style={{ color: theme.textFaint }}>Profit Target:</span> <span style={{ color: theme.text, fontWeight: 500 }}>{challenge.profitTarget}%</span></div>}
                            <div><span style={{ color: theme.textFaint }}>Daily DD:</span> <span style={{ color: theme.text, fontWeight: 500 }}>{challenge.maxDailyDrawdown}%</span></div>
                            <div><span style={{ color: theme.textFaint }}>Max DD:</span> <span style={{ color: theme.text, fontWeight: 500 }}>{challenge.maxTotalDrawdown}%</span></div>
                            <div><span style={{ color: theme.textFaint }}>DD Type:</span> <span style={{ color: theme.text, fontWeight: 500 }}>{challenge.drawdownType}</span></div>
                            {challenge.minTradingDays > 0 && <div><span style={{ color: theme.textFaint }}>Min Days:</span> <span style={{ color: theme.text, fontWeight: 500 }}>{challenge.minTradingDays}</span></div>}
                            {challenge.maxTradingDays && <div><span style={{ color: theme.textFaint }}>Max Days:</span> <span style={{ color: theme.text, fontWeight: 500 }}>{challenge.maxTradingDays}</span></div>}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2" style={{ marginTop: 12 }}>
                          <button onClick={() => onUpdate({ ...challenge, status: 'passed' })} style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', background: 'rgba(16,185,129,0.1)', color: '#10b981', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                            Mark Passed
                          </button>
                          <button onClick={() => onUpdate({ ...challenge, status: 'failed' })} style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                            Mark Failed
                          </button>
                          <button onClick={() => setConfirmDelete(challenge.id)} style={{ padding: 10, borderRadius: 8, border: 'none', background: theme.hoverBg, cursor: 'pointer' }}>
                            <Trash2 size={16} style={{ color: theme.textFaint }} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Completed/Failed Challenges */}
      {completedChallenges.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 8 }}>Completed</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {completedChallenges.map(challenge => (
              <div key={challenge.id} className="card" style={{ padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.7 }}>
                <div className="flex items-center gap-3">
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: challenge.status === 'passed' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {challenge.status === 'passed' ? <CheckCircle size={18} style={{ color: '#10b981' }} /> : <X size={18} style={{ color: '#ef4444' }} />}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: theme.text }}>{challenge.name}</div>
                    <div style={{ fontSize: 12, color: theme.textFaint }}>{challenge.firmName} · ${challenge.accountSize?.toLocaleString()} · {challenge.phaseName}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="badge" style={{ background: challenge.status === 'passed' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: challenge.status === 'passed' ? '#10b981' : '#ef4444' }}>
                    {challenge.status === 'passed' ? 'Passed' : 'Failed'}
                  </span>
                  <button onClick={() => { onUpdate({ ...challenge, status: 'active' }); }} style={{ padding: 6, borderRadius: 6, border: 'none', background: theme.hoverBg, cursor: 'pointer', fontSize: 11, color: theme.textMuted }}>
                    Reactivate
                  </button>
                  <button onClick={() => onDelete(challenge.id)} style={{ padding: 6, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                    <Trash2 size={14} style={{ color: theme.textFaint }} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)}>
          <div style={{ padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: theme.text, marginBottom: 8 }}>Delete Challenge?</h3>
            <p style={{ fontSize: 14, color: theme.textMuted, marginBottom: 20 }}>This will permanently remove this challenge. Your trades will not be affected.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="input" style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => { onDelete(confirmDelete); setConfirmDelete(null); }} className="btn-primary" style={{ flex: 1, background: '#ef4444' }}>Delete</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ===== NEW CHALLENGE MODAL =====
function NewChallengeModal({ onClose, onSave, accounts }) {
  const theme = useTheme();
  const [preset, setPreset] = useState('FTMO');
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [challenge, setChallenge] = useState({
    name: '', firmName: 'FTMO', firmColor: '#0ea5e9',
    account: accounts[0]?.name || '',
    accountSize: 100000,
    phaseName: 'FTMO Challenge',
    profitTarget: 10, maxDailyDrawdown: 5, maxTotalDrawdown: 10,
    drawdownType: 'balance',
    minTradingDays: 4, maxTradingDays: 30,
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    status: 'active',
    preset: 'FTMO'
  });

  const applyPreset = (presetKey, phaseIdx = 0) => {
    const p = PROP_FIRM_PRESETS[presetKey];
    if (!p) return;
    const phase = p.phases[phaseIdx];
    setPreset(presetKey);
    setPhaseIndex(phaseIdx);
    setChallenge(prev => ({
      ...prev,
      firmName: p.name, firmColor: p.color,
      phaseName: phase.name,
      profitTarget: phase.profitTarget || 0,
      maxDailyDrawdown: phase.maxDailyDrawdown,
      maxTotalDrawdown: phase.maxTotalDrawdown,
      drawdownType: phase.drawdownType,
      minTradingDays: phase.minTradingDays,
      maxTradingDays: phase.maxTradingDays || 0,
      preset: presetKey
    }));
  };

  useEffect(() => { applyPreset('FTMO', 0); }, []);

  const currentPreset = PROP_FIRM_PRESETS[preset];

  return (
    <Modal width={520} onClose={onClose}>
      <div style={{ padding: 20, borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: theme.text }}>New Challenge</h3>
          <p style={{ fontSize: 12, color: theme.textFaint }}>Set up your prop firm challenge tracking</p>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} style={{ color: theme.textFaint }} /></button>
      </div>

      <div style={{ padding: 20, maxHeight: '65vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }} className="scrollbar">
        {/* Firm Preset */}
        <div>
          <label className="label">Prop Firm</label>
          <div className="flex gap-2">
            {Object.entries(PROP_FIRM_PRESETS).map(([key, p]) => (
              <button key={key} onClick={() => applyPreset(key, 0)} style={{
                flex: 1, padding: 12, borderRadius: 10, fontSize: 13, fontWeight: 500,
                border: `1px solid ${preset === key ? p.color : theme.cardBorder}`,
                background: preset === key ? `${p.color}15` : 'transparent',
                color: preset === key ? p.color : theme.textMuted, cursor: 'pointer'
              }}>
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Phase Selection */}
        <div>
          <label className="label">Phase</label>
          <div className="flex gap-2">
            {currentPreset.phases.map((phase, i) => (
              <button key={i} onClick={() => applyPreset(preset, i)} style={{
                flex: 1, padding: 10, borderRadius: 8, fontSize: 12, fontWeight: 500,
                border: `1px solid ${phaseIndex === i ? '#6366f1' : theme.cardBorder}`,
                background: phaseIndex === i ? 'rgba(99,102,241,0.1)' : 'transparent',
                color: phaseIndex === i ? '#6366f1' : theme.textMuted, cursor: 'pointer'
              }}>
                {phase.name}
              </button>
            ))}
          </div>
        </div>

        {/* Challenge Name */}
        <div>
          <label className="label">Challenge Name</label>
          <input value={challenge.name} onChange={(e) => setChallenge({...challenge, name: e.target.value})} placeholder="My FTMO Challenge" className="input" />
        </div>

        {/* Account & Size */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="label">Linked Account</label>
            <select value={challenge.account} onChange={(e) => setChallenge({...challenge, account: e.target.value})} className="input">
              <option value="">None (manual)</option>
              {accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Account Size ($)</label>
            <select value={challenge.accountSize} onChange={(e) => setChallenge({...challenge, accountSize: parseInt(e.target.value)})} className="input">
              {(currentPreset.accountSizes || [5000, 10000, 25000, 50000, 100000, 200000]).map(s => (
                <option key={s} value={s}>${s.toLocaleString()}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Start Date */}
        <div>
          <label className="label">Start Date</label>
          <input type="date" value={challenge.startDate} onChange={(e) => setChallenge({...challenge, startDate: e.target.value})} className="input" />
        </div>

        {/* Rules (editable for Custom) */}
        <div style={{ padding: 16, borderRadius: 10, background: theme.hoverBg }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
            <Settings size={14} style={{ color: theme.textMuted }} />
            <span style={{ fontSize: 12, fontWeight: 500, color: theme.textMuted }}>Challenge Rules</span>
            {preset !== 'CUSTOM' && <span style={{ fontSize: 10, color: theme.textFaint, marginLeft: 'auto' }}>Auto-filled from {currentPreset.name}</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <div>
              <label className="label">Profit Target (%)</label>
              <input type="number" step="0.5" value={challenge.profitTarget} onChange={(e) => setChallenge({...challenge, profitTarget: parseFloat(e.target.value) || 0})} className="input input-sm" />
            </div>
            <div>
              <label className="label">Daily Drawdown (%)</label>
              <input type="number" step="0.5" value={challenge.maxDailyDrawdown} onChange={(e) => setChallenge({...challenge, maxDailyDrawdown: parseFloat(e.target.value) || 0})} className="input input-sm" />
            </div>
            <div>
              <label className="label">Max Drawdown (%)</label>
              <input type="number" step="0.5" value={challenge.maxTotalDrawdown} onChange={(e) => setChallenge({...challenge, maxTotalDrawdown: parseFloat(e.target.value) || 0})} className="input input-sm" />
            </div>
            <div>
              <label className="label">Drawdown Type</label>
              <select value={challenge.drawdownType} onChange={(e) => setChallenge({...challenge, drawdownType: e.target.value})} className="input input-sm">
                <option value="balance">Balance-based</option>
                <option value="equity">Equity-based</option>
                <option value="trailing">Trailing</option>
              </select>
            </div>
            <div>
              <label className="label">Min Trading Days</label>
              <input type="number" value={challenge.minTradingDays} onChange={(e) => setChallenge({...challenge, minTradingDays: parseInt(e.target.value) || 0})} className="input input-sm" />
            </div>
            <div>
              <label className="label">Max Calendar Days</label>
              <input type="number" value={challenge.maxTradingDays} onChange={(e) => setChallenge({...challenge, maxTradingDays: parseInt(e.target.value) || 0})} className="input input-sm" placeholder="0 = unlimited" />
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: 20, borderTop: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 14, color: theme.textMuted, cursor: 'pointer' }}>Cancel</button>
        <button onClick={() => onSave({
          ...challenge,
          name: challenge.name || `${challenge.firmName} ${challenge.phaseName}`
        })} className="btn-primary">Create Challenge</button>
      </div>
    </Modal>
  );
}

// ===== EXISTING COMPONENTS (kept intact with minor enhancements) =====

function ImportModal({ onClose, onImport, accounts }) {
  const theme = useTheme();
  const fileInputRef = useRef(null);
  const [platform, setPlatform] = useState('MT5');
  const [account, setAccount] = useState(accounts[0]?.name || '');
  const [parsedTrades, setParsedTrades] = useState([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(''); setParsedTrades([]);
    try {
      const text = await file.text();
      let trades = [];
      if (file.name.endsWith('.csv')) trades = parseCSV(text, platform);
      else if (file.name.endsWith('.html') || file.name.endsWith('.htm')) trades = platform === 'MT5' ? parseMT5Statement(text) : parseCTraderStatement(text);
      else if (text.includes('<html') || text.includes('<table')) trades = platform === 'MT5' ? parseMT5Statement(text) : parseCTraderStatement(text);
      else trades = parseCSV(text, platform);
      if (trades.length === 0) setError('No trades found in file.');
      else setParsedTrades(trades);
    } catch (err) { setError('Failed to parse file: ' + err.message); }
  };

  const handleImport = async () => {
    if (parsedTrades.length === 0 || !account) return;
    setImporting(true); setError('');
    try {
      const count = await onImport(parsedTrades, account);
      setSuccess(`Successfully imported ${count} trades!`);
      setParsedTrades([]);
      setTimeout(() => onClose(), 1500);
    } catch (err) { setError('Failed to import: ' + err.message); }
    setImporting(false);
  };

  return (
    <Modal width={600} onClose={onClose}>
      <div style={{ padding: 20, borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><h3 style={{ fontSize: 16, fontWeight: 600, color: theme.text }}>Import Trades</h3><p style={{ fontSize: 12, color: theme.textFaint }}>Import from MT5 or cTrader statement</p></div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={20} style={{ color: theme.textFaint }} /></button>
      </div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div><label className="label">Platform</label><div className="flex gap-2">{['MT5', 'cTrader'].map(p => (<button key={p} onClick={() => setPlatform(p)} style={{ flex: 1, padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 500, border: `1px solid ${platform === p ? '#6366f1' : theme.cardBorder}`, background: platform === p ? 'rgba(99,102,241,0.1)' : 'transparent', color: platform === p ? '#6366f1' : theme.textMuted, cursor: 'pointer' }}>{p}</button>))}</div></div>
        <div><label className="label">Import to Account</label><select value={account} onChange={(e) => setAccount(e.target.value)} className="input">{accounts.length === 0 ? <option>No accounts - create one first</option> : accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}</select></div>
        <div><label className="label">Statement File</label><input type="file" ref={fileInputRef} onChange={handleFileSelect} accept=".html,.htm,.csv" style={{ display: 'none' }} /><button onClick={() => fileInputRef.current?.click()} style={{ width: '100%', padding: 24, borderRadius: 10, border: `2px dashed ${theme.cardBorder}`, background: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}><FileText size={32} style={{ color: theme.textMuted }} /><span style={{ fontSize: 14, color: theme.text }}>Click to select file</span><span style={{ fontSize: 12, color: theme.textFaint }}>HTML or CSV statement from {platform}</span></button></div>
        <div style={{ padding: 14, borderRadius: 10, background: theme.hoverBg }}><div style={{ fontSize: 12, fontWeight: 500, color: theme.textMuted, marginBottom: 8 }}>How to export:</div>{platform === 'MT5' ? (<ol style={{ fontSize: 12, color: theme.textFaint, paddingLeft: 16, margin: 0 }}><li>Open MT5 → History tab</li><li>Right-click → Select period</li><li>Right-click → Report → HTML</li><li>Upload the HTML file here</li></ol>) : (<ol style={{ fontSize: 12, color: theme.textFaint, paddingLeft: 16, margin: 0 }}><li>Open cTrader → History</li><li>Set your date range</li><li>Click Export → HTML or CSV</li><li>Upload the file here</li></ol>)}</div>
        {error && <div style={{ padding: 12, borderRadius: 10, background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', gap: 8 }}><AlertCircle size={16} style={{ color: '#ef4444' }} /><span style={{ fontSize: 13, color: '#ef4444' }}>{error}</span></div>}
        {success && <div style={{ padding: 12, borderRadius: 10, background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', gap: 8 }}><CheckCircle size={16} style={{ color: '#10b981' }} /><span style={{ fontSize: 13, color: '#10b981' }}>{success}</span></div>}
        {parsedTrades.length > 0 && (
          <div style={{ borderRadius: 10, border: `1px solid ${theme.cardBorder}`, overflow: 'hidden' }}>
            <div style={{ padding: 12, background: theme.hoverBg, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 13, fontWeight: 500, color: theme.text }}>Preview ({parsedTrades.length} trades)</span><span style={{ fontSize: 12, color: parsedTrades.reduce((s, t) => s + t.pnl, 0) >= 0 ? '#10b981' : '#ef4444' }}>Total P&L: ${parsedTrades.reduce((s, t) => s + t.pnl, 0).toFixed(2)}</span></div>
            <div style={{ maxHeight: 200, overflow: 'auto' }} className="scrollbar">{parsedTrades.slice(0, 10).map((t, i) => (<div key={i} style={{ padding: 10, borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}><div className="flex items-center gap-3"><span style={{ fontWeight: 600, color: theme.text }}>{t.symbol}</span><span style={{ color: t.side === 'Long' ? '#10b981' : '#ef4444' }}>{t.side}</span><span style={{ color: theme.textFaint }}>{t.lots} lots</span></div><div className="flex items-center gap-3"><span style={{ color: theme.textFaint }}>{t.date}</span><span style={{ fontWeight: 600, color: t.pnl >= 0 ? '#10b981' : '#ef4444' }}>{t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}</span></div></div>))}{parsedTrades.length > 10 && <div style={{ padding: 10, textAlign: 'center', fontSize: 12, color: theme.textFaint }}>... and {parsedTrades.length - 10} more trades</div>}</div>
          </div>
        )}
      </div>
      <div style={{ padding: 20, borderTop: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 14, color: theme.textMuted, cursor: 'pointer' }}>Cancel</button>
        <button onClick={handleImport} disabled={parsedTrades.length === 0 || importing || !account || accounts.length === 0} className="btn-primary" style={{ opacity: (parsedTrades.length === 0 || importing || accounts.length === 0) ? 0.5 : 1 }}>{importing ? 'Importing...' : `Import ${parsedTrades.length} Trades`}</button>
      </div>
    </Modal>
  );
}

function JournalView({ trades, accounts, filterAccount, setFilterAccount, onSelectTrade }) {
  const theme = useTheme();
  const [viewMode, setViewMode] = useState('list');
  const filtered = filterAccount === 'all' ? trades : trades.filter(t => t.account === filterAccount);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          <select value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)} className="input input-sm" style={{ width: 200 }}>
            <option value="all">All Accounts</option>
            {accounts.map(acc => <option key={acc.id} value={acc.name}>{acc.name}</option>)}
          </select>
        </div>
        <div className="flex" style={{ background: theme.hoverBg, borderRadius: 8, padding: 4 }}>
          <button onClick={() => setViewMode('list')} style={{ padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: viewMode === 'list' ? theme.card : 'transparent', boxShadow: viewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}><LayoutList size={18} style={{ color: viewMode === 'list' ? theme.text : theme.textMuted }} /></button>
          <button onClick={() => setViewMode('grid')} style={{ padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: viewMode === 'grid' ? theme.card : 'transparent', boxShadow: viewMode === 'grid' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}><LayoutGrid size={18} style={{ color: viewMode === 'grid' ? theme.text : theme.textMuted }} /></button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card-lg" style={{ padding: 60, textAlign: 'center' }}>
          <BookOpen size={40} style={{ color: theme.textFaint, margin: '0 auto 12px', opacity: 0.5 }} />
          <p style={{ fontSize: 14, color: theme.textMuted }}>No trades logged yet</p>
          <p style={{ fontSize: 13, color: theme.textFaint, marginTop: 4 }}>Click "Log Trade" to get started</p>
        </div>
      ) : viewMode === 'list' ? (
        <div className="card-lg" style={{ overflow: 'hidden' }}>
          <div className="table-header" style={{ display: 'grid', gridTemplateColumns: '1.5fr 80px 100px 80px 100px 50px', gap: 12 }}>
            <div>Trade</div><div>Side</div><div>Structure</div><div>Lots</div><div style={{ textAlign: 'right' }}>P&L</div><div></div>
          </div>
          {filtered.map(trade => {
            const chartImg = getTradingViewImageUrl(trade.chartLink) || trade.chartImage;
            return (
              <div key={trade.id} onClick={() => onSelectTrade(trade)} className="table-row" style={{ display: 'grid', gridTemplateColumns: '1.5fr 80px 100px 80px 100px 50px', gap: 12, alignItems: 'center' }}>
                <div className="flex items-center gap-3">
                  {chartImg ? (<div style={{ width: 48, height: 36, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: theme.hoverBg }}><img src={chartImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => e.target.style.display = 'none'} /></div>) : (<div style={{ width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, background: trade.pnl >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: trade.pnl >= 0 ? '#10b981' : '#ef4444' }}>{trade.symbol?.slice(0, 2)}</div>)}
                  <div><div style={{ fontSize: 14, fontWeight: 500, color: theme.text }}>{trade.symbol}</div><div style={{ fontSize: 12, color: theme.textFaint }}>{trade.date}</div></div>
                </div>
                <span className="badge" style={{ background: trade.side === 'Long' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: trade.side === 'Long' ? '#10b981' : '#ef4444' }}>{trade.side}</span>
                <span className="badge" style={{ background: MARKET_STRUCTURES[trade.marketStructure]?.color, color: 'white' }}>{trade.marketStructure?.replace('_', ' ').slice(0, 8)}</span>
                <span style={{ fontSize: 14, color: theme.text }}>{trade.lots}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: trade.pnl >= 0 ? '#10b981' : '#ef4444', textAlign: 'right' }}>{trade.pnl >= 0 ? '+' : ''}${trade.pnl?.toFixed(2)}</span>
                <Eye size={16} style={{ color: theme.textFaint }} />
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {filtered.map(trade => {
            const chartImg = getTradingViewImageUrl(trade.chartLink) || trade.chartImage;
            return (
              <div key={trade.id} onClick={() => onSelectTrade(trade)} className="card" style={{ cursor: 'pointer', overflow: 'hidden', transition: 'transform 0.15s, box-shadow 0.15s' }} onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'; }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
                {chartImg ? (<div style={{ width: '100%', height: 140, background: theme.hoverBg, position: 'relative' }}><img src={chartImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.parentElement.style.display = 'none'; }} />{trade.chartLink && (<a href={trade.chartLink} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 8, right: 8, padding: 6, borderRadius: 6, background: 'rgba(0,0,0,0.6)', color: 'white' }}><ExternalLink size={14} /></a>)}</div>) : (<div style={{ width: '100%', height: 80, background: trade.pnl >= 0 ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 28, fontWeight: 700, color: trade.pnl >= 0 ? '#10b981' : '#ef4444', opacity: 0.3 }}>{trade.symbol}</span></div>)}
                <div style={{ padding: 16 }}>
                  <div className="flex items-center justify-between" style={{ marginBottom: 12 }}><div><div style={{ fontSize: 15, fontWeight: 600, color: theme.text }}>{trade.symbol}</div><div style={{ fontSize: 12, color: theme.textFaint }}>{trade.date} · {trade.time}</div></div><span style={{ fontSize: 18, fontWeight: 700, color: trade.pnl >= 0 ? '#10b981' : '#ef4444' }}>{trade.pnl >= 0 ? '+' : ''}${trade.pnl?.toFixed(2)}</span></div>
                  <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}><span className="badge" style={{ background: trade.side === 'Long' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: trade.side === 'Long' ? '#10b981' : '#ef4444' }}>{trade.side}</span><span className="badge" style={{ background: MARKET_STRUCTURES[trade.marketStructure]?.color, color: 'white' }}>{MARKET_STRUCTURES[trade.marketStructure]?.label?.split(' ')[0]}</span><span style={{ fontSize: 12, color: theme.textMuted }}>{trade.lots} lots</span></div>
                  {trade.notes && <p style={{ fontSize: 12, color: theme.textMuted, marginTop: 10, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trade.notes}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DashboardView({ trades, accounts, selectedAccount, setSelectedAccount, challenges }) {
  const theme = useTheme();
  const [dashboardMonth, setDashboardMonth] = useState(new Date());
  const filtered = selectedAccount === 'all' ? trades : trades.filter(t => t.account === selectedAccount);
  
  const selectedAcc = accounts.find(a => a.name === selectedAccount);
  const accountBalance = selectedAcc?.balance || accounts.reduce((s, a) => s + a.balance, 0);
  
  const totalTrades = filtered.length;
  const wins = filtered.filter(t => t.pnl > 0);
  const losses = filtered.filter(t => t.pnl < 0);
  const totalPnl = filtered.reduce((s, t) => s + t.pnl, 0);
  const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 1;
  
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
  const expectancy = totalTrades > 0 ? (winRate / 100 * avgWin) - ((100 - winRate) / 100 * avgLoss) : 0;
  
  const avgWinLossRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? 3 : 0;
  const winRateScore = Math.min(winRate / 60 * 33, 33);
  const ratioScore = Math.min(avgWinLossRatio / 2 * 33, 33);
  const pfScore = Math.min(profitFactor / 2 * 34, 34);
  const ellipseScore = totalTrades >= 5 ? winRateScore + ratioScore + pfScore : 0;
  
  const monthStart = new Date(dashboardMonth.getFullYear(), dashboardMonth.getMonth(), 1);
  const monthEnd = new Date(dashboardMonth.getFullYear(), dashboardMonth.getMonth() + 1, 0);
  const startDay = monthStart.getDay();
  const daysInMonth = monthEnd.getDate();
  
  const monthTrades = filtered.filter(t => { const d = new Date(t.date); return d.getMonth() === dashboardMonth.getMonth() && d.getFullYear() === dashboardMonth.getFullYear(); });
  const monthlyPnl = monthTrades.reduce((s, t) => s + t.pnl, 0);
  const monthlyTradeDays = new Set(monthTrades.map(t => t.date)).size;
  
  const calendarDays = [];
  for (let i = 0; i < startDay; i++) calendarDays.push(null);
  for (let i = 1; i <= daysInMonth; i++) calendarDays.push(i);
  
  const getDayData = (day) => {
    if (!day) return null;
    const dateStr = `${dashboardMonth.getFullYear()}-${String(dashboardMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayTrades = monthTrades.filter(t => t.date === dateStr);
    if (dayTrades.length === 0) return null;
    return { trades: dayTrades.length, pnl: dayTrades.reduce((s, t) => s + t.pnl, 0) };
  };

  const dailyPnlData = [];
  const uniqueDates = [...new Set(filtered.map(t => t.date))].sort().slice(-14);
  uniqueDates.forEach(date => { const dayTrades = filtered.filter(t => t.date === date); dailyPnlData.push({ date: date.slice(5), pnl: dayTrades.reduce((s, t) => s + t.pnl, 0) }); });

  let cumulative = 0;
  const cumulativePnlData = [];
  const sortedByDate = [...filtered].sort((a, b) => new Date(a.date) - new Date(b.date));
  const dateGroups = {};
  sortedByDate.forEach(t => { if (!dateGroups[t.date]) dateGroups[t.date] = 0; dateGroups[t.date] += t.pnl; });
  Object.entries(dateGroups).slice(-14).forEach(([date, pnl]) => { cumulative += pnl; cumulativePnlData.push({ date: date.slice(5), pnl: cumulative }); });

  const sortedTrades = [...filtered].sort((a, b) => new Date(b.date + ' ' + b.time) - new Date(a.date + ' ' + a.time));
  const recentTrades = sortedTrades.slice(0, 5);

  // Active challenge alerts for dashboard
  const activeChallenges = (challenges || []).filter(c => c.status === 'active');

  const DonutChart = ({ value, size = 60, strokeWidth = 6, color = '#10b981' }) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (value / 100) * circumference;
    return (<svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}><circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={theme.hoverBg} strokeWidth={strokeWidth} /><circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" /></svg>);
  };

  const RadarChart = ({ winRate: wr, avgRatio, pf, size = 180 }) => {
    const center = size / 2;
    const maxRadius = size * 0.38;
    const wrNorm = Math.min(wr / 70, 1), ratioNorm = Math.min(avgRatio / 3, 1), pfNorm = Math.min(pf / 3, 1);
    const points = [{ x: center, y: center - maxRadius * wrNorm }, { x: center - maxRadius * 0.866 * ratioNorm, y: center + maxRadius * 0.5 * ratioNorm }, { x: center + maxRadius * 0.866 * pfNorm, y: center + maxRadius * 0.5 * pfNorm }];
    const outerPoints = [{ x: center, y: center - maxRadius }, { x: center - maxRadius * 0.866, y: center + maxRadius * 0.5 }, { x: center + maxRadius * 0.866, y: center + maxRadius * 0.5 }];
    return (<svg width={size} height={size + 30}><polygon points={outerPoints.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={theme.cardBorder} strokeWidth="1" /><polygon points={outerPoints.map(p => `${center + (p.x - center) * 0.66},${center + (p.y - center) * 0.66}`).join(' ')} fill="none" stroke={theme.cardBorder} strokeWidth="1" opacity="0.5" /><polygon points={outerPoints.map(p => `${center + (p.x - center) * 0.33},${center + (p.y - center) * 0.33}`).join(' ')} fill="none" stroke={theme.cardBorder} strokeWidth="1" opacity="0.3" /><polygon points={points.map(p => `${p.x},${p.y}`).join(' ')} fill="rgba(99,102,241,0.3)" stroke="#6366f1" strokeWidth="2" /><rect x={center - 25} y={5} width={50} height={18} rx={9} fill={theme.hoverBg} /><text x={center} y={17} textAnchor="middle" fontSize="10" fill={theme.textMuted}>Win %</text><rect x={5} y={size - 15} width={55} height={18} rx={9} fill={theme.hoverBg} /><text x={32} y={size - 2} textAnchor="middle" fontSize="10" fill={theme.textMuted}>Avg win/loss</text><rect x={size - 60} y={size - 15} width={55} height={18} rx={9} fill={theme.hoverBg} /><text x={size - 32} y={size - 2} textAnchor="middle" fontSize="10" fill={theme.textMuted}>Profit factor</text></svg>);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 13, color: theme.textMuted }}>Dashboard for:</span>
          <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)} className="input input-sm" style={{ width: 200, fontWeight: 500 }}>
            <option value="all">All Accounts</option>
            {accounts.map(acc => <option key={acc.id} value={acc.name}>{acc.name}</option>)}
          </select>
        </div>
      </div>

      {/* Challenge Alert Banner */}
      {activeChallenges.length > 0 && (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto' }}>
          {activeChallenges.map(ch => {
            const todayStr = new Date().toISOString().split('T')[0];
            const todayTrades = trades.filter(t => t.account === ch.account && t.date === todayStr);
            const todayPnl = todayTrades.reduce((s, t) => s + t.pnl, 0);
            const dailyLimit = ch.accountSize * (ch.maxDailyDrawdown / 100);
            const dailyUsed = todayPnl < 0 ? (Math.abs(todayPnl) / dailyLimit) * 100 : 0;
            const remaining = dailyLimit - Math.abs(Math.min(todayPnl, 0));
            const isWarning = dailyUsed >= 60;
            const isDanger = dailyUsed >= 80;

            return (
              <div key={ch.id} className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, minWidth: 320, borderLeft: `3px solid ${isDanger ? '#ef4444' : isWarning ? '#f59e0b' : ch.firmColor || '#6366f1'}` }}>
                <Trophy size={16} style={{ color: ch.firmColor || '#6366f1', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>{ch.name}</div>
                  <div style={{ fontSize: 11, color: theme.textFaint }}>Daily remaining: <span style={{ color: isDanger ? '#ef4444' : isWarning ? '#f59e0b' : '#10b981', fontWeight: 600 }}>${remaining.toFixed(2)}</span></div>
                </div>
                <div style={{ width: 48, height: 48, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <DonutChart value={dailyUsed} size={48} strokeWidth={4} color={isDanger ? '#ef4444' : isWarning ? '#f59e0b' : '#10b981'} />
                  <span style={{ position: 'absolute', fontSize: 10, fontWeight: 700, color: isDanger ? '#ef4444' : isWarning ? '#f59e0b' : theme.text }}>{dailyUsed.toFixed(0)}%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Top Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        <div className="card" style={{ padding: 16 }}><div className="flex items-center gap-2"><div className="stat-label">Net P&L</div><div style={{ width: 18, height: 18, borderRadius: 4, background: theme.hoverBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: theme.textFaint }}>{totalTrades}</div></div><div style={{ fontSize: 22, fontWeight: 700, color: totalPnl >= 0 ? '#10b981' : '#ef4444', marginTop: 6 }}>{totalPnl >= 0 ? '+' : ''}${totalPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>
        <div className="card" style={{ padding: 16 }}><div className="stat-label">Trade Expectancy</div><div style={{ fontSize: 22, fontWeight: 700, color: expectancy >= 0 ? '#10b981' : '#ef4444', marginTop: 6 }}>${expectancy.toFixed(2)}</div></div>
        <div className="card" style={{ padding: 16 }}><div className="stat-label">Profit Factor</div><div className="flex items-center gap-3" style={{ marginTop: 6 }}><span style={{ fontSize: 22, fontWeight: 700, color: profitFactor >= 1.5 ? '#10b981' : profitFactor >= 1 ? '#f59e0b' : '#ef4444' }}>{profitFactor >= 99 ? '∞' : profitFactor.toFixed(2)}</span><div style={{ position: 'relative', width: 40, height: 40 }}><DonutChart value={Math.min(profitFactor / 3 * 100, 100)} size={40} strokeWidth={4} color={profitFactor >= 1.5 ? '#10b981' : profitFactor >= 1 ? '#f59e0b' : '#ef4444'} /></div></div></div>
        <div className="card" style={{ padding: 16 }}><div className="flex items-center gap-2"><div className="stat-label">Win %</div><div style={{ display: 'flex', gap: 4 }}><span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#10b981', color: 'white' }}>{wins.length}</span><span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#ef4444', color: 'white' }}>{losses.length}</span></div></div><div className="flex items-center gap-3" style={{ marginTop: 6 }}><span style={{ fontSize: 22, fontWeight: 700, color: theme.text }}>{winRate.toFixed(2)}%</span><div style={{ position: 'relative', width: 40, height: 40 }}><DonutChart value={winRate} size={40} strokeWidth={4} color={winRate >= 50 ? '#10b981' : '#ef4444'} /></div></div></div>
        <div className="card" style={{ padding: 16 }}><div className="stat-label">Avg Win/Loss Trade</div><div className="flex items-center gap-2" style={{ marginTop: 6 }}><span style={{ fontSize: 22, fontWeight: 700, color: theme.text }}>{avgWinLossRatio.toFixed(1)}</span><div style={{ display: 'flex', flexDirection: 'column', fontSize: 11 }}><span style={{ color: '#10b981' }}>${avgWin.toFixed(2)}</span><span style={{ color: '#ef4444' }}>${avgLoss.toFixed(2)}</span></div></div></div>
      </div>

      {/* Second Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr 1fr', gap: 12 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="stat-label">Ellipse Score</div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 8 }}>
            <RadarChart winRate={winRate} avgRatio={avgWinLossRatio} pf={profitFactor} size={160} />
            <div style={{ marginTop: 8, textAlign: 'center' }}><span style={{ fontSize: 14, color: theme.textMuted }}>Your Ellipse Score: </span><span style={{ fontSize: 24, fontWeight: 700, color: ellipseScore >= 70 ? '#10b981' : ellipseScore >= 40 ? '#f59e0b' : '#ef4444' }}>{totalTrades < 5 ? '--' : ellipseScore.toFixed(0)}</span></div>
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="stat-label">Daily Net Cumulative P&L</div>
          <div style={{ height: 180, marginTop: 12 }}>
            {cumulativePnlData.length > 0 ? (<ResponsiveContainer width="100%" height="100%"><AreaChart data={cumulativePnlData}><defs><linearGradient id="cumGreen" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient><linearGradient id="cumRed" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} /><stop offset="100%" stopColor="#ef4444" stopOpacity={0} /></linearGradient></defs><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: theme.textFaint }} /><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: theme.textFaint }} tickFormatter={v => `$${v}`} /><Tooltip contentStyle={{ background: theme.card, border: `1px solid ${theme.cardBorder}`, borderRadius: 8, fontSize: 12 }} formatter={(v) => [`$${v.toFixed(2)}`, 'Cumulative P&L']} /><Area type="monotone" dataKey="pnl" stroke={totalPnl >= 0 ? '#10b981' : '#ef4444'} fill={totalPnl >= 0 ? 'url(#cumGreen)' : 'url(#cumRed)'} strokeWidth={2} /></AreaChart></ResponsiveContainer>) : (<div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textFaint, fontSize: 12 }}>No data yet</div>)}
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="stat-label">Net Daily P&L</div>
          <div style={{ height: 180, marginTop: 12 }}>
            {dailyPnlData.length > 0 ? (<ResponsiveContainer width="100%" height="100%"><BarChart data={dailyPnlData}><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: theme.textFaint }} /><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: theme.textFaint }} tickFormatter={v => `$${v}`} /><Tooltip contentStyle={{ background: theme.card, border: `1px solid ${theme.cardBorder}`, borderRadius: 8, fontSize: 12 }} formatter={(v) => [`$${v.toFixed(2)}`, 'Daily P&L']} /><Bar dataKey="pnl" radius={[4, 4, 0, 0]}>{dailyPnlData.map((entry, index) => (<Cell key={index} fill={entry.pnl >= 0 ? '#10b981' : '#ef4444'} />))}</Bar></BarChart></ResponsiveContainer>) : (<div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textFaint, fontSize: 12 }}>No data yet</div>)}
          </div>
        </div>
      </div>

      {/* Third Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 12 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="stat-label" style={{ marginBottom: 12 }}>Recent Trades</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentTrades.length === 0 ? (<div style={{ padding: 20, textAlign: 'center', color: theme.textFaint, fontSize: 12 }}>No trades yet</div>) : recentTrades.map(t => (<div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 10, borderRadius: 8, background: theme.hoverBg }}><div className="flex items-center gap-3"><div style={{ fontSize: 12, color: theme.textFaint }}>{t.date}</div><div style={{ fontSize: 13, fontWeight: 500, color: theme.text }}>{t.symbol}</div></div><span style={{ fontSize: 13, fontWeight: 600, color: t.pnl >= 0 ? '#10b981' : '#ef4444' }}>{t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}</span></div>))}
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
            <div className="flex items-center gap-3">
              <button onClick={() => setDashboardMonth(new Date(dashboardMonth.getFullYear(), dashboardMonth.getMonth() - 1))} style={{ padding: 6, borderRadius: 6, border: 'none', background: theme.hoverBg, cursor: 'pointer' }}><ChevronLeft size={16} style={{ color: theme.textMuted }} /></button>
              <span style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>{dashboardMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
              <button onClick={() => setDashboardMonth(new Date(dashboardMonth.getFullYear(), dashboardMonth.getMonth() + 1))} style={{ padding: 6, borderRadius: 6, border: 'none', background: theme.hoverBg, cursor: 'pointer' }}><ChevronRight size={16} style={{ color: theme.textMuted }} /></button>
            </div>
            <div className="flex items-center gap-3" style={{ fontSize: 12, color: theme.textMuted }}><span style={{ color: monthlyPnl >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>${monthlyPnl.toFixed(2)}</span><span>{monthlyTradeDays} days</span></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (<div key={d} style={{ padding: 6, textAlign: 'center', fontSize: 11, fontWeight: 500, color: theme.textFaint }}>{d}</div>))}
            {calendarDays.map((day, i) => { const data = getDayData(day); return (<div key={i} style={{ minHeight: 50, padding: 4, borderRadius: 6, background: data ? (data.pnl >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)') : 'transparent', border: day ? `1px solid ${theme.cardBorder}` : 'none' }}>{day && (<><div style={{ fontSize: 11, color: theme.textMuted }}>{day}</div>{data && (<div style={{ marginTop: 2 }}><div style={{ fontSize: 11, fontWeight: 600, color: data.pnl >= 0 ? '#10b981' : '#ef4444' }}>{data.pnl >= 0 ? '+' : ''}{Math.abs(data.pnl) >= 1000 ? (data.pnl / 1000).toFixed(1) + 'K' : data.pnl.toFixed(0)}</div><div style={{ fontSize: 9, color: theme.textFaint }}>{data.trades} trade{data.trades > 1 ? 's' : ''}</div></div>)}</>)}</div>); })}
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountsView({ accounts, onUpdate, onDelete }) {
  const theme = useTheme();
  const [deleteId, setDeleteId] = useState(null);
  const [editAcc, setEditAcc] = useState(null);
  const totals = { balance: accounts.reduce((s, a) => s + a.balance, 0), equity: accounts.reduce((s, a) => s + a.equity, 0) };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <div className="card" style={{ padding: 20 }}><div className="stat-label">Total Balance</div><div className="stat-value" style={{ marginTop: 6 }}>${totals.balance.toLocaleString()}</div></div>
        <div className="card" style={{ padding: 20 }}><div className="stat-label">Total Equity</div><div className="stat-value" style={{ color: '#10b981', marginTop: 6 }}>${totals.equity.toLocaleString()}</div></div>
        <div className="card" style={{ padding: 20 }}><div className="stat-label">Accounts</div><div className="stat-value" style={{ marginTop: 6 }}>{accounts.length}</div></div>
      </div>

      <div className="card-lg" style={{ overflow: 'hidden' }}>
        {accounts.length === 0 ? (<div style={{ padding: 60, textAlign: 'center' }}><Database size={40} style={{ color: theme.textFaint, margin: '0 auto 12px', opacity: 0.5 }} /><p style={{ fontSize: 14, color: theme.textMuted }}>No accounts yet</p></div>) : accounts.map(acc => (
          <div key={acc.id} className="table-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="flex items-center gap-3">
              <div style={{ width: 44, height: 44, borderRadius: 10, background: acc.platform === 'MT5' ? 'rgba(59,130,246,0.1)' : 'rgba(139,92,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Database size={20} style={{ color: acc.platform === 'MT5' ? '#3b82f6' : '#8b5cf6' }} /></div>
              <div><div style={{ fontSize: 14, fontWeight: 500, color: theme.text }}>{acc.name}</div><div style={{ fontSize: 12, color: theme.textFaint }}>{acc.broker} · {acc.server}</div></div>
            </div>
            <div className="flex items-center gap-8">
              <div style={{ textAlign: 'right' }}><div style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>${acc.balance.toLocaleString()}</div><div style={{ fontSize: 11, color: theme.textFaint }}>Balance</div></div>
              <div style={{ textAlign: 'right' }}><div style={{ fontSize: 14, fontWeight: 600, color: acc.equity >= acc.balance ? '#10b981' : '#ef4444' }}>${acc.equity.toLocaleString()}</div><div style={{ fontSize: 11, color: theme.textFaint }}>Equity</div></div>
              <div className="flex gap-1">
                <button onClick={() => setEditAcc(acc)} style={{ padding: 8, borderRadius: 8, background: 'transparent', border: 'none', cursor: 'pointer' }}><Edit3 size={16} style={{ color: theme.textFaint }} /></button>
                <button onClick={() => setDeleteId(acc.id)} style={{ padding: 8, borderRadius: 8, background: 'transparent', border: 'none', cursor: 'pointer' }}><Trash2 size={16} style={{ color: theme.textFaint }} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editAcc && <EditAccountModal account={editAcc} onClose={() => setEditAcc(null)} onSave={(updated) => { onUpdate(updated); setEditAcc(null); }} />}
      {deleteId && (<Modal onClose={() => setDeleteId(null)}><div style={{ padding: 24 }}><h3 style={{ fontSize: 16, fontWeight: 600, color: theme.text, marginBottom: 8 }}>Remove Account?</h3><p style={{ fontSize: 14, color: theme.textMuted, marginBottom: 20 }}>This will remove {accounts.find(a => a.id === deleteId)?.name}</p><div className="flex gap-3"><button onClick={() => setDeleteId(null)} className="input" style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }}>Cancel</button><button onClick={() => { onDelete(deleteId); setDeleteId(null); }} className="btn-primary" style={{ flex: 1, background: '#ef4444' }}>Remove</button></div></div></Modal>)}
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
  const getTradesForDay = (day) => { if (!day) return []; const dateStr = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; return trades.filter(t => t.date === dateStr); };

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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (<div key={d} className="table-header" style={{ textAlign: 'center', padding: 12 }}>{d}</div>))}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>{days.map((day, i) => { const dayTrades = getTradesForDay(day); const pnl = dayTrades.reduce((s, t) => s + t.pnl, 0); return (<div key={i} style={{ minHeight: 90, padding: 10, borderBottom: `1px solid ${theme.cardBorder}`, borderRight: `1px solid ${theme.cardBorder}`, background: !day ? (theme.dark ? '#0a0a0a' : '#f8fafc') : 'transparent' }}>{day && <><div style={{ fontSize: 13, color: theme.textMuted }}>{day}</div>{dayTrades.length > 0 && (<div style={{ marginTop: 6 }}><div style={{ fontSize: 13, fontWeight: 600, color: pnl >= 0 ? '#10b981' : '#ef4444' }}>{pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}</div><div style={{ fontSize: 11, color: theme.textFaint }}>{dayTrades.length} trade{dayTrades.length > 1 ? 's' : ''}</div></div>)}</>}</div>); })}</div>
      </div>
    </div>
  );
}

function Modal({ children, onClose, width = 420 }) {
  const theme = useTheme();
  return (<div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}><div className="card-lg" style={{ width: '100%', maxWidth: width, maxHeight: '90vh', overflow: 'auto' }}>{children}</div></div>);
}

function NewTradeModal({ onClose, onSave, accounts, challenges }) {
  const theme = useTheme();
  const [step, setStep] = useState(1);
  const [trade, setTrade] = useState({
    date: new Date().toISOString().split('T')[0], time: new Date().toTimeString().slice(0, 5),
    symbol: '', side: 'Long', entry: '', exit: '', lots: '', stopLoss: '', takeProfit: '',
    commission: '', swap: '', pnl: 0,
    marketStructure: '', candleType: '', liquidityTaken: [], liquidityTarget: [], notes: '',
    account: accounts[0]?.name || '',
    chartLink: '', chartImage: '',
    challengeId: ''
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

  // Auto-link challenge when account matches
  const activeChallenges = (challenges || []).filter(c => c.status === 'active' && c.account === trade.account);

  const handleSave = () => {
    const rr = trade.stopLoss && trade.takeProfit && trade.entry ? `1:${Math.abs((parseFloat(trade.takeProfit) - parseFloat(trade.entry)) / (parseFloat(trade.entry) - parseFloat(trade.stopLoss))).toFixed(1)}` : '-';
    onSave({ ...trade, entry: parseFloat(trade.entry), exit: parseFloat(trade.exit), lots: parseFloat(trade.lots), stopLoss: parseFloat(trade.stopLoss) || 0, takeProfit: parseFloat(trade.takeProfit) || 0, commission: parseFloat(trade.commission) || 0, swap: parseFloat(trade.swap) || 0, riskReward: rr });
  };

  const toggleLiq = (key, type) => {
    const field = type === 'taken' ? 'liquidityTaken' : 'liquidityTarget';
    setTrade(prev => ({ ...prev, [field]: prev[field].includes(key) ? prev[field].filter(k => k !== key) : [...prev[field], key] }));
  };

  return (
    <Modal width={520} onClose={onClose}>
      <div style={{ padding: 20, borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><h3 style={{ fontSize: 16, fontWeight: 600, color: theme.text }}>Log Trade</h3><p style={{ fontSize: 12, color: theme.textFaint }}>Step {step} of 3</p></div>
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
            
            {/* Challenge Link Alert */}
            {activeChallenges.length > 0 && (
              <div style={{ padding: 10, borderRadius: 8, background: `${activeChallenges[0].firmColor || '#6366f1'}10`, border: `1px solid ${activeChallenges[0].firmColor || '#6366f1'}30`, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Trophy size={14} style={{ color: activeChallenges[0].firmColor || '#6366f1' }} />
                <span style={{ fontSize: 12, color: theme.text }}>This trade will count toward <strong>{activeChallenges[0].name}</strong></span>
              </div>
            )}

            <div><label className="label">Side</label><div className="flex gap-2">{['Long', 'Short'].map(s => (<button key={s} onClick={() => setTrade({...trade, side: s})} style={{ flex: 1, padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 500, border: 'none', cursor: 'pointer', background: trade.side === s ? (s === 'Long' ? '#10b981' : '#ef4444') : theme.hoverBg, color: trade.side === s ? 'white' : theme.textMuted }}>{s}</button>))}</div></div>
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
              <div className="flex justify-between items-center"><span style={{ fontSize: 13, color: theme.textMuted }}>Calculated P&L</span><span style={{ fontSize: 20, fontWeight: 700, color: trade.pnl >= 0 ? '#10b981' : '#ef4444' }}>{trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}</span></div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div><label className="label" style={{ marginBottom: 12 }}>Market Structure</label><div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{Object.entries(MARKET_STRUCTURES).map(([key, val]) => (<button key={key} onClick={() => setTrade({...trade, marketStructure: key})} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 10, border: `1px solid ${trade.marketStructure === key ? '#6366f1' : theme.cardBorder}`, background: trade.marketStructure === key ? 'rgba(99,102,241,0.1)' : 'transparent', cursor: 'pointer' }}><div className="flex items-center gap-3"><div style={{ width: 32, height: 32, borderRadius: 8, background: val.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: 10, height: 10, borderRadius: 5, background: val.color }}></div></div><div style={{ textAlign: 'left' }}><div style={{ fontSize: 14, fontWeight: 500, color: theme.text }}>{val.label}</div><div style={{ fontSize: 12, color: theme.textFaint }}>{val.description}</div></div></div>{trade.marketStructure === key && <CheckCircle size={20} style={{ color: '#6366f1' }} />}</button>))}</div></div>
            <div><label className="label" style={{ marginBottom: 12 }}>Candle Type</label><div className="flex gap-3">{Object.entries(CANDLE_TYPES).map(([key, val]) => (<button key={key} onClick={() => setTrade({...trade, candleType: key})} style={{ flex: 1, padding: 14, borderRadius: 10, border: `1px solid ${trade.candleType === key ? '#6366f1' : theme.cardBorder}`, background: trade.candleType === key ? 'rgba(99,102,241,0.1)' : 'transparent', textAlign: 'left', cursor: 'pointer' }}><div style={{ fontSize: 14, fontWeight: 500, color: theme.text }}>{val.label}</div><div style={{ fontSize: 12, color: theme.textFaint }}>{val.description}</div></button>))}</div></div>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div><label className="label" style={{ marginBottom: 8 }}>Liquidity Taken</label><div className="flex flex-wrap gap-2">{LIQUIDITY_LEVELS.map(l => (<button key={l.key} onClick={() => toggleLiq(l.key, 'taken')} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer', background: trade.liquidityTaken.includes(l.key) ? '#f59e0b' : theme.hoverBg, color: trade.liquidityTaken.includes(l.key) ? 'white' : theme.textMuted }}>{l.abbr}</button>))}</div></div>
            <div><label className="label" style={{ marginBottom: 8 }}>Liquidity Target</label><div className="flex flex-wrap gap-2">{LIQUIDITY_LEVELS.map(l => (<button key={l.key} onClick={() => toggleLiq(l.key, 'target')} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer', background: trade.liquidityTarget.includes(l.key) ? '#3b82f6' : theme.hoverBg, color: trade.liquidityTarget.includes(l.key) ? 'white' : theme.textMuted }}>{l.abbr}</button>))}</div></div>
            <div style={{ padding: 16, borderRadius: 10, background: theme.hoverBg }}>
              <div className="flex items-center gap-2" style={{ marginBottom: 12 }}><Link size={14} style={{ color: theme.textMuted }} /><span style={{ fontSize: 12, fontWeight: 500, color: theme.textMuted }}>Chart Reference</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}><div><label className="label">TradingView Link</label><input value={trade.chartLink} onChange={(e) => setTrade({...trade, chartLink: e.target.value})} placeholder="https://www.tradingview.com/chart/..." className="input" /></div><div><label className="label">Chart Image URL</label><input value={trade.chartImage} onChange={(e) => setTrade({...trade, chartImage: e.target.value})} placeholder="https://i.imgur.com/..." className="input" /></div></div>
              {trade.chartImage && <div style={{ marginTop: 12, borderRadius: 8, overflow: 'hidden', border: `1px solid ${theme.cardBorder}` }}><img src={trade.chartImage} alt="Chart" style={{ width: '100%', height: 150, objectFit: 'cover' }} onError={(e) => e.target.style.display = 'none'} /></div>}
            </div>
            <div><label className="label">Notes</label><textarea value={trade.notes} onChange={(e) => setTrade({...trade, notes: e.target.value})} rows={3} className="input" placeholder="Trade thesis, observations..." style={{ resize: 'none' }} /></div>
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

function EditTradeModal({ trade: initialTrade, onClose, onSave, accounts }) {
  const theme = useTheme();
  const [trade, setTrade] = useState({
    ...initialTrade, entry: initialTrade.entry?.toString() || '', exit: initialTrade.exit?.toString() || '',
    lots: initialTrade.lots?.toString() || '', stopLoss: initialTrade.stopLoss?.toString() || '',
    takeProfit: initialTrade.takeProfit?.toString() || '', commission: initialTrade.commission?.toString() || '',
    swap: initialTrade.swap?.toString() || '', liquidityTaken: initialTrade.liquidityTaken || [],
    liquidityTarget: initialTrade.liquidityTarget || [], chartLink: initialTrade.chartLink || '', chartImage: initialTrade.chartImage || ''
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
    const rr = trade.stopLoss && trade.takeProfit && trade.entry ? `1:${Math.abs((parseFloat(trade.takeProfit) - parseFloat(trade.entry)) / (parseFloat(trade.entry) - parseFloat(trade.stopLoss))).toFixed(1)}` : trade.riskReward || '-';
    onSave({ ...trade, entry: parseFloat(trade.entry), exit: parseFloat(trade.exit), lots: parseFloat(trade.lots), stopLoss: parseFloat(trade.stopLoss) || 0, takeProfit: parseFloat(trade.takeProfit) || 0, commission: parseFloat(trade.commission) || 0, swap: parseFloat(trade.swap) || 0, riskReward: rr });
  };

  const toggleLiq = (key, type) => {
    const field = type === 'taken' ? 'liquidityTaken' : 'liquidityTarget';
    setTrade(prev => ({ ...prev, [field]: prev[field].includes(key) ? prev[field].filter(k => k !== key) : [...prev[field], key] }));
  };

  const chartPreview = getTradingViewImageUrl(trade.chartLink) || trade.chartImage;
  const darkMode = theme.dark;

  return (
    <Modal width={520} onClose={onClose}>
      <div style={{ padding: 20, borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: theme.text }}>Edit Trade</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={20} style={{ color: theme.textFaint }} /></button>
      </div>
      <div style={{ padding: 20, maxHeight: '65vh', overflow: 'auto' }} className="scrollbar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><div><label className="label">Date</label><input type="date" value={trade.date} onChange={(e) => setTrade({...trade, date: e.target.value})} className="input" /></div><div><label className="label">Time</label><input type="time" value={trade.time} onChange={(e) => setTrade({...trade, time: e.target.value})} className="input" /></div></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><div><label className="label">Symbol</label><input value={trade.symbol} onChange={(e) => setTrade({...trade, symbol: e.target.value.toUpperCase()})} className="input" /></div><div><label className="label">Account</label><select value={trade.account} onChange={(e) => setTrade({...trade, account: e.target.value})} className="input">{accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}</select></div></div>
          <div><label className="label">Side</label><div className="flex gap-2">{['Long', 'Short'].map(s => (<button key={s} onClick={() => setTrade({...trade, side: s})} style={{ flex: 1, padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 500, border: 'none', cursor: 'pointer', background: trade.side === s ? (s === 'Long' ? '#10b981' : '#ef4444') : theme.hoverBg, color: trade.side === s ? 'white' : theme.textMuted }}>{s}</button>))}</div></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}><div><label className="label">Entry</label><input type="number" step="any" value={trade.entry} onChange={(e) => setTrade({...trade, entry: e.target.value})} className="input" /></div><div><label className="label">Exit</label><input type="number" step="any" value={trade.exit} onChange={(e) => setTrade({...trade, exit: e.target.value})} className="input" /></div><div><label className="label">Lots</label><input type="number" step="0.01" value={trade.lots} onChange={(e) => setTrade({...trade, lots: e.target.value})} className="input" /></div></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><div><label className="label">Stop Loss</label><input type="number" step="any" value={trade.stopLoss} onChange={(e) => setTrade({...trade, stopLoss: e.target.value})} className="input" /></div><div><label className="label">Take Profit</label><input type="number" step="any" value={trade.takeProfit} onChange={(e) => setTrade({...trade, takeProfit: e.target.value})} className="input" /></div></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><div><label className="label">Commission ($)</label><input type="number" step="0.01" value={trade.commission} onChange={(e) => setTrade({...trade, commission: e.target.value})} className="input" /></div><div><label className="label">Swap ($)</label><input type="number" step="0.01" value={trade.swap} onChange={(e) => setTrade({...trade, swap: e.target.value})} className="input" /></div></div>
          <div style={{ padding: 16, borderRadius: 10, background: trade.pnl >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' }}><div className="flex justify-between items-center"><span style={{ fontSize: 13, color: theme.textMuted }}>Calculated P&L</span><span style={{ fontSize: 20, fontWeight: 700, color: trade.pnl >= 0 ? '#10b981' : '#ef4444' }}>{trade.pnl >= 0 ? '+' : ''}${trade.pnl?.toFixed(2)}</span></div></div>
          <div><label className="label" style={{ marginBottom: 8 }}>Market Structure</label><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>{Object.entries(MARKET_STRUCTURES).map(([key, val]) => (<button key={key} onClick={() => setTrade({...trade, marketStructure: key})} style={{ padding: 10, borderRadius: 8, fontSize: 12, border: `1px solid ${trade.marketStructure === key ? '#6366f1' : theme.cardBorder}`, background: trade.marketStructure === key ? 'rgba(99,102,241,0.1)' : 'transparent', color: theme.text, cursor: 'pointer', textAlign: 'left' }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: val.color, marginRight: 8 }}></span>{val.label}</button>))}</div></div>
          <div><label className="label" style={{ marginBottom: 8 }}>Liquidity Taken</label><div className="flex flex-wrap gap-2">{LIQUIDITY_LEVELS.map(l => (<button key={l.key} onClick={() => toggleLiq(l.key, 'taken')} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 500, border: 'none', cursor: 'pointer', background: trade.liquidityTaken.includes(l.key) ? '#f59e0b' : theme.hoverBg, color: trade.liquidityTaken.includes(l.key) ? 'white' : theme.textMuted }}>{l.abbr}</button>))}</div></div>
          <div style={{ padding: 16, borderRadius: 10, background: theme.hoverBg }}><div className="flex items-center gap-2" style={{ marginBottom: 12 }}><Link size={14} style={{ color: theme.textMuted }} /><span style={{ fontSize: 12, fontWeight: 500, color: theme.textMuted }}>Chart Reference</span></div><div><label className="label">TradingView Link</label><input value={trade.chartLink} onChange={(e) => setTrade({...trade, chartLink: e.target.value})} placeholder="https://www.tradingview.com/x/..." className="input" /></div>{chartPreview && <div style={{ marginTop: 12, borderRadius: 8, overflow: 'hidden' }}><img src={chartPreview} alt="Chart" style={{ width: '100%', height: 120, objectFit: 'cover' }} onError={(e) => e.target.style.display = 'none'} /></div>}</div>
          <div><label className="label">Notes</label><textarea value={trade.notes} onChange={(e) => setTrade({...trade, notes: e.target.value})} rows={3} className="input" style={{ resize: 'none' }} /></div>
        </div>
      </div>
      <div style={{ padding: 20, borderTop: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 14, color: theme.textMuted, cursor: 'pointer' }}>Cancel</button>
        <button onClick={handleSave} className="btn-primary">Save Changes</button>
      </div>
    </Modal>
  );
}

function NewAccountModal({ onClose, onSave }) {
  const theme = useTheme();
  const [acc, setAcc] = useState({ name: '', platform: 'MT5', broker: '', server: '', balance: '', equity: '' });
  return (
    <Modal onClose={onClose}>
      <div style={{ padding: 20, borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h3 style={{ fontSize: 16, fontWeight: 600, color: theme.text }}>Add Account</h3><button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} style={{ color: theme.textFaint }} /></button></div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div><label className="label">Platform</label><div className="flex gap-2">{['MT5', 'cTrader'].map(p => (<button key={p} onClick={() => setAcc({...acc, platform: p})} style={{ flex: 1, padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 500, border: 'none', cursor: 'pointer', background: acc.platform === p ? (p === 'MT5' ? '#3b82f6' : '#8b5cf6') : theme.hoverBg, color: acc.platform === p ? 'white' : theme.textMuted }}>{p}</button>))}</div></div>
        <div><label className="label">Account Name</label><input value={acc.name} onChange={(e) => setAcc({...acc, name: e.target.value})} placeholder="Main Account" className="input" /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><div><label className="label">Broker</label><input value={acc.broker} onChange={(e) => setAcc({...acc, broker: e.target.value})} placeholder="ICMarkets" className="input" /></div><div><label className="label">Server</label><input value={acc.server} onChange={(e) => setAcc({...acc, server: e.target.value})} placeholder="Live-01" className="input" /></div></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><div><label className="label">Balance</label><input type="number" value={acc.balance} onChange={(e) => setAcc({...acc, balance: e.target.value})} placeholder="10000" className="input" /></div><div><label className="label">Equity</label><input type="number" value={acc.equity} onChange={(e) => setAcc({...acc, equity: e.target.value})} placeholder="10000" className="input" /></div></div>
      </div>
      <div style={{ padding: 20, borderTop: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'flex-end', gap: 12 }}><button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 14, color: theme.textMuted, cursor: 'pointer' }}>Cancel</button><button onClick={() => onSave({ ...acc, balance: parseFloat(acc.balance) || 0, equity: parseFloat(acc.equity) || 0, connected: true })} className="btn-primary">Add Account</button></div>
    </Modal>
  );
}

function EditAccountModal({ account, onClose, onSave }) {
  const theme = useTheme();
  const [data, setData] = useState({ ...account, balance: account.balance.toString(), equity: account.equity.toString() });
  return (
    <Modal onClose={onClose}>
      <div style={{ padding: 20, borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h3 style={{ fontSize: 16, fontWeight: 600, color: theme.text }}>Edit Account</h3><button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} style={{ color: theme.textFaint }} /></button></div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}><div><label className="label">Name</label><input value={data.name} onChange={(e) => setData({...data, name: e.target.value})} className="input" /></div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><div><label className="label">Balance</label><input type="number" value={data.balance} onChange={(e) => setData({...data, balance: e.target.value})} className="input" /></div><div><label className="label">Equity</label><input type="number" value={data.equity} onChange={(e) => setData({...data, equity: e.target.value})} className="input" /></div></div></div>
      <div style={{ padding: 20, borderTop: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'flex-end', gap: 12 }}><button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 14, color: theme.textMuted, cursor: 'pointer' }}>Cancel</button><button onClick={() => onSave({ ...data, balance: parseFloat(data.balance) || 0, equity: parseFloat(data.equity) || 0 })} className="btn-primary">Save</button></div>
    </Modal>
  );
}

function TradeDetailModal({ trade, onClose, onDelete, onEdit }) {
  const theme = useTheme();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const chartImg = getTradingViewImageUrl(trade.chartLink) || trade.chartImage;

  return (
    <Modal width={520} onClose={onClose}>
      <div style={{ padding: 20, borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="flex items-center gap-3">
          <div style={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: trade.pnl >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' }}><span style={{ fontSize: 14, fontWeight: 600, color: trade.pnl >= 0 ? '#10b981' : '#ef4444' }}>{trade.symbol?.slice(0, 2)}</span></div>
          <div><div style={{ fontSize: 16, fontWeight: 600, color: theme.text }}>{trade.symbol}</div><div style={{ fontSize: 12, color: theme.textFaint }}>{trade.date} · {trade.time}</div></div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} style={{ color: theme.textFaint }} /></button>
      </div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="flex justify-between items-center"><span className="badge" style={{ background: trade.side === 'Long' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: trade.side === 'Long' ? '#10b981' : '#ef4444', padding: '8px 14px', fontSize: 13 }}>{trade.side}</span><span style={{ fontSize: 24, fontWeight: 700, color: trade.pnl >= 0 ? '#10b981' : '#ef4444' }}>{trade.pnl >= 0 ? '+' : ''}${trade.pnl?.toFixed(2)}</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>{[{ l: 'Entry', v: trade.entry }, { l: 'Exit', v: trade.exit }, { l: 'Lots', v: trade.lots }, { l: 'R:R', v: trade.riskReward }].map(x => (<div key={x.l} style={{ padding: 14, borderRadius: 10, background: theme.hoverBg, textAlign: 'center' }}><div className="stat-label">{x.l}</div><div style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginTop: 4 }}>{x.v}</div></div>))}</div>
        {(trade.commission || trade.swap) && (<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><div style={{ padding: 14, borderRadius: 10, background: theme.hoverBg }}><div className="stat-label">Commission</div><div style={{ fontSize: 14, fontWeight: 600, color: '#ef4444', marginTop: 4 }}>-${trade.commission?.toFixed(2)}</div></div><div style={{ padding: 14, borderRadius: 10, background: theme.hoverBg }}><div className="stat-label">Swap</div><div style={{ fontSize: 14, fontWeight: 600, color: trade.swap >= 0 ? '#10b981' : '#ef4444', marginTop: 4 }}>{trade.swap >= 0 ? '+' : ''}${trade.swap?.toFixed(2)}</div></div></div>)}
        <div style={{ padding: 14, borderRadius: 10, background: theme.hoverBg, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 13, color: theme.textMuted }}>Structure</span><span className="badge" style={{ background: MARKET_STRUCTURES[trade.marketStructure]?.color, color: 'white' }}>{MARKET_STRUCTURES[trade.marketStructure]?.label}</span></div>
        {(chartImg || trade.chartLink) && (<div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${theme.cardBorder}` }}>{chartImg && <img src={chartImg} alt="Chart" style={{ width: '100%', height: 200, objectFit: 'cover' }} onError={(e) => e.target.style.display = 'none'} />}{trade.chartLink && (<a href={trade.chartLink} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 14, fontSize: 13, color: '#6366f1', textDecoration: 'none', background: theme.hoverBg }}><ExternalLink size={14} />Open in TradingView</a>)}</div>)}
        {trade.notes && (<div><div className="stat-label" style={{ marginBottom: 8 }}>Notes</div><p style={{ fontSize: 14, color: theme.text, padding: 14, borderRadius: 10, background: theme.hoverBg }}>{trade.notes}</p></div>)}
      </div>
      <div style={{ padding: 20, borderTop: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between' }}>
        {!confirmDelete ? <>
          <button onClick={() => setConfirmDelete(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', fontSize: 14, color: '#ef4444', cursor: 'pointer' }}><Trash2 size={16} />Delete</button>
          <div className="flex gap-2"><button onClick={() => onEdit(trade)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 10, border: `1px solid ${theme.cardBorder}`, background: 'none', fontSize: 14, color: theme.text, cursor: 'pointer' }}><Edit3 size={16} />Edit</button><button onClick={onClose} className="btn-primary">Close</button></div>
        </> : <>
          <span style={{ fontSize: 14, color: theme.textMuted }}>Delete this trade?</span>
          <div className="flex gap-2"><button onClick={() => setConfirmDelete(false)} style={{ background: 'none', border: 'none', fontSize: 14, color: theme.textMuted, cursor: 'pointer' }}>Cancel</button><button onClick={() => onDelete(trade.id)} className="btn-primary" style={{ background: '#ef4444' }}>Delete</button></div>
        </>}
      </div>
    </Modal>
  );
}
