export const MEDIA_BUCKET='media-uploads';
export const MEDIA_BYTES=500*1024*1024;
export const MEDIA_SECONDS=30*60;
export const MEDIA_EXTENSIONS=['mp3','wav','m4a','ogg','mp4','mov','webm'] as const;
export function timestampRef(seconds:number){const n=Math.floor(Math.max(0,seconds));return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;}
export function timestampSeconds(ref:string){if(!/^\d{2}:[0-5]\d$/.test(ref))return null;return Number(ref.slice(0,2))*60+Number(ref.slice(3));}
