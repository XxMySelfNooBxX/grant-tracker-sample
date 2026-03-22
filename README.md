# 🛡️ Grant Tracker: Cryptographic Microgrant Platform

A high-security, full-stack web application designed for managing, tracking, and evaluating microgrants. Built with a "cyber-fintech" aesthetic, this platform features a cryptographic ledger, automated forensic image scanning for fraud detection, and multi-factor vault authorization.

## ✨ Key Features

### 👨‍💻 Admin Console (High-Security)
* **Cryptographic Ledger:** Every action (approval, rejection, proof upload) is cryptographically sealed using `SHA-256` hashing to ensure an immutable audit trail.
* **Automated Forensic X-Ray:** Uploaded expense receipts are automatically scanned using `exifr` to extract EXIF metadata. Flags tampered files or backdated images instantly.
* **Vault Escrow Authorization:** Final disbursal of funds requires a time-sensitive, 6-digit OTP sent via email (`Nodemailer`) to the Admin.
* **Command Palette:** Press `Cmd + K` (or `Ctrl + K`) to open a spotlight search for rapid UI navigation and quick actions.
* **Executive PDF Exports:** Generate formatted PDF audit reports of the entire ledger or specific date ranges using `jsPDF`.
* **Smart Bulk Actions:** Select multiple grants to approve, reject, or export simultaneously.

### 📝 Applicant Portal
* **Gamified Progression:** Applicants earn Bronze, Silver, or Gold tier statuses based on their successful project completion rate.
* **Dynamic Budget Tracking:** Visual SVG rings and progress bars track exactly how much capital has been disbursed versus how much is locked in escrow.
* **Draft & Crop Receipts:** Built-in React image cropping (`react-image-crop`) allows users to format their receipts before securely uploading them to the server.
* **Impact Evaluation:** Submit final outcome reports with key performance indicators (KPIs) to unlock higher credit limits.

---

## 🛠 Tech Stack

**Frontend (Client)**
* **Framework:** React.js
* **Styling:** Custom CSS (Glassmorphism, Dark/Light Mode, Neon Accents)
* **Animation:** Framer Motion, React-TSParticles, Canvas Confetti
* **Utilities:** jsPDF (Reporting), Lucide-React (Icons), Sonner (Toasts)

**Backend (Server)**
* **Environment:** Node.js & Express.js
* **Security:** Crypto (SHA-256 Hashing)
* **Forensics:** Exifr (Metadata Extraction)
* **Communications:** Nodemailer (OTP / Alerts)
* **Database:** In-memory Mock Data (MongoDB integration ready)

---

## 📂 Project Structure

```text
grant-tracker/
├── client/                     # Frontend React Application
│   ├── public/
│   └── src/
│       ├── components/
│       │   ├── Admin/          # Admin Dashboard & Styles
│       │   ├── Applicant/      # Applicant Dashboard & Components
│       │   └── Login.js        # Auth & Role Routing
│       ├── App.js              # Main App & Transition Logic
│       └── index.js
│
└── server/                     # Backend Node/Express API
    ├── index.js                # Core Server, Routes, and Forensics
    ├── .env                    # Secrets (Not pushed to Git)
    └── package.json