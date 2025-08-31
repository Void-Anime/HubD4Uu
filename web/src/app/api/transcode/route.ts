import {NextRequest} from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel Pro plan limit

// Simplified transcode route - always attempts direct streaming first
export async function GET(req: NextRequest) {
  const {searchParams} = new URL(req.url);
  const url = searchParams.get('url') || searchParams.get('link') || '';
  const referer = searchParams.get('referer') || undefined;
  
  if (!url || !/^https?:\/\//i.test(url)) {
    return new Response(JSON.stringify({
      error: 'Bad Request: Invalid URL',
      message: 'Please provide a valid url or link parameter',
      suggestions: [
        'Ensure the URL starts with http:// or https://',
        'Check that the URL is properly encoded',
        'Verify the video source is accessible'
      ]
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  console.log(`[TRANSCODE] Processing URL: ${url}`);

  try {
    // Always try to stream content directly first
    console.log(`[TRANSCODE] Attempting direct streaming`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        ...(referer && { 'Referer': referer })
      }
    });

    if (!response.ok) {
      // If direct streaming fails, immediately redirect to fallback
      console.log(`[TRANSCODE] Direct streaming failed (${response.status}), redirecting to fallback`);
      
      const fallbackUrl = `/api/stream-fallback?url=${encodeURIComponent(url)}${referer ? `&referer=${encodeURIComponent(referer)}` : ''}`;
      
      return new Response(JSON.stringify({
        error: 'Direct streaming failed',
        message: `HTTP ${response.status}: ${response.statusText}`,
        fallback: fallbackUrl,
        redirect: true,
        suggestions: [
          'Use the fallback route for alternative streaming methods',
          'The fallback route will try multiple approaches',
          'Try accessing the URL manually in a browser first'
        ]
      }), {
        status: 307,
        headers: {
          'Content-Type': 'application/json',
          'Location': fallbackUrl,
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Direct streaming succeeded - stream the content immediately
    console.log(`[TRANSCODE] Direct streaming succeeded, streaming content`);
    
    const contentType = response.headers.get('content-type') || '';
    const contentLength = response.headers.get('content-length');
    
    console.log(`[TRANSCODE] Content-Type: ${contentType}, Length: ${contentLength}`);

    // Stream the content directly regardless of format
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

    // Copy other useful headers
    const usefulHeaders = ['content-range', 'accept-ranges', 'last-modified', 'etag'];
    usefulHeaders.forEach(header => {
      const value = response.headers.get(header);
      if (value) {
        headers.set(header, value);
      }
    });

    return new Response(response.body, {
      status: 200,
      headers
    });

  } catch (error: any) {
    console.error('[TRANSCODE] Error:', error);
    
    // Return error with immediate fallback
    const fallbackUrl = `/api/stream-fallback?url=${encodeURIComponent(url)}${referer ? `&referer=${encodeURIComponent(referer)}` : ''}`;
    
    return new Response(JSON.stringify({
      error: 'Transcode failed',
      message: error.message,
      fallback: fallbackUrl,
      redirect: true,
      suggestions: [
        'Use the fallback route for alternative streaming methods',
        'The fallback route will attempt direct streaming with different approaches',
        'Check if the video source is accessible',
        'Try a different video source if available'
      ]
    }), {
      status: 307,
      headers: {
        'Content-Type': 'application/json',
        'Location': fallbackUrl,
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}


