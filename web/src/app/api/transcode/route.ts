import {NextRequest} from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel Pro plan limit

// Vercel-compatible transcode route
export async function GET(req: NextRequest) {
  const {searchParams} = new URL(req.url);
  const url = searchParams.get('url');
  const referer = searchParams.get('referer') || undefined;
  
  if (!url || !/^https?:\/\//i.test(url)) {
    return new Response('Bad Request: Invalid URL', {status: 400});
  }

  console.log(`[TRANSCODE] Processing URL: ${url}`);

  try {
    // In Vercel, we can't use child_process, so we'll implement a different approach
    // Option 1: Try to stream the original content if it's already browser-compatible
    // Option 2: Redirect to a fallback streaming service
    // Option 3: Return an error with instructions to use the fallback route

    // Check if the URL is already browser-compatible
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        ...(referer && { 'Referer': referer })
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch video: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    const contentLength = response.headers.get('content-length');
    
    console.log(`[TRANSCODE] Content-Type: ${contentType}, Length: ${contentLength}`);

    // Check if content is already browser-compatible
    const isBrowserCompatible = contentType.includes('video/mp4') || 
                               contentType.includes('video/webm') || 
                               contentType.includes('video/ogg') ||
                               contentType.includes('application/x-mpegURL') ||
                               contentType.includes('application/vnd.apple.mpegurl');

    if (isBrowserCompatible) {
      console.log(`[TRANSCODE] Content is already browser-compatible, streaming directly`);
      
      // Stream the content directly
      const headers = new Headers({
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Transfer-Encoding': 'chunked'
      });

      // Copy relevant headers from the original response
      if (contentLength) {
        headers.set('Content-Length', contentLength);
      }

      return new Response(response.body, {
        status: 200,
        headers
      });
    }

    // Content is not browser-compatible, redirect to fallback route
    console.log(`[TRANSCODE] Content not browser-compatible, redirecting to fallback`);
    
    const fallbackUrl = `/api/stream-fallback?url=${encodeURIComponent(url)}${referer ? `&referer=${encodeURIComponent(referer)}` : ''}`;
    
    return new Response(JSON.stringify({
      error: 'Transcoding not available in Vercel',
      message: 'This video format requires transcoding which is not supported in the current environment',
      fallback: fallbackUrl,
      redirect: true
    }), {
      status: 307,
      headers: {
        'Content-Type': 'application/json',
        'Location': fallbackUrl,
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error: any) {
    console.error('[TRANSCODE] Error:', error);
    
    // Return error with fallback information
    return new Response(JSON.stringify({
      error: 'Transcode failed',
      message: error.message,
      fallback: `/api/stream-fallback?url=${encodeURIComponent(url)}${referer ? `&referer=${encodeURIComponent(referer)}` : ''}`,
      note: 'Use the fallback route for direct streaming'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}


