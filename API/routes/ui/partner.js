// ====================== routes/ui/partner.js ======================
// Password-protected route for partners to manage their own record
// Supports GET (read) and POST (create/update)
// Logo upload supported via base64
// Approved flag is intentionally excluded (admin only)
// Does NOT read from or modify the Users table in any way

const { 
    logger, 
    sql, 
    executeWithRetry,
    uploadBase64ToS3,
    replaceFileInS3
} = require('/opt/nodejs/helpers');

module.exports = async (event, { pool, sandbox = false }) => {
    const { decoded, httpMethod } = event;
    const body = event.body ? JSON.parse(event.body) : {};

    logger.info('👤 PARTNER ROUTE', { 
        userId: decoded?.user_id, 
        method: httpMethod 
    });

    if (!decoded?.user_id) {
        return { 
            statusCode: 401, 
            body: { status: 'error', error_message: 'Invalid token' } 
        };
    }

    // ====================== PERMISSION CHECK ======================
    const userResult = await executeWithRetry(() =>
        pool.request()
            .input('user_id', sql.Char(8), decoded.user_id)
            .query(`
                SELECT user_id, permissions 
                FROM Users 
                WHERE user_id = @user_id
            `)
    );

    const user = userResult.recordset[0];
    if (!user) {
        return { 
            statusCode: 404, 
            body: { status: 'error', error_message: 'User not found' } 
        };
    }

    const permissions = user.permissions || [];
    const isPartner = permissions.includes('partner');

    if (!isPartner) {
        return { 
            statusCode: 403, 
            body: { status: 'error', error_message: 'Partner access required' } 
        };
    }

    const partnerId = decoded.user_id;

    // ====================== GET ======================
    if (httpMethod === 'GET') {
        const result = await executeWithRetry(() =>
            pool.request()
                .input('partnerId', sql.Char(8), partnerId)
                .query(`
                    SELECT 
                        PartnerID,
                        Name,
                        Location,
                        Website,
                        Phone,
                        Logo,
                        Description,
                        Provides
                    FROM dbo.Partner
                    WHERE PartnerID = @partnerId
                `)
        );

        const partner = result.recordset[0] || null;

        return {
            statusCode: 200,
            body: { 
                status: 'success', 
                partner: partner,
                message: partner ? null : 'No partner record found. You can create one below.'
            }
        };
    }

    // ====================== POST ======================
    if (httpMethod === 'POST') {
        const { 
            Name, 
            Location, 
            Website, 
            Phone, 
            Description, 
            Provides,
            logoBase64,
            logoFileName
        } = body;

        if (!Name) {
            return { 
                statusCode: 400, 
                body: { status: 'error', error_message: 'Name is required' } 
            };
        }

        let finalLogoUrl = null;

        // ====================== LOGO UPLOAD (FIXED) ======================
        if (logoBase64) {
            try {
                const fileName = logoFileName || `partner-${partnerId}-${Date.now()}.png`;
                const s3Key = `partners/logos/${fileName}`;

                // Check if partner already exists and has a logo
                const existing = await executeWithRetry(() =>
                    pool.request()
                        .input('partnerId', sql.Char(8), partnerId)
                        .query(`SELECT Logo FROM dbo.Partner WHERE PartnerID = @partnerId`)
                );

                if (existing.recordset.length > 0 && existing.recordset[0].Logo) {
                    // Try to replace existing logo
                    try {
                        const oldUrl = existing.recordset[0].Logo;
                        const urlObj = new URL(oldUrl);
                        const oldKey = urlObj.pathname.startsWith('/') 
                            ? urlObj.pathname.substring(1) 
                            : urlObj.pathname;

                        finalLogoUrl = await replaceFileInS3(oldKey, logoBase64, s3Key);
                    } catch (parseError) {
                        // Fallback if we can't parse old URL
                        logger.warn('Could not parse old logo URL, uploading new one', { partnerId });
                        finalLogoUrl = await uploadBase64ToS3(logoBase64, s3Key);
                    }
                } else {
                    // New partner or no existing logo
                    finalLogoUrl = await uploadBase64ToS3(logoBase64, s3Key);
                }

                logger.info('Logo uploaded successfully', { partnerId, url: finalLogoUrl });

            } catch (uploadError) {
                logger.error('Logo upload failed', { 
                    partnerId, 
                    error: uploadError.message 
                });
                // Do not fail the whole request — continue without updating the logo
                finalLogoUrl = null;
            }
        }

        // ====================== SAVE PARTNER RECORD ======================
        const existingCheck = await executeWithRetry(() =>
            pool.request()
                .input('partnerId', sql.Char(8), partnerId)
                .query(`SELECT 1 FROM dbo.Partner WHERE PartnerID = @partnerId`)
        );

        if (existingCheck.recordset.length > 0) {
            // UPDATE
            await executeWithRetry(() =>
                pool.request()
                    .input('partnerId', sql.Char(8), partnerId)
                    .input('Name', sql.NVarChar(200), Name)
                    .input('Location', sql.NVarChar(200), Location || null)
                    .input('Website', sql.NVarChar(500), Website || null)
                    .input('Phone', sql.NVarChar(50), Phone || null)
                    .input('Description', sql.NVarChar(sql.MAX), Description || null)
                    .input('Provides', sql.NVarChar(sql.MAX), Provides || null)
                    .input('Logo', sql.NVarChar(500), finalLogoUrl || null)
                    .query(`
                        UPDATE dbo.Partner
                        SET 
                            Name = @Name,
                            Location = @Location,
                            Website = @Website,
                            Phone = @Phone,
                            Description = @Description,
                            Provides = @Provides,
                            Logo = COALESCE(@Logo, Logo),
                            UpdatedAt = SYSUTCDATETIME()
                        WHERE PartnerID = @partnerId
                    `)
            );

            return {
                statusCode: 200,
                body: { status: 'success', message: 'Partner record updated successfully' }
            };
        } else {
            // CREATE
            await executeWithRetry(() =>
                pool.request()
                    .input('partnerId', sql.Char(8), partnerId)
                    .input('Name', sql.NVarChar(200), Name)
                    .input('Location', sql.NVarChar(200), Location || null)
                    .input('Website', sql.NVarChar(500), Website || null)
                    .input('Phone', sql.NVarChar(50), Phone || null)
                    .input('Description', sql.NVarChar(sql.MAX), Description || null)
                    .input('Provides', sql.NVarChar(sql.MAX), Provides || null)
                    .input('Logo', sql.NVarChar(500), finalLogoUrl)
                    .input('Approved', sql.Bit, 0)
                    .query(`
                        INSERT INTO dbo.Partner 
                            (PartnerID, Name, Location, Website, Phone, Description, Provides, Logo, Approved)
                        VALUES 
                            (@partnerId, @Name, @Location, @Website, @Phone, @Description, @Provides, @Logo, @Approved)
                    `)
            );

            return {
                statusCode: 201,
                body: { 
                    status: 'success', 
                    message: 'Partner record created successfully',
                    partnerId: partnerId
                }
            };
        }
    }

    return {
        statusCode: 405,
        body: { status: 'error', error_message: 'Method not allowed' }
    };
};