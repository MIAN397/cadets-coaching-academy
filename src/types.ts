export type UserRole = 'developer' | 'admin' | 'teacher' | 'student';

export interface StudentDetails {
  cadetNumber: string;
  batch: string;
  rank?: string;
  physicalGroup: string;
  phone: string;
  category?: string;      // E.g. "Academics", "Army", "Navy", "PAF", "Police NTS", "Miscellaneous"
  subCategory?: string;   // E.g. "Grade 10", "PMA", etc.
  joinPhysical?: boolean;
}

export const REGISTRATION_CATEGORIES: Record<string, string[]> = {
  'Academics': ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10'],
  'Army': ['PMA', 'LCC', 'A Nursing', 'Soldier'],
  'Navy': ['PNA', 'LCC', 'N Nursing', 'Sailor'],
  'PAF': ['Cadet', 'LCC', 'PAF Nursing', 'Airmen'],
  'Police NTS': ['Police NTS'],
  'Miscellaneous': ['Miscellaneous']
};

export interface TeacherSubject {
  subject: string;
  category: string;
  subCategory: string;
  section?: string;
}

export interface TeacherDetails {
  subject: string;
  phone: string;
  subjects?: TeacherSubject[];
  academicOnly?: boolean;
}

export interface FinancialDetails {
  amount: number;
  duration: string; // e.g. "Monthly", "3-Months", "6-Months", or custom string
  paymentStatus: 'Paid' | 'Unpaid' | 'Pending';
  dueDate?: string; // YYYY-MM-DD (mostly for student fees)
  yearlyTotal?: number;
  splitType?: string;
  startDate?: string;
  installments?: {
    amount: number;
    dueDate: string;
    paymentStatus: 'Paid' | 'Unpaid' | 'Pending';
  }[];
  lastUpdated: any;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: any;
  registrationDetails?: StudentDetails;
  teacherDetails?: TeacherDetails;
  password?: string;
  financials?: FinancialDetails;
  campus?: 'boys' | 'girls';
}

export interface MCQQuestion {
  id: string;
  questionText: string;
  options: string[]; // exactly 4 options
  imageUrl?: string; // Optional image URL or base64 data URL for diagrams/sequences
}

export interface Quiz {
  id: string;
  title: string;
  description: string;
  duration: number; // in minutes
  createdById: string;
  createdByEmail: string;
  createdAt: any;
  questions: MCQQuestion[];
  assignToType?: 'all' | 'batch' | 'student' | 'category' | 'classes' | 'class-physical-group' | 'custom-target' | 'free-homepage';
  assignToValue?: string;
  targetBatch?: string;
  targetCategory?: string;
  targetClasses?: string;
  targetSections?: string;
  teacherName?: string;
  teacherSubject?: string;
  campus?: 'boys' | 'girls';
  status?: 'draft' | 'published';
  isFeaturedOnHomepage?: boolean;
}

export interface Announcement {
  id: string;
  title: string;
  category: string;
  date: string;
  content: string;
  badgeColor?: string;
  createdAt?: any;
}

export interface QuizAnswerKey {
  quizId: string;
  answers: Record<string, number>; // maps question.id to correctOptionIndex (0-3)
}

export interface Submission {
  id: string; // studentUid_quizId
  studentUid: string;
  studentEmail: string;
  studentName: string;
  quizId: string;
  quizTitle: string;
  answers: Record<string, number>; // maps question.id to submittedOptionIndex (0-3)
  score: number;
  totalQuestions: number;
  submittedAt: any;
  teacherName?: string;
  teacherSubject?: string;
  campus?: 'boys' | 'girls';
}

export interface AttendanceRecord {
  id: string; // YYYY-MM-DD_userUid
  date: string; // YYYY-MM-DD
  userUid: string;
  userName: string;
  userEmail: string;
  role: 'student' | 'teacher';
  physicalAttendance: 'Present' | 'Absent' | 'Excused';
  academicAttendance: 'Present' | 'Absent' | 'Excused';
  loggedBy: string; // Admin/Developer UID
  updatedAt: any;
  campus?: 'boys' | 'girls';
}

export const getCampusLabel = (campus: 'boys' | 'girls' | undefined, role: string): string => {
  if (!campus) return '';
  if (role === 'developer') {
    return campus === 'boys' ? 'Boys Campus' : 'Girls Campus';
  }
  return '';
};

export interface SubjectPerformanceMetric {
  subject: string;
  totalCorrect: number;
  totalQuestions: number;
  totalQuizzesAttempted: number;
  percentage: number;
  teacherName?: string;
}

export interface AcademicOverallStats {
  totalQuizzesAttempted: number;
  totalCorrect: number;
  totalQuestions: number;
  overallPercentage: number;
}

export interface SubjectProgressMetric {
  subject: string;
  totalAttempted: number;
  totalCorrect: number;
  totalQuestions: number;
  percentage: number;
}

export interface CadetProgressOverview {
  studentEmail: string;
  studentName: string;
  cadetNumber: string;
  totalQuizzesAttempted: number;
  overallPercentage: number;
  scoreAverage: number;
  subjectMetrics: Record<string, SubjectProgressMetric>;
}


