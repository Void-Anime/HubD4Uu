import {NextRequest} from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel Pro plan limit

// Enhanced transcode route with multiple streaming methods
export async function GET(req: NextRequest) {
  const {searchParams} = new URL(req.url);
  const url = searchParams.get('url') || searchParams.get('link') || '';
  const referer = searchParams.get('referer') || undefined;
  const method = searchParams.get('method') || 'auto'; // auto, direct, fallback, extract
  
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

  console.log(`[TRANSCODE] Processing URL: ${url} with method: ${method}`);

  try {
    // Method 1: Direct Streaming (Default)
    if (method === 'direct' || method === 'auto') {
      console.log(`[TRANSCODE] Attempting direct streaming method`);
      
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

        if (response.ok) {
          console.log(`[TRANSCODE] Direct streaming succeeded`);
          return streamResponse(response, url, 'direct-streaming');
        }
      } catch (directError: any) {
        console.warn(`[TRANSCODE] Direct streaming failed:`, directError.message);
      }
    }

    // Method 2: Alternative Headers Streaming
    if (method === 'auto' || method === 'alternative') {
      console.log(`[TRANSCODE] Attempting alternative headers method`);
      
      try {
        const alternativeHeaders = [
          {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            ...(referer && { 'Referer': referer })
          },
          {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            ...(referer && { 'Referer': referer })
          }
        ];

        for (let i = 0; i < alternativeHeaders.length; i++) {
          try {
            console.log(`[TRANSCODE] Trying alternative header set ${i + 1}`);
            
            const response = await fetch(url, { headers: alternativeHeaders[i] });
            
            if (response.ok) {
              console.log(`[TRANSCODE] Alternative headers ${i + 1} succeeded`);
              return streamResponse(response, url, 'alternative-headers');
            }
          } catch (headerError: any) {
            console.warn(`[TRANSCODE] Alternative header set ${i + 1} failed:`, headerError.message);
          }
        }
      } catch (alternativeError: any) {
        console.warn(`[TRANSCODE] Alternative headers method failed:`, alternativeError.message);
      }
    }

    // Method 3: Content Extraction and Streaming
    if (method === 'auto' || method === 'extract') {
      console.log(`[TRANSCODE] Attempting content extraction method`);
      
      try {
        const response = await fetch(url, {
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

        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          
          // If it's already video content, stream it directly
          if (contentType.includes('video/') || contentType.includes('application/')) {
            console.log(`[TRANSCODE] Content extraction found video, streaming directly`);
            return streamResponse(response, url, 'extracted-video');
          }

          // If it's HTML, extract video URLs and try to stream them
          if (contentType.includes('text/html')) {
            console.log(`[TRANSCODE] Content extraction found HTML, extracting video URLs`);
            
            const htmlContent = await response.text();
            const extractedUrls = extractVideoUrlsFromHTML(htmlContent, url);
            
            if (extractedUrls.length > 0) {
              console.log(`[TRANSCODE] Found ${extractedUrls.length} video URLs, attempting to stream first one`);
              
              // Try to stream the first extracted URL
              const firstVideoUrl = extractedUrls[0];
              
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
                  console.log(`[TRANSCODE] Successfully streaming extracted video URL`);
                  return streamResponse(videoResponse, firstVideoUrl, 'extracted-streaming');
                }
              } catch (videoError: any) {
                console.warn(`[TRANSCODE] Failed to stream extracted video URL:`, videoError.message);
              }

              // Return extracted URLs if streaming failed
              return new Response(JSON.stringify({
                success: true,
                method: 'url-extraction',
                videos: extractedUrls,
                originalUrl: url,
                note: 'Video URLs extracted. Use these URLs with method=direct for individual streaming.',
                streamingOptions: extractedUrls.map((url, index) => ({
                  url: url,
                  method: 'direct',
                  endpoint: `/api/transcode?url=${encodeURIComponent(url)}&method=direct`
                }))
              }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        }
      } catch (extractError: any) {
        console.warn(`[TRANSCODE] Content extraction method failed:`, extractError.message);
      }
    }

    // Method 4: Fallback to Stream-Fallback API
    console.log(`[TRANSCODE] All methods failed, redirecting to stream-fallback API`);
    
    const fallbackUrl = `/api/stream-fallback?url=${encodeURIComponent(url)}${referer ? `&referer=${encodeURIComponent(referer)}` : ''}`;
    
    return new Response(JSON.stringify({
      error: 'All transcoding methods failed',
      message: 'Unable to stream content using any available method',
      fallback: fallbackUrl,
      redirect: true,
      availableMethods: [
        'direct - Direct streaming with standard headers',
        'alternative - Alternative browser headers',
        'extract - Extract video URLs from HTML pages',
        'auto - Try all methods automatically'
      ],
      suggestions: [
        'Try the fallback route for additional streaming options',
        'Use specific method parameters to target specific approaches',
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

  } catch (error: any) {
    console.error('[TRANSCODE] Error:', error);
    
    // Return error with fallback information
    const fallbackUrl = `/api/stream-fallback?url=${encodeURIComponent(url)}${referer ? `&referer=${encodeURIComponent(referer)}` : ''}`;
    
    return new Response(JSON.stringify({
      error: 'Transcode processing failed',
      message: error.message,
      fallback: fallbackUrl,
      redirect: true,
      suggestions: [
        'The video source may be protected or inaccessible',
        'Try the fallback route for alternative methods',
        'Check if the video requires authentication',
        'Verify the video source is still available'
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

function streamResponse(response: Response, originalUrl: string, method: string) {
  const contentType = response.headers.get('content-type') || '';
  const contentLength = response.headers.get('content-length');
  
  console.log(`[TRANSCODE] Streaming content via ${method}: ${contentType}, Length: ${contentLength}`);
  
  const headers = new Headers({
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Transfer-Encoding': 'chunked',
    'X-Transcode-Method': method
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
    console.warn(`[TRANSCODE] HTML parsing error:`, error.message);
  }

  return [...new Set(videoUrls)]; // Remove duplicates
}


