const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const session = require('express-session');
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: process.env.SESSION_SECRET || '4671f1f79d2b22f26f4abf775fb45109375c1e6031adb9882ae77d75656003d5',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production' }
}));

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'hotel_management'
}; 

const connectDB = async () => mysql.createConnection(dbConfig);

const restrictToRoles = (allowedRoles = []) => (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'You must be logged in to access this resource.' });
    }
    if (allowedRoles.length > 0 && !allowedRoles.includes(req.session.user.role)) {
        return res.status(403).json({ error: `Access denied. Allowed roles: ${allowedRoles.join(', ')}.` });
    }
    next();
};

const ensureLoggedIn = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'You must be logged in to access this page.' });
    }
    next();
};

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/dashboard', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }
    const { role } = req.session.user;
    const dashboardMap = {
        Admin: 'admin_dashboard.html',
        Manager: 'manager_dashboard.html',
        Receptionist: 'receptionist_dashboard.html'
    };
    res.sendFile(path.join(__dirname, 'public', dashboardMap[role]));
});

app.get('/api/managers', async (req, res) => {
    try {
        const db = await connectDB();
        const [managers] = await db.execute(
            'SELECT StaffID, Username, FirstName, LastName FROM Staff WHERE Role = "Manager"'
        );
        await db.end();
        res.json(managers);
    } catch (error) {
        res.status(500).json({ error: `Error fetching managers: ${error.message}` });
    }
});

app.post('/api/register', async (req, res) => {
    const { username, password, first_name, last_name, email, role, managerId } = req.body;

    if (!username || !password || !first_name || !last_name || !email || !role) {
        return res.status(400).json({ error: 'All fields are required.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email format.' });
    }
    if (!['Manager', 'Receptionist'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role selected. Allowed: Manager, Receptionist.' });
    }

    const creatorRole = req.session.user?.role;
    const creatorId = req.session.user?.id;

    if (creatorRole === 'Receptionist') {
        return res.status(403).json({ error: 'Receptionists are not allowed to create staff accounts.' });
    }

    try {
        const db = await connectDB();
        const [rows] = await db.execute(
            'SELECT COUNT(*) as count FROM Staff WHERE Username = ? OR Email = ?',
            [username, email]
        );
        if (rows[0].count > 0) {
            await db.end();
            return res.status(400).json({ error: 'Username or email already exists.' });
        }

        let assignedManagerId = null;
        if (role === 'Receptionist') {
            if (creatorRole === 'Manager') {
                assignedManagerId = creatorId;
            } else {
                if (!managerId) {
                    await db.end();
                    return res.status(400).json({ error: 'Manager selection is required for Receptionists.' });
                }
                const [manager] = await db.execute(
                    'SELECT Role FROM Staff WHERE StaffID = ? AND Role = "Manager"',
                    [managerId]
                );
                if (manager.length === 0) {
                    await db.end();
                    return res.status(400).json({ error: 'Invalid Manager ID.' });
                }
                assignedManagerId = managerId;
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await db.execute(
            'INSERT INTO Staff (Username, PasswordHash, Role, FirstName, LastName, Email, ManagerID) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [username, hashedPassword, role, first_name, last_name, email, assignedManagerId]
        );
        await db.end();
        res.status(201).json({ message: 'Account created successfully.' });
    } catch (error) {
        res.status(500).json({ error: `Error creating account: ${error.message}` });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }

    try {
        const db = await connectDB();
        const [rows] = await db.execute('SELECT * FROM Staff WHERE Username = ?', [username]);
        const user = rows[0];
        await db.end();

        if (!user || !(await bcrypt.compare(password, user.PasswordHash))) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }

        req.session.user = { id: user.StaffID, username: user.Username, role: user.Role };
        res.json({ message: 'Login successful.', role: user.Role });
    } catch (error) {
        res.status(500).json({ error: `Error logging in: ${error.message}` });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'Logged out successfully.' });
});

app.get('/api/user', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not logged in' });
    }
    res.json({ username: req.session.user.username, role: req.session.user.role, id: req.session.user.id });
});

app.get('/api/staff', restrictToRoles(['Admin']), async (req, res) => {
    try {
        const db = await connectDB();
        const [staff] = await db.execute(
            'SELECT StaffID, Username, FirstName, LastName, Email, Role FROM Staff'
        );
        await db.end();
        res.json(staff);
    } catch (error) {
        res.status(500).json({ error: `Error fetching staff: ${error.message}` });
    }
});

app.get('/api/receptionists', restrictToRoles(['Admin','Manager']), async (req, res) => {
    const userId = req.session.user.id;
    const userRole = req.session.user.role;

    try {
        const db = await connectDB();
        let receptionists;
        if (userRole === 'Admin') {
            [receptionists] = await db.execute(
                'SELECT StaffID, Username, FirstName, LastName, Email, Role FROM Staff WHERE Role = "Receptionist"'
            );
        } else {
            [receptionists] = await db.execute(
                'SELECT StaffID, Username, FirstName, LastName, Email, Role FROM Staff WHERE Role = "Receptionist" AND ManagerID = ?',
                [userId]
            );
        }
        await db.end();
        res.json(receptionists);
    } catch (error) {
        res.status(500).json({ error: `Error fetching receptionists: ${error.message}` });
    }
});

app.get('/api/customers', restrictToRoles([]), async (req, res) => {
    const searchTerm = req.query.q ? `%${req.query.q}%` : '%';
    try {
        const db = await connectDB();
        const [customers] = await db.execute(
            'SELECT CustomerID, FirstName, LastName, Email FROM Customers WHERE FirstName LIKE ? OR LastName LIKE ?',
            [searchTerm, searchTerm]
        );
        await db.end();
        res.json(customers);
    } catch (error) {
        res.status(500).json({ error: `Error fetching customers: ${error.message}` });
    }
});

app.post('/api/customers', restrictToRoles(['Receptionist']), async (req, res) => {
    const { firstName, lastName, email, phone } = req.body;

    if (!firstName || !lastName || !email) {
        return res.status(400).json({ error: 'First name, last name, and email are required.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email format.' });
    }

    try {
        const db = await connectDB();
        const [rows] = await db.execute(
            'SELECT COUNT(*) as count FROM Customers WHERE Email = ?',
            [email]
        );
        if (rows[0].count > 0) {
            await db.end();
            return res.status(400).json({ error: 'Email already exists.' });
        }

        const [result] = await db.execute(
            'INSERT INTO Customers (FirstName, LastName, Email, Phone) VALUES (?, ?, ?, ?)',
            [firstName, lastName, email, phone || null]
        );
        await db.end();
        res.status(201).json({ message: 'Customer created successfully.', customerId: result.insertId });
    } catch (error) {
        res.status(500).json({ error: `Error creating customer: ${error.message}` });
    }
});

app.get('/api/rooms/available', async (req, res) => {
    const { checkInDate, checkOutDate } = req.query;
    try {
        const db = await connectDB();
        const [rooms] = await db.execute(`
            SELECT r.RoomID, r.RoomNumber, rt.TypeName, rt.PricePerNight
            FROM Rooms r
            JOIN RoomTypes rt ON r.RoomTypeID = rt.RoomTypeID
            WHERE r.Status = 'Available'
            AND r.RoomID NOT IN (
                SELECT RoomID FROM Bookings
                WHERE (CheckInDate <= ? AND CheckOutDate >= ?)
                AND Status NOT IN ('Cancelled', 'CheckedOut')
            )
        `, [checkOutDate, checkInDate]);
        await db.end();
        res.json(rooms);
    } catch (error) {
        res.status(500).json({ error: `Error fetching rooms: ${error.message}` });
    }
});

app.post('/api/bookings', restrictToRoles(['Manager', 'Receptionist']), async (req, res) => {
    const { customerId, roomId, checkInDate, checkOutDate } = req.body;
    const staffId = req.session.user?.id;

    if (!customerId || !roomId || !checkInDate || !checkOutDate) {
        return res.status(400).json({ error: 'All fields are required.' });
    }
    if (!staffId) {
        return res.status(401).json({ error: 'User not authenticated.' });
    }

    try {
        const db = await connectDB();
        const [bookings] = await db.execute(`
            SELECT COUNT(*) as count FROM Bookings
            WHERE RoomID = ? AND (CheckInDate <= ? AND CheckOutDate >= ?)
            AND Status NOT IN ('Cancelled', 'CheckedOut')
        `, [roomId, checkOutDate, checkInDate]);

        if (bookings[0].count > 0) {
            await db.end();
            return res.status(400).json({ error: 'Room is not available for the selected dates.' });
        }

        const [room] = await db.execute(
            'SELECT rt.PricePerNight FROM Rooms r JOIN RoomTypes rt ON r.RoomTypeID = rt.RoomTypeID WHERE r.RoomID = ?',
            [roomId]
        );
        const pricePerNight = room[0].PricePerNight;
        const checkIn = new Date(checkInDate);
        const checkOut = new Date(checkOutDate);
        const days = (checkOut - checkIn) / (1000 * 60 * 60 * 24);
        const totalPrice = pricePerNight * days;

        await db.execute(
            'INSERT INTO Bookings (CustomerID, RoomID, CheckInDate, CheckOutDate, TotalPrice, Status, StaffID) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [customerId, roomId, checkInDate, checkOutDate, totalPrice, 'Confirmed', staffId]
        );

        await db.execute('UPDATE Rooms SET Status = "Occupied" WHERE RoomID = ?', [roomId]);
        await db.end();
        res.status(201).json({ message: 'Booking created successfully.' });
    } catch (error) {
        res.status(500).json({ error: `Error creating booking: ${error.message}` });
    }
});

app.get('/api/bookings', restrictToRoles([]), async (req, res) => {
    const userRole = req.session.user?.role;
    const userId = req.session.user?.id;

    try {
        const db = await connectDB();
        let bookings;
        if (userRole === 'Manager') {
            [bookings] = await db.execute(`
                SELECT b.BookingID, c.FirstName, c.LastName, r.RoomNumber, rt.TypeName, 
                       b.CheckInDate, b.CheckOutDate, b.TotalPrice, b.Status, s.Username AS Receptionist
                FROM Bookings b
                JOIN Customers c ON b.CustomerID = c.CustomerID
                JOIN Rooms r ON b.RoomID = r.RoomID
                JOIN RoomTypes rt ON r.RoomTypeID = rt.RoomTypeID
                JOIN Staff s ON b.StaffID = s.StaffID
                WHERE s.ManagerID = ?
            `, [userId]);
        } else if (userRole === 'Receptionist') {
            [bookings] = await db.execute(`
                SELECT b.BookingID, c.FirstName, c.LastName, r.RoomNumber, rt.TypeName, 
                       b.CheckInDate, b.CheckOutDate, b.TotalPrice, b.Status, s.Username AS Receptionist
                FROM Bookings b
                JOIN Customers c ON b.CustomerID = c.CustomerID
                JOIN Rooms r ON b.RoomID = r.RoomID
                JOIN RoomTypes rt ON r.RoomTypeID = rt.RoomTypeID
                JOIN Staff s ON b.StaffID = s.StaffID
                WHERE b.StaffID = ?
            `, [userId]);
        } else {
            [bookings] = await db.execute(`
                SELECT b.BookingID, c.FirstName, c.LastName, r.RoomNumber, rt.TypeName, 
                       b.CheckInDate, b.CheckOutDate, b.TotalPrice, b.Status, s.Username AS Receptionist
                FROM Bookings b
                JOIN Customers c ON b.CustomerID = c.CustomerID
                JOIN Rooms r ON b.RoomID = r.RoomID
                JOIN RoomTypes rt ON r.RoomTypeID = rt.RoomTypeID
                JOIN Staff s ON b.StaffID = s.StaffID
            `);
        }
        await db.end();
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ error: `Error fetching bookings: ${error.message}` });
    }
});

app.put('/api/bookings/:id', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!['Pending', 'Confirmed', 'Cancelled', 'CheckedIn', 'CheckedOut'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status.' });
    }

    try {
        const db = await connectDB();
        await db.execute('UPDATE Bookings SET Status = ? WHERE BookingID = ?', [status, id]);
        if (status === 'CheckedOut' || status === 'Cancelled') {
            const [booking] = await db.execute('SELECT RoomID FROM Bookings WHERE BookingID = ?', [id]);
            await db.execute('UPDATE Rooms SET Status = "Available" WHERE RoomID = ?', [booking[0].RoomID]);
        }
        await db.end();
        res.json({ message: 'Booking status updated.' });
    } catch (error) {
        res.status(500).json({ error: `Error updating booking: ${error.message}` });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));