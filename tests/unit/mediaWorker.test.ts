import {afterEach,expect,it,vi} from 'vitest';
import {createServer,type Server} from 'node:http';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createWorker} from '../../worker/src/server';
import {probeMedia,splitAudio,extractFrames} from '../../worker/src/ffmpeg';
import {transcribeChunk} from '../../worker/src/process';
import {signMedia} from '@/shared/mediaProtocol';
let server:Server|undefined,directory:string|undefined;
afterEach(async()=>{vi.unstubAllGlobals();if(server)await new Promise<void>(resolve=>{server!.closeAllConnections();server!.close(()=>resolve());});server=undefined;if(directory)await rm(directory,{recursive:true,force:true});});
it('rejects unsigned/expired requests and accepts a fresh signature without processing a replay twice',async()=>{
 const config={appUrl:'http://127.0.0.1',secret:'synthetic-secret-more-than-32-characters',openaiKey:'synthetic',port:0};let finish:()=>void=()=>{};const process=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));const worker=createWorker(config,process);server=createServer(worker.app);await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));const address=server.address() as {port:number},url=`http://127.0.0.1:${address.port}/jobs`,jobId='11111111-1111-4111-8111-111111111111',timestamp=Math.floor(Date.now()/1000);
 const post=(time:number,signature='')=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-costlens-signature':signature},body:JSON.stringify({jobId,timestamp:time})});
 expect((await post(timestamp)).status).toBe(401);expect((await post(timestamp-301,signMedia(jobId,timestamp-301,config.secret))).status).toBe(401);
 const signature=signMedia(jobId,timestamp,config.secret);expect((await post(timestamp,signature)).status).toBe(202);expect((await post(timestamp,signature)).status).toBe(202);expect(process).toHaveBeenCalledTimes(1);finish();
});
it('probes both actual fixtures, makes 16kHz mono chunks and extracts timestamped bounded video frames',async()=>{
 directory=await mkdtemp(join(tmpdir(),'costlens-worker-test-'));const audio=await probeMedia('tests/fixtures/codeaudit-meeting.mp3','audio/mpeg'),video=await probeMedia('tests/fixtures/codeaudit-screen.mp4','video/mp4');expect(audio.duration).toBeGreaterThan(119);expect(audio.hasAudio).toBe(true);expect(video.hasVideo).toBe(true);
 const chunks=await splitAudio('tests/fixtures/codeaudit-meeting.mp3',directory,audio.format);expect(chunks).toHaveLength(1);const header=await readFile(chunks[0]);expect(header.readUInt16LE(22)).toBe(1);expect(header.readUInt32LE(24)).toBe(16000);expect(header.length).toBeLessThan(25*1024*1024);
 const frames=await extractFrames('tests/fixtures/codeaudit-screen.mp4',directory,video.format,video.duration);expect(frames.length).toBeGreaterThan(5);expect(frames.length).toBeLessThanOrEqual(60);expect(frames.some(frame=>frame.seconds>=100)).toBe(true);expect(frames.every(frame=>frame.seconds<=video.duration&&frame.data.length<=48000)).toBe(true);
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({segments:[{start:1,end:2,text:'Budget one hundred dollars.'}]})));expect(await transcribeChunk(chunks[0],1,1200,'synthetic')).toEqual([{start:601,end:602,text:'Budget one hundred dollars.'}]);
},60000);
it('rejects a renamed non-media input and a real audio header with excessive duration',async()=>{
 directory=await mkdtemp(join(tmpdir(),'costlens-worker-bad-'));const path=join(directory,'input');await writeFile(path,'MZ not an MP4');await expect(probeMedia(path,'video/mp4')).rejects.toThrow();
 const wav=Buffer.alloc(44+7200);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(1,24);wav.writeUInt32LE(2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(7200,40);await writeFile(path,wav);await expect(probeMedia(path,'audio/wav')).rejects.toThrow(/30 minutes/);
});
