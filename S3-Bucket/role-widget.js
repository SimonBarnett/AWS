(function () {
    // Check for FontAwesome and add if missing
    if (!document.querySelector('link[href*="fontawesome"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css';
        document.head.appendChild(link);
    }

    // Define role-specific colors
    const roleColors = {
        admin: '#FF61FF',
        merchant: '#FE6F61',
        partner: '#6BFF61',
        community: '#61CFFF'
    };

    // Define the widget HTML and CSS
    const widgetHTML = `
        <div class="widget-container">
            <div class="header">
                <i class="fas fa-chevron-left nav-icon" onclick="changeRole(-1)"></i>
                <div class="header-content">
                    <div class="image-container">
                        <img id="role-image" src="https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/community.png" alt="Role Image" class="fade">
                    </div>
                    <h1 id="role-name" class="fade">Community</h1>
                </div>
                <i class="fas fa-chevron-right nav-icon" onclick="changeRole(1)"></i>
            </div>
            <div class="content" id="role-content">
                <ul>
                    <li><i class="fas fa-check"></i> Has Membership open to the public.</li>
                    <li><i class="fas fa-check"></i> Has a self selecting audience.</li>
                    <li><i class="fas fa-check"></i> Has a website or is prepared to build one.</li>
                    <li><i class="fas fa-check"></i> Ready to monetise online engagement.</li>
                </ul>
            </div>
        </div>
    `;

    const widgetCSS = `
        <style>
            body {
                font-family: 'Arial', sans-serif;
                margin: 0;
                padding: 0;
            }
            .widget-container {
                max-width: 400px;
                margin: 20px auto;
                background: #fff;
                border-radius: 10px;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
                overflow: hidden;
            }
            .header {
                background: #000;
                color: #fff;
                padding: 20px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                position: relative;
                min-height: 140px; /* Increased to accommodate doubled PNG size */
            }
            .header-content {
                display: flex;
                align-items: center;
                gap: 5px;
                flex: 1;
                overflow: hidden;
            }
            .image-container {
                flex-shrink: 0;
                width: 140px; /* Doubled from 70px */
                height: 140px; /* Doubled from 70px */
                display: flex;
                align-items: center;
                margin-left: 50px; /* Increased from 30px to 50px */
            }
            .header img {
                width: 100%;
                height: 100%;
                object-fit: contain;
                transition: opacity 0.3s ease;
            }
            .header h1 {
                margin: 0;
                font-size: 24px;
                text-transform: capitalize;
                transition: opacity 0.3s ease;
                flex-grow: 1;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                display: flex;
                align-items: center; /* Vertically center text */
            }
            .nav-icon {
                cursor: pointer;
                font-size: 24px;
                color: #fff;
                transition: color 0.3s ease;
                flex-shrink: 0;
            }
            .nav-icon:hover {
                color: #ccc;
            }
            .content {
                padding: 20px;
                transition: opacity 0.3s ease;
            }
            .content ul {
                list-style: none;
                padding: 0;
                margin-left: 50px;
            }
            .content li {
                margin: 10px 0;
                font-size: 16px;
                display: flex;
                align-items: center;
            }
            .content li i {
                color: #28a745;
                margin-right: 10px;
            }
            .fade {
                animation: fade 0.3s ease-in-out;
            }
            @keyframes fade {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @media (max-width: 600px) {
                .widget-container {
                    max-width: 300px;
                }
                .header {
                    min-height: 200px; /* Increased to accommodate stacked layout */
                }
                .header-content {
                    flex-direction: column; /* Stack image and text vertically */
                    align-items: center;
                    gap: 10px;
                }
                .image-container {
                    width: 100px; /* Adjusted for smaller screens */
                    height: 100px;
                    margin-left: 0; /* Remove left margin for centered alignment */
                }
                .header h1 {
                    font-size: 20px;
                    text-align: center; /* Center text */
                    white-space: normal; /* Allow text wrapping */
                }
                .header img {
                    width: 100%;
                    height: 100%;
                }
                .nav-icon {
                    font-size: 20px;
                }
                .content ul {
                    margin-left: 20px;
                }
            }
        </style>
    `;

    // Find the target div
    const targetDiv = document.getElementById('role-widget');
    if (!targetDiv) {
        console.error('Target div with id "role-widget" not found.');
        return;
    }

    // Inject CSS into the document head
    const styleElement = document.createElement('style');
    styleElement.textContent = widgetCSS.replace('<style>', '').replace('</style>', '');
    document.head.appendChild(styleElement);

    // Inject HTML into the target div
    targetDiv.innerHTML = widgetHTML;

    // Define roles data in the specified order: community -> admin -> merchant -> partner
    const roles = [
        {
            name: 'community',
            image: 'https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/community.png',
            content: [
                'Has Membership open to the public.',
                'Has a self selecting audience.',
                'Has a website or is prepared to build one.',
                'Ready to monetise their existing engagement.'
            ]
        },
        {
            name: 'admin',
            image: 'https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/admin.png',
            content: [
                'Feed the servers.',
                'Keep the Ai oiled.',
                'Prevent singularities.',
                'Think of new ways to make Madeira better.'                
            ]
        },
        {
            name: 'merchant',
            image: 'https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/merchant.png',
            content: [
                'Has products they want to sell online.',
                'Holds stock, and has a the ability to fulfill orders.',
                'Has an online store or is prepared to build one.',
                'Ready to pay commission on sales.'
            ]
        },
        {
            name: 'partner',
            image: 'https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/partner.png',
            content: [
                'Has a network of merchants and communities they can connect.',
                'Has an online presence or is prepared to build one.',
                'Has a track record of building successful partnerships.',
                'Ready to earn commission on sales.'
            ]
        }
    ];

    let currentRoleIndex = 0;

    // Define changeRole function
    window.changeRole = function (direction) {
        currentRoleIndex = (currentRoleIndex + direction + roles.length) % roles.length;
        updateWidget();
    };

    // Define updateWidget function
    function updateWidget() {
        const role = roles[currentRoleIndex];
        const roleImage = document.getElementById('role-image');
        const roleName = document.getElementById('role-name');
        const roleContent = document.getElementById('role-content');

        // Apply role-specific color to the role name
        roleName.style.color = roleColors[role.name.toLowerCase()] || '#fff';

        // Fade out
        roleImage.style.opacity = '0';
        roleName.style.opacity = '0';
        roleContent.style.opacity = '0';

        setTimeout(() => {
            // Update content
            roleImage.src = role.image;
            roleName.textContent = role.name;
            roleContent.innerHTML = `
                <ul>
                    ${role.content.map(item => `<li><i class="fas fa-check"></i> ${item}</li>`).join('')}
                </ul>
            `;

            // Fade in
            roleImage.style.opacity = '1';
            roleName.style.opacity = '1';
            roleContent.style.opacity = '1';
        }, 300);
    }

    // Initialize widget with initial role content
    function initWidget() {
        const role = roles[currentRoleIndex];
        const roleImage = document.getElementById('role-image');
        const roleName = document.getElementById('role-name');
        const roleContent = document.getElementById('role-content');

        // Set initial content
        roleImage.src = role.image;
        roleName.textContent = role.name;
        roleContent.innerHTML = `
            <ul>
                ${role.content.map(item => `<li><i class="fas fa-check"></i> ${item}</li>`).join('')}
            </ul>
        `;

        // Apply role-specific color
        roleName.style.color = roleColors[role.name.toLowerCase()] || '#fff';

        // Apply fade effect
        roleImage.classList.add('fade');
        roleName.classList.add('fade');
        roleContent.classList.add('fade');
    }

    // Call initWidget to load initial content
    initWidget();
})();