// All available roles with display names
const ROLES = [
    // Engineering
    { value: 'engineering-frontend', label: 'Frontend Engineer', category: 'Engineering' },
    { value: 'engineering-backend', label: 'Backend Engineer', category: 'Engineering' },
    { value: 'engineering-devops', label: 'DevOps Engineer', category: 'Engineering' },
    { value: 'engineering-fullstack', label: 'Full-Stack Engineer', category: 'Engineering' },
    { value: 'engineering-mobile', label: 'Mobile Engineer', category: 'Engineering' },
    { value: 'engineering-qa', label: 'QA Engineer', category: 'Engineering' },
    { value: 'engineering-security', label: 'Security Engineer', category: 'Engineering' },
    { value: 'engineering-data', label: 'Data Engineer', category: 'Engineering' },
    { value: 'engineering-infrastructure', label: 'Infrastructure Engineer', category: 'Engineering' },
    
    // Design
    { value: 'design', label: 'Designer', category: 'Design' },
    { value: 'design-ui', label: 'UI Designer', category: 'Design' },
    { value: 'design-ux', label: 'UX Designer', category: 'Design' },
    { value: 'design-product', label: 'Product Designer', category: 'Design' },
    { value: 'design-visual', label: 'Visual Designer', category: 'Design' },
    
    // Product
    { value: 'product', label: 'Product', category: 'Product' },
    { value: 'product-manager', label: 'Product Manager', category: 'Product' },
    { value: 'product-strategy', label: 'Product Strategy', category: 'Product' },
    { value: 'product-marketing', label: 'Product Marketing', category: 'Product' },
    
    // Sales
    { value: 'sales', label: 'Sales', category: 'Sales' },
    { value: 'sales-account-executive', label: 'Account Executive', category: 'Sales' },
    { value: 'sales-development', label: 'Sales Development', category: 'Sales' },
    { value: 'sales-customer-success', label: 'Customer Success', category: 'Sales' },
    { value: 'sales-business-development', label: 'Business Development', category: 'Sales' },
    
    // Marketing
    { value: 'marketing', label: 'Marketing', category: 'Marketing' },
    { value: 'marketing-growth', label: 'Growth Marketing', category: 'Marketing' },
    { value: 'marketing-content', label: 'Content Marketing', category: 'Marketing' },
    { value: 'marketing-brand', label: 'Brand Marketing', category: 'Marketing' },
    { value: 'marketing-digital', label: 'Digital Marketing', category: 'Marketing' },
    { value: 'marketing-community', label: 'Community Marketing', category: 'Marketing' },
    
    // Operations
    { value: 'operations', label: 'Operations', category: 'Operations' },
    { value: 'operations-people', label: 'People Operations', category: 'Operations' },
    { value: 'operations-finance', label: 'Finance', category: 'Operations' },
    { value: 'operations-legal', label: 'Legal', category: 'Operations' },
    { value: 'operations-facilities', label: 'Facilities', category: 'Operations' },
    
    // Executive
    { value: 'ceo', label: 'CEO', category: 'Executive' },
    { value: 'cto', label: 'CTO', category: 'Executive' },
    { value: 'cfo', label: 'CFO', category: 'Executive' },
    { value: 'coo', label: 'COO', category: 'Executive' },
    { value: 'vp-engineering', label: 'VP Engineering', category: 'Executive' },
    { value: 'vp-product', label: 'VP Product', category: 'Executive' },
    { value: 'vp-sales', label: 'VP Sales', category: 'Executive' },
    { value: 'vp-marketing', label: 'VP Marketing', category: 'Executive' },
    { value: 'vp-growth', label: 'VP Growth', category: 'Executive' },
    { value: 'vp-operations', label: 'VP Operations', category: 'Executive' },
    { value: 'vp-people', label: 'VP People', category: 'Executive' },
    { value: 'vp-finance', label: 'VP Finance', category: 'Executive' },
    
    // Support
    { value: 'support', label: 'Support', category: 'Support' },
    { value: 'support-customer', label: 'Customer Support', category: 'Support' },
    { value: 'support-technical', label: 'Technical Support', category: 'Support' },
    
    // Management
    { value: 'management', label: 'Management', category: 'Management' },
    { value: 'management-director', label: 'Director', category: 'Management' },
    { value: 'management-manager', label: 'Manager', category: 'Management' },
    { value: 'management-team-lead', label: 'Team Lead', category: 'Management' },
    
    // Other
    { value: 'consultant', label: 'Consultant', category: 'Other' },
    { value: 'contractor', label: 'Contractor', category: 'Other' },
    { value: 'intern', label: 'Intern', category: 'Other' },
    { value: 'founder', label: 'Founder', category: 'Other' },
    { value: 'advisor', label: 'Advisor', category: 'Other' },
    { value: 'board-member', label: 'Board Member', category: 'Other' },
    { value: 'other', label: 'Other', category: 'Other' },
];

// Initialize role selector
let selectedRoles = new Set();

// Step navigation
let currentStep = 1;
const totalSteps = 2;

function showStep(step) {
    // Hide all steps
    document.querySelectorAll('.form-step').forEach(s => {
        s.classList.remove('active');
    });
    
    // Show current step
    const stepElement = document.getElementById(`step${step}`);
    if (stepElement) {
        stepElement.classList.add('active');
    }
    
    // Update step indicator
    document.querySelectorAll('.step').forEach((s, index) => {
        s.classList.toggle('active', index + 1 === step);
    });
    
    currentStep = step;
    
    // Focus on first input if available
    setTimeout(() => {
        const firstInput = document.querySelector(`#step${step} input`);
        if (firstInput) {
            firstInput.focus();
        }
    }, 300);
}

// Set up button handlers
function setupButtonHandlers() {
    console.log('Setting up button handlers...');
    
    // Next button - move to step 2
    const nextBtn = document.getElementById('nextToStep2');
    if (nextBtn) {
        // Remove existing listeners, then add new one
        nextBtn.onclick = null;
        nextBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Continue button clicked!');
            
            const nameInput = document.getElementById('displayName');
            if (nameInput && nameInput.value.trim()) {
                console.log('Name validated, moving to step 2');
                showStep(2);
            } else {
                console.log('Name validation failed');
                if (nameInput) {
                    nameInput.focus();
                    nameInput.style.borderColor = '#ef4444';
                    setTimeout(() => {
                        nameInput.style.borderColor = '';
                    }, 2000);
                }
            }
        });
        console.log('✓ Continue button handler attached');
    } else {
        console.error('Continue button not found!');
    }
    
    // Back button - move to step 1
    const backBtn = document.getElementById('backToStep1');
    if (backBtn) {
        // Remove existing listeners, then add new one
        backBtn.onclick = null;
        backBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Back button clicked, moving to step 1');
            showStep(1);
        });
        console.log('✓ Back button handler attached');
    }
}

// Set up handlers when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupButtonHandlers);
} else {
    setupButtonHandlers();
}

// Fuzzy match function - checks if search term matches role (autocorrect-like)
function fuzzyMatch(searchTerm, text) {
    const search = searchTerm.toLowerCase();
    const target = text.toLowerCase();
    
    // Direct substring match
    if (target.includes(search)) {
        return true;
    }
    
    // Fuzzy matching: check if all characters of search appear in order in target
    let searchIndex = 0;
    for (let i = 0; i < target.length && searchIndex < search.length; i++) {
        if (target[i] === search[searchIndex]) {
            searchIndex++;
        }
    }
    
    return searchIndex === search.length;
}

// Score match quality (for sorting)
function matchScore(searchTerm, role) {
    const search = searchTerm.toLowerCase();
    const label = role.label.toLowerCase();
    const value = role.value.toLowerCase();
    const category = role.category.toLowerCase();
    
    let score = 0;
    
    // Exact match in label (highest priority)
    if (label === search) return 1000;
    
    // Starts with search term
    if (label.startsWith(search)) score += 100;
    if (value.startsWith(search)) score += 90;
    
    // Contains search term
    if (label.includes(search)) score += 50;
    if (value.includes(search)) score += 40;
    if (category.includes(search)) score += 30;
    
    // Fuzzy match
    if (fuzzyMatch(searchTerm, label)) score += 20;
    if (fuzzyMatch(searchTerm, value)) score += 15;
    
    return score;
}

function showSuggestions(searchTerm) {
    const dropdown = document.getElementById('roleDropdown');
    const search = searchTerm.trim().toLowerCase();
    
    if (!search) {
        dropdown.style.display = 'none';
        return;
    }
    
    // Filter and score roles
    const matches = ROLES
        .map(role => ({
            role,
            score: matchScore(searchTerm, role)
        }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8); // Show top 8 matches
    
    if (matches.length === 0) {
        dropdown.innerHTML = '<div class="role-suggestion no-match">No matching roles found</div>';
        dropdown.style.display = 'block';
        return;
    }
    
    // Render suggestions
    dropdown.innerHTML = '';
    matches.forEach(({ role }) => {
        const suggestion = document.createElement('div');
        suggestion.className = 'role-suggestion';
        if (selectedRoles.has(role.value)) {
            suggestion.classList.add('selected');
        }
        
        suggestion.innerHTML = `
            <span class="role-suggestion-label">${role.label}</span>
            <span class="role-suggestion-category">${role.category}</span>
        `;
        
        suggestion.addEventListener('click', () => {
            if (selectedRoles.has(role.value)) {
                selectedRoles.delete(role.value);
                suggestion.classList.remove('selected');
            } else {
                selectedRoles.add(role.value);
                suggestion.classList.add('selected');
            }
            updateSelectedRoles();
            document.getElementById('roleSearch').value = '';
            dropdown.style.display = 'none';
        });
        
        dropdown.appendChild(suggestion);
    });
    
    dropdown.style.display = 'block';
}

function updateSelectedRoles() {
    const container = document.getElementById('selectedRolesTags');
    const countElement = document.getElementById('selectedCount');
    const errorElement = document.getElementById('roleError');
    errorElement.textContent = '';
    
    // Update count
    countElement.textContent = selectedRoles.size;
    
    if (selectedRoles.size === 0) {
        container.innerHTML = '<span class="no-selection">No roles selected yet. Type above to search and select.</span>';
        return;
    }
    
    container.innerHTML = '';
    selectedRoles.forEach(roleValue => {
        const role = ROLES.find(r => r.value === roleValue);
        if (!role) return;
        
        const tag = document.createElement('div');
        tag.className = 'role-tag';
        tag.innerHTML = `
            <span>${role.label}</span>
            <button type="button" class="role-tag-remove" data-role="${roleValue}">×</button>
        `;
        
        tag.querySelector('.role-tag-remove').addEventListener('click', () => {
            selectedRoles.delete(roleValue);
            updateSelectedRoles();
        });
        
        container.appendChild(tag);
    });
}

// Role search with autocomplete dropdown
const roleSearchInput = document.getElementById('roleSearch');
const roleDropdown = document.getElementById('roleDropdown');

if (roleSearchInput && roleDropdown) {
    roleSearchInput.addEventListener('input', (e) => {
        showSuggestions(e.target.value);
    });

    roleSearchInput.addEventListener('focus', () => {
        if (roleSearchInput.value.trim()) {
            showSuggestions(roleSearchInput.value);
        }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.role-search-wrapper')) {
            roleDropdown.style.display = 'none';
        }
    });
}

// Keyboard navigation
if (roleSearchInput) {
    roleSearchInput.addEventListener('keydown', (e) => {
        const suggestions = roleDropdown.querySelectorAll('.role-suggestion:not(.no-match)');
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const first = suggestions[0];
            if (first) first.focus();
        } else if (e.key === 'Escape') {
            roleDropdown.style.display = 'none';
            roleSearchInput.blur();
        }
    });
}

// Make showStep available globally for error handler
window.showStep = showStep;

// Make handleFormSubmit available globally so inline onclick can call it
window.handleFormSubmit = handleFormSubmit;

// Initialize on page load
window.addEventListener('load', () => {
    console.log('Window loaded - initializing');
    setupButtonHandlers(); // Ensure buttons are set up
    updateSelectedRoles();
    showStep(1); // Start with step 1
    attachFormHandler(); // Ensure form handler is attached
    
    // Double-check button handlers are attached
    setTimeout(() => {
        console.log('Re-checking button handlers...');
        setupButtonHandlers();
    }, 100);
});

// Form submission handler
async function handleFormSubmit(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    console.log('=== FORM SUBMISSION STARTED ===');
    console.log('Event:', e);
    
    const submitBtn = document.getElementById('submitBtn');
    const loading = document.getElementById('loading');
    const success = document.getElementById('success');
    const error = document.getElementById('error');
    const roleError = document.getElementById('roleError');
    
    // Hide previous messages
    if (success) success.style.display = 'none';
    if (error) error.style.display = 'none';
    if (roleError) {
        roleError.textContent = '';
        roleError.style.display = 'none';
    }
    
    // Get form data
    const displayName = document.getElementById('displayName').value;
    const roles = Array.from(selectedRoles);
    
    console.log('Form data:', { displayName, roles });
    
    // Validate name
    if (!displayName.trim()) {
        console.error('Validation failed: No name entered');
        showStep(1);
        const nameInput = document.getElementById('displayName');
        if (nameInput) {
            nameInput.focus();
            nameInput.style.borderColor = '#ef4444';
            setTimeout(() => {
                nameInput.style.borderColor = '';
            }, 2000);
        }
        submitBtn.disabled = false;
        submitBtn.textContent = 'Complete Sign Up';
        return;
    }
    
    // Validate roles
    if (roles.length === 0) {
        roleError.textContent = 'Please select at least one role';
        roleError.style.display = 'block';
        console.error('Validation failed: No roles selected');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Complete Sign Up';
        return;
    }
    
    console.log('Validation passed:', { displayName, rolesCount: roles.length });
    
    // Build request body
    const body = {
        displayName: displayName.trim(),
        roles,
    };
    
    // Disable button and show loading
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating Account...';
    
    // Hide form and show loading
    document.querySelectorAll('.form-step').forEach(step => {
        if (step) step.style.display = 'none';
    });
    if (loading) {
        loading.style.display = 'block';
    }
    
    try {
        console.log('📤 Sending request to API...', body);
        
        const response = await fetch('http://localhost:3000/api/onboarding/complete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        
        console.log('📥 Response status:', response.status);
        
        let data;
        try {
            data = await response.json();
            console.log('📥 Response data:', data);
        } catch (parseError) {
            const text = await response.text();
            console.error('Failed to parse response:', text);
            throw new Error('Invalid response from server');
        }
        
        if (!response.ok) {
            throw new Error(data.error || `Server error: ${response.status}`);
        }
        
        // Save user data to localStorage
        const userData = {
            user: data.user,
            companyGroup: data.companyGroup,
            channels: data.channels,
        };
        localStorage.setItem('syncup_user', JSON.stringify(userData));
        console.log('User data saved to localStorage:', userData);
        
        // Hide loading, show success briefly, then redirect immediately
        if (loading) loading.style.display = 'none';
        const successDetails = document.getElementById('successDetails');
        if (success && successDetails) {
            success.style.display = 'block';
            successDetails.innerHTML = `
                <div class="success-content">
                    <h2>Welcome, ${data.user.displayName}!</h2>
                    <div class="success-info">
                        <p><strong>Your Tag:</strong> #${data.user.tag}</p>
                        <p><strong>Full ID:</strong> ${data.user.fullIdentifier}</p>
                        <p><strong>Roles:</strong> ${data.user.roles.join(', ')}</p>
                    </div>
                    <p class="success-message">Redirecting to your dashboard...</p>
                </div>
            `;
        }
        
        // Redirect to dashboard immediately
        console.log('✓✓✓ Account created successfully! Redirecting to dashboard...');
        
        // Ensure data is saved
        const savedData = localStorage.getItem('syncup_user');
        console.log('Saved data:', savedData);
        
        // Small delay to ensure data is saved, then redirect
        setTimeout(() => {
            window.location.href = window.location.origin + '/dashboard.html';
        }, 300);
        
    } catch (err) {
        console.error('Error during signup:', err);
        // Show error and go back to form
        if (loading) loading.style.display = 'none';
        showStep(2); // Show role selection step
        if (error) {
            error.style.display = 'block';
            document.getElementById('errorMessage').textContent = err.message || 'An error occurred. Please try again.';
            error.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Complete Sign Up';
        }
    }
}

// SUPER SIMPLE - Just attach directly to button when page loads
window.addEventListener('load', () => {
    console.log('=== PAGE LOADED - ATTACHING HANDLERS ===');
    
    // Find button and attach handler
    const btn = document.getElementById('submitBtn');
    console.log('Found submit button:', btn);
    
    if (btn) {
        // Remove any existing handlers
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        // Get fresh reference
        const freshBtn = document.getElementById('submitBtn');
        
        // Simple, direct click handler
        freshBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('🚀 BUTTON CLICKED - STARTING SIGNUP');
            
            try {
                await handleFormSubmit(e);
            } catch (error) {
                console.error('ERROR in button click:', error);
                alert('Error: ' + (error.message || 'Unknown error'));
            }
        });
        
        console.log('✅ Button handler attached!');
    } else {
        console.error('❌ Button not found!');
    }
    
    // Also try after a delay
    setTimeout(() => {
        const btn2 = document.getElementById('submitBtn');
        if (btn2 && !btn2.onclick) {
            console.log('Attaching backup handler...');
            btn2.onclick = async (e) => {
                e.preventDefault();
                console.log('🚀 BACKUP HANDLER CLICKED');
                await handleFormSubmit(e);
            };
        }
    }, 1000);
});

// Attach form submission handler
function attachFormHandler() {
    const signupForm = document.getElementById('signupForm');
    const submitBtn = document.getElementById('submitBtn');
    
    console.log('Attaching form handlers...');
    console.log('Form found:', !!signupForm);
    console.log('Submit button found:', !!submitBtn);
    
    // Attach click handler to button directly (most reliable way)
    if (submitBtn) {
        // Remove any existing listeners by using onclick
        submitBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('✓✓✓ Submit button clicked!');
            
            // Call handler directly - this always works
            await handleFormSubmit(e);
        };
        console.log('✓ Submit button handler attached');
    } else {
        console.error('❌ Submit button not found!');
    }
    
    // Also attach form submit handler as backup
    if (signupForm) {
        signupForm.onsubmit = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('✓✓✓ Form submitted!');
            await handleFormSubmit(e);
        };
        console.log('✓ Form submission handler attached');
    }
}

// Simple, reliable attachment - try multiple times
function ensureButtonWorks() {
    const submitBtn = document.getElementById('submitBtn');
    console.log('Checking submit button:', submitBtn);
    
    if (submitBtn) {
        // Remove all existing handlers
        const newBtn = submitBtn.cloneNode(true);
        submitBtn.parentNode.replaceChild(newBtn, submitBtn);
        
        // Get fresh button reference
        const btn = document.getElementById('submitBtn');
        
        // Attach simple click handler
        btn.onclick = async function(e) {
            e.preventDefault();
            console.log('BUTTON CLICKED!');
            await handleFormSubmit(e);
        };
        
        console.log('✓ Button handler attached successfully');
        return true;
    }
    return false;
}

// Try immediately
ensureButtonWorks();

// Try when DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('DOM ready - attaching button');
        ensureButtonWorks();
    });
}

// Try on window load
window.addEventListener('load', () => {
    console.log('Window loaded - attaching button');
    ensureButtonWorks();
    
    // Try one more time after a short delay
    setTimeout(() => {
        console.log('Final attempt - attaching button');
        ensureButtonWorks();
    }, 500);
});

// Also attach form handler
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachFormHandler);
} else {
    attachFormHandler();
}

window.addEventListener('load', attachFormHandler);

// Tag will be auto-generated on backend when form is submitted
