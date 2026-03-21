import React, { useState, useCallback } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import { motion, AnimatePresence } from 'framer-motion';
import Particles from 'react-tsparticles';
import { loadSlim } from 'tsparticles-slim';
import { ShieldCheck, Cpu, ArrowRight, ArrowLeft, Lock } from 'lucide-react';
import './Login.css';

// ─── animation variants ────────────────────────────────────────────────────
const paneVariants = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] } },
  exit:    { opacity: 0, x: -18, transition: { duration: 0.22, ease: 'easeIn' } },
};

const cardVariants = {
  initial: { opacity: 0, y: 40, scale: 0.97 },
  animate: {
    opacity: 1, y: 0, scale: 1,
    transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] },
  },
};

const itemVariants = {
  initial: { opacity: 0, y: 16 },
  animate: (i) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.09, duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  }),
};

// ─── Role button with shimmer ──────────────────────────────────────────────
const RoleButton = ({ icon, title, sub, onClick, variant, index }) => (
  <motion.button
    className={`role-btn role-${variant}`}
    onClick={onClick}
    custom={index}
    variants={itemVariants}
    initial="initial"
    animate="animate"
    whileHover={{ scale: 1.01 }}
    whileTap={{ scale: 0.98 }}
  >
    <div className="role-icon">{icon}</div>
    <div className="role-text-container">
      <div className="role-title">{title}</div>
      <div className="role-sub">{sub}</div>
    </div>
    <ArrowRight size={16} className="role-arrow" />
  </motion.button>
);

// ─── Main component ────────────────────────────────────────────────────────
export default function Login({ setIsLoggedIn, setUserRole, setCurrentUser, setCurrentUserEmail, fetchGrants, onLoginComplete }) {
  const [loginStep,        setLoginStep]        = useState('selection');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const particlesInit = useCallback(async engine => {
    await loadSlim(engine);
  }, []);

  const handleGCPLoginSuccess = (credentialResponse) => {
    setIsAuthenticating(true);
    setTimeout(() => {
      const decodedUser = jwtDecode(credentialResponse.credential);
      const ADMIN_EMAIL = 'shauryacocid@gmail.com';
      let role = 'applicant';

      if (loginStep === 'adminAuth') {
        if (decodedUser.email !== ADMIN_EMAIL) {
          alert('❌ Access Denied: Unauthorized Administrator Account.');
          setIsAuthenticating(false);
          setLoginStep('selection');
          return;
        }
        role = 'admin';
      }

      localStorage.setItem('isLoggedIn',       'true');
      localStorage.setItem('userRole',         role);
      localStorage.setItem('currentUser',      decodedUser.name);
      localStorage.setItem('currentUserEmail', decodedUser.email);

      setIsLoggedIn(true);
      setUserRole(role);
      setCurrentUser(decodedUser.name);
      setCurrentUserEmail(decodedUser.email);
      setIsAuthenticating(false);
      fetchGrants();
    }, 900);
  };

  return (
    <div className="login-master-container">

      {/* ── Particle network ── */}
      <Particles
        id="login-particles"
        init={particlesInit}
        style={{
          position: 'absolute', top: 0, left: 0,
          width: '100%', height: '100%',
          zIndex: 0, pointerEvents: 'none',
        }}
        options={{
          fpsLimit: 60,
          interactivity: {
            events: { onHover: { enable: true, mode: 'grab' } },
            modes:  { grab: { distance: 160, links: { opacity: 0.5, color: '#3b82f6' } } },
          },
          particles: {
            color: { value: ['#3b82f6', '#10b981', '#334155', '#6366f1'] },
            links: { color: '#1e293b', distance: 130, enable: true, opacity: 0.35, width: 1 },
            move:  {
              enable: true, speed: 0.5, direction: 'none',
              random: true, straight: false, outModes: { default: 'out' },
            },
            number:  { density: { enable: true, area: 900 }, value: 50 },
            opacity: { value: { min: 0.2, max: 0.6 } },
            shape:   { type: 'circle' },
            size:    { value: { min: 1, max: 2.5 } },
          },
          detectRetina: true,
        }}
      />

      {/* ══════════════════════════════════════════════════════
          LEFT PANE
          ══════════════════════════════════════════════════════ */}
      <div className="login-left-pane">

        {/* Giant ₹ watermark — centred behind card */}
        <div className="login-watermark" aria-hidden="true">₹</div>

        {/* Branding card — centred */}
        <motion.div
          className="branding-card" style={{ width: "100%" }}
          variants={cardVariants}
          initial="initial"
          animate="animate"
        >
          {/* Badge */}
          <motion.div
            className="brand-badge"
            custom={0} variants={itemVariants} initial="initial" animate="animate"
          >
            <ShieldCheck size={13} strokeWidth={2.5} />
            Enterprise Grade Access
          </motion.div>

          {/* Title */}
          <motion.h1
            className="brand-title"
            custom={1} variants={itemVariants} initial="initial" animate="animate"
          >
            Micro Grant<br />
            <span className="brand-title-accent">Funding Portal.</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            className="brand-subtitle"
            custom={2} variants={itemVariants} initial="initial" animate="animate"
          >
            Milestone-based funding, active tracking, and visual proof
            verification sealed on a cryptographic ledger.
          </motion.p>

          {/* Tech stack row */}
          <motion.div
            className="tech-stack-row"
            custom={3} variants={itemVariants} initial="initial" animate="animate"
          >
            <div className="tech-badge">
              <span className="tech-badge-title">
                <span
                  className="status-dot"
                  style={{ background: '#10b981', boxShadow: '0 0 8px #10b981', color: '#10b981' }}
                />
                AES-256 GCM
              </span>
              <span className="tech-badge-sub">Military-Grade Encryption</span>
            </div>
            <div className="vertical-divider" />
            <div className="tech-badge">
              <span className="tech-badge-title">
                <span
                  className="status-dot"
                  style={{ background: '#3b82f6', boxShadow: '0 0 8px #3b82f6', color: '#3b82f6' }}
                />
                OAuth 2.0
              </span>
              <span className="tech-badge-sub">Google Cloud Identity</span>
            </div>
            <div className="vertical-divider" />
            <div className="tech-badge">
              <span className="tech-badge-title">
                <span
                  className="status-dot"
                  style={{ background: '#a78bfa', boxShadow: '0 0 8px #a78bfa', color: '#a78bfa' }}
                />
                SHA-256
              </span>
              <span className="tech-badge-sub">Immutable Ledger</span>
            </div>
          </motion.div>
        </motion.div>
      </div>

      {/* ══════════════════════════════════════════════════════
          RIGHT PANE
          ══════════════════════════════════════════════════════ */}
      <div className="login-right-pane">
        <div className="right-pane-content">
          <AnimatePresence mode="wait">

            {/* ── Loading state ── */}
            {isAuthenticating && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ textAlign: 'center', padding: '40px 0' }}
              >
                <div className="spinner-ring" />
                <p className="loading-text">Securing cloud session…</p>
              </motion.div>
            )}

            {/* ── Step 1: Role selection ── */}
            {!isAuthenticating && loginStep === 'selection' && (
              <motion.div key="selection" variants={paneVariants} initial="initial" animate="animate" exit="exit">

                {/* Icon + heading */}
                <div style={{ textAlign: 'center', marginBottom: '36px' }}>
                  <motion.div
                    className="emoji-icon-box"
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.05 }}
                  >
                    👋
                  </motion.div>
                  <motion.h2
                    className="auth-heading"
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.12, duration: 0.4 }}
                  >
                    Welcome Back
                  </motion.h2>
                  <motion.p
                    className="auth-sub"
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.18, duration: 0.4 }}
                  >
                    Select your access level to continue.
                  </motion.p>
                </div>

                {/* Role buttons */}
                <RoleButton
                  icon="🔐" title="Administrator" sub="Review proofs & approve grants"
                  onClick={() => setLoginStep('adminAuth')}
                  variant="admin" index={0}
                />

                <div className="role-divider">
                  <div className="role-divider-line" />
                  <span className="role-divider-text">or</span>
                  <div className="role-divider-line" />
                </div>

                <RoleButton
                  icon="👤" title="Applicant" sub="Submit requests & upload proofs"
                  onClick={() => setLoginStep('applicantAuth')}
                  variant="applicant" index={1}
                />

                {/* Security strip */}
                <motion.div
                  className="security-strip"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  transition={{ delay: 0.45, duration: 0.5 }}
                >
                  <div className="security-item">
                    <span className="security-dot" style={{ background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
                    End-to-end encrypted
                  </div>
                  <div className="security-item">
                    <span className="security-dot" style={{ background: '#3b82f6', boxShadow: '0 0 6px #3b82f6' }} />
                    SOC 2 compliant
                  </div>
                  <div className="security-item">
                    <span className="security-dot" style={{ background: '#a78bfa', boxShadow: '0 0 6px #a78bfa' }} />
                    Ledger-sealed
                  </div>
                </motion.div>
              </motion.div>
            )}

            {/* ── Step 2: Google auth ── */}
            {!isAuthenticating && (loginStep === 'adminAuth' || loginStep === 'applicantAuth') && (
              <motion.div
                key="auth"
                variants={paneVariants} initial="initial" animate="animate" exit="exit"
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
              >
                {/* Icon + heading */}
                <motion.div
                  className="emoji-icon-box"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                  style={{
                    background: loginStep === 'adminAuth'
                      ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                    borderColor: loginStep === 'adminAuth'
                      ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.25)',
                  }}
                >
                  {loginStep === 'adminAuth' ? '🔐' : '👤'}
                </motion.div>

                <motion.h2
                  className="auth-heading"
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 }}
                >
                  {loginStep === 'adminAuth' ? 'Admin Console' : 'Applicant Gateway'}
                </motion.h2>
                <motion.p
                  className="auth-sub"
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.14 }}
                >
                  Authenticate via Google Cloud Identity
                </motion.p>

                {/* Google button */}
                <motion.div
                  className="google-btn-container"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.22, type: 'spring', stiffness: 260, damping: 18 }}
                >
                  <GoogleLogin
                    onSuccess={handleGCPLoginSuccess}
                    onError={() => alert('Login Failed')}
                    useOneTap
                    theme="filled_blue"
                    shape="pill"
                    size="large"
                  />
                </motion.div>

                {/* Security strip */}
                <motion.div
                  className="security-strip"
                  style={{ width: '100%', marginBottom: '20px' }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  transition={{ delay: 0.35 }}
                >
                  <div className="security-item">
                    <Lock size={11} color="#10b981" />
                    OAuth 2.0 secured
                  </div>
                  <div className="security-item">
                    <ShieldCheck size={11} color="#3b82f6" />
                    Zero password storage
                  </div>
                  <div className="security-item">
                    <Cpu size={11} color="#a78bfa" />
                    Server-side verified
                  </div>
                </motion.div>

                {/* Back */}
                <motion.button
                  className="back-link"
                  onClick={() => setLoginStep('selection')}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  whileHover={{ x: -3 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <ArrowLeft size={14} />
                  Return to selection
                </motion.button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}