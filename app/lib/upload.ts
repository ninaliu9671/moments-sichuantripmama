import { apiUrl } from './api-base';

type UploadResult = { objectKey?: string; error?: string };

function uploadFile(file: File, onProgress?: (percent: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', apiUrl('/media-upload'));
    request.timeout = 10 * 60 * 1000;
    request.setRequestHeader('Content-Type', file.type.split(';')[0] || 'application/octet-stream');
    request.upload.onprogress = event => {
      if (event.lengthComputable) onProgress?.(Math.min(99, Math.round(event.loaded * 100 / event.total)));
    };
    request.onload = () => {
      let result: UploadResult = {};
      try { result = JSON.parse(request.responseText) as UploadResult; } catch { /* Keep a useful status error. */ }
      if (request.status >= 200 && request.status < 300 && result.objectKey) resolve(result.objectKey);
      else reject(new Error(result.error || `文件上传失败（HTTP ${request.status}）。`));
    };
    request.onerror = () => reject(new Error('无法连接上传服务，请检查网络后重试。'));
    request.ontimeout = () => reject(new Error('上传等待超时，请检查网络后重试。'));
    request.send(file);
  });
}

/** Stream media through the same-origin HTTP function, then register its hash. */
export async function uploadToStorage(file: File, onProgress?: (percent: number) => void) {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const sha256 = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  onProgress?.(0);
  const objectKey = await uploadFile(file, onProgress);
  onProgress?.(100);
  return { objectKey, sha256 };
}
