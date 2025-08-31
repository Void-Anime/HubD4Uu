import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';

export const dynamic = 'force-dynamic';

function getFFmpegPath(): string {
  if (process.env.FFMPEG_PATH) {
    return process.env.FFMPEG_PATH;
  }
  
  try {
    const ff = require('@ffmpeg-installer/ffmpeg');
    return ff.path;
  } catch (error) {
    return 'ffmpeg not found';
  }
}

export async function GET(req: NextRequest) {
  try {
    const ffmpegPath = getFFmpegPath();
    
    // Test 1: Check if FFmpeg exists
    const ffmpegExists = ffmpegPath !== 'ffmpeg not found';
    
    // Test 2: Try to get FFmpeg version
    let versionOutput = '';
    let versionSuccess = false;
    
    if (ffmpegExists) {
      try {
        const versionResult = await new Promise<string>((resolve, reject) => {
          const child = spawn(ffmpegPath, ['-version']);
          let output = '';
          
          child.stdout.on('data', (chunk: Buffer) => {
            output += chunk.toString();
          });
          
          child.stderr.on('data', (chunk: Buffer) => {
            output += chunk.toString();
          });
          
          child.on('close', (code) => {
            if (code === 0) {
              resolve(output);
            } else {
              reject(new Error(`FFmpeg exited with code ${code}`));
            }
          });
          
          child.on('error', (error) => {
            reject(error);
          });
          
          // Add timeout for Vercel
          setTimeout(() => {
            child.kill();
            reject(new Error('FFmpeg version check timeout'));
          }, 10000);
        });
        
        versionOutput = versionResult;
        versionSuccess = true;
      } catch (error: any) {
        versionOutput = `Error getting version: ${error.message}`;
        versionSuccess = false;
      }
    }
    
    // Test 3: Try a simple FFmpeg operation (just parsing, no actual processing)
    let parseSuccess = false;
    let parseOutput = '';
    
    if (ffmpegExists) {
      try {
        const parseResult = await new Promise<string>((resolve, reject) => {
          const child = spawn(ffmpegPath, ['-f', 'lavfi', '-i', 'testsrc=duration=1:size=320x240:rate=1', '-t', '1', '-f', 'null', '-']);
          
          let output = '';
          
          child.stderr.on('data', (chunk: Buffer) => {
            output += chunk.toString();
          });
          
          child.on('close', (code) => {
            if (code === 0 || code === 1) { // FFmpeg can exit with 1 for some operations
              resolve(output);
            } else {
              reject(new Error(`FFmpeg parse test exited with code ${code}`));
            }
          });
          
          child.on('error', (error) => {
            reject(error);
          });
          
          // Add timeout for Vercel
          setTimeout(() => {
            child.kill();
            reject(new Error('FFmpeg parse test timeout'));
          }, 15000);
        });
        
        parseOutput = parseResult;
        parseSuccess = true;
      } catch (error: any) {
        parseOutput = `Error in parse test: ${error.message}`;
        parseSuccess = false;
      }
    }
    
    // Test 4: Check environment variables
    const environmentInfo = {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL,
      VERCEL_REGION: process.env.VERCEL_REGION,
      FFMPEG_PATH: process.env.FFMPEG_PATH,
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version
    };
    
    // Overall status
    const overallStatus = ffmpegExists && versionSuccess && parseSuccess ? 'WORKING' : 'PARTIAL' || 'FAILED';
    
    return NextResponse.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      environment: environmentInfo,
      tests: {
        ffmpegExists: {
          status: ffmpegExists ? 'PASS' : 'FAIL',
          path: ffmpegPath,
          details: ffmpegExists ? 'FFmpeg binary found' : 'FFmpeg binary not found'
        },
        versionCheck: {
          status: versionSuccess ? 'PASS' : 'FAIL',
          output: versionOutput.substring(0, 500), // Limit output length
          details: versionSuccess ? 'Successfully got FFmpeg version' : 'Failed to get FFmpeg version'
        },
        parseTest: {
          status: parseSuccess ? 'PASS' : 'FAIL',
          output: parseOutput.substring(0, 500), // Limit output length
          details: parseSuccess ? 'Successfully parsed FFmpeg command' : 'Failed to parse FFmpeg command'
        }
      },
      summary: {
        totalTests: 3,
        passedTests: [ffmpegExists, versionSuccess, parseSuccess].filter(Boolean).length,
        failedTests: [ffmpegExists, versionSuccess, parseSuccess].filter(Boolean => !Boolean).length
      },
      recommendations: [
        ffmpegExists ? null : 'Install @ffmpeg-installer/ffmpeg package',
        versionSuccess ? null : 'Check FFmpeg binary permissions and dependencies',
        parseSuccess ? null : 'FFmpeg may have limited functionality in serverless environment',
        'Consider using Vercel\'s serverExternalPackages for FFmpeg',
        'Monitor function timeout limits (10-15 seconds recommended)'
      ].filter(Boolean)
    });
    
  } catch (error: any) {
    return NextResponse.json({
      status: 'ERROR',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
