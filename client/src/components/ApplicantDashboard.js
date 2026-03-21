import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import Particles from "react-tsparticles";
import { loadSlim } from "tsparticles-slim";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
import CountUp from 'react-countup';
import confetti from 'canvas-confetti';
import ReactCrop from 'react-image-crop'; 
import 'react-image-crop/dist/ReactCrop.css'; 
import jsPDF from 'jspdf'; // 👈 IMPORTED JSPDF
import './ApplicantDashboard.css';

const STANDARD_TYPES = ["Research", "Travel", "Equipment", "Stipend"];
const EXPENSE_CATEGORIES = ["Hardware", "Software", "Travel", "Consumables", "Services", "Other"];
const API = 'http://localhost:3001';

const getTier = (grants) => {
  const completed = grants.filter(g => g.status === 'Evaluated' || g.status === 'Fully Disbursed').length;
  const total     = grants.length;
  if (total === 0) return { label: 'New Applicant', color: 'var(--text-muted)', bg: 'var(--bg-elevated)', icon: '🌱' };
  const rate = completed / total;
  if (completed >= 3 && rate >= 0.8) return { label: 'Gold Member',   color: 'var(--accent-yellow)', bg: 'var(--bg-warn-panel)',  icon: '🥇' };
  if (completed >= 1 && rate >= 0.5) return { label: 'Silver Member', color: 'var(--text-secondary)', bg: 'var(--bg-elevated)', icon: '🥈' };
  return                                    { label: 'Bronze Member', color: '#f97316', bg: 'var(--bg-info-panel)',  icon: '🥉' };
};

const getEligibilityInfo = (creditScore) => {
  if (!creditScore) return { limit: 0, msg: '', color: 'var(--text-muted)', width: '0%' };
  const score = parseInt(creditScore);
  const percent = `${Math.min(100, Math.max(0, ((score - 300) / 600) * 100))}%`;
  if (score >= 750) return { limit: 100000, msg: '✅ Gold Tier: Eligible up to ₹1,00,000', color: 'var(--accent-green)', width: percent };
  if (score >= 600) return { limit: 25000,  msg: '⚠️ Standard Tier: Eligible up to ₹25,000', color: 'var(--accent-yellow)', width: percent };
  return                   { limit: 0,      msg: '❌ Score too low. Not eligible.',            color: 'var(--accent-red)', width: percent };
};

const getTagClass = (t) => STANDARD_TYPES.includes(t) ? `cat-${t}` : 'cat-Other';

const STATUS_ICON = {
  'Pending':         { icon: '⏳', color: 'var(--accent-yellow)', msg: 'Waiting for admin review'          },
  'Phase 1 Approved':{ icon: '✅', color: 'var(--accent-green)', msg: '35% released — upload your proofs' },
  'Awaiting Review': { icon: '🔍', color: '#f97316', msg: 'Admin is reviewing your proofs'    },
  'Fully Disbursed': { icon: '💰', color: 'var(--accent-purple)', msg: 'All funds released — submit report'},
  'Evaluated':       { icon: '🚀', color: 'var(--accent-cyan)', msg: 'Project complete'                  },
  'Rejected':        { icon: '❌', color: 'var(--accent-red)', msg: 'Application rejected'               },
  'Blocked':         { icon: '🛑', color: '#b91c1c', msg: 'Account frozen pending investigation.'      },
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
  const [pos,  setPos]  = useState({ x: 0, y: 0 });
  return (
    <div
      style={{ display: 'inline-block' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onMouseMove={e => setPos({ x: e.clientX + 14, y: e.clientY - 40 })}
    >
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
  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["10deg", "-10deg"]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-10deg", "10deg"]);
  const [spotlight, setSpotlight] = useState({ x: 0, y: 0, opacity: 0 });

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mX = e.clientX - rect.left; const mY = e.clientY - rect.top;
    x.set(mX / rect.width - 0.5); y.set(mY / rect.height - 0.5);
    setSpotlight({ x: mX, y: mY, opacity: 1 });
  };
  const handleMouseLeave = () => { x.set(0); y.set(0); setSpotlight(p => ({ ...p, opacity: 0 })); };
  
  return (
    <motion.div onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} style={{ rotateX, rotateY, transformStyle: "preserve-3d", perspective: "1000px", overflow: 'visible', cursor: onClick ? 'pointer' : 'default', ...style }} className={className} onClick={onClick}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', pointerEvents: 'none', zIndex: 0, background: `radial-gradient(circle 200px at ${spotlight.x}px ${spotlight.y}px, rgba(255,255,255,0.06), transparent)`, opacity: spotlight.opacity, transition: 'opacity 0.4s' }} />
      <div style={{ transform: "translateZ(30px)", position: 'relative', zIndex: 1, display: "flex", flexDirection: "column", height: "100%", justifyContent: "center" }}>
        {children}
      </div>
    </motion.div>
  );
};

// Mini sparkline — 6 data points rendered as SVG polyline with area fill
const Sparkline = ({ points = [], color = '#4f9cf9', height = 28 }) => {
  if (!points || points.length < 2) return null;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const W = 80; const H = height;
  const pts = points.map((v, i) => `${(i / (points.length-1)) * W},${H - ((v-min)/range)*H}`).join(' ');
  const gradId = `sg${color.replace(/[^a-z0-9]/gi,'')}`;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow:'visible', display:'block' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0"   />
        </linearGradient>
      </defs>
      <polygon points={`0,${H} ${pts} ${W},${H}`} fill={`url(#${gradId})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" style={{ filter:`drop-shadow(0 0 3px ${color}88)` }} />
      <circle cx={(points.length-1)/(points.length-1)*W} cy={H-((points[points.length-1]-min)/range)*H} r="2.5" fill={color} style={{ filter:`drop-shadow(0 0 4px ${color})` }} />
    </svg>
  );
};

const StatCard = ({ label, value, prefix='', suffix='', color, sub, sparkPoints }) => (
  <TiltCard className="glass-card stat-card" style={{ borderBottom:`2px solid ${color}44` }}>
    <div className="stat-label">{label}</div>
    <div className="stat-value" style={{ color, textShadow:`0 0 28px ${color}44` }}>
      {prefix}{typeof value === 'number' ? <CountUp end={value} duration={2.5} separator="," /> : value}{suffix}
    </div>
    {sub && <div style={{ fontSize:'12px', color:'var(--text-muted)', marginTop:'5px' }}>{sub}</div>}
    {sparkPoints && sparkPoints.length >= 2 && (
      <div style={{ marginTop: '10px', opacity: 0.75 }}>
        <Sparkline points={sparkPoints} color={color} height={28} />
      </div>
    )}
  </TiltCard>
);

const TabBtn = ({ id, label, badge, activeTab, setActiveTab }) => (
  <button className={`tab-btn ${activeTab===id ? 'active' : ''}`} onClick={() => setActiveTab(id)} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
    {label}
    {badge > 0 && <span style={{ marginLeft: '8px', background: 'var(--accent-blue)', color: '#ffffff', fontSize: '12px', fontWeight: '800', padding: '2px 8px', borderRadius: '12px' }}>{badge}</span>}
  </button>
);

export default function ApplicantDashboard({ currentUser, currentUserEmail, grantsList = [], fetchGrants, handleLogout, isDarkMode, toggleTheme }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [source,      setSource]      = useState(currentUser);
  const [amount,      setAmount]      = useState('');
  const [creditScore, setCreditScore] = useState('');
  const [type,        setType]        = useState('Research');
  const [customType,  setCustomType]  = useState('');
  const [bypassMode,  setBypassMode]  = useState(false);
  const [reapplyFrom, setReapplyFrom] = useState(null); 
  const [impactState, setImpactState] = useState({}); 
  const [editingGrant, setEditingGrant] = useState(null);
  const [editSource,   setEditSource]   = useState('');
  const [editAmount,   setEditAmount]   = useState('');
  const [editScore,    setEditScore]    = useState('');
  const [editType,     setEditType]     = useState('');
  const [activityLogs, setActivityLogs] = useState([]);
  const [amountError,     setAmountError]     = useState('');
  const [editAmountError, setEditAmountError] = useState('');

  const [proofDrafts, setProofDrafts] = useState({});
  const [enlargedImage, setEnlargedImage] = useState(null); 
  
  const [cropModal, setCropModal] = useState({ isOpen: false, grantId: null, imageIndex: null, src: null });
  const [crop, setCrop] = useState({ unit: '%', width: 50, height: 50 }); 
  const [completedCrop, setCompletedCrop] = useState(null);
  const imgRef = useRef(null);

  const myGrants = useMemo(() => grantsList.filter(g => g.userId && g.userId.toLowerCase() === currentUserEmail.toLowerCase()).reverse(), [grantsList, currentUserEmail]);
  const activeGrants = myGrants.filter(g => ['Phase 1 Approved','Awaiting Review','Fully Disbursed', 'Blocked'].includes(g.status));
  const pendingGrants= myGrants.filter(g => g.status === 'Pending');
  const tier = getTier(myGrants);

  const totalReceived  = myGrants.reduce((s, g) => s + (g.disbursedAmount || 0), 0);
  const totalRequested = myGrants.reduce((s, g) => s + g.amount, 0);
  const completedCount = myGrants.filter(g => g.status === 'Evaluated').length;
  const pendingCount   = myGrants.filter(g => ['Pending','Phase 1 Approved','Awaiting Review'].includes(g.status)).length;
  const eligibility = getEligibilityInfo(creditScore);

  // Apply form inline validation
  const applyAmountNum    = parseInt(amount) || 0;
  const applyIsNegative   = amount !== '' && applyAmountNum <= 0;
  const applyExceedsLimit = !bypassMode && amount !== '' && applyAmountNum > 0 && applyAmountNum > eligibility.limit && eligibility.limit > 0;
  const applyFormValid    = !!(source && amount && creditScore && !applyIsNegative && !applyExceedsLimit && (type !== 'Other' || customType));

  // Sparkline data — last 6 grants in chronological order
  const last6 = [...myGrants].reverse().slice(-6);
  const sparkReceived  = last6.map(g => g.disbursedAmount || 0);
  const sparkActive    = last6.map((_, i) => {
    const slice = myGrants.slice(0, i + 1);
    return slice.filter(g => ['Phase 1 Approved','Awaiting Review','Fully Disbursed'].includes(g.status)).length;
  });
  const sparkCompleted = last6.map((_, i) => myGrants.slice(0, i + 1).filter(g => g.status === 'Evaluated').length);
  const sparkSuccess   = last6.map((_, i) => {
    const slice = myGrants.slice(0, i + 1);
    const done  = slice.filter(g => g.status === 'Evaluated').length;
    return slice.length > 0 ? Math.round((done / slice.length) * 100) : 0;
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem('expenseDrafts');
      if (saved) {
        const parsed = JSON.parse(saved);
        Object.keys(parsed).forEach(k => parsed[k].images = []);
        setProofDrafts(parsed);
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    const safeToSave = {};
    Object.keys(proofDrafts).forEach(k => {
      safeToSave[k] = { ...proofDrafts[k], images: [] };
    });
    localStorage.setItem('expenseDrafts', JSON.stringify(safeToSave));
  }, [proofDrafts]);

  useEffect(() => {
    if (myGrants.length === 0) return;
    const mySources = new Set(myGrants.map(g => g.source?.toLowerCase()));
    const myIds     = new Set(myGrants.map(g => String(g.id)));
    axios.get(`${API}/logs`).then(res => {
      const filtered = res.data.filter(log => mySources.has(log.target?.toLowerCase()) || myIds.has(String(log.targetId))).slice(0, 20);
      setActivityLogs(filtered);
    }).catch(() => {});
  }, [myGrants]);

  const particlesInit = useCallback(async engine => { await loadSlim(engine); }, []);

  const addGrant = () => {
    if (!source || !amount || !creditScore) return alert('Please fill in all fields');
    const reqAmount = parseInt(amount);
    if (isNaN(reqAmount) || reqAmount <= 0) {
      setAmountError('Amount must be a positive number greater than ₹0.');
      return;
    }
    if (reqAmount > 10000000) {
      setAmountError('Amount cannot exceed ₹1,00,00,000.');
      return;
    }
    setAmountError('');
    if (!bypassMode && reqAmount > eligibility.limit) return alert(`🚫 Max allowed: ₹${eligibility.limit.toLocaleString()}`);
    const finalType = type === 'Other' ? customType : type;
    axios.post(`${API}/add-grant`, { source, amount: reqAmount, type: finalType, creditScore, userId: currentUserEmail })
      .then(() => {
        fetchGrants(); setAmount(''); setCreditScore(''); setType('Research'); setCustomType(''); setReapplyFrom(null); setAmountError('');
        setActiveTab('history'); triggerConfetti();
      })
      .catch(err => {
        if(err.response?.data?.message?.includes('BLACKLISTED')) {
          alert(`🛑 CRITICAL SECURITY ALERT:\n\n${err.response.data.message}\nYour account has been locked due to repeated forensic flags.`);
        } else {
          alert(err.response?.data?.message || 'Error connecting to server');
        }
      });
  };

  const prefillReapply = (grant) => {
    setReapplyFrom(grant); setSource(grant.source); setAmount(String(grant.amount)); setCreditScore(String(grant.creditScore || ''));
    setType(STANDARD_TYPES.includes(grant.type) ? grant.type : 'Other'); setCustomType(STANDARD_TYPES.includes(grant.type) ? '' : grant.type);
    setActiveTab('apply');
  };

  const openEdit = (grant) => {
    setEditingGrant(grant); setEditSource(grant.source); setEditAmount(String(grant.amount)); setEditScore(String(grant.creditScore || '')); setEditType(grant.type); setEditAmountError('');
  };

  const saveEdit = () => {
    if (!editSource || !editAmount || !editScore) return alert('Please fill in all fields');
    const editAmtNum = parseInt(editAmount);
    if (isNaN(editAmtNum) || editAmtNum <= 0) {
      setEditAmountError('Amount must be a positive number greater than ₹0.');
      return;
    }
    if (editAmtNum > 10000000) {
      setEditAmountError('Amount cannot exceed ₹1,00,00,000.');
      return;
    }
    const editEligibility = getEligibilityInfo(editScore);
    if (editAmtNum > editEligibility.limit) {
      setEditAmountError(`Exceeds your credit tier limit of ₹${editEligibility.limit.toLocaleString()} for score ${editScore}.`);
      return;
    }
    setEditAmountError('');
    axios.post(`${API}/edit-grant`, { id: editingGrant.id, source: editSource, amount: editAmtNum, creditScore: editScore, type: editType })
      .then(() => { fetchGrants(); setEditingGrant(null); setEditAmountError(''); })
      .catch(err => alert(err.response?.data?.message || 'Edit failed'));
  };

  const cancelGrant = (id) => {
    if (!window.confirm('Cancel this application? This cannot be undone.')) return;
    axios.post(`${API}/cancel-grant`, { id }).then(() => fetchGrants()).catch(() => alert('Cancel failed'));
  };

  const updateProofDraft = (grantId, field, value) => {
    setProofDrafts(prev => {
      const current = prev[grantId] || { vendor: '', category: 'Hardware', customCategory: '', amount: '', gst: '', images: [] };
      return { ...prev, [grantId]: { ...current, [field]: value } };
    });
  };

  const handleProofImages = (grantId, files) => {
    if (!files || files.length === 0) return;
    const validFiles = Array.from(files).filter(f => {
      if (f.size > 5 * 1024 * 1024) { alert(`File ${f.name} is larger than the 5MB limit and was skipped.`); return false; }
      return true;
    });

    const promises = validFiles.map(f => new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onloadend = () => res(reader.result);
      reader.onerror = rej;
      reader.readAsDataURL(f);
    }));

    Promise.all(promises).then(base64Files => {
      setProofDrafts(prev => {
        const current = prev[grantId] || { vendor: '', category: 'Hardware', customCategory: '', amount: '', gst: '', images: [] };
        return { ...prev, [grantId]: { ...current, images: [...current.images, ...base64Files] } };
      });
    }).catch(() => alert('Failed to process files.'));
  };

  const saveCroppedImage = () => {
    if (!completedCrop || !imgRef.current) return;
    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    canvas.width = completedCrop.width;
    canvas.height = completedCrop.height;
    const ctx = canvas.getContext('2d');

    ctx.drawImage( image, completedCrop.x * scaleX, completedCrop.y * scaleY, completedCrop.width * scaleX, completedCrop.height * scaleY, 0, 0, completedCrop.width, completedCrop.height );
    const base64Image = canvas.toDataURL('image/jpeg', 0.8);

    setProofDrafts(prev => {
      const current = prev[cropModal.grantId];
      const updatedImages = [...current.images];
      updatedImages[cropModal.imageIndex] = base64Image; 
      return { ...prev, [cropModal.grantId]: { ...current, images: updatedImages } };
    });
    setCropModal({ isOpen: false, grantId: null, imageIndex: null, src: null });
  };

  const addExpenseEntry = (grantId) => {
    const draft = proofDrafts[grantId] || {};
    if (!draft.vendor || !draft.amount || !draft.images?.length) return alert('Please complete the Vendor, Amount, and upload at least one receipt.');
    
    const finalCategory = draft.category === 'Other' && draft.customCategory ? draft.customCategory : draft.category;
    const formattedDesc = `Vendor: ${draft.vendor} | Cat: ${finalCategory} | Amt: ₹${draft.amount} | GST: ${draft.gst || 'N/A'}`;
    
    axios.post(`${API}/add-expense`, { grantId, description: formattedDesc, proofImages: draft.images })
      .then(() => {
        fetchGrants();
        setProofDrafts(prev => ({ ...prev, [grantId]: { vendor: '', category: 'Hardware', customCategory: '', amount: '', gst: '', images: [] } }));
      }).catch(err => {
        if(err.response?.data?.message?.includes('PREVIOUS FRAUD CASE')) {
          alert(`🛑 UPLOAD BLOCKED:\n\nOur system detected that this exact image was used in a previous fraudulent application. Your actions have been logged.`);
        } else {
          alert('Failed to save expense. Files might be too large.');
        }
      });
  };

  const deleteExpenseEntry = (grantId, index) => {
    if(!window.confirm("Delete this saved expense entry?")) return;
    axios.post(`${API}/delete-expense`, { grantId, index })
      .then(() => fetchGrants())
      .catch(() => alert("Failed to delete."));
  };

  const submitAllProofs = (grantId, loggedAmount, disbursed) => {
    if (loggedAmount > disbursed) {
      return alert(`🚫 Submission Blocked:\nYou have logged ₹${loggedAmount.toLocaleString()}, which exceeds your released budget of ₹${disbursed.toLocaleString()}.\n\nPlease remove or edit expenses to stay within your authorized limits.`);
    }
    if (!window.confirm('Submit all expenses to admin for review? This will lock the expense log.')) return;
    axios.post(`${API}/submit-proof`, { grantId, finalize: true }).then(() => { fetchGrants(); triggerConfetti(); }).catch(() => alert('Submission failed'));
  };

  const updateImpact = (grantId, field, value) => { setImpactState(prev => ({ ...prev, [grantId]: { ...(prev[grantId] || {}), [field]: value } })); };

  const submitImpact = (grantId) => {
    const imp = impactState[grantId] || {};
    if (!imp.outcome || !imp.metric) return alert('Please fill Outcome and Metric');
    axios.post(`${API}/submit-impact`, { grantId, outcome: imp.outcome, metric: imp.metric, link: imp.link || '' }).then(() => { fetchGrants(); setImpactState(prev => ({ ...prev, [grantId]: {} })); triggerConfetti(); }).catch(() => alert('Failed to submit impact'));
  };

  const getLoggedTotal = (proofs) => {
    return proofs.reduce((sum, p) => {
      const match = p.description.match(/Amt:\s*₹(\d+)/);
      return match ? sum + parseInt(match[1], 10) : sum;
    }, 0);
  };

  // ✨ NEW: Generate PDF Impact Certificate
  const generateCertificate = (grant) => {
    const doc = new jsPDF({ orientation: 'landscape', format: 'a4' });

    // Background & Borders
    doc.setFillColor(15, 23, 42); // Dark slate background
    doc.rect(0, 0, 297, 210, 'F');
    doc.setDrawColor(59, 130, 246); // Blue inner border
    doc.setLineWidth(2);
    doc.rect(10, 10, 277, 190, 'S');
    doc.setDrawColor(139, 92, 246); // Purple outer accent
    doc.setLineWidth(0.5);
    doc.rect(12, 12, 273, 186, 'S');

    // Header
    doc.setTextColor(248, 250, 252);
    doc.setFontSize(36);
    doc.setFont(undefined, 'bold');
    doc.text("Certificate of Execution", 148.5, 45, { align: "center" });

    doc.setFontSize(14);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text("Official Record of Cryptographically Sealed Grant Delivery", 148.5, 55, { align: "center" });

    // Body
    doc.setFontSize(16);
    doc.setTextColor(248, 250, 252);
    doc.text("This certifies that", 148.5, 85, { align: "center" });

    doc.setFontSize(32);
    doc.setTextColor(52, 211, 153); // Neon Green
    doc.setFont(undefined, 'bold');
    doc.text(grant.source, 148.5, 100, { align: "center" });

    doc.setFontSize(14);
    doc.setTextColor(248, 250, 252);
    doc.setFont(undefined, 'normal');
    doc.text(`has successfully deployed a ₹${grant.amount.toLocaleString()} capital allocation`, 148.5, 115, { align: "center" });
    doc.text(`under the ${grant.type} classification framework.`, 148.5, 122, { align: "center" });

    // Impact Specifics
    if (grant.impact) {
      doc.setFillColor(30, 41, 59);
      doc.rect(40, 135, 217, 25, 'F');
      doc.setFontSize(12);
      doc.setTextColor(203, 213, 225);
      doc.text(`Validated Outcome: "${grant.impact.outcome}"`, 148.5, 145, { align: "center" });
      doc.text(`Key Performance Metric Achieved: ${grant.impact.metric}`, 148.5, 152, { align: "center" });
    }

    // Ledger Seal
    doc.setDrawColor(255, 255, 255, 0.1);
    doc.line(40, 175, 257, 175);

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Cryptographic Ledger Hash (SHA-256):`, 148.5, 182, { align: "center" });
    doc.setFont(undefined, 'bold');
    doc.text(grant.currentHash, 148.5, 188, { align: "center" });
    
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.text(`Date Verified: ${grant.impact ? grant.impact.date : grant.date} | ID: ${grant.id}`, 148.5, 194, { align: "center" });

    // Trigger celebration and download!
    triggerConfetti();
    doc.save(`${grant.source}_Impact_Certificate_${grant.id}.pdf`);
  };

  return (
    <div className="app-wrapper" style={{ position: 'relative' }}>
      <Particles 
        id="applicant-particles" 
        init={particlesInit} 
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none' }}
        options={{
            fpsLimit: 60,
            interactivity: { events: { onHover: { enable: true, mode: isDarkMode ? "grab" : "repulse" } }, modes: { grab: { distance: 180, links: { opacity: 0.6, color: "#3b82f6" } }, repulse: { distance: 120, duration: 0.4 } } },
            particles: { color: { value: isDarkMode ? ["#3b82f6", "#10b981", "#64748b"] : ["#4f9cf9", "#34d399", "#a78bfa", "#fbbf24"] }, links: { color: isDarkMode ? "#334155" : "#ffffff", distance: 150, enable: isDarkMode, opacity: 0.3, width: 1 }, move: { enable: true, speed: isDarkMode ? 0.4 : 0.8, direction: isDarkMode ? "none" : "top", random: true, straight: false, outModes: { default: "out" } }, number: { density: { enable: true, area: 1200 }, value: isDarkMode ? 40 : 25 }, opacity: { value: isDarkMode ? 0.4 : 0.7, animation: { enable: !isDarkMode, speed: 0.5, minimumValue: 0.1 } }, shape: { type: "circle" }, size: { value: { min: isDarkMode ? 1 : 3, max: isDarkMode ? 2 : 8 } } },
            detectRetina: true,
        }}
      />
      <div className="ambient-glow glow-1"></div>
      <div className="ambient-glow glow-2"></div>
      
      <div className="app-container" style={{ position: 'relative', zIndex: 10 }}>
        <div className="header">
          <div>
            <h1 className="gradient-text" style={{ fontSize: '32px' }}><CyberText text={`Welcome, ${currentUser}`} /></h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>Applicant Grant Portal</span>
              <span style={{ background: tier.bg, color: tier.color, border: `1px solid ${tier.color}44`, fontSize: '13px', fontWeight: '800', padding: '4px 12px', borderRadius: '14px' }}>{tier.icon} {tier.label}</span>
            </div>
          </div>
          <div className="header-actions">
            <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">{isDarkMode ? '☀️' : '🌙'}</button>
            <button className="logout-btn" onClick={handleLogout}>Logout</button>
          </div>
        </div>

        <div className="tab-bar">
          <TabBtn id="overview"  label="📊 Overview" activeTab={activeTab} setActiveTab={setActiveTab} />
          <TabBtn id="active"    label="🟢 Active" badge={activeGrants.length} activeTab={activeTab} setActiveTab={setActiveTab} />
          <TabBtn id="apply"     label={reapplyFrom ? '🔁 Reapplying' : '📝 Apply'} activeTab={activeTab} setActiveTab={setActiveTab} />
          <TabBtn id="history"   label="📂 History" badge={pendingGrants.length} activeTab={activeTab} setActiveTab={setActiveTab} />
        </div>

        {activeTab === 'overview' && (<>
          <div className="summary-row" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
            <StatCard label="Total Received"  value={totalReceived} prefix="₹" color="var(--accent-blue)"   sub={`of ₹${totalRequested.toLocaleString()} requested`} sparkPoints={sparkReceived} />
            <StatCard label="Active Projects" value={activeGrants.length}       color="var(--accent-yellow)" sub={`${pendingCount} pending`}                           sparkPoints={sparkActive} />
            <StatCard label="Completed"       value={completedCount}             color="var(--accent-green)"  sub="evaluated projects"                                  sparkPoints={sparkCompleted} />
            <StatCard label="Success Rate"    value={myGrants.length > 0 ? Math.round((completedCount / myGrants.length) * 100) : '—'} suffix={myGrants.length > 0 ? "%" : ""} color="var(--accent-purple)" sub={`${myGrants.length} total grants`} sparkPoints={sparkSuccess} />
          </div>

          <div className="glass-card" style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <div style={{ color: 'var(--text-heading)', fontFamily: 'DM Serif Display, serif', fontSize: '20px', fontWeight: '400', marginBottom: '4px' }}>{tier.icon} {tier.label}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  {completedCount < 1 ? 'Complete your first project to earn Bronze' : completedCount < 3 ? `${3 - completedCount} more project${3-completedCount>1?'s':''} to reach Gold` : '🏆 Maximum tier achieved!'}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '20px' }}>
                <div style={{ color: tier.color, fontFamily: 'DM Serif Display, serif', fontSize: '32px', lineHeight: 1, textShadow: `0 0 24px ${tier.color}66` }}>{completedCount}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px' }}>projects done</div>
              </div>
            </div>

            {/* 3-node tier track */}
            {(() => {
              const nodes = [
                { label: 'Bronze', icon: '🥉', color: '#f97316', req: 1 },
                { label: 'Silver', icon: '🥈', color: '#94a3b8', req: 2 },
                { label: 'Gold',   icon: '🥇', color: '#fbbf24', req: 3 },
              ];
              return (
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0 4px' }}>
                  {/* Connecting track line */}
                  <div style={{
                    position: 'absolute', top: '50%', left: '24px', right: '24px',
                    height: '2px', transform: 'translateY(-50%)',
                    background: 'var(--border-subtle)', borderRadius: '2px', zIndex: 0,
                  }} />
                  {/* Filled progress */}
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (completedCount / 3) * 100)}%` }}
                    transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
                    style={{
                      position: 'absolute', top: '50%', left: '24px',
                      height: '2px', transform: 'translateY(-50%)',
                      background: `linear-gradient(90deg, #f97316, #94a3b8, #fbbf24)`,
                      borderRadius: '2px', zIndex: 1,
                      maxWidth: 'calc(100% - 48px)',
                    }}
                  />
                  {nodes.map((n, idx) => {
                    const reached = completedCount >= n.req;
                    const isCurrent = tier.label.toLowerCase().includes(n.label.toLowerCase());
                    return (
                      <div key={n.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', zIndex: 2, position: 'relative' }}>
                        {/* Node circle */}
                        <motion.div
                          animate={isCurrent ? { scale: [1, 1.12, 1] } : {}}
                          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                          style={{
                            width: '44px', height: '44px', borderRadius: '50%',
                            background: reached ? `${n.color}22` : 'var(--bg-elevated)',
                            border: `2px solid ${reached ? n.color : 'var(--border-subtle)'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '20px',
                            boxShadow: isCurrent ? `0 0 0 6px ${n.color}22, 0 0 18px ${n.color}44` : reached ? `0 0 8px ${n.color}33` : 'none',
                            transition: 'all 0.4s ease',
                          }}
                        >
                          {reached ? n.icon : <span style={{ fontSize: '16px', color: 'var(--text-muted)' }}>○</span>}
                        </motion.div>
                        {/* Label */}
                        <div style={{
                          fontSize: '11px', fontWeight: '700',
                          color: reached ? n.color : 'var(--text-muted)',
                          textTransform: 'uppercase', letterSpacing: '0.8px',
                          textShadow: isCurrent ? `0 0 10px ${n.color}88` : 'none',
                        }}>
                          {n.label}
                        </div>
                        {/* Req label */}
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{n.req} project{n.req > 1 ? 's' : ''}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          <div className="glass-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '14px' }}>
              <h3 style={{ color: 'var(--text-heading)', fontFamily: 'DM Serif Display, serif', fontWeight: '400', margin: 0, fontSize: '20px' }}>🔔 Activity Feed</h3>
              {activityLogs.length > 0 && (
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>{activityLogs.length} events</span>
              )}
            </div>

            {activityLogs.length === 0 && myGrants.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0', fontSize: '15px' }}>
                <div style={{ fontSize: '40px', marginBottom: '10px' }}>📭</div>
                No activity yet. Submit your first application to get started!
              </div>
            ) : activityLogs.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '28px 0', fontSize: '14px' }}>
                Activity will appear here as your grants are reviewed.
              </div>
            ) : (
              <div style={{ position: 'relative', paddingLeft: '32px' }}>

                {/* Vertical spine */}
                <div style={{
                  position: 'absolute', left: '8px', top: '8px',
                  bottom: '8px', width: '2px',
                  background: 'linear-gradient(to bottom, var(--accent-blue), var(--border-subtle) 80%, transparent)',
                  borderRadius: '2px',
                }} />

                {/* Tracing beam glow on spine */}
                <div className="timeline-beam-glow" style={{ left: '7px' }} />

                {activityLogs.map((log, i) => {
                  const act     = log.action?.toUpperCase() || '';
                  const isGood  = ['PHASE 1 APPROVED','FULLY DISBURSED','EVALUATED','PROOF UPLOADED','IMPACT LOGGED','SUBMITTED'].includes(act);
                  const isBad   = ['REJECTED','BLOCKED','BLACKLISTED FILES','BLOCKED UPLOAD'].includes(act);
                  const dotColor = isGood ? 'var(--accent-green)' : isBad ? 'var(--accent-red)' : 'var(--accent-yellow)';
                  // Important events get a highlighted row
                  const isHighlight = ['PHASE 1 APPROVED','FULLY DISBURSED','EVALUATED'].includes(act);
                  const isLast = i === activityLogs.length - 1;

                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05, duration: 0.35, ease: 'easeOut' }}
                      style={{
                        display: 'flex', gap: '0', position: 'relative',
                        marginBottom: isLast ? 0 : '2px',
                      }}
                    >
                      {/* Dot column */}
                      <div style={{ width: '32px', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '14px' }}>
                        {/* Dot */}
                        <motion.div
                          animate={isHighlight ? { scale: [1, 1.3, 1], opacity: [1, 0.7, 1] } : {}}
                          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.3 }}
                          style={{
                            width: isHighlight ? '12px' : '9px',
                            height: isHighlight ? '12px' : '9px',
                            borderRadius: '50%',
                            background: dotColor,
                            boxShadow: `0 0 ${isHighlight ? 12 : 6}px ${dotColor}`,
                            border: isHighlight ? `2px solid ${dotColor}44` : 'none',
                            flexShrink: 0,
                            zIndex: 2,
                            marginLeft: isHighlight ? '-1.5px' : '0',
                          }}
                        />
                      </div>

                      {/* Content row */}
                      <div style={{
                        flex: 1,
                        padding: '12px 14px',
                        marginBottom: '4px',
                        borderRadius: '10px',
                        background: isHighlight
                          ? (isBad ? 'rgba(239,68,68,0.05)' : 'rgba(16,185,129,0.04)')
                          : 'transparent',
                        border: isHighlight
                          ? `1px solid ${dotColor}22`
                          : '1px solid transparent',
                        transition: 'background 0.2s',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                          <div style={{ flex: 1 }}>
                            <span style={{
                              color: dotColor, fontWeight: '800', fontSize: '12px',
                              textTransform: 'uppercase', letterSpacing: '0.6px',
                            }}>
                              {log.action}
                            </span>
                            <span style={{ color: 'var(--text-primary)', fontSize: '13px', marginLeft: '8px', lineHeight: '1.4' }}>
                              {log.details}
                            </span>
                          </div>
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px', flexShrink: 0, fontFamily: 'DM Sans', fontWeight: '500' }}>
                            {log.timestamp?.split(',')[1]?.trim() || log.timestamp}
                          </span>
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '3px' }}>
                          by <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>{log.admin}</span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </>)}

        {activeTab === 'active' && (<>
          {activeGrants.length === 0 ? (
            <div className="glass-card" style={{ textAlign: 'center', padding: '60px' }}>
              <div style={{ fontSize: '46px', marginBottom: '16px' }}>📭</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '16px' }}>No active projects right now.</div>
              <button className="neon-btn" style={{ width: 'auto', marginTop: '24px', padding: '12px 28px' }} onClick={() => setActiveTab('apply')}>Submit New Application</button>
            </div>
          ) : activeGrants.map(grant => {
            const isPhase1  = grant.status === 'Phase 1 Approved';
            const isReview  = grant.status === 'Awaiting Review';
            const isFull    = grant.status === 'Fully Disbursed';
            const isBlocked = grant.status === 'Blocked';
            const si        = STATUS_ICON[grant.status] || {};
            const draft     = proofDrafts[grant.id] || { vendor: '', category: 'Hardware', customCategory: '', amount: '', gst: '', images: [] };
            const imp       = impactState[grant.id]  || {};
            const allProofs = grant.proofs || [];
            
            const loggedAmount = getLoggedTotal(allProofs);
            const disbursed = grant.disbursedAmount || 0;
            const trackerPct = disbursed > 0 ? Math.min(100, (loggedAmount / disbursed) * 100) : 0;
            const remainingBudget = disbursed - loggedAmount;
            
            const draftAmountNum = Number(draft.amount || 0);
            const willExceed = draftAmountNum > remainingBudget;
            const isNegative = draftAmountNum <= 0 && draft.amount !== '';
            const canSave = draft.vendor && draft.amount && draft.images?.length > 0 && !willExceed && !isNegative;

            return (
              <div key={grant.id} className="glass-card" style={{ borderLeft: `5px solid ${si.color || 'var(--accent-yellow)'}`, marginBottom: '28px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                  <div>
                    <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-heading)', fontSize: '20px' }}>{grant.type} Project</h3>
                    <span style={{ background: 'var(--bg-elevated)', color: si.color, border: `1px solid ${si.color}55`, fontSize: '13px', fontWeight: '800', padding: '5px 14px', borderRadius: '20px', letterSpacing: '0.5px' }}>{si.icon} {grant.status}</span>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '8px' }}>{si.msg}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '26px', fontWeight: '800', color: 'var(--text-heading)' }}>₹{grant.amount.toLocaleString()}</div>
                    <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Total Budget</span>
                  </div>
                </div>

                <div style={{ background: 'var(--bg-elevated)', padding: '16px', borderRadius: '12px', marginBottom: '24px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: '800' }}>Released</div>
                      <div style={{ fontSize: '26px', color: 'var(--accent-blue)', fontWeight: '800' }}>₹{disbursed.toLocaleString()}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: '800' }}>In Grant</div>
                      <div style={{ fontSize: '22px', color: isFull ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: '800' }}>₹{(grant.amount - disbursed).toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="score-bar-track">
                    <div style={{ height: '100%', width: `${(disbursed / grant.amount) * 100}%`, background: 'linear-gradient(90deg, var(--accent-blue), var(--accent-purple))', borderRadius: '4px', transition: 'width 0.5s' }}></div>
                  </div>
                </div>

                {isBlocked && (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#ef4444', fontWeight: '700', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                    <div style={{ fontSize: '28px', marginBottom: '10px' }}>🛑</div>
                    <div style={{ fontSize: '20px', marginBottom: '6px' }}>Account Temporarily Frozen</div>
                    <div style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: '500', maxWidth: '400px', margin: '0 auto' }}>Your grant is currently under administrative investigation for suspected metadata anomalies or policy violations. Check your email for details.</div>
                  </div>
                )}

                {isPhase1 && (
                  <div className="bg-warn-panel" style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h4 style={{ margin: 0, fontSize: '16px', color: 'var(--accent-yellow)' }}>📸 Expense Log</h4>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Add all expenses, then submit to admin</span>
                    </div>

                    {/* ── Financial Accountability — animated ring ── */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '14px', padding: '18px 20px', marginBottom: '20px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: '700', marginBottom: '6px' }}>Financial Accountability</div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                          You have logged <strong style={{ color: trackerPct >= 80 ? 'var(--accent-green)' : 'var(--accent-yellow)' }}>₹{loggedAmount.toLocaleString()}</strong> of your <strong>₹{disbursed.toLocaleString()}</strong> released funds.
                        </div>
                        {/* Mini progress bar */}
                        <div style={{ height: '4px', background: 'var(--bg-elevated)', borderRadius: '4px', marginTop: '10px', overflow: 'hidden' }}>
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${trackerPct}%` }}
                            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
                            style={{ height: '100%', background: trackerPct >= 80 ? 'var(--accent-green)' : 'var(--accent-yellow)', borderRadius: '4px', boxShadow: `0 0 8px ${trackerPct >= 80 ? 'var(--accent-green)' : 'var(--accent-yellow)'}88` }}
                          />
                        </div>
                      </div>
                      {/* Large animated SVG ring */}
                      <div style={{ position: 'relative', width: '80px', height: '80px', flexShrink: 0 }}>
                        <svg width="80" height="80" viewBox="0 0 80 80" style={{ transform: 'rotate(-90deg)' }}>
                          {/* Track */}
                          <circle cx="40" cy="40" r="32" fill="none" stroke="var(--border-subtle)" strokeWidth="6" />
                          {/* Animated fill */}
                          <motion.circle
                            cx="40" cy="40" r="32"
                            fill="none"
                            stroke={trackerPct >= 80 ? 'var(--accent-green)' : trackerPct >= 40 ? 'var(--accent-yellow)' : 'var(--accent-red)'}
                            strokeWidth="6"
                            strokeLinecap="round"
                            strokeDasharray={`${2 * Math.PI * 32}`}
                            initial={{ strokeDashoffset: 2 * Math.PI * 32 }}
                            animate={{ strokeDashoffset: 2 * Math.PI * 32 * (1 - trackerPct / 100) }}
                            transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
                            style={{ filter: `drop-shadow(0 0 6px ${trackerPct >= 80 ? '#10b981' : trackerPct >= 40 ? '#fbbf24' : '#ef4444'}88)` }}
                          />
                        </svg>
                        {/* Centre text */}
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontFamily: 'DM Serif Display, serif', fontSize: '18px', color: trackerPct >= 80 ? 'var(--accent-green)' : trackerPct >= 40 ? 'var(--accent-yellow)' : 'var(--accent-red)', lineHeight: 1 }}>
                            {Math.round(trackerPct)}
                          </span>
                          <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: '700', letterSpacing: '0.5px' }}>%</span>
                        </div>
                      </div>
                    </div>

                    {allProofs.length > 0 && (
                      <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {allProofs.map((proof, idx) => {
                          const amtMatch = proof.description.match(/Amt:\s*₹(\d+)/);
                          const amt = amtMatch ? `₹${parseInt(amtMatch[1]).toLocaleString()}` : 'N/A';
                          return (
                            <div key={idx} style={{ background: 'var(--bg-elevated)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                  <div style={{ color: 'var(--text-primary)', fontWeight: '700', fontSize: '15px' }}>{proof.description.split('|')[0] || "Saved Expense"}</div>
                                  <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px', fontFamily: 'DM Sans' }}>{proof.description}</div>
                                </div>
                                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                                  <div style={{ color: 'var(--accent-green)', fontWeight: '800', fontSize: '16px' }}>{amt}</div>
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <span style={{ background: 'var(--bg-info-panel)', color: 'var(--accent-green)', fontSize: '10px', fontWeight: '800', padding: '2px 8px', borderRadius: '8px', border: '1px solid var(--border-info-panel)' }}>✓ Saved</span>
                                    <button onClick={() => deleteExpenseEntry(grant.id, idx)} style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: '10px', fontWeight: '800', padding: '2px 8px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer' }} title="Delete this entry">🗑</button>
                                  </div>
                                </div>
                              </div>
                              {proof.images?.length > 0 && (
                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '10px' }}>
                                  {proof.images.map((src, i) => {
                                    const isPdf = src.startsWith('data:application/pdf');
                                    return isPdf ? (
                                      <div key={i} onClick={() => setEnlargedImage(src)} style={{ width: '70px', height: '70px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', cursor: 'pointer' }}>📄</div>
                                    ) : (
                                      <img key={i} src={src} onClick={() => setEnlargedImage(src)} alt="" style={{ width: '70px', height: '70px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border-subtle)', cursor: 'pointer' }} />
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="bg-dashed" style={{ marginBottom: '16px' }}>
                      <div style={{ fontSize: '15px', color: 'var(--accent-yellow)', fontWeight: '800', marginBottom: '16px' }}>+ Add New Expense Entry</div>
                      
                      <div className="ledger-grid">
                        <div className="full-width">
                          <label className="input-label" style={{fontSize:'11px'}}>VENDOR / PAYEE NAME</label>
                          <input className="dark-input" placeholder="e.g. Dell Official Store" value={draft.vendor} onChange={e => updateProofDraft(grant.id, 'vendor', e.target.value)} />
                        </div>
                        <div>
                          <label className="input-label" style={{fontSize:'11px'}}>CATEGORY</label>
                          <select className="dark-input" value={draft.category} onChange={e => updateProofDraft(grant.id, 'category', e.target.value)}>
                            {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          {draft.category === 'Other' && (
                            <input className="dark-input" style={{ marginTop: '8px' }} placeholder="Specify category..." value={draft.customCategory || ''} onChange={e => updateProofDraft(grant.id, 'customCategory', e.target.value)} />
                          )}
                        </div>
                        <div>
                          <label className="input-label" style={{fontSize:'11px'}}>AMOUNT (₹)</label>
                          <input className="dark-input" type="number" placeholder="12000" min="1" value={draft.amount} onChange={e => updateProofDraft(grant.id, 'amount', e.target.value)} style={{ borderColor: willExceed ? '#ef4444' : '' }} />
                          {willExceed && <div style={{ color: '#ef4444', fontSize: '10px', marginTop: '4px', fontWeight: '700' }}>⚠️ Exceeds remaining ₹{remainingBudget.toLocaleString()}</div>}
                          {isNegative && <div style={{ color: '#ef4444', fontSize: '10px', marginTop: '4px', fontWeight: '700' }}>⚠️ Amount must be positive</div>}
                        </div>
                        <div className="full-width">
                          <label className="input-label" style={{fontSize:'11px'}}>GST / TAX ID (Optional)</label>
                          <input className="dark-input" placeholder="e.g. 29GGGGG1314R9Z6" value={draft.gst} onChange={e => updateProofDraft(grant.id, 'gst', e.target.value)} />
                        </div>
                      </div>

                      <label className="input-label" style={{fontSize:'11px', marginTop: '8px'}}>UPLOAD RECEIPT (Multiple allowed)</label>
                      {/* Styled drop zone — wraps hidden file input */}
                      <label htmlFor={`file-drop-${grant.id}`} style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        gap: '8px', padding: '22px 16px', marginBottom: '14px',
                        border: `2px dashed ${draft.images?.length > 0 ? 'var(--accent-blue)' : 'var(--border-subtle)'}`,
                        borderRadius: '12px',
                        background: draft.images?.length > 0 ? 'rgba(79,156,249,0.04)' : 'var(--bg-input)',
                        cursor: 'pointer', transition: 'all 0.2s ease',
                        ':hover': { borderColor: 'var(--accent-blue)' },
                      }}
                      onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--accent-blue)'; e.currentTarget.style.background = 'rgba(79,156,249,0.06)'; }}
                      onDragLeave={e => { e.currentTarget.style.borderColor = draft.images?.length > 0 ? 'var(--accent-blue)' : 'var(--border-subtle)'; e.currentTarget.style.background = draft.images?.length > 0 ? 'rgba(79,156,249,0.04)' : 'var(--bg-input)'; }}
                      onDrop={e => { e.preventDefault(); handleProofImages(grant.id, e.dataTransfer.files); e.currentTarget.style.borderColor = 'var(--accent-blue)'; }}
                      >
                        <motion.div
                          animate={{ y: [0, -4, 0] }}
                          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                          style={{ fontSize: '28px' }}
                        >
                          {draft.images?.length > 0 ? '✅' : '📎'}
                        </motion.div>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: draft.images?.length > 0 ? 'var(--accent-blue)' : 'var(--text-secondary)' }}>
                          {draft.images?.length > 0 ? `${draft.images.length} file${draft.images.length > 1 ? 's' : ''} selected` : 'Drop files here or click to browse'}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>JPG, PNG, PDF · Max 5MB each</div>
                        <input id={`file-drop-${grant.id}`} type="file" accept="image/jpeg, image/png, application/pdf" multiple onChange={e => handleProofImages(grant.id, e.target.files)} style={{ display: 'none' }} />
                      </label>
                      
                      {draft.images?.length > 0 && (
                        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '16px' }}>
                          {draft.images.map((src, i) => {
                            const isPdf = src.startsWith('data:application/pdf');
                            return (
                              <div key={i} style={{ position: 'relative', width: '70px', height: '70px' }}>
                                {isPdf ? (
                                  <div onClick={() => setEnlargedImage(src)} style={{ width: '100%', height: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', cursor: 'zoom-in' }} title="Click to view PDF">📄</div>
                                ) : (
                                  <>
                                    <img src={src} onClick={() => setEnlargedImage(src)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border-subtle)', cursor: 'zoom-in' }} title="Click to view image" />
                                    <button onClick={() => setCropModal({ isOpen: true, grantId: grant.id, imageIndex: i, src })} style={{ position: 'absolute', top: '-6px', right: '-6px', background: 'var(--accent-blue)', color: 'white', border: 'none', borderRadius: '50%', width: '24px', height: '24px', fontSize: '12px', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.5)' }} title="Crop this image">✂️</button>
                                  </>
                                )}
                                <button onClick={() => {
                                  const newImages = [...draft.images]; newImages.splice(i, 1);
                                  updateProofDraft(grant.id, 'images', newImages);
                                }} style={{ position: 'absolute', bottom: '-4px', right: '-4px', background: 'var(--accent-red)', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Remove file">✖</button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      
                      <button className="neon-btn neon-blue" style={{ width: 'auto', padding: '10px 24px', fontSize: '14px', opacity: canSave ? 1 : 0.5, pointerEvents: canSave ? 'auto' : 'none' }} onClick={() => addExpenseEntry(grant.id)}>
                        💾 Save Ledger Entry
                      </button>
                    </div>

                    {allProofs.length > 0 && (
                      <button className="neon-btn neon-green" onClick={() => submitAllProofs(grant.id, loggedAmount, disbursed)}>
                        ✅ Submit {allProofs.length} Expense{allProofs.length !== 1 ? 's' : ''} to Admin for Review
                      </button>
                    )}
                  </div>
                )}

                {isReview && (
                  <div style={{ position: 'relative', padding: '20px', textAlign: 'center', color: 'var(--accent-yellow)', fontWeight: '700', background: 'var(--bg-warn-panel)', borderRadius: '12px', border: '1px solid var(--border-warn-panel)', overflow: 'hidden' }}>
                    {/* Shimmer sweep */}
                    <motion.div
                      animate={{ x: ['-120%', '120%'] }}
                      transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut', repeatDelay: 1.2 }}
                      style={{
                        position: 'absolute', inset: 0,
                        background: 'linear-gradient(105deg, transparent 30%, rgba(251,191,36,0.12) 50%, transparent 70%)',
                        pointerEvents: 'none',
                      }}
                    />
                    {/* Pulsing dot */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '6px' }}>
                      <motion.div
                        animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
                        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                        style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--accent-yellow)', boxShadow: '0 0 10px var(--accent-yellow)' }}
                      />
                      <span style={{ fontSize: '17px' }}>Proofs submitted — Admin is reviewing</span>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500' }}>{allProofs.length} expense entr{allProofs.length !== 1 ? 'ies' : 'y'} under review</div>
                  </div>
                )}

                {isFull && (
                  <div style={{ background: 'var(--bg-info-panel)', border: '1px solid var(--border-info-panel)', padding: '20px', borderRadius: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                      <span style={{ fontSize: '20px' }}>🚀</span>
                      <h4 style={{ margin: 0, fontSize: '16px', color: 'var(--accent-blue)' }}>Submit Final Impact Report</h4>
                    </div>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '18px' }}>All funds released. Close the project by submitting an outcome report.</p>
                    <input className="dark-input" placeholder="Project outcome (e.g. Built a solar prototype)" value={imp.outcome || ''} onChange={e => updateImpact(grant.id, 'outcome', e.target.value)} />
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <input className="dark-input" type="number" placeholder="KPI (e.g. users reached)" value={imp.metric || ''} onChange={e => updateImpact(grant.id, 'metric', e.target.value)} style={{ flex: 1 }} />
                      <input className="dark-input" placeholder="Deliverable link (GitHub/PDF)" value={imp.link || ''} onChange={e => updateImpact(grant.id, 'link', e.target.value)} style={{ flex: 2 }} />
                    </div>
                    <button className="neon-btn neon-blue" onClick={() => submitImpact(grant.id)}>
                      Submit Evaluation & Close Project
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </>)}

        {activeTab === 'apply' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} style={{ position: 'relative', padding: '2px', borderRadius: '16px', overflow: 'hidden' }}>
            <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none' }}>
              <defs>
                <linearGradient id="apply-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={isDarkMode ? "var(--accent-blue)" : "#3b82f6"} />
                  <stop offset="50%" stopColor={isDarkMode ? "var(--accent-purple)" : "#34d399"} />
                  <stop offset="100%" stopColor={isDarkMode ? "var(--accent-blue)" : "#3b82f6"} />
                </linearGradient>
              </defs>
              <rect x="0" y="0" width="100%" height="100%" rx="16" ry="16" fill="none" stroke="url(#apply-grad)" strokeWidth="4" strokeLinecap="round" pathLength="100" strokeDasharray="25 75" className="svg-border-trace" />
            </svg>
            
            <div style={{ position: 'relative', zIndex: 1, background: 'var(--bg-surface)', borderRadius: '14px', padding: '30px' }}>
              {reapplyFrom && (
                <div className="bg-info-panel" style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ color: 'var(--accent-blue)', fontWeight: '800', fontSize: '15px' }}>🔁 Reapplying from rejected grant</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>Original: {reapplyFrom.type} · ₹{reapplyFrom.amount.toLocaleString()} · "{reapplyFrom.note || 'No reason given'}"</div>
                  </div>
                  <button onClick={() => { setReapplyFrom(null); setAmount(''); setCreditScore(''); setType('Research'); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '24px' }}>×</button>
                </div>
              )}

              <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                <h2 style={{ color: 'var(--text-heading)', margin: 0, fontSize: '24px' }}>{reapplyFrom ? '🔁 Submit Revised Application' : '📝 Request Initial Funding'}</h2>
              </div>

              <label className="input-label">APPLICANT ALIAS</label>
              <input className="dark-input" value={source} onChange={e => setSource(e.target.value)} />

              <label className="input-label">CREDIT SCORE (300–900)</label>
              <input className="dark-input" type="number" value={creditScore} onChange={e => setCreditScore(e.target.value)} />
              {creditScore && (
                <div style={{ marginBottom: '24px' }}>
                  <div className="score-bar-track"><div style={{ height: '100%', width: eligibility.width, background: eligibility.color, transition: 'width 0.5s ease-in-out', boxShadow: `0 0 10px ${eligibility.color}` }}></div></div>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: eligibility.color }}>{eligibility.msg}</div>
                </div>
              )}

              <label className="input-label">CATEGORY</label>
              <select className="dark-input" value={type} onChange={e => setType(e.target.value)}>
                {STANDARD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                <option value="Other">Other (Specify)</option>
              </select>
              {type === 'Other' && <input className="dark-input" placeholder="Type category..." value={customType} onChange={e => setCustomType(e.target.value)} />}

              <label className="input-label">TOTAL AMOUNT NEEDED (₹)</label>
              <input
                className="dark-input"
                type="number"
                placeholder="e.g. 25000"
                min="1"
                value={amount}
                onChange={e => { setAmount(e.target.value); setAmountError(''); }}
                style={{
                  borderColor: (amountError || applyIsNegative || applyExceedsLimit) ? '#ef4444' : undefined,
                  marginBottom: (amountError || applyIsNegative || applyExceedsLimit) ? '6px' : undefined,
                }}
              />
              {(amountError || applyIsNegative) && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', color: '#ef4444', fontWeight: '600', marginBottom: '16px', padding: '9px 13px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px' }}
                >
                  ⚠️ {amountError || 'Amount must be greater than ₹0'}
                </motion.div>
              )}
              {applyExceedsLimit && !applyIsNegative && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', color: '#f59e0b', fontWeight: '600', marginBottom: '16px', padding: '9px 13px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '8px' }}
                >
                  ⚠️ Exceeds your credit tier limit of ₹{eligibility.limit.toLocaleString()}
                </motion.div>
              )}

              {/* Toggle switch for bypass */}
              <div
                onClick={() => setBypassMode(!bypassMode)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px', padding: '14px 18px', background: 'var(--bg-warn-panel)', borderRadius: '10px', border: '1px solid var(--border-warn-panel)', cursor: 'pointer', userSelect: 'none' }}
              >
                <label style={{ fontSize: '14px', color: 'var(--accent-yellow)', cursor: 'pointer', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🔓 Bypass Validation
                </label>
                {/* Pill toggle */}
                <div style={{
                  width: '44px', height: '24px', borderRadius: '12px', position: 'relative',
                  background: bypassMode ? 'var(--accent-yellow)' : 'var(--bg-elevated)',
                  border: `1px solid ${bypassMode ? 'var(--accent-yellow)' : 'var(--border-subtle)'}`,
                  transition: 'all 0.25s ease',
                  boxShadow: bypassMode ? '0 0 10px rgba(251,191,36,0.4)' : 'none',
                  flexShrink: 0,
                }}>
                  <motion.div
                    animate={{ x: bypassMode ? 22 : 2 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    style={{
                      position: 'absolute', top: '3px',
                      width: '16px', height: '16px', borderRadius: '50%',
                      background: bypassMode ? 'var(--bg-base)' : 'var(--text-muted)',
                    }}
                  />
                </div>
              </div>

              {/* Gradient submit button — disabled when form invalid */}
              <motion.button
                whileHover={{ scale: applyFormValid ? 1.02 : 1, boxShadow: applyFormValid ? '0 8px 32px rgba(37,99,235,0.45)' : 'none' }}
                whileTap={{ scale: applyFormValid ? 0.98 : 1 }}
                onClick={applyFormValid ? addGrant : undefined}
                style={{
                  width: '100%', padding: '15px 24px', borderRadius: '10px',
                  background: applyFormValid
                    ? 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)'
                    : 'var(--bg-elevated)',
                  border: applyFormValid ? 'none' : '1px solid var(--border-subtle)',
                  color: applyFormValid ? 'white' : 'var(--text-muted)',
                  fontSize: '15px', fontWeight: '700',
                  cursor: applyFormValid ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                  fontFamily: 'DM Sans, sans-serif',
                  boxShadow: applyFormValid ? '0 4px 20px rgba(37,99,235,0.35)' : 'none',
                  opacity: applyFormValid ? 1 : 0.55,
                  position: 'relative', overflow: 'hidden',
                  transition: 'all 0.2s ease',
                }}
              >
                {/* Shine on hover */}
                <motion.div
                  initial={{ x: '-100%', opacity: 0 }}
                  whileHover={{ x: '100%', opacity: 1 }}
                  transition={{ duration: 0.5 }}
                  style={{ position: 'absolute', inset: 0, background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.12) 50%, transparent 70%)', pointerEvents: 'none' }}
                />
                <span style={{ fontSize: '18px' }}>🔐</span>
                {reapplyFrom ? '🔁 Submit Revised Application' : 'Submit Secure Application'}
              </motion.button>
            </div>
          </motion.div>
        )}

        {activeTab === 'history' && (
          <div className="glass-card">
            <h3 style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '18px', marginBottom: '20px', color: 'var(--text-heading)', fontWeight: '800', fontSize:'22px' }}>📂 Request History</h3>
            {myGrants.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '50px', fontSize:'16px' }}>
                No records yet.
                <button className="neon-btn" style={{ width: 'auto', marginTop: '20px', padding: '12px 28px', display: 'block', margin: '20px auto 0' }} onClick={() => setActiveTab('apply')}>Submit First Application</button>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ textAlign: 'left' }}>
                      <th className="table-header" style={{ paddingLeft: '16px' }}>Date</th>
                      <th className="table-header">Category</th>
                      <th className="table-header">Requested</th>
                      <th className="table-header">Received</th>
                      <th className="table-header">Status</th>
                      <th className="table-header">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myGrants.map((g, i) => {
                      const isApproved = g.status === 'Evaluated' || g.status === 'Fully Disbursed';
                      const isRejected = g.status === 'Rejected' || g.status === 'Blocked';
                      const rowBg = isApproved ? 'rgba(16,185,129,0.03)' : isRejected ? 'rgba(239,68,68,0.03)' : 'transparent';
                      const rowBorder = isApproved ? 'rgba(16,185,129,0.2)' : isRejected ? 'rgba(239,68,68,0.2)' : 'transparent';
                      const disbursed = g.disbursedAmount || 0;
                      const pct = g.amount > 0 ? Math.round((disbursed / g.amount) * 100) : 0;

                      return (
                        <motion.tr
                          key={g.id}
                          initial={{ opacity: 0, x: -20 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true, margin: '-20px' }}
                          transition={{ duration: 0.35, delay: i < 6 ? i * 0.07 : 0, ease: 'easeOut' }}
                          className="table-row"
                          style={{ borderLeft: `3px solid ${rowBorder}`, background: rowBg }}
                        >
                          {/* Date */}
                          <td style={{ padding: '16px 14px 16px 16px', color: 'var(--text-muted)', fontSize: '13px', whiteSpace: 'nowrap' }}>{g.date}</td>

                          {/* Category tag */}
                          <td style={{ padding: '16px 14px' }}>
                            <span className={`category-tag ${getTagClass(g.type)}`}>{g.type}</span>
                          </td>

                          {/* Requested amount */}
                          <td style={{ padding: '16px 14px', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'DM Serif Display, serif', fontSize: '16px' }}>
                            ₹{g.amount.toLocaleString()}
                          </td>

                          {/* Disbursed + mini bar */}
                          <td style={{ padding: '16px 14px', minWidth: '110px' }}>
                            <div style={{ color: disbursed > 0 ? 'var(--accent-green)' : 'var(--text-muted)', fontWeight: '700', fontSize: '14px', marginBottom: '5px' }}>
                              {disbursed > 0 ? `₹${disbursed.toLocaleString()}` : '—'}
                            </div>
                            {g.amount > 0 && (
                              <div style={{ height: '3px', background: 'var(--border-subtle)', borderRadius: '3px', overflow: 'hidden', width: '80px' }}>
                                <motion.div
                                  initial={{ width: 0 }}
                                  whileInView={{ width: `${pct}%` }}
                                  viewport={{ once: true }}
                                  transition={{ duration: 0.9, delay: i * 0.07 + 0.2, ease: 'easeOut' }}
                                  style={{ height: '100%', background: isApproved ? 'var(--accent-green)' : 'var(--accent-blue)', borderRadius: '3px' }}
                                />
                              </div>
                            )}
                            {pct > 0 && <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px', fontWeight: '600' }}>{pct}% released</div>}
                          </td>

                          {/* Status + note */}
                          <td style={{ padding: '16px 14px' }}>
                            <span className={`status-badge status-${isApproved ? 'Approved' : isRejected ? 'Rejected' : 'Pending'}`}>{g.status}</span>
                            {g.status === 'Blocked' && <div style={{ marginTop: '5px', fontSize: '11px', color: '#ef4444', fontWeight: '700' }}>⚠️ Under Investigation</div>}
                            {g.status === 'Rejected' && g.note && (
                              <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--accent-red)', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '7px', padding: '5px 10px', maxWidth: '220px', lineHeight: '1.4' }}>
                                📝 {g.note}
                              </div>
                            )}
                          </td>

                          {/* Actions */}
                          <td style={{ padding: '16px 14px' }}>
                            <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
                              {g.status === 'Pending' && (
                                <SpringTooltip text="Edit this application">
                                  <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => openEdit(g)} style={{ background: 'var(--bg-info-panel)', color: 'var(--accent-blue)', border: '1px solid var(--border-info-panel)', borderRadius: '7px', padding: '5px 12px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>✏️ Edit</motion.button>
                                </SpringTooltip>
                              )}
                              {g.status === 'Pending' && (
                                <SpringTooltip text="Withdraw this application">
                                  <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => cancelGrant(g.id)} style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--accent-red)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '7px', padding: '5px 12px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>🗑 Cancel</motion.button>
                                </SpringTooltip>
                              )}
                              {g.status === 'Rejected' && (
                                <SpringTooltip text="Submit revised version">
                                  <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => prefillReapply(g)} style={{ background: 'rgba(16,185,129,0.08)', color: 'var(--accent-green)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '7px', padding: '5px 12px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>🔁 Reapply</motion.button>
                                </SpringTooltip>
                              )}
                              {g.status === 'Evaluated' && (
                                <SpringTooltip text="Download Certificate">
                                  <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => generateCertificate(g)} style={{ background: 'rgba(139,92,246,0.08)', color: 'var(--accent-purple)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: '7px', padding: '5px 12px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>📜 Certificate</motion.button>
                                </SpringTooltip>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {cropModal.isOpen && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ zIndex: 9999 }}>
            <motion.div className="glass-modal-content" initial={{ scale: 0.9 }} animate={{ scale: 1 }} style={{ maxWidth: '600px', textAlign: 'center' }}>
              <h3 style={{ color: 'var(--text-heading)', margin: '0 0 16px 0' }}>✂️ Freeform Crop</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px' }}>Drag the edges to select exactly what you want to keep.</p>
              
              <div style={{ background: '#000', padding: '10px', borderRadius: '8px', marginBottom: '20px' }}>
                <ReactCrop crop={crop} onChange={c => setCrop(c)} onComplete={c => setCompletedCrop(c)}>
                  <img ref={imgRef} src={cropModal.src} alt="Upload" style={{ maxHeight: '50vh', objectFit: 'contain' }} />
                </ReactCrop>
              </div>

              <div style={{ display: 'flex', gap: '14px' }}>
                <button className="neon-btn neon-blue" style={{ flex: 1 }} onClick={saveCroppedImage}>Apply Crop & Save</button>
                <button onClick={() => setCropModal({ isOpen: false, grantId: null, imageIndex: null, src: null })} style={{ flex: 1, background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', borderRadius: '10px', cursor: 'pointer', fontWeight: '700' }}>Cancel</button>
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

      {editingGrant && (() => {
        const editElig       = getEligibilityInfo(editScore);
        const editAmtNum     = parseInt(editAmount) || 0;
        const editIsNegative = editAmount !== '' && editAmtNum <= 0;
        const editExceeds    = editAmount !== '' && editAmtNum > 0 && editAmtNum > editElig.limit && editElig.limit > 0;
        const editValid      = !!(editSource && editAmount && editScore && !editIsNegative && !editExceeds);

        return (
          <motion.div className="modal-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className="glass-modal-content"
              style={{ maxWidth: '500px' }}
              initial={{ scale: 0.93, opacity: 0, y: 20 }}
              animate={{ scale: 1,    opacity: 1, y: 0  }}
              exit={{    scale: 0.93, opacity: 0, y: 12 }}
              transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ color: 'var(--text-heading)', margin: 0, fontSize: '24px' }}>✏️ Edit Application</h2>
                <button onClick={() => { setEditingGrant(null); setEditAmountError(''); }} style={{ background: 'none', border: 'none', fontSize: '32px', color: 'var(--text-muted)', cursor: 'pointer' }}>×</button>
              </div>
              <div style={{ background: 'var(--bg-info-panel)', border: '1px solid var(--border-info-panel)', borderRadius: '10px', padding: '12px 16px', marginBottom: '24px', fontSize: '14px', color: 'var(--accent-blue)' }}>
                You can only edit applications that are still Pending review.
              </div>

              <label className="input-label">APPLICANT ALIAS</label>
              <input className="dark-input" value={editSource} onChange={e => setEditSource(e.target.value)} />

              <label className="input-label">CREDIT SCORE (300–900)</label>
              <input className="dark-input" type="number" value={editScore} onChange={e => { setEditScore(e.target.value); setEditAmountError(''); }} />
              {editScore && (
                <div style={{ marginBottom: '16px' }}>
                  <div className="score-bar-track">
                    <div style={{ height: '100%', width: editElig.width, background: editElig.color, transition: 'width 0.5s ease-in-out', boxShadow: `0 0 8px ${editElig.color}` }} />
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: editElig.color }}>{editElig.msg}</div>
                </div>
              )}

              <label className="input-label">CATEGORY</label>
              <select className="dark-input" value={editType} onChange={e => setEditType(e.target.value)}>
                {STANDARD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                <option value="Other">Other</option>
              </select>

              <label className="input-label">AMOUNT (₹)</label>
              <input
                className="dark-input"
                type="number"
                placeholder="e.g. 25000"
                min="1"
                value={editAmount}
                onChange={e => { setEditAmount(e.target.value); setEditAmountError(''); }}
                style={{
                  borderColor: (editAmountError || editIsNegative || editExceeds) ? '#ef4444' : undefined,
                  marginBottom: (editAmountError || editIsNegative || editExceeds) ? '6px' : undefined,
                }}
              />
              {(editAmountError || editIsNegative) && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', color: '#ef4444', fontWeight: '600', marginBottom: '16px', padding: '9px 13px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px' }}
                >
                  ⚠️ {editAmountError || 'Amount must be greater than ₹0'}
                </motion.div>
              )}
              {editExceeds && !editIsNegative && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', color: '#f59e0b', fontWeight: '600', marginBottom: '16px', padding: '9px 13px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '8px' }}
                >
                  ⚠️ Exceeds credit tier limit of ₹{editElig.limit.toLocaleString()} for score {editScore}
                </motion.div>
              )}

              <div style={{ display: 'flex', gap: '14px', marginTop: '12px' }}>
                <motion.button
                  whileHover={{ scale: editValid ? 1.02 : 1 }}
                  whileTap={{ scale: editValid ? 0.98 : 1 }}
                  onClick={editValid ? saveEdit : undefined}
                  style={{
                    flex: 1, padding: '13px', borderRadius: '10px', fontWeight: '700',
                    fontSize: '14px', fontFamily: 'DM Sans, sans-serif', cursor: editValid ? 'pointer' : 'not-allowed',
                    background: editValid ? 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)' : 'var(--bg-elevated)',
                    border: editValid ? 'none' : '1px solid var(--border-subtle)',
                    color: editValid ? 'white' : 'var(--text-muted)',
                    opacity: editValid ? 1 : 0.55,
                    boxShadow: editValid ? '0 4px 16px rgba(37,99,235,0.3)' : 'none',
                    transition: 'all 0.2s ease',
                  }}
                >
                  Save Changes
                </motion.button>
                <button
                  onClick={() => { setEditingGrant(null); setEditAmountError(''); }}
                  style={{ flex: 1, background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '15px' }}
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        );
      })()}
    </div>
  );
}