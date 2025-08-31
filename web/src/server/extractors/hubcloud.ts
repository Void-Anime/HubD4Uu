import axios from 'axios';

const headers = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

function decode(value: string) {
  if (!value) return '';
  try {
    // Use atob for base64 decoding (browser compatible)
    if (typeof atob !== 'undefined') {
      return atob(value);
    }
    // Simple fallback - return as-is if no decoder available
    return value;
  } catch {
    return value;
  }
}

export async function hubcloudExtracter(link: string, signal: AbortSignal) {
  try {
    const baseUrl = link.split('/').slice(0, 3).join('/');
    const streamLinks: {server: string; link: string; type: string}[] = [];
    const vLinkRes = await axios.get(`${link}`, {headers, signal});
    const vLinkText = vLinkRes.data;
    
    // Extract redirect URL from JavaScript variable
    const vLinkRedirect = vLinkText.match(/var\s+url\s*=\s*'([^']+)';/) || [];
    let vcloudLink =
      decode(vLinkRedirect[1]?.split('r=')?.[1]) ||
      vLinkRedirect[1] ||
      link;
      
    // Look for download link in HTML
    const downloadLinkMatch = vLinkText.match(/href\s*=\s*["']([^"']*fa-file-download[^"']*)["']/);
    if (downloadLinkMatch && downloadLinkMatch[1] && !downloadLinkMatch[1].includes('javascript:')) {
      vcloudLink = downloadLinkMatch[1];
    }
    
    if (vcloudLink?.startsWith('/')) {
      vcloudLink = `${baseUrl}${vcloudLink}`;
    }
    
    const vcloudRes = await fetch(vcloudLink, {headers, signal, redirect: 'follow'});
    const vcloudHtml = await vcloudRes.text();

    // Extract links from buttons with specific classes
    const buttonMatches = vcloudHtml.matchAll(/href\s*=\s*["']([^"']+)["'][^>]*class\s*=\s*["']([^"']*(?:btn-success|btn-danger|btn-secondary)[^"']*)["']/g);
    
    for (const match of buttonMatches) {
      const lnk = match[1];
      if (!lnk || lnk.includes('javascript:')) continue;
      
      if (lnk?.includes('.dev') && !lnk?.includes('/?id=')) {
        streamLinks.push({server: 'Cf Worker', link: lnk, type: 'mkv'});
      }
      
      if (lnk?.includes('pixeld')) {
        if (!lnk?.includes('api')) {
          const token = lnk.split('/').pop();
          const base = lnk.split('/').slice(0, -2).join('/');
          const apiLink = `${base}/api/file/${token}?download`;
          streamLinks.push({server: 'Pixeldrain', link: apiLink, type: 'mkv'});
        } else {
          streamLinks.push({server: 'Pixeldrain', link: lnk, type: 'mkv'});
        }
      }
      
      if (lnk?.includes('hubcloud') || lnk?.includes('/?id=')) {
        try {
          const newLinkRes = await axios.head(lnk, {headers, signal});
          const newLink = newLinkRes.request?.responseURL?.split('link=')?.[1] || lnk;
          streamLinks.push({server: 'hubcloud', link: newLink, type: 'mkv'});
        } catch (error) {
          console.warn(`[HUBCLOUD] Failed to resolve hubcloud link:`, error);
        }
      }
      
      if (lnk?.includes('cloudflarestorage')) {
        streamLinks.push({server: 'CfStorage', link: lnk, type: 'mkv'});
      }
      
      if (lnk?.includes('fastdl')) {
        streamLinks.push({server: 'FastDl', link: lnk, type: 'mkv'});
      }
      
      if (lnk.includes('hubcdn')) {
        streamLinks.push({server: 'HubCdn', link: lnk, type: 'mkv'});
      }
    }
    
    return streamLinks;
  } catch (error) {
    console.warn(`[HUBCLOUD] Extraction failed:`, error);
    return [];
  }
}


