import React, { useState, useEffect, useRef } from 'react';
import { createAsyncT2ATask, queryAsyncT2ATask, retrieveAsyncFile } from '../services/minimax';
import { MODELS, Voice } from '../types';
import { Download, Loader2, Volume2, Settings2, RotateCw, FileText, CheckCircle, AlertTriangle, Mic, ChevronRight } from 'lucide-react';
import { VoiceSelectorModal } from './VoiceSelectorModal';

interface AsyncTTSGeneratorProps {
  apiKey: string;
  voices: Voice[];
  onRefreshVoices: () => void;
  onUsageUpdate?: (chars: number) => void;
}

export const AsyncTTSGenerator: React.FC<AsyncTTSGeneratorProps> = ({ apiKey, voices, onRefreshVoices, onUsageUpdate }) => {
  // Persistence
  const [text, setText] = useState(() => localStorage.getItem('minimax_async_text') || '');
  const [model, setModel] = useState(() => localStorage.getItem('minimax_async_model') || 'speech-2.6-hd');
  const [selectedVoiceId, setSelectedVoiceId] = useState(() => localStorage.getItem('minimax_async_voice_id') || '');
  
  // Settings
  const [speed, setSpeed] = useState(1.0);
  const [vol, setVol] = useState(1.0);
  const [pitch, setPitch] = useState(0);

  // Task State
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<'idle' | 'processing' | 'success' | 'failed' | 'downloading'>('idle');
  const [pollingInterval, setPollingInterval] = useState<number | null>(null);
  const [resultFileId, setResultFileId] = useState<number | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);

  useEffect(() => localStorage.setItem('minimax_async_text', text), [text]);
  useEffect(() => localStorage.setItem('minimax_async_model', model), [model]);
  useEffect(() => localStorage.setItem('minimax_async_voice_id', selectedVoiceId), [selectedVoiceId]);

  // Default voice
  useEffect(() => {
    if (voices.length > 0 && !selectedVoiceId) {
        setSelectedVoiceId(voices[0].id);
    }
  }, [voices, selectedVoiceId]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
        if (pollingInterval) clearInterval(pollingInterval);
    };
  }, [pollingInterval]);

  const handleCreateTask = async () => {
      if (!text.trim()) return;
      setTaskStatus('processing');
      setError('');
      setDownloadUrl(null);
      setResultFileId(null);
      setActiveTaskId(null);

      try {
          const resp = await createAsyncT2ATask(apiKey, {
              model,
              text,
              language_boost: 'auto',
              voice_setting: {
                  voice_id: selectedVoiceId,
                  speed,
                  vol,
                  pitch
              },
              audio_setting: {
                  audio_sample_rate: 32000,
                  bitrate: 128000,
                  format: 'mp3',
                  channel: 1
              }
          });

          setActiveTaskId(resp.task_id);
          
          // Start Polling
          const interval = window.setInterval(() => checkStatus(resp.task_id), 3000);
          setPollingInterval(interval);

          // Update Usage (Estimation)
          if (onUsageUpdate) onUsageUpdate(text.length);

      } catch (err: any) {
          setError(err.message || "Failed to start task");
          setTaskStatus('failed');
      }
  };

  const checkStatus = async (taskId: string) => {
      try {
          const resp = await queryAsyncT2ATask(apiKey, taskId);
          
          if (resp.status === 'success' && resp.file_id) {
              if (pollingInterval) clearInterval(pollingInterval);
              setPollingInterval(null);
              setTaskStatus('success');
              setResultFileId(resp.file_id);
              // Trigger download prep
              prepareDownload(resp.file_id);
          } else if (resp.status === 'failed' || resp.status === 'canceled') {
              if (pollingInterval) clearInterval(pollingInterval);
              setPollingInterval(null);
              setTaskStatus('failed');
              setError("Task processing failed on server side.");
          } 
          // If 'processing', do nothing, wait for next poll
      } catch (err: any) {
          console.error("Polling error", err);
          // Don't stop polling immediately on network hiccup, but maybe count errors?
      }
  };

  const prepareDownload = async (fileId: number) => {
      setTaskStatus('downloading');
      try {
          const blob = await retrieveAsyncFile(apiKey, fileId);
          const url = URL.createObjectURL(blob);
          setDownloadUrl(url);
          setTaskStatus('success');
      } catch (err: any) {
          setError("Generated successfully, but download failed: " + err.message);
          setTaskStatus('failed');
      }
  };

  const currentVoice = voices.find(v => v.id === selectedVoiceId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative animate-fade-in">
        <VoiceSelectorModal 
            isOpen={isVoiceModalOpen}
            onClose={() => setIsVoiceModalOpen(false)}
            voices={voices}
            selectedVoiceId={selectedVoiceId}
            onSelect={(id) => { setSelectedVoiceId(id); setIsVoiceModalOpen(false); }}
            apiKey={apiKey}
            onRefresh={onRefreshVoices}
        />

        <div className="lg:col-span-2 space-y-6">
            <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-xl overflow-hidden flex flex-col h-[600px]">
                <div className="p-4 border-b border-gray-700 bg-gray-800/50 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <FileText size={16} className="text-minimax-500"/>
                        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Long Text Input</h2>
                    </div>
                    <span className="text-xs text-gray-500">{text.length.toLocaleString()}/1,000,000 chars</span>
                </div>
                <textarea
                    className="flex-1 w-full bg-gray-900 p-6 text-gray-100 resize-none focus:outline-none focus:ring-inset focus:ring-2 focus:ring-minimax-900/50 text-base leading-relaxed font-mono"
                    placeholder="Paste your book chapter or long article here (up to 1M characters)..."
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                />
                <div className="p-4 border-t border-gray-700 bg-gray-800/50 flex justify-end">
                    <button
                        onClick={handleCreateTask}
                        disabled={taskStatus === 'processing' || taskStatus === 'downloading' || !text.trim()}
                        className={`
                            px-6 py-3 rounded-lg font-semibold flex items-center gap-2 shadow-lg transition-all
                            ${taskStatus === 'processing' || taskStatus === 'downloading' || !text.trim()
                                ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
                                : 'bg-green-600 hover:bg-green-500 text-white hover:shadow-green-500/20'
                            }
                        `}
                    >
                        {taskStatus === 'processing' ? <Loader2 className="animate-spin" size={20}/> : <Volume2 size={20} />}
                        {taskStatus === 'processing' ? 'Processing on Server...' : 'Start Long Synthesis'}
                    </button>
                </div>
            </div>

            {/* Status Card */}
            {(activeTaskId || error) && (
                <div className={`rounded-xl border p-6 animate-fade-in ${
                    taskStatus === 'failed' ? 'bg-red-900/20 border-red-800' :
                    taskStatus === 'success' ? 'bg-green-900/20 border-green-800' :
                    'bg-blue-900/20 border-blue-800'
                }`}>
                    <div className="flex items-start gap-4">
                        <div className="mt-1">
                            {taskStatus === 'processing' && <Loader2 size={24} className="animate-spin text-blue-400" />}
                            {taskStatus === 'downloading' && <Loader2 size={24} className="animate-spin text-green-400" />}
                            {taskStatus === 'success' && <CheckCircle size={24} className="text-green-500" />}
                            {taskStatus === 'failed' && <AlertTriangle size={24} className="text-red-500" />}
                        </div>
                        <div className="flex-1">
                            <h3 className={`text-lg font-semibold mb-1 ${
                                taskStatus === 'failed' ? 'text-red-400' :
                                taskStatus === 'success' ? 'text-green-400' :
                                'text-blue-400'
                            }`}>
                                {taskStatus === 'processing' && 'Synthesizing Audio...'}
                                {taskStatus === 'downloading' && 'Downloading Result...'}
                                {taskStatus === 'success' && 'Generation Complete!'}
                                {taskStatus === 'failed' && 'Task Failed'}
                            </h3>
                            
                            <p className="text-gray-400 text-sm mb-4">
                                {taskStatus === 'processing' && 'This may take a while depending on text length. You can wait here.'}
                                {taskStatus === 'success' && 'Your audio file is ready for download.'}
                                {taskStatus === 'failed' && error}
                            </p>
                            
                            {taskStatus === 'success' && downloadUrl && (
                                <div className="flex gap-4">
                                    <a 
                                        href={downloadUrl} 
                                        download={`minimax-long-audio-${Date.now()}.mp3`}
                                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg flex items-center gap-2 text-sm font-semibold transition-colors"
                                    >
                                        <Download size={16} /> Download MP3
                                    </a>
                                    <audio src={downloadUrl} controls className="h-10" />
                                </div>
                            )}
                            
                            {activeTaskId && (
                                <p className="text-xs text-gray-500 mt-4 font-mono">Task ID: {activeTaskId}</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* Configuration Sidebar */}
        <div className="space-y-6">
             <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-xl overflow-hidden">
                 <div className="p-4 border-b border-gray-700 bg-gray-800/50">
                    <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                        <Settings2 size={16} /> Configuration
                    </h2>
                 </div>
                 
                 <div className="p-6 space-y-6 h-[calc(100vh-200px)] overflow-y-auto custom-scrollbar">
                     {/* Voice Selection */}
                     <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="block text-xs font-medium text-gray-500 uppercase">Voice</label>
                            <button onClick={onRefreshVoices} className="text-gray-500 hover:text-minimax-400">
                                <RotateCw size={14} />
                            </button>
                        </div>
                        <div 
                            onClick={() => setIsVoiceModalOpen(true)}
                            className="bg-gray-900 border border-gray-600 rounded-xl p-3 cursor-pointer hover:border-minimax-500 transition-colors group relative"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0">
                                    <Mic size={18} className="text-white" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-white truncate">{currentVoice?.name || 'Select a voice'}</p>
                                    <p className="text-xs text-gray-500 truncate">{currentVoice?.description || 'No description'}</p>
                                </div>
                                <ChevronRight size={16} className="text-gray-500 group-hover:text-minimax-400" />
                            </div>
                        </div>
                     </div>

                    {/* Model */}
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-2 uppercase">Model</label>
                        <div className="relative">
                            <select
                                value={model}
                                onChange={(e) => setModel(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2.5 text-white appearance-none focus:ring-1 focus:ring-minimax-500 outline-none text-sm"
                            >
                                {MODELS.map(m => (
                                    <option key={m} value={m}>{m}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Prosody */}
                    <div className="space-y-4 pt-2 border-t border-gray-700">
                        <h3 className="text-xs font-semibold text-gray-300 flex items-center gap-1">
                            <Volume2 size={12} /> PROSODY
                        </h3>
                        <div>
                            <div className="flex justify-between mb-1">
                                <label className="text-xs font-medium text-gray-400">Speed</label>
                                <span className="text-xs text-minimax-400">{speed.toFixed(1)}x</span>
                            </div>
                            <input 
                                type="range" min="0.5" max="2" step="0.1" 
                                value={speed} 
                                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                                className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-minimax-500"
                            />
                        </div>
                        <div>
                            <div className="flex justify-between mb-1">
                                <label className="text-xs font-medium text-gray-400">Volume</label>
                                <span className="text-xs text-minimax-400">{vol.toFixed(1)}</span>
                            </div>
                            <input 
                                type="range" min="0.1" max="10" step="0.1" 
                                value={vol} 
                                onChange={(e) => setVol(parseFloat(e.target.value))}
                                className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-minimax-500"
                            />
                        </div>
                    </div>

                 </div>
             </div>
        </div>
    </div>
  );
};