import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import jsPDF from 'jspdf';
import Particles from "react-tsparticles";
import { loadSlim } from "tsparticles-slim";
import autoTable from 'jspdf-autotable';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Toaster, toast } from 'sonner';
import CountUp from 'react-countup';
import confetti from 'canvas-confetti';
import { 
  LayoutDashboard, Zap, Download, ScrollText, CheckCircle, XCircle, 
  FileSearch, ShieldAlert, Rocket, Search, AlertTriangle, Clock, 
  User, Eye, EyeOff, Receipt, ShieldCheck, FileText, CheckCircle2, 
  FileSignature 
} from 'lucide-react';
import './AdminDashboard.css';

const STANDARD_TYPES = ["Research", "Travel", "Equipment", "Stipend"];
const ALL_STATUSES   = ["Pending", "Phase 1 Approved", "Awaiting Review", "Fully Disbursed", "Evaluated", "Rejected", "Blocked"];
const API = 'http://localhost:3001';

const getRisk = (score) => {
  const s = parseInt(score);
  if (isNaN(s)) return { label:'Unknown',   color:'#64748b', bg:'rgba(100,116,139,0.14)', dot:'#64748b' };
  if (s >= 750)  return { label:'Low Risk',  color:'#34d399', bg:'rgba(52,211,153,0.12)',  dot:'#34d399' };
  if (s >= 600)  return { label:'Med Risk',  color:'#fbbf24', bg:'rgba(251,191,36,0.12)',  dot:'#fbbf24' };
  return               { label:'High Risk', color:'#f87171', bg:'rgba(248,113,113,0.12)', dot:'#f87171' };
};

const daysSince = (dateStr) => { const d = new Date(dateStr); return isNaN(d) ? 0 : Math.floor((Date.now() - d) / 86400000); };
const ACTION_STATUSES = ['Pending', 'Awaiting Review', 'Blocked'];

const STATUS_COLORS = {
  All: '#4f9cf9', Pending: '#fbbf24', 'Phase 1 Approved': '#34d399',
  'Awaiting Review': '#f97316', 'Fully Disbursed': '#a78bfa',
  Evaluated: '#22d3ee', Rejected: '#f87171', Blocked: '#b91c1c'
};

const triggerConfetti = () => {
  const end = Date.now() + 1.5 * 1000;
  const colors = ['#3b82f6', '#10b981', '#a78bfa']; 
  (function frame() {
    confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors: colors, zIndex: 99999 });
    confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors: colors, zIndex: 99999 });
    if (Date.now() < end) requestAnimationFrame(frame);
  }());
};

const SpringTooltip = ({ text, children }) => {
  const [show, setShow] = useState(false);
  const [pos, setPos] = React.useState({ x: 0, y: 0 });
  const handleMM = (e) => { setPos({ x: e.clientX+14, y: e.clientY-40 }); };

  return (
    <div style={{ display: 'inline-block' }} onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)} onMouseMove={handleMM}>
      {show && createPortal(
        <div className="cyber-tooltip" style={{ position:'fixed', top: pos.y, left: pos.x, zIndex:9999, pointerEvents:'none' }}>
          {text}
        </div>,
        document.body
      )}
      {children}
    </div>
  );
};

const BAR_MAX_H  = 240;   // fixed pixel height — tallest bar fills this exactly
const LABEL_H   = 28;    // px strip below baseline for x-axis names
const Y_LABEL_W = 46;    // px strip left of bars for y-axis labels

const FramerBarChart = ({ data, isDarkMode }) => {
  const max = Math.max(...data.map(d => d.amount), 10);
  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  const [tooltip, setTooltip] = useState({ show: false, text: '', x: 0, y: 0 });

  if (data.length === 0) return <div className="no-data">No disbursed grants yet</div>;

  // Total canvas height = bars + label strip
  const CANVAS_H = BAR_MAX_H + LABEL_H;

  return (
    <div style={{ display: 'flex', height: `${CANVAS_H}px`, marginTop: '16px', userSelect: 'none' }}>

      {/* ── Y-axis labels ── */}
      <div style={{ width: `${Y_LABEL_W}px`, flexShrink: 0, position: 'relative' }}>
        {yTicks.map(t => (
          <div key={t} style={{
            position: 'absolute',
            // bottom of bar area is at LABEL_H from canvas bottom
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

      {/* ── Chart body ── */}
      <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>

        {/* Gridlines — cover only the BAR_MAX_H zone above baseline */}
        {yTicks.filter(t => t > 0).map(t => (
          <div key={t} style={{
            position: 'absolute',
            left: 0, right: 0,
            // position from bottom: label strip + proportional height
            bottom: LABEL_H + t * BAR_MAX_H,
            height: 0,
            borderTop: t === 1
              ? '1px solid rgba(255,255,255,0.08)'
              : '1px dashed rgba(255,255,255,0.05)',
            pointerEvents: 'none',
            zIndex: 0,
          }} />
        ))}

        {/* Solid baseline */}
        <div style={{
          position: 'absolute',
          left: 0, right: 0,
          bottom: LABEL_H,
          height: '1px',
          background: 'rgba(255,255,255,0.12)',
          zIndex: 1,
        }} />

        {/* Bars — each absolutely positioned from bottom: LABEL_H so they ALL sit on baseline */}
        <div style={{
          position: 'absolute',
          left: 0, right: 0,
          bottom: LABEL_H,   // ← baseline
          height: BAR_MAX_H, // ← clipping ceiling
          overflow: 'hidden', // bars cannot exceed ceiling
          display: 'flex',
          alignItems: 'flex-end', // stack from bottom inside this container
          justifyContent: 'space-around',
          padding: '0 4px',
          zIndex: 2,
        }}>
          {data.map((d, i) => {
            const totalH    = Math.round((d.amount / max) * BAR_MAX_H);
            const releasedH = Math.round(((d.disbursedAmount || 0) / max) * BAR_MAX_H);
            const lockedH   = totalH - releasedH;
            const s = parseInt(d.creditScore);
            const color = s >= 750 ? '#10b981' : s >= 600 ? '#f59e0b' : '#ef4444';
            const pct = d.amount > 0 ? Math.round(((d.disbursedAmount||0)/d.amount)*100) : 0;

            return (
              <div
                key={i}
                style={{
                  // Each bar column is self-contained — bottom is already the baseline
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end', // segments stack from bottom
                  alignItems: 'stretch',
                  height: '100%',             // full BAR_MAX_H — unused space is transparent
                  width: '100%',
                  maxWidth: '52px',
                  cursor: 'crosshair',
                  flexShrink: 0,
                }}
                onMouseMove={e => {
                  setTooltip({ show: true, text: `${d.source}: ₹${(d.disbursedAmount||0).toLocaleString()} / ₹${d.amount.toLocaleString()} (${pct}%)`, x: e.clientX+14, y: e.clientY-40 });
                }}
                onMouseLeave={() => setTooltip(p => ({ ...p, show: false }))}
              >
                {/* Locked (grey) top portion */}
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

                {/* Released (coloured) bottom portion */}
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

                {/* Pending-only bar (nothing released yet) */}
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

        {/* X-axis name labels */}
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

      {/* Tooltip — portal to escape transformed ancestors */}
      {tooltip.show && createPortal(
        <div className="cyber-tooltip" style={{ position:'fixed', top: tooltip.y, left: tooltip.x, zIndex:9999, pointerEvents:'none' }}>
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
  const colors = ['#4f9cf9','#34d399','#a78bfa','#f87171','#22d3ee'];
  const radius = 70;
  const circum = 2 * Math.PI * radius;

  // Tooltip state — raw pixel coords tracked on the wrapper div, not SVG elements
  const [hoveredIdx, setHoveredIdx] = useState(null);

  if (total === 0) return <div className="no-data">No disbursals yet</div>;

  // Pre-compute segment offsets outside render
  const segments = [];
  let currentOffset = 0;
  for (let i = 0; i < entries.length; i++) {
    const [label, val] = entries[i];
    const strokeLen = (val / total) * circum;
    segments.push({ label, val, strokeLen, offset: currentOffset, color: colors[i % colors.length] });
    currentOffset += strokeLen;
  }

  // Given a mouse position over the SVG wrapper, work out which segment was hit
  // by computing the angle relative to SVG centre and matching to segment arcs
  const getSegmentAtPoint = (svgEl, clientX, clientY) => {
    const rect = svgEl.getBoundingClientRect();
    // Centre of the SVG in screen coords
    const cx = rect.left + rect.width / 2;
    const cy = rect.top  + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.sqrt(dx*dx + dy*dy);
    // Scale: SVG is 220px wide for a viewBox of 220 units → scale = rect.width/220
    const scale = rect.width / 220;
    const innerR = (radius - 14) * scale;
    const outerR = (radius + 14) * scale;
    if (dist < innerR || dist > outerR) return null; // outside the donut ring

    // Angle in radians from -90deg (SVG rotated -90deg, so top = 0)
    // atan2 gives angle from positive x-axis; we need from top (−90deg offset)
    let angle = Math.atan2(dy, dx) + Math.PI / 2; // shift so 0 = top
    if (angle < 0) angle += 2 * Math.PI;
    const arcPos = angle * radius; // position along circumference

    for (const seg of segments) {
      if (arcPos >= seg.offset && arcPos < seg.offset + seg.strokeLen) return seg;
    }
    return segments[segments.length - 1]; // fallback to last
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

        {/* Centre label */}
        <div style={{ position: 'absolute', textAlign: 'center', pointerEvents: 'none' }}>
          {hoveredIdx !== null ? (
            <motion.div key={hoveredIdx} initial={{ opacity:0, scale:0.85 }} animate={{ opacity:1, scale:1 }} transition={{ duration:0.15 }}>
              <div style={{ fontSize:'11px', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'1px' }}>
                {segments[hoveredIdx].label}
              </div>
              <div style={{ fontSize:'20px', fontWeight:'800', color: segments[hoveredIdx].color }}>
                ₹{segments[hoveredIdx].val >= 100000
                  ? (segments[hoveredIdx].val/100000).toFixed(1)+'L'
                  : segments[hoveredIdx].val.toLocaleString()}
              </div>
              <div style={{ fontSize:'11px', color:'var(--text-muted)', marginTop:'2px' }}>
                {Math.round(segments[hoveredIdx].val/total*100)}%
              </div>
            </motion.div>
          ) : (
            <motion.div key="total" initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ duration:0.15 }}>
              <div style={{ fontSize:'11px', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'1px' }}>Total</div>
              <div style={{ fontSize:'22px', fontWeight:'800', color:'var(--text-primary)' }}>
                ₹{total >= 100000 ? (total/100000).toFixed(1)+'L' : total.toLocaleString()}
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display:'flex', flexWrap:'wrap', justifyContent:'center', gap:'12px', marginTop:'14px' }}>
        {segments.map((seg, i) => (
          <div key={seg.label} style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', color: hoveredIdx===i ? seg.color : 'var(--text-secondary)', fontWeight: hoveredIdx===i ? '700' : '600', transition:'color 0.15s' }}>
            <span style={{ width:'10px', height:'10px', borderRadius:'3px', background:seg.color, boxShadow: hoveredIdx===i ? `0 0 6px ${seg.color}` : 'none', transition:'box-shadow 0.15s' }}></span>
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
        if(i < iterations) return text[i];
        return letters[Math.floor(Math.random() * letters.length)]
      }).join(""));
      if(iterations >= text.length) clearInterval(interval);
      iterations += 1/3;
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
  const [activeTab,    setActiveTab]    = useState('dashboard');
  const [filterStatus, setFilterStatus] = useState('All');
  const [sortBy,       setSortBy]       = useState('Newest');
  const [searchQuery,  setSearchQuery]  = useState('');

  const [source,      setSource]      = useState('');
  const [amount,      setAmount]      = useState('');
  const [creditScore, setCreditScore] = useState('');
  const [type,        setType]        = useState('Research');

  const [viewingGrant,     setViewingGrant]     = useState(null);
  const [viewingApplication, setViewingApplication] = useState(null); // pre-approval application viewer
  const [viewingImpact,    setViewingImpact]    = useState(null);
  const [historyApplicant, setHistoryApplicant] = useState(null);
  const [enlargedImage,    setEnlargedImage]    = useState(null);
  const [rejectTarget,     setRejectTarget]     = useState(null);
  const [rejectNote,       setRejectNote]       = useState('');
  const [showLogs,         setShowLogs]         = useState(false);
  const [showExportPanel,  setShowExportPanel]  = useState(false);
  const [logs,             setLogs]             = useState([]);
  const [exportFrom,       setExportFrom]       = useState('');
  const [exportTo,         setExportTo]         = useState('');

  const [showOtpModal,   setShowOtpModal]   = useState(false);
  const [otpTargetGrant, setOtpTargetGrant] = useState(null);
  const [otpInput,       setOtpInput]       = useState('');
  const [otpError,       setOtpError]       = useState('');
  const [isSendingOtp,   setIsSendingOtp]   = useState(false);
  const [otpTimeLeft,    setOtpTimeLeft]    = useState(300); 

  const [selectedIds,     setSelectedIds]     = useState(new Set());
  const [bulkRejectNote,  setBulkRejectNote]  = useState('');
  const [showBulkReject,  setShowBulkReject]  = useState(false);

  const [xrayMode, setXrayMode] = useState(false);
  const [verifyingVendor, setVerifyingVendor] = useState(null);
  const [vendorStatus, setVendorStatus] = useState({});
  const [revealedGrantIds, setRevealedGrantIds] = useState(new Set());
  
  const [privateNoteText, setPrivateNoteText] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    let interval = null;
    if (showOtpModal && otpTimeLeft > 0) interval = setInterval(() => setOtpTimeLeft(prev => prev - 1), 1000);
    else if (otpTimeLeft <= 0) clearInterval(interval);
    return () => clearInterval(interval);
  }, [showOtpModal, otpTimeLeft]);

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
      { loading: 'Approving...', success: () => { fetchGrants(); clearSelection(); triggerConfetti(); return `Approved ${pendingSelected.length} grants!`; }, error: 'Failed to approve.' }
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
      startY: 36, head: [['ID','Applicant','Type','Amount','Disbursed','Status','Risk']],
      body: selected.map(g => [g.id, g.source, g.type, `₹${g.amount.toLocaleString()}`, `₹${(g.disbursedAmount||0).toLocaleString()}`, g.status, getRisk(g.creditScore).label]),
      theme: 'grid', headStyles: { fillColor: [30,58,138] },
    });
    doc.save(`Selected_Grants_${Date.now()}.pdf`);
  };

  const selCount     = selectedIds.size;
  const selPending   = [...selectedIds].filter(id => grantsList.find(g => g.id === id)?.status === 'Pending').length;
  const selRejectable= [...selectedIds].filter(id => ACTION_STATUSES.includes(grantsList.find(g => g.id === id)?.status)).length;
  const fetchLogs = () => axios.get(`${API}/logs`).then(r => setLogs(r.data)).catch(() => {});

  const fullyDisbursedGrants = grantsList.filter(g => g.status === 'Fully Disbursed' || g.status === 'Evaluated');
  const totalImpact   = grantsList.reduce((s, g) => s + (g.disbursedAmount || 0), 0);
  const pendingCount  = grantsList.filter(g => g.status === 'Pending' || g.status === 'Awaiting Review').length;
  const actionQueue   = grantsList.filter(g => ACTION_STATUSES.includes(g.status)).map(g => ({ ...g, waitDays: daysSince(g.date) })).sort((a, b) => b.waitDays - a.waitDays);

  const processedGrants = useMemo(() => {
    let list = [...grantsList];
    if (filterStatus !== 'All') list = list.filter(g => g.status === filterStatus);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(g => g.source?.toLowerCase().includes(q) || g.type?.toLowerCase().includes(q));
    }
    switch (sortBy) {
      case 'Amount':  return list.sort((a, b) => b.amount - a.amount);
      case 'Risk':    return list.sort((a, b) => parseInt(a.creditScore||999) - parseInt(b.creditScore||999));
      case 'Waiting': return list.sort((a, b) => daysSince(b.date) - daysSince(a.date));
      default:        return list.reverse();
    }
  }, [grantsList, filterStatus, searchQuery, sortBy]);

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
    axios.post(`${API}/update-status`, { id, status: newStatus, actionBy: currentUser, note, otp: otpCode, adminEmail })
      .then(() => { 
        fetchGrants(); setViewingGrant(null); setRejectTarget(null); setRejectNote(''); setShowOtpModal(false); setOtpInput(''); setOtpError(''); setXrayMode(false);
        toast.success(`Grant status updated to ${newStatus}`);
        if (newStatus.includes('Approved') || newStatus.includes('Disbursed') || newStatus.includes('Review')) triggerConfetti(); 
      })
      .catch(err => {
        if (newStatus === 'Fully Disbursed') setOtpError(err.response?.data?.message || 'Invalid OTP');
        else toast.error(err.response?.data?.message || 'Error updating status');
      });
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
    setIsSendingOtp(true);
    const adminEmail = localStorage.getItem('currentUserEmail') || 'shauryacocid@gmail.com';
    const promise = axios.post(`${API}/generate-otp`, { adminEmail })
      .then(() => { setOtpTargetGrant(grant); setShowOtpModal(true); setOtpError(''); setOtpInput(''); setViewingGrant(null); setOtpTimeLeft(300); })
      .finally(() => setIsSendingOtp(false));
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
    doc.setFillColor(7,9,15); doc.rect(0,0,210,297,'F');
    doc.setTextColor(238,242,247); doc.setFontSize(20); doc.setFont(undefined,'bold');
    doc.text('Executive Audit Report', 14, 22);
    doc.setFontSize(10); doc.setFont(undefined,'normal'); doc.setTextColor(138,155,181);
    doc.text(`Generated by: ${currentUser} · ${new Date().toLocaleDateString()}`, 14, 30);
    if (exportFrom||exportTo) doc.text(`Period: ${exportFrom||'Start'} → ${exportTo||'Today'}`, 14, 37);
    const totalAmt  = filtered.reduce((s,g)=>s+g.amount, 0);
    const totalDisb = filtered.reduce((s,g)=>s+(g.disbursedAmount||0), 0);
    let y = exportFrom||exportTo ? 50 : 44;
    doc.setFontSize(11); doc.setFont(undefined,'bold');
    doc.setTextColor(79,156,249); doc.text(`Total Requested: ₹${totalAmt.toLocaleString()}`, 14, y); y+=8;
    doc.setTextColor(52,211,153); doc.text(`Total Disbursed: ₹${totalDisb.toLocaleString()}`, 14, y); y+=8;
    doc.setTextColor(251,191,36); doc.text(`Grants in report: ${filtered.length}`, 14, y); y+=12;
    const sections = [ { label: 'Pending Action', statuses: ['Pending','Awaiting Review'] }, { label: 'Active/Disbursed', statuses: ['Phase 1 Approved','Fully Disbursed'] }, { label: 'Evaluated', statuses: ['Evaluated'] }, { label: 'Rejected / Blocked', statuses: ['Rejected', 'Blocked'] } ];
    sections.forEach(({ label, statuses }) => {
      const rows = filtered.filter(g => statuses.includes(g.status));
      if (!rows.length) return;
      if (y > 240) { doc.addPage(); doc.setFillColor(7,9,15); doc.rect(0,0,210,297,'F'); y=20; }
      doc.setTextColor(238,242,247); doc.setFontSize(12); doc.setFont(undefined,'bold');
      doc.text(label, 14, y); y+=5;
      autoTable(doc, {
        startY: y, head: [['ID','Applicant','Type','Amount','Disbursed','Status','Risk','Hash']],
        body: rows.map(g=>[g.id,g.source,g.type,`₹${g.amount.toLocaleString()}`,`₹${(g.disbursedAmount||0).toLocaleString()}`,g.status,getRisk(g.creditScore).label,g.currentHash?`…${g.currentHash.slice(-6)}`:'N/A']),
        theme:'grid', headStyles:{fillColor:[30,58,138],textColor:[238,242,247],fontSize:8}, bodyStyles:{textColor:[203,213,225],fontSize:7.5}, alternateRowStyles:{fillColor:[15,23,42]}, styles:{fillColor:[9,9,11]}, margin:{left:14,right:14},
      });
      y = doc.lastAutoTable.finalY + 10;
    });
    doc.save(`Audit_Report_${new Date().toISOString().slice(0,10)}.pdf`);
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
  grantsList.forEach(g => { if(g.disbursedAmount>0){ const t=g.type||'General'; catTotals[t]=(catTotals[t]||0)+g.disbursedAmount; }});

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
      
      <div className="app-container" style={{ position: 'relative', zIndex: 1 }}>

        <div className="header">
          <div>
            <h1 className="gradient-text" style={{ fontSize: '32px' }}><CyberText text="Admin Console" /></h1>
            <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Welcome, <strong style={{ color: 'var(--text-primary)' }}>{currentUser}</strong> · Grant Administrator</span>
          </div>
          <div className="header-actions">
            <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">{isDarkMode ? '☀️' : '🌙'}</button>
            <MagneticButton className="neon-btn neon-green" style={{ width:'auto', display:'flex', alignItems:'center', gap:'8px' }} onClick={() => setShowExportPanel(true)}><Download size={16} /> Export All</MagneticButton>
            <MagneticButton className="neon-btn neon-blue"  style={{ width:'auto', display:'flex', alignItems:'center', gap:'8px' }} onClick={() => { setShowLogs(true); fetchLogs(); }}><ScrollText size={16} /> Logs</MagneticButton>
            <button className="logout-btn" onClick={handleLogout}>Logout</button>
          </div>
        </div>

        <div className="tab-bar" style={{ position: 'relative' }}>
          {/* Animated pill indicator */}
          {['dashboard','queue'].map((id) => (
            activeTab === id && (
              <motion.div
                key="tab-indicator"
                layoutId="tab-indicator"
                style={{
                  position: 'absolute',
                  inset: '5px',
                  width: id === 'dashboard' ? '140px' : '120px',
                  left: id === 'dashboard' ? '5px' : '150px',
                  background: 'var(--bg-surface)',
                  borderRadius: '8px',
                  border: '1px solid var(--border-subtle)',
                  boxShadow: 'var(--shadow-btn)',
                  zIndex: 0,
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )
          ))}
          <button className={`tab-btn ${activeTab==='dashboard'?'active':''}`}
            onClick={() => { setActiveTab('dashboard'); }}
            style={{ display:'flex', alignItems:'center', gap:'6px', position:'relative', zIndex:1 }}>
            <LayoutDashboard size={16} /> Dashboard
          </button>
          <button className={`tab-btn ${activeTab==='queue'?'active':''}`}
            onClick={() => { setActiveTab('queue'); }}
            style={{ display:'flex', alignItems:'center', gap:'6px', position:'relative', zIndex:1 }}>
            <Zap size={16} /> Queue {actionQueue.length>0 && `(${actionQueue.length})`}
          </button>
        </div>

        <AnimatePresence mode="wait" custom={activeTab === 'dashboard' ? -1 : 1}>
        {activeTab === 'dashboard' && (<motion.div key="dashboard" custom={-1} variants={{ initial: c => ({ opacity:0, x: c*40, filter:'blur(4px)' }), animate: { opacity:1, x:0, filter:'blur(0px)' }, exit: c => ({ opacity:0, x: c*(-40), filter:'blur(4px)' }) }} initial="initial" animate="animate" exit="exit" transition={{ duration:0.28, ease:[0.22,1,0.36,1] }}><>
          <div className="summary-row">
            {[
              { label:'Total Disbursed', value: totalImpact, prefix: '₹', color:'var(--accent-blue)', sub:`across ${grantsList.length} grants` },
              { label:'Awaiting Action', value: pendingCount, color:'var(--accent-yellow)', sub:'click to filter', onClick:()=>setFilterStatus('Pending') },
              { label:'Projects Complete', value: fullyDisbursedGrants.length, color:'var(--accent-green)', sub:'fully evaluated', onClick:()=>setFilterStatus('Evaluated') },
            ].map((s,i) => (
              <TiltCard key={i} className="glass-card stat-card" onClick={s.onClick} style={{ borderBottom:`2px solid ${s.color}44`, '--card-accent': s.color }}>
                <div className="stat-label">{s.label}</div>
                <div className="stat-value" style={{ color:s.color, textShadow:`0 0 30px ${s.color}55` }}>{s.prefix}<CountUp end={s.value} duration={2.5} separator="," /></div>
                {s.sub && <div className="stat-sub">{s.sub}</div>}
              </TiltCard>
            ))}
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
            
            <motion.div className="glass-card" style={{ display:'flex', flexDirection:'column' }} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, type: 'spring', stiffness: 200, damping: 20 }}>
              <div className="section-title">Manual Override</div>
              <label className="input-label">Applicant Alias</label>
              <input className="dark-input" value={source} onChange={e=>setSource(e.target.value)} />
              <label className="input-label">Credit Score</label>
              <input className="dark-input" type="number" value={creditScore} onChange={e=>setCreditScore(e.target.value)} />
              <label className="input-label">Category</label>
              <select className="dark-input" value={type} onChange={e=>setType(e.target.value)}>
                {STANDARD_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                <option value="Other">Other</option>
              </select>
              <label className="input-label">Amount (₹)</label>
              <input className="dark-input" style={{marginBottom:'10px'}} type="number" value={amount} onChange={e=>setAmount(e.target.value)} />
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="neon-btn neon-blue" style={{marginTop:'auto', width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:'8px'}} onClick={addGrant}><CheckCircle2 size={16} /> Inject Record</motion.button>
            </motion.div>
          </div>

          <motion.div className="glass-card" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, type: 'spring', stiffness: 150, damping: 20 }} style={{ overflowX: 'hidden' }}>
            <div style={{ marginBottom:'18px', borderBottom:`1px solid var(--border-subtle)`, paddingBottom:'18px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'12px' }}>
                <div className="section-title" style={{ margin:0 }}>Grant Registry<span style={{ fontSize:'14px', fontFamily:'DM Sans', fontWeight:'600', color:'var(--text-muted)', marginLeft:'10px' }}>({processedGrants.length})</span></div>
                <div style={{ display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap' }}>
                  <div style={{ position:'relative' }}>
                    <Search size={14} color="var(--text-muted)" style={{ position:'absolute', left:'10px', top:'10px' }} />
                    <input className="dark-input" placeholder="Search..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} style={{ marginBottom:0, padding:'8px 13px 8px 30px', width:'190px', fontSize:'13px' }} />
                  </div>
                  <select className="dark-input" value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{ marginBottom:0, padding:'8px 12px', width:'auto' }}>
                    <option value="Newest">Newest</option><option value="Amount">Amount ↓</option><option value="Risk">Highest Risk</option><option value="Waiting">Waiting Longest</option>
                  </select>
                </div>
              </div>
              <div className="filter-pills">
                {['All',...ALL_STATUSES].map(s => {
                  const c = STATUS_COLORS[s] || '#94a3b8';
                  const active = filterStatus === s;
                  return (
                    <button key={s} className={`filter-pill ${active?'active-pill':''}`} onClick={()=>setFilterStatus(s)} style={active ? { background:`${c}18`, border:`1px solid ${c}55`, color:c } : {}}>
                      {s} <span style={{opacity:0.6}}>({statusCounts[s]??0})</span>
                    </button>
                  );
                })}
              </div>
              {processedGrants.some(g => ACTION_STATUSES.includes(g.status)) && (
                <div style={{ display:'flex', alignItems:'center', gap:'10px', marginTop:'12px', padding:'8px 12px', background:'var(--bg-input)', borderRadius:'8px', border:'1px solid var(--border-subtle)' }}>
                  <input type="checkbox" className="bulk-check" checked={processedGrants.filter(g=>ACTION_STATUSES.includes(g.status)).every(g=>selectedIds.has(g.id))} onChange={toggleSelectAll} />
                  <span style={{ fontSize:'12px', color:'var(--text-secondary)', fontWeight:'600' }}>Select all actionable grants</span>
                  {selCount > 0 && <button onClick={clearSelection} style={{ background:'none', border:'none', color:'var(--text-muted)', fontSize:'12px', cursor:'pointer', marginLeft:'auto' }}>Clear ({selCount})</button>}
                </div>
              )}
            </div>

            {/* ✨ HYBRID FIX 2.0: Animate 1st item IMMEDIATELY, reveal 2nd item and beyond on scroll! */}
            <ul className="history-list dark-scroll" ref={listRef} style={{ overflowX: 'hidden' }}>
              {processedGrants.length === 0 ? (
                <motion.li
                  initial={{opacity:0,scale:0.96}} animate={{opacity:1,scale:1}}
                  transition={{type:'spring',stiffness:300,damping:22}}
                  style={{padding:'56px 20px',textAlign:'center',listStyle:'none'}}
                >
                  <svg width="64" height="64" viewBox="0 0 64 64" fill="none" style={{margin:'0 auto 16px',display:'block',opacity:0.3}}>
                    <rect x="8" y="16" width="48" height="36" rx="4" stroke="var(--text-muted)" strokeWidth="2"/>
                    <path d="M8 24h48" stroke="var(--text-muted)" strokeWidth="2"/>
                    <path d="M20 32h10M20 38h16" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"/>
                    <circle cx="48" cy="44" r="10" fill="var(--bg-base)" stroke="var(--text-muted)" strokeWidth="2"/>
                    <path d="M44 44h8M48 40v8" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  <div style={{color:'var(--text-primary)',fontFamily:'DM Serif Display,serif',fontSize:'18px',fontWeight:'400',marginBottom:'6px'}}>
                    {filterStatus==='All'?'No grants yet':`No ${filterStatus} grants`}
                  </div>
                  <div style={{color:'var(--text-muted)',fontSize:'13px',maxWidth:'260px',margin:'0 auto'}}>
                    {filterStatus==='All'?'Grants will appear once applicants submit requests.':`No grants currently have status "${filterStatus}".`}
                  </div>
                  {filterStatus!=='All'&&(
                    <button onClick={()=>setFilterStatus('All')} style={{marginTop:'14px',background:'none',border:'1px solid var(--border-subtle)',color:'var(--text-secondary)',borderRadius:'8px',padding:'7px 18px',cursor:'pointer',fontSize:'13px',fontFamily:'DM Sans',fontWeight:'600'}}>
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

                return (
                  <motion.li 
                    key={g.id} 
                    initial={isRevealed ? { opacity: 1, y: 0 } : { opacity: 0, y: 25 }}
                    animate={isRevealed ? { opacity: 1, y: 0 } : undefined}
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
                    style={{ flexDirection:'column', alignItems:'stretch', gap:'10px', overflow:'hidden',
                      background: isSelected ? (isDarkMode ? 'rgba(79,156,249,0.06)' : 'rgba(79,156,249,0.04)') : '',
                      borderLeft: isSelected
                        ? '3px solid var(--accent-blue)'
                        : `3px solid ${{
                            'Pending':          'rgba(251,191,36,0.3)',
                            'Phase 1 Approved': 'rgba(52,211,153,0.3)',
                            'Awaiting Review':  'rgba(249,115,22,0.3)',
                            'Fully Disbursed':  'rgba(167,139,250,0.3)',
                            'Evaluated':        'rgba(34,211,238,0.3)',
                            'Rejected':         'rgba(248,113,113,0.3)',
                            'Blocked':          'rgba(185,28,28,0.4)',
                          }[g.status] || 'rgba(100,116,139,0.2)'}`,
                      transition: 'background 0.2s, border-left-color 0.2s' }}
                  >
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'10px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'8px', flex:1, flexWrap:'wrap', minWidth:0, overflow:'hidden' }}>
                        {isActionable && <input type="checkbox" className="bulk-check" checked={isSelected} onChange={()=>toggleSelect(g.id)} onClick={e=>e.stopPropagation()} />}
                        <span className={`category-tag ${STANDARD_TYPES.includes(g.type) ? `cat-${g.type}` : 'cat-Other'}`}>{g.type}</span>
                        <strong style={{ color:'var(--text-primary)', fontSize:'14px', cursor:'pointer', textDecoration:'underline dotted', textUnderlineOffset:'3px', textDecorationColor:'var(--text-muted)', display:'flex', alignItems:'center', gap:'4px' }} onClick={()=>setHistoryApplicant(g.source)}><User size={14}/> {g.source}</strong>
                        
                        {g.strikes > 0 && <span style={{ display:'flex', alignItems:'center', gap:'4px', background: g.strikes >= 3 ? '#7f1d1d' : '#9a3412', color: 'white', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}><AlertTriangle size={10}/> {g.strikes}/3 STRIKES</span>}
                        
                        <span className="risk-badge" style={{ background:risk.bg, color:risk.color, border:`1px solid ${risk.color}30` }}><span className="risk-dot" style={{ background:risk.dot, boxShadow:`0 0 6px ${risk.dot}` }}></span>{risk.label}</span>
                        {wait > 3 && isActionable && <span style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'10px', color:'#f87171', fontWeight:'700', background:'rgba(248,113,113,0.1)', padding:'3px 8px', borderRadius:'10px', border:'1px solid rgba(248,113,113,0.2)' }}><Clock size={10}/> {wait}d</span>}
                        <span className={`status-badge status-${g.status==='Fully Disbursed'||g.status==='Evaluated'?'Approved':g.status==='Rejected'||g.status==='Blocked'?'Rejected':'Pending'}`}>{g.status==='Evaluated'?'Closed':g.status}</span>
                      </div>
                      <div style={{ textAlign:'right', flexShrink:0 }}>
                        <div style={{ color:'var(--accent-blue)', fontWeight:'800', fontSize:'16px' }}>₹{(g.disbursedAmount||0).toLocaleString()}</div>
                        <div style={{ fontSize:'11px', color:'var(--text-muted)' }}>of ₹{g.amount.toLocaleString()}</div>
                      </div>
                    </div>
                    {g.note && <div style={{ display:'flex', alignItems:'center', gap:'6px', background:'rgba(248,113,113,0.07)', border:'1px solid rgba(248,113,113,0.18)', borderRadius:'8px', padding:'7px 12px', fontSize:'12px', color:'var(--accent-red)' }}><FileSignature size={14}/> "{g.note}"</div>}
                    <div className="disbursal-track"><div className={`disbursal-fill${g.amount>0 && (g.disbursedAmount||0)>=g.amount ? ' full' : ''}`} style={{ width:`${g.amount>0?((g.disbursedAmount||0)/g.amount)*100:0}%` }}></div></div>
                    
                    <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end', flexWrap:'wrap' }}>
                      {/* View Application — always visible on every grant */}
                      <SpringTooltip text="View full application details">
                        <motion.button
                          whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                          className="action-btn"
                          style={{ display:'flex', alignItems:'center', gap:'6px', background:'rgba(79,156,249,0.08)', color:'var(--accent-blue)', border:'1px solid rgba(79,156,249,0.2)' }}
                          onClick={() => setViewingApplication(g)}
                        >
                          <FileText size={14} /> View Application
                        </motion.button>
                      </SpringTooltip>

                      {g.status==='Pending' && (<>
                        <SpringTooltip text="Approve initial 35% funding">
                          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="action-btn btn-approve" style={{ display:'flex', alignItems:'center', gap:'6px' }} onClick={()=>updateStatus(g.id,'Phase 1 Approved')}><CheckCircle size={14} /> Approve Phase 1</motion.button>
                        </SpringTooltip>
                        <SpringTooltip text="Decline and close application">
                          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="action-btn btn-reject" style={{ display:'flex', alignItems:'center', gap:'6px' }} onClick={()=>{setRejectTarget(g);setRejectNote('');}}><XCircle size={14} /> Reject</motion.button>
                        </SpringTooltip>
                      </>)}
                      
                      {(g.status==='Awaiting Review' || g.status==='Blocked') && (
                        <SpringTooltip text={g.status==='Blocked' ? "Open case file and internal notes" : "Analyze receipts & metadata"}>
                          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="neon-btn neon-blue" style={{width:'auto',padding:'8px 18px',fontSize:'12px',margin:0, display:'flex', alignItems:'center', gap:'6px'}} onClick={()=>setViewingGrant(g)}>
                            {g.status==='Blocked' ? <><ShieldAlert size={14} /> Investigate Case</> : <><FileSearch size={14} /> Review Proof</>}
                          </motion.button>
                        </SpringTooltip>
                      )}

                      {g.status==='Phase 1 Approved' && <span style={{fontSize:'12px',color:'var(--accent-yellow)',fontStyle:'italic', display:'flex', alignItems:'center', gap:'4px'}}><Clock size={12}/> Awaiting proof upload…</span>}
                      {g.status==='Evaluated' && <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="action-btn" style={{background:'rgba(167,139,250,0.1)',color:'var(--accent-purple)',border:'1px solid rgba(167,139,250,0.25)', display:'flex', alignItems:'center', gap:'6px'}} onClick={()=>setViewingImpact(g)}><Rocket size={14}/> View Impact</motion.button>}
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          </motion.div>
        </></motion.div>)}

        {activeTab === 'queue' && (<motion.div key="queue" custom={1} variants={{ initial: c => ({ opacity:0, x: c*40, filter:'blur(4px)' }), animate: { opacity:1, x:0, filter:'blur(0px)' }, exit: c => ({ opacity:0, x: c*(-40), filter:'blur(4px)' }) }} initial="initial" animate="animate" exit="exit" transition={{ duration:0.28, ease:[0.22,1,0.36,1] }}>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
            <div style={{ display:'flex', alignItems:'center', gap:'14px', marginBottom:'20px' }}>
              <div className="section-title" style={{ margin:0 }}>Action Queue</div>
              <span style={{ background:'rgba(248,113,113,0.15)', color:'var(--accent-red)', border:'1px solid rgba(248,113,113,0.25)', fontSize:'12px', fontWeight:'700', padding:'4px 12px', borderRadius:'20px' }}>{actionQueue.length} waiting</span>
            </div>

            {actionQueue.length === 0 ? (
              <motion.div className="glass-card" style={{textAlign:'center',padding:'64px 40px'}} initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} transition={{type:'spring',stiffness:300,damping:25}}>
                {/* Animated checkmark illustration */}
                <motion.div
                  initial={{scale:0,opacity:0}} animate={{scale:1,opacity:1}}
                  transition={{type:'spring',stiffness:260,damping:20,delay:0.1}}
                  style={{margin:'0 auto 20px',width:'80px',height:'80px',borderRadius:'50%',background:'rgba(52,211,153,0.1)',border:'2px solid rgba(52,211,153,0.25)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 0 30px rgba(52,211,153,0.15)'}}
                >
                  <motion.div
                    initial={{pathLength:0}} animate={{pathLength:1}}
                    transition={{duration:0.6,delay:0.3,ease:'easeOut'}}
                  >
                    <CheckCircle size={40} color="var(--accent-green)" />
                  </motion.div>
                </motion.div>
                <div style={{color:'var(--text-heading)',fontFamily:'DM Serif Display,serif',fontSize:'24px',fontWeight:'400',marginBottom:'8px'}}>All caught up!</div>
                <div style={{color:'var(--text-muted)',fontSize:'14px',maxWidth:'280px',margin:'0 auto',lineHeight:'1.6'}}>
                  No grants are waiting for your review. Check back after the next poll.
                </div>
                <motion.div
                  animate={{opacity:[0.4,1,0.4]}}
                  transition={{duration:2.5,repeat:Infinity,ease:'easeInOut'}}
                  style={{marginTop:'20px',fontSize:'12px',color:'var(--text-muted)',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}
                >
                  <div style={{width:'6px',height:'6px',borderRadius:'50%',background:'var(--accent-green)',boxShadow:'0 0 8px var(--accent-green)'}}/>
                  Live sync active
                </motion.div>
              </motion.div>
            ) : actionQueue.map((g,i) => {
              const risk = getRisk(g.creditScore);
              const urgent = g.waitDays > 5;
              const hasFraudAlert = g.proofs?.some(p => p.forensics?.some(f => f.status === 'FLAGGED'));

              return (
                <motion.div key={g.id}
                  className={`glass-card ${hasFraudAlert ? 'queue-card-forensic' : urgent ? 'queue-card-urgent' : g.waitDays > 3 ? 'queue-card-warning' : ''}`}
                  style={{ borderLeft:`4px solid ${hasFraudAlert ? '#ef4444' : urgent ? '#f87171' : g.status === 'Awaiting Review' ? '#f97316' : g.status === 'Blocked' ? '#b91c1c' : '#fbbf24'}`, marginBottom:'14px', position:'relative', overflow:'hidden' }}
                  initial={{ opacity: 0, x: -50 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.12, type: 'spring', stiffness: 200, damping: 20 }}>
                  <div className={`queue-wait-watermark${urgent ? ' urgent' : ''}`}>{g.waitDays}d</div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:'14px' }}>
                    <div>
                      <div style={{ display:'flex', alignItems:'center', gap:'9px', marginBottom:'8px', flexWrap:'wrap' }}>
                        <span className={`category-tag ${STANDARD_TYPES.includes(g.type) ? `cat-${g.type}` : 'cat-Other'}`}>{g.type}</span>
                        <strong style={{ color:'var(--text-primary)', fontSize:'15px', cursor:'pointer', textDecoration:'underline dotted', textUnderlineOffset:'3px', textDecorationColor:'var(--text-muted)', display:'flex', alignItems:'center', gap:'4px' }} onClick={()=>setHistoryApplicant(g.source)}><User size={14}/> {g.source}</strong>
                        
                        {g.strikes > 0 && <span style={{ display:'flex', alignItems:'center', gap:'4px', background: g.strikes >= 3 ? '#7f1d1d' : '#9a3412', color: 'white', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}><AlertTriangle size={10}/> {g.strikes}/3 STRIKES</span>}
                        
                        <span className="risk-badge" style={{ background:risk.bg, color:risk.color, border:`1px solid ${risk.color}30` }}><span className="risk-dot" style={{ background:risk.dot }}></span>{risk.label}</span>
                      </div>
                      <div style={{ fontSize:'13px', color:'var(--text-secondary)' }}>₹{g.amount.toLocaleString()} · Applied {g.date}</div>
                      <div style={{ marginTop:'8px', display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap' }}>
                        
                        {hasFraudAlert ? (
                          <span className="forensic-alert" style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'11px', fontWeight:'800', padding:'4px 12px', borderRadius:'10px' }}><ShieldAlert size={12} /> FORENSIC FLAG</span>
                        ) : (
                          <span style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'11px', fontWeight:'800', padding:'3px 10px', borderRadius:'10px', background: urgent?'rgba(248,113,113,0.15)':'rgba(251,191,36,0.12)', color: urgent?'#f87171':'#fcd34d', border:`1px solid ${urgent?'rgba(248,113,113,0.3)':'rgba(251,191,36,0.25)'}` }}><Clock size={12}/> {g.waitDays}d waiting</span>
                        )}
                        <span style={{ fontSize:'12px', color:'var(--text-muted)' }}>Status: <span style={{ color:'var(--text-primary)', fontWeight:'600' }}>{g.status}</span></span>
                      </div>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:'8px', alignItems:'flex-end' }}>
                      <SpringTooltip text="View full application details">
                        <motion.button
                          whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                          className="action-btn"
                          style={{ display:'flex', alignItems:'center', gap:'6px', background:'rgba(79,156,249,0.08)', color:'var(--accent-blue)', border:'1px solid rgba(79,156,249,0.2)' }}
                          onClick={() => setViewingApplication(g)}
                        >
                          <FileText size={14} /> View Application
                        </motion.button>
                      </SpringTooltip>
                      {g.status==='Pending' && (<>
                        <SpringTooltip text="Approve initial 35% funding">
                          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="action-btn btn-approve" style={{ display:'flex', alignItems:'center', gap:'6px' }} onClick={()=>updateStatus(g.id,'Phase 1 Approved')}><CheckCircle size={14} /> Approve Phase 1</motion.button>
                        </SpringTooltip>
                        <SpringTooltip text="Decline and close application">
                          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="action-btn btn-reject" style={{ display:'flex', alignItems:'center', gap:'6px' }} onClick={()=>{setRejectTarget(g);setRejectNote('');}}><XCircle size={14} /> Reject</motion.button>
                        </SpringTooltip>
                      </>)}
                      
                      {(g.status==='Awaiting Review' || g.status==='Blocked') && (
                        <SpringTooltip text={g.status==='Blocked' ? "Open case file and internal notes" : "Analyze receipts & metadata"}>
                          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="neon-btn neon-blue" style={{width:'auto',padding:'8px 18px',fontSize:'12px',margin:0, display:'flex', alignItems:'center', gap:'6px'}} onClick={()=>setViewingGrant(g)}>
                            {g.status==='Blocked' ? <><ShieldAlert size={14} /> Investigate Case</> : <><FileSearch size={14} /> Review Proof</>}
                          </motion.button>
                        </SpringTooltip>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </motion.div>)}
        </AnimatePresence>
      </div>

      <div className={`bulk-bar ${activeTab === 'dashboard' && selCount > 0 ? 'visible' : ''}`}>
        <span className="bulk-bar-count">{selCount}</span>
        <span className="bulk-bar-label">grant{selCount !== 1 ? 's' : ''} selected</span>
        <div className="bulk-divider"></div>
        {selPending > 0 && <button className="neon-btn neon-green" style={{ width: 'auto', padding: '9px 18px', fontSize: '12px', display:'flex', alignItems:'center', gap:'6px' }} onClick={bulkApprove}><CheckCircle size={14}/> Approve {selPending} Pending</button>}
        {selRejectable > 0 && <button className="neon-btn neon-red" style={{ width: 'auto', padding: '9px 18px', fontSize: '12px', display:'flex', alignItems:'center', gap:'6px' }} onClick={() => setShowBulkReject(true)}><XCircle size={14}/> Reject {selRejectable}</button>}
        <button className="neon-btn neon-blue" style={{ width: 'auto', padding: '9px 18px', fontSize: '12px', display:'flex', alignItems:'center', gap:'6px' }} onClick={bulkExportPDF}><Download size={14}/> Export Selected</button>
        <button onClick={clearSelection} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '20px', cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>×</button>
      </div>

      {showOtpModal && otpTargetGrant && (() => {
        const timerColor = otpTimeLeft > 120 ? '#3b82f6' : otpTimeLeft > 60 ? '#f59e0b' : '#ef4444';
        const timerPct   = otpTimeLeft / 300;
        const CIRC       = 2 * Math.PI * 44;
        return (
          <motion.div className="modal-overlay" style={{zIndex:1000}} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
            <motion.div
              initial={{scale:0.85,opacity:0,y:24}} animate={{scale:1,opacity:1,y:0}}
              transition={{type:'spring',stiffness:360,damping:26}}
              style={{position:'relative',padding:'2px',borderRadius:'22px',overflow:'hidden',maxWidth:'440px',width:'100%'}}
            >
              {/* Spinning border */}
              <svg style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',zIndex:0,pointerEvents:'none'}}>
                <defs>
                  <linearGradient id="otp-grad2" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={timerColor} />
                    <stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
                <rect x="0" y="0" width="100%" height="100%" rx="22" ry="22" fill="none" stroke="url(#otp-grad2)" strokeWidth="2" strokeLinecap="round" pathLength="100" strokeDasharray="30 70" className="svg-border-trace" />
              </svg>

              <div style={{position:'relative',zIndex:1,background:'var(--bg-surface)',borderRadius:'20px',padding:'32px',textAlign:'center'}}>
                {/* Large countdown ring */}
                <div style={{position:'relative',width:'100px',height:'100px',margin:'0 auto 20px'}}>
                  <svg width="100" height="100" viewBox="0 0 100 100" style={{transform:'rotate(-90deg)'}}>
                    {/* Track */}
                    <circle cx="50" cy="50" r="44" fill="none" stroke="var(--border-subtle)" strokeWidth="6"/>
                    {/* Countdown arc */}
                    <motion.circle
                      cx="50" cy="50" r="44" fill="none"
                      stroke={timerColor} strokeWidth="6" strokeLinecap="round"
                      strokeDasharray={CIRC}
                      animate={{strokeDashoffset: CIRC*(1-timerPct), stroke: timerColor}}
                      transition={{strokeDashoffset:{duration:1,ease:'linear'}, stroke:{duration:0.5}}}
                      style={{filter:`drop-shadow(0 0 8px ${timerColor}88)`}}
                    />
                  </svg>
                  <motion.div
                    animate={otpTimeLeft<=30&&otpTimeLeft>0?{x:[-2,2,-2,2,0]}:{}}
                    transition={{duration:0.4,repeat:otpTimeLeft<=30?Infinity:0,repeatDelay:1.5}}
                    style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}
                  >
                    <span style={{fontFamily:'DM Serif Display,serif',fontSize:'24px',color:timerColor,lineHeight:1,textShadow:`0 0 16px ${timerColor}66`}}>
                      {Math.floor(otpTimeLeft/60)}:{(otpTimeLeft%60).toString().padStart(2,'0')}
                    </span>
                    <span style={{fontSize:'10px',color:'var(--text-muted)',marginTop:'2px',letterSpacing:'0.5px'}}>remaining</span>
                  </motion.div>
                </div>

                <h2 style={{color:'var(--text-primary)',margin:'0 0 8px',fontFamily:'DM Serif Display,serif',fontSize:'22px',fontWeight:'400'}}>Vault Release Authorization</h2>
                <p style={{color:'var(--text-secondary)',fontSize:'13px',marginBottom:'8px',lineHeight:'1.5'}}>
                  Authorizing release of <span style={{color:'var(--accent-green)',fontWeight:'800'}}>₹{(otpTargetGrant.amount-(otpTargetGrant.disbursedAmount||0)).toLocaleString()}</span> to <strong>{otpTargetGrant.source}</strong>
                </p>
                <p style={{color:'var(--text-muted)',fontSize:'12px',marginBottom:'24px'}}>Enter the 6-digit OTP sent to your verified email</p>

                {/* OTP input */}
                <motion.input
                  type="text" maxLength="6" className="dark-input"
                  placeholder="• • • • • •"
                  value={otpInput}
                  onChange={e=>setOtpInput(e.target.value.replace(/[^0-9]/g,''))}
                  disabled={otpTimeLeft===0}
                  animate={otpError?{x:[-6,6,-6,6,0]}:{}}
                  transition={{duration:0.3}}
                  style={{fontSize:'28px',letterSpacing:'12px',textAlign:'center',fontWeight:'700',padding:'16px',opacity:otpTimeLeft===0?0.4:1,marginBottom:'6px',borderColor:otpError?'var(--accent-red)':otpInput.length===6?'var(--accent-green)':undefined}}
                />
                {/* OTP digit indicators */}
                <div style={{display:'flex',justifyContent:'center',gap:'8px',marginBottom:'20px'}}>
                  {[0,1,2,3,4,5].map(i=>(
                    <div key={i} style={{width:'8px',height:'8px',borderRadius:'50%',background:i<otpInput.length?timerColor:'var(--border-subtle)',transition:'background 0.15s',boxShadow:i<otpInput.length?`0 0 6px ${timerColor}`:'none'}}/>
                  ))}
                </div>

                {otpTimeLeft===0&&<div style={{color:'#ef4444',fontSize:'13px',marginBottom:'12px',fontWeight:'600'}}>⏳ OTP Expired — please cancel and request a new one</div>}
                {otpError&&otpTimeLeft>0&&<div style={{color:'#ef4444',fontSize:'13px',marginBottom:'12px',fontWeight:'600'}}>❌ {otpError}</div>}

                <div style={{display:'flex',gap:'12px'}}>
                  <motion.button
                    whileHover={{scale:otpInput.length===6&&otpTimeLeft>0?1.02:1}}
                    whileTap={{scale:0.98}}
                    className="neon-btn neon-green"
                    style={{flex:1,opacity:otpInput.length===6&&otpTimeLeft>0?1:0.4,pointerEvents:otpInput.length===6&&otpTimeLeft>0?'auto':'none',display:'flex',alignItems:'center',justifyContent:'center',gap:'8px'}}
                    onClick={confirmOtpRelease}
                  >
                    <ShieldCheck size={16}/> Authenticate & Release
                  </motion.button>
                  <button onClick={()=>{setShowOtpModal(false);setOtpTargetGrant(null);setOtpInput('');setOtpError('');}} style={{flex:1,background:'transparent',border:'1px solid var(--border-subtle)',color:'var(--text-secondary)',borderRadius:'10px',cursor:'pointer',fontWeight:'600',fontFamily:'DM Sans'}}>Cancel</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        );
      })()}

      {showBulkReject && (
        <div className="modal-overlay">
          <div className="glass-modal-content" style={{maxWidth:'440px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px'}}>
              <h2 style={{color:'var(--text-primary)',margin:0,fontSize:'20px', display:'flex', alignItems:'center', gap:'8px'}}><XCircle /> Reject {selRejectable} Grant{selRejectable!==1?'s':''}</h2>
              <button onClick={()=>setShowBulkReject(false)} style={{background:'none',border:'none',fontSize:'26px',color:'var(--text-muted)',cursor:'pointer'}}>×</button>
            </div>
            <div style={{background:'rgba(248,113,113,0.07)',border:'1px solid rgba(248,113,113,0.18)',borderRadius:'10px',padding:'12px 14px',marginBottom:'18px',fontSize:'13px',color:'var(--text-secondary)'}}>This will reject all selected Pending and Awaiting Review grants. This action cannot be undone.</div>
            <label className="input-label">Reason (shown to all applicants)</label>
            <textarea className="dark-input" rows={3} placeholder="e.g. Insufficient documentation provided." value={bulkRejectNote} onChange={e=>setBulkRejectNote(e.target.value)} />
            <div style={{display:'flex',gap:'10px',marginTop:'4px'}}>
              <button className="neon-btn neon-red" style={{flex:1}} onClick={bulkReject}>Confirm Bulk Rejection</button>
              <button onClick={()=>setShowBulkReject(false)} style={{flex:1,background:'transparent',border:'1px solid var(--border-subtle)',color:'var(--text-secondary)',borderRadius:'10px',cursor:'pointer',fontWeight:'600',fontSize:'13px',fontFamily:'DM Sans'}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ APPLICATION VIEWER MODAL ══════════════════════════════════════════ */}
      <AnimatePresence>
        {viewingApplication && (() => {
          const g    = viewingApplication;
          const risk = getRisk(g.creditScore);
          const wait = daysSince(g.date);
          const disbPct = g.amount > 0 ? Math.round(((g.disbursedAmount||0)/g.amount)*100) : 0;
          const CIRC_R = 28;
          const CIRC   = 2 * Math.PI * CIRC_R;
          const scoreNorm = Math.min(100, Math.max(0, ((parseInt(g.creditScore)||300) - 300) / 600 * 100));
          const creditColor = parseInt(g.creditScore) >= 750 ? 'var(--accent-green)' : parseInt(g.creditScore) >= 600 ? 'var(--accent-yellow)' : 'var(--accent-red)';

          return (
            <motion.div
              className="modal-overlay"
              initial={{ opacity:0, backdropFilter:'blur(0px)' }}
              animate={{ opacity:1, backdropFilter:'blur(12px)' }}
              exit={{ opacity:0, backdropFilter:'blur(0px)' }}
              transition={{ duration:0.25 }}
            >
              <motion.div
                initial={{ scale:0.92, opacity:0, y:28 }}
                animate={{ scale:1, opacity:1, y:0 }}
                exit={{ scale:0.92, opacity:0, y:16 }}
                transition={{ type:'spring', stiffness:340, damping:28 }}
                style={{ maxWidth:'640px', width:'100%', borderRadius:'22px', overflow:'hidden', boxShadow:'0 32px 80px rgba(0,0,0,0.7)' }}
              >
                {/* Header band — colour matches status */}
                <div style={{
                  background: g.status==='Pending'
                    ? 'linear-gradient(135deg,rgba(30,58,138,0.9),rgba(37,99,235,0.75))'
                    : g.status==='Rejected'||g.status==='Blocked'
                      ? 'linear-gradient(135deg,rgba(127,29,29,0.9),rgba(185,28,28,0.75))'
                      : 'linear-gradient(135deg,rgba(4,120,87,0.85),rgba(16,185,129,0.65))',
                  padding:'20px 28px',
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'14px' }}>
                    <div style={{ width:'42px', height:'42px', borderRadius:'50%', background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <FileText size={20} color="white" />
                    </div>
                    <div>
                      <div style={{ color:'white', fontFamily:'DM Serif Display,serif', fontSize:'19px', fontWeight:'400' }}>
                        Grant Application
                      </div>
                      <div style={{ color:'rgba(255,255,255,0.65)', fontSize:'12px', marginTop:'2px' }}>
                        ID #{g.id} · Submitted {g.date}
                      </div>
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                    <span className={`status-badge status-${g.status==='Evaluated'||g.status==='Fully Disbursed'?'Approved':g.status==='Rejected'||g.status==='Blocked'?'Rejected':'Pending'}`} style={{ fontSize:'10px' }}>
                      {g.status}
                    </span>
                    <button
                      onClick={() => setViewingApplication(null)}
                      style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'white', width:'30px', height:'30px', borderRadius:'50%', cursor:'pointer', fontSize:'18px', display:'flex', alignItems:'center', justifyContent:'center' }}
                    >×</button>
                  </div>
                </div>

                {/* Body */}
                <div style={{ background:'var(--bg-surface)', padding:'26px 28px', overflowY:'auto', maxHeight:'70vh' }}>

                  {/* Top row — applicant + amount */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'22px' }}>
                    {/* Applicant card */}
                    <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:'14px', padding:'16px' }}>
                      <div style={{ fontSize:'10px', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.8px', fontWeight:'700', marginBottom:'8px' }}>Applicant</div>
                      <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                        <div style={{ width:'36px', height:'36px', borderRadius:'50%', background:'linear-gradient(135deg,var(--accent-blue),var(--accent-purple))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px', flexShrink:0 }}>
                          {g.source?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ color:'var(--text-primary)', fontWeight:'700', fontSize:'15px' }}>{g.source}</div>
                          <div
                            style={{ color:'var(--text-muted)', fontSize:'11px', cursor:'pointer', textDecoration:'underline dotted', textUnderlineOffset:'2px', marginTop:'2px' }}
                            onClick={() => { setViewingApplication(null); setHistoryApplicant(g.source); }}
                          >
                            View full history →
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Amount card */}
                    <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:'14px', padding:'16px' }}>
                      <div style={{ fontSize:'10px', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.8px', fontWeight:'700', marginBottom:'8px' }}>Requested Amount</div>
                      <div style={{ fontFamily:'DM Serif Display,serif', fontSize:'28px', color:'var(--accent-blue)', lineHeight:1, textShadow:'0 0 20px rgba(79,156,249,0.3)' }}>
                        ₹{g.amount.toLocaleString()}
                      </div>
                      {g.disbursedAmount > 0 && (
                        <div style={{ fontSize:'12px', color:'var(--accent-green)', marginTop:'6px', fontWeight:'600' }}>
                          ₹{(g.disbursedAmount||0).toLocaleString()} disbursed ({disbPct}%)
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Middle row — category + credit score */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'22px' }}>
                    {/* Category */}
                    <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:'14px', padding:'16px' }}>
                      <div style={{ fontSize:'10px', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.8px', fontWeight:'700', marginBottom:'10px' }}>Grant Category</div>
                      <span className={`category-tag ${STANDARD_TYPES.includes(g.type)?`cat-${g.type}`:'cat-Other'}`} style={{ fontSize:'13px', padding:'6px 14px' }}>
                        {g.type}
                      </span>
                    </div>

                    {/* Credit score with animated ring */}
                    <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:'14px', padding:'16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <div>
                        <div style={{ fontSize:'10px', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.8px', fontWeight:'700', marginBottom:'6px' }}>Credit Score</div>
                        <div style={{ fontFamily:'DM Serif Display,serif', fontSize:'26px', color:creditColor, lineHeight:1 }}>{g.creditScore || 'N/A'}</div>
                        <span className="risk-badge" style={{ background:risk.bg, color:risk.color, border:`1px solid ${risk.color}30`, fontSize:'11px', padding:'3px 10px', marginTop:'6px', display:'inline-flex' }}>
                          <span className="risk-dot" style={{ background:risk.dot, width:'6px', height:'6px' }}></span>{risk.label}
                        </span>
                      </div>
                      {/* Mini credit ring */}
                      <div style={{ position:'relative', width:'56px', height:'56px', flexShrink:0 }}>
                        <svg width="56" height="56" viewBox="0 0 56 56" style={{ transform:'rotate(-90deg)' }}>
                          <circle cx="28" cy="28" r={CIRC_R} fill="none" stroke="var(--border-subtle)" strokeWidth="5"/>
                          <motion.circle
                            cx="28" cy="28" r={CIRC_R} fill="none"
                            stroke={creditColor} strokeWidth="5" strokeLinecap="round"
                            strokeDasharray={CIRC}
                            initial={{ strokeDashoffset: CIRC }}
                            animate={{ strokeDashoffset: CIRC * (1 - scoreNorm/100) }}
                            transition={{ duration:1.2, ease:[0.22,1,0.36,1], delay:0.2 }}
                            style={{ filter:`drop-shadow(0 0 4px ${creditColor}88)` }}
                          />
                        </svg>
                        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'10px', fontWeight:'700', color:creditColor }}>
                          {Math.round(scoreNorm)}%
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Waiting indicator */}
                  {wait > 0 && (
                    <div style={{
                      display:'flex', alignItems:'center', gap:'12px',
                      background: wait > 5 ? 'rgba(248,113,113,0.07)' : 'rgba(251,191,36,0.07)',
                      border: `1px solid ${wait > 5 ? 'rgba(248,113,113,0.2)' : 'rgba(251,191,36,0.2)'}`,
                      borderRadius:'10px', padding:'12px 16px', marginBottom:'22px',
                    }}>
                      <Clock size={16} color={wait > 5 ? '#f87171' : '#fbbf24'} />
                      <div>
                        <div style={{ fontSize:'13px', fontWeight:'700', color: wait > 5 ? 'var(--accent-red)' : 'var(--accent-yellow)' }}>
                          {wait > 5 ? `Overdue — ${wait} days waiting` : `${wait} day${wait!==1?'s':''} since submission`}
                        </div>
                        <div style={{ fontSize:'11px', color:'var(--text-muted)', marginTop:'2px' }}>
                          Submitted {g.date}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Rejection note (if any) */}
                  {g.note && (
                    <div style={{ display:'flex', alignItems:'flex-start', gap:'10px', background:'rgba(248,113,113,0.07)', border:'1px solid rgba(248,113,113,0.2)', borderRadius:'10px', padding:'12px 16px', marginBottom:'22px' }}>
                      <FileSignature size={16} color="var(--accent-red)" style={{ flexShrink:0, marginTop:'1px' }} />
                      <div>
                        <div style={{ fontSize:'12px', fontWeight:'700', color:'var(--accent-red)', marginBottom:'3px' }}>Admin Note</div>
                        <div style={{ fontSize:'13px', color:'var(--text-secondary)', lineHeight:'1.5' }}>{g.note}</div>
                      </div>
                    </div>
                  )}

                  {/* Ledger hash */}
                  <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:'12px', padding:'14px 16px', marginBottom:'22px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px' }}>
                      <ShieldCheck size={14} color="var(--accent-green)" />
                      <div style={{ fontSize:'11px', fontWeight:'700', color:'var(--accent-green)', textTransform:'uppercase', letterSpacing:'0.5px' }}>Ledger Integrity</div>
                    </div>
                    <div style={{ fontFamily:'monospace', fontSize:'11px', color:'var(--text-muted)', wordBreak:'break-all', lineHeight:'1.6' }}>
                      {g.currentHash || 'Not yet sealed'}
                    </div>
                  </div>

                  {/* Action buttons — only on Pending */}
                  {g.status === 'Pending' && (
                    <div style={{ display:'flex', gap:'12px', paddingTop:'4px', borderTop:'1px solid var(--border-subtle)' }}>
                      <motion.button
                        whileHover={{ scale:1.02 }} whileTap={{ scale:0.98 }}
                        className="neon-btn neon-green"
                        style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'8px' }}
                        onClick={() => { updateStatus(g.id,'Phase 1 Approved'); setViewingApplication(null); }}
                      >
                        <CheckCircle size={16} /> Approve Phase 1 (35%)
                      </motion.button>
                      <motion.button
                        whileHover={{ scale:1.02 }} whileTap={{ scale:0.98 }}
                        className="action-btn btn-reject"
                        style={{ flex:1, padding:'14px', fontSize:'14px', display:'flex', alignItems:'center', justifyContent:'center', gap:'8px' }}
                        onClick={() => { setViewingApplication(null); setRejectTarget(g); setRejectNote(''); }}
                      >
                        <XCircle size={16} /> Reject
                      </motion.button>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {rejectTarget && (
        <motion.div className="modal-overlay" initial={{opacity:0,backdropFilter:'blur(0px)'}} animate={{opacity:1,backdropFilter:'blur(10px)'}} exit={{opacity:0}} transition={{duration:0.25}}>
          <motion.div
            initial={{scale:0.9,opacity:0,y:20}} animate={{scale:1,opacity:1,y:0}}
            transition={{type:'spring',stiffness:380,damping:28}}
            style={{maxWidth:'480px',width:'100%',borderRadius:'20px',overflow:'hidden',boxShadow:'0 32px 80px rgba(0,0,0,0.7)'}}
          >
            {/* Red header band */}
            <div style={{background:'linear-gradient(135deg,rgba(185,28,28,0.9),rgba(239,68,68,0.8))',padding:'22px 28px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
                <div style={{width:'40px',height:'40px',borderRadius:'50%',background:'rgba(255,255,255,0.15)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <XCircle size={20} color="white"/>
                </div>
                <div>
                  <div style={{color:'white',fontFamily:'DM Serif Display,serif',fontSize:'20px',fontWeight:'400'}}>Reject Grant</div>
                  <div style={{color:'rgba(255,255,255,0.7)',fontSize:'12px',marginTop:'2px'}}>This action will notify the applicant</div>
                </div>
              </div>
              <button onClick={()=>setRejectTarget(null)} style={{background:'rgba(255,255,255,0.15)',border:'none',color:'white',width:'32px',height:'32px',borderRadius:'50%',cursor:'pointer',fontSize:'18px',display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
            </div>
            {/* Body */}
            <div style={{background:'var(--bg-surface)',padding:'24px 28px'}}>
              {/* Grant info pill */}
              <div style={{display:'flex',alignItems:'center',gap:'12px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:'12px',padding:'14px 16px',marginBottom:'20px'}}>
                <span className={`category-tag cat-${STANDARD_TYPES.includes(rejectTarget.type)?rejectTarget.type:'Other'}`}>{rejectTarget.type}</span>
                <div>
                  <div style={{color:'var(--text-primary)',fontWeight:'700',fontSize:'15px'}}>{rejectTarget.source}</div>
                  <div style={{color:'var(--text-muted)',fontSize:'12px'}}>₹{rejectTarget.amount.toLocaleString()} · Applied {rejectTarget.date}</div>
                </div>
              </div>
              {/* Note textarea */}
              <div style={{position:'relative'}}>
                <label className="input-label">Reason for rejection <span style={{color:'var(--accent-red)'}}>*</span> (shown to applicant)</label>
                <textarea
                  className="dark-input"
                  rows={4}
                  placeholder="Be specific — e.g. 'Budget requested exceeds the ₹25,000 limit for your credit tier. Please reapply with a revised amount.'"
                  value={rejectNote}
                  onChange={e=>setRejectNote(e.target.value)}
                  style={{resize:'vertical',lineHeight:'1.5',borderColor:rejectNote.length>0&&rejectNote.length<15?'var(--accent-red)':rejectNote.length>=15?'rgba(16,185,129,0.4)':undefined}}
                />
                {/* Character counter */}
                <div style={{display:'flex',justifyContent:'space-between',marginTop:'-16px',marginBottom:'16px',fontSize:'11px'}}>
                  <span style={{color:rejectNote.length<15&&rejectNote.length>0?'var(--accent-red)':'var(--text-muted)'}}>
                    {rejectNote.length<15&&rejectNote.length>0?`${15-rejectNote.length} more characters required`:'Minimum 15 characters'}
                  </span>
                  <span style={{color:rejectNote.length>=15?'var(--accent-green)':'var(--text-muted)',fontWeight:'600'}}>{rejectNote.length}/300</span>
                </div>
              </div>
              {/* Buttons */}
              <div style={{display:'flex',gap:'12px'}}>
                <motion.button
                  whileHover={{scale:rejectNote.length>=15?1.02:1}} whileTap={{scale:rejectNote.length>=15?0.98:1}}
                  style={{flex:1,padding:'13px',background:rejectNote.length>=15?'var(--accent-red)':'var(--bg-elevated)',color:rejectNote.length>=15?'white':'var(--text-muted)',border:`1px solid ${rejectNote.length>=15?'var(--accent-red)':'var(--border-subtle)'}`,borderRadius:'10px',cursor:rejectNote.length>=15?'pointer':'not-allowed',fontWeight:'700',fontSize:'14px',fontFamily:'DM Sans',transition:'all 0.2s',boxShadow:rejectNote.length>=15?'0 4px 16px rgba(239,68,68,0.35)':'none'}}
                  onClick={()=>rejectNote.length>=15&&updateStatus(rejectTarget.id,'Rejected',rejectNote)}
                >
                  Confirm Rejection
                </motion.button>
                <button onClick={()=>setRejectTarget(null)} style={{flex:1,background:'transparent',border:'1px solid var(--border-subtle)',color:'var(--text-secondary)',borderRadius:'10px',cursor:'pointer',fontWeight:'600',fontSize:'14px',fontFamily:'DM Sans'}}>Cancel</button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {historyApplicant && (() => {
        const ag = getApplicantGrants(historyApplicant);
        const totalReq = ag.reduce((s,g)=>s+g.amount,0);
        const totalDisb = ag.reduce((s,g)=>s+(g.disbursedAmount||0),0);
        const completed = ag.filter(g=>g.status==='Evaluated'||g.status==='Fully Disbursed').length;
        const rejected = ag.filter(g=>g.status==='Rejected').length;
        return (
          <div className="modal-overlay">
            <div className="glass-modal-content" style={{maxWidth:'680px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'22px'}}>
                <div>
                  <h2 style={{color:'var(--text-primary)',margin:'0 0 3px',fontSize:'22px',fontFamily:'DM Serif Display', display:'flex', alignItems:'center', gap:'8px'}}><User /> {historyApplicant}</h2>
                  <span style={{color:'var(--text-muted)',fontSize:'13px'}}>Full application history</span>
                </div>
                <button onClick={()=>setHistoryApplicant(null)} style={{background:'none',border:'none',fontSize:'26px',color:'var(--text-muted)',cursor:'pointer'}}>×</button>
              </div>
              {/* Coloured stat cards */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',marginBottom:'22px'}}>
                {[
                  {l:'Total Applied', v:ag.length,                         c:'var(--accent-blue)'},
                  {l:'Completed',     v:completed,                         c:'var(--accent-green)'},
                  {l:'Rejected',      v:rejected,                          c:'var(--accent-red)'},
                  {l:'Total Received',v:`₹${totalDisb.toLocaleString()}`,  c:'var(--accent-purple)'},
                ].map((s,idx)=>(
                  <motion.div
                    key={s.l}
                    initial={{opacity:0,y:16}} animate={{opacity:1,y:0}}
                    transition={{delay:idx*0.07,type:'spring',stiffness:300,damping:22}}
                    style={{
                      background:`${s.c.replace('var(--accent-','').replace(')','') === 'blue' ? 'rgba(79,156,249' : s.c.replace('var(--accent-','').replace(')','') === 'green' ? 'rgba(52,211,153' : s.c.replace('var(--accent-','').replace(')','') === 'red' ? 'rgba(248,113,113' : 'rgba(167,139,250'},0.08)`,
                      borderRadius:'14px',padding:'16px',textAlign:'center',
                      border:`1px solid ${s.c.replace('var(--accent-','').replace(')','') === 'blue' ? 'rgba(79,156,249' : s.c.replace('var(--accent-','').replace(')','') === 'green' ? 'rgba(52,211,153' : s.c.replace('var(--accent-','').replace(')','') === 'red' ? 'rgba(248,113,113' : 'rgba(167,139,250'},0.2)`,
                      position:'relative',overflow:'hidden',
                    }}
                    whileHover={{scale:1.04}}
                  >
                    <div style={{fontFamily:'DM Serif Display,serif',fontSize:'26px',color:s.c,lineHeight:1,textShadow:`0 0 20px ${s.c}44`}}>{s.v}</div>
                    <div style={{fontSize:'10px',color:'var(--text-muted)',marginTop:'5px',textTransform:'uppercase',letterSpacing:'0.8px',fontWeight:'700'}}>{s.l}</div>
                  </motion.div>
                ))}
              </div>

              {/* Animated completion bar */}
              <div style={{marginBottom:'20px',background:'var(--bg-elevated)',borderRadius:'12px',padding:'14px 16px',border:'1px solid var(--border-subtle)'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
                  <span style={{fontSize:'13px',fontWeight:'700',color:'var(--text-secondary)'}}>Completion Rate</span>
                  <span style={{fontFamily:'DM Serif Display,serif',fontSize:'22px',color:'var(--accent-green)',textShadow:'0 0 16px rgba(52,211,153,0.4)'}}>{ag.length>0?Math.round(completed/ag.length*100):0}%</span>
                </div>
                <div style={{height:'6px',background:'var(--border-subtle)',borderRadius:'4px',overflow:'hidden'}}>
                  <motion.div
                    initial={{width:0}}
                    animate={{width:`${ag.length>0?completed/ag.length*100:0}%`}}
                    transition={{duration:1.2,ease:[0.22,1,0.36,1],delay:0.3}}
                    style={{height:'100%',background:'linear-gradient(90deg,var(--accent-green),#34d399)',borderRadius:'4px',boxShadow:'0 0 8px rgba(52,211,153,0.5)'}}
                  />
                </div>
                <div style={{display:'flex',justifyContent:'space-between',marginTop:'6px',fontSize:'11px',color:'var(--text-muted)'}}>
                  <span>{completed} completed</span>
                  <span>{ag.length - completed - rejected} in progress · {rejected} rejected</span>
                </div>
              </div>

              {/* Grant rows */}
              <div style={{maxHeight:'280px',overflowY:'auto'}} className="dark-scroll">
                {ag.map((g,i)=>{
                  const risk=getRisk(g.creditScore);
                  const isGood=g.status==='Evaluated'||g.status==='Fully Disbursed';
                  const isBad=g.status==='Rejected'||g.status==='Blocked';
                  return (
                    <motion.div
                      key={i}
                      initial={{opacity:0,x:-12}} animate={{opacity:1,x:0}}
                      transition={{delay:i*0.05,duration:0.3}}
                      style={{
                        display:'flex',justifyContent:'space-between',alignItems:'center',
                        padding:'12px 12px',borderBottom:'1px solid var(--border-subtle)',
                        borderLeft:`3px solid ${isGood?'rgba(52,211,153,0.4)':isBad?'rgba(248,113,113,0.4)':'rgba(251,191,36,0.3)'}`,
                        borderRadius:'0 6px 6px 0',marginBottom:'2px',
                        background:isGood?'rgba(52,211,153,0.02)':isBad?'rgba(248,113,113,0.02)':'transparent',
                      }}
                    >
                      <div>
                        <div style={{display:'flex',alignItems:'center',gap:'7px',marginBottom:'4px'}}>
                          <span className={`category-tag ${STANDARD_TYPES.includes(g.type)?`cat-${g.type}`:'cat-Other'}`}>{g.type}</span>
                          <span className={`status-badge status-${isGood?'Approved':isBad?'Rejected':'Pending'}`}>{g.status}</span>
                          <span className="risk-badge" style={{background:risk.bg,color:risk.color,border:`1px solid ${risk.color}30`,fontSize:'10px',padding:'2px 8px'}}>
                            <span className="risk-dot" style={{background:risk.dot,width:'5px',height:'5px'}}></span>{risk.label}
                          </span>
                        </div>
                        <div style={{fontSize:'11px',color:'var(--text-muted)'}}>{g.date} · Score: <span style={{color:risk.color,fontWeight:'700'}}>{g.creditScore}</span></div>
                        {g.note&&<div style={{fontSize:'11px',color:'var(--accent-red)',marginTop:'3px',fontStyle:'italic'}}>"{g.note}"</div>}
                      </div>
                      <div style={{textAlign:'right',flexShrink:0,marginLeft:'12px'}}>
                        <div style={{color:'var(--text-primary)',fontWeight:'700',fontSize:'14px'}}>₹{g.amount.toLocaleString()}</div>
                        <div style={{color:'var(--accent-blue)',fontSize:'12px',marginTop:'2px'}}>₹{(g.disbursedAmount||0).toLocaleString()} rcvd</div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
              <div style={{marginTop:'14px',display:'flex',justifyContent:'space-between',fontSize:'12px',color:'var(--text-muted)'}}>
                <span>Requested ₹{totalReq.toLocaleString()}</span>
                <span>Received ₹{totalDisb.toLocaleString()}</span>
              </div>
            </div>
          </div>
        );
      })()}

      {viewingGrant && (
        <motion.div className="modal-overlay" style={{ padding: '20px' }}
          initial={{opacity:0,backdropFilter:'blur(0px)'}} animate={{opacity:1,backdropFilter:'blur(12px)'}}
          exit={{opacity:0}} transition={{duration:0.25}}>
          <motion.div
            className="glass-modal-content"
            style={{maxWidth:'980px', width: '100%', maxHeight: '92vh', overflowY: 'auto', padding: 0, overflow:'hidden'}}
            initial={{scale:0.93,opacity:0,y:24}} animate={{scale:1,opacity:1,y:0}}
            exit={{scale:0.93,opacity:0,y:16}} transition={{type:'spring',stiffness:340,damping:28}}
          >
            {/* Coloured header band — green for normal review, red for blocked */}
            <div style={{
              background: viewingGrant.status==='Blocked'
                ? 'linear-gradient(135deg,rgba(185,28,28,0.85),rgba(239,68,68,0.7))'
                : 'linear-gradient(135deg,rgba(4,120,87,0.8),rgba(16,185,129,0.6))',
              padding:'18px 28px',
              display:'flex',justifyContent:'space-between',alignItems:'center',
            }}>
              <div style={{display:'flex',alignItems:'center',gap:'14px'}}>
                <div style={{width:'40px',height:'40px',borderRadius:'50%',background:'rgba(255,255,255,0.15)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  {viewingGrant.status==='Blocked' ? <ShieldAlert size={20} color="white"/> : <FileSearch size={20} color="white"/>}
                </div>
                <div>
                  <div style={{color:'white',fontFamily:'DM Serif Display,serif',fontSize:'18px',fontWeight:'400'}}>
                    {viewingGrant.status==='Blocked' ? 'Fraud Investigation Case' : 'Evidence Review'}
                  </div>
                  <div style={{color:'rgba(255,255,255,0.7)',fontSize:'12px',marginTop:'2px'}}>
                    {viewingGrant.source} · {viewingGrant.type} · ₹{viewingGrant.amount.toLocaleString()}
                  </div>
                </div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                <motion.button
                  whileHover={{scale:1.05}} whileTap={{scale:0.95}}
                  onClick={()=>setXrayMode(!xrayMode)}
                  style={{display:'flex',alignItems:'center',gap:'6px',background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.25)',color:'white',borderRadius:'8px',padding:'7px 14px',cursor:'pointer',fontSize:'12px',fontWeight:'700',fontFamily:'DM Sans'}}
                >
                  {xrayMode ? <><EyeOff size={14}/> Hide X-Ray</> : <><Eye size={14}/> Forensic X-Ray</>}
                </motion.button>
                <button onClick={()=>{setViewingGrant(null); setXrayMode(false); setVendorStatus({});}} style={{background:'rgba(255,255,255,0.15)',border:'none',color:'white',width:'32px',height:'32px',borderRadius:'50%',cursor:'pointer',fontSize:'18px',display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
              </div>
            </div>
            <div style={{padding:'24px 28px', overflowY:'auto', maxHeight:'calc(92vh - 80px)'}}>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }}>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ background: 'var(--bg-elevated)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                  <h3 style={{ color: 'var(--text-primary)', fontSize: '15px', marginTop: 0, marginBottom: '16px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>📁 Application Context</h3>
                  
                  <div className="stat-label" style={{marginBottom:'4px'}}>Applicant Alias</div>
                  <div style={{ color: 'var(--text-primary)', fontWeight: '700', marginBottom: '16px' }}>{viewingGrant.source}</div>
                  
                  <div className="stat-label" style={{marginBottom:'4px'}}>Total Requested Budget</div>
                  <div style={{ color: 'var(--accent-blue)', fontWeight: '800', fontSize: '20px', marginBottom: '16px' }}>₹{viewingGrant.amount.toLocaleString()}</div>
                  
                  <div className="stat-label" style={{marginBottom:'6px'}}>Approved Category</div>
                  <div style={{ marginBottom: '20px' }}><span className={`category-tag ${STANDARD_TYPES.includes(viewingGrant.type) ? `cat-${viewingGrant.type}` : 'cat-Other'}`}>{viewingGrant.type}</span></div>
                  
                  <div className="stat-label" style={{marginBottom:'6px'}}>Risk Profile</div>
                  <div style={{ marginBottom: '20px' }}>
                    <span className="risk-badge" style={{ background:getRisk(viewingGrant.creditScore).bg, color:getRisk(viewingGrant.creditScore).color, border:`1px solid ${getRisk(viewingGrant.creditScore).color}30` }}>
                      <span className="risk-dot" style={{ background:getRisk(viewingGrant.creditScore).dot }}></span>{getRisk(viewingGrant.creditScore).label}
                    </span>
                    {viewingGrant.strikes > 0 && <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '8px', fontWeight: 'bold' }}>⚠️ Prior Fraud Strikes: {viewingGrant.strikes}</div>}
                  </div>

                  <div style={{ background: 'var(--bg-warn-panel)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-warn-panel)' }}>
                     <div style={{ fontSize: '12px', color: 'var(--accent-yellow)', fontWeight: '700', marginBottom: '8px' }}>Admin Verification Checklist</div>
                     <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.8' }}>
                       <input type="checkbox" style={{ marginRight: '8px' }} /> Vendor is legitimate<br/>
                       <input type="checkbox" style={{ marginRight: '8px' }} /> Expense matches category<br/>
                       <input type="checkbox" style={{ marginRight: '8px' }} /> No forensic anomalies detected
                     </div>
                  </div>
                </div>

                {viewingGrant.status === 'Blocked' && (
                  <div style={{ background: 'var(--bg-warn-panel)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-warn-panel)' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: 'var(--accent-yellow)', display: 'flex', alignItems: 'center', gap: '6px' }}><ShieldAlert size={16} /> Private Investigation Thread</h4>
                    <div className="dark-scroll" style={{ maxHeight: '150px', overflowY: 'auto', marginBottom: '10px' }}>
                      {(!viewingGrant.privateNotes || viewingGrant.privateNotes.length === 0) ? (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '10px 0' }}>No notes yet. Start the investigation.</div>
                      ) : viewingGrant.privateNotes.map((n, i) => (
                        <div key={i} style={{ background: 'var(--bg-elevated)', padding: '8px 12px', borderRadius: '6px', marginBottom: '8px', fontSize: '13px', border: '1px solid rgba(255,255,255,0.05)' }}>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '10px', marginBottom: '4px', textTransform: 'uppercase' }}><strong>{n.admin}</strong> • {n.timestamp}</div>
                          <div style={{ color: 'var(--text-primary)' }}>{n.text}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input className="dark-input" style={{ marginBottom: 0, flex: 1, fontSize: '12px', padding: '8px' }} placeholder="Log an internal finding..." value={privateNoteText} onChange={e => setPrivateNoteText(e.target.value)} />
                      <button className="neon-btn neon-blue" style={{ width: 'auto', padding: '8px 12px', fontSize: '12px' }} onClick={() => handleAddPrivateNote(viewingGrant.id)}>Save</button>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                  <h3 style={{ color: 'var(--text-primary)', fontSize: '15px', margin: 0, display:'flex', alignItems:'center', gap:'8px' }}><Receipt size={16}/> Submitted Ledger Entries ({viewingGrant.proofs?.length || 0})</h3>
                  {xrayMode && <span style={{fontSize:'11px',color:'var(--accent-green)',fontWeight:'700',display:'flex',alignItems:'center',gap:'5px'}}><Eye size={12}/> X-RAY ACTIVE</span>}
                </div>

                <div className="dark-scroll" style={{ maxHeight: '55vh', overflowY: 'auto', paddingRight: '10px' }}>
                  {viewingGrant.proofs?.map((proof, pIdx) => {
                    const parsed = proof.description.includes('|') 
                      ? proof.description.split('|').reduce((acc, part) => { const [k,v] = part.split(':'); if(k&&v) acc[k.trim()] = v.trim(); return acc; }, {})
                      : { raw: proof.description };

                    return (
                      <div key={pIdx} style={{background:'var(--bg-input)',padding:'16px',borderRadius:'12px',marginBottom:'16px', border: '1px solid var(--border-subtle)'}}>
                        
                        {parsed.Vendor ? (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px', background: 'var(--bg-elevated)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div>
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Vendor / Payee</div>
                              <div style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: '600' }}>{parsed.Vendor}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Amount</div>
                              <div style={{ fontSize: '16px', color: 'var(--accent-green)', fontWeight: '800' }}>{parsed.Amt}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Category Match</div>
                              <div style={{ fontSize: '13px', color: parsed.Cat === viewingGrant.type ? 'var(--accent-green)' : '#f97316', fontWeight: '500' }}>{parsed.Cat} {parsed.Cat === viewingGrant.type ? '✓' : '⚠️'}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Tax/GST ID</div>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{parsed.GST || 'N/A'}</span>
                                {parsed.GST && parsed.GST !== 'N/A' && (
                                  <button onClick={() => verifyVendor(parsed.GST, pIdx)} disabled={verifyingVendor === pIdx} style={{ background: 'var(--accent-blue)', color: 'white', border: 'none', borderRadius: '4px', fontSize: '9px', padding: '3px 8px', cursor: 'pointer', fontWeight:'bold' }}>
                                    {verifyingVendor === pIdx ? '...' : vendorStatus[pIdx] ? 'Scanned' : 'Verify'}
                                  </button>
                                )}
                              </div>
                              {vendorStatus[pIdx] && <div style={{ fontSize: '10px', color: vendorStatus[pIdx].includes('✅') ? 'var(--accent-green)' : '#f97316', marginTop: '4px', fontWeight: 'bold' }}>{vendorStatus[pIdx]}</div>}
                            </div>
                          </div>
                        ) : (
                          <div style={{color:'var(--text-primary)',fontWeight:'700',fontSize:'15px',marginBottom:'14px'}}>"{proof.description}"</div>
                        )}

                        <div style={{color:'var(--text-muted)',fontSize:'11px',marginBottom:'10px'}}>Uploaded {proof.date}</div>
                        
                        <div style={{display:'flex',gap:'10px',flexWrap:'wrap'}}>
                          {proof.images?.map((img, idx) => {
                            const forensic = proof.forensics?.[idx];
                            const isPdf = img.startsWith('data:application/pdf');
                            const borderColor = forensic?.status === 'FLAGGED' ? '#ef4444' : 'var(--border-subtle)';

                            return (
                              <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '150px', position: 'relative' }}>
                                {xrayMode && !isPdf && (
                                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(4, 15, 10, 0.85)', borderRadius: '8px', border: forensic?.status === 'FLAGGED' ? '1px solid #ef4444' : '1px solid #10b981', padding: '8px', fontFamily: 'monospace', fontSize: '9px', color: forensic?.status === 'FLAGGED' ? '#ef4444' : '#10b981', pointerEvents: 'none', zIndex: 10, overflow: 'hidden' }}>
                                    <motion.div animate={{ top: ['0%', '100%'] }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }} style={{ position: 'absolute', left: 0, right: 0, height: '2px', background: forensic?.status === 'FLAGGED' ? '#ef4444' : '#10b981', boxShadow: `0 0 10px ${forensic?.status === 'FLAGGED' ? '#ef4444' : '#10b981'}` }} />
                                    <strong style={{ borderBottom: '1px dashed', display: 'block', paddingBottom: '4px', marginBottom: '4px' }}>EXIF SCAN</strong>
                                    <div>SIG: {viewingGrant.currentHash?.slice(0, 8)}</div>
                                    <div style={{ marginTop: '4px' }}>EXTRACT:</div>
                                    <div style={{ wordWrap: 'break-word', opacity: 0.8 }}>{forensic?.details}</div>
                                    <div style={{ marginTop: 'auto', paddingTop: '4px', fontWeight: 'bold' }}>{forensic?.status === 'FLAGGED' ? '🚨 TAMPERED' : '✅ CLEAN'}</div>
                                  </div>
                                )}

                                {isPdf ? (
                                  <div onClick={() => setEnlargedImage(img)} style={{ width: '100%', height: '150px', background: 'var(--bg-elevated)', border: `2px solid ${borderColor}`, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-in', transition: 'transform 0.2s', color:'var(--text-muted)' }} onMouseOver={e => e.currentTarget.style.transform = 'scale(1.04)'} onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'} title="Click to view PDF Document"><FileText size={48} /></div>
                                ) : (
                                  <img src={img} alt="" onClick={() => setEnlargedImage(img)} style={{ width: '100%', height: '150px', objectFit: 'cover', borderRadius: '8px', border: `2px solid ${borderColor}`, cursor: 'zoom-in', transition: 'transform 0.2s', filter: xrayMode ? 'contrast(1.5) brightness(0.7)' : 'none' }} onMouseOver={e => e.currentTarget.style.transform = 'scale(1.04)'} onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'} />
                                )}
                                {forensic && (
                                  <div style={{ fontSize: '9px', padding: '4px 6px', borderRadius: '4px', background: forensic.status === 'FLAGGED' ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', color: forensic.status === 'FLAGGED' ? '#ef4444' : '#34d399', border: `1px solid ${forensic.status === 'FLAGGED' ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`, lineHeight: '1.3' }}>
                                    <strong>{forensic.status === 'FLAGGED' ? 'FAIL' : 'PASS'}:</strong> {forensic.details}
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
            </div>
            
            <div style={{display:'flex',gap:'12px',justifyContent:'flex-end', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)'}}>
              
              {viewingGrant.status !== 'Blocked' && (
                <>
                  <button className="neon-btn neon-red" style={{width:'auto', padding:'11px 16px', fontSize: '13px', marginRight: 'auto', display:'flex', alignItems:'center', gap:'6px'}} onClick={() => {
                    if(window.confirm(`🚨 CAUTION: Trigger Vault Kill Switch?\n\nThis freezes ${viewingGrant.source}'s account and issues a fraud strike.`)) {
                      updateStatus(viewingGrant.id, 'Blocked', 'SECURITY FLAG: Suspected document falsification or metadata tampering.');
                    }
                  }}><ShieldAlert size={14}/> Freeze & Investigate</button>
                  <button className="action-btn btn-reject" style={{padding:'11px 16px', fontSize: '13px', display:'flex', alignItems:'center', gap:'6px'}} onClick={()=>{setViewingGrant(null);setRejectTarget(viewingGrant);setRejectNote('');}}><XCircle size={14}/> Reject Evidence</button>
                  <button className="neon-btn neon-green" style={{width:'auto', display:'flex', alignItems:'center', gap:'6px'}} onClick={() => initiateVaultRelease(viewingGrant)} disabled={isSendingOtp}>{isSendingOtp ? 'Generating OTP...' : <><ShieldCheck size={16}/> Approve & Release Escrow</>}</button>
                </>
              )}

              {viewingGrant.status === 'Blocked' && (
                <>
                  <button className="neon-btn neon-green" style={{width:'auto', padding:'11px 16px', fontSize: '13px', marginRight: 'auto'}} onClick={() => {
                    updateStatus(viewingGrant.id, 'Awaiting Review', 'Investigation concluded: Cleared of misuse.');
                  }}>🔓 Lift Freeze & Restore Status</button>

                  <button className="action-btn btn-reject" style={{padding:'11px 16px', fontSize: '13px'}} onClick={() => {
                    if(window.confirm(`⚠️ PERMANENT TERMINATION\n\nThis will permanently reject the grant and add all uploaded files to the Global Plagiarism Blacklist. Confirm?`)) {
                      updateStatus(viewingGrant.id, 'Rejected', 'Investigation concluded: Fraud confirmed. Grant terminated.');
                    }
                  }}>🔨 Confirm Fraud & Terminate</button>
                </>
              )}
            </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {viewingImpact && (() => {
        const metric = viewingImpact.impact?.metric || 0;
        const amt = viewingImpact.amount || 1;
        const efficiency = (metric / (amt / 1000)).toFixed(1); 

        return (
          <div className="modal-overlay">
            <div className="glass-modal-content" style={{maxWidth:'550px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px'}}>
                <h2 style={{color:'var(--text-primary)',margin:0, fontSize: '22px', display:'flex', alignItems:'center', gap:'8px'}}><Rocket /> Program Impact Evaluation</h2>
                <button onClick={()=>setViewingImpact(null)} style={{background:'none',border:'none',fontSize:'26px',color:'var(--text-muted)',cursor:'pointer'}}>×</button>
              </div>
              
              <div style={{background:'rgba(167,139,250,0.08)',border:'1px solid rgba(167,139,250,0.2)',padding:'20px',borderRadius:'12px',marginTop:'8px'}}>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px dashed rgba(167,139,250,0.3)' }}>
                  <div>
                    <div className="stat-label" style={{marginBottom: '4px'}}>Total Investment</div>
                    <div style={{fontSize:'22px', color:'var(--text-primary)', fontWeight: 'bold'}}>₹{viewingImpact.amount.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="stat-label" style={{marginBottom: '4px'}}>Fund Efficiency Score</div>
                    <div style={{fontSize:'22px', color:'var(--accent-purple)', fontWeight: 'bold'}}>{efficiency} <span style={{fontSize:'12px', color:'var(--text-muted)', fontWeight:'normal'}}>KPI / ₹1k</span></div>
                  </div>
                </div>

                <div className="stat-label">Reported Outcome</div>
                <p style={{color:'var(--text-primary)',fontSize:'15px',fontWeight:'500',marginBottom:'20px', background: 'var(--bg-elevated)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-subtle)', lineHeight: '1.5'}}>
                  "{viewingImpact.impact?.outcome}"
                </p>

                <div style={{display:'flex',gap:'18px'}}>
                  <div style={{flex:1}}>
                    <div className="stat-label">Key Metric Achieved</div>
                    <div style={{fontSize:'28px',fontFamily:'DM Serif Display',color:'var(--accent-green)'}}>
                      <CountUp end={metric} duration={2} separator="," />
                    </div>
                  </div>
                  <div style={{flex:2}}>
                    <div className="stat-label">Deliverable Proof</div>
                    {viewingImpact.impact?.link ? (
                      <a href={viewingImpact.impact.link.startsWith('http')?viewingImpact.impact.link:`https://${viewingImpact.impact.link}`} target="_blank" rel="noopener noreferrer" style={{display:'inline-flex', alignItems:'center', gap:'8px', background: 'var(--accent-blue)', color: 'white', padding: '8px 16px', borderRadius: '8px', textDecoration:'none', fontSize:'13px', fontWeight:'bold', marginTop:'4px'}}>
                        🔗 Open Deliverable Link
                      </a>
                    ) : <span style={{color:'var(--text-muted)'}}>No link provided</span>}
                  </div>
                </div>
              </div>
              
              <div style={{marginTop:'16px',textAlign:'center',fontSize:'12px',color:'var(--accent-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'}}>
                <ShieldCheck size={14} />
                Cryptographically sealed and verified on ledger.
              </div>
            </div>
          </div>
        );
      })()}

      <AnimatePresence>
        {showExportPanel && ( 
          <motion.div className="modal-overlay" initial={{ opacity: 0, backdropFilter: 'blur(0px)' }} animate={{ opacity: 1, backdropFilter: 'blur(8px)' }} exit={{ opacity: 0, backdropFilter: 'blur(0px)' }} transition={{ duration: 0.3 }}> 
            <motion.div className="glass-modal-content" style={{ maxWidth: '580px', padding: '40px' }} initial={{ scale: 0.85, opacity: 0, y: 30 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.85, opacity: 0, y: 30 }} transition={{ type: 'spring', damping: 25, stiffness: 350 }}> 
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}> 
                <h2 style={{ color: 'var(--text-primary)', margin: 0, fontSize: '28px', display:'flex', alignItems:'center', gap:'10px' }}><Download /> Export Report</h2> 
                <button onClick={() => setShowExportPanel(false)} style={{ background: 'none', border: 'none', fontSize: '36px', color: 'var(--text-muted)', cursor: 'pointer' }}>×</button> 
              </div> 
              <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px', marginBottom: '28px' }}> 
                <div style={{ fontWeight: '700', color: 'var(--text-primary)', marginBottom: '14px', fontSize: '15px' }}>Report Contents:</div> 
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', fontSize: '14px', color: 'var(--text-secondary)' }}> 
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><LayoutDashboard size={14}/> Summary analytics</div> 
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><ScrollText size={14}/> Grants organized by status</div> 
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><ShieldCheck size={14}/> Risk levels & hashes</div> 
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Clock size={14}/> Date-range filtering</div> 
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
              <div style={{ background: 'rgba(79,156,249,0.08)', border: '1px solid rgba(79,156,249,0.18)', borderRadius: '10px', padding: '16px 20px', marginBottom: '24px', fontSize: '16px', color: 'var(--accent-blue)', fontWeight: '500', display:'flex', alignItems:'center', gap:'8px' }}> 
                <FileText size={16}/> {exportFrom || exportTo ? `${grantsList.filter(g => { const d = new Date(g.date); return (!exportFrom || d >= new Date(exportFrom)) && (!exportTo || d <= new Date(exportTo)); }).length} grants will be included` : `All ${grantsList.length} grants will be included`} 
              </div> 
              <button className="neon-btn neon-green" style={{ fontSize: '18px', padding: '16px', fontWeight: '700', display:'flex', alignItems:'center', justifyContent:'center', gap:'8px' }} onClick={exportToPDF}><Download size={20}/> Generate PDF</button> 
            </motion.div> 
          </motion.div> 
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLogs && (
          <motion.div className="modal-overlay" initial={{ opacity: 0, backdropFilter: 'blur(0px)' }} animate={{ opacity: 1, backdropFilter: 'blur(8px)' }} exit={{ opacity: 0, backdropFilter: 'blur(0px)' }} transition={{ duration: 0.3 }}>
            <motion.div className="glass-modal-content" style={{ maxWidth: '920px', width: '92vw' }} initial={{ scale: 0.85, opacity: 0, y: 30 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.85, opacity: 0, y: 30 }} transition={{ type: 'spring', damping: 25, stiffness: 350 }}>
              
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'24px'}}>
                <h2 style={{margin:0,color:'var(--text-primary)',fontFamily:'DM Serif Display',fontSize:'26px',fontWeight:'400', display:'flex', alignItems:'center', gap:'10px'}}><ScrollText /> System Audit Trail</h2>
                <button onClick={()=>setShowLogs(false)} style={{background:'none',border:'none',fontSize:'32px',color:'var(--text-muted)',cursor:'pointer'}}>×</button>
              </div>
              
              <div className="logs-container dark-scroll">
                <div className="timeline-beam-container" style={{ position: 'relative', paddingLeft: '34px', minHeight: '100%' }}>
                  <div className="timeline-beam"></div>
                  <div className="timeline-beam-glow"></div>

                  <table style={{width:'100%',borderCollapse:'collapse'}}>
                    <thead><tr>{['Time','Actor','Action','Target','Details'].map(h=><th key={h} className="table-header" style={{ fontSize: '14px', paddingBottom: '16px' }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {logs.length===0
                        ?<tr><td colSpan="5" style={{padding:'40px',textAlign:'center',color:'var(--text-muted)', fontSize: '15px'}}>No logs yet.</td></tr>
                        :logs.map((log, logIdx)=>{
                          const act = (log.action || '').toUpperCase();
                          let badgeClass = 'status-Pending';
                          if (act.includes('APPROV') || act.includes('DISBURS') || act.includes('IMPACT') || act.includes('LIFTED')) badgeClass = 'status-Approved';
                          if (act.includes('REJECT') || act.includes('CANCEL')  || act.includes('BLOCK') || act.includes('FLAGGED') || act.includes('BLACKLIST')) badgeClass = 'status-Rejected';

                          return (
                            <motion.tr key={log.id} className="table-row"
                              initial={{ opacity: 0, x: -16 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: logIdx * 0.04, duration: 0.3, ease: 'easeOut' }}>
                              <td style={{color:'var(--text-muted)',padding:'16px 14px',fontSize:'14px'}}>{log.timestamp?.split(',')[1]?.trim()}</td>
                              <td style={{fontWeight:'600',color:'var(--text-primary)',padding:'16px 14px',fontSize:'15px'}}>{log.admin}</td>
                              <td style={{padding:'16px 14px'}}><span className={`status-badge ${badgeClass}`} style={{ fontSize: '12px', padding: '6px 12px', whiteSpace: 'nowrap' }}>{log.action}</span></td>
                              <td style={{color:'var(--text-secondary)',padding:'16px 14px',fontSize:'15px'}}>{log.target}</td>
                              <td style={{color:'var(--text-muted)',padding:'16px 14px',fontSize:'14px', lineHeight: '1.5'}}>{log.details}</td>
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay" style={{zIndex:9999,cursor:'zoom-out'}} onClick={()=>setEnlargedImage(null)}>
            {enlargedImage.startsWith('data:application/pdf') ? (
              <iframe src={enlargedImage} style={{ width: '80vw', height: '85vh', borderRadius: '12px', border: 'none', background: '#fff' }} title="PDF Preview" onClick={e => e.stopPropagation()} />
            ) : (
              <img src={enlargedImage} alt="" style={{maxHeight:'90vh',maxWidth:'90vw',borderRadius:'12px',boxShadow:'0 0 40px rgba(0,0,0,0.8)'}} onClick={e => e.stopPropagation()} />
            )}
            <button onClick={()=>setEnlargedImage(null)} style={{position:'absolute',top:'18px',right:'24px',background:'none',border:'none',color:'white',fontSize:'38px',cursor:'pointer'}}>×</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}