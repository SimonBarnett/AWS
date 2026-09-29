USE [madeiradb]
GO
/****** Object:  User [madeira]    Script Date: 04/07/2026 17:03:09 ******/
CREATE USER [madeira] FOR LOGIN [madeira] WITH DEFAULT_SCHEMA=[dbo]
GO
/****** Object:  User [remote]    Script Date: 04/07/2026 17:03:09 ******/
CREATE USER [remote] FOR LOGIN [remote] WITH DEFAULT_SCHEMA=[dbo]
GO
/****** Object:  User [sa]    Script Date: 04/07/2026 17:03:09 ******/
CREATE USER [sa] FOR LOGIN [sa] WITH DEFAULT_SCHEMA=[dbo]
GO
ALTER ROLE [db_owner] ADD MEMBER [sa]
GO
/****** Object:  FullTextCatalog [DefaultFullTextCatalog]    Script Date: 04/07/2026 17:03:09 ******/
CREATE FULLTEXT CATALOG [DefaultFullTextCatalog] WITH ACCENT_SENSITIVITY = OFF
GO
/****** Object:  FullTextCatalog [ft_MerchantProducts]    Script Date: 04/07/2026 17:03:09 ******/
CREATE FULLTEXT CATALOG [ft_MerchantProducts] WITH ACCENT_SENSITIVITY = OFF
GO
/****** Object:  FullTextCatalog [FTC_MerchantProducts]    Script Date: 04/07/2026 17:03:09 ******/
CREATE FULLTEXT CATALOG [FTC_MerchantProducts] WITH ACCENT_SENSITIVITY = OFF
GO
/****** Object:  FullTextCatalog [MerchantProducts_FTCatalog]    Script Date: 04/07/2026 17:03:09 ******/
CREATE FULLTEXT CATALOG [MerchantProducts_FTCatalog] WITH ACCENT_SENSITIVITY = ON
GO
/****** Object:  UserDefinedFunction [dbo].[fn_ClubScanIsActive]    Script Date: 04/07/2026 17:03:09 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- 1. CREATE SCALAR UDF (the logic you want)
CREATE   FUNCTION [dbo].[fn_ClubScanIsActive] (@ClubScanId INT)
RETURNS BIT
AS
BEGIN
    DECLARE @Active BIT = 0;
    
    SELECT @Active = CASE 
        WHEN MAX(fpa.timestamp) > DATEADD(HOUR, -72, GETDATE()) THEN 1 
        ELSE 0 
    END
    FROM [dbo].[clubscan] cs 
    JOIN [dbo].[UserFingerprints] fp ON cs.ClubID = fp.user_id 
    JOIN [dbo].[FingerprintCatalogAccess] fpa ON fpa.fingerprint_id = fp.id 
    WHERE cs.Id = @ClubScanId;

    RETURN @Active;
END
GO
/****** Object:  UserDefinedFunction [dbo].[traffic]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE FUNCTION [dbo].[traffic] (@userId VARCHAR(8))
RETURNS INT
AS
BEGIN
    DECLARE @count INT;
    
    SELECT @count = COUNT(*)
    FROM dbo.DatabaseCallLog
    WHERE UserId = @userId
    AND Timestamp > GETDATE() - 30;
    
    RETURN @count;
END;
GO
/****** Object:  UserDefinedFunction [dbo].[TrafficAv]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
create FUNCTION [dbo].[TrafficAv] (@referrer VARCHAR(50))
RETURNS INT
AS
BEGIN
    DECLARE @qualified_count INT;
    DECLARE @partner_count INT;
    DECLARE @licenses INT;

    SELECT @qualified_count = COUNT(*)
    FROM dbo.Users u
    INNER JOIN dbo.UserCategories uc ON u.user_id = uc.uid
    WHERE u.permissions LIKE '%community%'
    AND uc.json_categories <> N'{}'
    AND u.referrer = @referrer
    AND dbo.Traffic(u.user_id) >= 1500;

    SELECT @partner_count = COUNT(*)
    FROM dbo.Users u
    WHERE u.permissions LIKE '%partner%'
    AND u.referrer = @referrer;

    IF @qualified_count < 20
        SET @licenses = 0;
    ELSE
        SET @licenses = 2 + FLOOR((@qualified_count - 20) / 10);

    RETURN CASE WHEN @licenses > @partner_count THEN @licenses - @partner_count ELSE 0 END;
END;

/*
SELECT dbo.TrafficAv('L7WDZWC8')
*/
GO
/****** Object:  Table [dbo].[Catalog]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Catalog](
	[ID] [int] IDENTITY(1,1) NOT NULL,
	[UserId] [nvarchar](50) NULL,
	[MainCategory] [nvarchar](255) NULL,
	[SubCategory] [nvarchar](255) NULL,
	[Icon] [nvarchar](50) NULL,
	[Created] [datetime] NULL,
	[LastUpdate] [datetime] NULL,
	[MainCategoryOrder] [int] NULL,
	[SubCategoryOrder] [int] NULL,
	[SearchTerms] [nvarchar](max) NULL,
	[ProcessedBatchId] [nvarchar](36) NULL,
	[RelevantKeywords] [nvarchar](max) NULL,
	[IrrelevantKeywords] [nvarchar](max) NULL,
	[Notes] [nvarchar](max) NULL,
PRIMARY KEY CLUSTERED 
(
	[ID] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY],
UNIQUE NONCLUSTERED 
(
	[UserId] ASC,
	[MainCategory] ASC,
	[SubCategory] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  UserDefinedFunction [dbo].[Menu]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE FUNCTION [dbo].[Menu] (
    @UserId NVARCHAR(50),
    @MainCategory NVARCHAR(255) = NULL
)
RETURNS TABLE
AS
RETURN
(
    -- Case 1: Main categories (when @MainCategory is NULL)
    SELECT 
        UserId,
        icon,
        MainCategory AS Category,
        MIN(MainCategoryOrder) AS SortOrder
    FROM dbo.Catalog
    WHERE UserId = @UserId 
      AND @MainCategory IS NULL
    GROUP BY UserId, icon, MainCategory

    UNION ALL

    -- Case 2: Subcategories (when @MainCategory is provided)
    SELECT 
        UserId,
        icon,
        SubCategory AS Category,
        SubCategoryOrder AS SortOrder
    FROM dbo.Catalog
    WHERE UserId = @UserId 
      AND MainCategory = @MainCategory 
      AND @MainCategory IS NOT NULL
);
GO
/****** Object:  Table [dbo].[MerchantCatalog]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[MerchantCatalog](
	[CatalogID] [int] IDENTITY(1,1) NOT NULL,
	[MerchantID] [nvarchar](50) NOT NULL,
	[CommunityID] [nvarchar](50) NOT NULL,
	[MainCategory] [nvarchar](255) NULL,
	[SubCategory] [nvarchar](255) NULL,
	[ASIN] [nvarchar](64) NULL,
	[MerchantProductID] [int] NOT NULL,
	[ProductDescription] [varchar](255) NULL,
	[IncludeReason] [nvarchar](max) NULL,
PRIMARY KEY CLUSTERED 
(
	[CatalogID] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY],
 CONSTRAINT [UC_MerchantCatalog] UNIQUE NONCLUSTERED 
(
	[MerchantID] ASC,
	[CommunityID] ASC,
	[MainCategory] ASC,
	[SubCategory] ASC,
	[ASIN] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY],
 CONSTRAINT [UC_MerchantCatalog_CommunityProduct] UNIQUE NONCLUSTERED 
(
	[CommunityID] ASC,
	[MainCategory] ASC,
	[SubCategory] ASC,
	[MerchantProductID] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Products]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Products](
	[ID] [int] IDENTITY(1,1) NOT NULL,
	[UserId] [nvarchar](50) NULL,
	[Category] [nvarchar](255) NULL,
	[Subcategory] [nvarchar](255) NULL,
	[ASIN] [nvarchar](64) NULL,
	[Source] [nvarchar](50) NULL,
	[Title] [nvarchar](max) NULL,
	[Price] [nvarchar](50) NULL,
	[Discount] [nvarchar](50) NULL,
	[WasPrice] [nvarchar](50) NULL,
	[AffiliateUrl] [nvarchar](1024) NULL,
	[ThumbnailUrl] [nvarchar](1024) NULL,
	[CategoryId] [nvarchar](50) NULL,
	[CategoryName] [nvarchar](255) NULL,
	[Mpn] [nvarchar](50) NULL,
	[Brand] [nvarchar](255) NULL,
	[Features] [nvarchar](max) NULL,
	[Specifications] [nvarchar](max) NULL,
	[Created] [datetime] NULL,
	[LastUpdate] [datetime] NULL,
	[Reason] [nvarchar](255) NULL,
PRIMARY KEY CLUSTERED 
(
	[ID] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY],
 CONSTRAINT [UQ_UserId_Category_Subcategory_ASIN_Source] UNIQUE NONCLUSTERED 
(
	[UserId] ASC,
	[Category] ASC,
	[Subcategory] ASC,
	[ASIN] ASC,
	[Source] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[MerchantProducts]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[MerchantProducts](
	[ID] [int] IDENTITY(1,1) NOT NULL,
	[UserId] [nvarchar](50) NULL,
	[Category] [nvarchar](255) NULL,
	[Subcategory] [nvarchar](255) NULL,
	[ASIN] [nvarchar](64) NULL,
	[Source] [nvarchar](50) NULL,
	[Title] [nvarchar](500) NULL,
	[Price] [nvarchar](50) NULL,
	[Discount] [nvarchar](50) NULL,
	[WasPrice] [nvarchar](50) NULL,
	[AffiliateUrl] [nvarchar](2048) NULL,
	[ThumbnailUrl] [nvarchar](2048) NULL,
	[CategoryId] [nvarchar](50) NULL,
	[CategoryName] [varchar](500) NULL,
	[Mpn] [varchar](255) NULL,
	[Brand] [varchar](255) NULL,
	[Features] [nvarchar](max) NULL,
	[Specifications] [nvarchar](max) NULL,
	[Created] [datetime] NULL,
	[LastUpdate] [datetime] NULL,
	[ProcessedBatchId] [nvarchar](50) NULL,
	[ProductDescription] [varchar](255) NULL,
 CONSTRAINT [PK_MerchantProducts] PRIMARY KEY NONCLUSTERED 
(
	[ID] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  UserDefinedFunction [dbo].[Part]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE FUNCTION [dbo].[Part]
(
    @UserId NVARCHAR(50),
    @MainCategory NVARCHAR(255),
    @SubCategory NVARCHAR(255) = NULL,
    @LastSource NVARCHAR(50) = NULL,
    @LastSubCategory NVARCHAR(255) = NULL,
    @LastID INT = NULL,
    @PageSize INT
)
RETURNS TABLE
AS
RETURN
(
    WITH Combined AS (
        SELECT 
            mc.MerchantID AS Source, 
            mc.SubCategory, 
            mp.ID, 
            mp.Title,
            mp.Price, 
            mp.Discount, 
            mp.WasPrice, 
            mp.AffiliateUrl + '?tag=' + @UserId AS AffiliateUrl, 
            mp.ThumbnailUrl,
            mp.Mpn, 
            mp.Brand,
            c.SubCategoryOrder as SortOrder -- Fetch the sort order from Catalog
        FROM dbo.MerchantCatalog mc
        INNER JOIN dbo.MerchantProducts mp ON mc.MerchantID = mp.UserId AND mc.ASIN = mp.ASIN
        INNER JOIN dbo.Catalog c ON c.UserId = @UserId AND c.MainCategory = @MainCategory AND c.SubCategory = mc.SubCategory
        WHERE mc.CommunityID = @UserId 
              AND mc.MainCategory = @MainCategory
              AND (@SubCategory IS NULL OR mc.SubCategory = @SubCategory)
        UNION ALL
        SELECT 
            p.Source, 
            p.SubCategory, 
            p.ID, 
            p.Title,
            p.Price, 
            p.Discount, 
            p.WasPrice, 
            p.AffiliateUrl, 
            p.ThumbnailUrl,
            p.Mpn, 
            p.Brand,
            c.SubCategoryOrder as SortOrder -- Fetch the sort order from Catalog
        FROM dbo.Products p
        INNER JOIN dbo.Catalog c ON c.UserId = @UserId AND c.MainCategory = @MainCategory AND c.SubCategory = p.SubCategory
        WHERE p.UserId = @UserId 
              AND p.Category = @MainCategory
              AND (@SubCategory IS NULL OR p.SubCategory = @SubCategory)
    )
    SELECT TOP (@PageSize) *
    FROM Combined
    WHERE (@LastSubCategory IS NULL OR
           (SubCategory > @LastSubCategory) OR
           (SubCategory = @LastSubCategory AND 
            ((Source = @UserId AND (@LastSource IS NULL OR @LastSource <> @UserId)) OR 
             (Source = @LastSource AND ID > @LastID) OR
             (Source > @LastSource AND @LastSource <> @UserId))))
    ORDER BY 
        CASE WHEN @SubCategory IS NULL THEN SortOrder ELSE 0 END,  -- Use sort order when @SubCategory is NULL
        SubCategory, 
        CASE WHEN Source = @UserId THEN 0 ELSE 1 END, 
        Source, 
        ID
);
GO
/****** Object:  Table [dbo].[clubscan]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[clubscan](
	[Id] [int] IDENTITY(1,1) NOT NULL,
	[Url] [nvarchar](500) NOT NULL,
	[Status] [nvarchar](50) NOT NULL,
	[JsonResult] [nvarchar](max) NULL,
	[CreatedAt] [datetime] NULL,
	[UpdatedAt] [datetime] NULL,
	[PartnerId] [varchar](8) NULL,
	[ClubID] [varchar](8) NULL,
	[LastError] [nvarchar](max) NULL,
	[active]  AS ([dbo].[fn_ClubScanIsActive]([Id])),
	[PartnerURL] [nvarchar](1000) NOT NULL,
	[Screenshot] [nvarchar](1000) NULL,
	[Comment] [nvarchar](max) NULL,
PRIMARY KEY CLUSTERED 
(
	[Id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY],
UNIQUE NONCLUSTERED 
(
	[Url] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Partner]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Partner](
	[PartnerID] [char](8) NOT NULL,
	[Name] [nvarchar](200) NOT NULL,
	[Location] [nvarchar](200) NULL,
	[Website] [nvarchar](500) NULL,
	[Phone] [nvarchar](50) NULL,
	[Logo] [nvarchar](500) NULL,
	[Description] [nvarchar](max) NULL,
	[Provides] [nvarchar](max) NULL,
	[Approved] [bit] NOT NULL,
	[CreatedAt] [datetime2](7) NOT NULL,
	[UpdatedAt] [datetime2](7) NOT NULL,
 CONSTRAINT [PK_Partner] PRIMARY KEY CLUSTERED 
(
	[PartnerID] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  UserDefinedFunction [dbo].[clubs]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE FUNCTION [dbo].[clubs]
(
)
RETURNS TABLE
AS
RETURN
(
    SELECT
        c.ClubID,
        JSON_VALUE(c.JsonResult, '$.name') AS Name,
        JSON_VALUE(c.JsonResult, '$.location') AS Location,
        c.Url,
        JSON_VALUE(c.JsonResult, '$.sector') AS Sector,
        JSON_VALUE(c.JsonResult, '$.review') AS Review,
        c.PartnerId,

        -- Partner Information (only populated if partner is Approved)
        p.Name            AS PartnerName,
        p.Logo            AS PartnerLogo,
        p.Website         AS PartnerWebsite,
        p.Description     AS PartnerDescription,
        p.Approved        AS PartnerApproved,

        c.Screenshot,
        c.Comment,
        JSON_VALUE(c.JsonResult, '$.audience') AS Audience,

        -- Interests as JSON array
        (
            SELECT
                ms.segmentName AS Interest,
                ms.description AS Description
            FROM OPENJSON(c.JsonResult, '$.marketSegments')
                WITH (
                    segmentName NVARCHAR(200) '$.segmentName',
                    description NVARCHAR(MAX) '$.description'
                ) ms
            FOR JSON PATH
        ) AS Interests

    FROM [madeiradb].[dbo].[clubscan] c

    -- LEFT OUTER JOIN with filter on Approved inside the JOIN
    LEFT OUTER JOIN dbo.Partner p
        ON p.PartnerID = c.PartnerId
       AND p.Approved = 1

    WHERE
        c.JsonResult IS NOT NULL
        AND JSON_VALUE(c.JsonResult, '$.name') IS NOT NULL
);
GO
/****** Object:  UserDefinedFunction [dbo].[Part2]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE FUNCTION [dbo].[Part2]
(
    @UserId NVARCHAR(50),
    @MainCategory NVARCHAR(255),
    @SubCategory NVARCHAR(255) = NULL,
    @LastSource NVARCHAR(50) = NULL,
    @LastSubCategory NVARCHAR(255) = NULL,
    @LastID INT = NULL,
    @PageSize INT,
    @SortOrder NVARCHAR(50) = 'PriceDesc',
    @SearchTerm NVARCHAR(255) = NULL
)
RETURNS TABLE
AS
RETURN
(
    WITH Filtered AS (
        SELECT
            p.Source,
            p.SubCategory,
            p.ID,
            p.Title,
            p.Price,
            CAST(
                CASE
                    WHEN p.Price IS NULL OR p.Price = 'NULL' OR p.Price = '' THEN 0
                    ELSE TRY_CAST(
                        REPLACE(
                            SUBSTRING(p.Price, 2, PATINDEX('%[ (]%', p.Price + ' ') - 2),
                            ',', ''
                        ) AS DECIMAL(18,2))
                END AS DECIMAL(18,2)) AS SortPrice,
            p.Discount,
            p.WasPrice,
            CASE
                WHEN p.Source = 'paapi'
                    THEN REPLACE(p.AffiliateUrl, 'tag=mymodelflying-21', 'tag=mymodelflying-' + LOWER(@UserId) + '-21')
                WHEN p.Source = 'awin'
                    THEN p.AffiliateUrl + '&clickref=' + @UserId
                ELSE p.AffiliateUrl
            END AS AffiliateUrl,
            p.ThumbnailUrl,
            p.Mpn,
            p.Brand,
            c.SubCategoryOrder,
            p.Created AS CreatedDate
        FROM dbo.Products p
        INNER JOIN dbo.Catalog c
            ON c.UserId = @UserId
           AND c.MainCategory = @MainCategory
           AND c.SubCategory = p.SubCategory
        WHERE p.UserId = @UserId
          AND p.Category = @MainCategory
          AND (@SubCategory IS NULL OR p.SubCategory = @SubCategory)
          AND (
                @SearchTerm IS NULL
                OR p.Title LIKE '%' + @SearchTerm + '%'
                OR p.Brand LIKE '%' + @SearchTerm + '%'
                OR p.Mpn LIKE '%' + @SearchTerm + '%'
              )
    ),
    Numbered AS (
        SELECT *,
            ROW_NUMBER() OVER (
                ORDER BY
                    CASE WHEN @SubCategory IS NOT NULL THEN SubCategoryOrder ELSE 0 END,
                    CASE WHEN @SubCategory IS NOT NULL THEN SubCategory ELSE '' END,
                    CASE WHEN @SortOrder = 'PriceDesc' THEN SortPrice ELSE NULL END DESC,
                    CASE WHEN @SortOrder = 'PriceAsc' THEN SortPrice ELSE NULL END ASC,
                    CASE WHEN @SortOrder = 'DateAsc' THEN CreatedDate ELSE NULL END ASC,
                    CASE WHEN @SortOrder = 'DateDesc' THEN CreatedDate ELSE NULL END DESC,
                    ID
            ) AS rn
        FROM Filtered
    )
    SELECT TOP (@PageSize)
        Source,
        SubCategory,
        ID,
        Title,
        Price,
        Discount,
        WasPrice,
        AffiliateUrl,
        ThumbnailUrl,
        Mpn,
        Brand,
        SubCategoryOrder,
        CreatedDate,
        rn AS rowid
    FROM Numbered
    WHERE (@LastID IS NULL OR rn > @LastID)
    ORDER BY rn
);
GO
/****** Object:  Table [dbo].[Users]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Users](
	[user_id] [varchar](8) NOT NULL,
	[referrer] [varchar](8) NULL,
	[password] [varchar](255) NULL,
	[stripe_account_id] [varchar](50) NULL,
	[first_name] [varchar](100) NULL,
	[last_name] [varchar](100) NULL,
	[website_url] [varchar](255) NULL,
	[email_address] [varchar](255) NOT NULL,
	[phone_number] [varchar](20) NULL,
	[permissions] [varchar](max) NULL,
	[created_at] [datetime] NULL,
	[updated_at] [datetime] NULL,
	[role] [varchar](50) NULL,
	[company_name] [varchar](255) NULL,
	[tax_id] [varchar](50) NULL,
	[address] [varchar](max) NULL,
	[dob] [varchar](50) NULL,
	[ssn_last_4] [varchar](4) NULL,
	[signupurl] [varchar](255) NULL,
	[stripe_customer_id] [varchar](255) NULL,
	[StripeSubscriptionId] [varchar](255) NULL,
PRIMARY KEY CLUSTERED 
(
	[user_id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  UserDefinedFunction [dbo].[PartnerSites]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE FUNCTION [dbo].[PartnerSites] (@referrer VARCHAR(8))  
RETURNS TABLE
AS
RETURN
(
    SELECT 
        COUNT(DISTINCT CASE WHEN u.[permissions] LIKE '%community%' THEN u.user_id END) AS communities,
        COUNT(DISTINCT CASE WHEN u.[permissions] LIKE '%merchant%' THEN u.user_id END) AS merchants,
        dbo.TrafficAv(@referrer) AS traffic
    FROM dbo.Users u
    WHERE u.referrer = @referrer
    AND u.password <> ''
);

/*
SELECT        communities, merchants, call_count , traffic
FROM            dbo.PartnerSites('L7WDZWC8') AS PartnerSites_1
*/

/*
SELECT        communities, merchants, call_count , traffic
FROM            dbo.PartnerSites('L7WDZWC8') AS PartnerSites_1
*/
GO
/****** Object:  Table [dbo].[CatalogAffiliateUpdates]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[CatalogAffiliateUpdates](
	[CatalogId] [int] NOT NULL,
	[AffiliateKey] [nvarchar](100) NOT NULL,
	[LastUpdate] [datetime] NOT NULL,
	[S3File] [nvarchar](500) NULL,
	[BatchName] [nvarchar](100) NULL,
	[NextCheck] [datetime] NULL,
	[Status] [nvarchar](50) NOT NULL,
 CONSTRAINT [PK_CatalogAffiliateUpdates] PRIMARY KEY CLUSTERED 
(
	[CatalogId] ASC,
	[AffiliateKey] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY],
 CONSTRAINT [UQ_CatalogAffiliateUpdates_CatalogId_AffiliateKey] UNIQUE NONCLUSTERED 
(
	[CatalogId] ASC,
	[AffiliateKey] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  UserDefinedFunction [dbo].[UserCatalog]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE FUNCTION [dbo].[UserCatalog]
(	
	-- Add the parameters for the function here
	@UserId nvarchar(8), 
	@Source nvarchar(100)
)
RETURNS TABLE 
AS
RETURN 
(
	SELECT DISTINCT 
		 CatalogId , [AffiliateKey]
	FROM [dbo].[CatalogAffiliateUpdates]
	WHERE [CatalogId] in (select [ID] from [dbo].[Catalog] where [UserId]=@UserId)
	AND AffiliateKey = @Source
)
GO
/****** Object:  View [dbo].[Searches]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE VIEW [dbo].[Searches]
AS
SELECT        dbo.CatalogAffiliateUpdates.AffiliateKey, dbo.CatalogAffiliateUpdates.S3File, dbo.CatalogAffiliateUpdates.BatchName, dbo.CatalogAffiliateUpdates.NextCheck, dbo.CatalogAffiliateUpdates.Status, dbo.Catalog.MainCategory, 
                         dbo.Catalog.SubCategory, dbo.CatalogAffiliateUpdates.LastUpdate, dbo.Catalog.SearchTerms
FROM            dbo.CatalogAffiliateUpdates INNER JOIN
                         dbo.Catalog ON dbo.Catalog.ID = dbo.CatalogAffiliateUpdates.CatalogId
WHERE        (dbo.CatalogAffiliateUpdates.S3File IS NOT NULL)
GO
/****** Object:  Table [dbo].[DatabaseCallLog]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[DatabaseCallLog](
	[ID] [int] IDENTITY(1,1) NOT NULL,
	[RemoteIP] [nvarchar](45) NULL,
	[Timestamp] [datetime2](3) NULL,
	[UserId] [nvarchar](50) NULL,
	[Category] [nvarchar](255) NULL,
	[SubCategory] [nvarchar](255) NULL,
PRIMARY KEY CLUSTERED 
(
	[ID] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  View [dbo].[vw_ActiveClubs_Last72Hours]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE VIEW [dbo].[vw_ActiveClubs_Last72Hours] AS
SELECT 
    d.UserId,
    c.Url,
    c.Status,
    COUNT(*) AS CallCount,
    MAX(d.Timestamp) AS LastActivity
FROM [madeiradb].[dbo].[DatabaseCallLog] d
INNER JOIN [dbo].[clubscan] c 
    ON d.UserId = c.ClubID
WHERE d.Timestamp > DATEADD(HOUR, -72, GETDATE())
GROUP BY 
    d.UserId, 
    c.Url, 
    c.Status;
GO
/****** Object:  View [dbo].[Sum_Merchant_Parts]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE VIEW [dbo].[Sum_Merchant_Parts]
AS
SELECT        TOP (100) PERCENT dbo.Users.user_id, dbo.Users.website_url, COUNT(*) AS Parts
FROM            dbo.Users INNER JOIN
                         dbo.MerchantProducts ON dbo.Users.user_id = dbo.MerchantProducts.UserId
GROUP BY dbo.Users.user_id, dbo.Users.website_url
ORDER BY Parts DESC
GO
/****** Object:  UserDefinedFunction [dbo].[fn_GetTableIndexes]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE FUNCTION [dbo].[fn_GetTableIndexes](@TableName SYSNAME)
RETURNS TABLE
AS
RETURN
(
    SELECT
        i.name AS IndexName,
        i.type_desc AS IndexType,
        CASE 
            WHEN i.is_disabled = 1 THEN 'DISABLED' 
            ELSE 'ENABLED' 
        END AS [State],
        i.is_unique AS IsUnique,
        STUFF((
            SELECT ', ' + c.name
            FROM sys.index_columns ic
            INNER JOIN sys.columns c 
                ON ic.object_id = c.object_id 
               AND ic.column_id = c.column_id
            WHERE ic.object_id = i.object_id 
              AND ic.index_id = i.index_id 
              AND ic.key_ordinal > 0
            ORDER BY ic.key_ordinal
            FOR XML PATH(''), TYPE
        ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS KeyColumns
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID(@TableName)
)
GO
/****** Object:  Table [dbo].[amazon_cards]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[amazon_cards](
	[id] [int] IDENTITY(1,1) NOT NULL,
	[code] [varchar](50) NOT NULL,
	[value] [decimal](10, 2) NOT NULL,
	[currency] [varchar](3) NULL,
	[status] [varchar](20) NOT NULL,
	[claimant_id] [int] NULL,
	[claimed_at] [datetime2](7) NULL,
	[redeemed_at] [datetime2](7) NULL,
	[expires_at] [datetime2](7) NULL,
	[day_of_week] [int] NULL,
	[created_at] [datetime2](7) NULL,
	[updated_at] [datetime2](7) NULL,
PRIMARY KEY CLUSTERED 
(
	[id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY],
UNIQUE NONCLUSTERED 
(
	[code] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[ApiProvider]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[ApiProvider](
	[Id] [int] IDENTITY(1,1) NOT NULL,
	[Comment] [nvarchar](64) NULL,
	[Description] [nvarchar](255) NULL,
	[Icon] [nvarchar](255) NULL,
	[SettingsJson] [nvarchar](max) NULL,
PRIMARY KEY CLUSTERED 
(
	[Id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[AwinHighApprovalMerchants]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[AwinHighApprovalMerchants](
	[MerchantId] [int] NOT NULL,
	[Name] [nvarchar](500) NULL,
	[LastSeen] [datetime2](7) NULL,
	[Notes] [nvarchar](500) NULL,
	[ConversionRate] [nvarchar](50) NULL,
	[ApprovalRate] [nvarchar](50) NULL,
	[EPC] [nvarchar](100) NULL,
	[PaymentStatus] [nvarchar](500) NULL,
	[AveragePaymentTime] [nvarchar](100) NULL,
	[ProductFeed] [varchar](10) NULL,
	[LaunchDate] [varchar](20) NULL,
	[LinkStatus] [varchar](50) NULL,
	[GoldStandard] [bit] NULL,
	[LastUpdated] [datetime2](7) NULL,
	[primarySector] [nvarchar](255) NULL,
	[description] [nvarchar](max) NULL,
	[currencyCode] [nvarchar](10) NULL,
	[logoUrl] [nvarchar](1024) NULL,
	[LastSynced] [datetime2](7) NULL,
	[Joined] [bit] NOT NULL,
	[Website] [nvarchar](1024) NULL,
	[Email] [nvarchar](255) NULL,
	[ContactName] [nvarchar](255) NULL,
	[AwinUserId] [nvarchar](20) NULL,
	[PartnerID] [nvarchar](8) NULL,
	[ClubID] [varchar](8) NULL,
	[whyHtml] [nvarchar](max) NULL,
	[joinHtml] [nvarchar](max) NULL,
PRIMARY KEY CLUSTERED 
(
	[MerchantId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[AwinRecommendedMerchants]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[AwinRecommendedMerchants](
	[ID] [int] IDENTITY(1,1) NOT NULL,
	[MerchantId] [int] NOT NULL,
	[Mode] [varchar](20) NOT NULL,
	[SentAt] [datetime] NULL,
	[RecommendedCount] [int] NULL,
	[CreatedAt] [datetime2](7) NULL,
	[Name] [nvarchar](500) NULL,
PRIMARY KEY CLUSTERED 
(
	[ID] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[AwinTransactions]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[AwinTransactions](
	[ID] [int] IDENTITY(1,1) NOT NULL,
	[AwinTransactionID] [nvarchar](100) NOT NULL,
	[SellerID] [nvarchar](100) NOT NULL,
	[ClubID] [nvarchar](50) NOT NULL,
	[AdvertiserName] [nvarchar](255) NULL,
	[CommissionAmount] [decimal](18, 4) NULL,
	[SaleAmount] [decimal](18, 2) NULL,
	[Currency] [nvarchar](10) NULL,
	[TransactionDate] [datetime2](7) NULL,
	[CommissionStatus] [nvarchar](30) NULL,
	[PaymentDate] [datetime2](7) NULL,
	[OrderReference] [nvarchar](100) NULL,
	[VoucherCode] [nvarchar](100) NULL,
	[ClickRef] [nvarchar](200) NULL,
	[CustomParameters] [nvarchar](max) NULL,
	[LastUpdated] [datetime2](7) NULL,
PRIMARY KEY CLUSTERED 
(
	[ID] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[claimant]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[claimant](
	[id] [int] IDENTITY(1,1) NOT NULL,
	[ip_address] [varchar](45) NOT NULL,
	[user_agent] [nvarchar](max) NULL,
	[fingerprint] [nvarchar](255) NULL,
	[total_claims] [int] NULL,
	[created_at] [datetime2](7) NULL,
	[updated_at] [datetime2](7) NULL,
	[fingerprint_key]  AS (isnull([fingerprint],'')) PERSISTED NOT NULL,
	[next_eligible] [datetime2](7) NULL,
PRIMARY KEY CLUSTERED 
(
	[id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[cmsDocLinks]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[cmsDocLinks](
	[id] [int] IDENTITY(1,1) NOT NULL,
	[cmsProviderId] [int] NOT NULL,
	[Title] [nvarchar](100) NOT NULL,
	[Link] [nvarchar](255) NOT NULL,
PRIMARY KEY CLUSTERED 
(
	[id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[cmsProvider]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[cmsProvider](
	[id] [int] IDENTITY(1,1) NOT NULL,
	[Comment] [nvarchar](255) NOT NULL,
	[Icon] [nvarchar](50) NOT NULL,
	[Description] [nvarchar](500) NOT NULL,
PRIMARY KEY CLUSTERED 
(
	[id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Commissions]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Commissions](
	[InvoiceID] [varchar](50) NOT NULL,
	[Date] [datetime] NOT NULL,
	[MerchantId] [varchar](50) NOT NULL,
	[CommunityID] [varchar](50) NOT NULL,
	[MerchantPartnerId] [varchar](50) NULL,
	[CommunityPartnerId] [varchar](50) NULL,
	[CommunityAmt] [decimal](13, 5) NOT NULL,
	[CommunityPartnerAmt] [decimal](13, 5) NOT NULL,
	[MerchantPartnerAmt] [decimal](13, 5) NOT NULL,
	[CommunityPaid] [bit] NOT NULL,
	[CommunityPartnerPaid] [bit] NOT NULL,
	[MerchantPartnerPaid] [bit] NOT NULL,
	[PlatformAmt] [decimal](13, 5) NOT NULL,
	[PlatformPaid] [bit] NOT NULL,
PRIMARY KEY CLUSTERED 
(
	[InvoiceID] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[DocLinks]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[DocLinks](
	[Id] [int] IDENTITY(1,1) NOT NULL,
	[ApiProviderId] [int] NOT NULL,
	[Title] [nvarchar](100) NULL,
	[Link] [nvarchar](255) NULL,
PRIMARY KEY CLUSTERED 
(
	[Id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[FingerprintCatalogAccess]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[FingerprintCatalogAccess](
	[id] [int] IDENTITY(1,1) NOT NULL,
	[fingerprint_id] [int] NOT NULL,
	[catalog_id] [int] NOT NULL,
	[ProductID] [int] NULL,
	[timestamp] [datetime2](7) NOT NULL,
PRIMARY KEY CLUSTERED 
(
	[id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = ON, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY],
 CONSTRAINT [UQ_FingerprintCatalogAccess_Fingerprint_Timestamp] UNIQUE NONCLUSTERED 
(
	[fingerprint_id] ASC,
	[timestamp] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = ON, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[LASTS]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[LASTS](
	[OperationName] [nvarchar](50) NOT NULL,
	[LastRun] [datetime] NULL,
PRIMARY KEY CLUSTERED 
(
	[OperationName] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Payments]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Payments](
	[ID] [int] IDENTITY(1,1) NOT NULL,
	[UserId] [varchar](255) NOT NULL,
	[ConnectedAccountId] [varchar](255) NULL,
	[PaymentType] [varchar](50) NOT NULL,
	[Amount] [int] NOT NULL,
	[VatAmount] [int] NOT NULL,
	[PaymentIntentId] [varchar](255) NULL,
	[SubscriptionId] [varchar](255) NULL,
	[InvoiceId] [varchar](255) NULL,
	[BatchId] [nvarchar](255) NOT NULL,
	[Created] [datetime] NOT NULL,
PRIMARY KEY CLUSTERED 
(
	[ID] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[PostHogEvents]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[PostHogEvents](
	[id] [int] IDENTITY(1,1) NOT NULL,
	[eventtype] [varchar](50) NOT NULL,
	[source] [varchar](100) NULL,
	[source_url] [varchar](255) NULL,
	[destination] [varchar](100) NULL,
	[destination_url] [varchar](255) NULL,
	[IP] [varchar](45) NULL,
	[source_referrer] [varchar](255) NULL,
	[destination_referrer] [varchar](255) NULL,
	[timestamp] [datetime] NOT NULL,
	[order_id] [varchar](50) NULL,
	[sale_value] [decimal](18, 2) NULL,
PRIMARY KEY CLUSTERED 
(
	[id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[RejectedAsins]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[RejectedAsins](
	[ID] [int] IDENTITY(1,1) NOT NULL,
	[UserId] [nvarchar](100) NOT NULL,
	[AffiliateKey] [nvarchar](100) NOT NULL,
	[ASIN] [nvarchar](128) NOT NULL,
	[RejectedAt] [datetime] NULL,
	[MainCategory] [nvarchar](510) NOT NULL,
	[SubCategory] [nvarchar](510) NOT NULL,
	[Reason] [nvarchar](255) NULL,
PRIMARY KEY CLUSTERED 
(
	[ID] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY],
 CONSTRAINT [UQ_RejectedAsins] UNIQUE NONCLUSTERED 
(
	[UserId] ASC,
	[AffiliateKey] ASC,
	[MainCategory] ASC,
	[SubCategory] ASC,
	[ASIN] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[sqsMsgCount]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[sqsMsgCount](
	[OperationName] [varchar](100) NOT NULL,
	[PendingCount] [int] NOT NULL,
	[UpdatedAt] [datetime2](7) NULL,
PRIMARY KEY CLUSTERED 
(
	[OperationName] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[SystemOTPs]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[SystemOTPs](
	[otp_id] [int] IDENTITY(1,1) NOT NULL,
	[user_id] [char](8) NOT NULL,
	[otp] [varchar](10) NOT NULL,
	[token_type] [varchar](50) NOT NULL,
	[created_at] [datetime] NOT NULL,
	[expires_at] [datetime] NOT NULL,
	[payload] [nvarchar](max) NULL,
 CONSTRAINT [PK_SystemOtps] PRIMARY KEY CLUSTERED 
(
	[otp_id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[UserApiKeys]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[UserApiKeys](
	[id] [int] IDENTITY(1,1) NOT NULL,
	[user_id] [varchar](8) NULL,
	[api_key_type] [varchar](50) NULL,
	[api_key_data] [nvarchar](max) NULL,
	[created_at] [datetime] NULL,
	[updated_at] [datetime] NULL,
	[Description] [nvarchar](255) NOT NULL,
	[LastError] [nvarchar](max) NULL,
	[LastStatus] [int] NOT NULL,
	[TotalParts] [int] NULL,
	[count_inserted] [int] NULL,
	[count_updated] [int] NULL,
	[CurrentBatchId] [nvarchar](50) NULL,
	[BatchStartedAt] [datetime] NULL,
PRIMARY KEY CLUSTERED 
(
	[id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY],
 CONSTRAINT [UQ_UserApiKeys_UserId_ApiKeyType_Description] UNIQUE NONCLUSTERED 
(
	[user_id] ASC,
	[api_key_type] ASC,
	[Description] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[UserCategories]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[UserCategories](
	[uid] [nvarchar](50) NOT NULL,
	[json_categories] [nvarchar](max) NULL,
	[json_exclude] [nvarchar](max) NULL,
	[json_chat] [nvarchar](max) NULL,
	[LastUpdate] [datetime] NULL,
	[isProcessing] [bit] NULL,
PRIMARY KEY CLUSTERED 
(
	[uid] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[UserFingerprints]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[UserFingerprints](
	[id] [int] IDENTITY(1,1) NOT NULL,
	[fingerprint_hash] [varchar](64) NOT NULL,
	[user_id] [varchar](8) NULL,
	[email] [nvarchar](255) NULL,
	[created_at] [datetime] NULL,
	[updated_at] [datetime] NULL,
	[Clicks] [int] NOT NULL,
PRIMARY KEY CLUSTERED 
(
	[id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = ON, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY],
 CONSTRAINT [UQ_UserFingerprints_FingerprintHash] UNIQUE NONCLUSTERED 
(
	[fingerprint_hash] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = ON, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[VatBatch]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[VatBatch](
	[ID] [int] IDENTITY(1,1) NOT NULL,
	[BatchId] [nvarchar](255) NULL,
	[UserId] [varchar](255) NOT NULL,
	[VatAmount] [int] NOT NULL,
	[Created] [datetime] NOT NULL,
	[VatTransferId] [varchar](255) NULL,
PRIMARY KEY CLUSTERED 
(
	[ID] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
ALTER TABLE [dbo].[amazon_cards] ADD  DEFAULT ('GBP') FOR [currency]
GO
ALTER TABLE [dbo].[amazon_cards] ADD  DEFAULT ('available') FOR [status]
GO
ALTER TABLE [dbo].[amazon_cards] ADD  DEFAULT (getdate()) FOR [created_at]
GO
ALTER TABLE [dbo].[amazon_cards] ADD  DEFAULT (getdate()) FOR [updated_at]
GO
ALTER TABLE [dbo].[AwinHighApprovalMerchants] ADD  DEFAULT (getdate()) FOR [LastSeen]
GO
ALTER TABLE [dbo].[AwinHighApprovalMerchants] ADD  DEFAULT (getdate()) FOR [LastUpdated]
GO
ALTER TABLE [dbo].[AwinHighApprovalMerchants] ADD  DEFAULT (getdate()) FOR [LastSynced]
GO
ALTER TABLE [dbo].[AwinHighApprovalMerchants] ADD  DEFAULT ((0)) FOR [Joined]
GO
ALTER TABLE [dbo].[AwinRecommendedMerchants] ADD  DEFAULT (getdate()) FOR [SentAt]
GO
ALTER TABLE [dbo].[AwinRecommendedMerchants] ADD  DEFAULT ((1)) FOR [RecommendedCount]
GO
ALTER TABLE [dbo].[AwinRecommendedMerchants] ADD  DEFAULT (getdate()) FOR [CreatedAt]
GO
ALTER TABLE [dbo].[AwinTransactions] ADD  DEFAULT (getdate()) FOR [LastUpdated]
GO
ALTER TABLE [dbo].[Catalog] ADD  DEFAULT (getdate()) FOR [Created]
GO
ALTER TABLE [dbo].[Catalog] ADD  DEFAULT (getdate()) FOR [LastUpdate]
GO
ALTER TABLE [dbo].[CatalogAffiliateUpdates] ADD  DEFAULT (getdate()) FOR [LastUpdate]
GO
ALTER TABLE [dbo].[CatalogAffiliateUpdates] ADD  DEFAULT ('idle') FOR [Status]
GO
ALTER TABLE [dbo].[claimant] ADD  DEFAULT ((0)) FOR [total_claims]
GO
ALTER TABLE [dbo].[claimant] ADD  DEFAULT (getdate()) FOR [created_at]
GO
ALTER TABLE [dbo].[claimant] ADD  DEFAULT (getdate()) FOR [updated_at]
GO
ALTER TABLE [dbo].[clubscan] ADD  CONSTRAINT [DF_clubscan_Status]  DEFAULT ('pending') FOR [Status]
GO
ALTER TABLE [dbo].[clubscan] ADD  DEFAULT (getdate()) FOR [CreatedAt]
GO
ALTER TABLE [dbo].[clubscan] ADD  DEFAULT (getdate()) FOR [UpdatedAt]
GO
ALTER TABLE [dbo].[clubscan] ADD  CONSTRAINT [DF_clubscan_PartnerURL]  DEFAULT ('https://partner.clubmadeira.io/') FOR [PartnerURL]
GO
ALTER TABLE [dbo].[Commissions] ADD  DEFAULT ((0)) FOR [CommunityPaid]
GO
ALTER TABLE [dbo].[Commissions] ADD  DEFAULT ((0)) FOR [CommunityPartnerPaid]
GO
ALTER TABLE [dbo].[Commissions] ADD  DEFAULT ((0)) FOR [MerchantPartnerPaid]
GO
ALTER TABLE [dbo].[Commissions] ADD  DEFAULT ((0.00)) FOR [PlatformAmt]
GO
ALTER TABLE [dbo].[Commissions] ADD  DEFAULT ((0)) FOR [PlatformPaid]
GO
ALTER TABLE [dbo].[DatabaseCallLog] ADD  DEFAULT (sysdatetime()) FOR [Timestamp]
GO
ALTER TABLE [dbo].[FingerprintCatalogAccess] ADD  DEFAULT (getdate()) FOR [timestamp]
GO
ALTER TABLE [dbo].[MerchantProducts] ADD  DEFAULT (getdate()) FOR [Created]
GO
ALTER TABLE [dbo].[MerchantProducts] ADD  DEFAULT (getdate()) FOR [LastUpdate]
GO
ALTER TABLE [dbo].[Partner] ADD  DEFAULT ((0)) FOR [Approved]
GO
ALTER TABLE [dbo].[Partner] ADD  DEFAULT (sysutcdatetime()) FOR [CreatedAt]
GO
ALTER TABLE [dbo].[Partner] ADD  DEFAULT (sysutcdatetime()) FOR [UpdatedAt]
GO
ALTER TABLE [dbo].[Payments] ADD  DEFAULT ((0)) FOR [VatAmount]
GO
ALTER TABLE [dbo].[Products] ADD  DEFAULT (getdate()) FOR [Created]
GO
ALTER TABLE [dbo].[Products] ADD  DEFAULT (getdate()) FOR [LastUpdate]
GO
ALTER TABLE [dbo].[RejectedAsins] ADD  DEFAULT (getdate()) FOR [RejectedAt]
GO
ALTER TABLE [dbo].[RejectedAsins] ADD  DEFAULT ('') FOR [MainCategory]
GO
ALTER TABLE [dbo].[RejectedAsins] ADD  DEFAULT ('') FOR [SubCategory]
GO
ALTER TABLE [dbo].[sqsMsgCount] ADD  DEFAULT ('MerchantBatch') FOR [OperationName]
GO
ALTER TABLE [dbo].[sqsMsgCount] ADD  DEFAULT ((0)) FOR [PendingCount]
GO
ALTER TABLE [dbo].[sqsMsgCount] ADD  DEFAULT (getdate()) FOR [UpdatedAt]
GO
ALTER TABLE [dbo].[SystemOTPs] ADD  DEFAULT (getdate()) FOR [created_at]
GO
ALTER TABLE [dbo].[UserApiKeys] ADD  DEFAULT (getdate()) FOR [created_at]
GO
ALTER TABLE [dbo].[UserApiKeys] ADD  DEFAULT (getdate()) FOR [updated_at]
GO
ALTER TABLE [dbo].[UserApiKeys] ADD  DEFAULT ((0)) FOR [LastStatus]
GO
ALTER TABLE [dbo].[UserApiKeys] ADD  DEFAULT ((0)) FOR [count_inserted]
GO
ALTER TABLE [dbo].[UserApiKeys] ADD  DEFAULT ((0)) FOR [count_updated]
GO
ALTER TABLE [dbo].[UserCategories] ADD  DEFAULT (getdate()) FOR [LastUpdate]
GO
ALTER TABLE [dbo].[UserFingerprints] ADD  DEFAULT (getdate()) FOR [created_at]
GO
ALTER TABLE [dbo].[UserFingerprints] ADD  DEFAULT (getdate()) FOR [updated_at]
GO
ALTER TABLE [dbo].[UserFingerprints] ADD  DEFAULT ((0)) FOR [Clicks]
GO
ALTER TABLE [dbo].[Users] ADD  DEFAULT (getdate()) FOR [created_at]
GO
ALTER TABLE [dbo].[Users] ADD  DEFAULT (getdate()) FOR [updated_at]
GO
ALTER TABLE [dbo].[amazon_cards]  WITH CHECK ADD  CONSTRAINT [FK_amazon_cards_claimant] FOREIGN KEY([claimant_id])
REFERENCES [dbo].[claimant] ([id])
ON DELETE SET NULL
GO
ALTER TABLE [dbo].[amazon_cards] CHECK CONSTRAINT [FK_amazon_cards_claimant]
GO
ALTER TABLE [dbo].[CatalogAffiliateUpdates]  WITH CHECK ADD  CONSTRAINT [FK_CatalogAffiliateUpdates_Catalog] FOREIGN KEY([CatalogId])
REFERENCES [dbo].[Catalog] ([ID])
ON DELETE CASCADE
GO
ALTER TABLE [dbo].[CatalogAffiliateUpdates] CHECK CONSTRAINT [FK_CatalogAffiliateUpdates_Catalog]
GO
ALTER TABLE [dbo].[cmsDocLinks]  WITH CHECK ADD  CONSTRAINT [FK_cmsDocLinks_cmsProvider] FOREIGN KEY([cmsProviderId])
REFERENCES [dbo].[cmsProvider] ([id])
ON DELETE CASCADE
GO
ALTER TABLE [dbo].[cmsDocLinks] CHECK CONSTRAINT [FK_cmsDocLinks_cmsProvider]
GO
ALTER TABLE [dbo].[DocLinks]  WITH CHECK ADD FOREIGN KEY([ApiProviderId])
REFERENCES [dbo].[ApiProvider] ([Id])
ON DELETE CASCADE
GO
ALTER TABLE [dbo].[UserApiKeys]  WITH CHECK ADD FOREIGN KEY([user_id])
REFERENCES [dbo].[Users] ([user_id])
GO
ALTER TABLE [dbo].[ApiProvider]  WITH CHECK ADD  CONSTRAINT [CHK_SettingsJson] CHECK  ((isjson([SettingsJson])=(1)))
GO
ALTER TABLE [dbo].[ApiProvider] CHECK CONSTRAINT [CHK_SettingsJson]
GO
ALTER TABLE [dbo].[RejectedAsins]  WITH CHECK ADD  CONSTRAINT [CHK_RejectedAsins_Categories_NotEmpty] CHECK  (([MainCategory]<>'' AND [SubCategory]<>''))
GO
ALTER TABLE [dbo].[RejectedAsins] CHECK CONSTRAINT [CHK_RejectedAsins_Categories_NotEmpty]
GO
/****** Object:  StoredProcedure [dbo].[DisableMerchantIndexes]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE PROCEDURE [dbo].[DisableMerchantIndexes]
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @startTime DATETIME2 = GETDATE();
    DECLARE @sql NVARCHAR(MAX) = '';
    DECLARE @disabledCount INT = 0;

    PRINT '🔴 Starting SELECTIVE index disable for bulk MERGE load...';

    -- === 1. Update maintenance window flag ===
    MERGE INTO dbo.LASTS AS target
    USING (VALUES ('MAINTAINANCE_WINDOW', GETDATE())) AS source (OperationName, LastRun)
    ON target.OperationName = source.OperationName
    WHEN MATCHED THEN UPDATE SET LastRun = source.LastRun
    WHEN NOT MATCHED THEN INSERT (OperationName, LastRun) VALUES (source.OperationName, source.LastRun);

    -- === 2. Disable non-critical non-clustered indexes ===
    -- We explicitly protect the indexes needed for MERGE and FINAL_CLEANUP
    SELECT 
        @sql += 'ALTER INDEX ' + QUOTENAME(i.name) + ' ON [dbo].[MerchantProducts] DISABLE;' + CHAR(13),
        @disabledCount += 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('dbo.MerchantProducts')
      AND i.type_desc = 'NONCLUSTERED'
      AND i.is_disabled = 0
      AND i.name NOT IN (
            'IX_MerchantProducts_BulkMerge',           -- Best index for MERGE (UserId + Source + ASIN)
            'IX_MerchantProducts_Cleanup'              -- Needed for FINAL_CLEANUP
      );

    IF @sql <> ''
    BEGIN
        EXEC sp_executesql @sql;
        PRINT ' → Disabled ' + CAST(@disabledCount AS VARCHAR(10)) + ' non-critical non-clustered indexes';
    END
    ELSE
        PRINT ' → No non-critical indexes to disable';

    -- === 3. Always disable Full-Text index ===
    IF EXISTS (
        SELECT 1 
        FROM sys.fulltext_indexes 
        WHERE object_id = OBJECT_ID('dbo.MerchantProducts')
    )
    BEGIN
        ALTER FULLTEXT INDEX ON [dbo].[MerchantProducts] DISABLE;
        PRINT ' → Full-text index disabled';
    END

    -- === 4. Update bulk-load flag ===
    MERGE INTO dbo.LASTS AS target
    USING (VALUES ('IndexesBulkLoadDisabled', GETDATE())) AS source (OperationName, LastRun)
    ON target.OperationName = source.OperationName
    WHEN MATCHED THEN UPDATE SET LastRun = source.LastRun
    WHEN NOT MATCHED THEN INSERT (OperationName, LastRun) VALUES (source.OperationName, source.LastRun);

    DECLARE @durationSec INT = DATEDIFF(SECOND, @startTime, GETDATE());

    PRINT '✅ SELECTIVE INDEX DISABLE COMPLETED (' + CAST(@durationSec AS VARCHAR(10)) + ' seconds)';
    PRINT ' → Protected indexes kept ENABLED:';
    PRINT '    - IX_MerchantProducts_UserId_ASIN (Clustered)';
    PRINT '    - IX_MerchantProducts_BulkMerge (UserId + Source + ASIN)';
    PRINT '    - IX_MerchantProducts_Cleanup (UserId + Source + ProcessedBatchId)';
END
GO
/****** Object:  StoredProcedure [dbo].[GenerateUniqueUserId]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE PROCEDURE [dbo].[GenerateUniqueUserId]
    @user_id VARCHAR(8) OUTPUT
AS
BEGIN
    DECLARE @max_attempts INT = 100;
    DECLARE @attempt INT = 0;
    DECLARE @charset VARCHAR(36) = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    DECLARE @code VARCHAR(7);
    DECLARE @checksum CHAR(1);
    DECLARE @total INT;
    DECLARE @exists INT;

    WHILE @attempt < @max_attempts
    BEGIN
        -- Generate 7 random characters (approximation due to T-SQL limitations)
        SET @code = '';
        SET @total = 0;
        DECLARE @i INT = 1;
        WHILE @i <= 7
        BEGIN
            DECLARE @rand_index INT = CAST(RAND() * 36 AS INT);
            SET @code = @code + SUBSTRING(@charset, @rand_index + 1, 1);
            SET @total = @total + @rand_index;
            SET @i = @i + 1;
        END;

        -- Calculate checksum
        SET @checksum = SUBSTRING(@charset, (@total % 36) + 1, 1);
        SET @user_id = @code + @checksum;

        -- Check uniqueness
        SELECT @exists = COUNT(*) FROM Users WHERE user_id = @user_id;
        IF @exists = 0
            BREAK;

        SET @attempt = @attempt + 1;
    END;

    IF @attempt >= @max_attempts
        THROW 50000, 'Unable to generate a unique user_id after 100 attempts', 1;
END;
GO
/****** Object:  StoredProcedure [dbo].[IsIndexDisabledForBulkLoad]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   PROCEDURE [dbo].[IsIndexDisabledForBulkLoad]
    @IsReady BIT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
	
    SELECT @IsReady = 
        CASE 
            WHEN exists(select 'z' from lasts  WHERE OperationName = 'IndexesBulkLoadDisabled')
            THEN 1 
            ELSE 0 
        END    
END
GO
/****** Object:  StoredProcedure [dbo].[KillAndRestartRebuild]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
-- =============================================
-- KILL FROZEN REBUILD + RESTART (SAFE VERSION)
-- =============================================
CREATE PROCEDURE [dbo].[KillAndRestartRebuild]
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @CurrentSPID INT = @@SPID;   -- Our own session ID
    DECLARE @TargetSPID INT = NULL;

    PRINT '🔍 Looking for frozen RebuildMerchantIndexes...';

    -- Find the actual frozen rebuild (exclude our own session)
    SELECT TOP 1 @TargetSPID = r.session_id
    FROM sys.dm_exec_requests r
    CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) st
    WHERE (st.text LIKE '%RebuildMerchantIndexes%' 
           OR st.text LIKE '%ALTER INDEX%' 
           OR st.text LIKE '%FULLTEXT INDEX%')
      AND r.session_id <> @CurrentSPID          -- ← IMPORTANT: exclude ourselves
      AND r.status = 'running'
    ORDER BY r.start_time ASC;   -- oldest first (most likely frozen)

    IF @TargetSPID IS NULL
    BEGIN
        PRINT '✅ No frozen rebuild found. Starting fresh...';
        EXEC [dbo].[RebuildMerchantIndexes];
        RETURN;
    END

    PRINT '⚠️ Found frozen rebuild on SPID ' + CAST(@TargetSPID AS VARCHAR(10)) + ' - killing it...';

    -- Kill the frozen session
    DECLARE @killCmd NVARCHAR(50) = 'KILL ' + CAST(@TargetSPID AS VARCHAR(10));
    EXEC sp_executesql @killCmd;

    -- Wait a moment for rollback to begin
    WAITFOR DELAY '00:00:08';

    -- Monitor rollback until it's finished
    PRINT '⏳ Waiting for rollback to complete...';
    WHILE EXISTS (SELECT 1 FROM sys.dm_exec_requests WHERE session_id = @TargetSPID)
    BEGIN
        WAITFOR DELAY '00:00:10';
        PRINT '   Still rolling back...';
    END

    PRINT '✅ Rollback completed. Restarting rebuild...';

    -- Restart the rebuild cleanly
    EXEC [dbo].[RebuildMerchantIndexes];

    PRINT '✅ Rebuild restarted successfully.';
END
GO
/****** Object:  StoredProcedure [dbo].[QueueCatalog]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE PROCEDURE [dbo].[QueueCatalog]
	-- Add the parameters for the stored procedure here
	@UserId nvarchar(8),
	@Source nvarchar(100)
AS
BEGIN
	-- SET NOCOUNT ON added to prevent extra result sets from
	-- interfering with SELECT statements.
	SET NOCOUNT ON;

	UPDATE [CatalogAffiliateUpdates] SET LastUpdate = dateadd(year,-1,getdate())
	where [CatalogId] in (
	select CA.CatalogId
	from [CatalogAffiliateUpdates] CA 
	JOIN  UserCatalog(@UserId , @Source) UC ON UC.CatalogId = CA.CatalogId 
	AND   UC.[AffiliateKey] = CA.AffiliateKey
	)

END
GO
/****** Object:  StoredProcedure [dbo].[RebuildMerchantIndexes]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE PROCEDURE [dbo].[RebuildMerchantIndexes]
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @startTime DATETIME2 = GETDATE();
    DECLARE @sql NVARCHAR(MAX);
    DECLARE @indexName SYSNAME;
    DECLARE @rebuiltCount INT = 0;

    PRINT '🟢 Starting index rebuild after bulk load...';

    -- === 1. Rebuild all disabled non-clustered indexes ===
    DECLARE cur CURSOR LOCAL FAST_FORWARD FOR
        SELECT name
        FROM sys.indexes
        WHERE object_id = OBJECT_ID('dbo.MerchantProducts')
          AND type_desc = 'NONCLUSTERED'
          AND is_disabled = 1
        ORDER BY name;                    -- Consistent ordering

    OPEN cur;
    FETCH NEXT FROM cur INTO @indexName;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        BEGIN TRY
            SET @sql = '
                ALTER INDEX ' + QUOTENAME(@indexName) + '
                ON [dbo].[MerchantProducts] 
                REBUILD WITH (
                    MAXDOP = 8,
                    SORT_IN_TEMPDB = ON,
                    FILLFACTOR = 90,
                    ONLINE = OFF
                );';

            PRINT ' → Rebuilding: ' + @indexName;
            EXEC sp_executesql @sql;

            SET @rebuiltCount += 1;
        END TRY
        BEGIN CATCH
            PRINT ' ⚠️ Failed to rebuild ' + @indexName + ' → ' + ERROR_MESSAGE();
        END CATCH;

        FETCH NEXT FROM cur INTO @indexName;
    END

    CLOSE cur;
    DEALLOCATE cur;

    PRINT ' → Rebuilt ' + CAST(@rebuiltCount AS VARCHAR(10)) + ' index(es)';

    -- === 2. Re-enable Full-Text index ===
    IF EXISTS (
        SELECT 1 
        FROM sys.fulltext_indexes 
        WHERE object_id = OBJECT_ID('dbo.MerchantProducts')
    )
    BEGIN
        PRINT ' → Enabling Full-Text index...';
        ALTER FULLTEXT INDEX ON [dbo].[MerchantProducts] ENABLE;
    END

    -- === 3. Clear maintenance flags ===
    DELETE FROM dbo.LASTS
    WHERE OperationName IN ('MAINTAINANCE_WINDOW', 'IndexesBulkLoadDisabled');

    -- === 4. Update statistics (fast sampled update) ===
    PRINT ' → Updating statistics (sampled)...';
    UPDATE STATISTICS [dbo].[MerchantProducts];

    -- Optional: Run FULLSCAN periodically (e.g. once per day or after very large loads)
    -- UPDATE STATISTICS [dbo].[MerchantProducts] WITH FULLSCAN;

    DECLARE @durationSec INT = DATEDIFF(SECOND, @startTime, GETDATE());
    PRINT '✅ Rebuild completed in ' + CAST(@durationSec AS VARCHAR(10)) + ' seconds';
END
GO
/****** Object:  StoredProcedure [dbo].[sp_ClaimVoucher]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   PROCEDURE [dbo].[sp_ClaimVoucher]
    @ip_address     VARCHAR(45),
    @user_agent     NVARCHAR(MAX) = NULL,
    @fingerprint    NVARCHAR(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @claimant_id INT;
    DECLARE @card_id     INT;
    DECLARE @code        VARCHAR(50);
    DECLARE @value       DECIMAL(10,2);

    BEGIN TRANSACTION;

    -- 1. Cooldown check using next_eligible
    IF EXISTS (
        SELECT 1 
        FROM claimant 
        WHERE ip_address = @ip_address 
          AND ISNULL(fingerprint, '') = ISNULL(@fingerprint, '')
          AND next_eligible IS NOT NULL 
          AND next_eligible > GETDATE()
    )
    BEGIN
        ROLLBACK TRANSACTION;
        SELECT 
            0 AS success,
            400 AS httpStatus,
            'You are not eligible yet. Please come back later.' AS reason;
        RETURN;
    END;

    -- 2. MERGE Claimant (upsert)
    MERGE INTO claimant AS target
    USING (
        SELECT 
            @ip_address     AS ip_address,
            @user_agent     AS user_agent,
            @fingerprint    AS fingerprint
    ) AS source
    ON target.ip_address = source.ip_address 
       AND ISNULL(target.fingerprint, '') = ISNULL(source.fingerprint, '')

    WHEN MATCHED THEN
        UPDATE SET
            user_agent  = source.user_agent,
            fingerprint = source.fingerprint,
            updated_at  = GETDATE()

    WHEN NOT MATCHED THEN
        INSERT (ip_address, user_agent, fingerprint, total_claims, created_at, updated_at, next_eligible)
        VALUES (source.ip_address, source.user_agent, source.fingerprint, 1, GETDATE(), GETDATE(), NULL);

    -- Get claimant_id
    SELECT @claimant_id = id
    FROM claimant 
    WHERE ip_address = @ip_address 
      AND ISNULL(fingerprint, '') = ISNULL(@fingerprint, '');

    -- 3. Pick ONE random ready card
    SELECT TOP 1 @card_id = id, @code = code, @value = value
    FROM amazon_cards
    WHERE status = 'available'
      AND GETDATE() > DATEADD(DAY, day_of_week, created_at)
    ORDER BY NEWID();

    IF @card_id IS NULL
    BEGIN
        ROLLBACK TRANSACTION;
        SELECT 
            0 AS success,
            404 AS httpStatus,
            'No vouchers available at the moment.' AS reason;
        RETURN;
    END;

    -- Claim the card
    UPDATE amazon_cards
    SET 
        status      = 'claimed',
        claimant_id = @claimant_id,
        claimed_at  = GETDATE()
    WHERE id = @card_id;

    -- 4. Update claimant with new cooldown
    UPDATE claimant
    SET 
        total_claims  = total_claims + 1,
        next_eligible = DATEADD(DAY, 1 + @value, GETDATE()),
        updated_at    = GETDATE()
    WHERE id = @claimant_id;

    COMMIT TRANSACTION;

    -- 5. Success
    SELECT 
        1 AS success,
        200 AS httpStatus,
        @code AS code,
        @value AS value,
        'https://www.amazon.co.uk/gc/redeem?code=' + @code AS redeem_url;

END
GO
/****** Object:  StoredProcedure [dbo].[StartAsyncIndexRebuild]    Script Date: 04/07/2026 17:03:10 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE   PROCEDURE [dbo].[StartAsyncIndexRebuild]
AS
BEGIN
    SET NOCOUNT ON;
    EXEC msdb.dbo.sp_start_job @job_name = 'RebuildMerchantIndexes';  -- ← create this Agent job
    PRINT '🚀 Async index rebuild job started';
END
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPane1', @value=N'[0E232FF0-B466-11cf-A24F-00AA00A3EFFF, 1.00]
Begin DesignProperties = 
   Begin PaneConfigurations = 
      Begin PaneConfiguration = 0
         NumPanes = 4
         Configuration = "(H (1[40] 4[20] 2[20] 3) )"
      End
      Begin PaneConfiguration = 1
         NumPanes = 3
         Configuration = "(H (1 [50] 4 [25] 3))"
      End
      Begin PaneConfiguration = 2
         NumPanes = 3
         Configuration = "(H (1 [50] 2 [25] 3))"
      End
      Begin PaneConfiguration = 3
         NumPanes = 3
         Configuration = "(H (4 [30] 2 [40] 3))"
      End
      Begin PaneConfiguration = 4
         NumPanes = 2
         Configuration = "(H (1 [56] 3))"
      End
      Begin PaneConfiguration = 5
         NumPanes = 2
         Configuration = "(H (2 [66] 3))"
      End
      Begin PaneConfiguration = 6
         NumPanes = 2
         Configuration = "(H (4 [50] 3))"
      End
      Begin PaneConfiguration = 7
         NumPanes = 1
         Configuration = "(V (3))"
      End
      Begin PaneConfiguration = 8
         NumPanes = 3
         Configuration = "(H (1[56] 4[18] 2) )"
      End
      Begin PaneConfiguration = 9
         NumPanes = 2
         Configuration = "(H (1 [75] 4))"
      End
      Begin PaneConfiguration = 10
         NumPanes = 2
         Configuration = "(H (1[66] 2) )"
      End
      Begin PaneConfiguration = 11
         NumPanes = 2
         Configuration = "(H (4 [60] 2))"
      End
      Begin PaneConfiguration = 12
         NumPanes = 1
         Configuration = "(H (1) )"
      End
      Begin PaneConfiguration = 13
         NumPanes = 1
         Configuration = "(V (4))"
      End
      Begin PaneConfiguration = 14
         NumPanes = 1
         Configuration = "(V (2))"
      End
      ActivePaneConfig = 0
   End
   Begin DiagramPane = 
      Begin Origin = 
         Top = 0
         Left = 0
      End
      Begin Tables = 
         Begin Table = "CatalogAffiliateUpdates"
            Begin Extent = 
               Top = 6
               Left = 38
               Bottom = 136
               Right = 208
            End
            DisplayFlags = 280
            TopColumn = 0
         End
         Begin Table = "Catalog"
            Begin Extent = 
               Top = 6
               Left = 246
               Bottom = 136
               Right = 440
            End
            DisplayFlags = 280
            TopColumn = 0
         End
      End
   End
   Begin SQLPane = 
   End
   Begin DataPane = 
      Begin ParameterDefaults = ""
      End
      Begin ColumnWidths = 9
         Width = 284
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
      End
   End
   Begin CriteriaPane = 
      Begin ColumnWidths = 11
         Column = 1440
         Alias = 900
         Table = 1170
         Output = 720
         Append = 1400
         NewValue = 1170
         SortType = 1350
         SortOrder = 1410
         GroupBy = 1350
         Filter = 1350
         Or = 1350
         Or = 1350
         Or = 1350
      End
   End
End
' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'Searches'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPaneCount', @value=1 , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'Searches'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPane1', @value=N'[0E232FF0-B466-11cf-A24F-00AA00A3EFFF, 1.00]
Begin DesignProperties = 
   Begin PaneConfigurations = 
      Begin PaneConfiguration = 0
         NumPanes = 4
         Configuration = "(H (1[40] 4[20] 2[20] 3) )"
      End
      Begin PaneConfiguration = 1
         NumPanes = 3
         Configuration = "(H (1 [50] 4 [25] 3))"
      End
      Begin PaneConfiguration = 2
         NumPanes = 3
         Configuration = "(H (1 [50] 2 [25] 3))"
      End
      Begin PaneConfiguration = 3
         NumPanes = 3
         Configuration = "(H (4 [30] 2 [40] 3))"
      End
      Begin PaneConfiguration = 4
         NumPanes = 2
         Configuration = "(H (1 [56] 3))"
      End
      Begin PaneConfiguration = 5
         NumPanes = 2
         Configuration = "(H (2 [66] 3))"
      End
      Begin PaneConfiguration = 6
         NumPanes = 2
         Configuration = "(H (4 [50] 3))"
      End
      Begin PaneConfiguration = 7
         NumPanes = 1
         Configuration = "(V (3))"
      End
      Begin PaneConfiguration = 8
         NumPanes = 3
         Configuration = "(H (1[56] 4[18] 2) )"
      End
      Begin PaneConfiguration = 9
         NumPanes = 2
         Configuration = "(H (1 [75] 4))"
      End
      Begin PaneConfiguration = 10
         NumPanes = 2
         Configuration = "(H (1[66] 2) )"
      End
      Begin PaneConfiguration = 11
         NumPanes = 2
         Configuration = "(H (4 [60] 2))"
      End
      Begin PaneConfiguration = 12
         NumPanes = 1
         Configuration = "(H (1) )"
      End
      Begin PaneConfiguration = 13
         NumPanes = 1
         Configuration = "(V (4))"
      End
      Begin PaneConfiguration = 14
         NumPanes = 1
         Configuration = "(V (2))"
      End
      ActivePaneConfig = 0
   End
   Begin DiagramPane = 
      Begin Origin = 
         Top = 0
         Left = 0
      End
      Begin Tables = 
         Begin Table = "Users"
            Begin Extent = 
               Top = 12
               Left = 346
               Bottom = 142
               Right = 541
            End
            DisplayFlags = 280
            TopColumn = 4
         End
         Begin Table = "MerchantProducts"
            Begin Extent = 
               Top = 6
               Left = 38
               Bottom = 136
               Right = 229
            End
            DisplayFlags = 280
            TopColumn = 0
         End
      End
   End
   Begin SQLPane = 
   End
   Begin DataPane = 
      Begin ParameterDefaults = ""
      End
      Begin ColumnWidths = 9
         Width = 284
         Width = 1500
         Width = 4965
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
      End
   End
   Begin CriteriaPane = 
      Begin ColumnWidths = 12
         Column = 1440
         Alias = 900
         Table = 1170
         Output = 720
         Append = 1400
         NewValue = 1170
         SortType = 1350
         SortOrder = 1410
         GroupBy = 1350
         Filter = 1350
         Or = 1350
         Or = 1350
         Or = 1350
      End
   End
End
' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'Sum_Merchant_Parts'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPaneCount', @value=1 , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'Sum_Merchant_Parts'
GO
