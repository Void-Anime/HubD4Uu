import axios from 'axios';
import * as cheerio from 'cheerio';
import {headers} from './headers';
import {getBaseUrl} from './getBaseUrl';
import {superVideoExtractor} from './extractors/superVideo';
import {gdFlixExtracter} from './extractors/gdflix';
import {hubcloudExtracter} from './extractors/hubcloud';
import {gofileExtracter} from './extractors/gofile';

// Enhanced axios instance with better error handling and logging
const enhancedAxios = axios.create({
  timeout: 30000,
  headers: {
    ...headers,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  }
});

// Add request/response interceptors for debugging
enhancedAxios.interceptors.request.use(
  (config) => {
    console.log(`[PROVIDER-CONTEXT] Making request to: ${config.url}`);
    
    // Add random delay to avoid rate limiting
    if (Math.random() < 0.3) {
      config.timeout = 35000; // Slightly longer timeout for some requests
    }
    
    return config;
  },
  (error) => {
    console.error(`[PROVIDER-CONTEXT] Request error:`, error);
    return Promise.reject(error);
  }
);

enhancedAxios.interceptors.response.use(
  (response) => {
    console.log(`[PROVIDER-CONTEXT] Response from ${response.config.url}: ${response.status}`);
    return response;
  },
  (error) => {
    console.error(`[PROVIDER-CONTEXT] Response error from ${error.config?.url}:`, error.message);
    
    // Handle Cloudflare challenges
    if (error.response?.status === 403 && error.response?.headers?.['cf-mitigated']) {
      console.warn(`[PROVIDER-CONTEXT] Cloudflare challenge detected for ${error.config?.url}`);
      console.warn(`[PROVIDER-CONTEXT] This URL is protected and may require manual intervention`);
    }
    
    return Promise.reject(error);
  }
);

// Enhanced extractors with better error handling
const enhancedExtractors = {
  hubcloudExtracter: async (link: string, signal: AbortSignal) => {
    try {
      console.log(`[PROVIDER-CONTEXT] hubcloudExtracter called with:`, link);
      const result = await hubcloudExtracter(link, signal);
      console.log(`[PROVIDER-CONTEXT] hubcloudExtracter result:`, result);
      return result;
    } catch (error: any) {
      console.error(`[PROVIDER-CONTEXT] hubcloudExtracter error:`, error.message);
      return [];
    }
  },
  
  gofileExtracter: async (link: string, signal: AbortSignal) => {
    try {
      console.log(`[PROVIDER-CONTEXT] gofileExtracter called with:`, link);
      // Extract the ID from the link if it's a full URL
      const url = new URL(link);
      const id = url.pathname.split('/').pop() || link;
      const result = await gofileExtracter(id);
      console.log(`[PROVIDER-CONTEXT] gofileExtracter result:`, result);
      return result;
    } catch (error: any) {
      console.error(`[PROVIDER-CONTEXT] gofileExtracter error:`, error.message);
      return { link: '', token: '' };
    }
  },
  
  superVideoExtractor: async (link: string, signal: AbortSignal) => {
    try {
      console.log(`[PROVIDER-CONTEXT] superVideoExtractor called with:`, link);
      const result = await superVideoExtractor(link, signal);
      console.log(`[PROVIDER-CONTEXT] superVideoExtractor result:`, result);
      return result;
    } catch (error: any) {
      console.error(`[PROVIDER-CONTEXT] superVideoExtractor error:`, error.message);
      return [];
    }
  },
  
  gdFlixExtracter: async (link: string, signal: AbortSignal) => {
    try {
      console.log(`[PROVIDER-CONTEXT] gdFlixExtracter called with:`, link);
      const result = await gdFlixExtracter(link, signal);
      console.log(`[PROVIDER-CONTEXT] gdFlixExtracter result:`, result);
      return result;
    } catch (error: any) {
      console.error(`[PROVIDER-CONTEXT] gdFlixExtracter error:`, error.message);
      return [];
    }
  }
};

export const providerContext = {
  axios: enhancedAxios,
  getBaseUrl,
  commonHeaders: headers,
  // Node: no expo-crypto; include a compatible subset if needed later
  Crypto: {} as any,
  cheerio,
  extractors: enhancedExtractors,
  
  // Add debugging utilities
  debug: {
    log: (message: string, data?: any) => {
      console.log(`[PROVIDER-DEBUG] ${message}`, data);
    },
    error: (message: string, error?: any) => {
      console.error(`[PROVIDER-DEBUG] ${message}`, error);
    },
    warn: (message: string, data?: any) => {
      console.warn(`[PROVIDER-DEBUG] ${message}`, data);
    }
  }
};

export type ProviderContext = typeof providerContext;


