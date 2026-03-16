import React, { useState, useEffect, createContext, useContext, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell } from 'recharts';
import { Plus, TrendingUp, TrendingDown, ChevronDown, Calendar, BarChart3, BookOpen, Wallet, CheckCircle, Clock, X, Eye, Database, ChevronLeft, ChevronRight, Trash2, Edit3, Moon, Sun, Settings, Link, Image, ExternalLink, Loader2, CloudOff, Cloud, LayoutGrid, LayoutList, Upload, FileText, AlertCircle, Shield, Target, AlertTriangle, Zap, Trophy, Flag, Activity } from 'lucide-react';

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

// ==================== PROP FIRM PRESETS ====================
const PROP_FIRM_PRESETS = {
  FTMO: {
    name: 'FTMO',
    phases: [
      { name: 'FTMO Challenge', profitTarget: 10, maxDailyDrawdown: 5, maxTotalDrawdown: 10, minTradingDays: 4, maxTradingDays: 30, drawdownType: 'balance' },
      { name: 'Verification', profitTarget: 5, maxDailyDrawdown: 5, maxTotalDrawdown: 10, minTradingDays: 4, maxTradingDays: 60, drawdownType: 'balance' },
      { name: 'Funded', profitTarget: null, maxDailyDrawdown: 5, maxTotalDrawdown: 10, minTradingDays: 0, maxTradingDays: null, drawdownType: 'balance' }
    ],
    profitSplit: 80,
    scalingPlan: true,
    consistencyRule: null
  },
  FUNDED_HIVE: {
    name: 'Funded Hive',
    phases: [
      { name: 'Evaluation Phase 1', profitTarget: 8, maxDailyDrawdown: 5, maxTotalDrawdown: 10, minTradingDays: 5, maxTradingDays: 45, drawdownType: 'balance' },
      { name: 'Evaluation Phase 2', profitTarget: 5, maxDailyDrawdown: 5, maxTotalDrawdown: 10, minTradingDays: 5, maxTradingDays: 45, drawdownType: 'balance' },
      { name: 'Funded', profitTarget: null, maxDailyDrawdown: 5, maxTotalDrawdown: 10, minTradingDays: 0, maxTradingDays: null, drawdownType: 'balance' }
    ],
    profitSplit: 80,
    scalingPlan: true,
    consistencyRule: null
  },
  CUSTOM: {
    name: 'Custom',
    phases: [
      { name: 'Phase 1', profitTarget: 8, maxDailyDrawdown: 5, maxTotalDrawdown: 10, minTradingDays: 1, maxTradingDays: 30, drawdownType: 'balance' },
      { name: 'Funded', profitTarget: null, maxDailyDrawdown: 5, maxTotalDrawdown: 10, minTradingDays: 0, maxTradingDays: null, drawdownType: 'balance' }
    ],
    profitSplit: 80,
    scalingPlan: false,
    consistencyRule: null
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
          date, time, symbol, side: type.includes('buy') ? 'Long' : 'Short',
          entry: openPrice || closePrice, exit: closePrice || openPrice,
          lots: volume, pnl: profit, commission, swap,
          stopLoss: 0, takeProfit: 0, marketStructure: '', candleType: '',
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
  const phaseSplits = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  const parseNum = (text) => {
    if (!text) return 0;
    const cleaned = text.replace(/\u00a0/g, '').replace(/(\d)\s+(\d)/g, '$1$2').replace(/[^\d.\-]/g, '');
    return parseFloat(cleaned) || 0;
  };
  
  const parseDate = (text) => {
    if (!text) return { date: new Date().toISOString().split('T')[0], time: '00:00' };
    const match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{2}):(\d{2})/);
    if (match) {
      const [, day, month, year, hour, min] = match;
      return { date: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`, time: `${hour}:${min}` };
    }
    return { date: new Date().toISOString().split('T')[0], time: '00:00' };
  };
  
  const tables = doc.querySelectorAll('table');
  
  // ---- PASS 1: Parse Transactions table to detect phase transitions ----
  for (const table of tables) {
    const rows = table.querySelectorAll('tr');
    let isTransactionsTable = false;
    let txnColumnMap = {};
    
    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      const rowText = row.textContent.trim();
      
      if (rowText === 'Transactions') { isTransactionsTable = true; continue; }
      if (isTransactionsTable && /^(Summary|Positions|Orders|History)$/.test(rowText)) break;
      if (!isTransactionsTable) continue;
      
      if (cells.length >= 4 && Object.keys(txnColumnMap).length === 0) {
        const hTexts = Array.from(cells).map(c => c.textContent.trim().toLowerCase());
        if (hTexts.some(h => h.includes('type'))) {
          hTexts.forEach((h, i) => {
            if ((h === 'id' || h.includes('id')) && !h.includes('time')) txnColumnMap.id = i;
            if (h.includes('time')) txnColumnMap.time = i;
            if (h === 'type') txnColumnMap.type = i;
            if (h.includes('amount')) txnColumnMap.amount = i;
            if (h.includes('note')) txnColumnMap.note = i;
          });
          continue;
        }
      }
      
      if (Object.keys(txnColumnMap).length === 0 || cells.length < 4) continue;
      
      const getText = (idx) => idx !== undefined && cells[idx] ? cells[idx].textContent.trim() : '';
      const txnType = getText(txnColumnMap.type).toLowerCase();
      const txnNote = getText(txnColumnMap.note).toUpperCase();
      const txnTime = getText(txnColumnMap.time);
      
      // Detect phase markers: withdrawals with notes containing PHASE, FUNDED, VERIFICATION, EVALUATION, INITIAL BALANCE
      if ((txnType === 'withdraw' || txnType === 'withdrawal') && 
          (txnNote.includes('PHASE') || txnNote.includes('FUNDED') || txnNote.includes('VERIFICATION') || 
           txnNote.includes('EVALUATION') || txnNote.includes('INITIAL BALANCE'))) {
        const { date, time } = parseDate(txnTime);
        const phaseName = txnNote.includes('PHASE3') ? 'Phase 3' :
                          txnNote.includes('PHASE2') ? 'Phase 2' :
                          txnNote.includes('FUNDED') ? 'Funded' :
                          txnNote.includes('VERIFICATION') ? 'Verification' : 'Next Phase';
        phaseSplits.push({ splitDate: date, splitTime: time, phaseName, note: getText(txnColumnMap.note) });
      }
    }
  }
  
  // ---- PASS 2: Parse History table for trades ----
  for (const table of tables) {
    const rows = table.querySelectorAll('tr');
    let isHistoryTable = false;
    let columnMap = {};
    
    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      const rowText = row.textContent.trim();
      
      if (rowText === 'History') { isHistoryTable = true; continue; }
      if (isHistoryTable && /^(Positions|Orders|Transactions|Summary)$/.test(rowText)) break;
      if (!isHistoryTable) continue;
      
      if (cells.length >= 10 && Object.keys(columnMap).length === 0) {
        const headerTexts = Array.from(cells).map(c => c.textContent.trim().toLowerCase());
        if (headerTexts.some(h => h.includes('symbol')) && headerTexts.some(h => h.includes('direction'))) {
          headerTexts.forEach((h, i) => {
            if (h.includes('symbol')) columnMap.symbol = i;
            if (h.includes('opening direction') || h === 'direction') columnMap.direction = i;
            if (h.includes('opening time')) columnMap.openTime = i;
            if (h.includes('closing time')) columnMap.closeTime = i;
            if (h.includes('entry price') || h === 'entry') columnMap.entry = i;
            if (h.includes('closing price') || h === 'close') columnMap.close = i;
            if (h.includes('closing quantity') || h.includes('quantity')) columnMap.quantity = i;
            if (h.includes('swap')) columnMap.swap = i;
            if (h.includes('commission')) columnMap.commission = i;
            if (h.includes('net')) columnMap.net = i;
            if (h.includes('balance')) columnMap.balance = i;
          });
          continue;
        }
      }
      
      if (Object.keys(columnMap).length === 0) continue;
      if (rowText.startsWith('Totals') || cells.length < 10) continue;
      
      const getText = (idx) => idx !== undefined && cells[idx] ? cells[idx].textContent.trim() : '';
      const symbol = getText(columnMap.symbol);
      const directionText = getText(columnMap.direction).toLowerCase();
      const openTimeText = getText(columnMap.openTime);
      const closeTimeText = getText(columnMap.closeTime);
      const entryPrice = parseNum(getText(columnMap.entry));
      const closePrice = parseNum(getText(columnMap.close));
      const quantityText = getText(columnMap.quantity);
      const swap = parseNum(getText(columnMap.swap));
      const commission = Math.abs(parseNum(getText(columnMap.commission)));
      const netPnl = parseNum(getText(columnMap.net));
      const lotsMatch = quantityText.match(/([\d.]+)\s*Lots?/i);
      const lots = lotsMatch ? parseFloat(lotsMatch[1]) : parseNum(quantityText);
      
      if (!symbol || symbol.length < 3 || symbol.length > 10) continue;
      if (!directionText.includes('buy') && !directionText.includes('sell')) continue;
      if (lots === 0) continue;
      
      const { date, time } = parseDate(closeTimeText || openTimeText);
      
      // Tag trade with its phase based on split dates
      let phase = 'Phase 1';
      for (const split of phaseSplits) {
        if (date > split.splitDate || (date === split.splitDate && time >= split.splitTime)) {
          phase = split.phaseName;
        }
      }
      
      trades.push({
        date, time, symbol: symbol.replace('/', '').toUpperCase(),
        side: directionText.includes('buy') ? 'Long' : 'Short',
        entry: entryPrice, exit: closePrice, lots, pnl: netPnl, commission, swap,
        stopLoss: 0, takeProfit: 0, marketStructure: '', candleType: '',
        liquidityTaken: [], liquidityTarget: [],
        notes: 'Imported from cTrader', chartLink: '', chartImage: '',
        _phase: phase
      });
    }
  }
  
  return { trades, phaseSplits };
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
    
    trades.push({
      date, time, symbol: symbol.replace('/', '').toUpperCase(),
      side: type.includes('buy') || type.includes('long') ? 'Long' : 'Short',
      entry, exit: exit || entry, lots: volume, pnl: profit, commission, swap,
      stopLoss: 0, takeProfit: 0, marketStructure: '', candleType: '',
      liquidityTaken: [], liquidityTarget: [],
      notes: `Imported from ${platform}`, chartLink: '', chartImage: ''
    });
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
  // Forex pairs: base/quote — lotSize is always 100,000 units of BASE currency
  // For P&L: profit_in_quote = (exit - entry) * lotSize * lots
  // Then convert quote currency to USD
  'EURUSD': { pipSize: 0.0001, lotSize: 100000, base: 'EUR', quote: 'USD' },
  'GBPUSD': { pipSize: 0.0001, lotSize: 100000, base: 'GBP', quote: 'USD' },
  'AUDUSD': { pipSize: 0.0001, lotSize: 100000, base: 'AUD', quote: 'USD' },
  'NZDUSD': { pipSize: 0.0001, lotSize: 100000, base: 'NZD', quote: 'USD' },
  'USDJPY': { pipSize: 0.01, lotSize: 100000, base: 'USD', quote: 'JPY' },
  'EURJPY': { pipSize: 0.01, lotSize: 100000, base: 'EUR', quote: 'JPY' },
  'GBPJPY': { pipSize: 0.01, lotSize: 100000, base: 'GBP', quote: 'JPY' },
  'AUDJPY': { pipSize: 0.01, lotSize: 100000, base: 'AUD', quote: 'JPY' },
  'CADJPY': { pipSize: 0.01, lotSize: 100000, base: 'CAD', quote: 'JPY' },
  'CHFJPY': { pipSize: 0.01, lotSize: 100000, base: 'CHF', quote: 'JPY' },
  'NZDJPY': { pipSize: 0.01, lotSize: 100000, base: 'NZD', quote: 'JPY' },
  'USDCAD': { pipSize: 0.0001, lotSize: 100000, base: 'USD', quote: 'CAD' },
  'USDCHF': { pipSize: 0.0001, lotSize: 100000, base: 'USD', quote: 'CHF' },
  'EURGBP': { pipSize: 0.0001, lotSize: 100000, base: 'EUR', quote: 'GBP' },
  'EURAUD': { pipSize: 0.0001, lotSize: 100000, base: 'EUR', quote: 'AUD' },
  'GBPAUD': { pipSize: 0.0001, lotSize: 100000, base: 'GBP', quote: 'AUD' },
  'AUDCAD': { pipSize: 0.0001, lotSize: 100000, base: 'AUD', quote: 'CAD' },
  'EURCHF': { pipSize: 0.0001, lotSize: 100000, base: 'EUR', quote: 'CHF' },
  'GBPCAD': { pipSize: 0.0001, lotSize: 100000, base: 'GBP', quote: 'CAD' },
  'GBPCHF': { pipSize: 0.0001, lotSize: 100000, base: 'GBP', quote: 'CHF' },
  'AUDNZD': { pipSize: 0.0001, lotSize: 100000, base: 'AUD', quote: 'NZD' },
  'NZDCAD': { pipSize: 0.0001, lotSize: 100000, base: 'NZD', quote: 'CAD' },
  // Gold/Silver — contract size in troy ounces
  'XAUUSD': { pipSize: 0.01, lotSize: 100, base: 'XAU', quote: 'USD' },
  'XAGUSD': { pipSize: 0.001, lotSize: 5000, base: 'XAG', quote: 'USD' },
  // Indices — point value per contract
  'US30':   { pipSize: 1, lotSize: 1, pointValue: 1, quote: 'USD' },
  'NAS100': { pipSize: 1, lotSize: 1, pointValue: 1, quote: 'USD' },
  'SPX500': { pipSize: 0.1, lotSize: 1, pointValue: 10, quote: 'USD' },
  'DEFAULT': { pipSize: 0.0001, lotSize: 100000, base: 'USD', quote: 'USD' }
};

// Exchange rates cache — fetched once on app load
let _exchangeRates = { USD: 1 };
let _ratesLoaded = false;

const fetchExchangeRates = async () => {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    const data = await res.json();
    if (data.result === 'success' && data.rates) {
      _exchangeRates = data.rates;
      _ratesLoaded = true;
      console.log('Exchange rates loaded:', Object.keys(_exchangeRates).length, 'currencies');
    }
  } catch (err) {
    console.warn('Failed to fetch exchange rates, using fallbacks:', err.message);
  }
};

// Get rate for converting 1 unit of currency to USD
const getUSDRate = (currency) => {
  if (currency === 'USD') return 1;
  if (!_exchangeRates[currency]) return null;
  // _exchangeRates has rates relative to USD (e.g. EUR: 0.92 means 1 USD = 0.92 EUR)
  // We need: 1 EUR = ? USD → 1 / 0.92 = 1.087
  return 1 / _exchangeRates[currency];
};

// Calculate P&L in USD for a trade
// Formula: P&L = (exit - entry) * lotSize * lots [gives profit in QUOTE currency]
//          Then convert quote currency to USD
const calculateTradePnL = (symbol, side, entry, exit, lots) => {
  const sym = symbol.toUpperCase();
  const config = SYMBOL_CONFIG[sym] || SYMBOL_CONFIG['DEFAULT'];
  const entryF = parseFloat(entry), exitF = parseFloat(exit), lotsF = parseFloat(lots);
  if (isNaN(entryF) || isNaN(exitF) || isNaN(lotsF)) return 0;
  
  const diff = side === 'Long' ? exitF - entryF : entryF - exitF;
  
  // Indices: simple point value
  if (config.pointValue) {
    return diff * config.pointValue * lotsF;
  }
  
  // Profit in quote currency
  const profitInQuote = diff * config.lotSize * lotsF;
  
  // Convert quote currency to USD
  if (config.quote === 'USD') {
    // Quote is already USD (EURUSD, GBPUSD, XAUUSD, etc.)
    return profitInQuote;
  } else {
    // Need to convert quote to USD
    // For JPY pairs: profitInQuote is in JPY, divide by USDJPY rate
    // For other crosses: profitInQuote is in quote currency, divide by USD/quote rate
    const quoteToUSD = getUSDRate(config.quote);
    if (quoteToUSD !== null) {
      return profitInQuote * quoteToUSD;
    }
    // Fallback: use exit price as the cross rate for JPY pairs
    // For EURJPY at 182.747: 1 JPY = 1/182.747 * EURUSD... approximate using exit
    if (config.quote === 'JPY') {
      // Approximate: get the USDJPY-equivalent rate
      // profitInJPY / USDJPY_rate = profitInUSD
      const usdjpyApprox = _exchangeRates['JPY'] || 150;
      return profitInQuote / usdjpyApprox;
    }
    // Last resort approximation
    return profitInQuote * 0.75;
  }
};

// Keep old function signature for backward compatibility but redirect to new logic
const calculatePipValue = (symbol, exitPrice) => {
  const config = SYMBOL_CONFIG[symbol.toUpperCase()] || SYMBOL_CONFIG['DEFAULT'];
  if (config.pointValue) return config.pointValue;
  
  // pip value per lot = (pipSize * lotSize) in quote currency, converted to USD
  const pipValueInQuote = config.pipSize * config.lotSize;
  
  if (config.quote === 'USD') return pipValueInQuote;
  
  const quoteToUSD = getUSDRate(config.quote);
  if (quoteToUSD !== null) return pipValueInQuote * quoteToUSD;
  
  // Fallback using exit price for JPY pairs
  if (config.quote === 'JPY') {
    const rate = parseFloat(exitPrice) || _exchangeRates['JPY'] || 150;
    return pipValueInQuote / rate;
  }
  
  return pipValueInQuote * 0.75;
};

const loadDarkMode = () => { try { return localStorage.getItem('ellipse_darkMode') === 'true'; } catch { return false; } };

// ==================== MAIN APP ====================
export default function TradingJournal() {
  const [darkMode, setDarkMode] = useState(loadDarkMode);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [trades, setTrades] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [showNewTrade, setShowNewTrade] = useState(false);
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showNewChallenge, setShowNewChallenge] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [editingTrade, setEditingTrade] = useState(null);
  const [filterAccount, setFilterAccount] = useState('all');
  const [analyticsAccount, setAnalyticsAccount] = useState('all');
  const [loading, setLoading] = useState(true);
  const [synced, setSynced] = useState(false);
  const [journalEntries, setJournalEntries] = useState([]);

  useEffect(() => { localStorage.setItem('ellipse_darkMode', darkMode); }, [darkMode]);

  // Fetch exchange rates on mount
  useEffect(() => { fetchExchangeRates(); }, []);

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
            account: t.account, chartLink: t.chart_link, chartImage: t.chart_image
          })));
        }
        
        if (accountsRes.data) {
          setAccounts(accountsRes.data.map(a => ({
            id: a.id, name: a.name, platform: a.platform, broker: a.broker,
            server: a.server, balance: parseFloat(a.balance) || 0,
            equity: parseFloat(a.equity) || 0, connected: a.connected
          })));
        }

        // Load challenges separately — table may not exist yet
        try {
          const challengesRes = await supabase.from('challenges').select('*').order('created_at', { ascending: false });
          if (challengesRes.data) {
            setChallenges(challengesRes.data.map(c => ({
              id: c.id,
              name: c.name || 'Untitled Challenge',
              propFirm: c.prop_firm || 'Custom',
              accountSize: parseFloat(c.account_size) || 100000,
              currentPhase: c.current_phase || 0,
              phases: (Array.isArray(c.phases) ? c.phases : []) .length > 0 ? c.phases : [{ name: 'Phase 1', profitTarget: 10, maxDailyDrawdown: 5, maxTotalDrawdown: 10, minTradingDays: 1, maxTradingDays: 30, drawdownType: 'balance' }],
              account: c.account || '',
              startDate: c.start_date,
              status: c.status || 'active',
              profitSplit: c.profit_split || 80,
              drawdownType: c.drawdown_type || 'balance',
              consistencyRule: c.consistency_rule,
              notes: c.notes || ''
            })));
          }
        } catch (challengeErr) {
          console.warn('Challenges table not available, using localStorage:', challengeErr.message);
          try {
            const localChallenges = JSON.parse(localStorage.getItem('ellipse_challenges') || '[]');
            setChallenges(localChallenges);
          } catch {}
        }

        // Load journal entries separately — table may not exist yet
        try {
          const journalRes = await supabase.from('journal_entries').select('*').order('date', { ascending: false });
          if (journalRes.data) {
            setJournalEntries(journalRes.data.map(e => ({
              id: e.id,
              date: e.date,
              instrument: e.instrument || '',
              timeframe: e.timeframe || 'Daily',
              bias: e.bias || 'Neutral',
              idea: e.idea || '',
              keyLevels: e.key_levels || '',
              confluences: Array.isArray(e.confluences) ? e.confluences : [],
              notes: e.notes || '',
              chartImage: e.chart_image || '',
              createdAt: e.created_at,
              updatedAt: e.updated_at
            })));
          }
        } catch (journalErr) {
          console.warn('Journal entries table not available, using localStorage:', journalErr.message);
          try {
            const localEntries = JSON.parse(localStorage.getItem('ellipse_journal_entries') || '[]');
            setJournalEntries(localEntries);
          } catch {}
        }
        
        setSynced(true);
      } catch (err) {
        console.error('Error loading trades/accounts:', err);
        setSynced(false);
      }
      setLoading(false);
    };
    loadData();
  }, []);

  // Save challenges to localStorage as fallback
  useEffect(() => {
    if (challenges.length > 0) {
      localStorage.setItem('ellipse_challenges', JSON.stringify(challenges));
    }
  }, [challenges]);

  // Save journal entries to localStorage as fallback
  useEffect(() => {
    if (journalEntries.length > 0) {
      localStorage.setItem('ellipse_journal_entries', JSON.stringify(journalEntries));
    }
  }, [journalEntries]);

  // Journal entry CRUD — Supabase with localStorage fallback
  const addJournalEntry = async (entry) => {
    try {
      const dbEntry = {
        date: entry.date, instrument: entry.instrument, timeframe: entry.timeframe,
        bias: entry.bias, idea: entry.idea, key_levels: entry.keyLevels,
        confluences: entry.confluences, notes: entry.notes, chart_image: entry.chartImage
      };
      const { data, error } = await supabase.from('journal_entries').insert(dbEntry).select().single();
      if (!error && data) {
        setJournalEntries(prev => [{ ...entry, id: data.id, createdAt: data.created_at }, ...prev]);
        return;
      }
    } catch {}
    // Fallback to local
    const id = 'je_' + Date.now();
    setJournalEntries(prev => [{ ...entry, id, createdAt: new Date().toISOString() }, ...prev]);
  };

  const updateJournalEntry = async (entry) => {
    try {
      const { error } = await supabase.from('journal_entries').update({
        date: entry.date, instrument: entry.instrument, timeframe: entry.timeframe,
        bias: entry.bias, idea: entry.idea, key_levels: entry.keyLevels,
        confluences: entry.confluences, notes: entry.notes, chart_image: entry.chartImage
      }).eq('id', entry.id);
      if (error) throw error;
    } catch {}
    setJournalEntries(prev => prev.map(e => e.id === entry.id ? { ...entry, updatedAt: new Date().toISOString() } : e));
  };

  const deleteJournalEntry = async (id) => {
    try {
      await supabase.from('journal_entries').delete().eq('id', id);
    } catch {}
    setJournalEntries(prev => prev.filter(e => e.id !== id));
  };

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
      stop_loss: trade.stopLoss, take_profit: trade.takeProfit, pnl: trade.pnl,
      commission: trade.commission, swap: trade.swap, risk_reward: '-',
      market_structure: trade.marketStructure, candle_type: trade.candleType,
      liquidity_taken: trade.liquidityTaken, liquidity_target: trade.liquidityTarget,
      notes: trade.notes, account: accountName,
      chart_link: trade.chartLink, chart_image: trade.chartImage
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
      stop_loss: trade.stopLoss, take_profit: trade.takeProfit, pnl: trade.pnl,
      commission: trade.commission, swap: trade.swap, risk_reward: trade.riskReward,
      market_structure: trade.marketStructure, candle_type: trade.candleType,
      liquidity_taken: trade.liquidityTaken, liquidity_target: trade.liquidityTarget,
      notes: trade.notes, account: trade.account,
      chart_link: trade.chartLink, chart_image: trade.chartImage
    };
    const { error } = await supabase.from('trades').update(dbTrade).eq('id', trade.id);
    if (error) { console.error('Error updating trade:', error); return; }
    setTrades(prev => prev.map(t => t.id === trade.id ? trade : t));
  };

  const addAccount = async (account) => {
    const { data, error } = await supabase.from('accounts').insert({
      name: account.name, platform: account.platform, broker: account.broker,
      server: account.server, balance: account.balance, equity: account.equity, connected: account.connected
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
  const addChallenge = async (challenge) => {
    try {
      const dbChallenge = {
        name: challenge.name, prop_firm: challenge.propFirm,
        account_size: challenge.accountSize, current_phase: challenge.currentPhase,
        phases: challenge.phases, account: challenge.account,
        start_date: challenge.startDate, status: challenge.status,
        profit_split: challenge.profitSplit, drawdown_type: challenge.drawdownType,
        consistency_rule: challenge.consistencyRule, notes: challenge.notes
      };
      const { data, error } = await supabase.from('challenges').insert(dbChallenge).select().single();
      if (!error && data) {
        setChallenges(prev => [{ ...challenge, id: data.id }, ...prev]);
        return;
      }
    } catch {}
    // Fallback to local
    const id = 'local_' + Date.now();
    setChallenges(prev => [{ ...challenge, id }, ...prev]);
  };

  const updateChallenge = async (challenge) => {
    try {
      const { error } = await supabase.from('challenges').update({
        name: challenge.name, current_phase: challenge.currentPhase,
        status: challenge.status, phases: challenge.phases, notes: challenge.notes
      }).eq('id', challenge.id);
      if (error) throw error;
    } catch {}
    setChallenges(prev => prev.map(c => c.id === challenge.id ? challenge : c));
  };

  const deleteChallenge = async (id) => {
    try {
      await supabase.from('challenges').delete().eq('id', id);
    } catch {}
    setChallenges(prev => prev.filter(c => c.id !== id));
  };

  const filteredTrades = filterAccount === 'all' ? trades : trades.filter(t => t.account === filterAccount);
  const today = new Date().toISOString().split('T')[0];
  const todayTrades = filteredTrades.filter(t => t.date === today);
  const todayPnl = todayTrades.reduce((sum, t) => sum + (parseFloat(t.pnl) || 0), 0);
  const todayWins = todayTrades.filter(t => t.pnl > 0).length;
  const todayLosses = todayTrades.filter(t => t.pnl < 0).length;

  const theme = {
    dark: darkMode, bg: darkMode ? '#0a0a0a' : '#f8fafc',
    card: darkMode ? '#111111' : '#ffffff', cardBorder: darkMode ? '#1f1f1f' : '#e2e8f0',
    text: darkMode ? '#f1f5f9' : '#0f172a', textMuted: darkMode ? '#94a3b8' : '#64748b',
    textFaint: darkMode ? '#64748b' : '#94a3b8', inputBg: darkMode ? '#1a1a1a' : '#ffffff',
    inputBorder: darkMode ? '#2a2a2a' : '#e2e8f0', hoverBg: darkMode ? '#1a1a1a' : '#f1f5f9',
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
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes pulse-warning { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
          .pulse-warn { animation: pulse-warning 1.5s ease-in-out infinite; }
          .progress-bar-animate { transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1); }
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
                { id: 'challenges', label: 'Challenges', icon: Trophy },
                { id: 'journal', label: 'Journal', icon: BookOpen },
                { id: 'news', label: 'News', icon: Zap },
                { id: 'history', label: 'History', icon: Clock },
                { id: 'accounts', label: 'Accounts', icon: Wallet },
                { id: 'calendar', label: 'Calendar', icon: Calendar },
              ].map(item => (
                <div key={item.id} onClick={() => setActiveTab(item.id)} className={`nav-item ${activeTab === item.id ? 'active' : ''}`}>
                  <item.icon size={18} />{item.label}
                  {item.id === 'challenges' && challenges.filter(c => c.status === 'active').length > 0 && (
                    <span style={{ marginLeft: 'auto', fontSize: 10, padding: '2px 7px', borderRadius: 10, background: activeTab === 'challenges' ? 'rgba(255,255,255,0.2)' : '#6366f1', color: 'white', fontWeight: 600 }}>
                      {challenges.filter(c => c.status === 'active').length}
                    </span>
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
                <div className="stat-value" style={{ color: todayPnl >= 0 ? '#10b981' : '#ef4444', marginTop: 4 }}>
                  {todayPnl >= 0 ? '+' : ''}{todayPnl.toFixed(2)}
                </div>
                <div style={{ marginTop: 8, display: 'flex', gap: 12, fontSize: 12, color: theme.textMuted }}>
                  <span className="flex items-center gap-1"><span style={{ width: 6, height: 6, borderRadius: 3, background: '#10b981' }}></span>{todayWins}W</span>
                  <span className="flex items-center gap-1"><span style={{ width: 6, height: 6, borderRadius: 3, background: '#ef4444' }}></span>{todayLosses}L</span>
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
                    {activeTab === 'challenges' && 'Prop Firm Challenges'}
                    {activeTab === 'journal' && 'Journal'}
                    {activeTab === 'news' && 'Economic Calendar'}
                    {activeTab === 'history' && 'Trade History'}
                    {activeTab === 'accounts' && 'Accounts'}
                    {activeTab === 'calendar' && 'Calendar'}
                  </h1>
                  <p style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>
                    {activeTab === 'dashboard' && 'Performance metrics and insights'}
                    {activeTab === 'challenges' && 'Track challenge phases, drawdown limits & profit targets'}
                    {activeTab === 'journal' && 'Trade ideas, bias analysis & market notes'}
                    {activeTab === 'news' && 'High-impact forex news events & economic releases'}
                    {activeTab === 'history' && 'Document and analyze your trades'}
                    {activeTab === 'accounts' && 'Manage trading accounts'}
                    {activeTab === 'calendar' && 'Visual trade history'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setDarkMode(!darkMode)} style={{ padding: 10, borderRadius: 10, border: `1px solid ${theme.cardBorder}`, background: theme.card, cursor: 'pointer' }}>
                    {darkMode ? <Sun size={18} style={{ color: theme.textMuted }} /> : <Moon size={18} style={{ color: theme.textMuted }} />}
                  </button>
                  
                  {activeTab === 'history' && (
                    <>
                      <button onClick={() => setShowImport(true)} style={{ padding: 10, borderRadius: 10, border: `1px solid ${theme.cardBorder}`, background: theme.card, cursor: 'pointer' }} title="Import trades">
                        <Upload size={18} style={{ color: theme.textMuted }} />
                      </button>
                      <button onClick={() => setShowNewTrade(true)} className="btn-primary flex items-center gap-2"><Plus size={16} />Log Trade</button>
                    </>
                  )}
                  {activeTab === 'journal' && <button onClick={() => { const evt = new CustomEvent('ellipse-new-journal'); window.dispatchEvent(evt); }} className="btn-primary flex items-center gap-2"><Plus size={16} />New Entry</button>}
                  {activeTab === 'accounts' && <button onClick={() => setShowNewAccount(true)} className="btn-primary flex items-center gap-2"><Plus size={16} />Add Account</button>}
                  {activeTab === 'challenges' && <button onClick={() => setShowNewChallenge(true)} className="btn-primary flex items-center gap-2"><Plus size={16} />New Challenge</button>}
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
                  {activeTab === 'dashboard' && <DashboardView trades={trades} accounts={accounts} challenges={challenges} selectedAccount={analyticsAccount} setSelectedAccount={setAnalyticsAccount} />}
                  {activeTab === 'challenges' && <ChallengesView challenges={challenges} trades={trades} accounts={accounts} onUpdate={updateChallenge} onDelete={deleteChallenge} />}
                  {activeTab === 'journal' && <JournalIdeasView entries={journalEntries} onAdd={addJournalEntry} onUpdate={updateJournalEntry} onDelete={deleteJournalEntry} />}
                  {activeTab === 'news' && <NewsCalendarView />}
                  {activeTab === 'history' && <JournalView trades={trades} accounts={accounts} filterAccount={filterAccount} setFilterAccount={setFilterAccount} onSelectTrade={setSelectedTrade} onDeleteTrades={async (ids) => { for (const id of ids) await deleteTrade(id); }} />}
                  {activeTab === 'accounts' && <AccountsView accounts={accounts} challenges={challenges} trades={trades} onUpdate={updateAccount} onDelete={deleteAccount} />}
                  {activeTab === 'calendar' && <CalendarView trades={trades} />}
                </>
              )}
            </div>
          </main>
        </div>

        {showNewTrade && <NewTradeModal onClose={() => setShowNewTrade(false)} onSave={(trade) => { addTrade(trade); setShowNewTrade(false); }} accounts={accounts} />}
        {showNewAccount && <NewAccountModal onClose={() => setShowNewAccount(false)} onSave={(acc) => { addAccount(acc); setShowNewAccount(false); }} />}
        {showImport && <ImportModal onClose={() => setShowImport(false)} onImport={importTrades} accounts={accounts} />}
        {showNewChallenge && <NewChallengeModal onClose={() => setShowNewChallenge(false)} onSave={(ch) => { addChallenge(ch); setShowNewChallenge(false); }} accounts={accounts} />}
        {selectedTrade && <TradeDetailModal trade={selectedTrade} onClose={() => setSelectedTrade(null)} onDelete={(id) => { deleteTrade(id); setSelectedTrade(null); }} onEdit={(trade) => { setSelectedTrade(null); setEditingTrade(trade); }} />}
        {editingTrade && <EditTradeModal trade={editingTrade} onClose={() => setEditingTrade(null)} onSave={(trade) => { updateTrade(trade); setEditingTrade(null); }} accounts={accounts} />}
      </div>
    </ThemeContext.Provider>
  );
}

// ==================== CHALLENGES VIEW ====================
function ChallengesView({ challenges, trades, accounts, onUpdate, onDelete }) {
  const theme = useTheme();
  const [selectedChallenge, setSelectedChallenge] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  const activeChallenges = challenges.filter(c => c.status === 'active');
  const completedChallenges = challenges.filter(c => c.status !== 'active');

  // Auto-progression check: for each active challenge, check if profit target + min trading days are met
  useEffect(() => {
    activeChallenges.forEach(challenge => {
      const accountTrades = trades.filter(t => t.account === challenge.account);
      const challengeTrades = accountTrades.filter(t => !challenge.startDate || t.date >= challenge.startDate);
      const phase = challenge.phases?.[challenge.currentPhase] || challenge.phases?.[0] || {};
      const accountSize = challenge.accountSize || 1;
      const totalPnl = challengeTrades.reduce((s, t) => s + (parseFloat(t.pnl) || 0), 0);
      const profitPct = (totalPnl / accountSize) * 100;
      const tradingDays = new Set(challengeTrades.map(t => t.date)).size;
      const minDays = phase.minTradingDays || 0;
      const targetPct = phase.profitTarget;

      // Check if max drawdown was breached (auto-fail)
      let lowestEquity = accountSize;
      let runPnl = 0;
      [...challengeTrades].sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(t => {
        runPnl += (parseFloat(t.pnl) || 0);
        const eq = accountSize + runPnl;
        if (eq < lowestEquity) lowestEquity = eq;
      });
      const maxDD = accountSize > 0 ? ((accountSize - lowestEquity) / accountSize) * 100 : 0;
      
      if (maxDD >= (phase.maxTotalDrawdown || 10)) {
        // Auto-fail: max drawdown breached
        if (challenge.status === 'active') {
          onUpdate({ ...challenge, status: 'failed', notes: (challenge.notes || '') + `\nAuto-failed: Max drawdown ${maxDD.toFixed(2)}% exceeded ${phase.maxTotalDrawdown}% limit.` });
        }
        return;
      }

      // Auto-advance: profit target met + min trading days met
      if (targetPct && profitPct >= targetPct && tradingDays >= minDays) {
        if (challenge.currentPhase < challenge.phases.length - 1) {
          // Advance to next phase
          onUpdate({ ...challenge, currentPhase: challenge.currentPhase + 1, notes: (challenge.notes || '') + `\nAuto-advanced to ${challenge.phases[challenge.currentPhase + 1]?.name}: +${profitPct.toFixed(2)}% in ${tradingDays} days.` });
        } else {
          // Last phase — mark as passed
          onUpdate({ ...challenge, status: 'passed', notes: (challenge.notes || '') + `\nAuto-passed: +${profitPct.toFixed(2)}% in ${tradingDays} days.` });
        }
      }
    });
  }, [trades.length]); // Re-check when trade count changes

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Active Challenges */}
      {activeChallenges.length === 0 && completedChallenges.length === 0 ? (
        <div className="card-lg" style={{ padding: 60, textAlign: 'center' }}>
          <Trophy size={44} style={{ color: theme.textFaint, margin: '0 auto 12px', opacity: 0.4 }} />
          <p style={{ fontSize: 15, fontWeight: 500, color: theme.textMuted }}>No challenges yet</p>
          <p style={{ fontSize: 13, color: theme.textFaint, marginTop: 4 }}>Click "New Challenge" to start tracking a prop firm evaluation</p>
        </div>
      ) : (
        <>
          {activeChallenges.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>Active Challenges</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {activeChallenges.map(challenge => (
                  <ChallengeCard key={challenge.id} challenge={challenge} trades={trades} onSelect={() => setSelectedChallenge(challenge)} onUpdate={onUpdate} onDelete={() => setDeleteId(challenge.id)} />
                ))}
              </div>
            </div>
          )}

          {completedChallenges.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>Completed / Failed</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {completedChallenges.map(challenge => (
                  <ChallengeCard key={challenge.id} challenge={challenge} trades={trades} onSelect={() => setSelectedChallenge(challenge)} onUpdate={onUpdate} onDelete={() => setDeleteId(challenge.id)} compact />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Challenge Detail Modal */}
      {selectedChallenge && (
        <ChallengeDetailModal
          challenge={selectedChallenge}
          trades={trades}
          onClose={() => setSelectedChallenge(null)}
          onUpdate={(updated) => { onUpdate(updated); setSelectedChallenge(updated); }}
        />
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <Modal onClose={() => setDeleteId(null)}>
          <div style={{ padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: theme.text, marginBottom: 8 }}>Delete Challenge?</h3>
            <p style={{ fontSize: 14, color: theme.textMuted, marginBottom: 20 }}>This will remove the challenge tracking. Your trades won't be affected.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="input" style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => { onDelete(deleteId); setDeleteId(null); }} className="btn-primary" style={{ flex: 1, background: '#ef4444' }}>Delete</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ==================== CHALLENGE CARD ====================
function ChallengeCard({ challenge, trades, onSelect, onUpdate, onDelete, compact }) {
  const theme = useTheme();

  // Calculate challenge metrics
  const accountTrades = trades.filter(t => t.account === challenge.account);
  const challengeTrades = accountTrades.filter(t => {
    if (!challenge.startDate) return true;
    return t.date >= challenge.startDate;
  });

  const phase = challenge.phases?.[challenge.currentPhase] || challenge.phases?.[0] || {};
  const accountSize = challenge.accountSize || 1; // prevent division by zero
  const totalPnl = challengeTrades.reduce((s, t) => s + (parseFloat(t.pnl) || 0), 0);
  const profitPct = (totalPnl / accountSize) * 100;
  const profitTargetPct = phase.profitTarget ?? 10;
  const profitProgress = profitTargetPct ? Math.min((profitPct / profitTargetPct) * 100, 100) : 0;

  // Daily drawdown calculation
  const today = new Date().toISOString().split('T')[0];
  const todayTrades = challengeTrades.filter(t => t.date === today);
  const todayPnl = todayTrades.reduce((s, t) => s + t.pnl, 0);
  const dailyDrawdownPct = accountSize > 0 ? Math.abs(Math.min(todayPnl, 0)) / accountSize * 100 : 0;
  const maxDailyDD = phase.maxDailyDrawdown || 5;
  const dailyDDUsed = maxDailyDD > 0 ? (dailyDrawdownPct / maxDailyDD) * 100 : 0;

  // Max total drawdown
  let lowestEquity = accountSize;
  let runningPnl = 0;
  const sortedTrades = [...challengeTrades].sort((a, b) => new Date(a.date + ' ' + a.time) - new Date(b.date + ' ' + b.time));
  sortedTrades.forEach(t => {
    runningPnl += t.pnl;
    const equity = accountSize + runningPnl;
    if (equity < lowestEquity) lowestEquity = equity;
  });
  const maxDrawdownPct = accountSize > 0 ? ((accountSize - lowestEquity) / accountSize) * 100 : 0;
  const maxTotalDD = phase.maxTotalDrawdown || 10;
  const totalDDUsed = maxTotalDD > 0 ? (maxDrawdownPct / maxTotalDD) * 100 : 0;

  // Trading days
  const tradingDays = new Set(challengeTrades.map(t => t.date)).size;
  const minTradingDays = phase?.minTradingDays || 0;

  // Drawdown danger levels
  const isDailyDanger = dailyDDUsed >= 70;
  const isTotalDanger = totalDDUsed >= 70;
  const isDailyCritical = dailyDDUsed >= 90;
  const isTotalCritical = totalDDUsed >= 90;

  const statusColors = {
    active: { bg: 'rgba(99,102,241,0.1)', text: '#6366f1', label: 'Active' },
    passed: { bg: 'rgba(16,185,129,0.1)', text: '#10b981', label: 'Passed' },
    failed: { bg: 'rgba(239,68,68,0.1)', text: '#ef4444', label: 'Failed' },
    funded: { bg: 'rgba(245,158,11,0.1)', text: '#f59e0b', label: 'Funded' }
  };
  const statusStyle = statusColors[challenge.status] || statusColors.active;

  if (compact) {
    return (
      <div onClick={onSelect} className="card" style={{ padding: 16, cursor: 'pointer', transition: 'transform 0.15s' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'} onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div style={{ width: 36, height: 36, borderRadius: 8, background: statusStyle.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {challenge.status === 'passed' ? <CheckCircle size={18} style={{ color: statusStyle.text }} /> :
               challenge.status === 'funded' ? <Trophy size={18} style={{ color: statusStyle.text }} /> :
               <X size={18} style={{ color: statusStyle.text }} />}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: theme.text }}>{challenge.name}</div>
              <div style={{ fontSize: 12, color: theme.textFaint }}>{challenge.propFirm} · ${(challenge.accountSize || 0).toLocaleString()}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="badge" style={{ background: statusStyle.bg, color: statusStyle.text }}>{statusStyle.label}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: totalPnl >= 0 ? '#10b981' : '#ef4444' }}>{totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card-lg" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${theme.cardBorder}` }}>
        <div className="flex items-center gap-3">
          <div style={{ width: 42, height: 42, borderRadius: 10, background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shield size={20} style={{ color: 'white' }} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: theme.text }}>{challenge.name}</div>
            <div style={{ fontSize: 12, color: theme.textFaint }}>
              {challenge.propFirm} · ${(challenge.accountSize || 0).toLocaleString()} · {phase?.name || 'Phase 1'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(isDailyCritical || isTotalCritical) && (
            <div className="pulse-warn" style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={14} style={{ color: '#ef4444' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#ef4444' }}>DRAWDOWN WARNING</span>
            </div>
          )}
          <span className="badge" style={{ background: statusStyle.bg, color: statusStyle.text, padding: '6px 12px' }}>{statusStyle.label}</span>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ padding: 6, borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer' }}>
            <Trash2 size={15} style={{ color: theme.textFaint }} />
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div style={{ padding: 20 }} onClick={onSelect}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20, cursor: 'pointer' }}>
          {/* Current P&L */}
          <div style={{ padding: 14, borderRadius: 10, background: theme.hoverBg }}>
            <div className="stat-label">Current P&L</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: totalPnl >= 0 ? '#10b981' : '#ef4444', marginTop: 4 }}>
              {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
            </div>
            <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 2 }}>
              {profitPct >= 0 ? '+' : ''}{profitPct.toFixed(2)}%
            </div>
          </div>

          {/* Profit Target */}
          <div style={{ padding: 14, borderRadius: 10, background: theme.hoverBg }}>
            <div className="stat-label">Profit Target</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: theme.text, marginTop: 4 }}>
              {profitTargetPct ? `${profitTargetPct}%` : '—'}
            </div>
            <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 2 }}>
              ${profitTargetPct ? ((profitTargetPct / 100) * accountSize).toFixed(0) : '—'} target
            </div>
          </div>

          {/* Trading Days */}
          <div style={{ padding: 14, borderRadius: 10, background: theme.hoverBg }}>
            <div className="stat-label">Trading Days</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: tradingDays >= minTradingDays ? '#10b981' : theme.text, marginTop: 4 }}>
              {tradingDays}
            </div>
            <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 2 }}>
              {minTradingDays > 0 ? `Min: ${minTradingDays} days` : 'No minimum'}
            </div>
          </div>

          {/* Today's P&L */}
          <div style={{ padding: 14, borderRadius: 10, background: theme.hoverBg }}>
            <div className="stat-label">Today's P&L</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: todayPnl >= 0 ? '#10b981' : '#ef4444', marginTop: 4 }}>
              {todayPnl >= 0 ? '+' : ''}${todayPnl.toFixed(2)}
            </div>
            <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 2 }}>
              {todayTrades.length} trade{todayTrades.length !== 1 ? 's' : ''} today
            </div>
          </div>
        </div>

        {/* Progress Bars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Profit Progress */}
          {profitTargetPct && (
            <div>
              <div className="flex justify-between items-center" style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: theme.textMuted }}>Profit Progress</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: profitPct >= profitTargetPct ? '#10b981' : theme.text }}>
                  {profitPct.toFixed(2)}% / {profitTargetPct}%
                </span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: theme.hoverBg, overflow: 'hidden' }}>
                <div className="progress-bar-animate" style={{ height: '100%', borderRadius: 4, width: `${Math.max(profitProgress, 0)}%`, background: profitPct >= profitTargetPct ? 'linear-gradient(90deg, #10b981, #34d399)' : 'linear-gradient(90deg, #6366f1, #8b5cf6)' }} />
              </div>
            </div>
          )}

          {/* Daily Drawdown */}
          <div>
            <div className="flex justify-between items-center" style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: isDailyDanger ? '#ef4444' : theme.textMuted }}>
                Daily Drawdown {isDailyCritical && '⚠️'}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: isDailyDanger ? '#ef4444' : theme.text }}>
                {dailyDrawdownPct.toFixed(2)}% / {maxDailyDD}%
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: theme.hoverBg, overflow: 'hidden' }}>
              <div className="progress-bar-animate" style={{ height: '100%', borderRadius: 4, width: `${Math.min(dailyDDUsed, 100)}%`, background: isDailyCritical ? '#ef4444' : isDailyDanger ? 'linear-gradient(90deg, #f59e0b, #ef4444)' : 'linear-gradient(90deg, #10b981, #34d399)' }} />
            </div>
          </div>

          {/* Max Drawdown */}
          <div>
            <div className="flex justify-between items-center" style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: isTotalDanger ? '#ef4444' : theme.textMuted }}>
                Max Drawdown {isTotalCritical && '⚠️'}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: isTotalDanger ? '#ef4444' : theme.text }}>
                {maxDrawdownPct.toFixed(2)}% / {maxTotalDD}%
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: theme.hoverBg, overflow: 'hidden' }}>
              <div className="progress-bar-animate" style={{ height: '100%', borderRadius: 4, width: `${Math.min(totalDDUsed, 100)}%`, background: isTotalCritical ? '#ef4444' : isTotalDanger ? 'linear-gradient(90deg, #f59e0b, #ef4444)' : 'linear-gradient(90deg, #10b981, #34d399)' }} />
            </div>
          </div>
        </div>

        {/* Quick Action Hint */}
        <div style={{ marginTop: 16, textAlign: 'center', fontSize: 12, color: theme.textFaint, cursor: 'pointer' }}>
          Click for detailed breakdown →
        </div>
      </div>
    </div>
  );
}

// ==================== CHALLENGE DETAIL MODAL ====================
function ChallengeDetailModal({ challenge, trades, onClose, onUpdate }) {
  const theme = useTheme();

  const accountTrades = trades.filter(t => t.account === challenge.account);
  const challengeTrades = accountTrades.filter(t => !challenge.startDate || t.date >= challenge.startDate);
  const phase = challenge.phases?.[challenge.currentPhase] || challenge.phases?.[0] || {};
  const accountSize = challenge.accountSize || 1;

  // Detailed daily breakdown
  const dailyData = {};
  const sortedTrades = [...challengeTrades].sort((a, b) => new Date(a.date) - new Date(b.date));
  sortedTrades.forEach(t => {
    if (!dailyData[t.date]) dailyData[t.date] = { pnl: 0, trades: 0, wins: 0 };
    dailyData[t.date].pnl += (parseFloat(t.pnl) || 0);
    dailyData[t.date].trades++;
    if (t.pnl > 0) dailyData[t.date].wins++;
  });

  const dailyEntries = Object.entries(dailyData).sort(([a], [b]) => a.localeCompare(b));
  let cumPnl = 0;
  const equityCurve = dailyEntries.map(([date, data]) => {
    cumPnl += data.pnl;
    return { date: date.slice(5), pnl: cumPnl, daily: data.pnl, equity: accountSize + cumPnl };
  });

  const totalPnl = challengeTrades.reduce((s, t) => s + (parseFloat(t.pnl) || 0), 0);
  const profitPct = accountSize > 0 ? (totalPnl / accountSize) * 100 : 0;
  const tradingDays = Object.keys(dailyData).length;
  const worstDay = dailyEntries.length > 0 ? Math.min(...dailyEntries.map(([, d]) => d.pnl)) : 0;
  const bestDay = dailyEntries.length > 0 ? Math.max(...dailyEntries.map(([, d]) => d.pnl)) : 0;
  const avgDailyPnl = tradingDays > 0 ? totalPnl / tradingDays : 0;

  // Max drawdown from peak
  let peak = accountSize;
  let maxDD = 0;
  let running = accountSize;
  sortedTrades.forEach(t => {
    running += (parseFloat(t.pnl) || 0);
    if (running > peak) peak = running;
    const dd = peak > 0 ? ((peak - running) / peak) * 100 : 0;
    if (dd > maxDD) maxDD = dd;
  });

  // Consistency check - max daily profit shouldn't exceed certain % of total
  const maxDailyProfit = dailyEntries.length > 0 ? Math.max(...dailyEntries.map(([, d]) => d.pnl)) : 0;
  const consistencyPct = totalPnl > 0 ? (maxDailyProfit / totalPnl) * 100 : 0;

  const handlePhaseAdvance = () => {
    if (challenge.currentPhase < challenge.phases.length - 1) {
      onUpdate({ ...challenge, currentPhase: challenge.currentPhase + 1 });
    } else {
      onUpdate({ ...challenge, status: 'funded' });
    }
  };

  const handleMarkPassed = () => onUpdate({ ...challenge, status: 'passed' });
  const handleMarkFailed = () => onUpdate({ ...challenge, status: 'failed' });

  return (
    <Modal width={700} onClose={onClose}>
      <div style={{ padding: 20, borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: theme.text }}>{challenge.name}</h3>
          <p style={{ fontSize: 12, color: theme.textFaint }}>{challenge.propFirm} · {phase?.name} · ${accountSize.toLocaleString()}</p>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={20} style={{ color: theme.textFaint }} /></button>
      </div>

      <div style={{ padding: 20, maxHeight: '70vh', overflow: 'auto' }} className="scrollbar">
        {/* Summary Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          <div style={{ padding: 14, borderRadius: 10, background: theme.hoverBg, textAlign: 'center' }}>
            <div className="stat-label">Net P&L</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: totalPnl >= 0 ? '#10b981' : '#ef4444', marginTop: 4 }}>
              {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
            </div>
            <div style={{ fontSize: 11, color: theme.textFaint }}>{profitPct.toFixed(2)}%</div>
          </div>
          <div style={{ padding: 14, borderRadius: 10, background: theme.hoverBg, textAlign: 'center' }}>
            <div className="stat-label">Max Drawdown</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: maxDD >= (phase?.maxTotalDrawdown || 10) * 0.7 ? '#ef4444' : theme.text, marginTop: 4 }}>
              {maxDD.toFixed(2)}%
            </div>
            <div style={{ fontSize: 11, color: theme.textFaint }}>Limit: {phase?.maxTotalDrawdown || 10}%</div>
          </div>
          <div style={{ padding: 14, borderRadius: 10, background: theme.hoverBg, textAlign: 'center' }}>
            <div className="stat-label">Trading Days</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: theme.text, marginTop: 4 }}>{tradingDays}</div>
            <div style={{ fontSize: 11, color: theme.textFaint }}>Min: {phase?.minTradingDays || 0}</div>
          </div>
        </div>

        {/* Additional Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Best Day', value: `+$${bestDay.toFixed(2)}`, color: '#10b981' },
            { label: 'Worst Day', value: `$${worstDay.toFixed(2)}`, color: '#ef4444' },
            { label: 'Avg Daily', value: `$${avgDailyPnl.toFixed(2)}`, color: avgDailyPnl >= 0 ? '#10b981' : '#ef4444' },
            { label: 'Consistency', value: `${consistencyPct.toFixed(0)}%`, color: consistencyPct <= 40 ? '#10b981' : '#f59e0b' }
          ].map(stat => (
            <div key={stat.label} style={{ padding: 12, borderRadius: 8, background: theme.hoverBg }}>
              <div className="stat-label">{stat.label}</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: stat.color, marginTop: 4 }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Equity Curve */}
        {equityCurve.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div className="stat-label" style={{ marginBottom: 10 }}>Equity Curve</div>
            <div style={{ height: 180, borderRadius: 10, background: theme.hoverBg, padding: '12px 8px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equityCurve}>
                  <defs>
                    <linearGradient id="eqGreen" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="eqRed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: theme.textFaint }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: theme.textFaint }} tickFormatter={v => `$${v.toLocaleString()}`} domain={['dataMin - 100', 'dataMax + 100']} />
                  <Tooltip contentStyle={{ background: theme.card, border: `1px solid ${theme.cardBorder}`, borderRadius: 8, fontSize: 12 }} formatter={(v) => [`$${v.toLocaleString()}`, 'Equity']} />
                  <Area type="monotone" dataKey="equity" stroke={totalPnl >= 0 ? '#10b981' : '#ef4444'} fill={totalPnl >= 0 ? 'url(#eqGreen)' : 'url(#eqRed)'} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Daily Breakdown */}
        {dailyEntries.length > 0 && (
          <div>
            <div className="stat-label" style={{ marginBottom: 10 }}>Daily Breakdown</div>
            <div style={{ borderRadius: 10, border: `1px solid ${theme.cardBorder}`, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px', gap: 8, padding: '10px 14px', background: theme.hoverBg }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted }}>DATE</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted, textAlign: 'right' }}>TRADES</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted, textAlign: 'right' }}>DAILY P&L</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted, textAlign: 'right' }}>CUMULATIVE</span>
              </div>
              {(() => {
                let cum = 0;
                return dailyEntries.map(([date, data]) => {
                  cum += data.pnl;
                  const ddPct = (Math.abs(Math.min(data.pnl, 0)) / accountSize * 100);
                  const isDDAlert = ddPct >= (phase?.maxDailyDrawdown || 5) * 0.7;
                  return (
                    <div key={date} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px', gap: 8, padding: '10px 14px', borderTop: `1px solid ${theme.cardBorder}`, background: isDDAlert ? 'rgba(239,68,68,0.05)' : 'transparent' }}>
                      <span style={{ fontSize: 13, color: theme.text }}>{date} {isDDAlert && <AlertTriangle size={12} style={{ color: '#ef4444', verticalAlign: 'middle', marginLeft: 4 }} />}</span>
                      <span style={{ fontSize: 13, color: theme.textMuted, textAlign: 'right' }}>{data.trades}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: data.pnl >= 0 ? '#10b981' : '#ef4444', textAlign: 'right' }}>
                        {data.pnl >= 0 ? '+' : ''}${data.pnl.toFixed(2)}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: cum >= 0 ? '#10b981' : '#ef4444', textAlign: 'right' }}>
                        {cum >= 0 ? '+' : ''}${cum.toFixed(2)}
                      </span>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      {challenge.status === 'active' && (
        <div style={{ padding: 20, borderTop: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between' }}>
          <button onClick={handleMarkFailed} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', fontSize: 14, color: '#ef4444', cursor: 'pointer' }}>
            <X size={16} />Mark Failed
          </button>
          <div className="flex gap-2">
            {challenge.currentPhase < challenge.phases.length - 1 ? (
              <button onClick={handlePhaseAdvance} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Flag size={16} />Advance to {challenge.phases[challenge.currentPhase + 1]?.name || 'Next Phase'}
              </button>
            ) : (
              <button onClick={handleMarkPassed} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg, #10b981, #34d399)' }}>
                <Trophy size={16} />Mark as Passed
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ==================== NEW CHALLENGE MODAL ====================
function NewChallengeModal({ onClose, onSave, accounts }) {
  const theme = useTheme();
  const [step, setStep] = useState(1);
  const [selectedPreset, setSelectedPreset] = useState('FTMO');
  const [challenge, setChallenge] = useState({
    name: '', propFirm: 'FTMO', accountSize: 100000,
    currentPhase: 0, phases: PROP_FIRM_PRESETS.FTMO.phases,
    account: accounts[0]?.name || '', startDate: new Date().toISOString().split('T')[0],
    status: 'active', profitSplit: 80, drawdownType: 'balance',
    consistencyRule: null, notes: ''
  });

  const handlePresetChange = (preset) => {
    setSelectedPreset(preset);
    const config = PROP_FIRM_PRESETS[preset];
    setChallenge(prev => ({
      ...prev,
      propFirm: config.name,
      phases: JSON.parse(JSON.stringify(config.phases)),
      profitSplit: config.profitSplit,
      consistencyRule: config.consistencyRule
    }));
  };

  const updatePhase = (idx, field, value) => {
    setChallenge(prev => {
      const phases = [...prev.phases];
      phases[idx] = { ...phases[idx], [field]: value };
      return { ...prev, phases };
    });
  };

  const handleSave = () => {
    if (!challenge.name) {
      setChallenge(prev => ({ ...prev, name: `${challenge.propFirm} ${challenge.accountSize / 1000}K Challenge` }));
    }
    onSave({
      ...challenge,
      name: challenge.name || `${challenge.propFirm} ${challenge.accountSize / 1000}K Challenge`
    });
  };

  return (
    <Modal width={560} onClose={onClose}>
      <div style={{ padding: 20, borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: theme.text }}>New Challenge</h3>
          <p style={{ fontSize: 12, color: theme.textFaint }}>Step {step} of 2 — {step === 1 ? 'Prop Firm & Account' : 'Rules & Limits'}</p>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={20} style={{ color: theme.textFaint }} /></button>
      </div>

      <div style={{ padding: 20, maxHeight: '60vh', overflow: 'auto' }} className="scrollbar">
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Prop Firm Preset */}
            <div>
              <label className="label">Prop Firm</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {Object.entries(PROP_FIRM_PRESETS).map(([key, config]) => (
                  <button key={key} onClick={() => handlePresetChange(key)} style={{
                    padding: 14, borderRadius: 10, border: `1px solid ${selectedPreset === key ? '#6366f1' : theme.cardBorder}`,
                    background: selectedPreset === key ? 'rgba(99,102,241,0.1)' : 'transparent', cursor: 'pointer', textAlign: 'center'
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: selectedPreset === key ? '#6366f1' : theme.text }}>{config.name}</div>
                    <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 2 }}>{config.phases.length} phases</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Challenge Name</label>
              <input value={challenge.name} onChange={(e) => setChallenge({ ...challenge, name: e.target.value })} placeholder={`${challenge.propFirm} 100K Challenge`} className="input" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="label">Account Size ($)</label>
                <select value={challenge.accountSize} onChange={(e) => setChallenge({ ...challenge, accountSize: parseInt(e.target.value) })} className="input">
                  {[5000, 10000, 25000, 50000, 100000, 200000, 300000, 400000].map(size => (
                    <option key={size} value={size}>${size.toLocaleString()}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Linked Account</label>
                <select value={challenge.account} onChange={(e) => setChallenge({ ...challenge, account: e.target.value })} className="input">
                  {accounts.length === 0 ? <option>No accounts</option> : accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="label">Start Date</label>
                <input type="date" value={challenge.startDate} onChange={(e) => setChallenge({ ...challenge, startDate: e.target.value })} className="input" />
              </div>
              <div>
                <label className="label">Profit Split (%)</label>
                <input type="number" value={challenge.profitSplit} onChange={(e) => setChallenge({ ...challenge, profitSplit: parseInt(e.target.value) || 80 })} className="input" />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 13, color: theme.textMuted, padding: 12, borderRadius: 8, background: theme.hoverBg }}>
              Configure the rules for each phase. These determine your drawdown limits and profit targets.
            </div>

            {challenge.phases.map((phase, idx) => (
              <div key={idx} style={{ padding: 16, borderRadius: 10, border: `1px solid ${theme.cardBorder}` }}>
                <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: 'white' }}>{idx + 1}</div>
                  <input value={phase.name} onChange={(e) => updatePhase(idx, 'name', e.target.value)} className="input input-sm" style={{ fontWeight: 500 }} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                  <div>
                    <label className="label">Profit Target (%)</label>
                    <input type="number" step="0.5" value={phase.profitTarget || ''} onChange={(e) => updatePhase(idx, 'profitTarget', parseFloat(e.target.value) || null)} placeholder="None" className="input input-sm" />
                  </div>
                  <div>
                    <label className="label">Max Daily DD (%)</label>
                    <input type="number" step="0.5" value={phase.maxDailyDrawdown} onChange={(e) => updatePhase(idx, 'maxDailyDrawdown', parseFloat(e.target.value) || 5)} className="input input-sm" />
                  </div>
                  <div>
                    <label className="label">Max Total DD (%)</label>
                    <input type="number" step="0.5" value={phase.maxTotalDrawdown} onChange={(e) => updatePhase(idx, 'maxTotalDrawdown', parseFloat(e.target.value) || 10)} className="input input-sm" />
                  </div>
                  <div>
                    <label className="label">Min Trading Days</label>
                    <input type="number" value={phase.minTradingDays} onChange={(e) => updatePhase(idx, 'minTradingDays', parseInt(e.target.value) || 0)} className="input input-sm" />
                  </div>
                  <div>
                    <label className="label">Max Calendar Days</label>
                    <input type="number" value={phase.maxTradingDays || ''} onChange={(e) => updatePhase(idx, 'maxTradingDays', parseInt(e.target.value) || null)} placeholder="Unlimited" className="input input-sm" />
                  </div>
                  <div>
                    <label className="label">DD Type</label>
                    <select value={phase.drawdownType || 'balance'} onChange={(e) => updatePhase(idx, 'drawdownType', e.target.value)} className="input input-sm">
                      <option value="balance">Balance-based</option>
                      <option value="equity">Equity-based</option>
                      <option value="trailing">Trailing</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}

            {/* Add/Remove Phase */}
            <div className="flex gap-2">
              <button onClick={() => setChallenge(prev => ({
                ...prev, phases: [...prev.phases, { name: `Phase ${prev.phases.length + 1}`, profitTarget: 5, maxDailyDrawdown: 5, maxTotalDrawdown: 10, minTradingDays: 1, maxTradingDays: 30, drawdownType: 'balance' }]
              }))} style={{ flex: 1, padding: 10, borderRadius: 8, border: `1px dashed ${theme.cardBorder}`, background: 'none', cursor: 'pointer', fontSize: 13, color: theme.textMuted }}>
                + Add Phase
              </button>
              {challenge.phases.length > 1 && (
                <button onClick={() => setChallenge(prev => ({ ...prev, phases: prev.phases.slice(0, -1) }))} style={{ padding: 10, borderRadius: 8, border: `1px dashed ${theme.cardBorder}`, background: 'none', cursor: 'pointer', fontSize: 13, color: '#ef4444' }}>
                  Remove Last
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: 20, borderTop: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={() => step > 1 ? setStep(step - 1) : onClose()} style={{ background: 'none', border: 'none', fontSize: 14, color: theme.textMuted, cursor: 'pointer' }}>
          {step > 1 ? 'Back' : 'Cancel'}
        </button>
        <button onClick={() => step < 2 ? setStep(step + 1) : handleSave()} className="btn-primary">
          {step < 2 ? 'Configure Rules →' : 'Create Challenge'}
        </button>
      </div>
    </Modal>
  );
}

// ==================== REST OF COMPONENTS (unchanged logic, integrated) ====================

function ImportModal({ onClose, onImport, accounts }) {
  const theme = useTheme();
  const fileInputRef = useRef(null);
  const [platform, setPlatform] = useState('MT5');
  const [account, setAccount] = useState(accounts[0]?.name || '');
  const [parsedTrades, setParsedTrades] = useState([]);
  const [phaseSplits, setPhaseSplits] = useState([]);
  const [phaseAccounts, setPhaseAccounts] = useState({}); // { 'Phase 1': 'accountName', 'Phase 2': 'accountName' }
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(''); setParsedTrades([]); setPhaseSplits([]);
    try {
      const text = await file.text();
      let trades = [];
      let splits = [];
      if (file.name.endsWith('.csv')) {
        trades = parseCSV(text, platform);
      } else if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
        if (platform === 'MT5') {
          trades = parseMT5Statement(text);
        } else {
          const result = parseCTraderStatement(text);
          trades = result.trades;
          splits = result.phaseSplits || [];
        }
      } else if (text.includes('<html') || text.includes('<table')) {
        if (platform === 'MT5') {
          trades = parseMT5Statement(text);
        } else {
          const result = parseCTraderStatement(text);
          trades = result.trades;
          splits = result.phaseSplits || [];
        }
      } else {
        trades = parseCSV(text, platform);
      }
      if (trades.length === 0) setError('No trades found. Check the statement format.');
      else {
        setParsedTrades(trades);
        setPhaseSplits(splits);
        // Auto-set default account for each phase
        if (splits.length > 0) {
          const phases = ['Phase 1', ...splits.map(s => s.phaseName)];
          const defaults = {};
          phases.forEach(p => { defaults[p] = accounts[0]?.name || ''; });
          setPhaseAccounts(defaults);
        }
      }
    } catch (err) { setError('Failed to parse: ' + err.message); }
  };

  // Get unique phases from trades
  const detectedPhases = phaseSplits.length > 0 
    ? [...new Set(parsedTrades.map(t => t._phase || 'Phase 1'))]
    : [];

  const handleImport = async () => {
    if (!parsedTrades.length) return;
    setImporting(true); setError('');
    try {
      let totalImported = 0;
      
      if (phaseSplits.length > 0 && detectedPhases.length > 1) {
        // Import each phase to its designated account
        for (const phase of detectedPhases) {
          const phaseTrades = parsedTrades.filter(t => (t._phase || 'Phase 1') === phase);
          const targetAccount = phaseAccounts[phase] || account;
          if (phaseTrades.length > 0 && targetAccount) {
            // Strip _phase from trades before importing
            const cleanTrades = phaseTrades.map(({ _phase, ...rest }) => rest);
            const count = await onImport(cleanTrades, targetAccount);
            totalImported += count;
          }
        }
      } else {
        // Single phase — import all to one account
        const cleanTrades = parsedTrades.map(({ _phase, ...rest }) => rest);
        totalImported = await onImport(cleanTrades, account);
      }
      
      setSuccess(`Imported ${totalImported} trades${detectedPhases.length > 1 ? ` across ${detectedPhases.length} phases` : ''}!`);
      setParsedTrades([]);
      setPhaseSplits([]);
      setTimeout(onClose, 1500);
    } catch (err) { setError('Import failed: ' + err.message); }
    setImporting(false);
  };

  return (
    <Modal width={640} onClose={onClose}>
      <div style={{ padding: 20, borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: theme.text }}>Import Trades</h3>
          <p style={{ fontSize: 12, color: theme.textFaint }}>Import from MT5 or cTrader statement</p>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={20} style={{ color: theme.textFaint }} /></button>
      </div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label className="label">Platform</label>
          <div className="flex gap-2">
            {['MT5', 'cTrader'].map(p => (
              <button key={p} onClick={() => setPlatform(p)} style={{ flex: 1, padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 500, border: `1px solid ${platform === p ? '#6366f1' : theme.cardBorder}`, background: platform === p ? 'rgba(99,102,241,0.1)' : 'transparent', color: platform === p ? '#6366f1' : theme.textMuted, cursor: 'pointer' }}>{p}</button>
            ))}
          </div>
        </div>

        {/* Account selection — show per-phase if phases detected, otherwise single */}
        {phaseSplits.length > 0 && detectedPhases.length > 1 ? (
          <div>
            <label className="label">Import to Accounts (per phase)</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {detectedPhases.map(phase => {
                const phaseTrades = parsedTrades.filter(t => (t._phase || 'Phase 1') === phase);
                const phasePnl = phaseTrades.reduce((s, t) => s + t.pnl, 0);
                return (
                  <div key={phase} style={{ padding: 12, borderRadius: 10, border: `1px solid ${theme.cardBorder}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{phase}</span>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>{phaseTrades.length} trades</span>
                      </div>
                      <div style={{ fontSize: 12, color: phasePnl >= 0 ? '#10b981' : '#ef4444', marginTop: 2 }}>
                        P&L: {phasePnl >= 0 ? '+' : ''}${phasePnl.toFixed(2)}
                      </div>
                    </div>
                    <select value={phaseAccounts[phase] || ''} onChange={(e) => setPhaseAccounts(prev => ({ ...prev, [phase]: e.target.value }))} className="input input-sm" style={{ width: 180 }}>
                      {accounts.length === 0 ? <option>No accounts</option> : accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div>
            <label className="label">Import to Account</label>
            <select value={account} onChange={(e) => setAccount(e.target.value)} className="input">
              {accounts.length === 0 ? <option>No accounts - create one first</option> : accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="label">Statement File</label>
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept=".html,.htm,.csv" style={{ display: 'none' }} />
          <button onClick={() => fileInputRef.current?.click()} style={{ width: '100%', padding: 24, borderRadius: 10, border: `2px dashed ${theme.cardBorder}`, background: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <FileText size={32} style={{ color: theme.textMuted }} />
            <span style={{ fontSize: 14, color: theme.text }}>Click to select file</span>
            <span style={{ fontSize: 12, color: theme.textFaint }}>HTML or CSV from {platform}</span>
          </button>
        </div>

        {/* Phase Detection Banner */}
        {phaseSplits.length > 0 && (
          <div style={{ padding: 14, borderRadius: 10, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <Flag size={18} style={{ color: '#6366f1', marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#6366f1' }}>Phase transition detected</div>
              <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>
                {phaseSplits.map((s, i) => (
                  <div key={i}>→ <strong>{s.phaseName}</strong> starting {s.splitDate} ({s.note})</div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 6 }}>
                Trades will be split and imported to separate accounts per phase. You can assign different accounts above.
              </div>
            </div>
          </div>
        )}

        {error && <div style={{ padding: 12, borderRadius: 10, background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', gap: 8 }}><AlertCircle size={16} style={{ color: '#ef4444' }} /><span style={{ fontSize: 13, color: '#ef4444' }}>{error}</span></div>}
        {success && <div style={{ padding: 12, borderRadius: 10, background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', gap: 8 }}><CheckCircle size={16} style={{ color: '#10b981' }} /><span style={{ fontSize: 13, color: '#10b981' }}>{success}</span></div>}

        {/* Trade Preview — grouped by phase if phases detected */}
        {parsedTrades.length > 0 && (
          <div style={{ borderRadius: 10, border: `1px solid ${theme.cardBorder}`, overflow: 'hidden' }}>
            <div style={{ padding: 12, background: theme.hoverBg, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: theme.text }}>Preview ({parsedTrades.length} trades)</span>
              <span style={{ fontSize: 12, color: parsedTrades.reduce((s, t) => s + t.pnl, 0) >= 0 ? '#10b981' : '#ef4444' }}>Total: ${parsedTrades.reduce((s, t) => s + t.pnl, 0).toFixed(2)}</span>
            </div>
            <div style={{ maxHeight: 240, overflow: 'auto' }} className="scrollbar">
              {detectedPhases.length > 1 ? (
                // Grouped by phase
                detectedPhases.map(phase => {
                  const phaseTrades = parsedTrades.filter(t => (t._phase || 'Phase 1') === phase);
                  const phasePnl = phaseTrades.reduce((s, t) => s + t.pnl, 0);
                  return (
                    <div key={phase}>
                      <div style={{ padding: '8px 10px', background: theme.hoverBg, borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#6366f1' }}>{phase} ({phaseTrades.length} trades)</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: phasePnl >= 0 ? '#10b981' : '#ef4444' }}>{phasePnl >= 0 ? '+' : ''}${phasePnl.toFixed(2)}</span>
                      </div>
                      {phaseTrades.map((t, i) => (
                        <div key={i} style={{ padding: 10, borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                          <div className="flex items-center gap-3">
                            <span style={{ fontWeight: 600, color: theme.text }}>{t.symbol}</span>
                            <span style={{ color: t.side === 'Long' ? '#10b981' : '#ef4444' }}>{t.side}</span>
                            <span style={{ color: theme.textFaint }}>{t.lots} lots</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span style={{ color: theme.textFaint }}>{t.date}</span>
                            <span style={{ fontWeight: 600, color: t.pnl >= 0 ? '#10b981' : '#ef4444' }}>{t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })
              ) : (
                // Flat list
                parsedTrades.map((t, i) => (
                  <div key={i} style={{ padding: 10, borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <div className="flex items-center gap-3">
                      <span style={{ fontWeight: 600, color: theme.text }}>{t.symbol}</span>
                      <span style={{ color: t.side === 'Long' ? '#10b981' : '#ef4444' }}>{t.side}</span>
                      <span style={{ color: theme.textFaint }}>{t.lots} lots</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span style={{ color: theme.textFaint }}>{t.date}</span>
                      <span style={{ fontWeight: 600, color: t.pnl >= 0 ? '#10b981' : '#ef4444' }}>{t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
      <div style={{ padding: 20, borderTop: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 14, color: theme.textMuted, cursor: 'pointer' }}>Cancel</button>
        <button onClick={handleImport} disabled={!parsedTrades.length || importing || !accounts.length} className="btn-primary" style={{ opacity: (!parsedTrades.length || importing || !accounts.length) ? 0.5 : 1 }}>
          {importing ? 'Importing...' : `Import ${parsedTrades.length} Trades`}
        </button>
      </div>
    </Modal>
  );
}

// ==================== JOURNAL IDEAS VIEW ====================
const TIMEFRAMES = ['Daily', 'Weekly', 'Monthly'];
const BIAS_OPTIONS = ['Bullish', 'Bearish', 'Neutral', 'No Trade'];
const BIAS_COLORS = { Bullish: '#10b981', Bearish: '#ef4444', Neutral: '#8b5cf6', 'No Trade': '#64748b' };
const COMMON_INSTRUMENTS = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'GBPJPY', 'EURJPY', 'NAS100', 'US30', 'AUDUSD', 'USDCAD'];

function JournalIdeasView({ entries, onAdd, onUpdate, onDelete, autoNew }) {
  const theme = useTheme();
  const [showNew, setShowNew] = useState(autoNew || false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [filterInstrument, setFilterInstrument] = useState('all');
  const [filterTimeframe, setFilterTimeframe] = useState('all');
  const [filterBias, setFilterBias] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Listen for header "New Entry" button click
  useEffect(() => {
    const handler = () => setShowNew(true);
    window.addEventListener('ellipse-new-journal', handler);
    return () => window.removeEventListener('ellipse-new-journal', handler);
  }, []);

  // Quick date presets
  const setDatePreset = (preset) => {
    const today = new Date();
    const fmt = (d) => d.toISOString().split('T')[0];
    setDateTo(fmt(today));
    if (preset === 'today') setDateFrom(fmt(today));
    else if (preset === 'week') { const d = new Date(today); d.setDate(d.getDate() - 7); setDateFrom(fmt(d)); }
    else if (preset === 'month') { const d = new Date(today); d.setMonth(d.getMonth() - 1); setDateFrom(fmt(d)); }
    else if (preset === 'all') { setDateFrom(''); setDateTo(''); }
  };

  const instruments = [...new Set(entries.map(e => e.instrument).filter(Boolean))];

  const filtered = entries.filter(e => {
    if (filterInstrument !== 'all' && e.instrument !== filterInstrument) return false;
    if (filterTimeframe !== 'all' && e.timeframe !== filterTimeframe) return false;
    if (filterBias !== 'all' && e.bias !== filterBias) return false;
    const eDate = e.date || e.createdAt?.split('T')[0] || '';
    if (dateFrom && eDate < dateFrom) return false;
    if (dateTo && eDate > dateTo) return false;
    return true;
  });

  const groupedByDate = {};
  filtered.forEach(e => {
    const date = e.date || e.createdAt?.split('T')[0] || 'Unknown';
    if (!groupedByDate[date]) groupedByDate[date] = [];
    groupedByDate[date].push(e);
  });
  const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Filters Row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <select value={filterInstrument} onChange={e => setFilterInstrument(e.target.value)} className="input input-sm" style={{ width: 150 }}>
          <option value="all">All Instruments</option>
          {instruments.map(ins => <option key={ins} value={ins}>{ins}</option>)}
        </select>

        {/* Timeframe toggle */}
        <div className="flex" style={{ background: theme.hoverBg, borderRadius: 8, padding: 3 }}>
          {['all', ...TIMEFRAMES].map(tf => (
            <button key={tf} onClick={() => setFilterTimeframe(tf)} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, background: filterTimeframe === tf ? theme.card : 'transparent', color: filterTimeframe === tf ? theme.text : theme.textMuted, boxShadow: filterTimeframe === tf ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
              {tf === 'all' ? 'All' : tf}
            </button>
          ))}
        </div>

        {/* Bias filter */}
        <div className="flex" style={{ background: theme.hoverBg, borderRadius: 8, padding: 3 }}>
          <button onClick={() => setFilterBias('all')} style={{ padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, background: filterBias === 'all' ? theme.card : 'transparent', color: filterBias === 'all' ? theme.text : theme.textMuted, boxShadow: filterBias === 'all' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>All</button>
          {BIAS_OPTIONS.map(b => (
            <button key={b} onClick={() => setFilterBias(b)} style={{ padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, background: filterBias === b ? theme.card : 'transparent', color: filterBias === b ? BIAS_COLORS[b] : theme.textMuted, boxShadow: filterBias === b ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
              {b === 'No Trade' ? 'NT' : b.slice(0, 4)}
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Date range */}
        <div className="flex items-center gap-2">
          <div className="flex" style={{ background: theme.hoverBg, borderRadius: 8, padding: 3 }}>
            {[{ key: 'today', label: 'Today' }, { key: 'week', label: '7D' }, { key: 'month', label: '30D' }, { key: 'all', label: 'All' }].map(p => (
              <button key={p.key} onClick={() => setDatePreset(p.key)} style={{ padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 500, background: 'transparent', color: theme.textMuted }}>{p.label}</button>
            ))}
          </div>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input input-sm" style={{ width: 130, fontSize: 12 }} />
          <span style={{ fontSize: 12, color: theme.textFaint }}>→</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input input-sm" style={{ width: 130, fontSize: 12 }} />
        </div>
      </div>

      {/* Results count */}
      <div style={{ fontSize: 12, color: theme.textFaint }}>
        {filtered.length} entr{filtered.length === 1 ? 'y' : 'ies'}{(filterInstrument !== 'all' || filterTimeframe !== 'all' || filterBias !== 'all' || dateFrom || dateTo) ? ' (filtered)' : ''}
      </div>

      {/* New Entry Form */}
      {showNew && <JournalEntryForm onSave={(entry) => { onAdd(entry); setShowNew(false); }} onCancel={() => setShowNew(false)} />}

      {/* Editing Entry */}
      {editingEntry && <JournalEntryForm entry={editingEntry} onSave={(entry) => { onUpdate(entry); setEditingEntry(null); }} onCancel={() => setEditingEntry(null)} />}

      {/* Empty state */}
      {!showNew && !editingEntry && filtered.length === 0 && (
        <div className="card-lg" style={{ padding: 60, textAlign: 'center' }}>
          <BookOpen size={44} style={{ color: theme.textFaint, margin: '0 auto 12px', opacity: 0.4 }} />
          <p style={{ fontSize: 15, fontWeight: 500, color: theme.textMuted }}>
            {entries.length === 0 ? 'No journal entries yet' : 'No entries match your filters'}
          </p>
          <p style={{ fontSize: 13, color: theme.textFaint, marginTop: 4 }}>
            {entries.length === 0 ? 'Record your trade ideas, market bias, and analysis' : 'Try adjusting your date range or filters'}
          </p>
        </div>
      )}

      {/* Entries grouped by date */}
      {!showNew && !editingEntry && sortedDates.map(date => (
        <div key={date}>
          <div style={{ fontSize: 12, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
            {new Date(date + 'T00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {groupedByDate[date].map(entry => (
              <div key={entry.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {/* Bias color bar on left */}
                <div style={{ display: 'flex' }}>
                  <div style={{ width: 4, background: BIAS_COLORS[entry.bias] || theme.cardBorder, flexShrink: 0 }} />
                  <div style={{ flex: 1, padding: 16 }}>
                    <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                      <div className="flex items-center gap-3">
                        <span style={{ fontSize: 15, fontWeight: 600, color: theme.text }}>{entry.instrument}</span>
                        <span className="badge" style={{ background: BIAS_COLORS[entry.bias] + '20', color: BIAS_COLORS[entry.bias] }}>{entry.bias}</span>
                        <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6, background: theme.hoverBg, color: theme.textMuted, fontWeight: 500 }}>{entry.timeframe}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setEditingEntry(entry)} style={{ padding: 6, borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer' }}><Edit3 size={14} style={{ color: theme.textFaint }} /></button>
                        <button onClick={() => { if (window.confirm('Delete this entry?')) onDelete(entry.id); }} style={{ padding: 6, borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={14} style={{ color: theme.textFaint }} /></button>
                      </div>
                    </div>

                    {/* Trade Idea */}
                    {entry.idea && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4 }}>Trade Idea</div>
                        <p style={{ fontSize: 14, color: theme.text, lineHeight: 1.5 }}>{entry.idea}</p>
                      </div>
                    )}

                    {/* Key Levels */}
                    {entry.keyLevels && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4 }}>Key Levels</div>
                        <p style={{ fontSize: 13, color: theme.textMuted, lineHeight: 1.5 }}>{entry.keyLevels}</p>
                      </div>
                    )}

                    {/* Confluences as tags */}
                    {entry.confluences && entry.confluences.length > 0 && (
                      <div className="flex flex-wrap gap-2" style={{ marginBottom: 10 }}>
                        {entry.confluences.map((c, i) => (
                          <span key={i} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: 'rgba(99,102,241,0.1)', color: '#6366f1', fontWeight: 500 }}>{c}</span>
                        ))}
                      </div>
                    )}

                    {/* Notes */}
                    {entry.notes && (
                      <p style={{ fontSize: 13, color: theme.textFaint, lineHeight: 1.5, fontStyle: 'italic' }}>{entry.notes}</p>
                    )}

                    {/* Chart reference */}
                    {entry.chartImage && (
                      <div style={{ marginTop: 10, borderRadius: 8, overflow: 'hidden', maxHeight: 200 }}>
                        <img src={entry.chartImage} alt="" style={{ width: '100%', objectFit: 'cover' }} onError={e => e.target.style.display = 'none'} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ==================== JOURNAL ENTRY FORM ====================
const CONFLUENCE_OPTIONS = ['FVG', 'Order Block', 'Liquidity Sweep', 'BOS/CHoCH', 'Supply Zone', 'Demand Zone', 'EQL/EQH', 'Inducement', 'Displacement', 'Session Open', 'Killzone'];

function JournalEntryForm({ entry, onSave, onCancel }) {
  const theme = useTheme();
  const [form, setForm] = useState({
    date: entry?.date || new Date().toISOString().split('T')[0],
    instrument: entry?.instrument || '',
    timeframe: entry?.timeframe || 'Daily',
    bias: entry?.bias || 'Bullish',
    idea: entry?.idea || '',
    keyLevels: entry?.keyLevels || '',
    confluences: entry?.confluences || [],
    notes: entry?.notes || '',
    chartImage: entry?.chartImage || '',
    ...(entry?.id ? { id: entry.id } : {})
  });

  const toggleConfluence = (c) => {
    setForm(prev => ({ ...prev, confluences: prev.confluences.includes(c) ? prev.confluences.filter(x => x !== c) : [...prev.confluences, c] }));
  };

  const handleSave = () => {
    if (!form.instrument) return;
    onSave(form);
  };

  return (
    <div className="card-lg" style={{ padding: 20 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: theme.text }}>{entry ? 'Edit Entry' : 'New Journal Entry'}</h3>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} style={{ color: theme.textFaint }} /></button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Row 1: Date, Instrument, Timeframe */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <label className="label">Date</label>
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Instrument</label>
            <input value={form.instrument} onChange={e => setForm({ ...form, instrument: e.target.value.toUpperCase() })} placeholder="EURUSD" className="input" list="instrument-list" />
            <datalist id="instrument-list">{COMMON_INSTRUMENTS.map(ins => <option key={ins} value={ins} />)}</datalist>
          </div>
          <div>
            <label className="label">Timeframe</label>
            <div className="flex gap-2">
              {TIMEFRAMES.map(tf => (
                <button key={tf} onClick={() => setForm({ ...form, timeframe: tf })} style={{ flex: 1, padding: 10, borderRadius: 8, fontSize: 12, fontWeight: 500, border: `1px solid ${form.timeframe === tf ? '#6366f1' : theme.cardBorder}`, background: form.timeframe === tf ? 'rgba(99,102,241,0.1)' : 'transparent', color: form.timeframe === tf ? '#6366f1' : theme.textMuted, cursor: 'pointer' }}>{tf}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Row 2: Bias */}
        <div>
          <label className="label">Bias</label>
          <div className="flex gap-2">
            {BIAS_OPTIONS.map(b => (
              <button key={b} onClick={() => setForm({ ...form, bias: b })} style={{ flex: 1, padding: 12, borderRadius: 10, fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer', background: form.bias === b ? BIAS_COLORS[b] : theme.hoverBg, color: form.bias === b ? 'white' : theme.textMuted, transition: 'all 0.15s' }}>{b}</button>
            ))}
          </div>
        </div>

        {/* Row 3: Trade Idea */}
        <div>
          <label className="label">Trade Idea</label>
          <textarea value={form.idea} onChange={e => setForm({ ...form, idea: e.target.value })} rows={3} className="input" placeholder="Describe your trade setup, narrative, or thesis..." style={{ resize: 'none' }} />
        </div>

        {/* Row 4: Key Levels */}
        <div>
          <label className="label">Key Levels / POIs</label>
          <textarea value={form.keyLevels} onChange={e => setForm({ ...form, keyLevels: e.target.value })} rows={2} className="input" placeholder="e.g. PDH: 1.0850, PDL: 1.0780, FVG @ 1.0820..." style={{ resize: 'none' }} />
        </div>

        {/* Row 5: Confluences */}
        <div>
          <label className="label">Confluences</label>
          <div className="flex flex-wrap gap-2">
            {CONFLUENCE_OPTIONS.map(c => (
              <button key={c} onClick={() => toggleConfluence(c)} style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer', background: form.confluences.includes(c) ? '#6366f1' : theme.hoverBg, color: form.confluences.includes(c) ? 'white' : theme.textMuted, transition: 'all 0.15s' }}>{c}</button>
            ))}
          </div>
        </div>

        {/* Row 6: Chart Image */}
        <div>
          <label className="label">Chart Screenshot URL</label>
          <input value={form.chartImage} onChange={e => setForm({ ...form, chartImage: e.target.value })} placeholder="https://www.tradingview.com/x/... or image URL" className="input" />
          {form.chartImage && getTradingViewImageUrl(form.chartImage) && (
            <div style={{ marginTop: 8, borderRadius: 8, overflow: 'hidden', maxHeight: 150, border: `1px solid ${theme.cardBorder}` }}>
              <img src={getTradingViewImageUrl(form.chartImage)} alt="" style={{ width: '100%', objectFit: 'cover' }} onError={e => e.target.style.display = 'none'} />
            </div>
          )}
        </div>

        {/* Row 7: Additional Notes */}
        <div>
          <label className="label">Additional Notes</label>
          <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="input" placeholder="Session notes, psychology, risk management thoughts..." style={{ resize: 'none' }} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3" style={{ marginTop: 20 }}>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', fontSize: 14, color: theme.textMuted, cursor: 'pointer' }}>Cancel</button>
        <button onClick={handleSave} className="btn-primary" style={{ opacity: form.instrument ? 1 : 0.5 }} disabled={!form.instrument}>
          {entry ? 'Save Changes' : 'Save Entry'}
        </button>
      </div>
    </div>
  );
}

// ==================== NEWS / ECONOMIC CALENDAR VIEW ====================
const IMPACT_COLORS = { High: '#ef4444', Medium: '#f59e0b', Low: '#6366f1', Holiday: '#64748b' };
const NEWS_CURRENCIES = ['All', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'];

function NewsCalendarView() {
  const theme = useTheme();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCurrencies, setSelectedCurrencies] = useState(new Set()); // empty = All
  const [filterImpact, setFilterImpact] = useState('All');
  const [viewMode, setViewMode] = useState('week');
  const [lastFetched, setLastFetched] = useState(null);

  // Preset currency groups
  const CURRENCY_GROUPS = {
    'All': [],
    'Majors': ['USD', 'EUR', 'GBP', 'JPY'],
    'Commodity': ['AUD', 'CAD', 'NZD'],
    'USD Pairs': ['USD'],
    'JPY Pairs': ['JPY', 'USD'],
    'EUR Pairs': ['EUR', 'USD'],
    'GBP Pairs': ['GBP', 'USD'],
  };

  const toggleCurrency = (ccy) => {
    setSelectedCurrencies(prev => {
      const next = new Set(prev);
      if (next.has(ccy)) next.delete(ccy); else next.add(ccy);
      return next;
    });
  };

  const applyGroup = (groupName) => {
    const currencies = CURRENCY_GROUPS[groupName];
    if (!currencies || currencies.length === 0) {
      setSelectedCurrencies(new Set()); // All
    } else {
      setSelectedCurrencies(new Set(currencies));
    }
  };

  useEffect(() => {
    loadEvents(viewMode);
  }, [viewMode]);

  const loadEvents = async (mode) => {
    const cacheKey = `ellipse_news_${mode}`;
    const cacheTimeKey = `ellipse_news_${mode}_time`;
    const cached = localStorage.getItem(cacheKey);
    const cachedTime = localStorage.getItem(cacheTimeKey);
    const now = Date.now();
    
    // Use cache if less than 4 hours old
    if (cached && cachedTime && (now - parseInt(cachedTime)) < 4 * 60 * 60 * 1000) {
      try {
        setEvents(JSON.parse(cached));
        setLastFetched(new Date(parseInt(cachedTime)));
        setLoading(false);
        return;
      } catch {}
    }

    setLoading(true);
    setError('');

    const normalize = (data) => (Array.isArray(data) ? data : []).map(e => ({
      title: e.title || e.event || e.name || '',
      country: e.country || e.currency || '',
      date: e.date || '',
      impact: e.impact || e.importance || 'Low',
      forecast: e.forecast ?? '',
      previous: e.previous ?? '',
      actual: e.actual ?? '',
    }));

    // Try multiple sources in order
    const sources = [
      // 1. Supabase Edge Function proxy (if you deploy it)
      `https://ksbhbhjnrrkcnunehksx.supabase.co/functions/v1/forex-calendar`,
      // 2. Direct Forex Factory CDN (may work in some environments)
      'https://cdn-nfs.faireconomy.media/ff_calendar_thisweek.json',
      // 3. Non-CDN variant
      'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
    ];

    for (const url of sources) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) continue;
        const contentType = res.headers.get('content-type') || '';
        // Skip if we got an HTML error page instead of JSON
        if (contentType.includes('html')) continue;
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) continue;

        const normalized = normalize(data);
        setEvents(normalized);
        setLastFetched(new Date());
        localStorage.setItem(cacheKey, JSON.stringify(normalized));
        localStorage.setItem(cacheTimeKey, now.toString());
        setLoading(false);
        return; // success
      } catch (err) {
        console.warn(`News source failed (${url}):`, err.message);
        continue;
      }
    }

    // All sources failed
    setError('Unable to load economic calendar. You may need to deploy the Supabase Edge Function proxy (see docs).');
    setLoading(false);
  };

  // Filter events
  const today = new Date().toISOString().split('T')[0];
  const filtered = events.filter(e => {
    if (selectedCurrencies.size > 0 && !selectedCurrencies.has(e.country)) return false;
    if (filterImpact !== 'All' && e.impact !== filterImpact) return false;
    if (viewMode === 'today') {
      const eventDate = e.date ? new Date(e.date).toISOString().split('T')[0] : '';
      if (eventDate !== today) return false;
    }
    return true;
  });

  // Group by date
  const groupedByDate = {};
  filtered.forEach(e => {
    const d = e.date ? new Date(e.date) : null;
    const dateKey = d ? d.toISOString().split('T')[0] : 'Unknown';
    if (!groupedByDate[dateKey]) groupedByDate[dateKey] = [];
    groupedByDate[dateKey].push(e);
  });
  const sortedDates = Object.keys(groupedByDate).sort();

  // Count high impact today
  const highImpactToday = events.filter(e => {
    const ed = e.date ? new Date(e.date).toISOString().split('T')[0] : '';
    return ed === today && e.impact === 'High';
  }).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Filter Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Row 1: View mode + Impact + Status */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          {/* View mode toggle */}
          <div className="flex" style={{ background: theme.hoverBg, borderRadius: 8, padding: 3 }}>
            {['today', 'week'].map(m => (
              <button key={m} onClick={() => setViewMode(m)} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, background: viewMode === m ? theme.card : 'transparent', color: viewMode === m ? theme.text : theme.textMuted, boxShadow: viewMode === m ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                {m === 'today' ? 'Today' : 'This Week'}
              </button>
            ))}
          </div>

          {/* Impact filter */}
          <div className="flex" style={{ background: theme.hoverBg, borderRadius: 8, padding: 3 }}>
            {['All', 'High', 'Medium', 'Low'].map(imp => (
              <button key={imp} onClick={() => setFilterImpact(imp)} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 500, background: filterImpact === imp ? theme.card : 'transparent', color: filterImpact === imp ? (IMPACT_COLORS[imp] || theme.text) : theme.textMuted, boxShadow: filterImpact === imp ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                {imp}
              </button>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          {/* Status */}
          <div style={{ fontSize: 11, color: theme.textFaint }}>
            {highImpactToday > 0 && <span style={{ color: '#ef4444', fontWeight: 600, marginRight: 8 }}>🔴 {highImpactToday} high-impact today</span>}
            {lastFetched && <span>Updated {lastFetched.toLocaleTimeString()}</span>}
          </div>

          <button onClick={() => { localStorage.removeItem(`ellipse_news_${viewMode}`); localStorage.removeItem(`ellipse_news_${viewMode}_time`); loadEvents(viewMode); }} style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${theme.cardBorder}`, background: 'none', fontSize: 12, color: theme.textMuted, cursor: 'pointer' }}>
            Refresh
          </button>
        </div>

        {/* Row 2: Currency Groups + Individual Currencies */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          {/* Group presets */}
          <span style={{ fontSize: 11, color: theme.textFaint, marginRight: 2 }}>Groups:</span>
          <div className="flex" style={{ background: theme.hoverBg, borderRadius: 8, padding: 3 }}>
            {Object.keys(CURRENCY_GROUPS).map(group => {
              const groupCcys = CURRENCY_GROUPS[group];
              const isActive = group === 'All'
                ? selectedCurrencies.size === 0
                : groupCcys.length > 0 && groupCcys.every(c => selectedCurrencies.has(c)) && selectedCurrencies.size === groupCcys.length;
              return (
                <button key={group} onClick={() => applyGroup(group)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 500, background: isActive ? '#6366f1' : 'transparent', color: isActive ? 'white' : theme.textMuted }}>
                  {group}
                </button>
              );
            })}
          </div>

          <div style={{ width: 1, height: 20, background: theme.cardBorder, margin: '0 4px' }} />

          {/* Individual currency toggles */}
          <span style={{ fontSize: 11, color: theme.textFaint, marginRight: 2 }}>Currencies:</span>
          {NEWS_CURRENCIES.filter(c => c !== 'All').map(ccy => {
            const isSelected = selectedCurrencies.has(ccy);
            return (
              <button key={ccy} onClick={() => toggleCurrency(ccy)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: `1px solid ${isSelected ? '#6366f1' : theme.cardBorder}`, background: isSelected ? 'rgba(99,102,241,0.15)' : 'transparent', color: isSelected ? '#6366f1' : theme.textMuted, cursor: 'pointer', transition: 'all 0.15s' }}>
                {ccy}
              </button>
            );
          })}

          {selectedCurrencies.size > 0 && (
            <button onClick={() => setSelectedCurrencies(new Set())} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer', fontSize: 11, color: theme.textFaint, textDecoration: 'underline' }}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Loader2 size={28} style={{ color: theme.textMuted, animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 13, color: theme.textFaint }}>Loading economic calendar...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: 16, borderRadius: 10, background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={16} style={{ color: '#ef4444' }} />
          <span style={{ fontSize: 13, color: '#ef4444' }}>{error}</span>
        </div>
      )}

      {/* Events grouped by date */}
      {!loading && !error && filtered.length === 0 && (
        <div className="card-lg" style={{ padding: 60, textAlign: 'center' }}>
          <Zap size={40} style={{ color: theme.textFaint, margin: '0 auto 12px', opacity: 0.4 }} />
          <p style={{ fontSize: 14, color: theme.textMuted }}>No events match your filters</p>
        </div>
      )}

      {!loading && sortedDates.map(dateKey => {
        const isToday = dateKey === today;
        const dayEvents = groupedByDate[dateKey];
        const highCount = dayEvents.filter(e => e.impact === 'High').length;
        return (
          <div key={dateKey}>
            <div className="flex items-center gap-3" style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: isToday ? '#6366f1' : theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {isToday ? '📍 Today — ' : ''}{new Date(dateKey + 'T00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </span>
              {highCount > 0 && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 600 }}>{highCount} high impact</span>}
              <span style={{ fontSize: 11, color: theme.textFaint }}>{dayEvents.length} events</span>
            </div>

            <div className="card-lg" style={{ overflow: 'hidden' }}>
              {/* Table header */}
              <div style={{ display: 'grid', gridTemplateColumns: '70px 50px 60px 1fr 80px 80px 80px', gap: 8, padding: '10px 16px', background: theme.hoverBg, borderBottom: `1px solid ${theme.cardBorder}` }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: theme.textFaint, textTransform: 'uppercase' }}>Time</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: theme.textFaint, textTransform: 'uppercase' }}>Ccy</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: theme.textFaint, textTransform: 'uppercase' }}>Impact</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: theme.textFaint, textTransform: 'uppercase' }}>Event</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: theme.textFaint, textTransform: 'uppercase', textAlign: 'right' }}>Forecast</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: theme.textFaint, textTransform: 'uppercase', textAlign: 'right' }}>Previous</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: theme.textFaint, textTransform: 'uppercase', textAlign: 'right' }}>Actual</span>
              </div>

              {dayEvents.map((event, i) => {
                const eventTime = event.date ? new Date(event.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '--:--';
                const impactColor = IMPACT_COLORS[event.impact] || theme.textFaint;
                const isHigh = event.impact === 'High';
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px 50px 60px 1fr 80px 80px 80px', gap: 8, padding: '12px 16px', borderBottom: `1px solid ${theme.cardBorder}`, background: isHigh ? (theme.dark ? 'rgba(239,68,68,0.05)' : 'rgba(239,68,68,0.03)') : 'transparent' }}>
                    <span style={{ fontSize: 13, color: theme.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{eventTime}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>{event.country}</span>
                    <div className="flex items-center gap-1">
                      <div style={{ width: 8, height: 8, borderRadius: 4, background: impactColor }} />
                      <span style={{ fontSize: 11, color: impactColor, fontWeight: 500 }}>{event.impact}</span>
                    </div>
                    <span style={{ fontSize: 13, color: theme.text, fontWeight: isHigh ? 600 : 400 }}>{event.title}</span>
                    <span style={{ fontSize: 13, color: theme.textMuted, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{event.forecast || '—'}</span>
                    <span style={{ fontSize: 13, color: theme.textMuted, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{event.previous || '—'}</span>
                    <span style={{ fontSize: 13, fontWeight: event.actual ? 600 : 400, color: event.actual ? theme.text : theme.textFaint, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{event.actual || '—'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ==================== TRADE HISTORY VIEW (formerly Journal) ====================
function JournalView({ trades, accounts, filterAccount, setFilterAccount, onSelectTrade, onDeleteTrades }) {
  const theme = useTheme();
  const [viewMode, setViewMode] = useState('list');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const filtered = filterAccount === 'all' ? trades : trades.filter(t => t.account === filterAccount);

  const toggleSelect = (id, e) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(t => t.id)));
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} trade${selectedIds.size > 1 ? 's' : ''}? This cannot be undone.`)) return;
    await onDeleteTrades([...selectedIds]);
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <select value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)} className="input input-sm" style={{ width: 200 }}>
            <option value="all">All Accounts</option>
            {accounts.map(acc => <option key={acc.id} value={acc.name}>{acc.name}</option>)}
          </select>
          {!selectMode ? (
            <button onClick={() => setSelectMode(true)} style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${theme.cardBorder}`, background: 'none', fontSize: 12, color: theme.textMuted, cursor: 'pointer' }}>Select</button>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={selectAll} style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${theme.cardBorder}`, background: 'none', fontSize: 12, color: theme.textMuted, cursor: 'pointer' }}>
                {selectedIds.size === filtered.length ? 'Deselect All' : 'Select All'}
              </button>
              {selectedIds.size > 0 && (
                <button onClick={handleBulkDelete} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#ef4444', fontSize: 12, fontWeight: 500, color: 'white', cursor: 'pointer' }}>
                  Delete {selectedIds.size}
                </button>
              )}
              <button onClick={exitSelectMode} style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${theme.cardBorder}`, background: 'none', fontSize: 12, color: theme.textMuted, cursor: 'pointer' }}>Cancel</button>
              <span style={{ fontSize: 12, color: theme.textFaint }}>{selectedIds.size} selected</span>
            </div>
          )}
        </div>
        <div className="flex" style={{ background: theme.hoverBg, borderRadius: 8, padding: 4 }}>
          <button onClick={() => setViewMode('list')} style={{ padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: viewMode === 'list' ? theme.card : 'transparent', boxShadow: viewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
            <LayoutList size={18} style={{ color: viewMode === 'list' ? theme.text : theme.textMuted }} />
          </button>
          <button onClick={() => setViewMode('grid')} style={{ padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: viewMode === 'grid' ? theme.card : 'transparent', boxShadow: viewMode === 'grid' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
            <LayoutGrid size={18} style={{ color: viewMode === 'grid' ? theme.text : theme.textMuted }} />
          </button>
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
          <div className="table-header" style={{ display: 'grid', gridTemplateColumns: selectMode ? '36px 1.5fr 80px 100px 80px 100px' : '1.5fr 80px 100px 80px 100px 50px', gap: 12 }}>
            {selectMode && <div></div>}
            <div>Trade</div><div>Side</div><div>Structure</div><div>Lots</div><div style={{ textAlign: 'right' }}>P&L</div>{!selectMode && <div></div>}
          </div>
          {filtered.map(trade => {
            const chartImg = getTradingViewImageUrl(trade.chartLink) || trade.chartImage;
            const isSelected = selectedIds.has(trade.id);
            return (
              <div key={trade.id} onClick={() => selectMode ? toggleSelect(trade.id, { stopPropagation: () => {} }) : onSelectTrade(trade)} className="table-row" style={{ display: 'grid', gridTemplateColumns: selectMode ? '36px 1.5fr 80px 100px 80px 100px' : '1.5fr 80px 100px 80px 100px 50px', gap: 12, alignItems: 'center', background: isSelected ? (theme.dark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.08)') : undefined }}>
                {selectMode && (
                  <div onClick={(e) => toggleSelect(trade.id, e)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${isSelected ? '#6366f1' : theme.cardBorder}`, background: isSelected ? '#6366f1' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
                      {isSelected && <CheckCircle size={14} style={{ color: 'white' }} />}
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  {chartImg ? (
                    <div style={{ width: 48, height: 36, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: theme.hoverBg }}>
                      <img src={chartImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => e.target.style.display = 'none'} />
                    </div>
                  ) : (
                    <div style={{ width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, background: trade.pnl >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: trade.pnl >= 0 ? '#10b981' : '#ef4444' }}>{trade.symbol?.slice(0, 2)}</div>
                  )}
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: theme.text }}>{trade.symbol}</div>
                    <div style={{ fontSize: 12, color: theme.textFaint }}>{trade.date}</div>
                  </div>
                </div>
                <span className="badge" style={{ background: trade.side === 'Long' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: trade.side === 'Long' ? '#10b981' : '#ef4444' }}>{trade.side}</span>
                <span className="badge" style={{ background: MARKET_STRUCTURES[trade.marketStructure]?.color, color: 'white' }}>{trade.marketStructure?.replace('_', ' ').slice(0, 8)}</span>
                <span style={{ fontSize: 14, color: theme.text }}>{trade.lots}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: trade.pnl >= 0 ? '#10b981' : '#ef4444', textAlign: 'right' }}>{trade.pnl >= 0 ? '+' : ''}${trade.pnl?.toFixed(2)}</span>
                {!selectMode && <Eye size={16} style={{ color: theme.textFaint }} />}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {filtered.map(trade => {
            const chartImg = getTradingViewImageUrl(trade.chartLink) || trade.chartImage;
            const isSelected = selectedIds.has(trade.id);
            return (
              <div key={trade.id} onClick={() => selectMode ? toggleSelect(trade.id, { stopPropagation: () => {} }) : onSelectTrade(trade)} className="card" style={{ cursor: 'pointer', overflow: 'hidden', transition: 'transform 0.15s, box-shadow 0.15s', outline: isSelected ? '2px solid #6366f1' : 'none' }}
                onMouseEnter={(e) => { if (!selectMode) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'; } }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
                {selectMode && (
                  <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 2, width: 22, height: 22, borderRadius: 6, border: `2px solid ${isSelected ? '#6366f1' : 'rgba(255,255,255,0.5)'}`, background: isSelected ? '#6366f1' : 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isSelected && <CheckCircle size={14} style={{ color: 'white' }} />}
                  </div>
                )}
                {chartImg ? (
                  <div style={{ width: '100%', height: 140, background: theme.hoverBg, position: 'relative' }}>
                    <img src={chartImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => e.target.parentElement.style.display = 'none'} />
                  </div>
                ) : (
                  <div style={{ width: '100%', height: 80, background: trade.pnl >= 0 ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    <span style={{ fontSize: 28, fontWeight: 700, color: trade.pnl >= 0 ? '#10b981' : '#ef4444', opacity: 0.3 }}>{trade.symbol}</span>
                  </div>
                )}
                <div style={{ padding: 16 }}>
                  <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: theme.text }}>{trade.symbol}</div>
                      <div style={{ fontSize: 12, color: theme.textFaint }}>{trade.date} · {trade.time}</div>
                    </div>
                    <span style={{ fontSize: 18, fontWeight: 700, color: trade.pnl >= 0 ? '#10b981' : '#ef4444' }}>{trade.pnl >= 0 ? '+' : ''}${trade.pnl?.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                    <span className="badge" style={{ background: trade.side === 'Long' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: trade.side === 'Long' ? '#10b981' : '#ef4444' }}>{trade.side}</span>
                    <span className="badge" style={{ background: MARKET_STRUCTURES[trade.marketStructure]?.color, color: 'white' }}>{MARKET_STRUCTURES[trade.marketStructure]?.label?.split(' ')[0]}</span>
                    <span style={{ fontSize: 12, color: theme.textMuted }}>{trade.lots} lots</span>
                  </div>
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

function DashboardView({ trades, accounts, challenges, selectedAccount, setSelectedAccount }) {
  const theme = useTheme();
  const [dashboardMonth, setDashboardMonth] = useState(new Date());
  const filtered = selectedAccount === 'all' ? trades : trades.filter(t => t.account === selectedAccount);
  
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

  // Ellipse Score
  const winRateScore = Math.min(winRate / 60 * 33, 33);
  const ratioScore = Math.min(avgWinLossRatio / 2 * 33, 33);
  const pfScore = Math.min(profitFactor / 2 * 34, 34);
  const ellipseScore = totalTrades >= 5 ? winRateScore + ratioScore + pfScore : 0;

  // Monthly calendar
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

  // Chart data
  const dailyPnlData = [];
  const uniqueDates = [...new Set(filtered.map(t => t.date))].sort().slice(-14);
  uniqueDates.forEach(date => {
    const dayTrades = filtered.filter(t => t.date === date);
    dailyPnlData.push({ date: date.slice(5), pnl: dayTrades.reduce((s, t) => s + t.pnl, 0) });
  });

  let cumulative = 0;
  const cumulativePnlData = [];
  const dateGroups = {};
  [...filtered].sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(t => {
    if (!dateGroups[t.date]) dateGroups[t.date] = 0;
    dateGroups[t.date] += t.pnl;
  });
  Object.entries(dateGroups).slice(-14).forEach(([date, pnl]) => {
    cumulative += pnl;
    cumulativePnlData.push({ date: date.slice(5), pnl: cumulative });
  });

  const sortedTrades = [...filtered].sort((a, b) => new Date(b.date + ' ' + b.time) - new Date(a.date + ' ' + a.time));
  const recentTrades = sortedTrades.slice(0, 5);

  // Active challenges summary
  const activeChallenges = challenges.filter(c => c.status === 'active');

  const DonutChart = ({ value, size = 60, strokeWidth = 6, color = '#10b981' }) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (value / 100) * circumference;
    return (
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={theme.hoverBg} strokeWidth={strokeWidth} />
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
    );
  };

  const RadarChart = ({ winRate: wr, avgRatio, pf, size = 180 }) => {
    const center = size / 2;
    const maxRadius = size * 0.38;
    const wrNorm = Math.min(wr / 70, 1);
    const ratioNorm = Math.min(avgRatio / 3, 1);
    const pfNorm = Math.min(pf / 3, 1);
    const points = [
      { x: center, y: center - maxRadius * wrNorm },
      { x: center - maxRadius * 0.866 * ratioNorm, y: center + maxRadius * 0.5 * ratioNorm },
      { x: center + maxRadius * 0.866 * pfNorm, y: center + maxRadius * 0.5 * pfNorm }
    ];
    const outerPoints = [
      { x: center, y: center - maxRadius },
      { x: center - maxRadius * 0.866, y: center + maxRadius * 0.5 },
      { x: center + maxRadius * 0.866, y: center + maxRadius * 0.5 }
    ];
    return (
      <svg width={size} height={size + 30}>
        <polygon points={outerPoints.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={theme.cardBorder} strokeWidth="1" />
        <polygon points={outerPoints.map(p => `${center + (p.x - center) * 0.66},${center + (p.y - center) * 0.66}`).join(' ')} fill="none" stroke={theme.cardBorder} strokeWidth="1" opacity="0.5" />
        <polygon points={outerPoints.map(p => `${center + (p.x - center) * 0.33},${center + (p.y - center) * 0.33}`).join(' ')} fill="none" stroke={theme.cardBorder} strokeWidth="1" opacity="0.3" />
        <polygon points={points.map(p => `${p.x},${p.y}`).join(' ')} fill="rgba(99,102,241,0.3)" stroke="#6366f1" strokeWidth="2" />
        <rect x={center - 25} y={5} width={50} height={18} rx={9} fill={theme.hoverBg} /><text x={center} y={17} textAnchor="middle" fontSize="10" fill={theme.textMuted}>Win %</text>
        <rect x={5} y={size - 15} width={55} height={18} rx={9} fill={theme.hoverBg} /><text x={32} y={size - 2} textAnchor="middle" fontSize="10" fill={theme.textMuted}>Avg win/loss</text>
        <rect x={size - 60} y={size - 15} width={55} height={18} rx={9} fill={theme.hoverBg} /><text x={size - 32} y={size - 2} textAnchor="middle" fontSize="10" fill={theme.textMuted}>Profit factor</text>
      </svg>
    );
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

      {/* Active Challenges Banner */}
      {activeChallenges.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(activeChallenges.length, 3)}, 1fr)`, gap: 12 }}>
          {activeChallenges.slice(0, 3).map(ch => {
            const chTrades = trades.filter(t => t.account === ch.account && (!ch.startDate || t.date >= ch.startDate));
            const chPnl = chTrades.reduce((s, t) => s + (parseFloat(t.pnl) || 0), 0);
            const chAccountSize = ch.accountSize || 1;
            const chProfitPct = (chPnl / chAccountSize) * 100;
            const phase = ch.phases?.[ch.currentPhase] || ch.phases?.[0] || {};
            const targetPct = phase.profitTarget ?? 10;
            const progress = targetPct ? Math.min((chProfitPct / targetPct) * 100, 100) : 0;
            
            return (
              <div key={ch.id} className="card" style={{ padding: 16, borderLeft: '3px solid #6366f1' }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{ch.name}</div>
                    <div style={{ fontSize: 11, color: theme.textFaint }}>{phase?.name}</div>
                  </div>
                  <Shield size={16} style={{ color: '#6366f1' }} />
                </div>
                <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: chPnl >= 0 ? '#10b981' : '#ef4444' }}>{chProfitPct.toFixed(2)}%</span>
                  <span style={{ fontSize: 12, color: theme.textFaint }}>/ {targetPct}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: theme.hoverBg, overflow: 'hidden' }}>
                  <div className="progress-bar-animate" style={{ height: '100%', borderRadius: 3, width: `${Math.max(progress, 0)}%`, background: progress >= 100 ? '#10b981' : '#6366f1' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Top Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        <div className="card" style={{ padding: 16 }}>
          <div className="flex items-center gap-2"><div className="stat-label">Net P&L</div><div style={{ width: 18, height: 18, borderRadius: 4, background: theme.hoverBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: theme.textFaint }}>{totalTrades}</div></div>
          <div style={{ fontSize: 22, fontWeight: 700, color: totalPnl >= 0 ? '#10b981' : '#ef4444', marginTop: 6 }}>{totalPnl >= 0 ? '+' : ''}${totalPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="stat-label">Trade Expectancy</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: expectancy >= 0 ? '#10b981' : '#ef4444', marginTop: 6 }}>${expectancy.toFixed(2)}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="stat-label">Profit Factor</div>
          <div className="flex items-center gap-3" style={{ marginTop: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: profitFactor >= 1.5 ? '#10b981' : profitFactor >= 1 ? '#f59e0b' : '#ef4444' }}>{profitFactor >= 99 ? '∞' : profitFactor.toFixed(2)}</span>
            <DonutChart value={Math.min(profitFactor / 3 * 100, 100)} size={40} strokeWidth={4} color={profitFactor >= 1.5 ? '#10b981' : profitFactor >= 1 ? '#f59e0b' : '#ef4444'} />
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="flex items-center gap-2"><div className="stat-label">Win %</div><div style={{ display: 'flex', gap: 4 }}><span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#10b981', color: 'white' }}>{wins.length}</span><span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#ef4444', color: 'white' }}>{losses.length}</span></div></div>
          <div className="flex items-center gap-3" style={{ marginTop: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: theme.text }}>{winRate.toFixed(2)}%</span>
            <DonutChart value={winRate} size={40} strokeWidth={4} color={winRate >= 50 ? '#10b981' : '#ef4444'} />
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="stat-label">Avg Win/Loss Trade</div>
          <div className="flex items-center gap-2" style={{ marginTop: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: theme.text }}>{avgWinLossRatio.toFixed(1)}</span>
            <div style={{ display: 'flex', flexDirection: 'column', fontSize: 11 }}>
              <span style={{ color: '#10b981' }}>${avgWin.toFixed(2)}</span>
              <span style={{ color: '#ef4444' }}>${avgLoss.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Second Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr 1fr', gap: 12 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="stat-label">Ellipse Score</div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 8 }}>
            <RadarChart winRate={winRate} avgRatio={avgWinLossRatio} pf={profitFactor} size={160} />
            <div style={{ marginTop: 8, textAlign: 'center' }}>
              <span style={{ fontSize: 14, color: theme.textMuted }}>Your Score: </span>
              <span style={{ fontSize: 24, fontWeight: 700, color: ellipseScore >= 70 ? '#10b981' : ellipseScore >= 40 ? '#f59e0b' : '#ef4444' }}>{totalTrades < 5 ? '--' : ellipseScore.toFixed(0)}</span>
            </div>
          </div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div className="stat-label">Daily Net Cumulative P&L</div>
          <div style={{ height: 180, marginTop: 12 }}>
            {cumulativePnlData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cumulativePnlData}>
                  <defs>
                    <linearGradient id="cumGreen" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                    <linearGradient id="cumRed" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} /><stop offset="100%" stopColor="#ef4444" stopOpacity={0} /></linearGradient>
                  </defs>
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: theme.textFaint }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: theme.textFaint }} tickFormatter={v => `$${v}`} width={60} />
                  <Tooltip contentStyle={{ background: theme.card, border: `1px solid ${theme.cardBorder}`, borderRadius: 8, fontSize: 12, color: theme.text }} labelStyle={{ color: theme.textMuted }} formatter={(v) => [`$${v.toFixed(2)}`, 'Cumulative']} />
                  <Area type="monotone" dataKey="pnl" stroke={totalPnl >= 0 ? '#10b981' : '#ef4444'} fill={totalPnl >= 0 ? 'url(#cumGreen)' : 'url(#cumRed)'} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textFaint, fontSize: 12 }}>No data yet</div>}
          </div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div className="stat-label">Net Daily P&L</div>
          <div style={{ height: 180, marginTop: 12 }}>
            {dailyPnlData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyPnlData}>
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: theme.textFaint }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: theme.textFaint }} tickFormatter={v => `$${v}`} width={60} />
                  <Tooltip contentStyle={{ background: theme.card, border: `1px solid ${theme.cardBorder}`, borderRadius: 8, fontSize: 12, color: theme.text }} labelStyle={{ color: theme.textMuted }} formatter={(v) => [`$${v.toFixed(2)}`, 'Daily P&L']} cursor={{ fill: theme.hoverBg }} />
                  <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>{dailyPnlData.map((entry, index) => <Cell key={index} fill={entry.pnl >= 0 ? '#10b981' : '#ef4444'} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textFaint, fontSize: 12 }}>No data yet</div>}
          </div>
        </div>
      </div>

      {/* Third Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 12 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="stat-label" style={{ marginBottom: 12 }}>Recent Trades</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentTrades.length === 0 ? <div style={{ padding: 20, textAlign: 'center', color: theme.textFaint, fontSize: 12 }}>No trades yet</div> :
              recentTrades.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 10, borderRadius: 8, background: theme.hoverBg }}>
                  <div className="flex items-center gap-3">
                    <div style={{ fontSize: 12, color: theme.textFaint }}>{t.date}</div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: theme.text }}>{t.symbol}</div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: t.pnl >= 0 ? '#10b981' : '#ef4444' }}>{t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}</span>
                </div>
              ))}
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
            <div className="flex items-center gap-3">
              <button onClick={() => setDashboardMonth(new Date(dashboardMonth.getFullYear(), dashboardMonth.getMonth() - 1))} style={{ padding: 6, borderRadius: 6, border: 'none', background: theme.hoverBg, cursor: 'pointer' }}><ChevronLeft size={16} style={{ color: theme.textMuted }} /></button>
              <span style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>{dashboardMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
              <button onClick={() => setDashboardMonth(new Date(dashboardMonth.getFullYear(), dashboardMonth.getMonth() + 1))} style={{ padding: 6, borderRadius: 6, border: 'none', background: theme.hoverBg, cursor: 'pointer' }}><ChevronRight size={16} style={{ color: theme.textMuted }} /></button>
            </div>
            <div className="flex items-center gap-3" style={{ fontSize: 12, color: theme.textMuted }}>
              <span style={{ color: monthlyPnl >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>${monthlyPnl.toFixed(2)}</span>
              <span>{monthlyTradeDays} days</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d} style={{ padding: 6, textAlign: 'center', fontSize: 11, fontWeight: 500, color: theme.textFaint }}>{d}</div>)}
            {calendarDays.map((day, i) => {
              const data = getDayData(day);
              const dayBg = data 
                ? data.pnl >= 0 
                  ? 'linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(16,185,129,0.22) 100%)'
                  : 'linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(239,68,68,0.22) 100%)'
                : 'transparent';
              return (
                <div key={i} style={{ minHeight: 50, padding: 4, borderRadius: 6, background: dayBg, border: day ? `1px solid ${data ? (data.pnl >= 0 ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)') : theme.cardBorder}` : 'none' }}>
                  {day && <><div style={{ fontSize: 11, color: data ? (data.pnl >= 0 ? '#10b981' : '#ef4444') : theme.textMuted, fontWeight: data ? 600 : 400 }}>{day}</div>{data && <div style={{ marginTop: 2 }}><div style={{ fontSize: 11, fontWeight: 600, color: data.pnl >= 0 ? '#10b981' : '#ef4444' }}>{data.pnl >= 0 ? '+' : ''}{Math.abs(data.pnl) >= 1000 ? (data.pnl / 1000).toFixed(1) + 'K' : data.pnl.toFixed(0)}</div><div style={{ fontSize: 9, color: theme.textFaint }}>{data.trades}t</div></div>}</>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountsView({ accounts, challenges, trades, onUpdate, onDelete }) {
  const theme = useTheme();
  const [deleteId, setDeleteId] = useState(null);
  const [editAcc, setEditAcc] = useState(null);
  const [expandedChallenge, setExpandedChallenge] = useState(null);

  // Group accounts: find which accounts are linked to challenges
  const challengeAccountNames = new Set(challenges.map(c => c.account).filter(Boolean));
  const standaloneAccounts = accounts.filter(a => !challengeAccountNames.has(a.name));
  
  // Build challenge groups with merged equity
  const challengeGroups = challenges.map(ch => {
    const linkedAccount = accounts.find(a => a.name === ch.account);
    const accountTrades = trades.filter(t => t.account === ch.account && (!ch.startDate || t.date >= ch.startDate));
    const totalPnl = accountTrades.reduce((s, t) => s + (parseFloat(t.pnl) || 0), 0);
    const mergedEquity = ch.accountSize + totalPnl;
    const phase = ch.phases?.[ch.currentPhase] || ch.phases?.[0] || {};
    const profitPct = ch.accountSize > 0 ? (totalPnl / ch.accountSize) * 100 : 0;
    const tradingDays = new Set(accountTrades.map(t => t.date)).size;
    
    // Per-phase breakdown
    const phaseBreakdown = ch.phases.map((p, idx) => {
      // For completed phases, we'd need to know the split date
      // For current phase, calculate from trades
      const isCurrent = idx === ch.currentPhase;
      const isPast = idx < ch.currentPhase;
      const isFuture = idx > ch.currentPhase;
      return { ...p, idx, isCurrent, isPast, isFuture };
    });

    const statusColors = {
      active: { bg: 'rgba(99,102,241,0.1)', text: '#6366f1', label: 'Active' },
      passed: { bg: 'rgba(16,185,129,0.1)', text: '#10b981', label: 'Passed' },
      failed: { bg: 'rgba(239,68,68,0.1)', text: '#ef4444', label: 'Failed' },
      funded: { bg: 'rgba(245,158,11,0.1)', text: '#f59e0b', label: 'Funded' }
    };

    return {
      challenge: ch,
      linkedAccount,
      totalPnl,
      mergedEquity,
      phase,
      profitPct,
      tradingDays,
      phaseBreakdown,
      statusStyle: statusColors[ch.status] || statusColors.active
    };
  });

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
  const totalEquity = challengeGroups.reduce((s, g) => s + g.mergedEquity, 0) + standaloneAccounts.reduce((s, a) => s + a.equity, 0);
  const totalChallenges = challenges.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="stat-label">Total Balance</div>
          <div className="stat-value" style={{ marginTop: 6 }}>${totalBalance.toLocaleString()}</div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div className="stat-label">Merged Equity</div>
          <div className="stat-value" style={{ color: totalEquity >= totalBalance ? '#10b981' : '#ef4444', marginTop: 6 }}>${totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div className="stat-label">Prop Challenges</div>
          <div className="stat-value" style={{ marginTop: 6 }}>{totalChallenges}</div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div className="stat-label">Standalone Accounts</div>
          <div className="stat-value" style={{ marginTop: 6 }}>{standaloneAccounts.length}</div>
        </div>
      </div>

      {/* Prop Firm Challenge Accounts — Unified Cards */}
      {challengeGroups.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>Prop Firm Accounts</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {challengeGroups.map(({ challenge: ch, linkedAccount, totalPnl, mergedEquity, phase, profitPct, tradingDays, phaseBreakdown, statusStyle }) => {
              const isExpanded = expandedChallenge === ch.id;
              return (
                <div key={ch.id} className="card-lg" style={{ overflow: 'hidden' }}>
                  {/* Main Row */}
                  <div onClick={() => setExpandedChallenge(isExpanded ? null : ch.id)} style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'background 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = theme.hoverBg} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div className="flex items-center gap-4">
                      <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Shield size={22} style={{ color: 'white' }} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span style={{ fontSize: 15, fontWeight: 600, color: theme.text }}>{ch.name}</span>
                          <span className="badge" style={{ background: statusStyle.bg, color: statusStyle.text }}>{statusStyle.label}</span>
                        </div>
                        <div style={{ fontSize: 12, color: theme.textFaint, marginTop: 2 }}>
                          {ch.propFirm} · {phase.name || 'Phase 1'} · {tradingDays} trading days
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-8">
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Starting</div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: theme.text, marginTop: 2 }}>${(ch.accountSize || 0).toLocaleString()}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>P&L</div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: totalPnl >= 0 ? '#10b981' : '#ef4444', marginTop: 2 }}>
                          {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', minWidth: 100 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Equity</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: mergedEquity >= ch.accountSize ? '#10b981' : '#ef4444', marginTop: 2 }}>
                          ${mergedEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                      <ChevronDown size={18} style={{ color: theme.textFaint, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'none' }} />
                    </div>
                  </div>

                  {/* Expanded: Phase Timeline */}
                  {isExpanded && (
                    <div style={{ padding: '0 20px 20px', borderTop: `1px solid ${theme.cardBorder}` }}>
                      {/* Phase Progress Timeline */}
                      <div style={{ padding: '16px 0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 0, position: 'relative' }}>
                          {phaseBreakdown.map((p, idx) => {
                            const isLast = idx === phaseBreakdown.length - 1;
                            const dotColor = p.isPast ? '#10b981' : p.isCurrent ? '#6366f1' : theme.cardBorder;
                            const lineColor = p.isPast ? '#10b981' : theme.cardBorder;
                            return (
                              <div key={idx} style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1 }}>
                                  <div style={{ width: p.isCurrent ? 16 : 12, height: p.isCurrent ? 16 : 12, borderRadius: '50%', background: dotColor, border: p.isCurrent ? '3px solid rgba(99,102,241,0.3)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {p.isPast && <CheckCircle size={8} style={{ color: 'white' }} />}
                                  </div>
                                  <div style={{ marginTop: 8, textAlign: 'center' }}>
                                    <div style={{ fontSize: 12, fontWeight: p.isCurrent ? 600 : 400, color: p.isCurrent ? '#6366f1' : p.isPast ? '#10b981' : theme.textFaint }}>{p.name}</div>
                                    {p.profitTarget && <div style={{ fontSize: 11, color: theme.textFaint }}>{p.profitTarget}% target</div>}
                                    {!p.profitTarget && p.name?.toLowerCase().includes('funded') && <div style={{ fontSize: 11, color: '#f59e0b' }}>Live</div>}
                                  </div>
                                </div>
                                {!isLast && <div style={{ flex: 1, height: 2, background: lineColor, marginBottom: 30 }} />}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Current Phase Stats */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                        <div style={{ padding: 14, borderRadius: 10, background: theme.hoverBg }}>
                          <div className="stat-label">Profit Target</div>
                          <div style={{ fontSize: 16, fontWeight: 600, color: profitPct >= (phase.profitTarget || 999) ? '#10b981' : theme.text, marginTop: 4 }}>
                            {profitPct.toFixed(2)}% {phase.profitTarget ? `/ ${phase.profitTarget}%` : ''}
                          </div>
                        </div>
                        <div style={{ padding: 14, borderRadius: 10, background: theme.hoverBg }}>
                          <div className="stat-label">Daily DD Limit</div>
                          <div style={{ fontSize: 16, fontWeight: 600, color: theme.text, marginTop: 4 }}>{phase.maxDailyDrawdown || 5}%</div>
                        </div>
                        <div style={{ padding: 14, borderRadius: 10, background: theme.hoverBg }}>
                          <div className="stat-label">Max DD Limit</div>
                          <div style={{ fontSize: 16, fontWeight: 600, color: theme.text, marginTop: 4 }}>{phase.maxTotalDrawdown || 10}%</div>
                        </div>
                        <div style={{ padding: 14, borderRadius: 10, background: theme.hoverBg }}>
                          <div className="stat-label">Trading Days</div>
                          <div style={{ fontSize: 16, fontWeight: 600, color: tradingDays >= (phase.minTradingDays || 0) ? '#10b981' : theme.text, marginTop: 4 }}>
                            {tradingDays} {phase.minTradingDays ? `/ ${phase.minTradingDays} min` : ''}
                          </div>
                        </div>
                      </div>

                      {/* Linked Account Info */}
                      {linkedAccount && (
                        <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: theme.hoverBg, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div className="flex items-center gap-3">
                            <Database size={16} style={{ color: theme.textFaint }} />
                            <span style={{ fontSize: 13, color: theme.textMuted }}>Linked: <strong style={{ color: theme.text }}>{linkedAccount.name}</strong> · {linkedAccount.broker} · {linkedAccount.server}</span>
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => setEditAcc(linkedAccount)} style={{ padding: 6, borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer' }}><Edit3 size={14} style={{ color: theme.textFaint }} /></button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Standalone Accounts */}
      {standaloneAccounts.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
            {challengeGroups.length > 0 ? 'Other Accounts' : 'Accounts'}
          </div>
          <div className="card-lg" style={{ overflow: 'hidden' }}>
            {standaloneAccounts.map(acc => (
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
        </div>
      )}

      {accounts.length === 0 && challenges.length === 0 && (
        <div className="card-lg" style={{ padding: 60, textAlign: 'center' }}>
          <Database size={40} style={{ color: theme.textFaint, margin: '0 auto 12px', opacity: 0.5 }} />
          <p style={{ fontSize: 14, color: theme.textMuted }}>No accounts yet</p>
          <p style={{ fontSize: 13, color: theme.textFaint, marginTop: 4 }}>Add an account to start tracking</p>
        </div>
      )}

      {editAcc && <EditAccountModal account={editAcc} onClose={() => setEditAcc(null)} onSave={(updated) => { onUpdate(updated); setEditAcc(null); }} />}
      {deleteId && (
        <Modal onClose={() => setDeleteId(null)}>
          <div style={{ padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: theme.text, marginBottom: 8 }}>Remove Account?</h3>
            <p style={{ fontSize: 14, color: theme.textMuted, marginBottom: 20 }}>This will remove {accounts.find(a => a.id === deleteId)?.name}</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="input" style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => { onDelete(deleteId); setDeleteId(null); }} className="btn-primary" style={{ flex: 1, background: '#ef4444' }}>Remove</button>
            </div>
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
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d} className="table-header" style={{ textAlign: 'center', padding: 12 }}>{d}</div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {days.map((day, i) => {
            const dayTrades = getTradesForDay(day);
            const pnl = dayTrades.reduce((s, t) => s + t.pnl, 0);
            const hasTrades = dayTrades.length > 0;
            const dayBg = hasTrades
              ? pnl >= 0
                ? 'linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(16,185,129,0.2) 100%)'
                : 'linear-gradient(135deg, rgba(239,68,68,0.06) 0%, rgba(239,68,68,0.2) 100%)'
              : !day ? (theme.dark ? '#0a0a0a' : '#f8fafc') : 'transparent';
            return (
              <div key={i} style={{ minHeight: 90, padding: 10, borderBottom: `1px solid ${theme.cardBorder}`, borderRight: `1px solid ${theme.cardBorder}`, background: dayBg, borderLeft: hasTrades ? `3px solid ${pnl >= 0 ? '#10b981' : '#ef4444'}` : undefined }}>
                {day && <><div style={{ fontSize: 13, color: hasTrades ? (pnl >= 0 ? '#10b981' : '#ef4444') : theme.textMuted, fontWeight: hasTrades ? 600 : 400 }}>{day}</div>{hasTrades && <div style={{ marginTop: 6 }}><div style={{ fontSize: 13, fontWeight: 600, color: pnl >= 0 ? '#10b981' : '#ef4444' }}>{pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}</div><div style={{ fontSize: 11, color: theme.textFaint }}>{dayTrades.length} trade{dayTrades.length > 1 ? 's' : ''}</div></div>}</>}
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card-lg scrollbar" style={{ width: '100%', maxWidth: width, maxHeight: '90vh', overflow: 'auto' }}>{children}</div>
    </div>
  );
}

function NewTradeModal({ onClose, onSave, accounts }) {
  const theme = useTheme();
  const [step, setStep] = useState(1);
  const [trade, setTrade] = useState({
    date: new Date().toISOString().split('T')[0], time: new Date().toTimeString().slice(0, 5),
    symbol: '', side: 'Long', entry: '', exit: '', lots: '', stopLoss: '', takeProfit: '',
    commission: '', swap: '', pnl: 0, marketStructure: '', candleType: '',
    liquidityTaken: [], liquidityTarget: [], notes: '', account: accounts[0]?.name || '',
    chartLink: '', chartImage: ''
  });

  useEffect(() => {
    if (trade.entry && trade.exit && trade.lots && trade.symbol) {
      const entry = parseFloat(trade.entry), exit = parseFloat(trade.exit), lots = parseFloat(trade.lots);
      const commission = parseFloat(trade.commission) || 0, swap = parseFloat(trade.swap) || 0;
      if (!isNaN(entry) && !isNaN(exit) && !isNaN(lots)) {
        const gross = calculateTradePnL(trade.symbol, trade.side, entry, exit, lots);
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
                  <div style={{ fontSize: 14, fontWeight: 500, color: theme.text }}>{val.label}</div><div style={{ fontSize: 12, color: theme.textFaint }}>{val.description}</div>
                </button>
              ))}</div>
            </div>
          </div>
        )}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div><label className="label" style={{ marginBottom: 8 }}>Liquidity Taken</label><div className="flex flex-wrap gap-2">{LIQUIDITY_LEVELS.map(l => (
              <button key={l.key} onClick={() => toggleLiq(l.key, 'taken')} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer', background: trade.liquidityTaken.includes(l.key) ? '#f59e0b' : theme.hoverBg, color: trade.liquidityTaken.includes(l.key) ? 'white' : theme.textMuted }}>{l.abbr}</button>
            ))}</div></div>
            <div><label className="label" style={{ marginBottom: 8 }}>Liquidity Target</label><div className="flex flex-wrap gap-2">{LIQUIDITY_LEVELS.map(l => (
              <button key={l.key} onClick={() => toggleLiq(l.key, 'target')} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer', background: trade.liquidityTarget.includes(l.key) ? '#3b82f6' : theme.hoverBg, color: trade.liquidityTarget.includes(l.key) ? 'white' : theme.textMuted }}>{l.abbr}</button>
            ))}</div></div>
            <div style={{ padding: 16, borderRadius: 10, background: theme.hoverBg }}>
              <div className="flex items-center gap-2" style={{ marginBottom: 12 }}><Link size={14} style={{ color: theme.textMuted }} /><span style={{ fontSize: 12, fontWeight: 500, color: theme.textMuted }}>Chart Reference</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div><label className="label">TradingView Link</label><input value={trade.chartLink} onChange={(e) => setTrade({...trade, chartLink: e.target.value})} placeholder="https://www.tradingview.com/chart/..." className="input" /></div>
                <div><label className="label">Chart Image URL</label><input value={trade.chartImage} onChange={(e) => setTrade({...trade, chartImage: e.target.value})} placeholder="https://i.imgur.com/..." className="input" /></div>
              </div>
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
      const entry = parseFloat(trade.entry), exit = parseFloat(trade.exit), lots = parseFloat(trade.lots);
      const commission = parseFloat(trade.commission) || 0, swap = parseFloat(trade.swap) || 0;
      if (!isNaN(entry) && !isNaN(exit) && !isNaN(lots)) {
        const gross = calculateTradePnL(trade.symbol, trade.side, entry, exit, lots);
        setTrade(prev => ({ ...prev, pnl: gross - commission + swap }));
      }
    }
  }, [trade.entry, trade.exit, trade.lots, trade.symbol, trade.side, trade.commission, trade.swap]);

  const handleSave = () => {
    const rr = trade.stopLoss && trade.takeProfit && trade.entry
      ? `1:${Math.abs((parseFloat(trade.takeProfit) - parseFloat(trade.entry)) / (parseFloat(trade.entry) - parseFloat(trade.stopLoss))).toFixed(1)}` : trade.riskReward || '-';
    onSave({ ...trade, entry: parseFloat(trade.entry), exit: parseFloat(trade.exit), lots: parseFloat(trade.lots), stopLoss: parseFloat(trade.stopLoss) || 0, takeProfit: parseFloat(trade.takeProfit) || 0, commission: parseFloat(trade.commission) || 0, swap: parseFloat(trade.swap) || 0, riskReward: rr });
  };

  const toggleLiq = (key, type) => {
    const field = type === 'taken' ? 'liquidityTaken' : 'liquidityTarget';
    setTrade(prev => ({ ...prev, [field]: prev[field].includes(key) ? prev[field].filter(k => k !== key) : [...prev[field], key] }));
  };

  const chartPreview = getTradingViewImageUrl(trade.chartLink) || trade.chartImage;

  return (
    <Modal width={520} onClose={onClose}>
      <div style={{ padding: 20, borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: theme.text }}>Edit Trade</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={20} style={{ color: theme.textFaint }} /></button>
      </div>
      <div style={{ padding: 20, maxHeight: '65vh', overflow: 'auto' }} className="scrollbar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label className="label">Date</label><input type="date" value={trade.date} onChange={(e) => setTrade({...trade, date: e.target.value})} className="input" /></div>
            <div><label className="label">Time</label><input type="time" value={trade.time} onChange={(e) => setTrade({...trade, time: e.target.value})} className="input" /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label className="label">Symbol</label><input value={trade.symbol} onChange={(e) => setTrade({...trade, symbol: e.target.value.toUpperCase()})} className="input" /></div>
            <div><label className="label">Account</label><select value={trade.account} onChange={(e) => setTrade({...trade, account: e.target.value})} className="input">{accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}</select></div>
          </div>
          <div><label className="label">Side</label><div className="flex gap-2">{['Long', 'Short'].map(s => (
            <button key={s} onClick={() => setTrade({...trade, side: s})} style={{ flex: 1, padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 500, border: 'none', cursor: 'pointer', background: trade.side === s ? (s === 'Long' ? '#10b981' : '#ef4444') : theme.hoverBg, color: trade.side === s ? 'white' : theme.textMuted }}>{s}</button>
          ))}</div></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div><label className="label">Entry</label><input type="number" step="any" value={trade.entry} onChange={(e) => setTrade({...trade, entry: e.target.value})} className="input" /></div>
            <div><label className="label">Exit</label><input type="number" step="any" value={trade.exit} onChange={(e) => setTrade({...trade, exit: e.target.value})} className="input" /></div>
            <div><label className="label">Lots</label><input type="number" step="0.01" value={trade.lots} onChange={(e) => setTrade({...trade, lots: e.target.value})} className="input" /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label className="label">Stop Loss</label><input type="number" step="any" value={trade.stopLoss} onChange={(e) => setTrade({...trade, stopLoss: e.target.value})} className="input" /></div>
            <div><label className="label">Take Profit</label><input type="number" step="any" value={trade.takeProfit} onChange={(e) => setTrade({...trade, takeProfit: e.target.value})} className="input" /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label className="label">Commission ($)</label><input type="number" step="0.01" value={trade.commission} onChange={(e) => setTrade({...trade, commission: e.target.value})} className="input" /></div>
            <div><label className="label">Swap ($)</label><input type="number" step="0.01" value={trade.swap} onChange={(e) => setTrade({...trade, swap: e.target.value})} className="input" /></div>
          </div>
          <div style={{ padding: 16, borderRadius: 10, background: trade.pnl >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' }}>
            <div className="flex justify-between items-center">
              <span style={{ fontSize: 13, color: theme.textMuted }}>Calculated P&L</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: trade.pnl >= 0 ? '#10b981' : '#ef4444' }}>{trade.pnl >= 0 ? '+' : ''}${trade.pnl?.toFixed(2)}</span>
            </div>
          </div>
          <div><label className="label" style={{ marginBottom: 8 }}>Market Structure</label><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {Object.entries(MARKET_STRUCTURES).map(([key, val]) => (
              <button key={key} onClick={() => setTrade({...trade, marketStructure: key})} style={{ padding: 10, borderRadius: 8, fontSize: 12, border: `1px solid ${trade.marketStructure === key ? '#6366f1' : theme.cardBorder}`, background: trade.marketStructure === key ? 'rgba(99,102,241,0.1)' : 'transparent', color: theme.text, cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: val.color, marginRight: 8 }}></span>{val.label}
              </button>
            ))}
          </div></div>
          <div><label className="label" style={{ marginBottom: 8 }}>Liquidity Taken</label><div className="flex flex-wrap gap-2">{LIQUIDITY_LEVELS.map(l => (
            <button key={l.key} onClick={() => toggleLiq(l.key, 'taken')} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 500, border: 'none', cursor: 'pointer', background: trade.liquidityTaken.includes(l.key) ? '#f59e0b' : theme.hoverBg, color: trade.liquidityTaken.includes(l.key) ? 'white' : theme.textMuted }}>{l.abbr}</button>
          ))}</div></div>
          <div style={{ padding: 16, borderRadius: 10, background: theme.hoverBg }}>
            <div className="flex items-center gap-2" style={{ marginBottom: 12 }}><Link size={14} style={{ color: theme.textMuted }} /><span style={{ fontSize: 12, fontWeight: 500, color: theme.textMuted }}>Chart Reference</span></div>
            <div><label className="label">TradingView Link</label><input value={trade.chartLink} onChange={(e) => setTrade({...trade, chartLink: e.target.value})} placeholder="https://www.tradingview.com/x/..." className="input" /></div>
            {chartPreview && <div style={{ marginTop: 12, borderRadius: 8, overflow: 'hidden' }}><img src={chartPreview} alt="Chart" style={{ width: '100%', height: 120, objectFit: 'cover' }} onError={(e) => e.target.style.display = 'none'} /></div>}
          </div>
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
      <div style={{ padding: 20, borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: theme.text }}>Add Account</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} style={{ color: theme.textFaint }} /></button>
      </div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div><label className="label">Platform</label><div className="flex gap-2">{['MT5', 'cTrader'].map(p => (
          <button key={p} onClick={() => setAcc({...acc, platform: p})} style={{ flex: 1, padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 500, border: 'none', cursor: 'pointer', background: acc.platform === p ? (p === 'MT5' ? '#3b82f6' : '#8b5cf6') : theme.hoverBg, color: acc.platform === p ? 'white' : theme.textMuted }}>{p}</button>
        ))}</div></div>
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

function TradeDetailModal({ trade, onClose, onDelete, onEdit }) {
  const theme = useTheme();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const chartImg = getTradingViewImageUrl(trade.chartLink) || trade.chartImage;

  return (
    <Modal width={520} onClose={onClose}>
      <div style={{ padding: 20, borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="flex items-center gap-3">
          <div style={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: trade.pnl >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: trade.pnl >= 0 ? '#10b981' : '#ef4444' }}>{trade.symbol?.slice(0, 2)}</span>
          </div>
          <div><div style={{ fontSize: 16, fontWeight: 600, color: theme.text }}>{trade.symbol}</div><div style={{ fontSize: 12, color: theme.textFaint }}>{trade.date} · {trade.time}</div></div>
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
              <div className="stat-label">{x.l}</div><div style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginTop: 4 }}>{x.v}</div>
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
        {(chartImg || trade.chartLink) && (
          <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${theme.cardBorder}` }}>
            {chartImg && <img src={chartImg} alt="Chart" style={{ width: '100%', height: 200, objectFit: 'cover' }} onError={(e) => e.target.style.display = 'none'} />}
            {trade.chartLink && <a href={trade.chartLink} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 14, fontSize: 13, color: '#6366f1', textDecoration: 'none', background: theme.hoverBg }}><ExternalLink size={14} />Open in TradingView</a>}
          </div>
        )}
        {trade.notes && <div><div className="stat-label" style={{ marginBottom: 8 }}>Notes</div><p style={{ fontSize: 14, color: theme.text, padding: 14, borderRadius: 10, background: theme.hoverBg }}>{trade.notes}</p></div>}
      </div>
      <div style={{ padding: 20, borderTop: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between' }}>
        {!confirmDelete ? <>
          <button onClick={() => setConfirmDelete(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', fontSize: 14, color: '#ef4444', cursor: 'pointer' }}><Trash2 size={16} />Delete</button>
          <div className="flex gap-2">
            <button onClick={() => onEdit(trade)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 10, border: `1px solid ${theme.cardBorder}`, background: 'none', fontSize: 14, color: theme.text, cursor: 'pointer' }}><Edit3 size={16} />Edit</button>
            <button onClick={onClose} className="btn-primary">Close</button>
          </div>
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
