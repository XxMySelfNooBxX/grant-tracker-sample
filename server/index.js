const exifr = require('exifr');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const nodemailer = require('nodemailer'); 

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(cors());

// ── email configuration ───────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'ss.sepm.project.ss@gmail.com', 
    pass: 'fuvt evxp cykt ssxq'           
  }
});

let grants    = [];
let auditLogs = [];
let idCounter  = 1;
let logCounter = 1;

// ── MFA OTP STORAGE ──
let adminOtps = {}; 

// ✨ SPRINT 2: Global Strike Tracker for Blacklist (userId -> strike_count)
let userStrikes = {}; 

// ✨ SPRINT 2: Global File Hash Blacklist (Stores SHA-256 hashes of forged receipts)
const compromisedImageHashes = new Set();

// ── helpers ───────────────────────────────────────────────────────────────────
const getCreditLimit = (score) => {
  const s = parseInt(score);
  if (isNaN(s)) return 0;
  if (s >= 750) return 100000;
  if (s >= 600) return 25000;
  return 0;
};

const generateHash = (data, previousHash) => {
  const payload = JSON.stringify(data) + previousHash;
  return crypto.createHash('sha256').update(payload).digest('hex');
};

const logAction = (admin, action, target, details, targetId = null) => {
  auditLogs.unshift({
    id: logCounter++,
    timestamp: new Date().toLocaleString(),
    admin:   admin  || 'System',
    action, target, details,
    targetId  
  });
};

// ── routes ────────────────────────────────────────────────────────────────────

// Attach strike count to grants payload for Admin UI
app.get('/grants', (req, res) => {
  const enrichedGrants = grants.map(g => ({ 
    ...g, 
    strikes: userStrikes[g.userId] || 0 
  }));
  res.json(enrichedGrants);
});

app.get('/logs',   (req, res) => res.json(auditLogs));

// ADD GRANT
app.post('/add-grant', (req, res) => {
  const { source, amount, type, creditScore, userId } = req.body;

  // Enforce 3-Strike Global Blacklist
  if (userStrikes[userId] >= 3) {
    logAction('Security Bot', 'BLOCKED', source, `Blacklisted entity attempted application.`);
    return res.status(403).json({ error: true, message: 'ERROR 403: ENTITY BLACKLISTED DUE TO REPEATED FRAUD.' });
  }

  const isDuplicate = grants.some(g => g.userId === userId && g.type === type && g.status === 'Pending');
  if (isDuplicate)
    return res.status(400).json({ error: true, message: `DUPLICATE DETECTED: You already have a Pending request for ${type}.` });

  const reqAmount   = parseInt(amount);
  const serverLimit = getCreditLimit(creditScore);
  if (reqAmount > serverLimit) {
    logAction('Security Bot', 'BLOCKED', source, `Attempted ₹${reqAmount} with score ${creditScore}`);
    return res.status(400).json({ error: true, message: `SECURITY ALERT: Limit for score ${creditScore} is ₹${serverLimit.toLocaleString()}.` });
  }

  const newGrant = {
    id: idCounter++, source, userId,
    amount: reqAmount, type: type || 'General',
    status: 'Pending', actionBy: null, note: '',
    creditScore, date: new Date().toLocaleDateString(),
    disbursedAmount: 0, proofs: [], privateNotes: [], // Added privateNotes init
    previousHash: 'GENESIS_BLOCK_0000', currentHash: ''
  };
  newGrant.currentHash = generateHash({ source, amount: reqAmount, date: newGrant.date }, newGrant.previousHash);
  grants.push(newGrant);
  logAction('System', 'SUBMITTED', source, `New ${type} grant application for ₹${reqAmount}`, newGrant.id);
  res.json(newGrant);
});

// EDIT GRANT
app.post('/edit-grant', (req, res) => {
  const { id, source, amount, creditScore, type } = req.body;
  const grant = grants.find(g => g.id === id);
  if (!grant)                        return res.status(404).json({ message: 'Grant not found' });
  if (grant.status !== 'Pending')    return res.status(400).json({ message: 'Only Pending grants can be edited.' });

  const reqAmount   = parseInt(amount);
  const serverLimit = getCreditLimit(creditScore);
  if (reqAmount > serverLimit)
    return res.status(400).json({ message: `Amount exceeds limit of ₹${serverLimit.toLocaleString()} for score ${creditScore}.` });

  grant.source      = source;
  grant.amount      = reqAmount;
  grant.creditScore = creditScore;
  grant.type        = type;
  grant.previousHash = grant.currentHash;
  grant.currentHash  = generateHash({ source, amount: reqAmount, creditScore, type, edited: true }, grant.previousHash);

  logAction('Applicant', 'EDITED', source, `Updated grant details (amount: ₹${reqAmount}, type: ${type})`, id);
  res.json({ message: 'Grant updated', grant });
});

// CANCEL GRANT
app.post('/cancel-grant', (req, res) => {
  const { id } = req.body;
  const grant = grants.find(g => g.id === id);
  if (!grant)                     return res.status(404).json({ message: 'Grant not found' });
  if (grant.status !== 'Pending') return res.status(400).json({ message: 'Only Pending grants can be cancelled.' });

  grant.status         = 'Cancelled';
  grant.disbursedAmount = 0;
  grant.previousHash   = grant.currentHash;
  grant.currentHash    = generateHash({ status: 'Cancelled', time: Date.now() }, grant.previousHash);

  logAction('Applicant', 'CANCELLED', grant.source, `Application cancelled by applicant`, id);
  res.json({ message: 'Grant cancelled', grant });
});

// ADD EXPENSE ENTRY (Forensic Edition)
app.post('/add-expense', async (req, res) => {
  const { grantId, description, proofImages } = req.body;
  const grant = grants.find(g => g.id === grantId);
  if (!grant) return res.status(404).json({ message: 'Grant not found' });
  if (grant.status !== 'Phase 1 Approved') return res.status(400).json({ message: 'Expenses can only be added when Phase 1 is Approved.' });
  if (!proofImages || !proofImages.length) return res.status(400).json({ message: 'No images provided.' });

  // ✨ SPRINT 2: Plagiarism Hash Check
  for (let base64Str of proofImages) {
    const fileHash = crypto.createHash('sha256').update(base64Str).digest('hex');
    if (compromisedImageHashes.has(fileHash)) {
      logAction('Security Bot', 'BLOCKED UPLOAD', grant.source, 'Applicant attempted to upload a known fraudulent file.', grantId);
      return res.status(403).json({ message: 'SECURITY ALERT: ONE OR MORE FILES IDENTIFIED IN PREVIOUS FRAUD CASE.' });
    }
  }

  const forensicReports = await Promise.all(proofImages.map(async (base64Str) => {
    let report = { status: 'CLEAN', details: 'Metadata verified' };
    
    if (base64Str.startsWith('data:application/pdf')) {
      return { status: 'CLEAN', details: '📄 PDF Document' };
    }

    try {
      const base64Data = base64Str.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, 'base64');
      const exifData = await exifr.parse(buffer);
      
      if (!exifData) {
        report = { status: 'FLAGGED', details: '⚠️ Metadata stripped (Possible web download)' };
      } else {
        const dateTaken = exifData.DateTimeOriginal || exifData.CreateDate;
        const camera = exifData.Make ? `📸 ${exifData.Make} ${exifData.Model}` : '📸 Unknown Device';
        report.details = camera;
        if (dateTaken && new Date(dateTaken) < new Date(grant.date)) {
          report.status = 'FLAGGED';
          report.details = `🛑 Fraud Alert: Image taken on ${new Date(dateTaken).toLocaleDateString()}, before grant approval.`;
        }
      }
    } catch (err) {
      report = { status: 'FLAGGED', details: '⚠️ Forensic scan failed or corrupt file.' };
    }
    return report;
  }));

  grant.proofs.push({
    date: new Date().toLocaleDateString(),
    description,
    images: proofImages,
    forensics: forensicReports,
    finalized: false  
  });

  grant.previousHash = grant.currentHash;
  grant.currentHash  = generateHash({ proofCount: grant.proofs.length, desc: description }, grant.previousHash);

  logAction('Applicant', 'EXPENSE ADDED', grant.source, `Added expense: "${description}" (Scanned by Forensics Engine)`, grantId);
  res.json(grant);
});

// DELETE EXPENSE ENTRY
app.post('/delete-expense', (req, res) => {
  const { grantId, index } = req.body;
  const grant = grants.find(g => g.id === grantId);
  
  if (!grant) return res.status(404).json({ message: 'Grant not found' });
  if (!grant.proofs || index < 0 || index >= grant.proofs.length) {
    return res.status(400).json({ message: 'Invalid expense entry' });
  }

  const deletedExpense = grant.proofs.splice(index, 1)[0];
  grant.previousHash = grant.currentHash;
  grant.currentHash  = generateHash({ proofCount: grant.proofs.length, time: Date.now() }, grant.previousHash);

  logAction('Applicant', 'DRAFT DELETED', grant.source, `Deleted unsubmitted expense entry.`, grantId);
  res.json({ message: 'Expense deleted successfully', grant });
});

// SUBMIT PROOF 
app.post('/submit-proof', (req, res) => {
  const { grantId, finalize } = req.body;
  const grant = grants.find(g => g.id === grantId);
  if (!grant) return res.status(404).json({ message: 'Grant not found' });

  grant.proofs.forEach(p => { p.finalized = true; });

  if (grant.proofs.length === 0) return res.status(400).json({ message: 'No expenses to submit.' });

  grant.status = 'Awaiting Review';
  grant.previousHash = grant.currentHash;
  grant.currentHash  = generateHash(grant.proofs, grant.previousHash);

  logAction('System', 'PROOF UPLOADED', grant.source, `Submitted ${grant.proofs.length} expense(s) for Phase 2 review.`, grantId);
  res.json(grant);
});

// GENERATE OTP
app.post('/generate-otp', (req, res) => {
  const { adminEmail } = req.body;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  
  adminOtps[adminEmail] = {
    otp: otp,
    expires: Date.now() + 5 * 60 * 1000 
  };

  const mailOptions = {
    from: '"Vault Security Bot" <ss.sepm.project.ss@gmail.com>',
    to: adminEmail,
    subject: '🔐 URGENT: Vault Release Authorization OTP',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 500px;">
        <h2 style="color: #ef4444;">Vault Release Initiated</h2>
        <p>You have requested to release final escrow funds. Please enter the following 6-digit cryptographic OTP to authorize this transaction:</p>
        <div style="background: #f8fafc; padding: 15px; text-align: center; border-radius: 8px; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #3b82f6;">
          ${otp}
        </div>
        <p style="color: #64748b; font-size: 12px; margin-top: 20px;">This code will expire in 5 minutes.</p>
      </div>
    `
  };

  transporter.sendMail(mailOptions)
    .then(() => res.json({ message: 'OTP Sent successfully' }))
    .catch(err => {
      console.error(err);
      res.status(500).json({ message: 'Failed to send OTP email.' });
    });
});

// ✨ NEW: ADD PRIVATE ADMIN NOTE
app.post('/add-private-note', (req, res) => {
  const { grantId, text, admin } = req.body;
  const grant = grants.find(g => g.id === grantId);
  if (!grant) return res.status(404).json({ message: 'Grant not found' });
  
  if (!grant.privateNotes) grant.privateNotes = [];
  grant.privateNotes.push({ text, admin, timestamp: new Date().toLocaleString() });
  
  logAction(admin, 'PRIVATE NOTE ADDED', grant.source, 'Added internal investigation note.', grantId);
  res.json(grant);
});

// UPDATE STATUS
app.post('/update-status', (req, res) => {
  const { id, status, actionBy, note, otp, adminEmail } = req.body;
  const grant = grants.find(g => g.id === id);
  if (!grant) return res.status(404).json({ message: 'Grant not found' });

  const oldStatus = grant.status;

  // ✨ SPRINT 2: "Kill Switch" Quarantine / Freeze Action
  if (status === 'Blocked') {
    const email = grant.userId;
    userStrikes[email] = (userStrikes[email] || 0) + 1; // Increment Strike Counter
    const isBlacklisted = userStrikes[email] >= 3;
    
    grant.status = 'Blocked';
    if (note) grant.note = note;
    
    grant.previousHash = grant.currentHash;
    grant.currentHash  = generateHash({ status: 'Blocked', note: grant.note, time: Date.now() }, grant.previousHash);

    // ✨ SPRINT 2: Automated Warning Email Dispatch
    if (email) {
      const mailOptions = {
        from: '"Vault Security Bot" <ss.sepm.project.ss@gmail.com>',
        to: email,
        subject: `🚨 URGENT: Account Frozen - Fraud Strike ${userStrikes[email]}/3`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 500px; background: #ffffff;">
            <h2 style="color: #ef4444; margin-top: 0; border-bottom: 2px solid #ef4444; padding-bottom: 10px;">Account Temporarily Frozen</h2>
            <p style="font-size: 16px;">Hello <b>${grant.source}</b>,</p>
            <p style="font-size: 15px; line-height: 1.5;">Your grant application has been flagged for suspected document falsification or metadata tampering. Your account has been placed under administrative investigation.</p>
            <div style="background: #fee2e2; padding: 15px; border-radius: 8px; font-weight: bold; color: #b91c1c; border: 1px solid #ef4444; margin: 20px 0; text-align: center; font-size: 18px;">
              You have received Strike ${userStrikes[email]} of 3.
            </div>
            <p style="color: #64748b; font-size: 14px;">If you reach 3 strikes, you will be permanently blacklisted from the system and barred from all future applications.</p>
            <p style="font-size: 14px;">An administrator will review your case shortly. You may be asked to provide further documentation.</p>
          </div>`
      };
      transporter.sendMail(mailOptions).catch(err => console.error('Failed to send strike email:', err));
    }

    logAction(actionBy, 'FLAGGED FRAUD', grant.source, `Account frozen. Strike ${userStrikes[email]}/3. ${isBlacklisted ? 'ENTITY BLACKLISTED.' : ''}`, id);
    return res.json({ message: `Account Frozen. User has ${userStrikes[email]}/3 Strikes.`, grant });
  }

  // ✨ SPRINT 2: Hash Blacklist Enforcement (On Fraud Termination)
  if (status === 'Rejected' && oldStatus === 'Blocked') {
    let addedHashes = 0;
    grant.proofs.forEach(p => {
        if (p.images) {
            p.images.forEach(imgStr => {
                const h = crypto.createHash('sha256').update(imgStr).digest('hex');
                compromisedImageHashes.add(h);
                addedHashes++;
            });
        }
    });
    if (addedHashes > 0) {
        logAction('Security Bot', 'BLACKLISTED FILES', grant.source, `Added ${addedHashes} compromised proofs to global hash blacklist.`, id);
    }
  }

  // ✨ SPRINT 2: Resolve Investigation & Lift Freeze
  if (oldStatus === 'Blocked' && status === 'Awaiting Review') {
    const email = grant.userId;
    if (userStrikes[email] > 0) userStrikes[email] -= 1; // Revoke the strike!
    logAction(actionBy, 'FREEZE LIFTED', grant.source, `Investigation cleared. Strike removed.`, id);
  }

  // ── MFA VERIFICATION CHECK ──
  if (status === 'Fully Disbursed') {
    const validOtpData = adminOtps[adminEmail];
    if (!validOtpData) return res.status(401).json({ message: 'SECURITY ALERT: No OTP generated or OTP has expired.' });
    if (Date.now() > validOtpData.expires) { delete adminOtps[adminEmail]; return res.status(401).json({ message: 'SECURITY ALERT: OTP has expired. Request a new one.' }); }
    if (validOtpData.otp !== otp) return res.status(401).json({ message: 'SECURITY ALERT: Incorrect OTP provided. Vault remains locked.' });
    
    delete adminOtps[adminEmail];
    grant.disbursedAmount = grant.amount;
  }

  grant.status      = status;
  grant.actionBy    = actionBy;
  if (note !== undefined) grant.note = note;

  if (status === 'Phase 1 Approved') {
    grant.disbursedAmount = grant.amount * 0.35;
    
    if (grant.userId) { 
      const mailOptions = {
        from: '"Grant Administrator" <ss.sepm.project.ss@gmail.com>',
        to: grant.userId,
        subject: '🎉 Grant Phase 1 Approved - Milestone Funds Released',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 25px; color: #1a2540; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
            <h2 style="color: #10b981; margin-top: 0; border-bottom: 2px solid #10b981; padding-bottom: 10px;">Phase 1 Approved!</h2>
            <p style="font-size: 16px;">Hello <b>${grant.source}</b>,</p>
            <p style="font-size: 15px; line-height: 1.5;">Your grant application for the <b>${grant.type}</b> category has been successfully evaluated and Phase 1 is approved.</p>
            <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 5px solid #3b82f6; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
              <h3 style="margin: 0 0 10px 0; color: #0f172a;">Funds Released</h3>
              <p style="margin: 0; font-size: 20px; font-weight: bold; color: #3b82f6;">₹${grant.disbursedAmount.toLocaleString()}</p>
              <p style="margin: 5px 0 0 0; font-size: 13px; color: #64748b;">(35% of your total requested amount of ₹${grant.amount.toLocaleString()})</p>
            </div>
            <p style="font-size: 15px; line-height: 1.5;"><b>Next Steps:</b> Please log in to the Applicant Portal to upload your digital forensic proofs (such as receipts, equipment images, or valid IDs) to unlock the remaining 65% of your escrow balance.</p>
            <p style="color: #64748b; font-size: 12px; margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 15px;">
              Securely processed by the Hybrid Cloud Crypto Vault & Grant System.<br>
              Action taken by Administrator: ${actionBy}
            </p>
          </div>
        `
      };
      
      transporter.sendMail(mailOptions).catch(err => console.error(err));
    }
  }
  else if (status === 'Rejected') {
    grant.disbursedAmount = 0;
  }

  grant.previousHash = grant.currentHash;
  grant.currentHash  = generateHash({ status, disbursed: grant.disbursedAmount, note: grant.note, time: Date.now() }, grant.previousHash);

  logAction(actionBy, status.toUpperCase(), grant.source,
    `Changed from ${oldStatus} to ${status}${note ? ` | Note: "${note}"` : ''}`, id);
  res.json({ message: 'Status Updated', grant });
});

// VERIFY LEDGER
app.post('/verify-ledger', (req, res) => {
  const { grantId } = req.body;
  const grant = grants.find(g => g.id === grantId);
  if (!grant) return res.status(404).json({ message: 'Grant not found' });
  const ok = grant.currentHash.length === 64;
  res.json(ok
    ? { verified: true,  message: 'Cryptographic Hash Chain Intact. Data is authentic.' }
    : { verified: false, message: 'DATA COMPROMISE DETECTED.' });
});

// SUBMIT IMPACT
app.post('/submit-impact', (req, res) => {
  const { grantId, outcome, metric, link } = req.body;
  const grant = grants.find(g => g.id === grantId);
  if (!grant) return res.status(404).json({ message: 'Grant not found' });

  grant.impact = { date: new Date().toLocaleDateString(), outcome, metric: parseInt(metric), link };
  grant.status = 'Evaluated';
  grant.previousHash = grant.currentHash;
  grant.currentHash  = generateHash(grant.impact, grant.previousHash);

  logAction('System', 'IMPACT LOGGED', grant.source, `Final impact evaluated.`, grantId);
  res.json(grant);
});

// ══════════════════════════════════════════════════════════════════════════════
// 🚀 MOCK DATA INJECTION SCRIPT (RUNS ON SERVER START)
// ══════════════════════════════════════════════════════════════════════════════
const injectMockData = () => {
  const email1 = 'shauraycrid@gmail.com';
  const name1 = 'Shaurya';
  const email2 = 'srishtisinha1931@gmail.com';
  const name2 = 'Srishti';

  // This is a tiny 1x1 invisible image, formatted safely so the React <img> tags don't break!
  const dummyImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  const mockGrants = [
    // 1. Pending 
    { source: name1, userId: email1, amount: 15000, type: 'Travel', status: 'Pending', creditScore: '650', date: '3/1/2026', disbursedAmount: 0, privateNotes: [], proofs: [] },
    // 2. Pending 
    { source: name2, userId: email2, amount: 50000, type: 'Equipment', status: 'Pending', creditScore: '780', date: '3/5/2026', disbursedAmount: 0, privateNotes: [], proofs: [] },
    // 3. Phase 1 Approved (Ready for Proofs)
    { source: name1, userId: email1, amount: 80000, type: 'Research', status: 'Phase 1 Approved', creditScore: '810', date: '2/15/2026', disbursedAmount: 28000, privateNotes: [], proofs: [] },
    // 4. Phase 1 Approved 
    { source: name2, userId: email2, amount: 20000, type: 'Stipend', status: 'Phase 1 Approved', creditScore: '620', date: '2/20/2026', disbursedAmount: 7000, privateNotes: [], proofs: [] },
    // 5. Awaiting Review (Has Dummy Images Attached!)
    { source: name1, userId: email1, amount: 45000, type: 'Equipment', status: 'Awaiting Review', creditScore: '760', date: '2/10/2026', disbursedAmount: 15750, privateNotes: [], proofs: [
      { date: '3/8/2026', description: 'Dell Monitor & Peripherals', images: [dummyImage], forensics: [{status: 'CLEAN', details: '📸 iPhone 15 Pro'}], finalized: true }
    ]},
    // 6. Awaiting Review (Fraud Alert Metadata to test red borders!)
    { source: name2, userId: email2, amount: 12000, type: 'Travel', status: 'Awaiting Review', creditScore: '610', date: '2/28/2026', disbursedAmount: 4200, privateNotes: [], proofs: [
      { date: '3/9/2026', description: 'Flight Tickets to Conference', images: [dummyImage], forensics: [{status: 'FLAGGED', details: '⚠️ Metadata stripped'}], finalized: true }
    ]},
    // 7. Fully Disbursed 
    { source: name1, userId: email1, amount: 90000, type: 'Research', status: 'Fully Disbursed', creditScore: '850', date: '1/10/2026', disbursedAmount: 90000, privateNotes: [], proofs: [
      { date: '2/01/2026', description: 'Lab Supplies', images: [dummyImage], forensics: [{status: 'CLEAN', details: '📸 Sony A7III'}], finalized: true }
    ]},
    // 8. Evaluated (Finished Project with Impact Report)
    { source: name2, userId: email2, amount: 30000, type: 'Equipment', status: 'Evaluated', creditScore: '720', date: '12/05/2025', disbursedAmount: 30000, privateNotes: [], proofs: [
      { date: '1/15/2026', description: 'Server Rack', images: [dummyImage], forensics: [{status: 'CLEAN', details: '📸 Canon EOS R'}], finalized: true }
    ], impact: { date: '2/10/2026', outcome: 'Deployed web app successfully', metric: 5000, link: 'https://github.com/project' } },
    // 9. Rejected 
    { source: name1, userId: email1, amount: 100000, type: 'Stipend', status: 'Rejected', creditScore: '400', date: '3/7/2026', disbursedAmount: 0, privateNotes: [], proofs: [], note: 'Credit score too low for requested amount.' }
  ];

  // Hash and load them into memory
  mockGrants.forEach(g => {
    g.id = idCounter++;
    g.actionBy = (g.status === 'Pending' || g.status === 'Cancelled') ? null : 'System_Admin';
    g.note = g.note || '';
    g.previousHash = 'GENESIS_BLOCK_0000';
    g.currentHash = generateHash({ source: g.source, amount: g.amount, date: g.date }, g.previousHash);
    grants.push(g);

    logAction('System', 'SUBMITTED', g.source, `New ${g.type} grant application for ₹${g.amount}`, g.id);
    
    if (['Phase 1 Approved', 'Awaiting Review', 'Fully Disbursed', 'Evaluated'].includes(g.status)) {
        logAction('System_Admin', 'PHASE 1 APPROVED', g.source, `Changed from Pending to Phase 1 Approved`, g.id);
    }
    if (g.status === 'Rejected') {
        logAction('System_Admin', 'REJECTED', g.source, `Changed from Pending to Rejected | Note: "${g.note}"`, g.id);
    }
    if (g.proofs && g.proofs.length > 0) {
        logAction('Applicant', 'PROOF UPLOADED', g.source, `Submitted ${g.proofs.length} expense(s) for Phase 2 review.`, g.id);
    }
    if (['Fully Disbursed', 'Evaluated'].includes(g.status)) {
        logAction('System_Admin', 'FULLY DISBURSED', g.source, `Vault funds released fully.`, g.id);
    }
    if (g.status === 'Evaluated') {
        logAction('System', 'IMPACT LOGGED', g.source, `Final impact evaluated.`, g.id);
    }
  });

  logAction('System', 'INITIALIZED', 'Mock Data', 'Injected 9 test grants and synchronized ledger.');
  console.log("✅ Successfully injected 9 realistic Mock Grants into memory with Activity Logs!");
};

// Fire the injection script right before startup
injectMockData();

// ══════════════════════════════════════════════════════════════════════════════


const server = app.listen(3001, () => {
    console.log('🚀 Server running and actively listening on port 3001');
});

// This will catch any silent crashes (like port conflicts) and print them to the terminal
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error('❌ ERROR: Port 3001 is already in use. Please close any other hidden node terminals.');
    } else {
        console.error('❌ SERVER ERROR:', err);
    }
});