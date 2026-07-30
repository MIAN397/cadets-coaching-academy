import React, { useEffect, useState } from 'react';
import { collection, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { UserProfile, UserRole, AttendanceRecord, Quiz, Submission, Announcement } from '../types';
import { REGISTRATION_CATEGORIES } from '../types';
import { Shield, RefreshCw, Users, BookOpen, FileCheck, Calendar, Check, AlertCircle, Plus, DollarSign, Search, Bell, Sparkles, Trash2 } from 'lucide-react';
import { sendWhatsAppMessage, getTomorrowDateString } from '../utils/whatsapp';
import { getEffectiveFinancials } from '../utils/financials';
import { getCadetAcademicOverview, getPerformanceTier } from '../utils/academic';

export const DeveloperDashboard: React.FC<{ developerUid: string; developerEmail: string }> = ({ developerUid, developerEmail }) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [campusFilter, setCampusFilter] = useState<'all' | 'boys' | 'girls'>('all');
  const [newCampus, setNewCampus] = useState<'boys' | 'girls'>('boys');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'danger', text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'controls' | 'attendance' | 'quizzes' | 'financials' | 'homepage'>('controls');
  const [attendanceDate, setAttendanceDate] = useState<string>(() => {
    const local = new Date();
    const offset = local.getTimezoneOffset();
    const adjustedDate = new Date(local.getTime() - (offset * 60 * 1000));
    return adjustedDate.toISOString().split('T')[0];
  });
  const [attendanceRecords, setAttendanceRecords] = useState<Record<string, AttendanceRecord>>({});
  const [allAttendanceRecords, setAllAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selectedQuizForAttempts, setSelectedQuizForAttempts] = useState<string | null>(null);
  const [workingDays, setWorkingDays] = useState<string[]>([]);
  const [reviewSubmission, setReviewSubmission] = useState<Submission | null>(null);
  const [reviewCorrectAnswers, setReviewCorrectAnswers] = useState<Record<string, number>>({});
  const [expandedTeachers, setExpandedTeachers] = useState<Record<string, boolean>>({});
  const [expandedSubjects, setExpandedSubjects] = useState<Record<string, boolean>>({});
  const [editingSubmission, setEditingSubmission] = useState<Submission | null>(null);
  const [editingScoreValue, setEditingScoreValue] = useState<number>(0);
  const [selectedCadetForProgress, setSelectedCadetForProgress] = useState<UserProfile | null>(null);
  const [submissionToDelete, setSubmissionToDelete] = useState<Submission | null>(null);

  const handleDeleteSubmission = async (sub: Submission) => {
    if (!sub || !sub.id) return;
    setLoading(true);
    setMessage(null);
    try {
      await deleteDoc(doc(db, 'submissions', sub.id));
      setSubmissions(prev => prev.filter(item => item.id !== sub.id));
      setMessage({
        type: 'success',
        text: `Submission attempt for "${sub.quizTitle}" by cadet ${sub.studentName} deleted successfully. Dependent metrics recalculated.`
      });
      setSubmissionToDelete(null);
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'danger', text: 'Failed to delete submission record: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  // Financial management state
  const [selectedUserForFinance, setSelectedUserForFinance] = useState<UserProfile | null>(null);
  const [financeDuration, setFinanceDuration] = useState<string>('Monthly');
  const [customDurationValue, setCustomDurationValue] = useState<string>('');
  const [financeSearch, setFinanceSearch] = useState<string>('');

  // Installments management state
  const [yearlyTotalAmount, setYearlyTotalAmount] = useState<number>(0);
  const [installmentStartDate, setInstallmentStartDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [installmentsList, setInstallmentsList] = useState<{ amount: number; dueDate: string; paymentStatus: 'Paid' | 'Unpaid' | 'Pending' }[]>([]);

  // System Controls filters (Batch, Class, Category, Section, Role, Search)
  const [systemSearch, setSystemSearch] = useState('');
  const [systemFilterRole, setSystemFilterRole] = useState('All');
  const [systemFilterBatch, setSystemFilterBatch] = useState('All');
  const [systemFilterCategory, setSystemFilterCategory] = useState('All');
  const [systemFilterClass, setSystemFilterClass] = useState('All');
  const [systemFilterSection, setSystemFilterSection] = useState('All');

  const systemUniqueBatches = Array.from(new Set(
    users
      .filter(u => u.role === 'student' && u.registrationDetails?.batch)
      .map(u => u.registrationDetails!.batch)
  )).sort();

  const systemUniqueCategories = Array.from(new Set(
    users
      .filter(u => u.role === 'student' && u.registrationDetails?.category)
      .map(u => u.registrationDetails!.category!)
  )).sort();

  const systemUniqueClasses = Array.from(new Set(
    users
      .filter(u => u.role === 'student' && u.registrationDetails?.subCategory)
      .map(u => u.registrationDetails!.subCategory!)
  )).sort();

  const systemUniqueSections = Array.from(new Set(
    users
      .filter(u => u.role === 'student' && u.registrationDetails?.physicalGroup)
      .map(u => u.registrationDetails!.physicalGroup)
  )).sort();

  const handleUpdateStudentRegistrationDetails = async (
    email: string,
    field: 'batch' | 'category' | 'subCategory' | 'physicalGroup' | 'cadetNumber',
    val: string
  ) => {
    const lowerEmail = email.toLowerCase();
    const targetUser = users.find(u => u.email.toLowerCase() === lowerEmail);
    if (!targetUser) return;

    const currentReg = targetUser.registrationDetails || {
      cadetNumber: 'Cadet-100',
      batch: 'Batch 2026',
      physicalGroup: 'Group A',
      phone: ''
    };

    let updatedReg = { ...currentReg, [field]: val };

    if (field === 'category') {
      const avail = REGISTRATION_CATEGORIES[val] || [];
      if (!avail.includes(updatedReg.subCategory || '')) {
        updatedReg.subCategory = avail[0] || '';
      }
    }

    try {
      await updateDoc(doc(db, 'users', lowerEmail), {
        registrationDetails: updatedReg
      });
      setUsers(prev => prev.map(u => u.email.toLowerCase() === lowerEmail ? { ...u, registrationDetails: updatedReg } : u));
      setMessage({ type: 'success', text: `Updated ${field} for ${targetUser.displayName} to "${val}".` });
    } catch (err: any) {
      setMessage({ type: 'danger', text: `Failed to update ${field}: ${err.message}` });
    }
  };

  // Filtered datasets based on campusFilter and system filters
  const getDocCampus = (doc: any, type: 'user' | 'quiz' | 'submission' | 'attendance'): 'boys' | 'girls' | undefined => {
    if (doc.campus) return doc.campus;
    if (type === 'quiz') {
      const creator = users.find(u => u.uid === doc.createdById || u.email.toLowerCase() === doc.createdByEmail.toLowerCase());
      return creator?.campus;
    }
    if (type === 'submission') {
      const student = users.find(u => u.uid === doc.studentUid || u.email.toLowerCase() === doc.studentEmail.toLowerCase());
      return student?.campus;
    }
    if (type === 'attendance') {
      const u = users.find(usr => usr.email.toLowerCase() === doc.userEmail.toLowerCase());
      return u?.campus;
    }
    return undefined;
  };

  const filteredUsers = users.filter(u => {
    if (campusFilter !== 'all' && u.campus !== campusFilter) return false;
    if (systemFilterRole !== 'All' && u.role !== systemFilterRole) return false;

    if (systemSearch.trim()) {
      const q = systemSearch.toLowerCase().trim();
      const nameMatch = u.displayName.toLowerCase().includes(q);
      const emailMatch = u.email.toLowerCase().includes(q);
      const cadetMatch = u.registrationDetails?.cadetNumber?.toLowerCase().includes(q);
      if (!nameMatch && !emailMatch && !cadetMatch) return false;
    }

    if (u.role === 'student') {
      const reg = u.registrationDetails;
      if (systemFilterBatch !== 'All' && reg?.batch !== systemFilterBatch) return false;
      if (systemFilterCategory !== 'All' && reg?.category !== systemFilterCategory) return false;
      if (systemFilterClass !== 'All' && reg?.subCategory !== systemFilterClass) return false;
      if (systemFilterSection !== 'All' && reg?.physicalGroup !== systemFilterSection) return false;
    } else {
      if (systemFilterBatch !== 'All' || systemFilterCategory !== 'All' || systemFilterClass !== 'All' || systemFilterSection !== 'All') {
        return false;
      }
    }
    return true;
  });
  const filteredQuizzes = quizzes.filter(q => campusFilter === 'all' || getDocCampus(q, 'quiz') === campusFilter);
  const filteredSubmissions = submissions.filter(sub => campusFilter === 'all' || getDocCampus(sub, 'submission') === campusFilter);
  const filteredAllAttendanceRecords = allAttendanceRecords.filter(rec => campusFilter === 'all' || getDocCampus(rec, 'attendance') === campusFilter);

  const generateInstallments = (total: number, duration: string, startDateStr: string) => {
    if (!total || total <= 0) return;
    const baseDate = new Date(startDateStr);
    let count = 1;
    let monthsInterval = 1;
    
    if (duration === 'Monthly') {
      count = 12;
      monthsInterval = 1;
    } else if (duration === '3-Months') {
      count = 4;
      monthsInterval = 3;
    } else if (duration === '6-Months') {
      count = 2;
      monthsInterval = 6;
    } else if (duration === 'Year') {
      count = 1;
      monthsInterval = 12;
    } else {
      count = 1;
      monthsInterval = 12;
    }

    const installmentAmount = Math.round(total / count);
    const newInsts: { amount: number; dueDate: string; paymentStatus: 'Paid' | 'Unpaid' | 'Pending' }[] = [];
    
    for (let i = 0; i < count; i++) {
      const dueDate = new Date(baseDate);
      dueDate.setMonth(baseDate.getMonth() + (i * monthsInterval));
      
      const yyyy = dueDate.getFullYear();
      const mm = String(dueDate.getMonth() + 1).padStart(2, '0');
      const dd = String(dueDate.getDate()).padStart(2, '0');
      const dateString = `${yyyy}-${mm}-${dd}`;
      
      newInsts.push({
        amount: installmentAmount,
        dueDate: dateString,
        paymentStatus: 'Unpaid'
      });
    }

    if (newInsts.length > 0) {
      const sumGenerated = newInsts.reduce((sum, inst) => sum + inst.amount, 0);
      const diff = total - sumGenerated;
      newInsts[newInsts.length - 1].amount += diff;
    }

    setInstallmentsList(newInsts);
  };

  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('student');
  const [newPassword, setNewPassword] = useState('');
  const [newCadetNo, setNewCadetNo] = useState('');
  const [newBatch, setNewBatch] = useState('');
  const [newGroup, setNewGroup] = useState('Group A');
  const [newPhone, setNewPhone] = useState('');
  const [newStudentJoinPhysical, setNewStudentJoinPhysical] = useState(true);
  const [newSubject, setNewSubject] = useState('');
  const [recruitedSubjects, setRecruitedSubjects] = useState<{ subject: string; category: string; subCategory: string; section?: string }[]>([]);
  const [newTeacherAcademicOnly, setNewTeacherAcademicOnly] = useState(false);
  const [newTeacherSubject, setNewTeacherSubject] = useState('');

  // Recruitment checkboxes
  const [newTeacherCategories, setNewTeacherCategories] = useState<string[]>(['Academics']);
  const [newTeacherSubCategories, setNewTeacherSubCategories] = useState<string[]>([]);
  const [newTeacherSections, setNewTeacherSections] = useState<string[]>(['Group A', 'Group B', 'Group C', 'Group D']);

  // Edit roles checkboxes
  const [editTeacherCategories, setEditTeacherCategories] = useState<string[]>(['Academics']);
  const [editTeacherSubCategories, setEditTeacherSubCategories] = useState<string[]>([]);
  const [editTeacherSections, setEditTeacherSections] = useState<string[]>(['Group A', 'Group B', 'Group C', 'Group D']);
  const [newCategory, setNewCategory] = useState<string>('Academics');
  const [newSubCategory, setNewSubCategory] = useState<string>('Grade 1');

  // Teacher subject roles edit state
  const [selectedTeacherForRoles, setSelectedTeacherForRoles] = useState<UserProfile | null>(null);
  const [editTeacherSubject, setEditTeacherSubject] = useState('');

  const [whatsappAlert, setWhatsappAlert] = useState<{
    recipientName: string;
    phone: string;
    message: string;
  } | null>(null);

  const [bulkQueue, setBulkQueue] = useState<{
    title: string;
    items: {
      recipientName: string;
      phone: string;
      message: string;
      selected: boolean;
      dueDate?: string;
    }[];
    currentIndex: number;
  } | null>(null);

  // Attendance filters
  const [attFilterRole, setAttFilterRole] = useState('All');
  const [attFilterBatch, setAttFilterBatch] = useState('All');
  const [attFilterCategory, setAttFilterCategory] = useState('All');
  const [attFilterClass, setAttFilterClass] = useState('All');
  const [attFilterSection, setAttFilterSection] = useState('All');
  const [attSearch, setAttSearch] = useState('');

  // Financials filters
  const [finFilterBatch, setFinFilterBatch] = useState('All');
  const [finFilterCategory, setFinFilterCategory] = useState('All');
  const [finFilterClass, setFinFilterClass] = useState('All');
  const [finFilterSection, setFinFilterSection] = useState('All');

  // Dynamic unique filter options
  const uniqueBatches = Array.from(new Set(
    users
      .filter(u => u.role === 'student' && u.registrationDetails?.batch)
      .map(u => u.registrationDetails!.batch)
  )).sort();

  const uniqueCategories = Array.from(new Set(
    users
      .filter(u => u.role === 'student' && u.registrationDetails?.category)
      .map(u => u.registrationDetails!.category)
  )).sort();

  const uniqueClasses = Array.from(new Set(
    users
      .filter(u => u.role === 'student' && u.registrationDetails?.subCategory)
      .map(u => u.registrationDetails!.subCategory)
  )).sort();

  const uniqueSections = Array.from(new Set(
    users
      .filter(u => u.role === 'student' && u.registrationDetails?.physicalGroup)
      .map(u => u.registrationDetails!.physicalGroup)
  )).sort();

  // Fetch users and calculate database stats
  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch Users
      const usersSnap = await getDocs(collection(db, 'users'));
      const fetchedUsers: UserProfile[] = [];
      usersSnap.forEach((d) => {
        fetchedUsers.push(d.data() as UserProfile);
      });
      setUsers(fetchedUsers);

      // Fetch Quizzes
      const quizzesSnap = await getDocs(collection(db, 'quizzes'));
      const fetchedQuizzes: Quiz[] = [];
      quizzesSnap.forEach((d) => {
        fetchedQuizzes.push({ id: d.id, ...d.data() } as Quiz);
      });
      setQuizzes(fetchedQuizzes);

      // Fetch Submissions
      const submissionsSnap = await getDocs(collection(db, 'submissions'));
      const fetchedSubmissions: Submission[] = [];
      submissionsSnap.forEach((d) => {
        fetchedSubmissions.push({ id: d.id, ...d.data() } as Submission);
      });
      setSubmissions(fetchedSubmissions);

      // Fetch Attendance count
      const attendanceSnap = await getDocs(collection(db, 'attendance'));

      const fetchedAllAttendance: AttendanceRecord[] = [];
      attendanceSnap.forEach((d) => {
        fetchedAllAttendance.push(d.data() as AttendanceRecord);
      });
      setAllAttendanceRecords(fetchedAllAttendance);

      // Fetch Working Days
      const workingSnap = await getDocs(collection(db, 'working_days'));
      const fetchedWorking: string[] = [];
      workingSnap.forEach((d) => {
        fetchedWorking.push(d.id);
      });
      setWorkingDays(fetchedWorking);

      // Fetch Announcements
      const annSnap = await getDocs(collection(db, 'announcements'));
      const fetchedAnn: Announcement[] = [];
      annSnap.forEach((d) => {
        fetchedAnn.push({ id: d.id, ...d.data() } as Announcement);
      });
      setAnnouncements(fetchedAnn);
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'danger', text: "Failed to fetch system data: " + err.message });
    } finally {
      setLoading(false);
    }
  };

  // Announcements & Main Page Management State
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [newAnnTitle, setNewAnnTitle] = useState('');
  const [newAnnCategory, setNewAnnCategory] = useState('Admissions');
  const [newAnnContent, setNewAnnContent] = useState('');
  const [newAnnBadgeColor, setNewAnnBadgeColor] = useState('var(--accent-gold-dark)');

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAnnTitle.trim() || !newAnnContent.trim()) {
      setMessage({ type: 'danger', text: 'Announcement Title and Details are required.' });
      return;
    }
    setLoading(true);
    try {
      const annId = 'ann_' + Date.now();
      const newAnn: Announcement = {
        id: annId,
        title: newAnnTitle,
        category: newAnnCategory,
        date: new Date().toISOString().split('T')[0],
        content: newAnnContent,
        badgeColor: newAnnBadgeColor,
        createdAt: serverTimestamp()
      };
      await setDoc(doc(db, 'announcements', annId), newAnn);
      setAnnouncements(prev => [newAnn, ...prev]);
      setMessage({ type: 'success', text: `Published announcement "${newAnnTitle}" to Main Page!` });
      setNewAnnTitle('');
      setNewAnnContent('');
    } catch (err: any) {
      setMessage({ type: 'danger', text: 'Failed to create announcement: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAnnouncement = async (id: string, title: string) => {
    if (!window.confirm(`Delete announcement "${title}" from Main Page?`)) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'announcements', id));
      setAnnouncements(prev => prev.filter(a => a.id !== id));
      setMessage({ type: 'success', text: `Deleted announcement "${title}".` });
    } catch (err: any) {
      setMessage({ type: 'danger', text: 'Failed to delete announcement: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleQuizHomepageFeature = async (quiz: Quiz) => {
    try {
      const newStatus = !quiz.isFeaturedOnHomepage;
      await updateDoc(doc(db, 'quizzes', quiz.id), {
        isFeaturedOnHomepage: newStatus
      });
      setQuizzes(prev => prev.map(q => q.id === quiz.id ? { ...q, isFeaturedOnHomepage: newStatus } : q));
      setMessage({ type: 'success', text: `Updated Main Page feature status for "${quiz.title}".` });
    } catch (err: any) {
      setMessage({ type: 'danger', text: `Failed to update quiz feature: ${err.message}` });
    }
  };

  const fetchAttendanceForDate = async (dateStr: string) => {
    setLoading(true);
    try {
      const q = query(collection(db, 'attendance'), where('date', '==', dateStr));
      const querySnap = await getDocs(q);
      const records: Record<string, AttendanceRecord> = {};
      querySnap.forEach(d => {
        const rec = d.data() as AttendanceRecord;
        const key = (rec.userEmail || rec.userUid || '').toLowerCase();
        if (key) {
          records[key] = rec;
        }
      });
      setAttendanceRecords(records);
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'danger', text: 'Error fetching attendance: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    fetchAttendanceForDate(attendanceDate);
  }, [attendanceDate]);

  const updateAttendance = async (
    targetUser: UserProfile, 
    type: 'physical' | 'academic', 
    status: 'Present' | 'Absent' | 'Excused'
  ) => {
    setMessage(null);
    const docId = `${attendanceDate}_${targetUser.email.toLowerCase()}`;
    const existingRec = attendanceRecords[targetUser.email.toLowerCase()];

    let physicalVal = type === 'physical' ? status : (existingRec?.physicalAttendance || 'Present');
    const academicVal = type === 'academic' ? status : (existingRec?.academicAttendance || 'Present');

    const isAcademicOnly = (targetUser.role === 'student' && (targetUser.registrationDetails?.category === 'Academics' || targetUser.registrationDetails?.joinPhysical === false)) ||
                           (targetUser.role === 'teacher' && targetUser.teacherDetails?.academicOnly);
    if (isAcademicOnly) {
      physicalVal = 'Excused';
    }

    const newRecord: AttendanceRecord = {
      id: docId,
      date: attendanceDate,
      userUid: targetUser.email.toLowerCase(),
      userName: targetUser.displayName,
      userEmail: targetUser.email,
      role: targetUser.role === 'teacher' ? 'teacher' : 'student',
      physicalAttendance: physicalVal,
      academicAttendance: academicVal,
      loggedBy: developerUid,
      updatedAt: new Date()
    };

    try {
      await setDoc(doc(db, 'attendance', docId), {
        ...newRecord,
        updatedAt: serverTimestamp()
      });

      setAttendanceRecords(prev => ({
        ...prev,
        [targetUser.email.toLowerCase()]: newRecord
      }));

      setAllAttendanceRecords(prev => {
        const filtered = prev.filter(r => r.id !== docId);
        return [...filtered, newRecord];
      });


    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'danger', text: 'Failed to save attendance: ' + err.message });
    }
  };

  const getUserAttendanceStats = (email: string) => {
    if (!email) return { physPct: 'N/A', acadPct: 'N/A' };
    const targetUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    const isAcademicOnly = (targetUser?.role === 'student' && (targetUser.registrationDetails?.category === 'Academics' || targetUser.registrationDetails?.joinPhysical === false)) ||
                           (targetUser?.role === 'teacher' && targetUser.teacherDetails?.academicOnly);

    const userRecords = filteredAllAttendanceRecords.filter(r => 
      r.userEmail && r.userEmail.toLowerCase() === email.toLowerCase() && 
      workingDays.includes(r.date)
    );
    
    // For Physical
    const physLogged = userRecords.filter(r => r.physicalAttendance !== 'Excused');
    const physPresent = physLogged.filter(r => r.physicalAttendance === 'Present').length;
    let physPct = physLogged.length > 0 ? `${Math.round((physPresent / physLogged.length) * 100)}%` : 'N/A';
    if (isAcademicOnly) {
      const isNoPhysical = targetUser?.role === 'student' && targetUser.registrationDetails?.joinPhysical === false;
      physPct = isNoPhysical ? 'N/A (No Physical)' : 'N/A (Academic Only)';
    }

    // For Academic
    const acadLogged = userRecords.filter(r => r.academicAttendance !== 'Excused');
    const acadPresent = acadLogged.filter(r => r.academicAttendance === 'Present').length;
    const acadPct = acadLogged.length > 0 ? `${Math.round((acadPresent / acadLogged.length) * 100)}%` : 'N/A';

    return { physPct, acadPct };
  };

  const getUserQuizPerformanceStats = (email: string) => {
    if (!email) return 'N/A';
    const userSubmissions = submissions.filter(sub => sub.studentEmail && sub.studentEmail.toLowerCase() === email.toLowerCase());
    let totalCorrect = 0;
    let totalQuestions = 0;
    userSubmissions.forEach(sub => {
      totalCorrect += sub.score;
      totalQuestions += sub.totalQuestions;
    });
    return totalQuestions > 0 ? `${Math.round((totalCorrect / totalQuestions) * 100)}%` : 'N/A';
  };

  const handleReviewResults = async (sub: Submission) => {
    setLoading(true);
    try {
      const answersDoc = await getDoc(doc(db, 'quiz_answers', sub.quizId));
      if (answersDoc.exists()) {
        setReviewSubmission(sub);
        setReviewCorrectAnswers(answersDoc.data().answers);
      } else {
        alert("Correct answers key not found for this quiz.");
      }
    } catch (err: any) {
      console.error(err);
      alert("Failed to load attempt details: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteQuiz = async (quizId: string, title: string) => {
    if (!window.confirm(`Are you sure you want to delete the quiz "${title}"? This will delete the quiz, its answer key, and all student attempts permanently.`)) {
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      // 1. Delete Quiz document
      await deleteDoc(doc(db, 'quizzes', quizId));
      
      // 2. Delete Quiz Answer Key document
      await deleteDoc(doc(db, 'quiz_answers', quizId));
      
      // 3. Query and delete all student submissions for this quiz
      const submissionsQuery = query(collection(db, 'submissions'), where('quizId', '==', quizId));
      const submissionsSnap = await getDocs(submissionsQuery);
      const deletePromises: Promise<any>[] = [];
      submissionsSnap.forEach(d => {
        deletePromises.push(deleteDoc(doc(db, 'submissions', d.id)));
      });
      await Promise.all(deletePromises);

      setMessage({ type: 'success', text: `Quiz "${title}" and all associated data successfully deleted.` });
      
      if (selectedQuizForAttempts === quizId) {
        setSelectedQuizForAttempts(null);
      }
      
      fetchData();
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'danger', text: 'Failed to delete quiz data: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenFinanceModal = (u: UserProfile) => {
    setSelectedUserForFinance(u);
    const dur = u.financials?.duration || 'Monthly';
    if (['Monthly', '3-Months', '6-Months', 'Year'].includes(dur)) {
      setFinanceDuration(dur);
      setCustomDurationValue('');
    } else {
      setFinanceDuration('Custom');
      setCustomDurationValue(dur);
    }
    
    // Set installment states
    setYearlyTotalAmount(u.financials?.yearlyTotal || (u.financials?.amount ? u.financials.amount * (dur === 'Monthly' ? 12 : dur === '3-Months' ? 4 : dur === '6-Months' ? 2 : 1) : 0));
    setInstallmentStartDate(u.financials?.startDate || new Date().toISOString().split('T')[0]);
    setInstallmentsList(u.financials?.installments || []);
  };

  const handleSaveFinancials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForFinance) return;
    setLoading(true);
    setMessage(null);
    try {
      const finalDuration = financeDuration === 'Custom' ? customDurationValue : financeDuration;

      const tempFinancials = {
        amount: 0,
        duration: finalDuration || 'Monthly',
        paymentStatus: 'Unpaid' as const,
        yearlyTotal: yearlyTotalAmount,
        splitType: financeDuration,
        startDate: installmentStartDate,
        installments: installmentsList,
        lastUpdated: new Date()
      };

      const effective = getEffectiveFinancials(tempFinancials);

      const financialsObj = {
        ...tempFinancials,
        amount: effective.amount,
        paymentStatus: effective.paymentStatus,
        dueDate: effective.dueDate,
      };
      
      const userRef = doc(db, 'users', selectedUserForFinance.email.toLowerCase());
      await setDoc(userRef, { financials: financialsObj }, { merge: true });
      
      setMessage({ type: 'success', text: `Financial details updated for ${selectedUserForFinance.displayName}!` });
      
      // Update local state
      setUsers(prev => prev.map(u => u.email === selectedUserForFinance.email ? { ...u, financials: { ...financialsObj, lastUpdated: new Date() } } : u));
      
      if (selectedUserForFinance.role === 'teacher' && financialsObj.paymentStatus === 'Paid') {
        const phoneNum = selectedUserForFinance.teacherDetails?.phone || '';
        if (phoneNum) {
          setWhatsappAlert({
            recipientName: selectedUserForFinance.displayName,
            phone: phoneNum,
            message: `Dear ${selectedUserForFinance.displayName}, we are pleased to inform you that your salary of PKR ${financialsObj.amount} for the cycle (${finalDuration || 'Monthly'}) has been marked as PAID by Cadets Coaching Academy. Thank you for your service.`
          });
        }
      }

      setSelectedUserForFinance(null);
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'danger', text: 'Failed to update financials: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveScoreEdit = async () => {
    if (!editingSubmission) return;
    setLoading(true);
    try {
      const subRef = doc(db, 'submissions', editingSubmission.id);
      await updateDoc(subRef, { score: editingScoreValue });
      setMessage({ type: 'success', text: `Successfully updated ${editingSubmission.studentName}'s score to ${editingScoreValue}!` });
      setSubmissions(prev => prev.map(s => s.id === editingSubmission.id ? { ...s, score: editingScoreValue } : s));
      setEditingSubmission(null);
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'danger', text: 'Failed to edit score: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStudentPhysicalJoin = async (student: UserProfile) => {
    if (!student.registrationDetails) return;
    const currentStatus = student.registrationDetails.joinPhysical !== false;
    const updatedDetails = {
      ...student.registrationDetails,
      joinPhysical: !currentStatus
    };

    try {
      const userRef = doc(db, 'users', student.email.toLowerCase());
      await setDoc(userRef, { registrationDetails: updatedDetails }, { merge: true });

      setUsers(prev => prev.map(u => {
        if (u.email.toLowerCase() === student.email.toLowerCase()) {
          return {
            ...u,
            registrationDetails: updatedDetails
          };
        }
        return u;
      }));
    } catch (err: any) {
      console.error(err);
      alert('Failed to update student physical class access: ' + err.message);
    }
  };

  const handleToggleTeacherPhysicalAccess = async (teacher: UserProfile) => {
    const details = teacher.teacherDetails || { subject: '', phone: '', subjects: [], academicOnly: false };
    const currentAcademicOnlyStatus = details.academicOnly === true;
    const updatedDetails = {
      ...details,
      academicOnly: !currentAcademicOnlyStatus
    };

    try {
      setLoading(true);
      const userRef = doc(db, 'users', teacher.email.toLowerCase());
      await setDoc(userRef, { teacherDetails: updatedDetails }, { merge: true });

      setUsers(prev => prev.map(u => {
        if (u.email.toLowerCase() === teacher.email.toLowerCase()) {
          return {
            ...u,
            teacherDetails: updatedDetails
          };
        }
        return u;
      }));
      setMessage({ type: 'success', text: `Physical class access updated for teacher ${teacher.displayName}!` });
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'danger', text: 'Failed to update physical access: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleAddTeacherSubjectRole = async (teacher: UserProfile) => {
    const subjName = editTeacherSubject.trim();
    if (!subjName) {
      alert("Please enter a subject name.");
      return;
    }

    const currentDetails = teacher.teacherDetails || { subject: '', phone: '', subjects: [], academicOnly: false };
    const currentSubjects = currentDetails.subjects || [];

    const catStr = editTeacherCategories.join(',');
    const subCatStr = editTeacherSubCategories.join(',') || 'All';
    const secStr = editTeacherSections.join(',') || 'All';

    if (currentSubjects.some(rs => rs.subject.toLowerCase() === subjName.toLowerCase() && rs.category === catStr && rs.subCategory === subCatStr && rs.section === secStr)) {
      alert("This subject role configuration is already assigned.");
      return;
    }

    const updatedSubjects = [...currentSubjects, { subject: subjName, category: catStr, subCategory: subCatStr, section: secStr }];
    const updatedSubjectText = updatedSubjects.map(s => `${s.subject} → ${s.subCategory} (${s.category}) [Sections: ${s.section || 'All'}]`).join(', ');

    const updatedDetails = {
      ...currentDetails,
      subjects: updatedSubjects,
      subject: updatedSubjectText
    };

    try {
      setLoading(true);
      const userRef = doc(db, 'users', teacher.email.toLowerCase());
      await setDoc(userRef, { teacherDetails: updatedDetails }, { merge: true });

      const updatedUser = {
        ...teacher,
        teacherDetails: updatedDetails
      };
      setUsers(prev => prev.map(u => u.email.toLowerCase() === teacher.email.toLowerCase() ? updatedUser : u));
      setSelectedTeacherForRoles(updatedUser);
      setEditTeacherSubject('');
      setMessage({ type: 'success', text: `Added class role "${subjName}" to teacher ${teacher.displayName}!` });
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'danger', text: 'Failed to add class role: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveTeacherSubjectRole = async (teacher: UserProfile, indexToRemove: number) => {
    const currentDetails = teacher.teacherDetails || { subject: '', phone: '', subjects: [], academicOnly: false };
    const currentSubjects = currentDetails.subjects || [];
    const updatedSubjects = currentSubjects.filter((_, idx) => idx !== indexToRemove);
    const updatedSubjectText = updatedSubjects.map(s => `${s.subject} → ${s.subCategory} (${s.category}) [Sections: ${s.section || 'All'}]`).join(', ') || 'None';

    const updatedDetails = {
      ...currentDetails,
      subjects: updatedSubjects,
      subject: updatedSubjectText
    };

    try {
      setLoading(true);
      const userRef = doc(db, 'users', teacher.email.toLowerCase());
      await setDoc(userRef, { teacherDetails: updatedDetails }, { merge: true });

      const updatedUser = {
        ...teacher,
        teacherDetails: updatedDetails
      };
      setUsers(prev => prev.map(u => u.email.toLowerCase() === teacher.email.toLowerCase() ? updatedUser : u));
      setSelectedTeacherForRoles(updatedUser);
      setMessage({ type: 'success', text: `Removed class role from teacher ${teacher.displayName}!` });
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'danger', text: 'Failed to remove class role: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleWorkingDay = async () => {
    setMessage(null);
    setLoading(true);
    const isWorking = workingDays.includes(attendanceDate);
    const docRef = doc(db, 'working_days', attendanceDate);

    try {
      if (isWorking) {
        if (window.confirm("Are you sure you want to remove this working day? Logged attendance for this date will be excluded from overall percentage calculations.")) {
          await deleteDoc(docRef);
          setWorkingDays(prev => prev.filter(d => d !== attendanceDate));
        }
      } else {
        await setDoc(docRef, {
          date: attendanceDate,
          createdAt: serverTimestamp(),
          createdBy: developerUid
        });
        setWorkingDays(prev => [...prev, attendanceDate]);

        // Create default attendance records for all active students and teachers who do not have one
        const activeUsers = users.filter(u => u.role === 'student' || u.role === 'teacher');
        const batchPromises = activeUsers.map(async (u) => {
          const docId = `${attendanceDate}_${u.email.toLowerCase()}`;
          const existingRec = attendanceRecords[u.email.toLowerCase()];

          if (!existingRec) {
            const newRecord: AttendanceRecord = {
              id: docId,
              date: attendanceDate,
              userUid: u.email.toLowerCase(),
              userName: u.displayName,
              userEmail: u.email,
              role: u.role === 'teacher' ? 'teacher' : 'student',
              physicalAttendance: 'Present',
              academicAttendance: 'Present',
              loggedBy: developerUid,
              updatedAt: new Date()
            };

            await setDoc(doc(db, 'attendance', docId), {
              ...newRecord,
              updatedAt: serverTimestamp()
            });

            // Update local state
            setAttendanceRecords(prev => ({
              ...prev,
              [u.email.toLowerCase()]: newRecord
            }));

            setAllAttendanceRecords(prev => {
              const filtered = prev.filter(r => r.id !== docId);
              return [...filtered, newRecord];
            });
          }
        });
        await Promise.all(batchPromises);
      }
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'danger', text: 'Failed to update working day status: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (email: string, newRole: UserRole) => {
    setMessage(null);
    try {
      await updateDoc(doc(db, 'users', email.toLowerCase()), { role: newRole });
      setMessage({ type: 'success', text: `Role updated to ${newRole} successfully!` });
      // Update local state
      setUsers((prev: UserProfile[]) => prev.map((u: UserProfile) => u.email === email ? { ...u, role: newRole } : u));
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'danger', text: "Failed to update role: " + err.message });
    }
  };

  const handleDeleteUser = async (email: string, name: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete the profile for ${name} (${email})? This will revoke all their portal access immediately.`)) return;
    
    setLoading(true);
    setMessage(null);
    try {
      await deleteDoc(doc(db, 'users', email.toLowerCase()));
      setMessage({ type: 'success', text: `Profile for ${name} has been permanently deleted.` });
      // Update local state
      setUsers((prev: UserProfile[]) => prev.filter(u => u.email !== email));
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'danger', text: "Failed to delete user profile: " + err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUserProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);

    const lowerEmail = newEmail.trim().toLowerCase();
    if (!lowerEmail || !newName.trim() || !newPassword.trim()) {
      setMessage({ type: 'danger', text: 'Email, Name, and Initial Password are required.' });
      setLoading(false);
      return;
    }

    try {
      const profileDoc: any = {
        uid: "", // Will be set on first sign in
        email: lowerEmail,
        displayName: newName.trim(),
        role: newRole,
        password: newPassword.trim(),
        campus: newRole === 'developer' ? undefined : newCampus,
        createdAt: serverTimestamp()
      };

      if (newRole === 'student') {
        profileDoc.registrationDetails = {
          cadetNumber: newCadetNo.trim() || `Cadet-${Math.floor(100 + Math.random() * 900)}`,
          batch: newBatch.trim() || 'Batch 2026',
          physicalGroup: newGroup,
          phone: newPhone.trim() || '+92 300 0000000',
          category: newCategory,
          subCategory: newSubCategory,
          joinPhysical: newStudentJoinPhysical
        };
      } else if (newRole === 'teacher') {
        const defaultSub = recruitedSubjects.map(s => `${s.subject} (${s.subCategory})`).join(', ') || newSubject.trim() || 'Tactics';
        profileDoc.teacherDetails = {
          subject: defaultSub,
          phone: newPhone.trim() || '+92 300 0000000',
          subjects: recruitedSubjects,
          academicOnly: newTeacherAcademicOnly
        };
      }

      await setDoc(doc(db, 'users', lowerEmail), profileDoc);
      setMessage({ type: 'success', text: `Dossier profile for ${newName} (${lowerEmail}) created successfully! They can now sign in to activate their account.` });
      
      // Reset form
      setNewEmail('');
      setNewName('');
      setNewPassword('');
      setNewRole('student');
      setNewCadetNo('');
      setNewBatch('');
      setNewGroup('Group A');
      setNewPhone('');
      setNewStudentJoinPhysical(true);
      setNewSubject('');
      setRecruitedSubjects([]);
      setNewTeacherAcademicOnly(false);
      setNewTeacherSubject('');
      setNewCategory('Academics');
      setNewSubCategory('Grade 1');
      
      fetchData(); // Reload list
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'danger', text: 'Failed to create profile: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSeedDatabase = async () => {
    if (!window.confirm("Are you sure you want to seed mock data? This will write sample students, teachers, quizzes, correct keys, and attendance records.")) return;
    
    setLoading(true);
    setMessage(null);

    try {
      const batch = writeBatch(db);

      // 1. Seed some mock students (keyed by email in Firestore)
      const mockStudents = [
        { uid: "", displayName: "Cadet Ali Khan", email: "ali@cadetacademy.com", role: "student" as UserRole, password: "student123", registrationDetails: { cadetNumber: "Cadet-102", batch: "Batch 2026", physicalGroup: "Group A", phone: "+92 300 7654321", category: "Academics", subCategory: "Grade 10" } },
        { uid: "", displayName: "Cadet Hamza Lodhi", email: "hamza@cadetacademy.com", role: "student" as UserRole, password: "student123", registrationDetails: { cadetNumber: "Cadet-103", batch: "Batch 2026", physicalGroup: "Group B", phone: "+92 311 9876543", category: "Army", subCategory: "PMA" } },
        { uid: "", displayName: "Cadet Zain Bajwa", email: "zain@cadetacademy.com", role: "student" as UserRole, password: "student123", registrationDetails: { cadetNumber: "Cadet-104", batch: "Batch 2026", physicalGroup: "Group C", phone: "+92 321 4567890", category: "PAF", subCategory: "Cadet" } }
      ];

      mockStudents.forEach(student => {
        batch.set(doc(db, 'users', student.email.toLowerCase()), {
          uid: student.uid,
          email: student.email,
          displayName: student.displayName,
          role: student.role,
          password: student.password,
          createdAt: serverTimestamp(),
          registrationDetails: student.registrationDetails
        });
      });

      // 2. Seed some mock teachers
      const mockTeachers = [
        { uid: "", displayName: "Captain Asim Riaz", email: "asim@cadetacademy.com", role: "teacher" as UserRole, password: "teacher123", teacherDetails: { subject: "Military Strategy", phone: "+92 333 1122334" } }
      ];

      mockTeachers.forEach(teacher => {
        batch.set(doc(db, 'users', teacher.email.toLowerCase()), {
          uid: teacher.uid,
          email: teacher.email,
          displayName: teacher.displayName,
          role: teacher.role,
          password: teacher.password,
          createdAt: serverTimestamp(),
          teacherDetails: teacher.teacherDetails
        });
      });

      // Seed the Developer and Admin accounts profiles as well so they exist in Firestore
      batch.set(doc(db, 'users', 'developer@cadetacademy.com'), {
        uid: "",
        email: "developer@cadetacademy.com",
        displayName: "Demo Developer",
        role: "developer" as UserRole,
        password: "developer123",
        createdAt: serverTimestamp()
      });

      batch.set(doc(db, 'users', 'admin@cadetacademy.com'), {
        uid: "",
        email: "admin@cadetacademy.com",
        displayName: "Demo Admin",
        role: "admin" as UserRole,
        password: "admin123",
        createdAt: serverTimestamp()
      });

      // 3. Seed quizzes & answer keys
      const quiz1Id = "quiz_general_tactics";
      const quiz1 = {
        title: "ISSB General Tactics & Leadership",
        description: "Standard tactical test for Cadet Officers. Covers leadership qualities, map analysis, and military reasoning. Strict 3 minutes timer.",
        duration: 3,
        createdById: "teacher_asim",
        createdByEmail: "asim@cadetacademy.com",
        createdAt: serverTimestamp(),
        questions: [
          {
            id: "q1",
            questionText: "What is the primary duty of an officer in the field?",
            options: [
              "Ensure the absolute safety of personal quarters",
              "Execute the mission successfully while conserving human resources",
              "Retreat immediately when facing equal opposition forces",
              "Delegate all communication protocols to low-ranking soldiers"
            ]
          },
          {
            id: "q2",
            questionText: "In military map coordinates, what color is typically used to represent vegetation or forested regions?",
            options: [
              "Blue",
              "Red",
              "Green",
              "Brown"
            ]
          },
          {
            id: "q3",
            questionText: "What does the military abbreviation 'SOP' stand for?",
            options: [
              "Section Officer Protocol",
              "Standard Operating Procedure",
              "Special Operations Plan",
              "System Operations Program"
            ]
          }
        ]
      };

      const answer1 = {
        answers: {
          q1: 1, // "Execute the mission successfully..." (Index 1)
          q2: 2, // "Green" (Index 2)
          q3: 1  // "Standard Operating Procedure" (Index 1)
        }
      };

      const quiz2Id = "quiz_fitness_theory";
      const quiz2 = {
        title: "Physical Fitness & Physiology",
        description: "Theoretical knowledge for physical training, including diet guidelines, recovery cycles, and endurance building.",
        duration: 5,
        createdById: "teacher_asim",
        createdByEmail: "asim@cadetacademy.com",
        createdAt: serverTimestamp(),
        questions: [
          {
            id: "fq1",
            questionText: "Which energy system is primarily utilized during a short 100-meter sprint?",
            options: [
              "Aerobic oxidative pathway",
              "Anaerobic ATP-CP phosphagen system",
              "Beta-oxidation lipid cycle",
              "Lactate threshold respiratory system"
            ]
          },
          {
            id: "fq2",
            questionText: "What is the recommended heart rate recovery metric for a cadet post-workout?",
            options: [
              "Remaining above 150 bpm for one hour",
              "Dropping by at least 12 bpm within the first minute",
              "Increasing by 20 bpm within 5 minutes of rest",
              "Remaining exactly at the maximum heart rate for 10 minutes"
            ]
          }
        ]
      };

      const answer2 = {
        answers: {
          fq1: 1, // "Anaerobic ATP-CP..." (Index 1)
          fq2: 1  // "Dropping by at least 12 bpm..." (Index 1)
        }
      };

      batch.set(doc(db, 'quizzes', quiz1Id), quiz1);
      batch.set(doc(db, 'quiz_answers', quiz1Id), answer1);
      batch.set(doc(db, 'quizzes', quiz2Id), quiz2);
      batch.set(doc(db, 'quiz_answers', quiz2Id), answer2);

      // 4. Seed some mock attendance records
      const dates = ["2026-06-16", "2026-06-17", "2026-06-18"];
      // Seed for Ali and Hamza (keyed by date_email in Firestore)
      dates.forEach(date => {
        batch.set(doc(db, 'attendance', `${date}_ali@cadetacademy.com`), {
          id: `${date}_ali@cadetacademy.com`,
          date: date,
          userUid: "ali@cadetacademy.com",
          userName: "Cadet Ali Khan",
          userEmail: "ali@cadetacademy.com",
          role: "student",
          physicalAttendance: date === "2026-06-17" ? "Absent" : "Present",
          academicAttendance: "Present",
          loggedBy: "developer_seed",
          updatedAt: serverTimestamp()
        });

        batch.set(doc(db, 'attendance', `${date}_hamza@cadetacademy.com`), {
          id: `${date}_hamza@cadetacademy.com`,
          date: date,
          userUid: "hamza@cadetacademy.com",
          userName: "Cadet Hamza Lodhi",
          userEmail: "hamza@cadetacademy.com",
          role: "student",
          physicalAttendance: "Present",
          academicAttendance: date === "2026-06-16" ? "Excused" : "Present",
          loggedBy: "developer_seed",
          updatedAt: serverTimestamp()
        });
      });

      await batch.commit();
      setMessage({ type: 'success', text: "Database successfully seeded with mock data! Refreshing..." });
      fetchData();
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'danger', text: "Failed to seed database: " + err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fade-in">
      <div className="dashboard-header">
        <div>
          <h2>Developer System Controls</h2>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-light)', fontWeight: 500 }}>
            Manage database state, pre-register users, and review attendance logs
          </span>
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <select 
            value={campusFilter} 
            onChange={(e) => setCampusFilter(e.target.value as any)} 
            style={{ 
              height: '38px', 
              padding: '0 1rem', 
              border: '1px solid var(--border-color)', 
              borderRadius: '6px', 
              backgroundColor: 'var(--bg-white)', 
              color: 'var(--text-main)', 
              fontWeight: 600,
              fontSize: '0.85rem'
            }}
          >
            <option value="all">All Campuses</option>
            <option value="boys">Boys Campus Only</option>
            <option value="girls">Girls Campus Only</option>
          </select>
          <div className="segmented-control">
            <button 
              onClick={() => setActiveTab('controls')} 
              className={`segmented-btn ${activeTab === 'controls' ? 'active' : ''}`}
            >
              <Shield size={14} />
              System Controls
            </button>
            <button 
              onClick={() => setActiveTab('attendance')} 
              className={`segmented-btn ${activeTab === 'attendance' ? 'active' : ''}`}
            >
              <Calendar size={14} />
              Attendance Logs
            </button>
            <button 
              onClick={() => setActiveTab('quizzes')} 
              className={`segmented-btn ${activeTab === 'quizzes' ? 'active' : ''}`}
            >
              <BookOpen size={14} />
              Quizzes & Results
            </button>
            <button 
              onClick={() => setActiveTab('financials')} 
              className={`segmented-btn ${activeTab === 'financials' ? 'active' : ''}`}
            >
              <DollarSign size={14} />
              Financials
            </button>
            <button 
              onClick={() => setActiveTab('homepage')} 
              className={`segmented-btn ${activeTab === 'homepage' ? 'active' : ''}`}
            >
              <Bell size={14} />
              Main Page & Announcements
            </button>
          </div>
          <button 
            onClick={() => { fetchData(); fetchAttendanceForDate(attendanceDate); }} 
            className="btn btn-secondary btn-sm" 
            disabled={loading}
            style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', width: 'auto', height: '38px', padding: '0 0.75rem' }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            Reload System
          </button>
        </div>
      </div>

      {message && (
        <div className={`alert alert-${message.type}`}>
          {message.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
        </div>
      )}
      {activeTab === 'controls' && (
        <>
          {/* Stats Grid */}
          {(() => {
            let physPresent = 0;
            let acadPresent = 0;
            const targetUsers = users.filter(u => u.role === 'student' || u.role === 'teacher');
            targetUsers.forEach(u => {
              const rec = attendanceRecords[u.email.toLowerCase()];
              const isAcademicOnly = (u.role === 'student' && (u.registrationDetails?.category === 'Academics' || u.registrationDetails?.joinPhysical === false)) ||
                                     (u.role === 'teacher' && u.teacherDetails?.academicOnly);
              if (rec) {
                if (!isAcademicOnly) {
                  const phys = rec.physicalAttendance;
                  if (phys === 'Present') physPresent++;
                }
                const acad = rec.academicAttendance;
                if (acad === 'Present') acadPresent++;
              }
            });

            return (
              <div className="stats-grid">
                <div className="stat-card navy">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="stat-title">Registered Users</span>
                    <Users size={20} color="var(--primary-navy-light)" />
                  </div>
                  <span className="stat-value">{filteredUsers.length}</span>
                </div>
                <div className="stat-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="stat-title">Quizzes Available</span>
                    <BookOpen size={20} color="var(--secondary-olive)" />
                  </div>
                  <span className="stat-value">{filteredQuizzes.length}</span>
                </div>
                <div className="stat-card gold">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="stat-title">Quiz Submissions</span>
                    <FileCheck size={20} color="var(--accent-gold-dark)" />
                  </div>
                  <span className="stat-value">{filteredSubmissions.length}</span>
                </div>
                <div className="stat-card navy">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="stat-title">Daily Present ({attendanceDate})</span>
                    <Calendar size={20} color="var(--primary-navy-light)" />
                  </div>
                  <span className="stat-value" style={{ fontSize: '1.25rem', display: 'block', marginTop: '0.5rem', fontWeight: 800 }}>
                    Phys: {physPresent} | Acad: {acadPresent}
                  </span>
                </div>
              </div>
            );
          })()}

      {/* System Actions */}
      <div style={{ backgroundColor: 'rgba(197, 160, 89, 0.05)', border: '1px solid var(--accent-gold)', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1rem', textTransform: 'uppercase', color: 'var(--accent-gold-dark)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Shield size={18} />
          <span>System Initialization Tools</span>
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-dark)', marginBottom: '1rem' }}>
          Instantly reset or seed sample data in your Firestore database. This seeds 3 cadets, 1 strategy teacher, 2 timed MCQ tests, answer keys, and a history of attendance logs.
        </p>
        <button 
          onClick={handleSeedDatabase} 
          className="btn btn-accent" 
          disabled={loading}
          style={{ width: 'auto' }}
        >
          Reset & Seed Mock Data
        </button>
      </div>

      {/* Profile Pre-registration Form */}
      <div style={{ backgroundColor: 'var(--bg-white)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '2rem', marginBottom: '2rem', boxShadow: 'var(--shadow-sm)' }}>
        <h3 style={{ fontSize: '1.2rem', textTransform: 'uppercase', marginBottom: '1rem', color: 'var(--primary-navy)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Plus size={20} color="var(--secondary-olive)" />
          <span>Pre-register Cadet or Staff Profile</span>
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', marginBottom: '1.5rem' }}>
          Register a user's details first. The user can then login to activate their account and set their permanent password.
        </p>

        <form onSubmit={handleCreateUserProfile} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-group-row">
            <div className="form-group">
              <label>Full Name</label>
              <input 
                type="text" 
                placeholder="Full Name" 
                value={newName} 
                onChange={(e) => setNewName(e.target.value)} 
                required
                disabled={loading}
              />
            </div>
            <div className="form-group">
              <label>Email Address</label>
              <input 
                type="email" 
                placeholder="Email Address" 
                value={newEmail} 
                onChange={(e) => setNewEmail(e.target.value)} 
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="form-group-row">
            <div className="form-group">
              <label>Assigned System Role</label>
              <select 
                value={newRole} 
                onChange={(e) => setNewRole(e.target.value as UserRole)}
                disabled={loading}
              >
                <option value="student">Student (Cadet)</option>
                <option value="teacher">Teacher (Instructor)</option>
                <option value="admin">Administrator</option>
                <option value="developer">Developer</option>
              </select>
            </div>
            <div className="form-group">
              <label>Initial Password</label>
              <input 
                type="text" 
                placeholder="Initial Password" 
                value={newPassword} 
                onChange={(e) => setNewPassword(e.target.value)} 
                required
                disabled={loading}
              />
            </div>
          </div>

          {newRole === 'student' && (
            <div className="fade-in">
              <div className="form-group-row">
                <div className="form-group">
                  <label>Cadet ID Number</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Cadet-105" 
                    value={newCadetNo} 
                    onChange={(e) => setNewCadetNo(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                <div className="form-group">
                  <label>Batch Code</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Batch 2026" 
                    value={newBatch} 
                    onChange={(e) => setNewBatch(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="form-group-row" style={{ gap: '1.5rem', alignItems: 'center' }}>
                <div className="form-group" style={{ maxWidth: '300px' }}>
                  <label>Physical Group Category</label>
                  <select value={newGroup} onChange={(e) => setNewGroup(e.target.value)} disabled={loading}>
                    <option value="Group A">Group A</option>
                    <option value="Group B">Group B</option>
                    <option value="Group C">Group C</option>
                    <option value="Group D">Group D</option>
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.25rem' }}>
                  <input 
                    type="checkbox" 
                    id="newStudentJoinPhysical" 
                    checked={newStudentJoinPhysical} 
                    onChange={(e) => setNewStudentJoinPhysical(e.target.checked)} 
                    disabled={loading}
                    style={{ width: 'auto', margin: 0 }}
                  />
                  <label htmlFor="newStudentJoinPhysical" style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-dark)', cursor: 'pointer' }}>
                    Can Join Physical Classes
                  </label>
                </div>
              </div>

              <div className="form-group-row">
                <div className="form-group">
                  <label>Registration Category</label>
                  <select 
                    value={newCategory} 
                    onChange={(e) => {
                      const cat = e.target.value;
                      setNewCategory(cat);
                      const subcats = REGISTRATION_CATEGORIES[cat] || [];
                      setNewSubCategory(subcats[0] || '');
                    }} 
                    disabled={loading}
                  >
                    {Object.keys(REGISTRATION_CATEGORIES).map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Class / Sub-Category</label>
                  <select 
                    value={newSubCategory} 
                    onChange={(e) => setNewSubCategory(e.target.value)} 
                    disabled={loading}
                  >
                    {(REGISTRATION_CATEGORIES[newCategory] || []).map(sub => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {newRole === 'teacher' && (
            <div className="fade-in" style={{ backgroundColor: 'var(--bg-slate)', padding: '1.25rem', borderRadius: '6px', border: '1px solid var(--border-color)', marginBottom: '1rem', width: '100%', maxWidth: '600px' }}>
              <label style={{ fontWeight: 600, color: 'var(--primary-navy)', display: 'block', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                Recruitment Subject Roles (Assign multiple subjects & target classes)
              </label>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', backgroundColor: 'var(--bg-white)', padding: '0.5rem 0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                <input 
                  type="checkbox" 
                  id="newTeacherAcademicOnly" 
                  checked={newTeacherAcademicOnly} 
                  onChange={(e) => setNewTeacherAcademicOnly(e.target.checked)} 
                  disabled={loading}
                  style={{ width: 'auto', margin: 0 }}
                />
                <label htmlFor="newTeacherAcademicOnly" style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-dark)', cursor: 'pointer' }}>
                  Enrolled for Academic Purposes Only (Restricts Physical Attendance Logging)
                </label>
              </div>
              
              {/* Current assigned subjects list */}
              {recruitedSubjects.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-light)', fontStyle: 'italic', margin: '0 0 1rem 0' }}>
                  No subject-class roles assigned yet. Add at least one below.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                  {recruitedSubjects.map((rs, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-white)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                      <span>
                        <strong style={{ color: 'var(--primary-navy)' }}>{rs.subject}</strong> &rarr; {rs.subCategory} ({rs.category}) {rs.section ? `[Sections: ${rs.section}]` : ''}
                      </span>
                      <button 
                        type="button" 
                        onClick={() => setRecruitedSubjects(prev => prev.filter((_, i) => i !== idx))}
                        className="btn btn-danger btn-sm"
                        style={{ padding: '2px 6px', fontSize: '0.7rem' }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add pairing form */}
              {/* Add pairing form */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-dark)' }}>Subject Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Navigation Tactics" 
                    value={newTeacherSubject} 
                    onChange={(e) => setNewTeacherSubject(e.target.value)}
                    disabled={loading}
                  />
                </div>

                {/* Categories Checkboxes */}
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-dark)', display: 'block', marginBottom: '0.35rem' }}>Categories</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', backgroundColor: 'var(--bg-white)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    {Object.keys(REGISTRATION_CATEGORIES).map(cat => {
                      const isChecked = newTeacherCategories.includes(cat);
                      return (
                        <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', cursor: 'pointer', margin: 0 }}>
                          <input 
                            type="checkbox" 
                            checked={isChecked} 
                            onChange={() => {
                              if (isChecked) {
                                setNewTeacherCategories(prev => prev.filter(c => c !== cat));
                                const subcats = REGISTRATION_CATEGORIES[cat] || [];
                                setNewTeacherSubCategories(prev => prev.filter(sc => !subcats.includes(sc)));
                              } else {
                                setNewTeacherCategories(prev => [...prev, cat]);
                              }
                            }}
                            disabled={loading}
                          />
                          <span>{cat}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Classes Checkboxes */}
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-dark)', display: 'block', marginBottom: '0.35rem' }}>Classes / Sub-Categories</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.5rem', backgroundColor: 'var(--bg-white)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    {(() => {
                      const availableClasses = newTeacherCategories.reduce((acc, cat) => {
                        if (REGISTRATION_CATEGORIES[cat]) acc.push(...REGISTRATION_CATEGORIES[cat]);
                        return acc;
                      }, [] as string[]);
                      
                      if (availableClasses.length === 0) {
                        return <span style={{ color: 'var(--text-light)', fontSize: '0.8rem' }}>Check at least one Category to view classes.</span>;
                      }

                      return availableClasses.map(cls => {
                        const isChecked = newTeacherSubCategories.includes(cls);
                        return (
                          <label key={cls} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', cursor: 'pointer', margin: 0 }}>
                            <input 
                              type="checkbox" 
                              checked={isChecked} 
                              onChange={() => {
                                if (isChecked) {
                                  setNewTeacherSubCategories(prev => prev.filter(c => c !== cls));
                                } else {
                                  setNewTeacherSubCategories(prev => [...prev, cls]);
                                }
                              }}
                              disabled={loading}
                            />
                            <span>{cls}</span>
                          </label>
                        );
                      });
                    })()}
                  </div>
                </div>

                {/* Sections Checkboxes */}
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-dark)', display: 'block', marginBottom: '0.35rem' }}>Sections</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', backgroundColor: 'var(--bg-white)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    {['Group A', 'Group B', 'Group C', 'Group D'].map(sec => {
                      const isChecked = newTeacherSections.includes(sec);
                      return (
                        <label key={sec} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', cursor: 'pointer', margin: 0 }}>
                          <input 
                            type="checkbox" 
                            checked={isChecked} 
                            onChange={() => {
                              if (isChecked) {
                                setNewTeacherSections(prev => prev.filter(s => s !== sec));
                              } else {
                                setNewTeacherSections(prev => [...prev, sec]);
                              }
                            }}
                            disabled={loading}
                          />
                          <span>{sec}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <button 
                  type="button" 
                  onClick={() => {
                    const subjectName = newTeacherSubject.trim();
                    if (!subjectName) {
                      alert('Please enter a subject name.');
                      return;
                    }
                    if (newTeacherCategories.length === 0) {
                      alert('Please select at least one Category.');
                      return;
                    }
                    const catStr = newTeacherCategories.join(',');
                    const subCatStr = newTeacherSubCategories.join(',') || 'All';
                    const secStr = newTeacherSections.join(',') || 'All';

                    if (recruitedSubjects.some(rs => rs.subject.toLowerCase() === subjectName.toLowerCase() && rs.category === catStr && rs.subCategory === subCatStr && rs.section === secStr)) {
                      alert('This subject role configuration is already in the list.');
                      return;
                    }
                    setRecruitedSubjects(prev => [...prev, { subject: subjectName, category: catStr, subCategory: subCatStr, section: secStr }]);
                    setNewTeacherSubject('');
                  }}
                  className="btn btn-secondary btn-sm"
                  style={{ height: '38px', padding: '0 1rem', display: 'flex', alignItems: 'center', alignSelf: 'flex-start' }}
                  disabled={loading}
                >
                  Add Role
                </button>
              </div>
            </div>
          )}

          {(newRole === 'student' || newRole === 'teacher') && (
            <div className="form-group" style={{ maxWidth: '300px' }}>
              <label>Contact Phone</label>
              <input 
                type="tel" 
                placeholder="e.g. +92 300 1234567" 
                value={newPhone} 
                onChange={(e) => setNewPhone(e.target.value)}
                required
                disabled={loading}
              />
            </div>
          )}

          {newRole !== 'developer' && (
            <div className="form-group" style={{ maxWidth: '300px', marginBottom: '1rem' }}>
              <label>Campus Assignment</label>
              <select 
                value={newCampus} 
                onChange={(e) => setNewCampus(e.target.value as 'boys' | 'girls')} 
                disabled={loading}
                style={{ border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.35rem' }}
              >
                <option value="boys">Boys Campus</option>
                <option value="girls">Girls Campus</option>
              </select>
            </div>
          )}

          <button type="submit" className="btn btn-secondary btn-sm" disabled={loading} style={{ alignSelf: 'flex-start', marginTop: '0.5rem' }}>
            Pre-register Profile Dossier
          </button>
        </form>
      </div>

      {/* User Role Matrix & System Controls */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3 style={{ fontSize: '1.2rem', textTransform: 'uppercase', color: 'var(--primary-navy)', margin: 0 }}>
            System Controls & Student Class/Section Management (RBAC)
          </h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-light)', fontWeight: 600 }}>
            Showing {filteredUsers.length} of {users.length} Total Users
          </span>
        </div>

        {/* System Controls Filter Bar */}
        <div style={{ 
          display: 'flex', 
          flexWrap: 'wrap', 
          gap: '1rem', 
          marginBottom: '1.5rem', 
          padding: '1.25rem', 
          backgroundColor: 'var(--bg-white)', 
          borderRadius: '8px', 
          border: '1px solid var(--border-color)',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.02)'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 200px' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase' }}>Search Name / Email / Cadet #</label>
            <input 
              type="text" 
              placeholder="Search students or staff..." 
              value={systemSearch}
              onChange={(e) => setSystemSearch(e.target.value)}
              style={{ padding: '0.5rem', fontSize: '0.85rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 120px' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase' }}>Role Filter</label>
            <select value={systemFilterRole} onChange={(e) => setSystemFilterRole(e.target.value)} style={{ padding: '0.5rem', fontSize: '0.85rem', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'white' }}>
              <option value="All">All Roles</option>
              <option value="student">Students Only</option>
              <option value="teacher">Teachers Only</option>
              <option value="admin">Admins Only</option>
              <option value="developer">Developers Only</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 120px' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase' }}>Batch Code</label>
            <select value={systemFilterBatch} onChange={(e) => setSystemFilterBatch(e.target.value)} style={{ padding: '0.5rem', fontSize: '0.85rem', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'white' }}>
              <option value="All">All Batches</option>
              {systemUniqueBatches.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 120px' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase' }}>Category / Grade</label>
            <select value={systemFilterCategory} onChange={(e) => setSystemFilterCategory(e.target.value)} style={{ padding: '0.5rem', fontSize: '0.85rem', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'white' }}>
              <option value="All">All Categories</option>
              {systemUniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 120px' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase' }}>Class / Sub-Category</label>
            <select value={systemFilterClass} onChange={(e) => setSystemFilterClass(e.target.value)} style={{ padding: '0.5rem', fontSize: '0.85rem', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'white' }}>
              <option value="All">All Classes</option>
              {systemUniqueClasses.map(cls => <option key={cls} value={cls}>{cls}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 120px' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase' }}>Section / Group</label>
            <select value={systemFilterSection} onChange={(e) => setSystemFilterSection(e.target.value)} style={{ padding: '0.5rem', fontSize: '0.85rem', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'white' }}>
              <option value="All">All Sections</option>
              {systemUniqueSections.map(sec => <option key={sec} value={sec}>{sec}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', flex: '0 0 auto' }}>
            <button 
              className="btn btn-secondary btn-sm" 
              onClick={() => {
                setSystemSearch('');
                setSystemFilterRole('All');
                setSystemFilterBatch('All');
                setSystemFilterCategory('All');
                setSystemFilterClass('All');
                setSystemFilterSection('All');
              }}
              style={{ height: '38px', padding: '0 1rem' }}
            >
              Reset Filters
            </button>
          </div>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name & Email</th>
                <th>Cadet ID / Batch</th>
                <th>Category (Grade/Prog)</th>
                <th>Class (Sub-Cat)</th>
                <th>Section / Group</th>
                <th>Password</th>
                <th>Campus</th>
                <th>Role</th>
                <th>Phys. Join</th>
                <th>Stats (Phys / Acad / Quiz)</th>
                <th>Actions - Reassign Role</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', color: 'var(--text-light)', padding: '2rem' }}>
                    No users match the selected Class, Section, Batch, or Search criteria.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u: UserProfile) => {
                  const { physPct, acadPct } = getUserAttendanceStats(u.email);
                  const quizPct = getUserQuizPerformanceStats(u.email);
                  return (
                    <tr key={u.email}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--primary-navy)' }}>{u.displayName}</div>
                        <input 
                          type="email" 
                          defaultValue={u.email} 
                          onBlur={async (e) => {
                            const newEmailVal = e.target.value.trim().toLowerCase();
                            if (newEmailVal && newEmailVal !== u.email) {
                              try {
                                const oldDocRef = doc(db, 'users', u.email.toLowerCase());
                                const newDocRef = doc(db, 'users', newEmailVal);
                                
                                const oldDocSnap = await getDoc(oldDocRef);
                                if (oldDocSnap.exists()) {
                                  const data = oldDocSnap.data();
                                  await setDoc(newDocRef, { ...data, email: newEmailVal, uid: "" });
                                  await deleteDoc(oldDocRef);
                                  
                                  setUsers((prev: UserProfile[]) => prev.map(usr => usr.email === u.email ? { ...usr, email: newEmailVal } : usr));
                                  alert(`Email for ${u.displayName} updated successfully!`);
                                }
                              } catch (err: any) {
                                alert(`Failed to update email: ${err.message}`);
                              }
                            }
                          }}
                          style={{ 
                            fontSize: '0.75rem', 
                            padding: '0.15rem 0.3rem', 
                            width: '160px', 
                            border: '1px solid var(--border-color)', 
                            borderRadius: '4px',
                            marginTop: '2px' 
                          }} 
                        />
                      </td>

                      {/* Cadet ID & Batch */}
                      <td>
                        {u.role === 'student' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <input 
                              type="text" 
                              defaultValue={u.registrationDetails?.cadetNumber || ''} 
                              onBlur={(e) => handleUpdateStudentRegistrationDetails(u.email, 'cadetNumber', e.target.value)} 
                              placeholder="Cadet ID" 
                              style={{ fontSize: '0.8rem', padding: '2px 4px', width: '100px', borderRadius: '4px', border: '1px solid var(--border-color)', fontFamily: 'monospace' }} 
                            />
                            <input 
                              type="text" 
                              defaultValue={u.registrationDetails?.batch || ''} 
                              onBlur={(e) => handleUpdateStudentRegistrationDetails(u.email, 'batch', e.target.value)} 
                              placeholder="Batch Code" 
                              style={{ fontSize: '0.8rem', padding: '2px 4px', width: '100px', borderRadius: '4px', border: '1px solid var(--border-color)' }} 
                            />
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-light)', fontSize: '0.8rem' }}>N/A</span>
                        )}
                      </td>

                      {/* Category (Grade/Program) */}
                      <td>
                        {u.role === 'student' ? (
                          <select 
                            value={u.registrationDetails?.category || 'Academics'} 
                            onChange={(e) => handleUpdateStudentRegistrationDetails(u.email, 'category', e.target.value)}
                            style={{ fontSize: '0.8rem', padding: '2px 4px', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                          >
                            {Object.keys(REGISTRATION_CATEGORIES).map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        ) : (
                          <span style={{ color: 'var(--text-light)', fontSize: '0.8rem' }}>N/A</span>
                        )}
                      </td>

                      {/* Class (Sub-Category) */}
                      <td>
                        {u.role === 'student' ? (
                          <select 
                            value={u.registrationDetails?.subCategory || ''} 
                            onChange={(e) => handleUpdateStudentRegistrationDetails(u.email, 'subCategory', e.target.value)}
                            style={{ fontSize: '0.8rem', padding: '2px 4px', borderRadius: '4px', border: '1px solid var(--border-color)', fontWeight: 600 }}
                          >
                            {(REGISTRATION_CATEGORIES[u.registrationDetails?.category || 'Academics'] || []).map(sub => (
                              <option key={sub} value={sub}>{sub}</option>
                            ))}
                          </select>
                        ) : (
                          <span style={{ color: 'var(--text-light)', fontSize: '0.8rem' }}>N/A</span>
                        )}
                      </td>

                      {/* Section / Physical Group */}
                      <td>
                        {u.role === 'student' ? (
                          <select 
                            value={u.registrationDetails?.physicalGroup || 'Group A'} 
                            onChange={(e) => handleUpdateStudentRegistrationDetails(u.email, 'physicalGroup', e.target.value)}
                            style={{ fontSize: '0.8rem', padding: '2px 4px', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                          >
                            <option value="Group A">Group A</option>
                            <option value="Group B">Group B</option>
                            <option value="Group C">Group C</option>
                            <option value="Group D">Group D</option>
                            <option value="Section A">Section A</option>
                            <option value="Section B">Section B</option>
                            <option value="Section C">Section C</option>
                          </select>
                        ) : (
                          <span style={{ color: 'var(--text-light)', fontSize: '0.8rem' }}>N/A</span>
                        )}
                      </td>

                      {/* Password */}
                      <td>
                        <input 
                          type="text" 
                          defaultValue={u.password || ''} 
                          onBlur={async (e) => {
                            const newPass = e.target.value.trim();
                            if (newPass && newPass !== u.password) {
                              try {
                                await updateDoc(doc(db, 'users', u.email.toLowerCase()), { password: newPass });
                                setUsers((prev: UserProfile[]) => prev.map(usr => usr.email === u.email ? { ...usr, password: newPass } : usr));
                                alert(`Password for ${u.displayName} updated successfully!`);
                              } catch (err: any) {
                                alert(`Failed to update password: ${err.message}`);
                              }
                            }
                          }}
                          style={{ 
                            fontFamily: 'monospace', 
                            fontSize: '0.8rem', 
                            padding: '0.2rem 0.4rem', 
                            width: '100px', 
                            border: '1px solid var(--border-color)', 
                            borderRadius: '4px' 
                          }} 
                          placeholder="(not activated)"
                        />
                      </td>

                      {/* Campus */}
                      <td>
                        <select
                          value={u.campus || ''}
                          onChange={async (e) => {
                            const val = e.target.value;
                            const campusVal = val === '' ? null : val;
                            try {
                              await setDoc(doc(db, 'users', u.email.toLowerCase()), { campus: campusVal }, { merge: true });
                              setUsers((prev: UserProfile[]) => prev.map(usr => usr.email === u.email ? { ...usr, campus: val as any } : usr));
                              alert(`Campus for ${u.displayName} updated to ${val || 'None (Global)'}!`);
                            } catch (err: any) {
                              alert(`Failed to update campus: ${err.message}`);
                            }
                          }}
                          style={{ fontSize: '0.8rem', padding: '0.2rem', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-white)', color: 'var(--text-main)' }}
                        >
                          <option value="">Global</option>
                          <option value="boys">Boys</option>
                          <option value="girls">Girls</option>
                        </select>
                      </td>

                      {/* Current Role */}
                      <td>
                        <span className={`badge badge-role ${u.role}`}>
                          {u.role}
                        </span>
                      </td>

                      {/* Phys. Join */}
                      <td>
                        {u.role === 'student' ? (
                          <input 
                            type="checkbox" 
                            checked={u.registrationDetails?.joinPhysical !== false} 
                            onChange={() => handleToggleStudentPhysicalJoin(u)} 
                            style={{ width: 'auto', cursor: 'pointer' }}
                          />
                        ) : u.role === 'teacher' ? (
                          <input 
                            type="checkbox" 
                            checked={u.teacherDetails?.academicOnly !== true} 
                            onChange={() => handleToggleTeacherPhysicalAccess(u)} 
                            style={{ width: 'auto', cursor: 'pointer' }}
                            title="Checked means physical class access allowed"
                          />
                        ) : (
                          <span style={{ color: 'var(--text-light)', fontSize: '0.8rem', fontStyle: 'italic' }}>N/A</span>
                        )}
                      </td>

                      {/* Stats */}
                      <td>
                        <div style={{ fontSize: '0.75rem', lineHeight: '1.4' }}>
                          <div>Phys: <strong style={{ color: 'var(--primary-navy)' }}>{u.role === 'student' || u.role === 'teacher' ? physPct : 'N/A'}</strong></div>
                          <div>Acad: <strong style={{ color: 'var(--primary-navy)' }}>{u.role === 'student' || u.role === 'teacher' ? acadPct : 'N/A'}</strong></div>
                          <div>Quiz: <strong style={{ color: 'var(--accent-gold-dark)' }}>{u.role === 'student' ? quizPct : 'N/A'}</strong></div>
                        </div>
                      </td>

                      {/* Actions */}
                      <td>
                        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          <select 
                            value={u.role} 
                            onChange={(e) => handleRoleChange(u.email, e.target.value as UserRole)}
                            style={{ padding: '0.2rem 0.4rem', fontSize: '0.8rem', width: '90px' }}
                            disabled={loading}
                          >
                            <option value="student">Student</option>
                            <option value="teacher">Teacher</option>
                            <option value="admin">Admin</option>
                            <option value="developer">Developer</option>
                          </select>
                          {u.role === 'teacher' && (
                            <button
                              onClick={() => {
                                setSelectedTeacherForRoles(u);
                                setEditTeacherSubject('');
                                setEditTeacherCategories(['Academics']);
                                setEditTeacherSubCategories([]);
                                setEditTeacherSections(['Group A', 'Group B', 'Group C', 'Group D']);
                              }}
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                              disabled={loading}
                            >
                              Subjects
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteUser(u.email, u.displayName)}
                            className="btn btn-danger btn-sm"
                            style={{ 
                              padding: '0.2rem 0.4rem', 
                              fontSize: '0.75rem', 
                              fontWeight: 600
                            }}
                            disabled={loading}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {/* 2. ATTENDANCE LOGGING TAB */}
      {activeTab === 'attendance' && (
        <div className="fade-in">
          <div className="date-selector-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <label htmlFor="developer-attendance-date" style={{ fontSize: '0.9rem' }}>Select Target Logging Date:</label>
              <input 
                id="developer-attendance-date"
                type="date" 
                value={attendanceDate} 
                onChange={(e) => setAttendanceDate(e.target.value)}
                style={{ width: '180px', padding: '0.5rem' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                onClick={handleToggleWorkingDay}
                className={`btn btn-sm ${workingDays.includes(attendanceDate) ? 'btn-danger' : 'btn-success'}`}
                disabled={loading}
              >
                {workingDays.includes(attendanceDate) ? 'Remove Working Day' : 'Create Working Day'}
              </button>
              <button 
                onClick={() => { fetchData(); fetchAttendanceForDate(attendanceDate); }} 
                className="btn btn-secondary btn-sm"
                disabled={loading}
              >
                <RefreshCw size={12} style={{ marginRight: '4px' }} />
                Refresh Lists
              </button>
              <button
                onClick={() => {
                  const absentItems: { recipientName: string; phone: string; message: string; selected: boolean; }[] = [];
                  const filteredForAlerts = filteredUsers.filter(u => {
                    if (attFilterRole !== 'All' && u.role !== attFilterRole) return false;
                    if (attSearch.trim() !== '') {
                      const searchLower = attSearch.toLowerCase();
                      const nameMatch = u.displayName.toLowerCase().includes(searchLower);
                      const emailMatch = u.email.toLowerCase().includes(searchLower);
                      if (!nameMatch && !emailMatch) return false;
                    }
                    if (u.role === 'student') {
                      const reg = u.registrationDetails;
                      if (attFilterBatch !== 'All' && reg?.batch !== attFilterBatch) return false;
                      if (attFilterCategory !== 'All' && reg?.category !== attFilterCategory) return false;
                      if (attFilterClass !== 'All' && reg?.subCategory !== attFilterClass) return false;
                      if (attFilterSection !== 'All' && reg?.physicalGroup !== attFilterSection) return false;
                    } else if (u.role === 'teacher') {
                      if (attFilterBatch !== 'All' || attFilterCategory !== 'All' || attFilterClass !== 'All' || attFilterSection !== 'All') {
                        return false;
                      }
                    }
                    return true;
                  });

                  filteredForAlerts.forEach(u => {
                    const rec = attendanceRecords[u.email.toLowerCase()];
                      if (rec && (rec.physicalAttendance === 'Absent' || rec.academicAttendance === 'Absent')) {
                        const phone = u.registrationDetails?.phone || '';
                        if (phone) {
                          const typeText = rec.physicalAttendance === 'Absent' && rec.academicAttendance === 'Absent'
                            ? 'Physical and Academic'
                            : rec.physicalAttendance === 'Absent' ? 'Physical' : 'Academic';
                          
                          absentItems.push({
                            recipientName: u.displayName,
                            phone: phone,
                            message: `Dear Parent/Cadet ${u.displayName}, this is to inform you that they were marked ABSENT for their ${typeText} session on ${attendanceDate} at Cadets Coaching Academy.`,
                            selected: true
                          });
                        }
                      }
                    });

                  if (absentItems.length === 0) {
                    alert("No absent records with valid phone numbers found for this date.");
                    return;
                  }

                  setBulkQueue({
                    title: `Bulk Absentee WhatsApp Alerts (${attendanceDate})`,
                    items: absentItems,
                    currentIndex: 0
                  });
                }}
                className="btn btn-sm"
                style={{ backgroundColor: '#25D366', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '4px', padding: '0.5rem 1rem', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }}
                disabled={loading}
              >
                📢 Bulk Absent Alerts
              </button>
            </div>
          </div>

          {!workingDays.includes(attendanceDate) ? (
            <div className="alert alert-warning" style={{ marginTop: '1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertCircle size={18} />
              <span>Notice: This date ({attendanceDate}) is NOT marked as a Working Day. You must click "Create Working Day" above to enable and count attendance for this date.</span>
            </div>
          ) : (
            <div className="alert alert-success" style={{ marginTop: '1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Check size={18} />
              <span>Active Working Day: Attendance marked for this date ({attendanceDate}) will be included in overall percentages.</span>
            </div>
          )}

          {workingDays.includes(attendanceDate) && (() => {
            const filteredAttendanceUsers = filteredUsers.filter(u => {
              if (attFilterRole !== 'All' && u.role !== attFilterRole) return false;
              if (attSearch.trim() !== '') {
                const searchLower = attSearch.toLowerCase();
                const nameMatch = u.displayName.toLowerCase().includes(searchLower);
                const emailMatch = u.email.toLowerCase().includes(searchLower);
                if (!nameMatch && !emailMatch) return false;
              }
              if (u.role === 'student') {
                const reg = u.registrationDetails;
                if (attFilterBatch !== 'All' && reg?.batch !== attFilterBatch) return false;
                if (attFilterCategory !== 'All' && reg?.category !== attFilterCategory) return false;
                if (attFilterClass !== 'All' && reg?.subCategory !== attFilterClass) return false;
                if (attFilterSection !== 'All' && reg?.physicalGroup !== attFilterSection) return false;
              } else if (u.role === 'teacher') {
                if (attFilterBatch !== 'All' || attFilterCategory !== 'All' || attFilterClass !== 'All' || attFilterSection !== 'All') {
                  return false;
                }
              }
              return true;
            });

            let physicalPresentCount = 0;
            let physicalAbsentCount = 0;
            let academicPresentCount = 0;
            let academicAbsentCount = 0;

            filteredAttendanceUsers.forEach(u => {
              const rec = attendanceRecords[u.email.toLowerCase()];
              const isAcademicOnly = (u.role === 'student' && (u.registrationDetails?.category === 'Academics' || u.registrationDetails?.joinPhysical === false)) ||
                                     (u.role === 'teacher' && u.teacherDetails?.academicOnly);
              if (!isAcademicOnly) {
                const phys = rec?.physicalAttendance || 'Present';
                if (phys === 'Present') physicalPresentCount++;
                else if (phys === 'Absent') physicalAbsentCount++;
              }
              const acad = rec?.academicAttendance || 'Present';
              if (acad === 'Present') academicPresentCount++;
              else if (acad === 'Absent') academicAbsentCount++;
            });

            return (
              <>
                <h3 style={{ fontSize: '1.1rem', textTransform: 'uppercase', color: 'var(--primary-navy)', marginBottom: '1rem' }}>
                  Daily Logging Matrix (Teachers & Students)
                </h3>

                {/* Daily Logging Matrix Filter Bar */}
                <div style={{ 
                  display: 'flex', 
                  flexWrap: 'wrap', 
                  gap: '1rem', 
                  marginBottom: '1.5rem', 
                  padding: '1.25rem', 
                  backgroundColor: 'var(--bg-white)', 
                  borderRadius: '8px', 
                  border: '1px solid var(--border-color)',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.02)'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 200px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase' }}>Search Name / Email</label>
                    <input 
                      type="text" 
                      placeholder="Search..." 
                      value={attSearch}
                      onChange={(e) => setAttSearch(e.target.value)}
                      style={{ padding: '0.5rem', fontSize: '0.85rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 120px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase' }}>Role</label>
                    <select value={attFilterRole} onChange={(e) => setAttFilterRole(e.target.value)} style={{ padding: '0.5rem', fontSize: '0.85rem', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'white' }}>
                      <option value="All">All Roles</option>
                      <option value="student">Students Only</option>
                      <option value="teacher">Staff/Teachers Only</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 120px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase' }}>Batch Code</label>
                    <select value={attFilterBatch} onChange={(e) => setAttFilterBatch(e.target.value)} style={{ padding: '0.5rem', fontSize: '0.85rem', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'white' }} disabled={attFilterRole === 'teacher'}>
                      <option value="All">All Batches</option>
                      {uniqueBatches.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 120px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase' }}>Category</label>
                    <select value={attFilterCategory} onChange={(e) => setAttFilterCategory(e.target.value)} style={{ padding: '0.5rem', fontSize: '0.85rem', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'white' }} disabled={attFilterRole === 'teacher'}>
                      <option value="All">All Categories</option>
                      {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 120px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase' }}>Class</label>
                    <select value={attFilterClass} onChange={(e) => setAttFilterClass(e.target.value)} style={{ padding: '0.5rem', fontSize: '0.85rem', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'white' }} disabled={attFilterRole === 'teacher'}>
                      <option value="All">All Classes</option>
                      {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 120px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase' }}>Section / Group</label>
                    <select value={attFilterSection} onChange={(e) => setAttFilterSection(e.target.value)} style={{ padding: '0.5rem', fontSize: '0.85rem', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'white' }} disabled={attFilterRole === 'teacher'}>
                      <option value="All">All Sections</option>
                      {uniqueSections.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                {/* Daily Attendance Summary Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div className="stat-card navy" style={{ padding: '1.25rem' }}>
                    <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-light)', fontWeight: 600 }}>
                      Physical Session Attendance
                    </span>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--primary-navy)', marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span>{physicalPresentCount} / {physicalPresentCount + physicalAbsentCount}</span>
                      <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-light)' }}>
                        Present ({physicalPresentCount + physicalAbsentCount > 0 ? Math.round((physicalPresentCount / (physicalPresentCount + physicalAbsentCount)) * 100) : 0}%)
                      </span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-light)', marginTop: '0.5rem', display: 'flex', gap: '1rem' }}>
                      <span>Present: <strong style={{ color: 'var(--success)' }}>{physicalPresentCount}</strong></span>
                      <span>Absent: <strong style={{ color: 'var(--danger)' }}>{physicalAbsentCount}</strong></span>
                    </div>
                  </div>

                  <div className="stat-card gold" style={{ padding: '1.25rem' }}>
                    <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-light)', fontWeight: 600 }}>
                      Academic Session Attendance
                    </span>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--primary-navy)', marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span>{academicPresentCount} / {academicPresentCount + academicAbsentCount}</span>
                      <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-light)' }}>
                        Present ({academicPresentCount + academicAbsentCount > 0 ? Math.round((academicPresentCount / (academicPresentCount + academicAbsentCount)) * 100) : 0}%)
                      </span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-light)', marginTop: '0.5rem', display: 'flex', gap: '1rem' }}>
                      <span>Present: <strong style={{ color: 'var(--success)' }}>{academicPresentCount}</strong></span>
                      <span>Absent: <strong style={{ color: 'var(--danger)' }}>{academicAbsentCount}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>User Profile Name</th>
                        <th>Email Address</th>
                        <th>System Role</th>
                        <th>Physical Session</th>
                        <th>Academic Session</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAttendanceUsers.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-light)', padding: '2rem' }}>
                            No users match the active filters.
                          </td>
                        </tr>
                      ) : (
                        filteredAttendanceUsers.map((u) => {
                          const rec = attendanceRecords[u.email.toLowerCase()];
                          const phys = rec?.physicalAttendance || 'Present';
                          const acad = rec?.academicAttendance || 'Present';
                          const isDayActive = workingDays.includes(attendanceDate);

                          return (
                            <tr key={u.email}>
                              <td style={{ fontWeight: 600 }}>{u.displayName}</td>
                              <td>{u.email}</td>
                              <td>
                                <span className={`badge badge-role ${u.role}`}>
                                  {u.role}
                                </span>
                              </td>
                              <td>
                                {(u.role === 'student' && (u.registrationDetails?.category === 'Academics' || u.registrationDetails?.joinPhysical === false)) || (u.role === 'teacher' && u.teacherDetails?.academicOnly) ? (
                                  <span style={{ color: 'var(--text-light)', fontSize: '0.8rem', fontStyle: 'italic' }}>
                                    {u.role === 'student' && u.registrationDetails?.joinPhysical === false ? 'N/A (No Physical)' : 'N/A (Academic Only)'}
                                  </span>
                                ) : (
                                  <div className="attendance-edit-cell">
                                    <button 
                                      onClick={() => updateAttendance(u, 'physical', 'Present')}
                                      className={`attendance-btn-select ${phys === 'Present' ? 'active-present' : ''}`}
                                      disabled={!isDayActive}
                                    >
                                      P
                                    </button>
                                    <button 
                                      onClick={() => updateAttendance(u, 'physical', 'Absent')}
                                      className={`attendance-btn-select ${phys === 'Absent' ? 'active-absent' : ''}`}
                                      disabled={!isDayActive}
                                    >
                                      A
                                    </button>
                                    <button 
                                      onClick={() => updateAttendance(u, 'physical', 'Excused')}
                                      className={`attendance-btn-select ${phys === 'Excused' ? 'active-excused' : ''}`}
                                      disabled={!isDayActive}
                                    >
                                      E
                                    </button>
                                  </div>
                                )}
                              </td>
                              <td>
                                <div className="attendance-edit-cell">
                                  <button 
                                    onClick={() => updateAttendance(u, 'academic', 'Present')}
                                    className={`attendance-btn-select ${acad === 'Present' ? 'active-present' : ''}`}
                                    disabled={!isDayActive}
                                  >
                                    P
                                  </button>
                                  <button 
                                    onClick={() => updateAttendance(u, 'academic', 'Absent')}
                                    className={`attendance-btn-select ${acad === 'Absent' ? 'active-absent' : ''}`}
                                    disabled={!isDayActive}
                                  >
                                    A
                                  </button>
                                  <button 
                                    onClick={() => updateAttendance(u, 'academic', 'Excused')}
                                    className={`attendance-btn-select ${acad === 'Excused' ? 'active-excused' : ''}`}
                                    disabled={!isDayActive}
                                  >
                                    E
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-light)', display: 'flex', alignItems: 'center', gap: '3px', marginTop: '0.5rem' }}>
                  <Calendar size={12} />
                  <span>P = Present • A = Absent • E = Excused. Changes logged by Developer ({developerEmail}) save immediately to Firestore.</span>
                </p>
              </>
            );
          })()}
        </div>
      )}

      {/* 3. QUIZZES & RESULTS TAB */}
      {activeTab === 'quizzes' && (() => {
        // Group quizzes by teacher and subject
        const teacherGroups: Record<string, Record<string, Quiz[]>> = {};
        filteredQuizzes.forEach(quiz => {
          const teacher = quiz.teacherName || quiz.createdByEmail || 'Unknown Instructor';
          const subject = quiz.teacherSubject || 'General';
          if (!teacherGroups[teacher]) {
            teacherGroups[teacher] = {};
          }
          if (!teacherGroups[teacher][subject]) {
            teacherGroups[teacher][subject] = [];
          }
          teacherGroups[teacher][subject].push(quiz);
        });

        const sortedTeachers = Object.keys(teacherGroups).sort();

        return (
          <div className="fade-in">
            <h3 style={{ fontSize: '1.2rem', textTransform: 'uppercase', color: 'var(--primary-navy)', marginBottom: '1rem' }}>
              Instructor Directory & Student Quiz Performance
            </h3>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-light)', display: 'block', marginBottom: '1.5rem' }}>
              Hierarchical view: Instructor &rarr; Specialist Subject Area &rarr; Quizzes &rarr; Student Attempt Records
            </span>

            {sortedTeachers.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>
                No quizzes or instructors registered in the system.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {sortedTeachers.map(teacher => {
                  const isTeacherExpanded = !!expandedTeachers[teacher];
                  const subjects = teacherGroups[teacher];
                  const sortedSubjects = Object.keys(subjects).sort();

                  let totalQuizzes = 0;
                  Object.values(subjects).forEach(list => {
                    totalQuizzes += list.length;
                  });

                  return (
                    <div key={teacher} className="collapsible-section" style={{ backgroundColor: 'var(--bg-white)', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
                      {/* Teacher Header */}
                      <div 
                        onClick={() => setExpandedTeachers(prev => ({ ...prev, [teacher]: !prev[teacher] }))}
                        style={{ 
                          padding: '1rem 1.5rem', 
                          backgroundColor: 'var(--primary-navy-dark)', 
                          color: 'var(--accent-gold)', 
                          cursor: 'pointer', 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          fontWeight: 'bold',
                          fontSize: '1rem'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '1.1rem' }}>{isTeacherExpanded ? '▼' : '►'}</span>
                          <span>INSTRUCTOR: {teacher}</span>
                        </div>
                        <span className="badge badge-secondary" style={{ color: 'var(--accent-gold)', borderColor: 'var(--accent-gold)', textTransform: 'uppercase', fontSize: '0.75rem' }}>
                          {totalQuizzes} {totalQuizzes === 1 ? 'Quiz' : 'Quizzes'}
                        </span>
                      </div>

                      {/* Subjects list (only shown if expanded) */}
                      {isTeacherExpanded && (
                        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: 'rgba(0, 0, 0, 0.02)' }}>
                          {sortedSubjects.map(subject => {
                            const subjectKey = `${teacher}_${subject}`;
                            const isSubjectExpanded = !!expandedSubjects[subjectKey];
                            const subjectQuizzes = subjects[subject];

                            return (
                              <div key={subject} style={{ borderLeft: '3px solid var(--secondary-olive)', paddingLeft: '1rem' }}>
                                {/* Subject Header */}
                                <div 
                                  onClick={() => setExpandedSubjects(prev => ({ ...prev, [subjectKey]: !prev[subjectKey] }))}
                                  style={{ 
                                    padding: '0.5rem 1rem', 
                                    backgroundColor: 'var(--bg-light)', 
                                    color: 'var(--primary-navy)', 
                                    cursor: 'pointer', 
                                    display: 'flex', 
                                    justifyContent: 'space-between', 
                                    alignItems: 'center',
                                    fontWeight: '600',
                                    fontSize: '0.9rem',
                                    borderRadius: '4px',
                                    border: '1px solid var(--border-color)'
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '0.8rem' }}>{isSubjectExpanded ? '▼' : '►'}</span>
                                    <span>SPECIALIST SUBJECT: {subject.toUpperCase()}</span>
                                  </div>
                                  <span className="badge badge-secondary" style={{ backgroundColor: 'var(--secondary-olive)', color: 'white', border: 'none', fontSize: '0.7rem' }}>
                                    {subjectQuizzes.length} {subjectQuizzes.length === 1 ? 'Quiz' : 'Quizzes'}
                                  </span>
                                </div>

                                {/* Quizzes under this subject (only shown if expanded) */}
                                {isSubjectExpanded && (
                                  <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {subjectQuizzes.map(quiz => {
                                      const isQuizSelected = selectedQuizForAttempts === quiz.id;
                                      const quizSubmissions = submissions.filter(sub => sub.quizId === quiz.id);

                                      return (
                                        <div key={quiz.id} style={{ backgroundColor: 'var(--bg-white)', border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
                                          {/* Quiz Row */}
                                          <div style={{ padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                                            <div>
                                              <span style={{ fontWeight: 600, color: 'var(--primary-navy)', fontSize: '0.95rem' }}>{quiz.title}</span>
                                              {quiz.status === 'draft' ? (
                                                <span className="badge" style={{ backgroundColor: '#6b7280', color: 'white', border: 'none', marginLeft: '0.5rem', padding: '2px 6px', fontSize: '0.65rem', textTransform: 'uppercase', verticalAlign: 'middle', fontWeight: 600 }}>Draft</span>
                                              ) : (
                                                <span className="badge" style={{ backgroundColor: '#10b981', color: 'white', border: 'none', marginLeft: '0.5rem', padding: '2px 6px', fontSize: '0.65rem', textTransform: 'uppercase', verticalAlign: 'middle', fontWeight: 600 }}>Published</span>
                                              )}
                                              <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8rem', color: 'var(--text-light)', marginTop: '4px', flexWrap: 'wrap' }}>
                                                <span>Duration: {quiz.duration} Mins</span>
                                                <span>•</span>
                                                <span>Questions: {quiz.questions?.length || 0}</span>
                                                <span>•</span>
                                                <span>Target: {
                                                   quiz.assignToType === 'custom-target' || quiz.targetBatch || quiz.targetCategory || quiz.targetClasses || quiz.targetSections ? (() => {
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
                                                 }</span>
                                                <span>•</span>
                                                <span>Attempts Recorded: {quizSubmissions.length}</span>
                                              </div>
                                            </div>

                                            <div style={{ display: 'flex', gap: '0.35rem' }}>
                                              <button 
                                                onClick={() => setSelectedQuizForAttempts(
                                                  selectedQuizForAttempts === quiz.id ? null : quiz.id
                                                )}
                                                className="btn btn-secondary btn-sm"
                                                style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                                              >
                                                {isQuizSelected ? 'Hide Attempts' : 'View Attempts'}
                                              </button>
                                              <button 
                                                onClick={() => handleDeleteQuiz(quiz.id, quiz.title)}
                                                className="btn btn-danger btn-sm"
                                                style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                                              >
                                                Delete Quiz
                                              </button>
                                            </div>
                                          </div>

                                          {/* Student Attempts (only shown if selected) */}
                                          {isQuizSelected && (
                                            <div style={{ borderTop: '1px solid var(--border-color)', backgroundColor: 'rgba(197, 160, 89, 0.02)', padding: '1rem' }}>
                                              <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent-gold-dark)', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '0.5px' }}>
                                                Cadet Attempt Log
                                              </h5>

                                              <div className="table-wrapper">
                                                <table style={{ margin: 0 }}>
                                                  <thead>
                                                    <tr>
                                                      <th>Student Name</th>
                                                      <th>Email Address</th>
                                                      <th>Score Achieved</th>
                                                      <th>Percentage</th>
                                                      <th>Attempt Timestamp</th>
                                                      <th>Actions</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    {quizSubmissions.length === 0 ? (
                                                      <tr>
                                                        <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-light)', fontSize: '0.8rem' }}>
                                                          No cadet attempts recorded for this quiz yet.
                                                        </td>
                                                      </tr>
                                                    ) : (
                                                      quizSubmissions.map(sub => {
                                                        const pct = Math.round((sub.score / sub.totalQuestions) * 100);
                                                        return (
                                                          <tr key={sub.id}>
                                                            <td style={{ fontWeight: 600, fontSize: '0.85rem' }}>{sub.studentName}</td>
                                                            <td style={{ fontSize: '0.85rem' }}>{sub.studentEmail}</td>
                                                            <td style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>{sub.score} / {sub.totalQuestions}</td>
                                                            <td>
                                                              <span 
                                                                style={{ 
                                                                  fontWeight: 'bold', 
                                                                  fontSize: '0.85rem',
                                                                  color: pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)' 
                                                                }}
                                                              >
                                                                {pct}%
                                                              </span>
                                                            </td>
                                                            <td style={{ fontSize: '0.85rem' }}>
                                                              {sub.submittedAt?.toDate ? sub.submittedAt.toDate().toLocaleString() : new Date().toLocaleString()}
                                                            </td>
                                                            <td>
                                                              <div style={{ display: 'flex', gap: '0.25rem' }}>
                                                                <button 
                                                                  onClick={() => handleReviewResults(sub)}
                                                                  className="btn btn-secondary btn-sm"
                                                                  style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                                                                >
                                                                  View Answers
                                                                </button>
                                                                <button 
                                                                  onClick={() => {
                                                                    setEditingSubmission(sub);
                                                                    setEditingScoreValue(sub.score);
                                                                  }}
                                                                  className="btn btn-primary btn-sm"
                                                                  style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                                                                >
                                                                  Edit Score
                                                                </button>
                                                              </div>
                                                            </td>
                                                          </tr>
                                                        );
                                                      })
                                                    )}
                                                  </tbody>
                                                </table>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {/* Cadet Academic Progress Breakdown Table (R2) */}
            <div style={{ marginTop: '2.5rem' }}>
              <h3 style={{ fontSize: '1.2rem', textTransform: 'uppercase', color: 'var(--primary-navy)', marginBottom: '1rem' }}>
                Cadet Academic Progress & Subject Performance Breakdown
              </h3>

              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Cadet ID & Name</th>
                      <th>Batch / Class</th>
                      <th>Total Quizzes Attempted</th>
                      <th>Overall Score Avg (%)</th>
                      <th>Overall Accuracy (%)</th>
                      <th>Subject-by-Subject Performance</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.filter(u => u.role === 'student').length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-light)' }}>
                          No cadets found.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.filter(u => u.role === 'student').map(s => {
                        const overview = getCadetAcademicOverview(s.email, submissions, users);
                        const subjects = Object.values(overview.subjectMetrics);

                        return (
                          <tr key={`prog_${s.email}`}>
                            <td>
                              <div style={{ fontWeight: 600, color: 'var(--primary-navy)' }}>{s.displayName}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-light)', fontFamily: 'monospace' }}>
                                {s.registrationDetails?.cadetNumber || 'N/A'}
                              </div>
                            </td>
                            <td>
                              <div style={{ fontSize: '0.85rem' }}>{s.registrationDetails?.batch || 'N/A'}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>{s.registrationDetails?.subCategory || 'N/A'}</div>
                            </td>
                            <td style={{ fontWeight: 'bold', textAlign: 'center' }}>
                              {overview.totalQuizzesAttempted}
                            </td>
                            <td style={{ fontWeight: 'bold', color: 'var(--primary-navy)' }}>
                              {overview.totalQuizzesAttempted > 0 ? `${overview.scoreAverage}%` : 'N/A'}
                            </td>
                            <td>
                              {overview.totalQuizzesAttempted > 0 ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '120px' }}>
                                  <div style={{ flex: 1, height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div 
                                      style={{ 
                                        width: `${overview.overallPercentage}%`, 
                                        height: '100%', 
                                        backgroundColor: getPerformanceTier(overview.overallPercentage).color 
                                      }} 
                                    />
                                  </div>
                                  <span style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>{overview.overallPercentage}%</span>
                                </div>
                              ) : (
                                <span style={{ color: 'var(--text-light)', fontSize: '0.8rem' }}>No Attempts</span>
                              )}
                            </td>
                            <td>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {subjects.length === 0 ? (
                                  <span style={{ color: 'var(--text-light)', fontSize: '0.8rem' }}>No subject data</span>
                                ) : (
                                  subjects.map(subj => {
                                    const tier = getPerformanceTier(subj.percentage);
                                    return (
                                      <span 
                                        key={subj.subject}
                                        className="badge"
                                        style={{
                                          backgroundColor: tier.bg,
                                          color: tier.text,
                                          border: `1px solid ${tier.border}`,
                                          fontSize: '0.75rem',
                                          padding: '3px 8px',
                                          fontWeight: 600
                                        }}
                                      >
                                        {subj.subject}: {subj.percentage}% ({subj.totalCorrect}/{subj.totalQuestions})
                                      </span>
                                    );
                                  })
                                )}
                              </div>
                            </td>
                            <td>
                              <button 
                                onClick={() => setSelectedCadetForProgress(s)}
                                className="btn btn-secondary btn-sm"
                                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                              >
                                Subject Details
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Subject Details Modal for Selected Cadet */}
            {selectedCadetForProgress && (() => {
              const overview = getCadetAcademicOverview(selectedCadetForProgress.email, submissions, users);
              const cadetSubmissions = submissions.filter(s => s.studentEmail && s.studentEmail.toLowerCase() === selectedCadetForProgress.email.toLowerCase());
              return (
                <div className="modal-overlay">
                  <div className="modal-content fade-in" style={{ maxWidth: '750px', maxHeight: '90vh', overflowY: 'auto' }}>
                    <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3>Subject Performance & Progress Details</h3>
                      <button 
                        onClick={() => setSelectedCadetForProgress(null)}
                        className="btn btn-secondary btn-sm"
                      >
                        Close
                      </button>
                    </div>

                    <div style={{ margin: '1rem 0', backgroundColor: 'var(--bg-slate)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                        <div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-light)', textTransform: 'uppercase', fontWeight: 600 }}>Cadet Name</span>
                          <div style={{ fontWeight: 700, color: 'var(--primary-navy)' }}>{selectedCadetForProgress.displayName}</div>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-light)', textTransform: 'uppercase', fontWeight: 600 }}>Cadet Number</span>
                          <div style={{ fontWeight: 700, fontFamily: 'monospace' }}>{selectedCadetForProgress.registrationDetails?.cadetNumber || 'N/A'}</div>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-light)', textTransform: 'uppercase', fontWeight: 600 }}>Quizzes Attempted</span>
                          <div style={{ fontWeight: 700 }}>{overview.totalQuizzesAttempted}</div>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-light)', textTransform: 'uppercase', fontWeight: 600 }}>Overall Accuracy</span>
                          <div style={{ fontWeight: 700, color: getPerformanceTier(overview.overallPercentage).color }}>{overview.overallPercentage}%</div>
                        </div>
                      </div>
                    </div>

                    <h4 style={{ fontSize: '1rem', textTransform: 'uppercase', color: 'var(--primary-navy)', marginBottom: '0.75rem' }}>Subject Breakdown</h4>
                    {Object.keys(overview.subjectMetrics).length === 0 ? (
                      <p style={{ color: 'var(--text-light)' }}>No subject performance data available for this cadet.</p>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                        {Object.values(overview.subjectMetrics).map(subj => {
                          const tier = getPerformanceTier(subj.percentage);
                          return (
                            <div key={subj.subject} className="stat-card" style={{ borderTop: `4px solid ${tier.color}`, padding: '1rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 700, color: 'var(--primary-navy)' }}>{subj.subject}</span>
                                <span className="badge" style={{ backgroundColor: tier.bg, color: tier.text, border: `1px solid ${tier.border}`, fontSize: '0.7rem' }}>
                                  {tier.label}
                                </span>
                              </div>
                              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: tier.color, margin: '0.5rem 0' }}>
                                {subj.percentage}%
                              </div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>
                                Correct: {subj.totalCorrect} / {subj.totalQuestions} MCQs ({subj.totalAttempted} attempt{subj.totalAttempted === 1 ? '' : 's'})
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <h4 style={{ fontSize: '1rem', textTransform: 'uppercase', color: 'var(--primary-navy)', marginBottom: '0.75rem' }}>Attempt History</h4>
                    {cadetSubmissions.length === 0 ? (
                      <p style={{ color: 'var(--text-light)' }}>No quiz attempts logged.</p>
                    ) : (
                      <div className="table-wrapper">
                        <table>
                          <thead>
                            <tr>
                              <th>Quiz Title</th>
                              <th>Subject</th>
                              <th>Score</th>
                              <th>Percentage</th>
                              <th>Date</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cadetSubmissions.map(sub => {
                              const pct = Math.round((sub.score / sub.totalQuestions) * 100);
                              return (
                                <tr key={sub.id}>
                                  <td style={{ fontWeight: 600 }}>{sub.quizTitle}</td>
                                  <td>{sub.teacherSubject || 'General'}</td>
                                  <td>{sub.score} / {sub.totalQuestions}</td>
                                  <td style={{ fontWeight: 'bold', color: getPerformanceTier(pct).color }}>{pct}%</td>
                                  <td style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>
                                    {sub.submittedAt?.toDate ? sub.submittedAt.toDate().toLocaleString() : 'N/A'}
                                  </td>
                                  <td>
                                    <button 
                                      onClick={() => setSubmissionToDelete(sub)}
                                      className="btn btn-danger btn-sm"
                                      style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                                    >
                                      Delete Submission
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
                      <button className="btn btn-secondary" onClick={() => setSelectedCadetForProgress(null)}>
                        Close Details
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Attempt Deletion Confirmation Modal (R3) */}
            {submissionToDelete && (
              <div className="modal-overlay">
                <div className="modal-content fade-in" style={{ maxWidth: '500px' }}>
                  <h3 style={{ color: 'var(--danger)', marginTop: 0 }}>Confirm Attempt Deletion</h3>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>
                    Are you sure you want to permanently delete the attempt record for 
                    <strong> "{submissionToDelete.quizTitle}"</strong> by 
                    <strong> {submissionToDelete.studentName}</strong>?
                  </p>
                  <div style={{ backgroundColor: 'var(--bg-slate)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', marginBottom: '1rem', fontSize: '0.85rem' }}>
                    <div><strong>Subject:</strong> {submissionToDelete.teacherSubject || 'General'}</div>
                    <div><strong>Score:</strong> {submissionToDelete.score} / {submissionToDelete.totalQuestions} ({Math.round((submissionToDelete.score / submissionToDelete.totalQuestions) * 100)}%)</div>
                    <div><strong>Submitted At:</strong> {submissionToDelete.submittedAt?.toDate ? submissionToDelete.submittedAt.toDate().toLocaleString() : 'N/A'}</div>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginBottom: '1.5rem' }}>
                    Notice: This action will delete the submission document from Firestore and instantly recalculate all cadet progress averages, subject percentages, and attempt counts across all dashboard views.
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    <button className="btn btn-secondary" onClick={() => setSubmissionToDelete(null)} disabled={loading}>Cancel</button>
                    <button className="btn btn-danger" onClick={() => handleDeleteSubmission(submissionToDelete)} disabled={loading}>
                      {loading ? 'Deleting...' : 'Confirm Delete'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {activeTab === 'financials' && (() => {
        const studentsList = filteredUsers.filter(u => u.role === 'student');
        const teachersList = filteredUsers.filter(u => u.role === 'teacher');
        
        // Filter students based on dropdown filters
        const filteredStudentsList = studentsList.filter(s => {
          const reg = s.registrationDetails;
          if (finFilterBatch !== 'All' && reg?.batch !== finFilterBatch) return false;
          if (finFilterCategory !== 'All' && reg?.category !== finFilterCategory) return false;
          if (finFilterClass !== 'All' && reg?.subCategory !== finFilterClass) return false;
          if (finFilterSection !== 'All' && reg?.physicalGroup !== finFilterSection) return false;
          return true;
        });

        // Filter by search
        const filteredStudents = filteredStudentsList.filter(s => 
          s.displayName.toLowerCase().includes(financeSearch.toLowerCase()) || 
          s.email.toLowerCase().includes(financeSearch.toLowerCase())
        );

        const isStudentFilterActive = finFilterBatch !== 'All' || finFilterCategory !== 'All' || finFilterClass !== 'All' || finFilterSection !== 'All';

        const filteredTeachers = isStudentFilterActive ? [] : teachersList.filter(t => 
          t.displayName.toLowerCase().includes(financeSearch.toLowerCase()) || 
          t.email.toLowerCase().includes(financeSearch.toLowerCase())
        );

        // Stats calculations on filtered/all students
        const outstandingFees = filteredStudentsList
          .filter(s => getEffectiveFinancials(s.financials).paymentStatus === 'Unpaid')
          .reduce((acc, curr) => acc + (getEffectiveFinancials(curr.financials).amount || 0), 0);

        const collectedFees = filteredStudentsList
          .filter(s => getEffectiveFinancials(s.financials).paymentStatus === 'Paid')
          .reduce((acc, curr) => acc + (getEffectiveFinancials(curr.financials).amount || 0), 0);

        const totalPayroll = isStudentFilterActive ? 0 : teachersList
          .reduce((acc, curr) => acc + (getEffectiveFinancials(curr.financials).amount || 0), 0);

        return (
          <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', textTransform: 'uppercase', color: 'var(--primary-navy)', margin: 0 }}>
                  Academy Financial Ledger
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>
                  Manage tuition fees for cadets and salaries for instructors
                </span>
              </div>
              <button 
                onClick={fetchData} 
                className="btn btn-secondary btn-sm"
                disabled={loading}
              >
                <RefreshCw size={12} style={{ marginRight: '4px' }} />
                Refresh
              </button>
            </div>

            {/* Stats Cards Grid */}
            <div className="stats-grid" style={{ marginBottom: '2rem', display: 'grid', gridTemplateColumns: isStudentFilterActive ? 'repeat(auto-fit, minmax(240px, 1fr))' : 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              <div className="stat-card navy" style={{ padding: '1.25rem' }}>
                <span className="stat-title" style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-light)', fontWeight: 600 }}>Outstanding Cadet Fees {isStudentFilterActive && "(Filtered)"}</span>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--danger)', marginTop: '0.5rem' }}>
                  PKR {outstandingFees}
                </div>
              </div>
              <div className="stat-card gold" style={{ padding: '1.25rem' }}>
                <span className="stat-title" style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-light)', fontWeight: 600 }}>Collected Tuition Fees {isStudentFilterActive && "(Filtered)"}</span>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--success)', marginTop: '0.5rem' }}>
                  PKR {collectedFees}
                </div>
              </div>
              {!isStudentFilterActive && (
                <div className="stat-card" style={{ padding: '1.25rem', backgroundColor: 'var(--bg-white)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                  <span className="stat-title" style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-light)', fontWeight: 600 }}>Instructor Total Payroll</span>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--primary-navy)', marginTop: '0.5rem' }}>
                    PKR {totalPayroll}
                  </div>
                </div>
              )}
            </div>

            {/* Financial Filters Bar */}
            <div style={{ 
              display: 'flex', 
              flexWrap: 'wrap', 
              gap: '1rem', 
              marginBottom: '1.5rem', 
              padding: '1.25rem', 
              backgroundColor: 'var(--bg-white)', 
              borderRadius: '8px', 
              border: '1px solid var(--border-color)',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.02)'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 200px', position: 'relative' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase' }}>Search Name / Email</label>
                <div style={{ position: 'relative' }}>
                  <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
                  <input 
                    type="text" 
                    placeholder="Search..." 
                    value={financeSearch}
                    onChange={(e) => setFinanceSearch(e.target.value)}
                    style={{ paddingLeft: '2.5rem', width: '100%', fontSize: '0.85rem', height: '38px', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 120px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase' }}>Batch Code</label>
                <select value={finFilterBatch} onChange={(e) => setFinFilterBatch(e.target.value)} style={{ padding: '0.5rem', fontSize: '0.85rem', height: '38px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'white' }}>
                  <option value="All">All Batches</option>
                  {uniqueBatches.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 120px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase' }}>Category</label>
                <select value={finFilterCategory} onChange={(e) => setFinFilterCategory(e.target.value)} style={{ padding: '0.5rem', fontSize: '0.85rem', height: '38px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'white' }}>
                  <option value="All">All Categories</option>
                  {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 120px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase' }}>Class</label>
                <select value={finFilterClass} onChange={(e) => setFinFilterClass(e.target.value)} style={{ padding: '0.5rem', fontSize: '0.85rem', height: '38px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'white' }}>
                  <option value="All">All Classes</option>
                  {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 120px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase' }}>Section / Group</label>
                <select value={finFilterSection} onChange={(e) => setFinFilterSection(e.target.value)} style={{ padding: '0.5rem', fontSize: '0.85rem', height: '38px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'white' }}>
                  <option value="All">All Sections</option>
                  {uniqueSections.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* WhatsApp Fee Reminders Due Tomorrow */}
            {(() => {
              const tomorrowStr = getTomorrowDateString();
              const reminderStudents = studentsList.filter(s => {
                const effective = getEffectiveFinancials(s.financials);
                return (effective.paymentStatus === 'Unpaid' || effective.paymentStatus === 'Pending') &&
                       effective.dueDate === tomorrowStr;
              });

              if (reminderStudents.length === 0) return null;

              return (
                <div style={{ marginBottom: '2.5rem', backgroundColor: 'rgba(197, 160, 89, 0.05)', border: '1px solid var(--accent-gold)', borderRadius: '8px', padding: '1.5rem' }}>
                  <h4 style={{ color: 'var(--accent-gold-dark)', textTransform: 'uppercase', fontSize: '0.95rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>⚠️ WhatsApp Fee Reminders Due Tomorrow ({tomorrowStr})</span>
                  </h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-dark)', marginBottom: '1rem' }}>
                    The following students have unpaid or pending tuition fees due tomorrow. Click to send them a WhatsApp reminder.
                  </p>
                  <div className="table-wrapper">
                    <table style={{ margin: 0, backgroundColor: 'transparent' }}>
                      <thead>
                        <tr>
                          <th>Cadet Name</th>
                          <th>Email Address</th>
                          <th>Amount</th>
                          <th>Phone</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reminderStudents.map(student => {
                          const effective = getEffectiveFinancials(student.financials);
                          return (
                            <tr key={student.email}>
                              <td style={{ fontWeight: 600 }}>{student.displayName}</td>
                              <td>{student.email}</td>
                               <td style={{ fontWeight: 700 }}>PKR {effective.amount}</td>
                              <td>{student.registrationDetails?.phone || 'N/A'}</td>
                              <td>
                                <button 
                                  onClick={() => {
                                    const phone = student.registrationDetails?.phone || '';
                                    const amt = effective.amount;
                                    setWhatsappAlert({
                                      recipientName: student.displayName,
                                      phone: phone,
                                      message: `Dear Parent/Cadet ${student.displayName}, this is a reminder from Cadets Coaching Academy that the tuition fee of PKR ${amt} is due tomorrow (${tomorrowStr}). Please ensure the outstanding payment is cleared. Thank you.`
                                    });
                                  }}
                                  className="btn btn-accent btn-sm"
                                  style={{ padding: '2px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                                  disabled={!student.registrationDetails?.phone}
                                >
                                  <span>Send Reminder</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            <div style={{ marginBottom: '2.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                <h4 style={{ color: 'var(--primary-navy)', textTransform: 'uppercase', fontSize: '1rem', margin: 0 }}>
                  Cadet Tuition Fees
                </h4>
                <button
                  onClick={() => {
                    const feePendingItems: { recipientName: string; phone: string; message: string; selected: boolean; dueDate?: string; }[] = [];
                    filteredStudentsList.forEach(s => {
                      const effective = getEffectiveFinancials(s.financials);
                      const status = effective.paymentStatus;
                      if (status === 'Unpaid' || status === 'Pending') {
                        const phone = s.registrationDetails?.phone || '';
                        if (phone) {
                          const amt = effective.amount;
                          const dueDate = effective.dueDate;
                          feePendingItems.push({
                            recipientName: s.displayName,
                            phone: phone,
                            message: `Dear Parent/Cadet ${s.displayName}, this is a reminder from Cadets Coaching Academy that your tuition fee of PKR ${amt} is currently ${status} (Due Date: ${dueDate}). Please ensure payment is cleared. Thank you.`,
                            dueDate: dueDate,
                            selected: true
                          });
                        }
                      }
                    });

                    if (feePendingItems.length === 0) {
                      alert("No cadets with pending/unpaid fees and valid phone numbers found.");
                      return;
                    }

                    setBulkQueue({
                      title: `Bulk WhatsApp Fee Reminders (${feePendingItems.length} Cadets)`,
                      items: feePendingItems,
                      currentIndex: 0
                    });
                  }}
                  className="btn btn-sm"
                  style={{ backgroundColor: '#25D366', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '4px', padding: '0.25rem 0.75rem', borderRadius: '4px', fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem' }}
                >
                  📢 Bulk Fee Reminders
                </button>
              </div>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Cadet Name</th>
                      <th>Email Address</th>
                      <th>Batch Code</th>
                      <th>Fee Amount</th>
                      <th>Duration / Cycle</th>
                      <th>Due Date</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-light)' }}>
                          No cadets found.
                        </td>
                      </tr>
                    ) : (
                      filteredStudents.map(student => {
                        const effective = getEffectiveFinancials(student.financials);
                        return (
                          <tr key={student.email}>
                            <td style={{ fontWeight: 600 }}>{student.displayName}</td>
                            <td>{student.email}</td>
                            <td>{student.registrationDetails?.batch || 'N/A'}</td>
                            <td style={{ fontWeight: 700 }}>
                              {effective.amount ? `PKR ${effective.amount}` : 'PKR 0 (Not Set)'}
                            </td>
                            <td>{student.financials?.duration || 'Monthly'}</td>
                            <td>{effective.dueDate}</td>
                            <td>
                              <span className={`badge badge-${effective.paymentStatus.toLowerCase()}`}>
                                {effective.paymentStatus}
                              </span>
                            </td>
                            <td>
                              <button 
                                onClick={() => handleOpenFinanceModal(student)}
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                              >
                                Adjust Fees
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Teacher Salaries section */}
            {!isStudentFilterActive && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                  <h4 style={{ color: 'var(--primary-navy)', textTransform: 'uppercase', fontSize: '1rem', margin: 0 }}>
                    Instructor Salaries
                  </h4>
                  <button
                    onClick={() => {
                      const salaryPaidItems: { recipientName: string; phone: string; message: string; selected: boolean; dueDate?: string; }[] = [];
                      teachersList.forEach(t => {
                        const effective = getEffectiveFinancials(t.financials);
                        const status = effective.paymentStatus;
                        if (status === 'Paid') {
                          const phone = t.registrationDetails?.phone || '';
                          if (phone) {
                            const insts = t.financials?.installments || [];
                            let amt = effective.amount;
                            let dueDate = effective.dueDate;
                            
                            if (insts.length > 0) {
                              const paidInsts = insts.filter(i => i.paymentStatus === 'Paid');
                              if (paidInsts.length > 0) {
                                const sortedPaid = [...paidInsts].sort((a, b) => b.dueDate.localeCompare(a.dueDate));
                                amt = sortedPaid[0].amount;
                                dueDate = sortedPaid[0].dueDate;
                              }
                            } else if (t.financials?.dueDate) {
                              dueDate = t.financials.dueDate;
                              amt = t.financials.amount || amt;
                            }

                            salaryPaidItems.push({
                              recipientName: t.displayName,
                              phone: phone,
                              message: `Dear Instructor ${t.displayName}, this is to inform you that your salary of PKR ${amt} for this cycle (Due Date: ${dueDate}) has been disbursed/credited by Cadets Coaching Academy. Thank you for your service.`,
                              dueDate: dueDate,
                              selected: true
                            });
                          }
                        }
                      });

                      if (salaryPaidItems.length === 0) {
                        alert("No instructors with 'Paid' salary status and valid phone numbers found.");
                        return;
                      }

                      setBulkQueue({
                        title: `Bulk WhatsApp Salary Disbursed Notifications (${salaryPaidItems.length} Instructors)`,
                        items: salaryPaidItems,
                        currentIndex: 0
                      });
                    }}
                    className="btn btn-sm"
                    style={{ backgroundColor: '#25D366', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '4px', padding: '0.25rem 0.75rem', borderRadius: '4px', fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem' }}
                  >
                    📢 Bulk Salary Alerts
                  </button>
                </div>
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Instructor Name</th>
                        <th>Email Address</th>
                        <th>Specialist Subject</th>
                        <th>Salary Amount</th>
                        <th>Pay Frequency</th>
                        <th>Payment Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTeachers.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-light)' }}>
                            No instructors found.
                          </td>
                        </tr>
                      ) : (
                        filteredTeachers.map(teacher => {
                          const effective = getEffectiveFinancials(teacher.financials);
                          return (
                            <tr key={teacher.email}>
                              <td style={{ fontWeight: 600 }}>{teacher.displayName}</td>
                              <td>{teacher.email}</td>
                              <td>{teacher.teacherDetails?.subject || 'General'}</td>
                              <td style={{ fontWeight: 700 }}>
                                {effective.amount ? `PKR ${effective.amount}` : 'PKR 0 (Not Set)'}
                              </td>
                              <td>{teacher.financials?.duration || 'Monthly'}</td>
                              <td>
                                <span className={`badge badge-${effective.paymentStatus.toLowerCase()}`}>
                                  {effective.paymentStatus}
                                </span>
                              </td>
                              <td>
                                <button 
                                  onClick={() => handleOpenFinanceModal(teacher)}
                                  className="btn btn-secondary btn-sm"
                                  style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                                >
                                  Adjust Salary
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* FINANCIAL ADJUSTMENT MODAL */}
      {selectedUserForFinance && (
        <div className="modal-overlay">
          <div className="modal-content fade-in" style={{ maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3>Adjust Financials: {selectedUserForFinance.displayName}</h3>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-light)', textTransform: 'uppercase', fontWeight: 600 }}>
                Role: {selectedUserForFinance.role}
              </span>
            </div>

            <form onSubmit={handleSaveFinancials} style={{ marginTop: '1rem' }}>
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label style={{ fontWeight: 600 }}>
                  {selectedUserForFinance.role === 'student' ? 'Total Yearly Tuition Fee (PKR)' : 'Total Yearly Salary (PKR)'}
                </label>
                <input 
                  type="number" 
                  min={0} 
                  value={yearlyTotalAmount} 
                  onChange={(e) => setYearlyTotalAmount(Number(e.target.value))}
                  required
                  disabled={loading}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label style={{ fontWeight: 600 }}>Billing / Split Frequency</label>
                <select 
                  value={financeDuration} 
                  onChange={(e) => {
                    setFinanceDuration(e.target.value);
                  }}
                  disabled={loading}
                >
                  <option value="Monthly">Monthly (12 Splits)</option>
                  <option value="3-Months">3-Months (4 Splits)</option>
                  <option value="6-Months">6-Months (2 Splits)</option>
                  <option value="Year">Year (1 Split)</option>
                  <option value="Custom">Custom Schedule</option>
                </select>
              </div>

              {financeDuration !== 'Custom' ? (
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', backgroundColor: 'var(--bg-slate)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--border-color)', marginBottom: '1.25rem' }}>
                  <div className="form-group" style={{ flex: 1, margin: 0 }}>
                    <label style={{ fontSize: '0.75rem', marginBottom: '4px' }}>Schedule Start Date</label>
                    <input 
                      type="date" 
                      value={installmentStartDate} 
                      onChange={(e) => setInstallmentStartDate(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <button 
                    type="button"
                    onClick={() => generateInstallments(yearlyTotalAmount, financeDuration, installmentStartDate)}
                    className="btn btn-secondary btn-sm"
                    style={{ height: '38px' }}
                    disabled={loading || yearlyTotalAmount <= 0}
                  >
                    Generate Splits
                  </button>
                </div>
              ) : (
                <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary-navy)' }}>Custom Installment Rows</span>
                  <button 
                    type="button"
                    onClick={() => setInstallmentsList(prev => [...prev, { amount: 0, dueDate: new Date().toISOString().split('T')[0], paymentStatus: 'Unpaid' }])}
                    className="btn btn-secondary btn-sm"
                    disabled={loading}
                  >
                    + Add Installment
                  </button>
                </div>
              )}

              {/* Installments Schedule Table */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Installment Schedule Details</label>
                {installmentsList.length === 0 ? (
                  <p style={{ fontStyle: 'italic', fontSize: '0.8rem', color: 'var(--text-light)', margin: 0, padding: '1rem', textAlign: 'center', backgroundColor: 'var(--bg-slate)', borderRadius: '6px', border: '1px dashed var(--border-color)' }}>
                    No installments scheduled. Click "Generate Splits" or add rows manually.
                  </p>
                ) : (
                  <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-white)' }}>
                    <table style={{ margin: 0, fontSize: '0.8rem', width: '100%' }}>
                      <thead>
                        <tr style={{ backgroundColor: 'var(--bg-slate)' }}>
                          <th style={{ padding: '6px 10px', width: '40px' }}>#</th>
                          <th style={{ padding: '6px 10px' }}>Due Date</th>
                          <th style={{ padding: '6px 10px' }}>Amount (PKR)</th>
                          <th style={{ padding: '6px 10px' }}>Status</th>
                          {financeDuration === 'Custom' && <th style={{ padding: '6px 10px', width: '40px' }}></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {installmentsList.map((inst, index) => (
                          <tr key={index}>
                            <td style={{ padding: '6px 10px', verticalAlign: 'middle', fontWeight: 600 }}>{index + 1}</td>
                            <td style={{ padding: '6px 10px', verticalAlign: 'middle' }}>
                              <input 
                                type="date" 
                                value={inst.dueDate}
                                onChange={(e) => {
                                  const updated = [...installmentsList];
                                  updated[index].dueDate = e.target.value;
                                  setInstallmentsList(updated);
                                }}
                                style={{ padding: '4px 6px', fontSize: '0.8rem', width: '125px', margin: 0 }}
                                disabled={loading}
                              />
                            </td>
                            <td style={{ padding: '6px 10px', verticalAlign: 'middle' }}>
                              <input 
                                type="number" 
                                min={0}
                                value={inst.amount}
                                onChange={(e) => {
                                  const updated = [...installmentsList];
                                  updated[index].amount = Number(e.target.value);
                                  setInstallmentsList(updated);
                                }}
                                style={{ padding: '4px 6px', fontSize: '0.8rem', width: '90px', margin: 0 }}
                                disabled={loading}
                              />
                            </td>
                            <td style={{ padding: '6px 10px', verticalAlign: 'middle' }}>
                              <select 
                                value={inst.paymentStatus}
                                onChange={(e) => {
                                  const updated = [...installmentsList];
                                  updated[index].paymentStatus = e.target.value as any;
                                  setInstallmentsList(updated);
                                }}
                                style={{ padding: '4px 6px', fontSize: '0.8rem', width: '90px', margin: 0 }}
                                disabled={loading}
                              >
                                <option value="Paid">Paid</option>
                                <option value="Unpaid">Unpaid</option>
                                <option value="Pending">Pending</option>
                              </select>
                            </td>
                            {financeDuration === 'Custom' && (
                              <td style={{ padding: '6px 10px', verticalAlign: 'middle', textAlign: 'center' }}>
                                <button 
                                  type="button" 
                                  onClick={() => setInstallmentsList(prev => prev.filter((_, idx) => idx !== index))}
                                  style={{ padding: '2px 6px', backgroundColor: 'var(--danger)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}
                                  disabled={loading}
                                >
                                  &times;
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Validation Summary */}
              {installmentsList.length > 0 && (() => {
                const sumInst = installmentsList.reduce((sum, i) => sum + i.amount, 0);
                const isBalanced = sumInst === yearlyTotalAmount;
                return (
                  <div style={{ padding: '0.75rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, backgroundColor: isBalanced ? 'rgba(40, 167, 69, 0.05)' : 'rgba(220, 53, 69, 0.05)', border: `1px solid ${isBalanced ? 'var(--success)' : 'var(--danger)'}`, color: isBalanced ? 'var(--success)' : 'var(--danger)', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Sum of Installments: PKR {sumInst} / {yearlyTotalAmount}</span>
                    <span>{isBalanced ? '✓ Balanced' : '⚠️ Unbalanced'}</span>
                  </div>
                );
              })()}

              <div className="modal-actions" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <button 
                  type="button" 
                  onClick={() => setSelectedUserForFinance(null)} 
                  className="btn btn-secondary btn-sm"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-secondary btn-sm btn-accent"
                  disabled={loading}
                >
                  {loading ? 'Saving...' : 'Save Adjustments'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESULTS REVIEW MODAL */}
      {reviewSubmission && (
        <div className="modal-overlay">
          <div className="modal-content fade-in" style={{ maxWidth: '750px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0 }}>Review Attempt: {reviewSubmission.studentName}</h3>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>Quiz: {reviewSubmission.quizTitle}</span>
              </div>
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
                            {oIdx === studentAns && !isCorrect && " (Student's Choice - Incorrect)"}
                            {oIdx === studentAns && isCorrect && " (Student's Choice - Correct)"}
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

      {/* EDIT SCORE MODAL */}
      {editingSubmission && (
        <div className="modal-overlay">
          <div className="modal-content fade-in" style={{ maxWidth: '400px', padding: '2rem' }}>
            <h3 style={{ fontSize: '1.25rem', textTransform: 'uppercase', color: 'var(--primary-navy)', marginBottom: '0.5rem' }}>
              Edit Student Score
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', marginBottom: '1.5rem' }}>
              Modify the achieved score for **{editingSubmission.studentName}** on quiz **{editingSubmission.quizTitle}**.
            </p>

            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label>Achieved Score (0 - {editingSubmission.totalQuestions})</label>
              <input 
                type="number" 
                min={0}
                max={editingSubmission.totalQuestions}
                value={editingScoreValue}
                onChange={(e) => setEditingScoreValue(Math.max(0, Math.min(editingSubmission.totalQuestions, Number(e.target.value))))}
                disabled={loading}
                required
              />
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setEditingSubmission(null)} 
                className="btn btn-secondary btn-sm"
                disabled={loading}
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveScoreEdit} 
                className="btn btn-primary btn-sm"
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WHATSAPP MODAL ALERT */}
      {whatsappAlert && (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div className="modal-content fade-in" style={{ maxWidth: '500px', padding: '2rem' }}>
            <h3 style={{ margin: '0 0 1rem 0', color: 'var(--primary-navy)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.5rem' }}>💬</span>
              <span>Send WhatsApp Notification</span>
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-light)', fontWeight: 600, textTransform: 'uppercase' }}>Recipient</span>
                <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                  {whatsappAlert.recipientName} ({whatsappAlert.phone})
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-light)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>Message Text</label>
                <textarea 
                  rows={5}
                  value={whatsappAlert.message}
                  onChange={(e) => setWhatsappAlert(prev => prev ? { ...prev, message: e.target.value } : null)}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.85rem', color: 'var(--text-main)', backgroundColor: 'var(--bg-light)' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setWhatsappAlert(null)}
                className="btn btn-secondary btn-sm"
              >
                Dismiss
              </button>
              <button 
                onClick={() => {
                  sendWhatsAppMessage(whatsappAlert.phone, whatsappAlert.message);
                  setWhatsappAlert(null);
                }}
                className="btn btn-sm"
                style={{ backgroundColor: '#25D366', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '4px', padding: '0.5rem 1rem', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }}
              >
                <span>Send via WhatsApp</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK WHATSAPP QUEUE MODAL */}
      {bulkQueue && (
        <div className="modal-overlay" style={{ zIndex: 1210 }}>
          <div className="modal-content fade-in" style={{ maxWidth: '600px', padding: '2rem' }}>
            <h3 style={{ margin: '0 0 1rem 0', color: 'var(--primary-navy)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.5rem' }}>📢</span>
              <span>{bulkQueue.title}</span>
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
              {/* Progress Bar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-light)', marginBottom: '4px' }}>
                  <span>Queue Progress</span>
                  <span>{bulkQueue.currentIndex} of {bulkQueue.items.length} Sent</span>
                </div>
                <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${(bulkQueue.currentIndex / bulkQueue.items.length) * 100}%`, height: '100%', backgroundColor: '#25D366', transition: 'width 0.3s' }} />
                </div>
              </div>

              {/* Current Item Preview */}
              {bulkQueue.currentIndex < bulkQueue.items.length ? (
                <div style={{ padding: '1rem', backgroundColor: 'rgba(37, 211, 102, 0.05)', border: '1px dashed #25D366', borderRadius: '6px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-light)', fontWeight: 600, textTransform: 'uppercase' }}>Next Message Preview</span>
                  <div style={{ fontWeight: 700, color: 'var(--text-main)', marginTop: '4px', marginBottom: '8px' }}>
                    To: {bulkQueue.items[bulkQueue.currentIndex].recipientName} ({bulkQueue.items[bulkQueue.currentIndex].phone})
                  </div>
                  <textarea 
                    rows={4}
                    readOnly
                    value={bulkQueue.items[bulkQueue.currentIndex].message}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.8rem', color: 'var(--text-main)', backgroundColor: 'var(--bg-light)', resize: 'none' }}
                  />
                </div>
              ) : (
                <div style={{ padding: '1rem', backgroundColor: 'rgba(37, 211, 102, 0.1)', border: '1px solid #25D366', borderRadius: '6px', textAlign: 'center', color: '#128C7E', fontWeight: 600 }}>
                  🎉 All messages in the queue have been launched!
                </div>
              )}

              {/* Scrollable List of Queue Items */}
              {(() => {
                const hasDueDates = bulkQueue.items.some(item => item.dueDate);
                return (
                  <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-light)' }}>
                    <table style={{ margin: 0, fontSize: '0.8rem', width: '100%' }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '6px 12px', width: '40px', textAlign: 'center' }}>
                            <input 
                              type="checkbox"
                              checked={bulkQueue.items.length > 0 && bulkQueue.items.filter((_, i) => i >= bulkQueue.currentIndex).every(item => item.selected)}
                              onChange={() => {
                                const allPendingSelected = bulkQueue.items.filter((_, i) => i >= bulkQueue.currentIndex).every(item => item.selected);
                                setBulkQueue(prev => {
                                  if (!prev) return null;
                                  return {
                                    ...prev,
                                    items: prev.items.map((it, i) => i >= prev.currentIndex ? { ...it, selected: !allPendingSelected } : it)
                                  };
                                });
                              }}
                            />
                          </th>
                          <th style={{ padding: '6px 12px' }}>Recipient</th>
                          <th style={{ padding: '6px 12px' }}>Phone</th>
                          {hasDueDates && <th style={{ padding: '6px 12px' }}>Due Date</th>}
                          <th style={{ padding: '6px 12px', textAlign: 'right' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkQueue.items.map((item, idx) => {
                          let statusText = 'Pending';
                          let statusStyle = { color: 'var(--text-light)', fontWeight: 'normal' } as React.CSSProperties;
                          if (idx < bulkQueue.currentIndex) {
                            statusText = '✓ Launched';
                            statusStyle = { color: '#128C7E', fontWeight: 'bold' } as React.CSSProperties;
                          } else if (idx === bulkQueue.currentIndex) {
                            statusText = '👉 Next';
                            statusStyle = { color: 'var(--accent-gold-dark)', fontWeight: 'bold' } as React.CSSProperties;
                          }
                          return (
                            <tr key={idx} style={{ backgroundColor: idx === bulkQueue.currentIndex ? 'rgba(197, 160, 89, 0.05)' : 'transparent', opacity: item.selected ? 1 : 0.6 }}>
                              <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                                <input 
                                  type="checkbox"
                                  checked={item.selected}
                                  disabled={idx < bulkQueue.currentIndex}
                                  onChange={() => {
                                    setBulkQueue(prev => {
                                      if (!prev) return null;
                                      const updatedItems = [...prev.items];
                                      updatedItems[idx] = { ...updatedItems[idx], selected: !updatedItems[idx].selected };
                                      return { ...prev, items: updatedItems };
                                    });
                                  }}
                                />
                              </td>
                              <td style={{ padding: '6px 12px' }}>{item.recipientName}</td>
                              <td style={{ padding: '6px 12px' }}>{item.phone}</td>
                              {hasDueDates && <td style={{ padding: '6px 12px' }}>{item.dueDate || 'N/A'}</td>}
                              <td style={{ padding: '6px 12px', textAlign: 'right', ...statusStyle }}>{statusText}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setBulkQueue(null)}
                className="btn btn-secondary btn-sm"
              >
                {bulkQueue.currentIndex < bulkQueue.items.length ? 'Cancel Queue' : 'Close'}
              </button>
              {bulkQueue.currentIndex < bulkQueue.items.length && (
                <button 
                  onClick={() => {
                    const item = bulkQueue.items[bulkQueue.currentIndex];
                    if (item.selected) {
                      sendWhatsAppMessage(item.phone, item.message);
                    }
                    let nextIdx = bulkQueue.currentIndex + 1;
                    while (nextIdx < bulkQueue.items.length && !bulkQueue.items[nextIdx].selected) {
                      nextIdx++;
                    }
                    setBulkQueue(prev => prev ? { ...prev, currentIndex: nextIdx } : null);
                  }}
                  className="btn btn-sm"
                  style={{ backgroundColor: '#25D366', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '4px', padding: '0.5rem 1rem', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }}
                >
                  <span>
                    {bulkQueue.items[bulkQueue.currentIndex].selected 
                      ? `Launch WhatsApp (${bulkQueue.currentIndex + 1} of {bulkQueue.items.length})`
                      : `Skip (${bulkQueue.currentIndex + 1} of {bulkQueue.items.length})`}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedTeacherForRoles && (
        <div className="modal-overlay">
          <div className="modal-content fade-in" style={{ maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: 0 }}>Edit Teacher Subject Roles</h3>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-light)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Teacher: {selectedTeacherForRoles.displayName}
                </span>
              </div>
              <button 
                onClick={() => setSelectedTeacherForRoles(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-light)', padding: '0 0.5rem', lineHeight: 1 }}
                title="Close"
              >
                &times;
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
              <div style={{ backgroundColor: 'var(--bg-slate)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontWeight: 700, fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem', color: 'var(--primary-navy)' }}>
                  CURRENT ASSIGNED SUBJECTS & CLASSES
                </span>
                
                {(!selectedTeacherForRoles.teacherDetails?.subjects || selectedTeacherForRoles.teacherDetails.subjects.length === 0) ? (
                  <p style={{ fontSize: '0.85rem', fontStyle: 'italic', color: 'var(--text-light)', margin: 0 }}>
                    No assigned classes. (Restricted to legacy subject: "{selectedTeacherForRoles.teacherDetails?.subject || 'N/A'}")
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto' }}>
                    {selectedTeacherForRoles.teacherDetails.subjects.map((s, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-white)', padding: '0.5rem 0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                        <span>
                          <strong style={{ color: 'var(--primary-navy)' }}>{s.subject}</strong> &rarr; {s.subCategory} ({s.category}) {s.section ? `[Sections: ${s.section}]` : ''}
                        </span>
                        <button 
                          onClick={() => handleRemoveTeacherSubjectRole(selectedTeacherForRoles, idx)}
                          className="btn btn-danger btn-sm"
                          style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                          disabled={loading}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.85rem', display: 'block', marginBottom: '0.75rem', color: 'var(--primary-navy)' }}>
                  ALLOCATE NEW SUBJECT & CLASS ROLE
                </span>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.75rem', marginBottom: '2px' }}>Subject Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. History, Tactics" 
                      value={editTeacherSubject} 
                      onChange={(e) => setEditTeacherSubject(e.target.value)}
                      disabled={loading}
                    />
                  </div>

                  {/* Categories Checkboxes */}
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dark)', display: 'block', marginBottom: '0.25rem' }}>Categories</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', backgroundColor: 'var(--bg-white)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                      {Object.keys(REGISTRATION_CATEGORIES).map(cat => {
                        const isChecked = editTeacherCategories.includes(cat);
                        return (
                          <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', cursor: 'pointer', margin: 0 }}>
                            <input 
                              type="checkbox" 
                              checked={isChecked} 
                              onChange={() => {
                                if (isChecked) {
                                  setEditTeacherCategories(prev => prev.filter(c => c !== cat));
                                  const subcats = REGISTRATION_CATEGORIES[cat] || [];
                                  setEditTeacherSubCategories(prev => prev.filter(sc => !subcats.includes(sc)));
                                } else {
                                  setEditTeacherCategories(prev => [...prev, cat]);
                                }
                              }}
                              disabled={loading}
                            />
                            <span>{cat}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Classes Checkboxes */}
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dark)', display: 'block', marginBottom: '0.25rem' }}>Classes / Sub-Categories</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.5rem', backgroundColor: 'var(--bg-white)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                      {(() => {
                        const availableClasses = editTeacherCategories.reduce((acc, cat) => {
                          if (REGISTRATION_CATEGORIES[cat]) acc.push(...REGISTRATION_CATEGORIES[cat]);
                          return acc;
                        }, [] as string[]);
                        
                        if (availableClasses.length === 0) {
                          return <span style={{ color: 'var(--text-light)', fontSize: '0.8rem' }}>Check at least one Category to view classes.</span>;
                        }

                        return availableClasses.map(cls => {
                          const isChecked = editTeacherSubCategories.includes(cls);
                          return (
                            <label key={cls} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', cursor: 'pointer', margin: 0 }}>
                              <input 
                                type="checkbox" 
                                checked={isChecked} 
                                onChange={() => {
                                  if (isChecked) {
                                    setEditTeacherSubCategories(prev => prev.filter(c => c !== cls));
                                  } else {
                                    setEditTeacherSubCategories(prev => [...prev, cls]);
                                  }
                                }}
                                disabled={loading}
                              />
                              <span>{cls}</span>
                            </label>
                          );
                        });
                      })()}
                    </div>
                  </div>

                  {/* Sections Checkboxes */}
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dark)', display: 'block', marginBottom: '0.25rem' }}>Sections</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', backgroundColor: 'var(--bg-white)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                      {['Group A', 'Group B', 'Group C', 'Group D'].map(sec => {
                        const isChecked = editTeacherSections.includes(sec);
                        return (
                          <label key={sec} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', cursor: 'pointer', margin: 0 }}>
                            <input 
                              type="checkbox" 
                              checked={isChecked} 
                              onChange={() => {
                                if (isChecked) {
                                  setEditTeacherSections(prev => prev.filter(s => s !== sec));
                                } else {
                                  setEditTeacherSections(prev => [...prev, sec]);
                                }
                              }}
                              disabled={loading}
                            />
                            <span>{sec}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <button 
                    type="button" 
                    onClick={() => handleAddTeacherSubjectRole(selectedTeacherForRoles)}
                    className="btn btn-secondary btn-sm"
                    style={{ height: '38px', padding: '0 1rem', display: 'flex', alignItems: 'center', alignSelf: 'flex-start' }}
                    disabled={loading}
                  >
                    Add Class Role
                  </button>
                </div>
              </div>
            </div>
            
            <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
              <button 
                onClick={() => setSelectedTeacherForRoles(null)} 
                className="btn btn-secondary btn-sm"
                disabled={loading}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 5. MAIN PAGE & ANNOUNCEMENTS MANAGER TAB */}
      {activeTab === 'homepage' && (
        <div className="fade-in">
          <h3 style={{ fontSize: '1.2rem', textTransform: 'uppercase', color: 'var(--primary-navy)', marginBottom: '1rem' }}>
            Main Page Announcements & Featured Quizzes Manager (Developer Role)
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
            {/* Create Announcement Form */}
            <div className="glass-card" style={{ padding: '1.5rem' }}>
              <h4 style={{ fontSize: '1.05rem', color: 'var(--primary-navy)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Plus size={18} />
                Create Main Page Announcement
              </h4>

              <form onSubmit={handleCreateAnnouncement} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="form-group">
                  <label>Announcement Title</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Batch 2026 Admissions Open" 
                    value={newAnnTitle}
                    onChange={(e) => setNewAnnTitle(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>Category</label>
                    <select value={newAnnCategory} onChange={(e) => setNewAnnCategory(e.target.value)}>
                      <option value="Admissions">Admissions</option>
                      <option value="Free Evaluation">Free Evaluation</option>
                      <option value="Campus News">Campus News</option>
                      <option value="Results">Results</option>
                      <option value="Important Notice">Important Notice</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Badge Highlight</label>
                    <select value={newAnnBadgeColor} onChange={(e) => setNewAnnBadgeColor(e.target.value)}>
                      <option value="var(--accent-gold-dark)">Gold (High Priority)</option>
                      <option value="var(--secondary-olive)">Olive Green (Free Test)</option>
                      <option value="var(--primary-navy)">Navy Blue (Official Notice)</option>
                      <option value="var(--danger)">Red (Urgent Deadline)</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Announcement Details / Content</label>
                  <textarea 
                    rows={4} 
                    placeholder="Enter official announcement details displayed to website visitors..." 
                    value={newAnnContent}
                    onChange={(e) => setNewAnnContent(e.target.value)}
                    required
                    style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', resize: 'vertical' }}
                  />
                </div>

                <button type="submit" className="btn btn-secondary" disabled={loading} style={{ backgroundColor: 'var(--accent-gold-dark)', color: 'white', border: 'none' }}>
                  {loading ? 'Publishing...' : 'Publish Announcement to Main Page'}
                </button>
              </form>
            </div>

            {/* Existing Announcements List & Quiz Featured Toggles */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div className="glass-card" style={{ padding: '1.5rem' }}>
                <h4 style={{ fontSize: '1.05rem', color: 'var(--primary-navy)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Bell size={18} />
                  Active Announcements on Homepage ({announcements.length})
                </h4>

                {announcements.length === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>No custom announcements published yet. Default notices are showing.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {announcements.map(ann => (
                      <div key={ann.id} style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-white)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--primary-navy)' }}>{ann.title}</div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>Category: {ann.category} • Date: {ann.date}</span>
                        </div>
                        <button 
                          onClick={() => handleDeleteAnnouncement(ann.id, ann.title)}
                          className="btn btn-danger btn-sm"
                          style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Main Page Featured Quizzes Manager */}
              <div className="glass-card" style={{ padding: '1.5rem' }}>
                <h4 style={{ fontSize: '1.05rem', color: 'var(--primary-navy)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Sparkles size={18} />
                  Main Page Featured Demo Quizzes
                </h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', marginBottom: '1rem' }}>
                  Feature any published quiz on the homepage so prospective students can try it out for free!
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {filteredQuizzes.filter(q => q.status === 'published').length === 0 ? (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>No published quizzes available to feature.</p>
                  ) : (
                    filteredQuizzes.filter(q => q.status === 'published').map(q => (
                      <div key={q.id} style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-white)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--primary-navy)' }}>{q.title}</div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>Subject: {q.teacherSubject || 'General'} • {q.questions?.length || 0} Questions</span>
                        </div>
                        <button 
                          onClick={() => handleToggleQuizHomepageFeature(q)}
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.75rem', padding: '4px 10px', backgroundColor: q.isFeaturedOnHomepage ? 'var(--accent-gold-dark)' : 'var(--primary-navy)', color: 'white', border: 'none' }}
                        >
                          {q.isFeaturedOnHomepage ? '🔥 Featured on Main Page' : '+ Feature on Main Page'}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
