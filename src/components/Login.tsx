import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updatePassword } from 'firebase/auth';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { Shield, AlertCircle } from 'lucide-react';
import type { UserProfile } from '../types';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    if (!email || !password) {
      setError("Please fill in both Email and Password.");
      setLoading(false);
      return;
    }

    const lowerEmail = email.trim().toLowerCase();
    const internalAuthPass = "cca_system_secure_pass_2026";

    try {
      // 1. Fetch user profile from Firestore first to verify password
      const profileDocRef = doc(db, 'users', lowerEmail);
      const profileDocSnap = await getDoc(profileDocRef);
      
      const isDemo = [
        'developer@cadetacademy.com',
        'admin@cadetacademy.com',
        'teacher@cadetacademy.com',
        'student@cadetacademy.com',
        'admin_girls@cadetacademy.com',
        'teacher_girls@cadetacademy.com',
        'student_girls@cadetacademy.com'
      ].includes(lowerEmail);

      if (!profileDocSnap.exists() && !isDemo) {
        throw new Error("This email is not registered in the academy database. Please contact your administrator to set up your profile.");
      }

      const profile = profileDocSnap.exists() ? (profileDocSnap.data() as UserProfile) : null;
      if (profile && profile.password && profile.password !== password) {
        throw new Error("Incorrect password or authentication error. Please try again.");
      }

      // 2. Authenticate with Firebase Auth using the unified internal password
      try {
        await signInWithEmailAndPassword(auth, lowerEmail, internalAuthPass);
        
        // Update UID in Firestore if missing
        if (profile && !profile.uid) {
          await updateDoc(profileDocRef, { uid: auth.currentUser?.uid || "" });
        }
      } catch (authErr: any) {
        // Auth user doesn't exist or is using their old custom password
        try {
          // Migration check: Try to sign in with their entered password first
          await signInWithEmailAndPassword(auth, lowerEmail, password);
          // Succeeded! Migrate Auth password to our unified internal one
          if (auth.currentUser) {
            await updatePassword(auth.currentUser, internalAuthPass);
            if (profile && !profile.uid) {
              await updateDoc(profileDocRef, { uid: auth.currentUser.uid });
            }
          }
        } catch (migrateErr: any) {
          // If migration sign-in fails, it means the Auth user doesn't exist yet. Create them.
          try {
            const userCredential = await createUserWithEmailAndPassword(auth, lowerEmail, internalAuthPass);
            const user = userCredential.user;

            if (profile) {
              await updateDoc(profileDocRef, { 
                uid: user.uid,
                password: password // Keep user's actual password in Firestore
              });
              setInfo("First-time sign-in successful! Your academy profile has been activated.");
            } else if (isDemo) {
              // Self-bootstrap demo account
              const demoRoles: Record<string, string> = {
                'developer@cadetacademy.com': 'developer',
                'admin@cadetacademy.com': 'admin',
                'teacher@cadetacademy.com': 'teacher',
                'student@cadetacademy.com': 'student',
                'admin_girls@cadetacademy.com': 'admin',
                'teacher_girls@cadetacademy.com': 'teacher',
                'student_girls@cadetacademy.com': 'student'
              };
              const role = demoRoles[lowerEmail];
              const campus = lowerEmail.includes('_girls') ? 'girls' : (role === 'developer' ? undefined : 'boys');
              const profileData: any = {
                uid: user.uid,
                email: lowerEmail,
                displayName: `Demo ${role.charAt(0).toUpperCase() + role.slice(1)}${campus ? ' (' + (campus === 'boys' ? 'Boys' : 'Girls') + ')' : ''}`,
                role: role,
                campus: campus,
                password: password,
                createdAt: serverTimestamp()
              };
              if (role === 'student') {
                profileData.registrationDetails = {
                  cadetNumber: lowerEmail.includes('_girls') ? "Cadet-200" : "Cadet-100",
                  batch: "Batch 2026",
                  physicalGroup: "Group A",
                  phone: "+92 300 0000000"
                };
              } else if (role === 'teacher') {
                profileData.teacherDetails = {
                  subject: "General Tactics",
                  phone: "+92 300 0000000"
                };
              }
              await setDoc(profileDocRef, profileData);
              setInfo(`${role.charAt(0).toUpperCase() + role.slice(1)} account activated! Profile bootstrapped successfully.`);
            }
          } catch (createErr: any) {
            throw new Error("Incorrect password or authentication error. Please try again.");
          }
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper fade-in" style={{ position: 'relative', overflow: 'hidden' }}>
      <div className="bg-glow-circle circle-1"></div>
      <div className="bg-glow-circle circle-2"></div>
      <div className="bg-glow-circle circle-3"></div>
      <div className="login-card glass-card" style={{ zIndex: 1, position: 'relative' }}>
        <div className="login-header">
          <img 
            src="/logo.png?v=3" 
            alt="Cadets Coaching Academy Logo" 
            className="login-logo-img" 
          />
          <h2>Cadets Coaching Academy</h2>
          <p>Portal Access Center</p>
        </div>

        {error && (
          <div className="alert alert-danger">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {info && (
          <div className="alert alert-success">
            <Shield size={18} />
            <span>{info}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-group">
            <label>Email Address</label>
            <input 
              type="email" 
              placeholder="e.g. cadet.name@cadetacademy.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input 
              type="password" 
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginTop: '2px' }}>
              Note: If logging in for the first time, your password will be saved as your permanent password.
            </span>
          </div>

          <button type="submit" className="btn btn-secondary" disabled={loading} style={{ marginTop: '0.5rem' }}>
            {loading ? 'Authenticating...' : 'Authenticate Access'}
          </button>
        </form>
      </div>
    </div>
  );
};
