import {ImportError} from '../errors';
import type {ImportAdapter} from './types';
export const mediaAdapter:ImportAdapter={id:'media',label:'Audio / video',icon:'Clapperboard',kind:'media',accepts:{extensions:['.mp3','.wav','.m4a','.ogg','.mp4','.mov','.webm'],mimeTypes:['audio/mpeg','audio/wav','audio/mp4','audio/ogg','video/mp4','video/quicktime','video/webm']},async parse(){throw new ImportError('Upload recordings directly to private media storage using the media job flow.');}};
