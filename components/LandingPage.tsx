import React, { useState, useEffect } from 'react';
import { ArrowRight, Monitor, Zap, Layout, Moon, Sun } from 'lucide-react';

interface LandingPageProps {
  onStart: (mode: 'login' | 'register') => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onStart, theme, toggleTheme }) => {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const phrases = [
    "просто.",
    "быстро.",
    "эффективно.",
    "для людей."
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setPhraseIndex((prev) => (prev + 1) % phrases.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900 relative overflow-hidden dark:bg-slate-950 dark:text-white transition-colors duration-300">
        
      {/* Abstract Background Shapes */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
         <div className="absolute -top-20 -right-20 w-96 h-96 bg-indigo-100 rounded-full blur-3xl opacity-50 dark:bg-indigo-900 dark:opacity-20 transition-colors duration-300"></div>
         <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-50 rounded-full blur-3xl opacity-60 dark:bg-blue-950 dark:opacity-20 transition-colors duration-300"></div>
      </div>

      {/* Header */}
      <header className="relative z-10 container mx-auto px-6 py-8 flex justify-between items-center">
        <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">С</span>
            </div>
            <span className="text-2xl font-bold tracking-tight text-indigo-950 dark:text-white">Стоя</span>
        </div>
        <div className="flex items-center space-x-6">
            <button 
                onClick={toggleTheme}
                className="p-2 text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 transition-colors rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                title="Сменить тему"
            >
                {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>
            <button 
              onClick={() => onStart('login')}
              className="text-sm font-semibold text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 transition-colors">
              Вход
            </button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 flex-grow flex flex-col justify-center items-center text-center px-4">
        <h1 className="text-5xl md:text-7xl font-extrabold text-slate-900 mb-6 tracking-tight dark:text-white">
          Запуск рекламы — это <br />
          <span className="text-indigo-600 inline-block min-w-[300px] transition-all duration-500 dark:text-indigo-400">
            {phrases[phraseIndex]}
          </span>
        </h1>
        
        <p className="text-lg md:text-xl text-slate-500 max-w-2xl mb-10 leading-relaxed dark:text-slate-400">
          Управляйте экранами, загружайте контент и проходите модерацию за секунды с помощью ИИ.
        </p>

        <button
          onClick={() => onStart('register')}
          className="group relative inline-flex items-center justify-center px-8 py-4 text-lg font-bold text-white transition-all duration-200 bg-indigo-600 rounded-full hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-600 dark:hover:shadow-indigo-900 dark:bg-indigo-600 dark:hover:bg-indigo-500"
        >
          <span>Запустить рекламу</span>
          <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </button>

        {/* Feature Grid */}
        <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto text-left">
            <div className="p-6 bg-white/50 backdrop-blur-sm border border-slate-100 rounded-2xl hover:shadow-md transition-shadow dark:bg-slate-900/50 dark:border-slate-800">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                    <Monitor className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-2 dark:text-slate-100">Выбор экранов</h3>
                <p className="text-slate-500 dark:text-slate-400">Удобный выбор локаций и цифровых поверхностей по всему городу.</p>
            </div>
            <div className="p-6 bg-white/50 backdrop-blur-sm border border-slate-100 rounded-2xl hover:shadow-md transition-shadow dark:bg-slate-900/50 dark:border-slate-800">
                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-4 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                    <Zap className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-2 dark:text-slate-100">ИИ Модерация</h3>
                <p className="text-slate-500 dark:text-slate-400">Автоматическая проверка фото и видео на цензуру перед отправкой.</p>
            </div>
            <div className="p-6 bg-white/50 backdrop-blur-sm border border-slate-100 rounded-2xl hover:shadow-md transition-shadow dark:bg-slate-900/50 dark:border-slate-800">
                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center mb-4 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                    <Layout className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-2 dark:text-slate-100">Простота</h3>
                <p className="text-slate-500 dark:text-slate-400">Никаких сложных настроек. Загрузил, проверил, запустил.</p>
            </div>
        </div>
      </main>

      <footer className="relative z-10 py-6 text-center text-slate-400 text-sm dark:text-slate-600">
        &copy; {new Date().getFullYear()} Стоя. Все права защищены.
      </footer>
    </div>
  );
};

export default LandingPage;