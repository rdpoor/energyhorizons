-- Trigger for INSERTs
DROP TRIGGER IF EXISTS sync_insert_trigger;
CREATE TRIGGER sync_insert_trigger
AFTER INSERT ON ${table}
FOR EACH ROW
BEGIN
-- MUST ADD COLUMNS HERE THAT ARE TO BE INDEXED
    INSERT INTO ${table}_index (id, address)
-- AND HERE
    VALUES (NEW.id, JSON_EXTRACT(JSON_EXTRACT(NEW.data, '$.idea'), '$.address')) 
END;

-- Trigger for UPDATEs
DROP TRIGGER IF EXISTS sync_update_trigger;
CREATE TRIGGER sync_update_trigger
AFTER UPDATE ON ${table}
FOR EACH ROW
BEGIN
    UPDATE ${table}_index
-- AND HERE
    SET address = JSON_EXTRACT(JSON_EXTRACT(NEW.data, '$.idea'), '$.address')
    WHERE id = NEW.id;
END;

-- Trigger for DELETEs
CREATE TRIGGER sync_delete_trigger IF NOT EXISTS
AFTER DELETE ON ${table}
FOR EACH ROW
BEGIN
    DELETE FROM ${table}_index 
    WHERE id = OLD.id;
END;
