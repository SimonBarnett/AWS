// ====================== routes/token/helpers.js ======================
// Local helpers specific to token routes
// Updated to support passed pool + executeWithRetry from core layer

const crypto = require('crypto');
const { executeWithRetry, sql } = require('/opt/nodejs/helpers');

// ====================== PIN GENERATION ======================
const generatePin = () => crypto.randomInt(100000, 999999).toString();

// ====================== PHONE NORMALIZATION ======================
const normalizePhone = (phone) => {
    let normalized = phone.replace(/\s/g, '');
    if (normalized.startsWith('0')) normalized = '+44' + normalized.slice(1);
    else if (!normalized.startsWith('+')) normalized = '+44' + normalized;
    return normalized;
};

// ====================== VALIDATION HELPERS ======================
const isValidPhone = (phone) => /^\+44\d{10}$/.test(phone);
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isValidPassword = (password) => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&=`~#^-_+[\]{}|;:,./<>])[A-Za-z\d@$!%*?&=`~#^-_+[\]{}|;:,./<>]{8,}$/.test(password);

// ====================== GET USER BY ID (updated) ======================
async function getUserById(userId, event, pool = null) {
    const usePool = pool || await require('/opt/nodejs/helpers').getDbConnection();
    try {
        const result = await executeWithRetry(() =>
            usePool.request()
                .input('user_id', sql.VarChar, userId)
                .query(`
                    SELECT user_id, email_address, first_name, phone_number, permissions, role, company_name 
                    FROM Users 
                    WHERE user_id = @user_id
                `)
        );

        if (result.recordset.length > 0) {
            const user = result.recordset[0];
            user.permissions = JSON.parse(user.permissions || '[]');
            return user;
        }
        return null;
    } finally {
        if (!pool) await usePool.close();
    }
}

// ====================== GET USER BY EMAIL (updated) ======================
async function getUserByEmail(email, event = null, pool = null) {
    const usePool = pool || await require('/opt/nodejs/helpers').getDbConnection();
    try {
        const result = await executeWithRetry(() =>
            usePool.request()
                .input('email', sql.VarChar, email.toLowerCase())
                .query(`
                    SELECT user_id, email_address, password, first_name, phone_number, permissions, role, company_name 
                    FROM Users 
                    WHERE email_address = @email
                `)
        );

        if (result.recordset.length > 0) {
            const user = result.recordset[0];
            user.permissions = JSON.parse(user.permissions || '[]');
            return user;
        }
        return null;
    } finally {
        if (!pool) await usePool.close();
    }
}

// ====================== CREATE USER (updated) ======================
async function createUser(userData, pool = null) {
    const usePool = pool || await require('/opt/nodejs/helpers').getDbConnection();
    try {
        const permissions = JSON.stringify(userData.permissions || []);

        await executeWithRetry(() =>
            usePool.request()
                .input('user_id', sql.VarChar, userData.user_id)
                .input('email_address', sql.VarChar, userData.email_address)
                .input('first_name', sql.VarChar, userData.first_name || null)
                .input('last_name', sql.VarChar, userData.last_name || null)
                .input('phone_number', sql.VarChar, userData.phone_number || null)
                .input('permissions', sql.VarChar, permissions)
                .input('stripe_account_id', sql.VarChar, userData.stripe_account_id || null)
                .input('role', sql.VarChar, userData.role || null)
                .input('company_name', sql.VarChar, userData.company_name || null)
                .input('tax_id', sql.VarChar, userData.tax_id || null)
                .input('address', sql.VarChar, userData.address ? JSON.stringify(userData.address) : null)
                .input('dob', sql.VarChar, userData.dob || null)
                .input('ssn_last_4', sql.VarChar, userData.ssn_last_4 || null)
                .input('referrer', sql.VarChar, userData.referrer || null)
                .query(`
                    INSERT INTO Users (
                        user_id, email_address, first_name, last_name, phone_number,
                        permissions, stripe_account_id, role, company_name, tax_id, address,
                        dob, ssn_last_4, referrer, created_at, updated_at
                    )
                    VALUES (
                        @user_id, @email_address, @first_name, @last_name, @phone_number,
                        @permissions, @stripe_account_id, @role, @company_name, @tax_id, @address,
                        @dob, @ssn_last_4, @referrer, GETDATE(), GETDATE()
                    )
                `)
        );

        return userData.user_id;
    } finally {
        if (!pool) await usePool.close();
    }
}

// ====================== UPDATE USER (updated) ======================
async function updateUser(userId, password, email, phone, pool = null) {
    const { hashPassword } = require('/opt/nodejs/helpers');
    const usePool = pool || await require('/opt/nodejs/helpers').getDbConnection();
    try {
        let query = 'UPDATE Users SET updated_at = GETDATE()';
        const inputs = [];

        if (password) {
            const hashedPassword = await hashPassword(password);
            query += ', password = @password';
            inputs.push({ name: 'password', type: sql.VarChar, value: hashedPassword });
        }
        if (email) {
            query += ', email_address = @email';
            inputs.push({ name: 'email', type: sql.VarChar, value: email });
        }
        if (phone) {
            query += ', phone_number = @phone';
            inputs.push({ name: 'phone', type: sql.VarChar, value: phone });
        }

        query += ' WHERE user_id = @user_id';
        inputs.push({ name: 'user_id', type: sql.VarChar, value: userId });

        const request = usePool.request();
        inputs.forEach(input => request.input(input.name, input.type, input.value));

        await executeWithRetry(() => request.query(query));
    } finally {
        if (!pool) await usePool.close();
    }
}

// ====================== LAST LOGIN (updated) ======================
async function getLastLogin(userId, pool = null) {
    const usePool = pool || await require('/opt/nodejs/helpers').getDbConnection();
    try {
        const result = await executeWithRetry(() =>
            usePool.request()
                .input('user_id', sql.VarChar, userId)
                .query(`
                    SELECT TOP 1 [IP], [timestamp]
                    FROM [madeiradb].[dbo].[PostHogEvents]
                    WHERE [source] = @user_id AND [eventtype] = 'login'
                    ORDER BY [timestamp] DESC
                `)
        );

        return result.recordset.length > 0 ? result.recordset[0] : null;
    } finally {
        if (!pool) await usePool.close();
    }
}

async function setLastLogin(userId, IP, pool = null) {
    const usePool = pool || await require('/opt/nodejs/helpers').getDbConnection();
    try {
        await executeWithRetry(() =>
            usePool.request()
                .input('eventtype', sql.VarChar, 'login')
                .input('source', sql.VarChar, userId)
                .input('IP', sql.VarChar, IP)
                .input('timestamp', sql.DateTime, new Date())
                .query(`
                    INSERT INTO [madeiradb].[dbo].[PostHogEvents] (eventtype, source, IP, timestamp)
                    VALUES (@eventtype, @source, @IP, @timestamp)
                `)
        );
    } finally {
        if (!pool) await usePool.close();
    }
}

// ====================== ORIGIN CODE (unchanged - no DB) ======================
async function originCode(event) {
    const axios = require('axios');
    const origin = event.headers.origin;
    if (!origin) throw new Error('No origin header found');

    const url = `${origin}/index.json`;
    const response = await axios.get(url);
    if (response.status !== 200) throw new Error(`Failed to fetch ${url}`);
    if (!response.data.affiliateCode) throw new Error('affiliateCode not found');
    return response.data.affiliateCode;
}

// ====================== TRAFFIC AVAILABILITY (updated) ======================
async function getTrafficAv(userId, pool = null) {
    const usePool = pool || await require('/opt/nodejs/helpers').getDbConnection();
    try {
        const result = await executeWithRetry(() =>
            usePool.request()
                .input('userId', sql.VarChar, userId)
                .query('SELECT dbo.TrafficAv(@userId) AS available_licenses')
        );
        const available = result.recordset[0]?.available_licenses || 0;
        return { success: available > 0 };
    } finally {
        if (!pool) await usePool.close();
    }
}

module.exports = {
    generatePin,
    normalizePhone,
    isValidPhone,
    isValidEmail,
    isValidPassword,
    getUserById,
    getUserByEmail,
    createUser,
    updateUser,
    getLastLogin,
    setLastLogin,
    originCode,
    getTrafficAv
};