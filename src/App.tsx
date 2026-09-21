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
const PRICE_NOW = MARKET.currentPrice;
const CHANGE_24H = MARKET.change24h;
const VALUE_NOW = HELD * PRICE_NOW;
const UNREALIZED = VALUE_NOW - COST_BASIS;
const UNREALIZED_PCT = (UNREALIZED / COST_BASIS) * 100;
const BUYS = TXS.filter((tx) => tx.type === 'Mua').length;
const SELLS = TXS.length - BUYS;

const usd = (value: number, digits = 2) =>
  `${value < 0 ? '-' : ''}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const usd0 = (value: number) => `$${Math.round(value).toLocaleString('en-US')}`;
const vnd = (value: number) => `${Math.round(value).toLocaleString('vi-VN')} ₫`;
const btcFmt = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 8, maximumFractionDigits: 8 });
const pct = (value: number) => `${value > 0 ? '+' : ''}${value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`;
const dateVi = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const tsDateVi = (ts: number) => dateVi(new Date(ts * 1000).toISOString().slice(0, 10));

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

function PriceChart({ rangeKey }: { rangeKey: string }) {
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
  const avgLabelWidth = 122;
  const avgLabelX = width - margin.r - avgLabelWidth;
  const avgLabelY = Math.max(y(AVG_COST) - 23, 3);

  return (
    <div className="chart-wrap" ref={wrapRef}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`Biểu đồ giá Bitcoin, ${range.label}`}>
          {yTicks.map((value) => (
            <g key={value}>
              <line x1={margin.l} x2={width - margin.r} y1={y(value)} y2={y(value)} className="grid" />
              <text x={margin.l - 8} y={y(value) + 4} className="tick" textAnchor="end">{usd0(value)}</text>
            </g>
          ))}
          {xTicks.map((tick) => <text key={tick.ts} x={x(tick.ts)} y={height - 8} className="tick" textAnchor="middle">{tick.label}</text>)}
          <line x1={margin.l} x2={width - margin.r} y1={y(AVG_COST)} y2={y(AVG_COST)} className="avgline" />
          <rect x={avgLabelX} y={avgLabelY} width={avgLabelWidth} height="20" rx="5" className="avglabel-bg" />
          <text x={width - margin.r - 7} y={avgLabelY + 14} className="avglabel" textAnchor="end">Trung bình giá {usd0(AVG_COST)}</text>
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
            const label = `${transaction.type} ${btcFmt(Math.abs(transaction.btc))} BTC ngày ${dateVi(transaction.date)}, giá ${usd0(transaction.price)}`;
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
      {hover && !selectedTx && <div className="tooltip" style={{ left: Math.min(Math.max(hover.x, 90), width - 90) }}><strong>{usd0(hover.price)}</strong><span>{tsDateVi(hover.ts)}</span></div>}
      {selectedTx && (() => {
        const outcome = txOutcome(selectedTx.t);
        const tone = outcome.pnl >= 0 ? 'gain' : 'loss';
        const changeLabel = `${outcome.pnl >= 0 ? 'Tăng' : 'Sụt'}${outcome.realized ? ' đã chốt' : ''}`;
        return <div className="txtooltip" style={{ left: Math.min(Math.max(selectedTx.x, 132), width - 132), top: Math.max(selectedTx.y + 6, 122) }}>
          <strong className={selectedTx.t.type === 'Mua' ? 'buytxt' : 'selltxt'}>{selectedTx.t.type} · {dateVi(selectedTx.t.date)}</strong>
          <span>{btcFmt(Math.abs(selectedTx.t.btc))} BTC @ {usd0(selectedTx.t.price)}</span>
          <span className="ttval">{selectedTx.t.type === 'Mua' ? 'Giá trị lúc mua' : 'Vốn giao dịch'}: {usd(Math.abs(selectedTx.t.usd))}</span>
          <span className="tttotal">{outcome.totalLabel}: <b>{usd(outcome.total)}</b></span>
          <span className={`ttpnl ${tone}`}>{changeLabel}: <b>{usd(outcome.pnl)} ({pct(outcome.pnlPct)})</b></span>
        </div>;
      })()}
      <div className="legend"><span><i className="lg-line" /> Giá BTC</span><span><i className="lg-buy" /> Mua ({BUYS})</span><span><i className="lg-sell" /> Bán ({SELLS})</span><span><i className="lg-avg" /> Trung bình giá</span></div>
    </div>
  );
}

interface MonthGroup { key: string; label: string; transactions: Tx[]; buys: number; sells: number; btcBought: number; btcSold: number; usdTotal: number; buyChange: number }

function TransactionRow({ transaction }: { transaction: Tx }) {
  const isBuy = transaction.type === 'Mua';
  const purchaseValue = Math.abs(transaction.usd);
  const currentValue = Math.abs(transaction.btc) * PRICE_NOW;
  const change = currentValue - purchaseValue;
  const changePct = purchaseValue ? (change / purchaseValue) * 100 : 0;
  return <tr className={transaction.type === 'Bán' ? 'sell' : ''}><td>{dateVi(transaction.date)}</td><td>{transaction.type}</td><td className="r">{btcFmt(Math.abs(transaction.btc))}</td><td className="r">{usd0(transaction.price)}</td><td className="r"><span>{usd(purchaseValue)}</span><span className="tx-sub">{vnd(Math.abs(transaction.vnd))}</span></td>{isBuy ? <><td className="r"><span>{usd(currentValue)}</span><span className="tx-sub">≈ {vnd(currentValue * VND_RATE)}</span></td><td className={`r tx-change ${change >= 0 ? 'up' : 'down'}`}><span>{change >= 0 ? '▲' : '▼'} {usd(change)}</span><span className="tx-sub">≈ {vnd(change * VND_RATE)}</span></td><td className={`r tx-change ${change >= 0 ? 'up' : 'down'}`}>{pct(changePct)}</td></> : <><td className="r tx-empty">—</td><td className="r tx-empty">—</td><td className="r tx-empty">—</td></>}</tr>;
}

function TransactionCard({ transaction }: { transaction: Tx }) {
  const isBuy = transaction.type === 'Mua';
  const purchaseValue = Math.abs(transaction.usd);
  const currentValue = Math.abs(transaction.btc) * PRICE_NOW;
  const change = currentValue - purchaseValue;
  const changePct = purchaseValue ? (change / purchaseValue) * 100 : 0;
  return <article className={`tx-card ${transaction.type === 'Bán' ? 'sell' : ''}`}>
    <div className="tx-card-head"><strong>{transaction.type}</strong><time>{dateVi(transaction.date)}</time></div>
    <div className="tx-card-main"><span>{btcFmt(Math.abs(transaction.btc))} BTC</span><span>@ {usd0(transaction.price)}</span></div>
    {isBuy ? <div className="tx-buy-values"><div><span>Giá trị lúc mua</span><strong>{usd(purchaseValue)}</strong><small>{vnd(Math.abs(transaction.vnd))}</small></div><div><span>Giá trị hiện tại</span><strong>{usd(currentValue)}</strong><small>≈ {vnd(currentValue * VND_RATE)}</small></div><div><span>So với lúc mua</span><strong className={change >= 0 ? 'up' : 'down'}>{change >= 0 ? 'Tăng' : 'Sụt'} {usd(change)}</strong><small>≈ {vnd(change * VND_RATE)}</small></div><div><span>% Tăng</span><strong className={change >= 0 ? 'up' : 'down'}>{pct(changePct)}</strong></div></div> : <div className="tx-card-money"><span>{usd(purchaseValue)}</span><span>≈ {vnd(Math.abs(transaction.vnd))}</span></div>}
  </article>;
}

function TransactionHistory({ rangeKey }: { rangeKey: string }) {
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
        buyChange: transactions.filter((tx) => tx.type === 'Mua').reduce((sum, tx) => sum + Math.abs(tx.btc) * PRICE_NOW - Math.abs(tx.usd), 0),
      };
    });
  }, [rangeKey]);

  return <div className="months" key={rangeKey}>{groups.map((group) => (
    <details className="month" key={group.key} open={group.key === '2026-09'}>
      <summary>
        <div><strong>{group.label}</strong><span>{group.transactions.length} giao dịch · {group.buys} mua{group.sells ? ` · ${group.sells} bán` : ''}</span></div>
        <div className="month-total">{group.btcBought ? <span className="month-buy">Mua <b>{btcFmt(group.btcBought)} BTC</b></span> : null}<div className="month-total-row"><strong>{usd(group.usdTotal)}</strong>{group.btcBought ? <span className={`month-change ${group.buyChange >= 0 ? 'up' : 'down'}`}>{group.buyChange >= 0 ? 'Tăng' : 'Sụt'} {usd(group.buyChange)}</span> : null}</div>{group.btcSold ? <span>Bán {btcFmt(group.btcSold)} BTC</span> : null}</div>
      </summary>
      <div className="tableWrap desktop-table"><table><thead><tr><th>Ngày</th><th>Loại</th><th className="r">Số BTC</th><th className="r">Giá BTC</th><th className="r">Giá trị lúc mua</th><th className="r">Giá trị hiện tại</th><th className="r">So với lúc mua</th><th className="r">% Tăng</th></tr></thead><tbody>{group.transactions.map((transaction, index) => <TransactionRow key={`${transaction.ts}-${index}`} transaction={transaction} />)}</tbody></table></div>
      <div className="mobile-cards">{group.transactions.map((transaction, index) => <TransactionCard key={`${transaction.ts}-${index}`} transaction={transaction} />)}</div>
    </details>
  ))}</div>;
}

export function App() {
  const [rangeKey, setRangeKey] = useState('all');
  const up = UNREALIZED >= 0;
  return <main className="page-shell"><div className="dark">
    <div className="topbar"><div className="brand"><span className="blogo" aria-hidden="true">B</span><span>BTC Portfolio</span></div><div className="live"><span className="livedot" /> Dữ liệu chốt cuối ngày {DATA_DATE} (GMT+7)</div></div>
    <h1 className="title">Danh mục đầu tư BTC của Mike</h1>
    <p className="intro">Hành trình DCA Bitcoin từ tháng 1/2022: {TXS.length} giao dịch, {BUYS} lần mua và {SELLS} lần bán. Mỗi chấm trên biểu đồ là một giao dịch thật, đặt đúng ngày và giá.</p>

    <section className="hero-grid" aria-label="Giá Bitcoin hiện tại">
      <div className="hero-panel price-panel"><div className="heroLabel">Giá 1 BTC hiện tại</div><div className="price-main"><div className="price-usd-row"><div className="heroValue">{usd0(PRICE_NOW)}</div><div className="price-24h"><div className="h24-label">24h</div><div className={`h24-value ${CHANGE_24H >= 0 ? 'up' : 'down'}`}>{CHANGE_24H >= 0 ? '▲' : '▼'} {pct(CHANGE_24H)}</div></div></div><div className="heroVnd">≈ {vnd(PRICE_NOW * VND_RATE)}</div></div><div className="heroSub"><span>Trung bình giá {usd0(AVG_COST)}</span></div></div>
    </section>

    <div className="summaryGrid" aria-label="Tổng quan danh mục">
      <div className="hero-panel primary holdings-card">
        <div className="heroLabel">Số BTC đang nắm giữ</div>
        <div className="heroValue">{btcFmt(HELD)} BTC</div>
        <div className="heroLabel fiatLabel">So với fiat</div>
        <div className="heroUsd">{usd(VALUE_NOW)}</div>
        <div className="heroVnd">≈ {vnd(VALUE_NOW * VND_RATE)}</div>
      </div>
      <div className="change-card">
        <div className="change-head"><div className="change-title">Giá trị số BTC đang nắm giữ</div><div className="change-average">Trung bình giá ở: <span className="change-average-value">{usd0(AVG_COST)}</span></div></div>
        <div className="change-rows">
          <div className="change-row">
            <div className="change-copy"><div className="change-label">Thời điểm hiện tại</div><div className="change-detail"><span className={up ? 'up' : 'down'}>{up ? 'Tăng' : 'Giảm'} {pct(UNREALIZED_PCT)}</span> so với tổng giá trị lúc mua</div></div>
            <div className="change-money">
              <div className={`change-value ${up ? 'up' : 'down'}`}>{up ? '▲' : '▼'} {usd(UNREALIZED)}</div>
              <div className="change-vnd">≈ {vnd(UNREALIZED * VND_RATE)}</div>
            </div>
          </div>
          <div className="change-row">
            <div className="change-copy"><div className="change-label">Đã ghi nhận</div><div className="change-detail"><span className={REALIZED >= 0 ? 'up' : 'down'}>{SELLS}</span> lần bán</div></div>
            <div className="change-money">
              <div className={`change-value ${REALIZED >= 0 ? 'up' : 'down'}`}>{REALIZED >= 0 ? '▲' : '▼'} {usd(REALIZED)}</div>
              <div className="change-vnd">≈ {vnd(REALIZED * VND_RATE)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div className="sectionHead"><h2>Giá BTC và các lần DCA</h2><div className="range-scroll" aria-label="Lọc theo năm"><div className="ranges">{RANGES.map((range) => <button key={range.key} className={rangeKey === range.key ? 'range active' : 'range'} aria-pressed={rangeKey === range.key} onClick={() => setRangeKey(range.key)}>{range.label}</button>)}</div></div></div>
    <PriceChart rangeKey={rangeKey} />

    <div className="history-head"><div><h2>Lịch sử giao dịch</h2></div><span>{rangeKey === 'all' ? TXS.length : TXS.filter((tx) => tx.date.startsWith(rangeKey)).length} giao dịch</span></div>
    <TransactionHistory rangeKey={rangeKey} />

    <p className="closing">Giá BTC hiện tại từ {MARKET.source}, cập nhật {DATA_DATE}. Giao dịch và giá vốn từ sheet "My life tối giản" của Mike. Trang chỉ để xem, không mua bán gì ở đây.</p>
  </div></main>;
}
