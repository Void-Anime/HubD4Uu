import {NextRequest} from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const {searchParams} = new URL(req.url);
    const testUrl = searchParams.get('url');
    
    if (!testUrl) {
      return new Response(JSON.stringify({
        error: 'Test URL required',
        message: 'Please provide a url parameter to test',
        example: '/api/stream-fallback/test?url=https://example.com/video.mp4'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`[STREAM-FALLBACK-TEST] Testing URL: ${testUrl}`);

    try {
      // Test basic fetch
      const response = await fetch(testUrl, {
        method: 'HEAD', // Use HEAD to avoid downloading content
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        }
      });

      const contentType = response.headers.get('content-type') || '';
      const contentLength = response.headers.get('content-length');
      const acceptRanges = response.headers.get('accept-ranges');
      const lastModified = response.headers.get('last-modified');
      const etag = response.headers.get('etag');
      
      console.log(`[STREAM-FALLBACK-TEST] Response status: ${response.status}`);
      console.log(`[STREAM-FALLBACK-TEST] Content-Type: ${contentType}`);
      console.log(`[STREAM-FALLBACK-TEST] Content-Length: ${contentLength}`);

      // Determine if this looks like video content
      const isVideoContent = contentType.includes('video/') || 
                            contentType.includes('application/') ||
                            contentType.includes('audio/') ||
                            testUrl.match(/\.(mp4|m3u8|mkv|avi|mov|wmv|flv|webm|ts|m4v)$/i);

      const analysis = {
        url: testUrl,
        status: response.status,
        statusText: response.statusText,
        headers: {
          'content-type': contentType,
          'content-length': contentLength,
          'accept-ranges': acceptRanges,
          'last-modified': lastModified,
          'etag': etag
        },
        analysis: {
          isVideoContent: isVideoContent,
          contentTypeAnalysis: contentType ? 'Present' : 'Missing',
          contentLengthAnalysis: contentLength ? 'Present' : 'Missing',
          acceptRangesAnalysis: acceptRanges ? 'Present' : 'Missing',
          lastModifiedAnalysis: lastModified ? 'Present' : 'Missing',
          etagAnalysis: etag ? 'Present' : 'Missing'
        },
        recommendations: []
      };

      // Generate recommendations
      if (!response.ok) {
        analysis.recommendations.push(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      if (!contentType) {
        analysis.recommendations.push('Content-Type header is missing - this may cause streaming issues');
      }
      
      if (!isVideoContent) {
        analysis.recommendations.push('Content-Type does not appear to be video content');
        analysis.recommendations.push('This may be a webpage that needs HTML parsing to extract video URLs');
      }
      
      if (!contentLength) {
        analysis.recommendations.push('Content-Length header is missing - this may affect progress tracking');
      }
      
      if (!acceptRanges) {
        analysis.recommendations.push('Accept-Ranges header is missing - this may affect seeking functionality');
      }

      // Test if we can actually stream the content
      if (response.ok && isVideoContent) {
        try {
          console.log(`[STREAM-FALLBACK-TEST] Testing actual streaming...`);
          
          // Try to get a small chunk to test streaming
          const streamResponse = await fetch(testUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': '*/*',
              'Range': 'bytes=0-1023' // Request first 1KB
            }
          });

          if (streamResponse.ok) {
            const chunk = await streamResponse.arrayBuffer();
            analysis.analysis.streamingTest = 'Success';
            analysis.analysis.firstChunkSize = chunk.byteLength;
            analysis.recommendations.push('Streaming test passed - content should stream successfully');
          } else {
            analysis.analysis.streamingTest = 'Failed';
            analysis.recommendations.push(`Streaming test failed: ${streamResponse.status} ${streamResponse.statusText}`);
          }
        } catch (streamError: any) {
          analysis.analysis.streamingTest = 'Error';
          analysis.analysis.streamingError = streamError.message;
          analysis.recommendations.push(`Streaming test error: ${streamError.message}`);
        }
      }

      return new Response(JSON.stringify(analysis, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (fetchError: any) {
      console.error(`[STREAM-FALLBACK-TEST] Fetch error:`, fetchError);
      
      return new Response(JSON.stringify({
        error: 'Fetch test failed',
        message: fetchError.message,
        url: testUrl,
        suggestions: [
          'The URL may be protected by Cloudflare or similar services',
          'Try accessing the URL manually in a browser',
          'The content may have been removed or is region-restricted',
          'Check if the video requires authentication, cookies, or specific headers',
          'Try a different provider or URL'
        ],
        details: fetchError.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (error: any) {
    console.error(`[STREAM-FALLBACK-TEST] General error:`, error);
    return new Response(JSON.stringify({
      error: 'Test processing failed',
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
