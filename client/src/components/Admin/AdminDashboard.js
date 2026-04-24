import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import confetti from 'canvas-confetti';
import jsPDF from 'jspdf';
import Particles from "react-tsparticles";
import { loadSlim } from "tsparticles-slim";
import autoTable from 'jspdf-autotable';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Toaster, toast } from 'sonner';
import CountUp from 'react-countup';
import {
  LayoutDashboard, Zap, Download, ScrollText, CheckCircle, XCircle,
  FileSearch, ShieldAlert, Rocket, Search, AlertTriangle, Clock,
  User, Eye, Receipt, ShieldCheck, FileText, CheckCircle2,
  FileSignature, Fingerprint, ScanLine, Building2,BadgeCheck
} from 'lucide-react';
import './AdminDashboard.css';

const STANDARD_TYPES = ["Research", "Travel", "Equipment", "Stipend"];
const ALL_STATUSES = ["Pending", "Phase 1 Approved", "Awaiting Review", "Fully Disbursed", "Evaluated", "Rejected", "Blocked", "WITHDRAWN"];
const API = 'http://localhost:3001';

const getRisk = (score) => {
  const s = parseInt(score);
  if (isNaN(s)) return { label: 'Unknown', color: '#64748b', bg: 'rgba(100,116,139,0.14)', dot: '#64748b' };
  if (s >= 750) return { label: 'Low Risk', color: '#34d399', bg: 'rgba(52,211,153,0.12)', dot: '#34d399' };
  if (s >= 600) return { label: 'Med Risk', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', dot: '#fbbf24' };
  return { label: 'High Risk', color: '#f87171', bg: 'rgba(248,113,113,0.12)', dot: '#f87171' };
};

const daysSince = (dateStr) => { const d = new Date(dateStr); return isNaN(d) ? 0 : Math.floor((Date.now() - d) / 86400000); };
const ACTION_STATUSES = ['Pending', 'Awaiting Review', 'Blocked'];
const HOLD_CATEGORY_OPTIONS = [
  "RECEIPT_MISMATCH",
  "SUSPICIOUS_PROOF",
  "MISSING_DOCUMENTS",
  "FRAUD_ALERT",
  "MANUAL_REVIEW",
  "OTHER"
];
const formatHoldLabel = (value) =>
  value
    .toLowerCase()
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
const formatReason = (reason) => {
  if (!reason) return '';
  return reason
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
};
const formatLabel = (text) => {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
};
const formatStatus = (status) => {
  if (!status) return '';
  return status
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
};
const isWithdrawalRequested = (grant) => grant?.withdrawalRequested === true;
const getAdminDisplayStatus = (grant) => {
  if (grant.withdrawalRequested) {
    return "WITHDRAWAL_REQUESTED";
  }
  if (grant.status === "REQUEST_ACCEPTED") {
    return "WITHDRAWN";
  }
  // NEW: Immediately check if it's on hold, regardless of other statuses
  if (grant?.holdDetails?.isOnHold) {
    return "ON_HOLD";
  }
  return grant.status;
};

const STATUS_COLORS = {
  All: '#4f9cf9', Pending: '#fbbf24', 'Phase 1 Approved': '#34d399',
  'Awaiting Review': '#f97316', 'Fully Disbursed': '#a78bfa',
  Evaluated: '#22d3ee', Rejected: '#f87171', Blocked: '#b91c1c', WITHDRAWN: '#f59e0b'
};

const triggerEdgeGlow = (status = 'Approved') => {
  const isReject = status.includes('Reject') || status.includes('Block');
  const glowClass = isReject ? 'edge-glow-red' : 'edge-glow-green';
  document.body.classList.remove('edge-glow-green', 'edge-glow-red');
  void document.body.offsetWidth;
  document.body.classList.add(glowClass);
  setTimeout(() => document.body.classList.remove(glowClass), 1200);
};

const SpringTooltip = ({ text, children }) => {
  const [show, setShow] = useState(false);
  const [pos, setPos] = React.useState({ x: 0, y: 0 });
  const handleMM = (e) => { setPos({ x: e.clientX + 14, y: e.clientY - 40 }); };

  return (
    <div style={{ display: 'inline-block' }} onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)} onMouseMove={handleMM}>
      {show && createPortal(
        <div className="cyber-tooltip" style={{ position: 'fixed', top: pos.y, left: pos.x, zIndex: 9999, pointerEvents: 'none' }}>
          {text}
        </div>,
        document.body
      )}
      {children}
    </div>
  );
};

// ============================================================================
// COMMAND PALETTE
// ============================================================================
const CommandPalette = ({ show, onClose, actions }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  const filteredActions = actions.filter(a => {
    const q = query.toLowerCase();
    return a.label.toLowerCase().includes(q) || a.keywords.some(k => k.toLowerCase().includes(q));
  });

  useEffect(() => {
    if (show) { setQuery(''); setSelectedIndex(0); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [show]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!show) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(prev => (prev + 1) % (filteredActions.length || 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(prev => (prev - 1 + filteredActions.length) % (filteredActions.length || 1)); }
      if (e.key === 'Enter' && filteredActions[selectedIndex]) {
        e.preventDefault(); filteredActions[selectedIndex].action(); onClose();
      }
      // Note: Esc is handled globally now!
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [show, filteredActions, selectedIndex, onClose]);

  if (!show) return null;

  return createPortal(
    <motion.div className="modal-overlay" style={{ zIndex: 99999, alignItems: 'flex-start', paddingTop: '12vh' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="command-palette" initial={{ scale: 0.95, opacity: 0, y: -20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: -20 }} transition={{ type: 'spring', damping: 25, stiffness: 400 }} onClick={e => e.stopPropagation()}>
        <div className="command-palette-search">
          <Search size={18} color="var(--accent-blue)" />
          <input ref={inputRef} value={query} onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }} placeholder="Search commands or actions..." style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '16px', outline: 'none', fontFamily: 'inherit' }} />
          <kbd className="command-palette-kbd">ESC</kbd>
        </div>
        <div className="command-palette-list dark-scroll">
          {filteredActions.length > 0 ? filteredActions.map((action, i) => (
            <div key={action.id} className={`command-palette-item ${i === selectedIndex ? 'active' : ''}`} onClick={() => { action.action(); onClose(); }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ color: i === selectedIndex ? 'var(--accent-blue)' : 'var(--text-muted)' }}>{action.icon}</span>
                <span>{action.label}</span>
              </div>
              {action.shortcut && <kbd className="command-palette-kbd">{action.shortcut}</kbd>}
            </div>
          )) : (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>No matching commands found.</div>
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
};

// ============================================================================
// HIGH-STAKES MICRO-INTERACTION: "HOLD TO AUTHORIZE" BUTTON
// ============================================================================
const HoldToApproveButton = ({ onApprove }) => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('idle');
  const [hash, setHash] = useState('');
  const intervalRef = useRef(null);

  const startHold = (e) => {
    if (status !== 'idle') return;
    setStatus('holding');
    intervalRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(intervalRef.current);
          completeAction();
          return 100;
        }
        return prev + 3;
      });
    }, 30);
  };

  const stopHold = () => {
    if (status === 'holding') {
      clearInterval(intervalRef.current);
      setProgress(0);
      setStatus('idle');
    }
  };

  const completeAction = () => {
    setStatus('authorized');
    triggerEdgeGlow('Approved');

    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#34d399', '#10b981', '#4f9cf9', '#ffffff'],
      zIndex: 99999
    });

    const chars = '0123456789ABCDEF';
    let fakeHash = '0x';
    for (let i = 0; i < 14; i++) fakeHash += chars[Math.floor(Math.random() * chars.length)];

    setTimeout(() => {
      setStatus('sealing');
      setHash(fakeHash);

      setTimeout(() => {
        onApprove();
      }, 1200);
    }, 500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', width: '220px' }}>
      <motion.button
        onPointerDown={startHold}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        whileHover={status === 'idle' ? { scale: 1.02 } : {}}
        whileTap={status === 'idle' ? { scale: 0.98 } : {}}
        style={{
          position: 'relative', overflow: 'hidden', width: '100%', padding: '8px 12px', borderRadius: '8px',
          background: status === 'authorized' || status === 'sealing' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(52, 211, 153, 0.15)',
          border: `1px solid ${status === 'authorized' || status === 'sealing' ? '#10b981' : 'rgba(52, 211, 153, 0.4)'}`,
          color: 'var(--accent-green)',
          boxShadow: status === 'authorized' || status === 'sealing' ? '0 0 20px rgba(16, 185, 129, 0.4)' : 'none',
          cursor: status === 'idle' ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          fontFamily: 'DM Sans', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase',
          transition: 'all 0.2s', touchAction: 'none'
        }}
      >
        {status === 'holding' && (
          <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: `${progress}%`, background: 'rgba(52, 211, 153, 0.3)', zIndex: 0 }} />
        )}

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
          {status === 'idle' && <><CheckCircle size={14} /> Hold to Approve</>}
          {status === 'holding' && <><CheckCircle size={14} /> Approving... {Math.round(progress)}%</>}
          {(status === 'authorized' || status === 'sealing') && <><CheckCircle2 size={14} /> Sealed & Approved</>}
        </div>
      </motion.button>

      <AnimatePresence>
        {status === 'sealing' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--accent-green)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <ShieldCheck size={10} /> TXN: {hash}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};


// ============================================================================
// SKELETON LOADERS
// ============================================================================
const SkeletonCard = () => (
  <div className="glass-card stat-card" style={{ borderBottom: '2px solid rgba(255,255,255,0.05)', height: '124px', position: 'relative', overflow: 'hidden' }}>
    <div className="skeleton-shimmer"></div>
    <div style={{ width: '40%', height: '14px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', marginBottom: 'auto' }}></div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '30px' }}>
      <div style={{ width: '50%', height: '32px', background: 'rgba(255,255,255,0.1)', borderRadius: '6px' }}></div>
      <div style={{ width: '64px', height: '28px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}></div>
    </div>
  </div>
);

const SkeletonRow = () => (
  <div className="history-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px', height: '180px', position: 'relative', overflow: 'hidden' }}>
    <div className="skeleton-shimmer"></div>
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <div style={{ width: '25%', height: '16px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px' }}></div>
      <div style={{ width: '15%', height: '16px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px' }}></div>
    </div>
    <div style={{ width: '60%', height: '24px', background: 'rgba(255,255,255,0.1)', borderRadius: '6px', margin: '8px 0' }}></div>
    <div style={{ width: '40%', height: '14px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}></div>
    <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
      <div style={{ width: '80px', height: '32px', background: 'rgba(255,255,255,0.08)', borderRadius: '16px' }}></div>
      <div style={{ width: '80px', height: '32px', background: 'rgba(255,255,255,0.08)', borderRadius: '16px' }}></div>
    </div>
  </div>
);

const BAR_MAX_H = 240;
const LABEL_H = 28;
const Y_LABEL_W = 46;

const FramerBarChart = ({ data, isDarkMode }) => {
  const max = Math.max(...data.map(d => d.amount), 10);
  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  const [tooltip, setTooltip] = useState({ show: false, text: '', x: 0, y: 0 });

  if (data.length === 0) return <div className="no-data">No disbursed grants yet</div>;

  const CANVAS_H = BAR_MAX_H + LABEL_H;

  return (
    <div style={{ display: 'flex', height: `${CANVAS_H}px`, marginTop: '16px', userSelect: 'none' }}>

      <div style={{ width: `${Y_LABEL_W}px`, flexShrink: 0, position: 'relative' }}>
        {yTicks.map(t => (
          <div key={t} style={{
            position: 'absolute',
            bottom: LABEL_H + t * BAR_MAX_H - 7,
            right: 8,
            fontSize: '10px',
            color: 'var(--text-muted)',
            fontFamily: 'DM Sans',
            fontWeight: '600',
            whiteSpace: 'nowrap',
            textAlign: 'right',
          }}>
            {t === 0 ? '₹0' : `₹${((max * t) / 1000).toFixed(0)}k`}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
        {yTicks.filter(t => t > 0).map(t => (
          <div key={t} style={{
            position: 'absolute',
            left: 0, right: 0,
            bottom: LABEL_H + t * BAR_MAX_H,
            height: 0,
            borderTop: t === 1
              ? '1px solid rgba(255,255,255,0.08)'
              : '1px dashed rgba(255,255,255,0.05)',
            pointerEvents: 'none',
            zIndex: 0,
          }} />
        ))}
        <div style={{
          position: 'absolute',
          left: 0, right: 0,
          bottom: LABEL_H,
          height: '1px',
          background: 'rgba(255,255,255,0.12)',
          zIndex: 1,
        }} />
        <div style={{
          position: 'absolute',
          left: 0, right: 0,
          bottom: LABEL_H,
          height: BAR_MAX_H,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-around',
          padding: '0 4px',
          zIndex: 2,
        }}>
          {data.map((d, i) => {
            const totalH = Math.round((d.amount / max) * BAR_MAX_H);
            const releasedH = Math.round(((d.disbursedAmount || 0) / max) * BAR_MAX_H);
            const lockedH = totalH - releasedH;
            const s = parseInt(d.creditScore);
            const color = s >= 750 ? '#10b981' : s >= 600 ? '#f59e0b' : '#ef4444';
            const pct = d.amount > 0 ? Math.round(((d.disbursedAmount || 0) / d.amount) * 100) : 0;

            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  alignItems: 'stretch',
                  height: '100%',
                  width: '100%',
                  maxWidth: '52px',
                  cursor: 'crosshair',
                  flexShrink: 0,
                }}
                onMouseMove={e => {
                  setTooltip({ show: true, text: `${d.source}: ₹${(d.disbursedAmount || 0).toLocaleString()} / ₹${d.amount.toLocaleString()} (${pct}%)`, x: e.clientX + 14, y: e.clientY - 40 });
                }}
                onMouseLeave={() => setTooltip(p => ({ ...p, show: false }))}
              >
                {lockedH > 1 && (
                  <motion.div
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ delay: i * 0.07, duration: 0.5, type: 'spring', bounce: 0.15 }}
                    style={{
                      height: lockedH,
                      background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                      borderTopLeftRadius: 5, borderTopRightRadius: 5,
                      border: '1px solid var(--border-subtle)',
                      borderBottom: 'none',
                      transformOrigin: 'bottom center',
                      flexShrink: 0,
                    }}
                  />
                )}
                {releasedH > 0 && (
                  <motion.div
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ delay: i * 0.07 + 0.06, duration: 0.55, type: 'spring', bounce: 0.15 }}
                    whileHover={{ filter: 'brightness(1.18)' }}
                    style={{
                      height: releasedH,
                      background: `linear-gradient(to top, ${color}99, ${color})`,
                      borderRadius: lockedH <= 1 ? '5px 5px 2px 2px' : '0 0 2px 2px',
                      boxShadow: `0 0 10px ${color}44`,
                      transformOrigin: 'bottom center',
                      flexShrink: 0,
                    }}
                  />
                )}
                {releasedH === 0 && totalH > 0 && (
                  <motion.div
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ delay: i * 0.07, duration: 0.5 }}
                    style={{
                      height: totalH,
                      background: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                      borderRadius: '5px 5px 2px 2px',
                      border: '1px solid var(--border-subtle)',
                      transformOrigin: 'bottom center',
                      flexShrink: 0,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div style={{
          position: 'absolute',
          left: 0, right: 0,
          bottom: 0,
          height: LABEL_H,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          padding: '0 4px',
          zIndex: 2,
        }}>
          {data.map((d, i) => (
            <div key={i} style={{
              width: '100%', maxWidth: '52px',
              fontSize: '11px',
              color: 'var(--text-muted)',
              fontFamily: 'DM Sans',
              fontWeight: '600',
              textAlign: 'center',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {d.source.split(' ')[0]}
            </div>
          ))}
        </div>
      </div>
      {tooltip.show && createPortal(
        <div className="cyber-tooltip" style={{ position: 'fixed', top: tooltip.y, left: tooltip.x, zIndex: 9999, pointerEvents: 'none' }}>
          {tooltip.text}
        </div>,
        document.body
      )}
    </div>
  );
};

const FramerDonutChart = ({ data }) => {
  const entries = Object.entries(data);
  const total = entries.reduce((s, [_, val]) => s + val, 0);
  const colors = ['#4f9cf9', '#34d399', '#a78bfa', '#f87171', '#22d3ee'];
  const radius = 70;
  const circum = 2 * Math.PI * radius;

  const [hoveredIdx, setHoveredIdx] = useState(null);

  if (total === 0) return <div className="no-data">No disbursals yet</div>;

  const segments = [];
  let currentOffset = 0;
  for (let i = 0; i < entries.length; i++) {
    const [label, val] = entries[i];
    const strokeLen = (val / total) * circum;
    segments.push({ label, val, strokeLen, offset: currentOffset, color: colors[i % colors.length] });
    currentOffset += strokeLen;
  }

  const getSegmentAtPoint = (svgEl, clientX, clientY) => {
    const rect = svgEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const scale = rect.width / 220;
    const innerR = (radius - 14) * scale;
    const outerR = (radius + 14) * scale;
    if (dist < innerR || dist > outerR) return null;

    let angle = Math.atan2(dy, dx) + Math.PI / 2;
    if (angle < 0) angle += 2 * Math.PI;
    const arcPos = angle * radius;

    for (const seg of segments) {
      if (arcPos >= seg.offset && arcPos < seg.offset + seg.strokeLen) return seg;
    }
    return segments[segments.length - 1];
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}
        onMouseMove={(e) => {
          const svg = e.currentTarget.querySelector('svg');
          if (!svg) return;
          const seg = getSegmentAtPoint(svg, e.clientX, e.clientY);
          if (seg) {
            setHoveredIdx(segments.indexOf(seg));
          } else {
            setHoveredIdx(null);
          }
        }}
        onMouseLeave={() => { setHoveredIdx(null); }}
      >
        <svg width="220" height="220" viewBox="-110 -110 220 220" style={{ transform: 'rotate(-90deg)', overflow: 'visible', cursor: 'crosshair' }}>
          {segments.map((seg, i) => (
            <motion.circle
              key={seg.label}
              cx="0" cy="0" r={radius} fill="none"
              stroke={seg.color}
              strokeWidth={hoveredIdx === i ? 34 : 28}
              strokeDasharray={`${seg.strokeLen} ${circum - seg.strokeLen}`}
              strokeDashoffset={-seg.offset}
              initial={{ strokeDasharray: `0 ${circum}` }}
              animate={{
                strokeDasharray: `${seg.strokeLen} ${circum - seg.strokeLen}`,
                strokeWidth: hoveredIdx === i ? 34 : 28,
                filter: hoveredIdx === i ? `drop-shadow(0 0 8px ${seg.color}99)` : 'none',
              }}
              transition={{ duration: 1.4, delay: i * 0.1, type: 'spring', bounce: 0.15 }}
              style={{ transformOrigin: 'center' }}
            />
          ))}
        </svg>

        <div style={{ position: 'absolute', textAlign: 'center', pointerEvents: 'none' }}>
          {hoveredIdx !== null ? (
            <motion.div key={hoveredIdx} initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.15 }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                {segments[hoveredIdx].label}
              </div>
              <div style={{ fontSize: '20px', fontWeight: '800', color: segments[hoveredIdx].color }}>
                ₹{segments[hoveredIdx].val >= 100000
                  ? (segments[hoveredIdx].val / 100000).toFixed(1) + 'L'
                  : segments[hoveredIdx].val.toLocaleString()}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {Math.round(segments[hoveredIdx].val / total * 100)}%
              </div>
            </motion.div>
          ) : (
            <motion.div key="total" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Total</div>
              <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)' }}>
                ₹{total >= 100000 ? (total / 100000).toFixed(1) + 'L' : total.toLocaleString()}
              </div>
            </motion.div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px', marginTop: '14px' }}>
        {segments.map((seg, i) => (
          <div key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: hoveredIdx === i ? seg.color : 'var(--text-secondary)', fontWeight: hoveredIdx === i ? '700' : '600', transition: 'color 0.15s' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: seg.color, boxShadow: hoveredIdx === i ? `0 0 6px ${seg.color}` : 'none', transition: 'box-shadow 0.15s' }}></span>
            {seg.label}
          </div>
        ))}
      </div>
    </div>
  );
};

const CyberText = ({ text, className }) => {
  const [displayText, setDisplayText] = useState(text);
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*";
  useEffect(() => {
    let iterations = 0;
    const interval = setInterval(() => {
      setDisplayText(t => text.split("").map((l, i) => {
        if (i < iterations) return text[i];
        return letters[Math.floor(Math.random() * letters.length)]
      }).join(""));
      if (iterations >= text.length) clearInterval(interval);
      iterations += 1 / 3;
    }, 30);
    return () => clearInterval(interval);
  }, [text]);
  return <span className={className}>{displayText}</span>;
};

const TiltCard = ({ children, className, style, onClick }) => {
  const x = useMotionValue(0); const y = useMotionValue(0);
  const mouseXSpring = useSpring(x); const mouseYSpring = useSpring(y);
  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["16deg", "-16deg"]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-16deg", "16deg"]);

  const [spotlight, setSpotlight] = useState({ x: 0, y: 0, opacity: 0 });

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width; const height = rect.height;
    const mX = e.clientX - rect.left; const mY = e.clientY - rect.top;
    x.set(mX / width - 0.5); y.set(mY / height - 0.5);
    setSpotlight({ x: mX, y: mY, opacity: 1 });
  };

  const handleMouseLeave = () => { x.set(0); y.set(0); setSpotlight(p => ({ ...p, opacity: 0 })); };

  return (
    <motion.div onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} style={{ rotateX, rotateY, transformStyle: "preserve-3d", perspective: "1000px", overflow: 'visible', cursor: onClick ? 'pointer' : 'default', ...style }} className={className} onClick={onClick}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', pointerEvents: 'none', zIndex: 0, background: `radial-gradient(circle 200px at ${spotlight.x}px ${spotlight.y}px, rgba(255,255,255,0.06), transparent)`, opacity: spotlight.opacity, transition: 'opacity 0.4s' }} />
      <div style={{ transform: "translateZ(52px)", position: 'relative', zIndex: 1, display: "flex", flexDirection: "column", height: "100%", justifyContent: "center" }}>
        {children}
      </div>
    </motion.div>
  );
};

const MagneticButton = ({ children, className, onClick, style }) => {
  const ref = useRef(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const handleMouse = (e) => {
    const { clientX, clientY } = e; const { height, width, left, top } = ref.current.getBoundingClientRect();
    setPosition({ x: (clientX - (left + width / 2)) * 0.2, y: (clientY - (top + height / 2)) * 0.2 });
  };
  const reset = () => setPosition({ x: 0, y: 0 });
  return (
    <motion.button ref={ref} onMouseMove={handleMouse} onMouseLeave={reset} animate={{ x: position.x, y: position.y }} whileTap={{ scale: 0.95 }} transition={{ type: "spring", stiffness: 150, damping: 15, mass: 0.1 }} className={className} onClick={onClick} style={style}>
      {children}
    </motion.button>
  );
};

export default function AdminDashboard({ currentUser, grantsList = [], fetchGrants, handleLogout, isDarkMode, toggleTheme }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [filterStatus, setFilterStatus] = useState('All');
  const [sortBy, setSortBy] = useState('Newest');
  const [searchQuery, setSearchQuery] = useState('');

  const [source, setSource] = useState('');
  const [amount, setAmount] = useState('');
  const [creditScore, setCreditScore] = useState('');
  const [type, setType] = useState('Research');

  const [viewingGrant, setViewingGrant] = useState(null);
  const [viewingApplication, setViewingApplication] = useState(null);
  const [viewingImpact, setViewingImpact] = useState(null);
  const [historyApplicant, setHistoryApplicant] = useState(null);
  const [enlargedImage, setEnlargedImage] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectNote, setRejectNote] = useState('');
  const [showLogs, setShowLogs] = useState(false);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [logs, setLogs] = useState([]);
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');

  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpTargetGrant, setOtpTargetGrant] = useState(null);
  const [otpInput, setOtpInput] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpTimeLeft, setOtpTimeLeft] = useState(300);

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkRejectNote, setBulkRejectNote] = useState('');
  const [showBulkReject, setShowBulkReject] = useState(false);

  const [xrayMode, setXrayMode] = useState(false);
  const [verifyingVendor, setVerifyingVendor] = useState(null);
  const [vendorStatus, setVendorStatus] = useState({});
  const [revealedGrantIds, setRevealedGrantIds] = useState(new Set());

  const [privateNoteText, setPrivateNoteText] = useState('');
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [holdTarget, setHoldTarget] = useState(null);
  const [holdHistoryTarget, setHoldHistoryTarget] = useState(null);
  const [holdCategory, setHoldCategory] = useState('RECEIPT_MISMATCH');
  const [customReasonInput, setCustomReasonInput] = useState('');
  const [showHoldCategoryMenu, setShowHoldCategoryMenu] = useState(false);
  const [holdAdminNotesInput, setHoldAdminNotesInput] = useState('');
  const [holdEvidenceFiles, setHoldEvidenceFiles] = useState([]);
  const [kycList,          setKycList]          = useState([]);
  const [kycImages,        setKycImages]        = useState({});
  const [kycRejectTarget,  setKycRejectTarget]  = useState(null);
  const [kycRejectNote,    setKycRejectNote]    = useState('');
  const [loadingKycImages, setLoadingKycImages] = useState({});
  const listRef = useRef(null);

  // ============================================================================
  // ✨ GLOBAL ESCAPE KEY LISTENER (Smart Modal & Image Closing)
  // ============================================================================
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        if (enlargedImage) {
          setEnlargedImage(null);
        } else if (showCommandPalette) {
          setShowCommandPalette(false);
        } else if (showOtpModal) {
          setShowOtpModal(false);
          setOtpTargetGrant(null);
          setOtpInput('');
          setOtpError('');
        } else if (rejectTarget) {
          setRejectTarget(null);
          setRejectNote('');
        } else if (showBulkReject) {
          setShowBulkReject(false);
        } else if (viewingGrant) {
          setViewingGrant(null);
          setXrayMode(false);
        } else if (viewingApplication) {
          setViewingApplication(null);
        } else if (viewingImpact) {
          setViewingImpact(null);
        } else if (historyApplicant) {
          setHistoryApplicant(null);
        } else if (showLogs) {
          setShowLogs(false);
        } else if (showExportPanel) {
          setShowExportPanel(false);
        }
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [
    enlargedImage, showCommandPalette, showOtpModal, rejectTarget, showBulkReject,
    viewingGrant, viewingApplication, viewingImpact, historyApplicant, showLogs, showExportPanel
  ]);

  useEffect(() => {
    let interval = null;
    if (showOtpModal && otpTimeLeft > 0) interval = setInterval(() => setOtpTimeLeft(prev => prev - 1), 1000);
    else if (otpTimeLeft <= 0) clearInterval(interval);
    return () => clearInterval(interval);
  }, [showOtpModal, otpTimeLeft]);

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    fetchGrants();
  }, [fetchGrants]);

  const particlesInit = useCallback(async engine => { await loadSlim(engine); }, []);
  const toggleSelect = (id) => { setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; }); };
  const clearSelection = () => setSelectedIds(new Set());

  const toggleSelectAll = () => {
    const visibleIds = processedGrants.filter(g => ACTION_STATUSES.includes(g.status)).map(g => g.id);
    const allSelected = visibleIds.every(id => selectedIds.has(id));
    if (allSelected) { setSelectedIds(prev => { const next = new Set(prev); visibleIds.forEach(id => next.delete(id)); return next; }); }
    else { setSelectedIds(prev => { const next = new Set(prev); visibleIds.forEach(id => next.add(id)); return next; }); }
  };

  const bulkApprove = async () => {
    const pendingSelected = [...selectedIds].filter(id => grantsList.find(g => g.id === id)?.status === 'Pending');
    toast.promise(
      Promise.all(pendingSelected.map(id => axios.post(`${API}/update-status`, { id, status: 'Phase 1 Approved', actionBy: currentUser, adminEmail: localStorage.getItem('currentUserEmail') }))),
      { loading: 'Approving...', success: () => { fetchGrants(); clearSelection(); triggerEdgeGlow('Approved'); return `Approved ${pendingSelected.length} grants!`; }, error: 'Failed to approve.' }
    );
  };

  const bulkReject = async () => {
    if (!bulkRejectNote.trim()) return toast.warning('Please provide a rejection reason.');
    const rejectableIds = [...selectedIds].filter(id => ACTION_STATUSES.includes(grantsList.find(g => g.id === id)?.status));
    toast.promise(
      Promise.all(rejectableIds.map(id => axios.post(`${API}/update-status`, { id, status: 'Rejected', actionBy: currentUser, note: bulkRejectNote, adminEmail: localStorage.getItem('currentUserEmail') }))),
      { loading: 'Rejecting...', success: () => { fetchGrants(); clearSelection(); setShowBulkReject(false); setBulkRejectNote(''); return `Rejected ${rejectableIds.length} grants.`; }, error: 'Failed to reject.' }
    );
  };

  const bulkExportPDF = () => {
    toast.success('Generating Selected PDF Export...');
    const selected = grantsList.filter(g => selectedIds.has(g.id));
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text(`Selected Grants Export (${selected.length})`, 14, 20);
    doc.setFontSize(10); doc.setTextColor(100); doc.text(`By: ${currentUser} · ${new Date().toLocaleDateString()}`, 14, 28);
    autoTable(doc, {
      startY: 36, head: [['ID', 'Applicant', 'Type', 'Amount', 'Disbursed', 'Status', 'Risk']],
      body: selected.map(g => [g.id, g.source, g.type, `₹${g.amount.toLocaleString()}`, `₹${(g.disbursedAmount || 0).toLocaleString()}`, g.status, getRisk(g.creditScore).label]),
      theme: 'grid', headStyles: { fillColor: [30, 58, 138] },
    });
    doc.save(`Selected_Grants_${Date.now()}.pdf`);
  };

  const selCount = selectedIds.size;
  const selPending = [...selectedIds].filter(id => grantsList.find(g => g.id === id)?.status === 'Pending').length;
  const selRejectable = [...selectedIds].filter(id => ACTION_STATUSES.includes(grantsList.find(g => g.id === id)?.status)).length;
  const fetchLogs = () => axios.get(`${API}/logs`).then(r => setLogs(r.data)).catch(() => { });
  const fetchKyc = () => axios.get(`${API}/verifications`).then(r => setKycList(r.data)).catch(() => {});
  const addLog = ({ type, message, grantId }) => axios.post(`${API}/api/admin/logs`, {
    type,
    message,
    timestamp: new Date(),
    grantId,
    admin: currentUser
  });

const loadKycImages = (email) => {
  if (kycImages[email]) return;
  setLoadingKycImages(prev => ({ ...prev, [email]: true }));
  axios.get(`${API}/verification-images/${email}`)
    .then(r => setKycImages(prev => ({ ...prev, [email]: r.data })))
    .finally(() => setLoadingKycImages(prev => ({ ...prev, [email]: false })));
};

const reviewKyc = (email, decision, note = '') => {
  axios.post(`${API}/review-verification`, {
    email, decision, note, reviewedBy: currentUser
  }).then(() => {
    fetchKyc();
    triggerEdgeGlow(decision === 'Approved' ? 'Approved' : 'Rejected');
    toast.success(`KYC ${decision} for ${email}`);
    setKycRejectTarget(null);
    setKycRejectNote('');
  }).catch(() => toast.error('Failed to review KYC'));
};

  const fullyDisbursedGrants = grantsList.filter(g => g.status === 'Fully Disbursed' || g.status === 'Evaluated');
  const totalImpact = grantsList.reduce((s, g) => s + (g.disbursedAmount || 0), 0);
  const pendingCount = grantsList.filter(g => g.status === 'Pending' || g.status === 'Awaiting Review').length;
  const verifications = kycList;
  const kycPendingCount = (verifications || []).filter(
    v => v.status === "Pending"
  ).length;
  const actionQueue = grantsList
    .filter(g => ACTION_STATUSES.includes(g.status))
    .map(g => ({ ...g, waitDays: daysSince(g.date) }))
    .sort((a, b) => {
      const withdrawalPriority = Number(isWithdrawalRequested(b)) - Number(isWithdrawalRequested(a));
      if (withdrawalPriority !== 0) return withdrawalPriority;
      return b.waitDays - a.waitDays;
    });

  const processedGrants = useMemo(() => {
    let list = [...grantsList];
    if (filterStatus !== 'All') list = list.filter(g => g.status === filterStatus);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(g => g.source?.toLowerCase().includes(q) || g.type?.toLowerCase().includes(q));
    }
    switch (sortBy) {
      case 'Amount': return list.sort((a, b) => b.amount - a.amount);
      case 'Risk': return list.sort((a, b) => parseInt(a.creditScore || 999) - parseInt(b.creditScore || 999));
      case 'Waiting': return list.sort((a, b) => daysSince(b.date) - daysSince(a.date));
      default: return list.reverse();
    }
  }, [grantsList, filterStatus, searchQuery, sortBy]);

  useEffect(() => {
    const timer = setTimeout(() => setInitialLoad(false), 1000);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    fetchKyc();
    const interval = setInterval(fetchKyc, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setRevealedGrantIds(prev => {
      const visibleIds = new Set(processedGrants.map(g => g.id));
      const next = new Set([...prev].filter(id => visibleIds.has(id)));
      if (processedGrants[0]?.id != null) next.add(processedGrants[0].id);
      return next;
    });
  }, [processedGrants]);

  const statusCounts = useMemo(() => { const c = { All: grantsList.length }; ALL_STATUSES.forEach(s => { c[s] = grantsList.filter(g => g.status === s).length; }); return c; }, [grantsList]);
  const getApplicantGrants = (src) => grantsList.filter(g => g.source?.toLowerCase() === src?.toLowerCase());

  const updateStatus = (id, newStatus, note = '', otpCode = '') => {
    const adminEmail = localStorage.getItem('currentUserEmail') || 'shauryacocid@gmail.com';
    axios.post(`${API}/update-status`, { id: Number(id), status: newStatus, actionBy: currentUser, note, otp: otpCode, adminEmail })
      .then(() => {
        fetchGrants(); setViewingGrant(null); setRejectTarget(null); setRejectNote(''); setShowOtpModal(false); setOtpInput(''); setOtpError(''); setXrayMode(false);
      })
      .catch(err => {
        if (newStatus === 'Fully Disbursed') setOtpError(err.response?.data?.message || 'Invalid OTP');
        else toast.error(err.response?.data?.message || 'Error updating status');
      });
  };

  const openHoldModal = (grant) => {
    setHoldTarget(grant);
    setHoldCategory('RECEIPT_MISMATCH');
    setCustomReasonInput('');
    setShowHoldCategoryMenu(false);
    setHoldAdminNotesInput('');
    setHoldEvidenceFiles([]);
  };

  const closeHoldModal = () => {
    setHoldTarget(null);
    setHoldCategory('RECEIPT_MISMATCH');
    setCustomReasonInput('');
    setShowHoldCategoryMenu(false);
    setHoldAdminNotesInput('');
    setHoldEvidenceFiles([]);
  };

  const openHoldHistoryModal = (grant) => {
    setHoldHistoryTarget(grant);
  };

  const closeHoldHistoryModal = () => {
    setHoldHistoryTarget(null);
  };

  const confirmGrantHold = () => {
    if (!holdTarget) return;
    const resolvedReason = holdCategory === "OTHER"
      ? customReasonInput
      : holdCategory;
    axios.post(`${API}/api/admin/grants/${holdTarget.id}/hold`, {
      holdStatus: "SOFT_HOLD",
      holdReason: resolvedReason,
      holdCategory: holdCategory,
      adminNotes: holdAdminNotesInput,
      evidenceFiles: holdEvidenceFiles.map(file => file.name)
    })
      .then(() => {
        fetchGrants();
        closeHoldModal();
      })
      .catch(err => toast.error(err.response?.data?.message || 'Failed to put grant on hold'));
  };

  const releaseGrantHold = (grant) => {
    axios.post(`${API}/api/admin/grants/${grant.id}/release-hold`)
      .then(() => {
        fetchGrants();
      })
      .catch(err => toast.error(err.response?.data?.message || 'Failed to release hold'));
  };

  const updateGrant = (grantId, payload) => {
    return axios.post(`${API}/api/admin/grants/${grantId}/withdrawal-action`, payload);
  };

  const handleApproveWithdrawal = (grantId) => {
    updateGrant(grantId, { action: 'APPROVE', actionBy: currentUser })
      .then(() => addLog({
        type: "WITHDRAWAL_APPROVED",
        message: "Admin approved withdrawal request",
        grantId
      }).catch(() => {}))
      .then(() => {
        fetchGrants();
        fetchLogs();
        toast.success('Withdrawal approved.');
      })
      .catch(err => toast.error(err.response?.data?.message || 'Failed to approve withdrawal'));
  };

  const handleRejectWithdrawal = (grantId) => {
    updateGrant(grantId, { action: 'REJECT', actionBy: currentUser })
      .then(() => addLog({
        type: "WITHDRAWAL_REJECTED",
        message: "Admin rejected withdrawal request",
        grantId
      }).catch(() => {}))
      .then(() => {
        fetchGrants();
        fetchLogs();
        toast.success('Withdrawal request rejected.');
      })
      .catch(err => toast.error(err.response?.data?.message || 'Failed to reject withdrawal'));
  };

  const handleAddPrivateNote = (grantId) => {
    if (!privateNoteText.trim()) return;
    axios.post(`${API}/add-private-note`, { grantId, text: privateNoteText, admin: currentUser })
      .then(res => {
        setViewingGrant(res.data);
        setPrivateNoteText('');
        fetchGrants();
      })
      .catch(err => toast.error('Failed to save private note.'));
  };

  const initiateVaultRelease = (grant) => {
    const adminEmail = localStorage.getItem('currentUserEmail') || 'shauryacocid@gmail.com';
    const promise = axios.post(`${API}/generate-otp`, { adminEmail })
      .then(() => { setOtpTargetGrant(grant); setShowOtpModal(true); setOtpError(''); setOtpInput(''); setViewingGrant(null); setOtpTimeLeft(300); })
    toast.promise(promise, { loading: 'Securing Vault Connection...', success: 'OTP Sent to your verified email', error: 'Failed to initialize Vault.' });
  };

  const confirmOtpRelease = () => {
    if (!otpInput || otpInput.length < 6) { setOtpError("Please enter the full 6-digit code."); return; }
    updateStatus(otpTargetGrant.id, 'Fully Disbursed', '', otpInput);
  };

  const addGrant = () => {
    if (!source || !amount || !creditScore) return toast.warning('Fill all required fields');
    axios.post(`${API}/add-grant`, { source, amount: parseInt(amount), type, creditScore })
      .then(() => { fetchGrants(); setSource(''); setAmount(''); setCreditScore(''); toast.success("Record Injected"); })
      .catch(err => toast.error(err.response?.data?.message || 'Error injecting record'));
  };

  const exportToPDF = () => {
    toast.success('Generating Master Report...');
    const dateFilter = g => {
      if (!exportFrom && !exportTo) return true;
      const d = new Date(g.date);
      return (!exportFrom || d >= new Date(exportFrom)) && (!exportTo || d <= new Date(exportTo));
    };
    const filtered = grantsList.filter(dateFilter);
    const doc = new jsPDF();
    doc.setFillColor(7, 9, 15); doc.rect(0, 0, 210, 297, 'F');
    doc.setTextColor(238, 242, 247); doc.setFontSize(20); doc.setFont(undefined, 'bold');
    doc.text('Executive Audit Report', 14, 22);
    doc.setFontSize(10); doc.setFont(undefined, 'normal'); doc.setTextColor(138, 155, 181);
    doc.text(`Generated by: ${currentUser} · ${new Date().toLocaleDateString()}`, 14, 30);
    if (exportFrom || exportTo) doc.text(`Period: ${exportFrom || 'Start'} → ${exportTo || 'Today'}`, 14, 37);
    const totalAmt = filtered.reduce((s, g) => s + g.amount, 0);
    const totalDisb = filtered.reduce((s, g) => s + (g.disbursedAmount || 0), 0);
    let y = exportFrom || exportTo ? 50 : 44;
    doc.setFontSize(11); doc.setFont(undefined, 'bold');
    doc.setTextColor(79, 156, 249); doc.text(`Total Requested: ₹${totalAmt.toLocaleString()}`, 14, y); y += 8;
    doc.setTextColor(52, 211, 153); doc.text(`Total Disbursed: ₹${totalDisb.toLocaleString()}`, 14, y); y += 8;
    doc.setTextColor(251, 191, 36); doc.text(`Grants in report: ${filtered.length}`, 14, y); y += 12;
    const sections = [{ label: 'Pending Action', statuses: ['Pending', 'Awaiting Review'] }, { label: 'Active/Disbursed', statuses: ['Phase 1 Approved', 'Fully Disbursed'] }, { label: 'Evaluated', statuses: ['Evaluated'] }, { label: 'Rejected / Blocked', statuses: ['Rejected', 'Blocked'] }];
    sections.forEach(({ label, statuses }) => {
      const rows = filtered.filter(g => statuses.includes(g.status));
      if (!rows.length) return;
      if (y > 240) { doc.addPage(); doc.setFillColor(7, 9, 15); doc.rect(0, 0, 210, 297, 'F'); y = 20; }
      doc.setTextColor(238, 242, 247); doc.setFontSize(12); doc.setFont(undefined, 'bold');
      doc.text(label, 14, y); y += 5;
      autoTable(doc, {
        startY: y, head: [['ID', 'Applicant', 'Type', 'Amount', 'Disbursed', 'Status', 'Risk', 'Hash']],
        body: rows.map(g => [g.id, g.source, g.type, `₹${g.amount.toLocaleString()}`, `₹${(g.disbursedAmount || 0).toLocaleString()}`, g.status, getRisk(g.creditScore).label, g.currentHash ? `…${g.currentHash.slice(-6)}` : 'N/A']),
        theme: 'grid', headStyles: { fillColor: [30, 58, 138], textColor: [238, 242, 247], fontSize: 8 }, bodyStyles: { textColor: [203, 213, 225], fontSize: 7.5 }, alternateRowStyles: { fillColor: [15, 23, 42] }, styles: { fillColor: [9, 9, 11] }, margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 10;
    });
    doc.save(`Audit_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
    setShowExportPanel(false);
  };

  const verifyVendor = (gst, idx) => {
    setVerifyingVendor(idx);
    setTimeout(() => {
      setVendorStatus(prev => ({ ...prev, [idx]: gst && gst !== 'N/A' ? '✅ Govt Registry Match' : '⚠️ Unregistered Vendor' }));
      setVerifyingVendor(null);
    }, 1500);
  };

  const fundedGrants = grantsList.filter(g => g.disbursedAmount > 0);
  const recentGrants = fundedGrants.slice(-10);
  const catTotals = {};
  grantsList.forEach(g => { if (g.disbursedAmount > 0) { const t = g.type || 'General'; catTotals[t] = (catTotals[t] || 0) + g.disbursedAmount; } });

  const renderGrantActions = (g, options = {}) => {
    const { compact = false, closeModalAfterAction = false } = options;
    if (!g) return null;
    const withdrawalPending = isWithdrawalRequested(g);

    const handleApprove = () => {
      updateStatus(g.id, 'Phase 1 Approved');
      if (closeModalAfterAction) {
        setViewingGrant(null);
        setViewingApplication(null);
      }
    };

    const handleReject = () => {
      if (closeModalAfterAction) {
        setViewingGrant(null);
        setViewingApplication(null);
      }
      setRejectTarget(g);
      setRejectNote('');
    };
    const handleApproveWithdrawalAction = () => {
      handleApproveWithdrawal(g.id);
      if (closeModalAfterAction) {
        setViewingGrant(null);
        setViewingApplication(null);
      }
    };
    const handleRejectWithdrawalAction = () => {
      handleRejectWithdrawal(g.id);
      if (closeModalAfterAction) {
        setViewingGrant(null);
        setViewingApplication(null);
      }
    };

    return (
      <>
        {!closeModalAfterAction && (
          <SpringTooltip text="View full application details">
            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              className="action-btn"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(79,156,249,0.08)', color: 'var(--accent-blue)', border: '1px solid rgba(79,156,249,0.2)' }}
              onClick={() => setViewingApplication(g)}
            >
              <FileText size={14} /> View Application
            </motion.button>
          </SpringTooltip>
        )}

        {!closeModalAfterAction && (
          <motion.button
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            className="action-btn"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(79,156,249,0.08)', color: 'var(--accent-blue)', border: '1px solid rgba(79,156,249,0.2)' }}
            onClick={() => openHoldHistoryModal(g)}
          >
            <ScrollText size={14} /> View History
          </motion.button>
        )}

        {withdrawalPending && (
          <>
            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              className="action-btn"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(16,185,129,0.12)', color: 'var(--accent-green)', border: '1px solid rgba(16,185,129,0.25)' }}
              onClick={handleApproveWithdrawalAction}
            >
              <CheckCircle size={14} /> Approve Withdrawal
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              className="action-btn btn-reject"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={handleRejectWithdrawalAction}
            >
              <XCircle size={14} /> Reject Withdrawal
            </motion.button>
          </>
        )}

        {!withdrawalPending && !closeModalAfterAction && !g?.holdDetails?.isOnHold && (
          g.status === "Pending" ||
          g.status === "Awaiting Review" ||
          g.status === "Under Review"
        ) && (
          <motion.button
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            className="action-btn"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(251,191,36,0.12)', color: 'var(--accent-yellow)', border: '1px solid rgba(251,191,36,0.25)' }}
            onClick={() => openHoldModal(g)}
          >
            <ShieldAlert size={14} /> Put On Hold
          </motion.button>
        )}

        {!withdrawalPending && !closeModalAfterAction && g?.holdDetails?.isOnHold && (
          <motion.button
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            className="action-btn"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(52,211,153,0.12)', color: 'var(--accent-green)', border: '1px solid rgba(52,211,153,0.25)' }}
            onClick={() => releaseGrantHold(g)}
          >
            <ShieldCheck size={14} /> Release Hold
          </motion.button>
        )}

        {!withdrawalPending && g.status === 'Pending' && (
          <>
            <HoldToApproveButton onApprove={handleApprove} />
            {closeModalAfterAction ? (
              <motion.button
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                className="action-btn btn-reject"
                style={{ flex: 1, padding: '14px', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                onClick={handleReject}
              >
                <XCircle size={16} /> Reject
              </motion.button>
            ) : (
              <SpringTooltip text="Decline and close application">
                <motion.button
                  whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  className="action-btn btn-reject"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '100%' }}
                  onClick={handleReject}
                >
                  <XCircle size={14} /> Reject
                </motion.button>
              </SpringTooltip>
            )}
          </>
        )}

        {!withdrawalPending && !closeModalAfterAction && (g.status === 'Awaiting Review' || g.status === 'Blocked') && (
          <SpringTooltip text={g.status === 'Blocked' ? "Open case file and internal notes" : "Analyze receipts & metadata"}>
            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              className="neon-btn neon-blue"
              style={{ width: 'auto', padding: '8px 18px', fontSize: '12px', margin: 0, display: 'flex', alignItems: 'center', gap: '6px', alignSelf: compact ? 'flex-end' : 'auto' }}
              onClick={() => setViewingGrant(g)}
            >
              {g.status === 'Blocked' ? <><ShieldAlert size={14} /> Investigate Case</> : <><FileSearch size={14} /> Review Proof</>}
            </motion.button>
          </SpringTooltip>
        )}

        {!withdrawalPending && !closeModalAfterAction && g.status === 'Phase 1 Approved' && (
          <span style={{ fontSize: '12px', color: 'var(--accent-yellow)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '4px', alignSelf: compact ? 'flex-end' : 'auto' }}>
            <Clock size={12} /> Awaiting proof upload…
          </span>
        )}
      </>
    );
  };

  return (
    <div className="app-wrapper" style={{ position: 'relative' }}>
      <Toaster position="bottom-right" theme={isDarkMode ? 'dark' : 'light'} richColors expand={false} />

      <Particles
        id="admin-particles" init={particlesInit}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none' }}
        options={{
          fpsLimit: 60,
          interactivity: { events: { onHover: { enable: true, mode: isDarkMode ? "grab" : "repulse" } }, modes: { grab: { distance: 180, links: { opacity: 0.6, color: "#3b82f6" } }, repulse: { distance: 120, duration: 0.4 } } },
          particles: { color: { value: isDarkMode ? ["#3b82f6", "#10b981", "#64748b"] : ["#4f9cf9", "#34d399", "#a78bfa", "#fbbf24"] }, links: { color: isDarkMode ? "#334155" : "#ffffff", distance: 150, enable: isDarkMode, opacity: 0.3, width: 1 }, move: { enable: true, speed: isDarkMode ? 0.4 : 0.8, direction: isDarkMode ? "none" : "top", random: true, straight: false, outModes: { default: "out" } }, number: { density: { enable: true, area: 1200 }, value: isDarkMode ? 40 : 25 }, opacity: { value: isDarkMode ? 0.4 : 0.7, animation: { enable: !isDarkMode, speed: 0.5, minimumValue: 0.1 } }, shape: { type: "circle" }, size: { value: { min: isDarkMode ? 1 : 3, max: isDarkMode ? 2 : 8 } } },
          detectRetina: true,
        }}
      />

      <div className="ambient-glow glow-1"></div>

      <motion.div className="app-container" style={{ position: 'relative', zIndex: 1 }} animate={{ scale: viewingGrant ? 0.98 : 1, filter: viewingGrant ? 'blur(4px)' : 'none', borderRadius: viewingGrant ? '16px' : '0px' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}>

        <div className="header">
          <div>
            <h1 className="gradient-text" style={{ fontSize: '32px' }}><CyberText text="Admin Console" /></h1>
            <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Welcome, <strong style={{ color: 'var(--text-primary)' }}>{currentUser}</strong> · Grant Administrator</span>
          </div>
          <div className="header-actions">
            <button className="command-palette-hint" onClick={() => setShowCommandPalette(true)} title="Command Palette (⌘K)">
              <Search size={14} />
              <span>Search</span>
              <kbd className="command-palette-kbd" style={{ marginLeft: '8px' }}>⌘K</kbd>
            </button>
            <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">{isDarkMode ? '☀️' : '🌙'}</button>
            <MagneticButton className="neon-btn neon-green" style={{ width: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => setShowExportPanel(true)}><Download size={16} /> Export All</MagneticButton>
            <MagneticButton className="neon-btn neon-blue" style={{ width: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { setShowLogs(true); fetchLogs(); }}><ScrollText size={16} /> Logs</MagneticButton>
            <button className="logout-btn" onClick={handleLogout}>Logout</button>
          </div>
        </div>

        <div className="tab-bar">
  <button className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
    onClick={() => setActiveTab('dashboard')}
    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
    <LayoutDashboard size={16} /> Dashboard
  </button>
  <button className={`tab-btn ${activeTab === 'queue' ? 'active' : ''}`}
    onClick={() => setActiveTab('queue')}
    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
    <Zap size={16} /> Queue {actionQueue.length > 0 && `(${actionQueue.length})`}
  </button>
  <button className={`tab-btn ${activeTab === 'kyc' ? 'active' : ''}`}
    onClick={() => setActiveTab('kyc')}
    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
    <BadgeCheck size={16} /> KYC Queue ({kycPendingCount})
  </button>
</div>

        <AnimatePresence mode="wait" custom={activeTab === 'dashboard' ? -1 : 1}>
          {activeTab === 'dashboard' && (<motion.div key="dashboard" custom={-1} variants={{ initial: c => ({ opacity: 0, x: c * 40, filter: 'blur(4px)' }), animate: { opacity: 1, x: 0, filter: 'blur(0px)' }, exit: c => ({ opacity: 0, x: c * (-40), filter: 'blur(4px)' }) }} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}><>
            <div className="summary-row">
              {initialLoad ? (
                <>
                  <SkeletonCard />
                  <SkeletonCard />
                  <SkeletonCard />
                </>
              ) : (
                [
                  { label: 'Total Disbursed', value: totalImpact, prefix: '₹', color: 'var(--accent-blue)', sub: `across ${grantsList.length} grants` },
                  { label: 'Awaiting Action', value: pendingCount, color: 'var(--accent-yellow)', sub: 'click to filter', onClick: () => setFilterStatus('Pending') },
                  { label: 'Projects Complete', value: fullyDisbursedGrants.length, color: 'var(--accent-green)', sub: 'fully evaluated', onClick: () => setFilterStatus('Evaluated') },
                ].map((s, i) => (
                  <TiltCard key={i} className="glass-card stat-card" onClick={s.onClick} style={{ borderBottom: `2px solid ${s.color}44`, '--card-accent': s.color }}>
                    <div className="stat-label">{s.label}</div>
                    <div className="stat-value" style={{ color: s.color, textShadow: `0 0 30px ${s.color}55` }}>{s.prefix}<CountUp end={s.value} duration={2.5} separator="," /></div>
                    {s.sub && <div className="stat-sub">{s.sub}</div>}
                  </TiltCard>
                ))
              )}
            </div>

            <div className="dashboard-grid">
              <motion.div className="glass-card chart-container" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, type: 'spring', stiffness: 200, damping: 20 }}>
                <div className="section-title">Disbursal Analytics</div>
                <FramerBarChart data={recentGrants} isDarkMode={isDarkMode} />
              </motion.div>

              <motion.div className="glass-card pie-container" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, type: 'spring', stiffness: 200, damping: 20 }}>
                <div className="section-title">Capital Distribution</div>
                <FramerDonutChart data={catTotals} isDarkMode={isDarkMode} />
              </motion.div>

              <motion.div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, type: 'spring', stiffness: 200, damping: 20 }}>
                <div className="section-title">Manual Override</div>
                <label className="input-label">Applicant Alias</label>
                <input className="dark-input" value={source} onChange={e => setSource(e.target.value)} />
                <label className="input-label">Credit Score</label>
                <input className="dark-input" type="number" value={creditScore} onChange={e => setCreditScore(e.target.value)} />
                <label className="input-label">Category</label>
                <select className="dark-input" value={type} onChange={e => setType(e.target.value)}>
                  {STANDARD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  <option value="Other">Other</option>
                </select>
                <label className="input-label">Amount (₹)</label>
                <input className="dark-input" style={{ marginBottom: '10px' }} type="number" value={amount} onChange={e => setAmount(e.target.value)} />
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="neon-btn neon-blue" style={{ marginTop: 'auto', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} onClick={addGrant}><CheckCircle2 size={16} /> Inject Record</motion.button>
              </motion.div>
            </div>

            <motion.div className="glass-card" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, type: 'spring', stiffness: 150, damping: 20 }} style={{ overflowX: 'hidden' }}>
              <div style={{ marginBottom: '18px', borderBottom: `1px solid var(--border-subtle)`, paddingBottom: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div className="section-title" style={{ margin: 0 }}>Grant Registry<span style={{ fontSize: '14px', fontFamily: 'DM Sans', fontWeight: '600', color: 'var(--text-muted)', marginLeft: '10px' }}>({processedGrants.length})</span></div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative' }}>
                      <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '10px' }} />
                      <input className="dark-input" placeholder="Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ marginBottom: 0, padding: '8px 13px 8px 30px', width: '190px', fontSize: '13px' }} />
                    </div>
                    <select className="dark-input" value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ marginBottom: 0, padding: '8px 12px', width: 'auto' }}>
                      <option value="Newest">Newest</option><option value="Amount">Amount ↓</option><option value="Risk">Highest Risk</option><option value="Waiting">Waiting Longest</option>
                    </select>
                  </div>
                </div>
                <div className="filter-pills">
                  {['All', ...ALL_STATUSES].map(s => {
                    const c = STATUS_COLORS[s] || '#94a3b8';
                    const active = filterStatus === s;
                    return (
                      <button key={s} className={`filter-pill ${active ? 'active-pill' : ''}`} onClick={() => setFilterStatus(s)} style={active ? { background: `${c}18`, border: `1px solid ${c}55`, color: c } : {}}>
                        {s} <span style={{ opacity: 0.6 }}>({statusCounts[s] ?? 0})</span>
                      </button>
                    );
                  })}
                </div>
                {processedGrants.some(g => ACTION_STATUSES.includes(g.status)) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px', padding: '8px 12px', background: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                    <input type="checkbox" className="bulk-check" checked={processedGrants.filter(g => ACTION_STATUSES.includes(g.status)).every(g => selectedIds.has(g.id))} onChange={toggleSelectAll} />
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600' }}>Select all actionable grants</span>
                    {selCount > 0 && <button onClick={clearSelection} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer', marginLeft: 'auto' }}>Clear ({selCount})</button>}
                  </div>
                )}
              </div>

              <ul className="history-list dark-scroll" ref={listRef} style={{ overflowX: 'hidden' }}>
                <AnimatePresence mode="popLayout">
                  {initialLoad ? (
                    <>
                      <motion.li key="sk1" className="history-item" layout><SkeletonRow /></motion.li>
                      <motion.li key="sk2" className="history-item" layout><SkeletonRow /></motion.li>
                      <motion.li key="sk3" className="history-item" layout><SkeletonRow /></motion.li>
                    </>
                  ) : processedGrants.length === 0 ? (
                    <motion.li
                      initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      layout
                      className="history-item glass-card"
                      style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', textAlign: 'center', borderStyle: 'dashed', borderColor: 'var(--border-subtle)', background: 'rgba(255,255,255,0.01)' }}
                    >
                      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" style={{ margin: '0 auto 16px', display: 'block', opacity: 0.3 }}>
                        <rect x="8" y="16" width="48" height="36" rx="4" stroke="var(--text-muted)" strokeWidth="2" />
                        <path d="M8 24h48" stroke="var(--text-muted)" strokeWidth="2" />
                        <path d="M20 32h10M20 38h16" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" />
                        <circle cx="48" cy="44" r="10" fill="var(--bg-base)" stroke="var(--text-muted)" strokeWidth="2" />
                        <path d="M44 44h8M48 40v8" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                      <div style={{ color: 'var(--text-primary)', fontFamily: 'DM Serif Display,serif', fontSize: '18px', fontWeight: '400', marginBottom: '6px' }}>
                        {filterStatus === 'All' ? 'No grants yet' : `No ${filterStatus} grants`}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '13px', maxWidth: '260px', margin: '0 auto' }}>
                        {filterStatus === 'All' ? 'Grants will appear once applicants submit requests.' : `No grants currently have status "${filterStatus}".`}
                      </div>
                      {filterStatus !== 'All' && (
                        <button onClick={() => setFilterStatus('All')} style={{ marginTop: '14px', background: 'none', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', borderRadius: '8px', padding: '7px 18px', cursor: 'pointer', fontSize: '13px', fontFamily: 'DM Sans', fontWeight: '600' }}>
                          Show all grants
                        </button>
                      )}
                    </motion.li>
                  ) : processedGrants.map((g, i) => {
                    const risk = getRisk(g.creditScore);
                    const wait = daysSince(g.date);
                    const isActionable = ACTION_STATUSES.includes(g.status);
                    const isSelected = selectedIds.has(g.id);
                    const isRevealed = revealedGrantIds.has(g.id);
                    const withdrawalPending = isWithdrawalRequested(g);
                    const adminStatus = getAdminDisplayStatus(g);

                    return (
                      <motion.li
                        key={g.id}
                        layout /* MAGIC LAYOUT FOR SMOOTH REORDERING */
                        initial={isRevealed ? { opacity: 1, y: 0 } : { opacity: 0, y: 25 }}
                        animate={isRevealed ? { opacity: 1, y: 0 } : undefined}

                        /* ✨ THE MAGIC INBOX ZERO ANIMATION ✨ */
                        exit={{
                          opacity: 0,
                          scale: 0.95,
                          height: 0,
                          paddingTop: 0,
                          paddingBottom: 0,
                          marginBottom: 0,
                          borderWidth: 0,
                          backgroundColor: 'rgba(16, 185, 129, 0.3)', /* Flashes Green */
                          x: 50, /* Sweeps off to the right */
                          transition: { duration: 0.4, ease: "anticipate" }
                        }}
                        /* ----------------------------------- */

                        whileInView={i > 0 ? { opacity: 1, y: 0 } : undefined}
                        onViewportEnter={i > 0 ? () => {
                          setRevealedGrantIds(prev => {
                            if (prev.has(g.id)) return prev;
                            const next = new Set(prev);
                            next.add(g.id);
                            return next;
                          });
                        } : undefined}
                        viewport={i > 0 ? { root: listRef, once: true, amount: 0.35, margin: '0px 0px -40px 0px' } : undefined}
                        transition={{ duration: 0.35, ease: "easeOut" }}

                        className="history-item"
                        style={{
                          flexDirection: 'column', alignItems: 'stretch', gap: '10px', overflow: 'hidden',
                          background: isSelected ? (isDarkMode ? 'rgba(79,156,249,0.06)' : 'rgba(79,156,249,0.04)') : '',
                          borderLeft: isSelected
                            ? '3px solid var(--accent-blue)'
                            : `3px solid ${{
                              'Pending': 'rgba(251,191,36,0.3)',
                              'Phase 1 Approved': 'rgba(52,211,153,0.3)',
                              'Awaiting Review': 'rgba(249,115,22,0.3)',
                              'Fully Disbursed': 'rgba(167,139,250,0.3)',
                              'Evaluated': 'rgba(34,211,238,0.3)',
                              'Rejected': 'rgba(248,113,113,0.3)',
                              'Blocked': 'rgba(185,28,28,0.4)',
                            }[g.status] || 'rgba(100,116,139,0.2)'}`,
                          transition: 'background 0.2s, border-left-color 0.2s'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, flexWrap: 'wrap', minWidth: 0, overflow: 'hidden' }}>
                            {isActionable && <input type="checkbox" className="bulk-check" checked={isSelected} onChange={() => toggleSelect(g.id)} onClick={e => e.stopPropagation()} />}
                            <span className={`category-tag ${STANDARD_TYPES.includes(g.type) ? `cat-${g.type}` : 'cat-Other'}`}>{g.type}</span>
                            <strong style={{ color: 'var(--text-primary)', fontSize: '14px', cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: '3px', textDecorationColor: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => setHistoryApplicant(g.source)}><User size={14} /> {g.source}</strong>

                            {g.strikes > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', background: g.strikes >= 3 ? '#7f1d1d' : '#9a3412', color: 'white', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}><AlertTriangle size={10} /> {g.strikes}/3 STRIKES</span>}

                            <span className="risk-badge" style={{ background: risk.bg, color: risk.color, border: `1px solid ${risk.color}30` }}><span className="risk-dot" style={{ background: risk.dot, boxShadow: `0 0 6px ${risk.dot}` }}></span>{risk.label}</span>
                            {wait > 3 && isActionable && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#f87171', fontWeight: '700', background: 'rgba(248,113,113,0.1)', padding: '3px 8px', borderRadius: '10px', border: '1px solid rgba(248,113,113,0.2)' }}><Clock size={10} /> {wait}d</span>}
                            {g?.holdDetails?.isOnHold ? (
  <span className="status-badge status-OnHold">
    ⚠ ON HOLD
  </span>
) : (
  <span className={`status-badge status-${adminStatus === 'Fully Disbursed' || adminStatus === 'Evaluated' ? 'Approved' : adminStatus === 'Rejected' || adminStatus === 'Blocked' || adminStatus === 'WITHDRAWN' ? 'Rejected' : 'Pending'}`}>
    {adminStatus === 'Evaluated' ? 'Closed' : formatStatus(adminStatus)}
  </span>
)}
                            {withdrawalPending && (
                              <span style={{
                                background: 'rgba(251,191,36,0.15)',
                                color: '#facc15',
                                border: '1px solid rgba(251,191,36,0.4)',
                                padding: '4px 8px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                marginLeft: '8px'
                              }}>
                                WITHDRAWAL REQUESTED
                              </span>
                            )}
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ color: 'var(--accent-blue)', fontWeight: '800', fontSize: '16px' }}>₹{(g.disbursedAmount || 0).toLocaleString()}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>of ₹{g.amount.toLocaleString()}</div>
                          </div>
                        </div>
                        {withdrawalPending && (
                          <div style={{ color: '#facc15', fontSize: '13px', marginTop: '6px' }}>
                            ⚠️ User has requested withdrawal during review
                          </div>
                        )}
                        {g.note && <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.18)', borderRadius: '8px', padding: '7px 12px', fontSize: '12px', color: 'var(--accent-red)' }}><FileSignature size={14} /> "{g.note}"</div>}
                        {g?.holdDetails?.isOnHold && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: '8px', padding: '7px 12px', fontSize: '12px', color: 'var(--accent-yellow)' }}>
                            <ShieldAlert size={14} /> Reason: {formatReason(g.holdDetails?.holdReason)}
                          </div>
                        )}
                        <div className="disbursal-track"><div className={`disbursal-fill${g.amount > 0 && (g.disbursedAmount || 0) >= g.amount ? ' full' : ''}`} style={{ width: `${g.amount > 0 ? ((g.disbursedAmount || 0) / g.amount) * 100 : 0}%` }}></div></div>

                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          {renderGrantActions(g)}
                          {g.status === 'Evaluated' && <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="action-btn" style={{ background: 'rgba(167,139,250,0.1)', color: 'var(--accent-purple)', border: '1px solid rgba(167,139,250,0.25)', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => setViewingImpact(g)}><Rocket size={14} /> View Impact</motion.button>}
                        </div>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            </motion.div>
          </></motion.div>)}

          {activeTab === 'queue' && (<motion.div key="queue" custom={1} variants={{ initial: c => ({ opacity: 0, x: c * 40, filter: 'blur(4px)' }), animate: { opacity: 1, x: 0, filter: 'blur(0px)' }, exit: c => ({ opacity: 0, x: c * (-40), filter: 'blur(4px)' }) }} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
                <div className="section-title" style={{ margin: 0 }}>Action Queue</div>
                <span style={{ background: 'rgba(248,113,113,0.15)', color: 'var(--accent-red)', border: '1px solid rgba(248,113,113,0.25)', fontSize: '12px', fontWeight: '700', padding: '4px 12px', borderRadius: '20px' }}>{actionQueue.length} waiting</span>
              </div>

              {actionQueue.length === 0 ? (
                <motion.div className="glass-card" style={{ textAlign: 'center', padding: '64px 40px' }} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }}>
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.1 }}
                    style={{ margin: '0 auto 20px', width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(52,211,153,0.1)', border: '2px solid rgba(52,211,153,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 30px rgba(52,211,153,0.15)' }}
                  >
                    <motion.div
                      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                      transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' }}
                    >
                      <CheckCircle size={40} color="var(--accent-green)" />
                    </motion.div>
                  </motion.div>
                  <div style={{ color: 'var(--text-heading)', fontFamily: 'DM Serif Display,serif', fontSize: '24px', fontWeight: '400', marginBottom: '8px' }}>All caught up!</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '14px', maxWidth: '280px', margin: '0 auto', lineHeight: '1.6' }}>
                    No grants are waiting for your review. Check back after the next poll.
                  </div>
                  <motion.div
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ marginTop: '20px', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-green)', boxShadow: '0 0 8px var(--accent-green)' }} />
                    Live sync active
                  </motion.div>
                </motion.div>
              ) : (
                <ul className="history-list dark-scroll">
                  <AnimatePresence mode="popLayout">
                    {actionQueue.map((g, i) => {
                      const risk = getRisk(g.creditScore);
                      const urgent = g.waitDays > 5;
                      const hasFraudAlert = g.proofs?.some(p => p.forensics?.some(f => f.status === 'FLAGGED'));
                      const withdrawalPending = isWithdrawalRequested(g);
                      const adminStatus = getAdminDisplayStatus(g);

                      return (
                        <motion.li key={g.id}
                          layout
                          exit={{
                            opacity: 0, scale: 0.95, height: 0, paddingTop: 0, paddingBottom: 0, marginBottom: 0, borderWidth: 0, backgroundColor: 'rgba(16, 185, 129, 0.3)', x: 50, transition: { duration: 0.4, ease: "anticipate" }
                          }}
                          className={`glass-card history-item ${hasFraudAlert ? 'queue-card-forensic' : urgent ? 'queue-card-urgent' : g.waitDays > 3 ? 'queue-card-warning' : ''}`}
                          style={{ borderLeft: `4px solid ${hasFraudAlert ? '#ef4444' : urgent ? '#f87171' : g.status === 'Awaiting Review' ? '#f97316' : g.status === 'Blocked' ? '#b91c1c' : '#fbbf24'}`, marginBottom: '14px', position: 'relative', overflow: 'hidden', display: 'block' }}
                          initial={{ opacity: 0, x: -50 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.12, type: 'spring', stiffness: 200, damping: 20 }}>
                          <div className={`queue-wait-watermark${urgent ? ' urgent' : ''}`}>{g.waitDays}d</div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '8px', flexWrap: 'wrap' }}>
                                <span className={`category-tag ${STANDARD_TYPES.includes(g.type) ? `cat-${g.type}` : 'cat-Other'}`}>{g.type}</span>
                                <strong style={{ color: 'var(--text-primary)', fontSize: '15px', cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: '3px', textDecorationColor: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => setHistoryApplicant(g.source)}><User size={14} /> {g.source}</strong>

                                {g.strikes > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', background: g.strikes >= 3 ? '#7f1d1d' : '#9a3412', color: 'white', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}><AlertTriangle size={10} /> {g.strikes}/3 STRIKES</span>}

                                <span className="risk-badge" style={{ background: risk.bg, color: risk.color, border: `1px solid ${risk.color}30` }}><span className="risk-dot" style={{ background: risk.dot }}></span>{risk.label}</span>
                                {withdrawalPending && (
                                  <span style={{
                                    background: 'rgba(251,191,36,0.15)',
                                    color: '#facc15',
                                    border: '1px solid rgba(251,191,36,0.4)',
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    marginLeft: '8px'
                                  }}>
                                    WITHDRAWAL REQUESTED
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>₹{g.amount.toLocaleString()} · Applied {g.date}</div>
                              {withdrawalPending && (
                                <div style={{ color: '#facc15', fontSize: '13px', marginTop: '6px' }}>
                                  ⚠️ User has requested withdrawal during review
                                </div>
                              )}
                              <div style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>

                                {hasFraudAlert ? (
                                  <span className="forensic-alert" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '800', padding: '4px 12px', borderRadius: '10px' }}><ShieldAlert size={12} /> FORENSIC FLAG</span>
                                ) : (
                                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '800', padding: '3px 10px', borderRadius: '10px', background: urgent ? 'rgba(248,113,113,0.15)' : 'rgba(251,191,36,0.12)', color: urgent ? '#f87171' : '#fcd34d', border: `1px solid ${urgent ? 'rgba(248,113,113,0.3)' : 'rgba(251,191,36,0.25)'}` }}><Clock size={12} /> {g.waitDays}d waiting</span>
                                )}
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Status: <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{formatStatus(adminStatus)}</span></span>
                                {g?.holdDetails?.isOnHold && (
                                  <span style={{ fontSize: '12px', color: 'var(--accent-yellow)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <ShieldAlert size={12} /> Reason: {formatReason(g.holdDetails?.holdReason)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                              {renderGrantActions(g, { compact: true })}
                            </div>
                          </div>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
              )}
            </motion.div>
          </motion.div>)}
        </AnimatePresence>
      </motion.div>

      <div className={`bulk-bar ${activeTab === 'dashboard' && selCount > 0 ? 'visible' : ''}`}>
        <span className="bulk-bar-count">{selCount}</span>
        <span className="bulk-bar-label">grant{selCount !== 1 ? 's' : ''} selected</span>
        <div className="bulk-divider"></div>
        {selPending > 0 && <button className="neon-btn neon-green" style={{ width: 'auto', padding: '9px 18px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={bulkApprove}><CheckCircle size={14} /> Approve {selPending} Pending</button>}
        {selRejectable > 0 && <button className="neon-btn neon-red" style={{ width: 'auto', padding: '9px 18px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => setShowBulkReject(true)}><XCircle size={14} /> Reject {selRejectable}</button>}
        <button className="neon-btn neon-blue" style={{ width: 'auto', padding: '9px 18px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={bulkExportPDF}><Download size={14} /> Export Selected</button>
        <button onClick={clearSelection} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '20px', cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>×</button>
      </div>

      {/* MODALS */}
      {showOtpModal && otpTargetGrant && (() => {
        const timerColor = otpTimeLeft > 120 ? '#3b82f6' : otpTimeLeft > 60 ? '#f59e0b' : '#ef4444';
        const timerPct = otpTimeLeft / 300;
        const CIRC = 2 * Math.PI * 44;
        return (
          <motion.div className="modal-overlay" style={{ zIndex: 1000 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 24 }} animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 360, damping: 26 }}
              style={{ position: 'relative', padding: '2px', borderRadius: '22px', overflow: 'hidden', maxWidth: '440px', width: '100%' }}
            >
              <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none' }}>
                <defs>
                  <linearGradient id="otp-grad2" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={timerColor} />
                    <stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
                <rect x="0" y="0" width="100%" height="100%" rx="22" ry="22" fill="none" stroke="url(#otp-grad2)" strokeWidth="2" strokeLinecap="round" pathLength="100" strokeDasharray="30 70" className="svg-border-trace" />
              </svg>

              <div style={{ position: 'relative', zIndex: 1, background: 'var(--bg-surface)', borderRadius: '20px', padding: '32px', textAlign: 'center' }}>
                <div style={{ position: 'relative', width: '100px', height: '100px', margin: '0 auto 20px' }}>
                  <svg width="100" height="100" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="50" cy="50" r="44" fill="none" stroke="var(--border-subtle)" strokeWidth="6" />
                    <motion.circle
                      cx="50" cy="50" r="44" fill="none"
                      stroke={timerColor} strokeWidth="6" strokeLinecap="round"
                      strokeDasharray={CIRC}
                      animate={{ strokeDashoffset: CIRC * (1 - timerPct), stroke: timerColor }}
                      transition={{ strokeDashoffset: { duration: 1, ease: 'linear' }, stroke: { duration: 0.5 } }}
                      style={{ filter: `drop-shadow(0 0 8px ${timerColor}88)` }}
                    />
                  </svg>
                  <motion.div
                    animate={otpTimeLeft <= 30 && otpTimeLeft > 0 ? { x: [-2, 2, -2, 2, 0] } : {}}
                    transition={{ duration: 0.4, repeat: otpTimeLeft <= 30 ? Infinity : 0, repeatDelay: 1.5 }}
                    style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <span style={{ fontFamily: 'DM Serif Display,serif', fontSize: '24px', color: timerColor, lineHeight: 1, textShadow: `0 0 16px ${timerColor}66` }}>
                      {Math.floor(otpTimeLeft / 60)}:{(otpTimeLeft % 60).toString().padStart(2, '0')}
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', letterSpacing: '0.5px' }}>remaining</span>
                  </motion.div>
                </div>

                <h2 style={{ color: 'var(--text-primary)', margin: '0 0 8px', fontFamily: 'DM Serif Display,serif', fontSize: '22px', fontWeight: '400' }}>Vault Release Authorization</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '8px', lineHeight: '1.5' }}>
                  Authorizing release of <span style={{ color: 'var(--accent-green)', fontWeight: '800' }}>₹{(otpTargetGrant.amount - (otpTargetGrant.disbursedAmount || 0)).toLocaleString()}</span> to <strong>{otpTargetGrant.source}</strong>
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '24px' }}>Enter the 6-digit OTP sent to your verified email</p>

                <motion.input
                  type="text" maxLength="6" className="dark-input"
                  placeholder="• • • • • •"
                  value={otpInput}
                  onChange={e => setOtpInput(e.target.value.replace(/[^0-9]/g, ''))}
                  disabled={otpTimeLeft === 0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (otpInput.length === 6 && otpTimeLeft > 0) {
                        confirmOtpRelease();
                      } else if (otpInput.length < 6) {
                        setOtpError("Please enter the full 6-digit OTP first.");
                      }
                    }
                  }}
                  animate={otpError ? { x: [-6, 6, -6, 6, 0] } : {}}
                  transition={{ duration: 0.3 }}
                  style={{ fontSize: '28px', letterSpacing: '12px', textAlign: 'center', fontWeight: '700', padding: '16px', opacity: otpTimeLeft === 0 ? 0.4 : 1, marginBottom: '6px', borderColor: otpError ? 'var(--accent-red)' : otpInput.length === 6 ? 'var(--accent-green)' : undefined }}
                />
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '20px' }}>
                  {[0, 1, 2, 3, 4, 5].map(i => (
                    <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: i < otpInput.length ? timerColor : 'var(--border-subtle)', transition: 'background 0.15s', boxShadow: i < otpInput.length ? `0 0 6px ${timerColor}` : 'none' }} />
                  ))}
                </div>

                {otpTimeLeft === 0 && <div style={{ color: '#ef4444', fontSize: '13px', marginBottom: '12px', fontWeight: '600' }}>⏳ OTP Expired — please cancel and request a new one</div>}
                {otpError && otpTimeLeft > 0 && <div style={{ color: '#ef4444', fontSize: '13px', marginBottom: '12px', fontWeight: '600' }}>❌ {otpError}</div>}

                <div style={{ display: 'flex', gap: '12px' }}>
                  <motion.button
                    whileHover={{ scale: otpInput.length === 6 && otpTimeLeft > 0 ? 1.02 : 1 }}
                    whileTap={{ scale: 0.98 }}
                    className="neon-btn neon-green"
                    style={{ flex: 1, opacity: otpInput.length === 6 && otpTimeLeft > 0 ? 1 : 0.4, pointerEvents: otpInput.length === 6 && otpTimeLeft > 0 ? 'auto' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    onClick={confirmOtpRelease}
                  >
                    <ShieldCheck size={16} /> Authenticate & Release
                  </motion.button>
                  <button onClick={() => { setShowOtpModal(false); setOtpTargetGrant(null); setOtpInput(''); setOtpError(''); }} style={{ flex: 1, background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontFamily: 'DM Sans' }}>Cancel</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        );
      })()}

      {showBulkReject && (
        <div className="modal-overlay">
          <div className="glass-modal-content" style={{ maxWidth: '440px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: 'var(--text-primary)', margin: 0, fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}><XCircle /> Reject {selRejectable} Grant{selRejectable !== 1 ? 's' : ''}</h2>
              <button onClick={() => setShowBulkReject(false)} style={{ background: 'none', border: 'none', fontSize: '26px', color: 'var(--text-muted)', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.18)', borderRadius: '10px', padding: '12px 14px', marginBottom: '18px', fontSize: '13px', color: 'var(--text-secondary)' }}>This will reject all selected Pending and Awaiting Review grants. This action cannot be undone.</div>
            <label className="input-label">Reason (shown to all applicants)</label>
            <textarea className="dark-input" rows={3} placeholder="e.g. Insufficient documentation provided." value={bulkRejectNote} onChange={e => setBulkRejectNote(e.target.value)} />
            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <button className="neon-btn neon-red" style={{ flex: 1 }} onClick={bulkReject}>Confirm Bulk Rejection</button>
              <button onClick={() => setShowBulkReject(false)} style={{ flex: 1, background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', fontFamily: 'DM Sans' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {viewingApplication && (() => {
          const g = viewingApplication;
          const risk = getRisk(g.creditScore);
          const wait = daysSince(g.date);
          const adminStatus = getAdminDisplayStatus(g);
          const disbPct = g.amount > 0 ? Math.round(((g.disbursedAmount || 0) / g.amount) * 100) : 0;
          const CIRC_R = 28;
          const CIRC = 2 * Math.PI * CIRC_R;
          const scoreNorm = Math.min(100, Math.max(0, ((parseInt(g.creditScore) || 300) - 300) / 600 * 100));
          const creditColor = parseInt(g.creditScore) >= 750 ? 'var(--accent-green)' : parseInt(g.creditScore) >= 600 ? 'var(--accent-yellow)' : 'var(--accent-red)';

          return (
            <motion.div
              className="modal-overlay"
              initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
              animate={{ opacity: 1, backdropFilter: 'blur(12px)' }}
              exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
              transition={{ duration: 0.25 }}
            >
              <motion.div
                initial={{ scale: 0.92, opacity: 0, y: 28 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.92, opacity: 0, y: 16 }}
                transition={{ type: 'spring', stiffness: 340, damping: 28 }}
                style={{ maxWidth: '640px', width: '100%', borderRadius: '22px', overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}
              >
                <div style={{
                  background: adminStatus === 'Pending'
                    ? 'linear-gradient(135deg,rgba(30,58,138,0.9),rgba(37,99,235,0.75))'
                    : adminStatus === 'Rejected' || adminStatus === 'Blocked' || adminStatus === 'WITHDRAWN'
                      ? 'linear-gradient(135deg,rgba(127,29,29,0.9),rgba(185,28,28,0.75))'
                      : 'linear-gradient(135deg,rgba(4,120,87,0.85),rgba(16,185,129,0.65))',
                  padding: '20px 28px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FileText size={20} color="white" />
                    </div>
                    <div>
                      <div style={{ color: 'white', fontFamily: 'DM Serif Display,serif', fontSize: '19px', fontWeight: '400' }}>
                        Grant Application
                      </div>
                      <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '12px', marginTop: '2px' }}>
                        ID #{String(g.id).split('-')[0]} · Submitted {g.date}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className={`status-badge status-${adminStatus === 'Evaluated' || adminStatus === 'Fully Disbursed' ? 'Approved' : adminStatus === 'Rejected' || adminStatus === 'Blocked' || adminStatus === 'WITHDRAWN' ? 'Rejected' : 'Pending'}`} style={{ fontSize: '10px' }}>
                      {formatStatus(adminStatus)}
                    </span>
                    {isWithdrawalRequested(g) && (
                      <span style={{
                        background: 'rgba(251,191,36,0.15)',
                        color: '#facc15',
                        border: '1px solid rgba(251,191,36,0.4)',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        marginLeft: '8px'
                      }}>
                        WITHDRAWAL REQUESTED
                      </span>
                    )}
                    <button
                      onClick={() => setViewingApplication(null)}
                      style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >×</button>
                  </div>
                </div>

                <div style={{ background: 'var(--bg-surface)', padding: '26px 28px', overflowY: 'auto', maxHeight: '70vh' }}>
                  {isWithdrawalRequested(g) && (
                    <div style={{ color: '#facc15', fontSize: '13px', marginTop: '6px', marginBottom: '12px' }}>
                      ⚠️ User has requested withdrawal during review
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '22px' }}>
                    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '14px', padding: '16px' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: '700', marginBottom: '8px' }}>Applicant</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg,var(--accent-blue),var(--accent-purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>
                          {g.source?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-primary)', fontWeight: '700', fontSize: '15px' }}>{g.source}</div>
                          <div
                            style={{ color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: '2px', marginTop: '2px' }}
                            onClick={() => { setViewingApplication(null); setHistoryApplicant(g.source); }}
                          >
                            View full history →
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '14px', padding: '16px' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: '700', marginBottom: '8px' }}>Requested Amount</div>
                      <div style={{ fontFamily: 'DM Serif Display,serif', fontSize: '28px', color: 'var(--accent-blue)', lineHeight: 1, textShadow: '0 0 20px rgba(79,156,249,0.3)' }}>
                        ₹{g.amount.toLocaleString()}
                      </div>
                      {g.disbursedAmount > 0 && (
                        <div style={{ fontSize: '12px', color: 'var(--accent-green)', marginTop: '6px', fontWeight: '600' }}>
                          ₹{(g.disbursedAmount || 0).toLocaleString()} disbursed ({disbPct}%)
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '22px' }}>
                    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '14px', padding: '16px' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: '700', marginBottom: '10px' }}>Grant Category</div>
                      <span className={`category-tag ${STANDARD_TYPES.includes(g.type) ? `cat-${g.type}` : 'cat-Other'}`} style={{ fontSize: '13px', padding: '6px 14px' }}>
                        {g.type}
                      </span>
                    </div>

                    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '14px', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: '700', marginBottom: '6px' }}>Credit Score</div>
                        <div style={{ fontFamily: 'DM Serif Display,serif', fontSize: '26px', color: creditColor, lineHeight: 1 }}>{g.creditScore || 'N/A'}</div>
                        <span className="risk-badge" style={{ background: risk.bg, color: risk.color, border: `1px solid ${risk.color}30`, fontSize: '11px', padding: '3px 10px', marginTop: '6px', display: 'inline-flex' }}>
                          <span className="risk-dot" style={{ background: risk.dot, width: '6px', height: '6px' }}></span>{risk.label}
                        </span>
                      </div>
                      <div style={{ position: 'relative', width: '56px', height: '56px', flexShrink: 0 }}>
                        <svg width="56" height="56" viewBox="0 0 56 56" style={{ transform: 'rotate(-90deg)' }}>
                          <circle cx="28" cy="28" r={CIRC_R} fill="none" stroke="var(--border-subtle)" strokeWidth="5" />
                          <motion.circle
                            cx="28" cy="28" r={CIRC_R} fill="none"
                            stroke={creditColor} strokeWidth="5" strokeLinecap="round"
                            strokeDasharray={CIRC}
                            initial={{ strokeDashoffset: CIRC }}
                            animate={{ strokeDashoffset: CIRC * (1 - scoreNorm / 100) }}
                            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
                            style={{ filter: `drop-shadow(0 0 4px ${creditColor}88)` }}
                          />
                        </svg>
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', color: creditColor }}>
                          {Math.round(scoreNorm)}%
                        </div>
                      </div>
                    </div>
                  </div>

                  {wait > 0 && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      background: wait > 5 ? 'rgba(248,113,113,0.07)' : 'rgba(251,191,36,0.07)',
                      border: `1px solid ${wait > 5 ? 'rgba(248,113,113,0.2)' : 'rgba(251,191,36,0.2)'}`,
                      borderRadius: '10px', padding: '12px 16px', marginBottom: '22px',
                    }}>
                      <Clock size={16} color={wait > 5 ? '#f87171' : '#fbbf24'} />
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: wait > 5 ? 'var(--accent-red)' : 'var(--accent-yellow)' }}>
                          {wait > 5 ? `Overdue — ${wait} days waiting` : `${wait} day${wait !== 1 ? 's' : ''} since submission`}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Submitted {g.date}
                        </div>
                      </div>
                    </div>
                  )}

                  {g.note && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: '10px', padding: '12px 16px', marginBottom: '22px' }}>
                      <FileSignature size={16} color="var(--accent-red)" style={{ flexShrink: 0, marginTop: '1px' }} />
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent-red)', marginBottom: '3px' }}>Admin Note</div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>{g.note}</div>
                      </div>
                    </div>
                  )}

                  <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '14px 16px', marginBottom: '22px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <ShieldCheck size={14} color="var(--accent-green)" />
                      <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent-green)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ledger Integrity</div>
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)', wordBreak: 'break-all', lineHeight: '1.6' }}>
                      {g.currentHash || 'Not yet sealed'}
                    </div>
                  </div>

                  {g.status === 'Pending' && (
                    <div style={{ display: 'flex', gap: '12px', paddingTop: '4px', borderTop: '1px solid var(--border-subtle)' }}>
                      {renderGrantActions(g, { closeModalAfterAction: true })}
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      <AnimatePresence>
        {holdTarget && (
          <motion.div className="modal-overlay" initial={{ opacity: 0, backdropFilter: 'blur(0px)' }} animate={{ opacity: 1, backdropFilter: 'blur(10px)' }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <motion.div className="glass-modal-content" style={{ maxWidth: '480px', width: '100%' }} initial={{ scale: 0.92, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.92, y: 20, opacity: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <h2 style={{ margin: 0, fontSize: '20px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShieldAlert size={20} /> Put Grant On Hold
                </h2>
                <button onClick={closeHoldModal} style={{ background: 'none', border: 'none', fontSize: '26px', color: 'var(--text-muted)', cursor: 'pointer' }}>×</button>
              </div>

              <label className="input-label">Hold Category</label>
              <div className="hold-select-wrap">
                <button
                  type="button"
                  className="hold-select-trigger"
                  onClick={() => setShowHoldCategoryMenu(prev => !prev)}
                >
                  <span className="hold-select-label">{formatHoldLabel(holdCategory)}</span>
                  <span className={`hold-select-chevron${showHoldCategoryMenu ? ' open' : ''}`}>⌄</span>
                </button>
                {showHoldCategoryMenu && (
                  <div className="hold-select-menu">
                    {HOLD_CATEGORY_OPTIONS.map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => { setHoldCategory(opt); setShowHoldCategoryMenu(false); }}
                        className={`hold-select-option${holdCategory === opt ? ' selected' : ''}`}
                      >
                        {formatHoldLabel(opt)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {holdCategory === 'OTHER' && (
                <>
                  <label className="input-label">Custom Reason</label>
                  <input className="dark-input" value={customReasonInput} onChange={e => setCustomReasonInput(e.target.value)} placeholder="Enter custom reason" />
                </>
              )}

              <label className="input-label">Admin Notes</label>
              <textarea className="dark-input" rows={3} value={holdAdminNotesInput} onChange={e => setHoldAdminNotesInput(e.target.value)} placeholder="Internal notes for this hold" />

              <label className="input-label">Upload Evidence (optional)</label>
              <input
                className="dark-input"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                multiple
                onChange={e => setHoldEvidenceFiles(Array.from(e.target.files || []))}
              />
              {holdEvidenceFiles.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                  {holdEvidenceFiles.map(file => (
                    <span key={file.name} style={{ fontSize: '11px', color: 'var(--text-primary)', background: 'rgba(79,156,249,0.12)', border: '1px solid rgba(79,156,249,0.25)', borderRadius: '999px', padding: '5px 10px' }}>
                      {file.name}
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button className="neon-btn neon-red" style={{ flex: 1 }} onClick={confirmGrantHold}>Confirm Hold</button>
                <button onClick={closeHoldModal} style={{ flex: 1, background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontFamily: 'DM Sans' }}>Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {holdHistoryTarget && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="glass-modal-content" style={{ maxWidth: '560px', width: '100%', padding: '22px 24px' }} initial={{ scale: 0.92, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.92, y: 20, opacity: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600', letterSpacing: '0.3px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ScrollText size={20} /> Hold History
                </h2>
                <button onClick={closeHoldHistoryModal} style={{ background: 'none', border: 'none', fontSize: '26px', color: 'var(--text-muted)', cursor: 'pointer' }}>×</button>
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '14px', opacity: 0.75, marginTop: '4px', marginBottom: '14px' }}>
                {holdHistoryTarget.source} • {holdHistoryTarget.type}
              </div>
              {(() => {
                const baseHistory = holdHistoryTarget.holdDetails?.holdHistory || [];
                const historyItems = [...baseHistory];
                if (isWithdrawalRequested(holdHistoryTarget) && !historyItems.some(item => item?.action === 'WITHDRAWAL_REQUESTED')) {
                  historyItems.unshift({
                    action: 'WITHDRAWAL_REQUESTED',
                    reason: 'Applicant requested withdrawal during hold',
                    category: 'WITHDRAWAL',
                    timestamp: holdHistoryTarget.withdrawalRequestedAt || new Date().toISOString()
                  });
                }
                return (
              <div className="dark-scroll" style={{ maxHeight: '360px', overflowY: 'auto', paddingRight: '6px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {historyItems.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '13.5px', textAlign: 'center', padding: '22px 8px', lineHeight: '1.6' }}>
                    No hold history available.
                  </div>
                ) : (
                  historyItems.map((item, idx) => {
                    const t = item?.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
                    const evidenceCount = Array.isArray(item?.evidenceFiles) ? item.evidenceFiles.length : 0;
                    const reasonText = item?.action === 'WITHDRAWAL_REQUESTED'
                      ? 'Applicant requested withdrawal during hold'
                      : (item?.reason ? formatReason(item.reason) : '-');
                    return (
                      <div key={`${item?.timestamp || idx}-${idx}`} style={{ padding: '16px 18px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '8px', lineHeight: '1.6' }}>
                        <div style={{ fontSize: '14.5px', fontWeight: '600', color: '#60a5fa' }}>[{t}] {formatLabel(item?.action || 'HOLD_EVENT')}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ fontSize: '13.5px', lineHeight: '1.6', color: 'rgba(255,255,255,0.85)' }}><span style={{ opacity: 0.6 }}>Reason:</span> {reasonText}</div>
                          <div style={{ fontSize: '13.5px', lineHeight: '1.6', color: 'rgba(255,255,255,0.85)' }}><span style={{ opacity: 0.6 }}>Category:</span> {item?.category ? formatLabel(item.category) : '-'}</div>
                          <div style={{ fontSize: '13.5px', lineHeight: '1.6', color: 'rgba(255,255,255,0.85)' }}><span style={{ opacity: 0.6 }}>Evidence:</span> {evidenceCount} file{evidenceCount !== 1 ? 's' : ''}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {rejectTarget && (
          <motion.div className="modal-overlay" initial={{ opacity: 0, backdropFilter: 'blur(0px)' }} animate={{ opacity: 1, backdropFilter: 'blur(10px)' }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              style={{ maxWidth: '480px', width: '100%', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}
            >
              <div style={{ background: 'linear-gradient(135deg,rgba(185,28,28,0.9),rgba(239,68,68,0.8))', padding: '22px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <XCircle size={20} color="white" />
                  </div>
                  <div>
                    <div style={{ color: 'white', fontFamily: 'DM Serif Display,serif', fontSize: '20px', fontWeight: '400' }}>Reject Grant</div>
                    <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px', marginTop: '2px' }}>This action will notify the applicant</div>
                  </div>
                </div>
                <button onClick={() => setRejectTarget(null)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
              <div style={{ background: 'var(--bg-surface)', padding: '24px 28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '14px 16px', marginBottom: '20px' }}>
                  <span className={`category-tag cat-${STANDARD_TYPES.includes(rejectTarget.type) ? rejectTarget.type : 'Other'}`}>{rejectTarget.type}</span>
                  <div>
                    <div style={{ color: 'var(--text-primary)', fontWeight: '700', fontSize: '15px' }}>{rejectTarget.source}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>₹{rejectTarget.amount.toLocaleString()} · Applied {rejectTarget.date}</div>
                  </div>
                </div>
                <div style={{ position: 'relative' }}>
                  <label className="input-label">Reason for rejection <span style={{ color: 'var(--accent-red)' }}>*</span> (shown to applicant)</label>
                  <textarea
                    className="dark-input"
                    rows={4}
                    placeholder="Be specific — e.g. 'Budget requested exceeds the ₹25,000 limit for your credit tier. Please reapply with a revised amount.'"
                    value={rejectNote}
                    onChange={e => setRejectNote(e.target.value)}
                    style={{ resize: 'vertical', lineHeight: '1.5', borderColor: rejectNote.length > 0 && rejectNote.length < 15 ? 'var(--accent-red)' : rejectNote.length >= 15 ? 'rgba(16,185,129,0.4)' : undefined }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '-16px', marginBottom: '16px', fontSize: '11px' }}>
                    <span style={{ color: rejectNote.length < 15 && rejectNote.length > 0 ? 'var(--accent-red)' : 'var(--text-muted)' }}>
                      {rejectNote.length < 15 && rejectNote.length > 0 ? `${15 - rejectNote.length} more characters required` : 'Minimum 15 characters'}
                    </span>
                    <span style={{ color: rejectNote.length >= 15 ? 'var(--accent-green)' : 'var(--text-muted)', fontWeight: '600' }}>{rejectNote.length}/300</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <motion.button
                    whileHover={{ scale: rejectNote.length >= 15 ? 1.02 : 1 }} whileTap={{ scale: rejectNote.length >= 15 ? 0.98 : 1 }}
                    style={{ flex: 1, padding: '13px', background: rejectNote.length >= 15 ? 'var(--accent-red)' : 'var(--bg-elevated)', color: rejectNote.length >= 15 ? 'white' : 'var(--text-muted)', border: `1px solid ${rejectNote.length >= 15 ? 'var(--accent-red)' : 'var(--border-subtle)'}`, borderRadius: '10px', cursor: rejectNote.length >= 15 ? 'pointer' : 'not-allowed', fontWeight: '700', fontSize: '14px', fontFamily: 'DM Sans', transition: 'all 0.2s', boxShadow: rejectNote.length >= 15 ? '0 4px 16px rgba(239,68,68,0.35)' : 'none' }}
                    onClick={() => rejectNote.length >= 15 && updateStatus(rejectTarget.id, 'Rejected', rejectNote)}
                  >
                    Confirm Rejection
                  </motion.button>
                  <button onClick={() => setRejectTarget(null)} style={{ flex: 1, background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '14px', fontFamily: 'DM Sans' }}>Cancel</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {historyApplicant && (() => {
          const ag = getApplicantGrants(historyApplicant);
          const totalReq = ag.reduce((s, g) => s + g.amount, 0);
          const totalDisb = ag.reduce((s, g) => s + (g.disbursedAmount || 0), 0);
          const completed = ag.filter(g => g.status === 'Evaluated' || g.status === 'Fully Disbursed').length;
          const rejected = ag.filter(g => g.status === 'Rejected').length;
          return (
            <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div className="glass-modal-content" style={{ maxWidth: '680px' }} initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px' }}>
                  <div>
                    <h2 style={{ color: 'var(--text-primary)', margin: '0 0 3px', fontSize: '22px', fontFamily: 'DM Serif Display', display: 'flex', alignItems: 'center', gap: '8px' }}><User /> {historyApplicant}</h2>
                    <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Full application history</span>
                  </div>
                  <button onClick={() => setHistoryApplicant(null)} style={{ background: 'none', border: 'none', fontSize: '26px', color: 'var(--text-muted)', cursor: 'pointer' }}>×</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '22px' }}>
                  {[
                    { l: 'Total Applied', v: ag.length, c: 'var(--accent-blue)' },
                    { l: 'Completed', v: completed, c: 'var(--accent-green)' },
                    { l: 'Rejected', v: rejected, c: 'var(--accent-red)' },
                    { l: 'Total Received', v: `₹${totalDisb.toLocaleString()}`, c: 'var(--accent-purple)' },
                  ].map((s, idx) => (
                    <motion.div
                      key={s.l}
                      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.07, type: 'spring', stiffness: 300, damping: 22 }}
                      style={{
                        background: `${s.c.replace('var(--accent-', '').replace(')', '') === 'blue' ? 'rgba(79,156,249' : s.c.replace('var(--accent-', '').replace(')', '') === 'green' ? 'rgba(52,211,153' : s.c.replace('var(--accent-', '').replace(')', '') === 'red' ? 'rgba(248,113,113' : 'rgba(167,139,250'},0.08)`,
                        borderRadius: '14px', padding: '16px', textAlign: 'center',
                        border: `1px solid ${s.c.replace('var(--accent-', '').replace(')', '') === 'blue' ? 'rgba(79,156,249' : s.c.replace('var(--accent-', '').replace(')', '') === 'green' ? 'rgba(52,211,153' : s.c.replace('var(--accent-', '').replace(')', '') === 'red' ? 'rgba(248,113,113' : 'rgba(167,139,250'},0.2)`,
                        position: 'relative', overflow: 'hidden',
                      }}
                      whileHover={{ scale: 1.04 }}
                    >
                      <div style={{ fontFamily: 'DM Serif Display,serif', fontSize: '26px', color: s.c, lineHeight: 1, textShadow: `0 0 20px ${s.c}44` }}>{s.v}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '5px', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: '700' }}>{s.l}</div>
                    </motion.div>
                  ))}
                </div>

                <div style={{ marginBottom: '20px', background: 'var(--bg-elevated)', borderRadius: '12px', padding: '14px 16px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)' }}>Completion Rate</span>
                    <span style={{ fontFamily: 'DM Serif Display,serif', fontSize: '22px', color: 'var(--accent-green)', textShadow: '0 0 16px rgba(52,211,153,0.4)' }}>{ag.length > 0 ? Math.round(completed / ag.length * 100) : 0}%</span>
                  </div>
                  <div style={{ height: '6px', background: 'var(--border-subtle)', borderRadius: '4px', overflow: 'hidden' }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${ag.length > 0 ? completed / ag.length * 100 : 0}%` }}
                      transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
                      style={{ height: '100%', background: 'linear-gradient(90deg,var(--accent-green),#34d399)', borderRadius: '4px', boxShadow: '0 0 8px rgba(52,211,153,0.5)' }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    <span>{completed} completed</span>
                    <span>{ag.length - completed - rejected} in progress · {rejected} rejected</span>
                  </div>
                </div>

                <div style={{ maxHeight: '280px', overflowY: 'auto' }} className="dark-scroll">
                  {ag.map((g, i) => {
                    const risk = getRisk(g.creditScore);
                    const adminStatus = getAdminDisplayStatus(g);
                    const isGood = adminStatus === 'Evaluated' || adminStatus === 'Fully Disbursed';
                    const isBad = adminStatus === 'Rejected' || adminStatus === 'Blocked' || adminStatus === 'WITHDRAWN';
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05, duration: 0.3 }}
                        style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '12px 12px', borderBottom: '1px solid var(--border-subtle)',
                          borderLeft: `3px solid ${isGood ? 'rgba(52,211,153,0.4)' : isBad ? 'rgba(248,113,113,0.4)' : 'rgba(251,191,36,0.3)'}`,
                          borderRadius: '0 6px 6px 0', marginBottom: '2px',
                          background: isGood ? 'rgba(52,211,153,0.02)' : isBad ? 'rgba(248,113,113,0.02)' : 'transparent',
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '4px' }}>
                            <span className={`category-tag ${STANDARD_TYPES.includes(g.type) ? `cat-${g.type}` : 'cat-Other'}`}>{g.type}</span>
                            <span className={`status-badge status-${isGood ? 'Approved' : isBad ? 'Rejected' : 'Pending'}`}>{formatStatus(adminStatus)}</span>
                            <span className="risk-badge" style={{ background: risk.bg, color: risk.color, border: `1px solid ${risk.color}30`, fontSize: '10px', padding: '2px 8px' }}>
                              <span className="risk-dot" style={{ background: risk.dot, width: '5px', height: '5px' }}></span>{risk.label}
                            </span>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{g.date} · Score: <span style={{ color: risk.color, fontWeight: '700' }}>{g.creditScore}</span></div>
                          {g.note && <div style={{ fontSize: '11px', color: 'var(--accent-red)', marginTop: '3px', fontStyle: 'italic' }}>"{g.note}"</div>}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                          <div style={{ color: 'var(--text-primary)', fontWeight: '700', fontSize: '14px' }}>₹{g.amount.toLocaleString()}</div>
                          <div style={{ color: 'var(--accent-blue)', fontSize: '12px', marginTop: '2px' }}>₹{(g.disbursedAmount || 0).toLocaleString()} rcvd</div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
                <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
                  <span>Requested ₹{totalReq.toLocaleString()}</span>
                  <span>Received ₹{totalDisb.toLocaleString()}</span>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      <AnimatePresence>
        {viewingGrant && (
          <>
            <motion.div
              style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.6)' }}
              onClick={() => setViewingGrant(null)}
              initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
              animate={{ opacity: 1, backdropFilter: 'blur(4px)' }}
              exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
              transition={{ duration: 0.3 }}
            />

            <motion.div
              style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: '650px', background: 'var(--bg-base)', zIndex: 9999, display: 'flex', flexDirection: 'column', boxShadow: '-10px 0 50px rgba(0,0,0,0.5)', borderLeft: '1px solid var(--border-subtle)' }}
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 220, mass: 0.8 }}
            >

              <div style={{ background: viewingGrant.status === 'Blocked' ? 'linear-gradient(135deg,rgba(185,28,28,0.85),rgba(239,68,68,0.7))' : 'linear-gradient(135deg,rgba(4,120,87,0.8),rgba(16,185,129,0.6))', padding: '24px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(255,255,255,0.1) inset' }}>
                    {viewingGrant.status === 'Blocked' ? <ShieldAlert size={24} color="white" /> : <FileSearch size={24} color="white" />}
                  </div>
                  <div>
                    <h2 style={{ color: 'white', margin: 0, fontSize: '22px', fontFamily: 'DM Serif Display, serif', letterSpacing: '0.5px' }}>{viewingGrant.status === 'Blocked' ? 'Security Investigation' : 'Proof Verification'}</h2>
                    <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: '13px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}><Fingerprint size={12} /> Case ID: {String(viewingGrant.id).split('-')[0]}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <SpringTooltip text="Toggle Forensics X-ray Mode">
                    <button onClick={() => setXrayMode(!xrayMode)} style={{ background: xrayMode ? 'white' : 'transparent', border: '1px solid white', color: xrayMode ? (viewingGrant.status === 'Blocked' ? '#b91c1c' : '#047857') : 'white', borderRadius: '8px', padding: '8px 14px', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', transition: 'all 0.2s' }}>
                      <ScanLine size={14} /> X-RAY {xrayMode ? 'ON' : 'OFF'}
                    </button>
                  </SpringTooltip>
                  <button onClick={() => setViewingGrant(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color 0.2s' }} onMouseOver={e => e.currentTarget.style.color = 'white'} onMouseOut={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}>
                    <XCircle size={28} />
                  </button>
                </div>
              </div>

              <div style={{ padding: '32px', overflowY: 'auto', flex: 1 }} className="dark-scroll">

                <div style={{ background: 'var(--bg-elevated)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border-subtle)', marginBottom: '24px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
                  <div>
                    <div className="stat-label">Applicant Alias</div>
                    <div style={{ color: 'var(--text-primary)', fontWeight: '700', fontSize: '16px' }}>{viewingGrant.source}</div>
                  </div>
                  <div>
                    <div className="stat-label">Total Requested</div>
                    <div style={{ color: 'var(--accent-blue)', fontWeight: '800', fontSize: '18px' }}>₹{viewingGrant.amount.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="stat-label">Category Match</div>
                    <div><span className={`category-tag ${STANDARD_TYPES.includes(viewingGrant.type) ? `cat-${viewingGrant.type}` : 'cat-Other'}`} style={{ margin: 0 }}>{viewingGrant.type}</span></div>
                  </div>
                  <div>
                    <div className="stat-label">Risk Profile</div>
                    <div>
                      <span className="risk-badge" style={{ background: getRisk(viewingGrant.creditScore).bg, color: getRisk(viewingGrant.creditScore).color, border: `1px solid ${getRisk(viewingGrant.creditScore).color}30`, margin: 0 }}>
                        <span className="risk-dot" style={{ background: getRisk(viewingGrant.creditScore).dot }}></span>{getRisk(viewingGrant.creditScore).label}
                      </span>
                    </div>
                  </div>
                </div>

                {viewingGrant.status === 'Blocked' && (
                  <div style={{ background: 'var(--bg-warn-panel)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border-warn-panel)', marginBottom: '24px' }}>
                    <h4 style={{ margin: '0 0 16px 0', color: 'var(--accent-yellow)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px' }}><ShieldAlert size={18} /> Private Investigation Thread</h4>
                    <div className="dark-scroll" style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '16px', paddingRight: '10px' }}>
                      {(!viewingGrant.privateNotes || viewingGrant.privateNotes.length === 0) ? (
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '10px 0', textAlign: 'center' }}>No notes yet. Start the investigation.</div>
                      ) : viewingGrant.privateNotes.map((n, i) => (
                        <div key={i} style={{ background: 'var(--bg-base)', padding: '12px 16px', borderRadius: '8px', marginBottom: '10px', fontSize: '14px', border: '1px solid rgba(255,255,255,0.03)' }}>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '11px', marginBottom: '6px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}><User size={12} /> <strong>{n.admin}</strong> • {n.timestamp}</div>
                          <div style={{ color: 'var(--text-primary)', lineHeight: '1.5' }}>{n.text}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <input className="dark-input" style={{ marginBottom: 0, flex: 1, fontSize: '14px', padding: '12px 16px', borderRadius: '8px' }} placeholder="Log an internal finding or note..." value={privateNoteText} onChange={e => setPrivateNoteText(e.target.value)} />
                      <button className="neon-btn neon-blue" style={{ width: 'auto', padding: '12px 20px', fontSize: '14px', borderRadius: '8px' }} onClick={() => handleAddPrivateNote(viewingGrant.id)}>Save Note</button>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ color: 'var(--text-primary)', fontSize: '18px', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}><Receipt size={20} /> Submitted Evidence Artifacts ({viewingGrant.proofs?.length || 0})</h3>
                  {xrayMode && <span style={{ fontSize: '12px', color: 'var(--accent-green)', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(16,185,129,0.1)', padding: '4px 10px', borderRadius: '20px', border: '1px solid rgba(16,185,129,0.2)' }}><Eye size={14} /> DEEP SCAN ACTIVE</span>}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {viewingGrant.proofs?.map((proof, pIdx) => {
                    const parsed = proof.description.includes('|')
                      ? proof.description.split('|').reduce((acc, part) => { const [k, v] = part.split(':'); if (k && v) acc[k.trim()] = v.trim(); return acc; }, {})
                      : { raw: proof.description };

                    return (
                      <div key={pIdx} style={{ background: 'var(--bg-input)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                          <div style={{ flex: 1 }}>
                            {parsed.Vendor ? (
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', background: 'var(--bg-elevated)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.03)' }}>
                                <div>
                                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}><Building2 size={12} /> Vendor / Payee</div>
                                  <div style={{ fontSize: '15px', color: 'var(--text-primary)', fontWeight: '600' }}>{parsed.Vendor}</div>
                                </div>
                                <div>
                                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Amount Spent</div>
                                  <div style={{ fontSize: '18px', color: 'var(--accent-green)', fontWeight: '800' }}>{parsed.Amt}</div>
                                </div>
                                <div>
                                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Ledger Category</div>
                                  <div style={{ fontSize: '14px', color: parsed.Cat === viewingGrant.type ? 'var(--accent-green)' : '#f97316', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>{parsed.Cat} {parsed.Cat === viewingGrant.type ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}</div>
                                </div>
                                <div>
                                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Tax/GST Registry</div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{ fontSize: '15px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{parsed.GST || 'N/A'}</span>
                                    {parsed.GST && parsed.GST !== 'N/A' && (
                                      <button onClick={() => verifyVendor(parsed.GST, pIdx)} disabled={verifyingVendor === pIdx} style={{ background: 'var(--bg-base)', color: 'var(--accent-blue)', border: '1px solid var(--accent-blue)', borderRadius: '6px', fontSize: '11px', padding: '4px 10px', cursor: 'pointer', fontWeight: 'bold' }}>
                                        {verifyingVendor === pIdx ? '...' : vendorStatus[pIdx] ? 'Scanned' : 'Query DB'}
                                      </button>
                                    )}
                                  </div>
                                  {vendorStatus[pIdx] && <div style={{ fontSize: '12px', color: vendorStatus[pIdx].includes('✅') ? 'var(--accent-green)' : '#f97316', marginTop: '6px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>{vendorStatus[pIdx].includes('✅') ? <CheckCircle size={12} /> : <AlertTriangle size={12} />} {vendorStatus[pIdx]}</div>}
                                </div>
                              </div>
                            ) : (
                              <div style={{ color: 'var(--text-primary)', fontWeight: '700', fontSize: '16px', background: 'var(--bg-elevated)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.03)' }}>
                                <FileSignature size={16} style={{ marginRight: '8px', color: 'var(--text-muted)' }} /> "{proof.description}"
                              </div>
                            )}
                          </div>
                        </div>

                        <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}><Clock size={12} /> Uploaded on {proof.date}</div>

                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                          {proof.images?.map((img, idx) => {
                            const forensic = proof.forensics?.[idx];
                            const isPdf = img.startsWith('data:application/pdf');
                            const isFlagged = forensic?.status === 'FLAGGED';
                            const borderColor = isFlagged ? '#ef4444' : 'var(--border-subtle)';

                            return (
                              <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '200px', position: 'relative' }}>
                                {xrayMode && !isPdf && (
                                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(4, 15, 10, 0.9)', borderRadius: '12px', border: isFlagged ? '2px solid #ef4444' : '2px solid #10b981', padding: '12px', fontFamily: 'monospace', fontSize: '11px', color: isFlagged ? '#ef4444' : '#10b981', pointerEvents: 'none', zIndex: 10, overflow: 'hidden' }}>
                                    <motion.div animate={{ top: ['0%', '100%'] }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }} style={{ position: 'absolute', left: 0, right: 0, height: '3px', background: isFlagged ? '#ef4444' : '#10b981', boxShadow: `0 0 15px ${isFlagged ? '#ef4444' : '#10b981'}` }} />
                                    <strong style={{ borderBottom: '1px dashed', display: 'block', paddingBottom: '6px', marginBottom: '6px', color: 'white' }}>EXIF METADATA SCAN</strong>
                                    <div style={{ color: 'rgba(255,255,255,0.6)' }}>SIG: {String(viewingGrant.currentHash || viewingGrant.id).slice(0, 10)}...</div>
                                    <div style={{ marginTop: '8px', color: 'white' }}>EXTRACT:</div>
                                    <div style={{ wordWrap: 'break-word', opacity: 0.9, lineHeight: '1.4', marginTop: '4px' }}>{forensic?.details}</div>
                                    <div style={{ marginTop: 'auto', paddingTop: '8px', fontWeight: '900', fontSize: '14px', borderTop: '1px dashed', display: 'flex', alignItems: 'center', gap: '6px' }}>{isFlagged ? <><AlertTriangle size={14} /> TAMPERED SYSTEM</> : <><CheckCircle size={14} /> CLEAN SYSTEM</>}</div>
                                  </div>
                                )}

                                {isPdf ? (
                                  <div onClick={() => setEnlargedImage(img)} style={{ width: '100%', height: '240px', background: 'var(--bg-elevated)', border: `2px solid ${borderColor}`, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-in', transition: 'all 0.2s', color: 'var(--text-muted)' }} onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.borderColor = 'var(--text-muted)'; }} onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = borderColor; }} title="Click to view PDF Document"><FileText size={64} style={{ opacity: 0.5 }} /></div>
                                ) : (
                                  <img src={img} alt="" onClick={() => setEnlargedImage(img)} style={{ width: '100%', height: '240px', objectFit: 'cover', borderRadius: '12px', border: `2px solid ${borderColor}`, cursor: 'zoom-in', transition: 'transform 0.2s', filter: xrayMode ? 'contrast(1.6) brightness(0.6)' : 'none' }} onMouseOver={e => e.currentTarget.style.transform = 'scale(1.02)'} onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'} />
                                )}
                                {forensic && (
                                  <div style={{ fontSize: '11px', padding: '8px 10px', borderRadius: '8px', background: isFlagged ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', color: isFlagged ? '#ef4444' : '#34d399', border: `1px solid ${isFlagged ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`, lineHeight: '1.4' }}>
                                    <strong style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px', fontSize: '12px' }}>{isFlagged ? <AlertTriangle size={12} /> : <CheckCircle size={12} />} {isFlagged ? 'FAILED FORENSICS' : 'PASSED FORENSICS'}</strong>
                                    {forensic.details}
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
              </div>

              {(viewingGrant.status === 'Pending' || viewingGrant.status === 'Awaiting Review' || viewingGrant.status === 'Blocked') && (
                <div style={{ padding: '20px 32px', background: 'var(--bg-elevated)', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: '16px', flexShrink: 0 }}>
                  {viewingGrant.status === 'Pending' && renderGrantActions(viewingGrant, { closeModalAfterAction: true })}
                  {(viewingGrant.status === 'Awaiting Review' || viewingGrant.status === 'Blocked') && (
                    <>
                      <motion.button
                        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                        className="neon-btn neon-green"
                        style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontSize: '15px' }}
                        onClick={() => initiateVaultRelease(viewingGrant)}
                      >
                        <ShieldCheck size={20} /> Authorize Disbursal
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                        className="neon-btn neon-red"
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '14px', padding: '14px' }}
                        onClick={() => { setViewingGrant(null); setRejectTarget(viewingGrant); setRejectNote(''); }}
                      >
                        <ShieldAlert size={18} /> Flag & Block
                      </motion.button>
                    </>
                  )}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {viewingImpact && (() => {
          const metric = viewingImpact.impact?.metric || 0;
          const amt = viewingImpact.amount || 1;
          const efficiency = (metric / (amt / 1000)).toFixed(1);

          return (
            <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div className="glass-modal-content" style={{ maxWidth: '550px' }} initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <h2 style={{ color: 'var(--text-primary)', margin: 0, fontSize: '22px', display: 'flex', alignItems: 'center', gap: '8px' }}><Rocket /> Program Impact Evaluation</h2>
                  <button onClick={() => setViewingImpact(null)} style={{ background: 'none', border: 'none', fontSize: '26px', color: 'var(--text-muted)', cursor: 'pointer' }}>×</button>
                </div>

                <div style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)', padding: '20px', borderRadius: '12px', marginTop: '8px' }}>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px dashed rgba(167,139,250,0.3)' }}>
                    <div>
                      <div className="stat-label" style={{ marginBottom: '4px' }}>Total Investment</div>
                      <div style={{ fontSize: '22px', color: 'var(--text-primary)', fontWeight: 'bold' }}>₹{viewingImpact.amount.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="stat-label" style={{ marginBottom: '4px' }}>Fund Efficiency Score</div>
                      <div style={{ fontSize: '22px', color: 'var(--accent-purple)', fontWeight: 'bold' }}>{efficiency} <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 'normal' }}>KPI / ₹1k</span></div>
                    </div>
                  </div>

                  <div className="stat-label">Reported Outcome</div>
                  <p style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: '500', marginBottom: '20px', background: 'var(--bg-elevated)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-subtle)', lineHeight: '1.5' }}>
                    "{viewingImpact.impact?.outcome}"
                  </p>

                  <div style={{ display: 'flex', gap: '18px' }}>
                    <div style={{ flex: 1 }}>
                      <div className="stat-label">Key Metric Achieved</div>
                      <div style={{ fontSize: '28px', fontFamily: 'DM Serif Display', color: 'var(--accent-green)' }}>
                        <CountUp end={metric} duration={2} separator="," />
                      </div>
                    </div>
                    <div style={{ flex: 2 }}>
                      <div className="stat-label">Deliverable Proof</div>
                      {viewingImpact.impact?.link ? (
                        <a href={viewingImpact.impact.link.startsWith('http') ? viewingImpact.impact.link : `https://${viewingImpact.impact.link}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'var(--accent-blue)', color: 'white', padding: '8px 16px', borderRadius: '8px', textDecoration: 'none', fontSize: '13px', fontWeight: 'bold', marginTop: '4px' }}>
                          🔗 Open Deliverable Link
                        </a>
                      ) : <span style={{ color: 'var(--text-muted)' }}>No link provided</span>}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--accent-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <ShieldCheck size={14} />
                  Cryptographically sealed and verified on ledger.
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      <AnimatePresence>
        {showExportPanel && (
          <motion.div className="modal-overlay" initial={{ opacity: 0, backdropFilter: 'blur(0px)' }} animate={{ opacity: 1, backdropFilter: 'blur(8px)' }} exit={{ opacity: 0, backdropFilter: 'blur(0px)' }} transition={{ duration: 0.3 }}>
            <motion.div className="glass-modal-content" style={{ maxWidth: '580px', padding: '40px' }} initial={{ scale: 0.85, opacity: 0, y: 30 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.85, opacity: 0, y: 30 }} transition={{ type: 'spring', damping: 25, stiffness: 350 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ color: 'var(--text-primary)', margin: 0, fontSize: '28px', display: 'flex', alignItems: 'center', gap: '10px' }}><Download /> Export Report</h2>
                <button onClick={() => setShowExportPanel(false)} style={{ background: 'none', border: 'none', fontSize: '36px', color: 'var(--text-muted)', cursor: 'pointer' }}>×</button>
              </div>
              <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px', marginBottom: '28px' }}>
                <div style={{ fontWeight: '700', color: 'var(--text-primary)', marginBottom: '14px', fontSize: '15px' }}>Report Contents:</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><LayoutDashboard size={14} /> Summary analytics</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><ScrollText size={14} /> Grants organized by status</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><ShieldCheck size={14} /> Risk levels & hashes</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Clock size={14} /> Date-range filtering</div>
                </div>
              </div>
              <label className="input-label" style={{ fontSize: '15px' }}>Date Range (optional)</label>
              <div style={{ display: 'flex', gap: '16px', marginBottom: '28px' }}>
                {[['FROM', exportFrom, setExportFrom], ['TO', exportTo, setExportTo]].map(([label, val, setter]) => (
                  <div key={label} style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: '700' }}>{label}</div>
                    <input type="date" className="dark-input" style={{ marginBottom: 0, fontSize: '16px', padding: '14px' }} value={val} onChange={e => setter(e.target.value)} />
                  </div>
                ))}
              </div>
              <div style={{ background: 'rgba(79,156,249,0.08)', border: '1px solid rgba(79,156,249,0.18)', borderRadius: '10px', padding: '16px 20px', marginBottom: '24px', fontSize: '16px', color: 'var(--accent-blue)', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={16} /> {exportFrom || exportTo ? `${grantsList.filter(g => { const d = new Date(g.date); return (!exportFrom || d >= new Date(exportFrom)) && (!exportTo || d <= new Date(exportTo)); }).length} grants will be included` : `All ${grantsList.length} grants will be included`}
              </div>
              <button className="neon-btn neon-green" style={{ fontSize: '18px', padding: '16px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} onClick={exportToPDF}><Download size={20} /> Generate PDF</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLogs && (
          <motion.div className="modal-overlay" initial={{ opacity: 0, backdropFilter: 'blur(0px)' }} animate={{ opacity: 1, backdropFilter: 'blur(8px)' }} exit={{ opacity: 0, backdropFilter: 'blur(0px)' }} transition={{ duration: 0.3 }}>
            <motion.div className="glass-modal-content" style={{ maxWidth: '920px', width: '92vw' }} initial={{ scale: 0.85, opacity: 0, y: 30 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.85, opacity: 0, y: 30 }} transition={{ type: 'spring', damping: 25, stiffness: 350 }}>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ margin: 0, color: 'var(--text-primary)', fontFamily: 'DM Serif Display', fontSize: '26px', fontWeight: '400', display: 'flex', alignItems: 'center', gap: '10px' }}><ScrollText /> System Audit Trail</h2>
                <button onClick={() => setShowLogs(false)} style={{ background: 'none', border: 'none', fontSize: '32px', color: 'var(--text-muted)', cursor: 'pointer' }}>×</button>
              </div>

              <div className="logs-container dark-scroll">
                <div className="timeline-beam-container" style={{ position: 'relative', paddingLeft: '34px', minHeight: '100%' }}>
                  <div className="timeline-beam"></div>
                  <div className="timeline-beam-glow"></div>

                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>{['Time', 'Actor', 'Action', 'Target', 'Details'].map(h => <th key={h} className="table-header" style={{ fontSize: '14px', paddingBottom: '16px' }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {logs.length === 0
                        ? <tr><td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '15px' }}>No logs yet.</td></tr>
                        : logs.map((log, logIdx) => {
                          const act = (log.action || '').toUpperCase();
                          let badgeClass = 'status-Pending';
                          if (act.includes('APPROV') || act.includes('DISBURS') || act.includes('IMPACT') || act.includes('LIFTED')) badgeClass = 'status-Approved';
                          if (act.includes('REJECT') || act.includes('CANCEL') || act.includes('BLOCK') || act.includes('FLAGGED') || act.includes('BLACKLIST')) badgeClass = 'status-Rejected';

                          return (
                            <motion.tr key={log.id} className="table-row"
                              initial={{ opacity: 0, x: -16 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: logIdx * 0.04, duration: 0.3, ease: 'easeOut' }}>
                              <td style={{ color: 'var(--text-muted)', padding: '16px 14px', fontSize: '14px' }}>{log.timestamp?.split(',')[1]?.trim()}</td>
                              <td style={{ fontWeight: '600', color: 'var(--text-primary)', padding: '16px 14px', fontSize: '15px' }}>{log.admin}</td>
                              <td style={{ padding: '16px 14px' }}><span className={`status-badge ${badgeClass}`} style={{ fontSize: '12px', padding: '6px 12px', whiteSpace: 'nowrap' }}>{log.action}</span></td>
                              <td style={{ color: 'var(--text-secondary)', padding: '16px 14px', fontSize: '15px' }}>{log.target}</td>
                              <td style={{ color: 'var(--text-muted)', padding: '16px 14px', fontSize: '14px', lineHeight: '1.5' }}>{log.details}</td>
                            </motion.tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {enlargedImage && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay" style={{ zIndex: 9999, cursor: 'zoom-out' }} onClick={() => setEnlargedImage(null)}>
            {enlargedImage.startsWith('data:application/pdf') ? (
              <iframe src={enlargedImage} style={{ width: '80vw', height: '85vh', borderRadius: '12px', border: 'none', background: '#fff' }} title="PDF Preview" onClick={e => e.stopPropagation()} />
            ) : (
              <img src={enlargedImage} alt="" style={{ maxHeight: '90vh', maxWidth: '90vw', borderRadius: '12px', boxShadow: '0 0 40px rgba(0,0,0,0.8)' }} onClick={e => e.stopPropagation()} />
            )}
            <button onClick={() => setEnlargedImage(null)} style={{ position: 'absolute', top: '18px', right: '24px', background: 'none', border: 'none', color: 'white', fontSize: '38px', cursor: 'pointer' }}>×</button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        <CommandPalette
          show={showCommandPalette}
          onClose={() => setShowCommandPalette(false)}
          actions={[
            { id: 'dashboard', label: 'Switch to Dashboard', icon: <LayoutDashboard size={14} />, keywords: ['home', 'main', 'overview'], action: () => setActiveTab('dashboard') },
            { id: 'queue', label: 'Switch to Action Queue', icon: <Zap size={14} />, keywords: ['pending', 'review', 'waiting'], action: () => setActiveTab('queue') },
            { id: 'export', label: 'Export Report (PDF)', icon: <Download size={14} />, keywords: ['pdf', 'download', 'report'], shortcut: '⌘E', action: () => setShowExportPanel(true) },
            { id: 'logs', label: 'View Audit Logs', icon: <ScrollText size={14} />, keywords: ['trail', 'history', 'audit'], shortcut: '⌘L', action: () => { setShowLogs(true); fetchLogs(); } },
            { id: 'theme', label: isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode', icon: <span style={{ fontSize: '14px' }}>{isDarkMode ? '☀️' : '🌙'}</span>, keywords: ['dark', 'light', 'mode', 'theme'], action: toggleTheme },
            { id: 'filter-all', label: 'Show All Grants', icon: <Search size={14} />, keywords: ['filter', 'clear', 'reset'], action: () => setFilterStatus('All') },
            { id: 'filter-pending', label: 'Filter: Pending Grants', icon: <Clock size={14} />, keywords: ['filter', 'status', 'waiting'], action: () => { setActiveTab('dashboard'); setFilterStatus('Pending'); } },
            { id: 'filter-approved', label: 'Filter: Phase 1 Approved', icon: <CheckCircle size={14} />, keywords: ['filter', 'status', 'approved'], action: () => { setActiveTab('dashboard'); setFilterStatus('Phase 1 Approved'); } },
            { id: 'logout', label: 'Logout', icon: <XCircle size={14} />, keywords: ['sign out', 'exit'], action: handleLogout },
          ]}
        />
      </AnimatePresence>
      {activeTab === 'kyc' && (
  <motion.div key="kyc" className="kyc-tab-content"
    variants={{ initial: { opacity: 0, x: 40, filter: 'blur(4px)' }, animate: { opacity: 1, x: 0, filter: 'blur(0px)' }, exit: { opacity: 0, x: -40, filter: 'blur(4px)' } }}
    initial="initial" animate="animate" exit="exit"
    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>

    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
      <div className="section-title" style={{ margin: 0 }}>KYC Verification Queue</div>
      <span style={{ background: 'rgba(79,156,249,0.15)', color: 'var(--accent-blue)',
        border: '1px solid rgba(79,156,249,0.25)', fontSize: '12px', fontWeight: '700',
        padding: '4px 12px', borderRadius: '20px' }}>
        {kycList.filter(k => k.status === 'Pending').length} pending
      </span>
    </div>

    {kycList.length === 0 ? (
      <div className="glass-card" style={{ textAlign: 'center', padding: '64px 40px' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🪪</div>
        <div style={{ color: 'var(--text-heading)', fontFamily: 'DM Serif Display,serif',
          fontSize: '22px', marginBottom: '8px' }}>No verification requests</div>
        <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Applicants who submit their ID will appear here.
        </div>
      </div>
    ) : (
      <div className="history-list dark-scroll kyc-queue-list">
        {kycList.map((kyc, i) => {
  const imgs = kycImages[kyc.email];
  const isLoading = loadingKycImages[kyc.email];
  const isPending = kyc.status === 'Pending';

  return (
    <motion.div key={kyc.email}
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.07 }}
      className="glass-card history-item kyc-card"
      style={{
        borderLeft: `4px solid ${isPending ? 'rgba(79,156,249,0.5)' : kyc.status === 'Approved' ? 'rgba(52,211,153,0.5)' : 'rgba(248,113,113,0.5)'}`,
        padding: '24px',
        display: 'block',
      }}>

      {/* Top row: avatar + info + actions */}
      <div className="kyc-card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
        
        {/* Left: avatar + name + badges */}
        <div className="kyc-card-profile" style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg,var(--accent-blue),var(--accent-purple))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '18px', fontWeight: '700', color: 'white' }}>
            {kyc.name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '15px', marginBottom: '4px' }}>
              {kyc.name}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>{kyc.email}</div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ background: 'rgba(79,156,249,0.1)', color: 'var(--accent-blue)',
                border: '1px solid rgba(79,156,249,0.2)', fontSize: '11px', fontWeight: '700',
                padding: '3px 10px', borderRadius: '8px' }}>
                🪪 {kyc.idType}
              </span>
              <span className={`status-badge status-${kyc.status === 'Approved' ? 'Approved' : kyc.status === 'Rejected' ? 'Rejected' : 'Pending'}`}>
                {kyc.status}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Submitted {kyc.submittedAt}
              </span>
            </div>
          </div>
        </div>

        {/* Right: action buttons */}
        {isPending && (
          <div className="kyc-card-actions" style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
            <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
              onClick={() => reviewKyc(kyc.email, 'Approved')}
              className="neon-btn neon-green"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', width: 'auto' }}>
              <BadgeCheck size={14} /> Approve
            </motion.button>
            <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
              onClick={() => { setKycRejectTarget(kyc); setKycRejectNote(''); }}
              className="neon-btn neon-red"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', width: 'auto' }}>
              <XCircle size={14} /> Reject
            </motion.button>
          </div>
        )}
      </div>

      {/* Forensics row */}
      <div className="kyc-card-forensics" style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[['Front', kyc.frontForensics], ['Back', kyc.backForensics]].map(([side, f]) => f && (
          <div key={side} style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '8px',
            background: f.status === 'FLAGGED' ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
            color: f.status === 'FLAGGED' ? 'var(--accent-red)' : 'var(--accent-green)',
            border: `1px solid ${f.status === 'FLAGGED' ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}`,
            display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600' }}>
            {f.status === 'FLAGGED' ? '⚠️' : '✅'} {side}: {f.details}
          </div>
        ))}
      </div>

      {/* Image section */}
      {!isLoading && (
        <button
          onClick={() => {
            if (imgs) {
              setKycImages(prev => {
                const updated = { ...prev };
                delete updated[kyc.email];
                return updated;
              });
            } else {
              loadKycImages(kyc.email);
            }
          }}
          className="neon-btn neon-blue"
          style={{ width: 'auto', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Eye size={14} /> {imgs ? 'Hide ID Images' : 'Load ID Images'}
        </button>
      )}
      {isLoading && (
        <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '8px 0' }}>Loading images...</div>
      )}
      {imgs && (
        <div className="kyc-image-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', maxWidth: '520px' }}>
          {[['Front', imgs.frontImage], ['Back', imgs.backImage]].map(([side, src]) => (
            <div key={side}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700',
                textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px' }}>
                {side}
              </div>
              <img src={src} alt={side}
                onClick={() => setEnlargedImage(src)}
                style={{ width: '100%', height: '140px', objectFit: 'cover',
                  borderRadius: '10px', border: '1px solid var(--border-subtle)',
                  cursor: 'zoom-in', transition: 'transform 0.2s, box-shadow 0.2s',
                  display: 'block' }}
                onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)'; }}
                onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }} />
            </div>
          ))}
        </div>
      )}

      {/* Rejection note */}
      {kyc.status === 'Rejected' && kyc.rejectionNote && (
        <div style={{ marginTop: '16px', background: 'rgba(239,68,68,0.07)',
          border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px',
          padding: '10px 14px', fontSize: '13px', color: 'var(--accent-red)' }}>
          📝 Rejection reason: "{kyc.rejectionNote}"
        </div>
      )}
    </motion.div>
  );
        })}
      </div>
    )}

    {/* KYC Reject Modal */}
    <AnimatePresence>
      {kycRejectTarget && (
        <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="glass-modal-content" style={{ maxWidth: '440px' }}
            initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '20px', color: 'var(--text-primary)',
                display: 'flex', alignItems: 'center', gap: '8px' }}>
                <XCircle size={20} /> Reject Verification
              </h2>
              <button onClick={() => setKycRejectTarget(null)}
                style={{ background: 'none', border: 'none', fontSize: '26px',
                  color: 'var(--text-muted)', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ background: 'var(--bg-elevated)', borderRadius: '10px',
              padding: '12px 16px', marginBottom: '18px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              Rejecting <strong>{kycRejectTarget.name}</strong>'s {kycRejectTarget.idType}. They will be notified and can resubmit.
            </div>
            <label className="input-label">Reason (shown to applicant) *</label>
            <textarea className="dark-input" rows={3}
              placeholder="e.g. Image is blurry, please upload a clearer photo."
              value={kycRejectNote} onChange={e => setKycRejectNote(e.target.value)} />
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button className="neon-btn neon-red" style={{ flex: 1,
                opacity: kycRejectNote.trim().length < 10 ? 0.5 : 1,
                pointerEvents: kycRejectNote.trim().length < 10 ? 'none' : 'auto' }}
                onClick={() => reviewKyc(kycRejectTarget.email, 'Rejected', kycRejectNote)}>
                Confirm Rejection
              </button>
              <button onClick={() => setKycRejectTarget(null)}
                style={{ flex: 1, background: 'transparent', border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)', borderRadius: '10px', cursor: 'pointer',
                  fontWeight: '600', fontFamily: 'DM Sans' }}>
                Cancel
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  </motion.div>
)}

    </div>
  );
}
// END OF FILE
