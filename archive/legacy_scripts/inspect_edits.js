const fs = require('fs');
if (fs.existsSync('scripts/edit_14865.json')) {
    const e = JSON.parse(fs.readFileSync('scripts/edit_14865.json', 'utf8'));
    console.log('--- Edit 14865 ---');
    console.log('Path:', e.Path);
    console.log('Target start:', e.Target?.slice(0, 150));
    console.log('Target end:', e.Target?.slice(-150));
    console.log('Replacement start:', e.Replacement?.slice(0, 150));
    console.log('Replacement end:', e.Replacement?.slice(-150));
}
if (fs.existsSync('scripts/edit_14927.json')) {
    const e = JSON.parse(fs.readFileSync('scripts/edit_14927.json', 'utf8'));
    console.log('--- Edit 14927 ---');
    console.log('Path:', e.Path);
    console.log('Target start:', e.Target?.slice(0, 150));
    console.log('Target end:', e.Target?.slice(-150));
    console.log('Replacement start:', e.Replacement?.slice(0, 150));
    console.log('Replacement end:', e.Replacement?.slice(-150));
}

