import { calculateStudentAcademicMetrics, getPerformanceTier, getCadetAcademicOverview } from '../utils/academic.ts';
import type { Submission, UserProfile } from '../types.ts';

let passedTests = 0;
let failedTests = 0;
const testResults: Array<{ name: string; status: 'PASS' | 'FAIL'; details: string }> = [];

function assert(condition: boolean, testName: string, details: string) {
  if (condition) {
    passedTests++;
    testResults.push({ name: testName, status: 'PASS', details });
    console.log(`✓ [PASS] ${testName}: ${details}`);
  } else {
    failedTests++;
    testResults.push({ name: testName, status: 'FAIL', details });
    console.error(`✗ [FAIL] ${testName}: ${details}`);
  }
}

console.log('=== RUNNING EMPIRICAL TESTS FOR ACADEMIC UTILS ===\n');

// -------------------------------------------------------------
// 1. calculateStudentAcademicMetrics
// -------------------------------------------------------------

// 1.1: 0 Submissions (empty array)
try {
  const resEmpty = calculateStudentAcademicMetrics([]);
  assert(
    resEmpty.overallStats.totalQuizzesAttempted === 0 &&
    resEmpty.overallStats.totalCorrect === 0 &&
    resEmpty.overallStats.totalQuestions === 0 &&
    resEmpty.overallStats.overallPercentage === 0 &&
    resEmpty.subjectMetrics.length === 0,
    'calculateStudentAcademicMetrics: Empty Array',
    'Returns zeroed stats and empty subject array'
  );
} catch (e: any) {
  assert(false, 'calculateStudentAcademicMetrics: Empty Array', `Threw error: ${e.message}`);
}

// 1.2: 0 Submissions (undefined / null)
try {
  const resUndef = calculateStudentAcademicMetrics(undefined as any);
  assert(
    resUndef.overallStats.totalQuizzesAttempted === 0 &&
    resUndef.overallStats.overallPercentage === 0 &&
    resUndef.subjectMetrics.length === 0,
    'calculateStudentAcademicMetrics: Undefined Submissions',
    'Gracefully handles undefined input without throwing'
  );
} catch (e: any) {
  assert(false, 'calculateStudentAcademicMetrics: Undefined Submissions', `Threw error: ${e.message}`);
}

try {
  const resNull = calculateStudentAcademicMetrics(null as any);
  assert(
    resNull.overallStats.totalQuizzesAttempted === 0 &&
    resNull.overallStats.overallPercentage === 0 &&
    resNull.subjectMetrics.length === 0,
    'calculateStudentAcademicMetrics: Null Submissions',
    'Gracefully handles null input without throwing'
  );
} catch (e: any) {
  assert(false, 'calculateStudentAcademicMetrics: Null Submissions', `Threw error: ${e.message}`);
}

// 1.3: 100% Scores
try {
  const subs100: Submission[] = [
    {
      id: 'sub1',
      studentUid: 'u1',
      studentEmail: 'cadet@academy.com',
      studentName: 'Cadet A',
      quizId: 'q1',
      quizTitle: 'Math 101',
      answers: {},
      score: 10,
      totalQuestions: 10,
      submittedAt: new Date(),
      teacherName: 'Prof. Math',
      teacherSubject: 'Math'
    },
    {
      id: 'sub2',
      studentUid: 'u1',
      studentEmail: 'cadet@academy.com',
      studentName: 'Cadet A',
      quizId: 'q2',
      quizTitle: 'Physics 101',
      answers: {},
      score: 20,
      totalQuestions: 20,
      submittedAt: new Date(),
      teacherName: 'Prof. Physics',
      teacherSubject: 'Physics'
    }
  ];
  const res100 = calculateStudentAcademicMetrics(subs100);
  assert(
    res100.overallStats.totalQuizzesAttempted === 2 &&
    res100.overallStats.totalCorrect === 30 &&
    res100.overallStats.totalQuestions === 30 &&
    res100.overallStats.overallPercentage === 100 &&
    res100.subjectMetrics.every(m => m.percentage === 100),
    'calculateStudentAcademicMetrics: 100% Scores',
    'Correctly calculates 100% overall and per-subject stats'
  );
} catch (e: any) {
  assert(false, 'calculateStudentAcademicMetrics: 100% Scores', `Threw error: ${e.message}`);
}

// 1.4: 0% Scores
try {
  const subs0: Submission[] = [
    {
      id: 'sub1',
      studentUid: 'u1',
      studentEmail: 'cadet@academy.com',
      studentName: 'Cadet A',
      quizId: 'q1',
      quizTitle: 'Math 101',
      answers: {},
      score: 0,
      totalQuestions: 10,
      submittedAt: new Date(),
      teacherName: 'Prof. Math',
      teacherSubject: 'Math'
    }
  ];
  const res0 = calculateStudentAcademicMetrics(subs0);
  assert(
    res0.overallStats.totalCorrect === 0 &&
    res0.overallStats.totalQuestions === 10 &&
    res0.overallStats.overallPercentage === 0 &&
    res0.subjectMetrics[0].percentage === 0,
    'calculateStudentAcademicMetrics: 0% Scores',
    'Correctly calculates 0% overall and per-subject stats'
  );
} catch (e: any) {
  assert(false, 'calculateStudentAcademicMetrics: 0% Scores', `Threw error: ${e.message}`);
}

// 1.5: Mixed Subjects Alphabetical Sorting & Trim
try {
  const subsMixed: Submission[] = [
    { id: '1', studentUid: 'u1', studentEmail: 'e@e.com', studentName: 'A', quizId: 'q1', quizTitle: 't', answers: {}, score: 5, totalQuestions: 10, submittedAt: null, teacherSubject: ' Zoology ' },
    { id: '2', studentUid: 'u1', studentEmail: 'e@e.com', studentName: 'A', quizId: 'q2', quizTitle: 't', answers: {}, score: 5, totalQuestions: 10, submittedAt: null, teacherSubject: 'Algebra' },
    { id: '3', studentUid: 'u1', studentEmail: 'e@e.com', studentName: 'A', quizId: 'q3', quizTitle: 't', answers: {}, score: 5, totalQuestions: 10, submittedAt: null, teacherSubject: 'Botany' }
  ];
  const resMixed = calculateStudentAcademicMetrics(subsMixed);
  const subjectNames = resMixed.subjectMetrics.map(m => m.subject);
  assert(
    JSON.stringify(subjectNames) === JSON.stringify(['Algebra', 'Botany', 'Zoology']),
    'calculateStudentAcademicMetrics: Alphabetical Subject Sorting & Trimming',
    `Subjects sorted as ${JSON.stringify(subjectNames)}`
  );
} catch (e: any) {
  assert(false, 'calculateStudentAcademicMetrics: Alphabetical Subject Sorting & Trimming', `Threw error: ${e.message}`);
}

// 1.6: Undefined/Missing Fields in Submissions
try {
  const subsUndefinedFields: Submission[] = [
    {
      id: 'sub1',
      studentUid: 'u1',
      studentEmail: 'c@a.com',
      studentName: 'Cadet',
      quizId: 'q1',
      quizTitle: 'Test',
      answers: {},
      score: undefined as any,
      totalQuestions: undefined as any,
      submittedAt: null,
      teacherName: undefined,
      teacherSubject: undefined
    }
  ];
  const resUndefFields = calculateStudentAcademicMetrics(subsUndefinedFields);
  assert(
    resUndefFields.overallStats.totalCorrect === 0 &&
    resUndefFields.overallStats.totalQuestions === 0 &&
    resUndefFields.overallStats.overallPercentage === 0 &&
    resUndefFields.subjectMetrics[0].subject === 'General' &&
    resUndefFields.subjectMetrics[0].teacherName === 'Academy Faculty',
    'calculateStudentAcademicMetrics: Undefined Fields Fallbacks',
    'Handles undefined score, totalQuestions, teacherSubject, teacherName safely with defaults'
  );
} catch (e: any) {
  assert(false, 'calculateStudentAcademicMetrics: Undefined Fields Fallbacks', `Threw error: ${e.message}`);
}

// 1.7: Total Questions = 0 (Division by Zero check)
try {
  const subsZeroQ: Submission[] = [
    {
      id: 'sub1',
      studentUid: 'u1',
      studentEmail: 'c@a.com',
      studentName: 'Cadet',
      quizId: 'q1',
      quizTitle: 'Empty Quiz',
      answers: {},
      score: 0,
      totalQuestions: 0,
      submittedAt: null,
      teacherSubject: 'Math'
    }
  ];
  const resZeroQ = calculateStudentAcademicMetrics(subsZeroQ);
  assert(
    resZeroQ.overallStats.overallPercentage === 0 &&
    !isNaN(resZeroQ.overallStats.overallPercentage) &&
    resZeroQ.subjectMetrics[0].percentage === 0 &&
    !isNaN(resZeroQ.subjectMetrics[0].percentage),
    'calculateStudentAcademicMetrics: 0 Total Questions',
    'Prevents NaN division by zero resulting in 0%'
  );
} catch (e: any) {
  assert(false, 'calculateStudentAcademicMetrics: 0 Total Questions', `Threw error: ${e.message}`);
}

// 1.8: Multiple Teachers for Same Subject
try {
  const subsMultiTeacher: Submission[] = [
    { id: '1', studentUid: 'u1', studentEmail: 'e@e.com', studentName: 'A', quizId: 'q1', quizTitle: 't', answers: {}, score: 5, totalQuestions: 10, submittedAt: null, teacherSubject: 'Math', teacherName: 'Teacher 1' },
    { id: '2', studentUid: 'u1', studentEmail: 'e@e.com', studentName: 'A', quizId: 'q2', quizTitle: 't', answers: {}, score: 5, totalQuestions: 10, submittedAt: null, teacherSubject: 'Math', teacherName: 'Teacher 2' }
  ];
  const resMultiTeacher = calculateStudentAcademicMetrics(subsMultiTeacher);
  const teacherKept = resMultiTeacher.subjectMetrics[0].teacherName;
  assert(
    teacherKept === 'Teacher 1',
    'calculateStudentAcademicMetrics: Retains First Teacher Name for Subject',
    `First teacher retained: '${teacherKept}'`
  );
} catch (e: any) {
  assert(false, 'calculateStudentAcademicMetrics: Retains First Teacher Name for Subject', `Threw error: ${e.message}`);
}

// 1.9: Array containing null/undefined item stress test
try {
  const subsWithNullItem: any[] = [
    null,
    { id: '1', studentUid: 'u1', studentEmail: 'e@e.com', studentName: 'A', quizId: 'q1', quizTitle: 't', answers: {}, score: 5, totalQuestions: 10, submittedAt: null, teacherSubject: 'Math' }
  ];
  try {
    calculateStudentAcademicMetrics(subsWithNullItem);
    assert(true, 'calculateStudentAcademicMetrics: Null Array Element Safety', 'Handled null array item without crash');
  } catch (e: any) {
    assert(false, 'calculateStudentAcademicMetrics: Null Array Element Safety', `Crashes when array contains null item: ${e.message}`);
  }
} catch (e: any) {
  // handled inside
}

// 1.10: Non-string teacherSubject (e.g. number)
try {
  const subsNonStringSubj: any[] = [
    { id: '1', studentUid: 'u1', studentEmail: 'e@e.com', studentName: 'A', quizId: 'q1', quizTitle: 't', answers: {}, score: 5, totalQuestions: 10, submittedAt: null, teacherSubject: 101 }
  ];
  try {
    calculateStudentAcademicMetrics(subsNonStringSubj);
    assert(true, 'calculateStudentAcademicMetrics: Non-string teacherSubject Safety', 'Handled numeric teacherSubject without crash');
  } catch (e: any) {
    assert(false, 'calculateStudentAcademicMetrics: Non-string teacherSubject Safety', `Crashes when teacherSubject is not a string: ${e.message}`);
  }
} catch (e: any) {
  // handled
}

// 1.11: Subject Case-sensitivity Discrepancy
try {
  const subsCase: Submission[] = [
    { id: '1', studentUid: 'u1', studentEmail: 'e@e.com', studentName: 'A', quizId: 'q1', quizTitle: 't', answers: {}, score: 5, totalQuestions: 10, submittedAt: null, teacherSubject: 'Math' },
    { id: '2', studentUid: 'u1', studentEmail: 'e@e.com', studentName: 'A', quizId: 'q2', quizTitle: 't', answers: {}, score: 5, totalQuestions: 10, submittedAt: null, teacherSubject: 'math' }
  ];
  const resCase = calculateStudentAcademicMetrics(subsCase);
  const subjectsCreated = resCase.subjectMetrics.map(s => s.subject);
  assert(
    subjectsCreated.length === 2,
    'calculateStudentAcademicMetrics: Subject Case Sensitivity',
    `'Math' vs 'math' treated as ${subjectsCreated.length} distinct subjects: ${JSON.stringify(subjectsCreated)}`
  );
} catch (e: any) {
  assert(false, 'calculateStudentAcademicMetrics: Subject Case Sensitivity', `Threw error: ${e.message}`);
}


// -------------------------------------------------------------
// 2. getCadetAcademicOverview
// -------------------------------------------------------------

// 2.1: 0 Submissions for cadet
try {
  const usersList: UserProfile[] = [
    {
      uid: 'u1',
      email: 'cadet1@academy.com',
      displayName: 'Cadet One',
      role: 'student',
      createdAt: null,
      registrationDetails: { cadetNumber: 'CADET-001', batch: '2026', physicalGroup: 'Alpha', phone: '123' }
    }
  ];
  const overview0 = getCadetAcademicOverview('cadet1@academy.com', [], usersList);
  assert(
    overview0.totalQuizzesAttempted === 0 &&
    overview0.overallPercentage === 0 &&
    overview0.scoreAverage === 0 &&
    Object.keys(overview0.subjectMetrics).length === 0 &&
    overview0.studentName === 'Cadet One' &&
    overview0.cadetNumber === 'CADET-001',
    'getCadetAcademicOverview: 0 Submissions with User Record',
    'Correctly retrieves cadet identity from user profile when submissions array is empty'
  );
} catch (e: any) {
  assert(false, 'getCadetAcademicOverview: 0 Submissions with User Record', `Threw error: ${e.message}`);
}

// 2.2: Email Case-Sensitivity & Normalization
try {
  const subsEmail: Submission[] = [
    { id: '1', studentUid: 'u1', studentEmail: 'CADET1@ACADEMY.COM', studentName: 'Cadet One', quizId: 'q1', quizTitle: 't', answers: {}, score: 8, totalQuestions: 10, submittedAt: null }
  ];
  const overviewEmail = getCadetAcademicOverview('  cadet1@academy.com  ', subsEmail);
  assert(
    overviewEmail.totalQuizzesAttempted === 1 &&
    overviewEmail.overallPercentage === 80,
    'getCadetAcademicOverview: Case & Whitespace Insensitive Email Matching',
    'Matches studentEmail ignoring case and outer whitespace'
  );
} catch (e: any) {
  assert(false, 'getCadetAcademicOverview: Case & Whitespace Insensitive Email Matching', `Threw error: ${e.message}`);
}

// 2.3: Mathematical Verification - overallPercentage (weighted) vs scoreAverage (macro-avg)
try {
  // Quiz 1: 1 question, score 1/1 (100%)
  // Quiz 2: 99 questions, score 0/99 (0%)
  // Total correct = 1, Total questions = 100 -> overallPercentage = Math.round(1/100 * 100) = 1%
  // Quiz 1 pct = 100%, Quiz 2 pct = 0% -> sumPct = 100. scoreAverage = Math.round(100 / 2) = 50%
  const subsDivergent: Submission[] = [
    { id: '1', studentUid: 'u1', studentEmail: 'c@a.com', studentName: 'C', quizId: 'q1', quizTitle: 't', answers: {}, score: 1, totalQuestions: 1, submittedAt: null },
    { id: '2', studentUid: 'u1', studentEmail: 'c@a.com', studentName: 'C', quizId: 'q2', quizTitle: 't', answers: {}, score: 0, totalQuestions: 99, submittedAt: null }
  ];
  const overviewDivergent = getCadetAcademicOverview('c@a.com', subsDivergent);
  assert(
    overviewDivergent.overallPercentage === 1 && overviewDivergent.scoreAverage === 50,
    'getCadetAcademicOverview: Weighted overallPercentage (1%) vs Unweighted scoreAverage (50%)',
    `overallPercentage = ${overviewDivergent.overallPercentage}%, scoreAverage = ${overviewDivergent.scoreAverage}%`
  );
} catch (e: any) {
  assert(false, 'getCadetAcademicOverview: Weighted vs Unweighted calculation', `Threw error: ${e.message}`);
}

// 2.4: Undefined Inputs to getCadetAcademicOverview
try {
  const overviewUndef = getCadetAcademicOverview(undefined as any, undefined as any, undefined as any);
  assert(
    overviewUndef.totalQuizzesAttempted === 0 &&
    overviewUndef.overallPercentage === 0 &&
    overviewUndef.scoreAverage === 0 &&
    overviewUndef.studentName === 'Unknown Cadet' &&
    overviewUndef.cadetNumber === 'N/A',
    'getCadetAcademicOverview: All Undefined Inputs',
    'Handles undefined email, submissions, and users gracefully'
  );
} catch (e: any) {
  assert(false, 'getCadetAcademicOverview: All Undefined Inputs', `Threw error: ${e.message}`);
}

// 2.5: Student Name & Cadet Number Fallback Cascade
try {
  // Scenario A: Submission has name
  const subsA: Submission[] = [
    { id: '1', studentUid: 'u1', studentEmail: 'c@a.com', studentName: 'Sub Name', quizId: 'q1', quizTitle: 't', answers: {}, score: 10, totalQuestions: 10, submittedAt: null }
  ];
  const usersA: UserProfile[] = [
    { uid: 'u1', email: 'c@a.com', displayName: 'Profile Name', role: 'student', createdAt: null, registrationDetails: { cadetNumber: 'C-99', batch: 'b', physicalGroup: 'g', phone: 'p' } }
  ];
  const resA = getCadetAcademicOverview('c@a.com', subsA, usersA);

  // Scenario B: Submission name is missing/empty string
  const subsB: Submission[] = [
    { id: '1', studentUid: 'u1', studentEmail: 'c@a.com', studentName: '', quizId: 'q1', quizTitle: 't', answers: {}, score: 10, totalQuestions: 10, submittedAt: null }
  ];
  const resB = getCadetAcademicOverview('c@a.com', subsB, usersA);

  // Scenario C: Both submission name and user profile missing
  const resC = getCadetAcademicOverview('c@a.com', subsB, []);

  assert(
    resA.studentName === 'Sub Name' && resA.cadetNumber === 'C-99' &&
    resB.studentName === 'Profile Name' &&
    resC.studentName === 'Unknown Cadet' && resC.cadetNumber === 'N/A',
    'getCadetAcademicOverview: Name & Cadet Number Fallback Cascade',
    `A: '${resA.studentName}' (${resA.cadetNumber}), B: '${resB.studentName}', C: '${resC.studentName}' (${resC.cadetNumber})`
  );
} catch (e: any) {
  assert(false, 'getCadetAcademicOverview: Fallback Cascade', `Threw error: ${e.message}`);
}

// 2.6: Submissions array containing null/undefined item in getCadetAcademicOverview
try {
  const subsWithNull: any[] = [
    null,
    { id: '1', studentUid: 'u1', studentEmail: 'c@a.com', studentName: 'C', quizId: 'q1', quizTitle: 't', answers: {}, score: 10, totalQuestions: 10, submittedAt: null }
  ];
  try {
    getCadetAcademicOverview('c@a.com', subsWithNull);
    assert(true, 'getCadetAcademicOverview: Null Array Element Safety', 'Handled null submission element without crash');
  } catch (e: any) {
    assert(false, 'getCadetAcademicOverview: Null Array Element Safety', `Crashes when submissions array contains null item: ${e.message}`);
  }
} catch (e: any) {
  // handled
}

// 2.7: Users array containing null/undefined item in getCadetAcademicOverview
try {
  const usersWithNull: any[] = [
    null,
    { uid: 'u1', email: 'c@a.com', displayName: 'Profile Name', role: 'student', createdAt: null }
  ];
  try {
    getCadetAcademicOverview('c@a.com', [], usersWithNull);
    assert(true, 'getCadetAcademicOverview: Null User Element Safety', 'Handled null user profile item without crash');
  } catch (e: any) {
    assert(false, 'getCadetAcademicOverview: Null User Element Safety', `Crashes when users array contains null item: ${e.message}`);
  }
} catch (e: any) {
  // handled
}


// -------------------------------------------------------------
// 3. getPerformanceTier
// -------------------------------------------------------------

try {
  const tier100 = getPerformanceTier(100);
  const tier80 = getPerformanceTier(80);
  const tier799 = getPerformanceTier(79.9);
  const tier60 = getPerformanceTier(60);
  const tier599 = getPerformanceTier(59.9);
  const tier0 = getPerformanceTier(0);

  assert(
    tier100.label === 'Excellent' &&
    tier80.label === 'Excellent' &&
    tier799.label === 'Good Standing' &&
    tier60.label === 'Good Standing' &&
    tier599.label === 'Needs Improvement' &&
    tier0.label === 'Needs Improvement',
    'getPerformanceTier: Threshold Boundary Verification',
    '100->Excellent, 80->Excellent, 79.9->Good Standing, 60->Good Standing, 59.9->Needs Improvement, 0->Needs Improvement'
  );
} catch (e: any) {
  assert(false, 'getPerformanceTier: Threshold Boundary Verification', `Threw error: ${e.message}`);
}

console.log(`\n=== TEST SUMMARY ===`);
console.log(`Total: ${passedTests + failedTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
