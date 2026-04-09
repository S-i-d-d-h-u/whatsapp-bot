 
import express from 'express';
import { routeMessage } from './messageRouter.js';

export const router = express.Router();

router.post('/', routeMessage);