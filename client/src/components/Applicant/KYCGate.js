import React, { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { ShieldCheck, Upload, ChevronDown, LogOut } from 'lucide-react';
import Particles from 'react-tsparticles';
import { loadSlim } from 'tsparticles-slim';

const ID_TYPES = [
  'Aadhaar Card',
  'PAN Card',
  'Driving License',
  'Passport',
  'Voter ID (EPIC)',
  'Student ID',
];

const API = 'http://localhost:3001';

// ─── Defined OUTSIDE KYCGate so React never remounts it on parent state change ───
function UploadZone({ label, image, side, onFileSelect, onDrop, onClear }) {
  const inputId = `kyc-file-${side}`;
  const hasImage = Boolean(image);

  const handleClear = (e) => {
    e.preventDefault(); // stop label from re-opening picker
    onClear(side);
  };

  return (
    <div style={{ flex: 1 }}>
      <div style={{
        fontSize: '12px', fontWeight: '700', color: 'rgba(255,255,255,0.4)',
        textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px'
      }}>
        {label}
      </div>

      {/* Input sits outside the label — stable key prevents React from resetting it on re-render */}
      <input
        key={inputId}
        id={inputId}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => onFileSelect(e, side)}
        onClick={e => { e.target.value = null; }}
      />

      <label
        htmlFor={inputId}
        style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: '10px', height: '160px', borderRadius: '14px', cursor: 'pointer',
          border: `2px dashed ${hasImage ? 'rgba(79,156,249,0.7)' : 'rgba(255,255,255,0.12)'}`,
          background: hasImage ? 'rgba(79,156,249,0.08)' : 'rgba(255,255,255,0.03)',
          transition: 'all 0.2s', position: 'relative', overflow: 'hidden',
        }}
        onDragOver={e => e.preventDefault()}
        onDrop={e => onDrop(e, side)}
      >
        {hasImage ? (
          <img
            src={image} alt={label}
            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px' }}
          />
        ) : (
          <>
            <Upload size={24} color="rgba(255,255,255,0.3)" />
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.35)', textAlign: 'center', padding: '0 16px' }}>
              Drop here or click to upload
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)' }}>JPG, PNG · Max 5MB</div>
          </>
        )}
      </label>

      {hasImage && (
        <button
          onClick={handleClear}
          style={{
            marginTop: '8px', background: 'none', border: 'none',
            color: '#ef4444', fontSize: '12px', cursor: 'pointer', fontWeight: '600'
          }}
        >
          ✖ Remove
        </button>
      )}
    </div>
  );
}

export default function KYCGate({ currentUser, currentUserEmail, onSubmitted, handleLogout }) {
  const [idType, setIdType]             = useState('');
  const [frontFile, setFrontFile]       = useState(null);
  const [backFile, setBackFile]         = useState(null);
  const [frontPreview, setFrontPreview] = useState(null);
  const [backPreview, setBackPreview]   = useState(null);
  const [submitting, setSubmitting]     = useState(false);
  const [error, setError]               = useState('');

  const particlesInit = useCallback(async engine => {
    await loadSlim(engine);
  }, []);

  useEffect(() => () => {
    if (frontPreview) URL.revokeObjectURL(frontPreview);
    if (backPreview)  URL.revokeObjectURL(backPreview);
  }, [frontPreview, backPreview]);

  const readFile = (file) => new Promise((res, rej) => {
    if (file.size > 5 * 1024 * 1024) { rej('File must be under 5MB'); return; }
    const reader = new FileReader();
    reader.onloadend = () => res(reader.result);
    reader.onerror  = () => rej('Failed to read file');
    reader.readAsDataURL(file);
  });

  const handleFileSelect = (e, side) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    if (side === 'front') {
      if (frontPreview) URL.revokeObjectURL(frontPreview);
      setFrontFile(file);
      setFrontPreview(previewUrl);
    } else {
      if (backPreview) URL.revokeObjectURL(backPreview);
      setBackFile(file);
      setBackPreview(previewUrl);
    }
    setError('');
    e.target.value = null;
  };

  const handleDrop = (e, side) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    if (side === 'front') {
      if (frontPreview) URL.revokeObjectURL(frontPreview);
      setFrontFile(file);
      setFrontPreview(previewUrl);
    } else {
      if (backPreview) URL.revokeObjectURL(backPreview);
      setBackFile(file);
      setBackPreview(previewUrl);
    }
    setError('');
  };

  const handleClear = (side) => {
    if (side === 'front') {
      if (frontPreview) URL.revokeObjectURL(frontPreview);
      setFrontFile(null);
      setFrontPreview(null);
    } else {
      if (backPreview) URL.revokeObjectURL(backPreview);
      setBackFile(null);
      setBackPreview(null);
    }
  };

  const handleSubmit = async () => {
    if (!idType)    return setError('Please select an ID type.');
    if (!frontFile) return setError('Please upload the front of your ID.');
    if (!backFile)  return setError('Please upload the back of your ID.');
    setSubmitting(true);
    try {
      const [frontImage, backImage] = await Promise.all([readFile(frontFile), readFile(backFile)]);
      await axios.post(`${API}/submit-verification`, {
        email: currentUserEmail, name: currentUser,
        idType, frontImage, backImage,
      });
      onSubmitted();
    } catch (e) {
      setError(typeof e === 'string' ? e : (e.response?.data?.message || 'Submission failed. Please try again.'));
    } finally { setSubmitting(false); }
  };

  const isReady = idType && frontFile && backFile && !submitting;

  return (
    <div style={{
      minHeight: '100vh', background: '#02040a', position: 'relative',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px', fontFamily: 'DM Sans, sans-serif', overflow: 'hidden'
    }}>

      <Particles
        id="kyc-particles"
        init={particlesInit}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none' }}
        options={{
          fpsLimit: 60,
          interactivity: {
            events: { onHover: { enable: true, mode: 'grab' } },
            modes: { grab: { distance: 160, links: { opacity: 0.5, color: '#3b82f6' } } },
          },
          particles: {
            color: { value: ['#3b82f6', '#10b981', '#334155', '#6366f1'] },
            links: { color: '#1e293b', distance: 130, enable: true, opacity: 0.35, width: 1 },
            move: { enable: true, speed: 0.5, direction: 'none', random: true, straight: false, outModes: { default: 'out' } },
            number: { density: { enable: true, area: 900 }, value: 50 },
            opacity: { value: { min: 0.2, max: 0.6 } },
            shape: { type: 'circle' },
            size: { value: { min: 1, max: 2.5 } },
          },
          detectRetina: true,
        }}
      />

      <div style={{ position: 'absolute', width: '55vw', height: '55vw', borderRadius: '50%', top: '-20%', left: '-15%', background: 'radial-gradient(circle, rgba(37,99,235,0.22) 0%, rgba(79,70,229,0.12) 60%, transparent 100%)', filter: 'blur(110px)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'absolute', width: '40vw', height: '40vw', borderRadius: '50%', bottom: '-10%', right: '5%', background: 'radial-gradient(circle, rgba(16,185,129,0.12) 0%, rgba(6,182,212,0.08) 60%, transparent 100%)', filter: 'blur(110px)', pointerEvents: 'none', zIndex: 0 }} />

      <button
        onClick={handleLogout}
        style={{
          position: 'absolute', top: '24px', right: '24px', zIndex: 10,
          display: 'flex', alignItems: 'center', gap: '8px',
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
          color: '#ef4444', padding: '8px 16px', borderRadius: '8px',
          fontSize: '13px', fontWeight: '600', cursor: 'pointer',
          fontFamily: 'DM Sans, sans-serif', transition: 'all 0.2s',
        }}
        onMouseOver={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; }}
        onMouseOut={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
      >
        <LogOut size={14} /> Logout
      </button>

      <motion.div
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{ width: '100%', maxWidth: '540px', position: 'relative', zIndex: 1 }}
      >
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            style={{
              width: '64px', height: '64px', borderRadius: '20px', margin: '0 auto 20px',
              background: 'rgba(79,156,249,0.1)', border: '1px solid rgba(79,156,249,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 32px rgba(79,156,249,0.15)'
            }}
          >
            <ShieldCheck size={28} color="#4f9cf9" />
          </motion.div>
          <h1 style={{ fontFamily: 'DM Serif Display, serif', fontSize: '28px', color: '#f8fafc', margin: '0 0 8px', fontWeight: '400' }}>
            Identity Verification
          </h1>
          <p style={{ color: '#475569', fontSize: '14px', margin: 0, lineHeight: '1.6' }}>
            Before you can apply for grants, we need to verify your identity.<br />
            Upload a valid government-issued ID below.
          </p>
        </div>

        <div style={{
          background: 'rgba(8,14,28,0.55)', border: '1px solid rgba(255,255,255,0.07)',
          borderTop: '1px solid rgba(255,255,255,0.13)', borderRadius: '24px', padding: '32px',
          backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.04), 0 32px 64px -16px rgba(0,0,0,0.7)',
        }}>

          <label style={{
            display: 'block', fontSize: '11px', fontWeight: '700',
            color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase',
            letterSpacing: '0.8px', marginBottom: '8px'
          }}>
            ID Type
          </label>
          <div style={{ position: 'relative', marginBottom: '24px' }}>
            <select
              value={idType}
              onChange={e => setIdType(e.target.value)}
              style={{
                width: '100%', padding: '12px 40px 12px 14px',
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${idType ? 'rgba(79,156,249,0.5)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: '10px',
                color: idType ? '#f8fafc' : 'rgba(255,255,255,0.3)',
                fontSize: '14px', fontFamily: 'DM Sans, sans-serif',
                appearance: 'none', cursor: 'pointer', outline: 'none',
                transition: 'border-color 0.2s'
              }}
            >
              <option value="" disabled style={{ background: '#0f172a' }}>Select your ID type...</option>
              {ID_TYPES.map(t => (
                <option key={t} value={t} style={{ background: '#0f172a', color: '#f8fafc' }}>{t}</option>
              ))}
            </select>
            <ChevronDown size={16} color="rgba(255,255,255,0.3)"
              style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          </div>

          <label style={{
            display: 'block', fontSize: '11px', fontWeight: '700',
            color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase',
            letterSpacing: '0.8px', marginBottom: '12px'
          }}>
            Upload ID — Both Sides
          </label>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
            <UploadZone
              label="Front Side"
              image={frontPreview}
              side="front"
              onFileSelect={handleFileSelect}
              onDrop={handleDrop}
              onClear={handleClear}
            />
            <UploadZone
              label="Back Side"
              image={backPreview}
              side="back"
              onFileSelect={handleFileSelect}
              onDrop={handleDrop}
              onClear={handleClear}
            />
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
              style={{
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: '8px', padding: '10px 14px', marginBottom: '20px',
                fontSize: '13px', color: '#ef4444', fontWeight: '600'
              }}
            >
              ⚠️ {error}
            </motion.div>
          )}

          <motion.button
            whileHover={{ scale: isReady ? 1.02 : 1 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSubmit}
            disabled={!isReady}
            style={{
              width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
              background: isReady ? 'linear-gradient(135deg,#2563eb,#4f46e5)' : 'rgba(255,255,255,0.06)',
              color: isReady ? 'white' : 'rgba(255,255,255,0.25)',
              fontSize: '15px', fontWeight: '700',
              cursor: submitting ? 'wait' : !isReady ? 'not-allowed' : 'pointer',
              fontFamily: 'DM Sans, sans-serif',
              boxShadow: isReady ? '0 4px 20px rgba(37,99,235,0.35)' : 'none',
              transition: 'all 0.2s', opacity: submitting ? 0.7 : 1
            }}
          >
            {submitting ? 'Submitting...' : '🔐 Submit for Verification'}
          </motion.button>

          <p style={{
            textAlign: 'center', fontSize: '12px', color: 'rgba(255,255,255,0.2)',
            marginTop: '16px', lineHeight: '1.5'
          }}>
            Your ID is encrypted and only visible to administrators.<br />
            Verification usually takes under 24 hours.
          </p>
        </div>
      </motion.div>
    </div>
  );
}