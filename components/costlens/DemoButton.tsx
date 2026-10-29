'use client';
import {useState} from 'react';
import {LoaderCircle,ArrowRight} from 'lucide-react';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
export function DemoButton(){
 const [pending,setPending]=useState(false);
 async function open(){setPending(true);try{const response=await fetch('/api/auth/demo',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),result=await response.json();if(!response.ok)throw new Error(result.error??'The demo is unavailable.');if(typeof result.redirect!=='string'||!/^\/projects\/[a-f0-9-]{36}$/.test(result.redirect))throw new Error('The demo could not be opened.');window.location.assign(result.redirect);}catch(error){toast.error(error instanceof Error?error.message:'The demo could not be opened.');setPending(false);}}
 return <Button size="lg" variant="outline" className="rounded-xl" disabled={pending} onClick={()=>void open()}>{pending?<LoaderCircle className="animate-spin"/>:<ArrowRight/>}Try the demo</Button>;
}
