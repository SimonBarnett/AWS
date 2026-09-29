(function () {
    const script = document.currentScript;
    const merchantId = script.dataset.merchantId;
    if (!merchantId) {
      console.error('Merchant ID missing in script tag data-merchant-id');
      return;
    }
  
    const idPattern = /^[a-zA-Z0-9]{8}$/;
    if (!idPattern.test(merchantId)) {
      console.error('Invalid merchant ID: must be 8 alphanumeric characters');
      return;
    }
  
    const posthogScript = document.createElement('script');
    posthogScript.src = 'https://app.posthog.com/static/array.js';
    posthogScript.async = true;
    document.head.appendChild(posthogScript);
  
    let posthogReadyResolve;
    const posthogReady = new Promise(resolve => posthogReadyResolve = resolve);
  
    posthogScript.onload = () => {
      if (window.posthog) {
        window.posthog.init('phc_RDsbExoIQRl5Njr8dcumuO5xVGN6kfj0EiYg5qXC73k', {
          api_host: 'https://eu.posthog.com'
        });
        window.posthog.identify(merchantId);
        console.log('PostHog initialized successfully');
        posthogReadyResolve();
      } else {
        console.error('PostHog failed to load');
      }
    };
  
    function setCookie(name, value, days) {
      const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
      document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
    }
  
    function getCookie(name) {
      const cookieName = `${name}=`;
      const cookies = document.cookie.split(';');
      for (let cookie of cookies) {
        cookie = cookie.trim();
        if (cookie.startsWith(cookieName)) {
          return decodeURIComponent(cookie.substring(cookieName.length));
        }
      }
      return null;
    }
  
    async function trackTagParameter() {
      let checkoutData = null;
      const cookieData = getCookie('madeiraCheckoutData');
      if (cookieData) {
        try {
          checkoutData = JSON.parse(cookieData);
          if (
            checkoutData.merchantId &&
            checkoutData.referrerTag &&
            checkoutData.referrerUrl &&
            checkoutData.destinationUrl &&
            idPattern.test(checkoutData.merchantId) &&
            idPattern.test(checkoutData.referrerTag)
          ) {
            console.log('Using existing madeiraCheckoutData cookie:', checkoutData);
          } else {
            console.log('Invalid checkout data in cookie');
            checkoutData = null;
          }
        } catch (error) {
          console.error('Error parsing checkout cookie:', error);
        }
      }
  
      const query = new URLSearchParams(window.location.search);
      const tag = query.get('tag');
  
      // Set cookie only if no valid cookie exists and a valid tag is present
      if (!checkoutData && tag) {
        if (!idPattern.test(tag)) {
          console.log('Invalid tag');
          return;
        }
  
        console.log(`Tag stored: ${tag}`);
        const referrerUrl = document.referrer || 'direct';
        console.log(`Referrer URL stored: ${referrerUrl}`);
        const destinationUrl = window.location.href;
        console.log(`Destination URL stored: ${destinationUrl}`);
        console.log(`Merchant ID stored: ${merchantId}`);
  
        checkoutData = {
          merchantId,
          referrerTag: tag,
          referrerUrl,
          destinationUrl
        };
        setCookie('madeiraCheckoutData', JSON.stringify(checkoutData), 1);
        console.log('Set madeiraCheckoutData cookie:', checkoutData);
      }
  
      // Send view event if valid checkout data exists
      if (checkoutData) {
        await posthogReady;
        if (window.posthog) {
          window.posthog.capture('view', {
            source: checkoutData.referrerTag,
            source_url: checkoutData.referrerUrl,
            destination: checkoutData.merchantId,
            destination_url: window.location.href // Current page URL
          });
          console.log(`PostHog view event: source=${checkoutData.referrerTag}, destination=${checkoutData.merchantId}, currentPage=${window.location.href}`);
        }
      }
    }
  
    trackTagParameter();
  })();