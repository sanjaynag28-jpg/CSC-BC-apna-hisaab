const fs = require('fs');
const path = require('path');

const brainDir = 'C:/Users/sanjay nag/.gemini/antigravity/brain';
const convs = fs.readdirSync(brainDir);

console.log('Conversations in brain:', convs);

for (const c of convs) {
    const p = path.join(brainDir, c);
    if (!fs.statSync(p).isDirectory()) continue;
    
    // Check for images
    const files = fs.readdirSync(p);
    const images = files.filter(f => f.endsWith('.png') || f.endsWith('.jpg'));
    if (images.length > 0) {
        console.log(`\nConversation ${c} has images:`, images);
    }
    
    // Check subdirectories
    for (const sub of ['page_previews', '.user_uploaded', 'scratch']) {
        const subPath = path.join(p, sub);
        if (fs.existsSync(subPath)) {
            const subFiles = fs.readdirSync(subPath);
            console.log(`Conversation ${c}/${sub} has ${subFiles.length} files:`, subFiles.slice(0, 10));
        }
    }
}

