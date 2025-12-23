

import React, { useState, useEffect, useCallback, ErrorInfo, ReactNode } from 'react';
import { TTSGenerator } from './components/TTSGenerator';
import { VoiceCloner } from './components/VoiceCloner';
import { AsyncTTSGenerator } from './components/AsyncTTSGenerator';
import { FreeTTSGenerator } from './components/FreeTTSGenerator';
import { ConversationGenerator } from './components/ConversationGenerator';
import { Key, Mic, MessageSquare, Menu, Loader2, CheckCircle, XCircle, Activity, RefreshCw, Edit2, Save, BookOpen, AlertTriangle, Infinity, Layers, Plus, Trash2, Copy, ClipboardPaste, Users, ClipboardList, X } from 'lucide-react';
import { getVoices, deleteVoice } from './services/minimax';
import { Voice } from './types';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Lỗi không mong muốn:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
          <div className="bg-red-900/20 border border-red-800 p-6 rounded-lg max-w-lg w-full text-center">
            <h2 className="text-xl font-bold text-red-400 mb-2 flex items-center justify-center gap-2">
              <AlertTriangle /> Ứng dụng gặp sự cố
            </h2>
            <p className="text-gray-300 mb-4">Đã có lỗi xảy ra. Hãy thử xóa dữ liệu và tải lại trang.</p>
            <pre className="bg-black/50 p-4 rounded text-xs text-red-200 overflow-auto mb-4 text-left">
              {this.state.error?.toString()}
            </pre>
            <button 
              onClick={() => { localStorage.clear(); window.location.reload(); }}
              className="w-full py-2 bg-red-700 hover:bg-red-600 text-white rounded font-semibold transition-colors"
            >
              Xóa Dữ Liệu & Tải Lại
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const safeJSONParse = (key: string, fallback: any) => {
  try {
    const item = localStorage.getItem(key);
    if (!item || item === "undefined" || item === "null") return fallback;
    return JSON.parse(item);
  } catch (e) {
    console.warn(`Lỗi phân tích ${key}, sử dụng dữ liệu mặc định.`, e);
    return fallback;
  }
};

interface ApiKeyItem {
    id: string;
    value: string;
    status: 'unknown' | 'checking' | 'valid' | 'invalid';
}

const AppContent: React.FC = () => {
  // Fix line 79: Explicitly cast status to ensure it matches ApiKeyItem interface
  const [keyList, setKeyList] = useState<ApiKeyItem[]>(() => {
      const stored = localStorage.getItem('minimax_api_key');
      if (!stored) return [{ id: '1', value: '', status: 'unknown' }];
      
      return stored.split(',').map((k, i) => ({
          id: `init-${i}`,
          value: k.trim(),
          status: 'unknown' as const
      })).filter(k => k.value !== '') as ApiKeyItem[];
  });

  useEffect(() => {
      if (keyList.length === 0) {
          setKeyList([{ id: Date.now().toString(), value: '', status: 'unknown' }]);
      }
  }, [keyList.length]);

  const [activeTab, setActiveTab] = useState<'tts' | 'clone' | 'async' | 'free' | 'conversation'>(() => (localStorage.getItem('minimax_active_tab') as any) || 'tts');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const [totalUsage, setTotalUsage] = useState<number>(() => parseInt(localStorage.getItem('minimax_total_usage') || '0'));
  const [quota, setQuota] = useState<number>(() => parseInt(localStorage.getItem('minimax_quota_limit') || '0')); 
  const [isEditingQuota, setIsEditingQuota] = useState(false);
  const [tempQuota, setTempQuota] = useState(quota.toString());

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importText, setImportText] = useState('');

  const [voices, setVoices] = useState<Voice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [voiceError, setVoiceError] = useState('');

  const apiKeyString = keyList.map(k => k.value.trim()).filter(k => k.length > 0).join(',');

  const saveKeysToStorage = (keys: ApiKeyItem[]) => {
      const joined = keys.map(k => k.value.trim()).filter(k => k.length > 0).join(',');
      localStorage.setItem('minimax_api_key', joined);
  };

  const handleKeyChange = (id: string, newValue: string) => {
    const updated = keyList.map(item => 
        item.id === id ? { ...item, value: newValue, status: 'unknown' as const } : item
    );
    setKeyList(updated);
    saveKeysToStorage(updated);
  };

  const handlePaste = (e: React.ClipboardEvent, id: string) => {
      const pasteData = e.clipboardData.getData('text');
      if (pasteData.includes('\n') || pasteData.includes(',')) {
          e.preventDefault();
          const newValues = pasteData.split(/[\n,]+/).map(k => k.trim()).filter(k => k.length > 0);
          if (newValues.length === 0) return;

          const currentIndex = keyList.findIndex(k => k.id === id);
          if (currentIndex === -1) return;

          const newItems: ApiKeyItem[] = newValues.map((val, i) => ({
              id: `${Date.now()}-${i}`,
              value: val,
              status: 'unknown'
          }));

          const updatedList = [...keyList];
          updatedList.splice(currentIndex, 1, ...newItems);
          setKeyList(updatedList);
          saveKeysToStorage(updatedList);
      }
  };

  const addKeyRow = () => {
    setKeyList([...keyList, { id: Date.now().toString(), value: '', status: 'unknown' }]);
  };

  const removeKeyRow = (id: string) => {
    const updated = keyList.filter(k => k.id !== id);
    setKeyList(updated.length > 0 ? updated : [{ id: Date.now().toString(), value: '', status: 'unknown' }]);
    saveKeysToStorage(updated);
  };

  const handleBulkImport = () => {
      if (!importText.trim()) {
          setIsImportModalOpen(false);
          return;
      }
      const lines = importText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const newItems: ApiKeyItem[] = lines.map((k, i) => ({
          id: `bulk-${Date.now()}-${i}`,
          value: k,
          status: 'unknown'
      }));
      setKeyList(newItems);
      saveKeysToStorage(newItems);
      setImportText('');
      setIsImportModalOpen(false);
  };

  const handleSaveQuota = () => {
      const val = parseInt(tempQuota) || 0;
      setQuota(val);
      localStorage.setItem('minimax_quota_limit', val.toString());
      setIsEditingQuota(false);
  };

  const handleTabChange = (tab: any) => {
    setActiveTab(tab);
    localStorage.setItem('minimax_active_tab', tab);
    setIsSidebarOpen(false);
  };

  const checkAllKeys = async () => {
    setKeyList(prev => prev.map(k => k.value ? { ...k, status: 'checking' } : k));
    const checkedKeys = await Promise.all(keyList.map(async (item) => {
        if (!item.value.trim()) return item;
        try {
            await getVoices(item.value);
            return { ...item, status: 'valid' as const };
        } catch (e) {
            return { ...item, status: 'invalid' as const };
        }
    }));
    setKeyList(checkedKeys);
    const validKey = checkedKeys.find(k => k.status === 'valid');
    if (validKey) fetchVoices(validKey.value);
  };

  const fetchVoices = useCallback(async (specificKey?: string) => {
    const keyToUse = specificKey || apiKeyString.split(',')[0];
    const localVoices = safeJSONParse('minimax_local_voices', []);
    const localNames = safeJSONParse('minimax_voice_names', {});

    if (!keyToUse) {
        setVoices(localVoices);
        return;
    }

    setLoadingVoices(true);
    setVoiceError('');
    try {
      const resp = await getVoices(keyToUse);
      const apiVoices: Voice[] = [];
      const apiVoiceIds = new Set<string>();
      
      if (resp.system_voice) {
        resp.system_voice.forEach(v => {
          apiVoices.push({ id: v.voice_id, name: v.voice_name || v.voice_id, type: 'system', description: v.description ? v.description.join(', ') : 'Giọng hệ thống' });
          apiVoiceIds.add(v.voice_id);
        });
      }
      if (resp.voice_cloning) {
        resp.voice_cloning.forEach(v => {
          apiVoices.push({ id: v.voice_id, name: localNames[v.voice_id] || v.voice_id, type: 'voice_cloning', description: v.description ? v.description.join(', ') : 'Giọng nhân bản' });
          apiVoiceIds.add(v.voice_id);
        });
      }
      if (resp.voice_generation) {
        resp.voice_generation.forEach(v => {
          apiVoices.push({ id: v.voice_id, name: localNames[v.voice_id] || v.voice_id, type: 'voice_generation', description: v.description ? v.description.join(', ') : 'Giọng tạo mới' });
          apiVoiceIds.add(v.voice_id);
        });
      }

      const mergedVoices = [...apiVoices];
      localVoices.forEach((lv: Voice) => {
        if (!apiVoiceIds.has(lv.id)) mergedVoices.push(lv);
      });
      setVoices(mergedVoices);
    } catch (err: any) {
      setVoices(localVoices);
      setVoiceError("Không thể tải giọng nói từ máy chủ, đang hiển thị giọng nói cục bộ.");
    } finally {
      setLoadingVoices(false);
    }
  }, [apiKeyString]);

  useEffect(() => {
      if (apiKeyString && keyList.some(k => k.status === 'unknown' && k.value)) {
          fetchVoices(apiKeyString.split(',')[0]);
      }
  }, []);

  const updateUsage = (chars: number) => {
    const newTotal = totalUsage + chars;
    setTotalUsage(newTotal);
    localStorage.setItem('minimax_total_usage', newTotal.toString());
  };

  const handleDeleteVoice = async (id: string, type: 'voice_cloning' | 'voice_generation') => {
    if (!apiKeyString) return;
    try {
      const firstKey = apiKeyString.split(',')[0].trim();
      await deleteVoice(firstKey, id, type).catch(err => console.warn("Lỗi xóa API hoặc không tìm thấy", err));
      const localNames = safeJSONParse('minimax_voice_names', {});
      if (localNames[id]) {
          delete localNames[id];
          localStorage.setItem('minimax_voice_names', JSON.stringify(localNames));
      }
      const localVoices = safeJSONParse('minimax_local_voices', []);
      const updatedLocalVoices = localVoices.filter((v: Voice) => v.id !== id);
      localStorage.setItem('minimax_local_voices', JSON.stringify(updatedLocalVoices));
      await fetchVoices();
    } catch (err: any) {
      alert(`Xóa giọng nói thất bại: ${err.message}`);
    }
  };

  const validKeyCount = keyList.filter(k => k.status === 'valid').length;

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[#0f172a] text-gray-100 font-sans">
      <div className="md:hidden flex items-center justify-between p-4 bg-[#1e293b] border-b border-slate-700">
        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-emerald-400">MiniMax Pro</h1>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-slate-400 hover:text-white transition-colors">
          <Menu />
        </button>
      </div>

      <div className={`
        fixed inset-y-0 left-0 transform ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}
        md:relative md:translate-x-0 transition duration-300 ease-in-out
        w-80 bg-[#1e293b] border-r border-slate-800 z-30 flex flex-col shadow-2xl
      `}>
        <div className="p-6 hidden md:block border-b border-slate-800">
          <h1 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-emerald-400 tracking-tight">MiniMax Pro</h1>
          <p className="text-xs text-slate-500 mt-1 font-medium">Studio Giọng Nói AI Chuyên Nghiệp</p>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          <button
            onClick={() => handleTabChange('tts')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
              activeTab === 'tts' ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20 shadow-lg shadow-teal-500/5' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <MessageSquare size={20} className={activeTab === 'tts' ? 'text-teal-400' : 'text-slate-500 group-hover:text-slate-300'} />
            <span className="font-semibold text-sm">Chuyển Văn Bản</span>
          </button>
          <button
            onClick={() => handleTabChange('async')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
              activeTab === 'async' ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20 shadow-lg shadow-teal-500/5' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <BookOpen size={20} className={activeTab === 'async' ? 'text-teal-400' : 'text-slate-500 group-hover:text-slate-300'} />
            <span className="font-semibold text-sm">Sách & Audio Dài</span>
          </button>
          <button
            onClick={() => handleTabChange('clone')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
              activeTab === 'clone' ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20 shadow-lg shadow-teal-500/5' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Mic size={20} className={activeTab === 'clone' ? 'text-teal-400' : 'text-slate-500 group-hover:text-slate-300'} />
            <span className="font-semibold text-sm">Nhân Bản Giọng Nói</span>
          </button>
          <button
            onClick={() => handleTabChange('conversation')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
              activeTab === 'conversation' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-lg shadow-indigo-500/5' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Users size={20} className={activeTab === 'conversation' ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300'} />
            <span className="font-bold text-sm">Phòng Thu Hội Thoại</span>
          </button>
          <button
            onClick={() => handleTabChange('free')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
              activeTab === 'free' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20 shadow-lg shadow-purple-500/5' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Infinity size={20} className={activeTab === 'free' ? 'text-purple-400' : 'text-slate-500 group-hover:text-slate-300'} />
            <span className="font-bold text-sm">Ghép Nối Thông Minh</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-800 bg-[#1e293b]/50">
          <div className="flex items-center justify-between mb-4">
             <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                API KEYS {validKeyCount > 0 && <span className="text-emerald-400 ml-1">({validKeyCount} Hợp Lệ)</span>}
             </label>
             <button 
                onClick={checkAllKeys} 
                className="text-[10px] bg-slate-700 hover:bg-slate-600 text-white px-2 py-1 rounded-md flex items-center gap-1 transition-all active:scale-95"
            >
                <RefreshCw size={10} className={keyList.some(k => k.status === 'checking') ? 'animate-spin' : ''} /> Kiểm Tra
            </button>
          </div>
          
          <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-2 pr-1 mb-3">
            {keyList.map((item, index) => (
                <div key={item.id} className="flex gap-2 items-center group relative">
                    <div className={`w-1 h-8 rounded-full absolute left-0 top-1/2 -translate-y-1/2 z-10 transition-colors
                         ${item.status === 'valid' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 
                           item.status === 'invalid' ? 'bg-rose-500' : 
                           item.status === 'checking' ? 'bg-amber-500 animate-pulse' : 
                           'bg-slate-700'
                         }`} 
                     />
                    <div className="relative flex-1">
                        <input
                            type="password"
                            value={item.value}
                            onChange={(e) => handleKeyChange(item.id, e.target.value)}
                            onPaste={(e) => handlePaste(e, item.id)}
                            placeholder={`Dán API Key ${index + 1}`}
                            className={`w-full bg-[#0f172a] text-xs text-white rounded-lg border pl-4 pr-7 py-2.5 outline-none transition-all
                                ${item.status === 'valid' ? 'border-emerald-900/50 focus:border-emerald-500' : 
                                  item.status === 'invalid' ? 'border-rose-900/50 focus:border-rose-500' : 
                                  'border-slate-700 focus:border-teal-500'}
                            `}
                        />
                         {item.status === 'valid' && <CheckCircle size={12} className="absolute right-2.5 top-3 text-emerald-500" />}
                         {item.status === 'invalid' && <XCircle size={12} className="absolute right-2.5 top-3 text-rose-500" />}
                         {item.status === 'checking' && <Loader2 size={12} className="absolute right-2.5 top-3 text-amber-500 animate-spin" />}
                    </div>
                    {keyList.length > 1 && (
                        <button onClick={() => removeKeyRow(item.id)} className="text-slate-600 hover:text-rose-400 transition-colors">
                            <Trash2 size={14} />
                        </button>
                    )}
                </div>
            ))}
          </div>
          
          <div className="flex gap-2 mb-4">
              <button onClick={addKeyRow} className="flex-1 py-1.5 border border-dashed border-slate-700 text-slate-500 text-xs rounded-lg hover:bg-slate-800 hover:text-slate-300 transition-colors flex items-center justify-center gap-1">
                 <Plus size={12} /> Thêm
              </button>
              <button onClick={() => setIsImportModalOpen(true)} className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg transition-colors flex items-center justify-center gap-1">
                 <ClipboardList size={12} /> Nhập Hàng Loạt
              </button>
          </div>

          <div className="bg-[#0f172a]/50 rounded-xl border border-slate-800 overflow-hidden">
             <div className="px-3 py-2 bg-[#0f172a] border-b border-slate-800 flex justify-between items-center">
                 <div className="flex items-center gap-2">
                    <Activity size={14} className="text-teal-500" />
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Thống kê</span>
                 </div>
                 <button onClick={() => setIsEditingQuota(!isEditingQuota)} className="text-slate-500 hover:text-white transition-colors">
                    {isEditingQuota ? <XCircle size={12}/> : <Edit2 size={12} />}
                 </button>
             </div>
             <div className="p-3">
                 {isEditingQuota && (
                     <div className="flex items-center gap-2 mb-2">
                         <input 
                            type="number" 
                            value={tempQuota} 
                            onChange={(e) => setTempQuota(e.target.value)}
                            className="w-full bg-[#1e293b] border border-slate-700 rounded-lg px-2 py-1 text-xs outline-none focus:border-teal-500"
                            placeholder="Giới hạn (ví dụ: 100000)"
                         />
                         <button onClick={handleSaveQuota} className="text-emerald-500 hover:text-emerald-400 transition-colors">
                             <Save size={14}/>
                         </button>
                     </div>
                 )}
                 <div className="space-y-1">
                     <div className="flex justify-between text-xs">
                         <span className="text-slate-500">Đã dùng:</span>
                         <span className="text-slate-200 font-mono font-bold">{totalUsage.toLocaleString()} ký tự</span>
                     </div>
                 </div>
             </div>
          </div>
          {!apiKeyString && <p className="text-[10px] text-rose-400 mt-2 font-medium">Vui lòng nhập ít nhất một API Key</p>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-[#0f172a] p-4 md:p-8">
        {!apiKeyString ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
            <div className="w-20 h-20 bg-slate-800/50 rounded-3xl flex items-center justify-center text-slate-600 shadow-inner">
                <Key size={40} />
            </div>
            <div className="space-y-2">
                <h2 className="text-2xl font-bold text-slate-200">Chào mừng đến với MiniMax Studio</h2>
                <p className="text-slate-500 max-w-md mx-auto">Vui lòng nhập API Key của bạn ở thanh bên trái để bắt đầu tạo ra những giọng nói AI tuyệt vời.</p>
            </div>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto">
            {activeTab === 'tts' ? (
              loadingVoices ? (
                <div className="flex flex-col items-center justify-center h-64 text-teal-500 gap-3">
                  <Loader2 className="animate-spin" size={32} />
                  <span className="text-slate-400 font-medium animate-pulse">Đang tải thư viện giọng nói...</span>
                </div>
              ) : voiceError ? (
                <div className="text-center p-8 bg-rose-900/10 rounded-2xl border border-rose-900/30 text-rose-300">
                  <p className="mb-4">{voiceError}</p>
                  <button onClick={() => fetchVoices()} className="px-6 py-2 bg-rose-800 hover:bg-rose-700 rounded-lg font-semibold transition-colors">Thử Lại</button>
                </div>
              ) : (
                <TTSGenerator 
                  apiKey={apiKeyString.split(',')[0].trim()} 
                  voices={voices} 
                  onDeleteVoice={handleDeleteVoice}
                  onRefreshVoices={() => fetchVoices()}
                  onUsageUpdate={updateUsage}
                />
              )
            ) : activeTab === 'async' ? (
              <AsyncTTSGenerator 
                apiKey={apiKeyString.split(',')[0].trim()}
                voices={voices}
                onRefreshVoices={() => fetchVoices()}
                onUsageUpdate={updateUsage}
              />
            ) : activeTab === 'clone' ? (
              <VoiceCloner 
                apiKey={apiKeyString.split(',')[0].trim()} 
                onVoiceCreated={() => fetchVoices()} 
                onUsageUpdate={updateUsage}
              />
            ) : activeTab === 'conversation' ? (
              <ConversationGenerator apiKey={apiKeyString} />
            ) : (
              <FreeTTSGenerator apiKey={apiKeyString} />
            )}
          </div>
        )}
      </div>

      {isImportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#000]/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
              <div className="bg-[#1e293b] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-700 scale-100 animate-in zoom-in-95 duration-200">
                  <div className="flex justify-between items-center p-6 border-b border-slate-800">
                      <h3 className="text-lg font-bold text-white">Nhập API Key Hàng Loạt</h3>
                      <button onClick={() => setIsImportModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                          <X size={20} />
                      </button>
                  </div>
                  <div className="p-6">
                      <p className="text-xs text-slate-400 mb-3 font-medium">Dán danh sách API Key của bạn vào bên dưới. Mỗi Key một dòng.</p>
                      <textarea
                          value={importText}
                          onChange={(e) => setImportText(e.target.value)}
                          placeholder={`eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...\neyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`}
                          className="w-full h-48 bg-[#0f172a] border border-slate-700 rounded-xl p-4 text-xs text-slate-200 resize-none focus:outline-none focus:border-teal-500 transition-colors font-mono"
                      />
                  </div>
                  <div className="flex justify-end items-center gap-3 p-6 border-t border-slate-800 bg-[#1e293b]/50">
                      <button onClick={() => setIsImportModalOpen(false)} className="px-5 py-2 rounded-lg text-slate-400 hover:text-white text-sm font-semibold transition-colors">Hủy</button>
                      <button onClick={handleBulkImport} className="px-5 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-sm font-bold flex items-center gap-2 shadow-lg shadow-teal-500/20 transition-all active:scale-95">
                          <ClipboardList size={16} /> Nhập Ngay
                      </button>
                  </div>
              </div>
          </div>
      )}

      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20 md:hidden" onClick={() => setIsSidebarOpen(false)}></div>
      )}
    </div>
  );
}

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
};

export default App;
