
export interface UploadFileResponse {
  file: {
    file_id: number;
    bytes: number;
    created_at: number;
    filename: string;
    purpose: string;
  };
  base_resp: {
    status_code: number;
    status_msg: string;
  };
}

export interface VoiceCloneRequest {
  file_id: number;
  voice_id: string;
  text?: string;
  model?: string;
  need_noise_reduction?: boolean;
  need_volume_normalization?: boolean;
  language_boost?: string;
  clone_prompt?: {
    prompt_audio: number;
    prompt_text: string;
  };
}

export interface VoiceCloneResponse {
  input_sensitive: boolean;
  demo_audio: string;
  base_resp: {
    status_code: number;
    status_msg: string;
  };
}

export interface T2ARequest {
  model: string;
  text: string;
  stream: boolean;
  language_boost?: string;
  output_format?: string;
  voice_setting: {
    voice_id: string;
    speed: number;
    vol: number;
    pitch: number;
    emotion?: string;
  };
  audio_setting: {
    sample_rate: number;
    format: string;
    channel: number;
    bitrate?: number;
  };
  voice_modify?: {
      pitch: number;
      intensity: number;
      timbre: number;
      sound_effects?: string;
  };
  pronunciation_dict?: {
      tone?: string[];
  };
}

export interface T2AResponse {
  data: {
    audio: string;
    status: number;
  };
  base_resp: {
    status_code: number;
    status_msg: string;
  };
  extra_info: {
      audio_format: string;
      audio_length: number;
      usage_characters?: number;
  };
}

export interface AsyncT2ARequest {
  model: string;
  text: string;
  language_boost?: string;
  voice_setting: {
    voice_id: string;
    speed: number;
    vol: number;
    pitch: number;
  };
  audio_setting: {
    audio_sample_rate: number;
    bitrate: number;
    format: string;
    channel: number;
  };
}

export interface AsyncT2ACreateResponse {
  task_id: string;
  base_resp: {
    status_code: number;
    status_msg: string;
  };
}

export interface AsyncT2AQueryResponse {
  task_id: string;
  status: 'processing' | 'success' | 'failed' | 'canceled';
  file_id?: number;
  base_resp: {
    status_code: number;
    status_msg: string;
  };
}

export interface Voice {
  id: string;
  name: string;
  type: 'system' | 'voice_cloning' | 'voice_generation';
  description?: string;
}

export interface GetVoiceResponse {
  system_voice: { 
    voice_id: string; 
    voice_name: string; 
    description: string[]; 
    created_time: string 
  }[];
  voice_cloning: { 
    voice_id: string; 
    description: string[]; 
    created_time: string 
  }[];
  voice_generation: { 
    voice_id: string; 
    description: string[]; 
    created_time: string 
  }[];
  base_resp: { 
    status_code: number; 
    status_msg: string 
  };
}

export interface DeleteVoiceResponse {
  voice_id: string;
  created_time: string;
  base_resp: {
    status_code: number;
    status_msg: string;
  };
}

export const MODELS = [
  'speech-01-turbo',
  'speech-01-hd',
  'speech-02-turbo',
  'speech-02-hd',
  'speech-2.6-turbo',
  'speech-2.6-hd',
];

export const EMOTIONS = [
    { value: 'happy', label: 'Hạnh phúc' },
    { value: 'sad', label: 'Buồn bã' },
    { value: 'angry', label: 'Tức giận' },
    { value: 'fearful', label: 'Sợ hãi' },
    { value: 'disgusted', label: 'Ghê tởm' },
    { value: 'surprised', label: 'Ngạc nhiên' },
    { value: 'calm', label: 'Điềm tĩnh' },
    { value: 'fluent', label: 'Lưu loát' },
    { value: 'whisper', label: 'Thì thầm' }
];

export const SOUND_EFFECTS = [
    { value: '', label: 'Không có' },
    { value: 'spacious_echo', label: 'Vang không gian' },
    { value: 'auditorium_echo', label: 'Vang hội trường' },
    { value: 'lofi_telephone', label: 'Điện thoại Lo-Fi' },
    { value: 'robotic', label: 'Người máy' },
];

export const SUPPORTED_LANGUAGES = [
  { code: 'auto', name: 'Tự động phát hiện' },
  { code: 'Vietnamese', name: 'Tiếng Việt' },
  { code: 'English', name: 'Tiếng Anh' },
  { code: 'Chinese', name: 'Tiếng Trung' },
  { code: 'Japanese', name: 'Tiếng Nhật' },
  { code: 'Korean', name: 'Tiếng Hàn' },
  { code: 'Spanish', name: 'Tiếng Tây Ban Nha' },
  { code: 'French', name: 'Tiếng Pháp' },
  { code: 'German', name: 'Tiếng Đức' },
  { code: 'Italian', name: 'Tiếng Ý' },
  { code: 'Russian', name: 'Tiếng Nga' },
  { code: 'Portuguese', name: 'Tiếng Bồ Đào Nha' },
  { code: 'Thai', name: 'Tiếng Thái' },
  { code: 'Indonesian', name: 'Tiếng Indonesia' },
];
