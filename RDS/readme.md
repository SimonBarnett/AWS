# RDS / Microsoft SQL Server - Madeira Platform

This folder contains the database schema and related scripts for the **Club Madeira** platform running on **Amazon RDS for SQL Server**.

## Current Production Configuration

**Instance Details** (as of June 2026):

- **DB Instance Identifier**: `clubmadeira`
- **Engine**: Microsoft SQL Server (Web Edition)
- **Engine Version**: `16.00.4250.1.v1`
- **Instance Class**: `db.t3.medium` (2 vCPU, 4 GiB RAM)
- **Storage Type**: General Purpose SSD (gp2)
- **Allocated Storage**: Minimum 200 GiB (scalable)
- **Multi-AZ**: Disabled (single AZ deployment)
- **Backup Retention**: 1 day
- **Automated Backups**: Enabled
- **Performance Insights**: Enabled (Advanced)
- **Enhanced Monitoring**: Enabled
- **Certificate Authority**: `rds-ca-rsa2048-g1`
- **Parameter Group**: `default.sqlserver-web-16.0`
- **Option Group**: `default:sqlserver-web-16-00`

**Important Notes**:
- This is a **Web Edition** license (cost-optimized for smaller workloads).
- The database name is **`madeiradb`**.
- Two main logins exist: `madeira` (application) and `remote` (for external access).

---

## How to Create / Restore the Database from `schema.sql`

### Prerequisites

1. **SQL Server client**:
   - SQL Server Management Studio (SSMS) – Recommended
   - `sqlcmd` command line tool
   - Azure Data Studio

2. Connection details from AWS RDS console:
   - Endpoint
   - Port (default: `1433`)
   - Master username + password (stored in AWS Secrets Manager or self-managed)

### Step-by-Step Instructions

#### Option 1: Using SQL Server Management Studio (SSMS)

1. Connect to the RDS instance using the endpoint and credentials.
2. Open a **New Query** window.
3. Run the following to create the database (if it doesn't exist):

```sql
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'madeiradb')
BEGIN
    CREATE DATABASE madeiradb;
END
GO

USE madeiradb;
GO
```

4. Open the `schema.sql` file from this folder.
5. Execute the entire script (**F5** or **Execute**).

> **Note**: The script is very large. It may take several minutes to run. It creates:
> - Users and roles
> - Full-text catalogs
> - All tables
> - User-defined functions (`TrafficAv`, `Part2`, `Menu`, etc.)
> - Stored procedures
> - Views
> - Foreign keys and constraints

#### Option 2: Using `sqlcmd` (Command Line)

```bash
sqlcmd -S your-rds-endpoint.database.windows.net,1433 \
       -U your-master-username \
       -P 'your-password' \
       -d master \
       -i RDS/schema.sql
```

> Replace `your-rds-endpoint`, username, and password accordingly.

---

## Key Objects Created by `schema.sql`

| Type              | Examples                                      | Purpose |
|-------------------|-----------------------------------------------|--------|
| **Tables**        | `Users`, `Products`, `Catalog`, `clubscan`, `UserCategories`, `MerchantProducts` | Core data storage |
| **Functions**     | `TrafficAv()`, `Part2()`, `Menu()`, `PartnerSites()` | Business logic (traffic calculation, pagination, etc.) |
| **Stored Procedures** | `RebuildMerchantIndexes`, `DisableMerchantIndexes`, `sp_ClaimVoucher`, `GenerateUniqueUserId` | Maintenance & business operations |
| **Views**         | `Searches`, `Sum_Merchant_Parts`, `vw_ActiveClubs_Last72Hours` | Reporting & analytics |
| **Full-Text Catalogs** | `DefaultFullTextCatalog`, `ft_MerchantProducts` | Search functionality |

---

## Post-Deployment Steps (Recommended)

After running `schema.sql`, you should:

1. **Create application users** (if not already created):
   ```sql
   CREATE LOGIN madeira WITH PASSWORD = 'StrongPassword123!';
   CREATE USER madeira FOR LOGIN madeira;
   ALTER ROLE db_owner ADD MEMBER madeira;
   ```

2. **Enable Full-Text Search** (if not already enabled on the instance).

3. **Run index maintenance**:
   ```sql
   EXEC dbo.RebuildMerchantIndexes;
   ```

4. **Update statistics**:
   ```sql
   UPDATE STATISTICS dbo.MerchantProducts WITH FULLSCAN;
   ```

---

## Important Notes

- The schema is designed for **Microsoft SQL Server 2019/2022**.
- Many functions rely on `JSON_VALUE`, `TRY_CAST`, and window functions — ensure compatibility.
- The `clubscan` and `UserCategories` tables are heavily used by the SQS catalogue pipeline.
- `MerchantProducts` has special index management stored procedures for bulk loading.

---

**Last Updated**: 14 June 2026  
**Owner**: Simon Barnett (Club Madeira)  
**Database**: `madeiradb` on Amazon RDS (SQL Server Web)