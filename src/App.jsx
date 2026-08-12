import React, { useState, useEffect, createContext, useContext, useRef } from 'react';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell, ComposedChart, Line, ReferenceLine } from 'recharts';
import { Plus, TrendingUp, TrendingDown, ChevronDown, Calendar, BarChart3, BookOpen, Wallet, CheckCircle, Clock, X, Eye, Database, ChevronLeft, ChevronRight, Trash2, Edit3, Moon, Sun, Settings, Link, Image, ExternalLink, Loader2, CloudOff, Cloud, LayoutGrid, LayoutList, Upload, FileText, AlertCircle, Shield, Target, AlertTriangle, Zap, Trophy, Flag, Activity, Dices, Play, Coins, RefreshCw } from 'lucide-react';
import { PieChart, Pie, Legend } from 'recharts';
import { supabase } from './lib/supabaseClient';
import {
  sanitizeImportedHtml,
  sanitizeImageUrl,
  getTradingViewImageUrl,
  safeCsvRow,
  validateExchangeRates,
  validateTrade,
  validateAccount,
  validateChallenge,
  validateJournalEntry,
  checkImportSize,
  truncate,
} from './lib/security';

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


// Parse MT5 HTML statement
const parseMT5Statement = (html) => {
  const trades = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitizeImportedHtml(html), 'text/html');
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
          marketStructure: '', candleType: '',
          liquidityTaken: [], liquidityTarget: [],
          notes: 'Imported from MT5', chartLink: '', chartImage: ''
        });
      }
    }
  }
  // FIX: Dedupe in case the HTML has nested duplicate tables
  const seenMT5 = new Set();
  return trades.filter(t => {
    const key = `${t.date}|${t.time}|${t.symbol}|${t.side}|${t.entry}|${t.exit}|${t.lots}|${t.pnl}`;
    if (seenMT5.has(key)) return false;
    seenMT5.add(key);
    return true;
  });
};

// Parse cTrader HTML statement  
const parseCTraderStatement = (html) => {
  const trades = [];
  const phaseSplits = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitizeImportedHtml(html), 'text/html');
  
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
        marketStructure: '', candleType: '',
        liquidityTaken: [], liquidityTarget: [],
        notes: 'Imported from cTrader', chartLink: '', chartImage: '',
        _phase: phase
      });
    }
  }
  
  // FIX: cTrader HTML statements often contain nested duplicate History tables
  // (an outer flat table + an inner clean table), causing trades to be parsed twice.
  // Dedupe by fingerprint of immutable trade fields.
  const seenCT = new Set();
  const uniqueTrades = [];
  for (const t of trades) {
    const key = `${t.date}|${t.time}|${t.symbol}|${t.side}|${t.entry}|${t.exit}|${t.lots}|${t.pnl}`;
    if (seenCT.has(key)) continue;
    seenCT.add(key);
    uniqueTrades.push(t);
  }
  
  return { trades: uniqueTrades, phaseSplits };
};

// Parse CSV file
const parseCSV = (csv, platform) => {
  const trades = [];
  const lines = csv.split('\n').filter(l => l.trim());
  if (lines.length < 2) return trades;
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
    const row = safeCsvRow(headers, values);
    
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
      marketStructure: '', candleType: '',
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
    if (validateExchangeRates(data)) {
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

// ==================== CRYPTO ROW MAPPERS ====================
const mapCryptoTradeRow = (r) => ({
  id: r.id, tradeId: r.trade_id, ordId: r.ord_id, instId: r.inst_id, side: r.side,
  posSide: r.pos_side, fillSz: parseFloat(r.fill_sz) || 0, fillPx: parseFloat(r.fill_px) || 0,
  pnl: parseFloat(r.pnl) || 0, fee: parseFloat(r.fee) || 0, feeCcy: r.fee_ccy || '',
  execType: r.exec_type, ts: r.ts, source: r.source || 'okx', notes: r.notes || '', chartImage: r.chart_image || '',
});
const mapSnapshotRow = (r) => ({
  id: r.id, ts: r.ts, totalEq: parseFloat(r.total_eq) || 0, upl: parseFloat(r.upl) || 0,
  balances: Array.isArray(r.balances) ? r.balances : [], positions: Array.isArray(r.positions) ? r.positions : [], source: r.source || 'okx',
});
const mapCryptoChallengeRow = (r) => ({
  id: r.id, name: r.name || 'Growth Challenge', startBalance: parseFloat(r.start_balance) || 0,
  targetBalance: parseFloat(r.target_balance) || 0, currentBalance: parseFloat(r.current_balance) || 0,
  startDate: r.start_date, targetDate: r.target_date, status: r.status || 'active',
  milestones: Array.isArray(r.milestones) ? r.milestones : [], notes: r.notes || '',
});

// Union two snapshot lists (Supabase + localStorage), dedupe by timestamp, and
// sort ascending. Snapshots are append-only, so a union can never lose history.
// This is what keeps the equity curve intact across reloads, devices and the
// RLS/localStorage fallback boundary: an empty DB read must never discard the
// local cache (and vice versa). When the same snapshot appears in both sources,
// prefer the one with a real DB id over a local_* placeholder.
const mergeSnapshots = (...lists) => {
  const byTs = new Map();
  for (const list of lists) {
    for (const s of list || []) {
      if (!s || !s.ts) continue;
      let key;
      try { key = new Date(s.ts).toISOString(); } catch { continue; }
      const existing = byTs.get(key);
      const isLocal = String(s.id ?? '').startsWith('local_');
      if (!existing || (String(existing.id ?? '').startsWith('local_') && !isLocal)) {
        byTs.set(key, s);
      }
    }
  }
  return [...byTs.values()].sort((a, b) => new Date(a.ts) - new Date(b.ts));
};

// ==================== CHALLENGE PHASE ENGINE ====================
//
// Phases used to record only a start date, stamped with the day you pressed
// "Advance" rather than the day the phase actually began. With no end date the
// filter was open-ended, so leaving a phase made it unreviewable and advancing
// after you'd already traded the new phase hid those trades entirely.
//
// A phase boundary is now {start, end}, every transition is appended to
// phaseHistory so it can be undone, and detected splits from broker statements
// carry the real date.

const todayISO = () => new Date().toISOString().split('T')[0];

// Inclusive start, exclusive end. end === null means "still open".
function phaseBounds(challenge, phaseIdx) {
  const starts = challenge.phaseStartDates || {};
  const start = starts[phaseIdx] || (phaseIdx === 0 ? challenge.startDate : null);
  let end = null;
  for (let i = phaseIdx + 1; i < (challenge.phases?.length || 0); i++) {
    if (starts[i]) { end = starts[i]; break; }
  }
  return { start: start || null, end };
}

// Is this trade part of the challenge at all (right account, on/after start)?
function inChallengeWindow(challenge, t) {
  if (t.account !== challenge.account) return false;
  if (challenge.startDate && t.date < challenge.startDate) return false;
  return true;
}

// Phase membership is explicit: when a phase is passed, its trades are tagged
// with that phase index (challenge.tradePhase[tradeId] = idx). This fixes the
// same-day transition problem that date-only boundaries can't handle — the
// balance genuinely resets to the initial account size for the next phase.
// The still-open current phase holds every in-window trade not yet tagged to an
// earlier phase. Legacy challenges without tags fall back to date boundaries.
function tradesInPhase(trades, challenge, phaseIdx) {
  const map = challenge.tradePhase;
  const cur = challenge.currentPhase ?? 0;
  if (map && Object.keys(map).length) {
    if (phaseIdx < cur) return (trades || []).filter(t => map[t.id] === phaseIdx);
    if (phaseIdx === cur) return (trades || []).filter(t => inChallengeWindow(challenge, t) && (map[t.id] === undefined || map[t.id] === cur));
    return []; // future phases have no trades yet
  }
  const { start, end } = phaseBounds(challenge, phaseIdx);
  return (trades || []).filter(t => {
    if (t.account !== challenge.account) return false;
    if (start && t.date < start) return false;
    if (end && t.date >= end) return false;
    return true;
  });
}

// Freeze the phase being left: tag every still-untagged in-window trade with it.
function assignTradesToPhase(challenge, trades, phaseIdx) {
  const map = { ...(challenge.tradePhase || {}) };
  const assigned = [];
  (trades || []).forEach(t => {
    if (t.id == null || !inChallengeWindow(challenge, t)) return;
    if (map[t.id] === undefined) { map[t.id] = phaseIdx; assigned.push(t.id); }
  });
  return { map, assigned };
}

// Append-only log so any transition can be stepped back.
function pushHistory(challenge, entry) {
  const history = Array.isArray(challenge.phaseHistory) ? challenge.phaseHistory : [];
  return [...history, {
    at: new Date().toISOString(),
    fromPhase: challenge.currentPhase ?? 0,
    fromStatus: challenge.status || 'active',
    prevStartDates: { ...(challenge.phaseStartDates || {}) },
    prevTradePhase: { ...(challenge.tradePhase || {}) },
    ...entry,
  }];
}

// effectiveDate lets a detected split record when the phase really started.
function advanceChallenge(challenge, trades, { effectiveDate, source = 'manual', note = '' } = {}) {
  const date = effectiveDate || todayISO();
  const last = (challenge.phases?.length || 1) - 1;
  const cur = challenge.currentPhase ?? 0;
  const { map, assigned } = assignTradesToPhase(challenge, trades, cur);

  if (cur >= last) {
    return {
      ...challenge,
      status: 'funded',
      tradePhase: map,
      phaseHistory: pushHistory(challenge, { action: 'complete', toPhase: cur, toStatus: 'funded', date, source, note, assignedTradeIds: assigned }),
    };
  }
  const next = cur + 1;
  return {
    ...challenge,
    currentPhase: next,
    tradePhase: map,
    phaseStartDates: { ...(challenge.phaseStartDates || {}), [next]: date },
    phaseHistory: pushHistory(challenge, { action: 'advance', toPhase: next, toStatus: challenge.status || 'active', date, source, note, assignedTradeIds: assigned }),
  };
}

function setChallengeStatus(challenge, status, trades, { source = 'manual' } = {}) {
  // Freeze the current phase's trades when the challenge reaches a terminal state
  // so later-added trades don't retroactively change a passed/failed result.
  const { map } = assignTradesToPhase(challenge, trades, challenge.currentPhase ?? 0);
  return {
    ...challenge,
    status,
    tradePhase: map,
    phaseHistory: pushHistory(challenge, { action: 'status', toPhase: challenge.currentPhase ?? 0, toStatus: status, date: todayISO(), source }),
  };
}

// Step back one entry, restoring the phase index, status, start dates and trade
// tags that were in place before it.
function undoLastPhaseChange(challenge) {
  const history = Array.isArray(challenge.phaseHistory) ? challenge.phaseHistory : [];
  if (!history.length) return challenge;
  const last = history[history.length - 1];
  return {
    ...challenge,
    currentPhase: last.fromPhase,
    status: last.fromStatus,
    phaseStartDates: { ...(last.prevStartDates || {}) },
    tradePhase: { ...(last.prevTradePhase || {}) },
    phaseHistory: history.slice(0, -1),
  };
}

// Splits detected from statement withdrawal notes that sit ahead of where the
// challenge currently is. Returns the earliest unapplied one.
function pendingPhaseSplit(challenge) {
  const splits = Array.isArray(challenge.detectedSplits) ? challenge.detectedSplits : [];
  if (!splits.length) return null;
  const applied = new Set(
    (challenge.phaseHistory || []).filter(h => h.source === 'detected').map(h => h.date + '|' + (h.note || ''))
  );
  const starts = challenge.phaseStartDates || {};
  const currentStart = starts[challenge.currentPhase ?? 0] || challenge.startDate || '';
  return [...splits]
    .sort((a, b) => (a.splitDate || '').localeCompare(b.splitDate || ''))
    .find(s => s.splitDate && s.splitDate > currentStart && !applied.has(s.splitDate + '|' + (s.note || ''))) || null;
}

// ==================== ELLIPSE SCORE (prop-fit) ====================
//
// Scores whether a trading pattern survives a prop firm's structure, not just
// whether it makes money. Every factor maps to a rule that can actually fail an
// evaluation, and everything is measured in percent of account so the numbers
// mean the same thing on a 10k and a 200k.
//
//   Edge 25                    expectancy per trade, in average-loss units
//   Daily loss control 25      worst day vs the daily drawdown limit
//   Drawdown headroom 20       peak-to-trough vs the overall limit
//   Consistency 15             best day's share of gross profit
//   Risk-adjusted progress 15  target reached vs drawdown budget spent
//
// "Sample" was removed: past a few dozen trades it awarded full marks
// permanently and stopped discriminating between traders.

const DEFAULT_PROP_RULES = {
  label: 'Standard evaluation',
  accountSize: 100000,
  profitTarget: 8,       // % of account
  maxDailyDrawdown: 5,   // % of account
  maxTotalDrawdown: 10,  // % of account
  consistencyRule: 40,   // max % of gross profit from a single day
};

// Five behavioural axes rendered as a skill web. Each measures a discipline that
// blows prop accounts even when the P&L looks fine, and each is scored 0..100 where
// higher = more disciplined. Equal 20-pt weights so the web reads as a balanced shape.
const SCORE_FACTORS = [
  { key: 'scale',         label: 'Scale Variance',    weight: 20 },
  { key: 'concentration', label: 'Concentration Cap', weight: 20 },
  { key: 'timeDensity',   label: 'Time Density',      weight: 20 },
  { key: 'holdDuration',  label: 'Hold Duration',     weight: 20 },
  { key: 'tilt',          label: 'Tilt Resistance',   weight: 20 },
];

const clamp01 = (n) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const netOf = (t) => (Number(t.pnl) || 0) - Math.abs(Number(t.fee) || 0);

// Pull real thresholds off the active challenge; fall back to a standard eval.
function resolvePropRules(challenges, accounts, accountName) {
  const active = (challenges || []).filter(c => c.status === 'active' &&
    (accountName === 'all' || !accountName || c.account === accountName));
  const ch = active[0];
  if (!ch) {
    const acct = (accounts || []).find(a => a.name === accountName);
    return { ...DEFAULT_PROP_RULES, accountSize: acct?.balance > 0 ? acct.balance : DEFAULT_PROP_RULES.accountSize };
  }
  const phase = ch.phases?.[ch.currentPhase] || ch.phases?.[0] || {};
  return {
    label: `${ch.name}${phase.name ? ' · ' + phase.name : ''}`,
    accountSize: ch.accountSize > 0 ? ch.accountSize : DEFAULT_PROP_RULES.accountSize,
    profitTarget: phase.profitTarget ?? DEFAULT_PROP_RULES.profitTarget,
    maxDailyDrawdown: phase.maxDailyDrawdown ?? DEFAULT_PROP_RULES.maxDailyDrawdown,
    maxTotalDrawdown: phase.maxTotalDrawdown ?? DEFAULT_PROP_RULES.maxTotalDrawdown,
    consistencyRule: ch.consistencyRule ?? DEFAULT_PROP_RULES.consistencyRule,
  };
}

function computeEllipseScore(trades, rules) {
  const R = { ...DEFAULT_PROP_RULES, ...(rules || {}) };
  const closed = (trades || []).filter(t => typeof t.pnl === 'number');
  const n = closed.length;
  if (n < 3) {
    return { score: 0, available: false, tradeCount: n, caps: [], provisional: true, rules: R,
      factors: SCORE_FACTORS.map(f => ({ ...f, pct: 0, value: 0, detail: '—' })) };
  }

  const consistencyTarget = (R.consistencyRule || 40) / 100;

  // Chronological order for the sequence-based axes (timing, tilt).
  const seq = [...closed].sort((a, b) =>
    new Date(`${a.date || ''} ${a.time || '00:00'}`) - new Date(`${b.date || ''} ${b.time || '00:00'}`));
  const nets = seq.map(netOf);

  const std = (arr) => {
    if (arr.length < 2) return 0;
    const m = mean(arr);
    return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
  };
  const cvOf = (arr) => { const m = mean(arr); return m > 0 ? std(arr) / m : 0; };

  const raw = {};

  // 1) Scale Variance (sizing risk): how consistent position size is. Wild swings
  //    in lots blow accounts on the one oversized trade.
  const sizes = seq.map(t => Math.abs(Number(t.lots) || 0)).filter(v => v > 0);
  if (sizes.length >= 3) {
    const cv = cvOf(sizes);
    raw.scale = { pct: clamp01(1 - cv), detail: `size CV ${(cv * 100).toFixed(0)}% · ${cv < 0.3 ? 'consistent' : cv < 0.6 ? 'variable' : 'erratic'} sizing` };
  } else {
    raw.scale = { pct: 0.5, detail: 'not enough size data', limited: true };
  }

  // 2) Concentration Cap (consistency): no single day should carry the account,
  //    measured against the firm's consistency rule.
  const byDay = {};
  for (const t of seq) { if (t.date) byDay[t.date] = (byDay[t.date] || 0) + netOf(t); }
  const posDays = Object.values(byDay).filter(v => v > 0);
  const gross = posDays.reduce((s, v) => s + v, 0);
  if (gross > 0) {
    const share = Math.max(...posDays) / gross;
    const pct = share <= consistencyTarget ? 1 : clamp01(1 - (share - consistencyTarget) / (1 - consistencyTarget));
    raw.concentration = { pct, detail: `best day ${(share * 100).toFixed(0)}% of profit · cap ${(consistencyTarget * 100).toFixed(0)}%` };
  } else {
    raw.concentration = { pct: 0.5, detail: 'no net-profitable days yet', limited: true };
  }

  // 3) Time Density (news & event risk): rapid-fire, clustered entries and
  //    over-trading raise exposure to spikes and event whipsaws.
  const stamps = seq.map(t => new Date(`${t.date || ''} ${t.time || '00:00'}`).getTime());
  const stampsOk = stamps.every(v => Number.isFinite(v));
  if (stampsOk && seq.length >= 3) {
    let clustered = 0;
    for (let i = 1; i < stamps.length; i++) {
      const gapMin = (stamps[i] - stamps[i - 1]) / 60000;
      if (gapMin >= 0 && gapMin < 10) clustered++;
    }
    const density = clustered / (stamps.length - 1);
    const activeDays = new Set(seq.map(t => t.date)).size || 1;
    const perDay = seq.length / activeDays;
    const overtrade = clamp01((perDay - 6) / 10); // >6 trades/day starts to bite
    const pct = clamp01(1 - density * 0.7 - overtrade * 0.3);
    raw.timeDensity = { pct, detail: `${(density * 100).toFixed(0)}% <10min apart · ${perDay.toFixed(1)}/day` };
  } else {
    raw.timeDensity = { pct: 0.5, detail: 'not enough timestamps', limited: true };
  }

  // 4) Hold Duration (style drift): consistency of time-in-trade. Needs open+close
  //    timestamps (available on exchange round-trips); degrades gracefully.
  const durations = seq.map(t => {
    const o = t.openTs ? new Date(t.openTs).getTime() : null;
    const c = t.closeTs ? new Date(t.closeTs).getTime() : null;
    return (o && c && c > o) ? (c - o) / 60000 : null;
  }).filter(v => v != null);
  if (durations.length >= 3) {
    const cv = cvOf(durations);
    raw.holdDuration = { pct: clamp01(1 - cv), detail: `hold CV ${(cv * 100).toFixed(0)}% · ${cv < 0.5 ? 'steady style' : 'drifting'}` };
  } else {
    raw.holdDuration = { pct: 0.5, detail: 'hold time not tracked', limited: true };
  }

  // 5) Tilt Resistance (psychological discipline): after a loss, do you size up or
  //    revenge-enter? Counts oversized/rushed entries that follow a losing trade.
  const sortedSizes = [...sizes].sort((a, b) => a - b);
  const medSize = sortedSizes.length
    ? (sortedSizes.length % 2 ? sortedSizes[(sortedSizes.length - 1) / 2]
       : (sortedSizes[sortedSizes.length / 2 - 1] + sortedSizes[sortedSizes.length / 2]) / 2)
    : 0;
  let afterLoss = 0, tiltEvents = 0;
  for (let i = 1; i < seq.length; i++) {
    if (nets[i - 1] >= 0) continue;
    afterLoss++;
    const sz = Math.abs(Number(seq[i].lots) || 0);
    const gapMin = stampsOk ? (stamps[i] - stamps[i - 1]) / 60000 : 99;
    const sizeSpike = medSize > 0 && sz > medSize * 1.75;
    const revenge = gapMin >= 0 && gapMin < 5;
    if (sizeSpike || revenge) tiltEvents++;
  }
  if (afterLoss >= 2 && (sizes.length >= 3 || stampsOk)) {
    const rate = tiltEvents / afterLoss;
    raw.tilt = { pct: clamp01(1 - rate), detail: `${tiltEvents}/${afterLoss} post-loss ${tiltEvents === 1 ? 'entry' : 'entries'} oversized/rushed` };
  } else {
    raw.tilt = { pct: 0.5, detail: 'not enough post-loss trades', limited: true };
  }

  const factors = SCORE_FACTORS.map(f => ({
    ...f, pct: raw[f.key].pct, value: raw[f.key].pct * f.weight, detail: raw[f.key].detail,
  }));
  const score = Math.round(factors.reduce((s, f) => s + f.value, 0));

  const caps = [];
  const limitedAxes = SCORE_FACTORS.filter(f => raw[f.key].limited).map(f => f.label);
  if (limitedAxes.length) caps.push(`Limited data: ${limitedAxes.join(', ')}`);

  return {
    score, factors, available: true, tradeCount: n,
    provisional: n < 20 || limitedAxes.length > 0, caps, rules: R,
    ruleLabel: R.label,
  };
}

// ---- Per-trade grade: pure outcome ------------------------------------------
// Stops and targets aren't present in exported statements, so process factors
// can't be measured. Outcome only, scaled against the trader's own averages.
function computeTradeScore(t, ctx) {
  if (!t || typeof t.pnl !== 'number') return null;
  const net = netOf(t);
  const avgWin = ctx?.avgWin > 0 ? ctx.avgWin : null;
  const avgLoss = ctx?.avgLoss > 0 ? ctx.avgLoss : null;

  let pct, note;
  if (net >= 0 && avgWin) {
    pct = 0.3 + clamp01(net / (avgWin * 2)) * 0.7;
    note = `${(net / avgWin).toFixed(2)}x avg win`;
  } else if (net < 0 && avgLoss) {
    pct = Math.max(0, 0.3 * (1 - Math.abs(net) / (avgLoss * 2)));
    note = `${(Math.abs(net) / avgLoss).toFixed(2)}x avg loss`;
  } else {
    pct = net >= 0 ? 0.6 : 0.2;
    note = net >= 0 ? 'profit' : 'loss';
  }

  const score = Math.round(pct * 100);
  return {
    score, net,
    grade: score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'F',
    parts: [{ label: 'Outcome', pct, max: 100, pts: score, note }],
  };
}

// ==================== CRYPTO RR + ELLIPSE SCORE ====================
//
// Crypto is scored differently from prop accounts. On OKX we can read the
// actual stop-loss and take-profit (algo orders), so we grade genuine
// risk/reward instead of prop-rule survival.
//
//   Stop discipline 20        share of trades/positions with a stop actually set
//   Realized expectancy 30    average outcome per trade in R-multiples
//   Reward:Risk quality 20    average win size ÷ average loss size
//   Win-rate vs breakeven 15  win rate above the breakeven your RR implies
//   Drawdown control 15       peak-to-trough on the equity curve

const CRYPTO_SCORE_FACTORS = [
  { key: 'stopDiscipline', label: 'Stop discipline',       weight: 20 },
  { key: 'expectancyR',    label: 'Realized expectancy',   weight: 30 },
  { key: 'rrQuality',      label: 'Reward:Risk quality',   weight: 20 },
  { key: 'winVsBE',        label: 'Win-rate vs breakeven', weight: 15 },
  { key: 'drawdown',       label: 'Drawdown control',      weight: 15 },
];

// Direction of a position: short = -1, long = +1 (net mode falls back to sign).
const posDir = (p) => {
  const side = (p?.posSide || '').toLowerCase();
  if (side === 'short') return -1;
  if (side === 'long') return 1;
  return (Number(p?.pos) || 0) >= 0 ? 1 : -1;
};

// Human side label. OKX net (one-way) mode reports posSide "net" for every
// position/fill, so we recover long/short from the sign of the position size.
const netSide = (p) => {
  const side = (p?.posSide || '').toLowerCase();
  if (side === 'long' || side === 'short') return side;
  return (Number(p?.pos) || 0) >= 0 ? 'long' : 'short';
};

// Live SL/TP + risk/reward for an open position. Prefer the position's own
// attached TP/SL (OKX closeOrderAlgo), then fall back to a standalone algo
// order matched by instId.
function positionRR(pos, liveAlgos) {
  const entry = Number(pos?.avgPx) || 0;
  const mark = Number(pos?.markPx) || 0;
  const dir = posDir(pos);
  const a = (liveAlgos || []).find(x => x.instId === pos?.instId && (x.slTriggerPx != null || x.tpTriggerPx != null));
  const realSl = pos?.slTriggerPx ?? a?.slTriggerPx ?? null;
  const tp = pos?.tpTriggerPx ?? a?.tpTriggerPx ?? null;
  const liq = Number(pos?.liqPx) || null;
  // Fallback: when no stop is set, treat the liquidation price as the worst-case
  // 1R so risk/reward is still computable (the exchange stops you out there).
  const usingLiq = realSl == null && liq != null && liq > 0;
  const sl = realSl != null ? realSl : (usingLiq ? liq : null);
  const riskPerUnit = (sl != null && entry) ? Math.abs(entry - sl) : null;
  const rewardPerUnit = (tp != null && entry) ? Math.abs(tp - entry) : null;
  const plannedRR = (riskPerUnit && rewardPerUnit != null) ? rewardPerUnit / riskPerUnit : null;
  const currentR = (riskPerUnit && entry) ? ((mark - entry) * dir) / riskPerUnit : null;
  return { entry, mark, sl, tp, dir, riskPerUnit, rewardPerUnit, plannedRR, currentR,
    hasStop: realSl != null, usingLiq, hasTarget: tp != null };
}

// Pair OKX fills into round-trip trades per instId using net-position
// accounting: a trip opens when position leaves flat and closes when it
// returns to flat. Realized PnL is summed from OKX's per-fill fillPnl.
function buildRoundTrips(fills) {
  const bySym = {};
  for (const f of (fills || [])) { if (f?.instId) (bySym[f.instId] = bySym[f.instId] || []).push(f); }
  const trips = [];
  for (const [instId, list] of Object.entries(bySym)) {
    const sorted = list.slice().sort((a, b) => new Date(a.ts) - new Date(b.ts));
    let pos = 0, entryNotional = 0, entryQty = 0, openTs = null, realized = 0, fees = 0, entrySide = null;
    for (const f of sorted) {
      const sz = Math.abs(Number(f.fillSz) || 0);
      const px = Number(f.fillPx) || 0;
      const signed = (f.side === 'buy') ? sz : -sz;
      fees += Math.abs(Number(f.fee) || 0);
      realized += Number(f.pnl) || 0;
      const before = pos;
      if (before === 0) { openTs = f.ts; entrySide = signed > 0 ? 'long' : 'short'; entryNotional = px * sz; entryQty = sz; }
      else if (Math.sign(signed) === Math.sign(before)) { entryNotional += px * sz; entryQty += sz; }
      pos = before + signed;
      if (before !== 0 && pos === 0) {
        trips.push({ instId, side: entrySide, entryPx: entryQty ? entryNotional / entryQty : px,
          exitPx: px, qty: entryQty, pnl: realized, fee: fees, openTs, closeTs: f.ts });
        entryNotional = 0; entryQty = 0; realized = 0; fees = 0; openTs = null; entrySide = null;
      }
    }
  }
  return trips.sort((a, b) => new Date(b.closeTs) - new Date(a.closeTs));
}

// Attach a realized R-multiple to a trip using the nearest effective stop from
// algo history (matched by instId, closest in time to the close). Null if none.
function attachRealizedR(trip, histAlgos) {
  const cand = (histAlgos || []).filter(a => a.instId === trip.instId && a.slTriggerPx != null);
  if (!cand.length) return { ...trip, rMultiple: null, slUsed: null };
  const closeMs = new Date(trip.closeTs).getTime();
  cand.sort((a, b) => Math.abs((a.triggerTime || a.cTime || 0) - closeMs) - Math.abs((b.triggerTime || b.cTime || 0) - closeMs));
  const sl = cand[0].slTriggerPx;
  const dir = trip.side === 'short' ? -1 : 1;
  const risk = Math.abs(trip.entryPx - sl);
  const rMultiple = risk > 0 ? ((trip.exitPx - trip.entryPx) * dir) / risk : null;
  return { ...trip, rMultiple, slUsed: sl };
}

// Five-factor crypto Ellipse Score. Returns the same shape the radar expects.
function computeCryptoEllipseScore({ trades, positions, algos, snapshots }) {
  const live = algos?.live || [];
  const hist = algos?.history || [];
  const trips = buildRoundTrips(trades).map(t => attachRealizedR(t, hist));
  const n = trips.length;
  const zero = CRYPTO_SCORE_FACTORS.map(f => ({ ...f, pct: 0, value: 0, detail: '—' }));
  if (n < 3) return { score: 0, available: false, tradeCount: n, factors: zero, provisional: true, caps: [], trips };

  // Stop discipline — closed trips with a known stop + open positions carrying one.
  const withStop = trips.filter(t => t.slUsed != null).length;
  const liveWithStop = (positions || []).filter(p => live.some(a => a.instId === p.instId && a.slTriggerPx != null)).length;
  const stopBase = n + (positions?.length || 0);
  const stopPct = clamp01((withStop + liveWithStop) / (stopBase || 1));

  // Realized expectancy in R.
  const rs = trips.map(t => t.rMultiple).filter(v => Number.isFinite(v));
  const expR = rs.length ? mean(rs) : null;
  const expPct = expR == null ? 0.3 : clamp01((expR + 0.2) / 1.2); // ~+1R ≈ full marks

  // Reward:Risk quality — average win magnitude ÷ average loss magnitude.
  const pnls = trips.map(t => Number(t.pnl) || 0);
  const winMags = pnls.filter(v => v > 0);
  const lossMags = pnls.filter(v => v < 0).map(Math.abs);
  const avgW = mean(winMags), avgL = mean(lossMags);
  const rr = avgL > 0 ? avgW / avgL : (avgW > 0 ? 2.5 : 0);
  const rrPct = clamp01(rr / 2.5); // 2.5:1 ≈ full marks

  // Win-rate vs breakeven implied by RR.
  const wr = winMags.length / n;
  const be = rr > 0 ? 1 / (1 + rr) : 0.5;
  const winPct = clamp01(0.5 + (wr - be) * 2.5);

  // Drawdown control from equity snapshots.
  const eq = (snapshots || []).map(s => Number(s.totalEq) || 0).filter(v => v > 0);
  let ddPct = 0.6, ddDetail = 'not enough equity history';
  if (eq.length > 2) {
    let peak = eq[0], maxDD = 0;
    for (const v of eq) { peak = Math.max(peak, v); maxDD = Math.max(maxDD, (peak - v) / peak); }
    ddPct = clamp01(1 - maxDD / 0.25); // 25% drawdown ≈ zero
    ddDetail = `max drawdown ${(maxDD * 100).toFixed(1)}%`;
  }

  const raw = {
    stopDiscipline: { pct: stopPct, detail: `${withStop + liveWithStop}/${stopBase} with a stop set` },
    expectancyR:    { pct: expPct, detail: expR == null ? 'no R data yet' : `${expR >= 0 ? '+' : ''}${expR.toFixed(2)}R avg` },
    rrQuality:      { pct: rrPct, detail: `${rr.toFixed(2)}:1 avg win:loss` },
    winVsBE:        { pct: winPct, detail: `${(wr * 100).toFixed(0)}% win vs ${(be * 100).toFixed(0)}% breakeven` },
    drawdown:       { pct: ddPct, detail: ddDetail },
  };
  const factors = CRYPTO_SCORE_FACTORS.map(f => ({ ...f, pct: raw[f.key].pct, value: raw[f.key].pct * f.weight, detail: raw[f.key].detail }));
  let score = Math.round(factors.reduce((s, f) => s + f.value, 0));
  const caps = [];
  if (expR != null && expR <= 0) { score = Math.min(score, 45); caps.push('Negative expectancy — capped at 45'); }
  return { score, factors, available: true, tradeCount: n, provisional: n < 15, caps, trips };
}

// ---- Shared Ellipse Score panel: 5-axis radar + factor breakdown -------------
function EllipseScorePanel({ trades, rules, size = 168, compact = false, horizontal = false }) {
  const theme = useTheme();
  const { score, factors, available, provisional, caps, ruleLabel } = computeEllipseScore(trades, rules);

  const band = score >= 75 ? { label: 'Strong', color: theme.pos }
    : score >= 55 ? { label: 'Developing', color: theme.accent }
    : score >= 35 ? { label: 'Needs work', color: theme.warn }
    : { label: 'At risk', color: theme.neg };

  const r = horizontal ? 132 : size;
  const cx = r / 2, cy = r / 2, maxR = r * 0.36;
  const pt = (i, frac) => {
    const a = (Math.PI * 2 * i) / factors.length - Math.PI / 2;
    return [cx + Math.cos(a) * maxR * frac, cy + Math.sin(a) * maxR * frac];
  };
  const ring = (f) => factors.map((_, i) => pt(i, f).join(',')).join(' ');
  const shape = factors.map((f, i) => pt(i, Math.max(f.pct, 0.02)).join(',')).join(' ');

  const Radar = () => (
    <svg width={r} height={r} role="img" aria-label={`Ellipse score ${score} of 100`}>
      {[1, 0.66, 0.33].map((f, i) => (
        <polygon key={i} points={ring(f)} fill="none" stroke={theme.cardBorder} strokeWidth="1" opacity={1 - i * 0.25} />
      ))}
      {factors.map((_, i) => { const [x, y] = pt(i, 1); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={theme.cardBorder} strokeWidth="1" opacity="0.5" />; })}
      <polygon points={shape} fill="rgba(139,92,246,0.28)" stroke={theme.primary} strokeWidth="2" strokeLinejoin="round" />
      {factors.map((f, i) => { const [x, y] = pt(i, Math.max(f.pct, 0.02)); return <circle key={i} cx={x} cy={y} r="3" fill={theme.primaryHi} />; })}
    </svg>
  );

  const FactorBar = ({ f }) => (
    <div title={f.detail}>
      <div className="flex items-baseline justify-between gap-2" style={{ marginBottom: 5 }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: theme.text }}>{f.label}</span>
        <span style={{ fontSize: 10.5, color: theme.textFaint, fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>
          {Math.round(f.value)}/{f.weight}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(20,17,31,0.08)', overflow: 'hidden' }}>
        <div className="progress-bar-animate" style={{ height: '100%', width: `${f.pct * 100}%`, borderRadius: 999, background: theme.primaryGrad }} />
      </div>
      <div style={{ fontSize: 10, color: theme.textFaint, marginTop: 4, lineHeight: 1.35 }}>{f.detail}</div>
    </div>
  );

  const Caps = () => caps?.length > 0 ? (
    <div style={{ marginTop: 10, padding: '7px 10px', borderRadius: 10, background: provisional ? 'rgba(245,158,11,0.1)' : 'rgba(244,85,122,0.1)', border: `1px solid ${provisional ? 'rgba(245,158,11,0.3)' : 'rgba(244,85,122,0.3)'}` }}>
      {caps.map((c, i) => <div key={i} style={{ fontSize: 10.5, color: provisional ? theme.warn : theme.neg, fontWeight: 500 }}>{c}</div>)}
    </div>
  ) : null;

  if (!available) {
    return (
      <div className="card" style={{ padding: 18 }}>
        <div className="stat-label">Ellipse Score</div>
        <div style={{ padding: '26px 0', textAlign: 'center', fontSize: 12.5, color: theme.textFaint }}>
          Log at least 3 closed trades to generate a score.
        </div>
      </div>
    );
  }

  // Wide layout: radar + score on the left, factors across the remaining width.
  // Uses horizontal space so the card stays short and its row neighbours don't
  // stretch into dead space.
  if (horizontal) {
    return (
      <div className="card" style={{ padding: 18 }}>
        <div className="flex items-center justify-between gap-2" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
          <div className="flex items-baseline gap-2" style={{ flexWrap: 'wrap' }}>
            <div className="stat-label">Ellipse Score</div>
            {ruleLabel && <span style={{ fontSize: 10.5, color: theme.textFaint }}>scored against {ruleLabel}</span>}
          </div>
          <span className="badge" style={{ background: `${band.color}1f`, color: band.color }}>{band.label}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
          <div className="flex items-center gap-3" style={{ flexShrink: 0 }}>
            <Radar />
            <div>
              <div style={{ fontSize: 40, fontWeight: 800, color: band.color, letterSpacing: '-1.4px', lineHeight: 1 }}>{score}</div>
              <div style={{ fontSize: 12, color: theme.textFaint, marginTop: 2 }}>out of 100</div>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 300, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
            {factors.map(f => <FactorBar key={f.key} f={f} />)}
          </div>
        </div>
        <Caps />
      </div>
    );
  }

  // Vertical column: sits beside stacked chart cards, so the factor list grows
  // to absorb any extra row height instead of leaving a gap at the bottom.
  return (
    <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column' }}>
      <div className="flex items-center justify-between gap-2">
        <div className="stat-label">Ellipse Score</div>
        <span className="badge" style={{ background: `${band.color}1f`, color: band.color }}>{band.label}</span>
      </div>
      {ruleLabel && (
        <div style={{ fontSize: 10.5, color: theme.textFaint, marginTop: 4 }}>vs {ruleLabel}</div>
      )}
      <div className="flex items-center justify-center" style={{ marginTop: 6 }}><Radar /></div>
      <div className="flex items-baseline justify-center gap-2" style={{ marginTop: 2, marginBottom: 14 }}>
        <span style={{ fontSize: 34, fontWeight: 800, color: band.color, letterSpacing: '-1px' }}>{score}</span>
        <span style={{ fontSize: 13, color: theme.textFaint }}>/ 100</span>
      </div>
      {!compact && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 11, justifyContent: 'space-between' }}>
          {factors.map(f => <FactorBar key={f.key} f={f} />)}
        </div>
      )}
      <Caps />
    </div>
  );
}

// ---- Shared chart cards -----------------------------------------------------
// The chart body flex-fills so cards in a grid row never leave dead space when a
// taller sibling (the score panel) sets the row height.
function ChartCard({ title, right, children, minHeight = 210 }) {
  return (
    <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', minHeight: minHeight + 60 }}>
      <div className="flex items-center justify-between gap-2">
        <div className="stat-label">{title}</div>
        {right}
      </div>
      <div style={{ flex: 1, minHeight, marginTop: 12 }}>{children}</div>
    </div>
  );
}

const EmptyChart = ({ theme, label = 'No data yet' }) => (
  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textFaint, fontSize: 12 }}>{label}</div>
);

// Cumulative P&L with the fill/stroke split at y=0 — green above, red below.
function CumulativePnlChart({ data, theme, id = 'cum' }) {
  if (!data?.length) return <EmptyChart theme={theme} />;
  const vals = data.map(d => d.pnl);
  const max = Math.max(...vals), min = Math.min(...vals);
  const off = max <= 0 ? 0 : min >= 0 ? 1 : max / (max - min);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id={`${id}Fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset={off} stopColor={theme.pos} stopOpacity={0.32} />
            <stop offset={off} stopColor={theme.neg} stopOpacity={0.32} />
          </linearGradient>
          <linearGradient id={`${id}Stroke`} x1="0" y1="0" x2="0" y2="1">
            <stop offset={off} stopColor={theme.pos} />
            <stop offset={off} stopColor={theme.neg} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: theme.textFaint }} />
        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: theme.textFaint }} tickFormatter={v => `$${v}`} width={60} />
        <Tooltip contentStyle={{ background: theme.card, border: `1px solid ${theme.cardBorder}`, borderRadius: 12, fontSize: 12, color: theme.text }} labelStyle={{ color: theme.textMuted }} formatter={(v) => [`$${v.toFixed(2)}`, 'Cumulative']} />
        <ReferenceLine y={0} stroke={theme.borderStrong} strokeDasharray="3 3" />
        <Area type="monotone" dataKey="pnl" stroke={`url(#${id}Stroke)`} fill={`url(#${id}Fill)`} strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function DailyPnlChart({ data, theme }) {
  if (!data?.length) return <EmptyChart theme={theme} />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: theme.textFaint }} />
        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: theme.textFaint }} tickFormatter={v => `$${v}`} width={60} />
        <Tooltip contentStyle={{ background: theme.card, border: `1px solid ${theme.cardBorder}`, borderRadius: 12, fontSize: 12, color: theme.text }} labelStyle={{ color: theme.textMuted }} formatter={(v) => [`$${v.toFixed(2)}`, 'Daily P&L']} cursor={{ fill: theme.hoverBg }} />
        <ReferenceLine y={0} stroke={theme.borderStrong} />
        <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>{data.map((e, i) => <Cell key={i} fill={e.pnl >= 0 ? theme.pos : theme.neg} />)}</Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Group a normalized trade list into per-day net and running cumulative series.
function buildPnlSeries(trades, { limit = 14 } = {}) {
  const byDay = {};
  for (const t of trades) {
    const d = t.date || (t.ts || '').slice(0, 10);
    if (!d) continue;
    byDay[d] = (byDay[d] || 0) + (Number(t.pnl) || 0) - Math.abs(Number(t.fee) || 0);
  }
  const allDays = Object.keys(byDay).sort();
  const days = allDays.slice(-limit);
  // Seed the running total with days before the visible window so the cumulative
  // line is a true total rather than restarting at 0 inside the window.
  let cum = allDays.slice(0, allDays.length - days.length).reduce((s, d) => s + byDay[d], 0);
  const cumulative = [], daily = [];
  for (const d of days) {
    cum += byDay[d];
    cumulative.push({ date: d.slice(5), pnl: +cum.toFixed(2) });
    daily.push({ date: d.slice(5), pnl: +byDay[d].toFixed(2) });
  }
  return { cumulative, daily };
}

// Crypto fills -> the shape every shared component expects.
const cryptoToNormalized = (t) => ({
  id: t.id,
  date: (t.ts || '').slice(0, 10),
  time: (t.ts || '').slice(11, 16),
  symbol: coinFromInst(t.instId),
  side: t.posSide === 'short' ? 'Short' : 'Long',
  entry: t.fillPx, exit: t.fillPx, lots: t.fillSz,
  pnl: (Number(t.pnl) || 0) - Math.abs(Number(t.fee) || 0),
  marketStructure: '', notes: t.notes || '',
});

// Average win/loss for the current trade set, so a trade can be graded against
// the trader's own norm rather than raw currency.
function outcomeContext(trades) {
  const pnls = (trades || []).filter(t => typeof t.pnl === 'number').map(netOf);
  const wins = pnls.filter(v => v > 0), losses = pnls.filter(v => v < 0).map(Math.abs);
  return { avgWin: mean(wins), avgLoss: mean(losses) };
}

// Small grade chip used in trade lists.
function TradeGradeBadge({ trade, theme, ctx, showScore = true }) {
  const s = computeTradeScore(trade, ctx);
  if (!s) return null;
  const c = s.score >= 80 ? theme.pos : s.score >= 65 ? theme.accent : s.score >= 50 ? theme.warn : theme.neg;
  return (
    <span
      className="badge"
      aria-label={`Trade quality grade ${s.grade}, score ${s.score} of 100`}
      title={`Trade quality: ${s.grade} (${s.score}/100)\n` + s.parts.map(p => `${p.label}: ${p.pts}/${p.max}${p.note ? ` (${p.note})` : ''}`).join('\n')}
      style={{ background: `${c}1f`, color: c, fontFamily: "'JetBrains Mono', monospace" }}
    >
      {s.grade}{showScore && ` ${s.score}`}
    </span>
  );
}

// Crypto P&L analytics from a list of trades (fills)
const computeCryptoStats = (trades) => {
  const closed = trades.filter(t => typeof t.pnl === 'number');
  const realized = closed.filter(t => t.pnl !== 0);
  const wins = realized.filter(t => t.pnl > 0);
  const losses = realized.filter(t => t.pnl < 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const totalPnl = closed.reduce((s, t) => s + t.pnl, 0);
  const totalFees = Math.abs(trades.reduce((s, t) => s + (t.fee || 0), 0));
  return {
    totalPnl, totalFees, netPnl: totalPnl - totalFees,
    tradeCount: trades.length, realizedCount: realized.length,
    winCount: wins.length, lossCount: losses.length,
    winRate: realized.length ? (wins.length / realized.length) * 100 : 0,
    grossProfit, grossLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0),
    avgWin: wins.length ? grossProfit / wins.length : 0,
    avgLoss: losses.length ? grossLoss / losses.length : 0,
    largestWin: wins.length ? Math.max(...wins.map(t => t.pnl)) : 0,
    largestLoss: losses.length ? Math.min(...losses.map(t => t.pnl)) : 0,
  };
};

const COIN_COLORS = ['#8b5cf6', '#22d3a5', '#a855f7', '#f59e0b', '#38bdf8', '#ec4899', '#f4557a', '#14b8a6', '#c084fc', '#f97316'];
const coinFromInst = (instId) => (instId || '').split('-')[0] || instId;

// ==================== MAIN APP ====================
export default function TradingJournal() {
  const [darkMode, setDarkMode] = useState(loadDarkMode);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('ellipse_sidebar_collapsed') === '1'; } catch { return false; }
  });
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

  // ---- Crypto (OKX) state ----
  const [cryptoTrades, setCryptoTrades] = useState([]);
  const [cryptoSnapshots, setCryptoSnapshots] = useState([]);
  const [cryptoChallenges, setCryptoChallenges] = useState([]);
  const [cryptoLive, setCryptoLive] = useState({ balance: null, positions: [] });
  const [cryptoAlgos, setCryptoAlgos] = useState({ live: [], history: [], pending: [] });
  const [cryptoFunding, setCryptoFunding] = useState({ totalFunding: 0, byInst: {}, recent: [] });
  const [cryptoLiveFills, setCryptoLiveFills] = useState([]); // fills for the currently-viewed account (sub-accounts are live-only)
  const [cryptoPnl, setCryptoPnl] = useState([]); // OKX closed-position realized P&L (source for Net P&L + calendar)
  const [syncingOKX, setSyncingOKX] = useState(false);
  const [okxError, setOkxError] = useState(null);
  const [lastSync, setLastSync] = useState(() => {
    try { const v = localStorage.getItem('ellipse_okx_last_sync'); return v ? new Date(parseInt(v, 10)) : null; } catch { return null; }
  });
  const [cryptoSubTab, setCryptoSubTab] = useState('portfolio');
  const [showNewCryptoChallenge, setShowNewCryptoChallenge] = useState(false);
  const [subAccounts, setSubAccounts] = useState([]);
  const [selectedOkxAccount, setSelectedOkxAccount] = useState('main');
  // Crypto state starts empty, so the localStorage writers below must NOT run
  // until the initial load has resolved — otherwise they persist [] over the
  // cached data before loadData() gets a chance to read it back.
  const cryptoHydrated = useRef(false);
  // syncOKX is called from effects as well as the button; these refs keep it
  // correct without making it a dependency that re-triggers those effects.
  const cryptoTradesRef = useRef([]);
  const syncingRef = useRef(false);
  const lastSyncRef = useRef(null);

  useEffect(() => { localStorage.setItem('ellipse_darkMode', darkMode); }, [darkMode]);
  useEffect(() => { try { localStorage.setItem('ellipse_sidebar_collapsed', sidebarCollapsed ? '1' : '0'); } catch {} }, [sidebarCollapsed]);

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
            pnl: parseFloat(t.pnl) || 0, commission: t.commission, swap: t.swap,
            marketStructure: t.market_structure,
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
              phaseHistory: Array.isArray(c.phase_history) ? c.phase_history : [],
              detectedSplits: Array.isArray(c.detected_splits) ? c.detected_splits : [],
              phases: (Array.isArray(c.phases) ? c.phases : []) .length > 0 ? c.phases : [{ name: 'Phase 1', profitTarget: 10, maxDailyDrawdown: 5, maxTotalDrawdown: 10, minTradingDays: 1, maxTradingDays: 30, drawdownType: 'balance' }],
              account: c.account || '',
              startDate: c.start_date,
              phaseStartDates: c.phase_start_dates || {},
              tradePhase: c.trade_phase || {},
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

        // Load crypto trades, snapshots, challenges — tables may not exist yet.
        // NOTE: Supabase returns { data:null, error } instead of throwing when a
        // table is missing, so we must check .error explicitly and fall back to
        // localStorage per-resource (a plain try/catch never fires here).
        const loadLocalCrypto = (key) => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } };
        let ctRes = {}, csRes = {}, cchRes = {};
        try {
          [ctRes, csRes, cchRes] = await Promise.all([
            supabase.from('crypto_trades').select('*').order('ts', { ascending: false }).limit(1000),
            supabase.from('crypto_snapshots').select('*').order('ts', { ascending: true }).limit(1000),
            supabase.from('crypto_challenges').select('*').order('created_at', { ascending: false }),
          ]);
        } catch (e) { console.warn('Crypto load failed:', e?.message); }
        // Read the cache BEFORE opening the write gate, so the values below are
        // the stored ones rather than anything the writers could have clobbered.
        const localTrades = loadLocalCrypto('ellipse_crypto_trades');
        const localSnaps = loadLocalCrypto('ellipse_crypto_snapshots');
        const localChals = loadLocalCrypto('ellipse_crypto_challenges');
        setCryptoTrades((ctRes.data && !ctRes.error) ? ctRes.data.map(mapCryptoTradeRow) : localTrades);
        // Snapshots are append-only: union every source rather than letting an
        // empty read wipe history — that empty-array-truthy branch was resetting
        // the equity curve on every reload.
        //
        // Primary source of truth is the SERVER route /api/okx/snapshots, which
        // reads with the service-role key and so returns the hourly cron history
        // even when RLS blocks the anon client. The direct anon read (csRes) only
        // returns rows when RLS is off; localStorage is the offline fallback.
        // mergeSnapshots dedupes by timestamp and prefers real DB ids over
        // local_* placeholders, so unioning all three can never lose points.
        const dbSnaps = (csRes.data && !csRes.error) ? csRes.data.map(mapSnapshotRow) : [];
        let serverSnaps = [];
        try {
          const sr = await fetch('/api/okx/snapshots?limit=5000');
          if (sr.ok && (sr.headers.get('content-type') || '').includes('application/json')) {
            const body = await sr.json();
            if (Array.isArray(body?.snapshots)) serverSnaps = body.snapshots.map(mapSnapshotRow);
          }
        } catch (e) { console.warn('Server snapshot read failed, using DB/local cache:', e?.message); }
        setCryptoSnapshots(mergeSnapshots(serverSnaps, dbSnaps, localSnaps));
        setCryptoChallenges((cchRes.data && !cchRes.error) ? cchRes.data.map(mapCryptoChallengeRow) : localChals);
        if (cchRes.error) console.warn('crypto_challenges not in DB (using localStorage). Run supabase/crypto_migration.sql to persist across devices/deploys.');
        // Cache is now loaded into state — safe to let the writers persist changes.
        cryptoHydrated.current = true;

        setSynced(true);
      } catch (err) {
        console.error('Error loading trades/accounts:', err);
        setSynced(false);
      }
      // Open the write gate even if loading threw, so later edits still persist.
      cryptoHydrated.current = true;
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

  // Crypto localStorage fallbacks.
  // Gated on cryptoHydrated: these effects fire on mount with empty state, and
  // loadData() only reads localStorage after its awaits resolve — so without the
  // guard they wipe the cache before it is ever read.
  useEffect(() => { if (!cryptoHydrated.current) return; try { localStorage.setItem('ellipse_crypto_trades', JSON.stringify(cryptoTrades.slice(0, 1000))); } catch {} }, [cryptoTrades]);
  useEffect(() => { if (!cryptoHydrated.current) return; try { localStorage.setItem('ellipse_crypto_snapshots', JSON.stringify(cryptoSnapshots.slice(-1000))); } catch {} }, [cryptoSnapshots]);
  useEffect(() => { if (!cryptoHydrated.current) return; try { localStorage.setItem('ellipse_crypto_challenges', JSON.stringify(cryptoChallenges)); } catch {} }, [cryptoChallenges]);

  // Mirror trades into a ref so syncOKX can dedupe against current data even
  // when invoked from an effect that captured an older render.
  useEffect(() => { cryptoTradesRef.current = cryptoTrades; }, [cryptoTrades]);
  useEffect(() => { lastSyncRef.current = lastSync; }, [lastSync]);

  // ---- OKX sync: pull balance, positions, fills via serverless proxy ----
  const syncOKX = async () => {
    if (syncingRef.current) return; // never let two syncs overlap
    syncingRef.current = true;
    setSyncingOKX(true);
    setOkxError(null);
    try {
      const getJson = async (url) => {
        const r = await fetch(url);
        const ct = r.headers.get('content-type') || '';
        if (!ct.includes('application/json')) {
          await r.text().catch(() => '');
          throw new Error(`API route ${url} returned ${r.status} (not JSON). The /api/okx serverless functions aren't reachable — make sure they're deployed to Vercel (they don't run under "vite dev"; use "vercel dev" locally).`);
        }
        return r.json();
      };
      // Scope live data to the selected account. 'all' aggregates via the
      // master key, so it maps to 'main' for these per-account endpoints.
      const acct = (selectedOkxAccount && selectedOkxAccount !== 'all') ? selectedOkxAccount : 'main';
      const isMainScope = acct === 'main';
      const acctQs = `account=${encodeURIComponent(acct)}`;
      const [balRes, posRes, fillsRes] = await Promise.all([
        getJson(`/api/okx/balance?${acctQs}`),
        getJson(`/api/okx/positions?${acctQs}`),
        getJson(`/api/okx/fills?limit=100&${acctQs}`),
      ]);

      // Sub-account balances are best-effort: the master key may not have
      // sub-accounts, or may lack permission. Never fail the whole sync on it.
      getJson('/api/okx/subaccounts')
        .then(r => setSubAccounts(r?.error ? [] : (r.accounts || [])))
        .catch(() => setSubAccounts([]));

      // SL/TP (algo orders) are best-effort too: they power the RR analytics
      // and crypto Ellipse Score, but a missing order-read permission must not
      // break the core sync. Scope to the account currently being viewed.
      getJson(`/api/okx/algo?${acctQs}`)
        .then(r => setCryptoAlgos(r?.error ? { live: [], history: [], pending: [] } : { live: r.live || [], history: r.history || [], pending: r.pending || [] }))
        .catch(() => setCryptoAlgos({ live: [], history: [], pending: [] }));

      // Funding fees (perp carry cost) — pulled separately from trade P&L.
      getJson(`/api/okx/funding?${acctQs}`)
        .then(r => setCryptoFunding(r?.error ? { totalFunding: 0, byInst: {}, recent: [] } : { totalFunding: r.totalFunding || 0, byInst: r.byInst || {}, recent: r.recent || [] }))
        .catch(() => setCryptoFunding({ totalFunding: 0, byInst: {}, recent: [] }));

      // Closed-position realized P&L from OKX — powers the Net P&L + calendar.
      getJson(`/api/okx/pnl-history?${acctQs}`)
        .then(r => setCryptoPnl(Array.isArray(r?.positions) ? r.positions : []))
        .catch(() => setCryptoPnl([]));
      if (balRes?.error || posRes?.error || fillsRes?.error) {
        throw new Error(balRes?.msg || posRes?.msg || fillsRes?.msg || balRes?.error || 'OKX sync failed. Check API keys / Vercel env vars.');
      }

      setCryptoLive({ balance: balRes, positions: posRes.positions || [] });

      // Live fills for the currently-selected account, mapped to the trade shape.
      // Sub-account fills are shown live (not persisted into the main journal).
      const mapFill = (f) => ({
        id: 'live_' + f.tradeId, tradeId: f.tradeId, ordId: f.ordId, instId: f.instId,
        side: f.side, posSide: f.posSide, fillSz: f.fillSz, fillPx: f.fillPx,
        pnl: f.fillPnl, fee: f.fee, feeCcy: f.feeCcy, execType: f.execType,
        ts: new Date(f.ts).toISOString(), source: 'okx', notes: '', chartImage: '',
      });
      setCryptoLiveFills((fillsRes.fills || []).map(mapFill));

      // Only the MAIN account persists into the journal / equity curve / challenges;
      // sub-account views are live-only so they never pollute the main history.
      // Dedupe fills against what we already have
      const existingIds = new Set(cryptoTradesRef.current.map(t => t.tradeId).filter(Boolean));
      const newFills = (fillsRes.fills || []).filter(f => f.tradeId && !existingIds.has(f.tradeId));
      if (isMainScope && newFills.length) {
        const rows = newFills.map(f => ({
          trade_id: f.tradeId, ord_id: f.ordId, inst_id: f.instId, side: f.side,
          pos_side: f.posSide, fill_sz: f.fillSz, fill_px: f.fillPx, pnl: f.fillPnl,
          fee: f.fee, fee_ccy: f.feeCcy, exec_type: f.execType,
          ts: new Date(f.ts).toISOString(), source: 'okx',
        }));
        let inserted = null;
        try {
          const { data } = await supabase.from('crypto_trades').upsert(rows, { onConflict: 'trade_id' }).select();
          inserted = data;
        } catch {}
        const localNew = (inserted && inserted.length ? inserted.map(mapCryptoTradeRow)
          : newFills.map(f => ({
              id: 'local_' + f.tradeId, tradeId: f.tradeId, ordId: f.ordId, instId: f.instId,
              side: f.side, posSide: f.posSide, fillSz: f.fillSz, fillPx: f.fillPx,
              pnl: f.fillPnl, fee: f.fee, feeCcy: f.feeCcy, execType: f.execType,
              ts: new Date(f.ts).toISOString(), source: 'okx', notes: '', chartImage: '',
            })));
        setCryptoTrades(prev => [...localNew, ...prev].sort((a, b) => new Date(b.ts) - new Date(a.ts)));
      }

      // Snapshot for the equity curve + challenge balances — MAIN account only,
      // so viewing a sub-account never writes its equity into the main curve.
      if (isMainScope) {
        const snapRow = {
          ts: new Date().toISOString(), total_eq: balRes.totalEq, upl: balRes.upl,
          balances: balRes.details || [], positions: posRes.positions || [], source: 'okx',
        };
        let snapInserted = null;
        try {
          const { data, error } = await supabase.from('crypto_snapshots').insert(snapRow).select().single();
          if (error) console.warn('crypto_snapshots insert failed, keeping local copy:', error.message);
          snapInserted = data;
        } catch (e) { console.warn('crypto_snapshots insert threw, keeping local copy:', e?.message); }
        setCryptoSnapshots(prev => [...prev, snapInserted ? mapSnapshotRow(snapInserted) : { ...mapSnapshotRow(snapRow), id: 'local_' + Date.now() }]);

        setCryptoChallenges(prev => prev.map(c => {
          if (c.status !== 'active') return c;
          const updated = { ...c, currentBalance: balRes.totalEq };
          supabase.from('crypto_challenges').update({ current_balance: balRes.totalEq, updated_at: new Date().toISOString() }).eq('id', c.id).then(() => {}, () => {});
          return updated;
        }));
      }

      const syncedAt = new Date();
      setLastSync(syncedAt);
      try { localStorage.setItem('ellipse_okx_last_sync', String(syncedAt.getTime())); } catch {}
    } catch (e) {
      setOkxError(e.message || 'OKX sync failed');
    }
    syncingRef.current = false;
    setSyncingOKX(false);
  };

  // ---- Auto-sync: on opening the Crypto tab when stale, then on an interval ----
  const OKX_STALE_MS = 5 * 60 * 1000;
  useEffect(() => {
    if (activeTab !== 'crypto' || loading) return;

    const syncIfStale = () => {
      if (document.visibilityState !== 'visible') return;
      const last = lastSyncRef.current;
      if (!last || Date.now() - last.getTime() > OKX_STALE_MS) syncOKX();
    };

    syncIfStale();
    const timer = setInterval(syncIfStale, OKX_STALE_MS);
    document.addEventListener('visibilitychange', syncIfStale);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', syncIfStale); };
    // syncOKX and lastSync are read through refs so this only re-arms on tab change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, loading]);

  // Re-sync when the viewed account changes, so its live positions/balance load.
  const didAccountMount = useRef(false);
  useEffect(() => {
    if (!didAccountMount.current) { didAccountMount.current = true; return; }
    if (activeTab === 'crypto' && !loading) syncOKX();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOkxAccount]);

  // Crypto challenge CRUD
  const addCryptoChallenge = async (ch) => {
    try {
      const row = {
        name: ch.name, start_balance: ch.startBalance, target_balance: ch.targetBalance,
        current_balance: ch.currentBalance || ch.startBalance, start_date: ch.startDate,
        target_date: ch.targetDate || null, status: 'active', milestones: ch.milestones || [], notes: ch.notes || '',
      };
      const { data, error } = await supabase.from('crypto_challenges').insert(row).select().single();
      if (!error && data) { setCryptoChallenges(prev => [mapCryptoChallengeRow(data), ...prev]); return; }
    } catch {}
    setCryptoChallenges(prev => [{ ...ch, id: 'local_' + Date.now(), status: 'active', currentBalance: ch.currentBalance || ch.startBalance }, ...prev]);
  };

  const updateCryptoChallenge = async (ch) => {
    try {
      await supabase.from('crypto_challenges').update({
        name: ch.name, start_balance: ch.startBalance, target_balance: ch.targetBalance,
        current_balance: ch.currentBalance, target_date: ch.targetDate || null,
        status: ch.status, milestones: ch.milestones || [], notes: ch.notes || '', updated_at: new Date().toISOString(),
      }).eq('id', ch.id);
    } catch {}
    setCryptoChallenges(prev => prev.map(c => c.id === ch.id ? ch : c));
  };

  const deleteCryptoChallenge = async (id) => {
    try { await supabase.from('crypto_challenges').delete().eq('id', id); } catch {}
    setCryptoChallenges(prev => prev.filter(c => c.id !== id));
  };

  const addCryptoTrade = async (t) => {
    try {
      const row = {
        inst_id: t.instId, side: t.side, pos_side: t.posSide, fill_sz: t.fillSz,
        fill_px: t.fillPx, pnl: t.pnl, fee: t.fee || 0, fee_ccy: t.feeCcy || 'USDT',
        ts: t.ts, source: 'manual', notes: t.notes || '', chart_image: t.chartImage || '',
      };
      const { data, error } = await supabase.from('crypto_trades').insert(row).select().single();
      if (!error && data) { setCryptoTrades(prev => [mapCryptoTradeRow(data), ...prev].sort((a, b) => new Date(b.ts) - new Date(a.ts))); return; }
    } catch {}
    setCryptoTrades(prev => [{ ...t, id: 'local_' + Date.now(), source: 'manual' }, ...prev].sort((a, b) => new Date(b.ts) - new Date(a.ts)));
  };

  const deleteCryptoTrade = async (id) => {
    try { await supabase.from('crypto_trades').delete().eq('id', id); } catch {}
    setCryptoTrades(prev => prev.filter(t => t.id !== id));
  };

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
      pnl: trade.pnl, commission: trade.commission, swap: trade.swap,
      market_structure: trade.marketStructure,
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
      pnl: trade.pnl,
      commission: trade.commission, swap: trade.swap,
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
      pnl: trade.pnl,
      commission: trade.commission, swap: trade.swap,
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
        phase_start_dates: challenge.phaseStartDates || {},
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
        status: challenge.status, phases: challenge.phases, notes: challenge.notes,
        phase_start_dates: challenge.phaseStartDates || {},
        trade_phase: challenge.tradePhase || {},
        phase_history: challenge.phaseHistory || [],
        detected_splits: challenge.detectedSplits || []
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
    dark: darkMode,
    // Base surfaces — near-black with a violet cast in dark, cool off-white in light
    bg: darkMode ? '#07060c' : '#f6f5fb',
    bgAlt: darkMode ? '#0b0a13' : '#eeecf7',
    card: darkMode ? '#100e1a' : '#ffffff',
    cardAlt: darkMode ? '#15121f' : '#faf9fe',
    cardBorder: darkMode ? '#221e33' : '#e5e1f2',
    borderStrong: darkMode ? '#302a47' : '#d5cfe9',
    // Type — muted/faint lightened for WCAG AA contrast on the dark surfaces
    text: darkMode ? '#f3f1fb' : '#14111f',
    textMuted: darkMode ? '#b7b2ce' : '#55506e',
    textFaint: darkMode ? '#8f89ab' : '#6f6a89',
    // Inputs
    inputBg: darkMode ? '#15121f' : '#ffffff',
    inputBorder: darkMode ? '#2a2440' : '#e0dbf0',
    hoverBg: darkMode ? '#1a1728' : '#f1eefb',
    // Accents
    primary: '#8b5cf6',
    primaryHi: '#a855f7',
    primarySoft: darkMode ? 'rgba(139, 92, 246, 0.16)' : 'rgba(139, 92, 246, 0.10)',
    primaryGrad: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
    accent: '#22d3a5',
    accentSoft: darkMode ? 'rgba(34, 211, 165, 0.14)' : 'rgba(34, 211, 165, 0.12)',
    pos: darkMode ? '#22d3a5' : '#0d9c78',
    neg: darkMode ? '#f4557a' : '#dc2f52',
    warn: '#f59e0b',
    // Effects
    glow: darkMode ? '0 0 0 1px rgba(139,92,246,0.18), 0 8px 32px rgba(124,58,237,0.22)' : '0 4px 16px rgba(99,72,180,0.10)',
    shadow: darkMode ? '0 4px 24px rgba(0,0,0,0.5)' : '0 2px 12px rgba(80,64,140,0.07)',
  };

  return (
    <ThemeContext.Provider value={theme}>
      <div className="min-h-screen" style={{
        background: darkMode
          ? `radial-gradient(1100px 620px at 18% -12%, rgba(124,58,237,0.16), transparent 62%),
             radial-gradient(900px 520px at 96% 8%, rgba(34,211,165,0.07), transparent 58%),
             ${theme.bg}`
          : `radial-gradient(1100px 620px at 18% -12%, rgba(139,92,246,0.10), transparent 62%),
             ${theme.bg}`,
        color: theme.text,
        fontFamily: "'Inter', system-ui, sans-serif",
      }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
          * { box-sizing: border-box; }
          /* Tell the browser which scheme native controls use, so date-picker
             text/icons, select dropdowns, scrollbars and autofill render with
             visible (light) text in dark mode instead of default black. */
          html { color-scheme: ${darkMode ? 'dark' : 'light'}; }
          ::selection { background: rgba(139,92,246,0.32); color: ${theme.text}; }

          /* ---- Surfaces ---- */
          .card {
            background: ${darkMode
              ? 'linear-gradient(160deg, rgba(30,25,48,0.72) 0%, rgba(16,14,26,0.94) 58%)'
              : theme.card};
            border: 1px solid ${theme.cardBorder};
            border-radius: 16px;
            box-shadow: ${theme.shadow};
          }
          .card-lg {
            background: ${darkMode
              ? 'linear-gradient(160deg, rgba(34,28,55,0.68) 0%, rgba(16,14,26,0.96) 62%)'
              : theme.card};
            border: 1px solid ${theme.cardBorder};
            border-radius: 20px;
            box-shadow: ${theme.shadow};
          }
          .card-hover { transition: border-color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease; }
          .card-hover:hover { border-color: ${theme.borderStrong}; transform: translateY(-2px); box-shadow: ${theme.glow}; }

          /* ---- Inputs ---- */
          .input { background: ${theme.inputBg}; border: 1px solid ${theme.inputBorder}; border-radius: 12px; padding: 11px 14px; font-size: 14px; color: ${theme.text}; width: 100%; transition: border-color 0.15s, box-shadow 0.15s, background 0.15s; }
          .input::placeholder { color: ${theme.textFaint}; }
          .input:hover { border-color: ${theme.borderStrong}; }
          .input:focus { outline: none; border-color: ${theme.primary}; box-shadow: 0 0 0 3px ${theme.primarySoft}; background: ${darkMode ? '#191529' : '#ffffff'}; }
          .input-sm { padding: 8px 12px; font-size: 13px; border-radius: 10px; }

          /* ---- Buttons ---- */
          .btn-primary {
            position: relative; background: ${theme.primaryGrad}; color: #ffffff; border: none;
            border-radius: 12px; padding: 10px 18px; font-size: 14px; font-weight: 600;
            letter-spacing: 0.1px; cursor: pointer;
            box-shadow: 0 2px 10px rgba(124,58,237,0.32), inset 0 1px 0 rgba(255,255,255,0.16);
            transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
          }
          .btn-primary:hover { transform: translateY(-1px); filter: brightness(1.08); box-shadow: 0 6px 22px rgba(139,92,246,0.45), inset 0 1px 0 rgba(255,255,255,0.2); }
          .btn-primary:active { transform: translateY(0); }
          .btn-ghost {
            background: ${darkMode ? 'rgba(255,255,255,0.03)' : '#ffffff'};
            border: 1px solid ${theme.cardBorder}; border-radius: 12px; padding: 10px 16px;
            font-size: 14px; font-weight: 500; color: ${theme.textMuted}; cursor: pointer;
            transition: border-color 0.15s, color 0.15s, background 0.15s;
          }
          .btn-ghost:hover { border-color: ${theme.borderStrong}; color: ${theme.text}; background: ${theme.hoverBg}; }
          .icon-btn {
            display: inline-flex; align-items: center; justify-content: center;
            padding: 10px; border-radius: 12px; border: 1px solid ${theme.cardBorder};
            background: ${darkMode ? 'rgba(255,255,255,0.03)' : '#ffffff'}; cursor: pointer;
            color: ${theme.textMuted}; transition: all 0.15s ease;
          }
          .icon-btn:hover { border-color: ${theme.primary}; color: ${theme.text}; background: ${theme.primarySoft}; }

          /* ---- Navigation ---- */
          .nav-item {
            position: relative; display: flex; align-items: center; gap: 12px;
            width: 100%; text-align: left; background: none; border: none;
            font-family: inherit; -webkit-appearance: none; appearance: none;
            padding: 10px 14px; border-radius: 12px; font-size: 13.5px; font-weight: 500;
            color: ${theme.textMuted}; cursor: pointer;
            transition: color 0.15s ease, background 0.15s ease;
          }
          .nav-item:hover { background: ${theme.hoverBg}; color: ${theme.text}; }
          .nav-item:focus-visible { outline: none; box-shadow: 0 0 0 2px ${theme.primary}; }
          /* Global keyboard focus ring for interactive elements */
          button:focus-visible, a:focus-visible, [role="button"]:focus-visible,
          select:focus-visible, input:focus-visible, textarea:focus-visible {
            outline: none; box-shadow: 0 0 0 3px ${theme.primarySoft}, 0 0 0 1px ${theme.primary};
          }
          .nav-item.active {
            background: ${darkMode
              ? 'linear-gradient(100deg, rgba(139,92,246,0.26) 0%, rgba(139,92,246,0.06) 100%)'
              : 'linear-gradient(100deg, rgba(139,92,246,0.16) 0%, rgba(139,92,246,0.04) 100%)'};
            color: ${darkMode ? '#ffffff' : '#5b21b6'}; font-weight: 600;
            box-shadow: inset 0 0 0 1px ${darkMode ? 'rgba(139,92,246,0.28)' : 'rgba(139,92,246,0.22)'};
          }
          .nav-item.active::before {
            content: ''; position: absolute; left: 0; top: 50%; transform: translateY(-50%);
            width: 3px; height: 18px; border-radius: 0 3px 3px 0; background: ${theme.primaryHi};
            box-shadow: 0 0 12px ${theme.primaryHi};
          }
          .sidebar-pocket {
            position: absolute; top: 50%; right: -13px; transform: translateY(-50%);
            width: 26px; height: 26px; border-radius: 999px; z-index: 30;
            display: flex; align-items: center; justify-content: center; cursor: pointer;
            background: ${darkMode ? '#181528' : '#ffffff'};
            border: 1px solid ${theme.cardBorder};
            color: ${theme.textMuted};
            box-shadow: ${darkMode ? '0 2px 10px rgba(0,0,0,0.55)' : '0 2px 8px rgba(80,64,140,0.14)'};
            transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
          }
          .sidebar-pocket:hover { transform: translateY(-50%) scale(1.12); }
          .sidebar-pocket:focus-visible { outline: none; border-color: ${theme.primary}; box-shadow: 0 0 0 3px ${theme.primarySoft}; }
          .sidebar-pocket:hover { color: ${theme.primaryHi}; border-color: ${theme.primary}; background: ${darkMode ? '#221c3a' : '#f5f2ff'}; }
          .nav-item-collapsed { justify-content: center; padding-left: 0; padding-right: 0; }
          .nav-item-collapsed.active::before { left: -12px; }
          .nav-section {
            display: flex; align-items: center; gap: 8px; padding: 16px 14px 8px;
            font-size: 10px; font-weight: 700; letter-spacing: 0.9px; text-transform: uppercase;
            color: ${theme.textFaint};
            min-height: 14px;
          }

          /* ---- Type ---- */
          .label { font-size: 12px; font-weight: 500; color: ${theme.textMuted}; margin-bottom: 6px; display: block; }
          .stat-value { font-size: 25px; font-weight: 700; color: ${theme.text}; letter-spacing: -0.5px; font-variant-numeric: tabular-nums; }
          .stat-label { font-size: 12px; font-weight: 600; color: ${theme.textMuted}; text-transform: uppercase; letter-spacing: 0.7px; }
          .eyebrow {
            display: inline-flex; align-items: center; gap: 7px; padding: 5px 12px;
            border-radius: 999px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.9px;
            text-transform: uppercase; color: ${darkMode ? '#c4b5fd' : '#6d28d9'};
            background: ${theme.primarySoft}; border: 1px solid ${darkMode ? 'rgba(139,92,246,0.26)' : 'rgba(139,92,246,0.2)'};
          }

          /* ---- Tables ---- */
          .table-header { font-size: 12px; font-weight: 600; color: ${theme.textMuted}; text-transform: uppercase; letter-spacing: 0.7px; padding: 13px 16px; background: ${darkMode ? 'rgba(255,255,255,0.02)' : '#faf9fe'}; border-bottom: 1px solid ${theme.cardBorder}; }
          .table-row { padding: 14px 16px; border-bottom: 1px solid ${theme.cardBorder}; cursor: pointer; transition: background 0.15s; }
          .table-row:hover { background: ${theme.hoverBg}; }
          .table-row:last-child { border-bottom: none; }

          /* ---- Badges ---- */
          .badge { display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; font-weight: 600; padding: 4px 11px; border-radius: 999px; letter-spacing: 0.2px; }
          .chip {
            display: inline-flex; align-items: center; gap: 5px; padding: 4px 11px; border-radius: 999px;
            font-size: 11px; font-weight: 500; color: ${theme.textMuted};
            background: ${darkMode ? 'rgba(255,255,255,0.045)' : 'rgba(20,17,31,0.045)'};
            border: 1px solid ${theme.cardBorder};
          }
          .chip-live { color: ${theme.accent}; background: ${theme.accentSoft}; border-color: ${darkMode ? 'rgba(34,211,165,0.3)' : 'rgba(34,211,165,0.28)'}; }
          .news-row { transition: background 0.15s ease; }
          .news-row:hover { background: ${theme.hoverBg} !important; }
          .news-row:last-child { border-bottom: none !important; }

          /* ---- Scrollbar ---- */
          .scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
          .scrollbar::-webkit-scrollbar-track { background: transparent; }
          .scrollbar::-webkit-scrollbar-thumb { background: ${darkMode ? '#2a2440' : '#ded9ee'}; border-radius: 999px; border: 2px solid transparent; background-clip: padding-box; }
          .scrollbar::-webkit-scrollbar-thumb:hover { background: ${darkMode ? '#3b3358' : '#c9c2e3'}; background-clip: padding-box; }

          /* ---- Motion ---- */
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes pulse-warning { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
          @keyframes pulse-dot { 0%, 100% { box-shadow: 0 0 0 0 ${theme.accent}55; } 70% { box-shadow: 0 0 0 6px transparent; } }
          .pulse-warn { animation: pulse-warning 1.5s ease-in-out infinite; }
          .pulse-dot { animation: pulse-dot 2s ease-out infinite; }
          .progress-bar-animate { transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1); }
          @media (prefers-reduced-motion: reduce) {
            * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
          }
        `}</style>

        <div className="flex h-screen">
          {/* Sidebar */}
          <aside style={{
            width: sidebarCollapsed ? 68 : 244,
            transition: 'width 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
            flexShrink: 0,
            position: 'relative',
            background: darkMode
              ? 'linear-gradient(180deg, rgba(24,20,40,0.86) 0%, rgba(10,9,17,0.92) 100%)'
              : 'rgba(255,255,255,0.86)',
            backdropFilter: 'blur(14px)',
            borderRight: `1px solid ${theme.cardBorder}`,
          }} className="flex flex-col">
            {/* Pocket toggle: sits astride the sidebar's right border, vertically
                centred, so collapsing is discoverable without stealing header space. */}
            <button
              onClick={() => setSidebarCollapsed(v => !v)}
              className="sidebar-pocket"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!sidebarCollapsed}
            >
              {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>
            {/* Height is pinned so this bottom border lines up exactly with the
                main header's — they sit side by side and were 3px apart. */}
            <div style={{ height: 82, flexShrink: 0, padding: sidebarCollapsed ? '0 15px' : '0 18px', display: 'flex', alignItems: 'center', borderBottom: `1px solid ${theme.cardBorder}` }}>
              <div className="flex items-center gap-3">
                <div style={{ width: 38, height: 38, borderRadius: 12, background: theme.primaryGrad, position: 'relative', overflow: 'hidden', boxShadow: '0 4px 16px rgba(124,58,237,0.45), inset 0 1px 0 rgba(255,255,255,0.22)' }}>
                  <div style={{ position: 'absolute', width: 22, height: 22, border: '2px solid rgba(255,255,255,0.92)', borderRadius: '50%', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}></div>
                  <div style={{ position: 'absolute', width: 10, height: 10, background: 'rgba(255,255,255,0.95)', borderRadius: '50%', top: 6, right: 6 }}></div>
                </div>
                {!sidebarCollapsed && (
                  <div style={{ whiteSpace: 'nowrap' }}>
                    <div style={{ fontSize: 16.5, fontWeight: 700, color: theme.text, letterSpacing: '-0.2px' }}>Ellipse</div>
                    <div style={{ fontSize: 10.5, color: theme.textFaint, letterSpacing: '0.6px', textTransform: 'uppercase', fontWeight: 600 }}>Trading Journal</div>
                  </div>
                )}
              </div>
            </div>

            <nav style={{ flex: 1, padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[
                { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
                { id: 'challenges', label: 'Challenges', icon: Trophy },
                { id: 'simulator', label: 'Simulator', icon: Dices },
                { id: 'journal', label: 'Journal', icon: BookOpen },
                { id: 'news', label: 'News', icon: Zap },
                { id: 'history', label: 'History', icon: Clock },
                { id: 'accounts', label: 'Accounts', icon: Wallet },
                { id: 'calendar', label: 'Calendar', icon: Calendar },
              ].map(item => (
                <button key={item.id} type="button" onClick={() => setActiveTab(item.id)} aria-current={activeTab === item.id ? 'page' : undefined} title={sidebarCollapsed ? item.label : undefined} aria-label={sidebarCollapsed ? item.label : undefined} className={`nav-item ${activeTab === item.id ? 'active' : ''} ${sidebarCollapsed ? 'nav-item-collapsed' : ''}`}>
                  <item.icon size={17} style={{ flexShrink: 0 }} />{!sidebarCollapsed && item.label}
                  {!sidebarCollapsed && item.id === 'challenges' && challenges.filter(c => c.status === 'active').length > 0 && (
                    <span style={{ marginLeft: 'auto', fontSize: 10, padding: '2px 8px', borderRadius: 999, background: theme.primarySoft, border: `1px solid ${darkMode ? 'rgba(139,92,246,0.35)' : 'rgba(139,92,246,0.25)'}`, color: darkMode ? '#c4b5fd' : '#6d28d9', fontWeight: 700 }}>
                      {challenges.filter(c => c.status === 'active').length}
                    </span>
                  )}
                </button>
              ))}

              {/* Crypto section */}
              <div className="nav-section">
                {sidebarCollapsed
                  ? <span style={{ flex: 1, height: 1, background: theme.cardBorder }}></span>
                  : <>Crypto<span style={{ flex: 1, height: 1, background: theme.cardBorder }}></span></>}
              </div>
              <button type="button" onClick={() => setActiveTab('crypto')} aria-current={activeTab === 'crypto' ? 'page' : undefined} title={sidebarCollapsed ? 'OKX Trading' : undefined} aria-label={sidebarCollapsed ? 'OKX Trading' : undefined} className={`nav-item ${activeTab === 'crypto' ? 'active' : ''} ${sidebarCollapsed ? 'nav-item-collapsed' : ''}`}>
                <Coins size={17} style={{ flexShrink: 0 }} />{!sidebarCollapsed && 'OKX Trading'}
                {!sidebarCollapsed && cryptoChallenges.filter(c => c.status === 'active').length > 0 && (
                  <span style={{ marginLeft: 'auto', fontSize: 10, padding: '2px 8px', borderRadius: 999, background: 'rgba(245,158,11,0.16)', border: '1px solid rgba(245,158,11,0.32)', color: '#fbbf24', fontWeight: 700 }}>
                    {cryptoChallenges.filter(c => c.status === 'active').length}
                  </span>
                )}
              </button>
            </nav>

            <div style={{ padding: 12, borderTop: `1px solid ${theme.cardBorder}` }}>
              {sidebarCollapsed ? (
                <div
                  title={`${loading ? 'Syncing' : synced ? 'Synced to cloud' : 'Offline'} · Today ${todayPnl >= 0 ? '+' : ''}${todayPnl.toFixed(2)}`}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}
                >
                  {loading
                    ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: theme.textMuted }} />
                    : <span className={synced ? 'pulse-dot' : undefined} style={{ width: 8, height: 8, borderRadius: 999, background: synced ? theme.accent : theme.neg, display: 'inline-block' }}></span>}
                  <span style={{ fontSize: 11, fontWeight: 700, color: todayPnl >= 0 ? theme.pos : theme.neg, fontFamily: "'JetBrains Mono', monospace" }}>
                    {todayPnl >= 0 ? '+' : ''}{Math.abs(todayPnl) >= 1000 ? (todayPnl / 1000).toFixed(1) + 'k' : todayPnl.toFixed(0)}
                  </span>
                </div>
              ) : (
              <>
              <div
                className={synced && !loading ? 'chip chip-live' : 'chip'}
                style={{ width: '100%', justifyContent: 'center', marginBottom: 10, padding: '7px 12px', color: loading ? theme.textMuted : synced ? theme.accent : theme.neg }}
              >
                {loading
                  ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                  : synced
                    ? <span className="pulse-dot" style={{ width: 6, height: 6, borderRadius: 999, background: theme.accent, display: 'inline-block' }}></span>
                    : <CloudOff size={13} />}
                {loading ? 'Syncing…' : synced ? 'Synced to cloud' : 'Offline'}
              </div>

              <div className="card" style={{ padding: 16, position: 'relative', overflow: 'hidden' }}>
                <div style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none',
                  background: `radial-gradient(340px 120px at 0% 0%, ${todayPnl >= 0 ? 'rgba(34,211,165,0.11)' : 'rgba(244,85,122,0.11)'}, transparent 70%)`,
                }}></div>
                <div style={{ position: 'relative' }}>
                  <div className="stat-label">Today&apos;s P&amp;L</div>
                  <div className="stat-value" style={{ color: todayPnl >= 0 ? theme.pos : theme.neg, marginTop: 5 }}>
                    {todayPnl >= 0 ? '+' : ''}{todayPnl.toFixed(2)}
                  </div>
                  <div style={{ marginTop: 10, display: 'flex', gap: 14, fontSize: 11.5, color: theme.textMuted, fontWeight: 500 }}>
                    <span className="flex items-center gap-1.5"><span style={{ width: 6, height: 6, borderRadius: 999, background: theme.pos }}></span>{todayWins}W</span>
                    <span className="flex items-center gap-1.5"><span style={{ width: 6, height: 6, borderRadius: 999, background: theme.neg }}></span>{todayLosses}L</span>
                  </div>
                </div>
              </div>
              </>
              )}
            </div>
          </aside>

          {/* Main */}
          <main className="flex-1 overflow-hidden flex flex-col">
            <header style={{
              background: darkMode ? 'rgba(16,14,26,0.72)' : 'rgba(255,255,255,0.78)',
              backdropFilter: 'blur(14px)',
              borderBottom: `1px solid ${theme.cardBorder}`,
              height: 82,
              flexShrink: 0,
              padding: '0 28px',
              display: 'flex',
              alignItems: 'center',
            }}>
              <div className="flex items-center justify-between gap-4" style={{ width: '100%' }}>
                <div>
                  <h1 style={{ fontSize: 21, fontWeight: 700, color: theme.text, letterSpacing: '-0.4px' }}>
                    {activeTab === 'dashboard' && 'Dashboard'}
                    {activeTab === 'challenges' && 'Prop Firm Challenges'}
                    {activeTab === 'simulator' && 'Monte Carlo Simulation'}
                    {activeTab === 'journal' && 'Journal'}
                    {activeTab === 'news' && 'Economic Calendar'}
                    {activeTab === 'history' && 'Trade History'}
                    {activeTab === 'accounts' && 'Accounts'}
                    {activeTab === 'calendar' && 'Calendar'}
                    {activeTab === 'crypto' && 'Crypto — OKX'}
                  </h1>
                  <p style={{ fontSize: 13, color: theme.textMuted, marginTop: 4 }}>
                    {activeTab === 'dashboard' && 'Performance metrics and insights'}
                    {activeTab === 'challenges' && 'Track challenge phases, drawdown limits & profit targets'}
                    {activeTab === 'simulator' && 'Project challenge outcomes from your trade history'}
                    {activeTab === 'journal' && 'Trade ideas, bias analysis & market notes'}
                    {activeTab === 'news' && 'High-impact forex news events & economic releases'}
                    {activeTab === 'history' && 'Document and analyze your trades'}
                    {activeTab === 'accounts' && 'Manage trading accounts'}
                    {activeTab === 'calendar' && 'Visual trade history'}
                    {activeTab === 'crypto' && 'Live portfolio, growth challenge, trades & analytics'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setDarkMode(!darkMode)} className="icon-btn" title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
                    {darkMode ? <Sun size={18} /> : <Moon size={18} />}
                  </button>

                  {activeTab === 'history' && (
                    <>
                      <button onClick={() => setShowImport(true)} className="icon-btn" title="Import trades">
                        <Upload size={18} />
                      </button>
                      <button onClick={() => setShowNewTrade(true)} className="btn-primary flex items-center gap-2"><Plus size={16} />Log Trade</button>
                    </>
                  )}
                  {activeTab === 'journal' && <button onClick={() => { const evt = new CustomEvent('ellipse-new-journal'); window.dispatchEvent(evt); }} className="btn-primary flex items-center gap-2"><Plus size={16} />New Entry</button>}
                  {activeTab === 'accounts' && <button onClick={() => setShowNewAccount(true)} className="btn-primary flex items-center gap-2"><Plus size={16} />Add Account</button>}
                  {activeTab === 'challenges' && <button onClick={() => setShowNewChallenge(true)} className="btn-primary flex items-center gap-2"><Plus size={16} />New Challenge</button>}
                  {activeTab === 'crypto' && (
                    <>
                      {cryptoSubTab === 'challenge' && <button onClick={() => setShowNewCryptoChallenge(true)} className="btn-primary flex items-center gap-2"><Plus size={16} />New Challenge</button>}
                      <button onClick={syncOKX} disabled={syncingOKX} className="btn-primary flex items-center gap-2" style={{ opacity: syncingOKX ? 0.6 : 1 }}>
                        <RefreshCw size={16} style={syncingOKX ? { animation: 'spin 1s linear infinite' } : undefined} />{syncingOKX ? 'Syncing…' : 'Sync OKX'}
                      </button>
                    </>
                  )}
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
                  {activeTab === 'simulator' && <SimulatorView trades={trades} accounts={accounts} challenges={challenges} />}
                  {activeTab === 'journal' && <JournalIdeasView entries={journalEntries} onAdd={addJournalEntry} onUpdate={updateJournalEntry} onDelete={deleteJournalEntry} />}
                  {activeTab === 'news' && <NewsCalendarView />}
                  {activeTab === 'history' && <JournalView trades={trades} accounts={accounts} filterAccount={filterAccount} setFilterAccount={setFilterAccount} onSelectTrade={setSelectedTrade} onDeleteTrades={async (ids) => { for (const id of ids) await deleteTrade(id); }} />}
                  {activeTab === 'accounts' && <AccountsView accounts={accounts} challenges={challenges} trades={trades} onUpdate={updateAccount} onDelete={deleteAccount} />}
                  {activeTab === 'calendar' && <CalendarView trades={trades} />}
                  {activeTab === 'crypto' && <CryptoView
                    subTab={cryptoSubTab} setSubTab={setCryptoSubTab}
                    trades={cryptoTrades} liveFills={cryptoLiveFills} pnl={cryptoPnl} snapshots={cryptoSnapshots} challenges={cryptoChallenges}
                    live={cryptoLive} algos={cryptoAlgos} funding={cryptoFunding} syncing={syncingOKX} okxError={okxError} lastSync={lastSync}
                    subAccounts={subAccounts} selectedAccount={selectedOkxAccount} setSelectedAccount={setSelectedOkxAccount}
                    onSync={syncOKX} onAddTrade={addCryptoTrade} onDeleteTrade={deleteCryptoTrade}
                    onUpdateChallenge={updateCryptoChallenge} onDeleteChallenge={deleteCryptoChallenge}
                  />}
                </>
              )}
            </div>
          </main>
        </div>

        {showNewTrade && <NewTradeModal onClose={() => setShowNewTrade(false)} onSave={(trade) => { addTrade(trade); setShowNewTrade(false); }} accounts={accounts} />}
        {showNewAccount && <NewAccountModal onClose={() => setShowNewAccount(false)} onSave={(acc) => { addAccount(acc); setShowNewAccount(false); }} />}
        {showImport && <ImportModal onClose={() => setShowImport(false)} onImport={importTrades} accounts={accounts} />}
        {showNewChallenge && <NewChallengeModal onClose={() => setShowNewChallenge(false)} onSave={(ch) => { addChallenge(ch); setShowNewChallenge(false); }} accounts={accounts} />}
        {showNewCryptoChallenge && <NewCryptoChallengeModal onClose={() => setShowNewCryptoChallenge(false)} onSave={(ch) => { addCryptoChallenge(ch); setShowNewCryptoChallenge(false); }} liveBalance={cryptoLive.balance?.totalEq} />}
        {selectedTrade && <TradeDetailModal ctx={outcomeContext(trades)} trade={selectedTrade} onClose={() => setSelectedTrade(null)} onDelete={(id) => { deleteTrade(id); setSelectedTrade(null); }} onEdit={(trade) => { setSelectedTrade(null); setEditingTrade(trade); }} />}
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
      // Phase-scoped via explicit trade tags (falls back to date boundaries for
      // legacy challenges), so profit/drawdown reset to the initial balance each phase.
      const challengeTrades = tradesInPhase(trades, challenge, challenge.currentPhase ?? 0);
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
          onUpdate(setChallengeStatus(challenge, 'failed', trades, { source: 'auto' }));
        }
        return;
      }

      // Auto-advance: profit target met + min trading days met. Tagging the phase's
      // trades on advance freezes the closed phase and resets the next one.
      if (targetPct && profitPct >= targetPct && tradingDays >= minDays) {
        if (challenge.currentPhase < challenge.phases.length - 1) {
          onUpdate(advanceChallenge(challenge, trades, { source: 'auto', note: `Auto-advanced: +${profitPct.toFixed(2)}% in ${tradingDays} days.` }));
        } else {
          onUpdate(setChallengeStatus(challenge, 'passed', trades, { source: 'auto' }));
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
              <button onClick={() => { onDelete(deleteId); setDeleteId(null); }} className="btn-primary" style={{ flex: 1, background: theme.neg }}>Delete</button>
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

  // Phase-scoped via explicit trade tags (date-boundary fallback for legacy data)
  // so the card's P&L resets to the initial balance after each phase pass.
  const challengeTrades = tradesInPhase(trades, challenge, challenge.currentPhase ?? 0);

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
    active: { bg: 'rgba(139,92,246,0.1)', text: '#8b5cf6', label: 'Active' },
    passed: { bg: 'rgba(34,211,165,0.1)', text: theme.pos, label: 'Passed' },
    failed: { bg: 'rgba(244,85,122,0.1)', text: theme.neg, label: 'Failed' },
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
            <span style={{ fontSize: 14, fontWeight: 600, color: totalPnl >= 0 ? theme.pos : theme.neg }}>{totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              title="Delete challenge"
              style={{ padding: 6, borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              <Trash2 size={14} style={{ color: theme.textFaint }} />
            </button>
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
          <div style={{ width: 42, height: 42, borderRadius: 10, background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
            <div className="pulse-warn" style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(244,85,122,0.15)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={14} style={{ color: theme.neg }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: theme.neg }}>DRAWDOWN WARNING</span>
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
            <div style={{ fontSize: 20, fontWeight: 700, color: totalPnl >= 0 ? theme.pos : theme.neg, marginTop: 4 }}>
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
            <div style={{ fontSize: 20, fontWeight: 700, color: tradingDays >= minTradingDays ? theme.pos : theme.text, marginTop: 4 }}>
              {tradingDays}
            </div>
            <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 2 }}>
              {minTradingDays > 0 ? `Min: ${minTradingDays} days` : 'No minimum'}
            </div>
          </div>

          {/* Today's P&L */}
          <div style={{ padding: 14, borderRadius: 10, background: theme.hoverBg }}>
            <div className="stat-label">Today's P&L</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: todayPnl >= 0 ? theme.pos : theme.neg, marginTop: 4 }}>
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
                <span style={{ fontSize: 12, fontWeight: 600, color: profitPct >= profitTargetPct ? theme.pos : theme.text }}>
                  {profitPct.toFixed(2)}% / {profitTargetPct}%
                </span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: theme.hoverBg, overflow: 'hidden' }}>
                <div className="progress-bar-animate" style={{ height: '100%', borderRadius: 4, width: `${Math.max(profitProgress, 0)}%`, background: profitPct >= profitTargetPct ? 'linear-gradient(90deg, #22d3a5, #5eead4)' : 'linear-gradient(90deg, #7c3aed, #a855f7)' }} />
              </div>
            </div>
          )}

          {/* Daily Drawdown */}
          <div>
            <div className="flex justify-between items-center" style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: isDailyDanger ? theme.neg : theme.textMuted }}>
                Daily Drawdown {isDailyCritical && '⚠️'}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: isDailyDanger ? theme.neg : theme.text }}>
                {dailyDrawdownPct.toFixed(2)}% / {maxDailyDD}%
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: theme.hoverBg, overflow: 'hidden' }}>
              <div className="progress-bar-animate" style={{ height: '100%', borderRadius: 4, width: `${Math.min(dailyDDUsed, 100)}%`, background: isDailyCritical ? theme.neg : isDailyDanger ? 'linear-gradient(90deg, #f59e0b, #f4557a)' : 'linear-gradient(90deg, #22d3a5, #5eead4)' }} />
            </div>
          </div>

          {/* Max Drawdown */}
          <div>
            <div className="flex justify-between items-center" style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: isTotalDanger ? theme.neg : theme.textMuted }}>
                Max Drawdown {isTotalCritical && '⚠️'}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: isTotalDanger ? theme.neg : theme.text }}>
                {maxDrawdownPct.toFixed(2)}% / {maxTotalDD}%
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: theme.hoverBg, overflow: 'hidden' }}>
              <div className="progress-bar-animate" style={{ height: '100%', borderRadius: 4, width: `${Math.min(totalDDUsed, 100)}%`, background: isTotalCritical ? theme.neg : isTotalDanger ? 'linear-gradient(90deg, #f59e0b, #f4557a)' : 'linear-gradient(90deg, #22d3a5, #5eead4)' }} />
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

  // Phase-scoped between the phase's real start and the next phase's start, so
  // leaving a phase freezes it rather than making it unreachable.
  const { start: phaseStart, end: phaseEnd } = phaseBounds(challenge, challenge.currentPhase ?? 0);
  const accountTrades = trades.filter(t => t.account === challenge.account);
  const challengeTrades = tradesInPhase(trades, challenge, challenge.currentPhase ?? 0);
  const pendingSplit = pendingPhaseSplit(challenge);
  const history = Array.isArray(challenge.phaseHistory) ? challenge.phaseHistory : [];
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

  const [confirmAdvance, setConfirmAdvance] = useState(null); // null | {effectiveDate, source, note}
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const isLastPhase = (challenge.currentPhase ?? 0) >= (challenge.phases?.length || 1) - 1;
  const cur = challenge.currentPhase ?? 0;

  const doAdvance = (opts) => { onUpdate(advanceChallenge(challenge, trades, opts)); setConfirmAdvance(null); };
  const handleMarkPassed = () => onUpdate(setChallengeStatus(challenge, 'passed', trades));
  const handleMarkFailed = () => onUpdate(setChallengeStatus(challenge, 'failed', trades));
  const handleUndo = () => onUpdate(undoLastPhaseChange(challenge));

  // ---- Edit existing phases ----
  const startEdit = () => { setDraft({ accountSize: challenge.accountSize, consistencyRule: challenge.consistencyRule ?? '', phases: JSON.parse(JSON.stringify(challenge.phases || [])) }); setEditing(true); };
  const setDraftPhase = (idx, field, value) => setDraft(d => ({ ...d, phases: d.phases.map((p, i) => i === idx ? { ...p, [field]: value } : p) }));
  const saveEdit = () => {
    const cleanPhases = draft.phases.map(p => ({
      ...p,
      profitTarget: p.profitTarget === '' || p.profitTarget == null ? null : parseFloat(p.profitTarget),
      maxDailyDrawdown: parseFloat(p.maxDailyDrawdown) || 0,
      maxTotalDrawdown: parseFloat(p.maxTotalDrawdown) || 0,
      minTradingDays: parseInt(p.minTradingDays) || 0,
      maxTradingDays: p.maxTradingDays === '' || p.maxTradingDays == null ? null : parseInt(p.maxTradingDays),
    }));
    onUpdate({ ...challenge, accountSize: parseFloat(draft.accountSize) || challenge.accountSize, consistencyRule: draft.consistencyRule === '' ? null : parseFloat(draft.consistencyRule), phases: cleanPhases });
    setEditing(false);
  };

  // ---- Per-phase breakdown (uses explicit trade tags so each phase resets) ----
  const phaseStats = (challenge.phases || []).map((p, idx) => {
    const pts = tradesInPhase(trades, challenge, idx);
    const pnl = pts.reduce((s, t) => s + (parseFloat(t.pnl) || 0), 0);
    const days = new Set(pts.map(t => t.date)).size;
    let pk = accountSize, run = accountSize, dd = 0;
    [...pts].sort((a, b) => new Date(`${a.date} ${a.time || '00:00'}`) - new Date(`${b.date} ${b.time || '00:00'}`)).forEach(t => {
      run += parseFloat(t.pnl) || 0; if (run > pk) pk = run;
      const d = pk > 0 ? ((pk - run) / pk) * 100 : 0; if (d > dd) dd = d;
    });
    const status = idx < cur ? 'passed'
      : idx === cur ? (challenge.status === 'active' ? 'current' : challenge.status)
      : 'locked';
    return { p, idx, pnl, pct: accountSize > 0 ? (pnl / accountSize) * 100 : 0, days, dd, count: pts.length, status };
  });

  // ---- Live rule-compliance checklist for the current phase ----
  const worstDayLoss = dailyEntries.length ? Math.abs(Math.min(0, ...dailyEntries.map(([, d]) => d.pnl))) : 0;
  const worstDayDDpct = accountSize > 0 ? (worstDayLoss / accountSize) * 100 : 0;
  const checklist = [
    phase.profitTarget != null && { label: `Profit target ${phase.profitTarget}%`, ok: profitPct >= phase.profitTarget, detail: `at ${profitPct.toFixed(2)}%` },
    { label: `Daily drawdown under ${phase.maxDailyDrawdown || 5}%`, ok: worstDayDDpct < (phase.maxDailyDrawdown || 5), detail: `worst ${worstDayDDpct.toFixed(2)}%` },
    { label: `Total drawdown under ${phase.maxTotalDrawdown || 10}%`, ok: maxDD < (phase.maxTotalDrawdown || 10), detail: `at ${maxDD.toFixed(2)}%` },
    { label: `Min ${phase.minTradingDays || 0} trading days`, ok: tradingDays >= (phase.minTradingDays || 0), detail: `${tradingDays} logged` },
    phase.maxTradingDays && { label: `Max ${phase.maxTradingDays} trading days`, ok: tradingDays <= phase.maxTradingDays, detail: `${tradingDays} used` },
    challenge.consistencyRule && { label: `Consistency under ${challenge.consistencyRule}%`, ok: consistencyPct <= challenge.consistencyRule, detail: `best day ${consistencyPct.toFixed(0)}%` },
  ].filter(Boolean);

  // ---- Trade-by-trade list for the current phase ----
  const phaseTradeRows = (() => {
    let run = accountSize;
    return [...challengeTrades]
      .sort((a, b) => new Date(`${a.date} ${a.time || '00:00'}`) - new Date(`${b.date} ${b.time || '00:00'}`))
      .map(t => { const net = parseFloat(t.pnl) || 0; run += net; return { t, net, equity: run }; });
  })();

  return (
    <Modal width={700} onClose={onClose}>
      <div style={{ padding: 20, borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: theme.text }}>{challenge.name}</h3>
          <p style={{ fontSize: 12, color: theme.textFaint }}>{challenge.propFirm} · {phase?.name} · ${accountSize.toLocaleString()}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={editing ? () => setEditing(false) : startEdit} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 12.5 }}>
            <Edit3 size={14} />{editing ? 'Close editor' : 'Edit phases'}
          </button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={20} style={{ color: theme.textFaint }} /></button>
        </div>
      </div>
      {pendingSplit && challenge.status === 'active' && !confirmAdvance && (
        <div style={{ margin: '16px 20px 0', padding: 14, borderRadius: 14, border: `1px solid ${theme.primary}55`, background: theme.primarySoft, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Flag size={17} style={{ color: theme.primaryHi, flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
              {pendingSplit.phaseName} detected on {pendingSplit.splitDate}
            </div>
            <div style={{ fontSize: 11.5, color: theme.textMuted, marginTop: 3, lineHeight: 1.5 }}>
              Found in your statement as a withdrawal note{pendingSplit.note ? <> — <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{truncate(pendingSplit.note, 60)}</span></> : ''}.
              Applying it closes the current phase on that date rather than today.
            </div>
          </div>
          <button
            onClick={() => setConfirmAdvance({ effectiveDate: pendingSplit.splitDate, source: 'detected', note: pendingSplit.note || '' })}
            className="btn-primary"
            style={{ flexShrink: 0, padding: '7px 14px', fontSize: 12.5 }}
          >
            Review
          </button>
        </div>
      )}

      <div style={{ padding: 20, maxHeight: '70vh', overflow: 'auto' }} className="scrollbar">
        {/* Edit phases */}
        {editing && draft && (
          <div style={{ marginBottom: 20, padding: 16, borderRadius: 12, border: `1px solid ${theme.primary}55`, background: theme.primarySoft }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>Edit challenge phases</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 11, color: theme.textMuted }}>Account size $</label>
                <input type="number" value={draft.accountSize} onChange={e => setDraft(d => ({ ...d, accountSize: e.target.value }))} className="input input-sm" style={{ width: 120 }} />
                <label style={{ fontSize: 11, color: theme.textMuted }}>Consistency %</label>
                <input type="number" value={draft.consistencyRule} onChange={e => setDraft(d => ({ ...d, consistencyRule: e.target.value }))} className="input input-sm" style={{ width: 80 }} placeholder="—" />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {draft.phases.map((p, idx) => (
                <div key={idx} style={{ padding: 12, borderRadius: 10, background: theme.card, border: `1px solid ${theme.cardBorder}` }}>
                  <input value={p.name || ''} onChange={e => setDraftPhase(idx, 'name', e.target.value)} className="input input-sm" style={{ marginBottom: 8, fontWeight: 600 }} placeholder={`Phase ${idx + 1} name`} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                    {[
                      { f: 'profitTarget', label: 'Target %', ph: 'none' },
                      { f: 'maxDailyDrawdown', label: 'Daily DD %' },
                      { f: 'maxTotalDrawdown', label: 'Total DD %' },
                      { f: 'minTradingDays', label: 'Min days' },
                      { f: 'maxTradingDays', label: 'Max days', ph: 'none' },
                    ].map(({ f, label, ph }) => (
                      <div key={f}>
                        <label style={{ fontSize: 10, color: theme.textFaint, display: 'block', marginBottom: 3 }}>{label}</label>
                        <input type="number" value={p[f] ?? ''} onChange={e => setDraftPhase(idx, f, e.target.value)} className="input input-sm" placeholder={ph || '0'} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2" style={{ marginTop: 12 }}>
              <button onClick={() => setEditing(false)} className="btn-ghost">Cancel</button>
              <button onClick={saveEdit} className="btn-primary">Save changes</button>
            </div>
          </div>
        )}

        {/* Summary Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          <div style={{ padding: 14, borderRadius: 10, background: theme.hoverBg, textAlign: 'center' }}>
            <div className="stat-label">Net P&L</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: totalPnl >= 0 ? theme.pos : theme.neg, marginTop: 4 }}>
              {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
            </div>
            <div style={{ fontSize: 11, color: theme.textFaint }}>{profitPct.toFixed(2)}%</div>
          </div>
          <div style={{ padding: 14, borderRadius: 10, background: theme.hoverBg, textAlign: 'center' }}>
            <div className="stat-label">Max Drawdown</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: maxDD >= (phase?.maxTotalDrawdown || 10) * 0.7 ? theme.neg : theme.text, marginTop: 4 }}>
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
            { label: 'Best Day', value: `+$${bestDay.toFixed(2)}`, color: theme.pos },
            { label: 'Worst Day', value: `$${worstDay.toFixed(2)}`, color: theme.neg },
            { label: 'Avg Daily', value: `$${avgDailyPnl.toFixed(2)}`, color: avgDailyPnl >= 0 ? theme.pos : theme.neg },
            { label: 'Consistency', value: `${consistencyPct.toFixed(0)}%`, color: consistencyPct <= 40 ? theme.pos : '#f59e0b' }
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
                      <stop offset="0%" stopColor={theme.pos} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={theme.pos} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="eqRed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={theme.neg} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={theme.neg} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: theme.textFaint }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: theme.textFaint }} tickFormatter={v => `$${v.toLocaleString()}`} domain={['dataMin - 100', 'dataMax + 100']} />
                  <Tooltip contentStyle={{ background: theme.card, border: `1px solid ${theme.cardBorder}`, borderRadius: 8, fontSize: 12 }} formatter={(v) => [`$${v.toLocaleString()}`, 'Equity']} />
                  <Area type="monotone" dataKey="equity" stroke={totalPnl >= 0 ? theme.pos : theme.neg} fill={totalPnl >= 0 ? 'url(#eqGreen)' : 'url(#eqRed)'} strokeWidth={2} />
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
                    <div key={date} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px', gap: 8, padding: '10px 14px', borderTop: `1px solid ${theme.cardBorder}`, background: isDDAlert ? 'rgba(244,85,122,0.05)' : 'transparent' }}>
                      <span style={{ fontSize: 13, color: theme.text }}>{date} {isDDAlert && <AlertTriangle size={12} style={{ color: theme.neg, verticalAlign: 'middle', marginLeft: 4 }} />}</span>
                      <span style={{ fontSize: 13, color: theme.textMuted, textAlign: 'right' }}>{data.trades}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: data.pnl >= 0 ? theme.pos : theme.neg, textAlign: 'right' }}>
                        {data.pnl >= 0 ? '+' : ''}${data.pnl.toFixed(2)}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: cum >= 0 ? theme.pos : theme.neg, textAlign: 'right' }}>
                        {cum >= 0 ? '+' : ''}${cum.toFixed(2)}
                      </span>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* Phase-by-phase history */}
        {phaseStats.length > 1 && (
          <div style={{ marginTop: 20 }}>
            <div className="stat-label" style={{ marginBottom: 10 }}>Phase History</div>
            <div style={{ borderRadius: 10, border: `1px solid ${theme.cardBorder}`, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 90px 70px 60px 70px 78px', gap: 8, padding: '10px 14px', background: theme.hoverBg }}>
                {['PHASE', 'P&L', '%', 'DAYS', 'MAX DD', 'STATUS'].map((h, i) => (
                  <span key={h} style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted, textAlign: i === 0 ? 'left' : i === 5 ? 'center' : 'right' }}>{h}</span>
                ))}
              </div>
              {phaseStats.map(ps => {
                const sc = { passed: theme.pos, current: theme.primary, funded: '#f59e0b', failed: theme.neg, locked: theme.textFaint }[ps.status] || theme.textMuted;
                return (
                  <div key={ps.idx} style={{ display: 'grid', gridTemplateColumns: '1.4fr 90px 70px 60px 70px 78px', gap: 8, padding: '10px 14px', borderTop: `1px solid ${theme.cardBorder}`, alignItems: 'center', opacity: ps.status === 'locked' ? 0.5 : 1 }}>
                    <span style={{ fontSize: 13, color: theme.text }}>{ps.p.name || `Phase ${ps.idx + 1}`}<span style={{ fontSize: 11, color: theme.textFaint }}> · {ps.count} trade{ps.count === 1 ? '' : 's'}</span></span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: ps.pnl >= 0 ? theme.pos : theme.neg, textAlign: 'right' }}>{ps.pnl >= 0 ? '+' : ''}${ps.pnl.toFixed(2)}</span>
                    <span style={{ fontSize: 13, color: theme.textMuted, textAlign: 'right' }}>{ps.pct >= 0 ? '+' : ''}{ps.pct.toFixed(2)}%</span>
                    <span style={{ fontSize: 13, color: theme.textMuted, textAlign: 'right' }}>{ps.days}</span>
                    <span style={{ fontSize: 13, color: ps.dd >= (ps.p.maxTotalDrawdown || 10) * 0.7 ? theme.neg : theme.textMuted, textAlign: 'right' }}>{ps.dd.toFixed(2)}%</span>
                    <span style={{ textAlign: 'center' }}><span className="badge" style={{ background: `${sc}1f`, color: sc, textTransform: 'capitalize' }}>{ps.status}</span></span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Rule-compliance checklist */}
        {challenge.status === 'active' && checklist.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div className="stat-label" style={{ marginBottom: 10 }}>Rule Compliance · {phase?.name}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
              {checklist.map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, background: theme.hoverBg, border: `1px solid ${c.ok ? 'rgba(34,211,165,0.3)' : 'rgba(244,85,122,0.3)'}` }}>
                  {c.ok ? <CheckCircle size={16} style={{ color: theme.pos, flexShrink: 0 }} /> : <AlertTriangle size={16} style={{ color: theme.neg, flexShrink: 0 }} />}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: theme.text, fontWeight: 500 }}>{c.label}</div>
                    <div style={{ fontSize: 11, color: theme.textFaint }}>{c.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trade-by-trade (current phase) */}
        {phaseTradeRows.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div className="stat-label" style={{ marginBottom: 10 }}>Trades · {phase?.name} ({phaseTradeRows.length})</div>
            <div style={{ borderRadius: 10, border: `1px solid ${theme.cardBorder}`, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 60px 70px 90px 100px', gap: 8, padding: '10px 14px', background: theme.hoverBg }}>
                {['DATE', 'SIDE', 'LOTS', 'P&L', 'EQUITY'].map((h, i) => (
                  <span key={h} style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted, textAlign: i === 0 || i === 1 ? 'left' : 'right' }}>{h}</span>
                ))}
              </div>
              <div style={{ maxHeight: 260, overflow: 'auto' }} className="scrollbar">
                {phaseTradeRows.map(({ t, net, equity }, i) => (
                  <div key={t.id ?? i} style={{ display: 'grid', gridTemplateColumns: '1.3fr 60px 70px 90px 100px', gap: 8, padding: '9px 14px', borderTop: `1px solid ${theme.cardBorder}`, alignItems: 'center' }}>
                    <span style={{ fontSize: 12.5, color: theme.text }}>{t.date}{t.time ? ` ${t.time}` : ''}<span style={{ fontSize: 11, color: theme.textFaint }}>{t.symbol ? ` · ${t.symbol}` : ''}</span></span>
                    <span style={{ fontSize: 12, color: (t.side === 'Long' || t.side === 'buy') ? theme.pos : theme.neg }}>{t.side || '—'}</span>
                    <span style={{ fontSize: 12.5, color: theme.textMuted, textAlign: 'right' }}>{t.lots ?? '—'}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: net >= 0 ? theme.pos : theme.neg, textAlign: 'right' }}>{net >= 0 ? '+' : ''}${net.toFixed(2)}</span>
                    <span style={{ fontSize: 12.5, color: theme.textMuted, textAlign: 'right' }}>${equity.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      {confirmAdvance ? (
        <div style={{ padding: 20, borderTop: `1px solid ${theme.cardBorder}`, background: theme.dark ? 'rgba(245,158,11,0.07)' : 'rgba(245,158,11,0.06)' }}>
          <div className="flex items-start gap-3" style={{ marginBottom: 14 }}>
            <AlertTriangle size={18} style={{ color: theme.warn, flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 13, color: theme.text, lineHeight: 1.55 }}>
              <strong>
                {isLastPhase
                  ? `Mark ${challenge.name} as funded?`
                  : `Advance to ${challenge.phases[(challenge.currentPhase ?? 0) + 1]?.name || 'the next phase'}?`}
              </strong>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: theme.textMuted, fontSize: 12.5 }}>
                <li>
                  {challenge.phases[challenge.currentPhase ?? 0]?.name || 'This phase'} closes on{' '}
                  <strong style={{ color: theme.text }}>{confirmAdvance.effectiveDate}</strong> and its{' '}
                  {challengeTrades.length} trade{challengeTrades.length === 1 ? '' : 's'} are frozen for review.
                </li>
                {!isLastPhase && (
                  <li>
                    Trades on or after that date count toward the new phase, whose target becomes{' '}
                    <strong style={{ color: theme.text }}>{challenge.phases[(challenge.currentPhase ?? 0) + 1]?.profitTarget ?? '—'}%</strong>.
                  </li>
                )}
                <li>This is recorded in the phase history and can be undone.</li>
              </ul>
              <div style={{ marginTop: 12 }}>
                <label className="label">Effective date</label>
                <input
                  type="date"
                  value={confirmAdvance.effectiveDate}
                  onChange={(e) => setConfirmAdvance({ ...confirmAdvance, effectiveDate: e.target.value })}
                  className="input input-sm"
                  style={{ width: 180 }}
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setConfirmAdvance(null)} className="btn-ghost">Cancel</button>
            <button onClick={() => doAdvance(confirmAdvance)} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Flag size={16} />{isLastPhase ? 'Mark funded' : 'Confirm advance'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ padding: 20, borderTop: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div className="flex items-center gap-3">
            {challenge.status === 'active' && (
              <button onClick={handleMarkFailed} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', fontSize: 14, color: theme.neg, cursor: 'pointer' }}>
                <X size={16} />Mark Failed
              </button>
            )}
            {history.length > 0 && (
              <button onClick={handleUndo} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
                title={`Undo: ${history[history.length - 1].action} on ${history[history.length - 1].date}`}>
                <RefreshCw size={14} />Undo last change
              </button>
            )}
          </div>
          {challenge.status === 'active' && (
            <div className="flex gap-2">
              {!isLastPhase ? (
                <button onClick={() => setConfirmAdvance({ effectiveDate: new Date().toISOString().split('T')[0], source: 'manual' })} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Flag size={16} />Advance to {challenge.phases[(challenge.currentPhase ?? 0) + 1]?.name || 'Next Phase'}
                </button>
              ) : (
                <button onClick={handleMarkPassed} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg, #22d3a5, #5eead4)' }}>
                  <Trophy size={16} />Mark as Passed
                </button>
              )}
            </div>
          )}
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
    phaseStartDates: {},
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
                    padding: 14, borderRadius: 10, border: `1px solid ${selectedPreset === key ? '#8b5cf6' : theme.cardBorder}`,
                    background: selectedPreset === key ? 'rgba(139,92,246,0.1)' : 'transparent', cursor: 'pointer', textAlign: 'center'
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: selectedPreset === key ? '#8b5cf6' : theme.text }}>{config.name}</div>
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
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: 'linear-gradient(135deg, #7c3aed, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: 'white' }}>{idx + 1}</div>
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
                <button onClick={() => setChallenge(prev => ({ ...prev, phases: prev.phases.slice(0, -1) }))} style={{ padding: 10, borderRadius: 8, border: `1px dashed ${theme.cardBorder}`, background: 'none', cursor: 'pointer', fontSize: 13, color: theme.neg }}>
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
              <button key={p} onClick={() => setPlatform(p)} style={{ flex: 1, padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 500, border: `1px solid ${platform === p ? '#8b5cf6' : theme.cardBorder}`, background: platform === p ? 'rgba(139,92,246,0.1)' : 'transparent', color: platform === p ? '#8b5cf6' : theme.textMuted, cursor: 'pointer' }}>{p}</button>
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
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(139,92,246,0.1)', color: '#8b5cf6' }}>{phaseTrades.length} trades</span>
                      </div>
                      <div style={{ fontSize: 12, color: phasePnl >= 0 ? theme.pos : theme.neg, marginTop: 2 }}>
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
          <div style={{ padding: 14, borderRadius: 10, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <Flag size={18} style={{ color: '#8b5cf6', marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#8b5cf6' }}>Phase transition detected</div>
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

        {error && <div style={{ padding: 12, borderRadius: 10, background: 'rgba(244,85,122,0.1)', display: 'flex', alignItems: 'center', gap: 8 }}><AlertCircle size={16} style={{ color: theme.neg }} /><span style={{ fontSize: 13, color: theme.neg }}>{error}</span></div>}
        {success && <div style={{ padding: 12, borderRadius: 10, background: 'rgba(34,211,165,0.1)', display: 'flex', alignItems: 'center', gap: 8 }}><CheckCircle size={16} style={{ color: theme.pos }} /><span style={{ fontSize: 13, color: theme.pos }}>{success}</span></div>}

        {/* Trade Preview — grouped by phase if phases detected */}
        {parsedTrades.length > 0 && (
          <div style={{ borderRadius: 10, border: `1px solid ${theme.cardBorder}`, overflow: 'hidden' }}>
            <div style={{ padding: 12, background: theme.hoverBg, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: theme.text }}>Preview ({parsedTrades.length} trades)</span>
              <span style={{ fontSize: 12, color: parsedTrades.reduce((s, t) => s + t.pnl, 0) >= 0 ? theme.pos : theme.neg }}>Total: ${parsedTrades.reduce((s, t) => s + t.pnl, 0).toFixed(2)}</span>
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
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#8b5cf6' }}>{phase} ({phaseTrades.length} trades)</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: phasePnl >= 0 ? theme.pos : theme.neg }}>{phasePnl >= 0 ? '+' : ''}${phasePnl.toFixed(2)}</span>
                      </div>
                      {phaseTrades.map((t, i) => (
                        <div key={i} style={{ padding: 10, borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                          <div className="flex items-center gap-3">
                            <span style={{ fontWeight: 600, color: theme.text }}>{t.symbol}</span>
                            <span style={{ color: t.side === 'Long' ? theme.pos : theme.neg }}>{t.side}</span>
                            <span style={{ color: theme.textFaint }}>{t.lots} lots</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span style={{ color: theme.textFaint }}>{t.date}</span>
                            <span style={{ fontWeight: 600, color: t.pnl >= 0 ? theme.pos : theme.neg }}>{t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}</span>
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
                      <span style={{ color: t.side === 'Long' ? theme.pos : theme.neg }}>{t.side}</span>
                      <span style={{ color: theme.textFaint }}>{t.lots} lots</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span style={{ color: theme.textFaint }}>{t.date}</span>
                      <span style={{ fontWeight: 600, color: t.pnl >= 0 ? theme.pos : theme.neg }}>{t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}</span>
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
const BIAS_COLORS = { Bullish: '#22d3a5', Bearish: '#f4557a', Neutral: '#8b5cf6', 'No Trade': '#64748b' };
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
                          <span key={i} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', fontWeight: 500 }}>{c}</span>
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
                <button key={tf} onClick={() => setForm({ ...form, timeframe: tf })} style={{ flex: 1, padding: 10, borderRadius: 8, fontSize: 12, fontWeight: 500, border: `1px solid ${form.timeframe === tf ? '#8b5cf6' : theme.cardBorder}`, background: form.timeframe === tf ? 'rgba(139,92,246,0.1)' : 'transparent', color: form.timeframe === tf ? '#8b5cf6' : theme.textMuted, cursor: 'pointer' }}>{tf}</button>
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
              <button key={c} onClick={() => toggleConfluence(c)} style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer', background: form.confluences.includes(c) ? '#8b5cf6' : theme.hoverBg, color: form.confluences.includes(c) ? 'white' : theme.textMuted, transition: 'all 0.15s' }}>{c}</button>
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
const IMPACT_COLORS = { High: '#f4557a', Medium: '#f59e0b', Low: '#8b5cf6', Holiday: '#64748b' };
const NEWS_CURRENCIES = ['All', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'];

// ---- Economic-event reference + pair-impact model ---------------------------
// The free ForexFactory feed carries only title/currency/impact/forecast/previous
// (see the JSON at faireconomy.media) — none of the on-site "specs" (Measures,
// Usual Effect, Source, Why Traders Care, etc.). Those specs are static per
// indicator, so we keep them in a curated library keyed on words in the title.
// `higherIsStronger` says whether a higher-than-expected reading is bullish (true)
// or bearish (false) for the currency, which drives the pair-direction model.
// Fields mirror the ForexFactory detail panel; blank fields are simply hidden.
const NEWS_EVENT_LIBRARY = [
  { match: ['non-farm', 'nonfarm', 'nfp', 'employment change', 'payroll'], higherIsStronger: true,
    measures: 'Change in the number of employed people during the previous month, excluding the farming industry.',
    whyTradersCare: 'Job creation is a leading indicator of consumer spending, which makes up a majority of overall economic activity.',
    source: 'Bureau of Labor Statistics (US) / national statistics office', frequency: 'Released monthly, usually on the first Friday after the month ends.',
    alsoCalled: 'Non-Farm Payrolls, NFP, Employment Change', acronym: 'Non-Farm Payrolls (NFP)' },
  { match: ['unemployment rate'], higherIsStronger: false,
    measures: 'Percentage of the total labour force that is unemployed and actively seeking work.',
    whyTradersCare: 'Although a lagging indicator, the number of unemployed is an important signal of overall economic health because consumer spending is highly correlated with labour-market conditions.',
    source: 'Bureau of Labor Statistics (US) / national statistics office', frequency: 'Released monthly, about a week after the month ends.',
    ffNotes: 'A higher reading is negative for the currency — the "usual effect" is inverted versus most indicators.' },
  { match: ['unemployment claims', 'jobless claims'], higherIsStronger: false,
    measures: 'The number of individuals who filed for unemployment insurance for the first time during the past week.',
    whyTradersCare: 'It is the earliest US economic data — timely enough to move markets even though the individual releases are volatile.',
    source: 'Department of Labor', frequency: 'Released weekly, on Thursday.', alsoCalled: 'Initial Jobless Claims', acronym: 'Initial Jobless Claims' },
  { match: ['average earnings', 'average hourly', 'wage', 'earnings index', 'labor cost', 'labour cost'], higherIsStronger: true,
    measures: 'Change in the price businesses pay for labour, excluding the farming industry.',
    whyTradersCare: 'It is a leading indicator of consumer inflation — when businesses pay more for labour, the higher costs are usually passed on to consumers.',
    source: 'Bureau of Labor Statistics / national statistics office', frequency: 'Released monthly, alongside the jobs report.', alsoCalled: 'Average Hourly Earnings' },
  { match: ['core cpi', 'cpi', 'consumer price', 'inflation rate', 'hicp'], higherIsStronger: true,
    measures: 'Change in the price of goods and services purchased by consumers, excluding food and energy (for "Core" prints).',
    whyTradersCare: 'Consumer prices account for a majority of overall inflation. Inflation is important to currency valuation because rising prices lead the central bank to raise interest rates out of respect for its inflation-containment mandate.',
    source: 'Bureau of Labor Statistics (US) / national statistics office', frequency: 'Released monthly, about 11 days after the month ends.',
    ffNotes: 'Food and energy prices are about a quarter of CPI but are very volatile, so the FOMC pays more attention to the Core data — and so do traders.',
    alsoCalled: 'CPI Ex Food and Energy, Underlying CPI', acronym: 'Consumer Price Index (CPI)' },
  { match: ['ppi', 'producer price'], higherIsStronger: true,
    measures: 'Change in the price of finished goods and services sold by producers.',
    whyTradersCare: 'It is a leading indicator of consumer inflation — when producers charge more, the higher costs are usually passed on to the consumer.',
    source: 'Bureau of Labor Statistics / national statistics office', frequency: 'Released monthly, about 13 days after the month ends.', acronym: 'Producer Price Index (PPI)' },
  { match: ['gdp', 'gross domestic'], higherIsStronger: true,
    measures: 'Change in the inflation-adjusted value of all goods and services produced by the economy.',
    whyTradersCare: 'It is the broadest measure of economic activity and the primary gauge of the economy’s health.',
    source: 'National statistics office', frequency: 'Released quarterly, with prelim and final revisions.', acronym: 'Gross Domestic Product (GDP)' },
  { match: ['retail sales'], higherIsStronger: true,
    measures: 'Change in the total value of sales at the retail level ("Core" excludes automobiles).',
    whyTradersCare: 'It is the primary gauge of consumer spending, which accounts for the majority of overall economic activity.',
    source: 'Census Bureau / national statistics office', frequency: 'Released monthly, about 16 days after the month ends.' },
  { match: ['rate decision', 'rate statement', 'interest rate', 'cash rate', 'bank rate', 'refinancing rate', 'official cash', 'fomc', 'monetary policy'], higherIsStronger: true,
    measures: 'The central bank sets its benchmark interest rate and communicates its policy stance.',
    whyTradersCare: 'Short-term interest rates are the paramount factor in currency valuation — traders look at most other indicators merely to predict how rates will change in future.',
    source: 'Central bank (Federal Reserve, ECB, BoE, RBA, etc.)', frequency: 'Roughly 8 scheduled meetings per year.', alsoCalled: 'Official Bank Rate, Cash Rate, Federal Funds Rate' },
  { match: ['manufacturing pmi', 'services pmi', 'composite pmi', 'flash pmi', 'pmi', 'purchasing managers'], higherIsStronger: true,
    measures: 'Diffusion index based on surveyed purchasing managers; above 50.0 signals expansion, below 50.0 contraction.',
    whyTradersCare: 'It is a leading indicator of economic health — businesses react quickly to market conditions, so purchasing managers hold timely insight into the economy.',
    source: 'S&P Global / ISM / national bodies', frequency: 'Released monthly; a "Flash" estimate lands about a week before the final.', acronym: 'Purchasing Managers’ Index (PMI)' },
  { match: ['ism'], higherIsStronger: true,
    measures: 'US business-activity diffusion index; above 50.0 signals expansion, below 50.0 contraction.',
    whyTradersCare: 'A closely watched, timely lead indicator for growth, prices and employment.',
    source: 'Institute for Supply Management', frequency: 'Released monthly, on the first business day (manufacturing) / third (services).', acronym: 'Institute for Supply Management (ISM)' },
  { match: ['trade balance'], higherIsStronger: true,
    measures: 'Difference in value between imported and exported goods and services over the period.',
    whyTradersCare: 'Export demand and currency demand are directly linked, because foreigners must buy the domestic currency to pay for the nation’s exports.',
    source: 'National statistics office', frequency: 'Released monthly.' },
  { match: ['consumer confidence', 'consumer sentiment', 'sentiment', 'ifo', 'zew'], higherIsStronger: true,
    measures: 'Survey-based index of how optimistic consumers or businesses feel about economic conditions.',
    whyTradersCare: 'Financial confidence is a leading indicator of spending and investment, which are major drivers of overall economic activity.',
    source: 'Conference Board / University of Michigan / Ifo / ZEW', frequency: 'Released monthly.' },
  { match: ['durable goods', 'factory orders', 'industrial production'], higherIsStronger: true,
    measures: 'Change in new orders for, or output of, long-lasting manufactured goods.',
    whyTradersCare: 'It is a leading indicator of production — rising orders signal businesses will ramp up activity to fill them.',
    source: 'Census Bureau / national statistics office', frequency: 'Released monthly.' },
  { match: ['building permits', 'housing starts', 'home sales', 'building approvals'], higherIsStronger: true,
    measures: 'Activity in the housing sector — permits, starts or completed sales.',
    whyTradersCare: 'Housing is highly interest-rate-sensitive and an early signal of economic momentum and consumer confidence.',
    source: 'Census Bureau / national statistics office', frequency: 'Released monthly.' },
  { match: ['crude oil inventories', 'oil inventories'], higherIsStronger: false,
    measures: 'Change in the number of barrels of crude oil held in inventory by commercial firms during the past week.',
    whyTradersCare: 'Inventories affect the price of petroleum products, which feeds inflation, and directly move oil-linked currencies such as CAD.',
    source: 'Energy Information Administration (EIA)', frequency: 'Released weekly, on Wednesday.',
    ffNotes: 'A larger-than-expected build implies weaker demand and is negative for oil (and oil currencies).' },
];

// Pairs we know how to reason about, so we can show the ones a currency appears in.
const NEWS_MAJORS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'USD/CAD', 'AUD/USD', 'NZD/USD'];
const NEWS_CROSSES = ['EUR/GBP', 'EUR/JPY', 'GBP/JPY', 'AUD/JPY', 'EUR/AUD', 'AUD/NZD', 'CAD/JPY'];

function lookupEventInfo(title) {
  const t = (title || '').toLowerCase();
  return NEWS_EVENT_LIBRARY.find(e => e.match.some(m => t.includes(m))) || null;
}

// Parse a feed value like "175K", "3.2%", "-0.4", "1.2M", "2.75%" into a number.
function parseNewsNum(v) {
  if (v == null || v === '') return null;
  const s = String(v).replace(/[,%$]/g, '').trim();
  const m = s.match(/^(-?\d*\.?\d+)\s*([KMBT])?/i);
  if (!m) return null;
  const mult = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[(m[2] || '').toUpperCase()] || 1;
  return parseFloat(m[1]) * mult;
}

// Turn actual-vs-forecast (falling back to previous) into a currency bias.
function newsSurprise(event, info) {
  const actual = parseNewsNum(event.actual);
  if (actual == null) return null; // not released yet
  const fc = parseNewsNum(event.forecast);
  const base = fc != null ? fc : parseNewsNum(event.previous);
  if (base == null) return null;
  const diff = actual - base;
  const vs = fc != null ? 'forecast' : 'previous';
  if (diff === 0) return { dir: 0, label: 'in line with', pct: 0, vs };
  const beat = diff > 0;
  const bullish = info ? (info.higherIsStronger ? beat : !beat) : beat;
  const pct = base !== 0 ? (diff / Math.abs(base)) * 100 : null;
  return { dir: bullish ? 1 : -1, label: beat ? 'beat' : 'missed', pct, vs };
}

// Majors/crosses the currency appears in, with the direction the bias implies.
// A currency-bullish surprise lifts pairs where it's the base and drops pairs
// where it's the quote. dir 0/undefined => pairs to watch, no direction.
function affectedPairs(ccy, dir) {
  if (!ccy) return [];
  return [...NEWS_MAJORS, ...NEWS_CROSSES]
    .filter(p => p.startsWith(ccy + '/') || p.endsWith('/' + ccy))
    .map(p => ({ pair: p, up: !dir ? null : (p.slice(0, 3) === ccy ? dir > 0 : dir < 0) }));
}

// ---- Trading sessions (defined in UTC; rendered in the user's chosen timezone) ----
const TRADING_SESSIONS = [
  { id: 'sydney',  name: 'Sydney',       startUTC: 22 * 60, endUTC: 7 * 60,  color: '#a78bfa', tags: ['AUD', 'NZD', 'Asia-Pacific indices'], note: 'Often quieter, useful for AUD/NZD preparation.' },
  { id: 'tokyo',   name: 'Tokyo / Asia', startUTC: 0,       endUTC: 9 * 60,  color: '#8b5cf6', tags: ['JPY', 'AUD/JPY', 'Asian indices'],    note: 'Important for JPY pairs and Asia risk tone.' },
  { id: 'london',  name: 'London',       startUTC: 7 * 60,  endUTC: 16 * 60, color: '#7c3aed', tags: ['EUR', 'GBP', 'Gold', 'Major FX'],     note: 'Highest liquidity window for EUR and GBP.' },
  { id: 'newyork', name: 'New York',     startUTC: 12 * 60, endUTC: 21 * 60, color: '#22d3a5', tags: ['USD', 'CAD', 'US indices', 'Gold'],   note: 'US data releases and the London/NY overlap.' },
];

const SESSION_TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'America/Sao_Paulo',
  'Europe/London', 'Europe/Berlin', 'Europe/Zurich', 'Europe/Moscow',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Hong_Kong', 'Asia/Tokyo',
  'Australia/Sydney', 'Pacific/Auckland', 'UTC',
];

const modMin = (n, m) => ((n % m) + m) % m;
const inWindow = (t, s, e) => (s < e ? t >= s && t < e : t >= s || t < e);
const fmtClock = (m) => `${String(Math.floor(modMin(m, 1440) / 60)).padStart(2, '0')}:${String(modMin(m, 1440) % 60).padStart(2, '0')}`;
const fmtDuration = (m) => {
  const t = Math.max(0, Math.round(m));
  const h = Math.floor(t / 60), r = t % 60;
  return h ? `${h}h ${r}m` : `${r}m`;
};

// Minutes to add to UTC to get local wall-clock time in `tz` at instant `at`.
const tzOffsetMinutes = (tz, at) => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(at).filter(p => p.type !== 'literal');
    const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
    const asUTC = Date.UTC(+p.year, p.month - 1, +p.day, p.hour === '24' ? 0 : +p.hour, +p.minute, +p.second);
    return Math.round((asUTC - Math.floor(at.getTime() / 1000) * 1000) / 60000);
  } catch { return 0; }
};

const getSessionState = (session, tz, now) => {
  const offset = tzOffsetMinutes(tz, now);
  const start = modMin(session.startUTC + offset, 1440);
  const end = modMin(session.endUTC + offset, 1440);
  const nowMin = modMin(Math.floor(now.getTime() / 60000) + offset, 1440);
  const open = inWindow(nowMin, start, end);
  const length = modMin(end - start, 1440) || 1440;
  const elapsed = modMin(nowMin - start, 1440);
  return {
    start, end, open, nowMin,
    range: `${fmtClock(start)} - ${fmtClock(end)}`,
    countdown: fmtDuration(open ? modMin(end - nowMin, 1440) : modMin(start - nowMin, 1440)),
    progress: open ? Math.min(100, (elapsed / length) * 100) : 0,
    // Bar segments across a 24h track, split when the session crosses midnight.
    segments: start < end
      ? [{ left: (start / 1440) * 100, width: ((end - start) / 1440) * 100 }]
      : [{ left: (start / 1440) * 100, width: ((1440 - start) / 1440) * 100 }, { left: 0, width: (end / 1440) * 100 }],
  };
};

function LiveSessionsPanel({ tz, setTz, now }) {
  const theme = useTheme();
  return (
    <div className="card-lg" style={{ padding: 22 }}>
      <div className="flex items-start justify-between gap-3" style={{ marginBottom: 18 }}>
        <div>
          <h3 style={{ fontSize: 19, fontWeight: 700, color: theme.text, letterSpacing: '-0.3px' }}>Live Trading Sessions</h3>
          <p style={{ fontSize: 12.5, color: theme.textMuted, marginTop: 5, maxWidth: 280, lineHeight: 1.5 }}>
            Session cards, countdowns, and the timeline use one selected timezone.
          </p>
        </div>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Link size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: theme.textFaint, pointerEvents: 'none' }} />
          <select
            value={tz}
            onChange={e => setTz(e.target.value)}
            className="input input-sm"
            style={{ paddingLeft: 32, paddingRight: 30, borderRadius: 999, cursor: 'pointer', appearance: 'none', width: 'auto', minWidth: 172, fontWeight: 500 }}
          >
            {SESSION_TIMEZONES.map(z => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
          </select>
          <ChevronDown size={13} style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', color: theme.textFaint, pointerEvents: 'none' }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
        {TRADING_SESSIONS.map(session => {
          const s = getSessionState(session, tz, now);
          return (
            <div
              key={session.id}
              className="card card-hover"
              style={{
                padding: 16,
                borderColor: s.open ? 'rgba(34,211,165,0.42)' : theme.cardBorder,
                background: s.open
                  ? (theme.dark ? 'linear-gradient(155deg, rgba(34,211,165,0.10) 0%, rgba(16,14,26,0.94) 62%)' : 'rgba(34,211,165,0.06)')
                  : undefined,
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span style={{ fontSize: 15, fontWeight: 700, color: theme.text }}>{session.name}</span>
                <span className={s.open ? 'chip chip-live' : 'chip'} style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.7px', textTransform: 'uppercase', padding: '3px 9px' }}>
                  {s.open
                    ? <span className="pulse-dot" style={{ width: 5, height: 5, borderRadius: 999, background: theme.accent, display: 'inline-block' }} />
                    : <Moon size={10} />}
                  {s.open ? 'Live' : 'Closed'}
                </span>
              </div>

              <div style={{ fontSize: 12.5, color: theme.textMuted, marginTop: 6, fontFamily: "'JetBrains Mono', monospace" }}>{s.range}</div>

              <div className="flex items-center gap-1.5" style={{ marginTop: 12, fontSize: 12.5, color: s.open ? theme.accent : theme.textMuted, fontWeight: 500 }}>
                <Clock size={13} />
                {s.open ? `Closes in ${s.countdown}` : `Opens in ${s.countdown}`}
              </div>

              <div style={{ height: 4, borderRadius: 999, background: theme.dark ? 'rgba(255,255,255,0.07)' : 'rgba(20,17,31,0.07)', marginTop: 10, overflow: 'hidden' }}>
                <div className="progress-bar-animate" style={{ height: '100%', width: `${s.progress}%`, borderRadius: 999, background: theme.accent, boxShadow: s.open ? `0 0 10px ${theme.accent}` : 'none' }} />
              </div>

              <div className="flex flex-wrap gap-1.5" style={{ marginTop: 13 }}>
                {session.tags.map(t => <span key={t} className="chip" style={{ fontSize: 10.5, padding: '3px 9px' }}>{t}</span>)}
              </div>

              <p style={{ fontSize: 11.5, color: theme.textFaint, marginTop: 12, lineHeight: 1.5 }}>{session.note}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SessionTimelinePanel({ tz, now }) {
  const theme = useTheme();
  const offset = tzOffsetMinutes(tz, now);
  const nowMin = modMin(Math.floor(now.getTime() / 60000) + offset, 1440);
  const nowPct = (nowMin / 1440) * 100;

  return (
    <div className="card-lg" style={{ padding: 22 }}>
      <div className="flex items-start justify-between gap-3" style={{ marginBottom: 18 }}>
        <div>
          <h3 style={{ fontSize: 19, fontWeight: 700, color: theme.text, letterSpacing: '-0.3px' }}>24h Session Timeline</h3>
          <p style={{ fontSize: 12.5, color: theme.textMuted, marginTop: 5 }}>
            Current local time: <span style={{ color: theme.text, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{fmtClock(nowMin)}</span>
          </p>
        </div>
        <Clock size={17} style={{ color: theme.textFaint, flexShrink: 0, marginTop: 4 }} />
      </div>

      <div style={{ position: 'relative', paddingTop: 22 }}>
        {/* Now marker */}
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${nowPct}%`, width: 1.5, background: theme.dark ? 'rgba(255,255,255,0.85)' : 'rgba(20,17,31,0.65)', zIndex: 2, pointerEvents: 'none' }} />
        <div style={{
          position: 'absolute', top: 0, left: `${nowPct}%`, transform: 'translateX(-50%)', zIndex: 3,
          background: theme.dark ? '#f3f1fb' : '#14111f', color: theme.dark ? '#14111f' : '#ffffff',
          fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap',
        }}>
          Now {fmtClock(nowMin)}
        </div>

        {TRADING_SESSIONS.map(session => {
          const s = getSessionState(session, tz, now);
          return (
            <div key={session.id} style={{ marginBottom: 14 }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: s.open ? theme.text : theme.textMuted }}>{session.name}</span>
                <span style={{ fontSize: 11.5, color: theme.textFaint, fontFamily: "'JetBrains Mono', monospace" }}>{s.range}</span>
              </div>
              <div style={{ position: 'relative', height: 14, borderRadius: 999, background: theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(20,17,31,0.05)', overflow: 'hidden' }}>
                {s.segments.map((seg, i) => (
                  <div key={i} style={{
                    position: 'absolute', top: 0, bottom: 0,
                    left: `${seg.left}%`, width: `${seg.width}%`,
                    borderRadius: 999,
                    background: s.open ? theme.accent : session.color,
                    opacity: s.open ? 1 : (theme.dark ? 0.32 : 0.28),
                    boxShadow: s.open ? `0 0 14px ${theme.accent}66` : 'none',
                  }} />
                ))}
              </div>
            </div>
          );
        })}

        <div className="flex justify-between" style={{ marginTop: 10, fontSize: 10, color: theme.textFaint, fontFamily: "'JetBrains Mono', monospace" }}>
          {['00:00', '06:00', '12:00', '18:00', '24:00'].map(t => <span key={t}>{t}</span>)}
        </div>
      </div>
    </div>
  );
}

function NewsCalendarView() {
  const theme = useTheme();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCurrencies, setSelectedCurrencies] = useState(new Set()); // empty = All
  const [filterImpact, setFilterImpact] = useState('All');
  const [viewMode, setViewMode] = useState('week');
  const [lastFetched, setLastFetched] = useState(null);
  const [tz, setTz] = useState(() => {
    try { return localStorage.getItem('ellipse_news_tz') || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
    catch { return 'UTC'; }
  });
  const [now, setNow] = useState(() => new Date());
  const sessionsRef = useRef(null);
  const calendarRef = useRef(null);

  // Keep countdowns and the "now" marker live.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    try { localStorage.setItem('ellipse_news_tz', tz); } catch {}
  }, [tz]);

  // Saved filter profiles (currencies + impact + view), persisted locally.
  const [savedProfiles, setSavedProfiles] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ellipse_news_profiles') || '[]'); } catch { return []; }
  });
  const [profileName, setProfileName] = useState('');
  const [expandedEvent, setExpandedEvent] = useState(null);
  const persistProfiles = (list) => { setSavedProfiles(list); try { localStorage.setItem('ellipse_news_profiles', JSON.stringify(list)); } catch {} };
  const saveProfile = () => {
    const name = profileName.trim();
    if (!name) return;
    const profile = { name, currencies: [...selectedCurrencies], impact: filterImpact, viewMode };
    persistProfiles([...savedProfiles.filter(p => p.name !== name), profile]);
    setProfileName('');
  };
  const applyProfile = (p) => {
    setSelectedCurrencies(new Set(p.currencies || []));
    setFilterImpact(p.impact || 'All');
    if (p.viewMode) setViewMode(p.viewMode);
  };
  const deleteProfile = (name) => persistProfiles(savedProfiles.filter(p => p.name !== name));

  const scrollTo = (ref) => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

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
    
    // Use cache if less than 24 hours old. The JBlanked free tier is ~1 request/
    // day, so a long client cache (on top of the server-side daily cache) keeps
    // per-browser usage within budget; Refresh still re-checks the server cache.
    if (cached && cachedTime && (now - parseInt(cachedTime)) < 24 * 60 * 60 * 1000) {
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
      title: e.title || e.event || e.name || e.Name || '',
      country: e.country || e.currency || e.Currency || '',
      date: e.date || e.Date || '',
      impact: e.impact || e.importance || e.Impact || 'Low',
      forecast: e.forecast ?? e.Forecast ?? '',
      previous: e.previous ?? e.Previous ?? '',
      actual: e.actual ?? e.Actual ?? '',
      // Enriched fields from the JBlanked proxy (blank on the free feed).
      category: e.category || e.Category || '',
      outcome: e.outcome || e.Outcome || '',
      strength: e.strength || e.Strength || '',
      quality: e.quality || e.Quality || '',
    }));

    // Preferred source: JBlanked via our serverless proxy (richer fields incl.
    // Outcome/Strength/Quality). Needs JBLANKED_API_KEY on the server; if it's
    // absent or the call fails, we fall through to the free Forex Factory feed.
    try {
      const res = await fetch(`/api/news/calendar?mode=${mode === 'today' ? 'today' : 'week'}`, { signal: AbortSignal.timeout(9000) });
      if (res.ok) {
        const payload = await res.json();
        if (payload && Array.isArray(payload.events) && payload.events.length) {
          const normalized = normalize(payload.events);
          setEvents(normalized);
          setLastFetched(payload.fetchedAt ? new Date(payload.fetchedAt) : new Date());
          try { localStorage.setItem(cacheKey, JSON.stringify(normalized)); localStorage.setItem(cacheTimeKey, now.toString()); } catch {}
          setLoading(false);
          return;
        }
      }
    } catch { /* fall through to the free feed */ }

    // Try multiple free sources in order
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Hero */}
      <div className="card-lg" style={{ padding: '38px 40px', position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: theme.dark
            ? 'radial-gradient(620px 260px at 8% 0%, rgba(124,58,237,0.20), transparent 68%)'
            : 'radial-gradient(620px 260px at 8% 0%, rgba(139,92,246,0.12), transparent 68%)',
        }} />
        <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
          <div style={{ minWidth: 280, flex: '1 1 420px' }}>
            <span className="eyebrow"><Calendar size={12} />Market Preparation</span>
            <h2 style={{ fontSize: 46, fontWeight: 800, color: theme.text, letterSpacing: '-1.6px', lineHeight: 1.05, margin: '18px 0 0' }}>
              Economic Calendar
            </h2>
            <p style={{ fontSize: 14.5, color: theme.textMuted, marginTop: 14, maxWidth: 520, lineHeight: 1.65 }}>
              Track important market events, active trading sessions, and high-impact releases before they affect forex, crypto, commodities, and global indices.
            </p>
          </div>
          <div className="flex flex-wrap gap-3" style={{ flexShrink: 0 }}>
            <button onClick={() => { setViewMode('today'); scrollTo(calendarRef); }} className="btn-primary">
              View Today&apos;s Events
            </button>
            <button onClick={() => scrollTo(sessionsRef)} className="btn-ghost">
              Review Sessions
            </button>
          </div>
        </div>
      </div>

      {/* Sessions + Timeline */}
      <div ref={sessionsRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 20, alignItems: 'start' }}>
        <LiveSessionsPanel tz={tz} setTz={setTz} now={now} />
        <SessionTimelinePanel tz={tz} now={now} />
      </div>

      {/* Filter Bar */}
      <div ref={calendarRef} style={{ display: 'flex', flexDirection: 'column', gap: 10, scrollMarginTop: 12 }}>
        {/* Row 1: View mode + Impact + Status */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          {/* View mode toggle */}
          <div className="flex" style={{ background: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(20,17,31,0.04)', borderRadius: 999, padding: 3, border: `1px solid ${theme.cardBorder}` }}>
            {['today', 'week'].map(m => (
              <button key={m} onClick={() => setViewMode(m)} style={{ padding: '6px 16px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, background: viewMode === m ? theme.primaryGrad : 'transparent', color: viewMode === m ? '#ffffff' : theme.textMuted, boxShadow: viewMode === m ? '0 2px 10px rgba(124,58,237,0.35)' : 'none', transition: 'all 0.15s' }}>
                {m === 'today' ? 'Today' : 'This Week'}
              </button>
            ))}
          </div>

          {/* Impact filter */}
          <div className="flex" style={{ background: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(20,17,31,0.04)', borderRadius: 999, padding: 3, border: `1px solid ${theme.cardBorder}` }}>
            {['All', 'High', 'Medium', 'Low'].map(imp => {
              const active = filterImpact === imp;
              const c = IMPACT_COLORS[imp] || theme.text;
              return (
                <button key={imp} onClick={() => setFilterImpact(imp)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, background: active ? (imp === 'All' ? theme.primarySoft : `${c}22`) : 'transparent', color: active ? (imp === 'All' ? theme.text : c) : theme.textMuted, transition: 'all 0.15s' }}>
                  {imp !== 'All' && <span style={{ width: 6, height: 6, borderRadius: 999, background: c, opacity: active ? 1 : 0.5 }} />}
                  {imp}
                </button>
              );
            })}
          </div>

          <div style={{ flex: 1 }} />

          {/* Status */}
          <div className="flex items-center gap-2" style={{ fontSize: 11, color: theme.textFaint }}>
            {highImpactToday > 0 && (
              <span className="chip" style={{ color: theme.neg, background: 'rgba(244,85,122,0.12)', borderColor: 'rgba(244,85,122,0.28)', fontWeight: 600 }}>
                <span className="pulse-warn" style={{ width: 6, height: 6, borderRadius: 999, background: theme.neg, display: 'inline-block' }} />
                {highImpactToday} high-impact today
              </span>
            )}
            {lastFetched && <span>Updated {lastFetched.toLocaleTimeString()}</span>}
          </div>

          <button onClick={() => { localStorage.removeItem(`ellipse_news_${viewMode}`); localStorage.removeItem(`ellipse_news_${viewMode}_time`); loadEvents(viewMode); }} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontSize: 12.5, borderRadius: 999 }}>
            <RefreshCw size={13} />Refresh
          </button>
        </div>

        {/* Row 2: Currency Groups + Individual Currencies */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          {/* Group presets */}
          <span style={{ fontSize: 11, color: theme.textFaint, marginRight: 2 }}>Groups:</span>
          <div className="flex" style={{ background: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(20,17,31,0.04)', borderRadius: 999, padding: 3, border: `1px solid ${theme.cardBorder}` }}>
            {Object.keys(CURRENCY_GROUPS).map(group => {
              const groupCcys = CURRENCY_GROUPS[group];
              const isActive = group === 'All'
                ? selectedCurrencies.size === 0
                : groupCcys.length > 0 && groupCcys.every(c => selectedCurrencies.has(c)) && selectedCurrencies.size === groupCcys.length;
              return (
                <button key={group} onClick={() => applyGroup(group)} style={{ padding: '4px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, background: isActive ? theme.primaryGrad : 'transparent', color: isActive ? '#ffffff' : theme.textMuted, boxShadow: isActive ? '0 2px 8px rgba(124,58,237,0.32)' : 'none', transition: 'all 0.15s' }}>
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
              <button key={ccy} onClick={() => toggleCurrency(ccy)} style={{ padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 600, border: `1px solid ${isSelected ? 'rgba(139,92,246,0.55)' : theme.cardBorder}`, background: isSelected ? theme.primarySoft : 'transparent', color: isSelected ? (theme.dark ? '#c4b5fd' : '#6d28d9') : theme.textMuted, cursor: 'pointer', transition: 'all 0.15s' }}>
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

        {/* Row 3: Saved filter profiles */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: theme.textFaint, marginRight: 2 }}>Profiles:</span>
          {savedProfiles.length === 0 && <span style={{ fontSize: 11, color: theme.textFaint, fontStyle: 'italic' }}>none saved yet</span>}
          {savedProfiles.map(p => (
            <span key={p.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 6px 4px 12px', borderRadius: 999, border: `1px solid ${theme.cardBorder}`, background: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(20,17,31,0.03)' }}>
              <button onClick={() => applyProfile(p)} title={`${(p.currencies || []).join(', ') || 'All currencies'} · ${p.impact} · ${p.viewMode}`} style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: theme.textMuted }}>
                {p.name}
              </button>
              <button onClick={() => deleteProfile(p.name)} title="Delete profile" style={{ display: 'flex', padding: 2, border: 'none', background: 'none', cursor: 'pointer', color: theme.textFaint }}>
                <X size={11} />
              </button>
            </span>
          ))}
          <div style={{ width: 1, height: 18, background: theme.cardBorder, margin: '0 2px' }} />
          <input
            value={profileName}
            onChange={e => setProfileName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveProfile(); }}
            placeholder="Save current as…"
            className="input input-sm"
            style={{ width: 150, padding: '4px 10px', fontSize: 11 }}
          />
          <button onClick={saveProfile} disabled={!profileName.trim()} className="btn-ghost" style={{ padding: '5px 12px', fontSize: 11, borderRadius: 999, opacity: profileName.trim() ? 1 : 0.5, cursor: profileName.trim() ? 'pointer' : 'default' }}>
            Save
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="card-lg" style={{ padding: 60, textAlign: 'center' }}>
          <Loader2 size={28} style={{ color: theme.primary, animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 13, color: theme.textFaint }}>Loading economic calendar…</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: 16, borderRadius: 14, background: 'rgba(244,85,122,0.1)', border: '1px solid rgba(244,85,122,0.28)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertCircle size={16} style={{ color: theme.neg, flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: theme.neg }}>{error}</span>
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
            <div className="flex items-center gap-2.5 flex-wrap" style={{ marginBottom: 10 }}>
              {isToday && <span className="eyebrow" style={{ padding: '3px 10px' }}>Today</span>}
              <span style={{ fontSize: 12, fontWeight: 700, color: isToday ? theme.text : theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.7px' }}>
                {new Date(dateKey + 'T00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </span>
              <span style={{ flex: 1, height: 1, background: theme.cardBorder, minWidth: 12 }} />
              {highCount > 0 && (
                <span className="chip" style={{ color: theme.neg, background: 'rgba(244,85,122,0.12)', borderColor: 'rgba(244,85,122,0.28)', fontWeight: 600 }}>
                  {highCount} high impact
                </span>
              )}
              <span className="chip">{dayEvents.length} events</span>
            </div>

            <div className="card-lg" style={{ overflow: 'hidden' }}>
              {/* Table header */}
              <div style={{ display: 'grid', gridTemplateColumns: '76px 54px 74px 1fr 82px 82px 82px', gap: 8, padding: '11px 18px', background: theme.dark ? 'rgba(255,255,255,0.02)' : '#faf9fe', borderBottom: `1px solid ${theme.cardBorder}` }}>
                {['Time', 'Ccy', 'Impact', 'Event'].map(h => (
                  <span key={h} style={{ fontSize: 10, fontWeight: 600, color: theme.textFaint, textTransform: 'uppercase', letterSpacing: '0.7px' }}>{h}</span>
                ))}
                {['Forecast', 'Previous', 'Actual'].map(h => (
                  <span key={h} style={{ fontSize: 10, fontWeight: 600, color: theme.textFaint, textTransform: 'uppercase', letterSpacing: '0.7px', textAlign: 'right' }}>{h}</span>
                ))}
              </div>

              {dayEvents.map((event, i) => {
                const eventTime = event.date ? new Date(event.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '--:--';
                const impactColor = IMPACT_COLORS[event.impact] || theme.textFaint;
                const isHigh = event.impact === 'High';
                const rowKey = `${event.date}|${event.title}|${event.country}`;
                const isOpen = expandedEvent === rowKey;
                const info = isOpen ? lookupEventInfo(event.title) : null;
                const surprise = isOpen ? newsSurprise(event, info) : null;
                // Prefer the provider's Quality (Good/Bad-for-currency) when present;
                // otherwise fall back to our computed actual-vs-forecast bias.
                const qualityDir = isOpen && event.quality ? (/good/i.test(event.quality) ? 1 : /bad/i.test(event.quality) ? -1 : 0) : null;
                const biasDir = qualityDir != null ? qualityDir : (surprise?.dir ?? 0);
                const hasProvider = isOpen && (event.quality || event.strength || event.outcome || event.category);
                const pairs = isOpen ? affectedPairs(event.country, biasDir) : [];
                return (
                  <div key={rowKey}>
                    <div
                      className="news-row"
                      onClick={() => setExpandedEvent(isOpen ? null : rowKey)}
                      style={{ position: 'relative', display: 'grid', gridTemplateColumns: '76px 54px 74px 1fr 82px 82px 82px', gap: 8, padding: '13px 18px', borderBottom: isOpen ? 'none' : `1px solid ${theme.cardBorder}`, background: isOpen ? theme.hoverBg : (isHigh ? (theme.dark ? 'rgba(244,85,122,0.055)' : 'rgba(244,85,122,0.035)') : 'transparent'), cursor: 'pointer' }}
                    >
                      {isHigh && <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2.5, background: theme.neg }} />}
                      <span style={{ fontSize: 12.5, color: theme.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{eventTime}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>{event.country}</span>
                      <span className="badge" style={{ background: `${impactColor}1f`, color: impactColor, justifySelf: 'start' }}>
                        <span style={{ width: 5, height: 5, borderRadius: 999, background: impactColor }} />
                        {event.impact}
                      </span>
                      <span style={{ fontSize: 13, color: theme.text, fontWeight: isHigh ? 600 : 400, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <ChevronDown size={13} style={{ color: theme.textFaint, flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                        {event.quality && (
                          <span
                            title={`${event.strength || ''}${event.strength && event.quality ? ' · ' : ''}${event.quality || ''}`.trim()}
                            style={{ width: 7, height: 7, borderRadius: 999, flexShrink: 0, background: /good/i.test(event.quality) ? theme.pos : /bad/i.test(event.quality) ? theme.neg : theme.textFaint, opacity: /weak/i.test(event.strength || '') ? 0.4 : 1 }}
                          />
                        )}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.title}</span>
                      </span>
                      <span style={{ fontSize: 13, color: theme.textMuted, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{event.forecast || '—'}</span>
                      <span style={{ fontSize: 13, color: theme.textMuted, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{event.previous || '—'}</span>
                      <span style={{ fontSize: 13, fontWeight: event.actual ? 600 : 400, color: event.actual ? theme.text : theme.textFaint, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{event.actual || '—'}</span>
                    </div>

                    {isOpen && (
                      <div style={{ padding: '4px 18px 16px 44px', borderBottom: `1px solid ${theme.cardBorder}`, background: theme.hoverBg }}>
                        {info ? (
                          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, auto) 1fr', gap: '6px 14px', alignItems: 'baseline' }}>
                            {[
                              ['Measures', info.measures],
                              ['Usual Effect', `'Actual' ${info.higherIsStronger ? 'greater' : 'less'} than 'Forecast' is good for ${event.country}`],
                              ['Frequency', info.frequency],
                              ['Source', info.source],
                              ['Why Traders Care', info.whyTradersCare],
                              ['FF Notes', info.ffNotes],
                              ['Also Called', info.alsoCalled],
                              ['Acronym', info.acronym],
                            ].filter(([, v]) => v).map(([label, value]) => (
                              <React.Fragment key={label}>
                                <div style={{ fontSize: 10.5, fontWeight: 600, color: theme.textFaint, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
                                <div style={{ fontSize: 12.5, color: theme.text, lineHeight: 1.5 }}>{value}</div>
                              </React.Fragment>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12.5, color: theme.textMuted, lineHeight: 1.55 }}>No specs on file for this release — showing the raw numbers and pair impact only.</div>
                        )}

                        {hasProvider && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                            {event.category && <span className="badge" style={{ background: theme.hoverBg, color: theme.textMuted }}>{event.category}</span>}
                            {event.strength && <span className="badge" style={{ background: theme.hoverBg, color: /strong/i.test(event.strength) ? theme.text : theme.textFaint }}>{event.strength}</span>}
                            {event.quality && <span className="badge" style={{ background: /good/i.test(event.quality) ? theme.accentSoft : /bad/i.test(event.quality) ? 'rgba(244,85,122,0.1)' : theme.hoverBg, color: /good/i.test(event.quality) ? theme.pos : /bad/i.test(event.quality) ? theme.neg : theme.textMuted }}>{event.quality}</span>}
                            {event.outcome && <span style={{ fontSize: 11, color: theme.textFaint, fontFamily: "'JetBrains Mono', monospace", alignSelf: 'center' }}>{event.outcome}</span>}
                          </div>
                        )}

                        {surprise ? (
                          <div style={{ marginTop: 10, fontSize: 12.5, color: theme.text }}>
                            Actual <strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>{event.actual}</strong> {surprise.label} {surprise.vs} <strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>{surprise.vs === 'forecast' ? event.forecast : event.previous}</strong>
                            {surprise.pct != null && surprise.dir !== 0 ? ` (${surprise.pct >= 0 ? '+' : ''}${surprise.pct.toFixed(1)}%)` : ''}
                            {' → '}
                            <span style={{ fontWeight: 600, color: biasDir > 0 ? theme.pos : biasDir < 0 ? theme.neg : theme.textMuted }}>
                              {biasDir > 0 ? `${event.country} bullish` : biasDir < 0 ? `${event.country} bearish` : 'neutral'}
                            </span>
                            {qualityDir != null && <span style={{ fontSize: 10.5, color: theme.textFaint }}> (provider read)</span>}
                          </div>
                        ) : (
                          <div style={{ marginTop: 10, fontSize: 12, color: theme.textFaint }}>Not released yet — the directional read appears once the actual prints. Pairs to watch:</div>
                        )}

                        {pairs.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                            {pairs.map(({ pair, up }) => (
                              <span key={pair} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, border: `1px solid ${up == null ? theme.cardBorder : (up ? 'rgba(34,211,165,0.35)' : 'rgba(244,85,122,0.35)')}`, background: up == null ? 'transparent' : (up ? theme.accentSoft : 'rgba(244,85,122,0.1)'), color: up == null ? theme.textMuted : (up ? theme.pos : theme.neg) }}>
                                {up == null ? <Activity size={12} /> : up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                {pair}
                              </span>
                            ))}
                          </div>
                        )}

                        <div style={{ fontSize: 10.5, color: theme.textFaint, marginTop: 10, fontStyle: 'italic' }}>
                          General guide from the release surprise, not trade advice — price often moves on the details and forward guidance.
                        </div>
                      </div>
                    )}
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
  const gradeCtx = outcomeContext(filtered);
  // Only show the Structure column when at least one visible trade is tagged —
  // otherwise it renders as a confusing always-blank column.
  const showStructure = filtered.some(t => t.marketStructure);
  const listCols = selectMode
    ? `36px 1.5fr 80px ${showStructure ? '100px ' : ''}70px 100px 72px`
    : `1.5fr 80px ${showStructure ? '100px ' : ''}70px 100px 72px 50px`;

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
                <button onClick={handleBulkDelete} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: theme.neg, fontSize: 12, fontWeight: 500, color: 'white', cursor: 'pointer' }}>
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
          <div className="table-header" style={{ display: 'grid', gridTemplateColumns: listCols, gap: 12 }}>
            {selectMode && <div></div>}
            <div>Trade</div><div>Side</div>{showStructure && <div>Structure</div>}<div>Lots</div><div style={{ textAlign: 'right' }}>P&L</div><div style={{ textAlign: 'center' }}>Quality</div>{!selectMode && <div></div>}
          </div>
          {filtered.map(trade => {
            const chartImg = getTradingViewImageUrl(trade.chartLink) || trade.chartImage;
            const isSelected = selectedIds.has(trade.id);
            return (
              <div key={trade.id} onClick={() => selectMode ? toggleSelect(trade.id, { stopPropagation: () => {} }) : onSelectTrade(trade)} className="table-row" style={{ display: 'grid', gridTemplateColumns: listCols, gap: 12, alignItems: 'center', background: isSelected ? (theme.dark ? 'rgba(139,92,246,0.15)' : 'rgba(139,92,246,0.08)') : undefined }}>
                {selectMode && (
                  <div onClick={(e) => toggleSelect(trade.id, e)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${isSelected ? '#8b5cf6' : theme.cardBorder}`, background: isSelected ? '#8b5cf6' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
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
                    <div style={{ width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, background: trade.pnl >= 0 ? 'rgba(34,211,165,0.1)' : 'rgba(244,85,122,0.1)', color: trade.pnl >= 0 ? theme.pos : theme.neg }}>{trade.symbol?.slice(0, 2)}</div>
                  )}
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: theme.text }}>{trade.symbol}</div>
                    <div style={{ fontSize: 12, color: theme.textFaint }}>{trade.date}</div>
                  </div>
                </div>
                <span className="badge" style={{ background: trade.side === 'Long' ? 'rgba(34,211,165,0.1)' : 'rgba(244,85,122,0.1)', color: trade.side === 'Long' ? theme.pos : theme.neg }}>{trade.side}</span>
                {showStructure && (trade.marketStructure
                  ? <span className="badge" style={{ background: MARKET_STRUCTURES[trade.marketStructure]?.color, color: 'white' }}>{trade.marketStructure.replace('_', ' ').slice(0, 8)}</span>
                  : <span style={{ fontSize: 13, color: theme.textFaint }}>—</span>)}
                <span style={{ fontSize: 14, color: theme.text }}>{trade.lots}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: trade.pnl >= 0 ? theme.pos : theme.neg, textAlign: 'right' }}>{trade.pnl >= 0 ? '+' : ''}${trade.pnl?.toFixed(2)}</span>
                <span style={{ textAlign: 'center' }}><TradeGradeBadge trade={trade} theme={theme} ctx={gradeCtx} /></span>
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
              <div key={trade.id} onClick={() => selectMode ? toggleSelect(trade.id, { stopPropagation: () => {} }) : onSelectTrade(trade)} className="card" style={{ cursor: 'pointer', overflow: 'hidden', transition: 'transform 0.15s, box-shadow 0.15s', outline: isSelected ? '2px solid #8b5cf6' : 'none' }}
                onMouseEnter={(e) => { if (!selectMode) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'; } }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
                {selectMode && (
                  <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 2, width: 22, height: 22, borderRadius: 6, border: `2px solid ${isSelected ? '#8b5cf6' : 'rgba(255,255,255,0.5)'}`, background: isSelected ? '#8b5cf6' : 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isSelected && <CheckCircle size={14} style={{ color: 'white' }} />}
                  </div>
                )}
                {chartImg ? (
                  <div style={{ width: '100%', height: 140, background: theme.hoverBg, position: 'relative' }}>
                    <img src={chartImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => e.target.parentElement.style.display = 'none'} />
                  </div>
                ) : (
                  <div style={{ width: '100%', height: 80, background: trade.pnl >= 0 ? 'rgba(34,211,165,0.05)' : 'rgba(244,85,122,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    <span style={{ fontSize: 28, fontWeight: 700, color: trade.pnl >= 0 ? theme.pos : theme.neg, opacity: 0.3 }}>{trade.symbol}</span>
                  </div>
                )}
                <div style={{ padding: 16 }}>
                  <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: theme.text }}>{trade.symbol}</div>
                      <div style={{ fontSize: 12, color: theme.textFaint }}>{trade.date} · {trade.time}</div>
                    </div>
                    <span style={{ fontSize: 18, fontWeight: 700, color: trade.pnl >= 0 ? theme.pos : theme.neg }}>{trade.pnl >= 0 ? '+' : ''}${trade.pnl?.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                    <span className="badge" style={{ background: trade.side === 'Long' ? 'rgba(34,211,165,0.1)' : 'rgba(244,85,122,0.1)', color: trade.side === 'Long' ? theme.pos : theme.neg }}>{trade.side}</span>
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
  const [pnlRangeDays, setPnlRangeDays] = useState(14); // trading days shown on the P&L cards; 0 = all history
  const pnlWindow = pnlRangeDays > 0 ? pnlRangeDays : Infinity;
  // Score against the real prop rules for this account when a challenge is active.
  const propRules = resolvePropRules(challenges, accounts, selectedAccount);
  const filtered = selectedAccount === 'all' ? trades : trades.filter(t => t.account === selectedAccount);
  
  const totalTrades = filtered.length;
  const wins = filtered.filter(t => t.pnl > 0);
  const losses = filtered.filter(t => t.pnl < 0);
  const totalPnl = filtered.reduce((s, t) => s + t.pnl, 0);

  // NET P&L card: when the selected account has an active challenge, show only its
  // current-phase profit (which resets after each pass). Otherwise, all-time P&L.
  const activeChallengeForCard = selectedAccount === 'all'
    ? null
    : challenges.find(c => c.status === 'active' && c.account === selectedAccount);
  const netPnlCardTrades = activeChallengeForCard
    ? tradesInPhase(trades, activeChallengeForCard, activeChallengeForCard.currentPhase ?? 0)
    : filtered;
  const netPnlCard = netPnlCardTrades.reduce((s, t) => s + (parseFloat(t.pnl) || 0), 0);
  const netPnlCardCount = netPnlCardTrades.length;
  const netPnlCardPhase = activeChallengeForCard
    ? (activeChallengeForCard.phases?.[activeChallengeForCard.currentPhase ?? 0]?.name || 'Current phase')
    : null;

  const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 1;
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
  const expectancy = totalTrades > 0 ? (winRate / 100 * avgWin) - ((100 - winRate) / 100 * avgLoss) : 0;
  const avgWinLossRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? 3 : 0;

  // Ellipse Score is computed by <EllipseScorePanel /> from the trade list.

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
  const uniqueDates = [...new Set(filtered.map(t => t.date))].sort().slice(-pnlWindow);
  uniqueDates.forEach(date => {
    const dayTrades = filtered.filter(t => t.date === date);
    dailyPnlData.push({ date: date.slice(5), pnl: dayTrades.reduce((s, t) => s + t.pnl, 0) });
  });

  const cumulativePnlData = [];
  const dateGroups = {};
  [...filtered].sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(t => {
    if (!dateGroups[t.date]) dateGroups[t.date] = 0;
    dateGroups[t.date] += t.pnl;
  });
  // Entries are ascending by date (inserted in sorted order). Show the selected
  // window but seed the running total with everything before it, so the
  // "cumulative" line reflects the true total instead of restarting at 0.
  const cumEntries = Object.entries(dateGroups);
  const cumWindowStart = Math.max(0, cumEntries.length - pnlWindow);
  let cumulative = cumEntries.slice(0, cumWindowStart).reduce((s, [, pnl]) => s + pnl, 0);
  cumEntries.slice(cumWindowStart).forEach(([date, pnl]) => {
    cumulative += pnl;
    cumulativePnlData.push({ date: date.slice(5), pnl: +cumulative.toFixed(2) });
  });

  // Where y=0 sits as a 0..1 fraction of the chart's vertical range, used to
  // split the area gradient into green-above / red-below.
  const cumValues = cumulativePnlData.map(d => d.pnl);
  const cumMax = cumValues.length ? Math.max(...cumValues) : 0;
  const cumMin = cumValues.length ? Math.min(...cumValues) : 0;
  const cumZeroOffset = cumMax <= 0 ? 0 : cumMin >= 0 ? 1 : cumMax / (cumMax - cumMin);

  // Shared range selector for the two P&L cards (windows the most recent N trading days).
  const pnlRangeControl = (
    <select
      value={pnlRangeDays}
      onChange={(e) => setPnlRangeDays(Number(e.target.value))}
      className="input input-sm"
      aria-label="P&L date range"
      style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }}
    >
      <option value={7}>7D</option>
      <option value={14}>14D</option>
      <option value={30}>30D</option>
      <option value={90}>90D</option>
      <option value={0}>All</option>
    </select>
  );

  const sortedTrades = [...filtered].sort((a, b) => new Date(b.date + ' ' + b.time) - new Date(a.date + ' ' + a.time));
  const recentTrades = sortedTrades.slice(0, 5);

  // Active challenges summary — follows the account dropdown; hidden on "All Accounts".
  const activeChallenges = selectedAccount === 'all'
    ? []
    : challenges.filter(c => c.status === 'active' && c.account === selectedAccount);

  const DonutChart = ({ value, size = 60, strokeWidth = 6, color = theme.pos }) => {
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          {activeChallenges.map(ch => {
            // Phase-scoped: profit resets to the initial account size each phase (incl. after passing into Funded)
            const chTrades = tradesInPhase(trades, ch, ch.currentPhase ?? 0);
            const chPnl = chTrades.reduce((s, t) => s + (parseFloat(t.pnl) || 0), 0);
            const chAccountSize = ch.accountSize || 1;
            const chProfitPct = (chPnl / chAccountSize) * 100;
            const phase = ch.phases?.[ch.currentPhase] || ch.phases?.[0] || {};
            const targetPct = phase.profitTarget ?? 10;
            const progress = targetPct ? Math.min((chProfitPct / targetPct) * 100, 100) : 0;
            
            return (
              <div key={ch.id} className="card" style={{ padding: 16, borderLeft: '3px solid #8b5cf6' }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{ch.name}</div>
                    <div style={{ fontSize: 11, color: theme.textFaint }}>{phase?.name}</div>
                  </div>
                  <Shield size={16} style={{ color: '#8b5cf6' }} />
                </div>
                <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: chPnl >= 0 ? theme.pos : theme.neg }}>{chProfitPct.toFixed(2)}%</span>
                  <span style={{ fontSize: 12, color: theme.textFaint }}>/ {targetPct}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: theme.hoverBg, overflow: 'hidden' }}>
                  <div className="progress-bar-animate" style={{ height: '100%', borderRadius: 3, width: `${Math.max(progress, 0)}%`, background: progress >= 100 ? theme.pos : '#8b5cf6' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Top Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        <div className="card" style={{ padding: 16 }}>
          <div className="flex items-center gap-2"><div className="stat-label">Net P&L</div><div title={`${netPnlCardCount} ${netPnlCardPhase ? 'phase' : 'closed'} trades`} style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 4, background: theme.hoverBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: theme.textMuted }}>{netPnlCardCount}</div></div>
          <div style={{ fontSize: 22, fontWeight: 700, color: netPnlCard >= 0 ? theme.pos : theme.neg, marginTop: 6 }}>{netPnlCard >= 0 ? '+' : ''}${netPnlCard.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          {netPnlCardPhase && <div title="Scoped to the active challenge's current phase" style={{ fontSize: 10, color: theme.textFaint, marginTop: 3 }}>{netPnlCardPhase} · resets each phase</div>}
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="stat-label">Trade Expectancy</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: expectancy >= 0 ? theme.pos : theme.neg, marginTop: 6 }}>${expectancy.toFixed(2)}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="stat-label">Profit Factor</div>
          <div className="flex items-center gap-3" style={{ marginTop: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: profitFactor >= 1.5 ? theme.pos : profitFactor >= 1 ? '#f59e0b' : theme.neg }}>{profitFactor >= 99 ? '∞' : profitFactor.toFixed(2)}</span>
            <DonutChart value={Math.min(profitFactor / 3 * 100, 100)} size={40} strokeWidth={4} color={profitFactor >= 1.5 ? theme.pos : profitFactor >= 1 ? '#f59e0b' : theme.neg} />
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="flex items-center gap-2"><div className="stat-label">Win %</div><div style={{ display: 'flex', gap: 4 }}><span title={`${wins.length} winning trades`} style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: theme.pos, color: 'white' }}>{wins.length}W</span><span title={`${losses.length} losing trades`} style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: theme.neg, color: 'white' }}>{losses.length}L</span></div></div>
          <div className="flex items-center gap-3" style={{ marginTop: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: theme.text }}>{winRate.toFixed(2)}%</span>
            <DonutChart value={winRate} size={40} strokeWidth={4} color={winRate >= 50 ? theme.pos : theme.neg} />
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="stat-label">Avg Win/Loss Trade</div>
          <div className="flex items-center gap-2" style={{ marginTop: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: theme.text }}>{avgWinLossRatio.toFixed(1)}</span>
            <div style={{ display: 'flex', flexDirection: 'column', fontSize: 11 }}>
              <span style={{ color: theme.pos }}>${avgWin.toFixed(2)}</span>
              <span style={{ color: theme.neg }}>${avgLoss.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Score column on the left; the two P&L charts stack to its right so the
          score's natural height is filled rather than stretching chart cards. */}
      <div style={{ display: 'grid', gridTemplateColumns: '340px minmax(0, 1fr)', gap: 12, alignItems: 'stretch' }}>
        <EllipseScorePanel trades={filtered} rules={propRules} size={150} />
        <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 12, minHeight: 0 }}>
          <ChartCard title="Daily Net Cumulative P&L" minHeight={140} right={pnlRangeControl}>
            <CumulativePnlChart data={cumulativePnlData} theme={theme} id="dashCum" />
          </ChartCard>
          <ChartCard title="Net Daily P&L" minHeight={140} right={pnlRangeControl}>
            <DailyPnlChart data={dailyPnlData} theme={theme} />
          </ChartCard>
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
                  <span style={{ fontSize: 13, fontWeight: 600, color: t.pnl >= 0 ? theme.pos : theme.neg }}>{t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}</span>
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
              <span style={{ color: monthlyPnl >= 0 ? theme.pos : theme.neg, fontWeight: 600 }}>${monthlyPnl.toFixed(2)}</span>
              <span>{monthlyTradeDays} days</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d} style={{ padding: 6, textAlign: 'center', fontSize: 11, fontWeight: 500, color: theme.textFaint }}>{d}</div>)}
            {calendarDays.map((day, i) => {
              const data = getDayData(day);
              const dayBg = data 
                ? data.pnl >= 0 
                  ? 'linear-gradient(135deg, rgba(34,211,165,0.08) 0%, rgba(34,211,165,0.22) 100%)'
                  : 'linear-gradient(135deg, rgba(244,85,122,0.08) 0%, rgba(244,85,122,0.22) 100%)'
                : 'transparent';
              return (
                <div key={i} style={{ minHeight: 50, padding: 4, borderRadius: 6, background: dayBg, border: day ? `1px solid ${data ? (data.pnl >= 0 ? 'rgba(34,211,165,0.25)' : 'rgba(244,85,122,0.25)') : theme.cardBorder}` : 'none' }}>
                  {day && <><div style={{ fontSize: 11, color: data ? (data.pnl >= 0 ? theme.pos : theme.neg) : theme.textMuted, fontWeight: data ? 600 : 400 }}>{day}</div>{data && <div style={{ marginTop: 2 }}><div style={{ fontSize: 11, fontWeight: 600, color: data.pnl >= 0 ? theme.pos : theme.neg }}>{data.pnl >= 0 ? '+' : ''}{Math.abs(data.pnl) >= 1000 ? (data.pnl / 1000).toFixed(1) + 'K' : data.pnl.toFixed(0)}</div><div style={{ fontSize: 10, color: theme.textFaint }}>{data.trades} trade{data.trades > 1 ? 's' : ''}</div></div>}</>}
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
    // Phase-scoped so merged equity resets to the initial account size after each pass (incl. Funded)
    const accountTrades = tradesInPhase(trades, ch, ch.currentPhase ?? 0);
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
      active: { bg: 'rgba(139,92,246,0.1)', text: '#8b5cf6', label: 'Active' },
      passed: { bg: 'rgba(34,211,165,0.1)', text: theme.pos, label: 'Passed' },
      failed: { bg: 'rgba(244,85,122,0.1)', text: theme.neg, label: 'Failed' },
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
          <div className="stat-label" title="Combined live equity across all accounts (starting balance + open P&L)" style={{ cursor: 'help' }}>Merged Equity</div>
          <div className="stat-value" style={{ color: totalEquity >= totalBalance ? theme.pos : theme.neg, marginTop: 6 }}>${totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
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
                      <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
                        <div style={{ fontSize: 15, fontWeight: 600, color: totalPnl >= 0 ? theme.pos : theme.neg, marginTop: 2 }}>
                          {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', minWidth: 100 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Equity</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: mergedEquity >= ch.accountSize ? theme.pos : theme.neg, marginTop: 2 }}>
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
                            const dotColor = p.isPast ? theme.pos : p.isCurrent ? '#8b5cf6' : theme.cardBorder;
                            const lineColor = p.isPast ? theme.pos : theme.cardBorder;
                            return (
                              <div key={idx} style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1 }}>
                                  <div style={{ width: p.isCurrent ? 16 : 12, height: p.isCurrent ? 16 : 12, borderRadius: '50%', background: dotColor, border: p.isCurrent ? '3px solid rgba(139,92,246,0.3)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {p.isPast && <CheckCircle size={8} style={{ color: 'white' }} />}
                                  </div>
                                  <div style={{ marginTop: 8, textAlign: 'center' }}>
                                    <div style={{ fontSize: 12, fontWeight: p.isCurrent ? 600 : 400, color: p.isCurrent ? '#8b5cf6' : p.isPast ? theme.pos : theme.textFaint }}>{p.name}</div>
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
                          <div style={{ fontSize: 16, fontWeight: 600, color: profitPct >= (phase.profitTarget || 999) ? theme.pos : theme.text, marginTop: 4 }}>
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
                          <div style={{ fontSize: 16, fontWeight: 600, color: tradingDays >= (phase.minTradingDays || 0) ? theme.pos : theme.text, marginTop: 4 }}>
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
                            <button onClick={(e) => { e.stopPropagation(); setEditAcc(linkedAccount); }} title="Edit account" style={{ padding: 6, borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer' }}>
                              <Edit3 size={14} style={{ color: theme.textFaint }} />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setDeleteId(linkedAccount.id); }} title="Delete account" style={{ padding: 6, borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer' }}>
                              <Trash2 size={14} style={{ color: theme.neg }} />
                            </button>
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
                  <div style={{ textAlign: 'right' }}><div style={{ fontSize: 14, fontWeight: 600, color: acc.equity >= acc.balance ? theme.pos : theme.neg }}>${acc.equity.toLocaleString()}</div><div style={{ fontSize: 11, color: theme.textFaint }}>Equity</div></div>
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
      {deleteId && (() => {
        const acc = accounts.find(a => a.id === deleteId);
        const linkedChallenges = challenges.filter(c => c.account === acc?.name);
        const tradeCount = trades.filter(t => t.account === acc?.name).length;
        return (
          <Modal onClose={() => setDeleteId(null)}>
            <div style={{ padding: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: theme.text, marginBottom: 8 }}>Remove Account?</h3>
              <p style={{ fontSize: 14, color: theme.textMuted, marginBottom: 12 }}>
                This will remove <strong style={{ color: theme.text }}>{acc?.name}</strong>.
              </p>
              {(linkedChallenges.length > 0 || tradeCount > 0) && (
                <div style={{ padding: 12, borderRadius: 8, background: 'rgba(244,85,122,0.08)', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <AlertTriangle size={16} style={{ color: theme.neg, flexShrink: 0, marginTop: 2 }} />
                  <div style={{ fontSize: 12, color: theme.text, lineHeight: 1.5 }}>
                    {linkedChallenges.length > 0 && (
                      <div>
                        Linked to <strong>{linkedChallenges.length}</strong> challenge{linkedChallenges.length > 1 ? 's' : ''}: {linkedChallenges.map(c => c.name).join(', ')}. Their tracking will become inaccurate.
                      </div>
                    )}
                    {tradeCount > 0 && (
                      <div style={{ marginTop: linkedChallenges.length > 0 ? 4 : 0 }}>
                        <strong>{tradeCount}</strong> trade{tradeCount > 1 ? 's' : ''} reference this account. They will remain but appear under an unknown account.
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => setDeleteId(null)} className="input" style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }}>Cancel</button>
                <button onClick={() => { onDelete(deleteId); setDeleteId(null); }} className="btn-primary" style={{ flex: 1, background: theme.neg }}>Remove</button>
              </div>
            </div>
          </Modal>
        );
      })()}
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
                ? 'linear-gradient(135deg, rgba(34,211,165,0.06) 0%, rgba(34,211,165,0.2) 100%)'
                : 'linear-gradient(135deg, rgba(244,85,122,0.06) 0%, rgba(244,85,122,0.2) 100%)'
              : !day ? (theme.dark ? '#0a0a0a' : '#f8fafc') : 'transparent';
            return (
              <div key={i} style={{ minHeight: 90, padding: 10, borderBottom: `1px solid ${theme.cardBorder}`, borderRight: `1px solid ${theme.cardBorder}`, background: dayBg, borderLeft: hasTrades ? `3px solid ${pnl >= 0 ? theme.pos : theme.neg}` : undefined }}>
                {day && <><div style={{ fontSize: 13, color: hasTrades ? (pnl >= 0 ? theme.pos : theme.neg) : theme.textMuted, fontWeight: hasTrades ? 600 : 400 }}>{day}</div>{hasTrades && <div style={{ marginTop: 6 }}><div style={{ fontSize: 13, fontWeight: 600, color: pnl >= 0 ? theme.pos : theme.neg }}>{pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}</div><div style={{ fontSize: 11, color: theme.textFaint }}>{dayTrades.length} trade{dayTrades.length > 1 ? 's' : ''}</div></div>}</>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ==================== MONTE CARLO SIMULATOR ====================
// Pure simulation engine. Resamples the user's historical per-trade P&L to
// project the probability of passing a prop-firm challenge vs. breaching its
// daily / total drawdown limits. Drawdown is measured from starting balance
// (static), matching the Challenges tracker in this app.

function shuffledCopy(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function percentile(sortedArr, p) {
  if (!sortedArr.length) return 0;
  const idx = Math.min(sortedArr.length - 1, Math.max(0, Math.floor(p * sortedArr.length)));
  return sortedArr[idx];
}

function runMonteCarlo(pool, p) {
  const accountSize = p.accountSize;
  const target$ = accountSize * p.targetPct / 100;
  const ddTotal$ = accountSize * p.ddTotalPct / 100;
  const ddDaily$ = accountSize * p.ddDailyPct / 100;
  const tpd = Math.max(1, Math.round(p.tradesPerDay));
  const H = p.horizonDays;
  const N = p.numSims;
  const n = pool.length;
  const minDays = p.minDays || 0;

  const dayEquity = Array.from({ length: H }, () => new Float64Array(N));
  const finals = new Float64Array(N);
  const maxDDs = new Float64Array(N);
  let pass = 0, failDaily = 0, failTotal = 0, timeout = 0;

  for (let s = 0; s < N; s++) {
    let cum = 0, minCum = 0, frozen = false, targetHit = false, outcome = null;
    const seq = p.method === 'shuffle' ? shuffledCopy(pool) : null;
    let si = 0;
    for (let d = 0; d < H; d++) {
      if (!frozen) {
        let dayPnl = 0;
        for (let k = 0; k < tpd; k++) {
          const r = seq ? seq[si++ % n] : pool[(Math.random() * n) | 0];
          cum += r; dayPnl += r;
          if (cum < minCum) minCum = cum;
          if (p.enforceTotal && cum <= -ddTotal$) { outcome = 'failTotal'; break; }
          if (!targetHit && cum >= target$) { targetHit = true; frozen = true; cum = target$; break; }
        }
        if (outcome) { for (let dd = d; dd < H; dd++) dayEquity[dd][s] = accountSize + cum; break; }
        if (!frozen && p.enforceDaily && dayPnl <= -ddDaily$) {
          outcome = 'failDaily';
          for (let dd = d; dd < H; dd++) dayEquity[dd][s] = accountSize + cum;
          break;
        }
      }
      dayEquity[d][s] = accountSize + cum;
      if (targetHit && (d + 1) >= minDays) {
        outcome = 'pass';
        for (let dd = d + 1; dd < H; dd++) dayEquity[dd][s] = accountSize + cum;
        break;
      }
    }
    if (!outcome) outcome = (targetHit && H >= minDays) ? 'pass' : 'timeout';
    if (outcome === 'pass') pass++;
    else if (outcome === 'failDaily') failDaily++;
    else if (outcome === 'failTotal') failTotal++;
    else timeout++;
    finals[s] = accountSize + cum;
    maxDDs[s] = -minCum;
  }

  const fan = [];
  for (let d = 0; d < H; d++) {
    const arr = Float64Array.from(dayEquity[d]).sort();
    const p5 = percentile(arr, 0.05), p25 = percentile(arr, 0.25), p50 = percentile(arr, 0.5), p75 = percentile(arr, 0.75), p95 = percentile(arr, 0.95);
    fan.push({ day: d + 1, lower: p5, band: p95 - p5, p25, p50, p75 });
  }

  const sortedFinals = Float64Array.from(finals).sort();
  let fmin = Infinity, fmax = -Infinity, fsum = 0;
  for (let i = 0; i < N; i++) { const v = finals[i]; if (v < fmin) fmin = v; if (v > fmax) fmax = v; fsum += v; }
  const bins = 24;
  const binW = (fmax - fmin) / bins || 1;
  const hist = Array.from({ length: bins }, (_, i) => ({ x: fmin + binW * (i + 0.5), count: 0 }));
  for (let i = 0; i < N; i++) {
    let bi = Math.floor((finals[i] - fmin) / binW);
    if (bi >= bins) bi = bins - 1;
    if (bi < 0) bi = 0;
    hist[bi].count++;
  }

  const sortedDD = Float64Array.from(maxDDs).sort();
  let ddSum = 0;
  for (let i = 0; i < N; i++) ddSum += maxDDs[i];

  return {
    probs: { pass: pass / N, failDaily: failDaily / N, failTotal: failTotal / N, timeout: timeout / N },
    fan, hist,
    finals: { p5: percentile(sortedFinals, 0.05), p50: percentile(sortedFinals, 0.5), p95: percentile(sortedFinals, 0.95), min: fmin, max: fmax, mean: fsum / N },
    dd: { mean: ddSum / N, p95: percentile(sortedDD, 0.95) },
    breachProb: (failDaily + failTotal) / N,
    accountSize, target$, ddTotal$,
  };
}

function SimulatorView({ trades, accounts, challenges }) {
  const theme = useTheme();
  const activeChallenges = challenges.filter(c => c.status === 'active');
  const [poolAccount, setPoolAccount] = useState('all');
  const [baseChallenge, setBaseChallenge] = useState(activeChallenges[0]?.id || '');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  const buildCfg = () => {
    const ch = activeChallenges.find(c => String(c.id) === String(baseChallenge));
    const phase = ch?.phases?.[ch.currentPhase] || ch?.phases?.[0] || {};
    const acctBal = accounts.find(a => a.name === ch?.account)?.balance;
    return {
      accountSize: String(ch?.accountSize || acctBal || 10000),
      targetPct: String(phase.profitTarget ?? 8),
      ddTotalPct: String(phase.maxTotalDrawdown ?? 10),
      ddDailyPct: String(phase.maxDailyDrawdown ?? 5),
      tradesPerDay: '3',
      horizonDays: String(phase.maxTradingDays || 30),
      minDays: String(phase.minTradingDays || 0),
      numSims: '5000',
      method: 'bootstrap',
      enforceDaily: true,
      enforceTotal: true,
    };
  };
  const [cfg, setCfg] = useState(buildCfg);

  // When the base challenge changes, repopulate rule fields from its current phase.
  useEffect(() => {
    const ch = activeChallenges.find(c => String(c.id) === String(baseChallenge));
    if (!ch) return;
    const phase = ch.phases?.[ch.currentPhase] || ch.phases?.[0] || {};
    const acctBal = accounts.find(a => a.name === ch.account)?.balance;
    setCfg(prev => ({
      ...prev,
      accountSize: String(ch.accountSize || acctBal || prev.accountSize),
      targetPct: String(phase.profitTarget ?? prev.targetPct),
      ddTotalPct: String(phase.maxTotalDrawdown ?? prev.ddTotalPct),
      ddDailyPct: String(phase.maxDailyDrawdown ?? prev.ddDailyPct),
      horizonDays: String(phase.maxTradingDays || prev.horizonDays),
      minDays: String(phase.minTradingDays || 0),
    }));
    if (ch.account) setPoolAccount(ch.account);
  }, [baseChallenge]); // eslint-disable-line react-hooks/exhaustive-deps

  const poolTrades = poolAccount === 'all' ? trades : trades.filter(t => t.account === poolAccount);
  const pool = poolTrades.map(t => parseFloat(t.pnl) || 0);

  const stats = (() => {
    const n = pool.length;
    const wins = pool.filter(v => v > 0);
    const losses = pool.filter(v => v < 0);
    const winRate = n ? (wins.length / n) * 100 : 0;
    const avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
    const avgLoss = losses.length ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length) : 0;
    const expectancy = n ? pool.reduce((a, b) => a + b, 0) / n : 0;
    const dates = new Set(poolTrades.map(t => t.date));
    const avgTPD = dates.size ? n / dates.size : 0;
    return { n, winRate, avgWin, avgLoss, expectancy, avgTPD };
  })();

  const fmt$ = (v) => (v < 0 ? '-' : '') + '$' + Math.abs(Math.round(v)).toLocaleString();
  const fmtK = (v) => (v < 0 ? '-' : '') + '$' + (Math.abs(v) >= 1000 ? (Math.abs(v) / 1000).toFixed(1) + 'k' : Math.abs(v).toFixed(0));
  const pctStr = (v) => (v * 100).toFixed(1) + '%';

  const run = () => {
    if (pool.length < 10) return;
    setRunning(true);
    setTimeout(() => {
      const p = {
        accountSize: parseFloat(cfg.accountSize) || 10000,
        targetPct: parseFloat(cfg.targetPct) || 0,
        ddTotalPct: parseFloat(cfg.ddTotalPct) || 0,
        ddDailyPct: parseFloat(cfg.ddDailyPct) || 0,
        tradesPerDay: parseFloat(cfg.tradesPerDay) || 1,
        horizonDays: Math.max(1, Math.min(365, parseInt(cfg.horizonDays) || 30)),
        minDays: parseInt(cfg.minDays) || 0,
        numSims: Math.max(100, Math.min(50000, parseInt(cfg.numSims) || 5000)),
        method: cfg.method,
        enforceDaily: cfg.enforceDaily,
        enforceTotal: cfg.enforceTotal,
      };
      setResult(runMonteCarlo(pool, p));
      setRunning(false);
    }, 30);
  };

  const lbl = { fontSize: 11, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6, display: 'block' };
  const inp = { background: theme.inputBg, border: `1px solid ${theme.inputBorder}`, borderRadius: 8, padding: '8px 12px', fontSize: 14, color: theme.text, width: '100%' };
  const card = { background: theme.card, border: `1px solid ${theme.cardBorder}`, borderRadius: 16, padding: 20 };
  const muted = { fontSize: 11, color: theme.textFaint, marginTop: 4 };

  const numField = (label, k, step = 1, suffix, hint) => (
    <div>
      <label style={lbl}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input type="number" step={step} value={cfg[k]} onChange={e => setCfg({ ...cfg, [k]: e.target.value })} style={{ ...inp, paddingRight: suffix ? 30 : 12 }} />
        {suffix && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: theme.textFaint, pointerEvents: 'none' }}>{suffix}</span>}
      </div>
      {hint && <div style={muted}>{hint}</div>}
    </div>
  );

  const OUTCOMES = [
    { key: 'pass', label: 'Pass target', color: theme.pos },
    { key: 'failTotal', label: 'Hit max loss', color: theme.neg },
    { key: 'failDaily', label: 'Hit daily limit', color: '#f59e0b' },
    { key: 'timeout', label: 'Incomplete', color: theme.textFaint },
  ];

  const accSize = parseFloat(cfg.accountSize) || 10000;
  const targetEq = accSize + accSize * (parseFloat(cfg.targetPct) || 0) / 100;
  const floorEq = accSize - accSize * (parseFloat(cfg.ddTotalPct) || 0) / 100;

  const tipBox = { background: theme.card, border: `1px solid ${theme.cardBorder}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, color: theme.text };
  const FanTip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    const row = payload[0].payload;
    return (
      <div style={tipBox}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Day {label}</div>
        <div style={{ color: theme.pos }}>P95: {fmt$(row.lower + row.band)}</div>
        <div style={{ color: '#8b5cf6' }}>P75: {fmt$(row.p75)}</div>
        <div style={{ color: '#8b5cf6' }}>Median: {fmt$(row.p50)}</div>
        <div style={{ color: '#8b5cf6' }}>P25: {fmt$(row.p25)}</div>
        <div style={{ color: theme.neg }}>P5: {fmt$(row.lower)}</div>
      </div>
    );
  };

  const insufficient = pool.length < 10;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Assumptions note */}
      <div style={{ ...card, padding: 14, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <AlertCircle size={16} style={{ color: '#8b5cf6', flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 12.5, color: theme.textMuted, lineHeight: 1.5 }}>
          This resamples your historical trade P&amp;L in random order to estimate how often a challenge would pass vs. breach its limits.
          It assumes trades are independent and your edge stays constant — treat the output as a <strong style={{ color: theme.text }}>risk-of-ruin estimate, not a prediction</strong>.
          Drawdown is measured from starting balance (static), matching the Challenges tracker.
        </div>
      </div>

      {/* Config */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Simulation Inputs</div>
          <button onClick={run} disabled={running || insufficient} className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, opacity: running || insufficient ? 0.6 : 1, cursor: running || insufficient ? 'not-allowed' : 'pointer' }}>
            {running ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={16} />}
            {running ? 'Running…' : 'Run simulation'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
          <div>
            <label style={lbl}>Base on challenge</label>
            <select value={baseChallenge} onChange={e => setBaseChallenge(e.target.value)} style={inp}>
              <option value="">Manual / none</option>
              {activeChallenges.map(c => {
                const ph = c.phases?.[c.currentPhase] || c.phases?.[0] || {};
                return <option key={c.id} value={c.id}>{c.account || c.name || 'Challenge'} — {ph.name || 'Phase'}</option>;
              })}
            </select>
            <div style={muted}>Pre-fills rules below</div>
          </div>
          <div>
            <label style={lbl}>Trade pool</label>
            <select value={poolAccount} onChange={e => setPoolAccount(e.target.value)} style={inp}>
              <option value="all">All accounts</option>
              {accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
            <div style={muted}>{stats.n} trades · {stats.winRate.toFixed(0)}% win</div>
          </div>
          {numField('Account size', 'accountSize', 100, '$')}
          {numField('Profit target', 'targetPct', 0.5, '%')}
          {numField('Max total drawdown', 'ddTotalPct', 0.5, '%')}
          {numField('Max daily drawdown', 'ddDailyPct', 0.5, '%')}
          {numField('Trades / day', 'tradesPerDay', 1, '', `Historical avg: ${stats.avgTPD.toFixed(1)}`)}
          {numField('Horizon (days)', 'horizonDays', 1, 'd')}
          {numField('Min trading days', 'minDays', 1, 'd')}
          {numField('Simulations', 'numSims', 1000, '', '100–50,000')}
          <div>
            <label style={lbl}>Resampling</label>
            <select value={cfg.method} onChange={e => setCfg({ ...cfg, method: e.target.value })} style={inp}>
              <option value="bootstrap">Bootstrap (with replacement)</option>
              <option value="shuffle">Shuffle (use each trade once)</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Enforce limits</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['enforceTotal', 'Total DD'], ['enforceDaily', 'Daily DD']].map(([k, t]) => (
                <button key={k} onClick={() => setCfg({ ...cfg, [k]: !cfg[k] })} style={{ flex: 1, padding: '8px 6px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: `1px solid ${cfg[k] ? '#8b5cf6' : theme.inputBorder}`, background: cfg[k] ? 'rgba(139,92,246,0.12)' : theme.inputBg, color: cfg[k] ? '#8b5cf6' : theme.textMuted }}>{t}</button>
              ))}
            </div>
          </div>
        </div>

        {insufficient && (
          <div style={{ marginTop: 14, fontSize: 13, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={15} /> Need at least 10 trades in the selected pool to simulate. Currently {stats.n}.
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Outcome probabilities */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
            {OUTCOMES.map(o => (
              <div key={o.key} style={card}>
                <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 6 }}>{o.label}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: o.color }}>{pctStr(result.probs[o.key])}</div>
                <div style={{ marginTop: 8, height: 6, borderRadius: 3, background: theme.hoverBg, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${result.probs[o.key] * 100}%`, background: o.color, borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </div>

          {/* Key stats */}
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 14 }}>Projected outcomes</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 16 }}>
              {[
                { l: 'Median end equity', v: fmt$(result.finals.p50), c: theme.text },
                { l: 'Downside (P5)', v: fmt$(result.finals.p5), c: theme.neg },
                { l: 'Upside (P95)', v: fmt$(result.finals.p95), c: theme.pos },
                { l: 'Avg max drawdown', v: fmt$(result.dd.mean), c: '#f59e0b' },
                { l: 'Worst-case DD (P95)', v: fmt$(result.dd.p95), c: theme.neg },
                { l: 'Any breach', v: pctStr(result.breachProb), c: theme.neg },
              ].map((s, i) => (
                <div key={i}>
                  <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 4 }}>{s.l}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: s.c }}>{s.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Equity fan chart */}
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Equity Paths (P5–P95 band, median line)</div>
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={result.fan} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
                  <XAxis dataKey="day" stroke={theme.textFaint} tick={{ fontSize: 11 }} tickLine={false} />
                  <YAxis stroke={theme.textFaint} tick={{ fontSize: 11 }} tickLine={false} width={52} domain={['auto', 'auto']} tickFormatter={fmtK} />
                  <Tooltip content={<FanTip />} />
                  <Area dataKey="lower" stackId="band" stroke="none" fill="transparent" isAnimationActive={false} />
                  <Area dataKey="band" stackId="band" stroke="none" fill="rgba(139,92,246,0.18)" isAnimationActive={false} />
                  <Line dataKey="p50" stroke="#8b5cf6" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <ReferenceLine y={targetEq} stroke={theme.pos} strokeDasharray="5 4" label={{ value: 'Target', position: 'insideTopRight', fill: theme.pos, fontSize: 11 }} />
                  <ReferenceLine y={floorEq} stroke={theme.neg} strokeDasharray="5 4" label={{ value: 'Max loss', position: 'insideBottomRight', fill: theme.neg, fontSize: 11 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Final equity distribution */}
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Distribution of Ending Equity</div>
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={result.hist} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
                  <XAxis dataKey="x" stroke={theme.textFaint} tick={{ fontSize: 10 }} tickLine={false} tickFormatter={fmtK} />
                  <YAxis stroke={theme.textFaint} tick={{ fontSize: 11 }} tickLine={false} width={40} />
                  <Tooltip cursor={{ fill: theme.hoverBg }} contentStyle={tipBox} formatter={(v) => [v, 'Sims']} labelFormatter={(v) => fmt$(v)} />
                  <ReferenceLine x={result.accountSize} stroke={theme.textFaint} strokeDasharray="4 4" />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {result.hist.map((d, i) => <Cell key={i} fill={d.x >= result.accountSize ? theme.pos : theme.neg} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {!result && !insufficient && (
        <div style={{ ...card, textAlign: 'center', padding: 40, color: theme.textMuted }}>
          <Dices size={32} style={{ color: theme.textFaint, marginBottom: 10 }} />
          <div style={{ fontSize: 14 }}>Set your inputs and run the simulation to see pass/breach probabilities and projected equity paths.</div>
        </div>
      )}
    </div>
  );
}

function Modal({ children, onClose, width = 420 }) {
  const theme = useTheme();
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: theme.dark ? 'rgba(5,4,10,0.72)' : 'rgba(20,17,31,0.38)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="card-lg scrollbar"
        style={{ width: '100%', maxWidth: width, maxHeight: '90vh', overflow: 'auto', boxShadow: theme.dark ? '0 24px 70px rgba(0,0,0,0.7), 0 0 0 1px rgba(139,92,246,0.14)' : '0 20px 60px rgba(60,45,110,0.22)' }}
      >{children}</div>
    </div>
  );
}

function NewTradeModal({ onClose, onSave, accounts }) {
  const theme = useTheme();
  const [step, setStep] = useState(1);
  const [trade, setTrade] = useState({
    date: new Date().toISOString().split('T')[0], time: new Date().toTimeString().slice(0, 5),
    symbol: '', side: 'Long', entry: '', exit: '', lots: '',
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
    onSave({ ...trade, entry: parseFloat(trade.entry), exit: parseFloat(trade.exit), lots: parseFloat(trade.lots), commission: parseFloat(trade.commission) || 0, swap: parseFloat(trade.swap) || 0 });
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
                <button key={s} onClick={() => setTrade({...trade, side: s})} style={{ flex: 1, padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 500, border: 'none', cursor: 'pointer', background: trade.side === s ? (s === 'Long' ? theme.pos : theme.neg) : theme.hoverBg, color: trade.side === s ? 'white' : theme.textMuted }}>{s}</button>
              ))}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div><label className="label">Entry</label><input type="number" step="any" value={trade.entry} onChange={(e) => setTrade({...trade, entry: e.target.value})} className="input" /></div>
              <div><label className="label">Exit</label><input type="number" step="any" value={trade.exit} onChange={(e) => setTrade({...trade, exit: e.target.value})} className="input" /></div>
              <div><label className="label">Lots</label><input type="number" step="0.01" value={trade.lots} onChange={(e) => setTrade({...trade, lots: e.target.value})} className="input" /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            </div>
            <div style={{ padding: 16, borderRadius: 10, background: theme.hoverBg }}>
              <div className="flex items-center gap-2" style={{ marginBottom: 12 }}><Settings size={14} style={{ color: theme.textMuted }} /><span style={{ fontSize: 12, fontWeight: 500, color: theme.textMuted }}>Fees & Adjustments</span></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label className="label">Commission ($)</label><input type="number" step="0.01" value={trade.commission} onChange={(e) => setTrade({...trade, commission: e.target.value})} placeholder="0.00" className="input" /></div>
                <div><label className="label">Swap ($)</label><input type="number" step="0.01" value={trade.swap} onChange={(e) => setTrade({...trade, swap: e.target.value})} placeholder="0.00" className="input" /></div>
              </div>
            </div>
            <div style={{ padding: 16, borderRadius: 10, background: trade.pnl >= 0 ? 'rgba(34,211,165,0.1)' : 'rgba(244,85,122,0.1)' }}>
              <div className="flex justify-between items-center">
                <span style={{ fontSize: 13, color: theme.textMuted }}>Calculated P&L</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: trade.pnl >= 0 ? theme.pos : theme.neg }}>{trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}</span>
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
                  <button key={key} onClick={() => setTrade({...trade, marketStructure: key})} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 10, border: `1px solid ${trade.marketStructure === key ? '#8b5cf6' : theme.cardBorder}`, background: trade.marketStructure === key ? 'rgba(139,92,246,0.1)' : 'transparent', cursor: 'pointer' }}>
                    <div className="flex items-center gap-3">
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: val.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: 10, height: 10, borderRadius: 5, background: val.color }}></div></div>
                      <div style={{ textAlign: 'left' }}><div style={{ fontSize: 14, fontWeight: 500, color: theme.text }}>{val.label}</div><div style={{ fontSize: 12, color: theme.textFaint }}>{val.description}</div></div>
                    </div>
                    {trade.marketStructure === key && <CheckCircle size={20} style={{ color: '#8b5cf6' }} />}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label" style={{ marginBottom: 12 }}>Candle Type</label>
              <div className="flex gap-3">{Object.entries(CANDLE_TYPES).map(([key, val]) => (
                <button key={key} onClick={() => setTrade({...trade, candleType: key})} style={{ flex: 1, padding: 14, borderRadius: 10, border: `1px solid ${trade.candleType === key ? '#8b5cf6' : theme.cardBorder}`, background: trade.candleType === key ? 'rgba(139,92,246,0.1)' : 'transparent', textAlign: 'left', cursor: 'pointer' }}>
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
  // FIX #4: Detect imported trades — preserve broker P&L by default
  const wasImported = typeof initialTrade.notes === 'string' &&
    /Imported from (MT5|cTrader|MT4)/i.test(initialTrade.notes);
  const [trade, setTrade] = useState({
    ...initialTrade, entry: initialTrade.entry?.toString() || '', exit: initialTrade.exit?.toString() || '',
    lots: initialTrade.lots?.toString() || '', commission: initialTrade.commission?.toString() || '',
    swap: initialTrade.swap?.toString() || '', liquidityTaken: initialTrade.liquidityTaken || [],
    liquidityTarget: initialTrade.liquidityTarget || [], chartLink: initialTrade.chartLink || '', chartImage: initialTrade.chartImage || ''
  });
  // For imported trades, default to "preserve broker P&L". User can opt-in to recompute.
  const [recomputePnl, setRecomputePnl] = useState(!wasImported);

  useEffect(() => {
    if (!recomputePnl) return; // FIX #4: Preserve broker-supplied pnl
    if (trade.entry && trade.exit && trade.lots && trade.symbol) {
      const entry = parseFloat(trade.entry), exit = parseFloat(trade.exit), lots = parseFloat(trade.lots);
      const commission = parseFloat(trade.commission) || 0, swap = parseFloat(trade.swap) || 0;
      if (!isNaN(entry) && !isNaN(exit) && !isNaN(lots)) {
        const gross = calculateTradePnL(trade.symbol, trade.side, entry, exit, lots);
        setTrade(prev => ({ ...prev, pnl: gross - commission + swap }));
      }
    }
  }, [trade.entry, trade.exit, trade.lots, trade.symbol, trade.side, trade.commission, trade.swap, recomputePnl]);

  const handleSave = () => {
    onSave({
      ...trade,
      entry: parseFloat(trade.entry),
      exit: parseFloat(trade.exit),
      lots: parseFloat(trade.lots),
      commission: parseFloat(trade.commission) || 0,
      swap: parseFloat(trade.swap) || 0,
      pnl: parseFloat(trade.pnl) || 0,   // FIX #4: always coerce, preserve broker value when not recomputed
    });
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
            <button key={s} onClick={() => setTrade({...trade, side: s})} style={{ flex: 1, padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 500, border: 'none', cursor: 'pointer', background: trade.side === s ? (s === 'Long' ? theme.pos : theme.neg) : theme.hoverBg, color: trade.side === s ? 'white' : theme.textMuted }}>{s}</button>
          ))}</div></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div><label className="label">Entry</label><input type="number" step="any" value={trade.entry} onChange={(e) => setTrade({...trade, entry: e.target.value})} className="input" /></div>
            <div><label className="label">Exit</label><input type="number" step="any" value={trade.exit} onChange={(e) => setTrade({...trade, exit: e.target.value})} className="input" /></div>
            <div><label className="label">Lots</label><input type="number" step="0.01" value={trade.lots} onChange={(e) => setTrade({...trade, lots: e.target.value})} className="input" /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label className="label">Commission ($)</label><input type="number" step="0.01" value={trade.commission} onChange={(e) => setTrade({...trade, commission: e.target.value})} className="input" /></div>
            <div><label className="label">Swap ($)</label><input type="number" step="0.01" value={trade.swap} onChange={(e) => setTrade({...trade, swap: e.target.value})} className="input" /></div>
          </div>
          <div style={{ padding: 16, borderRadius: 10, background: (parseFloat(trade.pnl) || 0) >= 0 ? 'rgba(34,211,165,0.1)' : 'rgba(244,85,122,0.1)' }}>
            <div className="flex justify-between items-center" style={{ marginBottom: wasImported ? 10 : 0 }}>
              <span style={{ fontSize: 13, color: theme.textMuted }}>
                {recomputePnl ? 'Calculated P&L' : 'Broker P&L (preserved)'}
              </span>
              {recomputePnl ? (
                <span style={{ fontSize: 20, fontWeight: 700, color: (parseFloat(trade.pnl) || 0) >= 0 ? theme.pos : theme.neg }}>
                  {(parseFloat(trade.pnl) || 0) >= 0 ? '+' : ''}${(parseFloat(trade.pnl) || 0).toFixed(2)}
                </span>
              ) : (
                <input
                  type="number"
                  step="0.01"
                  value={trade.pnl}
                  onChange={(e) => setTrade({ ...trade, pnl: e.target.value })}
                  className="input"
                  style={{ width: 150, textAlign: 'right', fontSize: 16, fontWeight: 600, color: (parseFloat(trade.pnl) || 0) >= 0 ? theme.pos : theme.neg }}
                />
              )}
            </div>
            {wasImported && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: theme.textMuted, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={recomputePnl}
                  onChange={(e) => setRecomputePnl(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                Recompute from entry/exit/lots (overrides broker value — uses live FX rates, may differ from broker)
              </label>
            )}
          </div>

          <div style={{ padding: 16, borderRadius: 10, background: theme.hoverBg }}>
            <div className="flex items-center gap-2" style={{ marginBottom: 12 }}><Link size={14} style={{ color: theme.textMuted }} /><span style={{ fontSize: 12, fontWeight: 500, color: theme.textMuted }}>Chart Reference</span></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div><label className="label">TradingView Link</label><input value={trade.chartLink} onChange={(e) => setTrade({ ...trade, chartLink: e.target.value })} placeholder="https://www.tradingview.com/chart/..." className="input" /></div>
              <div><label className="label">Chart Image URL</label><input value={trade.chartImage} onChange={(e) => setTrade({ ...trade, chartImage: e.target.value })} placeholder="https://i.imgur.com/..." className="input" /></div>
            </div>
          </div>

          <div><label className="label">Notes</label><textarea value={trade.notes || ''} onChange={(e) => setTrade({ ...trade, notes: e.target.value })} rows={3} className="input" placeholder="Trade thesis, observations..." style={{ resize: 'none' }} /></div>
        </div>
      </div>
      <div style={{ padding: 20, borderTop: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 14, color: theme.textMuted, cursor: 'pointer' }}>Cancel</button>
        <button onClick={handleSave} className="btn-primary">Save Changes</button>
      </div>
    </Modal>
  );
}

// ==================== CRYPTO VIEW (OKX) ====================
function CryptoView({ subTab, setSubTab, trades, liveFills = [], pnl = [], snapshots, challenges, live, algos = { live: [], history: [], pending: [] }, funding = { totalFunding: 0, byInst: {}, recent: [] }, syncing, okxError, lastSync, onSync, onAddTrade, onDeleteTrade, onUpdateChallenge, onDeleteChallenge, subAccounts = [], selectedAccount = 'main', setSelectedAccount }) {
  const theme = useTheme();
  const tabs = [
    { id: 'portfolio', label: 'Portfolio', icon: Wallet },
    { id: 'challenge', label: 'Challenge', icon: Trophy },
    { id: 'trades', label: 'Trades', icon: Clock },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  ];
  const fmt = (n, d = 2) => (n < 0 ? '-' : '') + '$' + Math.abs(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const [detailId, setDetailId] = useState(null);
  const detailChallenge = detailId != null ? challenges.find(c => String(c.id) === String(detailId)) : null;
  const balance = live?.balance;

  // Account scope. 'all' = main + every sub-account combined, 'main' = the master
  // account, anything else = that sub-account's name.
  const mainEq = balance?.totalEq || 0;
  const subsTotal = subAccounts.reduce((s, a) => s + (a.totalEq || 0), 0);
  const activeSub = subAccounts.find(a => a.subAcct === selectedAccount) || null;
  const isSub = Boolean(activeSub);
  const subHasKeys = Boolean(activeSub?.hasKeys);
  const scopeLabel = selectedAccount === 'all' ? 'All Accounts'
    : selectedAccount === 'main' ? 'Main Account'
    : (activeSub?.label || selectedAccount);

  // Without a read-only key inside the sub-account, OKX only exposes its
  // balances — so trades/positions can't load. Once a key is configured
  // (hasKeys), the live data flows and the notice disappears.
  const subOnlyNotice = isSub && !subHasKeys && subTab !== 'portfolio';

  // Sub-accounts render live (non-persisted) fills and have no server equity
  // snapshots, so scope those views to the account's own live data.
  const viewTrades = isSub ? liveFills : trades;
  const viewSnaps = isSub ? [] : snapshots;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Account scope selector — mirrors the Dashboard's "Dashboard for:" control */}
      <div className="flex items-center gap-3" style={{ flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: theme.textMuted }}>Crypto account:</span>
        <select
          value={selectedAccount}
          onChange={(e) => setSelectedAccount?.(e.target.value)}
          className="input input-sm"
          style={{ width: 240, fontWeight: 500, cursor: 'pointer' }}
        >
          {subAccounts.length > 0 && <option value="all">All Accounts — {fmt(mainEq + subsTotal)}</option>}
          <option value="main">Main Account — {fmt(mainEq)}</option>
          {subAccounts.map(a => (
            <option key={a.subAcct} value={a.subAcct}>
              {(a.label || a.subAcct)}{a.error ? ' — unavailable' : ` — ${fmt(a.totalEq || 0)}`}
            </option>
          ))}
        </select>
        {subAccounts.length === 0 && (
          <span style={{ fontSize: 11.5, color: theme.textFaint }}>No sub-accounts found on this API key.</span>
        )}
        <div style={{ marginLeft: 'auto', fontSize: 12, color: theme.textFaint }}>
          {lastSync ? `Last synced ${new Date(lastSync).toLocaleTimeString()}` : 'Not synced yet'}
        </div>
      </div>

      {/* Sub-tab nav */}
      <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)} className="flex items-center gap-2" style={{ padding: '8px 16px', borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: `1px solid ${subTab === t.id ? 'rgba(139,92,246,0.55)' : theme.cardBorder}`, background: subTab === t.id ? theme.primaryGrad : 'transparent', color: subTab === t.id ? 'white' : theme.textMuted, boxShadow: subTab === t.id ? '0 2px 10px rgba(124,58,237,0.32)' : 'none', transition: 'all 0.15s' }}>
            <t.icon size={15} />{t.label}
          </button>
        ))}
      </div>

      {okxError && (
        <div className="card" style={{ padding: 14, borderColor: theme.neg, background: 'rgba(244,85,122,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={18} style={{ color: theme.neg }} />
          <div style={{ fontSize: 13, color: theme.text }}><strong>OKX sync error:</strong> {okxError}</div>
        </div>
      )}

      {subOnlyNotice && (
        <div className="card" style={{ padding: 14, display: 'flex', alignItems: 'flex-start', gap: 10, borderColor: 'rgba(245,158,11,0.32)', background: 'rgba(245,158,11,0.07)' }}>
          <AlertCircle size={17} style={{ color: theme.warn, flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12.5, color: theme.textMuted, lineHeight: 1.55 }}>
            Showing <strong style={{ color: theme.text }}>main account</strong> data. OKX only exposes balances for
            sub-accounts to a master key — trades, positions and challenges for <strong style={{ color: theme.text }}>{scopeLabel}</strong> need
            a read-only key created inside that sub-account. Switch to <strong style={{ color: theme.text }}>Portfolio</strong> to see its balances.
          </div>
        </div>
      )}

      {subTab === 'portfolio' && (
        <CryptoPortfolio
          balance={balance} positions={live?.positions || []} snapshots={viewSnaps} algos={algos} funding={funding}
          syncing={syncing} onSync={onSync} fmt={fmt} theme={theme}
          subAccounts={subAccounts} selectedAccount={selectedAccount} setSelectedAccount={setSelectedAccount}
        />
      )}
      {subTab === 'challenge' && (detailChallenge ? (
        <CryptoChallengeDetail challenge={detailChallenge} trades={trades} snapshots={snapshots} liveEq={balance?.totalEq} onBack={() => setDetailId(null)} onUpdate={onUpdateChallenge} onDelete={(id) => { onDeleteChallenge(id); setDetailId(null); }} fmt={fmt} theme={theme} />
      ) : (
        <CryptoChallengeView challenges={challenges} snapshots={snapshots} liveEq={balance?.totalEq} onOpen={setDetailId} onUpdate={onUpdateChallenge} onDelete={onDeleteChallenge} fmt={fmt} theme={theme} />
      ))}
      {subTab === 'trades' && <CryptoTradesView trades={viewTrades} algos={algos} onAddTrade={onAddTrade} onDeleteTrade={onDeleteTrade} fmt={fmt} theme={theme} readOnly={isSub} />}
      {subTab === 'analytics' && <CryptoAnalyticsView trades={viewTrades} pnl={pnl} positions={live?.positions || []} algos={algos} snapshots={viewSnaps} fmt={fmt} theme={theme} />}
    </div>
  );
}

// Restored: also deleted in a0b1913 while still referenced — "Add Account" crashed.
function NewAccountModal({ onClose, onSave }) {
  const theme = useTheme();
  const [acc, setAcc] = useState({ name: '', platform: 'MT5', broker: '', server: '', balance: '', equity: '' });
  return (
    <Modal onClose={onClose}>
      <div style={{ padding: 20, borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>Add Account</h3>
        <button onClick={onClose} className="icon-btn" style={{ padding: 8 }} aria-label="Close"><X size={18} /></button>
      </div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div><label className="label">Platform</label><div className="flex gap-2">{['MT5', 'cTrader'].map(p => (
          <button key={p} onClick={() => setAcc({ ...acc, platform: p })} style={{ flex: 1, padding: 12, borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: `1px solid ${acc.platform === p ? 'rgba(139,92,246,0.55)' : theme.cardBorder}`, background: acc.platform === p ? theme.primaryGrad : 'transparent', color: acc.platform === p ? 'white' : theme.textMuted }}>{p}</button>
        ))}</div></div>
        <div><label className="label">Account Name</label><input value={acc.name} onChange={(e) => setAcc({ ...acc, name: e.target.value })} placeholder="Main Account" className="input" /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label className="label">Broker</label><input value={acc.broker} onChange={(e) => setAcc({ ...acc, broker: e.target.value })} placeholder="ICMarkets" className="input" /></div>
          <div><label className="label">Server</label><input value={acc.server} onChange={(e) => setAcc({ ...acc, server: e.target.value })} placeholder="Live-01" className="input" /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label className="label">Balance</label><input type="number" value={acc.balance} onChange={(e) => setAcc({ ...acc, balance: e.target.value })} placeholder="10000" className="input" /></div>
          <div><label className="label">Equity</label><input type="number" value={acc.equity} onChange={(e) => setAcc({ ...acc, equity: e.target.value })} placeholder="10000" className="input" /></div>
        </div>
      </div>
      <div style={{ padding: 20, borderTop: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <button onClick={onClose} className="btn-ghost">Cancel</button>
        <button onClick={() => onSave({ ...acc, balance: parseFloat(acc.balance) || 0, equity: parseFloat(acc.equity) || 0, connected: true })} className="btn-primary" disabled={!acc.name} style={{ opacity: acc.name ? 1 : 0.5 }}>Add Account</button>
      </div>
    </Modal>
  );
}

// Restored: also deleted in a0b1913 while still referenced — editing an account crashed.
function EditAccountModal({ account, onClose, onSave }) {
  const theme = useTheme();
  const [data, setData] = useState({ ...account, balance: String(account.balance ?? ''), equity: String(account.equity ?? '') });
  return (
    <Modal onClose={onClose}>
      <div style={{ padding: 20, borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>Edit Account</h3>
        <button onClick={onClose} className="icon-btn" style={{ padding: 8 }} aria-label="Close"><X size={18} /></button>
      </div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div><label className="label">Name</label><input value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })} className="input" /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label className="label">Balance</label><input type="number" value={data.balance} onChange={(e) => setData({ ...data, balance: e.target.value })} className="input" /></div>
          <div><label className="label">Equity</label><input type="number" value={data.equity} onChange={(e) => setData({ ...data, equity: e.target.value })} className="input" /></div>
        </div>
      </div>
      <div style={{ padding: 20, borderTop: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <button onClick={onClose} className="btn-ghost">Cancel</button>
        <button onClick={() => onSave({ ...data, balance: parseFloat(data.balance) || 0, equity: parseFloat(data.equity) || 0 })} className="btn-primary">Save</button>
      </div>
    </Modal>
  );
}

// Restored: this component was referenced by TradingJournal but deleted in
// commit a0b1913, so opening any trade threw a ReferenceError.
function TradeDetailModal({ trade, onClose, onDelete, onEdit, ctx }) {
  const theme = useTheme();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const chartImg = getTradingViewImageUrl(trade.chartLink) || trade.chartImage;
  const quality = computeTradeScore(trade, ctx);
  const qColor = !quality ? theme.textFaint
    : quality.score >= 80 ? theme.pos : quality.score >= 65 ? theme.accent
    : quality.score >= 50 ? theme.warn : theme.neg;

  return (
    <Modal width={560} onClose={onClose}>
      <div style={{ padding: 20, borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="flex items-center gap-3">
          <div style={{ width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: trade.pnl >= 0 ? 'rgba(34,211,165,0.12)' : 'rgba(244,85,122,0.12)' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: trade.pnl >= 0 ? theme.pos : theme.neg }}>{trade.symbol?.slice(0, 2)}</span>
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>{trade.symbol}</div>
            <div style={{ fontSize: 12, color: theme.textFaint }}>{trade.date} · {trade.time}</div>
          </div>
        </div>
        <button onClick={onClose} className="icon-btn" style={{ padding: 8 }} aria-label="Close"><X size={18} /></button>
      </div>

      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="flex justify-between items-center">
          <span className="badge" style={{ background: trade.side === 'Long' ? 'rgba(34,211,165,0.12)' : 'rgba(244,85,122,0.12)', color: trade.side === 'Long' ? theme.pos : theme.neg, padding: '7px 14px', fontSize: 13 }}>{trade.side}</span>
          <span style={{ fontSize: 25, fontWeight: 700, color: trade.pnl >= 0 ? theme.pos : theme.neg, letterSpacing: '-0.5px' }}>{trade.pnl >= 0 ? '+' : ''}${trade.pnl?.toFixed(2)}</span>
        </div>

        {/* Trade quality — scores process, not P&L */}
        {quality && (
          <div className="card" style={{ padding: 16 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <div>
                <div className="stat-label">Trade Quality</div>
                <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 3 }}>Scores execution, not profit</div>
              </div>
              <div className="flex items-baseline gap-2">
                <span style={{ fontSize: 28, fontWeight: 800, color: qColor, letterSpacing: '-0.6px' }}>{quality.score}</span>
                <span className="badge" style={{ background: `${qColor}1f`, color: qColor }}>{quality.grade}</span>
              </div>
            </div>
            {quality.parts.map(p => (
              <div key={p.label} style={{ marginBottom: 8 }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 3 }}>
                  <span style={{ fontSize: 11.5, color: theme.textMuted, fontWeight: 500 }}>{p.label}</span>
                  <span style={{ fontSize: 11, color: theme.textFaint, fontFamily: "'JetBrains Mono', monospace" }}>{p.pts}/{p.max}{p.note ? ` · ${p.note}` : ''}</span>
                </div>
                <div style={{ height: 4, borderRadius: 999, background: theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(20,17,31,0.06)', overflow: 'hidden' }}>
                  <div className="progress-bar-animate" style={{ height: '100%', width: `${(p.pts / p.max) * 100}%`, borderRadius: 999, background: theme.primaryGrad }} />
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {[{ l: 'Entry', v: trade.entry }, { l: 'Exit', v: trade.exit }, { l: 'Lots', v: trade.lots },
            { l: 'Net', v: quality ? `${quality.net >= 0 ? '+' : ''}$${quality.net.toFixed(2)}` : '—' }].map(x => (
            <div key={x.l} style={{ padding: 13, borderRadius: 12, background: theme.hoverBg, textAlign: 'center' }}>
              <div className="stat-label">{x.l}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginTop: 4 }}>{x.v ?? '—'}</div>
            </div>
          ))}
        </div>

        {(trade.commission || trade.swap) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ padding: 13, borderRadius: 12, background: theme.hoverBg }}><div className="stat-label">Commission</div><div style={{ fontSize: 14, fontWeight: 600, color: theme.neg, marginTop: 4 }}>-${Math.abs(trade.commission || 0).toFixed(2)}</div></div>
            <div style={{ padding: 13, borderRadius: 12, background: theme.hoverBg }}><div className="stat-label">Swap</div><div style={{ fontSize: 14, fontWeight: 600, color: (trade.swap || 0) >= 0 ? theme.pos : theme.neg, marginTop: 4 }}>{(trade.swap || 0) >= 0 ? '+' : ''}${(trade.swap || 0).toFixed(2)}</div></div>
          </div>
        )}

        {trade.marketStructure && (
          <div style={{ padding: 13, borderRadius: 12, background: theme.hoverBg, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: theme.textMuted }}>Structure</span>
            <span className="badge" style={{ background: MARKET_STRUCTURES[trade.marketStructure]?.color, color: 'white' }}>{MARKET_STRUCTURES[trade.marketStructure]?.label}</span>
          </div>
        )}

        {(chartImg || trade.chartLink) && (
          <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${theme.cardBorder}` }}>
            {chartImg && <img src={chartImg} alt="Chart" style={{ width: '100%', height: 200, objectFit: 'cover', display: 'block' }} onError={(e) => { e.target.style.display = 'none'; }} />}
            {trade.chartLink && <a href={sanitizeImageUrl(trade.chartLink) || '#'} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 13, fontSize: 13, color: theme.primaryHi, textDecoration: 'none', background: theme.hoverBg }}><ExternalLink size={14} />Open in TradingView</a>}
          </div>
        )}

        {trade.notes && (
          <div>
            <div className="stat-label" style={{ marginBottom: 8 }}>Notes</div>
            <p style={{ fontSize: 13.5, color: theme.text, padding: 13, borderRadius: 12, background: theme.hoverBg, lineHeight: 1.55 }}>{trade.notes}</p>
          </div>
        )}
      </div>

      <div style={{ padding: 20, borderTop: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {!confirmDelete ? (
          <>
            <button onClick={() => setConfirmDelete(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', fontSize: 14, color: theme.neg, cursor: 'pointer' }}><Trash2 size={16} />Delete</button>
            <div className="flex gap-2">
              <button onClick={() => onEdit(trade)} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Edit3 size={16} />Edit</button>
              <button onClick={onClose} className="btn-primary">Close</button>
            </div>
          </>
        ) : (
          <>
            <span style={{ fontSize: 14, color: theme.textMuted }}>Delete this trade?</span>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(false)} className="btn-ghost">Cancel</button>
              <button onClick={() => onDelete(trade.id)} className="btn-primary" style={{ background: theme.neg, boxShadow: 'none' }}>Delete</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function StatCard({ label, value, color, sub, theme }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color: color || theme.text, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function CryptoPortfolio({ balance, positions, snapshots, algos = { live: [], history: [], pending: [] }, funding = { totalFunding: 0, byInst: {}, recent: [] }, syncing, onSync, fmt, theme, subAccounts = [], selectedAccount = 'main', setSelectedAccount }) {
  // Equity-curve time window. Hook must run before any early return below.
  const [curveRange, setCurveRange] = useState('ALL'); // 1D | 7D | 1M | 1Y | ALL
  const [fundRange, setFundRange] = useState('7D');    // OKX bills cover ~7d

  // Format a raw OKX price to a readable precision. OKX returns full float
  // precision (e.g. 129.87075728742226); decimals are scaled to the magnitude
  // so large-cap prices stay tight and micro-cap prices keep enough digits.
  const fmtPx = (v) => {
    const n = Number(v);
    if (v == null || v === '' || !isFinite(n) || n === 0) return '—';
    const abs = Math.abs(n);
    const dp = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 5 : 8;
    return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: dp });
  };

  // Only a real, resolved sub-account counts — 'all' and 'main' must fall through
  // to the aggregate / main views below.
  const sub = subAccounts.find(a => a.subAcct === selectedAccount) || null;
  const isSub = Boolean(sub);

  // "All Accounts": combined equity across main + every sub-account.
  if (selectedAccount === 'all' && subAccounts.length) {
    const rows = [
      { key: 'main', label: 'Main Account', eq: balance?.totalEq || 0, upl: balance?.upl || 0 },
      ...subAccounts.map(a => ({ key: a.subAcct, label: a.label || a.subAcct, eq: a.totalEq || 0, upl: a.upl || 0, error: a.error })),
    ];
    const combinedEq = rows.reduce((s, r) => s + r.eq, 0);
    const combinedUpl = rows.reduce((s, r) => s + r.upl, 0);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <StatCard label="Combined Equity" value={fmt(combinedEq)} sub={`${rows.length} accounts`} theme={theme} />
          <StatCard label="Unrealized P&L" value={`${combinedUpl >= 0 ? '+' : ''}${fmt(combinedUpl)}`} color={combinedUpl >= 0 ? theme.pos : theme.neg} theme={theme} />
          <StatCard label="Main Account" value={fmt(balance?.totalEq || 0)} theme={theme} />
          <StatCard label="Sub-accounts" value={fmt(subAccounts.reduce((s, a) => s + (a.totalEq || 0), 0))} sub={`${subAccounts.length} linked`} theme={theme} />
        </div>
        <div className="card-lg" style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginBottom: 14 }}>Equity by Account</div>
          {rows.map(r => {
            const pct = combinedEq > 0 ? (r.eq / combinedEq) * 100 : 0;
            return (
              <div key={r.key} style={{ padding: '11px 0', borderBottom: `1px solid ${theme.cardBorder}` }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 7 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{r.label}</span>
                  <span style={{ fontSize: 13, color: r.error ? theme.neg : theme.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>
                    {r.error ? 'unavailable' : `${fmt(r.eq)} · ${pct.toFixed(1)}%`}
                  </span>
                </div>
                <div style={{ height: 5, borderRadius: 999, background: theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(20,17,31,0.06)', overflow: 'hidden' }}>
                  <div className="progress-bar-animate" style={{ height: '100%', width: `${pct}%`, borderRadius: 999, background: theme.primaryGrad }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Sub-account WITHOUT its own key: OKX gives balances only, so render just
  // those. With a key configured, fall through to the full live view below
  // (balance/positions are already scoped to this account by the sync).
  if (isSub && !sub?.hasKeys) {
    const subDetails = (sub?.details || []).filter(d => (d.eqUsd || 0) > 0.01);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {sub?.error ? (
          <div className="card" style={{ padding: 32, textAlign: 'center' }}>
            <AlertTriangle size={26} style={{ color: theme.neg, margin: '0 auto 10px' }} />
            <div style={{ fontSize: 13, color: theme.textMuted }}>Could not read this sub-account: {sub.error}</div>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
              <StatCard label="Total Equity" value={fmt(sub?.totalEq || 0)} theme={theme} />
              <StatCard label="Unrealized P&L" value={`${(sub?.upl || 0) >= 0 ? '+' : ''}${fmt(sub?.upl || 0)}`} color={(sub?.upl || 0) >= 0 ? theme.pos : theme.neg} theme={theme} />
              <StatCard label="Assets" value={subDetails.length} sub={subDetails.slice(0, 4).map(d => d.ccy).join(', ')} theme={theme} />
            </div>
            <div className="card-lg" style={{ padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginBottom: 14 }}>Balances</div>
              {subDetails.length ? subDetails.map(d => (
                <div key={d.ccy} className="flex items-center justify-between" style={{ padding: '10px 0', borderBottom: `1px solid ${theme.cardBorder}` }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{d.ccy}</span>
                  <span style={{ fontSize: 13, color: theme.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>
                    {d.eq.toLocaleString(undefined, { maximumFractionDigits: 6 })} · {fmt(d.eqUsd)}
                  </span>
                </div>
              )) : <div style={{ fontSize: 13, color: theme.textFaint }}>No balances in this sub-account.</div>}
            </div>
          </>
        )}
      </div>
    );
  }

  if (!balance && (!snapshots || snapshots.length === 0)) {
    return (
      <div className="card" style={{ padding: 48, textAlign: 'center' }}>
        <Coins size={40} style={{ color: theme.textFaint, margin: '0 auto 14px' }} />
        <div style={{ fontSize: 16, fontWeight: 600, color: theme.text, marginBottom: 6 }}>No portfolio data yet</div>
        <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 18 }}>Connect your read-only OKX API keys, then sync to load balances and positions.</div>
        <button onClick={onSync} disabled={syncing} className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <RefreshCw size={16} style={syncing ? { animation: 'spin 1s linear infinite' } : undefined} />{syncing ? 'Syncing…' : 'Sync OKX'}
        </button>
      </div>
    );
  }

  const lastSnap = snapshots && snapshots.length ? snapshots[snapshots.length - 1] : null;
  const totalEq = balance?.totalEq ?? lastSnap?.totalEq ?? 0;
  // Unrealized P&L, strictly live from OKX. Some margin configs report account
  // upl as 0 and only populate it per-position, so sum the open positions when
  // they're loaded and fall back to the account figure otherwise. No snapshot
  // fallback — blank until a sync lands rather than a stale stored value.
  const positionsUpl = (positions || []).reduce((s, p) => s + (Number(p.upl) || 0), 0);
  const upl = (positions && positions.length) ? positionsUpl : (balance?.upl ?? null);
  const details = balance?.details || lastSnap?.balances || [];
  const displayPositions = (positions && positions.length) ? positions : (lastSnap?.positions || []);
  const positionsAreLive = !!(positions && positions.length);
  const curve = (snapshots || []).map(s => ({ t: new Date(s.ts).getTime(), eq: s.totalEq, label: new Date(s.ts).toLocaleDateString() }));
  const allocation = details.filter(d => (d.eqUsd || 0) > 0.01).map((d, i) => ({ name: d.ccy, value: d.eqUsd, color: COIN_COLORS[i % COIN_COLORS.length] }));

  // Risk/reward on open positions from live SL/TP (algo orders).
  const liveAlgos = algos?.live || [];
  const posRR = displayPositions.map(p => ({ p, rr: positionRR(p, liveAlgos) }));
  const stopsSet = posRR.filter(({ rr }) => rr.hasStop).length;

  // Equity-curve window filter.
  const RANGE_MS = { '1D': 864e5, '7D': 7 * 864e5, '1M': 30 * 864e5, '1Y': 365 * 864e5, ALL: Infinity };
  const curveCutoff = Date.now() - (RANGE_MS[curveRange] ?? Infinity);
  const shownCurve = curveRange === 'ALL' ? curve : curve.filter(pt => pt.t >= curveCutoff);

  // Margin & liquidation exposure across open positions.
  const marginUsed = displayPositions.reduce((s, p) => s + (Number(p.margin) || 0), 0);
  const totalNotional = displayPositions.reduce((s, p) => s + (Number(p.notionalUsd) || 0), 0);
  const marginUtilPct = totalEq > 0 ? (marginUsed / totalEq) * 100 : 0;
  const totalUpl = displayPositions.reduce((s, p) => s + (Number(p.upl) || 0), 0);
  // Nearest position to its liquidation price, as a % of mark. Smaller = riskier.
  const liqDistances = displayPositions
    .map(p => { const m = Number(p.markPx) || 0, l = Number(p.liqPx) || 0; return (m > 0 && l > 0) ? Math.abs(m - l) / m * 100 : null; })
    .filter(v => v != null);
  const nearestLiqPct = liqDistances.length ? Math.min(...liqDistances) : null;
  const liqColor = nearestLiqPct == null ? theme.textMuted : nearestLiqPct < 10 ? theme.neg : nearestLiqPct < 25 ? theme.warn : theme.pos;
  const liqBand = nearestLiqPct == null ? 'no positions' : nearestLiqPct < 10 ? 'high risk' : nearestLiqPct < 25 ? 'watch' : 'comfortable';

  const RANGES = ['1D', '7D', '1M', '1Y', 'ALL'];

  // Funding within the selected window (OKX bills only span ~7 days).
  const fundCut = Date.now() - (RANGE_MS[fundRange] ?? Infinity);
  const fundRows = (funding?.recent || []).filter(r => fundRange === 'ALL' || (r.ts && r.ts >= fundCut));
  const fundSum = (funding?.recent || []).length ? fundRows.reduce((s, r) => s + (Number(r.amount) || 0), 0) : (funding?.totalFunding || 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
        <StatCard label="Total Equity" value={fmt(totalEq)} theme={theme} />
        <StatCard label="Unrealized P&L" value={upl == null ? '—' : `${upl >= 0 ? '+' : ''}${fmt(upl)}`} color={upl == null ? theme.textMuted : upl >= 0 ? theme.pos : theme.neg} sub={upl == null ? 'awaiting live sync' : 'live from OKX'} theme={theme} />
        <StatCard label="Margin Utilization" value={marginUsed > 0 ? `${marginUtilPct.toFixed(1)}%` : '—'} color={marginUtilPct >= 80 ? theme.neg : marginUtilPct >= 50 ? theme.warn : theme.text} sub={marginUsed > 0 ? `${fmt(marginUsed)} used · ${fmt(totalNotional)} notional` : 'no margin in use'} theme={theme} />
        <StatCard label="Risk of Liquidation" value={nearestLiqPct == null ? '—' : `${nearestLiqPct.toFixed(1)}%`} color={liqColor} sub={nearestLiqPct == null ? 'no open positions' : `nearest stop-out · ${liqBand}`} theme={theme} />
        <div className="card" style={{ padding: 18 }}>
          <div className="flex items-center justify-between" style={{ gap: 6 }}>
            <div className="stat-label">Funding</div>
            <div className="flex items-center" style={{ gap: 1, background: theme.hoverBg, borderRadius: 7, padding: 2 }}>
              {['1D', '7D'].map(r => (
                <button key={r} onClick={() => setFundRange(r)} style={{ padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 600, cursor: 'pointer', border: 'none', background: fundRange === r ? theme.primaryGrad : 'transparent', color: fundRange === r ? '#fff' : theme.textMuted }}>{r}</button>
              ))}
            </div>
          </div>
          <div className="stat-value" style={{ color: fundSum >= 0 ? theme.pos : theme.neg, marginTop: 6 }}>{fundSum >= 0 ? '+' : ''}{fmt(fundSum)}</div>
          <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>perp carry over {fundRange}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 16 }}>
        <div className="card-lg" style={{ padding: 20 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>Equity Curve</div>
            <div className="flex items-center" style={{ gap: 2, background: theme.hoverBg, borderRadius: 9, padding: 3 }}>
              {RANGES.map(r => (
                <button key={r} onClick={() => setCurveRange(r)} style={{ padding: '4px 10px', borderRadius: 7, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', border: 'none', background: curveRange === r ? theme.primaryGrad : 'transparent', color: curveRange === r ? '#fff' : theme.textMuted }}>{r}</button>
              ))}
            </div>
          </div>
          {shownCurve.length > 1 ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={shownCurve}>
                <defs><linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} /><stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} /></linearGradient></defs>
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: theme.textFaint }} />
                <YAxis tick={{ fontSize: 11, fill: theme.textFaint }} width={70} domain={['auto', 'auto']} />
                <Tooltip contentStyle={{ background: theme.card, border: `1px solid ${theme.cardBorder}`, borderRadius: 8, fontSize: 12 }} itemStyle={{ color: theme.text }} labelStyle={{ color: theme.textMuted }} formatter={(v) => fmt(v)} />
                <Area type="monotone" dataKey="eq" stroke="#8b5cf6" strokeWidth={2} fill="url(#eqGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textFaint, fontSize: 13, textAlign: 'center', padding: '0 20px' }}>
              {curve.length > 1 ? `No snapshots in the last ${curveRange}. Pick a wider range.` : 'Sync at least twice to plot your equity curve over time.'}
            </div>
          )}
        </div>
        <div className="card-lg" style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginBottom: 14 }}>Allocation</div>
          {allocation.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={allocation} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {allocation.map((a, i) => <Cell key={i} fill={a.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: theme.card, border: `1px solid ${theme.cardBorder}`, borderRadius: 8, fontSize: 12 }} itemStyle={{ color: theme.text }} labelStyle={{ color: theme.text }} formatter={(v, n) => [fmt(v), n]} />
                <Legend wrapperStyle={{ fontSize: 11.5, color: theme.text }} formatter={(value) => <span style={{ color: theme.text }}>{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textFaint, fontSize: 13 }}>No balances.</div>
          )}
        </div>
      </div>

      <div className="card-lg" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>Open Positions</span>
          {!positionsAreLive && displayPositions.length > 0 && lastSnap && (
            <span style={{ fontSize: 11, color: theme.textFaint }}>as of {new Date(lastSnap.ts).toLocaleString()}</span>
          )}
        </div>
        {displayPositions.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                {['Instrument', 'Side', 'Size', 'Avg Entry', 'Mark', 'Stop', 'Target', 'R:R', 'uPnL', 'Lev', 'Liq. Price'].map(h => <th key={h} className="table-header" style={{ textAlign: h === 'Instrument' || h === 'Side' ? 'left' : 'right' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {posRR.map(({ p, rr }, i) => (
                  <tr key={i} className="table-row" style={{ cursor: 'default' }}>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: theme.text }}>{p.instId}</td>
                    <td style={{ padding: '12px 16px' }}><span className="badge" style={{ background: netSide(p) === 'long' ? 'rgba(34,211,165,0.15)' : 'rgba(244,85,122,0.15)', color: netSide(p) === 'long' ? theme.pos : theme.neg }}>{netSide(p).toUpperCase()}</span></td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: theme.text, fontFamily: 'JetBrains Mono, monospace' }}>{Math.abs(Number(p.pos) || 0)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: theme.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>{fmtPx(p.avgPx)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: theme.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>{fmtPx(p.markPx)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: rr.usingLiq ? theme.warn : rr.hasStop ? theme.neg : theme.textFaint, fontFamily: 'JetBrains Mono, monospace' }}>{rr.sl != null ? fmtPx(rr.sl) : '—'}{rr.usingLiq ? <span style={{ fontSize: 9.5, color: theme.warn, marginLeft: 4 }}>LIQ</span> : null}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: rr.hasTarget ? theme.pos : theme.textFaint, fontFamily: 'JetBrains Mono, monospace' }}>{rr.hasTarget ? fmtPx(rr.tp) : '—'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: rr.plannedRR == null ? theme.textFaint : rr.plannedRR >= 1.5 ? theme.pos : theme.warn, fontFamily: 'JetBrains Mono, monospace', opacity: rr.usingLiq ? 0.75 : 1 }}>{rr.plannedRR == null ? '—' : `${rr.plannedRR.toFixed(2)}`}{rr.currentR != null ? <span style={{ color: theme.textFaint, fontWeight: 400 }}> · {rr.currentR >= 0 ? '+' : ''}{rr.currentR.toFixed(2)}R</span> : null}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: p.upl >= 0 ? theme.pos : theme.neg, fontFamily: 'JetBrains Mono, monospace' }}>{p.upl >= 0 ? '+' : ''}{fmt(p.upl)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: theme.textMuted }}>{p.lever}x</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: '#f59e0b', fontFamily: 'JetBrains Mono, monospace' }}>{fmtPx(p.liqPx)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: `2px solid ${theme.cardBorder}`, background: theme.hoverBg }}>
                  <td colSpan={8} style={{ padding: '12px 16px', fontSize: 12.5, fontWeight: 700, color: theme.textMuted }}>
                    Total · {displayPositions.length} position{displayPositions.length === 1 ? '' : 's'} · {fmt(totalNotional)} notional · {fmt(marginUsed)} margin
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: totalUpl >= 0 ? theme.pos : theme.neg, fontFamily: 'JetBrains Mono, monospace' }}>{totalUpl >= 0 ? '+' : ''}{fmt(totalUpl)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div style={{ padding: 32, textAlign: 'center', color: theme.textFaint, fontSize: 13 }}>No open positions.</div>
        )}
      </div>

      {/* Working orders — pending entry orders resting on the book, with any
          attached stop/target. Only rendered when the account has some. */}
      {(algos?.pending || []).length > 0 && (
        <div className="card-lg" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.cardBorder}`, fontSize: 14, fontWeight: 600, color: theme.text }}>Working Orders</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                {['Instrument', 'Side', 'Type', 'Entry', 'Size', 'Stop', 'Target', 'State'].map((h, i) => <th key={h} className="table-header" style={{ textAlign: i < 3 ? 'left' : 'right' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {(algos.pending || []).map((o, i) => (
                  <tr key={i} className="table-row" style={{ cursor: 'default' }}>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: theme.text }}>{o.instId}</td>
                    <td style={{ padding: '12px 16px' }}><span className="badge" style={{ background: o.side === 'buy' ? 'rgba(34,211,165,0.15)' : 'rgba(244,85,122,0.15)', color: o.side === 'buy' ? theme.pos : theme.neg }}>{(o.side || '').toUpperCase()}</span></td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: theme.textMuted }}>{o.ordType}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: theme.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>{fmtPx(o.px)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: theme.text, fontFamily: 'JetBrains Mono, monospace' }}>{o.sz ?? '—'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: o.slTriggerPx != null ? theme.neg : theme.textFaint, fontFamily: 'JetBrains Mono, monospace' }}>{fmtPx(o.slTriggerPx)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: o.tpTriggerPx != null ? theme.pos : theme.textFaint, fontFamily: 'JetBrains Mono, monospace' }}>{fmtPx(o.tpTriggerPx)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, color: theme.textFaint }}>{o.state}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function CryptoChallengeView({ challenges, snapshots, liveEq, onOpen, onUpdate, onDelete, fmt, theme }) {
  if (!challenges.length) {
    return (
      <div className="card" style={{ padding: 48, textAlign: 'center' }}>
        <Trophy size={40} style={{ color: theme.textFaint, margin: '0 auto 14px' }} />
        <div style={{ fontSize: 16, fontWeight: 600, color: theme.text, marginBottom: 6 }}>No growth challenge yet</div>
        <div style={{ fontSize: 13, color: theme.textMuted }}>Click <strong>New Challenge</strong> (top right) to set a start balance, target, and deadline — e.g. grow $1,000 → $10,000.</div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {challenges.map(c => {
        const current = (c.status === 'active' && typeof liveEq === 'number' && liveEq > 0) ? liveEq : (c.currentBalance || c.startBalance);
        const span = (c.targetBalance - c.startBalance) || 1;
        const pct = Math.max(0, Math.min(100, ((current - c.startBalance) / span) * 100));
        const reached = current >= c.targetBalance;
        const snaps = (snapshots || []).filter(s => !c.startDate || new Date(s.ts) >= new Date(c.startDate));
        let projection = null;
        if (snaps.length >= 2) {
          const first = snaps[0], last = snaps[snaps.length - 1];
          const days = Math.max(1, (new Date(last.ts) - new Date(first.ts)) / 86400000);
          const perDay = (last.totalEq - first.totalEq) / days;
          if (perDay > 0 && current < c.targetBalance) {
            const daysLeft = (c.targetBalance - current) / perDay;
            projection = new Date(Date.now() + daysLeft * 86400000);
          }
        }
        const curve = snaps.map(s => ({ label: new Date(s.ts).toLocaleDateString(), eq: s.totalEq }));
        return (
          <div key={c.id} className="card-lg" style={{ padding: 22 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
              <div>
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 17, fontWeight: 700, color: theme.text }}>{c.name}</span>
                  <span className="badge" style={{ background: reached ? 'rgba(34,211,165,0.15)' : c.status === 'active' ? 'rgba(139,92,246,0.15)' : 'rgba(148,163,184,0.15)', color: reached ? theme.pos : c.status === 'active' ? '#8b5cf6' : theme.textMuted }}>{reached ? 'TARGET HIT' : c.status.toUpperCase()}</span>
                </div>
                <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>{fmt(c.startBalance, 0)} → {fmt(c.targetBalance, 0)}{c.targetDate ? ` · by ${new Date(c.targetDate).toLocaleDateString()}` : ''}</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => onOpen && onOpen(c.id)} style={{ padding: 8, borderRadius: 8, border: `1px solid ${theme.cardBorder}`, background: theme.card, cursor: 'pointer' }} title="View analytics"><BarChart3 size={16} style={{ color: '#8b5cf6' }} /></button>
                {!reached && c.status === 'active' && <button onClick={() => onUpdate({ ...c, status: 'completed' })} style={{ padding: 8, borderRadius: 8, border: `1px solid ${theme.cardBorder}`, background: theme.card, cursor: 'pointer' }} title="Mark complete"><CheckCircle size={16} style={{ color: theme.pos }} /></button>}
                <button onClick={() => onDelete(c.id)} style={{ padding: 8, borderRadius: 8, border: `1px solid ${theme.cardBorder}`, background: theme.card, cursor: 'pointer' }} title="Delete"><Trash2 size={16} style={{ color: theme.neg }} /></button>
              </div>
            </div>

            <div className="flex items-end justify-between" style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 26, fontWeight: 700, color: theme.text }}>{fmt(current)}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: reached ? theme.pos : '#8b5cf6' }}>{pct.toFixed(1)}%</span>
            </div>
            <div style={{ height: 10, borderRadius: 5, background: theme.hoverBg, overflow: 'hidden', marginBottom: 14 }}>
              <div className="progress-bar-animate" style={{ width: `${pct}%`, height: '100%', background: reached ? theme.pos : 'linear-gradient(90deg, #7c3aed, #a855f7)' }}></div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginBottom: 16 }}>
              <div><div className="stat-label">P&L</div><div style={{ fontSize: 16, fontWeight: 700, color: (current - c.startBalance) >= 0 ? theme.pos : theme.neg }}>{(current - c.startBalance) >= 0 ? '+' : ''}{fmt(current - c.startBalance)}</div></div>
              <div><div className="stat-label">Remaining</div><div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>{fmt(Math.max(0, c.targetBalance - current))}</div></div>
              <div><div className="stat-label">Return</div><div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>{(((current - c.startBalance) / c.startBalance) * 100).toFixed(1)}%</div></div>
              <div><div className="stat-label">Proj. completion</div><div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>{reached ? 'Done' : projection ? projection.toLocaleDateString() : '—'}</div></div>
            </div>

            {curve.length > 1 && (
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={curve}>
                  <defs><linearGradient id={`cg${c.id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={theme.pos} stopOpacity={0.35} /><stop offset="100%" stopColor={theme.pos} stopOpacity={0} /></linearGradient></defs>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: theme.textFaint }} />
                  <YAxis tick={{ fontSize: 10, fill: theme.textFaint }} width={64} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ background: theme.card, border: `1px solid ${theme.cardBorder}`, borderRadius: 8, fontSize: 12 }} formatter={(v) => fmt(v)} />
                  <ReferenceLine y={c.targetBalance} stroke="#8b5cf6" strokeDasharray="5 4" label={{ value: 'Target', fontSize: 10, fill: '#8b5cf6', position: 'insideTopRight' }} />
                  <Area type="monotone" dataKey="eq" stroke={theme.pos} strokeWidth={2} fill={`url(#cg${c.id})`} />
                </AreaChart>
              </ResponsiveContainer>
            )}
            {c.notes && <div style={{ marginTop: 12, fontSize: 13, color: theme.textMuted }}>{c.notes}</div>}
          </div>
        );
      })}
    </div>
  );
}

function CryptoTradesView({ trades, algos = { live: [], history: [] }, onAddTrade, onDeleteTrade, fmt, theme, readOnly = false }) {
  const [coin, setCoin] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [view, setView] = useState('trips'); // 'trips' = round trips w/ R · 'fills' = raw fills
  const coins = ['all', ...Array.from(new Set(trades.map(t => coinFromInst(t.instId)))).filter(Boolean)];
  const filtered = coin === 'all' ? trades : trades.filter(t => coinFromInst(t.instId) === coin);
  const trips = buildRoundTrips(filtered).map(t => attachRealizedR(t, algos?.history || []));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
        <div className="flex items-center gap-1" style={{ background: theme.hoverBg, borderRadius: 10, padding: 3 }}>
          {[{ id: 'trips', label: 'Round trips' }, { id: 'fills', label: 'Fills' }].map(v => (
            <button key={v.id} onClick={() => setView(v.id)} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: 'none', background: view === v.id ? theme.primaryGrad : 'transparent', color: view === v.id ? 'white' : theme.textMuted }}>{v.label}</button>
          ))}
        </div>
        <select value={coin} onChange={(e) => setCoin(e.target.value)} className="input" style={{ width: 'auto', minWidth: 140 }}>
          {coins.map(c => <option key={c} value={c}>{c === 'all' ? 'All coins' : c}</option>)}
        </select>
        <span style={{ fontSize: 13, color: theme.textMuted }}>{view === 'trips' ? `${trips.length} round trip${trips.length === 1 ? '' : 's'}` : `${filtered.length} fill${filtered.length === 1 ? '' : 's'}`}</span>
        {readOnly ? <span style={{ marginLeft: 'auto', fontSize: 11.5, color: theme.textFaint }}>live · sub-account (read-only)</span> : <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2" style={{ marginLeft: 'auto' }}><Plus size={15} />Add manual trade</button>}
      </div>

      {view === 'trips' && (
        <div className="card-lg" style={{ overflow: 'hidden' }}>
          {trips.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  {['Closed', 'Instrument', 'Side', 'Entry', 'Exit', 'Stop', 'Size', 'P&L', 'R'].map((h, i) => <th key={i} className="table-header" style={{ textAlign: i >= 3 ? 'right' : 'left' }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {trips.map((t, i) => (
                    <tr key={i} className="table-row" style={{ cursor: 'default' }}>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: theme.textMuted }}>{new Date(t.closeTs).toLocaleString()}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: theme.text }}>{t.instId}</td>
                      <td style={{ padding: '12px 16px' }}><span className="badge" style={{ background: t.side === 'long' ? 'rgba(34,211,165,0.15)' : 'rgba(244,85,122,0.15)', color: t.side === 'long' ? theme.pos : theme.neg }}>{(t.side || '').toUpperCase()}</span></td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: theme.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>{t.entryPx.toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: theme.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>{t.exitPx.toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: t.slUsed != null ? theme.neg : theme.textFaint, fontFamily: 'JetBrains Mono, monospace' }}>{t.slUsed != null ? t.slUsed.toLocaleString(undefined, { maximumFractionDigits: 6 }) : '—'}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: theme.text, fontFamily: 'JetBrains Mono, monospace' }}>{t.qty}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: t.pnl >= 0 ? theme.pos : theme.neg, fontFamily: 'JetBrains Mono, monospace' }}>{t.pnl >= 0 ? '+' : ''}{fmt(t.pnl)}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: t.rMultiple == null ? theme.textFaint : t.rMultiple >= 0 ? theme.pos : theme.neg, fontFamily: 'JetBrains Mono, monospace' }}>{t.rMultiple == null ? '—' : `${t.rMultiple >= 0 ? '+' : ''}${t.rMultiple.toFixed(2)}R`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: 40, textAlign: 'center', color: theme.textFaint, fontSize: 13 }}>No closed round trips yet. Open and close a position to see entry→exit and R.</div>
          )}
        </div>
      )}

      {view === 'fills' && (
      <div className="card-lg" style={{ overflow: 'hidden' }}>
        {filtered.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                {['Time', 'Instrument', 'Side', 'Size', 'Price', 'P&L', 'Fee', 'Source', ''].map((h, i) => <th key={i} className="table-header" style={{ textAlign: i >= 3 && i <= 6 ? 'right' : 'left' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id} className="table-row" style={{ cursor: 'default' }}>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: theme.textMuted }}>{new Date(t.ts).toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: theme.text }}>{t.instId}</td>
                    <td style={{ padding: '12px 16px' }}><span className="badge" style={{ background: t.side === 'buy' ? 'rgba(34,211,165,0.15)' : 'rgba(244,85,122,0.15)', color: t.side === 'buy' ? theme.pos : theme.neg }}>{(t.posSide && t.posSide !== 'net' ? t.posSide : t.side || '').toUpperCase()}</span></td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: theme.text, fontFamily: 'JetBrains Mono, monospace' }}>{t.fillSz}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: theme.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>{t.fillPx}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: t.pnl >= 0 ? theme.pos : theme.neg, fontFamily: 'JetBrains Mono, monospace' }}>{t.pnl ? (t.pnl >= 0 ? '+' : '') + fmt(t.pnl) : '—'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, color: theme.textFaint, fontFamily: 'JetBrains Mono, monospace' }}>{t.fee ? fmt(t.fee) : '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 11, color: theme.textFaint }}>{t.source === 'manual' ? 'Manual' : 'OKX'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}><button onClick={() => onDeleteTrade(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><Trash2 size={14} style={{ color: theme.textFaint }} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: 40, textAlign: 'center', color: theme.textFaint, fontSize: 13 }}>No trades yet. Sync OKX or add one manually.</div>
        )}
      </div>
      )}

      {showAdd && <AddCryptoTradeModal onClose={() => setShowAdd(false)} onSave={(t) => { onAddTrade(t); setShowAdd(false); }} theme={theme} />}
    </div>
  );
}

// Crypto Ellipse Score — 5-axis RR radar, differentiated from the prop version.
function CryptoEllipseScorePanel({ trades, positions, algos, snapshots }) {
  const theme = useTheme();
  const { score, factors, available, provisional, caps, tradeCount } = computeCryptoEllipseScore({ trades, positions, algos, snapshots });

  const band = score >= 75 ? { label: 'Sharp', color: theme.pos }
    : score >= 55 ? { label: 'Developing', color: theme.accent }
    : score >= 35 ? { label: 'Leaky', color: theme.warn }
    : { label: 'Undisciplined', color: theme.neg };

  const r = 150, cx = r / 2, cy = r / 2, maxR = r * 0.36;
  const pt = (i, frac) => {
    const a = (Math.PI * 2 * i) / factors.length - Math.PI / 2;
    return [cx + Math.cos(a) * maxR * frac, cy + Math.sin(a) * maxR * frac];
  };
  const ring = (f) => factors.map((_, i) => pt(i, f).join(',')).join(' ');
  const shape = factors.map((f, i) => pt(i, Math.max(f.pct, 0.02)).join(',')).join(' ');

  if (!available) {
    return (
      <div className="card" style={{ padding: 18 }}>
        <div className="stat-label">Crypto Ellipse Score</div>
        <div style={{ padding: '26px 0', textAlign: 'center', fontSize: 12.5, color: theme.textFaint }}>
          Close at least 3 round-trip trades to generate a risk/reward score.
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column' }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2" style={{ flexWrap: 'wrap' }}>
          <div className="stat-label">Crypto Ellipse Score</div>
          <span style={{ fontSize: 10.5, color: theme.textFaint }}>risk/reward, not prop rules</span>
        </div>
        <span className="badge" style={{ background: `${band.color}1f`, color: band.color }}>{band.label}</span>
      </div>
      <div className="flex items-center gap-3" style={{ margin: '14px 0 6px' }}>
        <svg width={r} height={r} role="img" aria-label={`Crypto Ellipse score ${score} of 100`}>
          {[1, 0.66, 0.33].map((f, i) => <polygon key={i} points={ring(f)} fill="none" stroke={theme.cardBorder} strokeWidth="1" opacity={1 - i * 0.25} />)}
          {factors.map((_, i) => { const [x, y] = pt(i, 1); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={theme.cardBorder} strokeWidth="1" opacity="0.5" />; })}
          <polygon points={shape} fill="rgba(139,92,246,0.28)" stroke={theme.primary} strokeWidth="2" strokeLinejoin="round" />
          {factors.map((f, i) => { const [x, y] = pt(i, Math.max(f.pct, 0.02)); return <circle key={i} cx={x} cy={y} r="3" fill={theme.primaryHi} />; })}
        </svg>
        <div>
          <div style={{ fontSize: 40, fontWeight: 800, color: band.color, letterSpacing: '-1.4px', lineHeight: 1 }}>{score}</div>
          <div style={{ fontSize: 12, color: theme.textFaint, marginTop: 2 }}>out of 100</div>
          {provisional && <div style={{ fontSize: 10.5, color: theme.warn, marginTop: 4 }}>provisional · {tradeCount} trades</div>}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 6 }}>
        {factors.map(f => (
          <div key={f.key} title={f.detail}>
            <div className="flex items-baseline justify-between gap-2" style={{ marginBottom: 5 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: theme.text }}>{f.label}</span>
              <span style={{ fontSize: 10.5, color: theme.textFaint, fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>{Math.round(f.value)}/{f.weight}</span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(20,17,31,0.08)', overflow: 'hidden' }}>
              <div className="progress-bar-animate" style={{ height: '100%', width: `${f.pct * 100}%`, borderRadius: 999, background: theme.primaryGrad }} />
            </div>
            <div style={{ fontSize: 10, color: theme.textFaint, marginTop: 4, lineHeight: 1.35 }}>{f.detail}</div>
          </div>
        ))}
      </div>
      {caps?.length > 0 && (
        <div style={{ marginTop: 10, padding: '7px 10px', borderRadius: 10, background: 'rgba(244,85,122,0.1)', border: '1px solid rgba(244,85,122,0.3)' }}>
          {caps.map((c, i) => <div key={i} style={{ fontSize: 10.5, color: theme.neg, fontWeight: 500 }}>{c}</div>)}
        </div>
      )}
    </div>
  );
}

function CryptoAnalyticsView({ trades, pnl = [], positions = [], algos = { live: [], history: [] }, snapshots = [], fmt, theme }) {
  const [aRange, setARange] = useState('ALL'); // 1D | 7D | 1M | 1Y | ALL
  const A_RANGES = ['1D', '7D', '1M', '1Y', 'ALL'];
  const A_MS = { '1D': 864e5, '7D': 7 * 864e5, '1M': 30 * 864e5, '1Y': 365 * 864e5, ALL: Infinity };
  const aCut = Date.now() - (A_MS[aRange] ?? Infinity);
  const ft = aRange === 'ALL' ? trades : trades.filter(t => new Date(t.ts).getTime() >= aCut);

  // Outcome basis = OKX closed positions (realized P&L, fees in, funding out),
  // mapped to the trade shape so Net P&L, win rate, PF, the P&L charts and the
  // calendar all match what OKX reports. Falls back to synced fills if OKX
  // closed-position history isn't available.
  const pnlTrades = (pnl || []).map(p => ({
    id: 'pnl_' + (p.closeTs || p.instId), instId: p.instId, posSide: p.direction,
    fillPx: 0, fillSz: 0, pnl: Number(p.net) || 0, fee: 0,
    ts: p.closeTs ? new Date(p.closeTs).toISOString() : new Date().toISOString(), source: 'okx',
  }));
  const pnlInRange = aRange === 'ALL' ? pnlTrades : pnlTrades.filter(t => new Date(t.ts).getTime() >= aCut);
  const usePnl = pnlTrades.length > 0;
  const outcome = usePnl ? pnlInRange : ft; // Net P&L / win% / PF / charts / calendar

  const RangeToggle = (
    <div className="flex items-center" style={{ gap: 2, background: theme.hoverBg, borderRadius: 9, padding: 3 }}>
      {A_RANGES.map(r => (
        <button key={r} onClick={() => setARange(r)} style={{ padding: '4px 10px', borderRadius: 7, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', border: 'none', background: aRange === r ? theme.primaryGrad : 'transparent', color: aRange === r ? '#fff' : theme.textMuted }}>{r}</button>
      ))}
    </div>
  );

  if (!trades.length && !pnlTrades.length) {
    return <div className="card" style={{ padding: 48, textAlign: 'center', color: theme.textMuted, fontSize: 14 }}>No trades to analyze yet. Sync OKX or add trades to see analytics.</div>;
  }
  if (!outcome.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>Analytics</div>{RangeToggle}
        </div>
        <div className="card" style={{ padding: 40, textAlign: 'center', color: theme.textFaint, fontSize: 13 }}>No closed trades in the last {aRange}. Pick a wider range.</div>
      </div>
    );
  }
  const s = computeCryptoStats(outcome);
  const pf = s.profitFactor === Infinity ? '∞' : s.profitFactor.toFixed(2);

  // Same shape the Dashboard components expect, so both sections share code.
  const normalized = outcome.map(cryptoToNormalized);
  const { cumulative, daily } = buildPnlSeries(normalized, { limit: 30 });
  const gradeCtx = outcomeContext(normalized);
  const expectancy = s.realizedCount ? (s.netPnl / s.realizedCount) : 0;
  const ratio = s.avgLoss > 0 ? s.avgWin / s.avgLoss : (s.avgWin > 0 ? s.avgWin : 0);

  // Risk/reward stats from real stops (round trips + algo history).
  const trips = buildRoundTrips(ft).map(t => attachRealizedR(t, algos?.history || []));
  const rMults = trips.map(t => t.rMultiple).filter(v => Number.isFinite(v));
  const avgR = rMults.length ? rMults.reduce((a, b) => a + b, 0) / rMults.length : null;
  const stopCoverage = trips.length ? Math.round((trips.filter(t => t.slUsed != null).length / trips.length) * 100) : 0;

  const byCoinMap = {};
  outcome.forEach(t => { const c = coinFromInst(t.instId); byCoinMap[c] = (byCoinMap[c] || 0) + (t.pnl || 0); });
  const byCoin = Object.entries(byCoinMap).map(([name, pnl]) => ({ name, pnl: +pnl.toFixed(2), color: pnl >= 0 ? theme.pos : theme.neg })).sort((a, b) => b.pnl - a.pnl);

  const recent = [...normalized].sort((a, b) => new Date(b.date + ' ' + b.time) - new Date(a.date + ' ' + a.time)).slice(0, 8);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>Analytics <span style={{ fontSize: 12, fontWeight: 400, color: theme.textFaint }}>· {outcome.length} {usePnl ? 'closed position' : 'trade'}{outcome.length === 1 ? '' : 's'} in {aRange}{usePnl ? ' · P&L from OKX' : ''}</span></div>
        {RangeToggle}
      </div>
      {/* Top stats — mirrors the Dashboard row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <StatCard label="Net P&L" value={`${s.netPnl >= 0 ? '+' : ''}${fmt(s.netPnl)}`} color={s.netPnl >= 0 ? theme.pos : theme.neg} sub={`${fmt(s.totalFees)} fees`} theme={theme} />
        <StatCard label="Trade Expectancy" value={fmt(expectancy)} color={expectancy >= 0 ? theme.pos : theme.neg} sub="per closed trade" theme={theme} />
        <StatCard label="Profit Factor" value={pf} theme={theme} />
        <StatCard label="Win %" value={`${s.winRate.toFixed(2)}%`} sub={`${s.winCount}W / ${s.lossCount}L`} theme={theme} />
        <StatCard label="Avg Win/Loss Trade" value={ratio ? ratio.toFixed(1) : '—'} sub={`${fmt(s.avgWin)} / ${fmt(s.avgLoss)}`} theme={theme} />
        <StatCard label="Expectancy (R)" value={avgR == null ? '—' : `${avgR >= 0 ? '+' : ''}${avgR.toFixed(2)}R`} color={avgR == null ? theme.textMuted : avgR >= 0 ? theme.pos : theme.neg} sub={`${stopCoverage}% of trades stopped`} theme={theme} />
      </div>

      {/* Score + the two P&L charts, same layout as the Dashboard */}
      <div style={{ display: 'grid', gridTemplateColumns: '340px minmax(0, 1fr)', gap: 12, alignItems: 'stretch' }}>
        <CryptoEllipseScorePanel trades={ft} positions={positions} algos={algos} snapshots={snapshots} />
        <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 12, minHeight: 0 }}>
          <ChartCard title="Daily Net Cumulative P&L" minHeight={140}>
            <CumulativePnlChart data={cumulative} theme={theme} id="cryptoCum" />
          </ChartCard>
          <ChartCard title="Net Daily P&L" minHeight={140}>
            <DailyPnlChart data={daily} theme={theme} />
          </ChartCard>
        </div>
      </div>

      {/* Recent trades + P&L by coin */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr)', gap: 12, alignItems: 'stretch' }}>
        <div className="card" style={{ padding: 18 }}>
          <div className="stat-label" style={{ marginBottom: 12 }}>Recent Trades</div>
          {recent.map((t, i) => (
            <div key={t.id || i} className="flex items-center justify-between gap-2" style={{ padding: '9px 0', borderBottom: i === recent.length - 1 ? 'none' : `1px solid ${theme.cardBorder}` }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: theme.text }}>{t.symbol}</div>
                <div style={{ fontSize: 10.5, color: theme.textFaint }}>{t.date}</div>
              </div>
              <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                <TradeGradeBadge trade={t} theme={theme} ctx={gradeCtx} showScore={false} />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: t.pnl >= 0 ? theme.pos : theme.neg, fontFamily: "'JetBrains Mono', monospace" }}>
                  {t.pnl >= 0 ? '+' : ''}{fmt(t.pnl)}
                </span>
              </div>
            </div>
          ))}
        </div>

        <ChartCard title="P&L by Coin" minHeight={Math.max(180, byCoin.length * 34)}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byCoin} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11, fill: theme.textFaint }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: theme.textMuted }} width={70} />
              <Tooltip contentStyle={{ background: theme.card, border: `1px solid ${theme.cardBorder}`, borderRadius: 12, fontSize: 12, color: theme.text }} formatter={(v) => fmt(v)} cursor={{ fill: theme.hoverBg }} />
              <ReferenceLine x={0} stroke={theme.borderStrong} />
              <Bar dataKey="pnl" radius={[0, 4, 4, 0]}>{byCoin.map((d, i) => <Cell key={i} fill={d.color} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Monthly calendar — was previously only reachable inside a challenge */}
      <CryptoTradingCalendar trades={outcome} fmt={fmt} theme={theme} />
    </div>
  );
}

function AddCryptoTradeModal({ onClose, onSave, theme }) {
  const now = new Date();
  const [t, setT] = useState({ instId: '', side: 'buy', posSide: 'long', fillSz: '', fillPx: '', pnl: '', fee: '', date: now.toISOString().split('T')[0], time: now.toTimeString().slice(0, 5), notes: '' });
  const save = () => {
    if (!t.instId) return;
    onSave({
      instId: t.instId.toUpperCase(), side: t.side, posSide: t.posSide,
      fillSz: parseFloat(t.fillSz) || 0, fillPx: parseFloat(t.fillPx) || 0,
      pnl: parseFloat(t.pnl) || 0, fee: parseFloat(t.fee) || 0, feeCcy: 'USDT',
      ts: new Date(`${t.date}T${t.time || '00:00'}`).toISOString(), notes: t.notes,
    });
  };
  return (
    <Modal width={460} onClose={onClose}>
      <div style={{ padding: 20, borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: theme.text }}>Add Manual Trade</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={20} style={{ color: theme.textFaint }} /></button>
      </div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div><label className="label">Instrument</label><input value={t.instId} onChange={(e) => setT({ ...t, instId: e.target.value.toUpperCase() })} placeholder="BTC-USDT-SWAP" className="input" /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label className="label">Side</label><select value={t.side} onChange={(e) => setT({ ...t, side: e.target.value })} className="input"><option value="buy">Buy</option><option value="sell">Sell</option></select></div>
          <div><label className="label">Direction</label><select value={t.posSide} onChange={(e) => setT({ ...t, posSide: e.target.value })} className="input"><option value="long">Long</option><option value="short">Short</option><option value="net">Net</option></select></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label className="label">Size</label><input type="number" step="any" value={t.fillSz} onChange={(e) => setT({ ...t, fillSz: e.target.value })} className="input" /></div>
          <div><label className="label">Price</label><input type="number" step="any" value={t.fillPx} onChange={(e) => setT({ ...t, fillPx: e.target.value })} className="input" /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label className="label">Realized P&L ($)</label><input type="number" step="any" value={t.pnl} onChange={(e) => setT({ ...t, pnl: e.target.value })} className="input" /></div>
          <div><label className="label">Fee ($)</label><input type="number" step="any" value={t.fee} onChange={(e) => setT({ ...t, fee: e.target.value })} className="input" /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label className="label">Date</label><input type="date" value={t.date} onChange={(e) => setT({ ...t, date: e.target.value })} className="input" /></div>
          <div><label className="label">Time</label><input type="time" value={t.time} onChange={(e) => setT({ ...t, time: e.target.value })} className="input" /></div>
        </div>
        <div><label className="label">Notes</label><textarea value={t.notes} onChange={(e) => setT({ ...t, notes: e.target.value })} rows={2} className="input" style={{ resize: 'none' }} /></div>
      </div>
      <div style={{ padding: 20, borderTop: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 14, color: theme.textMuted, cursor: 'pointer' }}>Cancel</button>
        <button onClick={save} className="btn-primary">Save Trade</button>
      </div>
    </Modal>
  );
}

function NewCryptoChallengeModal({ onClose, onSave, liveBalance }) {
  const theme = useTheme();
  const [c, setC] = useState({ name: '', startBalance: liveBalance ? Math.round(liveBalance) : 1000, targetBalance: 10000, startDate: new Date().toISOString().split('T')[0], targetDate: '', notes: '' });
  const save = () => {
    const start = parseFloat(c.startBalance) || 0;
    const target = parseFloat(c.targetBalance) || 0;
    if (target <= start) return;
    onSave({
      name: c.name || 'Growth Challenge', startBalance: start, targetBalance: target,
      currentBalance: liveBalance || start, startDate: c.startDate, targetDate: c.targetDate || null,
      milestones: [25, 50, 75, 100].map(p => ({ pct: p, hit: false })), notes: c.notes,
    });
  };
  const start = parseFloat(c.startBalance) || 0, target = parseFloat(c.targetBalance) || 0;
  const multiple = start > 0 ? (target / start).toFixed(1) : '—';
  return (
    <Modal width={460} onClose={onClose}>
      <div style={{ padding: 20, borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: theme.text }}>New Growth Challenge</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={20} style={{ color: theme.textFaint }} /></button>
      </div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div><label className="label">Challenge name</label><input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} placeholder="e.g. $1K to $10K Run" className="input" /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label className="label">Start balance ($)</label><input type="number" step="any" value={c.startBalance} onChange={(e) => setC({ ...c, startBalance: e.target.value })} className="input" /></div>
          <div><label className="label">Target balance ($)</label><input type="number" step="any" value={c.targetBalance} onChange={(e) => setC({ ...c, targetBalance: e.target.value })} className="input" /></div>
        </div>
        <div style={{ padding: 12, borderRadius: 10, background: theme.hoverBg, fontSize: 13, color: theme.textMuted }}>Goal: grow your account <strong style={{ color: '#8b5cf6' }}>{multiple}x</strong></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label className="label">Start date</label><input type="date" value={c.startDate} onChange={(e) => setC({ ...c, startDate: e.target.value })} className="input" /></div>
          <div><label className="label">Target date (optional)</label><input type="date" value={c.targetDate} onChange={(e) => setC({ ...c, targetDate: e.target.value })} className="input" /></div>
        </div>
        <div><label className="label">Notes</label><textarea value={c.notes} onChange={(e) => setC({ ...c, notes: e.target.value })} rows={2} className="input" placeholder="Rules, strategy, risk per trade" style={{ resize: 'none' }} /></div>
      </div>
      <div style={{ padding: 20, borderTop: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 14, color: theme.textMuted, cursor: 'pointer' }}>Cancel</button>
        <button onClick={save} className="btn-primary">Create Challenge</button>
      </div>
    </Modal>
  );
}

// ==================== CRYPTO CHALLENGE DETAIL (per-challenge analytics) ====================
function CryptoChallengeDetail({ challenge, trades, snapshots, liveEq, onBack, onUpdate, onDelete, fmt, theme }) {
  const c = challenge;
  const today = new Date().toISOString().split('T')[0];
  const [startD, setStartD] = useState(c.startDate || '');
  const [endD, setEndD] = useState(c.targetDate && c.targetDate < today ? c.targetDate : today);

  const inRange = trades.filter(t => {
    const d = (t.ts || '').slice(0, 10);
    if (startD && d < startD) return false;
    if (endD && d > endD) return false;
    return true;
  });

  const s = computeCryptoStats(inRange);
  const returnPct = c.startBalance > 0 ? (s.netPnl / c.startBalance) * 100 : 0;
  const pfLabel = s.profitFactor === Infinity ? '∞' : s.profitFactor.toFixed(2);

  // Daily net + cumulative
  const byDay = {};
  inRange.forEach(t => { const d = t.ts.slice(0, 10); byDay[d] = (byDay[d] || 0) + (t.pnl || 0) - Math.abs(t.fee || 0); });
  let cum = 0;
  const dailyData = Object.entries(byDay).sort((a, b) => a[0] < b[0] ? -1 : 1)
    .map(([d, net]) => { cum += net; return { date: d.slice(5), net: +net.toFixed(2), cum: +cum.toFixed(2) }; });

  const recent = [...inRange].sort((a, b) => new Date(b.ts) - new Date(a.ts)).slice(0, 25);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="flex items-center gap-3">
          <button onClick={onBack} style={{ padding: 8, borderRadius: 8, border: `1px solid ${theme.cardBorder}`, background: theme.card, cursor: 'pointer' }} title="Back to challenges"><ChevronLeft size={18} style={{ color: theme.textMuted }} /></button>
          <div>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 18, fontWeight: 700, color: theme.text }}>{c.name}</span>
              <span className="badge" style={{ background: c.status === 'active' ? 'rgba(139,92,246,0.15)' : 'rgba(148,163,184,0.15)', color: c.status === 'active' ? '#8b5cf6' : theme.textMuted }}>{c.status.toUpperCase()}</span>
            </div>
            <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{fmt(c.startBalance, 0)} → {fmt(c.targetBalance, 0)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
          <div><label className="label" style={{ marginBottom: 2 }}>From</label><input type="date" value={startD} onChange={(e) => setStartD(e.target.value)} className="input input-sm" style={{ width: 'auto' }} /></div>
          <div><label className="label" style={{ marginBottom: 2 }}>To</label><input type="date" value={endD} onChange={(e) => setEndD(e.target.value)} className="input input-sm" style={{ width: 'auto' }} /></div>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
        <StatCard label="Net P&L" value={`${s.netPnl >= 0 ? '+' : ''}${fmt(s.netPnl)}`} color={s.netPnl >= 0 ? theme.pos : theme.neg} sub={`${fmt(s.totalFees)} fees`} theme={theme} />
        <StatCard label="Return" value={`${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(1)}%`} color={returnPct >= 0 ? theme.pos : theme.neg} sub="on start balance" theme={theme} />
        <StatCard label="Win Rate" value={`${s.winRate.toFixed(1)}%`} sub={`${s.winCount}W / ${s.lossCount}L`} theme={theme} />
        <StatCard label="Profit Factor" value={pfLabel} theme={theme} />
        <StatCard label="Trades" value={s.tradeCount} sub={`${s.realizedCount} with P&L`} theme={theme} />
      </div>

      {/* Ellipse Score */}
      <EllipseScorePanel trades={inRange} size={168} />

      {/* Daily net + cumulative P&L */}
      <div className="card-lg" style={{ padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginBottom: 14 }}>Daily &amp; Cumulative Net P&L</div>
        {dailyData.length ? (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={dailyData}>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: theme.textFaint }} />
              <YAxis yAxisId="l" tick={{ fontSize: 11, fill: theme.textFaint }} width={64} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: theme.textFaint }} width={64} />
              <Tooltip contentStyle={{ background: theme.card, border: `1px solid ${theme.cardBorder}`, borderRadius: 8, fontSize: 12 }} formatter={(v, n) => [fmt(v), n === 'net' ? 'Daily net' : 'Cumulative']} />
              <ReferenceLine yAxisId="l" y={0} stroke={theme.textFaint} />
              <Bar yAxisId="l" dataKey="net" radius={[3, 3, 0, 0]}>{dailyData.map((d, i) => <Cell key={i} fill={d.net >= 0 ? theme.pos : theme.neg} />)}</Bar>
              <Line yAxisId="r" type="monotone" dataKey="cum" stroke="#8b5cf6" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textFaint, fontSize: 13 }}>No trades in this date range.</div>
        )}
      </div>

      {/* Recent trades */}
      <div className="card-lg" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', fontSize: 14, fontWeight: 600, color: theme.text, borderBottom: `1px solid ${theme.cardBorder}` }}>Recent Trades</div>
        {recent.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Time', 'Instrument', 'Side', 'Size', 'Price', 'P&L', 'Fee'].map((h, i) => <th key={i} className="table-header" style={{ textAlign: i >= 3 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
              <tbody>
                {recent.map(t => (
                  <tr key={t.id} className="table-row" style={{ cursor: 'default' }}>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: theme.textMuted }}>{new Date(t.ts).toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: theme.text }}>{t.instId}</td>
                    <td style={{ padding: '12px 16px' }}><span className="badge" style={{ background: t.side === 'buy' ? 'rgba(34,211,165,0.15)' : 'rgba(244,85,122,0.15)', color: t.side === 'buy' ? theme.pos : theme.neg }}>{(t.posSide && t.posSide !== 'net' ? t.posSide : t.side || '').toUpperCase()}</span></td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: theme.text, fontFamily: 'JetBrains Mono, monospace' }}>{t.fillSz}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: theme.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>{t.fillPx}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: t.pnl >= 0 ? theme.pos : theme.neg, fontFamily: 'JetBrains Mono, monospace' }}>{t.pnl ? (t.pnl >= 0 ? '+' : '') + fmt(t.pnl) : '—'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, color: theme.textFaint, fontFamily: 'JetBrains Mono, monospace' }}>{t.fee ? fmt(t.fee) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: 32, textAlign: 'center', color: theme.textFaint, fontSize: 13 }}>No trades in this date range.</div>
        )}
      </div>

      {/* Trading calendar */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginBottom: 12 }}>Trading Calendar</div>
        <CryptoTradingCalendar trades={inRange} fmt={fmt} theme={theme} initialMonth={endD ? new Date(endD + 'T00:00') : new Date()} />
      </div>
    </div>
  );
}

function CryptoTradingCalendar({ trades, fmt, theme, initialMonth }) {
  const [month, setMonth] = useState(initialMonth || new Date());
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);

  const dayTrades = (day) => {
    if (!day) return [];
    const ds = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return trades.filter(t => (t.ts || '').slice(0, 10) === ds);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="flex items-center justify-between">
        <h3 style={{ fontSize: 15, fontWeight: 600, color: theme.text }}>{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h3>
        <div className="flex gap-2">
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1))} style={{ padding: 8, borderRadius: 8, background: theme.hoverBg, border: 'none', cursor: 'pointer' }}><ChevronLeft size={18} style={{ color: theme.textMuted }} /></button>
          <button onClick={() => setMonth(new Date())} style={{ padding: '8px 14px', fontSize: 13, color: theme.textMuted, background: theme.hoverBg, border: 'none', borderRadius: 8, cursor: 'pointer' }}>Today</button>
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1))} style={{ padding: 8, borderRadius: 8, background: theme.hoverBg, border: 'none', cursor: 'pointer' }}><ChevronRight size={18} style={{ color: theme.textMuted }} /></button>
        </div>
      </div>
      <div className="card-lg" style={{ overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d} className="table-header" style={{ textAlign: 'center', padding: 10 }}>{d}</div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {cells.map((day, i) => {
            const dt = dayTrades(day);
            const net = dt.reduce((sum, t) => sum + (t.pnl || 0) - Math.abs(t.fee || 0), 0);
            const has = dt.length > 0;
            const bg = has ? (net >= 0 ? 'linear-gradient(135deg, rgba(34,211,165,0.06), rgba(34,211,165,0.2))' : 'linear-gradient(135deg, rgba(244,85,122,0.06), rgba(244,85,122,0.2))') : (!day ? (theme.dark ? '#0a0a0a' : '#f8fafc') : 'transparent');
            return (
              <div key={i} style={{ minHeight: 82, padding: 8, borderBottom: `1px solid ${theme.cardBorder}`, borderRight: `1px solid ${theme.cardBorder}`, background: bg, borderLeft: has ? `3px solid ${net >= 0 ? theme.pos : theme.neg}` : undefined }}>
                {day && <><div style={{ fontSize: 12, color: has ? (net >= 0 ? theme.pos : theme.neg) : theme.textMuted, fontWeight: has ? 600 : 400 }}>{day}</div>{has && <div style={{ marginTop: 5 }}><div style={{ fontSize: 12, fontWeight: 600, color: net >= 0 ? theme.pos : theme.neg }}>{net >= 0 ? '+' : ''}{fmt(net)}</div><div style={{ fontSize: 10, color: theme.textFaint }}>{dt.length} trade{dt.length > 1 ? 's' : ''}</div></div>}</>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
