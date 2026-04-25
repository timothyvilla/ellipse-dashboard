import React, { useState, useEffect, createContext, useContext, useRef } from 'react';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell } from 'recharts';
import { Plus, TrendingUp, TrendingDown, ChevronDown, Calendar, BarChart3, BookOpen, Wallet, CheckCircle, Clock, X, Eye, Database, ChevronLeft, ChevronRight, Trash2, Edit3, Moon, Sun, Settings, Link, Image, ExternalLink, Loader2, CloudOff, Cloud, LayoutGrid, LayoutList, Upload, FileText, AlertCircle, Shield, Target, AlertTriangle, Zap, Trophy, Flag, Activity } from 'lucide-react';
import { supabase, queryWithRetry, sanitizeForInsert, onConnectionChange } from './lib/supabaseClient';
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
  checkFileSize,
  truncate,
  escapeHtml,
  generateSecureId,
  RateLimiter,
  secureLocalStorageSet,
  secureLocalStorageGet,
  IMPORT_LIMITS,
} from './lib/security';

const ThemeContext = createContext();
const useTheme = () => useContext(ThemeContext);

// Rate limiter for API calls (10 requests per minute)
const apiRateLimiter = new RateLimiter(10, 60000);

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


// Parse MT5 HTML statement - SECURED
const parseMT5Statement = (html) => {
  const trades = [];
  const parser = new DOMParser();
  // SECURITY: Sanitize HTML before parsing
  const sanitizedHtml = sanitizeImportedHtml(html);
  const doc = parser.parseFromString(sanitizedHtml, 'text/html');
  const tables = doc.querySelectorAll('table');
  
  let tradeCount = 0;
  const maxTrades = IMPORT_LIMITS.MAX_TRADES;
  
  for (const table of tables) {
    if (tradeCount >= maxTrades) break;
    
    const rows = table.querySelectorAll('tr');
    let headers = [];
    
    for (const row of rows) {
      if (tradeCount >= maxTrades) break;
      
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
        
        const symbol = getValue(['symbol']).slice(0, 20); // Limit length
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
        // SECURITY: Validate reasonable values
        if (volume > 1000 || Math.abs(profit) > 10000000) continue;
        
        let date = new Date().toISOString().split('T')[0];
        let time = '00:00';
        if (timeStr) {
          const dateMatch = timeStr.match(/(\d{4}[.\-/]\d{2}[.\-/]\d{2})/);
          const timeMatch = timeStr.match(/(\d{2}:\d{2})/);
          if (dateMatch) date = dateMatch[1].replace(/[./]/g, '-');
          if (timeMatch) time = timeMatch[1];
        }
        
        trades.push({
          date, time, symbol: symbol.replace(/[^A-Z0-9.]/gi, '').toUpperCase(),
          side: type.includes('buy') ? 'Long' : 'Short',
          entry: openPrice || closePrice, exit: closePrice || openPrice,
          lots: volume, pnl: profit, commission, swap,
          stopLoss: 0, takeProfit: 0, marketStructure: '', candleType: '',
          liquidityTaken: [], liquidityTarget: [],
          notes: 'Imported from MT5', chartLink: '', chartImage: ''
        });
        tradeCount++;
      }
    }
  }
  return trades;
};

// Parse cTrader HTML statement - SECURED
const parseCTraderStatement = (html) => {
  const trades = [];
  const phaseSplits = [];
  const parser = new DOMParser();
  // SECURITY: Sanitize HTML before parsing
  const sanitizedHtml = sanitizeImportedHtml(html);
  const doc = parser.parseFromString(sanitizedHtml, 'text/html');
  
  const parseNum = (text) => {
    if (!text) return 0;
    const cleaned = text.replace(/\u00a0/g, '').replace(/(\d)\s+(\d)/g, '$1$2').replace(/[^\d.\-]/g, '');
    const num = parseFloat(cleaned) || 0;
    // SECURITY: Validate reasonable range
    if (Math.abs(num) > 100000000) return 0;
    return num;
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
  let tradeCount = 0;
  const maxTrades = IMPORT_LIMITS.MAX_TRADES;
  
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
      const txnNote = getText(txnColumnMap.note).toUpperCase().slice(0, 200); // Limit length
      const txnTime = getText(txnColumnMap.time);
      
      if ((txnType === 'withdraw' || txnType === 'withdrawal') && 
          (txnNote.includes('PHASE') || txnNote.includes('FUNDED') || txnNote.includes('VERIFICATION') || 
           txnNote.includes('EVALUATION') || txnNote.includes('INITIAL BALANCE'))) {
        const { date, time } = parseDate(txnTime);
        const phaseName = txnNote.includes('PHASE3') ? 'Phase 3' :
                          txnNote.includes('PHASE2') ? 'Phase 2' :
                          txnNote.includes('FUNDED') ? 'Funded' :
                          txnNote.includes('VERIFICATION') ? 'Verification' : 'Next Phase';
        phaseSplits.push({ splitDate: date, splitTime: time, phaseName, note: txnNote.slice(0, 100) });
      }
    }
  }
  
  // ---- PASS 2: Parse History table for trades ----
  for (const table of tables) {
    if (tradeCount >= maxTrades) break;
    
    const rows = table.querySelectorAll('tr');
    let isHistoryTable = false;
    let columnMap = {};
    
    for (const row of rows) {
      if (tradeCount >= maxTrades) break;
      
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
      const symbol = getText(columnMap.symbol).slice(0, 20);
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
      if (lots === 0 || lots > 1000) continue;
      
      const { date, time } = parseDate(closeTimeText || openTimeText);
      
      let phase = 'Phase 1';
      for (const split of phaseSplits) {
        if (date > split.splitDate || (date === split.splitDate && time >= split.splitTime)) {
          phase = split.phaseName;
        }
      }
      
      trades.push({
        date, time, symbol: symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase(),
        side: directionText.includes('buy') ? 'Long' : 'Short',
        entry: entryPrice, exit: closePrice, lots, pnl: netPnl, commission, swap,
        stopLoss: 0, takeProfit: 0, marketStructure: '', candleType: '',
        liquidityTaken: [], liquidityTarget: [],
        notes: 'Imported from cTrader', chartLink: '', chartImage: '',
        _phase: phase
      });
      tradeCount++;
    }
  }
  
  return { trades, phaseSplits };
};

// Parse CSV file - SECURED
const parseCSV = (csv, platform) => {
  const trades = [];
  const lines = csv.split('\n').filter(l => l.trim());
  if (lines.length < 2) return trades;
  
  // SECURITY: Limit columns to prevent abuse
  const headerLine = lines[0];
  const headers = headerLine.split(',').slice(0, IMPORT_LIMITS.MAX_COLUMNS).map(h => h.trim().toLowerCase().replace(/"/g, ''));
  
  const maxTrades = IMPORT_LIMITS.MAX_TRADES;
  
  for (let i = 1; i < lines.length && trades.length < maxTrades; i++) {
    const values = lines[i].split(',').slice(0, IMPORT_LIMITS.MAX_COLUMNS).map(v => v.trim().replace(/"/g, ''));
    // SECURITY: Use safe CSV row parsing
    const row = safeCsvRow(headers, values);
    
    const symbol = (row.symbol || row.instrument || row.pair || '').slice(0, 20);
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
    
    if (!symbol || volume === 0 || volume > 1000) continue;
    if (!type.includes('buy') && !type.includes('sell') && !type.includes('long') && !type.includes('short')) continue;
    if (Math.abs(profit) > 10000000) continue; // Sanity check
    
    trades.push({
      date, time, symbol: symbol.replace(/[^A-Z0-9.]/gi, '').toUpperCase(),
      side: type.includes('buy') || type.includes('long') ? 'Long' : 'Short',
      entry, exit: exit || entry, lots: volume, pnl: profit, commission, swap,
      stopLoss: 0, takeProfit: 0, marketStructure: '', candleType: '',
      liquidityTaken: [], liquidityTarget: [],
      notes: `Imported from ${escapeHtml(platform)}`, chartLink: '', chartImage: ''
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
  'XAUUSD': { pipSize: 0.01, lotSize: 100, base: 'XAU', quote: 'USD' },
  'XAGUSD': { pipSize: 0.001, lotSize: 5000, base: 'XAG', quote: 'USD' },
  'US30':   { pipSize: 1, lotSize: 1, pointValue: 1, quote: 'USD' },
  'NAS100': { pipSize: 1, lotSize: 1, pointValue: 1, quote: 'USD' },
  'SPX500': { pipSize: 0.1, lotSize: 1, pointValue: 10, quote: 'USD' },
  'DEFAULT': { pipSize: 0.0001, lotSize: 100000, base: 'USD', quote: 'USD' }
};

// Exchange rates cache with TTL
let _exchangeRates = { USD: 1 };
let _ratesLoaded = false;
let _ratesLastFetched = 0;
const RATES_TTL = 4 * 60 * 60 * 1000; // 4 hours

const fetchExchangeRates = async () => {
  // Check cache
  const now = Date.now();
  if (_ratesLoaded && (now - _ratesLastFetched) < RATES_TTL) {
    return;
  }
  
  // Check rate limit
  if (!apiRateLimiter.canMakeRequest()) {
    console.warn('Exchange rate fetch rate limited');
    return;
  }
  
  try {
    apiRateLimiter.recordRequest();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    const data = await res.json();
    // SECURITY: Validate response before using
    if (validateExchangeRates(data)) {
      _exchangeRates = data.rates;
      _ratesLoaded = true;
      _ratesLastFetched = now;
      // Cache in localStorage
      secureLocalStorageSet('ellipse_exchange_rates', {
        rates: data.rates,
        timestamp: now
      });
    }
  } catch (err) {
    console.warn('Failed to fetch exchange rates, trying cache:', err.message);
    // Try to load from cache
    const cached = secureLocalStorageGet('ellipse_exchange_rates');
    if (cached && cached.rates) {
      _exchangeRates = cached.rates;
      _ratesLoaded = true;
    }
  }
};

const getUSDRate = (currency) => {
  if (currency === 'USD') return 1;
  if (!_exchangeRates[currency]) return null;
  return 1 / _exchangeRates[currency];
};

const calculateTradePnL = (symbol, side, entry, exit, lots) => {
  const sym = symbol.toUpperCase();
  const config = SYMBOL_CONFIG[sym] || SYMBOL_CONFIG['DEFAULT'];
  const entryF = parseFloat(entry), exitF = parseFloat(exit), lotsF = parseFloat(lots);
  if (isNaN(entryF) || isNaN(exitF) || isNaN(lotsF)) return 0;
  if (lotsF > 1000 || entryF > 1000000 || exitF > 1000000) return 0; // Sanity check
  
  const diff = side === 'Long' ? exitF - entryF : entryF - exitF;
  
  if (config.pointValue) {
    return diff * config.pointValue * lotsF;
  }
  
  const profitInQuote = diff * config.lotSize * lotsF;
  
  if (config.quote === 'USD') {
    return profitInQuote;
  } else {
    const quoteToUSD = getUSDRate(config.quote);
    if (quoteToUSD !== null) {
      return profitInQuote * quoteToUSD;
    }
    if (config.quote === 'JPY') {
      const usdjpyApprox = _exchangeRates['JPY'] || 150;
      return profitInQuote / usdjpyApprox;
    }
    return profitInQuote * 0.75;
  }
};

const calculatePipValue = (symbol, exitPrice) => {
  const config = SYMBOL_CONFIG[symbol.toUpperCase()] || SYMBOL_CONFIG['DEFAULT'];
  if (config.pointValue) return config.pointValue;
  
  const pipValueInQuote = config.pipSize * config.lotSize;
  
  if (config.quote === 'USD') return pipValueInQuote;
  
  const quoteToUSD = getUSDRate(config.quote);
  if (quoteToUSD !== null) return pipValueInQuote * quoteToUSD;
  
  if (config.quote === 'JPY') {
    const rate = parseFloat(exitPrice) || _exchangeRates['JPY'] || 150;
    return pipValueInQuote / rate;
  }
  
  return pipValueInQuote * 0.75;
};

// SECURITY: Safe localStorage access with fallback
const loadDarkMode = () => {
  try {
    return localStorage.getItem('ellipse_darkMode') === 'true';
  } catch {
    return false;
  }
};

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
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [journalEntries, setJournalEntries] = useState([]);
  const [validationErrors, setValidationErrors] = useState([]);

  // Connection monitoring
  useEffect(() => {
    const unsubscribe = onConnectionChange(setIsOnline);
    return unsubscribe;
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('ellipse_darkMode', darkMode);
    } catch (err) {
      console.warn('Failed to save dark mode preference');
    }
  }, [darkMode]);

  useEffect(() => { fetchExchangeRates(); }, []);

  // Load data from Supabase with retry logic
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [tradesRes, accountsRes] = await Promise.all([
          queryWithRetry(() => supabase.from('trades').select('*').order('date', { ascending: false }).limit(10000)),
          queryWithRetry(() => supabase.from('accounts').select('*').order('created_at', { ascending: true }).limit(100))
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

        // Load challenges
        try {
          const challengesRes = await queryWithRetry(() => 
            supabase.from('challenges').select('*').order('created_at', { ascending: false }).limit(100)
          );
          if (challengesRes.data) {
            setChallenges(challengesRes.data.map(c => ({
              id: c.id,
              name: c.name || 'Untitled Challenge',
              propFirm: c.prop_firm || 'Custom',
              accountSize: parseFloat(c.account_size) || 100000,
              currentPhase: c.current_phase || 0,
              phases: (Array.isArray(c.phases) ? c.phases : []).length > 0 ? c.phases : [{ name: 'Phase 1', profitTarget: 10, maxDailyDrawdown: 5, maxTotalDrawdown: 10, minTradingDays: 1, maxTradingDays: 30, drawdownType: 'balance' }],
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
          console.warn('Challenges table not available, using localStorage');
          const localChallenges = secureLocalStorageGet('ellipse_challenges', []);
          setChallenges(localChallenges);
        }

        // Load journal entries
        try {
          const journalRes = await queryWithRetry(() =>
            supabase.from('journal_entries').select('*').order('date', { ascending: false }).limit(1000)
          );
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
          console.warn('Journal entries table not available, using localStorage');
          const localEntries = secureLocalStorageGet('ellipse_journal_entries', []);
          setJournalEntries(localEntries);
        }
        
        setSynced(true);
      } catch (err) {
        console.error('Error loading data:', err);
        setSynced(false);
      }
      setLoading(false);
    };
    loadData();
  }, []);

  // Save challenges to localStorage as fallback
  useEffect(() => {
    if (challenges.length > 0) {
      secureLocalStorageSet('ellipse_challenges', challenges);
    }
  }, [challenges]);

  // Save journal entries to localStorage as fallback
  useEffect(() => {
    if (journalEntries.length > 0) {
      secureLocalStorageSet('ellipse_journal_entries', journalEntries);
    }
  }, [journalEntries]);

  // Clear validation errors after 5 seconds
  useEffect(() => {
    if (validationErrors.length > 0) {
      const timer = setTimeout(() => setValidationErrors([]), 5000);
      return () => clearTimeout(timer);
    }
  }, [validationErrors]);

  // Journal entry CRUD with validation
  const addJournalEntry = async (entry) => {
    // SECURITY: Validate before saving
    const errors = validateJournalEntry(entry);
    if (errors.length > 0) {
      setValidationErrors(errors);
      return false;
    }

    try {
      const dbEntry = sanitizeForInsert({
        date: entry.date, instrument: entry.instrument, timeframe: entry.timeframe,
        bias: entry.bias, idea: entry.idea, key_levels: entry.keyLevels,
        confluences: entry.confluences, notes: entry.notes, chart_image: sanitizeImageUrl(entry.chartImage) || ''
      });
      const { data, error } = await supabase.from('journal_entries').insert(dbEntry).select().single();
      if (!error && data) {
        setJournalEntries(prev => [{ ...entry, id: data.id, createdAt: data.created_at }, ...prev]);
        return true;
      }
    } catch {}
    // Fallback to local
    const id = generateSecureId('je_');
    setJournalEntries(prev => [{ ...entry, id, createdAt: new Date().toISOString() }, ...prev]);
    return true;
  };

  const updateJournalEntry = async (entry) => {
    const errors = validateJournalEntry(entry);
    if (errors.length > 0) {
      setValidationErrors(errors);
      return false;
    }

    try {
      const { error } = await supabase.from('journal_entries').update(sanitizeForInsert({
        date: entry.date, instrument: entry.instrument, timeframe: entry.timeframe,
        bias: entry.bias, idea: entry.idea, key_levels: entry.keyLevels,
        confluences: entry.confluences, notes: entry.notes, chart_image: sanitizeImageUrl(entry.chartImage) || ''
      })).eq('id', entry.id);
      if (error) throw error;
    } catch {}
    setJournalEntries(prev => prev.map(e => e.id === entry.id ? { ...entry, updatedAt: new Date().toISOString() } : e));
    return true;
  };

  const deleteJournalEntry = async (id) => {
    try {
      await supabase.from('journal_entries').delete().eq('id', id);
    } catch {}
    setJournalEntries(prev => prev.filter(e => e.id !== id));
  };

  // Trade CRUD with validation
  const addTrade = async (trade) => {
    // SECURITY: Validate before saving
    const errors = validateTrade(trade);
    if (errors.length > 0) {
      setValidationErrors(errors);
      return false;
    }

    const dbTrade = sanitizeForInsert({
      date: trade.date, time: trade.time, symbol: trade.symbol, side: trade.side,
      entry: trade.entry, exit_price: trade.exit, lots: trade.lots,
      stop_loss: trade.stopLoss, take_profit: trade.takeProfit,
      pnl: trade.pnl, commission: trade.commission, swap: trade.swap,
      risk_reward: trade.riskReward, market_structure: trade.marketStructure,
      candle_type: trade.candleType, liquidity_taken: trade.liquidityTaken,
      liquidity_target: trade.liquidityTarget, notes: trade.notes,
      account: trade.account, 
      chart_link: getTradingViewImageUrl(trade.chartLink) ? trade.chartLink : '',
      chart_image: sanitizeImageUrl(trade.chartImage) || ''
    });
    
    const { data, error } = await supabase.from('trades').insert(dbTrade).select().single();
    if (error) {
      console.error('Error adding trade:', error);
      setValidationErrors(['Failed to save trade. Please try again.']);
      return false;
    }
    setTrades(prev => [{ ...trade, id: data.id }, ...prev]);
    return true;
  };

  const importTrades = async (newTrades, accountName) => {
    // SECURITY: Check import size
    const sizeError = checkImportSize(newTrades);
    if (sizeError) {
      setValidationErrors([sizeError]);
      return 0;
    }

    const dbTrades = newTrades.map(trade => sanitizeForInsert({
      date: trade.date, time: trade.time, symbol: trade.symbol, side: trade.side,
      entry: trade.entry, exit_price: trade.exit, lots: trade.lots,
      stop_loss: trade.stopLoss, take_profit: trade.takeProfit, pnl: trade.pnl,
      commission: trade.commission, swap: trade.swap, risk_reward: '-',
      market_structure: trade.marketStructure, candle_type: trade.candleType,
      liquidity_taken: trade.liquidityTaken, liquidity_target: trade.liquidityTarget,
      notes: trade.notes, account: accountName,
      chart_link: '', chart_image: ''
    }));
    
    const { data, error } = await supabase.from('trades').insert(dbTrades).select();
    if (error) {
      console.error('Error importing trades:', error);
      setValidationErrors(['Failed to import trades. Please try again.']);
      return 0;
    }
    const importedTrades = data.map((t, i) => ({ ...newTrades[i], id: t.id, account: accountName }));
    setTrades(prev => [...importedTrades, ...prev].sort((a, b) => new Date(b.date) - new Date(a.date)));
    return data.length;
  };

  const deleteTrade = async (id) => {
    const { error } = await supabase.from('trades').delete().eq('id', id);
    if (error) {
      console.error('Error deleting trade:', error);
      return;
    }
    setTrades(prev => prev.filter(t => t.id !== id));
  };

  const updateTrade = async (trade) => {
    const errors = validateTrade(trade);
    if (errors.length > 0) {
      setValidationErrors(errors);
      return false;
    }

    const dbTrade = sanitizeForInsert({
      date: trade.date, time: trade.time, symbol: trade.symbol, side: trade.side,
      entry: trade.entry, exit_price: trade.exit, lots: trade.lots,
      stop_loss: trade.stopLoss, take_profit: trade.takeProfit, pnl: trade.pnl,
      commission: trade.commission, swap: trade.swap, risk_reward: trade.riskReward,
      market_structure: trade.marketStructure, candle_type: trade.candleType,
      liquidity_taken: trade.liquidityTaken, liquidity_target: trade.liquidityTarget,
      notes: trade.notes, account: trade.account,
      chart_link: getTradingViewImageUrl(trade.chartLink) ? trade.chartLink : '',
      chart_image: sanitizeImageUrl(trade.chartImage) || ''
    });
    
    const { error } = await supabase.from('trades').update(dbTrade).eq('id', trade.id);
    if (error) {
      console.error('Error updating trade:', error);
      setValidationErrors(['Failed to update trade. Please try again.']);
      return false;
    }
    setTrades(prev => prev.map(t => t.id === trade.id ? trade : t));
    return true;
  };

  const addAccount = async (account) => {
    const errors = validateAccount(account);
    if (errors.length > 0) {
      setValidationErrors(errors);
      return false;
    }

    const { data, error } = await supabase.from('accounts').insert(sanitizeForInsert({
      name: account.name, platform: account.platform, broker: account.broker,
      server: account.server, balance: account.balance, equity: account.equity, connected: account.connected
    })).select().single();
    if (error) {
      console.error('Error adding account:', error);
      setValidationErrors(['Failed to add account. Please try again.']);
      return false;
    }
    setAccounts(prev => [...prev, { ...account, id: data.id }]);
    return true;
  };

  const updateAccount = async (account) => {
    const errors = validateAccount(account);
    if (errors.length > 0) {
      setValidationErrors(errors);
      return false;
    }

    const { error } = await supabase.from('accounts').update(sanitizeForInsert({
      name: account.name, balance: account.balance, equity: account.equity
    })).eq('id', account.id);
    if (error) {
      console.error('Error updating account:', error);
      return false;
    }
    setAccounts(prev => prev.map(a => a.id === account.id ? account : a));
    return true;
  };

  const deleteAccount = async (id) => {
    const { error } = await supabase.from('accounts').delete().eq('id', id);
    if (error) {
      console.error('Error deleting account:', error);
      return;
    }
    setAccounts(prev => prev.filter(a => a.id !== id));
  };

  // Challenge CRUD with validation
  const addChallenge = async (challenge) => {
    const errors = validateChallenge(challenge);
    if (errors.length > 0) {
      setValidationErrors(errors);
      return false;
    }

    try {
      const dbChallenge = sanitizeForInsert({
        name: challenge.name, prop_firm: challenge.propFirm,
        account_size: challenge.accountSize, current_phase: challenge.currentPhase,
        phases: challenge.phases, account: challenge.account,
        start_date: challenge.startDate, status: challenge.status,
        profit_split: challenge.profitSplit, drawdown_type: challenge.drawdownType,
        consistency_rule: challenge.consistencyRule, notes: challenge.notes
      });
      const { data, error } = await supabase.from('challenges').insert(dbChallenge).select().single();
      if (!error && data) {
        setChallenges(prev => [{ ...challenge, id: data.id }, ...prev]);
        return true;
      }
    } catch {}
    // Fallback to local
    const id = generateSecureId('local_');
    setChallenges(prev => [{ ...challenge, id }, ...prev]);
    return true;
  };

  const updateChallenge = async (challenge) => {
    try {
      const { error } = await supabase.from('challenges').update(sanitizeForInsert({
        name: challenge.name, current_phase: challenge.currentPhase,
        status: challenge.status, phases: challenge.phases, notes: challenge.notes
      })).eq('id', challenge.id);
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
          .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
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
          .error-toast { position: fixed; bottom: 20px; right: 20px; background: #ef4444; color: white; padding: 12px 20px; border-radius: 10px; z-index: 1000; max-width: 400px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
        `}</style>

        {/* Validation Error Toast */}
        {validationErrors.length > 0 && (
          <div className="error-toast">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle size={18} />
              <strong>Validation Error</strong>
            </div>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
              {validationErrors.map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          </div>
        )}

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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', marginBottom: 8, fontSize: 12, color: synced && isOnline ? '#10b981' : '#ef4444' }}>
                {loading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : synced && isOnline ? <Cloud size={14} /> : <CloudOff size={14} />}
                {loading ? 'Syncing...' : synced && isOnline ? 'Synced to cloud' : isOnline ? 'Sync error' : 'Offline'}
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

        {showNewTrade && <NewTradeModal onClose={() => setShowNewTrade(false)} onSave={async (trade) => { const success = await addTrade(trade); if (success) setShowNewTrade(false); }} accounts={accounts} />}
        {showNewAccount && <NewAccountModal onClose={() => setShowNewAccount(false)} onSave={async (acc) => { const success = await addAccount(acc); if (success) setShowNewAccount(false); }} />}
        {showImport && <ImportModal onClose={() => setShowImport(false)} onImport={importTrades} accounts={accounts} />}
        {showNewChallenge && <NewChallengeModal onClose={() => setShowNewChallenge(false)} onSave={async (ch) => { const success = await addChallenge(ch); if (success) setShowNewChallenge(false); }} accounts={accounts} />}
        {selectedTrade && <TradeDetailModal trade={selectedTrade} onClose={() => setSelectedTrade(null)} onDelete={(id) => { deleteTrade(id); setSelectedTrade(null); }} onEdit={(trade) => { setSelectedTrade(null); setEditingTrade(trade); }} />}
        {editingTrade && <EditTradeModal trade={editingTrade} onClose={() => setEditingTrade(null)} onSave={async (trade) => { const success = await updateTrade(trade); if (success) setEditingTrade(null); }} accounts={accounts} />}
      </div>
    </ThemeContext.Provider>
  );
}

// ==================== PLACEHOLDER COMPONENTS ====================
// Note: The following components are placeholders. In a full implementation,
// these would be imported from separate files or the full component code
// would be included here. For brevity, we show the structure.

function ChallengesView({ challenges, trades, accounts, onUpdate, onDelete }) {
  const theme = useTheme();
  return <div style={{ color: theme.text }}>Challenges View - Full implementation in original file</div>;
}

function DashboardView({ trades, accounts, challenges, selectedAccount, setSelectedAccount }) {
  const theme = useTheme();
  return <div style={{ color: theme.text }}>Dashboard View - Full implementation in original file</div>;
}

function JournalIdeasView({ entries, onAdd, onUpdate, onDelete }) {
  const theme = useTheme();
  return <div style={{ color: theme.text }}>Journal Ideas View - Full implementation in original file</div>;
}

function NewsCalendarView() {
  const theme = useTheme();
  return <div style={{ color: theme.text }}>News Calendar View - Full implementation in original file</div>;
}

function JournalView({ trades, accounts, filterAccount, setFilterAccount, onSelectTrade, onDeleteTrades }) {
  const theme = useTheme();
  return <div style={{ color: theme.text }}>Journal View - Full implementation in original file</div>;
}

function AccountsView({ accounts, challenges, trades, onUpdate, onDelete }) {
  const theme = useTheme();
  return <div style={{ color: theme.text }}>Accounts View - Full implementation in original file</div>;
}

function CalendarView({ trades }) {
  const theme = useTheme();
  return <div style={{ color: theme.text }}>Calendar View - Full implementation in original file</div>;
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
  return <Modal onClose={onClose}><div style={{ padding: 20, color: theme.text }}>New Trade Modal - Full implementation in original file</div></Modal>;
}

function EditTradeModal({ trade, onClose, onSave, accounts }) {
  const theme = useTheme();
  return <Modal onClose={onClose}><div style={{ padding: 20, color: theme.text }}>Edit Trade Modal - Full implementation in original file</div></Modal>;
}

function NewAccountModal({ onClose, onSave }) {
  const theme = useTheme();
  return <Modal onClose={onClose}><div style={{ padding: 20, color: theme.text }}>New Account Modal - Full implementation in original file</div></Modal>;
}

function ImportModal({ onClose, onImport, accounts }) {
  const theme = useTheme();
  return <Modal onClose={onClose}><div style={{ padding: 20, color: theme.text }}>Import Modal - Full implementation in original file</div></Modal>;
}

function NewChallengeModal({ onClose, onSave, accounts }) {
  const theme = useTheme();
  return <Modal onClose={onClose}><div style={{ padding: 20, color: theme.text }}>New Challenge Modal - Full implementation in original file</div></Modal>;
}

function TradeDetailModal({ trade, onClose, onDelete, onEdit }) {
  const theme = useTheme();
  return <Modal onClose={onClose}><div style={{ padding: 20, color: theme.text }}>Trade Detail Modal - Full implementation in original file</div></Modal>;
}
