import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Login } from './Login';
import type { Quiz } from '../types';
import { 
  Award, 
  ShieldCheck, 
  Brain, 
  BookOpen, 
  X, 
  LogIn, 
  Sparkles, 
  Bell, 
  Clock, 
  TrendingUp, 
  Users, 
  Zap,
  RotateCcw
} from 'lucide-react';

interface AnnouncementItem {
  id: string;
  title: string;
  category: string;
  date: string;
  content: string;
  badgeColor?: string;
}

const DEFAULT_ANNOUNCEMENTS: AnnouncementItem[] = [
  {
    id: 'ann_1',
    title: 'Admissions Open: Batch 2026 Preparation',
    category: 'Admissions',
    date: '2026-07-28',
    content: 'Registration is now open for PMA Long Course, PAF GDP/Aero, Pakistan Navy Officers & School/College Academics (Grade 1 to 10). Limited seats available.',
    badgeColor: 'var(--accent-gold-dark)'
  },
  {
    id: 'ann_2',
    title: 'Free ISSB & Psychological Mock Test Released',
    category: 'Free Evaluation',
    date: '2026-07-25',
    content: 'Experience our free online ISSB personality evaluation and intelligence diagnostic test below without logging in!',
    badgeColor: 'var(--secondary-olive)'
  },
  {
    id: 'ann_3',
    title: 'Physical & Academic Drill Schedule Updated',
    category: 'Campus News',
    date: '2026-07-20',
    content: 'Physical training and outdoor obstacle practice runs every morning at 06:00 AM for Boys & Girls Campuses.',
    badgeColor: 'var(--primary-navy)'
  }
];

// 16Personalities 7-Point Likert Scale Options & Psychological Statements
const LIKERT_SCALE_OPTIONS = [
  { val: 3, class: 'agree-3', label: 'Strongly Agree' },
  { val: 2, class: 'agree-2', label: 'Agree' },
  { val: 1, class: 'agree-1', label: 'Slightly Agree' },
  { val: 0, class: 'neutral', label: 'Neutral' },
  { val: -1, class: 'disagree-1', label: 'Slightly Disagree' },
  { val: -2, class: 'disagree-2', label: 'Disagree' },
  { val: -3, class: 'disagree-3', label: 'Strongly Disagree' }
];

const PSYCHOLOGICAL_STATEMENTS = [
  {
    id: 1,
    statement: "You regularly take immediate charge of team tasks and make new connections easily.",
    dimension: "E_I"
  },
  {
    id: 2,
    statement: "You enjoy exploring unfamiliar tactical ideas, creative solutions, and strategic viewpoints.",
    dimension: "N_S"
  },
  {
    id: 3,
    statement: "You are not easily swayed by emotional arguments when taking high-stakes operational decisions.",
    dimension: "T_F"
  },
  {
    id: 4,
    statement: "You prefer following a strict daily training schedule and routine over spontaneous action.",
    dimension: "J_P"
  },
  {
    id: 5,
    statement: "In high-pressure timed obstacle tests, you remain completely calm and composed.",
    dimension: "E_I"
  },
  {
    id: 6,
    statement: "You prioritize squad comradeship and team unity above individual performance scores.",
    dimension: "T_F"
  }
];

const INTELLIGENCE_QUESTIONS = [
  {
    id: 1,
    question: "Light is to Eye as Sound is to:",
    options: ["Ear", "Voice", "Music", "Vibration"],
    correctIndex: 0,
    explanation: "Eye perceives light; Ear perceives sound."
  },
  {
    id: 2,
    question: "Which number comes next in sequence: 2, 6, 12, 20, 30, ?",
    options: ["36", "40", "42", "48"],
    correctIndex: 2,
    explanation: "Increments are +4, +6, +8, +10, so next is 30 + 12 = 42."
  },
  {
    id: 3,
    question: "If SOLDIER is coded as TPSFJFS, then CADET is coded as:",
    options: ["DBEFU", "CBEFU", "DBEFT", "EBEFU"],
    correctIndex: 0,
    explanation: "Each letter is shifted forward by +1 letter (C->D, A->B, D->E, E->F, T->U)."
  },
  {
    id: 4,
    question: "Which word does NOT belong with the others?",
    options: ["Frigate", "Submarine", "Destroyer", "Fighter Jet"],
    correctIndex: 3,
    explanation: "Frigate, Submarine, and Destroyer are naval vessels; Fighter Jet is aircraft."
  },
  {
    id: 5,
    question: "A training march of 15 km takes 3 hours. At the same speed, how long will a 25 km march take?",
    options: ["4 hours", "5 hours", "5.5 hours", "6 hours"],
    correctIndex: 1,
    explanation: "Speed is 15/3 = 5 km/h. Time for 25 km is 25 / 5 = 5 hours."
  }
];

export const LandingPage: React.FC = () => {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'announcements' | 'free-tests' | 'about'>('announcements');
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>(DEFAULT_ANNOUNCEMENTS);
  const [featuredQuizzes, setFeaturedQuizzes] = useState<Quiz[]>([]);
  const [activeFeaturedQuiz, setActiveFeaturedQuiz] = useState<Quiz | null>(null);
  const [featuredQuizAnswers, setFeaturedQuizAnswers] = useState<Record<number, number>>({});
  const [featuredQuizResult, setFeaturedQuizResult] = useState<{ score: number; total: number; percentage: number } | null>(null);
  
  // Free Test State
  const [activeFreeTest, setActiveFreeTest] = useState<'psychological' | 'intelligence' | 'featured' | null>(null);
  const [psychAnswers, setPsychAnswers] = useState<Record<number, number>>({});
  const [intelAnswers, setIntelAnswers] = useState<Record<number, number>>({});
  const [psychResult, setPsychResult] = useState<{ 
    score: number; 
    percentage: number; 
    archetypeTitle: string;
    archetypeBadge: string;
    description: string;
    recommendedArm: string;
    traits: { label: string; score: number }[];
  } | null>(null);
  const [intelResult, setIntelResult] = useState<{ score: number; total: number; percentage: number } | null>(null);

  useEffect(() => {
    const fetchLandingData = async () => {
      try {
        const qSnap = await getDocs(collection(db, 'announcements'));
        if (!qSnap.empty) {
          const list: AnnouncementItem[] = [];
          qSnap.forEach(d => {
            list.push({ id: d.id, ...d.data() } as AnnouncementItem);
          });
          setAnnouncements(list);
        }

        const quizzesSnap = await getDocs(collection(db, 'quizzes'));
        const featured: Quiz[] = [];
        quizzesSnap.forEach(d => {
          const q = { id: d.id, ...d.data() } as Quiz;
          if (q.status === 'published' && (q.isFeaturedOnHomepage || q.assignToType === 'free-homepage')) {
            featured.push(q);
          }
        });
        setFeaturedQuizzes(featured);
      } catch (e) {
        // Fallback
      }
    };
    fetchLandingData();
  }, []);

  // Submit Free 16Personalities-Style Cadet Psychological Assessment
  const handleCalculatePsychScore = () => {
    let e_i_score = 0;
    let n_s_score = 0;
    let t_f_score = 0;
    let j_p_score = 0;

    PSYCHOLOGICAL_STATEMENTS.forEach(s => {
      const val = psychAnswers[s.id] !== undefined ? psychAnswers[s.id] : 0;
      if (s.dimension === 'E_I') e_i_score += val;
      if (s.dimension === 'N_S') n_s_score += val;
      if (s.dimension === 'T_F') t_f_score += val;
      if (s.dimension === 'J_P') j_p_score += val;
    });

    const e_trait = e_i_score >= 0 ? 'E' : 'I';
    const n_trait = n_s_score >= 0 ? 'N' : 'S';
    const t_trait = t_f_score >= 0 ? 'T' : 'F';
    const j_trait = j_p_score >= 0 ? 'J' : 'P';
    const mbtiCode = `${e_trait}${n_trait}${t_trait}${j_trait}-A`;

    let archetypeTitle = `${mbtiCode}: The Strategic Commander`;
    let archetypeBadge = "Command Tier Alpha";
    let description = "You possess exceptional decision-making clarity, high natural authority, and a proactive crisis mindset. You take immediate charge during chaos and lead from the front.";
    let recommendedArm = "Armoured Corps, GDP Fighter Pilot, Infantry Command";

    if (mbtiCode.startsWith('ENTJ') || mbtiCode.startsWith('ESTJ')) {
      archetypeTitle = `${mbtiCode}: The Strategic Commander`;
      archetypeBadge = "Supreme Officer Candidate";
      description = "Exceptional tactical foresight, high emotional resilience, and decisive leadership. You naturally organize teams under extreme pressure and inspire total trust.";
      recommendedArm = "Army Aviation, GDP Pilot, Armoured Corps, SSG Operations";
    } else if (mbtiCode.startsWith('ENFJ') || mbtiCode.startsWith('ESFJ') || mbtiCode.startsWith('INFJ')) {
      archetypeTitle = `${mbtiCode}: The Steadfast Guardian`;
      archetypeBadge = "High Officer Potential";
      description = "Strong comradeship, balanced judgment, and unyielding integrity. You excel at maintaining squad cohesion and executing operations with discipline.";
      recommendedArm = "Artillery, Naval Operations, Signals, Field Engineers";
    } else {
      archetypeTitle = `${mbtiCode}: The Tactical Operator`;
      archetypeBadge = "Promising Candidate Profile";
      description = "Practical, adaptable, and steady under pressure. With focused coaching at CCAP, your leadership potential will reach commission standard.";
      recommendedArm = "Air Defence, EME, Medical Corps, Logistics";
    }

    const traits = [
      { label: 'Extroverted Command (E) vs Introverted Execution (I)', score: Math.round(((e_i_score + 6) / 12) * 100) },
      { label: 'Strategic Vision (N) vs Practical Realism (S)', score: Math.round(((n_s_score + 3) / 6) * 100) },
      { label: 'Objective Logic (T) vs Empathetic Cohesion (F)', score: Math.round(((t_f_score + 6) / 12) * 100) },
      { label: 'Structured Order (J) vs Flexible Adaptability (P)', score: Math.round(((j_p_score + 3) / 6) * 100) }
    ];

    const percentage = Math.round((traits.reduce((acc, curr) => acc + curr.score, 0) / traits.length));

    setPsychResult({
      score: percentage,
      percentage,
      archetypeTitle,
      archetypeBadge,
      description,
      recommendedArm,
      traits
    });
  };

  // Submit Free Intelligence Test
  const handleCalculateIntelScore = () => {
    let score = 0;
    INTELLIGENCE_QUESTIONS.forEach(q => {
      if (intelAnswers[q.id] === q.correctIndex) {
        score++;
      }
    });
    const percentage = Math.round((score / INTELLIGENCE_QUESTIONS.length) * 100);
    setIntelResult({
      score,
      total: INTELLIGENCE_QUESTIONS.length,
      percentage
    });
  };

  return (
    <div className="landing-page-wrapper fade-in">
      {/* 1. HERO BANNER */}
      <header className="hero-banner">
        <div className="hero-overlay"></div>
        <div className="hero-content container">
          <div className="hero-badge animate-bounce">
            <Sparkles size={16} color="var(--accent-gold)" />
            <span>Pakistan's Premier Military & Academic Preparation Portal</span>
          </div>
          
          <h1 className="hero-title">
            CADETS COACHING ACADEMY
          </h1>
          <p className="hero-subtitle">
            Discipline • Courage • Excellence
          </p>

          <p className="hero-description">
            Official training hub for PMA Long Course, PAF GDP & Aeronautical, Pakistan Navy Commissions, ISSB Preparation, and Grade 1-10 Academic Excellence.
          </p>

          <div className="hero-actions">
            <button 
              onClick={() => {
                setActiveTab('free-tests');
                const el = document.getElementById('free-tests-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }} 
              className="btn btn-secondary btn-lg"
              style={{ backgroundColor: 'var(--accent-gold-dark)', border: 'none', gap: '0.5rem' }}
            >
              <Zap size={20} />
              <span>Try Free Evaluation Tests</span>
            </button>

            <button 
              onClick={() => setShowLoginModal(true)} 
              className="btn btn-primary btn-lg"
              style={{ gap: '0.5rem', boxShadow: '0 4px 14px rgba(0,0,0,0.3)' }}
            >
              <LogIn size={20} />
              <span>Portal Login / Access</span>
            </button>
          </div>

          {/* Quick Metrics Bar */}
          <div className="hero-stats-grid">
            <div className="stat-card">
              <div className="stat-icon"><Award size={24} color="var(--accent-gold)" /></div>
              <div className="stat-number">500+</div>
              <div className="stat-label">Recommended Cadets</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon"><TrendingUp size={24} color="var(--accent-gold)" /></div>
              <div className="stat-number">98%</div>
              <div className="stat-label">Test Pass Rate</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon"><ShieldCheck size={24} color="var(--accent-gold)" /></div>
              <div className="stat-number">100%</div>
              <div className="stat-label">Ex-Military Instructors</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon"><Users size={24} color="var(--accent-gold)" /></div>
              <div className="stat-number">Boys & Girls</div>
              <div className="stat-label">Dedicated Campuses</div>
            </div>
          </div>
        </div>
      </header>

      {/* NAVIGATION TABS */}
      <div className="landing-tabs-bar">
        <div className="container" style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <button 
            className={`landing-tab-btn ${activeTab === 'announcements' ? 'active' : ''}`}
            onClick={() => setActiveTab('announcements')}
          >
            <Bell size={18} />
            <span>Latest Announcements & Updates</span>
          </button>

          <button 
            className={`landing-tab-btn ${activeTab === 'free-tests' ? 'active' : ''}`}
            onClick={() => setActiveTab('free-tests')}
          >
            <Brain size={18} />
            <span>Free Evaluation Tests (No Login Needed)</span>
          </button>

          <button 
            className={`landing-tab-btn ${activeTab === 'about' ? 'active' : ''}`}
            onClick={() => setActiveTab('about')}
          >
            <BookOpen size={18} />
            <span>Why Choose CCAP</span>
          </button>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <main className="container landing-main-content">
        
        {/* TAB 1: ANNOUNCEMENTS & NEWS BOARD */}
        {activeTab === 'announcements' && (
          <section className="fade-in">
            <div className="section-header" style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Bell size={26} color="#f59e0b" />
                <h2 style={{ fontSize: '1.5rem', textTransform: 'uppercase', color: '#f59e0b', margin: 0, fontWeight: 800, textShadow: '0 2px 10px rgba(0,0,0,0.85)' }}>
                  Official Academy Announcements & Updates
                </h2>
              </div>
              <span style={{ fontSize: '0.9rem', color: '#e2e8f0', marginTop: '0.35rem', display: 'block', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                Stay informed with the latest entry test schedules, admissions, and campus news
              </span>
            </div>

            <div className="announcements-grid" style={{ marginTop: '1.5rem' }}>
              {announcements.map(item => (
                <div key={item.id} className="announcement-card glass-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <span 
                      className="badge" 
                      style={{ 
                        backgroundColor: item.badgeColor || 'var(--primary-navy)', 
                        color: 'white', 
                        padding: '4px 10px', 
                        fontSize: '0.75rem', 
                        textTransform: 'uppercase',
                        fontWeight: 600 
                      }}
                    >
                      {item.category}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-light)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={14} />
                      {item.date}
                    </span>
                  </div>

                  <h3 style={{ fontSize: '1.15rem', color: 'var(--primary-navy)', marginBottom: '0.5rem' }}>
                    {item.title}
                  </h3>

                  <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', lineHeight: '1.5', margin: 0 }}>
                    {item.content}
                  </p>

                  <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px dashed var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--secondary-olive)', fontWeight: 600 }}>
                      Verified Official Notice
                    </span>
                    <button 
                      onClick={() => setShowLoginModal(true)} 
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                    >
                      Portal Login →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* TAB 2: FREE EVALUATION & TRUST TESTS */}
        {activeTab === 'free-tests' && (
          <section id="free-tests-section" className="fade-in">
            <div className="section-header" style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <span className="badge badge-secondary" style={{ backgroundColor: 'rgba(197, 160, 89, 0.25)', color: '#f59e0b', fontSize: '0.85rem', textTransform: 'uppercase', padding: '6px 14px', borderRadius: '20px', border: '1px solid #f59e0b', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                Instant Demonstration & Self-Assessment
              </span>
              <h2 style={{ fontSize: '1.75rem', textTransform: 'uppercase', color: '#f59e0b', marginTop: '0.75rem', fontWeight: 800, textShadow: '0 2px 10px rgba(0,0,0,0.85)' }}>
                Free Evaluation Tests (No Registration Required)
              </h2>
              <p style={{ color: '#e2e8f0', maxWidth: '680px', margin: '0.5rem auto 0', fontSize: '0.95rem', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                Test your skills instantly with our free sample assessments below. Experience the exact quality of our Armed Forces & Academic testing engine.
              </p>
            </div>

            {/* Test Selection Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
              <div 
                className={`free-test-selector-card ${activeFreeTest === 'psychological' ? 'active' : ''}`}
                onClick={() => {
                  setActiveFreeTest('psychological');
                  setPsychResult(null);
                }}
              >
                <div className="icon-wrapper" style={{ backgroundColor: 'rgba(61, 75, 38, 0.1)', color: 'var(--secondary-olive)' }}>
                  <Brain size={32} />
                </div>
                <h3>ISSB Psychological & Leadership Assessment</h3>
                <p>5 Situational Reaction Questions evaluating Officer Qualities (ISSB Standard).</p>
                <button className="btn btn-secondary btn-sm" style={{ width: '100%', marginTop: '1rem' }}>
                  {activeFreeTest === 'psychological' ? 'Active Assessment' : 'Take Free Test Now'}
                </button>
              </div>

              <div 
                className={`free-test-selector-card ${activeFreeTest === 'intelligence' ? 'active' : ''}`}
                onClick={() => {
                  setActiveFreeTest('intelligence');
                  setIntelResult(null);
                  setActiveFeaturedQuiz(null);
                }}
              >
                <div className="icon-wrapper" style={{ backgroundColor: 'rgba(17, 34, 64, 0.1)', color: 'var(--primary-navy)' }}>
                  <Zap size={32} />
                </div>
                <h3>Verbal & Non-Verbal Intelligence Test</h3>
                <p>5 Speed Reasoning Questions (PMA, PAF & Navy Entry Test standard).</p>
                <button className="btn btn-primary btn-sm" style={{ width: '100%', marginTop: '1rem' }}>
                  {activeFreeTest === 'intelligence' ? 'Active Assessment' : 'Take Free Test Now'}
                </button>
              </div>

              {featuredQuizzes.map(quiz => (
                <div 
                  key={quiz.id}
                  className={`free-test-selector-card ${activeFeaturedQuiz?.id === quiz.id ? 'active' : ''}`}
                  onClick={() => {
                    setActiveFeaturedQuiz(quiz);
                    setActiveFreeTest('featured');
                    setFeaturedQuizAnswers({});
                    setFeaturedQuizResult(null);
                  }}
                >
                  <div className="icon-wrapper" style={{ backgroundColor: 'rgba(197, 160, 89, 0.15)', color: 'var(--accent-gold-dark)' }}>
                    <Sparkles size={32} />
                  </div>
                  <h3>🔥 {quiz.title}</h3>
                  <p>{quiz.description || 'Featured free demo quiz published by academy instructors.'} ({quiz.questions?.length || 0} Questions)</p>
                  <button className="btn btn-secondary btn-sm" style={{ width: '100%', marginTop: '1rem', backgroundColor: 'var(--accent-gold-dark)', color: 'white', border: 'none' }}>
                    {activeFeaturedQuiz?.id === quiz.id ? 'Active Demo Quiz' : 'Try Free Demo Quiz'}
                  </button>
                </div>
              ))}
            </div>

            {/* TEST DISPLAY AREA */}
            {activeFreeTest === 'psychological' && (
              <div className="free-quiz-container glass-card fade-in">
                <div className="quiz-header-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                  <div>
                    <h3 style={{ fontSize: '1.25rem', color: 'var(--primary-navy)', margin: 0 }}>
                      Free ISSB Psychological & Leadership Evaluation
                    </h3>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>
                      5 Situational Judgment Questions • Instant Leadership Scoring
                    </span>
                  </div>
                  <button 
                    onClick={() => {
                      setPsychAnswers({});
                      setPsychResult(null);
                    }}
                    className="btn btn-secondary btn-sm"
                    style={{ gap: '4px' }}
                  >
                    <RotateCcw size={14} />
                    <span>Reset</span>
                  </button>
                </div>

                {!psychResult ? (
                  <div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      {PSYCHOLOGICAL_STATEMENTS.map((s, idx) => (
                        <div key={s.id} className="likert-statement-card">
                          <div className="likert-statement-text">
                            {idx + 1}. "{s.statement}"
                          </div>

                          <div className="likert-scale-row">
                            <span className="likert-side-label agree">Agree</span>
                            
                            <div className="likert-circles-group">
                              {LIKERT_SCALE_OPTIONS.map(opt => (
                                <button
                                  key={opt.val}
                                  type="button"
                                  className={`likert-circle ${opt.class} ${psychAnswers[s.id] === opt.val ? 'selected' : ''}`}
                                  onClick={() => setPsychAnswers(prev => ({ ...prev, [s.id]: opt.val }))}
                                  title={opt.label}
                                />
                              ))}
                            </div>

                            <span className="likert-side-label disagree">Disagree</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                      <button 
                        onClick={handleCalculatePsychScore}
                        className="btn btn-secondary btn-lg"
                        style={{ backgroundColor: 'var(--accent-gold-dark)', color: 'white', border: 'none', padding: '0.85rem 2.5rem', fontWeight: 700 }}
                        disabled={Object.keys(psychAnswers).length < PSYCHOLOGICAL_STATEMENTS.length}
                      >
                        Calculate My Personality Profile →
                      </button>
                      {Object.keys(psychAnswers).length < PSYCHOLOGICAL_STATEMENTS.length && (
                        <p style={{ fontSize: '0.82rem', color: 'var(--danger)', marginTop: '0.5rem', fontWeight: 600 }}>
                          Please respond to all statements to generate your personality report ({Object.keys(psychAnswers).length}/{PSYCHOLOGICAL_STATEMENTS.length} completed)
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  /* 16PERSONALITIES STYLE CADET PERSONALITY PROFILE CARD */
                  <div className="result-score-box fade-in" style={{ textAlign: 'left', padding: '2rem', backgroundColor: 'var(--bg-white)', borderRadius: '12px', border: '1px solid var(--accent-gold)', boxShadow: '0 8px 24px rgba(13, 27, 42, 0.08)' }}>
                    <div style={{ textAlign: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1.25rem' }}>
                      <span className="badge badge-secondary" style={{ backgroundColor: 'var(--accent-gold-dark)', color: 'white', padding: '4px 14px', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                        {psychResult.archetypeBadge}
                      </span>
                      <h3 style={{ fontSize: '1.75rem', color: 'var(--primary-navy)', margin: '0.5rem 0', fontWeight: 800 }}>
                        {psychResult.archetypeTitle}
                      </h3>
                      <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.4rem', color: 'var(--secondary-olive)', fontWeight: 700, fontSize: '1.1rem' }}>
                        <span>Officer Potential Index:</span>
                        <span style={{ fontSize: '2rem', color: 'var(--accent-gold-dark)', fontWeight: 800 }}>{psychResult.percentage}%</span>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
                      <div>
                        <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--primary-navy)', marginBottom: '0.85rem', letterSpacing: '0.05em', fontWeight: 700 }}>
                          Psychological Trait Breakdown
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                          {psychResult.traits.map(t => (
                            <div key={t.label}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-dark)', marginBottom: '4px' }}>
                                <span>{t.label}</span>
                                <span style={{ color: 'var(--accent-gold-dark)' }}>{t.score}%</span>
                              </div>
                              <div style={{ height: '8px', background: '#e2e8f0', borderRadius: '9999px', overflow: 'hidden' }}>
                                <div style={{ width: `${t.score}%`, height: '100%', background: 'linear-gradient(90deg, var(--primary-navy), var(--accent-gold-dark))', transition: 'width 0.8s ease-in-out' }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div style={{ backgroundColor: 'rgba(197, 160, 89, 0.05)', border: '1px solid var(--accent-gold)', borderRadius: '10px', padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                          <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--accent-gold-dark)', marginBottom: '0.5rem', fontWeight: 700 }}>
                            Tactical Profile & Service Match
                          </h4>
                          <p style={{ fontSize: '0.88rem', color: 'var(--text-dark)', lineHeight: 1.55, marginBottom: '1rem' }}>
                            {psychResult.description}
                          </p>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-light)', fontWeight: 600, display: 'block', marginBottom: '2px' }}>Recommended Commission Arms:</span>
                          <strong style={{ fontSize: '0.92rem', color: 'var(--primary-navy)' }}>{psychResult.recommendedArm}</strong>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
                      <button 
                        onClick={() => setShowLoginModal(true)}
                        className="btn btn-primary btn-lg"
                        style={{ gap: '0.5rem' }}
                      >
                        <LogIn size={18} />
                        <span>Login to Access Full 100+ ISSB Tests & Dossiers</span>
                      </button>
                      <button 
                        onClick={() => {
                          setPsychAnswers({});
                          setPsychResult(null);
                        }}
                        className="btn btn-secondary btn-lg"
                      >
                        Retake Free Test
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeFreeTest === 'intelligence' && (
              <div className="free-quiz-container glass-card fade-in">
                <div className="quiz-header-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                  <div>
                    <h3 style={{ fontSize: '1.25rem', color: 'var(--primary-navy)', margin: 0 }}>
                      Free Verbal & Non-Verbal Intelligence Sample Test
                    </h3>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>
                      5 Speed Intelligence Questions • Instant Scoring & Explanations
                    </span>
                  </div>
                  <button 
                    onClick={() => {
                      setIntelAnswers({});
                      setIntelResult(null);
                    }}
                    className="btn btn-secondary btn-sm"
                    style={{ gap: '4px' }}
                  >
                    <RotateCcw size={14} />
                    <span>Reset</span>
                  </button>
                </div>

                {!intelResult ? (
                  <div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                      {INTELLIGENCE_QUESTIONS.map((q, idx) => (
                        <div key={q.id} className="free-q-block">
                          <h4 style={{ fontSize: '1rem', color: 'var(--primary-navy)', marginBottom: '0.75rem' }}>
                            Q{idx + 1}. {q.question}
                          </h4>
                          <div className="free-options-list">
                            {q.options.map((opt, optIdx) => (
                              <label 
                                key={optIdx} 
                                className={`free-opt-label ${intelAnswers[q.id] === optIdx ? 'selected' : ''}`}
                              >
                                <input 
                                  type="radio" 
                                  name={`intel_q_${q.id}`}
                                  checked={intelAnswers[q.id] === optIdx}
                                  onChange={() => setIntelAnswers(prev => ({ ...prev, [q.id]: optIdx }))}
                                />
                                <span>{opt}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                      <button 
                        onClick={handleCalculateIntelScore}
                        className="btn btn-primary btn-lg"
                        style={{ padding: '0.75rem 2.5rem' }}
                        disabled={Object.keys(intelAnswers).length < INTELLIGENCE_QUESTIONS.length}
                      >
                        Submit & View Score Breakdown →
                      </button>
                      {Object.keys(intelAnswers).length < INTELLIGENCE_QUESTIONS.length && (
                        <p style={{ fontSize: '0.8rem', color: 'var(--danger)', marginTop: '0.5rem' }}>
                          Please answer all 5 questions to view your results ({Object.keys(intelAnswers).length}/5 answered)
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  /* RESULT CARD WITH EXPLANATIONS */
                  <div className="result-score-box fade-in">
                    <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                      <h3 style={{ fontSize: '1.5rem', color: 'var(--primary-navy)' }}>
                        Intelligence Sample Test Score
                      </h3>
                      <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--primary-navy)', margin: '0.5rem 0' }}>
                        {intelResult.score} / {intelResult.total} ({intelResult.percentage}%)
                      </div>
                    </div>

                    {/* Explanations List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
                      {INTELLIGENCE_QUESTIONS.map((q, idx) => {
                        const isCorrect = intelAnswers[q.id] === q.correctIndex;
                        return (
                          <div 
                            key={q.id} 
                            style={{ 
                              padding: '1rem', 
                              borderRadius: '8px', 
                              backgroundColor: isCorrect ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                              borderLeft: `4px solid ${isCorrect ? '#16a34a' : '#dc2626'}`
                            }}
                          >
                            <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--primary-navy)' }}>
                              Q{idx + 1}: {q.question}
                            </div>
                            <div style={{ fontSize: '0.85rem', marginTop: '4px' }}>
                              Your Answer: <strong style={{ color: isCorrect ? '#16a34a' : '#dc2626' }}>{q.options[intelAnswers[q.id]] || 'Not Answered'}</strong>
                              {!isCorrect && <span> | Correct: <strong style={{ color: '#16a34a' }}>{q.options[q.correctIndex]}</strong></span>}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginTop: '4px', fontStyle: 'italic' }}>
                              Explanation: {q.explanation}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ textAlign: 'center', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                      <p style={{ fontSize: '0.9rem', color: 'var(--text-light)', marginBottom: '1rem' }}>
                        Ready for complete timed mock exams with full performance graphs & subject progress tracking?
                      </p>
                      <button 
                        onClick={() => setShowLoginModal(true)}
                        className="btn btn-primary btn-lg"
                        style={{ gap: '0.5rem' }}
                      >
                        <LogIn size={18} />
                        <span>Login to Portal for Full Exam Library</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeFreeTest === 'featured' && activeFeaturedQuiz && (
              <div className="free-quiz-container glass-card fade-in">
                <div className="quiz-header-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                  <div>
                    <h3 style={{ fontSize: '1.25rem', color: 'var(--primary-navy)', margin: 0 }}>
                      🔥 {activeFeaturedQuiz.title}
                    </h3>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>
                      Subject: {activeFeaturedQuiz.teacherSubject || 'General'} • {activeFeaturedQuiz.questions?.length || 0} Questions • Free Homepage Evaluation
                    </span>
                  </div>
                  <button 
                    onClick={() => {
                      setFeaturedQuizAnswers({});
                      setFeaturedQuizResult(null);
                    }}
                    className="btn btn-secondary btn-sm"
                    style={{ gap: '4px' }}
                  >
                    <RotateCcw size={14} />
                    <span>Reset</span>
                  </button>
                </div>

                {!featuredQuizResult ? (
                  <div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                      {activeFeaturedQuiz.questions.map((q, idx) => (
                        <div key={q.id || idx} className="free-q-block">
                          <h4 style={{ fontSize: '1rem', color: 'var(--primary-navy)', marginBottom: '0.75rem' }}>
                            Q{idx + 1}. {q.questionText}
                          </h4>
                          {q.imageUrl && (
                            <img src={q.imageUrl} alt="Question Diagram" style={{ maxWidth: '300px', borderRadius: '6px', marginBottom: '0.75rem' }} />
                          )}
                          <div className="free-options-list">
                            {q.options.map((opt, optIdx) => (
                              <label 
                                key={optIdx} 
                                className={`free-opt-label ${featuredQuizAnswers[idx] === optIdx ? 'selected' : ''}`}
                              >
                                <input 
                                  type="radio" 
                                  name={`featured-q-${idx}`}
                                  checked={featuredQuizAnswers[idx] === optIdx}
                                  onChange={() => setFeaturedQuizAnswers(prev => ({ ...prev, [idx]: optIdx }))}
                                />
                                <span>{opt}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                      <button 
                        onClick={() => {
                          const total = activeFeaturedQuiz.questions.length;
                          const answeredCount = Object.keys(featuredQuizAnswers).length;
                          const score = answeredCount;
                          const percentage = Math.round((score / total) * 100);
                          setFeaturedQuizResult({ score, total, percentage });
                        }}
                        className="btn btn-primary btn-lg"
                        style={{ padding: '0.75rem 2.5rem', fontSize: '1rem', backgroundColor: 'var(--accent-gold-dark)', border: 'none' }}
                      >
                        Submit & Calculate Score
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="result-score-box fade-in">
                    <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                      <h3 style={{ fontSize: '1.5rem', color: 'var(--primary-navy)' }}>
                        {activeFeaturedQuiz.title} Evaluation Score
                      </h3>
                      <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--accent-gold-dark)', margin: '0.5rem 0' }}>
                        {featuredQuizResult.score} / {featuredQuizResult.total} ({featuredQuizResult.percentage}% Completed)
                      </div>
                      <p style={{ color: 'var(--secondary-olive)', fontWeight: 600 }}>
                        Great effort! Register or log in to track your detailed subject performance across all modules.
                      </p>
                    </div>

                    <div style={{ textAlign: 'center', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                      <button 
                        onClick={() => setShowLoginModal(true)}
                        className="btn btn-primary btn-lg"
                        style={{ gap: '0.5rem' }}
                      >
                        <LogIn size={18} />
                        <span>Login to Portal for Full Exam Library</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* TAB 3: WHY CHOOSE CCAP */}
        {activeTab === 'about' && (
          <section className="fade-in">
            <div className="section-header" style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
              <h2 style={{ fontSize: '1.75rem', textTransform: 'uppercase', color: '#f59e0b', fontWeight: 800, textShadow: '0 2px 10px rgba(0,0,0,0.85)' }}>
                Why Cadets Coaching Academy (CCAP)?
              </h2>
              <p style={{ color: '#e2e8f0', maxWidth: '700px', margin: '0.5rem auto 0', fontSize: '0.95rem', lineHeight: '1.6', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                We blend military-grade discipline, psychological preparation, and academic mastery to ensure 100% cadet recommendation and board exam success.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
              <div className="feature-card glass-card">
                <div className="feature-icon"><Award size={28} color="var(--accent-gold-dark)" /></div>
                <h3>PMA, PAF & Navy Officers Preparation</h3>
                <p>Structured training for PMA Long Course, PAF GDP & Aeronautical, Pakistan Navy Officer Commissions, Sailor & Airmen recruitment tests.</p>
              </div>

              <div className="feature-card glass-card">
                <div className="feature-icon"><Brain size={28} color="var(--accent-gold-dark)" /></div>
                <h3>ISSB Psychological & GTO Training</h3>
                <p>Comprehensive guidance for Situational Reaction Tests, WAT, TAT, Picture Stories, Group Task Obstacles & Ex-Officer Personal Interviews.</p>
              </div>

              <div className="feature-card glass-card">
                <div className="feature-icon"><BookOpen size={28} color="var(--accent-gold-dark)" /></div>
                <h3>Grades 1-10 Academic Excellence</h3>
                <p>Rigorous school and college academic curriculum, daily online attendance logging, subject-wise analytics, and monthly result cards.</p>
              </div>

              <div className="feature-card glass-card">
                <div className="feature-icon"><ShieldCheck size={28} color="var(--accent-gold-dark)" /></div>
                <h3>Boys & Girls Dedicated Campuses</h3>
                <p>Separate campus management, attendance logging, and physical training schedules under strict security protocols.</p>
              </div>
            </div>
          </section>
        )}

      </main>

      {/* FOOTER */}
      <footer className="landing-footer">
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <img src="/logo.png?v=4" alt="CCAP Logo" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
            <div>
              <span style={{ fontWeight: 700, color: 'var(--text-white)', fontSize: '0.9rem' }}>Cadets Coaching Academy</span>
              <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Discipline • Courage • Excellence</div>
            </div>
          </div>

          <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>
            © 2026 Cadets Coaching Academy. All Rights Reserved.
          </div>

          <button 
            onClick={() => setShowLoginModal(true)} 
            className="btn btn-secondary btn-sm"
            style={{ backgroundColor: 'var(--accent-gold-dark)', border: 'none' }}
          >
            Portal Access
          </button>
        </div>
      </footer>

      {/* 🔐 LOGIN MODAL POPUP */}
      {showLoginModal && (
        <div className="modal-backdrop fade-in" onClick={() => setShowLoginModal(false)}>
          <div className="login-modal-content glass-card" onClick={(e) => e.stopPropagation()}>
            <button 
              onClick={() => setShowLoginModal(false)}
              className="modal-close-btn"
              title="Close Modal"
            >
              <X size={20} />
            </button>
            <Login />
          </div>
        </div>
      )}
    </div>
  );
};
