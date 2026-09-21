import React, { useEffect, useMemo, useRef, useState } from 'react';
import './style.css';
import { PRICES, TXS, MARKET, type Tx } from './data';

// Snapshot constants from the user's "My life tối giản" sheet, tab "BTC (mẫu mới)", 20/09/2026.
const AVG_COST = 95380;        // Giá vốn TB / BTC (USD)
const COST_BASIS = 6016.59;    // Giá vốn BTC đang giữ (USD)
const REALIZED = -100.64;      // Lãi/Lỗ đã chốt (USD)
const VND_RATE = 26022;        // Tỷ giá USD/VND dùng để quy đổi tham khảo

const HELD = TXS.reduce((s, t) => s + t.btc, 0);
const PRICE_NOW = MARKET.currentPrice;
const VALUE_NOW = HELD * PRICE_NOW;
const UNREALIZED = VALUE_NOW - COST_BASIS;
const UNREALIZED_PCT = (UNREALIZED / COST_BASIS) * 100;
const BUYS = TXS.filter((t) => t.type === 'Mua').length;
const SELLS = TXS.length - BUYS;

const usd = (v: number, digits = 2) =>
    (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const usd0 = (v: number) => '$' + Math.round(v).toLocaleString('en-US');
const vnd = (v: number) => Math.round(v).toLocaleString('vi-VN') + ' ₫';
const btcFmt = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 8, maximumFractionDigits: 8 });
const pct = (v: number) => (v > 0 ? '+' : '') + v.toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + '%';
const dateVi = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const tsDateVi = (ts: number) => dateVi(new Date(ts * 1000).toISOString().slice(0, 10));

const ORANGE = '#f7931a';
const RED = '#ea3943';
const GREEN = '#16c784';

const RANGES: { key: string; label: string; from?: number }[] = [
    { key: 'all', label: 'Tất cả' },
    { key: '2022', label: '2022', from: Date.UTC(2022, 0, 1) / 1000 },
    { key: '2023', label: '2023', from: Date.UTC(2023, 0, 1) / 1000 },
    { key: '2024', label: '2024', from: Date.UTC(2024, 0, 1) / 1000 },
    { key: '2025', label: '2025', from: Date.UTC(2025, 0, 1) / 1000 },
    { key: '2026', label: '2026', from: Date.UTC(2026, 0, 1) / 1000 },
];

function useContainerWidth(ref: React.RefObject<HTMLDivElement | null>) {
    const [w, setW] = useState(0);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const ro = new ResizeObserver((entries) => setW(entries[0].contentRect.width));
        ro.observe(el);
        setW(el.clientWidth);
        return () => ro.disconnect();
    }, [ref]);
    return w;
}

interface Hover { x: number; y: number; price: number; ts: number }

function PriceChart({ rangeKey }: { rangeKey: string }) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const width = useContainerWidth(wrapRef);
    const [hover, setHover] = useState<Hover | null>(null);
    const [txHover, setTxHover] = useState<{ t: Tx; x: number; y: number } | null>(null);

    const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[0];
    const fromTs = range.from ?? PRICES[0][0];
    const toTs = range.key === 'all' ? PRICES[PRICES.length - 1][0] : Math.min((range.from ?? 0) + 365 * 86400 + 86400, PRICES[PRICES.length - 1][0]);

    const points = useMemo(() => PRICES.filter(([ts]) => ts >= fromTs && ts <= toTs), [fromTs, toTs]);
    const txs = useMemo(() => TXS.filter((t) => t.ts >= fromTs && t.ts <= toTs), [fromTs, toTs]);

    const height = width < 640 ? 300 : 400;
    const m = { l: 56, r: 18, t: 18, b: 30 };
    const iw = Math.max(width - m.l - m.r, 10);
    const ih = height - m.t - m.b;

    const lo = Math.min(...points.map((p) => p[1]), AVG_COST);
    const hi = Math.max(...points.map((p) => p[1]), AVG_COST);
    const pad = (hi - lo) * 0.07 || 1;
    const yMin = lo - pad;
    const yMax = hi + pad;
    const t0 = points[0][0];
    const t1 = points[points.length - 1][0];
    const x = (ts: number) => m.l + ((ts - t0) / Math.max(t1 - t0, 1)) * iw;
    const y = (p: number) => m.t + (1 - (p - yMin) / (yMax - yMin)) * ih;

    // y ticks: 5 lines at a round step
    const rawStep = (yMax - yMin) / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const step = Math.ceil(rawStep / mag) * mag;
    const yTicks: number[] = [];
    for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) yTicks.push(v);

    // x ticks: years for long ranges, months otherwise
    const spanDays = (t1 - t0) / 86400;
    const xTicks: { ts: number; label: string }[] = [];
    if (spanDays > 400) {
        for (let yr = new Date(t0 * 1000).getUTCFullYear(); yr <= new Date(t1 * 1000).getUTCFullYear(); yr++) {
            const ts = Date.UTC(yr, 0, 1) / 1000;
            if (ts >= t0 && ts <= t1) xTicks.push({ ts, label: String(yr) });
        }
    } else {
        const months = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];
        const start = new Date(t0 * 1000);
        for (let mo = start.getUTCMonth(); mo < 12; mo++) {
            const ts = Date.UTC(start.getUTCFullYear(), mo, 1) / 1000;
            if (ts >= t0 && ts <= t1) xTicks.push({ ts, label: months[mo] });
        }
    }

    const path = points.map((p, i) => (i === 0 ? 'M' : 'L') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1)).join(' ');

    const onMove = (e: React.MouseEvent<SVGRectElement>) => {
        const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
        const px = ((e.clientX - rect.left) / rect.width) * width;
        const ts = t0 + ((px - m.l) / iw) * (t1 - t0);
        let best = points[0];
        for (const p of points) if (Math.abs(p[0] - ts) < Math.abs(best[0] - ts)) best = p;
        setHover({ x: x(best[0]), y: y(best[1]), price: best[1], ts: best[0] });
    };

    const last = points[points.length - 1];

    return (
        <div className="chart-wrap" ref={wrapRef}>
            {width > 0 && (
                <svg width={width} height={height} role="img" aria-label="Biểu đồ giá BTC">
                    {yTicks.map((v) => (
                        <g key={v}>
                            <line x1={m.l} x2={width - m.r} y1={y(v)} y2={y(v)} className="grid" />
                            <text x={m.l - 8} y={y(v) + 4} className="tick" textAnchor="end">{usd0(v)}</text>
                        </g>
                    ))}
                    {xTicks.map((t) => (
                        <text key={t.ts} x={x(t.ts)} y={height - 8} className="tick" textAnchor="middle">{t.label}</text>
                    ))}
                    <line x1={m.l} x2={width - m.r} y1={y(AVG_COST)} y2={y(AVG_COST)} className="avgline" />
                    <text x={width - m.r} y={y(AVG_COST) - 6} className="avglabel" textAnchor="end">Giá vốn TB {usd0(AVG_COST)}</text>
                    <path d={path} className="priceline" />
                    <rect x={m.l} y={m.t} width={iw} height={ih} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
                    {hover && !txHover && (
                        <g>
                            <line x1={hover.x} x2={hover.x} y1={m.t} y2={height - m.b} className="crosshair" />
                            <circle cx={hover.x} cy={hover.y} r={5} className="dot-hover" />
                        </g>
                    )}
                    {txs.map((t) => {
                        const cx = x(t.ts);
                        const cy = y(t.price);
                        const active = txHover?.t === t;
                        return (
                            <circle key={t.ts + t.type} cx={cx} cy={cy} r={t.type === 'Mua' ? 7 : 7.5}
                                className={`${t.type === 'Mua' ? 'dot-buy' : 'dot-sell'}${active ? ' dot-active' : ''}`}
                                onMouseEnter={() => { setHover(null); setTxHover({ t, x: cx, y: cy }); }}
                                onMouseLeave={() => { if (!window.matchMedia('(pointer: coarse)').matches) setTxHover(null); }}
                                onClick={(e) => { e.stopPropagation(); setTxHover((prev) => (prev && prev.t === t ? null : { t, x: cx, y: cy })); }} />
                        );
                    })}
                    <circle cx={x(last[0])} cy={y(last[1])} r={4.5} className="dot-now" />
                </svg>
            )}
            {hover && !txHover && (
                <div className="tooltip" style={{ left: Math.min(Math.max(hover.x, 90), width - 90) }}>
                    <strong>{usd0(hover.price)}</strong>
                    <span>{tsDateVi(hover.ts)}</span>
                </div>
            )}
            {txHover && (
                <div className="txtooltip" style={{ left: Math.min(Math.max(txHover.x, 110), width - 110), top: txHover.y + 6 }}>
                    <strong className={txHover.t.type === 'Mua' ? 'buytxt' : 'selltxt'}>{txHover.t.type} · {dateVi(txHover.t.date)}</strong>
                    <span>{btcFmt(Math.abs(txHover.t.btc))} BTC @ {usd0(txHover.t.price)}</span>
                    <span className="ttval">{usd(Math.abs(txHover.t.usd))} · ≈ {vnd(Math.abs(txHover.t.vnd))}</span>
                    {txHover.t.type === 'Mua' ? (
                        <>
                            <span className={(PRICE_NOW - txHover.t.price) * Math.abs(txHover.t.btc) >= 0 ? 'buytxt' : 'selltxt'}>
                                Hiện tại: {usd((PRICE_NOW - txHover.t.price) * Math.abs(txHover.t.btc))}
                            </span>
                            <span>{pct((PRICE_NOW / txHover.t.price - 1) * 100)} so với giá mua</span>
                        </>
                    ) : (
                        <>
                            <span>Chênh giá bán với hiện tại: {usd(txHover.t.price - PRICE_NOW, 0)}/BTC</span>
                            <span>{pct((txHover.t.price / PRICE_NOW - 1) * 100)} · {usd(Math.abs(txHover.t.btc) * (txHover.t.price - PRICE_NOW))} trên lượng đã bán</span>
                        </>
                    )}
                </div>
            )}
            <div className="legend">
                <span><i className="lg-line" /> Giá BTC</span>
                <span><i className="lg-buy" /> Lần DCA mua ({BUYS})</span>
                <span><i className="lg-sell" /> Lần bán ({SELLS})</span>
                <span><i className="lg-avg" /> Giá vốn TB</span>
            </div>
        </div>
    );
}

export function App() {
    const [rangeKey, setRangeKey] = useState('all');
    const up = UNREALIZED >= 0;
    return (
        <main className="page-shell">
            <div className="dark">
                <div className="topbar">
                    <div className="brand"><span className="blogo">₿</span> BTC Portfolio</div>
                    <div className="live"><span className="livedot" /> Giá cập nhật {dateVi(MARKET.updatedAt.slice(0, 10))}</div>
                </div>
                <h1 className="title">Danh mục đầu tư BTC của Mike</h1>
                <p className="intro">Hành trình DCA Bitcoin từ tháng 1/2022: {TXS.length} giao dịch, {BUYS} lần mua đều đặn và {SELLS} lần chốt một phần. Mỗi chấm trên biểu đồ là một lần mua hoặc bán thật, đặt đúng ngày và đúng giá.</p>

                <div className="heroStat">
                    <div className="heroLabel">Giá trị hiện tại</div>
                    <div className="heroValue">{usd(VALUE_NOW)}</div>
                    <div className="heroSub">
                        <span>₿ {btcFmt(HELD)}</span>
                        <span>Giá vốn TB: {usd0(AVG_COST)}</span>
                        <span className={up ? 'up' : 'down'}>{up ? '▲' : '▼'} {pct(UNREALIZED_PCT)} ({usd(UNREALIZED, 0)})</span>
                    </div>
                    <div className="heroNote">Giá BTC {usd0(PRICE_NOW)} · ≈ {vnd(VALUE_NOW * VND_RATE)}</div>
                </div>

                <div className="statGrid">
                    <div className="stat"><div className="sLabel">BTC đang giữ</div><div className="sValue">₿ {HELD.toFixed(8)}</div></div>
                    <div className="stat"><div className="sLabel">Giá vốn đang giữ</div><div className="sValue">{usd(COST_BASIS)}</div></div>
                    <div className="stat"><div className="sLabel">Lãi/lỗ chưa chốt</div><div className={`sValue ${up ? 'up' : 'down'}`}>{usd(UNREALIZED)}</div><div className="sSub">{pct(UNREALIZED_PCT)}</div></div>
                    <div className="stat"><div className="sLabel">Lãi/lỗ đã chốt</div><div className={`sValue ${REALIZED >= 0 ? 'up' : 'down'}`}>{usd(REALIZED)}</div><div className="sSub">{SELLS} lần bán</div></div>
                </div>

                <div className="sectionHead">
                    <h2>Giá BTC và các lần DCA</h2>
                    <div className="ranges">
                        {RANGES.map((r) => (
                            <button key={r.key} className={rangeKey === r.key ? 'range active' : 'range'} onClick={() => setRangeKey(r.key)}>{r.label}</button>
                        ))}
                    </div>
                </div>
                <PriceChart rangeKey={rangeKey} />

                <h2 className="h2">Lịch sử giao dịch</h2>
                <div className="tableWrap">
                    <table>
                        <thead>
                            <tr><th>Ngày</th><th>Loại</th><th className="r">Số BTC</th><th className="r">Giá BTC</th><th className="r">USD</th><th className="r">VND</th></tr>
                        </thead>
                        <tbody>
                            {[...TXS].reverse().map((t, i) => (
                                <tr key={i} className={t.type === 'Bán' ? 'sell' : ''}>
                                    <td>{dateVi(t.date)}</td>
                                    <td>{t.type}</td>
                                    <td className="r">{btcFmt(Math.abs(t.btc))}</td>
                                    <td className="r">{usd0(t.price)}</td>
                                    <td className="r">{usd(Math.abs(t.usd))}</td>
                                    <td className="r">{vnd(Math.abs(t.vnd))}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <footer className="closing">
                    Giá BTC hiện tại và lịch sử từ CoinGecko, tự cập nhật qua GitHub Actions. Giao dịch từ Sheet BTC riêng tư, chỉ dữ liệu đã lọc được đưa lên trang public. Trang chỉ để xem, không mua bán gì ở đây.
                </footer>
            </div>
        </main>
    );
}
