
import React, { useState, useRef, useEffect } from 'react';
import { uploadFile, cloneVoice } from '../services/minimax';
import { Upload, Mic, Loader2, CheckCircle, AlertCircle, X, Square, FileAudio, Sparkles, Info, Globe, ChevronDown, Plus } from 'lucide-react';
import { SUPPORTED_LANGUAGES, Voice } from '../types';

interface VoiceClonerProps {
  apiKey: string;
  onVoiceCreated: () => void;
  onUsageUpdate?: (chars: number) => void;
}

export const VoiceCloner: React.FC<VoiceClonerProps> = ({ apiKey, onVoiceCreated, onUsageUpdate }) => {
  // Sample Management
  const [samples, setSamples] = useState<{file: File, id: string, url: string}[]>([]);
  const [activeSampleId, setActiveSampleId] = useState<string | null>(null);

  // Prompt Audio State (Enhanced Cloning)
  const [promptFile, setPromptFile] = useState<File | null>(null);
  const [promptFileUrl, setPromptFileUrl] = useState<string>('');
  const [promptText, setPromptText] = useState('');
  const [showPromptSection, setShowPromptSection] = useState(false);

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recordingTime, setRecordingTime] = useState(0);

  // Settings
  const [voiceId, setVoiceId] = useState(() => `Voice_${Math.random().toString(36).substring(2, 10)}_${Date.now().toString().slice(-4)}`);
  const [removeNoise, setRemoveNoise] = useState(false);
  const [optimizeAccent, setOptimizeAccent] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [previewText, setPreviewText] = useState('Hello, I\'m delighted to assist you with our voice services. Choose a voice that resonates with you, and let\'s begin our creative audio journey together');
  const [legalConfirmed, setLegalConfirmed] = useState(false);
  
  // Processing & Workflow State
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<'idle' | 'generated' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [previewAudioUrl, setPreviewAudioUrl] = useState('');

  // Modal State
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [regName, setRegName] = useState('');
  const [regGender, setRegGender] = useState('');
  const [regDesc, setRegDesc] = useState('');

  // Recording Timer
  useEffect(() => {
    let interval: number;
    if (isRecording) {
      interval = window.setInterval(() => {
        setRecordingTime(t => t + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      addSample(e.target.files[0]);
    }
  };

  const handlePromptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          setPromptFile(file);
          setPromptFileUrl(URL.createObjectURL(file));
      }
  };

  const addSample = (file: File) => {
    const id = Math.random().toString(36).substring(7);
    const url = URL.createObjectURL(file);
    setSamples(prev => [...prev, { file, id, url }]);
    setActiveSampleId(id); // Auto select new file
    setStatus('idle');
  };

  const removeSample = (id: string) => {
    setSamples(prev => prev.filter(s => s.id !== id));
    if (activeSampleId === id) setActiveSampleId(null);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/mp3' });
        const file = new File([blob], `recording_${Date.now()}.mp3`, { type: 'audio/mp3' });
        addSample(file);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
    } catch (err) {
      console.error('Recording failed', err);
      setErrorMessage('Could not access microphone.');
      setStatus('error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const validateVoiceId = (id: string) => {
    const regex = /^[a-zA-Z][a-zA-Z0-9-_]{7,255}$/;
    return regex.test(id) && !id.endsWith('-') && !id.endsWith('_');
  };

  useEffect(() => {
      if (selectedLanguage === 'Vietnamese') {
          setPreviewText("Xin chào, tôi rất vui được hỗ trợ bạn với các dịch vụ giọng nói của chúng tôi. Hãy chọn một giọng nói phù hợp với bạn và bắt đầu hành trình âm thanh sáng tạo cùng nhau.");
      } else if (selectedLanguage === 'English') {
          setPreviewText("Hello, I'm delighted to assist you with our voice services. Choose a voice that resonates with you, and let's begin our creative audio journey together");
      }
  }, [selectedLanguage]);

  const handleGenerate = async () => {
    const activeSample = samples.find(s => s.id === activeSampleId);

    if (!activeSample) {
        setErrorMessage("Please select or upload a main voice sample.");
        setStatus('error');
        return;
    }
    if (!voiceId) {
        setErrorMessage("Please provide a Voice ID.");
        setStatus('error');
        return;
    }
    if (!validateVoiceId(voiceId)) {
        setErrorMessage("Voice ID must start with a letter, be 8-256 chars long, and contain only letters, numbers, '-' or '_'.");
        setStatus('error');
        return;
    }
    if (!legalConfirmed) {
        setErrorMessage("Please confirm you have the necessary rights.");
        setStatus('error');
        return;
    }
    // Validation for Prompt
    if (showPromptSection && promptFile && !promptText.trim()) {
        setErrorMessage("If using a prompt audio, you must provide the corresponding transcript text.");
        setStatus('error');
        return;
    }

    setIsProcessing(true);
    setStatus('idle');
    setErrorMessage('');
    setPreviewAudioUrl('');

    try {
      // 1. Upload Main Voice File
      const uploadResp = await uploadFile(apiKey, activeSample.file, 'voice_clone');
      
      let promptFileId = undefined;
      
      // 2. Upload Prompt File (if exists)
      if (showPromptSection && promptFile) {
          const promptUploadResp = await uploadFile(apiKey, promptFile, 'prompt_audio');
          promptFileId = promptUploadResp.file.file_id;
      }

      // 3. Call Clone API
      const cloneResp = await cloneVoice(apiKey, {
        file_id: uploadResp.file.file_id,
        voice_id: voiceId,
        text: previewText,
        model: 'speech-2.6-hd',
        need_noise_reduction: removeNoise,
        need_volume_normalization: optimizeAccent, 
        language_boost: selectedLanguage === 'auto' ? 'auto' : selectedLanguage,
        clone_prompt: (promptFileId && promptText) ? {
            prompt_audio: promptFileId,
            prompt_text: promptText
        } : undefined
      });

      if (cloneResp.base_resp.status_code === 0) {
        if (cloneResp.demo_audio) {
            setPreviewAudioUrl(cloneResp.demo_audio);
        }
        // Update Usage for preview generation
        if (onUsageUpdate && previewText) {
            onUsageUpdate(previewText.length);
        }

        setStatus('generated');
        setRegName(voiceId); 
      } else {
        throw new Error(cloneResp.base_resp.status_msg);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An unknown error occurred');
      setStatus('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOpenRegistration = () => {
    setShowRegistrationModal(true);
  };

  const handleSaveVoice = () => {
    const finalName = regName || voiceId;
    
    // 1. Save friendly name map
    const localNames = JSON.parse(localStorage.getItem('minimax_voice_names') || '{}');
    localNames[voiceId] = finalName;
    localStorage.setItem('minimax_voice_names', JSON.stringify(localNames));

    // 2. Save Full Voice Object to Local Storage
    const localVoicesJson = localStorage.getItem('minimax_local_voices');
    const localVoices: Voice[] = localVoicesJson ? JSON.parse(localVoicesJson) : [];
    
    // Check if exists
    if (!localVoices.some(v => v.id === voiceId)) {
        const newVoice: Voice = {
            id: voiceId,
            name: finalName,
            type: 'voice_cloning', 
            description: regDesc || `Custom voice (${regGender || 'Unspecified'})`
        };
        localVoices.push(newVoice);
        localStorage.setItem('minimax_local_voices', JSON.stringify(localVoices));
    }

    // 3. Close modal and trigger refresh
    setShowRegistrationModal(false);
    setStatus('success');
    onVoiceCreated();
    
    // 4. Reset for next
    setTimeout(() => {
        setVoiceId(`Voice_${Math.random().toString(36).substring(2, 10)}_${Date.now().toString().slice(-4)}`);
        setStatus('idle');
        setPreviewAudioUrl('');
        setRegName('');
        setRegDesc('');
        setRegGender('');
        setPromptFile(null);
        setPromptText('');
        setPromptFileUrl('');
        setShowPromptSection(false);
    }, 2000);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6 animate-fade-in relative">
        <h2 className="text-xl font-semibold text-gray-200">Import your Voice</h2>
        
        {/* Import Cards (Main Voice) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="relative bg-gray-800 border-2 border-dashed border-gray-600 rounded-xl p-8 flex flex-col items-center justify-center hover:border-minimax-500 hover:bg-gray-800/80 transition-all group h-64">
                <input 
                    type="file" 
                    accept=".mp3,.wav,.m4a"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="w-16 h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center mb-4 text-blue-400 group-hover:scale-110 transition-transform">
                     <FileAudio size={32} />
                </div>
                <h3 className="font-semibold text-gray-200">Add or drop a file</h3>
                <p className="text-sm text-gray-500 mt-1">Up to 20MB each</p>
                <p className="text-xs text-gray-600 mt-2">mp3, wav, m4a</p>
            </div>

            <div className="bg-gray-800 border-2 border-dashed border-gray-600 rounded-xl p-8 flex flex-col items-center justify-center h-64 relative">
                {isRecording ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/90 rounded-xl z-20">
                         <div className="text-4xl font-mono text-minimax-400 mb-6 font-bold">{formatTime(recordingTime)}</div>
                         <div className="animate-pulse w-3 h-3 bg-red-500 rounded-full mb-2"></div>
                         <button 
                            onClick={stopRecording}
                            className="px-8 py-3 bg-red-600 hover:bg-red-500 text-white rounded-full font-semibold flex items-center gap-2 transition-colors"
                         >
                            <Square size={16} fill="currentColor" /> Stop Recording
                         </button>
                    </div>
                ) : (
                    <>
                        <button 
                            onClick={startRecording}
                            className="w-16 h-16 bg-purple-500/20 rounded-2xl flex items-center justify-center mb-4 text-purple-400 hover:bg-purple-500/30 hover:scale-110 transition-all"
                        >
                            <Mic size={32} />
                        </button>
                        <h3 className="font-semibold text-gray-200">Record audio</h3>
                        <p className="text-sm text-gray-500 mt-1">10-60 seconds long</p>
                    </>
                )}
            </div>
        </div>

        {/* Uploaded Samples List */}
        <div>
            <div className="flex justify-between items-center mb-2">
                 <h3 className="text-sm font-medium text-gray-400">Main Voice Samples {samples.length}/10</h3>
            </div>
            
            {samples.length === 0 ? (
                <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700 text-center text-gray-500 text-sm italic">
                    No samples added yet.
                </div>
            ) : (
                <div className="space-y-2">
                    {samples.map((sample) => (
                        <div 
                            key={sample.id}
                            onClick={() => setActiveSampleId(sample.id)}
                            className={`flex items-center gap-4 p-3 rounded-lg border cursor-pointer transition-all ${
                                activeSampleId === sample.id 
                                ? 'bg-minimax-900/30 border-minimax-500/50 ring-1 ring-minimax-500/30' 
                                : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                            }`}
                        >
                            <div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center shrink-0">
                                <FileAudio size={20} className={activeSampleId === sample.id ? 'text-minimax-400' : 'text-gray-500'} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium truncate ${activeSampleId === sample.id ? 'text-minimax-100' : 'text-gray-300'}`}>
                                    {sample.file.name}
                                </p>
                                <p className="text-xs text-gray-500">
                                    {(sample.file.size / 1024 / 1024).toFixed(2)} MB
                                </p>
                            </div>
                             <audio src={sample.url} controls className="h-8 w-48 opacity-60 hover:opacity-100 transition-opacity" />
                            <button 
                                onClick={(e) => { e.stopPropagation(); removeSample(sample.id); }}
                                className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>

        {/* Prompt Audio (Enhancement) */}
        <div className="border-t border-gray-700 pt-4">
             <button 
                onClick={() => setShowPromptSection(!showPromptSection)}
                className="flex items-center gap-2 text-minimax-400 hover:text-minimax-300 text-sm font-semibold mb-3"
             >
                {showPromptSection ? <X size={16} /> : <Plus size={16} />}
                {showPromptSection ? 'Remove Enhancement' : 'Enhance Similarity (Optional)'}
             </button>

             {showPromptSection && (
                 <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700 space-y-4 animate-fade-in">
                     <div className="flex items-start gap-2 text-gray-400 text-xs mb-2">
                        <Info size={16} className="shrink-0 mt-0.5" />
                        <p>Upload a short, clear reference audio (&lt; 8s) and type exactly what is said. This helps the AI understand the accent and tone better.</p>
                     </div>

                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* File Upload */}
                        <div className="relative bg-gray-900 border border-dashed border-gray-600 rounded-lg h-32 flex flex-col items-center justify-center hover:border-gray-500 transition-colors">
                            {promptFile ? (
                                <div className="w-full h-full flex flex-col items-center justify-center relative">
                                    <FileAudio size={24} className="text-minimax-400 mb-2"/>
                                    <p className="text-xs text-gray-300 truncate w-3/4 text-center">{promptFile.name}</p>
                                    <button 
                                        onClick={(e) => {e.preventDefault(); setPromptFile(null); setPromptFileUrl('');}}
                                        className="absolute top-2 right-2 text-gray-500 hover:text-red-400"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <input type="file" accept=".mp3,.wav,.m4a" onChange={handlePromptFileChange} className="absolute inset-0 opacity-0 cursor-pointer" />
                                    <Upload size={20} className="text-gray-500 mb-2" />
                                    <p className="text-xs text-gray-400">Upload Reference Audio</p>
                                    <p className="text-[10px] text-gray-500">Max 8 seconds</p>
                                </>
                            )}
                        </div>

                        {/* Transcript */}
                        <div>
                            <textarea 
                                value={promptText}
                                onChange={(e) => setPromptText(e.target.value)}
                                placeholder="Type exactly what is said in the reference audio..."
                                className="w-full h-32 bg-gray-900 border border-gray-600 rounded-lg p-3 text-xs text-gray-200 resize-none focus:border-minimax-500 outline-none"
                            />
                        </div>
                     </div>
                 </div>
             )}
        </div>

        {/* Voice ID Field */}
        <div className="border-t border-gray-700 pt-4">
             <h3 className="text-sm font-medium text-gray-400 mb-2">Voice ID</h3>
             <input
                type="text"
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
                placeholder="Enter a unique name for your voice (e.g. MyVoice01)"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-minimax-500 focus:ring-1 focus:ring-minimax-500 outline-none transition-all placeholder-gray-500"
              />
              <p className="text-xs text-gray-500 mt-1">8-256 characters, starts with letter. Allowed: letters, numbers, '-', '_'</p>
        </div>

        {/* Advanced Settings */}
        <div className="space-y-4">
             <div className="flex items-center gap-2">
                 <h3 className="text-sm font-medium text-gray-400">Advanced Settings (Optional)</h3>
             </div>
             <div className="space-y-3">
                 <label className="flex items-center cursor-pointer gap-3">
                     <div className="relative">
                         <input type="checkbox" className="sr-only" checked={removeNoise} onChange={(e) => setRemoveNoise(e.target.checked)} />
                         <div className={`block w-10 h-6 rounded-full transition-colors ${removeNoise ? 'bg-minimax-600' : 'bg-gray-700'}`}></div>
                         <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${removeNoise ? 'translate-x-4' : ''}`}></div>
                     </div>
                     <span className="text-sm text-gray-300">Remove Background Noise</span>
                     <Info size={14} className="text-gray-500" />
                 </label>

                 <label className="flex items-center cursor-pointer gap-3">
                     <div className="relative">
                         <input type="checkbox" className="sr-only" checked={optimizeAccent} onChange={(e) => setOptimizeAccent(e.target.checked)} />
                         <div className={`block w-10 h-6 rounded-full transition-colors ${optimizeAccent ? 'bg-minimax-600' : 'bg-gray-700'}`}></div>
                         <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${optimizeAccent ? 'translate-x-4' : ''}`}></div>
                     </div>
                     <span className="text-sm text-gray-300">Enable Accent Optimization</span>
                     <Info size={14} className="text-gray-500" />
                 </label>
             </div>
        </div>

        {/* Text to Preview */}
        <div className="bg-white rounded-lg p-1 overflow-hidden">
             <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
                 <div className="flex items-center gap-2">
                    <Globe size={14} className="text-gray-500"/>
                    <select
                        value={selectedLanguage}
                        onChange={(e) => setSelectedLanguage(e.target.value)}
                        className="text-xs font-semibold text-gray-700 bg-transparent border-none focus:ring-0 cursor-pointer outline-none"
                    >
                        {SUPPORTED_LANGUAGES.map(lang => (
                            <option key={lang.code} value={lang.code}>{lang.name}</option>
                        ))}
                    </select>
                 </div>
                 <button onClick={() => setPreviewText('')} className="text-gray-400 hover:text-gray-600"><X size={14}/></button>
             </div>
             <div className="relative">
                 <textarea
                    value={previewText}
                    onChange={(e) => setPreviewText(e.target.value)}
                    maxLength={300}
                    className="w-full p-4 h-24 text-gray-800 text-sm resize-none focus:outline-none"
                    placeholder="Enter text to preview your cloned voice..."
                 />
                 <div className="flex justify-between px-4 pb-2 text-xs text-gray-400">
                     <span>{previewText.length} / 300 characters</span>
                     <span>Remaining Previews: 10</span>
                 </div>
             </div>
        </div>

        {/* Legal & Actions */}
        <div className="pt-4 border-t border-gray-700">
             <label className="flex items-start gap-3 cursor-pointer mb-6">
                 <input 
                    type="checkbox" 
                    checked={legalConfirmed} 
                    onChange={(e) => setLegalConfirmed(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded border-gray-600 bg-gray-700 text-minimax-600 focus:ring-minimax-500"
                 />
                 <span className="text-xs text-gray-400 leading-relaxed">
                    I confirm that I have all necessary rights and authorization to upload these voice samples to generate AI content, and I reaffirm that I will abide by the <u className="hover:text-gray-300">Terms of Service</u> and refrain from using any generated content for illegal or harmful purposes.
                 </span>
             </label>

             <div className="flex items-center justify-between">
                 <span className="text-sm text-gray-500">Voice slots remaining: 3/3</span>
                 
                 <button
                    onClick={handleGenerate}
                    disabled={isProcessing || !activeSampleId || !voiceId || !legalConfirmed}
                    className={`
                        px-8 py-3 rounded-full font-semibold flex items-center gap-2 transition-all shadow-lg
                        ${isProcessing || !activeSampleId || !voiceId || !legalConfirmed
                            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                            : 'bg-[#8b5cf6] hover:bg-[#7c3aed] text-white hover:shadow-purple-500/25'
                        }
                    `}
                 >
                    {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} fill="currentColor" />}
                    {isProcessing ? 'Generating...' : 'Generate'}
                 </button>
             </div>
        </div>

        {/* Feedback Messages & Success Action */}
        {status === 'error' && (
            <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg flex items-start gap-3">
              <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={20} />
              <p className="text-red-200 text-sm">{errorMessage}</p>
            </div>
        )}

        {status === 'success' && (
             <div className="p-4 bg-green-900/20 border border-green-800 rounded-lg flex items-center gap-3 animate-fade-in">
                 <CheckCircle className="text-green-500" size={20} />
                 <p className="text-green-200 text-sm">Voice Saved Successfully!</p>
             </div>
        )}

        {status === 'generated' && (
            <div className="p-6 bg-minimax-900/20 border border-minimax-500/30 rounded-xl space-y-4 animate-fade-in">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <CheckCircle className="text-minimax-400" size={24} />
                        <div>
                            <h3 className="text-minimax-100 font-semibold text-lg">Voice Generated!</h3>
                            <p className="text-minimax-300/80 text-sm">Listen to the preview below. If you like it, register it.</p>
                        </div>
                    </div>
                </div>
                
                {previewAudioUrl && (
                    <div className="bg-gray-900/50 rounded-lg p-4">
                        <div className="flex justify-between items-center mb-2">
                             <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Preview Audio</p>
                             <button 
                                onClick={handleOpenRegistration}
                                className="bg-[#8b5cf6] hover:bg-[#7c3aed] text-white px-4 py-1.5 rounded-full text-sm font-semibold transition-colors shadow-lg"
                             >
                                Confirm & Register Voice
                             </button>
                        </div>
                        <audio src={previewAudioUrl} controls className="w-full h-10" />
                    </div>
                )}
            </div>
        )}

        {/* Registration Modal */}
        {showRegistrationModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
                    <div className="flex justify-between items-center p-4 border-b border-gray-100">
                        <h3 className="text-lg font-bold text-gray-800">Voice Registration</h3>
                        <button onClick={() => setShowRegistrationModal(false)} className="text-gray-400 hover:text-gray-600">
                            <X size={20} />
                        </button>
                    </div>
                    
                    <div className="p-6 space-y-5">
                        {/* Voice Name */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Voice Name</label>
                            <input 
                                type="text" 
                                value={regName}
                                onChange={(e) => setRegName(e.target.value)}
                                placeholder="Type to name this voice"
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-gray-800 focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none transition-all"
                            />
                        </div>

                        {/* Label */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Label</label>
                            <div className="flex gap-3">
                                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-700 text-sm min-w-[120px]">
                                    {selectedLanguage === 'auto' ? 'Auto Detect' : selectedLanguage}
                                    <button className="ml-auto text-gray-400 hover:text-gray-600"><X size={14}/></button>
                                </div>
                                <div className="relative flex-1">
                                    <select 
                                        value={regGender}
                                        onChange={(e) => setRegGender(e.target.value)}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-gray-700 appearance-none focus:ring-2 focus:ring-purple-200 outline-none"
                                    >
                                        <option value="" disabled>Select gender</option>
                                        <option value="male">Male</option>
                                        <option value="female">Female</option>
                                    </select>
                                    <ChevronDown className="absolute right-3 top-3 text-gray-400 pointer-events-none" size={16}/>
                                </div>
                            </div>
                        </div>

                        {/* Description */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description</label>
                            <textarea 
                                value={regDesc}
                                onChange={(e) => setRegDesc(e.target.value)}
                                placeholder="Type to describe this voice"
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-800 h-24 resize-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none transition-all"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end items-center gap-3 p-4 border-t border-gray-100 bg-gray-50">
                        <button 
                            onClick={() => setShowRegistrationModal(false)}
                            className="px-6 py-2 rounded-full text-gray-600 font-medium hover:bg-gray-200 transition-colors text-sm"
                        >
                            Back
                        </button>
                        <button 
                            onClick={handleSaveVoice}
                            className="px-6 py-2 rounded-full bg-[#a88bf5] hover:bg-[#9370db] text-white font-medium transition-colors text-sm shadow-md"
                        >
                            Save Voice
                        </button>
                    </div>
                </div>
            </div>
        )}

    </div>
  );
};
