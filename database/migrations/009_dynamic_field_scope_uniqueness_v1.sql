-- Align dynamic-field uniqueness with its metadata scope.
-- Existing field rows and IDs are preserved; only obsolete unique constraints
-- are removed and equivalent scoped unique indexes are added.

IF OBJECT_ID('dbo.FieldDefinitions', 'U') IS NULL
    THROW 51000, 'FieldDefinitions is required before migration 009.', 1;
GO

IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE parent_object_id = OBJECT_ID('dbo.FieldDefinitions') AND name = 'UQ_FieldDefinitions_Service_Key')
    ALTER TABLE dbo.FieldDefinitions DROP CONSTRAINT UQ_FieldDefinitions_Service_Key;

IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE parent_object_id = OBJECT_ID('dbo.FieldDefinitions') AND name = 'UQ_FieldDefs')
    ALTER TABLE dbo.FieldDefinitions DROP CONSTRAINT UQ_FieldDefs;
GO

IF COL_LENGTH('dbo.FieldDefinitions', 'ModuleCode') IS NULL
    THROW 51000, 'FieldDefinitions.ModuleCode is required before migration 009.', 1;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_FieldDefinitions_Service_FieldKey' AND object_id = OBJECT_ID('dbo.FieldDefinitions'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_FieldDefinitions_Service_FieldKey
        ON dbo.FieldDefinitions (ServiceID, FieldKey)
        WHERE ServiceID IS NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_FieldDefinitions_Module_FieldKey' AND object_id = OBJECT_ID('dbo.FieldDefinitions'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_FieldDefinitions_Module_FieldKey
        ON dbo.FieldDefinitions (ModuleCode, FieldKey)
        WHERE ServiceID IS NULL AND ModuleCode IS NOT NULL;
GO
