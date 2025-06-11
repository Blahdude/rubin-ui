import React, { useState } from 'react';
import { auth } from '../lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    
    try {
      await signInWithEmailAndPassword(auth, email, password);
      console.log('User logged in successfully');
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unknown error occurred.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-background/95 backdrop-blur-3xl text-foreground draggable overflow-hidden">
      {/* Enhanced background with multiple layers */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background/98 to-background/95 pointer-events-none"></div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.1),transparent)] pointer-events-none"></div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_80%_120%,rgba(120,119,198,0.06),transparent)] pointer-events-none"></div>
      
      {/* Subtle animated grid pattern */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
        <div className="absolute inset-0 animate-pulse-slow" style={{
          backgroundImage: `
            linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '20px 20px'
        }}></div>
      </div>

      {/* Floating elements for visual interest */}
      <div className="absolute top-20 left-20 w-2 h-2 bg-primary/20 rounded-full animate-bounce-subtle" style={{animationDelay: '0s'}}></div>
      <div className="absolute top-40 right-32 w-1.5 h-1.5 bg-primary/30 rounded-full animate-bounce-subtle" style={{animationDelay: '2s'}}></div>
      <div className="absolute bottom-32 left-40 w-1 h-1 bg-primary/25 rounded-full animate-bounce-subtle" style={{animationDelay: '4s'}}></div>
      
      {/* Main login container */}
      <div className="relative z-10 w-full max-w-md animate-scale-in non-draggable">
        <div className="panel-cursor p-8">
          {/* Header section with enhanced branding */}
          <div className="text-center mb-8 space-y-4">
            {/* Logo with glow effect */}
            <div className="inline-flex items-center justify-center relative group mb-4">
              <div className="w-16 h-16 bg-gradient-to-br from-primary via-primary/90 to-primary/80 rounded-xl flex items-center justify-center shadow-cursor-lg transition-all duration-300 group-hover:shadow-glow group-hover:scale-105">
                <span className="text-primary-foreground font-bold text-2xl">R</span>
              </div>
              <div className="absolute inset-0 w-16 h-16 bg-gradient-to-br from-primary/30 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 animate-glow"></div>
            </div>
            
            {/* App title and subtitle */}
            <div className="space-y-2">
              <h1 className="text-3xl font-bold text-gradient-animated bg-gradient-to-r from-primary via-primary/90 to-primary bg-[length:200%_100%]">
                Welcome to Rubin
              </h1>
              <p className="text-muted-foreground text-sm">
                Your AI-powered coding and creative assistant
              </p>
            </div>
          </div>

          {/* Login form with enhanced styling */}
          <form onSubmit={handleLogin} className="space-y-6">
            {/* Email field */}
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-semibold text-foreground block">
                Email Address
              </label>
              <div className="relative">
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-cursor w-full pl-4 pr-12"
                  placeholder="Enter your email"
                  required
                  disabled={isLoading}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                </div>
              </div>
            </div>

            {/* Password field */}
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-semibold text-foreground block">
                Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-cursor w-full pl-4 pr-12"
                  placeholder="Enter your password"
                  required
                  disabled={isLoading}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <circle cx="12" cy="16" r="1"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
              </div>
            </div>

            {/* Error message with enhanced styling */}
            {error && (
              <div className="flex items-center gap-3 p-3 bg-error/10 border border-error/20 rounded-lg animate-slide-up">
                <div className="w-4 h-4 text-error shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="15" y1="9" x2="9" y2="15"/>
                    <line x1="9" y1="9" x2="15" y2="15"/>
                  </svg>
                </div>
                <p className="text-sm text-error font-medium">{error}</p>
              </div>
            )}

            {/* Login button with enhanced states */}
            <button
              type="submit"
              disabled={isLoading}
              className={`btn-primary w-full py-3 px-6 font-semibold transition-all duration-200 ${
                isLoading 
                  ? 'opacity-75 cursor-not-allowed' 
                  : 'hover:scale-[1.02] active:scale-[0.98]'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                      <polyline points="10,17 15,12 10,7"/>
                      <line x1="15" y1="12" x2="3" y2="12"/>
                    </svg>
                  </>
                )}
              </div>
            </button>
          </form>

          {/* Footer section */}
          <div className="mt-8 pt-6 border-t border-border/30">
            <div className="text-center space-y-3">
              <p className="text-xs text-muted-foreground">
                Secure authentication powered by Firebase
              </p>
              <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-success rounded-full"></div>
                  Encrypted
                </span>
                <span className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-primary rounded-full"></div>
                  Secure
                </span>
                <span className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-warning rounded-full"></div>
                  Private
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage; 