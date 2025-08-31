import {NextRequest} from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  try {
    // In Vercel, we can't use child_process, so we'll provide environment information
    const isVercel = process.env.VERCEL === '1';
    const platform = process.platform;
    const nodeVersion = process.version;
    const environment = process.env.NODE_ENV;
    
    // Check if we're in a serverless environment
    const isServerless = !process.env.VERCEL_ENV || process.env.VERCEL_ENV === 'production';
    
    if (isVercel || isServerless) {
      return new Response(JSON.stringify({
        available: false,
        reason: 'Vercel serverless environment',
        message: 'FFmpeg transcoding is not available in Vercel due to serverless limitations',
        alternatives: [
          'Use /api/stream-fallback for direct streaming',
          'Content is automatically checked for browser compatibility',
          'Redirects to fallback when transcoding is needed'
        ],
        environment: {
          platform,
          nodeVersion,
          environment,
          vercel: isVercel,
          serverless: isServerless
        },
        fallbackRoute: '/api/stream-fallback'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // For non-Vercel environments, provide FFmpeg information
    let ffmpegPath: string | null = null;
    
    // Try @ffmpeg-installer/ffmpeg
    try {
      const ff = require('@ffmpeg-installer/ffmpeg');
      if (ff?.path && typeof ff.path === 'string') {
        ffmpegPath = ff.path;
      }
    } catch {}
    
    // Try system ffmpeg
    if (!ffmpegPath) {
      ffmpegPath = 'ffmpeg';
    }
    
    if (!ffmpegPath) {
      return new Response(JSON.stringify({
        error: 'No FFmpeg path found',
        available: false,
        environment: {
          platform,
          nodeVersion,
          environment,
          vercel: isVercel,
          serverless: isServerless
        }
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Test FFmpeg version using a simpler approach
    try {
      const { execSync } = require('child_process');
      const output = execSync(`${ffmpegPath} -version`, { 
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      });
      
      const versionLine = output.split('\n')[0];
      return new Response(JSON.stringify({
        available: true,
        path: ffmpegPath,
        version: versionLine,
        codec: 'libx264',
        audio: 'aac',
        environment: {
          platform,
          nodeVersion,
          environment,
          vercel: isVercel,
          serverless: isServerless
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (execError: any) {
      return new Response(JSON.stringify({
        error: 'FFmpeg version check failed',
        message: execError.message,
        available: false,
        environment: {
          platform,
          nodeVersion,
          environment,
          vercel: isVercel,
          serverless: isServerless
        }
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
  } catch (error: any) {
    return new Response(JSON.stringify({
      error: 'Test failed',
      message: error.message,
      available: false,
      environment: {
        platform: process.platform,
        nodeVersion: process.version,
        environment: process.env.NODE_ENV,
        vercel: process.env.VERCEL === '1',
        serverless: !process.env.VERCEL_ENV || process.env.VERCEL_ENV === 'production'
      }
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
