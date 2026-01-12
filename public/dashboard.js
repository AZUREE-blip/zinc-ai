// Load user data from localStorage
const userData = JSON.parse(localStorage.getItem('syncup_user') || '{}');

// Initialize dashboard
function initDashboard() {
    if (!userData || !userData.user) {
        // Redirect to signup if no user data
        window.location.href = '/';
        return;
    }

    const user = userData.user;
    
    // Display user info
    document.getElementById('userName').textContent = user.displayName;
    document.getElementById('userTag').textContent = `#${user.tag}`;
    
    // Create avatar from first letter
    const avatar = document.getElementById('userAvatar');
    avatar.textContent = user.displayName.charAt(0).toUpperCase();
    
    // Load channels based on user roles
    loadChannels(user.roles);
}

// Load channels based on user roles
async function loadChannels(userRoles) {
    try {
        console.log('Loading channels for roles:', userRoles);
        // Get or create channels for user's roles
        const channels = await getOrCreateChannels(userRoles);
        console.log('Channels loaded:', channels);
        
        // Display channels
        displayChannels(channels);
        
        // If channels exist, select first one
        if (channels.length > 0) {
            selectChannel(channels[0]);
        }
    } catch (error) {
        console.error('Error loading channels:', error);
        // Fallback: create default channels
        const defaultChannels = createDefaultChannels(userRoles);
        displayChannels(defaultChannels);
        if (defaultChannels.length > 0) {
            selectChannel(defaultChannels[0]);
        }
    }
}

// Get or create channels for user roles
async function getOrCreateChannels(userRoles) {
    try {
        console.log('Requesting channels from API...');
        const response = await fetch('http://localhost:3000/api/channels/get-or-create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                roles: userRoles,
                companyGroupId: userData.companyGroup?.id,
            }),
        });

        console.log('Channels API response status:', response.status);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Failed to get/create channels');
        }

        const data = await response.json();
        console.log('Channels API response:', data);
        return data.channels || [];
    } catch (error) {
        console.error('Error getting channels from API:', error);
        // Return default channels based on roles
        console.log('Using default channels...');
        return createDefaultChannels(userRoles);
    }
}

// Create default channels if API fails
function createDefaultChannels(userRoles) {
    const roleChannelMap = {
        'engineering-frontend': { name: 'Frontend Engineering', description: 'Frontend engineering updates' },
        'engineering-backend': { name: 'Backend Engineering', description: 'Backend engineering updates' },
        'engineering-devops': { name: 'DevOps', description: 'DevOps and infrastructure updates' },
        'engineering-fullstack': { name: 'Full-Stack Engineering', description: 'Full-stack engineering updates' },
        'engineering-mobile': { name: 'Mobile Engineering', description: 'Mobile engineering updates' },
        'engineering-qa': { name: 'QA Engineering', description: 'QA and testing updates' },
        'engineering-security': { name: 'Security Engineering', description: 'Security engineering updates' },
        'engineering-data': { name: 'Data Engineering', description: 'Data engineering updates' },
        'engineering-infrastructure': { name: 'Infrastructure', description: 'Infrastructure updates' },
        'design': { name: 'Design', description: 'Design updates and changes' },
        'design-ui': { name: 'UI Design', description: 'UI design updates' },
        'design-ux': { name: 'UX Design', description: 'UX design updates' },
        'design-product': { name: 'Product Design', description: 'Product design updates' },
        'product': { name: 'Product', description: 'Product management updates' },
        'product-manager': { name: 'Product Management', description: 'Product management updates' },
        'sales': { name: 'Sales', description: 'Sales team updates' },
        'sales-account-executive': { name: 'Account Executives', description: 'Account executive updates' },
        'sales-customer-success': { name: 'Customer Success', description: 'Customer success updates' },
        'marketing': { name: 'Marketing', description: 'Marketing team updates' },
        'marketing-growth': { name: 'Growth Marketing', description: 'Growth marketing updates' },
        'operations': { name: 'Operations', description: 'Operations updates' },
        'ceo': { name: 'Executive', description: 'Executive updates' },
        'cto': { name: 'CTO', description: 'CTO updates' },
        'cfo': { name: 'CFO', description: 'CFO updates' },
        'coo': { name: 'COO', description: 'COO updates' },
        'vp-engineering': { name: 'VP Engineering', description: 'VP Engineering updates' },
        'vp-product': { name: 'VP Product', description: 'VP Product updates' },
        'vp-sales': { name: 'VP Sales', description: 'VP Sales updates' },
        'vp-marketing': { name: 'VP Marketing', description: 'VP Marketing updates' },
        'vp-growth': { name: 'VP Growth', description: 'VP Growth updates' },
        'support': { name: 'Support', description: 'Support team updates' },
        'management': { name: 'Management', description: 'Management updates' },
    };

    const channels = [];
    const seenChannels = new Set();

    userRoles.forEach(role => {
        const channelInfo = roleChannelMap[role];
        if (channelInfo && !seenChannels.has(channelInfo.name)) {
            channels.push({
                id: `channel-${role}`,
                name: channelInfo.name,
                description: channelInfo.description,
                role: role,
                type: 'role',
            });
            seenChannels.add(channelInfo.name);
        }
    });

    // Always add "Everyone" channel
    channels.unshift({
        id: 'channel-everyone',
        name: 'Everyone',
        description: 'Company-wide announcements and major updates',
        type: 'everyone',
    });

    return channels;
}

// Display channels in sidebar
function displayChannels(channels) {
    const channelsList = document.getElementById('channelsList');
    channelsList.innerHTML = '';

    channels.forEach(channel => {
        const channelItem = document.createElement('div');
        channelItem.className = 'channel-item';
        channelItem.dataset.channelId = channel.id;
        
        channelItem.innerHTML = `
            <div class="channel-name">
                ${channel.name}
                ${channel.type === 'role' ? '<span class="channel-badge">Role</span>' : '<span class="channel-badge">All</span>'}
            </div>
            <div class="channel-description">${channel.description}</div>
        `;

        channelItem.addEventListener('click', () => {
            selectChannel(channel);
        });

        channelsList.appendChild(channelItem);
    });
}

// Select a channel
function selectChannel(channel) {
    // Update active state
    document.querySelectorAll('.channel-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.channelId === channel.id) {
            item.classList.add('active');
        }
    });

    // Update header
    document.getElementById('currentChannel').textContent = channel.name;
    document.getElementById('channelDescription').textContent = channel.description;

    // Hide welcome message
    document.getElementById('welcomeMessage').style.display = 'none';
    
    // Show notifications container
    const notificationsContainer = document.getElementById('notificationsContainer');
    notificationsContainer.style.display = 'block';

    // Load notifications for this channel
    loadChannelNotifications(channel);
}

// Load notifications for a channel
async function loadChannelNotifications(channel) {
    const notificationsContainer = document.getElementById('notificationsContainer');
    
    // For now, show empty state
    notificationsContainer.innerHTML = `
        <div class="empty-state">
            <h3>No notifications yet</h3>
            <p>Notifications from ${channel.name} will appear here.</p>
        </div>
    `;
}

// Initialize on page load
window.addEventListener('load', () => {
    console.log('Dashboard page loaded');
    console.log('User data from localStorage:', userData);
    initDashboard();
});

// Also try immediately if DOM is already ready
if (document.readyState === 'loading') {
    // Wait for load
} else {
    console.log('DOM already ready, initializing dashboard');
    initDashboard();
}
