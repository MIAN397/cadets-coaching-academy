import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import type { UserProfile } from './types';
import { Navbar } from './components/Navbar';
import { Login } from './components/Login';
import { DeveloperDashboard } from './components/DeveloperDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { TeacherDashboard } from './components/TeacherDashboard';
import { StudentDashboard } from './components/StudentDashboard';
import { Award, ShieldAlert } from 'lucide-react';

function App() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthLoading(true);
      setCurrentUser(user);
      setError(null);

      if (user) {
        setRoleLoading(true);
        try {
          // Fetch user profile from Firestore to get their RBAC role
          const userDocRef = doc(db, 'users', user.email!.toLowerCase());
          let userDocSnap = await getDoc(userDocRef);

          const lowercaseEmail = user.email!.toLowerCase();
          const demoRoles: Record<string, string> = {
            'developer@cadetacademy.com': 'developer',
            'admin@cadetacademy.com': 'admin',
            'teacher@cadetacademy.com': 'teacher',
            'student@cadetacademy.com': 'student',
            'admin_girls@cadetacademy.com': 'admin',
            'teacher_girls@cadetacademy.com': 'teacher',
            'student_girls@cadetacademy.com': 'student'
          };

          if ((!userDocSnap.exists() || !userDocSnap.data()?.role) && lowercaseEmail in demoRoles) {
            const role = demoRoles[lowercaseEmail];
            const existingData = userDocSnap.exists() ? userDocSnap.data() : {};
            const campus = lowercaseEmail.includes('_girls') ? 'girls' : (role === 'developer' ? undefined : 'boys');
            const profileData: any = {
              ...existingData,
              uid: user.uid,
              email: lowercaseEmail,
              displayName: existingData.displayName || `Demo ${role.charAt(0).toUpperCase() + role.slice(1)}${campus ? ' (' + (campus === 'boys' ? 'Boys' : 'Girls') + ')' : ''}`,
              role: role,
              campus: campus,
              createdAt: existingData.createdAt || serverTimestamp()
            };
            if (role === 'student' && !existingData.registrationDetails) {
              profileData.registrationDetails = {
                cadetNumber: lowercaseEmail.includes('_girls') ? "Cadet-200" : "Cadet-100",
                batch: "Batch 2026",
                physicalGroup: "Group A",
                phone: "+92 300 0000000"
              };
            } else if (role === 'teacher' && !existingData.teacherDetails) {
              profileData.teacherDetails = {
                subject: "General Tactics",
                phone: "+92 300 0000000"
              };
            }
            // Bootstrap developer/admin/teacher/student profile on the fly in App.tsx
            await setDoc(userDocRef, profileData);
            // Re-fetch the newly created profile snapshot
            userDocSnap = await getDoc(userDocRef);
          }

          if (userDocSnap.exists()) {
            setUserProfile(userDocSnap.data() as UserProfile);
          } else {
            // Profile document doesn't exist
            setError("Your user profile is missing from the academy database. Please contact the administrator.");
            setUserProfile(null);
          }
        } catch (err: any) {
          console.error("Error loading user profile:", err);
          setError("Failed to verify access permissions: " + err.message);
          setUserProfile(null);
        } finally {
          setRoleLoading(false);
        }
      } else {
        setUserProfile(null);
        setRoleLoading(false);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Render Loader
  if (authLoading || roleLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center', backgroundColor: 'var(--bg-slate)', color: 'var(--primary-navy)' }}>
        <div style={{ display: 'flex', padding: '15px', borderRadius: '50%', backgroundColor: 'rgba(61, 75, 38, 0.1)', color: 'var(--secondary-olive)', marginBottom: '15px', animation: 'bounce 1s infinite' }}>
          <Award size={48} />
        </div>
        <h2 style={{ textTransform: 'uppercase', fontSize: '1.2rem', fontWeight: 800, letterSpacing: '0.05em' }}>
          CCA Portal Security Check
        </h2>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-light)', marginTop: '5px' }}>
          Authenticating access credentials...
        </span>
      </div>
    );
  }

  // Render Portal Error Page (e.g. Auth exists but Profile missing)
  if (error && currentUser) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center', backgroundColor: 'var(--bg-slate)', padding: '2rem' }}>
        <Navbar userProfile={null} />
        <div className="login-card fade-in" style={{ textAlign: 'center', borderTopColor: 'var(--danger)' }}>
          <div style={{ display: 'inline-flex', padding: '10px', borderRadius: '50%', backgroundColor: 'rgba(185, 28, 28, 0.1)', color: 'var(--danger)', marginBottom: '10px' }}>
            <ShieldAlert size={36} />
          </div>
          <h2 style={{ color: 'var(--danger)' }}>Security Alert</h2>
          <p style={{ margin: '1rem 0', fontSize: '0.95rem' }}>{error}</p>
          <button onClick={() => auth.signOut()} className="btn btn-danger">
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // Render Login Portal
  if (!currentUser) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Navbar userProfile={null} />
        <Login />
      </div>
    );
  }

  // Render Authenticated Dashboard based on User Role
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Navbar userProfile={userProfile} />
      
      <main className="container fade-in">
        {userProfile ? (
          <div>
            {userProfile.role === 'developer' && (
              <DeveloperDashboard developerUid={userProfile.uid} developerEmail={userProfile.email} />
            )}
            {userProfile.role === 'admin' && (
              <AdminDashboard adminUid={userProfile.uid} adminProfile={userProfile} />
            )}
            {userProfile.role === 'teacher' && (
              <TeacherDashboard 
                teacherUid={userProfile.uid} 
                teacherEmail={userProfile.email} 
                teacherProfile={userProfile} 
              />
            )}
            {userProfile.role === 'student' && (
              <StudentDashboard studentProfile={userProfile} />
            )}
          </div>
        ) : (
          <div className="alert alert-danger">
            <ShieldAlert size={18} />
            <span>Unauthorized Access. No role mapping found.</span>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
