import React, { useEffect, useMemo, useRef, useState } from 'react';
import './style.css';
import { PRICES, TXS, MARKET, type Tx } from './data';

// Snapshot constants from the user's "My life tối giản" sheet, tab "BTC (mẫu mới)", 20/09/2026.
const AVG_COST = 95380;
const COST_BASIS = 6016.59;
const REALIZED = -100.64;
const VND_RATE = 26022;
const DATA_DATE = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(MARKET.updatedAt));

const HELD = TXS.reduce((sum, tx) => sum + tx.btc, 0);
let PRICE_NOW = MARKET.currentPrice;
let CHANGE_24H = MARKET.change24h;
let VALUE_NOW = HELD * PRICE_NOW;
let UNREALIZED = VALUE_NOW - COST_BASIS;
let UNREALIZED_PCT = (UNREALIZED / COST_BASIS) * 100;
const BUYS = TXS.filter((tx) => tx.type === 'Mua').length;
const SELLS = TXS.length - BUYS;

const usd = (value: number, digits = 2) =>
  `${value < 0 ? '-' : ''}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const usd0 = (value: number) => `$${Math.round(value).toLocaleString('en-US')}`;
const vnd = (value: number) => `${Math.round(value).toLocaleString('vi-VN')} ₫`;
const vndShort = (value: number) => {
  if (Math.abs(value) >= 1e9) return `${(value / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`;
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} triệu`;
  return vnd(value);
};
const btcFmt = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 8, maximumFractionDigits: 8 });
const pct = (value: number) => `${value > 0 ? '+' : ''}${value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`;
const dateVi = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const tsDateVi = (ts: number) => dateVi(new Date(ts * 1000).toISOString().slice(0, 10));
type Currency = 'USD' | 'VND';
const money = (valueUsd: number, currency: Currency, digits = 2) => currency === 'USD' ? usd(valueUsd, digits) : vnd(valueUsd * VND_RATE);
const money0 = (valueUsd: number, currency: Currency) => currency === 'USD' ? usd0(valueUsd) : vnd(valueUsd * VND_RATE);
const axisMoney = (valueUsd: number, currency: Currency) => currency === 'USD' ? usd0(valueUsd) : vndShort(valueUsd * VND_RATE);
const chartLabelWidth = (...lines: string[]) => {
  if (typeof document === 'undefined') return Math.max(...lines.map((line) => line.length * 6.2)) + 14;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return Math.max(...lines.map((line) => line.length * 6.2)) + 14;
  context.font = '700 10.5px Inter, ui-sans-serif, system-ui, sans-serif';
  return Math.ceil(Math.max(...lines.map((line) => context.measureText(line).width))) + 14;
};

function MoneyPair({ valueUsd, currency, mainClass = '', subClass = '', usdDigits = 2, prefix = '' }: { valueUsd: number; currency: Currency; mainClass?: string; subClass?: string; usdDigits?: number; prefix?: string }) {
  const main = currency === 'USD' ? usd(valueUsd, usdDigits) : vnd(valueUsd * VND_RATE);
  const sub = currency === 'USD' ? vnd(valueUsd * VND_RATE) : usd(valueUsd, usdDigits);
  return <><span className={mainClass}>{prefix}{main}</span><span className={subClass}>≈ {sub}</span></>;
}

// Rolls each digit of a freshly rendered value up to its final number, odometer-style, on first mount.
function RollingPrice({ text }: { text: string }) {
  const [rolled, setRolled] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setRolled(true)));
    return () => cancelAnimationFrame(frame);
  }, []);
  return <span className="rolling" aria-label={text}><span aria-hidden="true" className="rolling-inner">{text.split('').map((ch, index) => {
    if (!/\d/.test(ch)) return <span key={index} className="roll-static">{ch}</span>;
    const digit = Number(ch);
    return <span key={index} className="roll"><span className="roll-strip" style={{ transform: rolled ? `translateY(${-(10 + digit)}em)` : 'translateY(0)', transitionDelay: rolled ? `${index * 90}ms` : '0ms' }}>{Array.from({ length: 20 }, (_, k) => <span key={k} className="roll-digit">{k % 10}</span>)}</span></span>;
  })}</span></span>;
}

interface TxOutcome { total: number; pnl: number; pnlPct: number; totalLabel: string; realized: boolean }

// Realized results are copied from the source sheet's transaction-basis columns.
// Keyed by sell date because each recorded sell date is unique in this snapshot.
const REALIZED_BY_DATE: Record<string, { pnl: number; pnlPct: number }> = {
  '2025-08-14': { pnl: 109.8184842, pnlPct: 28.54938164 },
  '2025-08-22': { pnl: 12.67596578, pnlPct: 17.57523123 },
  '2025-09-23': { pnl: 32.21689436, pnlPct: 16.7132057 },
  '2026-07-30': { pnl: -255.3519269, pnlPct: -33.36402971 },
};

const txOutcome = (transaction: Tx): TxOutcome => {
  if (transaction.type === 'Mua') {
    const principal = Math.abs(transaction.usd);
    const total = Math.abs(transaction.btc) * PRICE_NOW;
    const pnl = total - principal;
    return { total, pnl, pnlPct: principal ? (pnl / principal) * 100 : 0, totalLabel: 'Giá trị hiện tại', realized: false };
  }
  const realized = REALIZED_BY_DATE[transaction.date];
  return {
    total: Math.abs(transaction.usd),
    pnl: realized?.pnl ?? 0,
    pnlPct: realized?.pnlPct ?? 0,
    totalLabel: 'Tổng đã thu',
    realized: true,
  };
};

const QUOTES = [
  { text: 'Not your keys, not your coins.', vi: "Không giữ khóa riêng, không thật sự sở hữu bitcoin." },
  { text: 'Fix the money, fix the world.', vi: "Sửa đồng tiền, sửa cả thế giới." },
  { text: "If you don't believe me or don't get it, I don't have time to try to convince you, sorry.", author: 'Satoshi Nakamoto', vi: "Nếu bạn không tin hoặc chưa hiểu, tôi không có thời gian để thuyết phục bạn, xin lỗi." },
  { text: "The root problem with conventional currency is all the trust that's required to make it work.", author: 'Satoshi Nakamoto', vi: "Vấn đề gốc của tiền tệ thông thường là nó đòi hỏi quá nhiều niềm tin để vận hành." },
  { text: "Lost coins only make everyone else's coins worth slightly more. Think of it as a donation to everyone.", author: 'Satoshi Nakamoto', vi: "Đồng coin bị mất khiến coin của người khác có giá trị hơn đôi chút. Hãy xem đó là một khoản tặng cho mọi người." },
  { text: 'It might make sense just to get some in case it catches on.', author: 'Satoshi Nakamoto', vi: "Có lẽ nên có một ít, phòng khi nó trở nên phổ biến." },
  { text: 'History shows it is not possible to insulate yourself from the consequences of others holding money that is harder than yours.', author: 'The Bitcoin Standard', vi: "Lịch sử cho thấy bạn không thể tránh hậu quả khi người khác nắm giữ đồng tiền khó tạo ra hơn đồng tiền của bạn." },
  { text: 'Bitcoin is a bank in cyberspace, run by incorruptible software.', author: 'Michael Saylor', vi: "Bitcoin là một ngân hàng trên không gian mạng, vận hành bằng phần mềm không thể bị mua chuộc." },
  { text: 'Bitcoin is the internet of money.', author: 'Andreas Antonopoulos', vi: "Bitcoin là internet của tiền tệ." },
  { text: 'Chancellor on brink of second bailout for banks.', author: 'Bitcoin genesis block', vi: "Bộ trưởng Tài chính đứng trước gói cứu trợ thứ hai dành cho các ngân hàng." },
];

const RANGES: { key: string; label: string; from?: number }[] = [
  { key: 'all', label: 'Tất cả' },
  ...[2022, 2023, 2024, 2025, 2026].map((year) => ({ key: String(year), label: String(year), from: Date.UTC(year, 0, 1) / 1000 })),
];

function useContainerWidth(ref: React.RefObject<HTMLDivElement | null>) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

interface Hover { x: number; y: number; price: number; ts: number }

function PriceChart({ rangeKey, currency }: { rangeKey: string; currency: Currency }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const width = useContainerWidth(wrapRef);
  const [hover, setHover] = useState<Hover | null>(null);
  const [selectedTx, setSelectedTx] = useState<{ t: Tx; x: number; y: number } | null>(null);

  useEffect(() => { setHover(null); setSelectedTx(null); }, [rangeKey]);

  const range = RANGES.find((item) => item.key === rangeKey) ?? RANGES[0];
  const fromTs = range.from ?? PRICES[0][0];
  const toTs = range.key === 'all' ? PRICES[PRICES.length - 1][0] : Math.min((range.from ?? 0) + 366 * 86400, PRICES[PRICES.length - 1][0]);
  const points = useMemo(() => PRICES.filter(([ts]) => ts >= fromTs && ts <= toTs), [fromTs, toTs]);
  const transactions = useMemo(() => TXS.filter((tx) => tx.ts >= fromTs && tx.ts <= toTs), [fromTs, toTs]);

  const height = width < 640 ? 300 : 400;
  const margin = { l: width < 420 ? 50 : 56, r: width < 420 ? 12 : 18, t: 28, b: 30 };
  const innerWidth = Math.max(width - margin.l - margin.r, 10);
  const innerHeight = height - margin.t - margin.b;
  const low = Math.min(...points.map((point) => point[1]), AVG_COST);
  const high = Math.max(...points.map((point) => point[1]), AVG_COST);
  const pad = (high - low) * 0.07 || 1;
  const yMin = low - pad;
  const yMax = high + pad;
  const t0 = points[0][0];
  const t1 = points[points.length - 1][0];
  const x = (ts: number) => margin.l + ((ts - t0) / Math.max(t1 - t0, 1)) * innerWidth;
  const y = (price: number) => margin.t + (1 - (price - yMin) / (yMax - yMin)) * innerHeight;

  const rawStep = (yMax - yMin) / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = Math.ceil(rawStep / magnitude) * magnitude;
  const yTicks: number[] = [];
  for (let value = Math.ceil(yMin / step) * step; value <= yMax; value += step) yTicks.push(value);

  const spanDays = (t1 - t0) / 86400;
  const xTicks: { ts: number; label: string }[] = [];
  if (spanDays > 400) {
    for (let year = new Date(t0 * 1000).getUTCFullYear(); year <= new Date(t1 * 1000).getUTCFullYear(); year++) {
      const ts = Date.UTC(year, 0, 1) / 1000;
      if (ts >= t0 && ts <= t1) xTicks.push({ ts, label: String(year) });
    }
  } else {
    const start = new Date(t0 * 1000);
    for (let month = start.getUTCMonth(); month < 12; month++) {
      const ts = Date.UTC(start.getUTCFullYear(), month, 1) / 1000;
      if (ts >= t0 && ts <= t1) xTicks.push({ ts, label: `T${month + 1}` });
    }
  }

  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point[0]).toFixed(1)} ${y(point[1]).toFixed(1)}`).join(' ');
  const pickNearest = (clientX: number, svg: SVGSVGElement) => {
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * width;
    const ts = t0 + ((px - margin.l) / innerWidth) * (t1 - t0);
    let best = points[0];
    for (const point of points) if (Math.abs(point[0] - ts) < Math.abs(best[0] - ts)) best = point;
    setSelectedTx(null);
    setHover({ x: x(best[0]), y: y(best[1]), price: best[1], ts: best[0] });
  };
  const selectTransaction = (transaction: Tx, cx: number, cy: number) => {
    setHover(null);
    setSelectedTx((current) => current?.t === transaction ? null : { t: transaction, x: cx, y: cy });
  };
  const last = points[points.length - 1];
  const avgLabelTwoLine = currency === 'VND';
  const avgValue = avgLabelTwoLine ? vndShort(AVG_COST * VND_RATE) : money0(AVG_COST, currency);
  const avgLabelLines = avgLabelTwoLine ? ['Trung bình giá', avgValue] : [`Trung bình giá ${avgValue}`];
  const avgLabelWidth = chartLabelWidth(...avgLabelLines);
  const avgLabelHeight = avgLabelTwoLine ? 32 : 20;
  const avgLabelX = margin.l;
  const avgLabelTextX = avgLabelX + 7;
  const avgLabelY = Math.max(y(AVG_COST) - (avgLabelTwoLine ? 33 : 23), 3);

  return (
    <div className="chart-wrap" ref={wrapRef}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`Biểu đồ giá Bitcoin, ${range.label}`}>
          {yTicks.map((value) => (
            <g key={value}>
              <line x1={margin.l} x2={width - margin.r} y1={y(value)} y2={y(value)} className="grid" />
              <text x={margin.l - 8} y={y(value) + 4} className="tick" textAnchor="end">{axisMoney(value, currency)}</text>
            </g>
          ))}
          {xTicks.map((tick) => <text key={tick.ts} x={x(tick.ts)} y={height - 8} className="tick" textAnchor="middle">{tick.label}</text>)}
          <line x1={margin.l} x2={width - margin.r} y1={y(AVG_COST)} y2={y(AVG_COST)} className="avgline" />
          <rect x={avgLabelX} y={avgLabelY} width={avgLabelWidth} height={avgLabelHeight} rx="5" className="avglabel-bg" />
          {avgLabelTwoLine ? (
            <>
              <text x={avgLabelTextX} y={avgLabelY + 12} className="avglabel" textAnchor="start">Trung bình giá</text>
              <text x={avgLabelTextX} y={avgLabelY + 25} className="avglabel" textAnchor="start">{avgValue}</text>
            </>
          ) : (
            <text x={avgLabelTextX} y={avgLabelY + 14} className="avglabel" textAnchor="start">Trung bình giá {avgValue}</text>
          )}
          <path d={path} className="priceline" />
          <rect x={margin.l} y={margin.t} width={innerWidth} height={innerHeight} fill="transparent"
            onMouseMove={(event) => pickNearest(event.clientX, event.currentTarget.ownerSVGElement as SVGSVGElement)}
            onMouseLeave={() => setHover(null)}
            onPointerDown={(event) => { if (event.pointerType === 'touch') pickNearest(event.clientX, event.currentTarget.ownerSVGElement as SVGSVGElement); }} />
          {hover && !selectedTx && <g><line x1={hover.x} x2={hover.x} y1={margin.t} y2={height - margin.b} className="crosshair" /><circle cx={hover.x} cy={hover.y} r={5} className="dot-hover" /></g>}
          {transactions.map((transaction, index) => {
            const cx = x(transaction.ts);
            const cy = y(transaction.price);
            const active = selectedTx?.t === transaction;
            const label = `${transaction.type} ${btcFmt(Math.abs(transaction.btc))} BTC ngày ${dateVi(transaction.date)}, giá ${money0(transaction.price, currency)}`;
            return <circle key={`${transaction.ts}-${transaction.type}-${index}`} cx={cx} cy={cy} r={width < 640 ? 5.5 : 7}
              className={`${transaction.type === 'Mua' ? 'dot-buy' : 'dot-sell'}${active ? ' dot-active' : ''}`}
              role="button" tabIndex={0} aria-label={label}
              onMouseEnter={() => { setHover(null); setSelectedTx({ t: transaction, x: cx, y: cy }); }}
              onMouseLeave={() => setSelectedTx(null)}
              onPointerDown={(event) => { event.stopPropagation(); if (event.pointerType === 'touch') selectTransaction(transaction, cx, cy); else { setHover(null); setSelectedTx({ t: transaction, x: cx, y: cy }); } }}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectTransaction(transaction, cx, cy); } }} />;
          })}
          <circle cx={x(last[0])} cy={y(last[1])} r={4.5} className="dot-now" />
        </svg>
      )}
      {hover && !selectedTx && <div className="tooltip" style={{ left: Math.min(Math.max(hover.x, 90), width - 90) }}><strong>{money0(hover.price, currency)}</strong><span>{tsDateVi(hover.ts)}</span></div>}
      {selectedTx && (() => {
        const outcome = txOutcome(selectedTx.t);
        const tone = outcome.pnl >= 0 ? 'gain' : 'loss';
        return <div className="txtooltip" style={{ left: Math.min(Math.max(selectedTx.x, 132), width - 132), top: Math.max(selectedTx.y + 6, 122) }}>
          <strong className={selectedTx.t.type === 'Mua' ? 'buytxt' : 'selltxt'}>{selectedTx.t.type} · {dateVi(selectedTx.t.date)}</strong>
          <span>{btcFmt(Math.abs(selectedTx.t.btc))} BTC @ {money0(selectedTx.t.price, currency)}</span>
          <span className="ttval">{selectedTx.t.type === 'Mua' ? 'Giá trị lúc mua' : 'Vốn giao dịch'}: {money(Math.abs(selectedTx.t.usd), currency)}</span>
          <span className="tttotal">{outcome.totalLabel}: <b>{money(outcome.total, currency)}</b></span>
          <span className={`ttpnl ${tone}`}><b>{outcome.pnl >= 0 ? '▲' : '▼'} {money(outcome.pnl, currency)} ({pct(outcome.pnlPct)}){outcome.realized ? ' đã chốt' : ''}</b></span>
        </div>;
      })()}
      <div className="legend"><span><i className="lg-line" /> Giá BTC</span><span><i className="lg-buy" /> Mua ({BUYS})</span><span><i className="lg-sell" /> Bán ({SELLS})</span><span><i className="lg-avg" /> Trung bình giá</span></div>
    </div>
  );
}

interface MonthGroup { key: string; label: string; transactions: Tx[]; buys: number; sells: number; btcBought: number; btcSold: number; usdTotal: number; buyNow: number; buyChange: number }

function TransactionRow({ transaction, currency }: { transaction: Tx; currency: Currency }) {
  const isBuy = transaction.type === 'Mua';
  const purchaseValue = Math.abs(transaction.usd);
  const currentValue = Math.abs(transaction.btc) * PRICE_NOW;
  const change = currentValue - purchaseValue;
  const changePct = purchaseValue ? (change / purchaseValue) * 100 : 0;
  return <tr className={transaction.type === 'Bán' ? 'sell' : ''}><td>{dateVi(transaction.date)}</td><td>{transaction.type}</td><td className="r">{btcFmt(Math.abs(transaction.btc))}</td><td className="r">{money0(transaction.price, currency)}</td><td className="r"><MoneyPair valueUsd={purchaseValue} currency={currency} mainClass="money-main" subClass="tx-sub" /></td>{isBuy ? <><td className="r"><MoneyPair valueUsd={currentValue} currency={currency} mainClass="money-main" subClass="tx-sub" /></td><td className={`r tx-change ${change >= 0 ? 'up' : 'down'}`}><MoneyPair valueUsd={change} currency={currency} mainClass="money-main" subClass="tx-sub" prefix={`${change >= 0 ? '▲' : '▼'} `} /></td><td className={`r tx-change ${change >= 0 ? 'up' : 'down'}`}>{pct(changePct)}</td></> : <><td className="r tx-empty">—</td><td className="r tx-empty">—</td><td className="r tx-empty">—</td></>}</tr>;
}

function TransactionCard({ transaction, currency }: { transaction: Tx; currency: Currency }) {
  const isBuy = transaction.type === 'Mua';
  const purchaseValue = Math.abs(transaction.usd);
  const currentValue = Math.abs(transaction.btc) * PRICE_NOW;
  const change = currentValue - purchaseValue;
  const changePct = purchaseValue ? (change / purchaseValue) * 100 : 0;
  return <article className={`tx-card ${transaction.type === 'Bán' ? 'sell' : ''}`}>
    <div className="tx-card-head"><strong>{transaction.type}</strong><time>{dateVi(transaction.date)}</time></div>
    <div className="tx-card-main"><span>{btcFmt(Math.abs(transaction.btc))} BTC</span><span>@ {money0(transaction.price, currency)}</span></div>
    {isBuy ? <div className="tx-buy-values"><div><span>Giá trị lúc mua</span><MoneyPair valueUsd={purchaseValue} currency={currency} mainClass="tx-card-money-main" subClass="tx-card-money-sub" /></div><div><span>Giá trị hiện tại</span><MoneyPair valueUsd={currentValue} currency={currency} mainClass="tx-card-money-main" subClass="tx-card-money-sub" /></div><div><span>So với lúc mua</span><MoneyPair valueUsd={change} currency={currency} mainClass={change >= 0 ? 'up tx-card-money-main' : 'down tx-card-money-main'} subClass="tx-card-money-sub" prefix={`${change >= 0 ? '▲' : '▼'} `} /></div><div><span>% Tăng</span><strong className={change >= 0 ? 'up' : 'down'}>{pct(changePct)}</strong></div></div> : <div className="tx-card-money"><MoneyPair valueUsd={purchaseValue} currency={currency} mainClass="tx-card-money-main" subClass="tx-card-money-sub" /></div>}
  </article>;
}

function TransactionHistory({ rangeKey, priceTick, currency }: { rangeKey: string; priceTick: number; currency: Currency }) {
  const groups = useMemo<MonthGroup[]>(() => {
    const filtered = rangeKey === 'all' ? TXS : TXS.filter((tx) => tx.date.startsWith(rangeKey));
    const map = new Map<string, Tx[]>();
    [...filtered].reverse().forEach((tx) => {
      const key = tx.date.slice(0, 7);
      map.set(key, [...(map.get(key) ?? []), tx]);
    });
    return [...map.entries()].map(([key, transactions]) => {
      const [year, month] = key.split('-');
      return {
        key,
        label: `Tháng ${Number(month)}/${year}`,
        transactions,
        buys: transactions.filter((tx) => tx.type === 'Mua').length,
        sells: transactions.filter((tx) => tx.type === 'Bán').length,
        btcBought: transactions.filter((tx) => tx.type === 'Mua').reduce((sum, tx) => sum + Math.abs(tx.btc), 0),
        btcSold: transactions.filter((tx) => tx.type === 'Bán').reduce((sum, tx) => sum + Math.abs(tx.btc), 0),
        usdTotal: transactions.reduce((sum, tx) => sum + Math.abs(tx.usd), 0),
        buyNow: transactions.filter((tx) => tx.type === 'Mua').reduce((sum, tx) => sum + Math.abs(tx.btc) * PRICE_NOW, 0),
        buyChange: transactions.filter((tx) => tx.type === 'Mua').reduce((sum, tx) => sum + Math.abs(tx.btc) * PRICE_NOW - Math.abs(tx.usd), 0),
      };
    });
  }, [rangeKey, priceTick]);

  return <div className="months" key={rangeKey}>{groups.map((group) => (
    <details className="month" key={group.key} open={group.key === '2026-09'}>
      <summary>
        <div className="month-meta"><strong>{group.label}</strong><span>{group.transactions.length} giao dịch · {group.buys} mua{group.sells ? ` · ${group.sells} bán` : ''}</span></div>
        <div className="month-total">{group.btcBought ? <span className="month-buy">Mua <b>{btcFmt(group.btcBought)} BTC</b></span> : null}<div className="month-total-row"><div className="month-total-main"><MoneyPair valueUsd={group.btcBought ? group.buyNow : group.usdTotal} currency={currency} mainClass={group.btcBought ? (group.buyChange >= 0 ? 'up month-money-main' : 'down month-money-main') : 'month-money-main'} subClass="month-vnd" /></div></div>{group.btcSold ? <span>Bán {btcFmt(group.btcSold)} BTC</span> : null}</div>
      </summary>
      <div className="tableWrap desktop-table"><table><thead><tr><th>Ngày</th><th>Loại</th><th className="r">Số BTC</th><th className="r">Giá BTC</th><th className="r">Giá trị lúc mua</th><th className="r">Giá trị hiện tại</th><th className="r">So với lúc mua</th><th className="r">% Tăng</th></tr></thead><tbody>{group.transactions.map((transaction, index) => <TransactionRow key={`${transaction.ts}-${index}`} transaction={transaction} currency={currency} />)}</tbody></table></div>
      <div className="mobile-cards">{group.transactions.map((transaction, index) => <TransactionCard key={`${transaction.ts}-${index}`} transaction={transaction} currency={currency} />)}</div>
    </details>
  ))}</div>;
}

type DetailInterval = '15m' | '1h' | '4h' | '1d' | '1w';
type DetailPoint = { t: number; price: number };
const DETAIL_INTERVALS: { key: DetailInterval; label: string; span: string; limit: number; seconds: number }[] = [
  { key: '15m', label: '15 phút', span: '7 ngày', limit: 673, seconds: 900 },
  { key: '1h', label: '1 giờ', span: '30 ngày', limit: 721, seconds: 3600 },
  { key: '4h', label: '4 giờ', span: '120 ngày', limit: 721, seconds: 14400 },
  { key: '1d', label: '1 ngày', span: '1 năm', limit: 366, seconds: 86400 },
  { key: '1w', label: '1 tuần', span: '4 năm', limit: 209, seconds: 604800 },
];
const detailDate = (t: number, short = false) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', month: '2-digit', year: 'numeric', ...(short ? {} : { day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) }).formatToParts(new Date(t));
  const get = (kind: string) => parts.find(part => part.type === kind)?.value ?? '';
  return short ? `T${get('month')}, ${get('year')}` : `${get('hour')}:${get('minute')} ${get('day')}/${get('month')}/${get('year')}`;
};
async function loadDetail(interval: DetailInterval, signal: AbortSignal): Promise<DetailPoint[]> {
  const spec = DETAIL_INTERVALS.find(item => item.key === interval)!;
  try {
    const response = await fetch(`https://api.binance.us/api/v3/klines?symbol=BTCUSDT&interval=${interval}&limit=${spec.limit}`, { signal });
    if (!response.ok) throw new Error('Binance.US unavailable');
    const raw = await response.json();
    if (!Array.isArray(raw)) throw new Error('Invalid klines');
    const points = raw.map((row: unknown[]) => ({t: Number(row[0]), price: Number(row[4])})).filter((point: DetailPoint) => Number.isFinite(point.price) && point.price > 0).slice(-spec.limit);
    if (points.length < Math.min(100, spec.limit-1)) throw new Error('Incomplete klines');
    return points;
  } catch (error) {
    if (signal.aborted) throw error;
    const krakenInterval: Record<DetailInterval, number> = { '15m': 15, '1h': 60, '4h': 240, '1d': 1440, '1w': 10080 };
    const response = await fetch(`https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=${krakenInterval[interval]}`, { signal });
    if (!response.ok) throw new Error('Kraken unavailable');
    const raw = await response.json();
    if (raw.error?.length) throw new Error('Kraken unavailable');
    const key = Object.keys(raw.result ?? {}).find(item => item !== 'last');
    const points = (key ? raw.result[key] : []).map((row: unknown[]) => ({ t: Number(row[0]) * 1000, price: Number(row[4]) })).filter((point: DetailPoint) => Number.isFinite(point.price) && point.price > 0).slice(-spec.limit);
    if (points.length < Math.min(100, spec.limit-1)) throw new Error('Incomplete Kraken klines');
    return points;
  }
}
function BtcDetailChart({ currency }: { currency: Currency }) {
  const [interval, setIntervalKey] = useState<DetailInterval>('15m');
  const [points, setPoints] = useState<DetailPoint[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [compare, setCompare] = useState<number[]>([]);
  const plotRef = useRef<HTMLDivElement>(null);
  const [plotSize, setPlotSize] = useState({ width: 940, height: 304 });
  useEffect(() => {
    const element = plotRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const box = element.getBoundingClientRect();
      setPlotSize({ width: box.width, height: box.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [points.length > 1]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    const pull = () => { setLoading(true); loadDetail(interval, controller.signal).then(data => { if (!controller.signal.aborted) { setPoints(data); setError(false); setSelected(null); setCompare([]); } }).catch(() => { if (!controller.signal.aborted) setError(true); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); };
    setPoints([]); setCompare([]); pull();
    const timer = window.setInterval(pull, 15 * 60 * 1000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [interval]);
  const spec = DETAIL_INTERVALS.find(item => item.key === interval)!;
  const first = points[0], last = points[points.length-1];
  const up = first && last ? last.price >= first.price : true;
  const current = points[selected ?? points.length-1];
  const prices = points.map(point => point.price);
  const minimum = prices.length ? Math.min(...prices) : 0;
  const maximum = prices.length ? Math.max(...prices) : 1;
  const pad = Math.max((maximum - minimum) * .12, 70);
  const low = minimum - pad, high = maximum + pad;
  const x = (index: number) => 58 + (index / Math.max(points.length-1, 1)) * 824;
  const y = (price: number) => 21 + ((high-price)/(high-low)) * 225;
  const line = points.map((point,index) => `${index?'L':'M'}${x(index).toFixed(1)},${y(point.price).toFixed(1)}`).join(' ');
  const lowIndex = points.length ? prices.indexOf(minimum) : -1;
  const highIndex = points.length ? prices.indexOf(maximum) : -1;
  const compareFirst = compare.length ? points[compare[0]] : null;
  const compareSecond = compare.length === 2 ? points[compare[1]] : null;
  const comparePct = compareFirst && compareSecond ? (compareSecond.price / compareFirst.price - 1) * 100 : null;
  type LabelSide = 'above' | 'below';
  type LabelBox = { left: number; top: number; right: number; bottom: number };
  const boxOverlap = (a: LabelBox, b: LabelBox) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const compareLayout = (() => {
    if (!compareFirst) return null;
    // Place the percentage on the segment first. Move the price cards around it,
    // never the percentage away from the segment. All collision tests use CSS pixels.
    const width = plotSize.width, height = plotSize.height;
    const xPx = (index: number) => x(index) / 940 * width;
    const yPx = (price: number) => y(price) / 304 * height;
    const CARD_W = 124, CARD_H = 43, CARD_GAP = 16;
    const DELTA_W = 70, DELTA_H = 25, DELTA_GAP = 7;
    const offsets = [0, -64, 64, -128, 128, -192, 192];
    const sides: LabelSide[] = ['above', 'below'];
    const bound = (value: number, half: number) => Math.max(half + 3, Math.min(width - half - 3, value));
    const cardBox = (index: number, side: LabelSide, dx: number): LabelBox => {
      const cx = bound(xPx(index) + dx, CARD_W / 2);
      const cy = yPx(points[index].price);
      const top = side === 'above' ? cy - CARD_GAP - CARD_H : cy + CARD_GAP;
      return { left: cx - CARD_W / 2, top, right: cx + CARD_W / 2, bottom: top + CARD_H };
    };
    const deltaBox = (side: LabelSide): LabelBox => {
      const cx = bound((xPx(compare[0]) + xPx(compare[1])) / 2, DELTA_W / 2);
      const cy = (yPx(compareFirst.price) + yPx(compareSecond!.price)) / 2;
      const top = side === 'above' ? cy - DELTA_GAP - DELTA_H : cy + DELTA_GAP;
      return { left: cx - DELTA_W / 2, top, right: cx + DELTA_W / 2, bottom: top + DELTA_H };
    };
    if (!compareSecond) {
      const firstSide = cardBox(compare[0], 'above', 0).top >= 0 ? 'above' : 'below';
      return { firstSide, firstDx: 0, secondSide: 'below' as LabelSide, secondDx: 0, deltaSide: 'above' as LabelSide };
    }
    let best: { s1: LabelSide; d1: number; s2: LabelSide; d2: number; sd: LabelSide; score: number } | null = null;
    for (const sd of sides) for (const s1 of sides) for (const d1 of offsets) for (const s2 of sides) for (const d2 of offsets) {
      const b1 = cardBox(compare[0], s1, d1), b2 = cardBox(compare[1], s2, d2), bd = deltaBox(sd);
      let score = (boxOverlap(b1, b2) + boxOverlap(b1, bd) + boxOverlap(b2, bd)) * 1000;
      if ([b1, b2, bd].some(box => box.top < 0 || box.bottom > height)) score += 1e7;
      score += Math.abs(d1) + Math.abs(d2);
      if (s1 !== 'above') score += 30;
      if (s2 !== 'below') score += 30;
      if (sd !== 'above') score += 8;
      if (best === null || score < best.score) best = { s1, d1, s2, d2, sd, score };
    }
    return best ? { firstSide: best.s1, firstDx: best.d1, secondSide: best.s2, secondDx: best.d2, deltaSide: best.sd } : null;
  })();
  const pickIndex = (clientX: number, svg: SVGSVGElement) => {
    const rect = svg.getBoundingClientRect();
    const px = (clientX - rect.left) / rect.width * 940;
    return Math.max(0, Math.min(points.length - 1, Math.round((px - 58) / 824 * (points.length - 1))));
  };
  return <section className="btc-detail" aria-label="Chi tiết giá Bitcoin"><div className="btc-detail-top"><div><div className="btc-detail-kicker">GIÁ BTC · {spec.span}</div><h2>Biến động giá Bitcoin</h2></div><div className="btc-detail-tabs" role="group" aria-label="Độ dài mỗi nến">{DETAIL_INTERVALS.map(item => <button key={item.key} type="button" aria-pressed={interval === item.key} onClick={() => setIntervalKey(item.key)}>{item.key}</button>)}</div></div>
    {points.length > 1 && <><div className={`btc-detail-change ${up ? 'up' : 'down'}`}>{up ? '▲ Tăng' : '▼ Sụt'} {Math.abs((last.price/first.price-1)*100).toLocaleString('vi-VN',{ maximumFractionDigits: 2 })}% <span>so với đầu kỳ</span></div><div className="btc-detail-quote"><strong>{money0(current.price, currency)}</strong><time>{detailDate(current.t)} · GMT+7</time></div>
    <div className="btc-detail-plot" ref={plotRef}><svg viewBox="0 0 940 304" preserveAspectRatio="none" role="img" aria-label={`Biểu đồ BTC mỗi ${spec.label}, ${spec.span}. Chọn hai điểm để so sánh giá.`} onPointerMove={event => setSelected(pickIndex(event.clientX, event.currentTarget))} onPointerDown={event => {const index = pickIndex(event.clientX, event.currentTarget); setSelected(index); setCompare(previous => previous.length >= 2 ? [] : [...previous, index]);}} onPointerLeave={event => {if(event.pointerType !== 'touch') setSelected(null)}}>
      <defs><linearGradient id="btc-detail-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={up?'#16c784':'#ea3943'} stopOpacity=".20"/><stop offset="100%" stopColor={up?'#16c784':'#ea3943'} stopOpacity="0"/></linearGradient></defs>
      {[0,.5,1].map((ratio,index)=><g key={index}><line x1="58" x2="882" y1={21+ratio*225} y2={21+ratio*225} stroke="#29354a" strokeDasharray="4 6"/><text x="4" y={25+ratio*225} fill="#94a0b4" fontSize="12">{axisMoney(high-ratio*(high-low),currency)}</text></g>)}
      <path d={`${line} L882,246 L58,246 Z`} fill="url(#btc-detail-fill)"/><path d={line} fill="none" stroke={up?'#16c784':'#ea3943'} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round"/>
      {[{ index: highIndex, color: '#16c784', label: 'Giá cao nhất', dy: -27, tdy: -14 }, { index: lowIndex, color: '#ea3943', label: 'Giá thấp nhất', dy: 24, tdy: 38 }].map(mark => {const cx=x(mark.index); const cy=y(points[mark.index].price); const anchor=cx<150?'start':cx>790?'end':'middle'; return <g key={mark.label}><circle cx={cx} cy={cy} r="7" fill={mark.color} stroke="#0b1220" strokeWidth="2.5"><title>{mark.label}: {money0(points[mark.index].price, currency)} · {detailDate(points[mark.index].t)} GMT+7</title></circle><text x={cx} y={cy+mark.dy} textAnchor={anchor} fill={mark.color} fontSize="12" fontWeight="700">{money0(points[mark.index].price, currency)}</text><text x={cx} y={cy+mark.tdy} textAnchor={anchor} fill="#94a0b4" fontSize="10">{detailDate(points[mark.index].t)}</text></g>;})}
      {compareFirst && compareSecond && <line x1={x(compare[0])} y1={y(compareFirst.price)} x2={x(compare[1])} y2={y(compareSecond.price)} stroke={comparePct !== null && comparePct >= 0 ? '#16c784' : '#ea3943'} strokeWidth="2" strokeDasharray="5 5" vectorEffect="non-scaling-stroke"/>}
      {compare.map((index, position) => <g key={position} style={{pointerEvents: 'none'}}><circle cx={x(index)} cy={y(points[index].price)} r="12" fill="#f7931a" stroke="#101a2b" strokeWidth="2" vectorEffect="non-scaling-stroke"/><text x={x(index)} y={y(points[index].price)+4} textAnchor="middle" fill="#101a2b" fontSize="12" fontWeight="800">{position+1}</text></g>)}
      {selected !== null && <><line x1={x(selected)} x2={x(selected)} y1="21" y2="246" stroke="#9aa3b5" strokeDasharray="3 4"/><circle cx={x(selected)} cy={y(current.price)} r="5" fill="#f7931a" stroke="#0b1220" strokeWidth="2"/></>}
      {[0,1,2,3,4,5,6,7].map(index => {const point=points[Math.round((points.length-1)*index/7)]; const date = new Date(point.t); const label = interval==='1w'||interval==='1d' ? detailDate(point.t,true) : new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit'}).format(date);return <text key={index} x={58+824*index/7} y="278" textAnchor={index===0?'start':index===7?'end':'middle'} fill="#94a0b4" fontSize="12">{label}</text>;})}
    </svg>{compareFirst && compareSecond && comparePct !== null && <div className={`btc-detail-delta ${comparePct >= 0 ? 'up' : 'down'} ${compareLayout?.deltaSide === 'below' ? 'is-below' : ''}`} style={{ '--compare-x': `${(x(compare[0]) + x(compare[1])) / 2 / 940 * 100}%`, '--compare-y': `${(y(compareFirst.price) + y(compareSecond.price)) / 2 / 304 * 100}%` } as React.CSSProperties}>{comparePct >= 0 ? '+' : '−'}{Math.abs(comparePct).toLocaleString('vi-VN', {maximumFractionDigits: 2})}%</div>}
    {compare.map((index, position) => <div className={`btc-detail-point-card ${((position === 0 ? compareLayout?.firstSide : compareLayout?.secondSide) ?? (position === 0 ? 'above' : 'below')) === 'below' ? 'is-below' : 'is-above'}`} key={position} style={{ '--point-x': `${x(index) / 940 * 100}%`, '--point-shift': `${(position === 0 ? compareLayout?.firstDx : compareLayout?.secondDx) ?? 0}px`, '--point-y': `${y(points[index].price) / 304 * 100}%` } as React.CSSProperties}><strong>{position + 1} · <span className="btc-detail-card-price">{money0(points[index].price, currency)}</span></strong><time>{detailDate(points[index].t)}</time></div>)}
    {selected !== null && <div className={`btc-detail-cursor ${y(current.price) < 124 ? 'is-below' : ''}`} style={{ '--cursor-x': `${x(selected) / 940 * 100}%` } as React.CSSProperties}><time>{detailDate(current.t)} · GMT+7</time><strong>{money0(current.price, currency)}</strong></div>}</div></>}
    {!points.length && loading && <p className="btc-detail-status">Đang tải giá BTC...</p>}
    {error && <p className="btc-detail-error" role="alert">{points.length ? 'Chưa cập nhật được giá mới. Đang giữ dữ liệu gần nhất.' : 'Chưa tải được biểu đồ. Hãy thử lại sau.'}</p>}
  </section>;
}

export function App() {
  const [rangeKey, setRangeKey] = useState('all');
  const [priceTick, setPriceTick] = useState(0);
  const [currency, setCurrency] = useState<Currency>('USD');
  const [detailOpen, setDetailOpen] = useState(false);
  const [quoteIndex, setQuoteIndex] = useState(() => Math.floor(Math.random() * QUOTES.length));
  const quote = QUOTES[quoteIndex];
  useEffect(() => {
    const timer = setInterval(() => { setQuoteIndex((index) => (index + 1) % QUOTES.length); }, 10000);
    return () => clearInterval(timer);
  }, []);
  // Rebase every price-derived number on a live CoinGecko read, then poll once a minute while the page stays open; on any failure keep the last good price (initially the data.ts snapshot).
  useEffect(() => {
    let cancelled = false;
    const pull = () => {
      fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true')
        .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
        .then((data) => {
          const price = data?.bitcoin?.usd;
          const change = data?.bitcoin?.usd_24h_change;
          if (cancelled || typeof price !== 'number' || !(price > 0)) return;
          PRICE_NOW = price;
          VALUE_NOW = HELD * PRICE_NOW;
          UNREALIZED = VALUE_NOW - COST_BASIS;
          UNREALIZED_PCT = (UNREALIZED / COST_BASIS) * 100;
          if (typeof change === 'number' && Number.isFinite(change)) CHANGE_24H = change;
          setPriceTick((tick) => tick + 1);
        })
        .catch(() => {});
    };
    pull();
    const timer = setInterval(pull, 60000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);
  const up = UNREALIZED >= 0;
  const change24hUp = CHANGE_24H >= 0;
  const change24hBase = 1 + CHANGE_24H / 100;
  const valueChange24h = change24hBase > 0 ? VALUE_NOW - VALUE_NOW / change24hBase : 0;
  return <main className="page-shell"><div className={`dark currency-${currency.toLowerCase()}`}>
    <div className="topbar"><div className="brand-stack"><div className="brand"><span className="blogo" aria-hidden="true">B</span><span>LivingwBTC</span></div><div className="quote-window" aria-live="polite"><blockquote className="btc-quote" key={quoteIndex}>“{quote.text}”{quote.author && <cite>— {quote.author}</cite>}</blockquote></div></div><div className="topbar-actions"><div className="currency-toggle" role="group" aria-label="Đơn vị tiền"><button type="button" className={currency === 'USD' ? 'active' : ''} aria-pressed={currency === 'USD'} onClick={() => setCurrency('USD')}>USD</button><button type="button" className={currency === 'VND' ? 'active' : ''} aria-pressed={currency === 'VND'} onClick={() => setCurrency('VND')}>VND</button></div></div></div>
    <h1 className="title">Danh mục tích luỹ BTC của Cyan</h1>
    <p className="intro">Hành trình DCA Bitcoin từ tháng 1/2022 với tổng {TXS.length} lượt giao dịch, {BUYS} lần mua và {SELLS} lần bán</p>

    <section className="hero-grid" aria-label="Giá Bitcoin hiện tại">
      <div className="hero-panel price-panel"><div className="heroLabel">Giá 1 BTC hiện tại</div><button type="button" className="btc-detail-toggle" aria-expanded={detailOpen} aria-controls="btc-detail-chart" onClick={() => setDetailOpen(value => !value)}><span className="toggle-label">{detailOpen ? 'ẨN ĐI' : 'CHI TIẾT'}</span><svg aria-hidden="true" className={detailOpen ? 'toggle-chevron is-open' : 'toggle-chevron'} width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></button><div className="price-main"><div className="price-usd-row"><div className="heroValue"><RollingPrice key={currency} text={money0(PRICE_NOW, currency)} /></div><div className="price-24h"><div className="h24-label">24h</div><div className={`h24-value ${CHANGE_24H >= 0 ? 'up' : 'down'}`}>{CHANGE_24H >= 0 ? '▲' : '▼'} {pct(CHANGE_24H)}</div></div></div><div className="heroVnd">≈ {currency === 'USD' ? vnd(PRICE_NOW * VND_RATE) : usd0(PRICE_NOW)}</div></div><div className="heroSub"><span>Trung bình giá {money0(AVG_COST, currency)}</span></div></div>
    </section>
    {detailOpen && <div id="btc-detail-chart"><BtcDetailChart currency={currency} /></div>}

    <div className="summaryGrid" aria-label="Tổng quan danh mục">
      <div className="hero-panel primary holdings-card">
        <div className="heroLabel">Số BTC đang nắm giữ</div>
        <div className="heroValue">{btcFmt(HELD)} BTC</div>
        <div className="heroLabel fiatLabel">So với fiat</div>
        <MoneyPair valueUsd={VALUE_NOW} currency={currency} mainClass="heroUsd" subClass="heroVnd" />
      </div>
      <div className="change-card">
        <div className="change-head"><div className="change-title">Giá trị số BTC đang nắm giữ</div><div className="change-average">Trung bình giá ở: <span className="change-average-value">{money0(AVG_COST, currency)}</span></div></div>
        <div className="change-rows">
          <div className="change-row">
            <div className="change-copy"><div className="change-label">Thời điểm hiện tại</div><div className="change-detail"><span className={up ? 'up' : 'down'}>{up ? 'Tăng' : 'Giảm'} {pct(UNREALIZED_PCT)}</span> so với tổng giá trị lúc mua</div></div>
            <div className="change-money">
              <MoneyPair valueUsd={UNREALIZED} currency={currency} mainClass={`change-value ${up ? 'up' : 'down'}`} subClass="change-vnd" prefix={`${up ? '▲' : '▼'} `} />
            </div>
          </div>
          <div className="change-row">
            <div className="change-copy"><div className="change-label">Giá trị tăng giảm trong 24h</div><div className="change-detail"><span className={change24hUp ? 'up' : 'down'}>{change24hUp ? 'Tăng' : 'Sụt'} {pct(CHANGE_24H)}</span> theo giá BTC</div></div>
            <div className="change-money">
              <MoneyPair valueUsd={valueChange24h} currency={currency} mainClass={`change-value ${change24hUp ? 'up' : 'down'}`} subClass="change-vnd" prefix={`${change24hUp ? '▲' : '▼'} `} />
            </div>
          </div>
        </div>
      </div>
    </div>

    <div className="sectionHead"><h2>Giá BTC và các lần DCA</h2><div className="range-scroll" aria-label="Lọc theo năm"><div className="ranges">{RANGES.map((range) => <button key={range.key} className={rangeKey === range.key ? 'range active' : 'range'} aria-pressed={rangeKey === range.key} onClick={() => setRangeKey(range.key)}>{range.label}</button>)}</div></div></div>
    <PriceChart rangeKey={rangeKey} currency={currency} />

    <div className="history-head"><div><h2>Lịch sử giao dịch</h2></div><span>{rangeKey === 'all' ? TXS.length : TXS.filter((tx) => tx.date.startsWith(rangeKey)).length} giao dịch</span></div>
    <TransactionHistory rangeKey={rangeKey} priceTick={priceTick} currency={currency} />
  </div></main>;
}
