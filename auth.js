document.addEventListener('DOMContentLoaded', function() {
    const { createClient } = window.supabase;
    const supabaseUrl = 'https://mnejfugdushmrwzocxlx.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uZWpmdWdkdXNobXJ3em9jeGx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5Mjg1ODMsImV4cCI6MjA3MzUwNDU4M30.XsAaOz53omvyBB9yPBLuTjmSYBrY4GBinqKbYPrup8w';
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { debug: true } });

    ['loginForm', 'registerForm'].forEach(formId => {
        const form = document.getElementById(formId);
        if (!form) {
            console.error(`Form with ID ${formId} not found`);
            return;
        }

        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            const button = this.querySelector('button[type="submit"]');
            if (!button) {
                console.error('Submit button not found');
                return;
            }
            const originalText = button.innerHTML;
            button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Processing...';
            button.disabled = true;

            const emailOrPhoneInput = this.querySelector('input[name="emailOrPhone"]');
            const passwordInput = this.querySelector('input[name="password"]');
            const stateSelect = this.querySelector('select[name="state"]');
            const departmentNameInput = formId === 'registerForm' ? this.querySelector('input[name="departmentName"]') : null;

            if (!emailOrPhoneInput || !passwordInput || !stateSelect || (formId === 'registerForm' && !departmentNameInput)) {
                alert('Form fields are missing. Please check the form structure.');
                button.innerHTML = originalText;
                button.disabled = false;
                return;
            }

            const email = emailOrPhoneInput.value.trim();
            const password = passwordInput.value;
            const state = stateSelect.value;
            const departmentName = departmentNameInput ? departmentNameInput.value.trim() : null;

            if (!email || !password || !state || (formId === 'registerForm' && !departmentName)) {
                alert('Please fill all required fields.');
                button.innerHTML = originalText;
                button.disabled = false;
                return;
            }

            try {
                if (formId === 'loginForm') {
                    console.log('Attempting login for email:', email);
                    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
                    if (error) throw new Error(`Login failed: ${error.message}`);
                    const { user } = data;

                    // Check user role
                    console.log('Fetching metadata for user ID:', user.id);
                    const { data: metadata, error: metadataError } = await supabase
                        .from('users_metadata')
                        .select('role, state, department_name')
                        .eq('id', user.id)
                        .maybeSingle();

                    if (metadataError) {
                        console.error('Metadata fetch error:', metadataError);
                        throw new Error('Error fetching user role: ' + metadataError.message);
                    }

                    if (!metadata || metadata.role !== 'gov_portal') {
                        await supabase.auth.signOut();
                        throw new Error('This account is not authorized for the government portal.');
                    }

                    // Store user metadata for dashboard
                    localStorage.setItem('samudra_suraksha_user', JSON.stringify({
                        ...user,
                        state: metadata.state,
                        department_name: metadata.department_name,
                        role: metadata.role
                    }));

                    // Test dashboard accessibility
                    console.log('Checking accessibility of /samudradashboard.html');
                    const dashboardResponse = await fetch('/samudradashboard.html', { method: 'HEAD' });
                    if (!dashboardResponse.ok) {
                        console.error('Cannot access samudradashboard.html:', {
                            status: dashboardResponse.status,
                            statusText: dashboardResponse.statusText,
                            url: dashboardResponse.url
                        });
                        throw new Error('Dashboard page not found. Please contact support.');
                    }

                    alert('Login successful! Redirecting to dashboard...');
                    window.location.href = '/GOVERNMENT_WEBSITE/samudradashboard.html';
                } else {
                    // Check if email already exists
                    console.log('Checking if email exists:', email);
                    const { data: existingUser, error: checkError } = await supabase
                        .from('users_metadata')
                        .select('id')
                        .eq('email', email)
                        .maybeSingle();

                    if (checkError) {
                        console.error('Error checking email:', checkError);
                        throw new Error('Error checking email availability: ' + checkError.message);
                    }

                    if (existingUser) {
                        throw new Error('This email is already registered. Please use a different email or log in.');
                    }

                    console.log('Attempting signup for email:', email, 'with metadata:', { role: 'gov_portal', state, department_name: departmentName });
                    const { data, error } = await supabase.auth.signUp({
                        email,
                        password,
                        options: {
                            data: {
                                role: 'gov_portal',
                                state,
                                department_name: departmentName
                            }
                        }
                    });

                    if (error) {
                        console.error('Signup error:', error);
                        throw new Error(`Signup failed: ${error.message}`);
                    }

                    const { user } = data;
                    if (user) {
                        console.log('User registered with ID:', user.id);
                        console.log('Raw user metadata:', user.user_metadata);

                        // Retry metadata verification up to 3 times with delay
                        let metadata;
                        let metadataError;
                        for (let attempt = 1; attempt <= 3; attempt++) {
                            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                            console.log(`Attempt ${attempt}: Verifying metadata for user ID: ${user.id}`);
                            const { data: meta, error: metaErr } = await supabase
                                .from('users_metadata')
                                .select('role, state, department_name')
                                .eq('id', user.id)
                                .maybeSingle();

                            metadata = meta;
                            metadataError = metaErr;
                            if (metadata && metadata.role === 'gov_portal') break;
                        }

                        if (metadataError || !metadata || metadata.role !== 'gov_portal') {
                            console.error('Metadata verification error:', metadataError || 'No metadata found or incorrect role');
                            console.error('Metadata found:', metadata);
                            throw new Error('Failed to verify user metadata. Role is not set to gov_portal. Please try again or contact support.');
                        }

                        console.log('Metadata created:', metadata);
                        alert('Registration successful! Please check your email for verification and then log in.');
                        form.reset();
                    } else {
                        throw new Error('No user returned from signup.');
                    }
                }
            } catch (error) {
                console.error('Authentication error:', error.message);
                let errorMessage = error.message;
                if (error.message.includes('429')) {
                    errorMessage = 'Too many attempts. Please wait 30 seconds and try again.';
                } else if (error.message.includes('Email not confirmed')) {
                    errorMessage = 'Please verify your email before logging in.';
                }
                alert(`Error: ${errorMessage}`);
            } finally {
                button.innerHTML = originalText;
                button.disabled = false;
            }
        });
    });

    document.querySelectorAll('.toggle-password').forEach(button => {
        button.addEventListener('click', function() {
            const input = this.closest('.relative').querySelector('input[name="password"]');
            if (!input) {
                console.error('Password input not found');
                return;
            }
            input.type = input.type === 'password' ? 'text' : 'password';
            const icon = this.querySelector('i');
            if (icon) {
                icon.classList.toggle('fa-eye');
                icon.classList.toggle('fa-eye-slash');
            }
        });
    });
});