import {expect,it} from 'vitest';
import {signMedia,verifyMedia} from '@/shared/mediaProtocol';
import {timestampRef,timestampSeconds} from '@/shared/media';
import {uploadMediaSchema} from '@/lib/media/schema';
const job='11111111-1111-4111-8111-111111111111',secret='synthetic-test-secret-at-least-32-characters';
it('authenticates job id/timestamp/purpose/body with constant-length HMAC and a five-minute window',()=>{
 const now=1800000000000,time=Math.floor(now/1000),signature=signMedia(job,time,secret);expect(verifyMedia(job,time,signature,secret,'jobs','',now)).toBe(true);
 for(const [id,timestamp,sig,key] of [['different-job',time,signature,secret],[job,time-301,signMedia(job,time-301,secret),secret],[job,time+61,signMedia(job,time+61,secret),secret],[job,time,signature,'short'],[job,time,'nothex',secret]] as const)expect(verifyMedia(id,timestamp,sig,key,'jobs','',now)).toBe(false);
 const body='{"action":"extract"}',signed=signMedia(job,time,secret,'extract',body);expect(verifyMedia(job,time,signed,secret,'extract',body,now)).toBe(true);expect(verifyMedia(job,time,signed,secret,'extract',body+' ',now)).toBe(false);expect(verifyMedia(job,time,signed,secret,'claim',body,now)).toBe(false);
});
it('validates media reservations, extensions and timestamp round trips',()=>{
 expect(uploadMediaSchema.safeParse({name:'meeting.mp3',size:500*1024*1024,duration:1800}).success).toBe(true);
 for(const input of [{name:'evil.exe',size:10},{name:'a.mp4',size:500*1024*1024+1},{name:'a.mp3',size:10,duration:1801}])expect(uploadMediaSchema.safeParse(input).success).toBe(false);
 expect(timestampRef(125.9)).toBe('02:05');expect(timestampSeconds('02:05')).toBe(125);expect(timestampSeconds('02:99')).toBeNull();
});
