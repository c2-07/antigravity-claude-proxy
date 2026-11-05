/**
 * Token Extractor Module
 * Extracts OAuth tokens from Antigravity's official CLI token files or SQLite database
 *
 * Automatically refreshes expired or near-expiry tokens using Google OAuth.
 */

import { readFile, writeFile } from 'fs/promises';
import {
    TOKEN_REFRESH_INTERVAL_MS,
    ANTIGRAVITY_AUTH_PORT,
    CLI_TOKEN_PATHS
} from '../constants.js';
import { getAuthStatus } from './database.js';
import { refreshAccessToken } from './oauth.js';
import { logger } from '../utils/logger.js';

// Cache for the extracted token
let cachedToken = null;
let tokenExtractedAt = null;

/**
 * Extract and validate OAuth token from Antigravity CLI token file.
 * Handles automatic refresh if the token is expired or near expiry.
 *
 * @param {Object} [options]
 * @param {string[]} [options.paths] - Candidate file paths
 * @param {boolean} [options.forceRefresh] - Force refresh even if token looks valid
 * @returns {Promise<Object|null>} Token object with apiKey, email, refreshToken, etc.
 */
export async function extractCliToken(options = {}) {
    const candidatePaths = options.paths || CLI_TOKEN_PATHS;
    const shouldForceRefresh = options.forceRefresh === true;

    for (const tokenPath of candidatePaths) {
        try {
            const raw = await readFile(tokenPath, 'utf-8');
            if (!raw || !raw.trim()) continue;

            const parsed = JSON.parse(raw);
            const tokenObj = parsed.token || parsed;
            let accessToken = tokenObj.access_token || tokenObj.apiKey;
            const refreshToken = tokenObj.refresh_token || parsed.refresh_token;
            const expiryStr = tokenObj.expiry || parsed.expiry;
            let email = parsed.id_token_email || parsed.email || tokenObj.email || null;

            if (!accessToken && !refreshToken) continue;

            // Check if expired or about to expire (within 5 minutes)
            let isExpired = false;
            if (expiryStr) {
                const expiryTime = new Date(expiryStr).getTime();
                if (!isNaN(expiryTime)) {
                    isExpired = (expiryTime - Date.now()) < 5 * 60 * 1000;
                }
            }

            if ((isExpired || shouldForceRefresh || !accessToken) && refreshToken) {
                logger.info(`[Token] CLI token expired or refresh requested. Refreshing token via Google OAuth...`);
                try {
                    const refreshed = await refreshAccessToken(refreshToken);
                    accessToken = refreshed.accessToken;

                    // Update tokenObj and write back to file
                    const updatedExpiry = new Date(Date.now() + (refreshed.expiresIn || 3600) * 1000).toISOString();
                    if (parsed.token && typeof parsed.token === 'object') {
                        parsed.token.access_token = accessToken;
                        parsed.token.expiry = updatedExpiry;
                        parsed.token.expires_in = refreshed.expiresIn || 3600;
                    } else {
                        parsed.access_token = accessToken;
                        parsed.expiry = updatedExpiry;
                    }

                    // Save with 0600 mode
                    try {
                        await writeFile(tokenPath, JSON.stringify(parsed, null, 2), { mode: 0o600 });
                        logger.success(`[Token] Updated refreshed token to ${tokenPath}`);
                    } catch (writeErr) {
                        logger.warn(`[Token] Failed to write refreshed token to ${tokenPath}: ${writeErr.message}`);
                    }
                } catch (refreshErr) {
                    logger.warn(`[Token] Failed to refresh CLI token: ${refreshErr.message}`);
                    if (!accessToken) throw refreshErr;
                }
            }

            if (accessToken) {
                logger.info(`[Token] Loaded valid OAuth token from official Antigravity CLI (${tokenPath})`);
                return {
                    apiKey: accessToken,
                    email: email || 'cli@antigravity',
                    refreshToken,
                    tokenPath,
                    source: 'cli-token'
                };
            }
        } catch (err) {
            logger.debug(`[Token] Candidate ${tokenPath} failed: ${err.message}`);
        }
    }
    return null;
}

/**
 * Extract the chat params from Antigravity's HTML page (fallback method)
 */
async function extractChatParams() {
    try {
        const response = await fetch(`http://127.0.0.1:${ANTIGRAVITY_AUTH_PORT}/`);
        const html = await response.text();

        // Find the base64-encoded chatParams in the HTML
        const match = html.match(/window\.chatParams\s*=\s*'([^']+)'/);
        if (!match) {
            throw new Error('Could not find chatParams in Antigravity page');
        }

        // Decode base64
        const base64Data = match[1];
        const jsonString = Buffer.from(base64Data, 'base64').toString('utf-8');
        const config = JSON.parse(jsonString);

        return config;
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            throw new Error(
                `Cannot connect to Antigravity on port ${ANTIGRAVITY_AUTH_PORT}. ` +
                'Make sure Antigravity is running.'
            );
        }
        throw error;
    }
}

/**
 * Get fresh token data - tries CLI token first, then DB, then HTML page
 */
export async function getTokenData(forceCliRefresh = false) {
    // 1. Try official CLI token first (standard for agy CLI)
    try {
        const cliData = await extractCliToken({ forceRefresh: forceCliRefresh });
        if (cliData?.apiKey) {
            return cliData;
        }
    } catch (err) {
        logger.debug(`[Token] CLI token extraction failed: ${err.message}`);
    }

    // 2. Try database (Antigravity IDE SQLite DB)
    try {
        const dbData = getAuthStatus();
        if (dbData?.apiKey) {
            logger.info('[Token] Got fresh token from SQLite database');
            return dbData;
        }
    } catch (err) {
        logger.warn('[Token] DB extraction failed, trying HTML page...');
    }

    // 3. Fallback to HTML page
    try {
        const pageData = await extractChatParams();
        if (pageData?.apiKey) {
            logger.warn('[Token] Got token from HTML page (may be stale)');
            return pageData;
        }
    } catch (err) {
        logger.warn(`[Token] HTML page extraction failed: ${err.message}`);
    }

    throw new Error(
        'Could not extract token from Antigravity. ' +
        'Make sure Antigravity is running or you have logged in via the agy CLI ("agy" or "agy acp --login").'
    );
}

/**
 * Check if the cached token needs refresh
 */
function needsRefresh() {
    if (!cachedToken || !tokenExtractedAt) {
        return true;
    }
    return Date.now() - tokenExtractedAt > TOKEN_REFRESH_INTERVAL_MS;
}

/**
 * Get the current OAuth token (with caching)
 */
export async function getToken() {
    if (needsRefresh()) {
        const data = await getTokenData();
        cachedToken = data.apiKey;
        tokenExtractedAt = Date.now();
    }
    return cachedToken;
}

/**
 * Force refresh the token (useful if requests start failing)
 */
export async function forceRefresh() {
    cachedToken = null;
    tokenExtractedAt = null;
    const data = await getTokenData(true);
    cachedToken = data.apiKey;
    tokenExtractedAt = Date.now();
    return cachedToken;
}

export default {
    extractCliToken,
    getTokenData,
    getToken,
    forceRefresh
};
