import {NextRequest, NextResponse} from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const {searchParams} = new URL(req.url);
    const link = searchParams.get('link') || '';
    const type = searchParams.get('type') || 'movie';
    
    console.log(`[STREAM-FALLBACK] Request: type=${type}, link=${link}`);
    
    if (!link) {
      return NextResponse.json({error: 'link parameter required'}, {status: 400});
    }
    
    // Try to extract content using fallback methods
    const fallbackData = await extractWithFallbackMethods(link, type);
    
    if (fallbackData.length > 0) {
      console.log(`[STREAM-FALLBACK] Successfully extracted ${fallbackData.length} streams`);
      return NextResponse.json({
        data: fallbackData,
        source: 'fallback-extraction',
        method: 'direct-parsing'
      });
    }
    
    return NextResponse.json({
      error: 'Fallback extraction failed',
      details: 'Unable to extract content using fallback methods',
      suggestions: [
        'The content may be protected by Cloudflare',
        'Try accessing the URL manually in a browser',
        'The content may have been removed',
        'Try a different provider or URL'
      ]
    }, {status: 422});
    
  } catch (error: any) {
    console.error(`[STREAM-FALLBACK] Error:`, error);
    return NextResponse.json({
      error: error.message || 'Unknown error occurred'
    }, {status: 500});
  }
}

async function extractWithFallbackMethods(url: string, type: string) {
  const results: any[] = [];
  
  try {
    console.log(`[STREAM-FALLBACK] Attempting fallback extraction for: ${url}`);
    
    // Method 1: Direct HTML parsing
    const htmlData = await extractFromHTML(url);
    if (htmlData.length > 0) {
      results.push(...htmlData);
      console.log(`[STREAM-FALLBACK] HTML extraction found ${htmlData.length} streams`);
    }
    
    // Method 2: Look for embedded players
    const embeddedData = await extractEmbeddedPlayers(url);
    if (embeddedData.length > 0) {
      results.push(...embeddedData);
      console.log(`[STREAM-FALLBACK] Embedded player extraction found ${embeddedData.length} streams`);
    }
    
    // Method 3: Check for common video hosting patterns
    const hostingData = await extractFromHostingPatterns(url);
    if (hostingData.length > 0) {
      results.push(...hostingData);
      console.log(`[STREAM-FALLBACK] Hosting pattern extraction found ${hostingData.length} streams`);
    }
    
  } catch (error: any) {
    console.warn(`[STREAM-FALLBACK] Fallback extraction error:`, error.message);
  }
  
  return results;
}

async function extractFromHTML(url: string) {
  try {
    const response = await axios.get(url, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      }
    });
    
    const $ = cheerio.load(response.data);
    const streams: any[] = [];
    
    // Look for video elements
    $('video source').each((_, element) => {
      const src = $(element).attr('src');
      if (src) {
        streams.push({
          server: 'HTML5 Video',
          link: src.startsWith('http') ? src : new URL(src, url).href,
          type: 'mp4'
        });
      }
    });
    
    // Look for iframe embeds
    $('iframe').each((_, element) => {
      const src = $(element).attr('src');
      if (src && (src.includes('youtube') || src.includes('vimeo') || src.includes('dailymotion'))) {
        streams.push({
          server: 'Embedded Player',
          link: src.startsWith('http') ? src : new URL(src, url).href,
          type: 'iframe'
        });
      }
    });
    
    return streams;
    
  } catch (error: any) {
    console.warn(`[STREAM-FALLBACK] HTML extraction failed:`, error.message);
    return [];
  }
}

async function extractEmbeddedPlayers(url: string) {
  try {
    const response = await axios.get(url, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      }
    });
    
    const $ = cheerio.load(response.data);
    const streams: any[] = [];
    
    // Look for common video player patterns
    const playerSelectors = [
      '.video-player',
      '.player',
      '.stream-player',
      '[data-video]',
      '[data-src]',
      '.embed-responsive'
    ];
    
    playerSelectors.forEach(selector => {
      $(selector).each((_, element) => {
        const videoUrl = $(element).attr('data-video') || 
                        $(element).attr('data-src') || 
                        $(element).attr('src');
        
        if (videoUrl) {
          streams.push({
            server: 'Embedded Player',
            link: videoUrl.startsWith('http') ? videoUrl : new URL(videoUrl, url).href,
            type: 'mp4'
          });
        }
      });
    });
    
    return streams;
    
  } catch (error: any) {
    console.warn(`[STREAM-FALLBACK] Embedded player extraction failed:`, error.message);
    return [];
  }
}

async function extractFromHostingPatterns(url: string) {
  try {
    const response = await axios.get(url, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      }
    });
    
    const content = response.data;
    const streams: any[] = [];
    
    // Look for common video hosting patterns
    const patterns = [
      /https?:\/\/[^\s"']*\.(?:mp4|m3u8|mkv|avi|mov|wmv|flv|webm)/gi,
      /https?:\/\/[^\s"']*\.(?:cloudflare|fastly|bunny|streamable)\.com[^\s"']*/gi,
      /https?:\/\/[^\s"']*\.(?:youtube|vimeo|dailymotion)\.com[^\s"']*/gi
    ];
    
    patterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => {
          streams.push({
            server: 'Direct Link',
            link: match,
            type: match.split('.').pop() || 'mp4'
          });
        });
      }
    });
    
    return streams;
    
  } catch (error: any) {
    console.warn(`[STREAM-FALLBACK] Hosting pattern extraction failed:`, error.message);
    return [];
  }
}
