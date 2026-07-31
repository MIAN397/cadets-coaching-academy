import React, { useEffect, useState, useRef, useMemo } from 'react';
import { collection, doc, setDoc, getDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import type { UserProfile, Quiz, Submission, AttendanceRecord } from '../types';
import { Clock, FileText, User, Calendar, Check, AlertCircle, ArrowRight, Award, BarChart2, Sparkles } from 'lucide-react';
import { getEffectiveFinancials } from '../utils/financials';
import { calculateStudentAcademicMetrics, getPerformanceTier, isStudentEligibleForQuiz } from '../utils/academic';

const getYearlyFee = (amount: number, duration: string): number => {
  const durLower = duration.toLowerCase().trim();
  if (durLower === 'monthly') return amount * 12;
  if (durLower === '3-months' || durLower === '3 months' || durLower === 'quarterly') return amount * 4;
  if (durLower === '6-months' || durLower === '6 months' || durLower === 'half-yearly') return amount * 2;
  if (durLower === 'year' || durLower === 'yearly' || durLower === '1-year' || durLower === '1 year' || durLower === 'annually') return amount * 1;
  
  // Parse custom duration (e.g. "2 Months" -> 6 times)
  const matchMonths = durLower.match(/(\d+)\s*month/);
  if (matchMonths) {
    const m = parseInt(matchMonths[1]);
    if (m > 0) return amount * (12 / m);
  }
  
  const matchWeeks = durLower.match(/(\d+)\s*week/);
  if (matchWeeks) {
    const w = parseInt(matchWeeks[1]);
    if (w > 0) return amount * (52 / w);
  }

  return amount; // fallback
};

interface StudentDashboardProps {
  studentProfile: UserProfile;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({ studentProfile }) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'quizzes' | 'attendance'>('quizzes');
  


  // Academic / Quiz state
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [mySubmissions, setMySubmissions] = useState<Record<string, Submission>>({});
  
  // Active Attempt state
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [timeLeft, setTimeLeft] = useState<number>(0); // in seconds
  const timerRef = useRef<any | null>(null);
  
  // Results view modal
  const [reviewSubmission, setReviewSubmission] = useState<Submission | null>(null);
  const [reviewCorrectAnswers, setReviewCorrectAnswers] = useState<Record<string, number>>({});
  const [showQuizResultPopup, setShowQuizResultPopup] = useState<{ score: number; total: number; pct: number; subject: string; teacher: string } | null>(null);

  // Attendance history
  const [myAttendance, setMyAttendance] = useState<AttendanceRecord[]>([]);
  const [workingDays, setWorkingDays] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'danger', text: string } | null>(null);
  const [profileState, setProfileState] = useState<UserProfile>(studentProfile);

  const subsList = useMemo(() => Object.values(mySubmissions), [mySubmissions]);
  const { overallStats, subjectMetrics } = useMemo(
    () => calculateStudentAcademicMetrics(subsList),
    [subsList]
  );

  const fetchStudentData = async () => {
    setLoading(true);
    try {
      // Fetch latest profile details (e.g. for financials)
      const profileDoc = await getDoc(doc(db, 'users', studentProfile.email.toLowerCase()));
      if (profileDoc.exists()) {
        setProfileState(profileDoc.data() as UserProfile);
      }

      // 1. Fetch available quizzes
      const quizzesSnap = await getDocs(collection(db, 'quizzes'));
      const fetchedQuizzes: Quiz[] = [];
      quizzesSnap.forEach(d => {
        fetchedQuizzes.push({ id: d.id, ...d.data() } as Quiz);
      });
      setQuizzes(fetchedQuizzes);

      // 2. Fetch my submissions
      const submissionsQuery = query(collection(db, 'submissions'), where('studentUid', '==', studentProfile.uid));
      const submissionsSnap = await getDocs(submissionsQuery);
      const subsMap: Record<string, Submission> = {};
      submissionsSnap.forEach(d => {
        const sub = d.data() as Submission;
        subsMap[sub.quizId] = sub;
      });
      setMySubmissions(subsMap);

      // 3. Fetch my attendance records
      const attendanceQuery = query(collection(db, 'attendance'), where('userEmail', '==', studentProfile.email));
      const attendanceSnap = await getDocs(attendanceQuery);
      const fetchedAttendance: AttendanceRecord[] = [];
      attendanceSnap.forEach(d => {
        fetchedAttendance.push(d.data() as AttendanceRecord);
      });
      fetchedAttendance.sort((a, b) => b.date.localeCompare(a.date));
      setMyAttendance(fetchedAttendance);

      // 4. Fetch working days
      const workingSnap = await getDocs(collection(db, 'working_days'));
      const fetchedWorking: string[] = [];
      workingSnap.forEach(d => {
        fetchedWorking.push(d.id);
      });
      setWorkingDays(fetchedWorking);
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'danger', text: "Failed to load database: " + err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudentData();
  }, [activeTab]);



  // Timed Quiz logic
  const startQuiz = async (quiz: Quiz) => {
    if (window.confirm(`Start timed attempt for "${quiz.title}"? You will have ${quiz.duration} minutes. The quiz will auto-submit when the timer expires.`)) {
      try {
        const quizDocSnap = await getDoc(doc(db, 'quizzes', quiz.id));
        const targetQuiz: Quiz = quizDocSnap.exists()
          ? ({ id: quizDocSnap.id, ...quizDocSnap.data() } as Quiz)
          : quiz;
        setActiveQuiz(targetQuiz);
        setQuizAnswers({});
        setTimeLeft((targetQuiz.duration || 10) * 60);
        setActiveTab('quizzes');
      } catch (err: any) {
        console.error(err);
        setActiveQuiz(quiz);
        setQuizAnswers({});
        setTimeLeft((quiz.duration || 10) * 60);
        setActiveTab('quizzes');
      }
    }
  };

  // Timer effect
  useEffect(() => {
    if (activeQuiz && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            // Auto-submit
            submitQuiz(activeQuiz, quizAnswers, true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeQuiz, quizAnswers]);

  const selectAnswer = (questionId: string, optionIndex: number) => {
    setQuizAnswers(prev => ({
      ...prev,
      [questionId]: optionIndex
    }));
  };

  const submitQuiz = async (quiz: Quiz, answersToSubmit: Record<string, number>, isAutoSubmit = false) => {
    if (!isAutoSubmit && !window.confirm("Are you sure you want to finalize and submit your quiz answers?")) return;
    
    if (timerRef.current) clearInterval(timerRef.current);
    setLoading(true);
    setMessage(null);

    const submissionDocId = `${studentProfile.uid}_${quiz.id}`;

    try {
      // 1. Save base submission first (to satisfy security rules for reading answer key!)
      // Store dummy score initially or calculate post-fetch
      const tempSubmission: Submission = {
        id: submissionDocId,
        studentUid: studentProfile.uid,
        studentEmail: studentProfile.email,
        studentName: studentProfile.displayName,
        quizId: quiz.id,
        quizTitle: quiz.title,
        answers: answersToSubmit,
        score: 0,
        totalQuestions: quiz.questions.length,
        submittedAt: new Date(),
        teacherName: quiz.teacherName || 'Unknown Teacher',
        teacherSubject: quiz.teacherSubject || 'General',
        campus: profileState.campus || studentProfile.campus || 'boys'
      };

      await setDoc(doc(db, 'submissions', submissionDocId), {
        ...tempSubmission,
        submittedAt: serverTimestamp()
      });

      // 2. Fetch correct answers from the secure database (allowed now because submission doc exists!)
      const answersDoc = await getDoc(doc(db, 'quiz_answers', quiz.id));
      if (!answersDoc.exists()) {
        throw new Error("Answer key not found on server database.");
      }
      
      const correctAnswers = answersDoc.data().answers as Record<string, number>;

      // 3. Grade the attempt client-side
      let calculatedScore = 0;
      quiz.questions.forEach(q => {
        if (answersToSubmit[q.id] === correctAnswers[q.id]) {
          calculatedScore++;
        }
      });

      // 4. Update the submission with final calculated score
      const finalSubmission: Submission = {
        ...tempSubmission,
        score: calculatedScore
      };

      await setDoc(doc(db, 'submissions', submissionDocId), {
        ...finalSubmission,
        submittedAt: serverTimestamp()
      });

      // Update local submissions list
      setMySubmissions(prev => ({
        ...prev,
        [quiz.id]: finalSubmission
      }));

      // Exit active attempt mode
      setActiveQuiz(null);
      
      const pct = Math.round((calculatedScore / quiz.questions.length) * 100);
      setShowQuizResultPopup({
        score: calculatedScore,
        total: quiz.questions.length,
        pct: pct,
        subject: quiz.teacherSubject || 'General',
        teacher: quiz.teacherName || 'Unknown Teacher'
      });

      if (isAutoSubmit) {
        alert("TIME EXPIRED! Your quiz has been auto-submitted.");
      }

      // Open review immediately behind the popup
      setReviewSubmission(finalSubmission);
      setReviewCorrectAnswers(correctAnswers);
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'danger', text: "Failed to grade and save quiz attempt: " + err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleReviewResults = async (sub: Submission) => {
    setLoading(true);
    try {
      // Fetch answers key (security rules allow because this student's submission document exists)
      const answersDoc = await getDoc(doc(db, 'quiz_answers', sub.quizId));
      if (answersDoc.exists()) {
        setReviewSubmission(sub);
        setReviewCorrectAnswers(answersDoc.data().answers);
      }
    } catch (err: any) {
      console.error(err);
      alert("Failed to load results details: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Format time remaining MM:SS
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const studentInstallments = profileState.financials?.installments || [];
  const hasStudentInstallments = studentInstallments.length > 0;
  const effectiveFin = getEffectiveFinancials(profileState.financials);

  const totalPaidInstallments = hasStudentInstallments 
    ? studentInstallments.filter((i: any) => i.paymentStatus === 'Paid').reduce((sum: number, i: any) => sum + i.amount, 0)
    : (effectiveFin.paymentStatus === 'Paid' ? (effectiveFin.amount || 0) : 0);

  const totalUnpaidInstallments = hasStudentInstallments
    ? studentInstallments.filter((i: any) => i.paymentStatus !== 'Paid').reduce((sum: number, i: any) => sum + i.amount, 0)
    : (effectiveFin.paymentStatus === 'Unpaid' ? (effectiveFin.amount || 0) : 0);

  // Next due installment
  const nextUnpaidInstallment = hasStudentInstallments
    ? [...studentInstallments].sort((a: any, b: any) => a.dueDate.localeCompare(b.dueDate)).find((i: any) => i.paymentStatus !== 'Paid')
    : null;

  const nextDueAmount = nextUnpaidInstallment
    ? nextUnpaidInstallment.amount
    : ((effectiveFin.paymentStatus === 'Unpaid' || effectiveFin.paymentStatus === 'Pending') ? (effectiveFin.amount || 0) : 0);

  return (
    <div className="fade-in">
      {/* Active Quiz View overrides standard dashboard tabs */}
      {activeQuiz ? (
        <div className="fade-in quiz-attempt-layout">
          <div className="quiz-timer-bar">
            <div>
              <h2 style={{ fontSize: '1.25rem', border: 'none', padding: 0, color: 'var(--text-white)' }}>
                Attempting: {activeQuiz.title}
              </h2>
              <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                Ensure you submit before the countdown hits zero. Auto-submit will trigger.
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Clock size={24} color="var(--accent-gold)" />
              <div className={`timer-countdown ${timeLeft < 30 ? 'warning animate-pulse' : ''}`}>
                {formatTime(timeLeft)}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {activeQuiz.questions.map((q, idx) => (
              <div key={q.id} className="quiz-question-attempt">
                <h3>Q{idx + 1}. {q.questionText}</h3>
                {q.imageUrl && (
                  <div className="quiz-question-image-wrapper">
                    <img src={q.imageUrl} alt={`Question ${idx + 1} Visual`} className="quiz-question-image" />
                  </div>
                )}
                <div className="quiz-options-grid">
                  {q.options.map((opt, oIdx) => (
                    <label 
                      key={oIdx} 
                      className={`quiz-option-label ${quizAnswers[q.id] === oIdx ? 'selected' : ''}`}
                    >
                      <input 
                        type="radio" 
                        name={`q_${q.id}`} 
                        checked={quizAnswers[q.id] === oIdx}
                        onChange={() => selectAnswer(q.id, oIdx)}
                        disabled={loading}
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <button 
            type="button" 
            onClick={() => submitQuiz(activeQuiz, quizAnswers)} 
            className="btn btn-secondary"
            disabled={loading}
            style={{ marginTop: '2rem', height: '50px' }}
          >
            {loading ? 'Submitting Answers...' : 'Finalize & Submit Test'}
          </button>
        </div>
      ) : (
        <>
          <div className="dashboard-header">
            <div>
              <h2>Cadet Personal Dashboard</h2>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-light)', fontWeight: 500 }}>
                Service Number: {studentProfile.registrationDetails?.cadetNumber || 'Pending Assignment'}
              </span>
            </div>
            
            <div className="segmented-control">
              <button 
                onClick={() => setActiveTab('quizzes')} 
                className={`segmented-btn ${activeTab === 'quizzes' ? 'active' : ''}`}
              >
                <FileText size={14} />
                Online Quizzes
              </button>
              <button 
                onClick={() => setActiveTab('attendance')} 
                className={`segmented-btn ${activeTab === 'attendance' ? 'active' : ''}`}
              >
                <Calendar size={14} />
                My Attendance
              </button>
              <button 
                onClick={() => setActiveTab('profile')} 
                className={`segmented-btn ${activeTab === 'profile' ? 'active' : ''}`}
              >
                <User size={14} />
                Registration Info
              </button>
            </div>
          </div>

          {message && (
            <div className={`alert alert-${message.type}`}>
              {message.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
              <span>{message.text}</span>
            </div>
          )}

          {/* Dynamic Guidance Banner for Students */}
          <div className="guidance-banner fade-in" style={{ marginBottom: '1.5rem' }}>
            <Sparkles size={18} color="var(--accent-gold-dark)" />
            <div>
              {activeTab === 'quizzes' && (
                <span><strong>Cadet Portal Guide:</strong> Launch assigned timed examinations, review completed test scores, and inspect your subject-wise academic breakdown.</span>
              )}
              {activeTab === 'attendance' && (
                <span><strong>Attendance Guide:</strong> Inspect your official physical session and academic class attendance history logged by academy administration.</span>
              )}
              {activeTab === 'profile' && (
                <span><strong>Profile & Credentials Guide:</strong> Inspect your registered cadet information, category, batch assignment, and financial plan summary.</span>
              )}
            </div>
          </div>

          {/* TAB 1: TIMED QUIZZES */}
          {activeTab === 'quizzes' && (
            <div className="fade-in">
              {/* R1: Academic Progress Overview & Visual Cards */}
              <div className="academic-performance-container" style={{ marginBottom: '2.5rem' }}>
                <h3 style={{ fontSize: '1.2rem', textTransform: 'uppercase', color: 'var(--primary-navy)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <BarChart2 size={20} color="var(--accent-gold-dark)" />
                  Academic Performance & Subject Metrics
                </h3>

                {/* Overall Summary Cards */}
                <div className="stats-grid" style={{ marginBottom: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                  <div 
                    className="stat-card gold clickable" 
                    onClick={() => {
                      const el = document.getElementById('subject-breakdown-section');
                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }}
                    style={{ padding: '1.25rem', cursor: 'pointer' }}
                    title="Click to jump to Subject Breakdown"
                  >
                    <span className="stat-title" style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-light)', fontWeight: 700 }}>Cumulative Score</span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.4rem' }}>
                      <span className="stat-value" style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--accent-gold-dark)' }}>
                        {subsList.length > 0 ? `${overallStats.overallPercentage}%` : 'N/A'}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>
                        ({overallStats.totalCorrect} / {overallStats.totalQuestions} MCQs)
                      </span>
                    </div>
                    <div style={{ marginTop: '0.75rem', background: '#e2e8f0', borderRadius: '9999px', height: '8px', overflow: 'hidden' }}>
                      <div 
                        style={{ 
                          width: `${overallStats.overallPercentage}%`, 
                          height: '100%', 
                          background: getPerformanceTier(overallStats.overallPercentage).barGradient,
                          transition: 'width 0.6s ease-in-out'
                        }} 
                      />
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--accent-gold-dark)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px', marginTop: '0.4rem' }}>
                      Subject Breakdown &rarr;
                    </span>
                  </div>

                  <div 
                    className="stat-card navy clickable" 
                    onClick={() => {
                      const el = document.getElementById('assigned-quizzes-section');
                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }}
                    style={{ padding: '1.25rem', cursor: 'pointer' }}
                    title="Click to jump to Assigned Timed Examinations"
                  >
                    <span className="stat-title" style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-light)', fontWeight: 700 }}>Total Quizzes Attempted</span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.4rem' }}>
                      <span className="stat-value" style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--primary-navy)' }}>
                        {overallStats.totalQuizzesAttempted}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>
                        Across {subjectMetrics.length} Subject{subjectMetrics.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--primary-navy)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px', marginTop: '0.8rem' }}>
                      View Assigned Examinations &rarr;
                    </span>
                  </div>
                </div>

                {/* Subject Visual Cards Grid */}
                <h4 id="subject-breakdown-section" style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-light)', marginBottom: '1rem', letterSpacing: '0.05em', fontWeight: 700 }}>
                  Subject-Wise Breakdown Cards
                </h4>

                {subjectMetrics.length === 0 ? (
                  <div style={{ padding: '1.5rem', backgroundColor: 'var(--bg-slate)', borderRadius: '8px', border: '1px dashed var(--border-color)', textAlign: 'center', color: 'var(--text-light)' }}>
                    No quiz submissions completed yet. Launch an assigned quiz below to calculate your subject performance!
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
                    {subjectMetrics.map(subj => {
                      const tier = getPerformanceTier(subj.percentage);
                      return (
                        <div 
                          key={subj.subject} 
                          className="stat-card" 
                          style={{ 
                            borderTop: `4px solid ${tier.color}`, 
                            padding: '1.25rem',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: '0.75rem'
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                              <div>
                                <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--primary-navy)', margin: 0 }}>
                                  {subj.subject}
                                </h4>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                                  Instructor: {subj.teacherName || 'Academy Faculty'}
                                </span>
                              </div>
                              <span 
                                className="badge" 
                                style={{ 
                                  backgroundColor: tier.bg, 
                                  color: tier.text, 
                                  border: `1px solid ${tier.border}`,
                                  fontSize: '0.7rem',
                                  fontWeight: 700,
                                  padding: '2px 8px'
                                }}
                              >
                                {tier.label}
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.5rem' }}>
                              <span style={{ fontSize: '1.8rem', fontWeight: 800, color: tier.color }}>
                                {subj.percentage}%
                              </span>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>
                                ({subj.totalCorrect} / {subj.totalQuestions} MCQs)
                              </span>
                            </div>
                          </div>

                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-light)', marginBottom: '0.35rem', fontWeight: 600 }}>
                              <span>Accuracy Progress</span>
                              <span>{subj.percentage}%</span>
                            </div>
                            <div 
                              style={{ 
                                background: '#e2e8f0', 
                                borderRadius: '9999px', 
                                height: '10px', 
                                overflow: 'hidden',
                                width: '100%'
                              }}
                            >
                              <div 
                                style={{ 
                                  width: `${subj.percentage}%`, 
                                  height: '100%', 
                                  background: tier.barGradient,
                                  borderRadius: '9999px',
                                  transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
                                }} 
                              />
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginTop: '0.5rem', textAlign: 'right' }}>
                              {subj.totalQuizzesAttempted} quiz attempt{subj.totalQuizzesAttempted === 1 ? '' : 's'}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <h3 id="assigned-quizzes-section" style={{ fontSize: '1.2rem', textTransform: 'uppercase', color: 'var(--primary-navy)', marginBottom: '1.25rem' }}>
                Assigned Timed Examinations
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
                {(() => {
                  const visibleQuizzes = quizzes.filter(quiz => isStudentEligibleForQuiz(quiz, profileState));

                  if (visibleQuizzes.length === 0) {
                    return <p style={{ color: 'var(--text-light)' }}>No active quizzes assigned to you or your batch.</p>;
                  }

                  return visibleQuizzes.map(quiz => {
                    const attempted = mySubmissions[quiz.id];
                    return (
                      <div key={quiz.id} className="stat-card" style={{ borderTop: '4px solid var(--primary-navy)' }}>
                        <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary-navy)', marginBottom: '0.25rem' }}>
                          {quiz.title}
                        </h4>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', marginBottom: '1rem', flexGrow: 1 }}>
                          {quiz.description}
                        </p>
                        
                        <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8rem', color: 'var(--text-light)', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                          <span className="badge badge-secondary" style={{ backgroundColor: 'var(--primary-navy-light)', color: 'white', border: 'none', padding: '2px 6px', fontSize: '0.75rem' }}>
                            {quiz.teacherSubject || 'General'}
                          </span>
                          <span>•</span>
                          <span>Instructor: {quiz.teacherName || 'Unknown'}</span>
                          <span>•</span>
                          <span>{quiz.duration} Mins</span>
                          <span>•</span>
                          <span>{quiz.questions.length} Questions</span>
                          <span>•</span>
                          <span>
                             Target: {
                              quiz.assignToType === 'custom-target' ? (() => {
                                const parts = [];
                                if (quiz.targetBatch && quiz.targetBatch !== 'all') parts.push(`Batch: ${quiz.targetBatch}`);
                                if (quiz.targetCategory && quiz.targetCategory !== 'all') parts.push(`Category: ${quiz.targetCategory}`);
                                if (quiz.targetClasses) parts.push(`Classes: ${quiz.targetClasses}`);
                                if (quiz.targetSections) parts.push(`Sections: ${quiz.targetSections}`);
                                return parts.join(' | ') || 'All Cadets';
                              })() :
                              quiz.assignToType === 'all' ? 'All Cadets' :
                              quiz.assignToType === 'batch' ? `Batch: ${quiz.assignToValue}` :
                              quiz.assignToType === 'student' ? `Student: ${quiz.assignToValue}` :
                              quiz.assignToType === 'category' ? `Category: ${quiz.assignToValue}` :
                              quiz.assignToType === 'class-physical-group' ? (() => {
                                if (!quiz.assignToValue) return 'N/A';
                                const [classKey, physicalGroup] = quiz.assignToValue.split('|');
                                const className = classKey.includes(':') ? classKey.split(':')[1] : classKey;
                                return `${className} (${physicalGroup})`;
                              })() :
                              `Classes: ${quiz.assignToValue ? quiz.assignToValue.split(',').map((c: string) => c.includes(':') ? c.split(':')[1] : c).join(', ') : 'N/A'}`
                            }
                          </span>
                        </div>

                        {attempted ? (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-slate)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div>
                              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-light)' }}>Attempted Score</span>
                              <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{attempted.score} / {attempted.totalQuestions}</div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <button 
                                onClick={() => handleReviewResults(attempted)} 
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '0.35rem 0.65rem' }}
                              >
                                Review Result
                              </button>
                              {quiz.allowRetakeForPreviousTakers && (
                                <button 
                                  onClick={() => startQuiz(quiz)} 
                                  className="btn btn-secondary btn-sm"
                                  style={{ padding: '0.35rem 0.65rem', backgroundColor: 'var(--accent-gold-dark)', border: 'none', color: 'white' }}
                                >
                                  Retake Quiz
                                </button>
                              )}
                            </div>
                          </div>
                        ) : (
                          <button 
                            onClick={() => startQuiz(quiz)} 
                            className="btn btn-secondary btn-sm"
                            style={{ display: 'flex', alignItems: 'center', gap: '4px', alignSelf: 'flex-start' }}
                          >
                            <span>Launch Quiz</span>
                            <ArrowRight size={14} />
                          </button>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* TAB 2: PERSONAL ATTENDANCE */}
          {activeTab === 'attendance' && (() => {
            const activeAttendance = myAttendance.filter(r => workingDays.includes(r.date));

            const isAcademicOnly = (profileState.registrationDetails?.category === 'Academics') || 
                                   (studentProfile.registrationDetails?.category === 'Academics') ||
                                   (profileState.registrationDetails?.joinPhysical === false) ||
                                   (studentProfile.registrationDetails?.joinPhysical === false);

            const isNoPhysical = (profileState.registrationDetails?.joinPhysical === false) || (studentProfile.registrationDetails?.joinPhysical === false);

            const physLogged = activeAttendance.filter(r => r.physicalAttendance !== 'Excused');
            const physPresent = physLogged.filter(r => r.physicalAttendance === 'Present').length;
            const physPct = isAcademicOnly 
              ? (isNoPhysical ? 'N/A (No Physical)' : 'N/A (Academic Only)') 
              : (physLogged.length > 0 ? `${Math.round((physPresent / physLogged.length) * 100)}%` : 'N/A');

            const acadLogged = activeAttendance.filter(r => r.academicAttendance !== 'Excused');
            const acadPresent = acadLogged.filter(r => r.academicAttendance === 'Present').length;
            const acadPct = acadLogged.length > 0 ? `${Math.round((acadPresent / acadLogged.length) * 100)}%` : 'N/A';

            return (
              <div className="fade-in">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '1.2rem', textTransform: 'uppercase', color: 'var(--primary-navy)', margin: 0 }}>
                    My Academic & Physical Attendance Logs
                  </h3>
                </div>

                {/* Percentage Stats Grid */}
                <div className="stats-grid" style={{ marginBottom: '1.5rem', gridTemplateColumns: '1fr 1fr' }}>
                  <div className="stat-card navy" style={{ padding: '1.25rem' }}>
                    <span className="stat-title" style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-light)', fontWeight: 600 }}>Overall Physical Attendance</span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <span className="stat-value" style={{ fontSize: isAcademicOnly ? '1.4rem' : '1.8rem', fontWeight: 800, color: 'var(--primary-navy)' }}>{physPct}</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>
                        {isAcademicOnly ? (isNoPhysical ? '(No Physical Classes)' : '(Academics Category)') : `(${physPresent} of ${physLogged.length} logged sessions)`}
                      </span>
                    </div>
                  </div>
                  <div className="stat-card gold" style={{ padding: '1.25rem' }}>
                    <span className="stat-title" style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-light)', fontWeight: 600 }}>Overall Academic Attendance</span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <span className="stat-value" style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent-gold-dark)' }}>{acadPct}</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>({acadPresent} of {acadLogged.length} logged sessions)</span>
                    </div>
                  </div>
                </div>

                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Physical Session Attendance</th>
                        <th>Academic Class Attendance</th>
                        <th>Logged By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myAttendance.filter(rec => workingDays.includes(rec.date)).length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-light)' }}>
                            No attendance records found for your profile. Daily checks are logged by Admins.
                          </td>
                        </tr>
                      ) : (
                        myAttendance.filter(rec => workingDays.includes(rec.date)).map(rec => (
                          <tr key={rec.id}>
                            <td style={{ fontWeight: 600 }}>{rec.date}</td>
                            <td>
                              <span className={`badge badge-${rec.physicalAttendance.toLowerCase()}`}>
                                {rec.physicalAttendance}
                              </span>
                            </td>
                            <td>
                              <span className={`badge badge-${rec.academicAttendance.toLowerCase()}`}>
                                {rec.academicAttendance}
                              </span>
                            </td>
                            <td style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>
                              {rec.loggedBy === 'developer_seed' ? 'System Seeder' : 'Academy Admin'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* TAB 3: PROFILE REGISTRATION VIEW & EDIT */}
          {activeTab === 'profile' && (() => {
            // Calculate academic performance stats from mySubmissions
            const subsList = Object.values(mySubmissions);
            
            // Calculate overall correct answers and total questions
            let totalCorrect = 0;
            let totalQuestions = 0;
            const subjectStats: Record<string, { correct: number; total: number; teacher: string }> = {};

            subsList.forEach(sub => {
              totalCorrect += sub.score;
              totalQuestions += sub.totalQuestions;

              const subject = sub.teacherSubject || 'General';
              const teacherName = sub.teacherName || 'Unknown Teacher';
              if (!subjectStats[subject]) {
                subjectStats[subject] = { correct: 0, total: 0, teacher: teacherName };
              }
              subjectStats[subject].correct += sub.score;
              subjectStats[subject].total += sub.totalQuestions;
            });

            const overallQuizPct = totalQuestions > 0 ? `${Math.round((totalCorrect / totalQuestions) * 100)}%` : 'N/A';

            return (
              <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem', alignItems: 'start' }}>
                <div>
                  <h3 style={{ fontSize: '1.2rem', textTransform: 'uppercase', color: 'var(--primary-navy)', marginBottom: '1.25rem' }}>
                    Registration Dossier
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', backgroundColor: 'var(--bg-slate)', padding: '2rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase' }}>Cadet Full Name</span>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary-navy)' }}>{profileState.displayName}</div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                      <div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase' }}>Cadet Number</span>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--secondary-olive)' }}>{profileState.registrationDetails?.cadetNumber || 'N/A'}</div>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase' }}>Batch Code</span>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{profileState.registrationDetails?.batch || 'N/A'}</div>
                      </div>
                    </div>

                    <div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase' }}>Company / Physical Group</span>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{profileState.registrationDetails?.physicalGroup || 'N/A'}</div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                      <div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase' }}>Category</span>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{profileState.registrationDetails?.category || 'N/A'}</div>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase' }}>Class / Sub-Category</span>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{profileState.registrationDetails?.subCategory || 'N/A'}</div>
                      </div>
                    </div>

                    <div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase' }}>Contact Phone</span>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{profileState.registrationDetails?.phone || 'N/A'}</div>
                    </div>
                    
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <AlertCircle size={12} />
                      <span>Only Academy Administrators or Developers can modify cadet dossier details.</span>
                    </div>
                  </div>

                  <h3 style={{ fontSize: '1.2rem', textTransform: 'uppercase', color: 'var(--primary-navy)', marginTop: '2rem', marginBottom: '1.25rem' }}>
                    Financial Ledger
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', backgroundColor: 'var(--bg-slate)', padding: '2rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>
                      <div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase' }}>Current Cycle Fee</span>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary-navy)' }}>
                          {effectiveFin.amount ? `PKR ${effectiveFin.amount}` : 'PKR 0 (Not Assigned)'}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase' }}>Billing Frequency</span>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                          {profileState.financials?.duration || 'Monthly'}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase' }}>Yearly Total</span>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent-gold-dark)' }}>
                          PKR {profileState.financials?.yearlyTotal !== undefined ? profileState.financials.yearlyTotal : (effectiveFin.amount ? getYearlyFee(effectiveFin.amount, profileState.financials?.duration || 'Monthly') : 0)}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                      <div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase' }}>Due Date</span>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                          {effectiveFin.dueDate || 'N/A'}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase' }}>Payment Status</span>
                        <div style={{ marginTop: '4px' }}>
                          <span className={`badge badge-${(effectiveFin.paymentStatus || 'Unpaid').toLowerCase()}`}>
                            {effectiveFin.paymentStatus || 'Unpaid'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem', marginTop: '0.5rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary-navy)', textTransform: 'uppercase', display: 'block', marginBottom: '0.75rem' }}>
                        Yearly Payment Progress / Status
                      </span>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                        <div style={{ backgroundColor: 'var(--bg-white)', padding: '0.75rem 1rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-light)', fontWeight: 600, textTransform: 'uppercase', display: 'block' }}>Paid Amount</span>
                          <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--success)' }}>
                            PKR {totalPaidInstallments}
                          </span>
                        </div>
                        <div style={{ backgroundColor: 'var(--bg-white)', padding: '0.75rem 1rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-light)', fontWeight: 600, textTransform: 'uppercase', display: 'block' }}>Unpaid Amount</span>
                          <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--danger)' }}>
                            PKR {totalUnpaidInstallments}
                          </span>
                        </div>
                        <div style={{ backgroundColor: 'var(--bg-white)', padding: '0.75rem 1rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-light)', fontWeight: 600, textTransform: 'uppercase', display: 'block' }}>To Pay (Due Soon)</span>
                          <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-gold-dark)' }}>
                            PKR {nextDueAmount}
                          </span>
                        </div>
                      </div>
                    </div>

                    {hasStudentInstallments && (
                      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem', marginTop: '0.5rem' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary-navy)', textTransform: 'uppercase', display: 'block', marginBottom: '0.75rem' }}>
                          Installment & Payment Schedule
                        </span>
                        <div className="table-wrapper" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                          <table style={{ margin: 0, fontSize: '0.8rem', width: '100%', backgroundColor: 'var(--bg-white)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                            <thead>
                              <tr style={{ backgroundColor: 'var(--bg-slate)' }}>
                                <th style={{ padding: '8px' }}>Installment</th>
                                <th style={{ padding: '8px' }}>Due Date</th>
                                <th style={{ padding: '8px' }}>Amount</th>
                                <th style={{ padding: '8px', textAlign: 'right' }}>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {studentInstallments.map((inst: any, index: number) => (
                                <tr key={index}>
                                  <td style={{ padding: '8px', fontWeight: 600 }}>Installment #{index + 1}</td>
                                  <td style={{ padding: '8px' }}>{inst.dueDate}</td>
                                  <td style={{ padding: '8px', fontWeight: 700 }}>PKR {inst.amount}</td>
                                  <td style={{ padding: '8px', textAlign: 'right' }}>
                                    <span className={`badge badge-${inst.paymentStatus.toLowerCase()}`} style={{ fontSize: '0.75rem', padding: '2px 6px' }}>
                                      {inst.paymentStatus}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 style={{ fontSize: '1.2rem', textTransform: 'uppercase', color: 'var(--primary-navy)', marginBottom: '1.25rem' }}>
                    Academic Performance (Quizzes)
                  </h3>

                  {/* Overall Card */}
                  <div className="stat-card gold" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                    <span className="stat-title" style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-light)', fontWeight: 600 }}>Overall Quiz Score</span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <span className="stat-value" style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--accent-gold-dark)' }}>{overallQuizPct}</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>({totalCorrect} correct answers out of {totalQuestions} MCQs)</span>
                    </div>
                  </div>

                  {/* Subject Breakdown */}
                  <h4 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--text-light)', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem' }}>
                    Subject-Wise Breakdown
                  </h4>
                  {Object.keys(subjectStats).length === 0 ? (
                    <div style={{ padding: '1.5rem', backgroundColor: 'var(--bg-slate)', borderRadius: '8px', border: '1px dashed var(--border-color)', textAlign: 'center', color: 'var(--text-light)' }}>
                      No quiz submissions registered yet.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {Object.entries(subjectStats).map(([subName, stats]) => {
                        const pct = stats.total > 0 ? `${Math.round((stats.correct / stats.total) * 100)}%` : 'N/A';
                        return (
                          <div key={subName} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-slate)', padding: '1rem 1.25rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                            <div>
                              <div style={{ fontWeight: 700, color: 'var(--primary-navy)', fontSize: '0.95rem' }}>{subName}</div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginTop: '0.15rem' }}>Instructor: {stats.teacher}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--secondary-olive)' }}>{pct}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>({stats.correct}/{stats.total} pts)</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* RESULTS REVIEW MODAL */}
          {reviewSubmission && (
            <div className="modal-overlay">
              <div className="modal-content fade-in" style={{ maxWidth: '750px', maxHeight: '90vh', overflowY: 'auto' }}>
                <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3>Review: {reviewSubmission.quizTitle}</h3>
                  <div className="user-badge" style={{ backgroundColor: 'var(--primary-navy-dark)', color: 'var(--accent-gold)' }}>
                    Score: {reviewSubmission.score} / {reviewSubmission.totalQuestions}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                  {quizzes.find(q => q.id === reviewSubmission.quizId)?.questions.map((question, idx) => {
                    const studentAns = reviewSubmission.answers[question.id];
                    const correctAns = reviewCorrectAnswers[question.id];
                    const isCorrect = studentAns === correctAns;

                    return (
                      <div key={question.id} className="result-breakdown-card" style={{ borderLeft: `5px solid ${isCorrect ? 'var(--success)' : 'var(--danger)'}` }}>
                        <div className="result-breakdown-header">
                          Q{idx + 1}. {question.questionText}
                        </div>
                        {question.imageUrl && (
                          <div className="quiz-question-image-wrapper">
                            <img src={question.imageUrl} alt={`Question ${idx + 1} Visual`} className="quiz-question-image" />
                          </div>
                        )}
                        <div className="result-breakdown-body">
                          {question.options.map((opt, oIdx) => {
                            let optionClass = "result-option";
                            if (oIdx === correctAns) {
                              optionClass += " correct";
                            }
                            if (oIdx === studentAns && !isCorrect) {
                              optionClass += " incorrect result-option.selected-wrong";
                            }
                            return (
                              <div key={oIdx} className={optionClass}>
                                <span style={{ fontWeight: 'bold', marginRight: '0.5rem' }}>
                                  {String.fromCharCode(65 + oIdx)}.
                                </span>
                                {opt}
                                {oIdx === correctAns && " (Correct Key)"}
                                {oIdx === studentAns && !isCorrect && " (Your Answer - Incorrect)"}
                                {oIdx === studentAns && isCorrect && " (Your Answer - Correct)"}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="modal-actions">
                  <button 
                    onClick={() => { setReviewSubmission(null); setReviewCorrectAnswers({}); }} 
                    className="btn btn-secondary btn-sm"
                  >
                    Close Review
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* CUSTOM QUIZ COMPLETION POPUP */}
          {showQuizResultPopup && (
            <div className="modal-overlay" style={{ zIndex: 1100 }}>
              <div className="modal-content fade-in" style={{ maxWidth: '480px', textAlign: 'center', padding: '2.5rem' }}>
                <div style={{ display: 'inline-flex', padding: '1rem', borderRadius: '50%', backgroundColor: 'rgba(212, 163, 89, 0.15)', color: 'var(--accent-gold-dark)', marginBottom: '1.5rem' }}>
                  <Award size={48} />
                </div>
                
                <h3 style={{ fontSize: '1.5rem', textTransform: 'uppercase', color: 'var(--primary-navy)', margin: '0 0 0.5rem 0' }}>
                  Quiz Completed!
                </h3>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-light)', margin: '0 0 1.5rem 0' }}>
                  Your answers have been graded and stored in the database.
                </p>

                <div style={{ backgroundColor: 'var(--bg-slate)', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-light)', textTransform: 'uppercase', fontWeight: 600 }}>Your Score</span>
                  <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--primary-navy)', margin: '0.25rem 0' }}>
                    {showQuizResultPopup.pct}%
                  </div>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-light)', fontWeight: 500 }}>
                    ({showQuizResultPopup.score} / {showQuizResultPopup.total} Correct Answers)
                  </span>

                  <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '1rem', paddingTop: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', textAlign: 'left' }}>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-light)', textTransform: 'uppercase', fontWeight: 600 }}>Subject Category</span>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary-navy)', marginTop: '2px' }}>{showQuizResultPopup.subject}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-light)', textTransform: 'uppercase', fontWeight: 600 }}>Instructor</span>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary-navy)', marginTop: '2px' }}>{showQuizResultPopup.teacher}</div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                  <button 
                    onClick={() => {
                      setShowQuizResultPopup(null);
                    }} 
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                  >
                    Close
                  </button>
                  <button 
                    onClick={() => {
                      setShowQuizResultPopup(null);
                    }} 
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                  >
                    Review Answers
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
