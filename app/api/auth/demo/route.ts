import {NextResponse} from 'next/server';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {enforceRateLimit,loginIdentifier,rateLimitResponse} from '@/lib/security/rateLimit';
import {readMediaJson} from '@/lib/media/http';
import {isDemoUser} from '@/lib/demo/access';
const configSchema=z.object({email:z.email(),password:z.string().min(16),origin:z.url()});
const headers={'Cache-Control':'private, no-store'};
export async function POST(request:Request){
 let signedIn:Awaited<ReturnType<typeof createClient>>|undefined;
 try{
  await enforceRateLimit('login',loginIdentifier(request.headers));
  const config=configSchema.safeParse({email:process.env.DEMO_EMAIL??'demo@costlens.example',password:process.env.DEMO_PASSWORD,origin:process.env.APP_URL});
  if(process.env.DEMO_ENABLED!=='true'||!config.success)return NextResponse.json({error:'The demo is not available yet. Please try again later.'},{status:503,headers});
  if(request.headers.get('origin')!==new URL(config.data.origin).origin)return NextResponse.json({error:'Open the demo from the CostLens home page.'},{status:403,headers});
  let json:unknown;try{json=JSON.parse(await readMediaJson(request,256));}catch{return NextResponse.json({error:'The demo request is invalid.'},{status:400,headers});}
  const body=z.object({}).strict().safeParse(json);if(!body.success)return NextResponse.json({error:'The demo request is invalid.'},{status:400,headers});
  const client=await createClient();const login=await client.auth.signInWithPassword({email:config.data.email,password:config.data.password});
  if(login.error||!login.data.user)throw new Error('Demo sign-in failed');signedIn=client;
  const id=z.string().uuid().safeParse(login.data.user.app_metadata?.demo_project_id);
  if(!isDemoUser(login.data.user)||login.data.user.app_metadata?.demo_seed_complete!==true||!id.success)throw new Error('Demo seed is incomplete');
  const project=await client.from('projects').select('id').eq('id',id.data).eq('owner_id',login.data.user.id).maybeSingle();if(project.error||!project.data)throw new Error('Demo project is unavailable');
  return NextResponse.json({redirect:`/projects/${id.data}`},{headers});
 }catch(error){if(signedIn)await signedIn.auth.signOut().catch(()=>{});const limited=rateLimitResponse(error);if(limited)return limited;console.error('Demo unavailable',{type:error instanceof Error?error.name:'unknown'});return NextResponse.json({error:'The demo could not be opened. Please try again later.'},{status:503,headers});}
}
