const cp = require('child_process');

function getGitToken() {
    return new Promise((resolve) => {
        try {
            const p = cp.spawn('git', ['credential', 'fill']);
            let out = '';
            p.stdout.on('data', (d) => { out += d.toString(); });
            p.on('close', () => {
                const match = out.match(/^password=(.+)$/m);
                resolve(match ? match[1].trim() : '');
            });
            p.stdin.write('protocol=https\nhost=github.com\n\n');
            p.stdin.end();
        } catch (_) {
            resolve('');
        }
    });
}

if (require.main === module) {
    getGitToken().then((tok) => {
        if (tok) process.stdout.write(tok);
    });
}

module.exports = { getGitToken };
