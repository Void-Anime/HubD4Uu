import {NextRequest} from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel Pro plan limit

export async function GET(req: NextRequest) {
  try {
    const {searchParams} = new URL(req.url);
    const url = searchParams.get('url') || searchParams.get('link') || '';
    const referer = searchParams.get('referer') || undefined;
    
    console.log(`[STREAM-FALLBACK] Processing URL: ${url}`);
    
    if (!url) {
      return new Response(JSON.stringify({
        error: 'URL parameter required',
        message: 'Please provide a url or link parameter'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!/^https?:\/\//i.test(url)) {
      return new Response(JSON.stringify({
        error: 'Invalid URL',
        message: 'URL must be a valid HTTP/HTTPS link'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ALWAYS try to stream content directly first - this is the primary goal
    console.log(`[STREAM-FALLBACK] Attempting direct streaming`);
    
    try {
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
        // If direct streaming fails, try with alternative headers immediately
        console.log(`[STREAM-FALLBACK] Direct streaming failed (${response.status}), trying alternative headers`);
        
        const alternativeResponse = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            ...(referer && { 'Referer': referer })
          }
        });

        if (!alternativeResponse.ok) {
          throw new Error(`All streaming attempts failed: ${response.status} and ${alternativeResponse.status}`);
        }

        // Use alternative response if it succeeded
        console.log(`[STREAM-FALLBACK] Alternative headers succeeded, streaming content`);
        return streamResponse(alternativeResponse, url);
      }

      // Direct streaming succeeded - stream the content immediately
      console.log(`[STREAM-FALLBACK] Direct streaming succeeded`);
      return streamResponse(response, url);

    } catch (streamError: any) {
      console.error(`[STREAM-FALLBACK] Streaming error:`, streamError);
      
      // If streaming completely fails, try to extract video URLs from the page
      try {
        console.log(`[STREAM-FALLBACK] Attempting to extract video URLs from page`);
        
        const pageResponse = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            ...(referer && { 'Referer': referer })
          }
        });

        if (pageResponse.ok) {
          const htmlContent = await pageResponse.text();
          const extractedUrls = extractVideoUrlsFromHTML(htmlContent, url);
          
          if (extractedUrls.length > 0) {
            console.log(`[STREAM-FALLBACK] Found ${extractedUrls.length} video URLs, attempting to stream first one`);
            
            // Try to stream the first extracted URL directly
            const firstVideoUrl = extractedUrls[0];
            console.log(`[STREAM-FALLBACK] Attempting to stream: ${firstVideoUrl}`);
            
            try {
              const videoResponse = await fetch(firstVideoUrl, {
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

              if (videoResponse.ok) {
                console.log(`[STREAM-FALLBACK] Successfully streaming extracted video URL`);
                return streamResponse(videoResponse, firstVideoUrl);
              }
            } catch (videoError: any) {
              console.warn(`[STREAM-FALLBACK] Failed to stream extracted video URL:`, videoError.message);
            }
          }

          // Return extracted URLs if streaming failed
          return new Response(JSON.stringify({
            success: true,
            method: 'url-extraction',
            videos: extractedUrls,
            originalUrl: url,
            note: 'Video URLs extracted but direct streaming failed. Try streaming these URLs individually.'
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      } catch (extractionError: any) {
        console.warn(`[STREAM-FALLBACK] URL extraction failed:`, extractionError.message);
      }

      // Final fallback - return error with streaming suggestions
      return new Response(JSON.stringify({
        error: 'Streaming failed',
        message: streamError.message || 'Unable to stream the content directly',
        suggestions: [
          'Try accessing the URL manually in a browser first',
          'The content may be protected by Cloudflare or similar services',
          'Check if the video requires authentication or cookies',
          'Try a different video source or provider',
          'Use the extracted URLs manually if available'
        ],
        originalUrl: url,
        details: streamError.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (error: any) {
    console.error(`[STREAM-FALLBACK] General error:`, error);
    return new Response(JSON.stringify({
      error: 'Streaming processing failed',
      message: error.message || 'An unexpected error occurred',
      suggestions: [
        'Check the URL format and accessibility',
        'Verify the video source is still available',
        'Try refreshing the page or using a different browser',
        'Contact support if the issue persists'
      ]
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

function streamResponse(response: Response, originalUrl: string) {
  const contentType = response.headers.get('content-type') || '';
  const contentLength = response.headers.get('content-length');
  
  console.log(`[STREAM-FALLBACK] Streaming content: ${contentType}, Length: ${contentLength}`);
  
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
}

function extractVideoUrlsFromHTML(html: string, baseUrl: string): string[] {
  const videoUrls: string[] = [];
  
  try {
    // Look for video source tags
    const videoSourceRegex = /<source[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = videoSourceRegex.exec(html)) !== null) {
      const url = match[1];
      if (url && !url.startsWith('data:')) {
        const fullUrl = url.startsWith('http') ? url : new URL(url, baseUrl).href;
        videoUrls.push(fullUrl);
      }
    }

    // Look for video tags with src attribute
    const videoSrcRegex = /<video[^>]+src=["']([^"']+)["'][^>]*>/gi;
    while ((match = videoSrcRegex.exec(html)) !== null) {
      const url = match[1];
      if (url && !url.startsWith('data:')) {
        const fullUrl = url.startsWith('http') ? url : new URL(url, baseUrl).href;
        videoUrls.push(fullUrl);
      }
    }

    // Look for iframe embeds
    const iframeRegex = /<iframe[^>]+src=["']([^"']+)["'][^>]*>/gi;
    while ((match = iframeRegex.exec(html)) !== null) {
      const url = match[1];
      if (url && !url.startsWith('data:')) {
        const fullUrl = url.startsWith('http') ? url : new URL(url, baseUrl).href;
        videoUrls.push(fullUrl);
      }
    }

    // Look for common video hosting patterns
    const hostingPatterns = [
      /https?:\/\/[^\s"']*\.(?:mp4|m3u8|mkv|avi|mov|wmv|flv|webm|ts|m4v)/gi,
      /https?:\/\/[^\s"']*\.(?:cloudflare|fastly|bunny|streamable)\.com[^\s"']*/gi,
      /https?:\/\/[^\s"']*\.(?:youtube|vimeo|dailymotion)\.com[^\s"']*/gi
    ];

    hostingPatterns.forEach(pattern => {
      const matches = html.match(pattern);
      if (matches) {
        matches.forEach(match => {
          if (!videoUrls.includes(match)) {
            videoUrls.push(match);
          }
        });
      }
    });

  } catch (error: any) {
    console.warn(`[STREAM-FALLBACK] HTML parsing error:`, error.message);
  }

  return [...new Set(videoUrls)]; // Remove duplicates
}
