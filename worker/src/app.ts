// Vercel's Express entrypoint. Never import server.ts: it starts the Render polling loop.
import express from 'express';
import {createGateway} from './gateway.js';
const app=express();app.disable('x-powered-by');app.use(createGateway());
export default app;
