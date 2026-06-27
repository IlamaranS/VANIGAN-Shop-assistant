const API_BASE_URL = 'https://vanigan-shop-assistant-production.up.railway.app/api';

// Auth Logic Implementation
function setupAuthLogic() {
    const urlParams = new URLSearchParams(window.location.search);
    const authPayload = urlParams.get('auth_payload');
    if (authPayload) {
        try {
            const decodedStr = atob(authPayload);
            const data = JSON.parse(decodedStr);
            if (data.success) {
                localStorage.setItem('userSession', JSON.stringify(data));
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        } catch (e) {
            console.error("Failed to parse auth_payload", e);
        }
    }

    const sessionStr = localStorage.getItem('userSession');
    if (sessionStr) {
        try {
            const data = JSON.parse(sessionStr);
            sessionStorage.setItem('userId', data.user_id);
            const profileShopName = document.querySelector('.profile-info .shop-name');
            const profileRole = document.querySelector('.profile-info .shop-role');
            const profileAvatar = document.querySelector('.profile-avatar');
            if (profileShopName && data.shop_name) profileShopName.textContent = data.shop_name;
            if (profileRole && data.business_type) profileRole.textContent = data.business_type;
            if (profileAvatar && data.shop_name) profileAvatar.textContent = data.shop_name.charAt(0).toUpperCase();
            
            document.getElementById('auth-container').style.display = 'none';
            document.getElementById('app-container').style.display = 'flex';
            setTimeout(() => {
                document.getElementById('app-container').style.opacity = '1';
                fetchJobs();
                fetchAnalytics();
            }, 50);
        } catch (e) {
            console.error(e);
            localStorage.removeItem('userSession');
        }
    }

    const linkToSignup = document.getElementById('link-to-signup');
    const linkToLogin = document.getElementById('link-to-login');
    const btnLoginSubmit = document.getElementById('btn-login-submit');
    const btnLoginGoogle = document.getElementById('btn-login-google');
    const btnSignupStep1 = document.getElementById('btn-signup-step1');
    const btnSignupGoogle = document.getElementById('btn-signup-google');
    const btnSignupComplete = document.getElementById('btn-signup-complete');

    const viewLogin = document.getElementById('auth-login-view');
    const viewSignupStep1 = document.getElementById('auth-signup-step1');
    const viewSignupStep2 = document.getElementById('auth-signup-step2');

    function switchAuthView(hideView, showView) {
        hideView.classList.remove('active-auth-view');
        setTimeout(() => {
            hideView.style.display = 'none';
            showView.style.display = 'block';
            setTimeout(() => {
                showView.classList.add('active-auth-view');
            }, 10);
        }, 400); // match CSS transition duration
    }

    if (linkToSignup) {
        linkToSignup.addEventListener('click', () => switchAuthView(viewLogin, viewSignupStep1));
    }

    if (linkToLogin) {
        linkToLogin.addEventListener('click', () => switchAuthView(viewSignupStep1, viewLogin));
    }

    if (btnSignupStep1) {
        btnSignupStep1.addEventListener('click', () => {
            const email = document.getElementById('signup-email').value;
            const password = document.getElementById('signup-password').value;
            const errorDiv = document.getElementById('signup-error');
            if (errorDiv) errorDiv.style.display = 'none';
            if (email && password) switchAuthView(viewSignupStep1, viewSignupStep2);
            else {
                if (errorDiv) {
                    errorDiv.textContent = "Please enter an email and password.";
                    errorDiv.style.display = 'block';
                }
            }
        });
    }

    const demoLoginHandler = () => {
        window.location.href = API_BASE_URL + '/auth/google';
    };

    if (btnSignupGoogle) {
        btnSignupGoogle.addEventListener('click', demoLoginHandler);
    }

    if (btnLoginSubmit) {
        btnLoginSubmit.addEventListener('click', async () => {
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            const errorDiv = document.getElementById('login-error');
            if (errorDiv) errorDiv.style.display = 'none';
            
            if (!email || !password) {
                if (errorDiv) {
                    errorDiv.textContent = "Please enter both email and password.";
                    errorDiv.style.display = 'block';
                }
                return;
            }
            try {
                const response = await fetch(`${API_BASE_URL}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await response.json();
                if (data.success) {
                    localStorage.setItem('userSession', JSON.stringify(data));
                    sessionStorage.setItem('userId', data.user_id);
                    // Update badge if needed
                    const profileShopName = document.querySelector('.profile-info .shop-name');
                    const profileRole = document.querySelector('.profile-info .shop-role');
                    const profileAvatar = document.querySelector('.profile-avatar');
                    if (profileShopName && data.shop_name) profileShopName.textContent = data.shop_name;
                    if (profileRole && data.business_type) profileRole.textContent = data.business_type;
                    if (profileAvatar && data.shop_name) profileAvatar.textContent = data.shop_name.charAt(0).toUpperCase();
                    transitionToDashboard();
                } else {
                    if (errorDiv) {
                        errorDiv.textContent = data.error || "Login failed.";
                        errorDiv.style.display = 'block';
                    }
                }
            } catch (err) {
                if (errorDiv) {
                    errorDiv.textContent = "Error connecting to server.";
                    errorDiv.style.display = 'block';
                }
            }
        });
    }

    if (btnLoginGoogle) {
        btnLoginGoogle.addEventListener('click', demoLoginHandler);
    }

    if (btnSignupComplete) {
        btnSignupComplete.addEventListener('click', async () => {
            const email = document.getElementById('signup-email').value;
            const password = document.getElementById('signup-password').value;
            const shopName = document.getElementById('signup-shopname').value;
            const businessType = document.getElementById('signup-businesstype').value;
            const errorDiv = document.getElementById('signup-error');
            
            if (!shopName || !businessType || !email || !password) {
                switchAuthView(viewSignupStep2, viewSignupStep1);
                if (errorDiv) {
                    errorDiv.textContent = "Please complete all fields to sign up.";
                    errorDiv.style.display = 'block';
                }
                return;
            }

            try {
                const response = await fetch(`${API_BASE_URL}/signup`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password, shop_name: shopName, business_type: businessType })
                });
                const data = await response.json();
                if (data.success) {
                    localStorage.setItem('userSession', JSON.stringify(data));
                    sessionStorage.setItem('userId', data.user_id);
                    
                    // Dynamically update profile badge
                    const profileShopName = document.querySelector('.profile-info .shop-name');
                    const profileRole = document.querySelector('.profile-info .shop-role');
                    const profileAvatar = document.querySelector('.profile-avatar');
                    
                    if (profileShopName) profileShopName.textContent = shopName;
                    if (profileRole) profileRole.textContent = businessType;
                    if (profileAvatar && shopName) profileAvatar.textContent = shopName.charAt(0).toUpperCase();

                    transitionToDashboard();
                } else {
                    switchAuthView(viewSignupStep2, viewSignupStep1);
                    if (errorDiv) {
                        errorDiv.textContent = data.error || "Signup failed.";
                        errorDiv.style.display = 'block';
                    }
                }
            } catch (err) {
                switchAuthView(viewSignupStep2, viewSignupStep1);
                if (errorDiv) {
                    errorDiv.textContent = "Error connecting to server.";
                    errorDiv.style.display = 'block';
                }
            }
        });
    }
}

function transitionToDashboard() {
    const authContainer = document.getElementById('auth-container');
    const appContainer = document.getElementById('app-container');
    
    if (authContainer) {
        authContainer.style.opacity = '0';
        setTimeout(() => {
            authContainer.style.display = 'none';
            if (appContainer) {
                appContainer.style.display = 'flex';
                // Trigger reflow for transition
                void appContainer.offsetWidth; 
                appContainer.style.opacity = '1';
            }
            
            // 1. Isolate Initialization: Fire data pipelines AFTER authentication
            fetchJobs();
            fetchAnalytics();
        }, 500);
    }
}

// Primary Initialization Sequence
document.addEventListener('DOMContentLoaded', () => {
    setupAuthLogic();
    setupResizer();
    setupCalendar();

    // 2. Wrap ALL DOM Event Listeners in Safety Checks
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const headerMenuBtn = document.getElementById('header-menu-btn');
    const headerDropdownMenu = document.getElementById('header-dropdown-menu');
    const optSwapLayout = document.getElementById('opt-swap-layout');
    const optViewValidity = document.getElementById('opt-view-validity');
    const appContainer = document.getElementById('app-container');
    const btnAddInventory = document.getElementById('btn-add-inventory');

    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    }

    if (chatInput) {
        chatInput.addEventListener('keydown', function(event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
            }
        });
    }
    
    // Header Dropdown Toggle
    if (headerMenuBtn && headerDropdownMenu) {
        headerMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (headerDropdownMenu.style.display === 'none') {
                headerDropdownMenu.style.display = 'block';
            } else {
                headerDropdownMenu.style.display = 'none';
            }
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', () => {
            headerDropdownMenu.style.display = 'none';
        });
    }

    if (optSwapLayout && appContainer) {
        optSwapLayout.addEventListener('click', () => {
            appContainer.classList.toggle('flipped-layout-active');
            if (headerDropdownMenu) headerDropdownMenu.style.display = 'none';
        });
    }
    
    if (optViewValidity) {
        optViewValidity.addEventListener('click', () => {
            alert("You are enjoying your first free trial week.");
            if (headerDropdownMenu) headerDropdownMenu.style.display = 'none';
        });
    }

    const profileCard = document.getElementById('sidebar-profile-card');
    const profileMenu = document.getElementById('profile-dropdown-menu');
    const optProfileSettings = document.getElementById('opt-profile-settings');
    const closeEditModalBtn = document.getElementById('close-edit-modal');
    const btnUpdateRecord = document.getElementById('btn-update-record');
    
    if (profileCard && profileMenu) {
        profileCard.addEventListener('click', (e) => {
            e.stopPropagation();
            profileMenu.style.display = profileMenu.style.display === 'none' ? 'block' : 'none';
        });
        
        document.addEventListener('click', () => {
            profileMenu.style.display = 'none';
        });
    }

    const optProfileTheme = document.getElementById('opt-profile-theme');
    const optProfileFont = document.getElementById('opt-profile-font');
    const optProfileSignout = document.getElementById('opt-profile-signout');

    if (optProfileSettings) {
        optProfileSettings.addEventListener('click', () => alert("Feature coming soon"));
    }
    if (optProfileTheme) {
        optProfileTheme.addEventListener('click', () => alert("Feature coming soon"));
    }
    if (optProfileFont) {
        optProfileFont.addEventListener('click', () => alert("Feature coming soon"));
    }
    if (optProfileSignout) {
        optProfileSignout.addEventListener('click', () => {
            localStorage.removeItem('userSession');
            sessionStorage.removeItem('userId');
            window.location.reload();
        });
    }

    if (closeEditModalBtn) {
        closeEditModalBtn.addEventListener('click', closeEditModal);
    }
    
    if (btnUpdateRecord) {
        btnUpdateRecord.addEventListener('click', updateDatabaseRecord);
    }

    const navButtons = document.querySelectorAll('.nav-item');
    if (navButtons && navButtons.length > 0) {
        navButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                navButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                const contentViews = document.querySelectorAll('.content-view');
                if (contentViews) {
                    contentViews.forEach(v => {
                        v.style.display = 'none';
                        v.classList.remove('active');
                    });
                }
                
                const target = btn.dataset.target;
                const targetView = document.getElementById(`view-${target}`);
                if (targetView) {
                    targetView.style.display = 'block';
                    targetView.classList.add('active');
                }
                
                if (target === 'pending' || target === 'customers' || target === 'yet-to-pay') {
                    fetchJobs();
                } else if (target === 'analytics') {
                    fetchAnalytics();
                }
            });
        });
    }

    const chatChips = document.querySelectorAll('.chip-btn');
    if (chatChips && chatChips.length > 0) {
        chatChips.forEach(chip => {
            chip.addEventListener('click', function() {
                let chipText = "";
                const textContent = this.textContent || "";
                if (textContent.includes("Refresh Analytics")) chipText = "Refresh Analytics";
                else if (textContent.includes("Show Unpaid")) chipText = "Show Unpaid";
                else if (textContent.includes("New Job Setup")) chipText = "New Job Setup";
                else chipText = textContent.replace(/^[^\w\s]+/, '').trim();
                
                if (chatInput) {
                    chatInput.value = chipText;
                    sendMessage();
                }
            });
        });
    }

    setupSearchFilter('search-db', 'database-body');
    setupSearchFilter('search-unpaid', 'unpaid-body');

    if (btnAddInventory) {
        btnAddInventory.addEventListener('click', () => {
            const nameInput = document.getElementById('inv-item-name');
            const qtyInput = document.getElementById('inv-item-qty');
            const tbody = document.getElementById('inventory-body');
            
            if (!nameInput || !qtyInput || !tbody) return;
            
            const name = nameInput.value.trim();
            const qty = parseInt(qtyInput.value || "0", 10);
            
            if (!name) {
                alert("Please enter an item name.");
                return;
            }
            
            let statusText, bg, color;
            if (qty > 3) {
                statusText = "In Stock"; bg = "#e6f4ea"; color = "#1e8e3e";
            } else if (qty >= 1 && qty <= 3) {
                statusText = "Low Stock"; bg = "#fef7e0"; color = "#b06000";
            } else {
                statusText = "Out of Stock"; bg = "#f1f3f4"; color = "#5f6368";
            }
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${name}</td>
                <td>${qty} units</td>
                <td><span class="status-badge" style="background: ${bg}; color: ${color}; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem;">${statusText}</span></td>
            `;
            
            tbody.appendChild(tr);
            nameInput.value = "";
            qtyInput.value = "";
        });
    }
});

// Helper: Append message to chat
function appendMessage(text, sender) {
    const chatHistory = document.getElementById('chat-history');
    if (!chatHistory) return;

    const wrapper = document.createElement('div');
    wrapper.classList.add('message-wrapper', sender);
    
    const div = document.createElement('div');
    div.classList.add('message', sender);
    div.innerHTML = `<p>${text}</p>`;
    
    const actionsDiv = document.createElement('div');
    actionsDiv.classList.add('message-actions');
    
    const copyBtn = document.createElement('button');
    copyBtn.classList.add('action-btn', 'copy-btn');
    copyBtn.innerHTML = '📋 Copy';
    copyBtn.onclick = () => {
        const plainText = text.replace(/<br>/g, '\n').replace(/<\/?[^>]+(>|$)/g, "");
        navigator.clipboard.writeText(plainText).then(() => {
            copyBtn.innerHTML = '✅ Copied!';
            setTimeout(() => { copyBtn.innerHTML = '📋 Copy'; }, 2000);
        });
    };
    actionsDiv.appendChild(copyBtn);
    
    if (sender === 'user') {
        const editBtn = document.createElement('button');
        editBtn.classList.add('action-btn', 'edit-btn');
        editBtn.innerHTML = '✏️ Edit';
        editBtn.onclick = () => {
            const plainText = text.replace(/<br>/g, '\n').replace(/<\/?[^>]+(>|$)/g, "");
            const chatInput = document.getElementById('chat-input');
            if (chatInput) {
                chatInput.value = plainText;
                chatInput.focus();
            }
        };
        actionsDiv.appendChild(editBtn);
    }
    
    wrapper.appendChild(div);
    wrapper.appendChild(actionsDiv);
    chatHistory.appendChild(wrapper);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

// Send chat message to backend
async function sendMessage() {
    const chatInput = document.getElementById('chat-input');
    const chatHistory = document.getElementById('chat-history');
    if (!chatInput || !chatHistory) return;

    const text = chatInput.value.trim();
    if (!text) return;

    appendMessage(text, 'user');
    chatInput.value = '';
    
    const lowerText = text.toLowerCase();
    let intercepted = false;
    
    if (lowerText.includes("calendar") || lowerText.includes("delivery calendar")) {
        const btn = document.getElementById('btn-calendar');
        if (btn) btn.click();
        appendMessage("Switching to Delivery Calendar view...", "assistant");
        intercepted = true;
    } else if (lowerText.includes("inventory")) {
        const btn = document.getElementById('btn-inventory');
        if (btn) btn.click();
        appendMessage("Switching to Inventory Tracker...", "assistant");
        intercepted = true;
    } else if (lowerText.includes("settings") || lowerText.includes("shop settings")) {
        const btn = document.getElementById('btn-settings');
        if (btn) btn.click();
        appendMessage("Switching to Shop Settings...", "assistant");
        intercepted = true;
    } else if (lowerText.includes("analytics")) {
        const btn = document.querySelector('.nav-item[data-target="analytics"]');
        if (btn) btn.click();
        appendMessage("Switching to Analytics...", "assistant");
        intercepted = true;
    } else if (lowerText === "customer database" || lowerText.startsWith("switch to customer") || lowerText.startsWith("show customer")) {
        const btn = document.querySelector('.nav-item[data-target="customers"]');
        if (btn) btn.click();
        appendMessage("Switching to Customer Database...", "assistant");
        intercepted = true;
    } else if (lowerText.includes("pending orders") || lowerText === "pending") {
        const btn = document.querySelector('.nav-item[data-target="pending"]');
        if (btn) btn.click();
        appendMessage("Switching to Pending Orders...", "assistant");
        intercepted = true;
    }

    if (intercepted) return;
    
    const loadingDiv = document.createElement('div');
    loadingDiv.classList.add('message', 'assistant');
    loadingDiv.innerHTML = '<p class="typing-indicator">...</p>';
    loadingDiv.id = 'loading-indicator';
    chatHistory.appendChild(loadingDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    try {
        const userId = sessionStorage.getItem('userId') || '';
        const response = await fetch(`${API_BASE_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text, user_id: parseInt(userId) || null })
        });
        
        const data = await response.json();
        const indicator = document.getElementById('loading-indicator');
        if (indicator) indicator.remove();
        
        if (!data || !data.reply) {
            appendMessage("Server returned an invalid response.", "assistant");
            return;
        }
        
        const formattedReply = data.reply.replace(/\n/g, '<br>');
        appendMessage(formattedReply, 'assistant');
        
        if (data.action === 'refresh_jobs') {
            fetchJobs();
            fetchAnalytics();
        } else if (data.action && data.action.startsWith('show_registration_template:')) {
            fetchJobs();
            fetchAnalytics();
            const newJobId = data.action.split(':')[1];
            
            // Fetch jobs manually to guarantee we have the latest job details to extract
            const userId = sessionStorage.getItem('userId') || '';
            const jobsResponse = await fetch(`${API_BASE_URL}/jobs?user_id=${userId}`);
            const jobsList = await jobsResponse.json();
            const job = jobsList.find(j => j.job_id === newJobId);
            
            const chatInputBox = document.getElementById('chat-input');
            if (job && chatInputBox) {
                const customer = job.customer_name || "Customer";
                const product = job.product || "Device";
                const total = job.total_cost || 0;
                const delivery_date = job.deadline || "TBD";
                
                chatInputBox.value = `Dear ${customer}, your device (${product}) has been checked in under Job ID: ${newJobId}. Estimated cost: ₹${total}. Promised delivery: ${delivery_date}.`;
                chatInputBox.focus();
            }
        } else if (data.action === 'show_unpaid') {
            const btn = document.querySelector('.nav-item[data-target="yet-to-pay"]');
            if (btn) btn.click();
        } else if (data.action === 'show_analytics') {
            const btn = document.querySelector('.nav-item[data-target="analytics"]');
            if (btn) btn.click();
        } else if (data.action === 'show_pending') {
            const btn = document.querySelector('.nav-item[data-target="pending"]');
            if (btn) btn.click();
        } else if (data.action === 'show_database') {
            const btn = document.querySelector('.nav-item[data-target="customers"]');
            if (btn) btn.click();
        }
    } catch (error) {
        const indicator = document.getElementById('loading-indicator');
        if (indicator) indicator.remove();
        appendMessage(`Network Error: Could not reach the server. Make sure FastAPI is running.`, 'assistant');
        console.error(error);
    }
}

// Fetch and render jobs
async function fetchJobs() {
    try {
        const userId = sessionStorage.getItem('userId') || '';
        const response = await fetch(`${API_BASE_URL}/jobs?user_id=${userId}`);
        const jobs = await response.json();
        
        const pendingList = document.getElementById('pending-list');
        const dbBody = document.getElementById('database-body');
        const unpaidBody = document.getElementById('unpaid-body');
        
        if (pendingList) pendingList.innerHTML = '';
        if (dbBody) dbBody.innerHTML = '';
        if (unpaidBody) unpaidBody.innerHTML = '';
        
        let pendingCount = 0;
        let unpaidCount = 0;
        
        if (!jobs || jobs.length === 0) {
            if (pendingList) pendingList.innerHTML = '<p style="color: #666;">No jobs found. Start chatting to create one!</p>';
            if (dbBody) dbBody.innerHTML = '<tr><td colspan="6">No records in database.</td></tr>';
            return;
        }
        
        const getWhatsAppLink = (job, balance) => {
            const text = `Hi ${job.customer_name}, your repair is tracked under ID ${job.job_id}. Outstanding balance remaining: ₹${balance}. Thank you! - VANIGAN Shop Assistant`;
            const phoneStr = job.phone ? job.phone.toString().replace(/\D/g, '') : '';
            const finalPhone = phoneStr.length <= 10 ? `91${phoneStr}` : phoneStr;
            return `<a href="https://wa.me/${finalPhone}?text=${encodeURIComponent(text)}" target="_blank" class="wa-btn" title="Send WhatsApp Reminder">💬</a>`;
        };

        jobs.forEach(job => {
            const calculatedBalance = (job.total_cost || 0) - (job.advance_paid || 0);
            const waLink = getWhatsAppLink(job, calculatedBalance);
            
            if (dbBody) {
                const totalCost = job.total_cost || 0;
                const advancePaid = job.advance_paid || 0;
                let paymentLabel = "";
                let paymentClass = "";
                
                if (totalCost === 0 && advancePaid === 0) {
                    paymentLabel = "Cost Required";
                    paymentClass = "status-pending";
                } else if (totalCost > 0 && advancePaid >= totalCost) {
                    paymentLabel = "Completed";
                    paymentClass = "status-completed";
                } else {
                    paymentLabel = "Yet to be done";
                    paymentClass = "status-pending";
                }
                
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${job.job_id}</td>
                    <td>${job.customer_name}</td>
                    <td>${job.phone} ${waLink}</td>
                    <td>${job.product}</td>
                    <td><span class="status-toggle status-${job.status.toLowerCase()}">${job.status}</span></td>
                    <td><span class="status-toggle ${paymentClass}">${paymentLabel}</span></td>
                    <td class="actions-cell">
                        <button class="btn-inline-edit" onclick="openEditModal('${job.job_id}', '${(job.customer_name || '').replace(/'/g, "\\'")}', '${job.phone || ''}', '${(job.product || '').replace(/'/g, "\\'")}', ${job.total_cost || 0}, ${job.advance_paid || 0})">✏️</button>
                    </td>
                `;
                dbBody.appendChild(tr);
            }

            if (job.status === 'Pending') {
                pendingCount++;
                
                // Real-Time Live Aging Calculator
                let badgeText = job.deadline || 'No Deadline';
                let hasAlert = false;
                if (job.deadline) {
                    let deadlineStr = job.deadline.toLowerCase();
                    const weekMatch = deadlineStr.match(/(\d+)\s+week/);
                    if (weekMatch) {
                        const days = parseInt(weekMatch[1]) * 7;
                        badgeText = `${days} days remaining`;
                    } else {
                        const targetDate = new Date(job.deadline);
                        if (!isNaN(targetDate.getTime())) {
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            targetDate.setHours(0, 0, 0, 0);
                            const diffTime = targetDate - today;
                            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                            
                            if (diffDays === 0) {
                                badgeText = "DUE: TODAY";
                                hasAlert = true;
                            } else if (diffDays === 1) {
                                badgeText = "DUE: 1 DAY";
                                hasAlert = true;
                            } else if (diffDays > 1) {
                                badgeText = `DUE: ${diffDays} DAYS`;
                                if (diffDays <= 2) hasAlert = true;
                            } else if (diffDays < 0) {
                                badgeText = `OVERDUE: ${Math.abs(diffDays)} DAYS`;
                                hasAlert = true;
                            }
                        }
                    }
                }

                if (hasAlert) {
                    let alertDiv = document.getElementById('deadline-alert-overlay');
                    if (!alertDiv) {
                        alertDiv = document.createElement('div');
                        alertDiv.id = 'deadline-alert-overlay';
                        alertDiv.style.cssText = "position: absolute; top: 20px; left: 50%; transform: translateX(-50%); background: #fee2e2; color: #991b1b; padding: 12px 24px; border-radius: 8px; font-weight: bold; z-index: 9999; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border: 1px solid #f87171;";
                        alertDiv.innerText = "⚠️ Attention: You have approaching or overdue job deadlines!";
                        document.body.appendChild(alertDiv);
                        setTimeout(() => alertDiv.remove(), 5000);
                    }
                }

                const card = document.createElement('div');
                card.classList.add('job-card');
                card.innerHTML = `
                    <div class="job-header">
                        <span style="font-weight: bold;">${job.job_id} <span style="color: #64748b; font-weight: normal; margin: 0 4px;">•</span> ${badgeText}</span>
                        <label class="task-done-label">
                            <input type="checkbox" class="task-done-cb" onchange="markTaskDone('${job.job_id}', this, '${job.customer_name}', '${job.product}', ${job.total_cost || 0}, ${job.advance_paid || 0})"> Task Done?
                        </label>
                    </div>
                    <div class="job-title">${job.customer_name} - ${job.product}</div>
                    <div style="margin-top: 8px; font-size: 0.95rem; color: #444;">Issue: ${job.issue}</div>
                    <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee; display: flex; justify-content: space-between; font-size: 0.85rem; color: #888; align-items: center;">
                        <span>📞 ${job.phone} ${waLink}</span>
                        <span>Total: ₹${job.total_cost || 0} | Advance: ₹${job.advance_paid || 0}</span>
                    </div>
                `;
                if (pendingList) pendingList.appendChild(card);
            }
            
            if (calculatedBalance > 0 && unpaidBody) {
                unpaidCount++;
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${job.job_id}</td>
                    <td>${job.customer_name}</td>
                    <td>${job.phone} ${waLink}</td>
                    <td>₹${job.total_cost || 0}</td>
                    <td style="color: #e74c3c; font-weight: 600;">₹${calculatedBalance}</td>
                    <td><span class="status-toggle status-${job.status.toLowerCase()}">${job.status}</span></td>
                `;
                unpaidBody.appendChild(tr);
            }
        });
        
        if (pendingCount === 0 && pendingList) pendingList.innerHTML = '<p style="color: #666;">No pending jobs right now.</p>';
        if (unpaidCount === 0 && unpaidBody) unpaidBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #27ae60;">All caught up on payments.</td></tr>';
        
    } catch (error) {
        const pendingList = document.getElementById('pending-list');
        if (pendingList) pendingList.innerHTML = '<p style="color: #e74c3c;">Failed to load data from server. Ensure backend is running.</p>';
        console.error(error);
    }
}

async function fetchAnalytics() {
    try {
        const userId = sessionStorage.getItem('userId') || '';
        const response = await fetch(`${API_BASE_URL}/analytics?user_id=${userId}`);
        const data = await response.json();
        
        const elToday = document.getElementById('turnover-today');
        const elWeekly = document.getElementById('turnover-weekly');
        const elMonthly = document.getElementById('turnover-monthly');
        const elYearly = document.getElementById('turnover-yearly');
        
        if (elToday) elToday.innerText = '₹' + data.today;
        if (elWeekly) elWeekly.innerText = '₹' + data.weekly;
        if (elMonthly) elMonthly.innerText = '₹' + data.monthly;
        if (elYearly) elYearly.innerText = '₹' + data.yearly;
    } catch (e) {
        console.error("Failed to load analytics", e);
    }
}

// Search Filter Logic
function setupSearchFilter(inputId, tableBodyId) {
    const searchInput = document.getElementById(inputId);
    if (!searchInput) return;
    
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const tbody = document.getElementById(tableBodyId);
        if (!tbody) return;
        
        const rows = tbody.querySelectorAll('tr');
        rows.forEach(row => {
            const text = row.innerText.toLowerCase();
            row.style.display = text.includes(term) ? '' : 'none';
        });
    });
}

// Global Task Done Handler for WhatsApp Trigger
window.markTaskDone = function(jobId, checkbox, customerName, product, totalCost, advancePaid) {
    if (checkbox) checkbox.checked = false; // Prevent default checking until payment is confirmed
    
    const paymentModal = document.getElementById('payment-modal');
    const paymentInput = document.getElementById('payment-amount');
    const btnSubmit = document.getElementById('btn-submit-payment');
    const closeBtn = document.getElementById('close-payment-modal');
    
    if (paymentModal && paymentInput && btnSubmit) {
        paymentInput.value = '';
        paymentModal.style.display = 'flex';
        
        const closeModal = () => {
            paymentModal.style.display = 'none';
        };
        
        if (closeBtn) closeBtn.onclick = closeModal;
        
        btnSubmit.onclick = async () => {
            const amountStr = paymentInput.value;
            const amount = parseFloat(amountStr) || 0;
            const balance = (totalCost || 0) - (advancePaid || 0);
            
            try {
                // Determine if this pays it off completely
                const isComplete = amount >= balance;
                
                const payload = {
                    advance_paid: (advancePaid || 0) + amount,
                    status: isComplete ? 'Completed' : 'Pending'
                };
                
                const response = await fetch(`${API_BASE_URL}/jobs/${jobId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                if (response.ok) {
                    closeModal();
                    fetchJobs(); // This will auto-move it to Unpaid if partial, or drop it from pending if Completed.
                } else {
                    alert('Failed to update job payment status.');
                }
            } catch (e) {
                console.error('API Error:', e);
                alert('Error communicating with server.');
            }
        };
    }
}

// Alias for Customer Load
window.loadCustomers = fetchJobs;

// Modal Editor Logic
function openEditModal(job_id, customer, phone, product, cost, advance) {
    document.getElementById('edit-job-id').value = job_id || '';
    document.getElementById('edit-customer-name').value = customer || '';
    document.getElementById('edit-phone').value = phone || '';
    document.getElementById('edit-product').value = product || '';
    document.getElementById('edit-total-cost').value = cost || 0;
    document.getElementById('edit-advance-paid').value = advance || 0;
    document.getElementById('edit-customer-modal').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('edit-customer-modal').style.display = 'none';
}

async function updateDatabaseRecord() {
    const job_id = document.getElementById('edit-job-id').value;
    const customer = document.getElementById('edit-customer-name').value;
    const phone = document.getElementById('edit-phone').value;
    const product = document.getElementById('edit-product').value;
    const cost = document.getElementById('edit-total-cost').value;
    const advance = document.getElementById('edit-advance-paid').value;
    
    if (!job_id) return;
    
    const payload = {
        customer_name: customer,
        phone: phone,
        product: product,
        total_cost: cost,
        advance_paid: advance
    };
    
    try {
        const response = await fetch(`${API_BASE_URL}/jobs/${job_id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            closeEditModal();
            loadCustomers();
        } else {
            alert('Failed to update record.');
        }
    } catch (e) {
        console.error(e);
        alert('Error communicating with server.');
    }
};

// Panel Resizer Logic
function setupResizer() {
    const resizer = document.getElementById('panel-resizer');
    const chatPanel = document.getElementById('chat-panel');
    
    if (!resizer || !chatPanel) return;

    let isDragging = false;

    resizer.addEventListener('mousedown', (e) => {
        isDragging = true;
        resizer.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none'; // Prevent text selection
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const appContainer = document.getElementById('app-container');
        if (!appContainer) return;
        
        // Calculate the exact percentage relative to the viewport
        let containerWidth = appContainer.clientWidth;
        let newPercentage = (e.clientX / containerWidth) * 100;
        
        // Constrain width between 20% and 50% of screen
        if (newPercentage >= 20 && newPercentage <= 50) {
            chatPanel.style.width = newPercentage + '%';
            chatPanel.style.flex = 'none';
        }
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            resizer.classList.remove('dragging');
            document.body.style.cursor = 'default';
            document.body.style.userSelect = '';
        }
    });
}

// Dynamic Calendar Logic
function setupCalendar() {
    const monthSelect = document.getElementById('cal-month');
    const yearSelect = document.getElementById('cal-year');
    const btnCalendar = document.getElementById('btn-calendar');
    
    if (!monthSelect || !yearSelect) return;
    
    const renderCalendar = async () => {
        const grid = document.getElementById('calendar-days-grid');
        if (!grid) return;
        
        grid.innerHTML = '';
        
        const month = parseInt(monthSelect.value);
        const year = parseInt(yearSelect.value);
        
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        // Fetch jobs for metric overlays
        const userId = sessionStorage.getItem('userId') || '';
        let jobsList = [];
        try {
            const response = await fetch(`${API_BASE_URL}/jobs?user_id=${userId}`);
            const data = await response.json();
            jobsList = Array.isArray(data) ? data : [];
        } catch (e) { 
            console.error("Failed to fetch jobs for calendar:", e);
            jobsList = [];
        }
        
        // Adjust JS getDay() (0=Sun, 1=Mon) to standard (1=Mon, 7=Sun)
        let startOffset = firstDay === 0 ? 6 : firstDay - 1;
        
        const today = new Date();
        const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;
        
        // Blank cells before start
        for (let i = 0; i < startOffset; i++) {
            const cell = document.createElement('div');
            cell.className = 'calendar-day-cell';
            cell.style.background = '#fafafa';
            cell.style.borderColor = 'transparent';
            grid.appendChild(cell);
        }
        
        // Days
        for (let d = 1; d <= daysInMonth; d++) {
            const cell = document.createElement('div');
            cell.className = 'calendar-day-cell';
            cell.textContent = d;
            
            if (isCurrentMonth && d === today.getDate()) {
                cell.style.background = '#e8f0fe';
                cell.style.fontWeight = 'bold';
                cell.style.color = '#1a73e8';
                cell.textContent = d + ' (Today)';
            }
            
            // Check jobs for this date overlay
            const cellDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            let totalTurnover = 0;
            let pendingJobsList = [];
            
            jobsList.forEach(job => {
                let computedDeadline = job.raw_deadline;
                if (computedDeadline && !computedDeadline.includes('-')) {
                    const match = computedDeadline.match(/(\d+)\s+DAYS/i);
                    if (match) {
                        const days = parseInt(match[1]);
                        const dObj = new Date(2026, 5, 25);
                        dObj.setDate(dObj.getDate() + days);
                        computedDeadline = `${dObj.getFullYear()}-${String(dObj.getMonth()+1).padStart(2,'0')}-${String(dObj.getDate()).padStart(2,'0')}`;
                    } else if (computedDeadline.match(/TODAY/i)) {
                        computedDeadline = "2026-06-25";
                    } else if (computedDeadline.match(/TOMORROW/i)) {
                        computedDeadline = "2026-06-26";
                    }
                }
                
                if (computedDeadline === cellDateStr) {
                    if (job.status === 'Completed') {
                        totalTurnover += (job.total_cost || 0);
                    }
                    if (job.status === 'Pending' || job.status === 'Pending Quote') {
                        pendingJobsList.push(`${job.customer_name || 'Customer'} - ${job.product || 'Device'}`);
                    }
                }
            });
            
            if (totalTurnover > 0 || pendingJobsList.length > 0) {
                cell.style.position = 'relative';
                
                if (totalTurnover > 0) {
                    cell.insertAdjacentHTML('beforeend', `<span class="cal-dot dot-green" title="Turnover: ₹${totalTurnover}"></span>`);
                }
                if (pendingJobsList.length > 0) {
                    const tooltipText = `Pending:\n${pendingJobsList.join('\n')}`;
                    cell.insertAdjacentHTML('beforeend', `<span class="cal-dot dot-red" title="${tooltipText}"></span>`);
                }
            }
            
            grid.appendChild(cell);
        }
        
        // Fill out last row
        const totalCells = startOffset + daysInMonth;
        const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
        for(let i = 0; i < remaining; i++){
            const cell = document.createElement('div');
            cell.className = 'calendar-day-cell';
            cell.style.background = '#fafafa';
            cell.style.borderColor = 'transparent';
            grid.appendChild(cell);
        }
    };
    
    monthSelect.addEventListener('change', renderCalendar);
    yearSelect.addEventListener('change', renderCalendar);
    
    // Initial render when the button is clicked to save resources, or just render it
    renderCalendar();
}
