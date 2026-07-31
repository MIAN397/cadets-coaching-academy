import React, { useEffect, useState } from 'react';
import { collection, doc, setDoc, updateDoc, getDoc, getDocs, query, where, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { MCQQuestion, Quiz, Submission, AttendanceRecord, UserProfile } from '../types';
import { REGISTRATION_CATEGORIES } from '../types';
import { computeEligibleStudentEmails } from '../utils/academic';
import { BookOpen, Plus, Trash, Check, FileCheck, Calendar, AlertCircle, RefreshCw, DollarSign, Image as ImageIcon, Sparkles } from 'lucide-react';

interface TeacherDashboardProps {
  teacherUid: string;
  teacherEmail: string;
  teacherProfile?: UserProfile;
}

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ teacherUid, teacherEmail, teacherProfile }) => {
  const [activeTab, setActiveTab] = useState<'create-quiz' | 'my-quizzes' | 'monitor' | 'attendance' | 'salary'>('create-quiz');
  const [selectedQuizForAttempts, setSelectedQuizForAttempts] = useState<string | null>(null);
  const [quizSubTab, setQuizSubTab] = useState<'published' | 'drafts'>('published');
  const [quizBankOwnerFilter, setQuizBankOwnerFilter] = useState<'all' | 'mine' | 'others'>('all');
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(true);
  const [profileState, setProfileState] = useState<UserProfile | undefined>(teacherProfile);
  const [allowRetakeForPreviousTakers, setAllowRetakeForPreviousTakers] = useState<boolean>(false);
  
  // Quiz creation form state
  const [quizTitle, setQuizTitle] = useState('');
  const [quizDescription, setQuizDescription] = useState('');
  const [quizDuration, setQuizDuration] = useState(10); // default 10 minutes
  const [questions, setQuestions] = useState<Array<{
    questionText: string;
    options: string[];
    correctIndex: number;
    imageUrl?: string;
  }>>([
    { questionText: '', options: ['', '', '', ''], correctIndex: 0, imageUrl: '' }
  ]);

  // Quiz targeting state
  const [assignToType, setAssignToType] = useState<'all' | 'batch' | 'student' | 'category' | 'classes' | 'class-physical-group' | 'custom-target' | 'free-homepage'>('custom-target');
  const [assignToValue, setAssignToValue] = useState('');
  const [generalClassVal, setGeneralClassVal] = useState('');
  const [generalSectionVal, setGeneralSectionVal] = useState('Group A');
  const [selectedSubjectRoleIdx, setSelectedSubjectRoleIdx] = useState<number>(0);
  const [students, setStudents] = useState<UserProfile[]>([]);
  
  // Custom structured targeting state
  const [targetBatch, setTargetBatch] = useState('all');
  const [targetCategory, setTargetCategory] = useState('all');
  const [targetClasses, setTargetClasses] = useState<string[]>([]);
  const [targetSections, setTargetSections] = useState<string[]>([]);

  // Monitor/Grades state
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  // Attendance history
  const [myAttendance, setMyAttendance] = useState<AttendanceRecord[]>([]);
  const [workingDays, setWorkingDays] = useState<string[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [reviewSubmission, setReviewSubmission] = useState<Submission | null>(null);
  const [reviewCorrectAnswers, setReviewCorrectAnswers] = useState<Record<string, number>>({});

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'danger', text: string } | null>(null);

  const fetchMonitorAndAttendanceData = async () => {
    setLoading(true);
    try {
      // Fetch latest profile details (e.g. for financials)
      const profileDoc = await getDoc(doc(db, 'users', teacherEmail.toLowerCase()));
      if (profileDoc.exists()) {
        setProfileState(profileDoc.data() as UserProfile);
      }
      // 1. Fetch all student profiles to populate the targeting dropdown
      const usersSnap = await getDocs(collection(db, 'users'));
      const fetchedStudents: UserProfile[] = [];
      usersSnap.forEach(d => {
        const profile = d.data() as UserProfile;
        const currentCampus = profileState?.campus || teacherProfile?.campus;
        if (profile.role === 'student' && profile.campus === currentCampus) {
          fetchedStudents.push(profile);
        }
      });
      setStudents(fetchedStudents);

      // 2. Fetch submissions
      const submissionsSnap = await getDocs(collection(db, 'submissions'));
      const fetchedSubmissions: Submission[] = [];
      submissionsSnap.forEach(d => {
        const sub = d.data() as Submission;
        const isSameCampusStudent = fetchedStudents.some(s => s.uid === sub.studentUid || s.email.toLowerCase() === sub.studentEmail.toLowerCase());
        if (isSameCampusStudent) {
          fetchedSubmissions.push(sub);
        }
      });
      setSubmissions(fetchedSubmissions);

      // Fetch teacher's own attendance records
      const attendanceQuery = query(collection(db, 'attendance'), where('userEmail', '==', teacherEmail));
      const attendanceSnap = await getDocs(attendanceQuery);
      const fetchedAttendance: AttendanceRecord[] = [];
      attendanceSnap.forEach(d => {
        fetchedAttendance.push(d.data() as AttendanceRecord);
      });
      // Sort by date descending
      fetchedAttendance.sort((a, b) => b.date.localeCompare(a.date));
      setMyAttendance(fetchedAttendance);

      // Fetch working days
      const workingSnap = await getDocs(collection(db, 'working_days'));
      const fetchedWorking: string[] = [];
      workingSnap.forEach(d => {
        fetchedWorking.push(d.id);
      });
      setWorkingDays(fetchedWorking);

      // Fetch all quizzes
      const quizzesSnap = await getDocs(collection(db, 'quizzes'));
      const fetchedQuizzes: Quiz[] = [];
      quizzesSnap.forEach(d => {
        fetchedQuizzes.push({ id: d.id, ...d.data() } as Quiz);
      });
      setQuizzes(fetchedQuizzes);
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'danger', text: "Failed to load database details: " + err.message });
    } finally {
      setLoading(false);
    }
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

  useEffect(() => {
    fetchMonitorAndAttendanceData();
  }, [activeTab]);

  useEffect(() => {
    const teacherRoles = (profileState?.teacherDetails?.subjects && profileState.teacherDetails.subjects.length > 0)
      ? profileState.teacherDetails.subjects
      : [
          { subject: profileState?.teacherDetails?.subject || 'General', category: 'General', subCategory: 'All Classes' }
        ];
    const role = teacherRoles[selectedSubjectRoleIdx];
    if (role) {
      const cat = role.category && role.category !== 'General' && role.category !== 'All' 
        ? role.category.split(',')[0].trim() 
        : 'all';
      setTargetCategory(cat);

      if (role.subCategory && role.subCategory !== 'All Classes' && role.subCategory !== 'All' && role.subCategory !== 'General') {
        setTargetClasses(role.subCategory.split(',').map(s => s.trim()));
      } else {
        // Pre-fill targetClasses with all available classes for the active category
        const classes: string[] = [];
        const roleCats = role.category && role.category !== 'General' && role.category !== 'All'
          ? role.category.split(',').map((c: string) => c.trim())
          : Object.keys(REGISTRATION_CATEGORIES);

        if (cat === 'all') {
          roleCats.forEach(c => {
            if (REGISTRATION_CATEGORIES[c]) {
              classes.push(...REGISTRATION_CATEGORIES[c]);
            }
          });
        } else {
          if (REGISTRATION_CATEGORIES[cat]) {
            classes.push(...REGISTRATION_CATEGORIES[cat]);
          }
        }
        setTargetClasses(Array.from(new Set(classes)));
      }

      if (role.section && role.section !== 'All' && role.section !== 'All Sections') {
        setTargetSections(role.section.split(',').map(s => s.trim()));
      } else {
        setTargetSections(['Group A', 'Group B', 'Group C', 'Group D']);
      }
    }
  }, [selectedSubjectRoleIdx, profileState]);

  const handleAddQuestion = () => {
    setQuestions([
      ...questions,
      { questionText: '', options: ['', '', '', ''], correctIndex: 0, imageUrl: '' }
    ]);
  };

  const handleRemoveQuestion = (index: number) => {
    if (questions.length === 1) return;
    setQuestions(questions.filter((_, idx) => idx !== index));
  };

  const handleQuestionTextChange = (index: number, val: string) => {
    setQuestions(prev => prev.map((q, idx) => idx === index ? { ...q, questionText: val } : q));
  };

  const handleQuestionImageUrlChange = (index: number, val: string) => {
    setQuestions(prev => prev.map((q, idx) => idx === index ? { ...q, imageUrl: val } : q));
  };

  const handleImageFileUpload = (index: number, file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new globalThis.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
          setQuestions(prev => prev.map((q, idx) => idx === index ? { ...q, imageUrl: dataUrl } : q));
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleOptionChange = (qIndex: number, optIndex: number, val: string) => {
    setQuestions(prev => prev.map((q, idx) => {
      if (idx === qIndex) {
        const opts = [...q.options];
        opts[optIndex] = val;
        return { ...q, options: opts };
      }
      return q;
    }));
  };

  const handleCorrectIndexChange = (qIndex: number, val: number) => {
    setQuestions(prev => prev.map((q, idx) => idx === qIndex ? { ...q, correctIndex: val } : q));
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

  const handleLoadQuizForEditing = async (quiz: Quiz, isClone: boolean) => {
    setLoading(true);
    setMessage(null);
    try {
      // 1. Fetch fresh Quiz document directly from Firestore to ensure 100% of questions are retrieved
      const quizDocSnap = await getDoc(doc(db, 'quizzes', quiz.id));
      const targetQuiz: Quiz = quizDocSnap.exists() 
        ? ({ id: quizDocSnap.id, ...quizDocSnap.data() } as Quiz)
        : quiz;

      if (!targetQuiz.questions || !Array.isArray(targetQuiz.questions) || targetQuiz.questions.length === 0) {
        throw new Error("This quiz has no questions associated with it.");
      }

      // 2. Fetch Answer Key document from Firestore
      const answersDoc = await getDoc(doc(db, 'quiz_answers', targetQuiz.id));
      let correctAnswers: Record<string, number> = {};
      if (answersDoc.exists()) {
        correctAnswers = answersDoc.data().answers || {};
      }

      // 3. Map EVERY SINGLE question, preserving text, options, image, and resolving correct index safely
      const mappedQuestions = targetQuiz.questions.map((q, idx) => {
        let correctIdx = 0;
        if (q.id && correctAnswers[q.id] !== undefined) {
          correctIdx = correctAnswers[q.id];
        } else if (correctAnswers[idx] !== undefined) {
          correctIdx = correctAnswers[idx];
        } else if (correctAnswers[`q_${idx}`] !== undefined) {
          correctIdx = correctAnswers[`q_${idx}`];
        } else {
          const matchingKey = Object.keys(correctAnswers).find(k => k.startsWith(`q_${idx}_`) || k.endsWith(`_${idx}`));
          if (matchingKey && correctAnswers[matchingKey] !== undefined) {
            correctIdx = correctAnswers[matchingKey];
          }
        }

        return {
          questionText: q.questionText || '',
          options: Array.isArray(q.options) && q.options.length === 4 
            ? [...q.options] 
            : (Array.isArray(q.options) ? [...q.options, '', '', '', ''].slice(0, 4) : ['', '', '', '']),
          correctIndex: correctIdx,
          imageUrl: q.imageUrl || ''
        };
      });

      setQuizTitle(isClone ? `${targetQuiz.title} (Copy)` : targetQuiz.title);
      setQuizDescription(targetQuiz.description || '');
      setQuizDuration(targetQuiz.duration || 10);
      setQuestions(mappedQuestions);
      setAssignToType(targetQuiz.assignToType || 'custom-target');
      setAssignToValue(targetQuiz.assignToValue || '');

      if (targetQuiz.assignToType === 'custom-target') {
        setTargetBatch(targetQuiz.targetBatch || 'all');
        setTargetCategory(targetQuiz.targetCategory || 'all');
        setTargetClasses(targetQuiz.targetClasses ? targetQuiz.targetClasses.split(',') : []);
        setTargetSections(targetQuiz.targetSections ? targetQuiz.targetSections.split(',') : []);
      } else if (targetQuiz.assignToType === 'class-physical-group' && targetQuiz.assignToValue) {
        const [cls, sec] = targetQuiz.assignToValue.split('|');
        setGeneralClassVal(cls || '');
        setGeneralSectionVal(sec || 'Group A');
      }

      setAllowRetakeForPreviousTakers(targetQuiz.allowRetakeForPreviousTakers || false);

      if (isClone) {
        setEditingQuizId(null);
        setMessage({ 
          type: 'success', 
          text: `Loaded copy of "${targetQuiz.title}" with all ${mappedQuestions.length} question(s). You can edit, add/remove questions, assign to a new batch, and publish.` 
        });
      } else {
        setEditingQuizId(targetQuiz.id);
        setMessage({ 
          type: 'success', 
          text: `Editing "${targetQuiz.title}" (${mappedQuestions.length} question(s) loaded). Changes will update this quiz.` 
        });
      }

      setActiveTab('create-quiz');
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'danger', text: "Failed to load quiz details: " + err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    // Validations
    if (!quizTitle.trim()) {
      setMessage({ type: 'danger', text: 'Quiz Title is required.' });
      return;
    }
    
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.questionText.trim()) {
        setMessage({ type: 'danger', text: `Question ${i + 1} text is empty.` });
        return;
      }
      for (let o = 0; o < 4; o++) {
        if (!q.options[o].trim()) {
          setMessage({ type: 'danger', text: `Option ${o + 1} for Question ${i + 1} is empty.` });
          return;
        }
      }
    }

    if (isPublishing) {
      if (assignToType === 'class-physical-group') {
        if (!assignToValue || !assignToValue.includes('|') || !assignToValue.split('|')[1]) {
          setMessage({ type: 'danger', text: 'Please select a class and a physical group / section.' });
          return;
        }
      }

      if (assignToType === 'batch' && !assignToValue) {
        setMessage({ type: 'danger', text: 'Please select a target batch.' });
        return;
      }

      if (assignToType === 'student' && !assignToValue) {
        setMessage({ type: 'danger', text: 'Please select a target cadet (student).' });
        return;
      }

      if (assignToType === 'category' && !assignToValue) {
        setMessage({ type: 'danger', text: 'Please select a target category.' });
        return;
      }

      if (assignToType === 'classes' && !assignToValue) {
        setMessage({ type: 'danger', text: 'Please select at least one target class.' });
        return;
      }
    }

    setLoading(true);
    const quizId = editingQuizId || ('quiz_' + Math.random().toString(36).substr(2, 9));
    
    try {
      // 1. Build Quiz document with unique IDs for all questions
      const nowTs = Date.now();
      const mcqQuestions: MCQQuestion[] = questions.map((q, idx) => ({
        id: `q_${idx}_${nowTs}_${Math.random().toString(36).substr(2, 5)}`,
        questionText: q.questionText,
        options: q.options,
        ...(q.imageUrl ? { imageUrl: q.imageUrl } : {})
      }));

      const teacherRoles = (profileState?.teacherDetails?.subjects && profileState.teacherDetails.subjects.length > 0)
        ? profileState.teacherDetails.subjects
        : [
            { subject: profileState?.teacherDetails?.subject || 'General', category: 'General', subCategory: 'All Classes' }
          ];
      const currentRole = teacherRoles[selectedSubjectRoleIdx];

      const eligibleStudentEmails = computeEligibleStudentEmails(
        students,
        assignToType,
        assignToValue,
        targetBatch,
        targetCategory,
        targetClasses,
        targetSections
      );

      const existingQuiz = editingQuizId ? quizzes.find(q => q.id === editingQuizId) : undefined;
      const currentVersion = existingQuiz?.assignmentVersion ? existingQuiz.assignmentVersion + 1 : 1;

      const newQuiz: Quiz = {
        id: quizId,
        title: quizTitle,
        description: quizDescription,
        duration: quizDuration,
        createdById: teacherUid,
        createdByEmail: teacherEmail,
        createdAt: existingQuiz?.createdAt || new Date(), // Set client-side, serverTimestamp on doc set
        questions: mcqQuestions,
        status: isPublishing ? 'published' : 'draft',
        assignToType: assignToType,
        assignToValue: assignToValue,
        targetBatch: assignToType === 'custom-target' ? targetBatch : '',
        targetCategory: assignToType === 'custom-target' ? targetCategory : '',
        targetClasses: assignToType === 'custom-target' ? targetClasses.join(',') : '',
        targetSections: assignToType === 'custom-target' ? targetSections.join(',') : '',
        teacherName: profileState?.displayName || 'Unknown Teacher',
        teacherSubject: currentRole?.subject || profileState?.teacherDetails?.subject || 'General',
        assignedStudentEmails: eligibleStudentEmails,
        assignedAt: new Date(),
        assignmentVersion: currentVersion,
        allowRetakeForPreviousTakers: allowRetakeForPreviousTakers
      };

      // 2. Build answer key document
      const answerKey: Record<string, number> = {};
      mcqQuestions.forEach((q, idx) => {
        answerKey[q.id] = questions[idx].correctIndex;
      });

      // Write to Firebase Firestore
      await setDoc(doc(db, 'quizzes', quizId), {
        ...newQuiz,
        campus: profileState?.campus || teacherProfile?.campus || 'boys',
        createdAt: serverTimestamp(),
        assignedAt: serverTimestamp()
      });

      await setDoc(doc(db, 'quiz_answers', quizId), {
        quizId,
        answers: answerKey
      });

      const successMsg = isPublishing 
        ? `Quiz "${quizTitle}" successfully finalized and published to ${eligibleStudentEmails.length} enrolled student(s)!` 
        : `Quiz "${quizTitle}" successfully saved as draft!`;
      setMessage({ type: 'success', text: successMsg });
      
      // Refresh teacher data so all quizzes and questions appear updated in state immediately
      await fetchMonitorAndAttendanceData();

      // Reset form
      setQuizTitle('');
      setQuizDescription('');
      setQuizDuration(10);
      setQuestions([{ questionText: '', options: ['', '', '', ''], correctIndex: 0, imageUrl: '' }]);
      setAssignToType('custom-target');
      setAssignToValue('');
      setSelectedSubjectRoleIdx(0);
      setTargetBatch('all');
      setTargetCategory('all');
      setTargetClasses([]);
      setTargetSections([]);
      setGeneralClassVal('');
      setGeneralSectionVal('Group A');
      setAllowRetakeForPreviousTakers(false);
      setEditingQuizId(null);
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'danger', text: "Failed to save quiz: " + err.message });
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
      
      fetchMonitorAndAttendanceData();
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'danger', text: 'Failed to delete quiz data: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  const teacherRolesForTargeting = (profileState?.teacherDetails?.subjects && profileState.teacherDetails.subjects.length > 0)
    ? profileState.teacherDetails.subjects
    : [
        { subject: profileState?.teacherDetails?.subject || 'General', category: 'General', subCategory: 'All Classes' }
      ];
  const currentRoleForTargeting = teacherRolesForTargeting[selectedSubjectRoleIdx];
  const roleCategoriesForTargeting = currentRoleForTargeting?.category && currentRoleForTargeting.category !== 'General' && currentRoleForTargeting.category !== 'All'
    ? currentRoleForTargeting.category.split(',').map((c: string) => c.trim())
    : Object.keys(REGISTRATION_CATEGORIES);

  const getAvailableClassesForTargeting = () => {
    let classes: string[] = [];
    if (targetCategory === 'all') {
      roleCategoriesForTargeting.forEach(cat => {
        if (REGISTRATION_CATEGORIES[cat]) {
          classes.push(...REGISTRATION_CATEGORIES[cat]);
        }
      });
    } else {
      if (REGISTRATION_CATEGORIES[targetCategory]) {
        classes.push(...REGISTRATION_CATEGORIES[targetCategory]);
      }
    }
    if (currentRoleForTargeting?.subCategory && currentRoleForTargeting.subCategory !== 'All Classes' && currentRoleForTargeting.subCategory !== 'All' && currentRoleForTargeting.subCategory !== 'General') {
      const roleSubs = currentRoleForTargeting.subCategory.split(',').map((s: string) => s.trim().toLowerCase());
      classes = classes.filter(c => roleSubs.includes(c.toLowerCase()));
    }
    return Array.from(new Set(classes));
  };

  return (
    <div className="fade-in">
      <div className="dashboard-header">
        <div>
          <h2>Teacher Instruction Suite</h2>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-light)', fontWeight: 500 }}>
            Upload academic material and review cadet accomplishments
          </span>
        </div>
        
        <div className="segmented-control">
          <button 
            onClick={() => setActiveTab('create-quiz')} 
            className={`segmented-btn ${activeTab === 'create-quiz' ? 'active' : ''}`}
          >
            <Plus size={14} />
            Create Timed Quiz
          </button>
          <button 
            onClick={() => setActiveTab('my-quizzes')} 
            className={`segmented-btn ${activeTab === 'my-quizzes' ? 'active' : ''}`}
          >
            <BookOpen size={14} />
            My Quizzes
          </button>
          <button 
            onClick={() => setActiveTab('monitor')} 
            className={`segmented-btn ${activeTab === 'monitor' ? 'active' : ''}`}
          >
            <FileCheck size={14} />
            Cadet Grades
          </button>
          <button 
            onClick={() => setActiveTab('attendance')} 
            className={`segmented-btn ${activeTab === 'attendance' ? 'active' : ''}`}
          >
            <Calendar size={14} />
            My Attendance
          </button>
          <button 
            onClick={() => setActiveTab('salary')} 
            className={`segmented-btn ${activeTab === 'salary' ? 'active' : ''}`}
          >
            <DollarSign size={14} />
            My Salary
          </button>
        </div>
      </div>

      {message && (
        <div className={`alert alert-${message.type}`}>
          {message.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Teacher Overview Stat Cards */}
      <div className="stats-grid" style={{ marginBottom: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div 
          className="stat-card navy clickable" 
          onClick={() => { setActiveTab('my-quizzes'); setQuizBankOwnerFilter('mine'); }}
          style={{ cursor: 'pointer', padding: '1rem 1.25rem' }}
          title="Click to view your quizzes in Quiz Bank"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-title">My Created Quizzes</span>
            <BookOpen size={18} color="var(--primary-navy-light)" />
          </div>
          <span className="stat-value" style={{ fontSize: '1.5rem', marginTop: '0.2rem' }}>
            {quizzes.filter(q => q.createdById === teacherUid || (q.createdByEmail && q.createdByEmail.toLowerCase() === teacherEmail.toLowerCase())).length}
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--primary-navy)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px', marginTop: '0.2rem' }}>
            My Quiz Bank &rarr;
          </span>
        </div>

        <div 
          className="stat-card gold clickable" 
          onClick={() => setActiveTab('monitor')}
          style={{ cursor: 'pointer', padding: '1rem 1.25rem' }}
          title="Click to view cadet gradebook and attempts"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-title">Submissions Logged</span>
            <FileCheck size={18} color="var(--accent-gold-dark)" />
          </div>
          <span className="stat-value" style={{ fontSize: '1.5rem', marginTop: '0.2rem' }}>{submissions.length}</span>
          <span style={{ fontSize: '0.72rem', color: 'var(--accent-gold-dark)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px', marginTop: '0.2rem' }}>
            Cadet Grades &rarr;
          </span>
        </div>

        <div 
          className="stat-card clickable" 
          onClick={() => setActiveTab('attendance')}
          style={{ cursor: 'pointer', padding: '1rem 1.25rem' }}
          title="Click to view your attendance history"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-title">My Attendance History</span>
            <Calendar size={18} color="var(--secondary-olive)" />
          </div>
          <span className="stat-value" style={{ fontSize: '1.5rem', marginTop: '0.2rem' }}>
            {myAttendance.filter(a => a.physicalAttendance === 'Present' || a.academicAttendance === 'Present').length} Days
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--secondary-olive)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px', marginTop: '0.2rem' }}>
            My Attendance &rarr;
          </span>
        </div>

        <div 
          className="stat-card navy clickable" 
          onClick={() => setActiveTab('salary')}
          style={{ cursor: 'pointer', padding: '1rem 1.25rem' }}
          title="Click to check salary details"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-title">Monthly Compensation</span>
            <DollarSign size={18} color="var(--primary-navy-light)" />
          </div>
          <span className="stat-value" style={{ fontSize: '1.25rem', marginTop: '0.2rem' }}>
            {profileState?.financials?.amount ? `Rs. ${profileState.financials.amount.toLocaleString()}` : 'Configured'}
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--primary-navy)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px', marginTop: '0.2rem' }}>
            Salary Breakdown &rarr;
          </span>
        </div>
      </div>

      {/* Dynamic Guidance Banner for Teachers */}
      <div className="guidance-banner fade-in">
        <Sparkles size={18} color="var(--accent-gold-dark)" />
        <div>
          {activeTab === 'create-quiz' && (
            <span><strong>Quiz Creator Guide:</strong> Enter your quiz details, select assigned targeting rules, add questions with options, and click Finalize & Publish to snapshot currently enrolled cadets.</span>
          )}
          {activeTab === 'my-quizzes' && (
            <span><strong>Quiz Bank Guide:</strong> Manage live quizzes, edit/reassign targets, or inspect quizzes assigned by other faculty members in read-only mode.</span>
          )}
          {activeTab === 'monitor' && (
            <span><strong>Cadet Gradebook Guide:</strong> Review scores, view detailed student question choices, and check correct answer keys for all completed tests.</span>
          )}
          {activeTab === 'attendance' && (
            <span><strong>Attendance Log Guide:</strong> Inspect your official physical and academic session attendance records logged by academy administration.</span>
          )}
          {activeTab === 'salary' && (
            <span><strong>Salary Guide:</strong> Review your assigned monthly compensation structure and payment status.</span>
          )}
        </div>
      </div>

      {/* TAB 1: MCQ CREATE & UPLOAD */}
      {activeTab === 'create-quiz' && (
        <form onSubmit={handleSaveQuiz} className="fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
            <h3 style={{ margin: 0, textTransform: 'uppercase', color: 'var(--primary-navy)', fontSize: '1.2rem' }}>
              {editingQuizId ? 'Edit Draft / Published Quiz' : 'Create New MCQ Examination'}
            </h3>
            {editingQuizId && (
              <span className="badge badge-secondary" style={{ backgroundColor: 'var(--accent-gold-dark)', color: 'white', padding: '4px 8px', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                Editing Mode
              </span>
            )}
          </div>

          <div className="stats-grid" style={{ gridTemplateColumns: '2fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            <div className="form-group">
              <label>Quiz Title</label>
              <input 
                type="text" 
                placeholder="e.g. Map Reading & Coordinate Geography" 
                value={quizTitle} 
                onChange={(e) => setQuizTitle(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="form-group">
              <label>Timer Limit (Minutes)</label>
              <input 
                type="number" 
                min={1} 
                max={180} 
                value={quizDuration} 
                onChange={(e) => setQuizDuration(Number(e.target.value))}
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '2rem' }}>
            <label>Short Description / Instructions</label>
            <textarea 
              rows={2} 
              placeholder="Provide guidelines for the cadets attempting this timed quiz..." 
              value={quizDescription} 
              onChange={(e) => setQuizDescription(e.target.value)}
              disabled={loading}
            />
          </div>

          {(() => {
            const teacherRoles = (profileState?.teacherDetails?.subjects && profileState.teacherDetails.subjects.length > 0)
              ? profileState.teacherDetails.subjects
              : [
                  { subject: profileState?.teacherDetails?.subject || 'General', category: 'General', subCategory: 'All Classes' }
                ];

            return (
              <>
                {/* Subject-Class role select */}
                <div className="form-group" style={{ marginBottom: '1.5rem', width: '100%', maxWidth: '500px' }}>
                  <label style={{ fontWeight: 600, color: 'var(--primary-navy)' }}>Select Assigned Class & Subject Role</label>
                  <select
                    value={selectedSubjectRoleIdx}
                    onChange={(e) => {
                      setSelectedSubjectRoleIdx(Number(e.target.value));
                    }}
                    disabled={loading}
                    style={{ border: '2px solid var(--accent-gold)' }}
                  >
                    {teacherRoles.map((role, idx) => (
                      <option key={idx} value={idx}>
                        {role.subject} &rarr; {role.subCategory} ({role.category})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ backgroundColor: 'var(--bg-slate)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '2rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <h4 style={{ color: 'var(--primary-navy)', fontSize: '0.95rem', fontWeight: 700, margin: 0, textTransform: 'uppercase' }}>
                      Configure Quiz Targeting Rules
                    </h4>
                    
                    {/* Targeting Mode select dropdown */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <label style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase' }}>Targeting Mode:</label>
                      <select 
                        value={assignToType} 
                        onChange={(e) => {
                          setAssignToType(e.target.value as any);
                          setAssignToValue('');
                        }}
                        disabled={loading}
                        style={{ border: '1px solid var(--accent-gold)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', backgroundColor: 'var(--bg-white)', fontWeight: 600 }}
                      >
                        <option value="custom-target">Restricted to My Assigned Classes</option>
                        <option value="all">All Cadets</option>
                        <option value="batch">Specific Batch</option>
                        <option value="student">Specific Cadet (Student)</option>
                        <option value="category">Specific Category</option>
                        <option value="classes">Specific Class(es)</option>
                        <option value="class-physical-group">Class + Section</option>
                      </select>
                    </div>
                  </div>

                  {assignToType === 'custom-target' && (
                    <div className="fade-in">
                      <div className="form-group-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
                        <div className="form-group">
                          <label>Target Batch</label>
                          <select 
                            value={targetBatch} 
                            onChange={(e) => setTargetBatch(e.target.value)}
                            disabled={loading}
                          >
                            <option value="all">All Batches</option>
                            {Array.from(new Set(students.map(s => s.registrationDetails?.batch).filter(Boolean))).map(batch => (
                              <option key={batch} value={batch}>{batch}</option>
                            ))}
                          </select>
                        </div>

                        <div className="form-group">
                          <label>Target Category</label>
                          <select 
                            value={targetCategory} 
                            onChange={(e) => {
                              const newCat = e.target.value;
                              setTargetCategory(newCat);
                              
                              // Pre-fill classes for the new category based on the role's subCategory constraints
                              const teacherRoles = (profileState?.teacherDetails?.subjects && profileState.teacherDetails.subjects.length > 0)
                                ? profileState.teacherDetails.subjects
                                : [
                                    { subject: profileState?.teacherDetails?.subject || 'General', category: 'General', subCategory: 'All Classes' }
                                  ];
                              const role = teacherRoles[selectedSubjectRoleIdx];
                              let classes: string[] = [];
                              
                              const roleCats = role.category && role.category !== 'General' && role.category !== 'All'
                                ? role.category.split(',').map((c: string) => c.trim())
                                : Object.keys(REGISTRATION_CATEGORIES);

                              if (newCat === 'all') {
                                roleCats.forEach(c => {
                                  if (REGISTRATION_CATEGORIES[c]) {
                                    classes.push(...REGISTRATION_CATEGORIES[c]);
                                  }
                                });
                              } else {
                                if (REGISTRATION_CATEGORIES[newCat]) {
                                  classes.push(...REGISTRATION_CATEGORIES[newCat]);
                                }
                              }
                              
                              if (role?.subCategory && role.subCategory !== 'All Classes' && role.subCategory !== 'All' && role.subCategory !== 'General') {
                                const roleSubs = role.subCategory.split(',').map((s: string) => s.trim().toLowerCase());
                                classes = classes.filter(c => roleSubs.includes(c.toLowerCase()));
                              }
                              setTargetClasses(Array.from(new Set(classes)));
                            }}
                            disabled={loading}
                          >
                            <option value="all">All Categories</option>
                            {roleCategoriesForTargeting.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Target Classes Section */}
                      <div style={{ marginBottom: '1.25rem' }}>
                        <label style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>
                          Target Classes / Sub-Categories (Select all that apply)
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.5rem', backgroundColor: 'var(--bg-white)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                          {(() => {
                            const availableClasses = getAvailableClassesForTargeting();
                            if (availableClasses.length === 0) {
                              return <span style={{ color: 'var(--text-light)', fontSize: '0.8rem' }}>No classes available for selected category.</span>;
                            }
                            return availableClasses.map(cls => {
                              const isChecked = targetClasses.includes(cls);
                              return (
                                <label key={cls} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', cursor: 'pointer', margin: 0 }}>
                                  <input 
                                    type="checkbox" 
                                    checked={isChecked} 
                                    onChange={() => {
                                      if (isChecked) {
                                        setTargetClasses(prev => prev.filter(c => c !== cls));
                                      } else {
                                        setTargetClasses(prev => [...prev, cls]);
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

                      {/* Target Sections Section */}
                      <div>
                        <label style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>
                          Target Sections / Physical Groups (Select all that apply)
                        </label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', backgroundColor: 'var(--bg-white)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                          {(() => {
                            const standardSections = ['Group A', 'Group B', 'Group C', 'Group D'];
                            const allowedSections = currentRoleForTargeting?.section && currentRoleForTargeting.section !== 'All' && currentRoleForTargeting.section !== 'All Sections'
                              ? currentRoleForTargeting.section.split(',').map(s => s.trim())
                              : standardSections;
                            
                            return allowedSections.map(sec => {
                              const isChecked = targetSections.includes(sec);
                              return (
                                <label key={sec} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', cursor: 'pointer', margin: 0 }}>
                                  <input 
                                    type="checkbox" 
                                    checked={isChecked} 
                                    onChange={() => {
                                      if (isChecked) {
                                        setTargetSections(prev => prev.filter(s => s !== sec));
                                      } else {
                                        setTargetSections(prev => [...prev, sec]);
                                      }
                                    }}
                                    disabled={loading}
                                  />
                                  <span>{sec}</span>
                                </label>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    </div>
                  )}

                  {assignToType === 'all' && (
                    <div className="fade-in" style={{ fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 500, backgroundColor: 'rgba(61, 75, 38, 0.05)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--secondary-olive)' }}>
                      <strong>General Mode:</strong> This examination will be assigned to <strong>All Cadets</strong> in the database (no exclusions).
                    </div>
                  )}

                  {assignToType === 'batch' && (
                    <div className="form-group fade-in" style={{ maxWidth: '400px' }}>
                      <label style={{ fontWeight: 600 }}>Target Batch</label>
                      <select 
                        value={assignToValue} 
                        onChange={(e) => setAssignToValue(e.target.value)}
                        disabled={loading}
                        required
                      >
                        <option value="">Select Batch</option>
                        {Array.from(new Set(students.map(s => s.registrationDetails?.batch).filter(Boolean))).map(batch => (
                          <option key={batch} value={batch}>{batch}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {assignToType === 'student' && (
                    <div className="form-group fade-in" style={{ maxWidth: '400px' }}>
                      <label style={{ fontWeight: 600 }}>Target Cadet (Student)</label>
                      <select 
                        value={assignToValue} 
                        onChange={(e) => setAssignToValue(e.target.value)}
                        disabled={loading}
                        required
                      >
                        <option value="">Select Cadet</option>
                        {students.map(s => (
                          <option key={s.email} value={s.email.toLowerCase()}>
                            {s.displayName} ({s.email}) - {s.registrationDetails?.batch || 'No Batch'}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {assignToType === 'category' && (
                    <div className="form-group fade-in" style={{ maxWidth: '400px' }}>
                      <label style={{ fontWeight: 600 }}>Target Category</label>
                      <select 
                        value={assignToValue} 
                        onChange={(e) => setAssignToValue(e.target.value)}
                        disabled={loading}
                        required
                      >
                        <option value="">Select Category</option>
                        {Object.keys(REGISTRATION_CATEGORIES).map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {assignToType === 'classes' && (
                    <div className="fade-in">
                      <label style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>
                        Select Target Classes / Sub-Categories (Across all departments)
                      </label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: 'var(--bg-white)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                        {Object.entries(REGISTRATION_CATEGORIES).map(([cat, list]) => (
                          <div key={cat} style={{ borderBottom: '1px solid var(--bg-slate)', paddingBottom: '0.75rem' }}>
                            <h5 style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--primary-navy)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>{cat}</h5>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.5rem' }}>
                              {list.map(cls => {
                                const isChecked = assignToValue.split(',').includes(cls);
                                return (
                                  <label key={cls} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', cursor: 'pointer', margin: 0 }}>
                                    <input 
                                      type="checkbox" 
                                      checked={isChecked} 
                                      onChange={() => {
                                        const currentList = assignToValue ? assignToValue.split(',') : [];
                                        if (isChecked) {
                                          setAssignToValue(currentList.filter(c => c !== cls).join(','));
                                        } else {
                                          setAssignToValue([...currentList, cls].join(','));
                                        }
                                      }}
                                      disabled={loading}
                                    />
                                    <span>{cls}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {assignToType === 'class-physical-group' && (
                    <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', maxWidth: '600px' }}>
                      <div className="form-group">
                        <label style={{ fontWeight: 600 }}>Select Class</label>
                        <select 
                          value={generalClassVal} 
                          onChange={(e) => {
                            const val = e.target.value;
                            setGeneralClassVal(val);
                            setAssignToValue(val ? `${val}|${generalSectionVal}` : '');
                          }}
                          disabled={loading}
                          required
                        >
                          <option value="">Select Class</option>
                          {Object.entries(REGISTRATION_CATEGORIES).flatMap(([cat, list]) => 
                            list.map(cls => (
                              <option key={`${cat}:${cls}`} value={`${cat}:${cls}`}>{cat} &rarr; {cls}</option>
                            ))
                          )}
                        </select>
                      </div>

                      <div className="form-group">
                        <label style={{ fontWeight: 600 }}>Select Section / Physical Group</label>
                        <select 
                          value={generalSectionVal} 
                          onChange={(e) => {
                            const val = e.target.value;
                            setGeneralSectionVal(val);
                            setAssignToValue(generalClassVal ? `${generalClassVal}|${val}` : '');
                          }}
                          disabled={loading}
                          required
                        >
                          {['Group A', 'Group B', 'Group C', 'Group D'].map(sec => (
                            <option key={sec} value={sec}>{sec}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', color: 'var(--primary-navy)' }}>
                      <input 
                        type="checkbox" 
                        checked={allowRetakeForPreviousTakers} 
                        onChange={(e) => setAllowRetakeForPreviousTakers(e.target.checked)}
                        disabled={loading}
                      />
                      <span>Allow previous attempt takers to retake upon assignment/reassignment</span>
                    </label>
                    <p style={{ margin: '4px 0 0 1.6rem', fontSize: '0.75rem', color: 'var(--text-light)', lineHeight: 1.4 }}>
                      <strong>Enrolled Student Rule:</strong> Quizzes are snapshotted to students currently enrolled at assignment time. Newly enrolled students join when reassigned. If this option is unchecked (default), students who already conducted the quiz cannot participate again.
                    </p>
                  </div>
                </div>
              </>
            );
          })()}

          <h3 style={{ fontSize: '1.1rem', textTransform: 'uppercase', color: 'var(--primary-navy)', marginBottom: '1rem' }}>
            Multiple Choice Questions
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {questions.map((q, idx) => (
              <div key={idx} className="mcq-question-card fade-in">
                {questions.length > 1 && (
                  <button 
                    type="button" 
                    className="btn-remove" 
                    onClick={() => handleRemoveQuestion(idx)}
                    title="Remove Question"
                    disabled={loading}
                  >
                    <Trash size={16} />
                  </button>
                )}

                <div className="form-group" style={{ paddingRight: '2.5rem' }}>
                  <label style={{ color: 'var(--secondary-olive)' }}>Question {idx + 1}</label>
                  <input 
                    type="text" 
                    placeholder="Enter the question text" 
                    value={q.questionText} 
                    onChange={(e) => handleQuestionTextChange(idx, e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>

                {/* Optional Image Attachment */}
                <div className="quiz-image-editor">
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--primary-navy)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                    <ImageIcon size={14} /> Optional Question Image (Diagram, Sequence, or Photo)
                  </label>
                  
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input 
                      type="text" 
                      placeholder="Paste Image URL (https://...) or upload file" 
                      value={q.imageUrl || ''} 
                      onChange={(e) => handleQuestionImageUrlChange(idx, e.target.value)}
                      disabled={loading}
                      style={{ flex: '1 1 200px', fontSize: '0.85rem', padding: '0.4rem 0.75rem' }}
                    />

                    <label className="btn btn-secondary btn-sm" style={{ margin: 0, padding: '0.4rem 0.75rem', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                      Upload Image
                      <input 
                        type="file" 
                        accept="image/*" 
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleImageFileUpload(idx, e.target.files[0]);
                          }
                        }}
                        disabled={loading}
                      />
                    </label>

                    {q.imageUrl && (
                      <button 
                        type="button" 
                        onClick={() => handleQuestionImageUrlChange(idx, '')} 
                        className="btn btn-danger btn-sm"
                        style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}
                        disabled={loading}
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  {q.imageUrl && (
                    <div className="quiz-image-preview-container">
                      <img src={q.imageUrl} alt={`Question ${idx + 1} Visual`} className="quiz-image-preview" />
                    </div>
                  )}
                </div>

                <div className="form-group-row" style={{ marginTop: '0.75rem' }}>
                  <div className="form-group">
                    <label>Option A (Index 0)</label>
                    <input 
                      type="text" 
                      placeholder="Option A content" 
                      value={q.options[0]} 
                      onChange={(e) => handleOptionChange(idx, 0, e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                  <div className="form-group">
                    <label>Option B (Index 1)</label>
                    <input 
                      type="text" 
                      placeholder="Option B content" 
                      value={q.options[1]} 
                      onChange={(e) => handleOptionChange(idx, 1, e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="form-group-row">
                  <div className="form-group">
                    <label>Option C (Index 2)</label>
                    <input 
                      type="text" 
                      placeholder="Option C content" 
                      value={q.options[2]} 
                      onChange={(e) => handleOptionChange(idx, 2, e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                  <div className="form-group">
                    <label>Option D (Index 3)</label>
                    <input 
                      type="text" 
                      placeholder="Option D content" 
                      value={q.options[3]} 
                      onChange={(e) => handleOptionChange(idx, 3, e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ maxWidth: '300px', marginTop: '0.5rem' }}>
                  <label style={{ color: 'var(--success)' }}>Correct Answer Key</label>
                  <select 
                    value={q.correctIndex} 
                    onChange={(e) => handleCorrectIndexChange(idx, Number(e.target.value))}
                    disabled={loading}
                  >
                    <option value={0}>Option A (Index 0)</option>
                    <option value={1}>Option B (Index 1)</option>
                    <option value={2}>Option C (Index 2)</option>
                    <option value={3}>Option D (Index 3)</option>
                  </select>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button 
              type="button" 
              onClick={handleAddQuestion} 
              className="btn btn-outline" 
              disabled={loading} 
            >
              <Plus size={16} />
              Add Another Question
            </button>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              <button 
                type="submit" 
                onClick={() => setIsPublishing(false)}
                className="btn btn-outline" 
                disabled={loading}
                style={{ flex: 1, minWidth: '150px' }}
              >
                Save as Draft
              </button>

              <button 
                type="submit" 
                onClick={() => setIsPublishing(true)}
                className="btn btn-secondary" 
                disabled={loading}
                style={{ flex: 2, minWidth: '200px' }}
              >
                {loading ? 'Saving...' : editingQuizId ? 'Update & Publish Quiz' : 'Finalize & Publish Quiz'}
              </button>
            </div>

            {editingQuizId && (
              <button
                type="button"
                onClick={() => {
                  setEditingQuizId(null);
                  setQuizTitle('');
                  setQuizDescription('');
                  setQuestions([{ questionText: '', options: ['', '', '', ''], correctIndex: 0 }]);
                  setMessage({ type: 'success', text: 'Edit mode cleared. Creating a new quiz.' });
                }}
                className="btn btn-danger btn-sm"
                style={{ marginTop: '0.5rem', width: '100%', padding: '0.6rem' }}
              >
                Cancel Editing (Create New instead)
              </button>
            )}
          </div>
        </form>
      )}

      {/* TAB 1.5: MY QUIZZES */}
      {activeTab === 'my-quizzes' && (
        <div className="fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1.2rem', textTransform: 'uppercase', color: 'var(--primary-navy)', margin: 0 }}>
                Academy Quiz Bank
              </h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>
                {quizSubTab === 'published' ? 'Manage live quizzes, view cadet attempts, and inspect faculty quizzes' : 'Manage your drafts and templates before publishing'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="segmented-control" style={{ margin: 0, padding: '2px' }}>
                <button 
                  onClick={() => setQuizBankOwnerFilter('all')} 
                  className={`segmented-btn ${quizBankOwnerFilter === 'all' ? 'active' : ''}`}
                  style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                >
                  All Quiz Bank
                </button>
                <button 
                  onClick={() => setQuizBankOwnerFilter('mine')} 
                  className={`segmented-btn ${quizBankOwnerFilter === 'mine' ? 'active' : ''}`}
                  style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                >
                  My Quizzes
                </button>
                <button 
                  onClick={() => setQuizBankOwnerFilter('others')} 
                  className={`segmented-btn ${quizBankOwnerFilter === 'others' ? 'active' : ''}`}
                  style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                >
                  Other Faculty Quizzes
                </button>
              </div>

              <div className="segmented-control" style={{ margin: 0, padding: '2px' }}>
                <button 
                  onClick={() => setQuizSubTab('published')} 
                  className={`segmented-btn ${quizSubTab === 'published' ? 'active' : ''}`}
                  style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                >
                  Published Quizzes
                </button>
                <button 
                  onClick={() => setQuizSubTab('drafts')} 
                  className={`segmented-btn ${quizSubTab === 'drafts' ? 'active' : ''}`}
                  style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                >
                  Drafts & Templates
                </button>
              </div>

              <button 
                onClick={fetchMonitorAndAttendanceData} 
                className="btn btn-secondary btn-sm"
                disabled={loading}
                style={{ padding: '6px 10px' }}
              >
                <RefreshCw size={12} style={{ marginRight: '4px' }} />
                Refresh
              </button>
            </div>
          </div>

          {(() => {
            const filteredQuizzes = quizzes.filter(q => {
              const isCreator = q.createdById === teacherUid || (q.createdByEmail && q.createdByEmail.toLowerCase() === teacherEmail.toLowerCase());
              
              if (quizBankOwnerFilter === 'mine' && !isCreator) return false;
              if (quizBankOwnerFilter === 'others' && isCreator) return false;

              if (quizSubTab === 'published') {
                return q.status === 'published' || !q.status;
              } else {
                return q.status === 'draft';
              }
            });

            if (filteredQuizzes.length === 0) {
              return (
                <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: 'var(--bg-white)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <BookOpen size={48} style={{ color: 'var(--text-light)', marginBottom: '1rem', opacity: 0.5 }} />
                  <p style={{ color: 'var(--text-light)', margin: 0, fontWeight: 500 }}>
                    {quizBankOwnerFilter === 'others' 
                      ? 'No quizzes found from other faculty members.' 
                      : quizSubTab === 'published' ? 'You have no published quizzes in the bank.' : 'You have no draft quizzes or templates.'}
                  </p>
                  {quizBankOwnerFilter !== 'others' && (
                    <button 
                      onClick={() => {
                        setEditingQuizId(null);
                        setQuizTitle('');
                        setQuizDescription('');
                        setQuestions([{ questionText: '', options: ['', '', '', ''], correctIndex: 0 }]);
                        setActiveTab('create-quiz');
                      }} 
                      className="btn btn-secondary btn-sm" 
                      style={{ marginTop: '1rem' }}
                    >
                      {quizSubTab === 'published' ? 'Publish a Quiz' : 'Create a Draft Quiz'}
                    </button>
                  )}
                </div>
              );
            }

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {filteredQuizzes.map(quiz => {
                  const isQuizSelected = selectedQuizForAttempts === quiz.id;
                  const quizSubsubmissions = submissions.filter(sub => sub.quizId === quiz.id);
                  const isCreator = quiz.createdById === teacherUid || (quiz.createdByEmail && quiz.createdByEmail.toLowerCase() === teacherEmail.toLowerCase());

                  return (
                    <div key={quiz.id} style={{ backgroundColor: 'var(--bg-white)', border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
                      {/* Quiz Row */}
                      <div style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, color: 'var(--primary-navy)', fontSize: '1rem' }}>{quiz.title}</span>
                            <span className="badge badge-secondary" style={{ backgroundColor: isCreator ? 'var(--primary-navy)' : 'var(--secondary-olive)', color: 'white', border: 'none', padding: '2px 6px', fontSize: '0.7rem' }}>
                              {isCreator ? 'My Quiz' : `Created by ${quiz.teacherName || quiz.createdByEmail}`}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8rem', color: 'var(--text-light)', marginTop: '4px', flexWrap: 'wrap' }}>
                            <span className="badge badge-secondary" style={{ backgroundColor: 'var(--accent-gold-dark)', color: 'white', border: 'none', padding: '2px 6px', fontSize: '0.7rem', textTransform: 'uppercase' }}>
                              {quiz.teacherSubject || 'General'}
                            </span>
                            <span>•</span>
                            <span>Duration: {quiz.duration} Mins</span>
                            <span>•</span>
                            <span>Questions: {quiz.questions?.length || 0}</span>
                            {quizSubTab === 'published' && (
                              <>
                                <span>•</span>
                                <span>
                                  Target: {
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
                                    `Classes: ${quiz.assignToValue ? quiz.assignToValue.split(',').map((c: string) => c.includes(':') ? c.split(':')[1] : c).join(', ') : 'N/A'}`
                                  }
                                </span>
                                <span>•</span>
                                <span>Snapshotted Enrolled Cadets: {Array.isArray(quiz.assignedStudentEmails) ? quiz.assignedStudentEmails.length : 'All'}</span>
                                <span>•</span>
                                <span>Attempts Recorded: {quizSubsubmissions.length}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                          {quizSubTab === 'published' ? (
                            <>
                              {isCreator ? (
                                <>
                                  <button 
                                    onClick={() => handleToggleQuizHomepageFeature(quiz)}
                                    className="btn btn-secondary btn-sm"
                                    style={{ fontSize: '0.75rem', padding: '4px 8px', backgroundColor: quiz.isFeaturedOnHomepage ? 'var(--accent-gold-dark)' : 'var(--primary-navy)', color: 'white', border: 'none' }}
                                  >
                                    {quiz.isFeaturedOnHomepage ? '🔥 Featured on Main Page' : '+ Feature on Main Page'}
                                  </button>
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
                                    onClick={() => handleLoadQuizForEditing(quiz, false)}
                                    className="btn btn-secondary btn-sm"
                                    style={{ fontSize: '0.75rem', padding: '4px 8px', backgroundColor: 'var(--accent-gold-dark)', border: 'none' }}
                                  >
                                    Edit / Reassign
                                  </button>
                                  <button 
                                    onClick={() => handleLoadQuizForEditing(quiz, true)}
                                    className="btn btn-secondary btn-sm"
                                    style={{ fontSize: '0.75rem', padding: '4px 8px', backgroundColor: 'var(--secondary-olive)', border: 'none' }}
                                  >
                                    Reuse (Clone)
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteQuiz(quiz.id, quiz.title)}
                                    className="btn btn-danger btn-sm"
                                    style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                                  >
                                    Delete Quiz
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button 
                                    onClick={() => setSelectedQuizForAttempts(
                                      selectedQuizForAttempts === quiz.id ? null : quiz.id
                                    )}
                                    className="btn btn-secondary btn-sm"
                                    style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                                  >
                                    {isQuizSelected ? 'Hide Attempts' : 'View Attempts'}
                                  </button>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-light)', fontStyle: 'italic', padding: '4px 8px', backgroundColor: 'var(--bg-slate)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                                    Read-Only (Assigned by {quiz.teacherName || quiz.createdByEmail})
                                  </span>
                                </>
                              )}
                            </>
                          ) : (
                            <>
                              {isCreator ? (
                                <>
                                  <button 
                                    onClick={() => handleLoadQuizForEditing(quiz, false)}
                                    className="btn btn-secondary btn-sm"
                                    style={{ fontSize: '0.75rem', padding: '4px 8px', backgroundColor: 'var(--accent-gold-dark)', border: 'none' }}
                                  >
                                    Edit & Publish
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteQuiz(quiz.id, quiz.title)}
                                    className="btn btn-danger btn-sm"
                                    style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                                  >
                                    Delete Draft
                                  </button>
                                </>
                              ) : (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-light)', fontStyle: 'italic' }}>
                                  Draft owned by {quiz.teacherName || quiz.createdByEmail}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Student Attempts (only shown if selected for published quizzes) */}
                      {quizSubTab === 'published' && isQuizSelected && (
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
                                {quizSubsubmissions.length === 0 ? (
                                  <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-light)', fontSize: '0.8rem' }}>
                                      No cadet attempts recorded for this quiz yet.
                                    </td>
                                  </tr>
                                ) : (
                                  quizSubsubmissions.map(sub => {
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
                                          <button 
                                            onClick={() => handleReviewResults(sub)}
                                            className="btn btn-secondary btn-sm"
                                            style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                                          >
                                            View Answers
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
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* TAB 2: MONITOR GRADES */}
      {activeTab === 'monitor' && (
        <div className="fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.2rem', textTransform: 'uppercase', color: 'var(--primary-navy)' }}>
              Cadet Performance Gradebook
            </h3>
            <button 
              onClick={fetchMonitorAndAttendanceData} 
              className="btn btn-secondary btn-sm"
              disabled={loading}
            >
              <RefreshCw size={12} style={{ marginRight: '4px' }} />
              Refresh
            </button>
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Cadet Name</th>
                  <th>Quiz Title</th>
                  <th>Points Scored</th>
                  <th>Success Rate</th>
                  <th>Completion Timestamp</th>
                  <th>Analysis</th>
                </tr>
              </thead>
              <tbody>
                {submissions.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-light)' }}>
                      No cadet quiz attempts recorded yet.
                    </td>
                  </tr>
                ) : (
                  submissions.map(sub => {
                    const pct = Math.round((sub.score / sub.totalQuestions) * 100);
                    return (
                      <tr key={sub.id}>
                        <td style={{ fontWeight: 600 }}>{sub.studentName}</td>
                        <td>{sub.quizTitle}</td>
                        <td style={{ fontWeight: 'bold' }}>{sub.score} / {sub.totalQuestions}</td>
                        <td>
                          <span 
                            style={{ 
                              fontWeight: 'bold', 
                              color: pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)' 
                            }}
                          >
                            {pct}%
                          </span>
                        </td>
                        <td>
                          {sub.submittedAt?.toDate ? sub.submittedAt.toDate().toLocaleString() : new Date().toLocaleString()}
                        </td>
                        <td>
                          <button 
                            onClick={() => handleReviewResults(sub)}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '2px 8px', fontSize: '0.8rem' }}
                          >
                            View Answers
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

      {/* TAB 3: READ-ONLY ATTENDANCE */}
      {activeTab === 'attendance' && (() => {
        const activeAttendance = myAttendance.filter(r => workingDays.includes(r.date));

        const physLogged = activeAttendance.filter(r => r.physicalAttendance !== 'Excused');
        const physPresent = physLogged.filter(r => r.physicalAttendance === 'Present').length;
        const physPct = physLogged.length > 0 ? `${Math.round((physPresent / physLogged.length) * 100)}%` : 'N/A';

        const acadLogged = activeAttendance.filter(r => r.academicAttendance !== 'Excused');
        const acadPresent = acadLogged.filter(r => r.academicAttendance === 'Present').length;
        const acadPct = acadLogged.length > 0 ? `${Math.round((acadPresent / acadLogged.length) * 100)}%` : 'N/A';

        return (
          <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.2rem', textTransform: 'uppercase', color: 'var(--primary-navy)', margin: 0 }}>
                My Personal Attendance History
              </h3>
            </div>

            {/* Percentage Stats Grid */}
            <div className="stats-grid" style={{ marginBottom: '1.5rem', gridTemplateColumns: '1fr 1fr' }}>
              <div className="stat-card navy" style={{ padding: '1.25rem' }}>
                <span className="stat-title" style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-light)', fontWeight: 600 }}>Overall Physical Attendance</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <span className="stat-value" style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--primary-navy)' }}>{physPct}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>({physPresent} of {physLogged.length} logged sessions)</span>
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
                    <th>Physical Session</th>
                    <th>Academic Session</th>
                    <th>Logged By</th>
                  </tr>
                </thead>
                <tbody>
                  {myAttendance.filter(rec => workingDays.includes(rec.date)).length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-light)' }}>
                        No attendance logs recorded for your profile.
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

      {/* TAB 4: SALARY DETAILS */}
      {activeTab === 'salary' && (
        <div className="fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <h3 style={{ fontSize: '1.2rem', textTransform: 'uppercase', color: 'var(--primary-navy)', margin: 0 }}>
                Salary & Compensation Ledger
              </h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>
                View your current payroll parameters and pay stub history
              </span>
            </div>
            <button 
              onClick={fetchMonitorAndAttendanceData} 
              className="btn btn-secondary btn-sm"
              disabled={loading}
            >
              <RefreshCw size={12} style={{ marginRight: '4px' }} />
              Refresh
            </button>
          </div>

          <div className="stats-grid" style={{ marginBottom: '2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            <div className="stat-card navy" style={{ padding: '1.25rem' }}>
              <span className="stat-title" style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-light)', fontWeight: 600 }}>Assigned Salary</span>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--primary-navy)', marginTop: '0.5rem' }}>
                {profileState?.financials?.amount ? `PKR ${profileState.financials.amount}` : 'PKR 0 (Not Assigned)'}
              </div>
            </div>
            <div className="stat-card" style={{ padding: '1.25rem', backgroundColor: 'var(--bg-white)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
              <span className="stat-title" style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-light)', fontWeight: 600 }}>Payment Cycle</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.5rem' }}>
                {profileState?.financials?.duration || 'Monthly'}
              </div>
            </div>
            <div className="stat-card gold" style={{ padding: '1.25rem' }}>
              <span className="stat-title" style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-light)', fontWeight: 600 }}>Disbursement Status</span>
              <div style={{ marginTop: '0.5rem' }}>
                <span className={`badge badge-${(profileState?.financials?.paymentStatus || 'Unpaid').toLowerCase()}`} style={{ fontSize: '1rem', padding: '4px 12px' }}>
                  {profileState?.financials?.paymentStatus || 'Unpaid'}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem', alignItems: 'start' }}>
            <div style={{ backgroundColor: 'var(--bg-slate)', padding: '2rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <h4 style={{ color: 'var(--primary-navy)', textTransform: 'uppercase', fontSize: '0.9rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                Instructor Dossier & Contract
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase' }}>Full Name</span>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{profileState?.displayName}</div>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase' }}>Specialist Subject</span>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--secondary-olive)' }}>{profileState?.teacherDetails?.subject || 'General'}</div>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', display: 'block', marginBottom: '0.25rem' }}>Assigned Classes & Roles</span>
                  {(!profileState?.teacherDetails?.subjects || profileState.teacherDetails.subjects.length === 0) ? (
                    <div style={{ fontSize: '0.95rem', fontWeight: 500, color: 'var(--text-light)' }}>
                      No assigned classes. (General: {profileState?.teacherDetails?.subject || 'N/A'})
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', backgroundColor: 'var(--bg-white)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', marginBottom: '0.5rem' }}>
                      {profileState.teacherDetails.subjects.map((s, idx) => (
                        <div key={idx} style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>
                          <strong style={{ color: 'var(--primary-navy)' }}>{s.subject}</strong> &rarr; {s.subCategory} ({s.category}) {s.section ? `[Section: ${s.section}]` : ''}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase' }}>Contact Phone</span>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{profileState?.teacherDetails?.phone || 'N/A'}</div>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase' }}>Last Payroll Update</span>
                  <div style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-light)' }}>
                    {profileState?.financials?.lastUpdated 
                      ? (profileState.financials.lastUpdated.toDate 
                        ? profileState.financials.lastUpdated.toDate().toLocaleString() 
                        : new Date(profileState.financials.lastUpdated).toLocaleString()) 
                      : 'N/A'}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--bg-white)', padding: '2rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <h4 style={{ color: 'var(--primary-navy)', textTransform: 'uppercase', fontSize: '0.9rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                Academy Compensation Policy
              </h4>
              <p style={{ fontSize: '0.85rem', lineHeight: '1.5', color: 'var(--text-main)', margin: '0 0 1rem 0' }}>
                Instructors receive disbursements matching their customized pay duration cycles (Monthly, 3-Months, 6-Months, etc.).
              </p>
              <div style={{ backgroundColor: 'rgba(197, 160, 89, 0.08)', borderLeft: '4px solid var(--accent-gold-dark)', padding: '1rem', borderRadius: '4px', fontSize: '0.8rem', color: 'var(--text-main)' }}>
                <span style={{ fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Need Adjustments?</span>
                Only Academy Developers or Administrators can modify contract salary values, cycle frequencies, or mark payouts as disimbursed. Please contact the Operations Office if you see a mismatch.
              </div>
            </div>
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
    </div>
  );
};
