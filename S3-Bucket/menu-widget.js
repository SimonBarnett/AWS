(async () => {
    // Menu configuration with exactly four icons
    const menuItems = [
      { url: 'charts.html', icon: 'fas fa-chart-bar', name: 'Affiliate Traffic' },
      { url: 'apikey.html', icon: 'fas fa-key', name: 'Api Keys' },
      { url: 'category.html', icon: 'fas fa-robot', name: 'Affiliate AI' },
      { url: 'login.html', icon: 'fas fa-sign-out', name: 'Log Off' },
    ];
  
    // Find the container from the script tag
    const scriptTag = document.querySelector('script[data-menu-widget]');
    if (!scriptTag) {
      console.error('No script tag with data-menu-widget found');
      return;
    }
  
    const containerId = scriptTag.getAttribute('data-container-id');
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`No container found with ID "${containerId}"`);
      return;
    }
  
    // Clear the container
    container.innerHTML = '';
  
    // Add some basic styles
    const style = document.createElement('style');
    style.textContent = `
      nav {
        padding: 1rem;
      }
      ul {
        list-style: none;
        display: flex;
        gap: 1rem;
        margin: 0;
        padding: 0;
      }
      a {
        text-decoration: none;
        display: flex;
        align-items: center;
      }
      i {
        color: white;
        font-size: 1.2rem;
        width: 32px;
        height: 32px;
        line-height: 32px;
        text-align: center;
      }
    `;
    container.appendChild(style);
  
    // Build the menu with four icons
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <nav>
        <ul>
          ${menuItems
            .map(
              (item) => `
                <li>
                  <a href="${item.url}" title="${item.name}">
                    <i class="${item.icon}"></i>
                  </a>
                </li>
              `,
            )
            .join('')}
        </ul>
      </nav>
    `;
    container.appendChild(wrapper);
  
    // Load Font Awesome CSS
    const fontAwesomeLink = document.createElement('link');
    fontAwesomeLink.rel = 'stylesheet';
    fontAwesomeLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css';
    document.head.appendChild(fontAwesomeLink);
  
    // Check it worked
    const icons = container.querySelectorAll('i');
    if (icons.length === 4) {
      console.log('Four icons rendered, fuck yeah');
    } else {
      console.error(`Expected 4 icons, got ${icons.length}`);
    }
  })();