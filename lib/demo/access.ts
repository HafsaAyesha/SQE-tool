import {ImportError} from '@/lib/import/errors';
export const DEMO_MESSAGE='The public demo is read-only. Create your own account to import data, edit projects or generate new AI insights.';
export function isDemoUser(user:{id?:string;app_metadata?:Record<string,unknown>}|null|undefined){return user?.app_metadata?.costlens_demo===true;}
export class DemoReadOnlyError extends ImportError{constructor(){super(DEMO_MESSAGE,403);}}
export function assertWritableProject(project:{readOnly?:boolean}){if(project.readOnly)throw new DemoReadOnlyError();}
export function assertWritableUser(user:{id?:string;app_metadata?:Record<string,unknown>}|null|undefined){if(isDemoUser(user))throw new DemoReadOnlyError();}
