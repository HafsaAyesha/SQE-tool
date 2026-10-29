// Reproducible synthetic speech and spreadsheet animation, not a human recording.
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
const exec=promisify(execFile),directory=await mkdtemp(join(tmpdir(),'costlens-fixture-'));
const rows=[['Cloud hosting',100,80],['Developer tools',200,220],['AI API',150,175],['Security audit',300,280],['Domain registration',40,35],['Database hosting',120,130],['Accessibility review',90,85],['Report design',60,50]];
const spoken=[
 'For Code Audit, the cloud hosting budget is one hundred dollars. The actual cost paid is eighty dollars.',
 'For developer tools, the planned budget is two hundred dollars. We paid two hundred and twenty dollars.',
 'For the A I API, the estimated cost is one hundred and fifty dollars. The actual cost is one hundred and seventy five dollars.',
 'For the security audit, the budget is three hundred dollars. The actual amount paid is two hundred and eighty dollars.',
 'For domain registration, the estimated cost is forty dollars. We paid thirty five dollars.',
 'For database hosting, the budget is one hundred and twenty dollars. The actual cost is one hundred and thirty dollars.',
 'For accessibility review, the estimated cost is ninety dollars. We paid eighty five dollars.',
 'For report design, the planned budget is sixty dollars. The actual cost paid is fifty dollars.'
];
try{
 for(let index=0;index<8;index++){
  const text=join(directory,`${index}.txt`);await writeFile(text,spoken[index]);
  await exec('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i',`flite=textfile=${text}:voice=slt`,'-af','apad','-t','15','-ar','16000','-ac','1',join(directory,`${index}.wav`)],{timeout:30000});
  const lines=rows.map((row,n)=>`<g transform="translate(0 ${150+n*95-index*35})"><rect x="24" width="976" height="90" fill="${n%2?'#eef2ff':'white'}"/><text x="40" y="48">${row[0]}</text><text x="600" y="48">$${row[1]}.00</text><text x="800" y="48">$${row[2]}.00</text></g>`).join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="720"><rect width="100%" height="100%" fill="white"/><g font-family="sans-serif" font-size="28" fill="#0f172a">${lines}<rect width="1024" height="120" fill="#4f46e5"/><text x="36" y="48" fill="white">CodeAudit cost spreadsheet · USD</text><text x="40" y="100" fill="white">Item</text><text x="600" y="100" fill="white">Budget</text><text x="800" y="100" fill="white">Paid</text></g></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(join(directory,`frame-${index}.png`));
 }
 await writeFile(join(directory,'audio.txt'),rows.map((_,i)=>`file '${join(directory,`${i}.wav`)}'`).join('\n'));
 await exec('ffmpeg',['-nostdin','-v','error','-f','concat','-safe','0','-i',join(directory,'audio.txt'),'-c:a','libmp3lame','-b:a','64k','tests/fixtures/codeaudit-meeting.mp3','-y'],{timeout:60000});
 await writeFile(join(directory,'video.txt'),rows.map((_,i)=>`file '${join(directory,`frame-${i}.png`)}'\nduration 15`).join('\n')+`\nfile '${join(directory,'frame-7.png')}'\n`);
 await exec('ffmpeg',['-nostdin','-v','error','-threads','2','-f','concat','-safe','0','-i',join(directory,'video.txt'),'-i','tests/fixtures/codeaudit-meeting.mp3','-t','120','-r','2','-c:v','libx264','-preset','fast','-crf','28','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart','tests/fixtures/codeaudit-screen.mp4','-y'],{timeout:120000});
 await writeFile('tests/fixtures/codeaudit-media-transcript.json',JSON.stringify({synthetic:true,segments:spoken.map((text,index)=>({start:index*15,end:index*15+14,text})),rows:rows.map(([item,estimated,actual],index)=>({item,group:null,category:null,estimated,actual,currency:'USD',date:null,notes:null,sourceRef:`${String(Math.floor(index*15/60)).padStart(2,'0')}:${String(index*15%60).padStart(2,'0')}`,confidence:.9}))},null,2));
 console.log('Created synthetic 2-minute audio and spreadsheet video fixtures.');
}finally{await rm(directory,{recursive:true,force:true});}
