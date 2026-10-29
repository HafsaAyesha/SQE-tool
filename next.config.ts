import type {NextConfig} from 'next';
function origin(value:string|undefined){if(!value)return null;try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.origin:null;}catch{return null;}}
function securityHeaders(env:NodeJS.ProcessEnv=process.env){
 const supabase=origin(env.NEXT_PUBLIC_SUPABASE_URL),redis=origin(env.UPSTASH_REDIS_REST_URL);
 const connections=["'self'",...(supabase?[supabase,supabase.replace(/^http/,'ws')]:['https://*.supabase.co','wss://*.supabase.co']),...(redis?[redis]:[])];
 if(env.NODE_ENV!=='production')connections.push('ws://localhost:*','ws://127.0.0.1:*');
 const csp=["default-src 'self'",`connect-src ${connections.join(' ')}`,`img-src 'self' data: blob: ${supabase??'https://*.supabase.co'}`,"frame-ancestors 'none'","object-src 'none'","base-uri 'self'","form-action 'self'",`script-src 'self' 'unsafe-inline'${env.NODE_ENV!=='production'?" 'unsafe-eval'":''}`,"style-src 'self' 'unsafe-inline'","font-src 'self'","media-src 'self' blob: "+(supabase??'https://*.supabase.co')].join('; ');
 return [{key:'Content-Security-Policy',value:csp},{key:'Strict-Transport-Security',value:'max-age=63072000; includeSubDomains'},{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},{key:'X-Frame-Options',value:'DENY'}];
}

const config:NextConfig = { poweredByHeader:false, async headers(){return [{source:'/:path*',headers:securityHeaders()}];}, outputFileTracingIncludes: {'/*':['./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs','./node_modules/pdfjs-dist/standard_fonts/**/*','./node_modules/pdfjs-dist/cmaps/**/*','./node_modules/libheif-js/**/*.wasm','./app/fonts/Inter-*.ttf','./node_modules/recharts/**','./node_modules/react-dom/**']}, serverExternalPackages: ['@react-pdf/renderer','exceljs','pdfjs-dist', '@napi-rs/canvas', 'sharp', 'mammoth', 'heic-decode', 'libheif-js', 'mailparser', '@kenjiuno/msgreader'] };

export default config;
