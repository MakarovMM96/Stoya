import React, { useState, useEffect } from 'react';
import { X, Loader2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { User } from '../types';
import { registerClient, authenticateUser } from '../services/yandexService';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (user: User) => void;
  initialIsRegistering?: boolean;
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onLogin, initialIsRegistering = true }) => {
  const [isRegistering, setIsRegistering] = useState(initialIsRegistering);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Reset state when modal opens or initial mode changes
  useEffect(() => {
    if (isOpen) {
      setIsRegistering(initialIsRegistering);
      setError('');
      setPassword('');
      // We don't clear email intentionally as user might have closed accidentally
    }
  }, [isOpen, initialIsRegistering]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
        let user: User;
        if (isRegistering) {
            user = await registerClient(email, password);
        } else {
            user = await authenticateUser(email, password);
        }
        
        onLogin(user);
        onClose();
    } catch (err: any) {
        setError(err.message || "Произошла ошибка");
    } finally {
        setLoading(false);
    }
  };

  const toggleMode = () => {
      setIsRegistering(!isRegistering);
      setError('');
      setPassword('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-[fadeIn_0.3s_ease-out] dark:bg-slate-800 dark:shadow-none">
        <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">
            {isRegistering ? 'Регистрация' : 'Вход'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
              <div className="flex items-center p-3 text-sm text-red-800 bg-red-50 rounded-lg border border-red-200 dark:bg-red-900/30 dark:text-red-200 dark:border-red-900">
                  <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                  <span>{error}</span>
              </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 bg-white rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all dark:bg-slate-900 dark:border-slate-700 dark:text-white dark:focus:ring-indigo-400"
              placeholder="example@mail.ru"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">Пароль</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 bg-white rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all pr-10 dark:bg-slate-900 dark:border-slate-700 dark:text-white dark:focus:ring-indigo-400"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center disabled:opacity-70"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              isRegistering ? 'Создать аккаунт' : 'Войти'
            )}
          </button>
        </form>

        <div className="p-4 bg-slate-50 text-center text-sm text-slate-600 dark:bg-slate-700 dark:text-slate-300">
          {isRegistering ? 'Уже есть аккаунт? ' : 'Нет аккаунта? '}
          <button
            onClick={toggleMode}
            className="text-indigo-600 font-semibold hover:underline dark:text-indigo-400"
          >
            {isRegistering ? 'Войти' : 'Зарегистрироваться'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;