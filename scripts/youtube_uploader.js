/**
 * scripts/youtube_uploader.js
 * 
 * YouTube Automated Video Uploader via YouTube Data API v3.
 * 
 * Features:
 * - One-time OAuth 2.0 loopback authentication (saves to youtube_token.json)
 * - Resumable chunked upload for large video files
 * - Live upload progress (% and MBs)
 * - Full metadata support: Title, Description, Tags, Category, Privacy (public/private/unlisted)
 * - Returns direct YouTube watch URL: https://youtu.be/{videoId}
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');
const { google } = require('googleapis');

const ROOT_DIR = path.resolve(__dirname, '..');
const CLIENT_SECRET_FILE = path.join(ROOT_DIR, 'client_secret.json');
const TOKEN_FILE = path.join(ROOT_DIR, 'youtube_token.json');

const SCOPES = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.readonly'
];

function loadCredentials() {
    if (!fs.existsSync(CLIENT_SECRET_FILE)) {
        throw new Error(`client_secret.json not found at ${CLIENT_SECRET_FILE}. Please place it in the project root.`);
    }
    const raw = fs.readFileSync(CLIENT_SECRET_FILE, 'utf8');
    const content = JSON.parse(raw);
    const keys = content.installed || content.web;
    if (!keys) {
        throw new Error('client_secret.json must contain "installed" or "web" credentials object.');
    }
    return keys;
}

function getOAuthClient(credentials, port = 8085) {
    const redirectUri = `http://localhost:${port}`;
    return new google.auth.OAuth2(
        credentials.client_id,
        credentials.client_secret,
        redirectUri
    );
}

/**
 * Ensures authenticated OAuth2Client. If token doesn't exist, opens local server to capture authorization code.
 */
async function getAuthClient() {
    const credentials = loadCredentials();
    const port = 8085;
    const oauth2Client = getOAuthClient(credentials, port);

    if (fs.existsSync(TOKEN_FILE)) {
        try {
            const token = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
            oauth2Client.setCredentials(token);
            return oauth2Client;
        } catch (e) {
            console.warn('⚠️ Existing youtube_token.json is invalid, re-authorizing...');
        }
    }

    return new Promise((resolve, reject) => {
        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            prompt: 'consent',
            scope: SCOPES
        });

        console.log('\n' + '='.repeat(70));
        console.log('  YOUTUBE CHANNEL ONE-TIME AUTHORIZATION REQUIRED');
        console.log('='.repeat(70));
        console.log('\nKripya is link ko browser me open karke channel permission Allow karein:\n');
        console.log(authUrl);
        console.log('\n' + '='.repeat(70) + '\n');

        const server = http.createServer(async (req, res) => {
            try {
                const reqUrl = url.parse(req.url, true);
                if (reqUrl.pathname === '/') {
                    const code = reqUrl.query.code;
                    if (code) {
                        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                        res.end(`
                            <div style="font-family: sans-serif; text-align: center; padding: 50px;">
                                <h1 style="color: #10b981;">✅ YouTube Authorization Successful!</h1>
                                <p style="font-size: 18px;">Aapka channel successfully connect ho gaya hai.</p>
                                <p>Aap is browser tab ko band kar sakte hain aur Antigravity me wapas ja sakte hain.</p>
                            </div>
                        `);
                        server.close();

                        const { tokens } = await oauth2Client.getToken(code);
                        oauth2Client.setCredentials(tokens);
                        fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), 'utf8');
                        console.log('✅ Channel token saved to youtube_token.json!');
                        resolve(oauth2Client);
                    } else if (reqUrl.query.error) {
                        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                        res.end(`<h1>❌ Authorization Failed: ${reqUrl.query.error}</h1>`);
                        server.close();
                        reject(new Error(`OAuth error: ${reqUrl.query.error}`));
                    }
                }
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end(err.message);
                server.close();
                reject(err);
            }
        });

        server.listen(port, () => {
            console.log(`Local authorization server listening on http://localhost:${port} ...`);
        }).on('error', (err) => {
            reject(err);
        });
    });
}

/**
 * Uploads a video to YouTube with progress tracking
 */
async function uploadVideo({
    filePath,
    title,
    description = '',
    tags = [],
    privacyStatus = 'unlisted', // 'public' | 'unlisted' | 'private'
    categoryId = '28' // 28 = Science & Technology, 22 = People & Blogs
}) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Video file nahi mili: ${filePath}`);
    }

    const fileSize = fs.statSync(filePath).size;
    const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
    console.log(`\n📹 Video file ready: ${filePath} (${fileSizeMB} MB)`);
    console.log(`📝 Title: ${title}`);
    console.log(`🔒 Privacy: ${privacyStatus.toUpperCase()}`);

    const auth = await getAuthClient();
    const youtube = google.youtube({ version: 'v3', auth });

    const tagList = Array.isArray(tags) ? tags : (typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : []);

    console.log('\n🚀 Uploading video to YouTube...');

    const res = await youtube.videos.insert(
        {
            part: ['snippet', 'status'],
            notifySubscribers: privacyStatus === 'public',
            requestBody: {
                snippet: {
                    title: title.substring(0, 100),
                    description: description.substring(0, 5000),
                    tags: tagList,
                    categoryId: categoryId.toString()
                },
                status: {
                    privacyStatus: privacyStatus.toLowerCase(),
                    selfDeclaredMadeForKids: false
                }
            },
            media: {
                body: fs.createReadStream(filePath)
            }
        },
        {
            // Track upload progress
            onUploadProgress: (evt) => {
                const progress = ((evt.bytesRead / fileSize) * 100).toFixed(1);
                const currentMB = (evt.bytesRead / (1024 * 1024)).toFixed(2);
                process.stdout.write(`\r⏳ Upload Progress: ${progress}% (${currentMB} / ${fileSizeMB} MB)`);
            }
        }
    );

    console.log('\n\n' + '='.repeat(70));
    console.log('🎉 VIDEO UPLOADED SUCCESSFULLY!');
    console.log('='.repeat(70));
    const videoId = res.data.id;
    const videoUrl = `https://youtu.be/${videoId}`;
    const studioUrl = `https://studio.youtube.com/video/${videoId}/edit`;

    console.log(`🎬 Video ID:   ${videoId}`);
    console.log(`🔗 Watch URL:  ${videoUrl}`);
    console.log(`⚙️ Studio Edit: ${studioUrl}`);
    console.log('='.repeat(70) + '\n');

    return {
        success: true,
        videoId,
        videoUrl,
        studioUrl,
        title: res.data.snippet.title,
        status: res.data.status.privacyStatus
    };
}

/**
 * Exchanges authorization code (or redirect URL) for access/refresh tokens
 */
async function exchangeCodeForTokens(codeOrUrl) {
    let code = codeOrUrl.trim();
    if (code.includes('code=')) {
        try {
            const parsed = url.parse(code, true);
            code = parsed.query.code || code;
        } catch (_) { }
    }
    // Remove quotes
    code = code.replace(/^["']|["']$/g, '');

    const credentials = loadCredentials();
    const port = 8085;
    const oauth2Client = getOAuthClient(credentials, port);
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), 'utf8');
    console.log('✅ Channel token saved to youtube_token.json!');
    return oauth2Client;
}

// Direct CLI execution
if (require.main === module) {
    const args = process.argv.slice(2);
    const getArg = (name) => {
        const found = args.find(a => a.startsWith(`--${name}=`));
        return found ? found.split('=')[1] : null;
    };

    const authCode = getArg('code');
    if (authCode) {
        console.log('ℹ️ Exchanging authorization code for YouTube tokens...');
        exchangeCodeForTokens(authCode).then(() => {
            console.log('✅ Successfully authorized YouTube channel!');
            process.exit(0);
        }).catch(err => {
            console.error('❌ Code exchange error:', err.message);
            process.exit(1);
        });
        return;
    }

    const filePath = getArg('file') || getArg('video');
    const title = getArg('title') || 'New Video Upload';
    const description = getArg('desc') || getArg('description') || '';
    const tags = getArg('tags') || '';
    const privacy = getArg('privacy') || 'unlisted';

    if (!filePath) {
        // If run with no args, just authorize
        console.log('ℹ️ No video file specified. Running YouTube Authorization check...');
        getAuthClient().then(() => {
            console.log('✅ YouTube client is authorized and ready for uploads!');
            process.exit(0);
        }).catch(err => {
            console.error('❌ Authorization error:', err.message);
            process.exit(1);
        });
    } else {
        uploadVideo({
            filePath,
            title,
            description,
            tags,
            privacyStatus: privacy
        }).then(r => {
            process.exit(0);
        }).catch(err => {
            console.error('\n❌ Upload failed:', err.message);
            process.exit(1);
        });
    }
}

module.exports = {
    getAuthClient,
    exchangeCodeForTokens,
    uploadVideo
};
