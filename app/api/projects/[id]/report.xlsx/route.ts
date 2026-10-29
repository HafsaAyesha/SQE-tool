import {downloadReport} from '@/lib/report/api';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return downloadReport(request,context,'xlsx');}
