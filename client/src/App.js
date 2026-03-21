import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import Login from './components/Login';
import ApplicantDashboard from './components/ApplicantDashboard';
import AdminDashboard from './components/AdminDashboard';
import './App.css';

// ── Branded transition screen shown after login ────────────────────────────
const TransitionScreen = ({ userName, role, onComplete }) => {
  const [progress, setProgress] = useState(0);
  const steps = role === 'admin'
    ? ['Verifying credentials…', 'Loading grant ledger…', 'Syncing audit trail…', 'Entering Admin Console']
    : ['Verifying identity…', 'Loading your grants…', 'Syncing activity feed…', 'Entering Applicant Portal'];

  useEffect(() => {
    let current = 0;
    const interval = setInterval(() => {
      current += 1;
      setProgress(current);
      if (current >= 100) { clearInterval(interval); setTimeout(onComplete, 300); }
    }, 18);
    return () => clearInterval(interval);
  }, [onComplete]);

  const stepIdx = Math.floor((progress / 100) * steps.length);
  const currentStep = steps[Math.min(stepIdx, steps.length - 1)];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.3 }}
      style={{
        position: 'fixed', inset: 0,
        background: '#02040a',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, gap: '32px',
      }}
    >
      {/* Ambient glow */}
      <div style={{ position: 'absolute', width: '40vw', height: '40vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(37,99,235,0.18), transparent)', top: '20%', left: '30%', filter: 'blur(80px)', pointerEvents: 'none' }} />

      {/* Logo mark */}
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.1 }}
        style={{
          width: '72px', height: '72px', borderRadius: '20px',
          background: 'linear-gradient(135deg, rgba(37,99,235,0.3), rgba(79,70,229,0.3))',
          border: '1px solid rgba(79,156,249,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '32px',
          boxShadow: '0 0 40px rgba(37,99,235,0.25)',
        }}
      >
        {role === 'admin' ? '🛡️' : '📋'}
      </motion.div>

      {/* Welcome text */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        style={{ textAlign: 'center' }}
      >
        <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: '28px', color: '#f8fafc', fontWeight: '400', marginBottom: '6px', letterSpacing: '-0.3px' }}>
          Welcome back, {userName.split(' ')[0]}
        </div>
        <div style={{ fontSize: '14px', color: '#475569', fontFamily: 'DM Sans, sans-serif' }}>
          {role === 'admin' ? 'Grant Administrator' : 'Applicant Portal'}
        </div>
      </motion.div>

      {/* Progress bar + step label */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        style={{ width: '280px', textAlign: 'center' }}
      >
        {/* Bar track */}
        <div style={{ height: '2px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden', marginBottom: '14px' }}>
          <motion.div
            style={{ height: '100%', background: 'linear-gradient(90deg, #3b82f6, #6366f1)', borderRadius: '2px', width: `${progress}%` }}
            transition={{ duration: 0.1 }}
          />
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            style={{ fontSize: '13px', color: '#475569', fontFamily: 'DM Sans, sans-serif', fontWeight: '500', letterSpacing: '0.2px' }}
          >
            {currentStep}
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* Hash line decoration */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        style={{ fontFamily: 'monospace', fontSize: '10px', color: 'rgba(255,255,255,0.06)', letterSpacing: '2px', userSelect: 'none' }}
      >
        SHA-256 · AES-256-GCM · OAuth 2.0
      </motion.div>
    </motion.div>
  );
};

// ── Main App ───────────────────────────────────────────────────────────────
function App() {
  const [isLoggedIn,       setIsLoggedIn]       = useState(localStorage.getItem('isLoggedIn') === 'true');
  const [userRole,         setUserRole]          = useState(localStorage.getItem('userRole') || '');
  const [currentUser,      setCurrentUser]       = useState(localStorage.getItem('currentUser') || '');
  const [currentUserEmail, setCurrentUserEmail]  = useState(localStorage.getItem('currentUserEmail') || '');
  const [grantsList,       setGrantsList]        = useState([]);
  const [showTransition,   setShowTransition]    = useState(false);

  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('themeMode');
    return saved ? saved === 'dark' : true;
  });

  useEffect(() => {
    document.body.classList.toggle('light-mode', !isDarkMode);
    localStorage.setItem('themeMode', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const toggleTheme = () => setIsDarkMode(p => !p);

  const fetchGrants = useCallback(() => {
    axios.get(`http://localhost:3001/grants?t=${Date.now()}`)
      .then(res  => setGrantsList([...(res.data || [])]))
      .catch(err => console.log('Sync error:', err));
  }, []);

  useEffect(() => {
    if (!isLoggedIn || showTransition) return;
    fetchGrants();
    const timer = setInterval(fetchGrants, 3000);
    return () => clearInterval(timer);
  }, [isLoggedIn, fetchGrants, showTransition]);

  // Intercept login to show transition screen
  const handleLoginComplete = useCallback((loggedIn, role, user, email) => {
    setCurrentUser(user);
    setCurrentUserEmail(email);
    setUserRole(role);
    setShowTransition(true);
    fetchGrants();
  }, [fetchGrants]);

  const handleTransitionDone = useCallback(() => {
    setShowTransition(false);
    setIsLoggedIn(true);
  }, []);

  const handleLogout = () => {
    const theme = isDarkMode ? 'dark' : 'light';
    localStorage.clear();
    localStorage.setItem('themeMode', theme);
    setIsLoggedIn(false); setUserRole(''); setCurrentUser(''); setCurrentUserEmail(''); setGrantsList([]); setShowTransition(false);
  };

  // Show transition screen after login
  if (showTransition) {
    return (
      <AnimatePresence>
        <TransitionScreen userName={currentUser} role={userRole} onComplete={handleTransitionDone} />
      </AnimatePresence>
    );
  }

  if (!isLoggedIn) {
    return (
      <Login
        setIsLoggedIn={setIsLoggedIn}
        setUserRole={setUserRole}
        setCurrentUser={setCurrentUser}
        setCurrentUserEmail={setCurrentUserEmail}
        fetchGrants={fetchGrants}
        onLoginComplete={handleLoginComplete}
      />
    );
  }

  if (userRole === 'admin') return <AdminDashboard currentUser={currentUser} grantsList={grantsList} fetchGrants={fetchGrants} handleLogout={handleLogout} isDarkMode={isDarkMode} toggleTheme={toggleTheme} />;
  return <ApplicantDashboard currentUser={currentUser} currentUserEmail={currentUserEmail} grantsList={grantsList} fetchGrants={fetchGrants} handleLogout={handleLogout} isDarkMode={isDarkMode} toggleTheme={toggleTheme} />;
}

export default App;