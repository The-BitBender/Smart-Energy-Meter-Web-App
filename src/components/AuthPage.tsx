import React, { useState } from 'react';
import { 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile,
  signInAnonymously,
  auth, 
  googleProvider 
} from '../lib/firebase';
import { 
  Zap, 
  Lock, 
  Mail, 
  User as UserIcon, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  Cpu, 
  Activity, 
  ArrowRight, 
  AlertCircle,
  Radio,
  CheckCircle2,
  Sparkles
} from 'lucide-react';

interface AuthPageProps {
  onAuthSuccess: (isNewUser?: boolean) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onAuthSuccess }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quick helper to fill demo credentials
  const fillDemoAccount = () => {
    setEmail('demo.operator@voltenergy.io');
    setPassword('VoltPulse2026!');
    setDisplayName('Field Grid Operator');
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      // If user was newly created in this login
      const isNew = result.user.metadata.creationTime === result.user.metadata.lastSignInTime;
      onAuthSuccess(isNew);
    } catch (err: any) {
      console.error('Google Sign-in error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Google sign-in popup was cancelled');
      } else if (err.code === 'auth/popup-blocked') {
        setError('Popup was blocked by your browser. Please allow popups for this site.');
      } else {
        setError(err.message || 'Failed to sign in with Google');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Please provide an email address');
      return;
    }
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (isSignUp) {
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      if (!displayName.trim()) {
        setError('Please provide your name or organization title');
        return;
      }
    }

    setLoading(true);
    try {
      if (isSignUp) {
        const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        if (displayName.trim() && userCredential.user) {
          await updateProfile(userCredential.user, {
            displayName: displayName.trim(),
          });
        }
        onAuthSuccess(true);
      } else {
        await signInWithEmailAndPassword(auth, cleanEmail, password);
        onAuthSuccess(false);
      }
    } catch (err: any) {
      console.error('Email auth error:', err);
      let userFriendlyMessage = err.message || 'Authentication failed';
      if (err.code === 'auth/email-already-in-use') {
        userFriendlyMessage = 'An account with this email already exists. Please sign in instead.';
      } else if (err.code === 'auth/invalid-email') {
        userFriendlyMessage = 'Invalid email address format.';
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        userFriendlyMessage = 'Invalid email or password. Please verify your credentials.';
      } else if (err.code === 'auth/weak-password') {
        userFriendlyMessage = 'Password is too weak. Please use at least 6 characters.';
      }
      setError(userFriendlyMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleTestDrive = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInAnonymously(auth);
      onAuthSuccess(false);
    } catch (err: any) {
      console.error('Anonymous sign-in error:', err);
      setError(err.message || 'Failed to start demo session');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#002b27] text-white flex flex-col justify-between selection:bg-white selection:text-[#005149]">
      {/* Background Subtle Ambience */}
      <div className="fixed inset-0 pointer-events-none opacity-20 bg-[radial-gradient(#008f82_1px,transparent_1px)] [background-size:24px_24px]"></div>

      {/* Top Banner Navigation */}
      <header className="relative z-10 border-b border-white/10 bg-[#003833]/90 backdrop-blur-md px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-white text-[#005149] flex items-center justify-center shadow-lg font-black">
              <Zap className="w-6 h-6 fill-current text-[#005149]" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-xl tracking-tight text-white">VoltPulse</span>
                <span className="bg-white text-[#005149] font-mono text-xs px-2 py-0.5 rounded font-black tracking-wider uppercase">
                  IoT
                </span>
              </div>
              <p className="text-[11px] text-teal-200/90 font-medium tracking-wide uppercase">SMART ENERGY METER</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={fillDemoAccount}
              className="text-xs text-teal-200 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg font-semibold transition-colors hidden sm:flex items-center space-x-1"
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-300" />
              <span>Fill Demo Form</span>
            </button>
            <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#004741] border border-white/15 text-xs text-teal-200 font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Cloud Server Ready</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="relative z-10 flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full flex items-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 w-full items-center">
          
          {/* Left Column: Industrial Product Features Showcase */}
          <div className="lg:col-span-7 space-y-8">
            <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-white/10 border border-white/20 text-xs font-bold text-teal-100">
              <ShieldCheck className="w-4 h-4 text-white" />
              <span>Zero-Trust Industrial IoT Energy Platform</span>
            </div>

            <div className="space-y-4">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight">
                Secure Telemetry, Theft Detection &amp; Grid Metering
              </h1>
              <p className="text-base text-teal-100/90 max-w-xl leading-relaxed">
                Connect physical ESP32 energy meters to monitor real-time Voltage, Current, Active Power, and Reactive Power. Instantly detect bypass tampering, neutral disconnect theft, and trigger remote solid-state circuit trips.
              </p>
            </div>

            {/* Feature Bullets */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-2xl bg-[#003c37] border border-white/15 space-y-2 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-white text-[#005149] flex items-center justify-center font-bold">
                  <Activity className="w-4 h-4 text-[#005149]" />
                </div>
                <h4 className="text-sm font-bold text-white">Sub-Second Telemetry</h4>
                <p className="text-xs text-teal-200 leading-normal">
                  Live streaming of Energy (kWh), Active Power (W), Reactive (VAR), Voltage (V), and Current (A).
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#003c37] border border-white/15 space-y-2 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-white text-[#005149] flex items-center justify-center font-bold">
                  <ShieldCheck className="w-4 h-4 text-[#005149]" />
                </div>
                <h4 className="text-sm font-bold text-white">Anti-Theft AI Shield</h4>
                <p className="text-xs text-teal-200 leading-normal">
                  Detects current bypass, magnetic coil tampering, and automated email alerts to station operators.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#003c37] border border-white/15 space-y-2 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-white text-[#005149] flex items-center justify-center font-bold">
                  <Cpu className="w-4 h-4 text-[#005149]" />
                </div>
                <h4 className="text-sm font-bold text-white">ESP32 Firmware Ready</h4>
                <p className="text-xs text-teal-200 leading-normal">
                  Auto-generate hardware credentials, API keys, and copyable C++ sketch code for your microcontroller.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#003c37] border border-white/15 space-y-2 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-white text-[#005149] flex items-center justify-center font-bold">
                  <Radio className="w-4 h-4 text-[#005149]" />
                </div>
                <h4 className="text-sm font-bold text-white">Remote Relay Breaker</h4>
                <p className="text-xs text-teal-200 leading-normal">
                  Emergency power isolation and load cut-off commands sent over cloud websocket/REST API.
                </p>
              </div>
            </div>

            {/* Testimonial / Telemetry specs badge */}
            <div className="flex items-center space-x-4 p-3.5 rounded-xl bg-white/5 border border-white/10 text-xs text-teal-200">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>Full compliance with standard DIN rail smart meter hardware and cloud database encryption.</span>
            </div>
          </div>

          {/* Right Column: Authentication Card in Teal & White Theme */}
          <div className="lg:col-span-5 w-full">
            <div className="w-full rounded-3xl bg-[#00423c] border-2 border-white/20 shadow-2xl p-6 sm:p-8 backdrop-blur-md">
              
              {/* Card Header & Tab Switcher */}
              <div className="space-y-4">
                <div className="flex rounded-xl bg-[#00302c] p-1 border border-white/15">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSignUp(false);
                      setError(null);
                    }}
                    className={`flex-1 py-2.5 rounded-lg text-xs font-extrabold transition-all text-center ${
                      !isSignUp
                        ? 'bg-white text-[#005149] shadow-md'
                        : 'text-teal-200 hover:text-white'
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSignUp(true);
                      setError(null);
                    }}
                    className={`flex-1 py-2.5 rounded-lg text-xs font-extrabold transition-all text-center ${
                      isSignUp
                        ? 'bg-white text-[#005149] shadow-md'
                        : 'text-teal-200 hover:text-white'
                    }`}
                  >
                    Create Account
                  </button>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-white">
                    {isSignUp ? 'Create your Operator Account' : 'Welcome Back, Operator'}
                  </h3>
                  <p className="text-xs text-teal-200 mt-1">
                    {isSignUp 
                      ? 'Sign up to configure and link your ESP32 energy meter to the cloud'
                      : 'Authenticate to access your live energy meters and telemetry logs'}
                  </p>
                </div>
              </div>

              {/* Error Alert Box */}
              {error && (
                <div className="mt-4 p-3.5 rounded-xl bg-rose-500/20 border border-rose-400/40 text-rose-200 text-xs flex items-start space-x-2 animate-fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* 1-Click Google Sign In */}
              <div className="mt-6">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="w-full flex items-center justify-center space-x-3 py-3 px-4 rounded-xl bg-white hover:bg-teal-50 text-[#005149] font-black text-sm transition-all shadow-md active:scale-[0.98] disabled:opacity-50"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                  <span>Continue with Google</span>
                </button>
              </div>

              {/* Divider */}
              <div className="relative my-6 flex items-center justify-center">
                <div className="border-t border-white/15 w-full"></div>
                <span className="absolute bg-[#00423c] px-3 text-[11px] font-bold text-teal-200 uppercase tracking-wider">
                  or email &amp; password
                </span>
              </div>

              {/* Email / Password Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {isSignUp && (
                  <div>
                    <label className="block text-xs font-bold text-teal-100 uppercase tracking-wide mb-1.5">
                      Operator / Facility Name
                    </label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 text-teal-300 absolute left-3.5 top-3.5 pointer-events-none" />
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="e.g. Samuel Adekunle"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#00342f] border border-white/20 text-white placeholder-teal-300/50 text-sm focus:outline-none focus:border-white focus:ring-1 focus:ring-white transition-all"
                        required={isSignUp}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-teal-100 uppercase tracking-wide mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-teal-300 absolute left-3.5 top-3.5 pointer-events-none" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="operator@voltenergy.io"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#00342f] border border-white/20 text-white placeholder-teal-300/50 text-sm focus:outline-none focus:border-white focus:ring-1 focus:ring-white transition-all"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-teal-100 uppercase tracking-wide mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-teal-300 absolute left-3.5 top-3.5 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-11 py-2.5 rounded-xl bg-[#00342f] border border-white/20 text-white placeholder-teal-300/50 text-sm focus:outline-none focus:border-white focus:ring-1 focus:ring-white transition-all"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-3 text-teal-300 hover:text-white transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {isSignUp && (
                  <div>
                    <label className="block text-xs font-bold text-teal-100 uppercase tracking-wide mb-1.5">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-teal-300 absolute left-3.5 top-3.5 pointer-events-none" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#00342f] border border-white/20 text-white placeholder-teal-300/50 text-sm focus:outline-none focus:border-white focus:ring-1 focus:ring-white transition-all"
                        required={isSignUp}
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 flex items-center justify-center space-x-2 py-3 px-4 rounded-xl bg-white hover:bg-teal-50 text-[#005149] font-black text-sm transition-all shadow-lg active:scale-[0.98] disabled:opacity-50"
                >
                  <span>{loading ? 'Authenticating...' : isSignUp ? 'Sign Up & Configure Meter' : 'Sign In to Dashboard'}</span>
                  <ArrowRight className="w-4 h-4 text-[#005149]" />
                </button>
              </form>

              {/* Direct Quick Demo Mode for immediate evaluation */}
              <div className="mt-6 pt-5 border-t border-white/10 text-center space-y-2">
                <p className="text-[11px] text-teal-200">Evaluating or running a rapid hardware field test?</p>
                <button
                  type="button"
                  onClick={handleTestDrive}
                  disabled={loading}
                  className="inline-flex items-center space-x-1.5 text-xs text-white hover:text-teal-100 font-bold underline underline-offset-4 transition-colors"
                >
                  <Cpu className="w-3.5 h-3.5 text-teal-200" />
                  <span>Enter Quick Test-Drive Demo Mode</span>
                </button>
              </div>

            </div>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 bg-[#00221f] py-4 text-center text-xs text-teal-300 font-mono">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>VoltPulse IoT • Hardware-to-Cloud Smart Grid Protection Platform</div>
          <div>Protected by Firebase Authentication &amp; TLS 1.3 Encryption</div>
        </div>
      </footer>
    </div>
  );
};
