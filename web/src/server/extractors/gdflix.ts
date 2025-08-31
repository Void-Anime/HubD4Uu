import axios from 'axios';

export async function gdFlixExtracter(link: string, signal: AbortSignal) {
  try {
    const streamLinks: {server: string; link: string; type: string}[] = [];
    const res = await axios.get(`${link}`, {signal});
    let htmlData = res.data;

    // Check for redirect in onload attribute
    const onloadMatch = htmlData.match(/onload\s*=\s*["']([^"']*location\.replace[^"']*)["']/);
    if (onloadMatch) {
      const locationReplaceMatch = onloadMatch[1].match(/location\.replace\(['"]([^'"]+)['"]\)/);
      if (locationReplaceMatch) {
        const newLink = locationReplaceMatch[1];
        try {
          const newRes = await axios.get(newLink, {signal});
          htmlData = newRes.data;
        } catch (error) {
          console.warn(`[GDFLIX] Failed to fetch redirect link:`, error);
        }
      }
    }

    try {
      // Look for R2/Cloud Download button
      const r2LinkMatch = htmlData.match(/href\s*=\s*["']([^"']*btn-outline-success[^"']*)["']/);
      if (r2LinkMatch) {
        const r2Link = r2LinkMatch[1];
        if (r2Link && !r2Link.includes('javascript:')) {
          streamLinks.push({server: 'R2', link: r2Link, type: 'mkv'});
        }
      }
      
      // Alternative: look for "CLOUD DOWNLOAD" text
      const cloudDownloadMatch = htmlData.match(/href\s*=\s*["']([^"']+)["'][^>]*>.*?CLOUD DOWNLOAD/);
      if (cloudDownloadMatch) {
        const r2Link = cloudDownloadMatch[1];
        if (r2Link && !r2Link.includes('javascript:')) {
          streamLinks.push({server: 'R2', link: r2Link, type: 'mkv'});
        }
      }
    } catch (error) {
      console.warn(`[GDFLIX] Failed to extract R2 link:`, error);
    }

    try {
      // Look for PixelDrain button
      const pixelDrainMatch = htmlData.match(/href\s*=\s*["']([^"']*btn-success[^"']*)["']/);
      if (pixelDrainMatch) {
        const pixelDrainLink = pixelDrainMatch[1];
        if (pixelDrainLink && !pixelDrainLink.includes('javascript:')) {
          streamLinks.push({server: 'PixelDrain', link: pixelDrainLink, type: 'mkv'});
        }
      }
    } catch (error) {
      console.warn(`[GDFLIX] Failed to extract PixelDrain link:`, error);
    }

    return streamLinks;
  } catch (error) {
    console.warn(`[GDFLIX] Extraction failed:`, error);
    return [];
  }
}


