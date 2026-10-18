import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import {createApp} from './app.js';
const app=createApp();app.use(express.static(path.resolve('dist')));app.get('/{*path}',(_req,res)=>res.sendFile(path.resolve('dist/index.html')));
const port=Number(process.env.PORT||3001);app.listen(port,'0.0.0.0',(error?:Error)=>{if(error){console.error('MetroLens could not start. Check the PORT setting and whether it is already in use.');process.exitCode=1;return;}console.log(`MetroLens listening on port ${port}`);});
