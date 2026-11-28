document.addEventListener('DOMContentLoaded', async () => {
  const serverInput = document.getElementById('serverUrl');
  const tokenInput = document.getElementById('apiToken');
  const saveBtn = document.getElementById('saveBtn');
  const statusMsg = document.getElementById('statusMsg');

  // Load existing settings
  chrome.storage.local.get(['cm_server_url', 'cm_api_token'], (items) => {
    if (items.cm_server_url) serverInput.value = items.cm_server_url;
    else serverInput.value = 'http://localhost:4000';

    if (items.cm_api_token) tokenInput.value = items.cm_api_token;
  });

  saveBtn.addEventListener('click', () => {
    let sUrl = serverInput.value.trim();
    if (sUrl && !/^https?:\/\//i.test(sUrl)) {
      sUrl = 'http://' + sUrl;
    }
    if (sUrl.endsWith('/')) sUrl = sUrl.slice(0, -1);
    if (sUrl) {
      try {
        const parsed = new URL(sUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Invalid protocol');
        sUrl = parsed.origin;
      } catch (_) {
        alert('Kripya sahi Server URL dalein (e.g. http://localhost:4000)');
        return;
      }
    }
    serverInput.value = sUrl || 'http://localhost:4000';
    const token = tokenInput.value.trim();

    chrome.storage.local.set({
      cm_server_url: sUrl || 'http://localhost:4000',
      cm_api_token: token
    }, () => {
      statusMsg.style.display = 'block';
      setTimeout(() => {
        statusMsg.style.display = 'none';
      }, 3000);
    });
  });
});
