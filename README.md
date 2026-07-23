# Cadets Coaching Academy — LMS & Examination Management System

[![Live Demo](https://img.shields.io/badge/Live_Demo-Firebase_Hosting-blue?style=for-the-badge&logo=firebase)](https://cadets-coaching-academy-1234.web.app)
[![React](https://img.shields.io/badge/React-19.2-61DAFB?style=for-the-badge&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8.0-646CFF?style=for-the-badge&logo=vite)](https://vitejs.dev/)

A full-stack Learning Management System (LMS) and Timed Examination platform tailored for military and academic coaching academies. Built with **React 19**, **TypeScript**, **Vite**, and **Firebase (Firestore & Authentication)**.

🌐 **Live Production Link:** [cadets-coaching-academy-1234.web.app](https://cadets-coaching-academy-1234.web.app)

---

## 🌟 Key Features

### 👨‍🏫 Instructor & Teacher Dashboard
- **Interactive Quiz Creation:** Build timed Multiple Choice Question (MCQ) examinations with custom duration, batch/class targeting, and answer keys.
- **Rich Media Question Support:** Attach diagrams, sequence charts, or maps to questions using direct Image URLs or compressed File Uploads.
- **Quiz Bank & Draft Templates:** Save draft quizzes, edit live exams, and clone existing quizzes for new cadet batches.
- **Cadet Attempt Logs:** Inspect individual student answer sheets, score distributions, and performance percentages.

### 🎓 Cadet Student Portal
- **Assigned Timed Examinations:** Interactive test-taking environment with live countdown timer and automatic submission.
- **Subject-Wise Performance Analytics:** Visual progress bars and metric cards for each subject area (e.g. Mathematics, Physics, English).
- **Attempt History & Review:** Review completed answer sheets with highlighted correct keys and feedback.

### 🛡️ Admin & Developer Portals
- **Academy Progress Monitoring:** View academy-wide student performance metrics, subject accuracy, and grade breakdown tables.
- **Granular Attempt Record Management:** Developer role controls for deleting or editing student attempt records with automatic metric recalculation.
- **Attendance & Payroll Tracking:** Manage physical/academic attendance records, payroll cycles, and financial breakdowns.

---

## 🛠️ Technology Stack

- **Frontend Framework:** React 19 + TypeScript
- **Build Tool:** Vite 8
- **Backend & Database:** Firebase Firestore (Real-time NoSQL Database)
- **Authentication:** Firebase Auth
- **Hosting:** Firebase Hosting
- **UI & Icons:** Custom CSS Design System + Lucide React Icons

---

## 🚀 Getting Started Locally

### Prerequisites
- Node.js (v18+ recommended)
- npm or yarn

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/MIAN397/cadets-coaching-academy.git
   cd cadets-coaching-academy
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Build for production:
   ```bash
   npm run build
   ```

---

## 📁 Project Architecture

```
src/
├── assets/             # Static assets & brand media
├── components/         # Dashboard views per user role
│   ├── AdminDashboard.tsx
│   ├── DeveloperDashboard.tsx
│   ├── TeacherDashboard.tsx
│   ├── StudentDashboard.tsx
│   ├── Login.tsx
│   └── Navbar.tsx
├── utils/              # Calculation helpers & analytics
│   ├── academic.ts
│   ├── financials.ts
│   └── whatsapp.ts
├── firebase.ts         # Firebase SDK initialization
├── types.ts            # TypeScript interfaces & data models
└── index.css           # Global design system & component styles
```

---

## 📄 License
This project is proprietary software developed for Cadets Coaching Academy. All rights reserved.
