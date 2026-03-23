# 🚀 Vault: Micro Grant Funding Portal

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB_Atlas-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white)
![AWS S3](https://img.shields.io/badge/AWS_S3-FF9900?style=for-the-badge&logo=amazonaws&logoColor=white)
![Google Cloud](https://img.shields.io/badge/Google_Cloud-4285F4?style=for-the-badge&logo=google-cloud&logoColor=white)

A high-security, full-stack application designed for milestone-based fund disbursement, active financial tracking, and visual proof verification securely sealed on a cryptographic ledger.

## 🌐 Live Deployment
- **Frontend App:** [Vault Applicant & Admin Portal](http://grant-tracker-portal-2026.s3-website-us-east-1.amazonaws.com)
- **Backend API:** [Google Cloud App Engine API](https://micrograntportal.el.r.appspot.com)

---

## 🏗️ Decoupled Cloud Architecture
This project utilizes a modern, decoupled microservices architecture distributed across three major cloud providers:

* **Frontend:** Built with React.js & Framer Motion, hosted statically on **AWS S3** (US-East-1).
* **Backend:** Node.js & Express.js REST API, hosted on **Google Cloud App Engine** (Mumbai).
* **Database:** **MongoDB Atlas** Cloud Cluster for persistent, real-time data storage.

---

## 🛡️ Enterprise-Grade Security Features
1. **Cryptographic Ledger:** Every action generates a continuous SHA-256 hash chain, ensuring financial data is immutable and tamper-proof.
2. **Digital Forensics Engine:** Uploaded receipts are X-rayed for EXIF metadata to detect stripped data or impossible timestamps (e.g., photos taken before grant approval).
3. **MFA Vault Release:** Final escrow funds are locked behind a cryptographic One-Time Password (OTP) sent via Nodemailer.
4. **Automated Fraud Prevention (3-Strike System):** Suspicious accounts are frozen. If an applicant hits 3 strikes for metadata tampering, their entity and file hashes are permanently globally blacklisted.

---

## ✨ Key Features
* **Role-Based Access Control:** Highly customized dashboard interfaces for both Applicants and Grant Administrators.
* **Milestone Disbursal:** Automated logic releases funds in tranches (e.g., 35% unlock for Phase 1) based on strict admin approvals.
* **Admin Command Palette:** Press `Cmd+K` / `Ctrl+K` for rapid navigation, bulk actions, and filtering.
* **Cryptographic PDF Exports:** Generate cryptographically verified Certificates of Execution and full System Audit Reports via `jsPDF`.
* **Dynamic UI:** Full Light/Dark mode support with Framer Motion animated data visualizers.

---

## 💻 Local Setup & Development

To run this project locally, clone the repository and set up the individual environments:

### 1. Frontend (`/client`)
```bash
cd client
npm install
npm start