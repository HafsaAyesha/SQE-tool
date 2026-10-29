// Test-only Upstash REST-compatible transport backed by real Redis/Lua, never an in-memory limiter.
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from 'redis';
export async function startLocalRedis(){
  const name=`costlens-rate-${randomUUID().slice(0,8)}`;
  const dockerArgs=['--host=unix:///var/run/docker.sock'];
  const dockerEnv={...process.env};for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete dockerEnv[key];
  const docker=(args)=>execFileSync('docker',[...dockerArgs,...args],{env:dockerEnv,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  let redis,server;
  const close=async()=>{if(server)await new Promise(resolve=>server.close(resolve));if(redis?.isOpen)await redis.quit();try{docker(['rm','-f',name]);}catch{}};
  try{
    docker(['run','--rm','-d','--name',name,'-p','127.0.0.1::6379','redis:7-alpine','redis-server','--save','','--appendonly','no']);
    const binding=docker(['port',name,'6379/tcp']).trim();const port=binding.split(':').at(-1);
    redis=createClient({url:`redis://127.0.0.1:${port}`,socket:{connectTimeout:2000,reconnectStrategy:false}});redis.on('error',()=>{});
    await redis.connect();
    const token=randomBytes(32).toString('base64url');
    server=createServer(async(req,res)=>{
      res.setHeader('Content-Type','application/json');
      if(req.headers.authorization!==`Bearer ${token}`){res.writeHead(401);res.end(JSON.stringify({error:'Unauthorized'}));return;}
      try{
        const chunks=[];let length=0;for await(const part of req){length+=part.length;if(length>2*1024*1024)throw new Error('Test command too large');chunks.push(part);}
        const command=JSON.parse(Buffer.concat(chunks).toString());
        const encode=value=>typeof value==='string'&&value!=='OK'&&req.headers['upstash-encoding']==='base64'?Buffer.from(value).toString('base64'):Array.isArray(value)?value.map(encode):value;
        const run=async(args)=>{
          // Upstash's key-locking shebang is metadata. Stock Redis uses a stronger global Lua lock.
          // Execute the identical Lua body; production SDK scripts are never changed.
          if(String(args[0]).toUpperCase()==='EVAL'&&typeof args[1]==='string')args=[args[0],args[1].replace(/^#!lua flags=allow-key-locking\n/,''),...args.slice(2)];
          try{return {result:encode(await redis.sendCommand(args.map(value=>typeof value==='string'?value:JSON.stringify(value))))};}catch(error){return {error:error.message};}};
        const result=req.url==='/pipeline'||req.url==='/multi-exec'?await Promise.all(command.map(run)):await run(command);
        res.end(JSON.stringify(result));
      }catch{res.writeHead(400);res.end(JSON.stringify({error:'Invalid test Redis command'}));}
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    return {env:{UPSTASH_REDIS_REST_URL:`http://127.0.0.1:${server.address().port}`,UPSTASH_REDIS_REST_TOKEN:token,TRUST_PROXY_HEADERS:'true',COSTLENS_LOCAL_REDIS:'1'},close};
  }catch(error){await close();throw error;}
}
