// myurls-widget.js
(function() {
    const widgetDivs = document.querySelectorAll('[data-myurls-widget]');
    if (widgetDivs.length === 0) return;
  
    async function initWidget(widgetDiv) {
      const token = localStorage.getItem('authToken');
      if (!token) {
        widgetDiv.innerHTML = '<p>Error: No authentication token found. Please log in.</p>';
        return;
      }
  
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
  
      try {
        // Fetch /myurls
        const myRes = await fetch('/myurls', { headers });
        if (!myRes.ok) throw new Error('Failed to fetch myurls');
        const myData = await myRes.json();
        if (myData.status !== 'success') throw new Error('Error fetching myurls');
  
        const myUrls = myData.urls;
  
        // Display myurls
        const myUrlsSection = document.createElement('div');
        myUrlsSection.innerHTML = '<h2>My URLs</h2>';
        myUrls.forEach(row => {
          const div = document.createElement('div');
          const json = row.JsonResult || '{}';
          const encodedJson = encodeURIComponent(json);
          const filename = `json_${row.Url.replace(/[^a-z0-9]/gi, '_')}.json`;
          div.innerHTML = `
            <p>URL: ${row.Url}</p>
            <a href="data:application/json;charset=utf-8,${encodedJson}" download="${filename}">Download JSON</a>
            <hr>
          `;
          myUrlsSection.appendChild(div);
        });
        widgetDiv.appendChild(myUrlsSection);
  
        // Fetch /claims for permissions
        const claimsRes = await fetch('/claims', { headers });
        if (!claimsRes.ok) throw new Error('Failed to fetch claims');
        const claims = await claimsRes.json();
        const permissions = claims.permissions || [];
  
        if (permissions.includes('partner') && !permissions.includes('owner')) {
          // Fetch /buyurl
          const buyRes = await fetch('/buyurl', { headers });
          if (!buyRes.ok) throw new Error('Failed to fetch buyurl');
          const buyData = await buyRes.json();
          if (buyData.status !== 'success') throw new Error('Error fetching buyurl');
  
          const blindReviews = buyData.blind_reviews;
  
          // Display buyurl items
          const buySection = document.createElement('div');
          buySection.innerHTML = '<h2>Available URLs to Buy</h2>';
          blindReviews.forEach(item => {
            const div = document.createElement('div');
            div.innerHTML = `
              <p>${item.blind_review}</p>
              <button class="padlock" style="font-size: 24px; cursor: pointer;">🔒</button>
              <div class="purchase" style="display: none;">
                <p>Price: £50</p>
                <button class="buy">Purchase</button>
              </div>
              <hr>
            `;
            const padlockBtn = div.querySelector('.padlock');
            padlockBtn.addEventListener('click', () => {
              div.querySelector('.purchase').style.display = 'block';
            });
  
            const buyBtn = div.querySelector('.buy');
            buyBtn.addEventListener('click', async () => {
              try {
                const putRes = await fetch('/buyurl', {
                  method: 'PUT',
                  headers,
                  body: JSON.stringify({ url: item.url })
                });
                if (!putRes.ok) throw new Error('Failed to purchase');
                location.reload();
              } catch (err) {
                console.error('Purchase error:', err);
                alert('Failed to purchase. Please try again.');
              }
            });
  
            buySection.appendChild(div);
          });
          widgetDiv.appendChild(buySection);
        }
      } catch (err) {
        console.error('Widget error:', err);
        widgetDiv.innerHTML = '<p>Error loading widget: ' + err.message + '</p>';
      }
    }
  
    widgetDivs.forEach(initWidget);
  })();