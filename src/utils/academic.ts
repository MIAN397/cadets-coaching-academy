import type {
  Submission,
  UserProfile,
  SubjectPerformanceMetric,
  AcademicOverallStats,
  SubjectProgressMetric,
  CadetProgressOverview
} from '../types';

/**
 * Calculates academic metric breakdown for a single student across all their submitted quizzes.
 */
export const calculateStudentAcademicMetrics = (submissions: Submission[]) => {
  let totalCorrect = 0;
  let totalQuestions = 0;
  const totalQuizzesAttempted = submissions ? submissions.length : 0;

  const subjectMap: Record<string, { correct: number; total: number; quizzes: number; teacher: string }> = {};

  if (submissions && Array.isArray(submissions)) {
    submissions.forEach(sub => {
      if (!sub) return;
      const correct = sub.score || 0;
      const qCount = sub.totalQuestions || 0;
      totalCorrect += correct;
      totalQuestions += qCount;

      const subject = typeof sub.teacherSubject === 'string' && sub.teacherSubject.trim() ? sub.teacherSubject.trim() : 'General';
      const teacher = sub.teacherName || 'Academy Faculty';

      if (!subjectMap[subject]) {
        subjectMap[subject] = { correct: 0, total: 0, quizzes: 0, teacher };
      }
      subjectMap[subject].correct += correct;
      subjectMap[subject].total += qCount;
      subjectMap[subject].quizzes += 1;
    });
  }

  const overallPercentage = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

  const overallStats: AcademicOverallStats = {
    totalQuizzesAttempted,
    totalCorrect,
    totalQuestions,
    overallPercentage
  };

  const subjectMetrics: SubjectPerformanceMetric[] = Object.entries(subjectMap).map(([subject, data]) => {
    const percentage = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
    return {
      subject,
      totalCorrect: data.correct,
      totalQuestions: data.total,
      totalQuizzesAttempted: data.quizzes,
      percentage,
      teacherName: data.teacher
    };
  });

  subjectMetrics.sort((a, b) => a.subject.localeCompare(b.subject));

  return { overallStats, subjectMetrics };
};

/**
 * Returns color, background, border, badge label and gradient fill for a given percentage score.
 */
export const getPerformanceTier = (pct: number) => {
  if (pct >= 80) {
    return {
      label: 'Excellent',
      color: 'var(--success)',
      bg: '#dcfce7',
      text: '#166534',
      border: '#bbf7d0',
      barGradient: 'linear-gradient(90deg, #10b981, #34d399)'
    };
  }
  if (pct >= 60) {
    return {
      label: 'Good Standing',
      color: 'var(--accent-gold-dark)',
      bg: '#fef9c3',
      text: '#854d0e',
      border: '#fef08a',
      barGradient: 'linear-gradient(90deg, var(--accent-gold-dark), var(--accent-gold))'
    };
  }
  return {
    label: 'Needs Improvement',
    color: 'var(--danger)',
    bg: '#fee2e2',
    text: '#991b1b',
    border: '#fecaca',
    barGradient: 'linear-gradient(90deg, #ef4444, #f87171)'
  };
};

/**
 * Calculates academic breakdown per cadet from global submissions array.
 */
export const getCadetAcademicOverview = (
  email: string,
  submissions: Submission[],
  users?: UserProfile[]
): CadetProgressOverview => {
  const normalizedEmail = (email || '').toLowerCase().trim();
  const cadetSubs = (submissions || []).filter(
    s => s && s.studentEmail && s.studentEmail.toLowerCase().trim() === normalizedEmail
  );

  let totalCorrect = 0;
  let totalQuestions = 0;
  let sumPct = 0;
  const subjectMap: Record<string, { attempted: number; correct: number; questions: number }> = {};

  cadetSubs.forEach(sub => {
    if (!sub) return;
    const correct = sub.score || 0;
    const qCount = sub.totalQuestions || 0;
    totalCorrect += correct;
    totalQuestions += qCount;
    const pct = qCount > 0 ? Math.round((correct / qCount) * 100) : 0;
    sumPct += pct;

    const subj = typeof sub.teacherSubject === 'string' && sub.teacherSubject.trim() ? sub.teacherSubject.trim() : 'General';
    if (!subjectMap[subj]) {
      subjectMap[subj] = { attempted: 0, correct: 0, questions: 0 };
    }
    subjectMap[subj].attempted += 1;
    subjectMap[subj].correct += correct;
    subjectMap[subj].questions += qCount;
  });

  const subjectMetrics: Record<string, SubjectProgressMetric> = {};
  Object.keys(subjectMap).forEach(subj => {
    const item = subjectMap[subj];
    subjectMetrics[subj] = {
      subject: subj,
      totalAttempted: item.attempted,
      totalCorrect: item.correct,
      totalQuestions: item.questions,
      percentage: item.questions > 0 ? Math.round((item.correct / item.questions) * 100) : 0
    };
  });

  const cadetUser = users ? users.find(u => u && u.email && u.email.toLowerCase().trim() === normalizedEmail) : undefined;
  const studentName = cadetSubs[0]?.studentName || cadetUser?.displayName || 'Unknown Cadet';
  const cadetNumber = cadetUser?.registrationDetails?.cadetNumber || 'N/A';

  return {
    studentEmail: email,
    studentName,
    cadetNumber,
    totalQuizzesAttempted: cadetSubs.length,
    overallPercentage: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0,
    scoreAverage: cadetSubs.length > 0 ? Math.round(sumPct / cadetSubs.length) : 0,
    subjectMetrics
  };
};
