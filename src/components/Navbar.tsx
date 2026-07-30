import React from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import type { UserProfile } from '../types';
import { getCampusLabel } from '../types';
import { LogOut, LogIn } from 'lucide-react';

interface NavbarProps {
  userProfile: UserProfile | null;
  onOpenLoginModal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ userProfile, onOpenLoginModal }) => {
  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const campusLabel = userProfile ? getCampusLabel(userProfile.campus, userProfile.role) : '';

  return (
    <nav className="navbar">
      <div className="nav-logo-container">
        <img 
          src="/logo.png?v=4" 
          alt="Cadets Coaching Academy Logo" 
          className="logo-img"
        />
        <div className="nav-title">
          <h1>Cadets Coaching Academy</h1>
          <span>Discipline • Courage • Excellence</span>
        </div>
      </div>

      {userProfile ? (
        <div className="nav-user-info">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{userProfile.displayName}</span>
            <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{userProfile.email}</span>
          </div>
          {campusLabel && (
            <span className="user-badge" style={{ backgroundColor: 'var(--accent-gold)', color: 'var(--primary-navy)', border: '1px solid var(--accent-gold-dark)' }}>
              {campusLabel}
            </span>
          )}
          <span className={`user-badge`}>
            {userProfile.role}
          </span>
          <button onClick={handleLogout} className="btn-logout" title="Sign Out">
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      ) : (
        onOpenLoginModal && (
          <button 
            onClick={onOpenLoginModal} 
            className="btn btn-secondary btn-sm"
            style={{ 
              backgroundColor: 'var(--accent-gold-dark)', 
              color: '#ffffff', 
              border: 'none', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.4rem',
              padding: '0.5rem 1rem',
              fontWeight: 700,
              fontSize: '0.85rem'
            }}
          >
            <LogIn size={16} />
            <span>Portal Login</span>
          </button>
        )
      )}
    </nav>
  );
};

