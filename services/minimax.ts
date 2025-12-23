import { T2ARequest, T2AResponse, UploadFileResponse, VoiceCloneResponse, GetVoiceResponse, DeleteVoiceResponse, VoiceCloneRequest, AsyncT2ARequest, AsyncT2ACreateResponse, AsyncT2AQueryResponse } from '../types';

const BASE_URL = 'https://api.minimax.io';

const getHeaders = (apiKey: string, contentType: string = 'application/json') => {
  const headers: HeadersInit = {
    'Authorization': `Bearer ${apiKey}`,
  };
  if (contentType !== 'multipart/form-data') {
    headers['Content-Type'] = contentType;
  }
  return headers;
};

// --- Utils ---

export const hexToBlob = (hexString: string, type: string = 'audio/mpeg'): Blob => {
  // Remove any spaces or newlines just in case
  const cleanHex = hexString.replace(/\s+/g, '');
  if (cleanHex.length % 2 !== 0) {
    throw new Error('Invalid hex string');
  }
  
  const byteArray = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    byteArray[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
  }
  
  return new Blob([byteArray], { type });
};

// --- API Calls ---

export const uploadFile = async (
  apiKey: string, 
  file: File, 
  purpose: 'voice_clone' | 'prompt_audio'
): Promise<UploadFileResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('purpose', purpose);

  const response = await fetch(`${BASE_URL}/v1/files/upload`, {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${apiKey}`,
        // Do NOT set Content-Type header for FormData, browser sets it with boundary
    },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.base_resp?.status_msg || `Upload failed: ${response.statusText}`);
  }

  return response.json();
};

export const cloneVoice = async (
  apiKey: string,
  payload: VoiceCloneRequest
): Promise<VoiceCloneResponse> => {
  const response = await fetch(`${BASE_URL}/v1/voice_clone`, {
    method: 'POST',
    headers: getHeaders(apiKey),
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok || data.base_resp?.status_code !== 0) {
    throw new Error(data.base_resp?.status_msg || `Cloning failed: ${response.statusText}`);
  }

  return data;
};

export const generateSpeech = async (
  apiKey: string,
  payload: T2ARequest
): Promise<T2AResponse> => {
  const response = await fetch(`${BASE_URL}/v1/t2a_v2`, {
    method: 'POST',
    headers: getHeaders(apiKey),
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok || data.base_resp?.status_code !== 0) {
    throw new Error(data.base_resp?.status_msg || `Synthesis failed: ${response.statusText}`);
  }

  return data;
};

export const getVoices = async (apiKey: string): Promise<GetVoiceResponse> => {
  const response = await fetch(`${BASE_URL}/v1/get_voice`, {
    method: 'POST',
    headers: getHeaders(apiKey),
    body: JSON.stringify({
      voice_type: 'all',
    }),
  });

  const data = await response.json();

  if (!response.ok || data.base_resp?.status_code !== 0) {
    throw new Error(data.base_resp?.status_msg || `Failed to fetch voices: ${response.statusText}`);
  }

  return data;
};

export const deleteVoice = async (apiKey: string, voiceId: string, voiceType: string): Promise<DeleteVoiceResponse> => {
  const response = await fetch(`${BASE_URL}/v1/delete_voice`, {
    method: 'POST',
    headers: getHeaders(apiKey),
    body: JSON.stringify({
      voice_id: voiceId,
      voice_type: voiceType,
    }),
  });

  const data = await response.json();

  if (!response.ok || data.base_resp?.status_code !== 0) {
    throw new Error(data.base_resp?.status_msg || `Failed to delete voice: ${response.statusText}`);
  }

  return data;
};

// --- Async T2A (Long Audio) ---

export const createAsyncT2ATask = async (
    apiKey: string,
    payload: AsyncT2ARequest
): Promise<AsyncT2ACreateResponse> => {
    const response = await fetch(`${BASE_URL}/v1/t2a_async_v2`, {
        method: 'POST',
        headers: getHeaders(apiKey),
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok || data.base_resp?.status_code !== 0) {
        throw new Error(data.base_resp?.status_msg || `Async Task Creation Failed`);
    }
    return data;
};

export const queryAsyncT2ATask = async (
    apiKey: string,
    taskId: string
): Promise<AsyncT2AQueryResponse> => {
    const response = await fetch(`${BASE_URL}/v1/query/t2a_async_query_v2?task_id=${taskId}`, {
        method: 'GET',
        headers: getHeaders(apiKey)
    });

    const data = await response.json();
    // Note: status_code might be 0 even if task is processing, we check 'status' field in components
    if (!response.ok) {
        throw new Error(`Query Failed: ${response.statusText}`);
    }
    return data;
};

export const retrieveAsyncFile = async (
    apiKey: string,
    fileId: number | string
): Promise<Blob> => {
    const response = await fetch(`${BASE_URL}/v1/files/retrieve_content?file_id=${fileId}`, {
        method: 'GET',
        headers: getHeaders(apiKey) // No content-type needed for GET
    });

    if (!response.ok) {
        throw new Error(`Download Failed: ${response.statusText}`);
    }

    return await response.blob();
};