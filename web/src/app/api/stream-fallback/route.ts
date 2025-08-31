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

    try {
      // Attempt to fetch and stream the content directly
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
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      const contentLength = response.headers.get('content-length');
      
      console.log(`[STREAM-FALLBACK] Content-Type: ${contentType}, Length: ${contentLength}`);

      // Check if this looks like video content
      const isVideoContent = contentType.includes('video/') || 
                            contentType.includes('application/') ||
                            contentType.includes('audio/') ||
                            url.match(/\.(mp4|m3u8|mkv|avi|mov|wmv|flv|webm|ts|m4v)$/i);

      if (!isVideoContent) {
        console.log(`[STREAM-FALLBACK] Content doesn't appear to be video, attempting HTML parsing`);
        
        // If not direct video, try to extract video URLs from HTML
        const htmlContent = await response.text();
        const extractedUrls = extractVideoUrlsFromHTML(htmlContent, url);
        
        if (extractedUrls.length > 0) {
          console.log(`[STREAM-FALLBACK] Found ${extractedUrls.length} video URLs in HTML`);
          return new Response(JSON.stringify({
            success: true,
            method: 'html-extraction',
            videos: extractedUrls,
            originalUrl: url
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        // If no video URLs found, return error with suggestions
        return new Response(JSON.stringify({
          error: 'No video content found',
          message: 'The URL does not contain direct video content or extractable video links',
          suggestions: [
            'The URL may point to a webpage rather than a direct video file',
            'Try to find the direct video link on the page',
            'The video may be embedded in an iframe or player',
            'Check if the video requires authentication or cookies'
          ],
          originalUrl: url,
          contentType: contentType
        }), {
          status: 422,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Stream the video content directly
      console.log(`[STREAM-FALLBACK] Streaming video content directly`);
      
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

    } catch (fetchError: any) {
      console.error(`[STREAM-FALLBACK] Fetch error:`, fetchError);
      
      // Try alternative extraction methods if direct fetch fails
      try {
        console.log(`[STREAM-FALLBACK] Attempting alternative extraction methods`);
        const extractedUrls = await extractWithAlternativeMethods(url);
        
        if (extractedUrls.length > 0) {
          console.log(`[STREAM-FALLBACK] Alternative extraction found ${extractedUrls.length} URLs`);
          return new Response(JSON.stringify({
            success: true,
            method: 'alternative-extraction',
            videos: extractedUrls,
            originalUrl: url,
            note: 'Direct streaming failed, but found alternative video sources'
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      } catch (extractionError: any) {
        console.warn(`[STREAM-FALLBACK] Alternative extraction failed:`, extractionError.message);
      }

      return new Response(JSON.stringify({
        error: 'Streaming failed',
        message: fetchError.message || 'Unable to fetch or stream the content',
        suggestions: [
          'The URL may be protected by Cloudflare or similar services',
          'Try accessing the URL manually in a browser',
          'The content may have been removed or is region-restricted',
          'Check if the video requires authentication, cookies, or specific headers',
          'Try a different provider or URL'
        ],
        originalUrl: url,
        details: fetchError.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (error: any) {
    console.error(`[STREAM-FALLBACK] General error:`, error);
    return new Response(JSON.stringify({
      error: 'Fallback processing failed',
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

async function extractWithAlternativeMethods(url: string): Promise<string[]> {
  const videoUrls: string[] = [];
  
  try {
    // Try to fetch with different headers
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    if (response.ok) {
      const html = await response.text();
      const extracted = extractVideoUrlsFromHTML(html, url);
      videoUrls.push(...extracted);
    }

  } catch (error: any) {
    console.warn(`[STREAM-FALLBACK] Alternative method failed:`, error.message);
  }

  return videoUrls;
}
