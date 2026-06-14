const BUTTON_ID = 'club-madeira-voucher-btn';

const API_URL = 'https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod/amazoncard';
const API_METHOD = 'POST';

const LOGO_URL = chrome.runtime.getURL('icon48.png');

console.log('✅ Club Madeira content script loaded');

function injectAnimations() {
  if (document.getElementById('club-madeira-animations')) return;
  const style = document.createElement('style');
  style.id = 'club-madeira-animations';
  style.textContent = `
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes shake { 0%,100%{transform:translateX(0)} 10%,30%,50%,70%,90%{transform:translateX(-5px)} 20%,40%,60%,80%{transform:translateX(5px)} }
    @keyframes celebrate { 0%{transform:scale(1)} 50%{transform:scale(1.3)} 100%{transform:scale(1)} }
    @keyframes confetti-fall { 0% { transform: translateY(-150px) rotate(0deg); opacity: 1; } 100% { transform: translateY(400px) rotate(720deg); opacity: 0; } }
  `;
  document.head.appendChild(style);
}

function createOrUpdateButton() {
  console.log('🔄 createOrUpdateButton called - resetting button');
  let btn = document.getElementById(BUTTON_ID);
  if (!btn) {
    btn = document.createElement('div');
    btn.id = BUTTON_ID;
    document.body.appendChild(btn);
  }

  btn.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;
    background: linear-gradient(135deg, #00b894, #00a085);
    color: white; padding: 12px 24px; border-radius: 50px;
    font-family: system-ui, -apple-system, sans-serif; font-size: 15px; font-weight: 600;
    box-shadow: 0 8px 25px rgba(0, 184, 148, 0.4);
    cursor: pointer; user-select: none;
    display: flex; align-items: center; gap: 10px;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    border: none; min-width: 220px; justify-content: center;
  `;

  btn.innerHTML = `
    <div style="background: white; border-radius: 50%; padding: 4px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.15);">
      <img src="${LOGO_URL}" style="width:28px; height:28px; border-radius: 50%;" alt="Club Madeira">
    </div>
    <span>Claim my voucher</span>
  `;

  btn.onclick = handleClaimClick;
}

function launchCelebration(btn) {
  console.log('🎉 Launching celebration');
  const emojis = ['🎉', '🍾', '💷', '🎟️', '✨'];
  for (let i = 0; i < 45; i++) {
    const c = document.createElement('div');
    c.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    c.style.cssText = `position:absolute; font-size:${18 + Math.random()*14}px; left:${Math.random()*100}%; top:-30px; animation:confetti-fall ${2 + Math.random()*2}s linear forwards; z-index:2147483647; pointer-events:none;`;
    btn.appendChild(c);
    setTimeout(() => c.remove(), 5000);
  }
}

async function handleClaimClick() {
  console.log('🖱️ Button clicked - starting claim');
  const btn = document.getElementById(BUTTON_ID);
  if (!btn) return;

  btn.style.pointerEvents = 'none';
  btn.innerHTML = `<span style="animation: spin 1s linear infinite;">⏳</span><span>Claiming voucher...</span>`;

  try {
    const response = await fetch(API_URL, {
      method: API_METHOD,
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await response.json();
    console.log('📡 API response:', data);

    if (response.status === 200 || data.success === 1 || data.httpStatus === 200) {
      console.log('✅ SUCCESS received - building redeem button');

      const formattedValue = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(data.value || 0);

      // Replace the entire button with a REAL link
      const newLink = document.createElement('a');
      newLink.id = BUTTON_ID;
      newLink.href = data.redeem_url;
      newLink.target = '_self';                    // current tab
      newLink.style.cssText = `
        position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;
        background: linear-gradient(135deg, #00b894, #00a085);
        color: white; padding: 12px 24px; border-radius: 50px;
        font-family: system-ui, -apple-system, sans-serif; font-size: 15px; font-weight: 600;
        box-shadow: 0 8px 25px rgba(0, 184, 148, 0.4);
        display: flex; align-items: center; gap: 10px;
        text-decoration: none; cursor: pointer;
        min-width: 220px; justify-content: center;
      `;

      newLink.innerHTML = `
        <div style="background: white; border-radius: 50%; padding: 4px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.15);">
          <img src="${LOGO_URL}" style="width:28px; height:28px; border-radius: 50%;" alt="Club Madeira">
        </div>
        <span style="font-size:26px;">🎉</span>
        <span style="font-weight:700; font-size:18px;">${formattedValue}</span>
        <span style="color:white; font-weight:600;">Redeem now →</span>
      `;

      btn.replaceWith(newLink);
      launchCelebration(newLink);

      console.log('🔗 Redeem link created with href:', data.redeem_url);
      return;
    }

    // Cooldown / No vouchers / Error states (unchanged)
    if (response.status === 400 || data.httpStatus === 400) {
      btn.style.animation = 'shake 0.5s';
      btn.style.background = 'linear-gradient(135deg, #0984e3, #0066cc)';
      btn.innerHTML = `<span style="font-size:26px;">🥶</span><span style="font-size:14px; line-height:1.3;">You are on cooldown.<br>Come back tomorrow.</span>`;
      setTimeout(() => createOrUpdateButton(), 5000);
      return;
    }

    if (response.status === 404 || data.httpStatus === 404) {
      btn.style.animation = 'shake 0.5s';
      btn.style.background = '#f8f9fa';
      btn.style.color = '#2d3436';
      btn.innerHTML = `<span style="font-size:26px;">🤷</span><span style="font-size:14px;">Nothing here.<br>Try later.</span>`;
      setTimeout(() => createOrUpdateButton(), 5000);
      return;
    }

    throw new Error(data.reason || 'Something went wrong');

  } catch (err) {
    console.error('❌ Claim error:', err);
    btn.style.animation = 'shake 0.5s';
    btn.style.background = '#2d3436';
    btn.style.color = 'white';
    btn.innerHTML = `<span style="font-size:26px;">🐞</span><span style="font-size:14px;">Oops.<br>That didn't work.</span>`;
    setTimeout(() => createOrUpdateButton(), 5000);
  }
}

// Start
injectAnimations();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createOrUpdateButton);
} else {
  createOrUpdateButton();
}