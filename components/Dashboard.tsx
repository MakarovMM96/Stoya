import React, { useEffect, useState, useRef } from 'react';
import { ScreenFolder, MediaFile, ModerationStatus, User } from '../types';
import { getScreenFolders, uploadMediaToModerator, getScreenStats, deleteResource, fetchModeratorContents, fetchScreenContents } from '../services/yandexService';
import { analyzeMediaSafety } from '../services/geminiService';
import { Monitor, UploadCloud, CheckCircle, AlertTriangle, XCircle, Loader2, Image as ImageIcon, Zap, RefreshCw, Trash2, AlertCircle, Clock, Calendar, Moon, Sun } from 'lucide-react';

interface DashboardProps {
  user: User;
  onLogout: () => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

// Extended status for UI
enum FileStatus {
    NONE = 'NONE',
    MODERATION = 'MODERATION', // In Moderator Folder
    ACTIVE = 'ACTIVE',         // In Screen Folder (Passed)
    REJECTED = 'REJECTED'      // In Neither, but expected (Failed)
}

const Dashboard: React.FC<DashboardProps> = ({ user, onLogout, theme, toggleTheme }) => {
  const [screens, setScreens] = useState<ScreenFolder[]>([]);
  const [loadingScreens, setLoadingScreens] = useState(true);
  const [selectedScreen, setSelectedScreen] = useState<ScreenFolder | null>(null);
  
  // Stats: Global Counts and My Files (Initial Load)
  const [screenStats, setScreenStats] = useState<{
      globalCounts: Map<number, number>;
      userFiles: Map<number, {name: string, path: string}[]>;
  }>({ globalCounts: new Map(), userFiles: new Map() });
  
  const [file, setFile] = useState<MediaFile | null>(null);
  const [status, setStatus] = useState<ModerationStatus>(ModerationStatus.IDLE);
  const [statusMessage, setStatusMessage] = useState('');
  const [deletingPath, setDeletingPath] = useState<string | null>(null);

  // Real-time Status Tracking
  const [fileStatus, setFileStatus] = useState<FileStatus>(FileStatus.NONE);
  const [trackedFile, setTrackedFile] = useState<{name: string, path: string} | null>(null);
  const pollingInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Delete Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<{path: string, name: string} | null>(null);

  // Initial Data Fetch
  const refreshData = async () => {
    if (screens.length === 0) setLoadingScreens(true);
    try {
        const [folders, stats] = await Promise.all([
            getScreenFolders(),
            getScreenStats(user.id)
        ]);
        setScreens(folders);
        setScreenStats(stats);
    } catch (e) {
        console.error("Error refreshing data:", e);
    } finally {
        setLoadingScreens(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, [user.id]);

  // Reset state when screen changes and start polling
  useEffect(() => {
    if (selectedScreen) {
        setFile(null);
        setStatus(ModerationStatus.IDLE);
        setStatusMessage('');
        setFileStatus(FileStatus.NONE);
        setTrackedFile(null);

        checkFileStatus(selectedScreen.screenId);
        
        // Start polling
        if (pollingInterval.current) clearInterval(pollingInterval.current);
        pollingInterval.current = setInterval(() => {
            checkFileStatus(selectedScreen.screenId);
        }, 5000);
    } else {
        if (pollingInterval.current) clearInterval(pollingInterval.current);
    }

    return () => {
        if (pollingInterval.current) clearInterval(pollingInterval.current);
    }
  }, [selectedScreen]);

  // Logic to check where the user's file is
  const checkFileStatus = async (screenId: number) => {
      const storageKey = `stoya_upload_${user.id}_${screenId}`;
      const lastUploadedFilename = localStorage.getItem(storageKey);

      // 1. Fetch contents of both folders
      const [modFiles, screenFiles] = await Promise.all([
          fetchModeratorContents(),
          fetchScreenContents(screenId)
      ]);

      // 2. Search for user's file
      // Priority: exact match on filename if we have it, else loose match on UserID
      let foundInScreen = null;
      let foundInMod = null;

      const findFile = (list: any[]) => {
          if (lastUploadedFilename) {
              return list.find((f: any) => f.name === lastUploadedFilename);
          }
          return list.find((f: any) => f.name.includes(`_User${user.id}_`) && f.name.includes(`Screen${screenId}_`));
      };

      foundInScreen = findFile(screenFiles);
      foundInMod = findFile(modFiles);

      // 3. Determine Status
      if (foundInScreen) {
          setFileStatus(FileStatus.ACTIVE);
          setTrackedFile({ name: foundInScreen.name, path: foundInScreen.path });
      } else if (foundInMod) {
          setFileStatus(FileStatus.MODERATION);
          setTrackedFile({ name: foundInMod.name, path: foundInMod.path });
      } else if (lastUploadedFilename) {
          // We expected a file (localStorage says so), but it's gone.
          setFileStatus(FileStatus.REJECTED);
          setTrackedFile(null);
      } else {
          setFileStatus(FileStatus.NONE);
          setTrackedFile(null);
      }
      
      // Update counts for UI
      // This is a simplified local update to ensure the count reflects reality in Detail View
      // Note: This doesn't update the main grid counts until full refresh
  };

  const getRemainingDays = (filename: string): number | null => {
      // Format: ScreenID_UserID_Timestamp_...
      // Regex to find the timestamp (digits between underscores)
      const match = filename.match(/_User[a-zA-Z0-9]+_(\d+)_/);
      if (match && match[1]) {
          const uploadTime = parseInt(match[1], 10);
          const days30 = 30 * 24 * 60 * 60 * 1000;
          const endTime = uploadTime + days30;
          const timeLeft = endTime - Date.now();
          const daysLeft = Math.ceil(timeLeft / (24 * 60 * 60 * 1000));
          return daysLeft > 0 ? daysLeft : 0;
      }
      return null;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      
      const isVideo = selectedFile.type.startsWith('video/');
      const isImage = selectedFile.type.startsWith('image/');

      if (!isVideo && !isImage) {
        setStatus(ModerationStatus.ERROR);
        setStatusMessage('Поддерживаются только фото и видео.');
        return;
      }

      if (isVideo) {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
          window.URL.revokeObjectURL(video.src);
          if (video.duration > 15) {
            setStatus(ModerationStatus.ERROR);
            setStatusMessage('Длительность видео не должна превышать 15 секунд.');
            setFile(null);
          } else {
             proceedWithFile(selectedFile, 'video');
          }
        };
        video.onerror = () => {
            setStatus(ModerationStatus.ERROR);
            setStatusMessage('Ошибка чтения видеофайла.');
        }
        video.src = URL.createObjectURL(selectedFile);
      } else {
        proceedWithFile(selectedFile, 'image');
      }
    }
  };

  const proceedWithFile = (f: File, type: 'image' | 'video') => {
    setFile({
        file: f,
        previewUrl: URL.createObjectURL(f),
        type
    });
    setStatus(ModerationStatus.IDLE);
    setStatusMessage('');
  };

  const handleProcess = async () => {
    if (!file || !selectedScreen) return;

    setStatus(ModerationStatus.ANALYZING);
    setStatusMessage('ИИ проверяет контент на безопасность...');
    
    const analysis = await analyzeMediaSafety(file.file);

    if (!analysis.safe) {
        setStatus(ModerationStatus.REJECTED);
        setStatusMessage(`Отклонено ИИ: ${analysis.reason}`);
        return;
    }

    setStatus(ModerationStatus.APPROVED);
    setStatusMessage('Проверка пройдена! Загрузка на сервер...');

    setStatus(ModerationStatus.UPLOADING);
    const uploadedFileName = await uploadMediaToModerator(file.file, selectedScreen.screenId, user.id);

    if (uploadedFileName) {
        setStatus(ModerationStatus.COMPLETED);
        setStatusMessage('Файл успешно загружен.');
        
        // Save to local storage to track status
        localStorage.setItem(`stoya_upload_${user.id}_${selectedScreen.screenId}`, uploadedFileName);
        
        // Trigger immediate check
        await checkFileStatus(selectedScreen.screenId);
    } else {
        setStatus(ModerationStatus.ERROR);
        setStatusMessage('Ошибка при загрузке на Яндекс.Диск.');
    }
  };

  const initiateDelete = (file: {path: string, name: string}) => {
      setFileToDelete(file);
      setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
      if (!fileToDelete) return;
      
      const path = fileToDelete.path;
      setDeletingPath(path);
      setIsDeleteModalOpen(false);
      setFileToDelete(null);

      const success = await deleteResource(path);
      
      if (success) {
          // Clear local tracking
          if (selectedScreen) {
              localStorage.removeItem(`stoya_upload_${user.id}_${selectedScreen.screenId}`);
          }
          await refreshData();
          if (selectedScreen) await checkFileStatus(selectedScreen.screenId);
      } else {
          alert("Не удалось удалить файл");
      }
      setDeletingPath(null);
  };

  const handleResetUpload = () => {
      if (selectedScreen) {
          localStorage.removeItem(`stoya_upload_${user.id}_${selectedScreen.screenId}`);
          setFileStatus(FileStatus.NONE);
          setFile(null);
          setStatus(ModerationStatus.IDLE);
      }
  };

  const returnToScreens = () => {
    setSelectedScreen(null);
    setFile(null);
    setStatus(ModerationStatus.IDLE);
    setStatusMessage('');
  };

  // Helpers for current selected screen
  const currentGlobalCount = selectedScreen ? (screenStats.globalCounts.get(selectedScreen.screenId) || 0) : 0;
  const isScreenFull = currentGlobalCount >= 20;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col dark:bg-slate-950 transition-colors duration-300">
      {/* Nav */}
      <nav className="bg-white shadow-sm border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-30 dark:bg-slate-900 dark:border-slate-800">
        <div className="flex items-center space-x-2">
           <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">С</span>
            </div>
            <h1 className="text-xl font-bold text-slate-800 hidden md:block dark:text-white">Stoya</h1>
        </div>
        <div className="flex items-center space-x-4">
            <button 
                onClick={toggleTheme}
                className="p-2 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                title="Сменить тему"
            >
                {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>
            <span className="text-sm text-slate-500 dark:text-slate-400">{user.email}</span>
            <button onClick={onLogout} className="text-sm font-medium text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300">Выйти</button>
        </div>
      </nav>

      <main className="flex-grow container mx-auto px-4 py-8">
        
        {/* Screen Selection */}
        {!selectedScreen ? (
          <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Выберите экран</h2>
                <button onClick={refreshData} className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" title="Обновить список">
                    <RefreshCw className={`w-5 h-5 ${loadingScreens ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {loadingScreens ? (
              <div className="flex justify-center items-center h-64">
                <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
              </div>
            ) : screens.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-300 dark:bg-slate-900 dark:border-slate-700">
                 <Monitor className="w-12 h-12 text-slate-300 mx-auto mb-4 dark:text-slate-600" />
                 <p className="text-slate-500 dark:text-slate-400">Папки экранов не найдены в Яндекс.Диске.</p>
                 <p className="text-sm text-slate-400 mt-2 dark:text-slate-500">Ожидаемый путь: /Приложения/Стоя/Мой проект/Экран X</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {screens.map((screen) => {
                  const count = screenStats.globalCounts.get(screen.screenId) || 0;
                  const isFull = count >= 20;
                  
                  return (
                    <button
                      key={screen.screenId}
                      onClick={() => setSelectedScreen(screen)}
                      className={`group relative p-6 rounded-2xl border shadow-sm transition-all duration-300 text-left flex flex-col h-full ${
                        isFull 
                        ? 'bg-slate-50 border-slate-200 cursor-pointer dark:bg-slate-900 dark:border-slate-700' 
                        : 'bg-white border-slate-200 hover:shadow-xl hover:border-indigo-200 cursor-pointer dark:bg-slate-900 dark:border-slate-800 dark:hover:border-indigo-800 dark:hover:shadow-none'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-4 w-full">
                          <div className={`p-3 rounded-xl transition-colors ${
                              isFull ? 'bg-slate-200 dark:bg-slate-800' : 'bg-indigo-50 group-hover:bg-indigo-100 dark:bg-indigo-900/30 dark:group-hover:bg-indigo-900/50'
                          }`}>
                              <Monitor className={`w-8 h-8 ${isFull ? 'text-slate-500 dark:text-slate-500' : 'text-indigo-600 dark:text-indigo-400'}`} />
                          </div>
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                              isFull ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                          }`}>
                              {count} / 20
                          </span>
                      </div>
                      
                      <h3 className="text-lg font-bold text-slate-900 mb-1 dark:text-white">{screen.name}</h3>
                      
                      <div className="mt-auto pt-2">
                          {isFull ? (
                             <span className="text-red-500 text-sm font-bold flex items-center dark:text-red-400">
                                 <AlertCircle className="w-4 h-4 mr-1" />
                                 Экран укомплектован
                             </span>
                          ) : (
                             <span className="text-green-600 text-sm font-medium dark:text-green-400">
                                 Доступно слотов: {20 - count}
                             </span>
                          )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Screen Detail View */
          <div className="max-w-4xl mx-auto">
             <button 
                onClick={returnToScreens}
                className="mb-6 text-slate-500 hover:text-indigo-600 flex items-center text-sm font-medium dark:text-slate-400 dark:hover:text-indigo-400"
             >
                 ← Вернуться к списку
             </button>

             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Left Column: Upload / Status */}
                <div className="md:col-span-2 space-y-6">
                    
                    {/* Upload Card */}
                    <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
                        <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center dark:bg-slate-800 dark:border-slate-700">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white">{selectedScreen.name}</h2>
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    Загружено всего: <span className="font-semibold text-slate-700 dark:text-slate-300">{currentGlobalCount} / 20</span>
                                </p>
                            </div>
                            {isScreenFull && (
                                <div className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-xs font-bold dark:bg-red-900/30 dark:text-red-400">
                                    Лимит исчерпан
                                </div>
                            )}
                        </div>

                        <div className="p-8">
                            {/* Status Logic UI */}
                            
                            {/* 1. Rejected State */}
                            {fileStatus === FileStatus.REJECTED && (
                                <div className="text-center py-6">
                                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 dark:bg-red-900/20">
                                        <XCircle className="w-8 h-8 text-red-600 dark:text-red-500" />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-800 mb-2 dark:text-white">Модерация не пройдена</h3>
                                    <p className="text-slate-500 max-w-md mx-auto mb-6 dark:text-slate-400">
                                        Ваш файл не прошел проверку и был удален. Загрузите новый файл.
                                    </p>
                                    <button 
                                        onClick={handleResetUpload}
                                        className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors"
                                    >
                                        Загрузить новый файл
                                    </button>
                                </div>
                            )}

                            {/* 2. Moderation State */}
                            {fileStatus === FileStatus.MODERATION && (
                                <div className="text-center py-6">
                                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 dark:bg-blue-900/20">
                                        <Clock className="w-8 h-8 text-blue-600 animate-pulse dark:text-blue-400" />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-800 mb-2 dark:text-white">Файл на модерации</h3>
                                    <p className="text-slate-500 max-w-md mx-auto dark:text-slate-400">
                                        Мы проверяем ваш контент. Статус обновится автоматически.
                                    </p>
                                </div>
                            )}

                            {/* 3. Active (Passed) State */}
                            {fileStatus === FileStatus.ACTIVE && (
                                <div className="text-center py-6">
                                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 dark:bg-green-900/20">
                                        <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-800 mb-2 dark:text-white">Модерация пройдена</h3>
                                    <p className="text-slate-500 max-w-md mx-auto dark:text-slate-400">
                                        Ваш файл одобрен и размещен в папке экрана.
                                    </p>
                                </div>
                            )}

                            {/* 4. None / Upload Form */}
                            {fileStatus === FileStatus.NONE && (
                                <>
                                    {isScreenFull ? (
                                        <div className="text-center py-10">
                                            <AlertTriangle className="w-16 h-16 text-orange-300 mx-auto mb-4" />
                                            <h3 className="text-xl font-bold text-slate-800 mb-2 dark:text-white">Экран укомплектован</h3>
                                            <p className="text-slate-500 max-w-md mx-auto dark:text-slate-400">
                                                На этот экран уже загружено максимальное количество файлов (20). 
                                            </p>
                                        </div>
                                    ) : (
                                        <>
                                            {!file ? (
                                                <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-slate-300 border-dashed rounded-2xl cursor-pointer bg-slate-50 hover:bg-indigo-50 hover:border-indigo-400 transition-all dark:bg-slate-950 dark:border-slate-700 dark:hover:bg-slate-900 dark:hover:border-indigo-600">
                                                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                                        <UploadCloud className="w-12 h-12 mb-4 text-indigo-500" />
                                                        <p className="mb-2 text-sm text-slate-700 font-semibold dark:text-slate-300">Нажмите для загрузки</p>
                                                        <p className="text-xs text-slate-500 dark:text-slate-400">Фото или Видео (до 15 сек)</p>
                                                    </div>
                                                    <input type="file" className="hidden" accept="image/*,video/*" onChange={handleFileSelect} />
                                                </label>
                                            ) : (
                                                <div className="space-y-6">
                                                    {/* Preview */}
                                                    <div className="relative rounded-xl overflow-hidden bg-black aspect-video shadow-inner">
                                                        {file.type === 'video' ? (
                                                            <video src={file.previewUrl} controls className="w-full h-full object-contain" />
                                                        ) : (
                                                            <img src={file.previewUrl} alt="Preview" className="w-full h-full object-contain" />
                                                        )}
                                                        <button 
                                                            onClick={() => { setFile(null); setStatus(ModerationStatus.IDLE); }} 
                                                            className="absolute top-2 right-2 p-1 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
                                                            disabled={status === ModerationStatus.UPLOADING || status === ModerationStatus.ANALYZING}
                                                        >
                                                            <XCircle className="w-6 h-6" />
                                                        </button>
                                                    </div>

                                                    {/* Status Area for Upload Process */}
                                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 dark:bg-slate-800 dark:border-slate-700">
                                                        <div className="flex items-center space-x-3 mb-2">
                                                            {status === ModerationStatus.IDLE && <ImageIcon className="w-5 h-5 text-slate-400" />}
                                                            {status === ModerationStatus.ANALYZING && <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />}
                                                            {status === ModerationStatus.APPROVED && <CheckCircle className="w-5 h-5 text-green-500" />}
                                                            {status === ModerationStatus.REJECTED && <AlertTriangle className="w-5 h-5 text-red-500" />}
                                                            {status === ModerationStatus.UPLOADING && <UploadCloud className="w-5 h-5 text-indigo-500 animate-bounce" />}
                                                            {status === ModerationStatus.ERROR && <XCircle className="w-5 h-5 text-red-600" />}
                                                            
                                                            <span className={`font-medium text-sm ${
                                                                status === ModerationStatus.REJECTED ? 'text-red-600 dark:text-red-400' : 
                                                                'text-slate-700 dark:text-slate-300'
                                                            }`}>
                                                                {statusMessage || 'Файл готов к проверке'}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Action Buttons */}
                                                    <button
                                                        onClick={handleProcess}
                                                        disabled={status === ModerationStatus.ANALYZING || status === ModerationStatus.UPLOADING}
                                                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg hover:shadow-indigo-200 transition-all flex items-center justify-center space-x-2 dark:disabled:bg-slate-700 dark:hover:shadow-none"
                                                    >
                                                        {status === ModerationStatus.ANALYZING || status === ModerationStatus.UPLOADING ? (
                                                            <>
                                                                <Loader2 className="w-5 h-5 animate-spin" />
                                                                <span>Обработка...</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Zap className="w-5 h-5" />
                                                                <span>Проверить и Загрузить</span>
                                                            </>
                                                        )}
                                                    </button>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: My Files */}
                <div className="md:col-span-1">
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 h-full flex flex-col dark:bg-slate-900 dark:border-slate-800">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 dark:bg-slate-800 dark:border-slate-700">
                            <h3 className="font-bold text-slate-700 dark:text-slate-200">Мои файлы</h3>
                        </div>
                        <div className="p-4 flex-grow overflow-y-auto max-h-[500px] space-y-3">
                            {!trackedFile ? (
                                <p className="text-slate-400 text-sm text-center py-4">
                                    Вы еще ничего не загрузили на этот экран.
                                </p>
                            ) : (
                                <div className="flex flex-col p-3 bg-slate-50 rounded-lg border border-slate-100 hover:shadow-sm transition-shadow group dark:bg-slate-800 dark:border-slate-700">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center space-x-3 overflow-hidden">
                                            <div className="w-10 h-10 bg-slate-200 rounded-md flex-shrink-0 flex items-center justify-center dark:bg-slate-700">
                                                <ImageIcon className="w-5 h-5 text-slate-500 dark:text-slate-300" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-xs font-medium text-slate-700 truncate max-w-[120px] dark:text-slate-200" title={trackedFile.name}>
                                                    {trackedFile.name.split('_').pop()} 
                                                </p>
                                                <p className={`text-[10px] font-bold ${
                                                    fileStatus === FileStatus.MODERATION ? 'text-blue-500 dark:text-blue-400' : 
                                                    fileStatus === FileStatus.ACTIVE ? 'text-green-500 dark:text-green-400' : 'text-slate-400'
                                                }`}>
                                                    {fileStatus === FileStatus.MODERATION ? 'На проверке' : 
                                                     fileStatus === FileStatus.ACTIVE ? 'Опубликовано' : 'Загружено'}
                                                </p>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => initiateDelete(trackedFile)}
                                            disabled={deletingPath === trackedFile.path}
                                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors dark:hover:bg-red-900/30 dark:hover:text-red-400"
                                            title="Удалить файл"
                                        >
                                            {deletingPath === trackedFile.path ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <Trash2 className="w-4 h-4" />
                                            )}
                                        </button>
                                    </div>
                                    
                                    {/* Countdown Timer for Active Files */}
                                    {fileStatus === FileStatus.ACTIVE && (
                                        <div className="mt-1 pt-2 border-t border-slate-200 flex items-center justify-between text-xs dark:border-slate-700">
                                            <div className="flex items-center text-slate-500 dark:text-slate-400">
                                                <Calendar className="w-3 h-3 mr-1" />
                                                <span>Размещение:</span>
                                            </div>
                                            <span className={`font-semibold ${
                                                (getRemainingDays(trackedFile.name) || 0) < 3 ? 'text-red-500 dark:text-red-400' : 'text-indigo-600 dark:text-indigo-400'
                                            }`}>
                                                Осталось {getRemainingDays(trackedFile.name)} дн.
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

             </div>
          </div>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-[fadeIn_0.2s_ease-out] dark:bg-slate-800">
                <div className="p-6 text-center">
                    <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 dark:bg-red-900/20">
                        <Trash2 className="w-6 h-6 text-red-600 dark:text-red-500" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-2 dark:text-white">Удалить файл?</h3>
                    <p className="text-slate-500 text-sm mb-6 dark:text-slate-400">
                        Вы уверены, что хотите удалить этот файл? Это действие необратимо.
                        <br/>
                        <span className="text-xs text-slate-400 mt-1 block break-all">{fileToDelete?.name.split('_').pop()}</span>
                    </p>
                    <div className="flex space-x-3">
                        <button 
                            onClick={() => { setIsDeleteModalOpen(false); setFileToDelete(null); }}
                            className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition-colors dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                        >
                            Отмена
                        </button>
                        <button 
                            onClick={confirmDelete}
                            className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
                        >
                            Удалить
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};

export default Dashboard;