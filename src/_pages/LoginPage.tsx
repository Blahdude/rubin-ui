import React, { useState } from 'react';
import { auth } from '../lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Handle successful login, e.g., redirect to the main app
      console.log('User logged in');
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unknown error occurred.');
      }
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-background text-foreground">
      <div className="w-full max-w-md p-8 space-y-8 bg-card border border-border rounded-lg shadow-lg">
        <h2 className="text-2xl font-bold text-center text-card-foreground">Login</h2>
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label htmlFor="email" className="text-sm font-bold text-muted-foreground">
              Email
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 mt-2 text-foreground bg-input border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="text-sm font-bold text-muted-foreground"
            >
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 mt-2 text-foreground bg-input border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </div>
          {error && <p className="text-sm text-foreground">{error}</p>}
          <button
            type="submit"
            className="w-full p-3 font-bold text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background focus:ring-ring"
          >
            Login
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage; 