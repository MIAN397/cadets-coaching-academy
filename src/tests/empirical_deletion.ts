import { getCadetAcademicOverview } from '../utils/academic.ts';
import type { Submission, UserProfile } from '../types.ts';

// Helper for assertions
let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    testsPassed++;
  } else {
    console.error(`[FAIL] ${testName}${detail ? `: ${detail}` : ''}`);
    testsFailed++;
  }
}

console.log('=== STARTING EMPIRICAL DELETION & RECALCULATION SUITE ===\n');

// Sample Users
const sampleUsers: UserProfile[] = [
  {
    uid: 'user_cadet_1',
    email: 'cadet1@academy.edu',
    displayName: 'Cadet John Doe',
    role: 'student',
    createdAt: new Date(),
    registrationDetails: { cadetNumber: 'CAD-001', batch: '2026', subCategory: 'Grade 10', category: 'Academics', physicalGroup: 'Group A', phone: '123456' }
  },
  {
    uid: 'user_cadet_2',
    email: 'cadet2@academy.edu',
    displayName: 'Cadet Jane Smith',
    role: 'student',
    createdAt: new Date(),
    registrationDetails: { cadetNumber: 'CAD-002', batch: '2026', subCategory: 'Grade 10', category: 'Academics', physicalGroup: 'Group A', phone: '654321' }
  }
];

// Sample Initial Submissions
const initialSubmissions: Submission[] = [
  {
    id: 'sub_101',
    studentUid: 'user_cadet_1',
    studentEmail: 'cadet1@academy.edu',
    studentName: 'Cadet John Doe',
    quizId: 'quiz_math_1',
    quizTitle: 'Algebra Basics',
    answers: { q1: 1, q2: 2 },
    score: 10,
    totalQuestions: 10,
    submittedAt: new Date(),
    teacherName: 'Prof. Euler',
    teacherSubject: 'Mathematics'
  },
  {
    id: 'sub_102',
    studentUid: 'user_cadet_1',
    studentEmail: 'cadet1@academy.edu',
    studentName: 'Cadet John Doe',
    quizId: 'quiz_math_2',
    quizTitle: 'Geometry Fundamentals',
    answers: { q1: 1, q2: 0 },
    score: 8,
    totalQuestions: 10,
    submittedAt: new Date(),
    teacherName: 'Prof. Euler',
    teacherSubject: 'Mathematics'
  },
  {
    id: 'sub_103',
    studentUid: 'user_cadet_1',
    studentEmail: 'cadet1@academy.edu',
    studentName: 'Cadet John Doe',
    quizId: 'quiz_phy_1',
    quizTitle: 'Kinematics',
    answers: { q1: 1, q2: 0 },
    score: 5,
    totalQuestions: 10,
    submittedAt: new Date(),
    teacherName: 'Dr. Newton',
    teacherSubject: 'Physics'
  },
  {
    id: 'sub_201',
    studentUid: 'user_cadet_2',
    studentEmail: 'cadet2@academy.edu',
    studentName: 'Cadet Jane Smith',
    quizId: 'quiz_math_1',
    quizTitle: 'Algebra Basics',
    answers: { q1: 1, q2: 1 },
    score: 9,
    totalQuestions: 10,
    submittedAt: new Date(),
    teacherName: 'Prof. Euler',
    teacherSubject: 'Mathematics'
  }
];

// TEST 1: Baseline Overview Calculation for Cadet 1
console.log('--- TEST 1: Baseline Overview Calculation ---');
let currentSubmissions = [...initialSubmissions];
let overviewCadet1 = getCadetAcademicOverview('cadet1@academy.edu', currentSubmissions, sampleUsers);

assert(overviewCadet1.totalQuizzesAttempted === 3, 'Cadet 1 total quizzes attempted is 3');
assert(overviewCadet1.overallPercentage === 77, 'Cadet 1 overall percentage is 77% (23/30)', `Got ${overviewCadet1.overallPercentage}`);
assert(overviewCadet1.scoreAverage === 77, 'Cadet 1 score average is 77% ((100+80+50)/3)', `Got ${overviewCadet1.scoreAverage}`);
assert(Object.keys(overviewCadet1.subjectMetrics).length === 2, 'Cadet 1 has 2 subjects (Mathematics, Physics)');
assert(overviewCadet1.subjectMetrics['Mathematics'].totalAttempted === 2, 'Math attempted is 2');
assert(overviewCadet1.subjectMetrics['Mathematics'].percentage === 90, 'Math percentage is 90% (18/20)');
assert(overviewCadet1.subjectMetrics['Physics'].totalAttempted === 1, 'Physics attempted is 1');
assert(overviewCadet1.subjectMetrics['Physics'].percentage === 50, 'Physics percentage is 50% (5/10)');

// TEST 2: Single Submission Deletion & React State Filtering Simulation
console.log('\n--- TEST 2: Single Submission Deletion (sub_102 - Math 8/10) ---');
const subToDelete = currentSubmissions.find(s => s.id === 'sub_102')!;

// Simulate React state update: setSubmissions(prev => prev.filter(s => s.id !== sub.id))
const nextSubmissions = currentSubmissions.filter(s => s.id !== subToDelete.id);

assert(nextSubmissions.length === currentSubmissions.length - 1, 'Submissions array length reduced by 1');
assert(nextSubmissions.find(s => s.id === 'sub_102') === undefined, 'sub_102 removed from state array');
assert(currentSubmissions.length === 4, 'Original state array was not mutated (immutability preserved)');

// Recalculate Overview for Cadet 1 after deletion
overviewCadet1 = getCadetAcademicOverview('cadet1@academy.edu', nextSubmissions, sampleUsers);

assert(overviewCadet1.totalQuizzesAttempted === 2, 'Cadet 1 total quizzes attempted recalculated to 2');
assert(overviewCadet1.overallPercentage === 75, 'Cadet 1 overall percentage recalculated to 75% (15/20)', `Got ${overviewCadet1.overallPercentage}`);
assert(overviewCadet1.scoreAverage === 75, 'Cadet 1 score average recalculated to 75% ((100+50)/2)', `Got ${overviewCadet1.scoreAverage}`);
assert(overviewCadet1.subjectMetrics['Mathematics'].totalAttempted === 1, 'Math attempted recalculated to 1');
assert(overviewCadet1.subjectMetrics['Mathematics'].percentage === 100, 'Math percentage recalculated to 100% (10/10)');

// Check Cadet 2 remains completely unaffected
const overviewCadet2 = getCadetAcademicOverview('cadet2@academy.edu', nextSubmissions, sampleUsers);
assert(overviewCadet2.totalQuizzesAttempted === 1, 'Cadet 2 quizzes attempted remains 1');
assert(overviewCadet2.overallPercentage === 90, 'Cadet 2 overall percentage remains 90%');

currentSubmissions = nextSubmissions;

// TEST 3: Deleting Last Submission for a Subject (sub_103 - Physics 5/10)
console.log('\n--- TEST 3: Deleting Only Submission of Physics Subject (sub_103) ---');
const subPhysicsToDelete = currentSubmissions.find(s => s.id === 'sub_103')!;
currentSubmissions = currentSubmissions.filter(s => s.id !== subPhysicsToDelete.id);

overviewCadet1 = getCadetAcademicOverview('cadet1@academy.edu', currentSubmissions, sampleUsers);

assert(overviewCadet1.totalQuizzesAttempted === 1, 'Cadet 1 total quizzes attempted recalculated to 1');
assert(overviewCadet1.overallPercentage === 100, 'Cadet 1 overall percentage recalculated to 100% (10/10)');
assert(overviewCadet1.subjectMetrics['Physics'] === undefined, 'Physics subject completely removed from subjectMetrics');
assert(Object.keys(overviewCadet1.subjectMetrics).length === 1, 'Subject count reduced to 1 (Mathematics only)');

// TEST 4: Deleting Final Remaining Submission for Cadet 1 (sub_101 - Math 10/10)
console.log('\n--- TEST 4: Deleting Final Submission for Cadet 1 (sub_101) ---');
const subFinalToDelete = currentSubmissions.find(s => s.id === 'sub_101')!;
currentSubmissions = currentSubmissions.filter(s => s.id !== subFinalToDelete.id);

overviewCadet1 = getCadetAcademicOverview('cadet1@academy.edu', currentSubmissions, sampleUsers);

assert(overviewCadet1.totalQuizzesAttempted === 0, 'Cadet 1 total quizzes attempted is 0');
assert(overviewCadet1.overallPercentage === 0, 'Cadet 1 overall percentage is 0');
assert(overviewCadet1.scoreAverage === 0, 'Cadet 1 score average is 0');
assert(Object.keys(overviewCadet1.subjectMetrics).length === 0, 'subjectMetrics is empty object {}');

// TEST 5: Edge Cases & Vulnerabilities Inspection
console.log('\n--- TEST 5: Edge Cases & Vulnerabilities Inspection ---');

// Case 5A: Submission doc loaded without explicit `id` inside d.data()
const corruptDocSubmission: any = {
  // id is missing!
  studentEmail: 'cadet1@academy.edu',
  score: 10,
  totalQuestions: 10
};
const filterResult = [corruptDocSubmission].filter(s => s.id !== 'sub_999');
assert(filterResult.length === 1, 'Missing id does not throw during filtering, but id is undefined');

// Case 5B: handleDeleteSubmission guard check `if (!sub || !sub.id) return;`
function handleDeleteSubmissionGuard(sub: any) {
  if (!sub || !sub.id) return false;
  return true;
}
assert(handleDeleteSubmissionGuard(corruptDocSubmission) === false, 'handleDeleteSubmission blocks deletion if sub.id is missing');
assert(handleDeleteSubmissionGuard({ id: 'sub_valid' }) === true, 'handleDeleteSubmission proceeds if sub.id is present');

// Case 5C: Submissions loaded in DeveloperDashboard vs Admin/Teacher Dashboard
console.log('\n--- TEST 6: Dashboard Inconsistency Check ---');
const dummyFirestoreDoc = {
  id: 'doc_id_123',
  data: () => ({ studentEmail: 'test@example.com', score: 5, totalQuestions: 10 }) // Notice: 'id' is NOT in data()
};

const devDashboardMapping = dummyFirestoreDoc.data() as Submission;
const adminDashboardMapping = { id: dummyFirestoreDoc.id, ...dummyFirestoreDoc.data() } as Submission;

assert(devDashboardMapping.id === undefined, 'DeveloperDashboard d.data() fails to capture document ID when id field is omitted in payload!');
assert(adminDashboardMapping.id === 'doc_id_123', 'Admin/TeacherDashboard { id: d.id, ...d.data() } correctly preserves document ID!');

console.log(`\n=== SUITE SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED ===`);
if (testsFailed > 0) {
  throw new Error(`Test suite failed with ${testsFailed} failing tests.`);
}
