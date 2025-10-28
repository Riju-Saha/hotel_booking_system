document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const bookingForm = document.getElementById('booking-form');
    const customerForm = document.getElementById('customer-form');
    const errorDisplay = document.getElementById('error');
    const customerErrorDisplay = document.getElementById('customer-error');

    const initSelect2 = () => {
        if (bookingForm) {
            $(document).ready(() => {
                $('#customerId').select2({
                    placeholder: 'Search for a customer',
                    allowClear: true,
                    ajax: {
                        url: '/api/customers',
                        dataType: 'json',
                        delay: 250,
                        data: params => ({ q: params.term }),
                        processResults: data => ({
                            results: data.map(customer => ({
                                id: customer.CustomerID,
                                text: `${customer.FirstName} ${customer.LastName} (${customer.Email})`
                            }))
                        }),
                        cache: true
                    },
                    minimumInputLength: 1
                });
            });
        }
    };

    const populateManagers = async () => {
        const managerSelect = document.getElementById('managerId');
        if (!managerSelect) return;

        try {
        const response = await fetch('/api/managers', { credentials: 'include' });
            if (response.ok) {
                const managers = await response.json();
                managerSelect.innerHTML = '<option value="">Select Manager</option>';
                managers.forEach(m => {
                    const option = document.createElement('option');
                    option.value = m.StaffID;
                    option.textContent = `${m.FirstName} ${m.LastName} (${m.Username})`;
                    managerSelect.appendChild(option);
                });
            } else {
                const error = await response.json();
                errorDisplay.textContent = error.error || 'Error fetching managers.';
            }
        } catch (error) {
            errorDisplay.textContent = `Error: ${error.message}`;
        }
    };

    const handleRoleChange = async () => {
        const roleSelect = document.getElementById('role');
        const managerIdContainer = document.getElementById('managerIdContainer');
        const managerSelect = document.getElementById('managerId');
        if (roleSelect && managerIdContainer) {
            roleSelect.addEventListener('change', () => {
                const isReceptionist = roleSelect.value === 'Receptionist';
                managerIdContainer.style.display = isReceptionist ? 'block' : 'none';
                if (managerSelect) {
                    managerSelect.disabled = !isReceptionist;
                }
                if (isReceptionist) {
                    populateManagers();
                }
            });
        }
    };

    // Check user role and adapt register page behavior
    const checkUserRole = async () => {
        try {
            const response = await fetch('/api/user');
            if (response.ok) {
                const user = await response.json();
                // If user info is available, adapt the register page behavior
                // We allow public registration of Manager and Receptionist, so do not disable the form.
                // If user is a Receptionist, they should not be able to create staff accounts; show a message.
                if (user.role && document.getElementById('role-message')) {
                    if (user.role === 'Receptionist') {
                        document.getElementById('role-message').textContent = 'Receptionists cannot create staff accounts.';
                        document.getElementById('role-message').style.display = 'block';
                        const btn = document.getElementById('register-button');
                        if (btn) btn.disabled = true;
                    } else {
                        // Admins and Managers may register staff
                        const btn = document.getElementById('register-button');
                        if (btn) btn.disabled = false;
                    }
                }
            } else {
                // Not authenticated: allow public registration per new requirement (managers can self-register)
                // Show guidance message but keep form enabled.
                if (document.getElementById('role-message')) {
                    document.getElementById('role-message').textContent = 'You can register as a Manager or Receptionist. Receptionists require a Manager selection.';
                    document.getElementById('role-message').style.display = 'block';
                }
            }
        } catch (error) {
            console.error('Error fetching user info:', error);
            // Network error - show guidance and keep form enabled for public registration
            if (document.getElementById('role-message')) {
                document.getElementById('role-message').textContent = 'Unable to verify user session. You may still register as Manager or Receptionist.';
                document.getElementById('role-message').style.display = 'block';
            }
        }
    };

    // Handle customer creation
    const handleCustomerCreation = async (e) => {
        e.preventDefault();
        const firstName = customerForm.firstName.value;
        const lastName = customerForm.lastName.value;
        const email = customerForm.email.value;
        const phone = customerForm.phone.value;

        try {
            const response = await fetch('/api/customers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ firstName, lastName, email, phone }),
                credentials: 'include'
            });
            const data = await response.json();

            if (response.ok) {
                customerErrorDisplay.textContent = data.message;
                customerForm.reset();
                $('#customerId').append(new Option(
                    `${firstName} ${lastName} (${email})`,
                    data.customerId,
                    true,
                    true
                )).trigger('change');
            } else {
                customerErrorDisplay.textContent = data.error || 'Customer creation failed.';
            }
        } catch (error) {
            customerErrorDisplay.textContent = `Error: ${error.message}`;
        }
    };

    // Handle login form submission
    const handleLogin = async (e) => {
        e.preventDefault();
        const username = loginForm.username.value;
        const password = loginForm.password.value;

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await response.json();

            if (response.ok) {
                window.location.href = '/dashboard';
            } else {
                errorDisplay.textContent = data.error || 'Login failed.';
            }
        } catch (error) {
            errorDisplay.textContent = `Error: ${error.message}`;
        }
    };

    // Handle registration form submission
    const handleRegister = async (e) => {
        e.preventDefault();
        const username = registerForm.username.value;
        const password = registerForm.password.value;
        const first_name = registerForm.first_name.value;
        const last_name = registerForm.last_name.value;
        const email = registerForm.email.value;
        const role = registerForm.role.value;
        const managerId = registerForm.managerId ? registerForm.managerId.value : null;

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, first_name, last_name, email, role, managerId })
            });
            const data = await response.json();

            if (response.ok) {
                window.location.href = '/';
            } else {
                errorDisplay.textContent = data.error || 'Registration failed.';
            }
        } catch (error) {
            errorDisplay.textContent = `Error: ${error.message}`;
        }
    };

    // Handle booking form submission
    const handleBooking = async (e) => {
        e.preventDefault();
        const customerId = bookingForm.customerId.value;
        const roomId = bookingForm.roomId.value;
        const checkInDate = bookingForm.checkInDate.value;
        const checkOutDate = bookingForm.checkOutDate.value;

        try {
            const response = await fetch('/api/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customerId, roomId, checkInDate, checkOutDate })
            });
            const data = await response.json();

            if (response.ok) {
                errorDisplay.textContent = data.message;
                bookingForm.reset();
                $('#customerId').val(null).trigger('change');
                loadBookings();
            } else {
                errorDisplay.textContent = data.error || 'Booking failed.';
            }
        } catch (error) {
            errorDisplay.textContent = `Error: ${error.message}`;
        }
    };

    // Load Receptionists (Manager or Admin)
    const loadReceptionists = async () => {
        try {
            const response = await fetch('/api/receptionists', { credentials: 'include' });
            if (response.ok) {
                const receptionists = await response.json();
                const tableBody = document.getElementById('receptionists-table')?.querySelector('tbody');
                if (tableBody) {
                    tableBody.innerHTML = '';
                    receptionists.forEach(r => {
                        const row = document.createElement('tr');
                        row.innerHTML = `
                            <td>${r.StaffID}</td>
                            <td>${r.Username}</td>
                            <td>${r.FirstName}</td>
                            <td>${r.LastName}</td>
                            <td>${r.Email}</td>
                        `;
                        tableBody.appendChild(row);
                    });
                }
            } else {
                const error = await response.json();
                document.getElementById('error').textContent = error.error || 'Error fetching receptionists.';
            }
        } catch (error) {
            document.getElementById('error').textContent = `Error: ${error.message}`;
        }
    };

    // Load staff members (Admin only)
    const loadStaff = async () => {
        try {
            const response = await fetch('/api/staff', { credentials: 'include' });
            if (response.ok) {
                const staff = await response.json();
                const tableBody = document.getElementById('staff-table')?.querySelector('tbody');
                if (tableBody) {
                    tableBody.innerHTML = '';
                    staff.forEach(s => {
                        const row = document.createElement('tr');
                        row.innerHTML = `
                            <td>${s.StaffID}</td>
                            <td>${s.Username}</td>
                            <td>${s.FirstName}</td>
                            <td>${s.LastName}</td>
                            <td>${s.Email}</td>
                            <td>${s.Role}</td>
                        `;
                        tableBody.appendChild(row);
                    });
                }
            } else {
                const error = await response.json();
                document.getElementById('error').textContent = error.error || 'Error fetching staff.';
            }
        } catch (error) {
            document.getElementById('error').textContent = `Error: ${error.message}`;
        }
    };

    // Initialize dashboard
    const initDashboard = () => {
        if (window.location.pathname === '/dashboard') {
            fetchUserInfo();
            if (bookingForm) {
                initSelect2();
                populateRooms();
                loadBookings();
            }
            if (document.getElementById('staff-table')) {
                loadStaff();
            }
            if (document.getElementById('receptionists-table')) {
                loadReceptionists();
            }
        }
    };

    // Initialize registration page
    const initRegister = () => {
        if (window.location.pathname === '/register') {
            checkUserRole();
            handleRoleChange();
        }
    };

    // Attach event listeners
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    if (registerForm) registerForm.addEventListener('submit', handleRegister);
    if (bookingForm) {
        bookingForm.addEventListener('submit', handleBooking);
        bookingForm.checkInDate.addEventListener('change', populateRooms);
        bookingForm.checkOutDate.addEventListener('change', populateRooms);
    }
    if (customerForm) customerForm.addEventListener('submit', handleCustomerCreation);

    // Start initialization
    initDashboard();
    initRegister();
});

// Fetch user info
async function fetchUserInfo() {
    try {
        const response = await fetch('/api/user');
        if (response.ok) {
            const data = await response.json();
            document.getElementById('username').textContent = data.username;
            document.getElementById('role').textContent = data.role;
        } else {
            window.location.href = '/';
        }
    } catch (error) {
        console.error('Error fetching user info:', error);
        window.location.href = '/';
    }
}

// Populate available rooms
async function populateRooms() {
    const checkInDate = document.getElementById('checkInDate')?.value;
    const checkOutDate = document.getElementById('checkOutDate')?.value;
    const roomSelect = document.getElementById('roomId');

    if (checkInDate && checkOutDate) {
        try {
            const response = await fetch(`/api/rooms/available?checkInDate=${checkInDate}&checkOutDate=${checkOutDate}`);
            const rooms = await response.json();
            roomSelect.innerHTML = '<option value="">Select Room</option>';
            rooms.forEach(r => {
                const option = document.createElement('option');
                option.value = r.RoomID;
                option.textContent = `${r.RoomNumber} (${r.TypeName}, $${r.PricePerNight}/night)`;
                roomSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Error fetching rooms:', error);
        }
    }
}

// Load bookings
async function loadBookings() {
    try {
            const response = await fetch('/api/bookings', { credentials: 'include' });
        const bookings = await response.json();
        const tableBody = document.getElementById('bookings-table').querySelector('tbody');
        tableBody.innerHTML = '';
        bookings.forEach(b => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${b.BookingID}</td>
                <td>${b.FirstName} ${b.LastName}</td>
                <td>${b.RoomNumber} (${b.TypeName})</td>
                <td>${b.CheckInDate}</td>
                <td>${b.CheckOutDate}</td>
                <td>$${b.TotalPrice}</td>
                <td>${b.Status}</td>
                <td>${b.Receptionist}</td>
                <td>
                    ${b.Status !== 'CheckedOut' && b.Status !== 'Cancelled' ? `
                        <button class="status-btn" onclick="updateBookingStatus(${b.BookingID}, 'CheckedIn')">Check In</button>
                        <button class="status-btn" onclick="updateBookingStatus(${b.BookingID}, 'CheckedOut')">Check Out</button>
                        <button class="status-btn" onclick="updateBookingStatus(${b.BookingID}, 'Cancelled')">Cancel</button>
                    ` : ''}
                </td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading bookings:', error);
        document.getElementById('error').textContent = `Error: ${error.message}`;
    }
}

// Update booking status
async function updateBookingStatus(bookingId, status) {
    try {
        const response = await fetch(`/api/bookings/${bookingId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        const data = await response.json();
        if (response.ok) {
            loadBookings();
            document.getElementById('error').textContent = data.message;
        } else {
            document.getElementById('error').textContent = data.error || 'Status update failed.';
        }
    } catch (error) {
        document.getElementById('error').textContent = `Error: ${error.message}`;
    }
}

// Handle logout
async function logout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/';
    } catch (error) {
        console.error('Error logging out:', error);
    }
}