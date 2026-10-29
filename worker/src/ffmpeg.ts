import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {z} from 'zod';
import {MEDIA_SECONDS} from '../../shared/media.js';
import {WorkerFailure} from './api.js';
const exec=promisify(execFile);
const formats:Record<string,string>={'audio/mpeg':'mp3','audio/wav':'wav','audio/mp4':'mov','audio/ogg':'ogg','video/mp4':'mov','video/quicktime':'mov','video/webm':'matroska'};
export async function command(binary:string,args:string[],timeout=120000){return exec(binary,args,{timeout,maxBuffer:1024*1024,killSignal:'SIGKILL',encoding:'utf8'});}
export async function probeMedia(path:string,mimeType:string){
 const format=formats[mimeType];if(!format)throw new WorkerFailure('Unsupported media format.');
 const {stdout}=await command('ffprobe',['-v','error','-protocol_whitelist','file,pipe','-f',format,'-show_format','-show_streams','-of','json',path],30000);
 const parsed=z.object({format:z.object({duration:z.string().optional()}),streams:z.array(z.object({codec_type:z.string(),codec_name:z.string().optional(),duration:z.string().optional(),width:z.number().optional(),height:z.number().optional()})).max(8)}).parse(JSON.parse(stdout));
 const duration=Number(parsed.format.duration??Math.max(...parsed.streams.map(stream=>Number(stream.duration)||0)));
 if(!Number.isFinite(duration)||duration<=0||duration>MEDIA_SECONDS)throw new WorkerFailure('Recordings must be 30 minutes or shorter.');
 const audio=parsed.streams.find(stream=>stream.codec_type==='audio'),video=parsed.streams.find(stream=>stream.codec_type==='video');
 const audioCodecs=['mp3','aac','vorbis','opus','alac','flac','pcm_s16le','pcm_s24le','pcm_s32le','pcm_f32le','pcm_u8','pcm_s16be','adpcm_ima_wav'];
 const videoCodecs=['h264','hevc','vp8','vp9','av1','mpeg4','mjpeg','prores'];
 if(!audio&&!video||audio&&!audioCodecs.includes(audio.codec_name??'')||video&&!videoCodecs.includes(video.codec_name??'')||video&&(video.width??0)*(video.height??0)>40000000)throw new WorkerFailure('The recording contains unsupported codecs or oversized frames.');
 return {duration,format,hasAudio:Boolean(audio),hasVideo:Boolean(video)};
}
export async function splitAudio(input:string,directory:string,format:string){
 await command('ffmpeg',['-nostdin','-v','error','-threads','2','-protocol_whitelist','file,pipe','-f',format,'-i',input,'-map','0:a:0','-vn','-ac','1','-ar','16000','-c:a','pcm_s16le','-f','segment','-segment_time','600','-reset_timestamps','1',join(directory,'chunk-%03d.wav')],300000);
 return (await readdir(directory)).filter(name=>/^chunk-\d+\.wav$/.test(name)).sort().map(name=>join(directory,name));
}
export async function extractFrames(input:string,directory:string,format:string,duration:number){
 const interval=Math.max(10,duration/40),common=['-nostdin','-v','info','-threads','2','-protocol_whitelist','file,pipe','-f',format,'-i',input,'-an'];
 await command('ffmpeg',[...common,'-vf',`fps=1/${interval},scale=512:-2`,'-frames:v','40','-pix_fmt','yuvj420p','-threads','1','-q:v','10',join(directory,'interval-%03d.jpg')],300000);
 const scene=await command('ffmpeg',[...common,'-vf',"select=gt(scene\\,0.4),showinfo,scale=512:-2",'-vsync','vfr','-frames:v','20','-pix_fmt','yuvj420p','-threads','1','-q:v','10',join(directory,'scene-%03d.jpg')],300000);
 const sceneTimes=[...scene.stderr.matchAll(/pts_time:([0-9.]+)/g)].map(match=>Number(match[1]));
 const names=(await readdir(directory)).filter(name=>/^(interval|scene)-\d+\.jpg$/.test(name)).sort();const frames:{seconds:number;data:string}[]=[];
 for(const name of names){const index=Number(name.match(/(\d+)\.jpg$/)![1])-1,seconds=name.startsWith('interval')?index*interval:sceneTimes[index];if(!Number.isFinite(seconds)||seconds>duration)continue;
  let bytes=await readFile(join(directory,name));if(bytes.length>36000){const smaller=join(directory,'small-'+name);await command('ffmpeg',['-nostdin','-v','error','-i',join(directory,name),'-vf','scale=384:-2','-frames:v','1','-q:v','25',smaller]);bytes=await readFile(smaller);}if(bytes.length<=36000)frames.push({seconds,data:bytes.toString('base64')});
 }
 return frames.sort((a,b)=>a.seconds-b.seconds).slice(0,60);
}
