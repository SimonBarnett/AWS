(function() {
    var script = document.currentScript;
    var width = script.getAttribute('data-width') || '180px';
  
    var isApple = false;
    var ua = navigator.userAgent.toLowerCase();
    var platform = navigator.platform.toLowerCase();
    
    if (ua.indexOf('iphone') > -1 || ua.indexOf('ipad') > -1 || ua.indexOf('ipod') > -1) {
      isApple = true;
    } else if (platform.indexOf('mac') > -1) {
      isApple = true;
    }
    
    var link, imgSrc, altText;
    if (isApple) {
      link = 'https://apps.apple.com/us/app/madeira-affiliate-extension/id6751989113';
      imgSrc = 'https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/applestore.svg';
      altText = 'Download on the App Store';
    } else {
      link = 'https://chromewebstore.google.com/detail/club-madeira-affiliate-ex/ilnlmljfigjdlfppgnkffmlpmpdaiegc?authuser=0&hl=en-GB';
      imgSrc = 'https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/chromestore.png';
      altText = 'Available in the Chrome Web Store';
    }
    
    var a = document.createElement('a');
    a.href = link;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    
    var img = document.createElement('img');
    img.src = imgSrc;
    img.alt = altText;
    img.style.width = width;
    img.style.height = 'auto';
    img.style.border = 'none';
    
    a.appendChild(img);
    document.body.appendChild(a);  // Appends to the end of the body; adjust if needed
  })();