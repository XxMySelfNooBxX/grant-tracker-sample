# 🚀 Micro Grant Funding Portal

A high-security, full-stack application designed for milestone-based fund disbursement, active tracking, and visual proof verification sealed on a cryptographic ledger.

## 🌐 Live Deployment
- **Frontend App:** [Access the Portal Here](http://grant-tracker-portal-2026.s3-website-us-east-1.amazonaws.com)
- **Backend API:** [https://micrograntportal.el.r.appspot.com](https://micrograntportal.el.r.appspot.com)

## 🏗️ Architecture & Tech Stack
- **Frontend:** React.js, Framer Motion, Axios (Hosted on **AWS S3** - US East)
- **Backend:** Node.js, Express.js (Hosted on **Google Cloud App Engine** - Mumbai)
- **Security:** - Google Cloud Identity (OAuth 2.0)
  - MFA / OTP via Nodemailer
  - SHA-256 Cryptographic Ledger Hashing
  - EXIF Metadata Forensics for image tampering detection

## ✨ Key Features
1. **Role-Based Access Control:** Distinct Applicant and Administrator dashboards.
2. **Milestone Disbursal:** Funds are released in tranches (e.g., 35% Phase 1) based on approvals.
3. **Forensic Uploads:** Scans uploaded receipts/proofs for metadata stripping or date inconsistencies.
4. **Action Queue:** Smart sorting for administrators to review pending applications.
5. **PDF Export:** Generate cryptographically verified certificates and audit reports.

## 💻 Local Setup
To run this project locally:

1. Clone the repository.
2. Navigate to the \`client\` folder, run \`npm install\`, then \`npm start\`.
3. Navigate to the \`server\` folder, create a \`.env\` file with your Google App Password (\`EMAIL_USER\` and \`EMAIL_PASS\`), run \`npm install\`, then \`npm start\`.