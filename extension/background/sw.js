// Background Service Worker
// Handles auth token sync between popup and content scripts

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_TOKEN') {
    chrome.storage.local.get(['kl_token', 'kl_user'], (data) => {
      sendResponse({ token: data.kl_token || null, user: data.kl_user || null });
    });
    return true; // async
  }

  if (msg.type === 'SET_TOKEN') {
    chrome.storage.local.set({ kl_token: msg.token, kl_user: msg.user }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'ANALYZE_KEYWORD') {
    // Called from content script for inline analysis
    chrome.storage.local.get(['kl_token'], async (data) => {
      if (!data.kl_token) {
        sendResponse({ error: 'NOT_LOGGED_IN' });
        return;
      }
      try {
        const res = await fetch('http://localhost:4000/api/keywords/analyze', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${data.kl_token}`
          },
          body: JSON.stringify({
            keyword: msg.keyword,
            portal: msg.portal || 'google',
            period: 'monthly'
          })
        });
        const json = await res.json();
        sendResponse({ data: json });
      } catch (e) {
        sendResponse({ error: e.message });
      }
    });
    return true;
  }
});

// Listen for auth from the main site via cookie/localStorage
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('localhost:4000')) {
    chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const token = localStorage.getItem('kl_token');
        const user  = localStorage.getItem('kl_user');
        if (token) {
          chrome.runtime.sendMessage({ type: 'SET_TOKEN', token, user: JSON.parse(user || 'null') });
        }
      }
    }).catch(() => {});
  }
});
